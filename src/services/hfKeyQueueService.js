const {
  HF_KEY_QUEUE_BASE_URL,
  HF_KEY_QUEUE_TOKEN,
  LOADSTRING_API_TIMEOUT_MS,
  RAW_CONFIG,
} = require('./runtimeConfig');

const DEBUG_ENABLED = Boolean(RAW_CONFIG.DEBUG_HF_QUEUE) || process.env.DEBUG_HF_QUEUE === 'true';

function debugLog(...args) {
  if (DEBUG_ENABLED) {
    const timestamp = new Date().toISOString();
    console.log(`[HF_QUEUE DEBUG ${timestamp}]`, ...args);
  }
}

function buildInternalUrl(pathname, query = {}) {
  const base = String(HF_KEY_QUEUE_BASE_URL || '').trim();
  if (!base) throw new Error('HF_KEY_QUEUE_BASE_URL is required');
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
  const token = String(HF_KEY_QUEUE_TOKEN || '').trim();
  if (!token) throw new Error('HF_KEY_QUEUE_TOKEN is required');

  const url = buildInternalUrl(pathname, query);
  const ctrl = new AbortController();
  const timeoutMs = Math.max(500, Number(LOADSTRING_API_TIMEOUT_MS) || 8000);
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);

  debugLog('Request started:', {
    method,
    url: url.toString(),
    pathname,
    query,
    timeoutMs,
  });

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
      const err = new Error(parsed?.error || `huggingface key queue request failed (${res.status})`);
      err.status = res.status;
      err.payload = parsed;
      err.debugInfo = {
        url: url.toString(),
        method,
        responseStatus: res.status,
        responseStatusText: res.statusText,
        responseBody: raw,
        parsedBody: parsed,
        requestQuery: query,
      };
      throw err;
    }

    return parsed || {};
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error(`huggingface key queue timeout after ${timeoutMs}ms`);
      timeoutErr.code = 'HF_KEY_QUEUE_TIMEOUT';
      timeoutErr.debugInfo = {
        url: url.toString(),
        method,
        timeoutMs,
        query,
      };
      throw timeoutErr;
    }
    err.debugInfo = err.debugInfo || {
      url: url.toString(),
      method,
      query,
    };
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function peekHfKey() {
  const payload = await requestInternal({
    method: 'GET',
    pathname: '/internal/hf-keys/next',
  });
  return payload.item || null;
}

async function peekHfKeysBatch(limit = 100) {
  const payload = await requestInternal({
    method: 'GET',
    pathname: '/internal/hf-keys/batch',
    query: { limit },
  });
  return Array.isArray(payload.items) ? payload.items : [];
}

async function removeHfKeyById(id) {
  const payload = await requestInternal({
    method: 'DELETE',
    pathname: '/internal/hf-keys/item',
    query: { id },
  });
  return payload || { ok: false, removed: false };
}

module.exports = {
  peekHfKey,
  peekHfKeysBatch,
  removeHfKeyById,
};
