# Loadstring & Groq Queue API Debugging Guide

This document describes the debugging features available for the sc.afkar.lol API and Groq Queue implementations.

## Overview

The API implementations now include comprehensive debugging capabilities to help diagnose connection and API issues.

## Enabling Debug Mode

### Loadstring API Debug Mode

**Option 1: Config File**
Add the following to your `config.json`:

```json
{
  "DEBUG_LOADSTRING_API": true
}
```

**Option 2: Environment Variable**
Set the environment variable before starting the bot:

```bash
DEBUG_LOADSTRING_API=true npm start
```

### Groq Queue Debug Mode

**Option 1: Config File**
Add the following to your `config.json`:

```json
{
  "DEBUG_GROQ_QUEUE": true
}
```

**Option 2: Environment Variable**
```bash
DEBUG_GROQ_QUEUE=true npm start
```

## Debug Features

### 1. Detailed Request/Response Logging

When debug mode is enabled, every API request logs:

- Request method, URL, and query parameters
- Request body (for POST/PUT/DELETE)
- Response status, headers, and body
- Parsed JSON response
- Error details including stack traces

Example debug output:

```
[LOADSTRING_API DEBUG 2026-03-19T10:30:00.000Z] Request started: {
  method: 'POST',
  url: 'http://127.0.0.1:3006/internal/loadstrings/upsert',
  pathname: '/internal/loadstrings/upsert',
  query: {},
  hasBody: true,
  timeoutMs: 8000
}
[LOADSTRING_API DEBUG 2026-03-19T10:30:00.100Z] Request body: {
  "ownerUserId": "123456789",
  "ownerUsername": "example-user",
  "scriptName": "myscript",
  "content": "print('hello')"
}
[LOADSTRING_API DEBUG 2026-03-19T10:30:00.200Z] Fetch response received: {
  status: 200,
  statusText: 'OK',
  ok: true,
  headers: { ... }
}
```

### 2. Enhanced Error Messages

When API calls fail, error messages now include:

- Full request URL
- HTTP status code and response body
- Specific error codes (ECONNREFUSED, ENOTFOUND, etc.)
- Helpful troubleshooting tips based on error type

Example error output:

```
failed to save loadstring: loadstring api request failed (500)

Debug info:
- URL: `http://127.0.0.1:3006/internal/loadstrings/upsert`
- HTTP Status: 500
- Response: `{"error":"Internal server error"}`

The API server refused connection. Make sure the loadstring API server is running.
```

### 3. Connectivity Check Command

Use the `s.lsdebug` prefix command (creator only) to run a comprehensive connectivity check:

**What it checks:**
- Base URL configuration
- API token configuration
- Health endpoint availability
- Network connectivity

**Example output:**
```
**Loadstring API Debug Information**

**Configuration:**
- Base URL: `http://127.0.0.1:3006`
- Token Configured: true
- Timeout: 8000ms
- Debug Mode: true

**Connectivity Check:**
- Overall Status: ❌ FAILED
- baseUrl: ✅
  - Value: `http://127.0.0.1:3006`
- token: ✅
  - Value: `abc12345...`
- healthEndpoint: ❌
  - HTTP Status: 503
  - Error: `Service Unavailable`

**Errors:**
- Health endpoint returned 503: Service Unavailable

**Tip:** Enable debug logging by setting `DEBUG_LOADSTRING_API: true` in config.json or `DEBUG_LOADSTRING_API=true` environment variable.
```

### 4. Groq Queue Debug Command

Use the `s.groqqueue` or `s.groqdebug` prefix command (creator only) to check Groq Queue connectivity:

**What it checks:**
- Base URL configuration
- API token configuration
- Health endpoint availability
- Network connectivity

**Example output:**
```
**Groq Queue API Debug Information**

**Configuration:**
- Base URL: `http://127.0.0.1:3006`
- Token Configured: true
- Timeout: 8000ms
- Debug Mode: true

**Connectivity Check:**
- Overall Status: ❌ FAILED
- baseUrl: ✅
  - Value: `http://127.0.0.1:3006`
