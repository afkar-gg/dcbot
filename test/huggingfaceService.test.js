const test = require('node:test');
const assert = require('node:assert/strict');

const {
  huggingfaceChatCompletion,
  huggingfaceImageOcr,
  listHuggingFaceModels,
} = require('../src/services/huggingfaceService');

function makeJsonResponse(body, status = 200, headers = {}) {
  const raw = JSON.stringify(body);
  const headerMap = new Map(
    Object.entries(headers).map(([key, value]) => [String(key || '').toLowerCase(), String(value || '')])
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => raw,
    headers: {
      get(name) {
        return headerMap.get(String(name || '').toLowerCase()) || null;
      },
    },
  };
}

let originalFetch;

test.beforeEach(() => {
  originalFetch = global.fetch;
});

test.afterEach(() => {
  global.fetch = originalFetch;
});

test('huggingfaceChatCompletion parses array content', async () => {
  global.fetch = async () =>
    makeJsonResponse({
      choices: [
        {
          message: {
            content: [{ type: 'text', text: 'hello from hf' }],
          },
        },
      ],
    });

  const text = await huggingfaceChatCompletion({
    apiKey: 'hf_abcdefghijklmnopqrstuvwxyz1234',
    model: 'meta-llama/Llama-3.3-70B-Instruct',
    messages: [{ role: 'user', content: 'hi' }],
  });

  assert.equal(text, 'hello from hf');
});

test('huggingfaceChatCompletion disables thinking for kimi models', async () => {
  let capturedBody = null;
  global.fetch = async (_url, init = {}) => {
    capturedBody = JSON.parse(String(init.body || '{}'));
    return makeJsonResponse({
      choices: [
        {
          message: {
            content: 'ok',
          },
        },
      ],
    });
  };

  const text = await huggingfaceChatCompletion({
    apiKey: 'hf_abcdefghijklmnopqrstuvwxyz1234',
    model: 'moonshotai/Kimi-K2.5',
    messages: [{ role: 'user', content: 'hi' }],
  });

  assert.equal(text, 'ok');
  assert.deepEqual(capturedBody?.thinking, { type: 'disabled' });
});

test('huggingfaceChatCompletion ignores non-text content parts', async () => {
  global.fetch = async () =>
    makeJsonResponse({
      choices: [
        {
          message: {
            content: [
              { type: 'reasoning', content: 'step-by-step internal reasoning' },
              { type: 'text', text: 'final answer only' },
            ],
            reasoning_content: 'do not show this',
          },
        },
      ],
    });

  const text = await huggingfaceChatCompletion({
    apiKey: 'hf_abcdefghijklmnopqrstuvwxyz1234',
    model: 'moonshotai/Kimi-K2-Instruct',
    messages: [{ role: 'user', content: 'hi' }],
  });

  assert.equal(text, 'final answer only');
});

test('huggingfaceImageOcr surfaces retryAfterMs on 429', async () => {
  global.fetch = async () =>
    makeJsonResponse({ error: 'rate limited' }, 429, { 'retry-after': '2' });

  await assert.rejects(
    () =>
      huggingfaceImageOcr({
        apiKey: 'hf_abcdefghijklmnopqrstuvwxyz1234',
        imageBuffer: Buffer.from('abc'),
      }),
    (err) => {
      assert.equal(err?.status, 429);
      assert.equal(Number(err?.retryAfterMs) >= 2000, true);
      return true;
    }
  );
});

test('listHuggingFaceModels returns model ids', async () => {
  global.fetch = async () =>
    makeJsonResponse([
      { id: 'model-a' },
      { id: 'model-b' },
    ]);

  const models = await listHuggingFaceModels({
    apiKey: 'hf_abcdefghijklmnopqrstuvwxyz1234',
    limit: 10,
  });

  assert.deepEqual(models, ['model-a', 'model-b']);
});
