function normalizeQuickText(text = '') {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getExactQuickReply(text = '') {
  const normalized = normalizeQuickText(text);
  if (normalized === 'yo') return 'gurt';
  return '';
}

module.exports = {
  normalizeQuickText,
  getExactQuickReply,
};
