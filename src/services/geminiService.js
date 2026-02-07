async function geminiGenerateText({
  apiKey,
  userText,
  systemText,
  model = 'gemini-2.5-flash',
  temperature = 0.8,
  maxOutputTokens = 256,
}) {
  if (!apiKey) throw new Error('Missing GOOGLE_AI_STUDIO_API_KEY');

  async function attempt(modelName) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: systemText
            ? { role: 'system', parts: [{ text: systemText }] }
            : undefined,
          contents: [
            {
              role: 'user',
              parts: [{ text: userText }],
            },
          ],
          generationConfig: {
            temperature,
            maxOutputTokens,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`Gemini API error ${res.status}: ${text}`);
        err.status = res.status;
        err.body = text;
        throw err;
      }

      const data = await res.json();
      const out =
        data?.candidates?.[0]?.content?.parts
          ?.map((p) => p?.text)
          .filter(Boolean)
          .join('') ||
        '';

      return String(out).trim();
    } finally {
      clearTimeout(timeout);
    }
  }

  try {
    return await attempt(model);
  } catch (e) {
    // Common issue: model name not available for v1beta or generateContent.
    const msg = String(e?.message || '');
    const notFound =
      e?.status === 404 ||
      msg.includes('is not found') ||
      msg.includes('not supported') ||
      msg.includes('ListModels');

    if (!notFound) throw e;

    // Try a few known-good fallbacks.
    const fallbacks = [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-2.0-pro',
      'gemini-1.5-flash-latest',
      'gemini-1.5-pro-latest',
      'gemini-1.0-pro',
      'gemini-pro',
    ];

    for (const m of fallbacks) {
      try {
        return await attempt(m);
      } catch {
        // continue
      }
    }

    throw e;
  }
}

module.exports = {
  geminiGenerateText,
};
