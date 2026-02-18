const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.join(__dirname, '../../config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Missing config file: ${CONFIG_PATH}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse config.json: ${err?.message || err}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('config.json must contain a JSON object');
  }
  return parsed;
}

const RAW_CONFIG = loadConfig();

function readString(key, fallback = '') {
  const value = RAW_CONFIG[key];
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text === '' ? fallback : text;
}

function readRequiredString(key) {
  const value = readString(key, '');
  if (!value) throw new Error(`Missing required config key "${key}" in ${CONFIG_PATH}`);
  return value;
}

function readNumber(key, fallback, { min, max } = {}) {
  const value = RAW_CONFIG[key];
  const parsed = Number(value);
  let result = Number.isFinite(parsed) ? parsed : fallback;
  if (Number.isFinite(min)) result = Math.max(min, result);
  if (Number.isFinite(max)) result = Math.min(max, result);
  return result;
}

module.exports = {
  CONFIG_PATH,
  RAW_CONFIG,
  DISCORD_TOKEN: readRequiredString('DISCORD_TOKEN'),
  HUGGINGFACE_API_KEY: readString('HUGGINGFACE_API_KEY', ''),
  HF_CHAT_MODEL: readString('HF_CHAT_MODEL', ''),
  HF_IMAGE_MODEL: readString('HF_IMAGE_MODEL', ''),
  AI_CALL_TIMEOUT_MS: readNumber('AI_CALL_TIMEOUT_MS', 25_000, { min: 1_000 }),
  BOT_TIMEZONE: readString('BOT_TIMEZONE', 'UTC'),
  BOT_TIME_LOCALE: readString('BOT_TIME_LOCALE', 'en-US'),
  LOADSTRING_MAX_BYTES: readNumber('LOADSTRING_MAX_BYTES', 250_000, { min: 1_000 }),
  LOADSTRING_MAX_PER_USER: readNumber('LOADSTRING_MAX_PER_USER', 15, { min: 1 }),
  LOADSTRING_HISTORY_MAX: readNumber('LOADSTRING_HISTORY_MAX', 5, { min: 1 }),
  LOADSTRING_WEB_PORT: readNumber('LOADSTRING_WEB_PORT', 3006, { min: 1 }),
  LOADSTRING_PUBLIC_BASE_URL: readString('LOADSTRING_PUBLIC_BASE_URL', 'https://sc.afkar.lol').replace(/\/+$/, ''),
  WEAO_BASE_URL: readString('WEAO_BASE_URL', 'https://weao.xyz').replace(/\/+$/, ''),
  WEAO_USER_AGENT: readString('WEAO_USER_AGENT', 'WEAO-3PService'),
  WEAO_TIMEOUT_MS: readNumber('WEAO_TIMEOUT_MS', 8000, { min: 1500 }),
  WEAO_MAX_MATCHES: readNumber('WEAO_MAX_MATCHES', 8, { min: 1 }),
  ATTACHMENT_TEXT_MAX_BYTES: readNumber('ATTACHMENT_TEXT_MAX_BYTES', 40_000, { min: 1_000 }),
  ATTACHMENT_TEXT_MAX_CHARS: readNumber('ATTACHMENT_TEXT_MAX_CHARS', 4000, { min: 100 }),
  ATTACHMENT_TEXT_OUTPUT_MAX_CHARS: readNumber('ATTACHMENT_TEXT_OUTPUT_MAX_CHARS', 8000, { min: 200 }),
  ATTACHMENT_IMAGE_MAX_BYTES: readNumber('ATTACHMENT_IMAGE_MAX_BYTES', 4_000_000, { min: 10_000 }),
  ATTACHMENT_MAX_COUNT: readNumber('ATTACHMENT_MAX_COUNT', 3, { min: 1 }),
  WEB_SEARCH_MAX_RESULTS: readNumber('WEB_SEARCH_MAX_RESULTS', 3, { min: 1 }),
  WEB_SEARCH_MAX_PAGES: readNumber('WEB_SEARCH_MAX_PAGES', 2, { min: 1 }),
  WEB_SEARCH_MAX_PAGE_CHARS: readNumber('WEB_SEARCH_MAX_PAGE_CHARS', 2200, { min: 200 }),
  WEB_URL_MAX_FETCHES: readNumber('WEB_URL_MAX_FETCHES', 2, { min: 1 }),
  AI_RATE_LIMIT_PER_MINUTE: readNumber('AI_RATE_LIMIT_PER_MINUTE', 30, { min: 1 }),
  AI_RATE_LIMIT_PING_ONLY_PER_MINUTE: readNumber('AI_RATE_LIMIT_PING_ONLY_PER_MINUTE', 6, { min: 1 }),
  AI_REPLY_CHAIN_MAX_DEPTH: readNumber('AI_REPLY_CHAIN_MAX_DEPTH', 15, { min: 1 }),
  AI_RANDOM_CONTEXT_SCAN: readNumber('AI_RANDOM_CONTEXT_SCAN', 10, { min: 1 }),
  AI_RANDOM_CONTEXT_MIN_KEEP: readNumber('AI_RANDOM_CONTEXT_MIN_KEEP', 5, { min: 1 }),
  AI_RANDOM_CONTEXT_MAX_KEEP: readNumber('AI_RANDOM_CONTEXT_MAX_KEEP', 10, { min: 1 }),
  AI_VISIBLE_CHANNEL_MAX_NAMES: readNumber('AI_VISIBLE_CHANNEL_MAX_NAMES', 80, { min: 1 }),
};
