function shouldIncludeAuthorFactsTarget({
  enabled,
  wantsMemberFacts,
  askedMemberTargets,
}) {
  if (!enabled || !wantsMemberFacts) return false;
  if (!Array.isArray(askedMemberTargets) || askedMemberTargets.length === 0) return false;

  const hasResolvableTarget = askedMemberTargets.some((target) => {
    const id = String(target?.id || '').trim();
    return id.length > 0;
  });

  return hasResolvableTarget;
}

module.exports = {
  shouldIncludeAuthorFactsTarget,
};
