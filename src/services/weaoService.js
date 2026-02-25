const {
  WEAO_BASE_URL,
  WEAO_USER_AGENT,
  WEAO_TIMEOUT_MS,
  WEAO_MAX_MATCHES,
} = require('./runtimeConfig');

const EXECUTOR_TERMS = [
  'executor', 'executors', 'exploit', 'exploits', 'unc', 'sunc', 'hyperion',
  'detected', 'undetected', 'keysystem', 'keyless',
  'weao', 'weao api', 'tracker', 'status api', 'live status', 'executor status', 'exploit status',
  // status fields / ban-related terms
  'clientmods', 'client mod', 'client mods', 'client modification', 'banwave', 'ban wave',
  // common executor names (some are generic words)
  'solara', 'wave', 'delta', 'codex', 'hydrogen', 'xeno', 'swift', 'velocity',
  'potassium', 'sirhurt', 'seliware', 'macsploit', 'vegax', 'krnl', 'cryptic',
  'volcano', 'volt', 'bunni', 'nucleus', 'synapse', 'ronin', 'photon', 'matcha',
  'rbxcli', 'severe',
];

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsWholeWord(haystack, needle) {
  if (!haystack || !needle) return false;
  const re = new RegExp(`\\b${escapeRegex(needle)}\\b`, 'i');
  return re.test(haystack);
}

function includesExecutorTerm(normalizedText, term) {
  const t = normalizeText(term);
  if (!normalizedText || !t) return false;
  // Phrases (with spaces) are matched as simple substrings after normalizeText collapses whitespace.
  if (t.includes(' ')) return normalizedText.includes(t);
  return containsWholeWord(normalizedText, t);
}

