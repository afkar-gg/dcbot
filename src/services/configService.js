const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '../../data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

const DEFAULT_PREFIX = 's.';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadConfig() {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    const initial = { guilds: {}, hfApiKeys: [], globalLogChannelId: null };
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
  if (!cfg.guilds || typeof cfg.guilds !== 'object') cfg.guilds = {};
  if (!Array.isArray(cfg.hfApiKeys)) cfg.hfApiKeys = [];
  if (typeof cfg.globalLogChannelId === 'undefined') cfg.globalLogChannelId = null;

  // Persist any repairs
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
      allowAttachments: false,
      tempBans: [],
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
  if (typeof g.allowAttachments === 'undefined') {
    g.allowAttachments = false;
    changed = true;
  }
  if (!Array.isArray(g.tempBans)) {
    g.tempBans = [];
    changed = true;
  }

  if (changed) saveConfig(config);
  return g;
}

module.exports = {
  DEFAULT_PREFIX,
  loadConfig,
  saveConfig,
  getGuildConfig,
  CONFIG_PATH,
};
