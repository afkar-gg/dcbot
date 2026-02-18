const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  LOADSTRING_MAX_BYTES,
  LOADSTRING_MAX_PER_USER,
  LOADSTRING_HISTORY_MAX,
  LOADSTRING_WEB_PORT,
  LOADSTRING_PUBLIC_BASE_URL,
} = require('./runtimeConfig');

const DATA_ROOT = path.join(__dirname, '../../data/loadstrings');
const FILES_ROOT = path.join(DATA_ROOT, 'files');
const INDEX_PATH = path.join(DATA_ROOT, 'index.json');

const LOADSTRING_ALLOWED_EXTS = new Set([
  '.txt',
  '.js',
  '.lua',
  '.luau',
  '.json',
  '.ts',
  '.mjs',
  '.cjs',
  '.py',
  '.md',
]);

function ensureDataDir() {
  if (!fs.existsSync(DATA_ROOT)) fs.mkdirSync(DATA_ROOT, { recursive: true });
  if (!fs.existsSync(FILES_ROOT)) fs.mkdirSync(FILES_ROOT, { recursive: true });
}

function emptyIndex() {
  return {
    version: 1,
    records: {},
  };
}

function toPosixRelative(filePath) {
  return path.relative(DATA_ROOT, filePath).split(path.sep).join('/');
}

function getExt(name) {
  const n = String(name || '').toLowerCase();
  const idx = n.lastIndexOf('.');
  return idx >= 0 ? n.slice(idx) : '';
}

function slugifySegment(input, fallback = 'item') {
  const raw = String(input || '').toLowerCase().trim();
  const slug = raw
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  if (slug) return slug;
  const fallbackText = fallback == null ? 'item' : String(fallback);
  return fallbackText.toLowerCase().trim();
}

function sanitizeRouteSegment(input) {
  return slugifySegment(String(input || '').trim(), '');
}

function sanitizeHistoryHash(input) {
  const hash = String(input || '').trim().toLowerCase();
  if (!/^[a-z0-9]{6,80}$/.test(hash)) return '';
  return hash;
}

function buildRecordKey(ownerUserId, scriptSlug) {
  return `${ownerUserId}:${scriptSlug}`;
}

function buildUserDir(ownerUserId) {
  return path.join(FILES_ROOT, String(ownerUserId));
}

function buildFilePath(ownerUserId, scriptSlug) {
  return path.join(buildUserDir(ownerUserId), `${scriptSlug}.txt`);
}

function buildHistoryDir(ownerUserId, scriptSlug) {
  return path.join(buildUserDir(ownerUserId), 'history', String(scriptSlug));
}

function buildHistoryFilePath(ownerUserId, scriptSlug, hash) {
  return path.join(buildHistoryDir(ownerUserId, scriptSlug), `${hash}.txt`);
}

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;

  const hash = sanitizeHistoryHash(entry.hash);
  const filePath = String(entry.filePath || '').trim();
  if (!hash || !filePath) return null;

  return {
    hash,
    filePath,
    createdAt: Number(entry.createdAt || Date.now()),
    bytes: Number(entry.bytes || 0),
  };
}

function normalizeRecordShape(record) {
  if (!record || typeof record !== 'object') return null;

  const normalized = {
    ownerUserId: String(record.ownerUserId || '').trim(),
    ownerUsernameSlug: slugifySegment(record.ownerUsernameSlug || '', ''),
    scriptSlug: slugifySegment(record.scriptSlug || '', ''),
    scriptNameOriginal: String(record.scriptNameOriginal || '').trim(),
    createdAt: Number(record.createdAt || Date.now()),
    updatedAt: Number(record.updatedAt || Date.now()),
    filePath: String(record.filePath || '').trim(),
    publicPath: String(record.publicPath || '').trim(),
    history: Array.isArray(record.history)
      ? record.history.map(normalizeHistoryEntry).filter(Boolean)
      : [],
  };

  if (!normalized.ownerUserId || !normalized.ownerUsernameSlug || !normalized.scriptSlug || !normalized.filePath) {
    return null;
  }

  if (!normalized.scriptNameOriginal) {
    normalized.scriptNameOriginal = normalized.scriptSlug;
  }

  if (!normalized.publicPath) {
    normalized.publicPath = `/${normalized.ownerUsernameSlug}/${normalized.scriptSlug}`;
  }

  return normalized;
}

