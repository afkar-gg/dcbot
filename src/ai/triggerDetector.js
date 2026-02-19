async function detectAiTrigger({
  message,
  clientUserId,
  tracker,
  fetchReferenceMessage,
  detectDangerousMentions,
  hasMediaAttachment,
  randomProbability = 0.02,
  randomFn = Math.random,
} = {}) {
  if (!message || !clientUserId) {
    return {
      shouldTrigger: false,
      isMention: false,
      isReplyToBot: false,
      isRandomTrigger: false,
      repliedMessage: null,
      replyToMessageId: null,
      reason: 'invalid',
      replySource: null,
    };
  }

  const isMention = !!message.mentions?.has?.(clientUserId);

  const replyToMessageId = message.reference?.messageId ? String(message.reference.messageId) : null;
  let repliedMessage = null;
  let isReplyToBot = false;
  let replySource = null;

  if (replyToMessageId && tracker?.has?.(replyToMessageId)) {
    isReplyToBot = true;
    replySource = 'tracker';
  }

  if (replyToMessageId && !isReplyToBot && typeof fetchReferenceMessage === 'function') {
    repliedMessage = await fetchReferenceMessage(message).catch(() => null);
    if (repliedMessage?.author?.id && String(repliedMessage.author.id) === String(clientUserId)) {
      isReplyToBot = true;
      replySource = 'fetch';
    }
  }

  const randomBlockedByMentions = !!detectDangerousMentions?.(message.content)?.dangerous;
  const randomBlockedByMedia = !!hasMediaAttachment?.(message);
  const canRandom = !isMention && !isReplyToBot && !randomBlockedByMentions && !randomBlockedByMedia;
  const isRandomTrigger = canRandom && Number(randomFn()) < Number(randomProbability || 0);

  return {
    shouldTrigger: isMention || isReplyToBot || isRandomTrigger,
    isMention,
    isReplyToBot,
    isRandomTrigger,
    repliedMessage,
    replyToMessageId,
    reason: isMention ? 'mention' : isReplyToBot ? 'reply' : isRandomTrigger ? 'random' : 'none',
    replySource,
  };
}

module.exports = {
  detectAiTrigger,
};
