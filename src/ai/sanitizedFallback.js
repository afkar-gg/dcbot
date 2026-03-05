function hasReason(reasons, reason) {
  if (!Array.isArray(reasons) || !reason) return false;
  return reasons.map((item) => String(item || '').trim().toLowerCase()).includes(String(reason).toLowerCase());
}

function pickReasonFallback(reasons = []) {
  if (hasReason(reasons, 'member-facts-leak')) return 'i can only share member info if you @mention them or drop an id';
  if (hasReason(reasons, 'prompt-leak')) return 'cant show internal context, rephrase that';
  if (hasReason(reasons, 'reasoning')) return 'cant share internal reasoning, ask it another way';
  if (hasReason(reasons, 'gibberish')) return 'that came out scuffed, say it again';
  if (hasReason(reasons, 'empty')) return 'didnt get that, say it again';
  return '';
}

function buildSanitizedFallbackText({
  reasons = [],
  wantsMemberFacts = false,
  memberFactsFallback = '',
  fallbackText = '',
} = {}) {
  const hasMemberFactsLeak = hasReason(reasons, 'member-facts-leak');

  if (hasMemberFactsLeak && wantsMemberFacts) {
    const safeMemberFallback = String(memberFactsFallback || '').trim();
    if (safeMemberFallback) return safeMemberFallback;
  }

  if (hasMemberFactsLeak) {
    return 'i cant share member metadata unless u asked for member info';
  }

  const reasonFallback = pickReasonFallback(reasons);
  if (reasonFallback) return reasonFallback;

  const defaultFallback = String(fallbackText || '').trim();
  return defaultFallback || 'i glitched lol say it again';
}

module.exports = {
  buildSanitizedFallbackText,
};
