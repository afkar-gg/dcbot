function neutralizeMentions(text) {
  if (!text) return '';

  // Prevent actual pings in embeds/logs by inserting a zero-width char.
  // This keeps the text readable but stops Discord from parsing it as a mention.
  return String(text)
    .replace(/@everyone/gi, '@\u200beveryone')
    .replace(/@here/gi, '@\u200bhere')
    .replace(/<@&(\d+)>/g, '<@&\u200b$1>')
    .replace(/<@!?(\d+)>/g, '<@\u200b$1>');
}

module.exports = {
  neutralizeMentions,
};
