async function openaiChatCompletion({
  apiKey,
  messages,
  model = 'gpt-4o-mini',
  temperature = 0.9,
  maxTokens = 220,
}) {
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
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

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`OpenAI API error ${res.status}: ${text}`);
      err.status = res.status;
      err.body = text;
      throw err;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : '';
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  openaiChatCompletion,
};
