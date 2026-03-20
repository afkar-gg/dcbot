const {
  GROQ_KEY_QUEUE_BASE_URL,
  GROQ_KEY_QUEUE_TOKEN,
  LOADSTRING_API_TIMEOUT_MS,
  RAW_CONFIG,
} = require('./runtimeConfig');

const DEBUG_ENABLED = Boolean(RAW_CONFIG.DEBUG_GROQ_QUEUE) || process.env.DEBUG_GROQ_QUEUE === 'true';

function debugLog(...args) {
  if (DEBUG_ENABLED) {
    const timestamp = new Date().toISOString();
    console.log(`[GROQ_QUEUE DEBUG ${timestamp}]`, ...args);
  }
}

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

  debugLog('Request started:', {
    method,
    url: url.toString(),
    pathname,
    query,
    timeoutMs,
  });

  try {
    debugLog('Sending fetch request...');
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      signal: ctrl.signal,
    });

    debugLog('Fetch response received:', {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      headers: Object.fromEntries(res.headers.entries()),
    });

    const raw = await res.text().catch((readErr) => {
      debugLog('Error reading response body:', readErr?.message || readErr);
      return '';
    });

    debugLog('Raw response body:', raw || '(empty)');

    let parsed = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
        debugLog('Parsed response JSON:', parsed);
      } catch (parseErr) {
        debugLog('Failed to parse response as JSON:', parseErr?.message || parseErr);
        parsed = null;
      }
    }

    if (!res.ok) {
      debugLog('Request failed with non-OK status:', {
        status: res.status,
        statusText: res.statusText,
        errorPayload: parsed,
      });

      const err = new Error(parsed?.error || `groq key queue request failed (${res.status})`);
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

    debugLog('Request successful');
    return parsed || {};
  } catch (err) {
    if (err?.name === 'AbortError') {
      debugLog('Request timed out after', timeoutMs, 'ms');
      const timeoutErr = new Error(`groq key queue timeout after ${timeoutMs}ms`);
      timeoutErr.code = 'GROQ_KEY_QUEUE_TIMEOUT';
      timeoutErr.debugInfo = {
        url: url.toString(),
        method,
        timeoutMs,
        query,
      };
      throw timeoutErr;
    }

    debugLog('Fetch error:', {
      name: err?.name,
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
    });

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

async function peekGroqKey() {
  const payload = await requestInternal({
    method: 'GET',
    pathname: '/internal/groq-keys/next',
  });
  return payload.item || null;
}

async function peekGroqKeysBatch(limit = 100) {
  const payload = await requestInternal({
    method: 'GET',
    pathname: '/internal/groq-keys/batch',
    query: { limit },
  });
  return Array.isArray(payload.items) ? payload.items : [];
}

async function removeGroqKeyById(id) {
  const payload = await requestInternal({
    method: 'DELETE',
    pathname: '/internal/groq-keys/item',
    query: { id },
  });
  return payload || { ok: false, removed: false };
}

async function checkGroqQueueConnectivity() {
  const results = {
    ok: false,
    checks: {},
    errors: [],
  };

  debugLog('Starting connectivity check...');

  if (!GROQ_KEY_QUEUE_BASE_URL) {
    results.errors.push('GROQ_KEY_QUEUE_BASE_URL is not configured');
    results.checks.baseUrl = { ok: false, value: null };
  } else {
    results.checks.baseUrl = { ok: true, value: GROQ_KEY_QUEUE_BASE_URL };
  }

  if (!GROQ_KEY_QUEUE_TOKEN) {
    results.errors.push('GROQ_KEY_QUEUE_TOKEN is not configured');
    results.checks.token = { ok: false, configured: false };
  } else {
    results.checks.token = { ok: true, configured: true, prefix: GROQ_KEY_QUEUE_TOKEN.slice(0, 8) + '...' };
  }

  if (results.errors.length > 0) {
    debugLog('Configuration check failed:', results.errors);
    return results;
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 5000);

  try {
    const healthUrl = buildInternalUrl('/health');
    debugLog('Checking health endpoint:', healthUrl.toString());

    const res = await fetch(healthUrl, {
      method: 'GET',
      signal: ctrl.signal,
    });

    debugLog('Health check response:', {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
    });

    results.checks.healthEndpoint = {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
    };

    if (!res.ok) {
      results.errors.push(`Health endpoint returned ${res.status}: ${res.statusText}`);
    } else {
      results.ok = true;
    }
  } catch (err) {
    debugLog('Health check failed:', err?.message || err);
    results.checks.healthEndpoint = {
      ok: false,
      error: err?.message || 'Unknown error',
      name: err?.name,
      code: err?.code,
    };
    results.errors.push(`Health check failed: ${err?.message || err}`);
  } finally {
    clearTimeout(timeout);
  }

  debugLog('Connectivity check complete:', results);
  return results;
}

function getGroqQueueDebugInfo() {
  return {
    config: {
      GROQ_KEY_QUEUE_BASE_URL,
      GROQ_KEY_QUEUE_TOKEN_CONFIGURED: Boolean(GROQ_KEY_QUEUE_TOKEN),
      LOADSTRING_API_TIMEOUT_MS,
      DEBUG_ENABLED,
    },
    environment: {
      DEBUG_GROQ_QUEUE_ENV: process.env.DEBUG_GROQ_QUEUE,
      NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED,
    },
  };
}

module.exports = {
  peekGroqKey,
  peekGroqKeysBatch,
  removeGroqKeyById,
  checkGroqQueueConnectivity,
  getGroqQueueDebugInfo,
};
