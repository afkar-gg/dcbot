async function groqChatCompletion({ apiKey, messages, model = 'llama3-8b-8192', temperature = 0.6, maxTokens = 256 }) {
  if (!apiKey) throw new Error('Missing GROQ_API_KEY');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
      throw new Error(`Groq API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : '';
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  groqChatCompletion,
};
