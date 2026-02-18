function parseDurationToMs(input) {
  // Supports: 30m, 24h, 7d, 7days, 1w, 90min, 2hrs, 1d12h, "1 day 2 hours", etc.
  if (!input) return null;
  const raw = String(input).trim().toLowerCase();
  if (!raw) return null;

  // IMPORTANT: order matters (longer tokens first) so `90min` doesn't get parsed as `90m` + leftover `in`.
  const tokenRe = /(\d+(?:\.\d+)?)\s*(weeks|week|w|days|day|d|hours|hour|hrs|hr|h|minutes|minute|mins|min|m|seconds|second|secs|sec|s)/g;

  let totalMs = 0;
  let matchCount = 0;
  let m;
  while ((m = tokenRe.exec(raw)) !== null) {
    matchCount += 1;
    const value = Number(m[1]);
    if (!Number.isFinite(value) || value < 0) return null;
    const unit = m[2];

    const mult =
      unit === 'w' || unit === 'week' || unit === 'weeks'
        ? 7 * 24 * 60 * 60 * 1000
        : unit === 'd' || unit === 'day' || unit === 'days'
          ? 24 * 60 * 60 * 1000
          : unit === 'h' || unit === 'hr' || unit === 'hrs' || unit === 'hour' || unit === 'hours'
            ? 60 * 60 * 1000
            : unit === 'm' || unit === 'min' || unit === 'mins' || unit === 'minute' || unit === 'minutes'
              ? 60 * 1000
              : 1000;

    totalMs += value * mult;
  }

  if (matchCount === 0) return null;

  // Ensure the input contained only valid tokens (plus whitespace)
  const rest = raw
    .replace(new RegExp(tokenRe.source, 'g'), '')
    .replace(/\s+/g, '');
  if (rest.length > 0) return null;

  return Math.round(totalMs);
}

function parseDurationToSeconds(input) {
  const ms = parseDurationToMs(input);
  if (ms == null) return null;
  return Math.floor(ms / 1000);
}

function normalizeBanDeleteSeconds(seconds) {
  // Discord max is 7 days (604800 seconds)
  if (seconds == null) return null;
  if (seconds < 0) return null;
  if (seconds > 7 * 24 * 60 * 60) return null;
  return seconds;
}

function formatDuration(ms) {
  if (ms == null) return 'N/A';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function buildCurrentDateTimeContext({ timeZone = 'UTC', locale = 'en-US' } = {}) {
  const now = new Date();
  const fallbackZone = 'UTC';
  let zone = String(timeZone || '').trim() || fallbackZone;

  const baseDateOptions = {
    timeZone: zone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
  };

  const baseTimeOptions = {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  };

  let dateOnly;
  let timeOnly;
  try {
    dateOnly = new Intl.DateTimeFormat(locale, baseDateOptions).format(now);
    timeOnly = new Intl.DateTimeFormat(locale, baseTimeOptions).format(now);
  } catch {
    zone = fallbackZone;
    dateOnly = new Intl.DateTimeFormat(locale, { ...baseDateOptions, timeZone: zone }).format(now);
    timeOnly = new Intl.DateTimeFormat(locale, { ...baseTimeOptions, timeZone: zone }).format(now);
  }

  return {
    isoUtc: now.toISOString(),
    unixMs: now.getTime(),
    unixSeconds: Math.floor(now.getTime() / 1000),
    timeZone: zone,
    dateOnly,
    timeOnly,
    localText: `${dateOnly} ${timeOnly}`,
  };
}

module.exports = {
  parseDurationToMs,
  parseDurationToSeconds,
  normalizeBanDeleteSeconds,
  formatDuration,
  buildCurrentDateTimeContext,
};
