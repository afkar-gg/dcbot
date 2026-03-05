const test = require('node:test');
const assert = require('node:assert/strict');

const {
  groqChatCompletion,
  listGroqModels,
} = require('../src/services/groqService');

function makeJsonResponse(body, status = 200) {
  const raw = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => raw,
  };
}

let originalFetch;
let originalConsoleError;

test.beforeEach(() => {
  originalFetch = global.fetch;
  originalConsoleError = console.error;
  console.error = () => {};
});

test.afterEach(() => {
  global.fetch = originalFetch;
  console.error = originalConsoleError;
});

test('returns text when Groq response content is structured array', async () => {
  global.fetch = async () =>
    makeJsonResponse({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'hello from array' }],
          },
        },
      ],
    });

  const text = await groqChatCompletion({
    apiKey: 'gsk_test',
    messages: [{ role: 'user', content: 'hi' }],
    model: 'llama-3.3-70b-versatile',
    timeoutMs: 2000,
  });

  assert.equal(text, 'hello from array');
});

test('throws GROQ_EMPTY_CONTENT when content is empty', async () => {
  global.fetch = async () =>
    makeJsonResponse({
      choices: [
        {
          finish_reason: 'length',
          message: { role: 'assistant', content: '' },
        },
      ],
    });

  await assert.rejects(
    () =>
      groqChatCompletion({
        apiKey: 'gsk_test',
        messages: [{ role: 'user', content: 'hello' }],
        model: 'llama-3.3-70b-versatile',
        timeoutMs: 2000,
      }),
    (err) => {
      assert.equal(err?.code, 'GROQ_EMPTY_CONTENT');
      return true;
    }
  );
});

test('marks timeout abort as GROQ_TIMEOUT', async () => {
  global.fetch = async (_url, opts = {}) =>
    new Promise((_resolve, reject) => {
      const signal = opts?.signal;
      const onAbort = () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      };

      if (!signal) {
        reject(new Error('missing signal'));
        return;
      }

      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener('abort', onAbort, { once: true });
    });

  await assert.rejects(
    () =>
      groqChatCompletion({
        apiKey: 'gsk_test',
        messages: [{ role: 'user', content: 'hello' }],
        model: 'llama-3.3-70b-versatile',
        timeoutMs: 20,
      }),
    (err) => {
      assert.equal(err?.code, 'GROQ_TIMEOUT');
      return true;
    }
  );
});

test('listGroqModels excludes deprecated models by default', async () => {
  global.fetch = async () =>
    makeJsonResponse({
      data: [
        { id: 'llama-3.3-70b-versatile', active: true, object: 'model', owned_by: 'groq' },
        { id: 'old-model', deprecated: true, object: 'model', owned_by: 'groq' },
        { id: 'inactive-model', active: false, object: 'model', owned_by: 'groq' },
      ],
    });

  const models = await listGroqModels({ apiKey: 'gsk_test' });
  assert.deepEqual(models.map((m) => m.id), ['llama-3.3-70b-versatile']);
});