function normalizeIndexShape(raw) {
  const index = raw && typeof raw === 'object' ? raw : emptyIndex();
  if (typeof index.version !== 'number') index.version = 1;
  if (!index.records || typeof index.records !== 'object') index.records = {};

  const normalizedRecords = {};
  for (const [key, value] of Object.entries(index.records)) {
    const normalized = normalizeRecordShape(value);
    if (normalized) normalizedRecords[key] = normalized;
  }
  index.records = normalizedRecords;

  return index;
}

function loadIndex() {
  ensureDataDir();

  if (!fs.existsSync(INDEX_PATH)) {
    const initial = emptyIndex();
    fs.writeFileSync(INDEX_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }

  let parsed;
  let parseFailed = false;
  try {
    parsed = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  } catch {
    parsed = emptyIndex();
    parseFailed = true;
  }

  const index = normalizeIndexShape(parsed);
  if (parseFailed || JSON.stringify(parsed) !== JSON.stringify(index)) {
    fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  }
  return index;
}

function saveIndex(index) {
  ensureDataDir();
  fs.writeFileSync(INDEX_PATH, JSON.stringify(normalizeIndexShape(index), null, 2));
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Ignore cleanup failures.
  }
}

function readRecordFileContent(record) {
  const filePath = path.join(DATA_ROOT, String(record?.filePath || ''));
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

function countUserLoadstrings(index, ownerUserId) {
  return Object.values(index.records).filter((record) => String(record?.ownerUserId || '') === String(ownerUserId)).length;
}

function isSupportedLoadstringAttachment(attachment) {
  const ext = getExt(attachment?.name || '');
  const contentType = String(attachment?.contentType || '').toLowerCase();

  if (LOADSTRING_ALLOWED_EXTS.has(ext)) return true;
  if (contentType.startsWith('text/')) return true;
  if (contentType === 'application/javascript') return true;
  if (contentType === 'application/x-javascript') return true;
  if (contentType === 'application/json') return true;
  return false;
}

async function readTextFromAttachment(attachment) {
  const url = String(attachment?.url || '').trim();
  if (!url) throw new Error('attachment has no URL');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > LOADSTRING_MAX_BYTES) {
    throw new Error(`file too large (${buf.byteLength} bytes, max ${LOADSTRING_MAX_BYTES})`);
  }

  return buf.toString('utf8');
}

function upsertLoadstring({ ownerUserId, ownerUsername, scriptName, content }) {
  const userId = String(ownerUserId || '').trim();
  if (!userId) throw new Error('ownerUserId is required');

  const scriptSlug = slugifySegment(scriptName, 'script');
  const usernameSlug = slugifySegment(ownerUsername || userId, userId);
  const scriptContent = String(content || '');

  const index = loadIndex();
  const key = buildRecordKey(userId, scriptSlug);
  const previous = index.records[key] || null;

  if (!previous) {
    const userCount = countUserLoadstrings(index, userId);
    if (userCount >= LOADSTRING_MAX_PER_USER) {
      const err = new Error(`maximum ${LOADSTRING_MAX_PER_USER} loadstrings reached`);
      err.code = 'LOADSTRING_LIMIT_REACHED';
      throw err;
    }
  }

  const userDir = buildUserDir(userId);
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

  const now = Date.now();
  const nextHistory = Array.isArray(previous?.history) ? [...previous.history] : [];

  if (previous) {
    const oldContent = readRecordFileContent(previous);
    if (oldContent != null && oldContent !== scriptContent) {
      const hash = crypto.randomBytes(10).toString('hex');
      const historyPath = buildHistoryFilePath(userId, scriptSlug, hash);
      const historyDir = path.dirname(historyPath);
      if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
      fs.writeFileSync(historyPath, oldContent, 'utf8');

      nextHistory.push({
        hash,
        filePath: toPosixRelative(historyPath),
        createdAt: now,
        bytes: Buffer.byteLength(oldContent, 'utf8'),
      });
    }
  }

  while (nextHistory.length > LOADSTRING_HISTORY_MAX) {
    const removed = nextHistory.shift();
    if (removed?.filePath) {
      safeUnlink(path.join(DATA_ROOT, String(removed.filePath)));
    }
  }

  const filePath = buildFilePath(userId, scriptSlug);
  fs.writeFileSync(filePath, scriptContent, 'utf8');

  const record = {
    ownerUserId: userId,
    ownerUsernameSlug: usernameSlug,
    scriptSlug,
    scriptNameOriginal: String(scriptName || '').trim() || previous?.scriptNameOriginal || scriptSlug,
    createdAt: Number(previous?.createdAt || now),
    updatedAt: now,
    filePath: toPosixRelative(filePath),
    publicPath: `/${usernameSlug}/${scriptSlug}`,
    history: nextHistory,
  };

  index.records[key] = record;
  saveIndex(index);

  return record;
}

