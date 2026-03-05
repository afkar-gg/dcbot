const test = require('node:test');
const assert = require('node:assert/strict');

const { isDmChatTrigger } = require('../src/ai/triggerDetector');

function buildMessage({
  guild = null,
  channelType = 1,
  content = 'hello',
  authorBot = false,
} = {}) {
  return {
    guild,
    channel: { type: channelType },
    content,
    author: { bot: authorBot },
  };
}

test('dm trigger fires for user dm messages without prefix', () => {
  const message = buildMessage({ channelType: 1, content: 'yo' });
  assert.equal(isDmChatTrigger({ message, prefix: 's.' }), true);
});

test('dm trigger does not fire for prefixed messages', () => {
  const message = buildMessage({ channelType: 1, content: 's.help' });
  assert.equal(isDmChatTrigger({ message, prefix: 's.' }), false);
});

test('dm trigger includes group dms', () => {
  const message = buildMessage({ channelType: 3, content: 'what up' });
  assert.equal(isDmChatTrigger({ message, prefix: 's.' }), true);
});

test('dm trigger does not fire in guild channels', () => {
  const message = buildMessage({
    guild: { id: '123' },
    channelType: 0,
    content: 'hello',
  });
  assert.equal(isDmChatTrigger({ message, prefix: 's.' }), false);
});

test('dm trigger does not fire for bot authors', () => {
  const message = buildMessage({ authorBot: true, content: 'hello' });
  assert.equal(isDmChatTrigger({ message, prefix: 's.' }), false);
});
