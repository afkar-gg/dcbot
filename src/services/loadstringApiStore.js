const {
  LOADSTRING_API_BASE_URL,
  LOADSTRING_API_TOKEN,
  LOADSTRING_API_TIMEOUT_MS,
  RAW_CONFIG,
} = require('./runtimeConfig');

const DEBUG_ENABLED = Boolean(RAW_CONFIG.DEBUG_LOADSTRING_API) || process.env.DEBUG_LOADSTRING_API === 'true';

function debugLog(...args) {
  if (DEBUG_ENABLED) {
    const timestamp = new Date().toISOString();
    console.log(`[LOADSTRING_API DEBUG ${timestamp}]`, ...args);
  }
}

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

  debugLog('Request started:', {
    method,
    url: url.toString(),
    pathname,
    query,
    hasBody: body !== undefined,
    timeoutMs,
  });

  if (body !== undefined) {
    debugLog('Request body:', JSON.stringify(body, null, 2));
  }

  try {
    debugLog('Sending fetch request...');
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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

      const err = new Error(
        parsed?.error || `loadstring api request failed (${res.status})`
      );
      err.status = res.status;
      err.code = parsed?.code || '';
      err.payload = parsed;
      err.debugInfo = {
        url: url.toString(),
        method,
        responseStatus: res.status,
        responseStatusText: res.statusText,
        responseBody: raw,
        parsedBody: parsed,
        requestQuery: query,
        requestBody: body,
      };
      throw err;
    }

    debugLog('Request successful');
    return parsed || {};
  } catch (err) {
    if (err?.name === 'AbortError') {
      debugLog('Request timed out after', timeoutMs, 'ms');
      const timeoutErr = new Error(`loadstring api timeout after ${timeoutMs}ms`);
      timeoutErr.code = 'LOADSTRING_API_TIMEOUT';
      timeoutErr.debugInfo = {
        url: url.toString(),
        method,
        timeoutMs,
        query,
        body,
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
      body,
    };

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

async function checkLoadstringApiConnectivity() {
  const results = {
    ok: false,
    checks: {},
    errors: [],
  };

  debugLog('Starting connectivity check...');

  if (!LOADSTRING_API_BASE_URL) {
    results.errors.push('LOADSTRING_API_BASE_URL is not configured');
    results.checks.baseUrl = { ok: false, value: null };
  } else {
    results.checks.baseUrl = { ok: true, value: LOADSTRING_API_BASE_URL };
  }

  if (!LOADSTRING_API_TOKEN) {
    results.errors.push('LOADSTRING_API_TOKEN is not configured');
    results.checks.token = { ok: false, configured: false };
  } else {
    results.checks.token = { ok: true, configured: true, prefix: LOADSTRING_API_TOKEN.slice(0, 8) + '...' };
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

function getLoadstringApiDebugInfo() {
  return {
    config: {
      LOADSTRING_API_BASE_URL,
      LOADSTRING_API_TOKEN_CONFIGURED: Boolean(LOADSTRING_API_TOKEN),
      LOADSTRING_API_TIMEOUT_MS,
      DEBUG_ENABLED,
    },
    environment: {
      DEBUG_LOADSTRING_API_ENV: process.env.DEBUG_LOADSTRING_API,
      NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED,
    },
  };
}

module.exports = {
  createLoadstringStore,
  checkLoadstringApiConnectivity,
  getLoadstringApiDebugInfo,
};
