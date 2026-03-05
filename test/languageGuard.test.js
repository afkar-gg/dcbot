const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isLikelyEnglishText,
  shouldRetryForLocaleMismatch,
} = require('../src/ai/languageGuard');

test('detects likely english output', () => {
  assert.equal(isLikelyEnglishText('i can help you with that right now'), true);
});

test('does not classify japanese text as english', () => {
  assert.equal(isLikelyEnglishText('こんにちは それはできます'), false);
});

test('retries when expected locale is japanese but output is english', () => {
  const shouldRetry = shouldRetryForLocaleMismatch({
    expectedLocale: 'ja',
    userText: '日本語で話して',
    outputText: 'i can help with that',
  });
  assert.equal(shouldRetry, true);
});

test('retries when user wrote indonesian but model answered in english', () => {
  const shouldRetry = shouldRetryForLocaleMismatch({
    expectedLocale: 'id',
    userText: 'tolong bantu aku cek ini',
    outputText: 'i can check that for you',
  });
  assert.equal(shouldRetry, true);
});

test('does not retry when locale is english', () => {
  const shouldRetry = shouldRetryForLocaleMismatch({
    expectedLocale: 'en',
    userText: 'help me',
    outputText: 'sure i can help',
  });
  assert.equal(shouldRetry, false);
});
