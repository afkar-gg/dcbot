const test = require('node:test');
const assert = require('node:assert/strict');

const { getExactQuickReply } = require('../src/ai/quickReplies');

test('returns gurt for exact yo', () => {
  assert.equal(getExactQuickReply('yo'), 'gurt');
  assert.equal(getExactQuickReply('  Yo  '), 'gurt');
});

test('does not trigger for non-exact yo variants', () => {
  assert.equal(getExactQuickReply('yoo'), '');
  assert.equal(getExactQuickReply('yo bro'), '');
  assert.equal(getExactQuickReply('hello'), '');
});
