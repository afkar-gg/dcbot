const {
  LOADSTRING_API_BASE_URL,
  LOADSTRING_API_TOKEN,
  LOADSTRING_API_TIMEOUT_MS,
} = require('./runtimeConfig');

function buildInternalUrl(pathname, query = {}) {
  const base = String(LOADSTRING_API_BASE_URL || '').trim();
  if (!base) throw new Error('LOADSTRING_API_BASE_URL is required');
  const url = new URL(pathname, base.endsWith('/') ? base : `${base}/`);

  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (!text) continue;
    url.searchParams.set(key, text);
  }

  return url;
}

async function requestInternal({ method, pathname, query, body } = {}) {
  const token = String(LOADSTRING_API_TOKEN || '').trim();
  if (!token) throw new Error('LOADSTRING_API_TOKEN is required');

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
      body: body === undefined ? undefined : JSON.stringify(body),
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
      const err = new Error(
        parsed?.error || `loadstring api request failed (${res.status})`
      );
      err.status = res.status;
      err.code = parsed?.code || '';
      err.payload = parsed;
      throw err;
    }

    return parsed || {};
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error(`loadstring api timeout after ${timeoutMs}ms`);
      timeoutErr.code = 'LOADSTRING_API_TIMEOUT';
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function createLoadstringStore() {
  return {
    async upsertLoadstring({ ownerUserId, ownerUsername, scriptName, content }) {
      try {
        const payload = await requestInternal({
          method: 'POST',
          pathname: '/internal/loadstrings/upsert',
          body: {
            ownerUserId,
            ownerUsername,
            scriptName,
            content,
          },
        });
        return payload.record || null;
      } catch (err) {
        if (err?.code === 'LOADSTRING_LIMIT_REACHED' || err?.status === 409) {
          const limitErr = new Error(err.message || 'maximum loadstrings reached');
          limitErr.code = 'LOADSTRING_LIMIT_REACHED';
          throw limitErr;
        }
        throw err;
      }
    },

    async listLoadstringsForUser(ownerUserId) {
      const payload = await requestInternal({
        method: 'GET',
        pathname: '/internal/loadstrings',
        query: { ownerUserId },
      });
      return Array.isArray(payload.rows) ? payload.rows : [];
    },

    async getLoadstringForUser({ ownerUserId, scriptNameOrSlug }) {
      const payload = await requestInternal({
        method: 'GET',
        pathname: '/internal/loadstrings/item',
        query: { ownerUserId, scriptNameOrSlug },
      });
      return payload.found || null;
    },

    async removeLoadstringForUser({ ownerUserId, scriptNameOrSlug }) {
      const payload = await requestInternal({
        method: 'DELETE',
        pathname: '/internal/loadstrings/item',
        query: { ownerUserId, scriptNameOrSlug },
      });
      return payload || { ok: false, removed: false };
    },
  };
}

module.exports = {
  createLoadstringStore,
};
