const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '../../data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

const DEFAULT_PREFIX = 's.';
const DEFAULT_AI_RANDOM_TRIGGER_PERCENT = 2;

function clampPercent(value, fallback = DEFAULT_AI_RANDOM_TRIGGER_PERCENT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, parsed));
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadConfig() {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    const initial = {
      guilds: {},
      groqApiKeys: [],
      groqKeyUsage: {},
      groqChatModel: '',
      groqModelCache: { fetchedAt: 0, models: [] },
      globalLogChannelId: null,
      aiBlacklistUserIds: [],
      creatorWhitelistUserIds: [],
      allowAttachments: false,
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }

  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    cfg = { guilds: {} };
  }

  // Root-level fields
  if (!cfg || typeof cfg !== 'object') cfg = { guilds: {} };
  let changed = false;
  if (!cfg.guilds || typeof cfg.guilds !== 'object') {
    cfg.guilds = {};
    changed = true;
  }

  // Full migration away from Hugging Face-managed key state.
  if (typeof cfg.hfApiKeys !== 'undefined') {
    delete cfg.hfApiKeys;
    changed = true;
  }
  if (typeof cfg.hfKeyUsage !== 'undefined') {
    delete cfg.hfKeyUsage;
    changed = true;
  }
  if (typeof cfg.hfChatModel !== 'undefined') {
    delete cfg.hfChatModel;
    changed = true;
  }

  if (!Array.isArray(cfg.groqApiKeys)) {
    cfg.groqApiKeys = [];
    changed = true;
  }
  if (!cfg.groqKeyUsage || typeof cfg.groqKeyUsage !== 'object' || Array.isArray(cfg.groqKeyUsage)) {
    cfg.groqKeyUsage = {};
    changed = true;
  }
  if (typeof cfg.groqChatModel !== 'string') {
    cfg.groqChatModel = '';
    changed = true;
  }
  if (!cfg.groqModelCache || typeof cfg.groqModelCache !== 'object' || Array.isArray(cfg.groqModelCache)) {
    cfg.groqModelCache = { fetchedAt: 0, models: [] };
    changed = true;
  } else {
    if (!Array.isArray(cfg.groqModelCache.models)) {
      cfg.groqModelCache.models = [];
      changed = true;
    }
    const fetchedAt = Number(cfg.groqModelCache.fetchedAt);
    if (!Number.isFinite(fetchedAt) || fetchedAt < 0) {
      cfg.groqModelCache.fetchedAt = 0;
      changed = true;
    }
  }

  if (typeof cfg.globalLogChannelId === 'undefined') cfg.globalLogChannelId = null;
  if (!Array.isArray(cfg.aiBlacklistUserIds)) cfg.aiBlacklistUserIds = [];
  if (!Array.isArray(cfg.creatorWhitelistUserIds)) cfg.creatorWhitelistUserIds = [];
  if (typeof cfg.allowAttachments === 'undefined') {
    // Migration from legacy per-guild toggle: if any guild had attachments on, keep behavior enabled globally.
    const guilds = Object.values(cfg.guilds || {});
    cfg.allowAttachments = guilds.some((g) => !!g && g.allowAttachments === true);
  }

  // Persist normalized config.
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  return cfg;
}

function saveConfig(config) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getGuildConfig(config, guildId) {
  if (!config.guilds[guildId]) {
    config.guilds[guildId] = {
      prefix: DEFAULT_PREFIX,
      banChannelId: null,
      logChannelId: null,
      tempBans: [],
      aiBlacklistUserIds: [],
      aiRandomTriggerPercent: DEFAULT_AI_RANDOM_TRIGGER_PERCENT,
    };
    saveConfig(config);
    return config.guilds[guildId];
  }

  const g = config.guilds[guildId];
  let changed = false;
  if (!g.prefix) {
    g.prefix = DEFAULT_PREFIX;
    changed = true;
  }
  if (typeof g.banChannelId === 'undefined') {
    g.banChannelId = null;
    changed = true;
  }
  if (typeof g.logChannelId === 'undefined') {
    g.logChannelId = null;
    changed = true;
  }
  if (!Array.isArray(g.tempBans)) {
    g.tempBans = [];
    changed = true;
  }
  if (!Array.isArray(g.aiBlacklistUserIds)) {
    g.aiBlacklistUserIds = [];
    changed = true;
  }
  const normalizedRandomTriggerPercent = clampPercent(
    g.aiRandomTriggerPercent,
    DEFAULT_AI_RANDOM_TRIGGER_PERCENT
  );
  if (g.aiRandomTriggerPercent !== normalizedRandomTriggerPercent) {
    g.aiRandomTriggerPercent = normalizedRandomTriggerPercent;
    changed = true;
  }

  if (changed) saveConfig(config);
  return g;
}

module.exports = {
  DEFAULT_PREFIX,
  DEFAULT_AI_RANDOM_TRIGGER_PERCENT,
  loadConfig,
  saveConfig,
  getGuildConfig,
  CONFIG_PATH,
};
