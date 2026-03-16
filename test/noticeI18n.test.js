const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectReplyLanguage,
  getLocalizedAttachmentNotice,
  normalizeLocale,
} = require('../src/ai/noticeI18n');

test('detects Indonesian from user text', () => {
  const locale = detectReplyLanguage({ messageText: 'tolong cek lampiran ini dong' });
  assert.equal(locale, 'id');
});

test('uses reply context to force Indonesian for slang', () => {
  const locale = detectReplyLanguage({
    messageText: 'jirla',
    repliedText: 'ya gitu kok aneh banget',
  });
  assert.equal(locale, 'id');
});

test('detects Spanish from user text', () => {
  const locale = detectReplyLanguage({ messageText: 'por favor revisa este archivo adjunto' });
  assert.equal(locale, 'es');
});

test('defaults to english when language is unknown', () => {
  const locale = detectReplyLanguage({ messageText: 'blorp zarg fnarx' });
  assert.equal(locale, 'en');
});

test('returns localized unsupported media notice', () => {
  const text = getLocalizedAttachmentNotice('media_unsupported', 'id');
  assert.equal(text.includes('belum didukung') || text.includes('tidak didukung'), true);
});

test('normalizes locale and falls back to english', () => {
  assert.equal(normalizeLocale('es-MX'), 'es');
  const text = getLocalizedAttachmentNotice('attachments_disabled', 'xx');
  assert.equal(typeof text, 'string');
  assert.equal(text.length > 0, true);
});
