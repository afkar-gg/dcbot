function computeAiChatTimeoutMs({
  aiCallTimeoutMs,
  editIntent = false,
  hasAttachmentContext = false,
  hasWebContext = false,
  isLightChat = false,
} = {}) {
  const baseTimeout = Math.max(1_000, Number(aiCallTimeoutMs) || 0);

  if (editIntent || hasAttachmentContext || hasWebContext) {
    return Math.max(baseTimeout, 45_000);
  }

  if (isLightChat) {
    return Math.max(baseTimeout, 30_000);
  }

  return baseTimeout;
}

module.exports = {
  computeAiChatTimeoutMs,
};
