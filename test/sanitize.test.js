const test = require('node:test');
const assert = require('node:assert/strict');

const { neutralizeMentions } = require('../src/utils/sanitize');

test('neutralizeMentions blocks everyone/here/role/user mentions by default', () => {
  const input = '@everyone @here <@&123> <@456>';
  const out = neutralizeMentions(input);
  assert.equal(out.includes('@\u200beveryone'), true);
  assert.equal(out.includes('@\u200bhere'), true);
  assert.equal(out.includes('<@&\u200b123>'), true);
  assert.equal(out.includes('<@\u200b456>'), true);
});

test('neutralizeMentions preserves explicitly allowed user mentions', () => {
  const input = 'yo <@123456789012345678> and <@999999999999999999>';
  const out = neutralizeMentions(input, { allowUserIds: ['123456789012345678'] });
  assert.equal(out.includes('<@123456789012345678>'), true);
  assert.equal(out.includes('<@\u200b999999999999999999>'), true);
});
