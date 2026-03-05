const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizeAiOutput,
  analyzeAiOutput,
  stripLeakedPromptLines,
  looksLikeMemberFactsLeak,
} = require('../src/ai/outputGuard');

test('blocks leaked member identity line with id and tag', () => {
  const input = 'alex (id 123456789012345678) | tag alex_4321';
  const result = sanitizeAiOutput(input);

  assert.equal(result.text, '');
  assert.equal(looksLikeMemberFactsLeak(input), true);
  assert.equal(result.analysis.reasons.includes('member-facts-leak'), true);
});

test('blocks leaked member facts role/perms line', () => {
  const input =
    '- alex (id 123456789012345678) | tag alex_4321: roles mod; perms admin yes, manage guild no';
  const analysis = analyzeAiOutput(input);

  assert.equal(analysis.flags.memberFactsLeak, true);
  assert.equal(analysis.reasons.includes('member-facts-leak'), true);
});

test('keeps normal sentence that mentions user id without leak shape', () => {
  const input = 'your user id is 123456789012345678 if you need it';
  const result = sanitizeAiOutput(input);

  assert.equal(result.text, input);
  assert.equal(result.analysis.reasons.includes('member-facts-leak'), false);
});

test('strips leaked member facts line from mixed multi-line output', () => {
  const input = [
    'sure, here you go',
    'alex (id 123456789012345678) | tag alex_4321',
    'ask me anything else',
  ].join('\n');

  const stripped = stripLeakedPromptLines(input);
  assert.equal(stripped, 'sure, here you go\nask me anything else');
});
