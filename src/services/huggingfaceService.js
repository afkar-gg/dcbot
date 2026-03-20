const HF_CHAT_URL = 'https://router.huggingface.co/v1/chat/completions';
const HF_MODELS_URL = 'https://huggingface.co/api/models';

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

function normalizeAuthKey(apiKey) {
  const token = String(apiKey || '').trim();
  if (!token) throw new Error('Missing HUGGINGFACE_API_KEY');
  if (!/^hf_[a-zA-Z0-9_-]{16,}$/.test(token)) {
    throw new Error('Invalid HUGGINGFACE_API_KEY format');
  }
  return token;
}

async function huggingfaceChatCompletion({
  apiKey,
  messages,
  model = 'meta-llama/Llama-3.3-70B-Instruct',
  temperature = 0.9,
  maxTokens = 220,
  timeoutMs = 90_000,
}) {
  const token = normalizeAuthKey(apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(HF_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
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
      const err = new Error(`Hugging Face chat error ${res.status}: ${rawBody}`);
      err.code = 'HF_HTTP_ERROR';
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
      const err = new Error('Hugging Face returned empty assistant content');
      err.code = 'HF_EMPTY_CONTENT';
      err.model = model;
      err.body = rawBody;
      throw err;
    }

    return content;
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error(`Hugging Face request timed out after ${timeoutMs}ms`);
      timeoutErr.code = 'HF_TIMEOUT';
      timeoutErr.timeoutMs = timeoutMs;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function runVisionPrompt({
  apiKey,
  imageBuffer,
  imageMimeType = 'image/jpeg',
  model = 'meta-llama/Llama-3.2-11B-Vision-Instruct',
  prompt,
  timeoutMs = 45_000,
  maxTokens = 320,
}) {
  const token = normalizeAuthKey(apiKey);
  if (!imageBuffer) throw new Error('Missing image buffer');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const mime = String(imageMimeType || '').toLowerCase().trim();
  const safeMime = /^image\/[a-z0-9.+-]+$/.test(mime) ? mime : 'image/jpeg';
  const dataUrl = `data:${safeMime};base64,${imageBuffer.toString('base64')}`;

  try {
    const res = await fetch(HF_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
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
      const err = new Error(`Hugging Face vision error ${res.status}: ${rawBody}`);
      err.code = 'HF_VISION_HTTP_ERROR';
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
      const err = new Error('Hugging Face vision returned empty content');
      err.code = 'HF_EMPTY_CONTENT';
      err.model = model;
      throw err;
    }

    return content;
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error(`Hugging Face vision request timed out after ${timeoutMs}ms`);
      timeoutErr.code = 'HF_TIMEOUT';
      timeoutErr.timeoutMs = timeoutMs;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function huggingfaceImageCaption({
  apiKey,
  imageBuffer,
  imageMimeType = 'image/jpeg',
  model = 'meta-llama/Llama-3.2-11B-Vision-Instruct',
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

async function huggingfaceImageOcr({
  apiKey,
  imageBuffer,
  imageMimeType = 'image/jpeg',
  model = 'meta-llama/Llama-3.2-11B-Vision-Instruct',
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

async function listHuggingFaceModels({
  apiKey = '',
  timeoutMs = 15_000,
  limit = 50,
  pipelineTag = 'text-generation',
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL(HF_MODELS_URL);
  url.searchParams.set('sort', 'downloads');
  url.searchParams.set('direction', '-1');
  url.searchParams.set('limit', String(Math.max(1, Math.min(200, Number(limit) || 50))));
  if (pipelineTag) {
    url.searchParams.set('pipeline_tag', String(pipelineTag));
  }

  const headers = {};
  const token = String(apiKey || '').trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
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
      const err = new Error(`Hugging Face models error ${res.status}: ${rawBody}`);
      err.code = 'HF_MODELS_HTTP_ERROR';
      err.status = res.status;
      err.body = rawBody;
      const retryAfterMs = extractRetryAfterMs({ headers: res.headers, body: rawBody });
      if (retryAfterMs > 0) {
        err.retryAfterMs = retryAfterMs;
        err.retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      }
      throw err;
    }

    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((item) => String(item?.id || '').trim())
      .filter(Boolean)
      .slice(0, Math.max(1, Math.min(200, Number(limit) || 50)));
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  huggingfaceChatCompletion,
  huggingfaceImageCaption,
  huggingfaceImageOcr,
  listHuggingFaceModels,
};
