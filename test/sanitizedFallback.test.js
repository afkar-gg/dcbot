const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSanitizedFallbackText } = require('../src/ai/sanitizedFallback');

test('uses member facts fallback when leak reason exists and member intent is true', () => {
  const text = buildSanitizedFallbackText({
    reasons: ['member-facts-leak'],
    wantsMemberFacts: true,
    memberFactsFallback: 'alex (id 123456789012345678)',
    fallbackText: 'default fallback',
  });

  assert.equal(text, 'alex (id 123456789012345678)');
});

test('uses generic safe fallback when leak reason exists but no member intent', () => {
  const text = buildSanitizedFallbackText({
    reasons: ['prompt-leak', 'member-facts-leak'],
    wantsMemberFacts: false,
    memberFactsFallback: 'alex (id 123456789012345678)',
    fallbackText: 'default fallback',
  });

  assert.equal(text, 'i cant share member metadata unless u asked for member info');
});

test('uses default fallback when member leak reason is absent', () => {
  const text = buildSanitizedFallbackText({
    reasons: ['prompt-leak'],
    wantsMemberFacts: false,
    memberFactsFallback: 'unused',
    fallbackText: 'default fallback',
  });

  assert.equal(text, 'cant show internal context, rephrase that');
});
