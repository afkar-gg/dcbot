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
    const initial = { guilds: {} };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    const fallback = { guilds: {} };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(fallback, null, 2));
    return fallback;
  }
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
