function normalizeAllowedUserIds(userIds = []) {
  if (!Array.isArray(userIds)) return new Set();
  return new Set(
    userIds
      .map((id) => String(id || '').trim())
      .filter((id) => /^\d{5,}$/.test(id))
  );
}

function neutralizeMentions(text, { allowUserIds = [] } = {}) {
  if (!text) return '';
  const allowedUsers = normalizeAllowedUserIds(allowUserIds);

  // Prevent actual pings in embeds/logs by inserting a zero-width char.
  // This keeps the text readable but stops Discord from parsing it as a mention.
  return String(text)
    .replace(/@everyone/gi, '@\u200beveryone')
    .replace(/@here/gi, '@\u200bhere')
    .replace(/<@&(\d+)>/g, '<@&\u200b$1>')
    .replace(/<@!?(\d+)>/g, (_m, id) => {
      const userId = String(id || '');
      if (allowedUsers.has(userId)) return `<@${userId}>`;
      return `<@\u200b${userId}>`;
    });
}

module.exports = {
  neutralizeMentions,
};
