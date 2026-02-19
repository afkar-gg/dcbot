async function sendAiReplyGuaranteed({
  content,
  sendPrimary,
  sendFallback,
  fallbackText = 'i glitched lol say it again',
  forceVisibleReply = true,
} = {}) {
  let primary;
  try {
    primary = await sendPrimary(content);
  } catch (e) {
    primary = {
      sent: false,
      reviewed: false,
      error: e?.message || 'send failed',
    };
  }

  if (primary?.sent) {
    return {
      sent: true,
      mode: 'primary',
      primary,
      fallbackMessage: null,
    };
  }

  if (!forceVisibleReply || typeof sendFallback !== 'function') {
    return {
      sent: false,
      mode: 'none',
      primary,
      fallbackMessage: null,
      finalError: primary?.error || 'not-sent',
    };
  }

  let fallbackContent = String(fallbackText || '').trim() || 'i glitched lol say it again';

  if (primary?.reviewed && !primary?.sent) {
    fallbackContent = primary.error
      ? `cant send that rn ${primary.error}`
      : 'mods gotta ok that first its in the log channel';
  } else if (primary?.error) {
    fallbackContent = `cant send rn ${primary.error}`;
  }

  let fallbackMessage = null;
  try {
    fallbackMessage = await sendFallback(fallbackContent);
  } catch {
    fallbackMessage = null;
  }

  return {
    sent: !!fallbackMessage,
    mode: fallbackMessage ? 'fallback' : 'failed',
    primary,
    fallbackMessage,
    finalError: fallbackMessage ? null : primary?.error || 'fallback-failed',
  };
}

module.exports = {
  sendAiReplyGuaranteed,
};
