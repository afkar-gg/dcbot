const {
  GROQ_KEY_QUEUE_BASE_URL,
  GROQ_KEY_QUEUE_TOKEN,
  LOADSTRING_API_TIMEOUT_MS,
} = require('./runtimeConfig');

function buildInternalUrl(pathname, query = {}) {
  const base = String(GROQ_KEY_QUEUE_BASE_URL || '').trim();
  if (!base) throw new Error('GROQ_KEY_QUEUE_BASE_URL is required');
  const url = new URL(pathname, base.endsWith('/') ? base : `${base}/`);

  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (!text) continue;
    url.searchParams.set(key, text);
  }

  return url;
}

async function requestInternal({ method, pathname, query } = {}) {
  const token = String(GROQ_KEY_QUEUE_TOKEN || '').trim();
  if (!token) throw new Error('GROQ_KEY_QUEUE_TOKEN is required');

  const url = buildInternalUrl(pathname, query);
  const ctrl = new AbortController();
  const timeoutMs = Math.max(500, Number(LOADSTRING_API_TIMEOUT_MS) || 8000);
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      signal: ctrl.signal,
    });

    const raw = await res.text().catch(() => '');
    let parsed = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }

    if (!res.ok) {
      const err = new Error(parsed?.error || `groq key queue request failed (${res.status})`);
      err.status = res.status;
      err.payload = parsed;
      throw err;
    }

    return parsed || {};
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error(`groq key queue timeout after ${timeoutMs}ms`);
      timeoutErr.code = 'GROQ_KEY_QUEUE_TIMEOUT';
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function peekGroqKey() {
  const payload = await requestInternal({
    method: 'GET',
    pathname: '/internal/groq-keys/next',
  });
  return payload.item || null;
}

async function removeGroqKeyById(id) {
  const payload = await requestInternal({
    method: 'DELETE',
    pathname: '/internal/groq-keys/item',
    query: { id },
  });
  return payload || { ok: false, removed: false };
}

module.exports = {
  peekGroqKey,
  removeGroqKeyById,
};
