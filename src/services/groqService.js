const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';

function truncateForLog(value, maxLen = 320) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

function logGroqDebug(event, details = {}) {
  console.error(`[groq] ${event}`, details);
}

function parseRetryAfterMsFromHeaders(headers) {
  const raw = headers?.get?.('retry-after');
  if (!raw) return 0;
  const retryAfter = String(raw || '').trim();
  if (!retryAfter) return 0;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(0, Math.floor(seconds * 1000));
  }

  const when = Date.parse(retryAfter);
  if (Number.isFinite(when)) {
    return Math.max(0, when - Date.now());
  }
  return 0;
}

function parseRetryAfterMsFromBody(body) {
  const raw = String(body || '');
  if (!raw) return 0;
  const lower = raw.toLowerCase();

  const jsonRetry = lower.match(/retry[_-\s]?after[^0-9]*([0-9]+(?:\.[0-9]+)?)/i);
  if (jsonRetry) {
    const n = Number(jsonRetry[1]);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n * 1000);
  }

  const tryAgain = lower.match(/try again in\s+([0-9]+(?:\.[0-9]+)?)\s*(ms|msec|millisecond|milliseconds|s|sec|secs|second|seconds|m|min|mins|minute|minutes)?/i);
  if (tryAgain) {
    const value = Number(tryAgain[1]);
    const unit = String(tryAgain[2] || 's').toLowerCase();
    if (Number.isFinite(value) && value >= 0) {
      if (unit.startsWith('ms')) return Math.floor(value);
      if (unit.startsWith('m') && !unit.startsWith('ms')) return Math.floor(value * 60_000);
      return Math.floor(value * 1000);
    }
  }

  return 0;
}

function extractRetryAfterMs({ headers, body } = {}) {
  const fromHeaders = parseRetryAfterMsFromHeaders(headers);
  if (fromHeaders > 0) return fromHeaders;
  return parseRetryAfterMsFromBody(body);
}

function parseOpenAiText(content) {
  if (typeof content === 'string') return content.trim();
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const single = content?.text || content?.content || content?.output_text || '';
    if (typeof single === 'string') return single.trim();
    return '';
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return '';
        return part?.text || part?.content || part?.output_text || '';
      })
      .join(' ')
      .trim();
  }
  return '';
}

function isRetryableChatError(err) {
  const status = Number(err?.status);
  if ([408, 409, 422, 429, 500, 502, 503, 504].includes(status)) return true;
  if (err?.name === 'AbortError') return true;
  return ['GROQ_FETCH_FAILED', 'GROQ_ABORTED', 'GROQ_TIMEOUT'].includes(err?.code);
}