function listLoadstringsForUser(ownerUserId) {
  const userId = String(ownerUserId || '').trim();
  if (!userId) return [];

  const index = loadIndex();
  return Object.values(index.records)
    .filter((record) => String(record?.ownerUserId || '') === userId)
    .sort((a, b) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0));
}

function getLoadstringForUser({ ownerUserId, scriptNameOrSlug }) {
  const userId = String(ownerUserId || '').trim();
  const scriptSlug = slugifySegment(scriptNameOrSlug, '');
  if (!userId || !scriptSlug) return null;

  const index = loadIndex();
  const key = buildRecordKey(userId, scriptSlug);
  const record = index.records[key];
  if (!record) return null;

  const content = readRecordFileContent(record);
  if (content == null) return null;

  return { record, content };
}

function removeLoadstringForUser({ ownerUserId, scriptNameOrSlug }) {
  const userId = String(ownerUserId || '').trim();
  const scriptSlug = slugifySegment(scriptNameOrSlug, '');
  if (!userId || !scriptSlug) return { ok: false, removed: false };

  const index = loadIndex();
  const key = buildRecordKey(userId, scriptSlug);
  const record = index.records[key];
  if (!record) return { ok: true, removed: false };

  safeUnlink(path.join(DATA_ROOT, String(record.filePath || '')));

  if (Array.isArray(record.history)) {
    for (const item of record.history) {
      safeUnlink(path.join(DATA_ROOT, String(item?.filePath || '')));
    }
  }

  delete index.records[key];
  saveIndex(index);

  return { ok: true, removed: true, record };
}

function getLoadstringByRoute(usernameSegment, scriptSegment) {
  const usernameSlug = sanitizeRouteSegment(usernameSegment);
  const scriptSlug = sanitizeRouteSegment(scriptSegment);

  if (!usernameSlug || !scriptSlug) return null;

  const index = loadIndex();
  const record = Object.values(index.records).find(
    (item) => item?.ownerUsernameSlug === usernameSlug && item?.scriptSlug === scriptSlug
  );

  if (!record) return null;

  const content = readRecordFileContent(record);
  if (content == null) return null;

  return { record, content };
}

function resolveLoadstringHistoryByRoute({ usernameSegment, scriptSegment, hash }) {
  const usernameSlug = sanitizeRouteSegment(usernameSegment);
  const scriptSlug = sanitizeRouteSegment(scriptSegment);
  const historyHash = sanitizeHistoryHash(hash);

  if (!usernameSlug || !scriptSlug || !historyHash) return null;

  const index = loadIndex();
  const record = Object.values(index.records).find(
    (item) => item?.ownerUsernameSlug === usernameSlug && item?.scriptSlug === scriptSlug
  );
  if (!record || !Array.isArray(record.history)) return null;

  const found = record.history.find((item) => String(item?.hash || '') === historyHash);
  if (!found) return null;

  const filePath = path.join(DATA_ROOT, String(found.filePath || ''));
  if (!fs.existsSync(filePath)) return null;

  return {
    record,
    history: found,
    content: fs.readFileSync(filePath, 'utf8'),
  };
}

function createLoadstringStore() {
  return {
    upsertLoadstring,
    listLoadstringsForUser,
    getLoadstringForUser,
    removeLoadstringForUser,
    getLoadstringByRoute,
    resolveLoadstringHistoryByRoute,
  };
}

module.exports = {
  DATA_ROOT,
  INDEX_PATH,
  LOADSTRING_MAX_BYTES,
  LOADSTRING_MAX_PER_USER,
  LOADSTRING_HISTORY_MAX,
  LOADSTRING_WEB_PORT,
  LOADSTRING_PUBLIC_BASE_URL,
  slugifySegment,
  isSupportedLoadstringAttachment,
  readTextFromAttachment,
  createLoadstringStore,
};
