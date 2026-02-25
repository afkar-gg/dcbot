async function huggingfaceChatCompletion({
  apiKey,
  messages,
  model = 'moonshotai/Kimi-K2.5:novita',
  temperature = 0.9,
  maxTokens = 220,
  timeoutMs = 90_000,
}) {
  if (!apiKey) throw new Error('Missing HUGGINGFACE_API_KEY');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  async function attempt(modelName) {
    const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`HuggingFace Router error ${res.status}: ${text}`);
      err.status = res.status;
      err.body = text;
      err.model = modelName;
      throw err;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : '';
  }

  try {
    return await attempt(model);
  } catch (e) {
    // Provider suffixes can vary. Try a few common variants.
    const fallbacks = [
      model,

      // Prefer router policies first (lets HF pick an available provider)
      'moonshotai/Kimi-K2.5:fastest',
      'moonshotai/Kimi-K2.5:preferred',
      'moonshotai/Kimi-K2.5:cheapest',

      // Known working provider-suffixed variants
      'moonshotai/Kimi-K2.5:novita',
      'moonshotai/Kimi-K2.5:novita-ai',
      'moonshotai/Kimi-K2.5:together',
      'moonshotai/Kimi-K2.5:together-ai',
      'moonshotai/Kimi-K2.5',

      // Backup general model on multiple providers
      'meta-llama/Llama-3.1-8B-Instruct:fastest',
      'meta-llama/Llama-3.1-8B-Instruct:groq',
      'meta-llama/Llama-3.1-8B-Instruct:fireworks-ai',
      'meta-llama/Llama-3.1-8B-Instruct:nscale',

      // backup lightweight model (HF Inference provider)
      'HuggingFaceTB/SmolLM3-3B:hf-inference',
    ];

    const shouldRetry = [400, 401, 403, 404, 422, 429, 500, 502, 503, 504].includes(e?.status);
    if (!shouldRetry) throw e;

    for (const m of fallbacks) {
      try {
        return await attempt(m);
      } catch {
        // keep trying
      }
    }

    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

function parseInferenceText(data, candidates = []) {
  if (!data) return '';
  if (Array.isArray(data)) {
    for (const item of data) {
      for (const key of candidates) {
        const value = item?.[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
    }
    return '';
  }
  for (const key of candidates) {
    const value = data?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function parseRouterText(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') return part;
        return part?.text || '';
      })
      .join(' ')
      .trim();
    return text;
  }
  return '';
}

function errorRequiresRouter(err) {
  const body = String(err?.body || err?.message || '').toLowerCase();
  return body.includes('router.huggingface.co');
}

function isLikelyVisionChatModel(model) {
  const m = String(model || '').toLowerCase();
  return (
    m.includes('vision') ||
    m.includes('vl') ||
    m.includes('llava') ||
    m.includes('pixtral') ||
    m.includes('gemma-3') ||
    m.includes('qwen2.5-vl') ||
    m.includes('gpt-4o')
  );
}

function buildVisionRouterModelFallbacks(preferredModel = '') {
  const out = [];
  const seen = new Set();
  const push = (m) => {
    const key = String(m || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };

  if (isLikelyVisionChatModel(preferredModel)) {
    push(preferredModel);
  }

  // Cross-provider fallbacks for multimodal chat on HF Router.
  push('meta-llama/Llama-3.2-11B-Vision-Instruct:preferred');
  push('meta-llama/Llama-3.2-11B-Vision-Instruct:fastest');
  push('meta-llama/Llama-3.2-11B-Vision-Instruct');
  push('Qwen/Qwen2.5-VL-7B-Instruct:preferred');
  push('Qwen/Qwen2.5-VL-7B-Instruct:fastest');
  push('Qwen/Qwen2.5-VL-7B-Instruct');
  return out;
}

async function runRouterVisionPrompt({
  apiKey,
  imageBuffer,
  imageMimeType = 'image/jpeg',
  prompt,
  preferredModel = '',
  timeoutMs = 45_000,
  maxTokens = 180,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const mime = String(imageMimeType || '').toLowerCase().trim();
  const safeMime = /^image\/[a-z0-9.+-]+$/.test(mime) ? mime : 'image/jpeg';
  const dataUrl = `data:${safeMime};base64,${imageBuffer.toString('base64')}`;

  async function attempt(model) {
    const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
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

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`HuggingFace Router vision error ${res.status}: ${text}`);
      err.status = res.status;
      err.body = text;
      err.model = model;
      throw err;
    }

    const data = await res.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;
    return parseRouterText(content);
  }

  try {
    const models = buildVisionRouterModelFallbacks(preferredModel);
    let lastErr = null;
    for (const model of models) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const text = await attempt(model);
        if (text) return text;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) throw lastErr;
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function huggingfaceImageCaption({
  apiKey,
  imageBuffer,
  imageMimeType = 'image/jpeg',
  model = 'Salesforce/blip-image-captioning-base',
  timeoutMs = 45_000,
}) {
  if (!apiKey) throw new Error('Missing HUGGINGFACE_API_KEY');
  if (!imageBuffer) throw new Error('Missing image buffer');
  if (isLikelyVisionChatModel(model)) {
    return runRouterVisionPrompt({
      apiKey,
      imageBuffer,
      imageMimeType,
      prompt: 'Describe this image in one concise sentence. Include visible text only if clearly readable.',
      preferredModel: model,
      timeoutMs,
      maxTokens: 180,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  async function attempt(modelName) {
    const res = await fetch(
      `https://api-inference.huggingface.co/models/${encodeURIComponent(modelName)}?wait_for_model=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/octet-stream',
        },
        body: imageBuffer,
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`HuggingFace Inference error ${res.status}: ${text}`);
      err.status = res.status;
      err.body = text;
      err.model = modelName;
      throw err;
    }

    const data = await res.json().catch(() => null);
    return parseInferenceText(data, ['generated_text', 'caption']);
  }

  try {
    return await attempt(model);
  } catch (e) {
    const fallbacks = [
      model,
      'Salesforce/blip-image-captioning-base',
      'Salesforce/blip-image-captioning-large',
      'nlpconnect/vit-gpt2-image-captioning',
    ];

    const shouldRetry = [400, 401, 403, 404, 422, 503].includes(e?.status);
    let sawRouterHint = errorRequiresRouter(e);
    if (!shouldRetry && !sawRouterHint) throw e;

    for (const m of fallbacks) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await attempt(m);
      } catch (err) {
        if (errorRequiresRouter(err)) sawRouterHint = true;
        // keep trying
      }
    }

    if (sawRouterHint) {
      console.error('HF image caption endpoint requested router; switching to router vision chat fallback.');
      return runRouterVisionPrompt({
        apiKey,
        imageBuffer,
        imageMimeType,
        prompt: 'Describe this image in one concise sentence. Include visible text only if clearly readable.',
        preferredModel: model,
        timeoutMs,
        maxTokens: 180,
      });
    }

    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

async function huggingfaceImageOcr({
  apiKey,
  imageBuffer,
  imageMimeType = 'image/jpeg',
  model = 'microsoft/trocr-base-printed',
  timeoutMs = 45_000,
}) {
  if (!apiKey) throw new Error('Missing HUGGINGFACE_API_KEY');
  if (!imageBuffer) throw new Error('Missing image buffer');
  if (isLikelyVisionChatModel(model)) {
    return runRouterVisionPrompt({
      apiKey,
      imageBuffer,
      imageMimeType,
      prompt: 'Extract all readable text from this image. Return only the text, no extra commentary.',
      preferredModel: model,
      timeoutMs,
      maxTokens: 240,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  async function attempt(modelName) {
    const res = await fetch(
      `https://api-inference.huggingface.co/models/${encodeURIComponent(modelName)}?wait_for_model=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/octet-stream',
        },
        body: imageBuffer,
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`HuggingFace Inference OCR error ${res.status}: ${text}`);
      err.status = res.status;
      err.body = text;
      err.model = modelName;
      throw err;
    }

    const data = await res.json().catch(() => null);
    return parseInferenceText(data, ['generated_text', 'text', 'ocr_text', 'caption']);
  }

  try {
    return await attempt(model);
  } catch (e) {
    const fallbacks = [
      model,
      'microsoft/trocr-base-printed',
      'microsoft/trocr-large-printed',
      'microsoft/trocr-base-handwritten',
    ];

    const shouldRetry = [400, 401, 403, 404, 422, 503].includes(e?.status);
    let sawRouterHint = errorRequiresRouter(e);
    if (!shouldRetry && !sawRouterHint) throw e;

    for (const m of fallbacks) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await attempt(m);
      } catch (err) {
        if (errorRequiresRouter(err)) sawRouterHint = true;
        // keep trying
      }
    }

    if (sawRouterHint) {
      console.error('HF image OCR endpoint requested router; switching to router vision chat fallback.');
      return runRouterVisionPrompt({
        apiKey,
        imageBuffer,
        imageMimeType,
        prompt: 'Extract all readable text from this image. Return only the text, no extra commentary.',
        preferredModel: model,
        timeoutMs,
        maxTokens: 240,
      });
    }

    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  huggingfaceChatCompletion,
  huggingfaceImageCaption,
  huggingfaceImageOcr,
};