async function groqChatCompletion({
  apiKey,
  messages,
  model = 'llama-3.3-70b-versatile',
  temperature = 0.9,
  maxTokens = 220,
  timeoutMs = 90_000,
}) {
  if (!apiKey) throw new Error('Missing GROQ_API_KEY');

  const controller = new AbortController();
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  async function attempt(modelName) {
    const payload = {
      model: modelName,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    let res;
    try {
      res = await fetch(GROQ_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      const isAbort = fetchErr?.name === 'AbortError';
      const err = new Error(
        isAbort && didTimeout
          ? `Groq request timed out after ${timeoutMs}ms`
          : `Groq request failed: ${fetchErr?.message || fetchErr}`
      );
      err.code = isAbort ? (didTimeout ? 'GROQ_TIMEOUT' : 'GROQ_ABORTED') : 'GROQ_FETCH_FAILED';
      err.model = modelName;
      if (didTimeout) err.timeoutMs = timeoutMs;
      err.cause = fetchErr;
      logGroqDebug('request_failed', {
        model: modelName,
        code: err.code,
        timeoutMs: didTimeout ? timeoutMs : '',
        error: truncateForLog(fetchErr?.message || fetchErr),
      });
      throw err;
    }

    const rawBody = await res.text().catch(() => '');
    let data = null;
    if (rawBody) {
      try {
        data = JSON.parse(rawBody);
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      const err = new Error(`Groq chat error ${res.status}: ${rawBody}`);
      err.code = 'GROQ_HTTP_ERROR';
      err.status = res.status;
      err.body = rawBody;
      err.model = modelName;
      err.finishReason = data?.choices?.[0]?.finish_reason || '';
      const retryAfterMs = extractRetryAfterMs({ headers: res.headers, body: rawBody });
      if (retryAfterMs > 0) {
        err.retryAfterMs = retryAfterMs;
        err.retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      }
      logGroqDebug('http_error', {
        model: modelName,
        status: res.status,
        finishReason: err.finishReason,
        retryAfterMs: err.retryAfterMs || 0,
        bodyPreview: truncateForLog(rawBody, 420),
      });
      throw err;
    }

    if (!data) {
      const err = new Error('Groq returned non-JSON success response');
      err.code = 'GROQ_BAD_JSON';
      err.status = res.status;
      err.body = rawBody;
      err.model = modelName;
      logGroqDebug('bad_json', {
        model: modelName,
        status: res.status,
        bodyPreview: truncateForLog(rawBody, 420),
      });
      throw err;
    }

    const choice = data?.choices?.[0] || {};
    const msg = choice?.message || {};
    const finishReason = choice?.finish_reason || '';
    const content = parseOpenAiText(msg?.content);

    if (!content) {
      const err = new Error('Groq returned empty assistant content');
      err.code = 'GROQ_EMPTY_CONTENT';
      err.status = res.status;
      err.model = modelName;
      err.finishReason = finishReason;
      err.body = rawBody;
      logGroqDebug('empty_content', {
        model: modelName,
        status: res.status,
        finishReason,
        bodyPreview: truncateForLog(rawBody, 420),
      });
      throw err;
    }

    return content;
  }

  try {
    return await attempt(model);
  } catch (e) {
    if (!isRetryableChatError(e)) throw e;
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

function isDeprecatedModel(model = {}) {
  const id = String(model?.id || '').toLowerCase();
  const status = String(model?.status || '').toLowerCase();
  const deprecationDate = String(model?.deprecation_date || model?.deprecationDate || '').trim();
  return (
    model?.deprecated === true ||
    model?.active === false ||
    status.includes('deprecated') ||
    id.includes('deprecated') ||
    !!deprecationDate
  );
}

async function listGroqModels({ apiKey, timeoutMs = 15_000, includeDeprecated = false } = {}) {
  if (!apiKey) throw new Error('Missing GROQ_API_KEY');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(GROQ_MODELS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    const rawBody = await res.text().catch(() => '');
    let data = null;
    if (rawBody) {
      try {
        data = JSON.parse(rawBody);
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      const err = new Error(`Groq models error ${res.status}: ${rawBody}`);
      err.code = 'GROQ_MODELS_HTTP_ERROR';
      err.status = res.status;
      err.body = rawBody;
      const retryAfterMs = extractRetryAfterMs({ headers: res.headers, body: rawBody });
      if (retryAfterMs > 0) {
        err.retryAfterMs = retryAfterMs;
        err.retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      }
      throw err;
    }

    const rawModels = Array.isArray(data?.data) ? data.data : [];
    const models = rawModels
      .filter((item) => item && typeof item === 'object')
      .filter((item) => String(item.id || '').trim())
      .filter((item) => includeDeprecated || !isDeprecatedModel(item))
      .map((item) => ({
        id: String(item.id || '').trim(),
        object: String(item.object || '').trim(),
        ownedBy: String(item.owned_by || '').trim(),
        contextWindow: Number(item.context_window || 0),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return models;
  } finally {
    clearTimeout(timeout);
  }
}

async function runVisionPrompt({
  apiKey,
  imageBuffer,
  imageMimeType = 'image/jpeg',
  model = 'meta-llama/llama-4-scout-17b-16e-instruct',
  prompt,
  timeoutMs = 45_000,
  maxTokens = 240,
}) {
  if (!apiKey) throw new Error('Missing GROQ_API_KEY');
  if (!imageBuffer) throw new Error('Missing image buffer');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const mime = String(imageMimeType || '').toLowerCase().trim();
  const safeMime = /^image\/[a-z0-9.+-]+$/.test(mime) ? mime : 'image/jpeg';
  const dataUrl = `data:${safeMime};base64,${imageBuffer.toString('base64')}`;

  try {
    const res = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    const rawBody = await res.text().catch(() => '');
    let data = null;
    if (rawBody) {
      try {
        data = JSON.parse(rawBody);
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      const err = new Error(`Groq vision error ${res.status}: ${rawBody}`);
      err.code = 'GROQ_VISION_HTTP_ERROR';
      err.status = res.status;
      err.body = rawBody;
      err.model = model;
      const retryAfterMs = extractRetryAfterMs({ headers: res.headers, body: rawBody });
      if (retryAfterMs > 0) {
        err.retryAfterMs = retryAfterMs;
        err.retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      }
      throw err;
    }

    const content = parseOpenAiText(data?.choices?.[0]?.message?.content);
    if (!content) {
      const err = new Error('Groq vision returned empty content');
      err.code = 'GROQ_EMPTY_CONTENT';
      err.model = model;
      throw err;
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

async function groqImageCaption({
  apiKey,
  imageBuffer,
  imageMimeType = 'image/jpeg',
  model = 'meta-llama/llama-4-scout-17b-16e-instruct',
  timeoutMs = 45_000,
}) {
  return runVisionPrompt({
    apiKey,
    imageBuffer,
    imageMimeType,
    model,
    timeoutMs,
    maxTokens: 180,
    prompt: 'Describe this image in one concise sentence. Include visible text only if clearly readable.',
  });
}

async function groqImageOcr({
  apiKey,
  imageBuffer,
  imageMimeType = 'image/jpeg',
  model = 'meta-llama/llama-4-scout-17b-16e-instruct',
  timeoutMs = 45_000,
}) {
  return runVisionPrompt({
    apiKey,
    imageBuffer,
    imageMimeType,
    model,
    timeoutMs,
    maxTokens: 320,
    prompt: 'Extract all readable text from this image. Return only the text, no extra commentary.',
  });
}

module.exports = {
  groqChatCompletion,
  groqImageCaption,
  groqImageOcr,
  listGroqModels,
};
