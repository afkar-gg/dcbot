function toPositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function createReplyTargetTracker({ maxIds = 5000, ttlMs = 6 * 60 * 60 * 1000 } = {}) {
  const entries = new Map();
  const limit = toPositiveInt(maxIds, 5000);
  const ttl = toPositiveInt(ttlMs, 6 * 60 * 60 * 1000);

  function prune(now = Date.now()) {
    for (const [id, info] of entries.entries()) {
      const createdAt = Number(info?.createdAt || 0);
      if (!createdAt || now - createdAt > ttl) {
        entries.delete(id);
      }
    }

    while (entries.size > limit) {
      const first = entries.keys().next();
      if (first.done) break;
      entries.delete(first.value);
    }
  }

  function markBotMessageSent(messageId, meta = {}) {
    const id = String(messageId || '').trim();
    if (!id) return false;

    const now = Date.now();
    entries.set(id, {
      createdAt: now,
      source: meta?.source ? String(meta.source) : 'unknown',
    });

    prune(now);
    return true;
  }

  function has(messageId) {
    const id = String(messageId || '').trim();
    if (!id) return false;

    const entry = entries.get(id);
    if (!entry) return false;

    const createdAt = Number(entry.createdAt || 0);
    if (!createdAt || Date.now() - createdAt > ttl) {
      entries.delete(id);
      return false;
    }

    return true;
  }

  function getStats() {
    return {
      size: entries.size,
      maxIds: limit,
      ttlMs: ttl,
    };
  }

  return {
    markBotMessageSent,
    has,
    prune,
    getStats,
  };
}

module.exports = {
  createReplyTargetTracker,
};
