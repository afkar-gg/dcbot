const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeDynamicTemperature,
  buildAiSystemPrompt,
  buildLanguageLockSystemPrompt,
} = require('../src/ai/aiPipeline');

test('uses low band for simple short message', () => {
  const temperature = computeDynamicTemperature({
    messageText: 'yo',
    isRandomTrigger: false,
    editIntent: false,
    hasAttachments: false,
  });

  assert.equal(temperature, 0.5);
});

test('uses medium band for moderately complex message', () => {
  const temperature = computeDynamicTemperature({
    messageText: 'compare these two approaches and list pros and cons, then give a final recommendation?',
    isRandomTrigger: false,
    editIntent: false,
    hasAttachments: false,
  });

  assert.equal(temperature, 0.68);
});

test('uses high band for complex multi-step technical message', () => {
  const temperature = computeDynamicTemperature({
    messageText: [
      'I have a service failing in production with intermittent retries.',
      '1) analyze this stack trace and error flow.',
      '2) compare root cause candidates.',
      '3) provide a step-by-step fix plan and rollback path.',
      'Stack trace includes timeout => fetch() and nested async errors in middleware.',
    ].join('\n'),
    isRandomTrigger: false,
    editIntent: false,
    hasAttachments: false,
  });

  assert.equal(temperature, 0.86);
});

test('edit intent always returns deterministic low temperature', () => {
  const temperature = computeDynamicTemperature({
    messageText: 'rewrite and refactor this full module with many changes',
    isRandomTrigger: false,
    editIntent: true,
    hasAttachments: false,
  });

  assert.equal(temperature, 0.35);
});

test('creative intent overrides complexity and returns high creativity temperature', () => {
  const temperature = computeDynamicTemperature({
    messageText: 'write a joke about databases',
    isRandomTrigger: false,
    editIntent: false,
    hasAttachments: false,
  });

  assert.equal(temperature, 0.95);
});

test('random trigger always returns max temperature', () => {
  const temperature = computeDynamicTemperature({
    messageText: 'hello there',
    isRandomTrigger: true,
    editIntent: false,
    hasAttachments: false,
  });

  assert.equal(temperature, 1.0);
});

test('attachments clamp complexity-driven temperature', () => {
  const temperature = computeDynamicTemperature({
    messageText: [
      'I have a service failing in production with intermittent retries.',
      '1) analyze this stack trace and error flow.',
      '2) compare root cause candidates.',
      '3) provide a step-by-step fix plan and rollback path.',
      'Stack trace includes timeout => fetch() and nested async errors in middleware.',
    ].join('\n'),
    isRandomTrigger: false,
    editIntent: false,
    hasAttachments: true,
  });

  assert.equal(temperature, 0.78);
});

test('technical fix intent keeps temperature in stable low range', () => {
  const temperature = computeDynamicTemperature({
    messageText: 'help me debug this error stack and fix the bug quickly',
    isRandomTrigger: false,
    editIntent: false,
    hasAttachments: false,
  });

  assert.equal(temperature <= 0.58, true);
});

test('empty input returns medium-safe default band', () => {
  const temperature = computeDynamicTemperature({
    messageText: '   ',
    isRandomTrigger: false,
    editIntent: false,
    hasAttachments: false,
  });

  assert.equal(temperature, 0.68);
});

test('system prompt injects detected language runtime rules', () => {
  const prompt = buildAiSystemPrompt({
    botName: 'Goose',
    botDisplayName: 'Goose',
    botUsernameTag: 'Goose#9289',
    currentDateTime: null,
    preferredReplyLocale: 'id',
  });

  assert.equal(prompt.includes('detected user language is Indonesian (id)'), true);
  assert.equal(prompt.includes('reply in Indonesian (id)'), true);
});

test('language lock appends strict locale instructions for non-english locale', () => {
  const locked = buildLanguageLockSystemPrompt('base', 'es');
  assert.equal(locked.includes('LANGUAGE LOCK'), true);
  assert.equal(locked.includes('Spanish (es)'), true);
});
