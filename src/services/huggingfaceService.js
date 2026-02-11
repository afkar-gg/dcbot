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
      'moonshotai/Kimi-K2.5:novita',
      'moonshotai/Kimi-K2.5:novita-ai',
      'moonshotai/Kimi-K2.5:together',
      'moonshotai/Kimi-K2.5:together-ai',
      'moonshotai/Kimi-K2.5',
      // backup lightweight model (HF Inference provider)
      'HuggingFaceTB/SmolLM3-3B:hf-inference',
    ];

    const shouldRetry = [400, 401, 403, 404, 422].includes(e?.status);
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

async function huggingfaceImageCaption({
  apiKey,
  imageBuffer,
  model = 'Salesforce/blip-image-captioning-base',
  timeoutMs = 45_000,
}) {
  if (!apiKey) throw new Error('Missing HUGGINGFACE_API_KEY');
  if (!imageBuffer) throw new Error('Missing image buffer');

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
    const caption =
      (Array.isArray(data) ? data?.[0]?.generated_text : null) ||
      data?.generated_text ||
      data?.caption ||
      '';
    return typeof caption === 'string' ? caption.trim() : '';
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

module.exports = {
  huggingfaceChatCompletion,
  huggingfaceImageCaption,
};