- token: ✅
  - Value: `abc12345...`
- healthEndpoint: ❌
  - Error: `fetch failed`

**Errors:**
- Health check failed: fetch failed

**Tip:** Enable debug logging by setting `DEBUG_GROQ_QUEUE: true` in config.json or `DEBUG_GROQ_QUEUE=true` environment variable.
```

### 5. Programmatic Debug Functions

#### Loadstring API Functions

Two new functions are exported from `loadstringApiStore.js`:

#### `checkLoadstringApiConnectivity()`

Returns a promise that resolves to connectivity check results:

```javascript
const { checkLoadstringApiConnectivity } = require('./src/services/loadstringApiStore');

const results = await checkLoadstringApiConnectivity();
console.log(results);
// {
//   ok: false,
//   checks: { ... },
//   errors: [...]
// }
```

#### `getLoadstringApiDebugInfo()`

Returns current configuration and environment debug info:

```javascript
const { getLoadstringApiDebugInfo } = require('./src/services/loadstringApiStore');

const info = getLoadstringApiDebugInfo();
console.log(info);
// {
//   config: { ... },
//   environment: { ... }
// }
```

#### Groq Queue Functions

Two new functions are exported from `groqKeyQueueService.js`:

**`checkGroqQueueConnectivity()`**
```javascript
const { checkGroqQueueConnectivity } = require('./src/services/groqKeyQueueService');
const results = await checkGroqQueueConnectivity();
```

**`getGroqQueueDebugInfo()`**
```javascript
const { getGroqQueueDebugInfo } = require('./src/services/groqKeyQueueService');
const info = getGroqQueueDebugInfo();
```

## Common Error Scenarios

### ECONNREFUSED
**Cause:** API server is not running or not listening on the configured address.

**Solution:**
1. Start the loadstring API server
2. Verify `LOADSTRING_API_BASE_URL` points to the correct address
3. Check firewall rules

### ENOTFOUND
**Cause:** Hostname in `LOADSTRING_API_BASE_URL` cannot be resolved.

**Solution:**
1. Check the URL spelling in config
2. Verify DNS resolution
3. Use IP address instead of hostname for testing

### LOADSTRING_API_TIMEOUT
**Cause:** API server took too long to respond.

**Solution:**
1. Increase `LOADSTRING_API_TIMEOUT_MS` in config
2. Check API server performance
3. Investigate network latency

### 401 Unauthorized
**Cause:** Invalid or missing API token.

**Solution:**
1. Verify `LOADSTRING_API_TOKEN` matches server configuration
2. Check token format (should be a non-empty string)

### 404 Not Found
**Cause:** API endpoint doesn't exist or wrong base URL.

**Solution:**
1. Verify API server is running the correct version
2. Check base URL includes correct port
3. Test health endpoint: `curl http://your-api-server/health`

## Testing the API Server

Use these commands to test your API server:

```bash
# Test health endpoint
curl http://127.0.0.1:3006/health

# Expected response:
# {"ok":true}
```

## Configuration Reference

### Loadstring API

| Config Key | Description | Default |
|------------|-------------|---------|
| `LOADSTRING_API_BASE_URL` | Base URL of the loadstring API server | `http://127.0.0.1:3006` |
| `LOADSTRING_API_TOKEN` | Authentication token for API requests | (required) |
| `LOADSTRING_API_TIMEOUT_MS` | Request timeout in milliseconds | `8000` |
| `DEBUG_LOADSTRING_API` | Enable debug logging | `false` |

### Groq Queue API

| Config Key | Description | Default |
|------------|-------------|---------|
| `GROQ_KEY_QUEUE_BASE_URL` | Base URL of the Groq Queue API server | `http://127.0.0.1:3006` |
| `GROQ_KEY_QUEUE_TOKEN` | Authentication token for API requests | (required) |
| `GROQ_KEY_QUEUE_POLL_MS` | Polling interval in milliseconds | `120000` |
| `DEBUG_GROQ_QUEUE` | Enable debug logging | `false` |
