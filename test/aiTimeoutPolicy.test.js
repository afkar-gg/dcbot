const test = require('node:test');
const assert = require('node:assert/strict');

const { computeAiChatTimeoutMs } = require('../src/ai/timeoutPolicy');

test('light chat gets a 30s minimum timeout budget', () => {
  const timeoutMs = computeAiChatTimeoutMs({
    aiCallTimeoutMs: 25_000,
    isLightChat: true,
  });

  assert.equal(timeoutMs, 30_000);
});

test('light chat keeps higher configured timeout above 30s', () => {
  const timeoutMs = computeAiChatTimeoutMs({
    aiCallTimeoutMs: 45_000,
    isLightChat: true,
  });

  assert.equal(timeoutMs, 45_000);
});

test('normal chat keeps base timeout', () => {
  const timeoutMs = computeAiChatTimeoutMs({
    aiCallTimeoutMs: 25_000,
    isLightChat: false,
  });

  assert.equal(timeoutMs, 25_000);
});

test('attachment/edit/web context keeps heavy minimum budget', () => {
  const timeoutMs = computeAiChatTimeoutMs({
    aiCallTimeoutMs: 25_000,
    hasWebContext: true,
  });

  assert.equal(timeoutMs, 45_000);
});
