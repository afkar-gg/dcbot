const test = require('node:test');
const assert = require('node:assert/strict');

const { createLoadstringStore } = require('../src/services/loadstringApiStore');

let originalFetch;

test.beforeEach(() => {
  originalFetch = global.fetch;
});

test.afterEach(() => {
  global.fetch = originalFetch;
});

function makeJsonResponse(body, status = 200) {
  const raw = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => raw,
  };
}

test('lists loadstrings through internal api', async () => {
  global.fetch = async (url) => {
    assert.equal(String(url).includes('/internal/loadstrings?ownerUserId=123'), true);
    return makeJsonResponse({ rows: [{ scriptSlug: 'abc' }] });
  };

  const store = createLoadstringStore();
  const rows = await store.listLoadstringsForUser('123');
  assert.equal(Array.isArray(rows), true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].scriptSlug, 'abc');
});

test('maps limit reached conflict to LOADSTRING_LIMIT_REACHED', async () => {
  global.fetch = async () => makeJsonResponse({ error: 'maximum reached', code: 'LOADSTRING_LIMIT_REACHED' }, 409);

  const store = createLoadstringStore();
  await assert.rejects(
    () => store.upsertLoadstring({ ownerUserId: '1', ownerUsername: 'u', scriptName: 's', content: 'x' }),
    (err) => {
      assert.equal(err?.code, 'LOADSTRING_LIMIT_REACHED');
      return true;
    }
  );
});