function extractYear(updatedDateText) {
  const text = String(updatedDateText || '');
  const match = text.match(/\b(20\d{2})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function isDiscontinuedByYear(updatedDateText) {
  const year = extractYear(updatedDateText);
  return Number.isFinite(year) && year <= 2025;
}

function normalizeExecutorType(extype, platform) {
  const type = normalizeText(extype);
  if (type === 'wexecutor') return 'windows internal';
  if (type === 'wexternal') return 'windows external';
  if (type === 'aexecutor') return 'android';
  if (type === 'mexecutor') return 'mac';
  if (type === 'iexecutor') return 'ios';
  if (type) return type;
  return normalizeText(platform) || 'unknown';
}

function executorTypeRank(extype) {
  const type = normalizeText(extype);
  if (type === 'wexecutor') return 0;
  if (type === 'wexternal') return 1;
  return 2;
}

function isExecutorQuestion(text) {
  const q = normalizeText(text);
  if (!q) return false;
  if (/\b(?:executor|executors|exploit|exploits)\b/.test(q)) return true;
  if (/\b(?:weao|tracker)\b/.test(q)) return true;
  if (/weao\.xyz/.test(q)) return true;
  if (/\b(?:status(?:\s+api)?|live\s+status)\b/.test(q) && /\b(?:executor|executors|exploit|exploits)\b/.test(q)) {
    return true;
  }
  return EXECUTOR_TERMS.some((term) => includesExecutorTerm(q, term));
}

function pickBestUrl(entry) {
  const candidates = [entry?.websitelink, entry?.discordlink, entry?.purchaselink];
  for (const candidate of candidates) {
    const url = String(candidate || '').trim();
    if (url) return url;
  }
  return '';
}

function normalizeExploit(entry) {
  const updatedDate = String(entry?.updatedDate || '').trim();
  return {
    title: String(entry?.title || '').trim(),
    version: String(entry?.version || '').trim(),
    platform: String(entry?.platform || '').trim(),
    extype: String(entry?.extype || '').trim().toLowerCase(),
    updated: !!entry?.updateStatus,
    detected: !!entry?.detected,
    free: !!entry?.free,
    clientmods: !!entry?.clientmods,
    unc: Number.isFinite(Number(entry?.uncPercentage)) ? Number(entry.uncPercentage) : null,
    sunc: Number.isFinite(Number(entry?.suncPercentage)) ? Number(entry.suncPercentage) : null,
    updatedDate,
    discontinued: isDiscontinuedByYear(updatedDate),
    executorType: normalizeExecutorType(entry?.extype, entry?.platform),
    url: pickBestUrl(entry),
    discord: String(entry?.discordlink || '').trim(),
  };
}

async function fetchAllExploits() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEAO_TIMEOUT_MS);
  try {
    const res = await fetch(`${WEAO_BASE_URL}/api/status/exploits`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': WEAO_USER_AGENT,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`WEAO HTTP ${res.status} ${body.slice(0, 220)}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('WEAO payload is not an array');

    return data
      .map(normalizeExploit)
      .filter((row) => row.title);
  } finally {
    clearTimeout(timeoutId);
  }
}

function scoreExploit(exploit, queryText) {
  const q = normalizeText(queryText);
  if (!q) return 0;

  const title = normalizeText(exploit.title);
  let score = 0;

  if (title) {
    const titleMatch = title.includes(' ')
      ? q.includes(title)
      : containsWholeWord(q, title);
    if (titleMatch) score += 120;
  }

  const titleTokens = title.split(/[^a-z0-9]+/).filter((part) => part.length >= 4);
  for (const token of titleTokens) {
    if (containsWholeWord(q, token)) score += 18;
  }

  if (exploit.platform) {
    const platform = normalizeText(exploit.platform);
    const platformMatch = platform.includes(' ')
      ? q.includes(platform)
      : containsWholeWord(q, platform);
    if (platformMatch) score += 8;
  }

  if (containsWholeWord(q, 'internal') && exploit.extype === 'wexecutor') score += 20;
  if (containsWholeWord(q, 'external') && exploit.extype === 'wexternal') score += 20;
  if (containsWholeWord(q, 'wexecutor') && exploit.extype === 'wexecutor') score += 20;
  if (containsWholeWord(q, 'wexternal') && exploit.extype === 'wexternal') score += 20;
  if (containsWholeWord(q, 'free') && exploit.free) score += 6;
  if ((containsWholeWord(q, 'paid') || containsWholeWord(q, 'premium')) && !exploit.free) score += 6;
  if (containsWholeWord(q, 'detected') && exploit.detected) score += 8;
  if (containsWholeWord(q, 'undetected') && !exploit.detected) score += 8;
  if (containsWholeWord(q, 'updated') && exploit.updated) score += 8;
  if ((containsWholeWord(q, 'outdated') || q.includes('not updated')) && !exploit.updated) score += 8;
  if (containsWholeWord(q, 'unc') && exploit.unc != null) score += 4;
  if (containsWholeWord(q, 'sunc') && exploit.sunc != null) score += 4;

  const wantsClientmods = includesExecutorTerm(q, 'clientmods') || includesExecutorTerm(q, 'client mod');
  if (wantsClientmods && exploit.clientmods) score += 12;

  if (exploit.updated) score += 1;
  if (exploit.extype === 'wexecutor') score += 0.3;
  return score;
}

function formatEntry(entry, index) {
  const unc = entry.unc == null ? 'n/a' : `${entry.unc}%`;
  const sunc = entry.sunc == null ? 'n/a' : `${entry.sunc}%`;
  const platform = entry.platform || 'Unknown';
  const version = entry.version || 'n/a';
  const url = entry.url || entry.discord || 'n/a';
  const lifecycle = entry.discontinued ? 'discontinued' : entry.updated ? 'active' : 'stale';
  const clientmods = entry.clientmods ? 'yes' : 'no';

  return `${index + 1}. ${entry.title} | ${entry.executorType} | ${platform} | v${version} | status ${lifecycle} | updated ${entry.updated ? 'yes' : 'no'} | detected ${entry.detected ? 'yes' : 'no'} | clientmods ${clientmods} | ${entry.free ? 'free' : 'paid'} | UNC ${unc} | sUNC ${sunc} | ${entry.updatedDate || 'n/a'} | ${url}`;
}

function buildExecutorTrackerSummary(exploits, queryText, maxMatches = WEAO_MAX_MATCHES) {
  const list = Array.isArray(exploits) ? exploits : [];
  if (!list.length) return '';

  const scored = list
    .map((entry) => ({ entry, score: scoreExploit(entry, queryText) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const rankDiff = executorTypeRank(a.entry.extype) - executorTypeRank(b.entry.extype);
      if (rankDiff !== 0) return rankDiff;
      if (a.entry.updated !== b.entry.updated) return Number(b.entry.updated) - Number(a.entry.updated);
      return a.entry.title.localeCompare(b.entry.title);
    });

  const positive = scored.filter((row) => row.score > 0);
  const picked = (positive.length ? positive : scored)
    .slice(0, Math.max(1, maxMatches))
    .map((row) => row.entry);

  const totalWinInternal = list.filter((entry) => entry.extype === 'wexecutor').length;
  const totalWinExternal = list.filter((entry) => entry.extype === 'wexternal').length;
  const pickedWinInternal = picked.filter((entry) => entry.extype === 'wexecutor').length;
  const pickedWinExternal = picked.filter((entry) => entry.extype === 'wexternal').length;
  const pickedDiscontinued = picked.filter((entry) => entry.discontinued).length;

  const lines = [
    'source: WEAO live tracker',
    `fetched_at_utc: ${new Date().toISOString()}`,
    'discontinued_rule: updated year <= 2025',
    'windows_priority: internal (wexecutor) > external (wexternal)',
    'clientmods_note: clientmods yes = bypasses client modification bans (NOT banwaves)',
    `windows_split_total: internal ${totalWinInternal} | external ${totalWinExternal}`,
    `windows_split_results: internal ${pickedWinInternal} | external ${pickedWinExternal}`,
    `discontinued_in_results: ${pickedDiscontinued}`,
    `results: ${picked.length}/${list.length}`,
    ...picked.map((entry, index) => formatEntry(entry, index)),
  ];

  return lines.join('\n').slice(0, 3600);
}

module.exports = {
  WEAO_MAX_MATCHES,
  fetchAllExploits,
  isExecutorQuestion,
  buildExecutorTrackerSummary,
};
