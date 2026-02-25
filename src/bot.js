const {
  Client,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  StickerFormatType,
} = require('discord.js');

const crypto = require('node:crypto');

const {
  DEFAULT_PREFIX,
  loadConfig,
  saveConfig,
  getGuildConfig,
} = require('./services/configService');

const { hasBanPermission, hasModPermission } = require('./utils/permissions');
const {
  parseDurationToMs,
  parseDurationToSeconds,
  normalizeBanDeleteSeconds,
  formatDuration,
  buildCurrentDateTimeContext,
} = require('./utils/time');

const { buildModLogEmbed, sendLogEmbed } = require('./services/logService');
const { huggingfaceChatCompletion, huggingfaceImageCaption, huggingfaceImageOcr } = require('./services/huggingfaceService');
const { neutralizeMentions } = require('./utils/sanitize');
const {
  createLoadstringStore,
  LOADSTRING_PUBLIC_BASE_URL,
  LOADSTRING_MAX_PER_USER,
  isSupportedLoadstringAttachment,
  readTextFromAttachment,
} = require('./services/loadstringService');
const {
  WEAO_MAX_MATCHES,
  fetchAllExploits,
  isExecutorQuestion,
  buildExecutorTrackerSummary,
} = require('./services/weaoService');
const { createReplyTargetTracker } = require('./ai/replyTargetTracker');
const { detectAiTrigger } = require('./ai/triggerDetector');
const { sendAiReplyGuaranteed } = require('./ai/replySender');
const { createChatOrchestrator } = require('./ai/chatOrchestrator');
const {
  stripOutputControlChars,
  stripZeroWidth,
  stripModelThinking,
  stripLeakedPromptLines,
  looksLikePromptLeak,
  looksLikeReasoningLeak,
  sanitizeAiOutput,
  collapseRepetitiveLines,
} = require('./ai/outputGuard');
const {
  DISCORD_TOKEN,
  HUGGINGFACE_API_KEY: RUNTIME_HUGGINGFACE_API_KEY,
  HF_CHAT_MODEL: RUNTIME_HF_CHAT_MODEL,
  HF_IMAGE_MODEL: RUNTIME_HF_IMAGE_MODEL,
  HF_OCR_MODEL: RUNTIME_HF_OCR_MODEL,
  AI_CALL_TIMEOUT_MS,
  BOT_TIMEZONE,
  BOT_TIME_LOCALE,
  ATTACHMENT_TEXT_MAX_BYTES,
  ATTACHMENT_TEXT_MAX_CHARS,
  ATTACHMENT_TEXT_OUTPUT_MAX_CHARS,
  ATTACHMENT_IMAGE_MAX_BYTES,
  ATTACHMENT_IMAGE_OCR_MAX_CHARS,
  ATTACHMENT_IMAGE_ANALYSIS_TIMEOUT_MS,
  ATTACHMENT_MAX_COUNT,
  WEB_SEARCH_MAX_RESULTS,
  WEB_SEARCH_MAX_PAGES,
  WEB_SEARCH_MAX_PAGE_CHARS,
  WEB_URL_MAX_FETCHES,
  AI_RATE_LIMIT_PER_MINUTE,
  AI_RATE_LIMIT_PING_ONLY_PER_MINUTE,
  AI_REPLY_CHAIN_MAX_DEPTH,
  AI_RANDOM_CONTEXT_SCAN,
  AI_RANDOM_CONTEXT_MIN_KEEP,
  AI_RANDOM_CONTEXT_MAX_KEEP,
  AI_VISIBLE_CHANNEL_MAX_NAMES,
  AI_REPLY_TRACKER_MAX_IDS,
  AI_REPLY_TRACKER_TTL_MS,
  AI_MEMBER_FACTS_CACHE_TTL_MS,
  AI_MEMBER_FACTS_FORCE_REFRESH_ON_INTENT,
  AI_MEMBER_FACTS_ALWAYS_INCLUDE_AUTHOR,
  AI_THREAD_NEW_PARTICIPANT_SIGNAL,
  AI_FALLBACK_REPLY_TEXT,
  AI_FORCE_VISIBLE_REPLY,
} = require('./services/runtimeConfig');

const EXEMPT_USER_ID = '777427217490903080';
const CREATOR_USER_ID = '777427217490903080';
const CREATOR_ALERT_GUILD_ID = '1387021291898273842';
const CREATOR_ALERT_CHANNEL_ID = '1387021963511468073';
const DEFAULT_HF_MODEL = 'moonshotai/Kimi-K2.5:novita';
const BOT_USERNAME_TAG = 'Goose#9289';
const BOT_INVITE_URL = 'https://discord.com/oauth2/authorize?client_id=803528296590868480&scope=bot&permissions=277025643584';
const HF_PROVIDER_PRESETS = {
  // Existing provider-pinned presets
  novita: 'moonshotai/Kimi-K2.5:novita',
  together: 'moonshotai/Kimi-K2.5:together',

  // Hugging Face Router selection policies (no specific provider pinned)
  // See: https://huggingface.co/docs/inference-providers/en/tasks/chat-completion
  fastest: 'moonshotai/Kimi-K2.5:fastest',
  preferred: 'moonshotai/Kimi-K2.5:preferred',
  cheapest: 'moonshotai/Kimi-K2.5:cheapest',

  // Extra options (useful when some providers are down / out of credits)
  // NOTE: Provider availability can vary by model; the bot also has fallbacks in huggingfaceService.
  'hf-inference': 'HuggingFaceTB/SmolLM3-3B:hf-inference',
  hfinference: 'HuggingFaceTB/SmolLM3-3B:hf-inference',

  // Example provider-pinned combos that are commonly available on the router.
  // If a provider/model combo is unavailable, the request will fall back automatically.
  nscale: 'meta-llama/Llama-3.1-8B-Instruct:nscale',
  'fireworks-ai': 'meta-llama/Llama-3.1-8B-Instruct:fireworks-ai',
  fireworks: 'meta-llama/Llama-3.1-8B-Instruct:fireworks-ai',
  groq: 'meta-llama/Llama-3.1-8B-Instruct:groq',
  hyperbolic: 'meta-llama/Llama-3.1-8B-Instruct:hyperbolic',
  sambanova: 'meta-llama/Llama-3.1-8B-Instruct:sambanova',
  scaleway: 'meta-llama/Llama-3.1-8B-Instruct:scaleway',
  ovhcloud: 'meta-llama/Llama-3.1-8B-Instruct:ovhcloud',
  publicai: 'meta-llama/Llama-3.1-8B-Instruct:publicai',
};
const DEFAULT_HF_IMAGE_MODEL = 'Qwen/Qwen2.5-VL-7B-Instruct:preferred';
const DEFAULT_HF_OCR_MODEL = 'Qwen/Qwen2.5-VL-7B-Instruct:preferred';
const ALLOWED_TEXT_ATTACHMENT_EXTS = new Set(['.txt', '.js', '.lua']);
const ALLOWED_IMAGE_ATTACHMENT_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);
const MAX_TEXT_ATTACHMENT_BYTES = ATTACHMENT_TEXT_MAX_BYTES;
const MAX_TEXT_ATTACHMENT_CHARS = ATTACHMENT_TEXT_MAX_CHARS;
const MAX_TEXT_ATTACHMENT_OUTPUT_CHARS = ATTACHMENT_TEXT_OUTPUT_MAX_CHARS;
const MAX_IMAGE_ATTACHMENT_BYTES = ATTACHMENT_IMAGE_MAX_BYTES;
const MAX_IMAGE_OCR_CHARS = ATTACHMENT_IMAGE_OCR_MAX_CHARS;
const IMAGE_ANALYSIS_TIMEOUT_MS = ATTACHMENT_IMAGE_ANALYSIS_TIMEOUT_MS;
const MAX_ATTACHMENTS_PER_MESSAGE = ATTACHMENT_MAX_COUNT;
const MAX_WEB_RESULTS = WEB_SEARCH_MAX_RESULTS;
const MAX_WEB_PAGES = WEB_SEARCH_MAX_PAGES;
const MAX_WEB_PAGE_CHARS = WEB_SEARCH_MAX_PAGE_CHARS;
const MAX_URL_FETCHES = WEB_URL_MAX_FETCHES;
const MAX_REPLY_CHAIN_DEPTH = AI_REPLY_CHAIN_MAX_DEPTH;
const MAX_RANDOM_CONTEXT_SCAN = AI_RANDOM_CONTEXT_SCAN;
const MIN_RANDOM_CONTEXT_KEEP = AI_RANDOM_CONTEXT_MIN_KEEP;
const MAX_RANDOM_CONTEXT_KEEP = AI_RANDOM_CONTEXT_MAX_KEEP;
const MAX_VISIBLE_CHANNEL_NAMES = AI_VISIBLE_CHANNEL_MAX_NAMES;
const MAX_REPLY_TRACKER_IDS = AI_REPLY_TRACKER_MAX_IDS;
const REPLY_TRACKER_TTL_MS = AI_REPLY_TRACKER_TTL_MS;
const MEMBER_FACTS_CACHE_TTL_MS = Math.max(5_000, Number(AI_MEMBER_FACTS_CACHE_TTL_MS) || 120_000);
const MEMBER_FACTS_FORCE_REFRESH_ON_INTENT = !!AI_MEMBER_FACTS_FORCE_REFRESH_ON_INTENT;
const MEMBER_FACTS_ALWAYS_INCLUDE_AUTHOR = !!AI_MEMBER_FACTS_ALWAYS_INCLUDE_AUTHOR;
const THREAD_NEW_PARTICIPANT_SIGNAL = !!AI_THREAD_NEW_PARTICIPANT_SIGNAL;
const FALLBACK_AI_REPLY_TEXT = String(AI_FALLBACK_REPLY_TEXT || 'i glitched lol say it again').trim() || 'i glitched lol say it again';
const API_LIST_PAGE_SIZE = 5;
const API_LIST_PANEL_TTL_MS = 30 * 60_000;

async function pingCreatorInGlobalLog(client, config, { guild, text } = {}) {
  try {
    const globalLogChannelId = config?.globalLogChannelId || null;
    if (!globalLogChannelId) return false;

    const channel = await client.channels.fetch(globalLogChannelId).catch(() => null);
    if (!channel || !channel.isTextBased?.()) {
      console.error(`Global log channel unavailable: ${globalLogChannelId}`);
      return false;
    }

    const where = guild?.name ? `in ${guild.name}` : '';
    const content = `<@${CREATOR_USER_ID}> ${String(text || '').trim()} ${where}`.trim();
    const sent = await channel.send({
      content,
      allowedMentions: { parse: ['users'], users: [CREATOR_USER_ID], roles: [], repliedUser: false },
    }).catch((err) => {
      console.error(`Failed sending depletion ping to global log ${globalLogChannelId}:`, err?.message || err);
      return null;
    });
    return !!sent;
  } catch (e) {
    console.error('Global log depletion ping crashed:', e?.message || e);
    return false;
  }
}

async function notifyCreatorLowCredits(client, { guild, keyMasked } = {}) {
  try {
    const targetGuildId = CREATOR_ALERT_GUILD_ID || guild?.id || '';
    let channel = null;

    if (targetGuildId) {
      const alertGuild = await client.guilds.fetch(targetGuildId).catch(() => null);
      if (alertGuild) {
        channel = await alertGuild.channels.fetch(CREATOR_ALERT_CHANNEL_ID).catch(() => null);
      }
    }

    if (!channel) {
      channel = await client.channels.fetch(CREATOR_ALERT_CHANNEL_ID).catch(() => null);
    }

    const where = guild?.name ? `in ${guild.name}` : '';
    const keyInfo = keyMasked ? ` (${keyMasked})` : '';
    let delivered = false;

    if (channel && channel.isTextBased?.()) {
      const sent = await channel
        .send({
          content: `<@${CREATOR_USER_ID}> ur api key ran out gng im dying${keyInfo} ${where}`.trim(),
          allowedMentions: { parse: ['users'], users: [CREATOR_USER_ID], roles: [], repliedUser: false },
        })
        .catch((err) => {
          console.error('Low-credit alert channel send failed:', err?.message || err);
          return null;
        });
      if (sent) delivered = true;
      if (delivered) return true;
    }

    const user = await client.users.fetch(CREATOR_USER_ID).catch(() => null);
    if (user) {
      const dm = await user
        .send(`ur api key ran out gng im dying${keyInfo} ${where}`.trim())
        .catch((err) => {
          console.error('Low-credit DM send failed:', err?.message || err);
          return null;
        });
      if (dm) delivered = true;
    }
    if (!delivered) {
      console.error('Low-credit alert could not be delivered to alert channel or DM.');
    }
    return delivered;
  } catch (e) {
    console.error('Low-credit notification crashed:', e?.message || e);
    return false;
  }
}

function isCreator(userId) {
  return String(userId || '') === CREATOR_USER_ID;
}

function hasCreatorWhitelistAccess(config, userId) {
  const id = String(userId || '').trim();
  if (!id) return false;
  if (isCreator(id)) return true;
  const list = Array.isArray(config?.creatorWhitelistUserIds) ? config.creatorWhitelistUserIds : [];
  return list.includes(id);
}

function pickRoast() {
  const roasts = [
    'nice try lil bro but thats not for you',
    'u are NOT the dev relax',
    'nope creator only go touch grass',
    'ur not him',
    'access denied who even are you',
  ];
  return roasts[Math.floor(Math.random() * roasts.length)];
}

function maskApiKey(key) {
  const k = String(key || '').trim();
  if (k.length <= 8) return `${k.slice(0, 2)}…${k.slice(-2)}`;
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

function summarizeErr(err) {
  const status = Number(err?.status);
  const statusText = Number.isFinite(status) && status > 0 ? `status ${status}` : '';
  const msg = String(err?.message || err || '').trim();
  if (statusText && msg) return `${statusText} | ${msg}`;
  return statusText || msg || 'unknown error';
}

function isHfCreditDepletedError(err) {
  const status = Number(err?.status);
  const body = String(err?.body || err?.message || '').toLowerCase();
  if (status === 402) return true;
  return (
    body.includes('credit balance is depleted') ||
    body.includes('insufficient credit') ||
    body.includes('insufficient credits') ||
    body.includes('not enough credits') ||
    body.includes('payment required')
  );
}

// Track in-flight AI responses so we can nudge the user if the model/provider is slow.
// Keyed by triggering message id.
const aiInFlight = new Map();
const hfDepletedCounts = new Map();
const hfDepletedGlobalPinged = new Set();
const hfDepletedCreatorNotified = new Set();

// Per-user rolling window rate limit for AI triggers (mention/reply/random).
// Map<userId, number[]> where array holds timestamps (ms) within last minute.
const aiRateLimitBuckets = new Map();
// Lightweight member facts cache for faster non-identity turns.
// Map<`${guildId}:${userId}`, { line: string, fetchedAt: number }>
const memberFactsCache = new Map();

function buildHelpText(prefix, { includeAll = false } = {}) {
  const lines = [
    '**Commands**',
    `• \`/ping\` or \`${prefix}ping\` - Shows bot latency`,
    `• \`/help\` or \`${prefix}help\` - DM this command list`,
    `• \`${prefix}help all\` - Show all commands (including creator/whitelist commands)`,
    `• \`${prefix}loadstring <name> <inline?>\`, \`${prefix}ls <name> <inline?>\`, or \`/loadstring\` - Create/update a hosted loadstring link`,
    `• \`${prefix}lslist\` or \`/lslist\` - List your hosted loadstring links`,
    `• \`${prefix}lsremove <name>\` or \`/lsremove\` - Remove one hosted loadstring`,
    `• \`${prefix}lsinfo <name>\` or \`/lsinfo\` - DM detailed info + history links`,
    `• \`/setbanchannel\` or \`${prefix}setbanchannel\` (alias: \`${prefix}setbanch\`) - Set ban channel`,
    `• \`/setlogchannel\` or \`${prefix}setlogchannel\` (alias: \`${prefix}setlogch\`) - Set log channel`,
    `• \`/setprefix\` or \`${prefix}setprefix <new>\` - Change server prefix`,
    `• \`/say\` - Bot says something (mods only, mention-review protected)`,
    `• \`${prefix}blacklist <add|remove|list> <@user|id?>\` - Block/unblock users from AI (creator/whitelist only)`,
    `• \`/blacklist\` - Same as above (creator/whitelist only)`,
    `• \`/attachments\` or \`${prefix}attachments <on|off|toggle|status>\` - Toggle global attachment reading (images + .txt/.js/.lua)`,
    `• \`/mute\` or \`${prefix}mute <@user|id> <duration> <reason?>\` - Timeout`,
    `• \`/kick\` or \`${prefix}kick <@user|id> <reason?>\` - Kick`,
    `• \`/ban\` or \`${prefix}ban <@user|id> <delete?> <reason?>\` - Ban`,
    `• \`/tempban\` or \`${prefix}tempban <@user|id> <duration?> <reason?>\` - Tempban`,
  ];

  if (includeAll) {
    lines.push('');
    lines.push('**Creator/Whitelist**');
    lines.push(`• \`${prefix}q <on|off|toggle|status>\` - raw ai mode (no personality/sanitize)`);
    lines.push(`• \`${prefix}addhfapi <key>\``);
    lines.push(`• \`${prefix}removehfapi <key|masked>\``);
    lines.push(`• \`${prefix}listapi\``);
    lines.push(`• \`${prefix}listhfprovider\` - list hf provider presets`);
    lines.push(`• \`${prefix}sethfprovider <novita|together|fastest|preferred|cheapest|groq|fireworks|nscale|hf-inference>\``);
    lines.push(`• \`${prefix}servers [noinvites]\``);
    lines.push(`• \`${prefix}setgloballog <#channel|channelId|off>\``);
    lines.push(`• \`${prefix}creatorwhitelist <add|remove|list> <@user|id?>\` - manage creator whitelist`);
  }

  return lines.join('\n');
}

async function dmHelp(user, prefix, options) {
  return user.send({ content: buildHelpText(prefix, options) });
}

function stripControlChars(text) {
  if (!text) return '';
  // Remove non-printable control chars + zero-width that can sneak into usernames/messages
  return stripZeroWidth(String(text).replace(/[\u0000-\u001F\u007F-\u009F]/g, '')).trim();
}

function parseChannelId(token) {
  if (!token) return '';
  const raw = String(token).trim();
  const match = raw.match(/^<#(\d+)>$/) || raw.match(/(\d{6,})/);
  return match ? match[1] : '';
}

function parseUserIdToken(token) {
  if (!token) return '';
  const raw = String(token).trim();
  const mentionMatch = raw.match(/^<@!?(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];
  const idMatch = raw.match(/^(\d{6,})$/);
  return idMatch ? idMatch[1] : '';
}

function isBotInviteRequest(text) {
  const t = String(text || '').toLowerCase().trim();
  if (!t) return false;

  if (/\b(?:how|where)\s+(?:do|can)\s+i\s+(?:invite|add)\s+(?:this\s+bot|the\s+bot|bot|you)\b/.test(t)) return true;
  if (/\bcan\s+i\s+(?:invite|add)\s+(?:this\s+bot|the\s+bot|bot|you)\b/.test(t)) return true;
  if (/\b(?:invite|add)\s+(?:this\s+bot|the\s+bot|bot|you)\s+to\s+(?:my\s+)?(?:server|guild|discord)\b/.test(t)) return true;
  if (/\b(?:give|send|drop)\s+me\s+(?:your|the|this\s+bot(?:'s)?|bot)\s+invite\s+(?:link|url)\b/.test(t)) return true;
  if (/\bwhat(?:'s| is)\s+(?:your|the|this\s+bot(?:'s)?|bot)\s+invite\s+(?:link|url)\b/.test(t)) return true;

  const hasInviteIntent = /\b(invite|add)\b/.test(t);
  const hasBotTarget = /\b(this\s+bot|the\s+bot|bot|you|yourself|urself|your)\b/.test(t);
  const hasInviteContext = /\b(link|url|server|guild|discord|oauth)\b/.test(t);
  if (hasInviteIntent && hasBotTarget && hasInviteContext) return true;

  return false;
}

function buildLoadstringPublicUrl(publicPath) {
  const base = String(LOADSTRING_PUBLIC_BASE_URL || 'https://sc.afkar.lol').replace(/\/+$/, '');
  const path = String(publicPath || '').startsWith('/') ? String(publicPath || '') : `/${String(publicPath || '')}`;
  return `${base}${path}`;
}

function parseLoadstringCommandInput(content, prefix) {
  const body = String(content || '').slice(prefix.length).trim();
  const match = body.match(/^(loadstring|ls)\s+(\S+)(?:\s+([\s\S]*))?$/i);
  if (!match) return null;

  return {
    scriptName: match[2],
    inlineScript: String(match[3] || ''),
  };
}

function buildLoadstringSnippet(publicUrl) {
  return `loadstring(game:HttpGet("${publicUrl}"))();`;
}

function normalizeLoadstringName(input) {
  return stripControlChars(String(input || '').trim());
}

function buildLoadstringListEmbeds(rows, ownerTag = 'your') {
  const lines = rows.map((row, idx) => {
    const url = buildLoadstringPublicUrl(row.publicPath);
    return `${idx + 1}. \`${row.scriptSlug}\`\n${url}`;
  });

  const chunks = chunkLines(lines, 3500);
  return chunks.map((description, idx) => ({
    color: 0x5865f2,
    title: `${ownerTag} loadstrings`,
    description,
    footer: { text: `Page ${idx + 1}/${chunks.length}` },
  }));
}

function buildLoadstringInfoEmbed(row, contentText) {
  const publicUrl = buildLoadstringPublicUrl(row.publicPath);
  const createdTs = Math.floor(Number(row.createdAt || Date.now()) / 1000);
  const updatedTs = Math.floor(Number(row.updatedAt || Date.now()) / 1000);
  const byteSize = Buffer.byteLength(String(contentText || ''), 'utf8');
  const historyRows = Array.isArray(row.history) ? [...row.history].reverse() : [];

  const historyLinks = historyRows.length
    ? historyRows.map((item, idx) => {
        const ts = Math.floor(Number(item?.createdAt || Date.now()) / 1000);
        return `${idx + 1}. ${publicUrl}?${item.hash} • <t:${ts}:R>`;
      }).join('\n')
    : 'none';

  return {
    color: 0x57f287,
    title: `loadstring info: ${row.scriptSlug}`,
    description: publicUrl,
    fields: [
      { name: 'Script Name', value: `\`${row.scriptNameOriginal || row.scriptSlug}\``, inline: true },
      { name: 'Slug', value: `\`${row.scriptSlug}\``, inline: true },
      { name: 'Size', value: `${byteSize} bytes`, inline: true },
      { name: 'Created', value: `<t:${createdTs}:f>`, inline: true },
      { name: 'Updated', value: `<t:${updatedTs}:f>`, inline: true },
      { name: 'History', value: `${historyRows.length}`, inline: true },
      { name: 'Old versions', value: historyLinks, inline: false },
    ],
  };
}

function pickBotNameFromDisplayName(displayName) {
  const n = (displayName || '').toLowerCase();
  if (n.includes('duck')) return 'Duck';
  if (n.includes('goose')) return 'Goose';
  // default
  return 'Goose';
}

function startTyping(channel) {
  let interval = null;
  let stopped = false;

  async function tick() {
    if (stopped) return;
    try {
      // Typing indicator lasts a few seconds; we refresh it periodically.
      await channel.sendTyping();
    } catch {
      // ignore (missing perms / rate limits)
    }
  }

  // Fire immediately, then keep-alive
  tick();
  interval = setInterval(tick, 9000);

  return () => {
    stopped = true;
    if (interval) clearInterval(interval);
  };
}


function chunkLines(lines, maxLen = 1800) {
  const chunks = [];
  let current = '';

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLen && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtmlTags(html) {
  if (!html) return '';
  let out = String(html);
  out = out.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  out = out.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  out = out.replace(/<\/(p|div|br|li|h[1-6])>/gi, '\n');
  out = out.replace(/<[^>]+>/g, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  return decodeHtmlEntities(out);
}

function extractWebSearchQuery(text) {
  const t = String(text || '');
  const match = t.match(/\b(?:search|web|lookup)\s*:\s*(.+)$/i);
  if (!match) return '';
  return match[1].trim();
}

function extractUrls(text) {
  const t = String(text || '');
  const urls = [];
  const re = /\bhttps?:\/\/[^\s<>()]+/gi;
  let match;
  while ((match = re.exec(t)) && urls.length < MAX_URL_FETCHES) {
    const raw = match[0].replace(/[)\].,!?]+$/g, '');
    if (!urls.includes(raw)) urls.push(raw);
  }
  return urls;
}

function resolveDuckDuckGoUrl(href) {
  if (!href) return '';
  try {
    const url = new URL(href, 'https://duckduckgo.com');
    if (url.hostname.includes('duckduckgo.com') && url.pathname === '/l/') {
      const uddg = url.searchParams.get('uddg');
      if (uddg) return decodeURIComponent(uddg);
    }
    return href;
  } catch {
    return href;
  }
}

async function fetchWebPageText(url) {
  if (!url) return '';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  const isText =
    contentType.includes('text/html') ||
    contentType.includes('text/plain') ||
    contentType.includes('application/json') ||
    contentType.includes('application/xml') ||
    contentType.includes('text/xml');
  if (!isText) return '';
  const html = await res.text();
  const text = stripHtmlTags(html);
  return text.slice(0, MAX_WEB_PAGE_CHARS);
}

async function performWebSearch(query) {
  if (!query) return [];
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
  const html = await res.text();

  const results = [];
  const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i;

  let match;
  while ((match = linkRe.exec(html)) && results.length < MAX_WEB_RESULTS) {
    const href = resolveDuckDuckGoUrl(match[1]);
    const title = decodeHtmlEntities(stripHtmlTags(match[2]));
    const snippetMatch = html.slice(match.index).match(snippetRe);
    const snippet = snippetMatch ? decodeHtmlEntities(stripHtmlTags(snippetMatch[1] || snippetMatch[2])) : '';
    if (href) results.push({ title, url: href, snippet });
  }

  const pages = [];
  for (const r of results.slice(0, MAX_WEB_PAGES)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const content = await fetchWebPageText(r.url);
      pages.push({ ...r, content });
    } catch {
      pages.push({ ...r, content: '' });
    }
  }

  return pages;
}

async function retry(fn, { retries = 2, delayMs = 750 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      if (attempt >= retries) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

function safeReply(message, payload = {}) {
  if (!message) return Promise.resolve(null);

  // Try replying to the triggering message first; if that fails, fall back to sending in channel
  // with an explicit reply reference (avoids looking like we replied to someone else).
  return retry(() => message.reply(payload), { retries: 1, delayMs: 400 })
    .catch(() => {
      const channel = message.channel;
      if (!channel?.send) throw new Error('no channel');

      const fallbackPayload = payload?.reply
        ? payload
        : {
            ...payload,
            reply: { messageReference: message.id, failIfNotExists: false },
          };

      return retry(() => channel.send(fallbackPayload), { retries: 1, delayMs: 400 })
        .catch(() => retry(() => channel.send(payload), { retries: 1, delayMs: 400 }));
    })
    .catch(() => null);
}

function withTimeout(promise, timeoutMs, timeoutMessage = 'Timed out') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function hasMediaAttachment(message) {
  if (!message) return false;

  // Real discord attachments
  if (message.attachments && message.attachments.size > 0) return true;

  // Stickers count as non-text media too
  if (message.stickers && message.stickers.size > 0) return true;

  // Embeds can come from link previews and media
  // We only treat certain embed types as media-like
  if (Array.isArray(message.embeds) && message.embeds.length > 0) {
    const mediaLike = message.embeds.some((e) => {
      const t = String(e?.type || '').toLowerCase();
      if (t === 'image' || t === 'video' || t === 'gifv' || t === 'rich') return true;
      if (e?.image?.url || e?.video?.url || e?.thumbnail?.url) return true;
      return false;
    });
    if (mediaLike) return true;
  }

  return false;
}

function getAttachmentExt(name) {
  const safe = String(name || '').toLowerCase();
  const idx = safe.lastIndexOf('.');
  return idx >= 0 ? safe.slice(idx) : '';
}

function extractFirstCodeBlock(text) {
  const match = String(text || '').match(/```(?:[a-z0-9_-]+)?\s*\n?([\s\S]*?)```/i);
  if (!match) return null;
  return { code: match[1] || '' };
}

function isEditIntent(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  return /(edit|modify|fix|change|update|rewrite|refactor|optimi[sz]e|clean up|patch|improve|add|remove|insert|delete|replace)/.test(
    t
  );
}

function extractCodeForEdit(text) {
  const block = extractFirstCodeBlock(text);
  if (block?.code && block.code.trim()) return block.code;

  let raw = stripOutputControlChars(stripZeroWidth(String(text || '')));
  raw = stripLeakedPromptLines(raw);
  raw = raw.replace(/^\s*(here(?:'s| is)?|updated|new|fixed|edited)[^\n]*\n+/i, '');
  raw = raw.replace(/^\s*```[a-z0-9_-]*\s*/i, '');
  raw = raw.replace(/```$/i, '');
  return raw.trim();
}

function classifyAttachment(attachment) {
  const name = String(attachment?.name || '');
  const ext = getAttachmentExt(name);
  const contentType = String(attachment?.contentType || '').toLowerCase();

  if (contentType.startsWith('image/') || ALLOWED_IMAGE_ATTACHMENT_EXTS.has(ext)) {
    return { kind: 'image', name, ext, contentType };
  }
  if (ALLOWED_TEXT_ATTACHMENT_EXTS.has(ext)) {
    return { kind: 'text', name, ext, contentType };
  }
  return null;
}

function getStickerFormatName(format) {
  switch (format) {
    case StickerFormatType.PNG:
      return 'png';
    case StickerFormatType.APNG:
      return 'apng';
    case StickerFormatType.Lottie:
      return 'lottie';
    case StickerFormatType.GIF:
      return 'gif';
    default:
      return String(format || 'unknown');
  }
}

function extractCustomEmojiTokens(text) {
  const out = [];
  const seen = new Set();
  const raw = String(text || '');
  for (const match of raw.matchAll(/<(a?):([a-zA-Z0-9_]{2,64}):([0-9]{5,})>/g)) {
    const id = String(match[3] || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      animated: match[1] === 'a',
      name: stripControlChars(match[2] || 'emoji'),
      id,
    });
  }
  return out;
}

let unicodeEmojiRegexCache;
function getUnicodeEmojiRegex() {
  if (unicodeEmojiRegexCache !== undefined) return unicodeEmojiRegexCache;
  try {
    unicodeEmojiRegexCache = new RegExp(
      '(?:\\p{Regional_Indicator}{2}|[#*0-9]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?)*)',
      'gu'
    );
  } catch {
    unicodeEmojiRegexCache = null;
  }
  return unicodeEmojiRegexCache;
}

function extractUnicodeEmojiTokens(text, limit = 20) {
  const out = [];
  const seen = new Set();
  const regex = getUnicodeEmojiRegex();
  if (!regex) return out;
  const raw = String(text || '');
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const value = String(match[0] || '');
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function trimAttachmentTextForPrompt(text, limit) {
  let safe = stripOutputControlChars(text || '');
  if (safe.length > limit) {
    safe = `${safe.slice(0, limit)}...`;
  }
  return safe.trim();
}

async function buildAttachmentContext(message, { analyzeImage, includeFileAttachments = true } = {}) {
  const attachments = includeFileAttachments && message?.attachments ? [...message.attachments.values()] : [];
  const stickers = message?.stickers ? [...message.stickers.values()] : [];
  const customEmojiTokens = extractCustomEmojiTokens(message?.content || '');
  const unicodeEmojiTokens = extractUnicodeEmojiTokens(message?.content || '');
  const result = {
    hasAny: attachments.length > 0 || stickers.length > 0 || customEmojiTokens.length > 0 || unicodeEmojiTokens.length > 0,
    allowed: [],
    blocked: [],
    stickers,
    emoji: {
      custom: customEmojiTokens,
      unicode: unicodeEmojiTokens,
    },
    lines: [],
  };

  for (const attachment of attachments) {
    const info = classifyAttachment(attachment);
    if (!info) {
      result.blocked.push(attachment);
      continue;
    }
    result.allowed.push({ attachment, info });
  }

  const allowedSlice = result.allowed.slice(0, MAX_ATTACHMENTS_PER_MESSAGE);

  for (const entry of allowedSlice) {
    const { attachment, info } = entry;
    const nameSafe = stripControlChars(info.name || 'attachment');

    if (info.kind === 'image') {
      const size = Number(attachment?.size || 0);
      if (size && size > MAX_IMAGE_ATTACHMENT_BYTES) {
        result.lines.push(
          `[attachment image: ${nameSafe} skipped too large (${size} bytes, max ${MAX_IMAGE_ATTACHMENT_BYTES})]`
        );
        continue;
      }

      let imageMeta = null;
      if (analyzeImage) {
        try {
          // eslint-disable-next-line no-await-in-loop
          imageMeta = await analyzeImage(attachment);
        } catch (e) {
          const name = stripControlChars(attachment?.name || 'image') || 'image';
          console.error(`[ai-media] image analysis crashed for ${name}:`, summarizeErr(e));
          imageMeta = null;
        }
      }

      const caption = trimAttachmentTextForPrompt(imageMeta?.caption || '', 500);
      const ocrText = trimAttachmentTextForPrompt(imageMeta?.ocrText || '', MAX_IMAGE_OCR_CHARS);

      const bits = [];
      if (caption) bits.push(`caption: ${caption}`);
      if (ocrText) bits.push(`ocr: ${ocrText}`);
      if (bits.length === 0) {
        const url = attachment?.url || attachment?.proxyURL || '';
        bits.push(`caption: (unavailable)${url ? ` | ${url}` : ''}`);
      }
      result.lines.push(`[attachment image: ${nameSafe} | ${bits.join(' | ')}]`);
      continue;
    }

    if (info.kind === 'text') {
      const size = Number(attachment?.size || 0);
      if (size && size > MAX_TEXT_ATTACHMENT_BYTES) {
        result.lines.push(
          `[attachment text: ${nameSafe} skipped too large (${size} bytes, max ${MAX_TEXT_ATTACHMENT_BYTES})]`
        );
        continue;
      }

      let text = '';
      try {
        const res = await fetch(attachment.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        text = await res.text();
      } catch (e) {
        result.lines.push(`[attachment text: ${nameSafe} failed to fetch]`);
        continue;
      }

      const body = trimAttachmentTextForPrompt(text || '', MAX_TEXT_ATTACHMENT_CHARS) || '(empty file)';
      result.lines.push(`[attachment text: ${nameSafe}]\n${body}`);
    }
  }

  for (const sticker of stickers.slice(0, 8)) {
    const stickerName = stripControlChars(sticker?.name || 'sticker') || 'sticker';
    const stickerId = String(sticker?.id || '');
    const format = getStickerFormatName(sticker?.format);
    result.lines.push(
      `[sticker: ${stickerName}${stickerId ? ` | id ${stickerId}` : ''}${format ? ` | format ${format}` : ''}]`
    );
  }

  if (customEmojiTokens.length > 0) {
    const value = customEmojiTokens
      .slice(0, 12)
      .map((item) => `${item.animated ? 'animated ' : ''}${item.name}:${item.id}`)
      .join(', ');
    const extra = customEmojiTokens.length > 12 ? ` (+${customEmojiTokens.length - 12} more)` : '';
    result.lines.push(`[emoji: custom ${value}${extra}]`);
  }

  if (unicodeEmojiTokens.length > 0) {
    const shown = unicodeEmojiTokens.slice(0, 18).join(' ');
    const extra = unicodeEmojiTokens.length > 18 ? ` (+${unicodeEmojiTokens.length - 18} more)` : '';
    result.lines.push(`[emoji: unicode ${shown}${extra}]`);
  }

  return result;
}

async function fetchReplyChain(message, maxDepth = MAX_REPLY_CHAIN_DEPTH) {
  const chain = [];
  let current = message;

  for (let i = 0; i < maxDepth; i += 1) {
    const refId = current?.reference?.messageId;
    if (!refId) break;

    // Prefer Discord.js helper when available.
    // It handles cross-channel references more correctly than a plain fetch.
    const prev = await (typeof current.fetchReference === 'function'
      ? current.fetchReference().catch(() => null)
      : current.channel.messages.fetch(refId).catch(() => null));

    if (!prev) break;

    chain.push(prev);
    current = prev;
  }

  return chain;
}

async function fetchRecentChannelMessages(message, limit = MAX_RANDOM_CONTEXT_SCAN) {
  if (!message?.channel?.messages?.fetch || !message?.id) return [];

  const count = Math.max(1, Math.min(50, Number(limit) || MAX_RANDOM_CONTEXT_SCAN));
  const fetched = await message.channel.messages.fetch({ limit: count, before: message.id }).catch(() => null);
  if (!fetched) return [];

  return [...fetched.values()]
    .filter((m) => m && m.id !== message.id)
    .filter((m) => !m.author?.bot);
}

function tokenizeForContextRelevance(text) {
  const raw = String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/<a?:\w+:\d+>/g, ' ')
    .replace(/<[@#:&!]?\d+>/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ');

  const stopWords = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'are', 'was', 'were', 'have', 'from', 'they',
    'them', 'what', 'when', 'where', 'why', 'how', 'who', 'which', 'can', 'could', 'would', 'should', 'will',
    'about', 'just', 'like', 'into', 'than', 'then', 'also', 'dont', 'does', 'did', 'not', 'but', 'out', 'its',
    'im', 'ive', 'our', 'his', 'her', 'she', 'him', 'their', 'there', 'here',
  ]);

  return raw
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => w.length >= 3 && !stopWords.has(w))
    .slice(0, 80);
}

function scoreContextRelevance(candidateMsg, anchorMsg, { prefix = '' } = {}) {
  const candidateText = stripControlChars(candidateMsg?.content || '');
  const anchorText = stripControlChars(anchorMsg?.content || '');

  const candidateTokens = tokenizeForContextRelevance(candidateText);
  const anchorTokens = tokenizeForContextRelevance(anchorText);
  const anchorTokenSet = new Set(anchorTokens);

  const overlap = candidateTokens.reduce((acc, token) => acc + (anchorTokenSet.has(token) ? 1 : 0), 0);

  let score = 0;
  score += Math.min(overlap, 6) * 1.2;

  if (candidateMsg?.author?.id && anchorMsg?.author?.id && candidateMsg.author.id === anchorMsg.author.id) {
    score += 2.2;
  }

  if (candidateMsg?.reference?.messageId === anchorMsg?.id || anchorMsg?.reference?.messageId === candidateMsg?.id) {
    score += 3.5;
  }

  if (!candidateText.trim()) score -= 1.8;
  if (/^\s*https?:\/\/\S+\s*$/i.test(candidateText.trim())) score -= 1.3;
  if (detectDangerousMentions(candidateText).dangerous) score -= 1.5;
  if (prefix && candidateText.trim().startsWith(prefix)) score -= 2;

  const anchorTs = Number(anchorMsg?.createdTimestamp || Date.now());
  const candidateTs = Number(candidateMsg?.createdTimestamp || 0);
  if (candidateTs > 0 && anchorTs > candidateTs) {
    const minutesAgo = (anchorTs - candidateTs) / 60_000;
    score += Math.max(0, 1.1 - Math.min(minutesAgo / 25, 1.1));
  }

  return score;
}

function selectAdaptiveFallbackContext(
  candidates,
  anchorMsg,
  { minKeep = MIN_RANDOM_CONTEXT_KEEP, maxKeep = MAX_RANDOM_CONTEXT_KEEP, prefix = '' } = {}
) {
  const input = Array.isArray(candidates) ? candidates : [];
  if (input.length === 0) return [];

  const scored = input
    .map((msg) => ({ msg, score: scoreContextRelevance(msg, anchorMsg, { prefix }) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(b.msg?.createdTimestamp || 0) - Number(a.msg?.createdTimestamp || 0);
    });

  const hardMax = Math.max(1, Math.min(20, Number(maxKeep) || MAX_RANDOM_CONTEXT_KEEP));
  const hardMin = Math.max(1, Math.min(hardMax, Number(minKeep) || MIN_RANDOM_CONTEXT_KEEP));

  let selected = scored.filter((entry) => entry.score > 0.5).slice(0, hardMax);
  if (selected.length < hardMin) {
    selected = scored.slice(0, Math.min(hardMax, Math.max(hardMin, scored.length)));
  }

  return selected
    .map((entry) => entry.msg)
    .sort((a, b) => Number(a?.createdTimestamp || 0) - Number(b?.createdTimestamp || 0));
}

function normalizeMemberLookupName(value) {
  return stripControlChars(stripZeroWidth(String(value || '')))
    .toLowerCase()
    .replace(/[`'"’“”]/g, '')
    .replace(/[^a-z0-9#@._\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMemberLookupNameCompact(value) {
  return normalizeMemberLookupName(value).replace(/\s+/g, '');
}

function buildMemberFactsCacheKey(guildId, userId) {
  const gid = String(guildId || '').trim();
  const uid = String(userId || '').trim();
  if (!gid || !uid) return '';
  return `${gid}:${uid}`;
}

function readMemberFactsCacheLine(guildId, userId) {
  const key = buildMemberFactsCacheKey(guildId, userId);
  if (!key) return '';

  const entry = memberFactsCache.get(key);
  if (!entry) return '';

  const fetchedAt = Number(entry.fetchedAt || 0);
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) {
    memberFactsCache.delete(key);
    return '';
  }

  if (Date.now() - fetchedAt > MEMBER_FACTS_CACHE_TTL_MS) {
    memberFactsCache.delete(key);
    return '';
  }

  const line = String(entry.line || '').trim();
  return line.startsWith('- ') ? line : '';
}

function writeMemberFactsCacheLine(guildId, userId, line) {
  const key = buildMemberFactsCacheKey(guildId, userId);
  const safeLine = String(line || '').trim();
  if (!key || !safeLine.startsWith('- ')) return;
  memberFactsCache.set(key, {
    line: safeLine,
    fetchedAt: Date.now(),
  });
}

function pruneMemberFactsCache() {
  if (memberFactsCache.size === 0) return;
  const graceTtl = Math.max(MEMBER_FACTS_CACHE_TTL_MS * 2, MEMBER_FACTS_CACHE_TTL_MS + 60_000);
  const cutoff = Date.now() - graceTtl;
  for (const [key, entry] of memberFactsCache.entries()) {
    const fetchedAt = Number(entry?.fetchedAt || 0);
    if (!Number.isFinite(fetchedAt) || fetchedAt <= 0 || fetchedAt < cutoff) {
      memberFactsCache.delete(key);
    }
  }
}

function isMemberFactsRequestText(text) {
  return /(\brole\b|\broles\b|\busername\b|\buser\s*name\b|\bdisplay\s*name\b|\bnickname\b|\bperm\b|\bperms\b|\bpermissions\b|\bid\b|\badmin\b|\bmoderator\b|\bmod\b|\bban\b|\bkick\b|\bmute\b|\btimeout\b|\bmanage\b|\bmember\s+facts?\b|\bmember\s+info\b|\buser\s+info\b|\bwho(?:'s| is)\b|\binfo(?:rmation)?\s+(?:on|for|about)\b|\bprofile\b)/i
    .test(String(text || ''));
}

function isLikelyModerationCommandText(text) {
  const raw = stripOutputControlChars(stripZeroWidth(String(text || ''))).trim();
  if (!raw) return false;
  const firstToken = raw.split(/\s+/)[0].toLowerCase();
  const match = firstToken.match(/^(?:[a-z0-9]{1,4})?([./!$?])([a-z][a-z0-9_-]{1,24})$/i);
  if (!match) return false;
  const command = String(match[2] || '').toLowerCase();
  return /^(ban|tempban|kick|mute|timeout|unmute|warn)$/.test(command);
}

function isServerOwnerLookupText(text) {
  const raw = stripOutputControlChars(stripZeroWidth(String(text || ''))).toLowerCase();
  if (!raw) return false;
  if (!/\b(server|guild|ts)\b/.test(raw)) return false;
  if (/\bserver\s+owner\b/.test(raw)) return true;
  if (/\bowner\s+of\s+(?:this|the|ts)\s+server\b/.test(raw)) return true;
  if (/\bwho\s+owns?\s+(?:this|the|ts)\s+server\b/.test(raw)) return true;
  if (/\bwho(?:'s| is)\s+(?:the\s+)?owner\b/.test(raw) && /\b(?:this|the|ts)\s+server\b/.test(raw)) return true;
  if (/\bwho(?:'s| is)\s+own\s+ts\s+server\b/.test(raw)) return true;
  return false;
}

function isBotFactsRequestText(text) {
  return /(\b(your|ur)\s+(role|roles|username|display\s*name|nickname|perm|perms|permissions|id)\b|\bwhat(?:'s| is)\s+(?:your|ur)\b|\babout\s+you\b|\bthe\s+bot\b)/i
    .test(String(text || ''));
}

function isIdentityLookupIntentText(text) {
  return /(\bwho(?:'s| is)\b|\babout\b|\binfo(?:rmation)?\s+(?:on|for|about)\b|\bprofile\b|\bwhich\s+user\b|\bthat\s+(?:user|person)\b|\bwho\s+are\s+they\b|\bwhat(?:'s| is)\s+(?:their|his|her)\b)/i
    .test(String(text || ''));
}

function hasMentionOrReplyTarget(message, context = {}) {
  const hasMentionUsers = !!(message?.mentions?.users?.size > 0);
  const hasMentionMembers = !!(message?.mentions?.members?.size > 0);
  const hasRawMention = /<@!?(\d+)>/.test(String(message?.content || ''));
  const hasReplyTarget = !!context?.repliedAuthorId;
  return hasMentionUsers || hasMentionMembers || hasRawMention || hasReplyTarget;
}

function shouldBuildMemberFactsContext(message, context = {}) {
  const text = String(message?.content || '');
  if (!text) return false;
  if (isLikelyModerationCommandText(text)) return false;
  if (isMemberFactsRequestText(text)) return true;
  if (isIdentityLookupIntentText(text) && hasMentionOrReplyTarget(message, context)) return true;
  return false;
}

function isExecutorStatusFactRequestText(text) {
  return /(\bweao\b|\btracker\b|\bstatus\b|\bdetected\b|\bundetected\b|\bupdated\b|\boutdated\b|\bunc\b|\bsunc\b|\bclientmods?\b|\bclient\s+modification\b|\bbanwaves?\b)/i
    .test(String(text || ''));
}

function sanitizePlainMemberNameCandidate(value) {
  let out = stripControlChars(stripZeroWidth(String(value || '')));
  out = out.replace(/^[@\s]+/, '');
  out = out.replace(/^[\s:;,.!?()[\]{}<>"'`-]+|[\s:;,.!?()[\]{}<>"'`-]+$/g, '');
  out = out.replace(/\s+/g, ' ').trim();
  out = out.replace(/^(?:the\s+)?(?:user|member)\s+/i, '');
  out = out.replace(/^(?:named|name|called|is)\s+/i, '');
  if (!out || out.length < 2 || out.length > 40) return '';
  if (/^<[@#!&]/.test(out)) return '';
  if (/^[0-9]+$/.test(out)) return '';
  if (/^(me|myself|my|you|your|ur|bot|roles?|perms?|permissions?|username|display|name|id)$/i.test(out)) {
    return '';
  }
  if (out.split(/\s+/).length > 4) return '';
  return out;
}

function extractPlainMemberNameCandidates(rawText) {
  const text = stripOutputControlChars(stripZeroWidth(String(rawText || '')));
  if (!text) return [];
  const out = [];
  const seen = new Set();

  function add(raw) {
    const candidate = sanitizePlainMemberNameCandidate(raw);
    if (!candidate) return;
    const key = candidate.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(candidate);
  }

  for (const match of text.matchAll(/["'`]([^"'`\n]{2,40})["'`]/g)) {
    add(match[1]);
  }

  for (const match of text.matchAll(/(?:^|\s)@([a-zA-Z0-9._-]{2,32})\b/g)) {
    add(match[1]);
  }

  for (const match of text.matchAll(/\b([a-zA-Z0-9._-]{2,32})\s+(?:roles?|perms?|permissions?|username|display\s*name|nickname|id)\b/gi)) {
    add(match[1]);
  }

  for (const match of text.matchAll(/\b(?:roles?|perms?|permissions?|username|display\s*name|nickname|id)\s+(?:of|for)\s+([a-zA-Z0-9._ -]{2,40})\b/gi)) {
    add(match[1]);
  }

  for (const match of text.matchAll(/\b(?:does|is)\s+([a-zA-Z0-9._ -]{2,40})\s+(?:have|get|got|with)?\s*(?:roles?|perms?|permissions?)\b/gi)) {
    add(match[1]);
  }

  for (const match of text.matchAll(/\bwho(?:'s| is)\s+([a-zA-Z0-9._ -]{2,40})\b/gi)) {
    add(match[1]);
  }

  for (const match of text.matchAll(/\b(?:about|info(?:rmation)?\s+(?:on|for|about)|profile\s+of)\s+([a-zA-Z0-9._ -]{2,40})\b/gi)) {
    add(match[1]);
  }

  return out.slice(0, 4);
}

function extractUserIdCandidatesFromText(rawText) {
  const text = stripOutputControlChars(stripZeroWidth(String(rawText || '')));
  if (!text) return [];

  const out = [];
  const seen = new Set();

  function add(idRaw) {
    const id = String(idRaw || '').trim();
    if (!/^\d{15,22}$/.test(id)) return;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  }

  for (const match of text.matchAll(/\b(?:user\s*id|userid|member\s*id|id)\s*[:#=\-]?\s*(\d{15,22})\b/gi)) {
    add(match[1]);
  }

  for (const match of text.matchAll(/\b(\d{15,22})\b/g)) {
    const id = String(match[1] || '');
    const at = Number(match.index || 0);
    const start = Math.max(0, at - 36);
    const end = Math.min(text.length, at + id.length + 36);
    const window = text.slice(start, end).toLowerCase();
    if (!/\b(user(?:name)?|member|userid|user\s*id|member\s*id|display\s*name|nickname|profile|roles?|perms?|permissions?|about|who(?:'s|\s+is)?|info(?:rmation)?|id)\b/.test(window)) {
      continue;
    }
    add(id);
  }

  return out.slice(0, 4);
}

function buildAuthorMemberFactsTarget(message) {
  const id = message?.author?.id ? String(message.author.id) : '';
  if (!id) return null;
  return {
    id,
    label: stripControlChars(
      message?.member?.displayName ||
      message?.author?.globalName ||
      message?.author?.username ||
      message?.author?.tag ||
      'current user'
    ),
    member: message?.member || null,
    lookupSource: 'author',
  };
}

function isExactMemberLookupMatch(member, candidate) {
  const needle = normalizeMemberLookupName(candidate);
  const needleCompact = normalizeMemberLookupNameCompact(candidate);
  if (!needle || !needleCompact || !member) return false;

  const variants = [
    member.displayName,
    member.user?.globalName,
    member.user?.username,
    member.user?.tag,
  ];

  return variants.some((value) => {
    const normalized = normalizeMemberLookupName(value);
    const compact = normalizeMemberLookupNameCompact(value);
    return !!normalized && (normalized === needle || compact === needleCompact);
  });
}

function isLooseMemberLookupMatch(member, candidate) {
  const needle = normalizeMemberLookupName(candidate);
  const needleCompact = normalizeMemberLookupNameCompact(candidate);
  if (!needle || !needleCompact || needleCompact.length < 4 || !member) return false;

  const variants = [
    member.displayName,
    member.user?.globalName,
    member.user?.username,
    member.user?.tag,
  ];

  return variants.some((value) => {
    const normalized = normalizeMemberLookupName(value);
    const compact = normalizeMemberLookupNameCompact(value);
    if (!normalized || !compact) return false;
    return normalized.includes(needle) || compact.includes(needleCompact);
  });
}

async function resolveMemberByPlainName(guild, candidate) {
  if (!guild || !candidate) return { status: 'none' };

  const query = String(candidate).trim().slice(0, 64);
  if (!query) return { status: 'none' };

  const exactById = new Map();
  const fromCache = [...guild.members.cache.values()]
    .filter((member) => isExactMemberLookupMatch(member, candidate));
  for (const member of fromCache) {
    const id = String(member?.id || '');
    if (id) exactById.set(id, member);
  }

  const searched = await guild.members.search({ query, limit: 15 }).catch(() => null);
  const fromSearch = searched ? [...searched.values()] : [];
  for (const member of fromSearch) {
    if (!isExactMemberLookupMatch(member, candidate)) continue;
    const id = String(member?.id || '');
    if (id) exactById.set(id, member);
  }

  const exactMatches = [...exactById.values()];
  if (exactMatches.length === 1) return { status: 'resolved', member: exactMatches[0] };
  if (exactMatches.length > 1) return { status: 'ambiguous' };

  const looseById = new Map();
  for (const member of fromCache) {
    if (!isLooseMemberLookupMatch(member, candidate)) continue;
    const id = String(member?.id || '');
    if (id) looseById.set(id, member);
  }
  for (const member of fromSearch) {
    if (!isLooseMemberLookupMatch(member, candidate)) continue;
    const id = String(member?.id || '');
    if (id) looseById.set(id, member);
  }

  const looseMatches = [...looseById.values()];
  if (looseMatches.length === 1) return { status: 'resolved', member: looseMatches[0] };
  if (looseMatches.length > 1) return { status: 'ambiguous' };

  return { status: 'not_found' };
}

async function extractAskedMemberTargets(message, context = {}) {
  const targets = [];
  const seen = new Set();
  const botId = message?.client?.user?.id ? String(message.client.user.id) : '';
  const mentionedMembers = message?.mentions?.members || null;
  const unresolvedByLabel = new Set();

  function addResolvedTarget({ id, label, member, lookupSource = '' }) {
    const targetId = String(id || '');
    if (!targetId || seen.has(targetId)) return;
    seen.add(targetId);
    targets.push({ id: targetId, label, member: member || null, lookupSource });
  }

  function addUnresolvedTarget(label, reason) {
    const safeLabel = stripControlChars(label || 'that user') || 'that user';
    const key = `${safeLabel.toLowerCase()}|${reason}`;
    if (unresolvedByLabel.has(key)) return;
    unresolvedByLabel.add(key);
    targets.push({ id: '', label: safeLabel, member: null, unresolvedReason: reason });
  }

  // If the user is asking about themselves ("my username", "my roles", etc.) include the author.
  const rawTextForSelf = String(message?.content || '');
  const rawText = rawTextForSelf;
  const lowerTextForSelf = rawTextForSelf.toLowerCase();
  const wantsMemberInfo = shouldBuildMemberFactsContext(message, context);
  const selfKeywords = /(\bmy\b|\bme\b|\bmine\b|\bim\b|\bi'm\b|\bi\b)/;
  const wantsSelfInfo = selfKeywords.test(lowerTextForSelf) && wantsMemberInfo;

  if (wantsSelfInfo && message?.author?.id) {
    addResolvedTarget({
      id: String(message.author.id),
      label: stripControlChars(message.member?.displayName || message.author?.globalName || message.author?.username || message.author?.tag || 'you'),
      member: message.member || null,
      lookupSource: 'self',
    });
  }

  if (wantsMemberInfo && botId && isBotFactsRequestText(rawTextForSelf)) {
    addResolvedTarget({
      id: botId,
      label: stripControlChars(
        message?.guild?.members?.me?.displayName ||
        message?.guild?.members?.me?.user?.globalName ||
        message?.guild?.members?.me?.user?.username ||
        message?.client?.user?.username ||
        'bot'
      ),
      member: message?.guild?.members?.me || null,
      lookupSource: 'bot',
    });
  }

  // Mentioned members/users.
  const mentionedUsers = message?.mentions?.users ? [...message.mentions.users.values()] : [];
  for (const user of mentionedUsers) {
    const id = String(user?.id || '');
    if (!id || seen.has(id)) continue;
    if (wantsMemberInfo && botId && id === botId && !isBotFactsRequestText(rawTextForSelf)) continue;
    const member =
      (mentionedMembers && typeof mentionedMembers.get === 'function' ? mentionedMembers.get(id) : null) ||
      message?.guild?.members?.cache?.get?.(id) ||
      null;
    addResolvedTarget({
      id,
      label: stripControlChars(user?.globalName || user?.username || user?.tag || 'user'),
      member,
      lookupSource: 'mention',
    });
  }

  // Also include mentions.members (sometimes populated even when mentions.users is partial)
  const mentionedMemberList = mentionedMembers ? [...mentionedMembers.values()] : [];
  for (const member of mentionedMemberList) {
    const id = String(member?.id || member?.user?.id || '');
    if (!id || seen.has(id)) continue;
    if (wantsMemberInfo && botId && id === botId && !isBotFactsRequestText(rawTextForSelf)) continue;
    addResolvedTarget({
      id,
      label: stripControlChars(member.displayName || member.user?.globalName || member.user?.username || member.user?.tag || 'user'),
      member,
      lookupSource: 'mention_member',
    });
  }

  // Also parse raw mention tokens (covers cases where mention collections are partial)
  const rawMentionIds = [...rawText.matchAll(/<@!?([0-9]+)>/g)].map((m) => m[1]);
  for (const idRaw of rawMentionIds) {
    const id = String(idRaw || '');
    if (!id || seen.has(id)) continue;
    if (wantsMemberInfo && botId && id === botId && !isBotFactsRequestText(rawTextForSelf)) continue;

    const member =
      (mentionedMembers && typeof mentionedMembers.get === 'function' ? mentionedMembers.get(id) : null) ||
      message?.guild?.members?.cache?.get?.(id) ||
      null;
    const cachedUser = message?.client?.users?.cache?.get?.(id) || member?.user || null;

    addResolvedTarget({
      id,
      label: stripControlChars(cachedUser?.globalName || cachedUser?.username || cachedUser?.tag || `id ${id}`),
      member,
      lookupSource: 'raw_mention',
    });
  }

  // Parse plain numeric ids from natural language when intent keywords are present.
  // Example: "what is userid 123456789012345678 role"
  if (wantsMemberInfo && message?.guild) {
    const explicitIdCandidates = extractUserIdCandidatesFromText(rawText);
    for (const candidateId of explicitIdCandidates) {
      const id = String(candidateId || '');
      if (!id || seen.has(id)) continue;
      const member = message.guild.members?.cache?.get?.(id) || null;
      let fetchedMember = member;
      if (!fetchedMember && message.guild.members?.fetch) {
        // eslint-disable-next-line no-await-in-loop
        fetchedMember = await message.guild.members.fetch(id).catch(() => null);
      }
      if (!fetchedMember) {
        addUnresolvedTarget(`id ${id}`, 'id_not_found');
        continue;
      }
      addResolvedTarget({
        id,
        label: stripControlChars(
          fetchedMember.displayName ||
          fetchedMember.user?.globalName ||
          fetchedMember.user?.username ||
          fetchedMember.user?.tag ||
          `id ${id}`
        ),
        member: fetchedMember,
        lookupSource: 'explicit_id',
      });
    }
  }

  // Include replied-to user when available (helps "who is that" replies), even if other targets exist.
  if (context?.repliedAuthorId) {
    const id = String(context.repliedAuthorId);
    if (id && !seen.has(id)) {
      addResolvedTarget({
        id,
        label: stripControlChars(context.repliedAuthorDisplayName || context.repliedAuthorTag || 'replied user'),
        member: context.repliedMember || message?.guild?.members?.cache?.get?.(id) || null,
        lookupSource: 'reply',
      });
    }
  }

  const wantsServerOwnerLookup = wantsMemberInfo && isServerOwnerLookupText(rawTextForSelf);
  if (wantsServerOwnerLookup && message?.guild) {
    let ownerId = String(message.guild.ownerId || '');
    let ownerMember = ownerId ? message.guild.members?.cache?.get?.(ownerId) || null : null;

    if ((!ownerId || !ownerMember) && typeof message.guild.fetchOwner === 'function') {
      const fetchedOwner = await message.guild.fetchOwner().catch(() => null);
      if (fetchedOwner) {
        ownerId = String(fetchedOwner.id || fetchedOwner.user?.id || ownerId);
        ownerMember = fetchedOwner;
      }
    }

    if (ownerId && !ownerMember) {
      ownerMember = await message.guild.members.fetch(ownerId).catch(() => null);
    }

    if (ownerId) {
      addResolvedTarget({
        id: ownerId,
        label: stripControlChars(
          ownerMember?.displayName ||
          ownerMember?.user?.globalName ||
          ownerMember?.user?.username ||
          ownerMember?.user?.tag ||
          'server owner'
        ),
        member: ownerMember || null,
        lookupSource: 'owner',
      });
    }
  }

  if (wantsMemberInfo && message?.guild && !wantsServerOwnerLookup) {
    const plainCandidates = extractPlainMemberNameCandidates(rawTextForSelf);
    for (const candidate of plainCandidates) {
      // eslint-disable-next-line no-await-in-loop
      const resolved = await resolveMemberByPlainName(message.guild, candidate);
      if (resolved?.status === 'resolved' && resolved.member?.id) {
        addResolvedTarget({
          id: resolved.member.id,
          label: stripControlChars(
            resolved.member.displayName ||
            resolved.member.user?.globalName ||
            resolved.member.user?.username ||
            candidate
          ),
          member: resolved.member,
          lookupSource: 'plain_name',
        });
        continue;
      }
      if (resolved?.status === 'ambiguous') {
        addUnresolvedTarget(candidate, 'ambiguous');
      } else if (resolved?.status === 'not_found') {
        addUnresolvedTarget(candidate, 'not_found');
      }
    }
  }

  return targets.slice(0, 5);
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function formatMemberFactsLine(guild, targetId, target, member) {
  const userTag = stripControlChars(member.user?.tag || member.user?.username || '') || '';
  const userName = stripControlChars(member.user?.globalName || member.user?.username || '') || '';
  const display =
    stripControlChars(member.displayName || userName || target?.label || 'user') ||
    'user';
  const idHint = targetId ? ` (id ${targetId})` : '';
  const tagHint = userTag && userTag !== display ? ` | tag ${userTag}` : userTag ? ` | tag ${userTag}` : '';
  const userHint = `${idHint}${tagHint}`.trim();
  const roleNames = [...member.roles.cache.values()]
    .filter((role) => role.id !== guild.id)
    .sort((a, b) => Number(b.position || 0) - Number(a.position || 0))
    .map((role) => stripControlChars(role.name))
    .filter(Boolean);
  const roleText =
    roleNames.length > 0
      ? `${roleNames.slice(0, 12).join(', ')}${roleNames.length > 12 ? ` (+${roleNames.length - 12} more)` : ''}`
      : 'none';

  const perms = member.permissions;
  return `- ${display}${userHint ? ` ${userHint}` : ''}: roles ${roleText}; perms admin ${yesNo(
    perms?.has(PermissionsBitField.Flags.Administrator)
  )}, manage guild ${yesNo(perms?.has(PermissionsBitField.Flags.ManageGuild))}, manage messages ${yesNo(
    perms?.has(PermissionsBitField.Flags.ManageMessages)
  )}, ban ${yesNo(perms?.has(PermissionsBitField.Flags.BanMembers))}, kick ${yesNo(
    perms?.has(PermissionsBitField.Flags.KickMembers)
  )}, timeout ${yesNo(perms?.has(PermissionsBitField.Flags.ModerateMembers))}`;
}

async function buildMemberFactsBlock(guild, targets = [], { forceRefresh = false } = {}) {
  if (!guild || !Array.isArray(targets) || targets.length === 0) return '';

  const lines = [];
  for (const target of targets) {
    const targetId = String(target?.id || '');
    if (!targetId) {
      const fallbackName = stripControlChars(target?.label || 'that user') || 'that user';
      if (target?.unresolvedReason === 'ambiguous') {
        lines.push(`- ${fallbackName}: multiple members match that name; use @mention or id`);
      } else if (target?.unresolvedReason === 'not_found') {
        lines.push(`- ${fallbackName}: unable to resolve that member name; use @mention or id`);
      } else if (target?.unresolvedReason === 'id_not_found') {
        lines.push(`- ${fallbackName}: unable to find that user id in this server; use @mention or valid id`);
      }
      continue;
    }

    if (!forceRefresh) {
      const cachedLine = readMemberFactsCacheLine(guild.id, targetId);
      if (cachedLine) {
        lines.push(cachedLine);
        continue;
      }
    }

    let member = target?.member || guild.members.cache.get(targetId) || null;
    if (targetId === guild.client?.user?.id) {
      member = member || guild.members.me || null;
      if (!member && guild.members.fetchMe) {
        // eslint-disable-next-line no-await-in-loop
        member = await guild.members.fetchMe().catch(() => null);
      }
    }

    const shouldFetch = forceRefresh || !member;
    if (shouldFetch) {
      // eslint-disable-next-line no-await-in-loop
      const fetched = await guild.members.fetch(targetId).catch(() => null);
      if (fetched) {
        member = fetched;
      }
    }

    if (!member) {
      const fallbackName = stripControlChars(target?.label || 'that user') || 'that user';
      if (target?.lookupSource === 'explicit_id') {
        lines.push(`- id ${targetId}: unable to find that user id in this server; use @mention or valid id`);
        continue;
      }
      lines.push(`- ${fallbackName}: unable to verify roles or permissions in this server`);
      continue;
    }

    const line = formatMemberFactsLine(guild, targetId, target, member);
    lines.push(line);
    writeMemberFactsCacheLine(guild.id, targetId, line);
  }

  return lines.length > 0 ? `\nMember facts:\n${lines.join('\n')}` : '';
}

function parseMemberFactLines(memberFactsBlock) {
  return String(memberFactsBlock || '')
    .split(/\r?\n/g)
    .map((line) => String(line || '').trim())
    .filter((line) => line.startsWith('- '));
}

function stripMemberFactBullet(line) {
  return String(line || '').replace(/^-+\s*/, '').trim();
}

function normalizeLooseText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[`'"’“”]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function memberFactIdentityHints(line) {
  const raw = stripMemberFactBullet(line);
  const beforeColon = raw.split(':')[0] || raw;
  const idMatch = beforeColon.match(/\(id\s+(\d+)\)/i);
  const id = idMatch ? String(idMatch[1]) : '';
  const name = beforeColon
    .replace(/\(id\s+\d+\)/ig, '')
    .replace(/\|\s*tag\s+.+$/i, '')
    .trim();
  return { id, name };
}

function isMemberFactsAnswerConfident(aiText, memberFactsBlock) {
  const answer = normalizeLooseText(aiText);
  const lines = parseMemberFactLines(memberFactsBlock);
  if (!answer || lines.length === 0) return false;

  const unresolvedFacts = lines.some((line) =>
    /multiple members match|unable to resolve|unable to verify|unable to find/i.test(line)
  );
  if (unresolvedFacts) {
    return /\b(unable|cant|can't|cannot|not verify|ambiguous|multiple)\b/.test(answer);
  }

  for (const line of lines) {
    const { id, name } = memberFactIdentityHints(line);
    const normalizedName = normalizeLooseText(name);
    if (id && answer.includes(id)) return true;
    if (normalizedName && normalizedName.length >= 2 && answer.includes(normalizedName)) return true;
  }
  return false;
}

function buildMemberFactsFallbackText(memberFactsBlock) {
  const lines = parseMemberFactLines(memberFactsBlock)
    .map((line) => {
      const raw = stripMemberFactBullet(line);
      if (!raw) return '';
      if (/multiple members match|unable to resolve|unable to verify|unable to find/i.test(raw)) return raw;
      const identityOnly = raw.split(':')[0]?.trim() || '';
      return identityOnly || raw;
    })
    .filter(Boolean);
  if (lines.length === 0) return 'cant verify member facts rn use @mention or id';
  if (lines.length === 1) return lines[0];
  const preview = lines.slice(0, 2).join(' | ');
  return lines.length > 2 ? `${preview} | +${lines.length - 2} more` : preview;
}

function normalizeAiStyle(text) {
  const raw = String(text || '');
  if (!raw) return '';
  if (/```[\s\S]*?```/m.test(raw)) return raw.trim();

  let out = raw.replace(/[\u2013\u2014]+/g, '\n');
  out = out.replace(/[ \t]+\n/g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

function extractExecutorTrackerTopEntryLine(executorTrackerBlock) {
  return String(executorTrackerBlock || '')
    .split(/\r?\n/g)
    .map((line) => String(line || '').trim())
    .find((line) => /^\d+\.\s+/.test(line)) || '';
}

function extractExecutorTrackerTopEntryName(executorTrackerBlock) {
  const line = extractExecutorTrackerTopEntryLine(executorTrackerBlock);
  if (!line) return '';
  const match = line.match(/^\d+\.\s*([^|]+)\|/);
  return String(match?.[1] || '').trim();
}

function isExecutorStatusAnswerConfident(aiText, executorTrackerBlock, executorTrackerError = '') {
  const answer = normalizeLooseText(aiText);
  if (!answer) return false;

  if (executorTrackerError) {
    return /\b(unable|cant|can't|cannot|error|down|unavailable|failed)\b/.test(answer);
  }

  const topName = normalizeLooseText(extractExecutorTrackerTopEntryName(executorTrackerBlock));
  if (!executorTrackerBlock) return false;
  if (topName && answer.includes(topName)) return true;
  if (/\bweao\b/.test(answer) && /\b(status|detected|updated|unc|sunc|clientmods|free|paid)\b/.test(answer)) {
    return true;
  }
  return false;
}

function buildExecutorStatusFallbackText(executorTrackerBlock, executorTrackerError = '') {
  const safeError = stripOutputControlChars(String(executorTrackerError || '')).trim();
  if (safeError) return `weao api errored rn so i cant verify live status yet (${safeError})`;

  const topLine = extractExecutorTrackerTopEntryLine(executorTrackerBlock);
  if (topLine) {
    const line = topLine.replace(/^\d+\.\s*/, '').trim();
    return `from weao live rn: ${line}`.slice(0, 460);
  }
  return 'weao returned no live rows rn so i cant verify status yet';
}

function channelTypeKey(channel) {
  switch (channel?.type) {
    case ChannelType.GuildText:
      return 'text';
    case ChannelType.GuildAnnouncement:
      return 'announcement';
    case ChannelType.GuildForum:
      return 'forum';
    case ChannelType.GuildVoice:
      return 'voice';
    case ChannelType.GuildStageVoice:
      return 'stage';
    case ChannelType.GuildCategory:
      return 'category';
    case ChannelType.PublicThread:
    case ChannelType.PrivateThread:
    case ChannelType.AnnouncementThread:
      return 'thread';
    default:
      return 'other';
  }
}

async function buildVisibleChannelsBlock(guild) {
  if (!guild) return '';

  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me) return '\nVisible channels:\n- unable to verify channel visibility right now';

  const fetched = await guild.channels.fetch().catch(() => null);
  const channels = fetched ? [...fetched.values()].filter(Boolean) : [...guild.channels.cache.values()];

  const groups = new Map();
  for (const channel of channels) {
    if (!channel) continue;
    const canView = channel.permissionsFor(me)?.has(PermissionsBitField.Flags.ViewChannel);
    if (!canView) continue;

    const channelId = String(channel.id || '');
    if (!channelId) continue;
    const name = stripControlChars(channel.name || '');

    const key = channelTypeKey(channel);
    if (!groups.has(key)) groups.set(key, []);
    const list = groups.get(key);
    if (!list.find((item) => item.id === channelId)) {
      list.push({ id: channelId, name });
    }
  }

  if (groups.size === 0) return '\nVisible channels:\n- none';

  const orderedKeys = ['text', 'announcement', 'forum', 'voice', 'stage', 'category', 'thread', 'other'];
  let remaining = Math.max(1, Number(MAX_VISIBLE_CHANNEL_NAMES) || 80);
  const lines = [];

  for (const key of orderedKeys) {
    const names = groups.get(key);
    if (!names || names.length === 0) continue;

    const sorted = [...names]
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
    const take = Math.min(sorted.length, remaining);
    const shown = take > 0 ? sorted.slice(0, take) : [];
    remaining = Math.max(0, remaining - take);
    const hidden = sorted.length - shown.length;

    let value = shown
      .map((entry) => {
        const mention = `<#${entry.id}>`;
        const n = stripControlChars(entry.name || '');
        return n ? `${mention} (${n})` : mention;
      })
      .join(', ');
    if (hidden > 0) {
      value = value ? `${value} (+${hidden} more)` : `+${hidden} more`;
    }
    if (!value) value = 'none';
    lines.push(`- ${key}: ${value}`);
  }

  return lines.length > 0 ? `\nVisible channels:\n${lines.join('\n')}` : '';
}

function formatMessageForContext(msg) {
  const userId = msg?.author?.id ? String(msg.author.id) : 'unknown';
  const tag = stripControlChars(msg?.author?.tag || msg?.author?.username || 'unknown');
  const display = stripControlChars(msg?.member?.displayName || msg?.author?.globalName || '');
  const content = stripControlChars(msg?.content || '');

  const bits = [];
  const who = display && display.toLowerCase() !== tag.toLowerCase() ? `${tag} (${display})` : tag;
  bits.push(`${who} [id ${userId}]: ${content || '(no text)'}`);

  if (hasMediaAttachment(msg)) {
    const aCount = msg.attachments?.size || 0;
    const sCount = msg.stickers?.size || 0;
    bits.push(`[attachment ${aCount} sticker ${sCount}]`);
  }

  return bits.join('\n');
}

function detectDangerousMentions(content) {
  const text = content || '';
  const hasEveryone = /@everyone/i.test(text);
  const hasHere = /@here/i.test(text);
  const roleIds = [...text.matchAll(/<@&(\d+)>/g)].map((m) => m[1]);
  return {
    dangerous: hasEveryone || hasHere || roleIds.length > 0,
    hasEveryone,
    hasHere,
    roleIds,
  };
}

function isUserAiBlacklisted(config, _guildCfg, userId) {
  if (!userId) return false;
  const id = String(userId);
  const globalList = Array.isArray(config?.aiBlacklistUserIds) ? config.aiBlacklistUserIds : [];
  return globalList.includes(id);
}

function addToUserBucket(bucketMap, userId, nowMs, { limit, windowMs }) {
  const window = Number(windowMs) || 60_000;
  const max = Number(limit) || 10;
  const key = String(userId || '');
  if (!key) return { ok: true, remaining: max };

  const cutoff = nowMs - window;
  const prev = bucketMap.get(key) || [];
  const next = prev.filter((ts) => ts > cutoff);

  if (next.length >= max) {
    bucketMap.set(key, next);
    return { ok: false, retryAfterMs: Math.max(250, next[0] + window - nowMs), remaining: 0 };
  }

  next.push(nowMs);
  bucketMap.set(key, next);
  return { ok: true, remaining: Math.max(0, max - next.length) };
}

async function replaceRoleMentionsWithNames(text, guild) {
  if (!text) return '';
  const raw = String(text);
  const matches = [...raw.matchAll(/<@&(\d+)>/g)];
  if (matches.length === 0) return raw;
  if (!guild) return raw.replace(/<@&(\d+)>/g, 'role');

  const uniqueRoleIds = [...new Set(matches.map((m) => m[1]).filter(Boolean))];
  const roleNameById = new Map();

  for (const roleId of uniqueRoleIds) {
    const cached = guild.roles?.cache?.get?.(roleId) || null;
    if (cached?.name) {
      roleNameById.set(roleId, cached.name);
      continue;
    }

    const fetched = await guild.roles?.fetch?.(roleId).catch(() => null);
    if (fetched?.name) {
      roleNameById.set(roleId, fetched.name);
    }
  }

  return raw.replace(/<@&(\d+)>/g, (_m, id) => {
    const name = roleNameById.get(String(id));
    return name ? String(name) : 'role';
  });
}

function shouldPingAuthorOnReply(message) {
  // Only ping in guilds, only when the author is currently online/present.
  // NOTE: requires GuildPresences intent and server has presence enabled; if presence is unavailable, we skip ping.
  const member = message?.member || null;
  const status = member?.presence?.status || null;
  return status && status !== 'offline';
}

function allowedMentionsSafe() {
  // For moderator /say usage: allow user mentions, block roles + everyone.
  return {
    parse: ['users'],
    roles: [],
    repliedUser: false,
  };
}

function allowedMentionsAiSafe() {
  // For AI: do not allow ANY mentions at all.
  return {
    parse: [],
    roles: [],
    users: [],
    repliedUser: false,
  };
}

function allowedMentionsAiReplyPing() {
  // For AI chatbot replies: ping ONLY the user being replied to.
  // Still blocks @everyone/@here/roles/user mentions inside content.
  return {
    parse: [],
    roles: [],
    users: [],
    repliedUser: true,
  };
}

function allowedMentionsApproved({ roleIds, allowEveryone }) {
  return {
    parse: allowEveryone ? ['users', 'everyone'] : ['users'],
    roles: roleIds || [],
    repliedUser: false,
  };
}

function buildMentionReviewEmbed({ requestedBy, channelId, content, source }) {
  // Clamp content field to avoid embed field limit (1024 chars)
  const preview = neutralizeMentions((content || '').slice(0, 1024));
  return buildModLogEmbed({
    title: 'Mention review required',
    moderator: requestedBy,
    target: null,
    reason: `Source: ${source}`,
    extraFields: [
      { name: 'Destination', value: `<#${channelId}> (\`${channelId}\`)`, inline: false },
      {
        name: 'Content',
        value: preview.length ? preview : '(empty)',
        inline: false,
      },
    ],
    color: 0xfaa61a,
  });
}

function buildMentionReviewEmbedForScope({
  requestedBy,
  channelId,
  content,
  source,
  guild,
  includeServer,
  statusText,
  color,
}) {
  const embed = buildMentionReviewEmbed({
    requestedBy,
    channelId,
    content,
    source,
  });

  if (includeServer && guild) {
    embed.addFields({
      name: 'Server',
      value: `${guild?.name || 'Unknown'} (\`${guild?.id || 'unknown'}\`)`,
      inline: false,
    });
  }

  if (statusText) {
    withStatus(embed, statusText, color);
  }

  return embed;
}

function buildMentionReviewRow(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mentionReview:approve:${id}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`mentionReview:reject:${id}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
  );
}

function withStatus(embed, statusText, color) {
  embed.setFooter({ text: statusText });
  if (color) embed.setColor(color);
  return embed;
}

function createBot({ loadstringStore } = {}) {
  const TOKEN = DISCORD_TOKEN;
  if (!TOKEN) {
    throw new Error(
      'Missing DISCORD_TOKEN in config.json.'
    );
  }

  const HUGGINGFACE_API_KEY = RUNTIME_HUGGINGFACE_API_KEY;

  const config = loadConfig();
  const lsStore = loadstringStore || createLoadstringStore();
  if (!config.hfKeyUsage || typeof config.hfKeyUsage !== 'object' || Array.isArray(config.hfKeyUsage)) {
    config.hfKeyUsage = {};
    saveConfig(config);
  }

  let hfUsageSaveTimer = null;
  let hfUsageDirty = false;

  function ensureHfUsageStore() {
    if (!config.hfKeyUsage || typeof config.hfKeyUsage !== 'object' || Array.isArray(config.hfKeyUsage)) {
      config.hfKeyUsage = {};
    }
    return config.hfKeyUsage;
  }

  function isManagedHfKey(keyRaw = '') {
    const key = String(keyRaw || '').trim();
    if (!key) return false;
    const keys = Array.isArray(config.hfApiKeys) ? config.hfApiKeys : [];
    return keys.includes(key);
  }

  function normalizeUsageCount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function readHfUsageStats(keyRaw = '') {
    const key = String(keyRaw || '').trim();
    const raw = ensureHfUsageStore()?.[key];

    return {
      total: normalizeUsageCount(raw?.total),
      success: normalizeUsageCount(raw?.success),
      failed: normalizeUsageCount(raw?.failed),
      chat: normalizeUsageCount(raw?.chat),
      imageCaption: normalizeUsageCount(raw?.imageCaption),
      imageOcr: normalizeUsageCount(raw?.imageOcr),
      lastUsedAt: normalizeUsageCount(raw?.lastUsedAt),
      lastSuccessAt: normalizeUsageCount(raw?.lastSuccessAt),
      lastFailureAt: normalizeUsageCount(raw?.lastFailureAt),
      lastError: String(raw?.lastError || '').trim(),
    };
  }

  function ensureHfUsageRecord(keyRaw = '') {
    const key = String(keyRaw || '').trim();
    if (!key) return null;

    const store = ensureHfUsageStore();
    const current = readHfUsageStats(key);
    store[key] = current;
    return store[key];
  }

  function scheduleHfUsageSave() {
    if (hfUsageSaveTimer) return;
    hfUsageSaveTimer = setTimeout(() => {
      hfUsageSaveTimer = null;
      if (!hfUsageDirty) return;
      hfUsageDirty = false;
      saveConfig(config);
    }, 1500);
    hfUsageSaveTimer.unref?.();
  }

  function markHfInferenceUsage(keyRaw = '', { kind = 'chat', ok = true, error = '' } = {}) {
    const key = String(keyRaw || '').trim();
    if (!isManagedHfKey(key)) return;

    const record = ensureHfUsageRecord(key);
    if (!record) return;

    const now = Date.now();
    record.total += 1;
    record.lastUsedAt = now;

    if (kind === 'chat') record.chat += 1;
    if (kind === 'imageCaption') record.imageCaption += 1;
    if (kind === 'imageOcr') record.imageOcr += 1;

    if (ok) {
      record.success += 1;
      record.lastSuccessAt = now;
    } else {
      record.failed += 1;
      record.lastFailureAt = now;
      const errText = String(error || '').trim();
      if (errText) record.lastError = errText.slice(0, 220);
    }

    hfUsageDirty = true;
    scheduleHfUsageSave();
  }

  function formatUsageTimestamp(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return 'never';
    const unixSeconds = Math.floor(n / 1000);
    if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return 'never';
    return `<t:${unixSeconds}:R>`;
  }

  function buildApiListPanelComponents({ panelId, page, totalPages }) {
    if (totalPages <= 1) return [];

    const prevPage = page > 1 ? page - 1 : 1;
    const nextPage = page < totalPages ? page + 1 : totalPages;

    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`apilist:${panelId}:${prevPage}`)
          .setLabel('Prev')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId(`apilist:${panelId}:${nextPage}`)
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages)
      ),
    ];
  }

  function buildApiListPagePayload({ entries = [], page = 1, panelId }) {
    const total = entries.length;
    const totalPages = Math.max(1, Math.ceil(total / API_LIST_PAGE_SIZE));
    const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
    const start = (safePage - 1) * API_LIST_PAGE_SIZE;
    const pageEntries = entries.slice(start, start + API_LIST_PAGE_SIZE);

    const fields = pageEntries.map((entry, idx) => ({
      name: `${start + idx + 1}. **${entry.masked}**`,
      value: [
        `**Inference:** ${entry.stats.total} (ok ${entry.stats.success} | fail ${entry.stats.failed})`,
        `**Chat:** ${entry.stats.chat} | **Img Caption:** ${entry.stats.imageCaption} | **Img OCR:** ${entry.stats.imageOcr}`,
        `**Last Used:** ${entry.lastUsed}`,
      ].join('\n'),
      inline: false,
    }));

    return {
      embeds: [
        {
          color: 0x5865f2,
          title: 'HF API Keys - Inference Usage',
          description: [
            '----------------------------------------',
            'Managed key inventory with cumulative usage counters.',
            'Billing USD: unavailable (HF does not expose a supported token API for settings totals)',
            '----------------------------------------',
          ].join('\n'),
          fields: fields.length
            ? fields
            : [{ name: 'No entries', value: 'No keys to display on this page.', inline: false }],
          footer: {
            text: `Page ${safePage}/${totalPages} | Total keys: ${total}`,
          },
          timestamp: new Date().toISOString(),
        },
      ],
      components: buildApiListPanelComponents({
        panelId,
        page: safePage,
        totalPages,
      }),
    };
  }

  function resolveHfChatModel() {
    const raw = String(RUNTIME_HF_CHAT_MODEL || config.hfChatModel || DEFAULT_HF_MODEL).trim();
    const key = raw.toLowerCase();
    return HF_PROVIDER_PRESETS[key] || raw;
  }

  function buildStrictSystemPrompt(basePrompt) {
    return `${basePrompt} STRICT MODE: reply with only the final message. 1-2 sentences max. no reasoning no analysis no meta. if you are unsure, answer with a short casual line.`;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  // Presence rotation
  const presenceStates = [
    { name: '.gg/cpshub', type: ActivityType.Watching },
    { name: '.gg/foxname', type: ActivityType.Watching },
    { name: 'afkar.lol', type: ActivityType.Watching },
  ];
  let presenceIndex = 0;

  function setNextPresence() {
    if (!client.user) return;
    const next = presenceStates[presenceIndex % presenceStates.length];
    presenceIndex += 1;
    client.user.setPresence({
      status: 'online',
      activities: [{ name: next.name, type: next.type }],
    });
  }

  // Mention-review state (in-memory)
  const pendingMentionReviews = new Map();
  const pendingLoadstringCopies = new Map();
  const pendingApiListPanels = new Map();
  const replyTargetTracker = createReplyTargetTracker({
    maxIds: MAX_REPLY_TRACKER_IDS,
    ttlMs: REPLY_TRACKER_TTL_MS,
  });

  function trackBotMessage(msg, source = 'unknown') {
    const id = msg?.id ? String(msg.id) : '';
    if (!id) return;
    replyTargetTracker.markBotMessageSent(id, { source });
  }

  async function safeReplyTracked(message, payload, source = 'safeReply') {
    const sent = await safeReply(message, payload);
    if (sent) {
      trackBotMessage(sent, source);
      return sent;
    }

    const content = String(payload?.content || '').trim();
    if (!content || !message?.channel?.send) return null;

    const plain = await message.channel
      .send({
        content: content.slice(0, 1800),
        allowedMentions: payload?.allowedMentions || allowedMentionsSafe(),
      })
      .catch(() => null);

    if (plain) trackBotMessage(plain, `${source}:plain-fallback`);
    return plain;
  }

  async function logLoadstringAction({
    guild,
    actor,
    title,
    reason,
    extraFields = [],
    color = 0x5865f2,
  }) {
    if (!guild) return;
    const embed = buildModLogEmbed({
      title,
      moderator: actor,
      target: null,
      reason,
      extraFields,
      color,
    });
    await sendLogEmbed({ guild, config, getGuildConfig, client }, embed);
  }

  async function fetchReferenceMessage(message) {
    if (!message?.reference?.messageId) return null;
    return (typeof message.fetchReference === 'function'
      ? message.fetchReference().catch(() => null)
      : message.channel?.messages?.fetch?.(message.reference.messageId).catch(() => null));
  }

  async function extractLoadstringContentFromMessage(message, inlineScript) {
    const sources = [message];
    const replyMsg = await fetchReferenceMessage(message);
    if (replyMsg) sources.push(replyMsg);
    const errors = [];

    for (const src of sources) {
      const attachments = src?.attachments ? [...src.attachments.values()] : [];
      for (const attachment of attachments) {
        if (!isSupportedLoadstringAttachment(attachment)) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          const text = await readTextFromAttachment(attachment);
          return {
            ok: true,
            source: 'attachment',
            content: text,
            attachmentName: attachment?.name || 'attachment',
          };
        } catch (e) {
          errors.push(`failed to read attachment ${attachment?.name || 'file'}: ${e?.message || 'unknown error'}`);
        }
      }
    }

    const fallback = String(inlineScript || '').trim();
    if (fallback) {
      return {
        ok: true,
        source: 'inline',
        content: fallback,
      };
    }

    return {
      ok: false,
      error: errors[0] || 'no valid script content found',
    };
  }

  async function extractLoadstringContentFromSlash(interaction) {
    const attachment = interaction.options.getAttachment('file', false);
    const inlineScript = String(interaction.options.getString('inline', false) || '').trim();

    if (attachment) {
      if (!isSupportedLoadstringAttachment(attachment)) {
        return {
          ok: false,
          error: 'unsupported attachment type. use text-like files (.txt/.js/.lua/.luau/etc)',
        };
      }

      try {
        const text = await readTextFromAttachment(attachment);
        return {
          ok: true,
          source: 'attachment',
          content: text,
          attachmentName: attachment?.name || 'attachment',
        };
      } catch (e) {
        return {
          ok: false,
          error: `failed to read attachment ${attachment?.name || 'file'}: ${e?.message || 'unknown error'}`,
        };
      }
    }

    if (inlineScript) {
      return {
        ok: true,
        source: 'inline',
        content: inlineScript,
      };
    }

    return {
      ok: false,
      error: 'provide a `file` attachment or `inline` script text',
    };
  }

  async function handleCreateLoadstringCommand(message, prefix) {
    const parsed = parseLoadstringCommandInput(message.content, prefix);
    if (!parsed?.scriptName) {
      await safeReply(message, {
        content: `usage: \`${prefix}ls <script-name> [inline-script]\`\nattach a file (.txt/.js/.lua/.luau/etc) in this message or the replied message`,
        allowedMentions: allowedMentionsSafe(),
      });
      return;
    }

    const sourceRes = await extractLoadstringContentFromMessage(message, parsed.inlineScript);
    if (!sourceRes.ok) {
      await safeReply(message, {
        content: `could not create loadstring: ${sourceRes.error}\nattach a valid text file or pass inline script text`,
        allowedMentions: allowedMentionsSafe(),
      });
      return;
    }

    const username =
      stripControlChars(message.author?.username || '') ||
      stripControlChars(message.author?.globalName || '') ||
      message.author.id;
    const scriptName = stripControlChars(parsed.scriptName);
    const existingBefore = lsStore.getLoadstringForUser({
      ownerUserId: message.author.id,
      scriptNameOrSlug: scriptName,
    });

    let record;
    try {
      record = lsStore.upsertLoadstring({
        ownerUserId: message.author.id,
        ownerUsername: username,
        scriptName,
        content: sourceRes.content,
      });
    } catch (e) {
      if (e?.code === 'LOADSTRING_LIMIT_REACHED') {
        await safeReply(message, {
          content: `you already have ${LOADSTRING_MAX_PER_USER} loadstrings. remove one first with \`${prefix}lsremove <script-name>\``,
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      await safeReply(message, {
        content: `failed to save loadstring: ${e?.message || 'unknown error'}`,
        allowedMentions: allowedMentionsSafe(),
      });
      return;
    }

    const publicUrl = buildLoadstringPublicUrl(record.publicPath);
    const copyText = buildLoadstringSnippet(publicUrl);

    const copyId = crypto.randomBytes(8).toString('hex');
    pendingLoadstringCopies.set(copyId, {
      createdAt: Date.now(),
      text: copyText,
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`lscopy:${copyId}`)
        .setLabel('Copy Loadstring')
        .setStyle(ButtonStyle.Primary)
    );

    const updatedAt = Math.floor((record.updatedAt || Date.now()) / 1000);
    const sourceLabel = sourceRes.source === 'attachment'
      ? `attachment: ${sourceRes.attachmentName || 'file'}`
      : 'inline text';

    await safeReply(message, {
      embeds: [
        {
          color: 0x57f287,
          title: 'loadstring created!',
          description: `link: ${publicUrl}`,
          fields: [
            { name: 'Script', value: `\`${record.scriptSlug}\``, inline: true },
            { name: 'Source', value: sourceLabel, inline: true },
            { name: 'Updated', value: `<t:${updatedAt}:f>`, inline: false },
          ],
        },
      ],
      components: [row],
      allowedMentions: allowedMentionsSafe(),
    });

    const historyCount = Array.isArray(record.history) ? record.history.length : 0;
    const wasUpdate = !!existingBefore?.record;
    const contentChanged = wasUpdate ? existingBefore.content !== sourceRes.content : true;
    const saveReason = !wasUpdate
      ? 'Created new loadstring'
      : contentChanged
        ? 'Updated existing loadstring content'
        : 'Saved existing loadstring without content change';

    await logLoadstringAction({
      guild: message.guild,
      actor: message.author,
      title: wasUpdate ? 'Loadstring updated' : 'Loadstring created',
      reason: saveReason,
      color: wasUpdate ? 0xfaa61a : 0x57f287,
      extraFields: [
        { name: 'Script', value: `\`${record.scriptSlug}\``, inline: true },
        { name: 'Source', value: sourceLabel, inline: true },
        { name: 'History versions', value: String(historyCount), inline: true },
        { name: 'URL', value: publicUrl, inline: false },
        { name: 'Channel', value: `<#${message.channel.id}> (\`${message.channel.id}\`)`, inline: false },
        { name: 'Message', value: `[Jump](${message.url})`, inline: false },
      ],
    });
  }

  async function handleSlashCreateLoadstringCommand(interaction) {
    const scriptName = normalizeLoadstringName(interaction.options.getString('name', true));
    if (!scriptName) {
      await interaction.reply({
        content: 'usage: `/loadstring name:<script-name> file:<optional> inline:<optional>`',
        ephemeral: !!interaction.guildId,
      });
      return;
    }

    const sourceRes = await extractLoadstringContentFromSlash(interaction);
    if (!sourceRes.ok) {
      await interaction.reply({
        content: `could not create loadstring: ${sourceRes.error}`,
        ephemeral: !!interaction.guildId,
      });
      return;
    }

    const username =
      stripControlChars(interaction.user?.username || '') ||
      stripControlChars(interaction.user?.globalName || '') ||
      interaction.user.id;
    const existingBefore = lsStore.getLoadstringForUser({
      ownerUserId: interaction.user.id,
      scriptNameOrSlug: scriptName,
    });

    let record;
    try {
      record = lsStore.upsertLoadstring({
        ownerUserId: interaction.user.id,
        ownerUsername: username,
        scriptName,
        content: sourceRes.content,
      });
    } catch (e) {
      if (e?.code === 'LOADSTRING_LIMIT_REACHED') {
        await interaction.reply({
          content: `you already have ${LOADSTRING_MAX_PER_USER} loadstrings. remove one first with \`/lsremove\` or \`s.lsremove <script-name>\``,
          ephemeral: !!interaction.guildId,
        });
        return;
      }

      await interaction.reply({
        content: `failed to save loadstring: ${e?.message || 'unknown error'}`,
        ephemeral: !!interaction.guildId,
      });
      return;
    }

    const publicUrl = buildLoadstringPublicUrl(record.publicPath);
    const copyText = buildLoadstringSnippet(publicUrl);

    const copyId = crypto.randomBytes(8).toString('hex');
    pendingLoadstringCopies.set(copyId, {
      createdAt: Date.now(),
      text: copyText,
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`lscopy:${copyId}`)
        .setLabel('Copy Loadstring')
        .setStyle(ButtonStyle.Primary)
    );

    const updatedAt = Math.floor((record.updatedAt || Date.now()) / 1000);
    const sourceLabel = sourceRes.source === 'attachment'
      ? `attachment: ${sourceRes.attachmentName || 'file'}`
      : 'inline text';

    await interaction.reply({
      embeds: [
        {
          color: 0x57f287,
          title: 'loadstring created!',
          description: `link: ${publicUrl}`,
          fields: [
            { name: 'Script', value: `\`${record.scriptSlug}\``, inline: true },
            { name: 'Source', value: sourceLabel, inline: true },
            { name: 'Updated', value: `<t:${updatedAt}:f>`, inline: false },
          ],
        },
      ],
      components: [row],
      ephemeral: !!interaction.guildId,
    });

    const historyCount = Array.isArray(record.history) ? record.history.length : 0;
    const wasUpdate = !!existingBefore?.record;
    const contentChanged = wasUpdate ? existingBefore.content !== sourceRes.content : true;
    const saveReason = !wasUpdate
      ? 'Created new loadstring'
      : contentChanged
        ? 'Updated existing loadstring content'
        : 'Saved existing loadstring without content change';

    await logLoadstringAction({
      guild: interaction.guild,
      actor: interaction.user,
      title: wasUpdate ? 'Loadstring updated' : 'Loadstring created',
      reason: saveReason,
      color: wasUpdate ? 0xfaa61a : 0x57f287,
      extraFields: [
        { name: 'Script', value: `\`${record.scriptSlug}\``, inline: true },
        { name: 'Source', value: sourceLabel, inline: true },
        { name: 'History versions', value: String(historyCount), inline: true },
        { name: 'URL', value: publicUrl, inline: false },
        ...(interaction.channelId
          ? [{ name: 'Channel', value: `<#${interaction.channelId}> (\`${interaction.channelId}\`)`, inline: false }]
          : []),
      ],
    });
  }

  async function handleListLoadstringsCommand(message) {
    const rows = lsStore.listLoadstringsForUser(message.author.id);
    if (rows.length === 0) {
      await safeReply(message, {
        content: 'you have no loadstrings yet',
        allowedMentions: allowedMentionsSafe(),
      });
      return;
    }

    const embeds = buildLoadstringListEmbeds(rows, 'your');
    for (const embed of embeds) {
      // eslint-disable-next-line no-await-in-loop
      await safeReply(message, {
        embeds: [embed],
        allowedMentions: allowedMentionsSafe(),
      });
    }

    await logLoadstringAction({
      guild: message.guild,
      actor: message.author,
      title: 'Loadstring list viewed',
      reason: 'Viewed personal loadstring list',
      color: 0x5865f2,
      extraFields: [
        { name: 'Count', value: String(rows.length), inline: true },
        { name: 'Channel', value: `<#${message.channel.id}> (\`${message.channel.id}\`)`, inline: false },
        { name: 'Message', value: `[Jump](${message.url})`, inline: false },
      ],
    });
  }

  async function handleRemoveLoadstringCommand(message, scriptName, prefix) {
    const targetName = normalizeLoadstringName(scriptName);
    if (!targetName) {
      await safeReply(message, {
        content: `usage: \`${prefix}lsremove <script-name>\``,
        allowedMentions: allowedMentionsSafe(),
      });
      return;
    }

    const res = lsStore.removeLoadstringForUser({
      ownerUserId: message.author.id,
      scriptNameOrSlug: targetName,
    });

    if (!res?.removed) {
      await safeReply(message, {
        content: `loadstring \`${targetName}\` was not found`,
        allowedMentions: allowedMentionsSafe(),
      });
      return;
    }

    const historyCount = Array.isArray(res.record?.history) ? res.record.history.length : 0;
    await safeReply(message, {
      content: `removed \`${res.record?.scriptSlug || targetName}\` (${historyCount} old version${historyCount === 1 ? '' : 's'} deleted)`,
      allowedMentions: allowedMentionsSafe(),
    });

    await logLoadstringAction({
      guild: message.guild,
      actor: message.author,
      title: 'Loadstring removed',
      reason: 'Deleted hosted loadstring',
      color: 0xed4245,
      extraFields: [
        { name: 'Script', value: `\`${res.record?.scriptSlug || targetName}\``, inline: true },
        { name: 'Old versions removed', value: String(historyCount), inline: true },
        { name: 'Channel', value: `<#${message.channel.id}> (\`${message.channel.id}\`)`, inline: false },
        { name: 'Message', value: `[Jump](${message.url})`, inline: false },
      ],
    });
  }

  async function handleLoadstringInfoCommand(message, scriptName, prefix) {
    const targetName = normalizeLoadstringName(scriptName);
    if (!targetName) {
      await safeReply(message, {
        content: `usage: \`${prefix}lsinfo <script-name>\``,
        allowedMentions: allowedMentionsSafe(),
      });
      return;
    }

    const found = lsStore.getLoadstringForUser({
      ownerUserId: message.author.id,
      scriptNameOrSlug: targetName,
    });
    if (!found?.record) {
      await safeReply(message, {
        content: `loadstring \`${targetName}\` was not found`,
        allowedMentions: allowedMentionsSafe(),
      });
      return;
    }

    const embed = buildLoadstringInfoEmbed(found.record, found.content);
    let dmDelivered = false;

    try {
      await message.author.send({ embeds: [embed] });
      dmDelivered = true;
      if (message.guild) {
        await safeReply(message, {
          content: 'sent loadstring details in dms',
          allowedMentions: allowedMentionsSafe(),
        });
      }
    } catch {
      await safeReply(message, {
        content: 'cant dm u turn on dms from server members',
        allowedMentions: allowedMentionsSafe(),
      });
    }

    await logLoadstringAction({
      guild: message.guild,
      actor: message.author,
      title: 'Loadstring info requested',
      reason: dmDelivered ? 'Viewed loadstring details in DM' : 'Loadstring info DM failed',
      color: dmDelivered ? 0x57f287 : 0xfaa61a,
      extraFields: [
        { name: 'Script', value: `\`${found.record.scriptSlug}\``, inline: true },
        { name: 'DM delivered', value: dmDelivered ? 'yes' : 'no', inline: true },
        { name: 'History versions', value: String(Array.isArray(found.record.history) ? found.record.history.length : 0), inline: true },
        { name: 'URL', value: buildLoadstringPublicUrl(found.record.publicPath), inline: false },
        { name: 'Channel', value: `<#${message.channel.id}> (\`${message.channel.id}\`)`, inline: false },
        { name: 'Message', value: `[Jump](${message.url})`, inline: false },
      ],
    });
  }

  async function handleSlashListLoadstringsCommand(interaction) {
    const rows = lsStore.listLoadstringsForUser(interaction.user.id);
    if (rows.length === 0) {
      await interaction.reply({
        content: 'you have no loadstrings yet',
        ephemeral: !!interaction.guildId,
      });
      return;
    }

    const ownerTag = interaction.user?.username ? `${interaction.user.username}'s` : 'your';
    const embeds = buildLoadstringListEmbeds(rows, ownerTag);
    await interaction.reply({
      embeds: [embeds[0]],
      ephemeral: !!interaction.guildId,
    });

    for (let i = 1; i < embeds.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await interaction.followUp({
        embeds: [embeds[i]],
        ephemeral: !!interaction.guildId,
      });
    }

    await logLoadstringAction({
      guild: interaction.guild,
      actor: interaction.user,
      title: 'Loadstring list viewed',
      reason: 'Viewed personal loadstring list',
      color: 0x5865f2,
      extraFields: [
        { name: 'Count', value: String(rows.length), inline: true },
        ...(interaction.channelId
          ? [{ name: 'Channel', value: `<#${interaction.channelId}> (\`${interaction.channelId}\`)`, inline: false }]
          : []),
      ],
    });
  }

  async function handleSlashRemoveLoadstringCommand(interaction) {
    const targetName = normalizeLoadstringName(interaction.options.getString('name', true));
    const res = lsStore.removeLoadstringForUser({
      ownerUserId: interaction.user.id,
      scriptNameOrSlug: targetName,
    });

    if (!res?.removed) {
      await interaction.reply({
        content: `loadstring \`${targetName}\` was not found`,
        ephemeral: !!interaction.guildId,
      });
      return;
    }

    const historyCount = Array.isArray(res.record?.history) ? res.record.history.length : 0;
    await interaction.reply({
      content: `removed \`${res.record?.scriptSlug || targetName}\` (${historyCount} old version${historyCount === 1 ? '' : 's'} deleted)`,
      ephemeral: !!interaction.guildId,
    });

    await logLoadstringAction({
      guild: interaction.guild,
      actor: interaction.user,
      title: 'Loadstring removed',
      reason: 'Deleted hosted loadstring',
      color: 0xed4245,
      extraFields: [
        { name: 'Script', value: `\`${res.record?.scriptSlug || targetName}\``, inline: true },
        { name: 'Old versions removed', value: String(historyCount), inline: true },
        ...(interaction.channelId
          ? [{ name: 'Channel', value: `<#${interaction.channelId}> (\`${interaction.channelId}\`)`, inline: false }]
          : []),
      ],
    });
  }

  async function handleSlashLoadstringInfoCommand(interaction) {
    const targetName = normalizeLoadstringName(interaction.options.getString('name', true));
    const found = lsStore.getLoadstringForUser({
      ownerUserId: interaction.user.id,
      scriptNameOrSlug: targetName,
    });
    if (!found?.record) {
      await interaction.reply({
        content: `loadstring \`${targetName}\` was not found`,
        ephemeral: !!interaction.guildId,
      });
      return;
    }

    const embed = buildLoadstringInfoEmbed(found.record, found.content);

    if (!interaction.guildId) {
      await interaction.reply({ embeds: [embed] });
      return;
    }

    let dmDelivered = false;
    try {
      await interaction.user.send({ embeds: [embed] });
      dmDelivered = true;
      await interaction.reply({ content: 'sent loadstring details in dms', ephemeral: true });
    } catch {
      await interaction.reply({ content: 'cant dm u turn on dms from server members', ephemeral: true });
    }

    await logLoadstringAction({
      guild: interaction.guild,
      actor: interaction.user,
      title: 'Loadstring info requested',
      reason: dmDelivered ? 'Viewed loadstring details in DM' : 'Loadstring info DM failed',
      color: dmDelivered ? 0x57f287 : 0xfaa61a,
      extraFields: [
        { name: 'Script', value: `\`${found.record.scriptSlug}\``, inline: true },
        { name: 'DM delivered', value: dmDelivered ? 'yes' : 'no', inline: true },
        { name: 'History versions', value: String(Array.isArray(found.record.history) ? found.record.history.length : 0), inline: true },
        { name: 'URL', value: buildLoadstringPublicUrl(found.record.publicPath), inline: false },
        ...(interaction.channelId
          ? [{ name: 'Channel', value: `<#${interaction.channelId}> (\`${interaction.channelId}\`)`, inline: false }]
          : []),
      ],
    });
  }

  function buildMentionReviewEmbedsForPending(pending, guild, statusText, color) {
    const safeGuild = guild || { id: pending.guildId, name: 'Unknown' };
    const requestedBy = {
      id: pending.requestedById,
      tag: pending.requestedByTag || 'Unknown',
    };
    return {
      guild: buildMentionReviewEmbedForScope({
        requestedBy,
        channelId: pending.targetChannelId,
        content: pending.content,
        source: pending.source,
        guild: safeGuild,
        includeServer: false,
        statusText,
        color,
      }),
      global: buildMentionReviewEmbedForScope({
        requestedBy,
        channelId: pending.targetChannelId,
        content: pending.content,
        source: pending.source,
        guild: safeGuild,
        includeServer: true,
        statusText,
        color,
      }),
    };
  }

  async function updateMentionReviewMessages(reviewMessages, embeds, components = []) {
    if (!Array.isArray(reviewMessages) || reviewMessages.length === 0) return;

    for (const entry of reviewMessages) {
      const channel = await client.channels.fetch(entry.channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) continue;

      const msg = await channel.messages.fetch(entry.messageId).catch(() => null);
      if (!msg) continue;

      const embed = entry.scope === 'global' ? embeds.global : embeds.guild;
      if (!embed) continue;

      await msg.edit({ embeds: [embed], components }).catch(() => {});
    }
  }

  async function requestMentionReview({
    guild,
    requestedBy,
    targetChannelId,
    replyToMessageId,
    content,
    source,
    // if true, even approval will NOT allow mentions (used for AI)
    noMentionsOnApprove = false,
  }) {
    const guildCfg = getGuildConfig(config, guild.id);
    const globalLogChannelId = config?.globalLogChannelId || null;
    const reviewTargets = [];

    if (guildCfg.logChannelId) {
      const logChannel = await guild.channels.fetch(guildCfg.logChannelId).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        reviewTargets.push({ channel: logChannel, scope: 'guild' });
      }
    }

    if (globalLogChannelId && globalLogChannelId !== guildCfg.logChannelId) {
      const globalChannel = await client.channels.fetch(globalLogChannelId).catch(() => null);
      if (globalChannel && globalChannel.isTextBased()) {
        reviewTargets.push({ channel: globalChannel, scope: 'global' });
      }
    }

    if (reviewTargets.length === 0) {
      return {
        ok: false,
        reason: 'No log channel set. Use /setlogchannel or /setgloballog first.',
      };
    }

    const id = crypto.randomBytes(6).toString('hex');
    const row = buildMentionReviewRow(id);
    const reviewMessages = [];

    const embeds = {
      guild: buildMentionReviewEmbedForScope({
        requestedBy,
        channelId: targetChannelId,
        content,
        source,
        guild,
        includeServer: false,
      }),
      global: buildMentionReviewEmbedForScope({
        requestedBy,
        channelId: targetChannelId,
        content,
        source,
        guild,
        includeServer: true,
      }),
    };

    for (const target of reviewTargets) {
      const embed = target.scope === 'global' ? embeds.global : embeds.guild;
      if (!embed) continue;

      try {
        // eslint-disable-next-line no-await-in-loop
        const msg = await target.channel.send({ embeds: [embed], components: [row] });
        reviewMessages.push({
          channelId: target.channel.id,
          messageId: msg.id,
          scope: target.scope,
        });
      } catch (e) {
        console.error('Failed to send mention-review message to log channel:', e);
      }
    }

    if (reviewMessages.length === 0) {
      return {
        ok: false,
        reason: 'Cant post to the log channel (missing perms?) set /setlogchannel or /setgloballog again',
      };
    }

    const expiresAt = Date.now() + 60_000;
    pendingMentionReviews.set(id, {
      id,
      guildId: guild.id,
      reviewMessages,
      targetChannelId,
      replyToMessageId,
      requestedById: requestedBy?.id,
      requestedByTag: requestedBy?.tag,
      source,
      content,
      noMentionsOnApprove,
      expiresAt,
    });

    setTimeout(async () => {
      const p = pendingMentionReviews.get(id);
      if (!p) return;

      pendingMentionReviews.delete(id);

      const reviewGuild = guild || (await client.guilds.fetch(p.guildId).catch(() => null));
      const expiredEmbeds = buildMentionReviewEmbedsForPending(p, reviewGuild, 'Auto-rejected (timeout)', 0xed4245);
      await updateMentionReviewMessages(p.reviewMessages, expiredEmbeds, []);
    }, 60_000);

    return { ok: true, id };
  }

  async function sendWithMentionReview({
    guild,
    requestedBy,
    channel,
    replyToMessageId,
    content,
    source,
    allowedMentions,
    noMentionsOnApprove,
    files,
  }) {
    const danger = detectDangerousMentions(content);

    // Even if the detector misses something, we still enforce allowedMentions at send time.
    const safeAllowedMentions = allowedMentions || allowedMentionsSafe();

    if (!danger.dangerous) {
      // Safe send
      try {
        let sentMessage = null;
        await retry(async () => {
          if (replyToMessageId) {
            // Avoid fetching messages (can require Read Message History). Use reply reference instead.
            sentMessage = await channel.send({
              content,
              allowedMentions: safeAllowedMentions,
              reply: { messageReference: replyToMessageId, failIfNotExists: false },
              files,
            });
          } else {
            sentMessage = await channel.send({ content, allowedMentions: safeAllowedMentions, files });
          }
        });
        return {
          sent: true,
          reviewed: false,
          messageId: sentMessage?.id || null,
        };
      } catch (e) {
        console.error('Failed to send message:', e);
        return { sent: false, reviewed: false, error: 'send failed (missing perms?)' };
      }
    }

    if (files && files.length > 0) {
      return { sent: false, reviewed: false, error: 'mentions+files not supported' };
    }

    let res;
    try {
      res = await requestMentionReview({
        guild,
        requestedBy,
        targetChannelId: channel.id,
        replyToMessageId,
        content,
        source,
        noMentionsOnApprove: !!noMentionsOnApprove,
      });
    } catch (e) {
      console.error('Mention review request failed:', e);
      return { sent: false, reviewed: true, error: 'mention review failed' };
    }

    if (!res.ok) return { sent: false, reviewed: true, error: res.reason };
    return { sent: false, reviewed: true, reviewId: res.id };
  }

  async function processExpiredTempBans() {
    const now = Date.now();

    for (const [guildId, guildCfg] of Object.entries(config.guilds || {})) {
      if (!Array.isArray(guildCfg.tempBans) || guildCfg.tempBans.length === 0) continue;

      const expired = guildCfg.tempBans.filter((t) => t && t.expiresAt && t.expiresAt <= now);
      if (expired.length === 0) continue;

      const stillActive = guildCfg.tempBans.filter((t) => !(t && t.expiresAt && t.expiresAt <= now));
      guildCfg.tempBans = stillActive;
      saveConfig(config);

      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;

      for (const t of expired) {
        try {
          await guild.members.unban(t.userId, 'Tempban expired');

          const embed = buildModLogEmbed({
            title: 'Tempban expired (unbanned)',
            moderator: null,
            target: { id: t.userId, tag: t.userTag || 'Unknown' },
            reason: 'Tempban expired',
            extraFields: [
              { name: 'Original reason', value: t.reason || 'No reason provided', inline: false },
            ],
            color: 0x57f287,
          });
          await sendLogEmbed({ guild, config, getGuildConfig, client }, embed);
        } catch (e) {
          console.error('Failed to unban expired tempban:', e);
        }
      }
    }
  }

  // Slash command builders
  const pingCommand = new SlashCommandBuilder().setName('ping').setDescription('Shows the bot latency.');
  const helpCommand = new SlashCommandBuilder().setName('help').setDescription('DMs you the bot command list.');
  const loadstringCommand = new SlashCommandBuilder()
    .setName('loadstring')
    .setDescription('Create/update a hosted loadstring link.')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Loadstring name/slug').setRequired(true)
    )
    .addAttachmentOption((opt) =>
      opt.setName('file').setDescription('Script file attachment (preferred over inline)').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('inline').setDescription('Inline script text fallback').setRequired(false)
    );
  const lsListCommand = new SlashCommandBuilder()
    .setName('lslist')
    .setDescription('List your hosted loadstring links.');
  const lsRemoveCommand = new SlashCommandBuilder()
    .setName('lsremove')
    .setDescription('Remove one hosted loadstring.')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Loadstring name/slug to remove').setRequired(true)
    );
  const lsInfoCommand = new SlashCommandBuilder()
    .setName('lsinfo')
    .setDescription('DM detailed info for one loadstring.')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Loadstring name/slug to inspect').setRequired(true)
    );
  const setBanChannelCommand = new SlashCommandBuilder()
    .setName('setbanchannel')
    .setDescription('Set this channel as ban channel (msg => delete 24h + ban; exempt user ignored).')
    .setDMPermission(false);
  const setPrefixCommand = new SlashCommandBuilder()
    .setName('setprefix')
    .setDMPermission(false)
    .setDescription('Changes the bot prefix for this server.')
    .addStringOption((opt) => opt.setName('prefix').setDescription('New prefix, e.g. s.').setRequired(true));
  const setLogChannelCommand = new SlashCommandBuilder()
    .setName('setlogchannel')
    .setDescription('Set log channel for mod actions (mods only).')
    .setDMPermission(false);
  const attachmentsCommand = new SlashCommandBuilder()
    .setName('attachments')
    .setDMPermission(false)
    .setDescription('Toggle global attachment reading for the bot (mods only).')
    .addStringOption((opt) =>
      opt
        .setName('mode')
        .setDescription('on/off/toggle/status')
        .setRequired(false)
        .addChoices(
          { name: 'On', value: 'on' },
          { name: 'Off', value: 'off' },
          { name: 'Toggle', value: 'toggle' },
          { name: 'Status', value: 'status' }
        )
    );
  const sayCommand = new SlashCommandBuilder()
    .setName('say')
    .setDMPermission(false)
    .setDescription('Make the bot send a message (mods only).')
    .addStringOption((opt) => opt.setName('text').setDescription('Text to send').setRequired(true))
    .addStringOption((opt) =>
      opt.setName('reply_to').setDescription('Message ID to reply to (optional)').setRequired(false)
    );

  const blacklistCommand = new SlashCommandBuilder()
    .setName('blacklist')
    .setDMPermission(false)
    .setDescription('Blacklist users from using the AI chatbot (creator/whitelist only).')
    .addStringOption((opt) =>
      opt
        .setName('action')
        .setDescription('add/remove/list')
        .setRequired(true)
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' },
          { name: 'List', value: 'list' }
        )
    )
    .addUserOption((opt) => opt.setName('user').setDescription('Target user (for add/remove)').setRequired(false))
    .addStringOption((opt) => opt.setName('userid').setDescription('Target user ID (for add/remove)').setRequired(false));
  const creatorWhitelistCommand = new SlashCommandBuilder()
    .setName('creatorwhitelist')
    .setDMPermission(false)
    .setDescription('Manage creator whitelist for elevated features (creator/whitelist).')
    .addStringOption((opt) =>
      opt
        .setName('action')
        .setDescription('add/remove/list')
        .setRequired(true)
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' },
          { name: 'List', value: 'list' }
        )
    )
    .addUserOption((opt) => opt.setName('user').setDescription('Target user (for add/remove)').setRequired(false))
    .addStringOption((opt) => opt.setName('userid').setDescription('Target user ID (for add/remove)').setRequired(false));

  const muteCommand = new SlashCommandBuilder()
    .setName('mute')
    .setDMPermission(false)
    .setDescription('Timeout a member (mods only).')
    .addStringOption((opt) => opt.setName('duration').setDescription('e.g. 30m, 1d').setRequired(true))
    .addUserOption((opt) => opt.setName('user').setDescription('User to mute').setRequired(false))
    .addStringOption((opt) => opt.setName('userid').setDescription('User ID (optional)').setRequired(false))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason (optional)').setRequired(false));

  const kickCommand = new SlashCommandBuilder()
    .setName('kick')
    .setDMPermission(false)
    .setDescription('Kick a member (mods only).')
    .addUserOption((opt) => opt.setName('user').setDescription('User to kick').setRequired(false))
    .addStringOption((opt) => opt.setName('userid').setDescription('User ID (optional)').setRequired(false))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason (optional)').setRequired(false));

  // NOTE: user requested everything optional on ban/tempban
  const banCommand = new SlashCommandBuilder()
    .setName('ban')
    .setDMPermission(false)
    .setDescription('Ban a member + delete msgs (mods only).')
    .addUserOption((opt) => opt.setName('user').setDescription('User to ban').setRequired(false))
    .addStringOption((opt) => opt.setName('userid').setDescription('User ID (optional)').setRequired(false))
    .addStringOption((opt) => opt.setName('delete').setDescription('Delete time: 30m, 24h, 7d (optional)').setRequired(false))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason (optional)').setRequired(false));

  const tempbanCommand = new SlashCommandBuilder()
    .setName('tempban')
    .setDMPermission(false)
    .setDescription('Tempban a member (mods only).')
    .addUserOption((opt) => opt.setName('user').setDescription('User to tempban').setRequired(false))
    .addStringOption((opt) => opt.setName('userid').setDescription('User ID (optional)').setRequired(false))
    .addStringOption((opt) => opt.setName('duration').setDescription('e.g. 30m, 24h, 7d (optional)').setRequired(false))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason (optional)').setRequired(false));

  async function registerSlashCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    if (!client.application?.id) {
      throw new Error('client.application.id is missing; cannot register slash commands.');
    }

    await rest.put(Routes.applicationCommands(client.application.id), {
      body: [
        pingCommand.toJSON(),
        helpCommand.toJSON(),
        loadstringCommand.toJSON(),
        lsListCommand.toJSON(),
        lsRemoveCommand.toJSON(),
        lsInfoCommand.toJSON(),
        setBanChannelCommand.toJSON(),
        setPrefixCommand.toJSON(),
        setLogChannelCommand.toJSON(),
        attachmentsCommand.toJSON(),
        sayCommand.toJSON(),
        blacklistCommand.toJSON(),
        creatorWhitelistCommand.toJSON(),
        muteCommand.toJSON(),
        kickCommand.toJSON(),
        banCommand.toJSON(),
        tempbanCommand.toJSON(),
      ],
    });
  }

  function buildInviteUrl(code) {
    return `https://discord.gg/${code}`;
  }

  function pickMostUsedInvite(invites) {
    let best = null;
    for (const invite of invites.values()) {
      if (!invite?.code) continue;
      if (!best) {
        best = invite;
        continue;
      }

      const uses = Number(invite?.uses);
      const bestUses = Number(best?.uses);
      const nextUses = Number.isFinite(uses) ? uses : 0;
      const currentBestUses = Number.isFinite(bestUses) ? bestUses : 0;

      if (nextUses > currentBestUses) {
        best = invite;
        continue;
      }
      if (nextUses < currentBestUses) continue;

      const invitePermanent = !invite?.expiresTimestamp;
      const bestPermanent = !best?.expiresTimestamp;
      if (invitePermanent && !bestPermanent) {
        best = invite;
        continue;
      }
      if (invitePermanent !== bestPermanent) continue;

      const inviteCreated = Number(invite?.createdTimestamp || 0);
      const bestCreated = Number(best?.createdTimestamp || 0);
      if (inviteCreated > bestCreated) best = invite;
    }
    return best;
  }

  async function getGuildInviteUrl(guild) {
    let inviteUrl = null;

    try {
      const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
      if (!me) return inviteUrl;

      const invites = await guild.invites.fetch().catch(() => null);
      if (invites?.size) {
        const pickedInvite = pickMostUsedInvite(invites);
        if (pickedInvite?.code) {
          inviteUrl = buildInviteUrl(pickedInvite.code);
          return inviteUrl;
        }
      }

      const channels = await guild.channels.fetch().catch(() => null);
      if (!channels || channels.size === 0) return inviteUrl;

      const candidates = [...channels.values()].filter((channel) => {
        if (!channel || typeof channel.createInvite !== 'function') return false;
        const perms = channel.permissionsFor(me);
        return !!(
          perms?.has(PermissionsBitField.Flags.ViewChannel) &&
          perms?.has(PermissionsBitField.Flags.CreateInstantInvite)
        );
      });

      for (const channel of candidates) {
        // eslint-disable-next-line no-await-in-loop
        const createdInvite = await channel
          .createInvite({
            maxAge: 0,
            maxUses: 0,
            unique: false,
            reason: 'servers command inventory',
          })
          .catch(() => null);
        if (createdInvite?.code) {
          inviteUrl = buildInviteUrl(createdInvite.code);
          break;
        }
      }

      return inviteUrl;
    } catch {
      return inviteUrl;
    }
  }

  async function buildServerInventory({ includeInvites = true } = {}) {
    const guilds = [...client.guilds.cache.values()].sort((a, b) => {
      const aMembers = Number.isFinite(Number(a?.memberCount)) ? Number(a.memberCount) : 0;
      const bMembers = Number.isFinite(Number(b?.memberCount)) ? Number(b.memberCount) : 0;
      if (bMembers !== aMembers) return bMembers - aMembers;
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    });
    const lines = [];

    for (let i = 0; i < guilds.length; i += 1) {
      const g = guilds[i];
      const inviteUrl = includeInvites ? await getGuildInviteUrl(g) : null;
      const invitePart = includeInvites ? ` | invite: ${inviteUrl || 'n/a'}` : '';
      const memberPart = typeof g.memberCount === 'number' ? ` | members: ${g.memberCount}` : '';
      lines.push(`${i + 1}. ${g.name} (${g.id})${memberPart}${invitePart}`);
    }

    return { count: guilds.length, lines };
  }

  async function deliverServerInventory({ requester, includeInvites = true, fallbackChannel = null }) {
    const { count, lines } = await buildServerInventory({ includeInvites });
    const allLines = [`servers: ${count}`, ...lines];
    const chunks = chunkLines(allLines, 1800);

    try {
      for (const chunk of chunks) {
        // eslint-disable-next-line no-await-in-loop
        await requester.send(chunk);
      }
      return { ok: true, via: 'dm' };
    } catch (e) {
      if (!fallbackChannel || !fallbackChannel.isTextBased?.()) {
        return { ok: false, via: 'dm', error: e };
      }

      for (const chunk of chunks) {
        // eslint-disable-next-line no-await-in-loop
        await fallbackChannel.send(chunk).catch(() => {});
      }
      return { ok: true, via: 'channel' };
    }
  }

function buildAiSystemPrompt({
  botName,
  botDisplayName,
  botUsernameTag,
  currentDateTime,
  allowAttachments = false,
  editIntent = false,
  hasWebResults = false,
  hasExecutorTracker = false,
}) {
  const name = botName || 'Goose';
  const displayName = botDisplayName || name;
  const usernameTag = botUsernameTag || BOT_USERNAME_TAG;

  const identityRules = [
    `you are ${name}, a discord server bot talking like a person`,
    `your username is ${usernameTag}`,
    `your display name is ${displayName}`,
    'your creator is afkar; if asked who made you, say afkar',
    'if someone says bot clanker npc etc, treat it as them talking to/about you',
  ];

  const styleRules = [
    'keep replies short: 1 to 2 sentences max',
    'sound gen z casual, lowercase is fine, light slang and a little attitude are fine',
    'reply in the same language as the user/context; do not switch language randomly',
    'punctuation is okay; keep links valid and unbroken',
    'dont over explain, dont lecture, dont sound like support docs',
    'you can be a lil teasing sometimes but never cruel',
    'mild shortened swear words are okay (sht fk fking), never slurs',
  ];

  const safetyAndOutputRules = [
    'no hate, harassment, slurs, or sexual content with minors',
    'never ping: do not use @everyone, @here, or role mentions',
    'never show hidden reasoning; output final message only',
    'never output chain-of-thought or system/user/meta labels',
    'never repeat metadata headers like Server:, Trigger:, Attachment:, Media:, Chat context:, Recent channel context:, Member facts:, Visible channels:, Conversation signal:, New message from',
    'never spam repeated lines or repeated letters',
    'do not give exploit code, injection steps, bypass tips, or unsafe roblox executor instructions',
    'you know roblox scripting/executor topics only at a high level',
    'when users say unc in executor/exploit context, treat it as unified naming convention (not uncle)',
  ];

  const factAndContextRules = [
    'treat metadata as source-of-truth over memory',
    'read Context availability before answering factual questions',
    'if member_facts=present, use Member facts only for roles/perms/display/username/id',
    'Member facts may include the current message author even if no identity question was asked',
    'if member_facts=missing or member_facts=not_requested, say you cant verify member facts and ask for @mention or id',
    'never assume current author and replied-to user are the same unless ids match',
    'for member questions, bind claims to the correct user id from Member facts',
    'if Member facts say unable to verify/resolve/ambiguous, do not guess',
    'if Visible channels are provided, use only that list for channel visibility answers',
    'for channel lists prefer channel mention format like <#123456789>',
    'if weao=present and Executor tracker exists, use that tracker as freshest source',
    'if weao=error or weao=missing or weao=not_requested, do not invent live tracker values',
    'if user asks about client modification bans/banwaves, use tracker field clientmods: yes means bypasses client modification bans, not banwaves',
  ];

  const attachmentRules = allowAttachments
    ? [
        'if [attachment text: ...] appears you can use that text',
        'if [attachment image: ...] appears you can use caption and ocr text if present',
        'if [sticker: ...] appears you can use sticker metadata',
        'if [emoji: ...] appears you can use emoji context',
        'if caption/ocr are unavailable ask user to describe the image',
      ]
    : ['if Attachment: yes, say you cant check attachments and ask user to describe it'];

  const runtimeRules = [];
  if (currentDateTime?.localText && currentDateTime?.isoUtc) {
    runtimeRules.push(
      `current datetime in ${currentDateTime.timeZone} is ${currentDateTime.localText}`,
      `current utc datetime is ${currentDateTime.isoUtc}`,
      'if user asks for current date/time, use this runtime context exactly'
    );
  }

  const modeRules = [];
  if (editIntent) {
    modeRules.push(
      'the user wants you to edit the attached file',
      'reply with ONLY the full updated file in one code block and no extra text'
    );
  } else if (allowAttachments) {
    modeRules.push('if user asks for explanation, avoid code blocks unless they ask for code');
  }
  if (hasWebResults) {
    modeRules.push('if Web pages/search results are provided, you may use them to answer');
  }
  if (hasExecutorTracker) {
    modeRules.push('Executor tracker block is provided and should be treated as authoritative for live executor status');
  }

  return [
    'Identity Rules:',
    ...identityRules.map((line) => `- ${line}`),
    '',
    'Style Rules:',
    ...styleRules.map((line) => `- ${line}`),
    '',
    'Safety And Output Rules:',
    ...safetyAndOutputRules.map((line) => `- ${line}`),
    '',
    'Fact And Context Rules:',
    ...factAndContextRules.map((line) => `- ${line}`),
    '',
    'Attachment Rules:',
    ...attachmentRules.map((line) => `- ${line}`),
    ...(runtimeRules.length > 0
      ? ['', 'Runtime Rules:', ...runtimeRules.map((line) => `- ${line}`)]
      : []),
    ...(modeRules.length > 0
      ? ['', 'Mode Rules:', ...modeRules.map((line) => `- ${line}`)]
      : []),
  ].join('\n');
}

function buildRawAiSystemPrompt({
  currentDateTime,
  allowAttachments = false,
  editIntent = false,
  hasWebResults = false,
  hasExecutorTracker = false,
}) {
  const base = [
    'you are a direct assistant in discord',
    'no roleplay no personality',
    'reply directly to the user request',
    'keep it concise unless asked for detail',
    'for factual claims, prefer provided metadata/context over memory',
    'if context says member_facts missing/not_requested, do not guess member roles/perms/display names',
    'if context says weao missing/error/not_requested, do not invent live executor tracker values',
  ];

  if (currentDateTime?.localText && currentDateTime?.isoUtc) {
    base.push(
      `current datetime in ${currentDateTime.timeZone} is ${currentDateTime.localText}`,
      `current utc datetime is ${currentDateTime.isoUtc}`,
      'if user asks date or time use this runtime context'
    );
  }

  if (allowAttachments) {
    base.push(
      'if [attachment text: ...] appears you can use that text',
      'if [attachment image: ...] appears you can use caption and ocr text',
      'if [sticker: ...] appears you can use sticker metadata',
      'if [emoji: ...] appears you can use emoji context'
    );
  } else {
    base.push('if Attachment: yes and content is missing ask user to describe it');
  }

  if (editIntent) {
    base.push(
      'the user wants a file edit',
      'reply with only the full updated file in a single code block'
    );
  }

  if (hasWebResults) {
    base.push('if web pages or search results are provided use them as primary context');
  }
  if (hasExecutorTracker) {
    base.push('if executor tracker block is present use it as authoritative');
  }

  return base.join(' ');
}

function applyHfProvider(providerKey) {
  const key = String(providerKey || '').trim().toLowerCase();
  const model = HF_PROVIDER_PRESETS[key];
  if (!model) return null;
  config.hfChatModel = key;
  saveConfig(config);
  return { key, model };
}

function computeDynamicTemperature({ messageText, isRandomTrigger, editIntent, hasAttachments }) {
  const t = String(messageText || '').toLowerCase();
  if (editIntent) return 0.35;
  if (/(bug|error|stack|fix|debug|refactor|optimi[sz]e|patch|rewrite)/.test(t)) return 0.5;
  if (/(explain|help|how|why|what|guide|doc)/.test(t)) return 0.6;
  if (/(story|poem|joke|roast|rap|creative|meme)/.test(t)) return 0.95;
  if (isRandomTrigger) return 1.0;
  if (hasAttachments) return 0.55;
  return 0.75;
}

  async function handleAiChat(message, context = {}) {
    // Allow either env var key or a managed key list.
    // If both exist, we prefer the managed list.
    const hfKeys = Array.isArray(config.hfApiKeys) ? config.hfApiKeys.filter(Boolean) : [];
    if (!HUGGINGFACE_API_KEY && hfKeys.length === 0) return;
    if (!message.guild || !message.channel?.isTextBased?.()) return;

    // Avoid responding to commands
    const guildCfg = getGuildConfig(config, message.guild.id);
    const prefix = guildCfg.prefix || DEFAULT_PREFIX;
    if (message.content?.startsWith(prefix)) return;

    // Blacklist check (defense-in-depth).
    if (isUserAiBlacklisted(config, guildCfg, message.author.id)) return;

    const botMentionA = client.user ? `<@${client.user.id}>` : '';
    const botMentionB = client.user ? `<@!${client.user.id}>` : '';
    const rawPrompt = (message.content || '')
      .replaceAll(botMentionA, '')
      .replaceAll(botMentionB, '')
      .trim();
    const prompt = rawPrompt || '[ping only no text]';

    // Rate limit (defense-in-depth).
    if (!context?.rateLimitSkip) {
      const pingOnly = !rawPrompt;
      const limit = pingOnly ? AI_RATE_LIMIT_PING_ONLY_PER_MINUTE : AI_RATE_LIMIT_PER_MINUTE;
      const rl = addToUserBucket(aiRateLimitBuckets, message.author.id, Date.now(), { limit, windowMs: 60_000 });
      if (!rl.ok) {
        await safeReply(message, {
          content: `slow down (${limit}/min)`,
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }
    }

    if (isBotInviteRequest(rawPrompt)) {
      await safeReplyTracked(message, {
        content: `here u go: [invite me](${BOT_INVITE_URL})`,
        allowedMentions: allowedMentionsSafe(),
      }, 'ai-invite-link');
      return;
    }

    // Start typing early so users always see feedback while we gather context / call AI.
    // This fixes cases where we returned early or did pre-work before startTyping() was called.
    const stopTyping = startTyping(message.channel);

    // Register in-flight request early so the watchdog can nudge even if context-building is slow.
    aiInFlight.set(message.id, {
      message,
      startedAt: Date.now(),
      nudged: false,
      isLightChat: false,
    });

    try {
      const allowAttachments = !!config.allowAttachments;
      const aiRawMode = !!config.aiRawMode;
      const currentHasMedia = hasMediaAttachment(message);
      const currentDateTime = buildCurrentDateTimeContext({
        timeZone: BOT_TIMEZONE,
        locale: BOT_TIME_LOCALE,
      });
      const wantsExecutorTracker = isExecutorQuestion(message.content || '');
      const wantsExecutorStatusFacts = wantsExecutorTracker && isExecutorStatusFactRequestText(message.content || '');
      let executorTrackerBlock = '';
      let executorTrackerError = '';
      if (wantsExecutorTracker) {
        try {
          const exploits = await fetchAllExploits();
          if (exploits.length > 0) {
            executorTrackerBlock = buildExecutorTrackerSummary(
              exploits,
              message.content || '',
              WEAO_MAX_MATCHES
            );
          }
        } catch (e) {
          executorTrackerError = summarizeErr(e);
          console.error('WEAO executor tracker failed:', e?.message || e);
        }
      }

      const keyPoolForImages = (hfKeys.length > 0 ? hfKeys : [HUGGINGFACE_API_KEY]).filter(Boolean);

      const webQuery = extractWebSearchQuery(message.content || '');
      let webResults = [];
      if (webQuery) {
        try {
        webResults = await performWebSearch(webQuery);
        } catch (e) {
          console.error('Web search failed:', e);
        }
      }

      const directUrls = extractUrls(message.content || '');
      const directPages = [];
      if (directUrls.length > 0) {
        for (const url of directUrls) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const content = await fetchWebPageText(url);
          directPages.push({ url, content });
        } catch (e) {
          directPages.push({ url, content: '' });
        }
      }
    }

    async function fetchAttachmentBuffer(attachment) {
      try {
        const res = await fetch(attachment.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ab = await res.arrayBuffer();
        return Buffer.from(ab);
      } catch (e) {
        const name = stripControlChars(attachment?.name || 'image') || 'image';
        console.error(`[ai-media] failed to fetch image attachment ${name}:`, summarizeErr(e));
        return null;
      }
    }

    async function analyzeImage(attachment) {
      if (!allowAttachments || !keyPoolForImages.length) return { caption: '', ocrText: '' };
      const size = Number(attachment?.size || 0);
      if (size && size > MAX_IMAGE_ATTACHMENT_BYTES) return { caption: '', ocrText: '' };

      const buf = await fetchAttachmentBuffer(attachment);
      if (!buf) return { caption: '', ocrText: '' };

      const imageModel = String(RUNTIME_HF_IMAGE_MODEL || DEFAULT_HF_IMAGE_MODEL).trim();
      const ocrModel = String(RUNTIME_HF_OCR_MODEL || DEFAULT_HF_OCR_MODEL).trim();
      const imageName = stripControlChars(attachment?.name || 'image') || 'image';
      for (const key of keyPoolForImages) {
        const maskedKey = maskApiKey(key);
        const [captionResult, ocrResult] = await Promise.allSettled([
          withTimeout(
            huggingfaceImageCaption({
              apiKey: key,
              imageBuffer: buf,
              imageMimeType: attachment?.contentType || 'image/jpeg',
              model: imageModel,
              timeoutMs: IMAGE_ANALYSIS_TIMEOUT_MS,
            }),
            IMAGE_ANALYSIS_TIMEOUT_MS,
            'image caption timeout'
          ),
          withTimeout(
            huggingfaceImageOcr({
              apiKey: key,
              imageBuffer: buf,
              imageMimeType: attachment?.contentType || 'image/jpeg',
              model: ocrModel,
              timeoutMs: IMAGE_ANALYSIS_TIMEOUT_MS,
            }),
            IMAGE_ANALYSIS_TIMEOUT_MS,
            'image ocr timeout'
          ),
        ]);
        const caption = captionResult.status === 'fulfilled' ? String(captionResult.value || '') : '';
        const ocrText = ocrResult.status === 'fulfilled' ? String(ocrResult.value || '') : '';
        if (captionResult.status === 'rejected') {
          const captionErr = summarizeErr(captionResult.reason);
          markHfInferenceUsage(key, {
            kind: 'imageCaption',
            ok: false,
            error: captionErr,
          });
          console.error(
            `[ai-media] caption failed for ${imageName} via ${imageModel} (${maskedKey}):`,
            captionErr
          );
        } else {
          markHfInferenceUsage(key, { kind: 'imageCaption', ok: true });
        }
        if (ocrResult.status === 'rejected') {
          const ocrErr = summarizeErr(ocrResult.reason);
          markHfInferenceUsage(key, {
            kind: 'imageOcr',
            ok: false,
            error: ocrErr,
          });
          console.error(
            `[ai-media] ocr failed for ${imageName} via ${ocrModel} (${maskedKey}):`,
            ocrErr
          );
        } else {
          markHfInferenceUsage(key, { kind: 'imageOcr', ok: true });
        }
        if (caption || ocrText) {
          return {
            caption: stripOutputControlChars(caption || ''),
            ocrText: stripOutputControlChars(ocrText || ''),
          };
        }
        console.error(
          `[ai-media] no caption/ocr text produced for ${imageName} using key ${maskedKey} (models: ${imageModel}, ${ocrModel})`
        );
      }

      return { caption: '', ocrText: '' };
    }

    const hasFileAttachments = !!(message.attachments && message.attachments.size > 0);
    const hasStickerMedia = !!(message.stickers && message.stickers.size > 0);
    const hasEmojiInContent =
      extractCustomEmojiTokens(message.content || '').length > 0 ||
      extractUnicodeEmojiTokens(message.content || '').length > 0;
    const shouldBuildAttachmentContext = hasFileAttachments || hasStickerMedia || hasEmojiInContent;
    const attachmentContext = shouldBuildAttachmentContext
      ? await buildAttachmentContext(message, {
        analyzeImage,
        includeFileAttachments: allowAttachments,
      })
      : null;

    async function sendAiNotice(content, source = 'ai-notice') {
      const sendOutcome = await sendAiReplyGuaranteed({
        content,
        fallbackText: FALLBACK_AI_REPLY_TEXT,
        forceVisibleReply: AI_FORCE_VISIBLE_REPLY,
        sendPrimary: (text) => sendWithMentionReview({
          guild: message.guild,
          requestedBy: message.author,
          channel: message.channel,
          replyToMessageId: message.id,
          content: text,
          source: 'ai',
          allowedMentions: allowedMentionsAiReplyPing(),
          noMentionsOnApprove: true,
        }),
        sendFallback: (text) => safeReplyTracked(message, {
          content: text,
          allowedMentions: allowedMentionsSafe(),
        }, source),
      });

      const primary = sendOutcome.primary || null;
      if (primary?.sent && primary?.messageId) {
        trackBotMessage({ id: primary.messageId }, source);
      }
      return sendOutcome;
    }

    if (currentHasMedia) {
      if (!allowAttachments && hasFileAttachments) {
        const attachReply = 'cant check attachments btw describe it';
        await sendAiNotice(attachReply, 'ai-attachment-disabled');
        return;
      }

      const readableMediaCount =
        (attachmentContext?.allowed?.length || 0) +
        (attachmentContext?.stickers?.length || 0) +
        (attachmentContext?.emoji?.custom?.length || 0) +
        (attachmentContext?.emoji?.unicode?.length || 0);
      const unsupportedMedia = readableMediaCount === 0;

      if (unsupportedMedia) {
        const attachReply =
          'i can read images text files stickers and emoji but this media type is unsupported rn';
        await sendAiNotice(attachReply, 'ai-attachment-unsupported');
        return;
      }
    }

    const textAttachmentEntries = attachmentContext?.allowed?.filter((entry) => entry.info.kind === 'text') || [];
    const editIntent = allowAttachments && textAttachmentEntries.length > 0 && isEditIntent(message.content);

    let editTarget = textAttachmentEntries[0] || null;
    if (editIntent && textAttachmentEntries.length > 1) {
      const msgLower = String(message.content || '').toLowerCase();
      editTarget = textAttachmentEntries.find((entry) => {
        const name = String(entry.info.name || '').toLowerCase();
        const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
        return (name && msgLower.includes(name)) || (base && msgLower.includes(base));
      }) || null;

      if (!editTarget) {
        await sendAiNotice('send one file or say which filename u want edited', 'ai-edit-ambiguous');
        return;
      }
    }

    // Build deeper reply chain context.
    // For very short "light chat" prompts, skip long context fetch to reduce latency.
    const isProbablyLightChat =
      !currentHasMedia &&
      !extractWebSearchQuery(message.content || '') &&
      extractUrls(message.content || '').length === 0 &&
      String(message.content || '').trim().length <= 60;

    const replyChain = isProbablyLightChat && !context.repliedToMessageId
      ? []
      : await fetchReplyChain(message, MAX_REPLY_CHAIN_DEPTH).catch(() => []);

    // If we already got a replied message via the trigger path, and chain fetch missed it,
    // include it so the model knows exactly who was replied to.
    if (context.repliedToMessageId && context.repliedText && replyChain.length === 0) {
      replyChain.push({
        author: {
          id: context.repliedAuthorId,
          tag: context.repliedAuthorTag,
          bot: !!context.repliedAuthorIsBot,
        },
        content: context.repliedText,
        attachments: { size: 0 },
        stickers: { size: 0 },
        embeds: [],
      });
    }

    const replyContextMessages = replyChain
      .slice(0, MAX_REPLY_CHAIN_DEPTH)
      .reverse();

    let randomContextMessages = [];
    if (replyContextMessages.length === 0 && context.isRandomTrigger) {
      const recentMessages = await fetchRecentChannelMessages(message, MAX_RANDOM_CONTEXT_SCAN).catch(() => []);
      randomContextMessages = selectAdaptiveFallbackContext(recentMessages, message, {
        minKeep: MIN_RANDOM_CONTEXT_KEEP,
        maxKeep: MAX_RANDOM_CONTEXT_KEEP,
        prefix,
      });
    }

    const contextMessages =
      replyContextMessages.length > 0
        ? replyContextMessages
        : randomContextMessages;
    const contextLabel =
      replyContextMessages.length > 0
        ? 'Chat context'
        : randomContextMessages.length > 0
          ? 'Recent channel context'
          : '';
    const contextText = contextMessages.length
      ? contextMessages.map((m) => formatMessageForContext(m)).join('\n\n')
      : '';
    const threadParticipants = new Set(
      replyContextMessages
        .map((m) => String(m?.author?.id || ''))
        .filter(Boolean)
    );
    const currentAuthorId = message?.author?.id ? String(message.author.id) : '';
    const threadNewParticipantLine = THREAD_NEW_PARTICIPANT_SIGNAL && replyContextMessages.length > 0
      ? `Conversation signal: thread_participants=${threadParticipants.size}, current_author_new_to_thread=${
        currentAuthorId && !threadParticipants.has(currentAuthorId) ? 'yes' : 'no'
      }`
      : '';

    const repliedText = context.repliedText ? stripControlChars(String(context.repliedText)) : '';
    const repliedAuthorTag = context.repliedAuthorTag ? stripControlChars(String(context.repliedAuthorTag)) : '';
    const repliedAuthorDisplayName = context.repliedAuthorDisplayName
      ? stripControlChars(String(context.repliedAuthorDisplayName))
      : '';
    const repliedAuthorIsMod = !!context.repliedAuthorIsMod;
    const repliedAuthorIsBot = !!context.repliedAuthorIsBot;

    const repliedWho = repliedAuthorDisplayName || repliedAuthorTag || 'someone';
    const repliedId = context.repliedAuthorId ? String(context.repliedAuthorId) : '';

    const repliedMeta = repliedText
      ? ` (replied-to user: ${repliedWho}${repliedId ? ` | id ${repliedId}` : ''}${repliedAuthorIsMod ? ' | moderator' : ''}${repliedAuthorIsBot ? ' | bot' : ''})`
      : '';

    const guildName = stripControlChars(message.guild?.name || 'unknown');

    const serverMetaLine = `Server: ${guildName}`;
    const dateTimeMetaLine =
      `Current datetime (${currentDateTime.timeZone}): ${currentDateTime.localText}` +
      ` | UTC: ${currentDateTime.isoUtc}` +
      ` | Unix: ${currentDateTime.unixSeconds}`;

    const attachmentFlag = hasFileAttachments ? 'Attachment: yes' : 'Attachment: no';
    const mediaFlag = currentHasMedia ? 'Media: yes' : 'Media: no';
    const attachmentLines =
      attachmentContext?.lines?.length
        ? `\nAttachments:\n${attachmentContext.lines.join('\n')}`
        : '';
    const triggerFlag = context.isRandomTrigger ? 'Trigger: random' : 'Trigger: direct';
    const executorLines = executorTrackerBlock
      ? `\nExecutor tracker (WEAO live):\n${executorTrackerBlock}`
      : '';
    const webLines =
      webResults.length > 0
        ? `\nWeb search results:\n${webResults
            .map((r, i) => {
              const bits = [];
              bits.push(`${i + 1}. ${r.title || 'Untitled'} (${r.url || 'n/a'})`);
              if (r.snippet) bits.push(`Snippet: ${r.snippet}`);
              if (r.content) bits.push(`Content: ${r.content}`);
              return bits.join('\n');
            })
            .join('\n')}`
        : '';
    const directLines =
      directPages.length > 0
        ? `\nWeb pages:\n${directPages
            .map((p, i) => {
              const body = p.content || '(no readable content)';
              return `${i + 1}. ${p.url}\nContent: ${body}`;
            })
            .join('\n')}`
        : '';
    const wantsMemberFacts = shouldBuildMemberFactsContext(message, context);
    let askedMemberTargets = wantsMemberFacts
      ? await extractAskedMemberTargets(message, context)
      : [];
    const authorFactsTarget =
      MEMBER_FACTS_ALWAYS_INCLUDE_AUTHOR && message.guild
        ? buildAuthorMemberFactsTarget(message)
        : null;
    if (authorFactsTarget) {
      const withoutAuthor = askedMemberTargets.filter((t) => String(t?.id || '') !== authorFactsTarget.id);
      askedMemberTargets = [authorFactsTarget, ...withoutAuthor].slice(0, 5);
    }
    const memberFactsBlock = askedMemberTargets.length > 0
      ? await buildMemberFactsBlock(message.guild, askedMemberTargets, {
          forceRefresh: wantsMemberFacts && MEMBER_FACTS_FORCE_REFRESH_ON_INTENT,
        })
      : '';
    const memberFactsStatus = memberFactsBlock
      ? 'present'
      : wantsMemberFacts
        ? 'missing'
        : 'not_requested';
    const executorStatus = !wantsExecutorTracker
      ? 'not_requested'
      : executorTrackerBlock
        ? 'present'
        : executorTrackerError
          ? 'error'
          : 'missing';
    const contextAvailabilityLine = `Context availability: member_facts=${memberFactsStatus}, weao=${executorStatus}`;
    const executorErrorLine = executorTrackerError
      ? `\nWEAO error: ${stripOutputControlChars(executorTrackerError)}`
      : '';

    // Visible channel list is expensive to compute (fetches + permission checks). Only do it when needed.
    const wantsVisibleChannels = /\bchannels?\b/i.test(message.content || '') &&
      /\b(list|show|see|visible|access|where|which|what)\b/i.test(message.content || '');
    const visibleChannelsBlock = wantsVisibleChannels
      ? await buildVisibleChannelsBlock(message.guild)
      : '';

    const authorTagSafe =
      stripControlChars(message.author?.tag || message.author?.username || '') || 'unknown user';

    const metadataBlock =
      `${serverMetaLine}\n${dateTimeMetaLine}\n${attachmentFlag}\n${mediaFlag}\n${triggerFlag}\n${contextAvailabilityLine}` +
      `${threadNewParticipantLine ? `\n${threadNewParticipantLine}` : ''}` +
      `${executorErrorLine}${attachmentLines}${executorLines}${webLines}${directLines}${memberFactsBlock}${visibleChannelsBlock}`;

    const userPayload = contextText
      ? `${contextLabel}\n\n${contextText}\n\n${metadataBlock}\nNew message from ${authorTagSafe}${repliedMeta}: ${prompt}`
      : repliedText
        ? `${metadataBlock}\nUser ${authorTagSafe}${repliedMeta} replied: ${prompt}\n\nThey replied to this message: ${repliedText}`
        : `${metadataBlock}\nUser ${authorTagSafe}${repliedMeta} said: ${prompt}`;

    const rawBotDisplayName =
      message.guild?.members?.me?.displayName ||
      message.guild?.members?.me?.user?.username ||
      client.user?.username ||
      'Goose';
    const botDisplayName = stripControlChars(rawBotDisplayName) || 'Goose';

    const botName = pickBotNameFromDisplayName(botDisplayName);
    const systemText = aiRawMode
      ? buildRawAiSystemPrompt({
          currentDateTime,
          allowAttachments,
          editIntent,
          hasWebResults: webResults.length > 0 || directPages.length > 0,
          hasExecutorTracker: !!executorTrackerBlock,
        })
      : buildAiSystemPrompt({
          botName,
          botDisplayName,
          botUsernameTag: BOT_USERNAME_TAG,
          currentDateTime,
          allowAttachments,
          editIntent,
          hasWebResults: webResults.length > 0 || directPages.length > 0,
          hasExecutorTracker: !!executorTrackerBlock,
        });

    // Typing indicator is already running (started early). We'll stop it in the finalizer.

    const aiCallTimeoutMs = AI_CALL_TIMEOUT_MS;
    const hasAttachmentContext = attachmentContext?.lines?.length > 0;
    const hasWebContext = webResults.length > 0 || directPages.length > 0;
    const isLightChat =
      !editIntent &&
      !hasAttachmentContext &&
      !hasWebContext &&
      String(message.content || '').trim().length <= 60;
    const maxTokens = editIntent || hasAttachmentContext || hasWebContext
      ? 1000
      : isLightChat
        ? 200
        : 420;
    const aiTimeout = editIntent || hasAttachmentContext || hasWebContext
      ? Math.max(aiCallTimeoutMs, 45_000)
      : isLightChat
        ? Math.min(aiCallTimeoutMs, 15_000)
        : aiCallTimeoutMs;
    const temperature = computeDynamicTemperature({
      messageText: message.content || '',
      isRandomTrigger: context.isRandomTrigger,
      editIntent,
      hasAttachments: hasAttachmentContext,
    });

    // Update in-flight entry with final light-chat classification (keep original startedAt).
    const prevInFlight = aiInFlight.get(message.id);
    aiInFlight.set(message.id, {
      message,
      startedAt: prevInFlight?.startedAt || Date.now(),
      nudged: !!prevInFlight?.nudged,
      isLightChat,
    });

    let aiText = '';
    async function callAiOnce({ system, temperature = 0.9, maxTokens = 420 } = {}) {
      const keyPool = (hfKeys.length > 0 ? hfKeys : [HUGGINGFACE_API_KEY]).filter(Boolean);
      let lastErr = null;

      for (const key of keyPool) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const text = await withTimeout(
            huggingfaceChatCompletion({
              apiKey: key,
              model: resolveHfChatModel(),
              temperature,
              maxTokens,
              timeoutMs: 90_000,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: userPayload },
              ],
            }),
            aiTimeout,
            `AI call exceeded ${aiTimeout}ms`
          );

          lastErr = null;
          markHfInferenceUsage(key, { kind: 'chat', ok: true });
          hfDepletedCounts.delete(key);
          return text;
        } catch (e) {
          lastErr = e;
          markHfInferenceUsage(key, {
            kind: 'chat',
            ok: false,
            error: summarizeErr(e),
          });

          if (isHfCreditDepletedError(e)) {
            const nextCount = (hfDepletedCounts.get(key) || 0) + 1;
            hfDepletedCounts.set(key, nextCount);

            const masked = maskApiKey(key);
            const totalKeys = keyPool.length;
            const remainingKeys = keyPool.filter((k) => k && k !== key).length;
            const remainingInfo = totalKeys ? ` | keys left ${remainingKeys}/${totalKeys}` : '';

            if (!hfDepletedGlobalPinged.has(key)) {
              const pingedGlobal = await pingCreatorInGlobalLog(client, config, {
                guild: message.guild,
                text: `hf api key depleted${masked ? ` (${masked})` : ''}${remainingInfo}`,
              });
              if (pingedGlobal) {
                hfDepletedGlobalPinged.add(key);
              } else {
                console.error(`Global depletion ping not delivered for HF key ${masked}; will retry.`);
              }
            }

            if (!hfDepletedCreatorNotified.has(key)) {
              const notifiedFallback = await notifyCreatorLowCredits(client, { guild: message.guild, keyMasked: masked });
              if (notifiedFallback) {
                hfDepletedCreatorNotified.add(key);
              } else {
                console.error(`Fallback depletion alert not delivered for HF key ${masked}; will retry.`);
              }
            }

            // After repeated failures, remove depleted managed keys from the pool.
            if (nextCount >= 3) {
              if (hfKeys.length > 0) {
                const before = (config.hfApiKeys || []).length;
                config.hfApiKeys = (config.hfApiKeys || []).filter((k) => k !== key);
                saveConfig(config);
                hfDepletedCounts.delete(key);
                console.error(
                  `Removed depleted HF key ${masked} after ${nextCount} errors (${before} -> ${config.hfApiKeys.length})`
                );
              }
            }

            continue;
          }

          hfDepletedCounts.delete(key);
          // try next key
        }
      }

      if (lastErr) throw lastErr;
      return '';
    }

    try {
      aiText = await callAiOnce({ system: systemText, temperature, maxTokens });
    } catch (e) {
      console.error('AI error:', e);
      await safeReply(message, {
        content: isHfCreditDepletedError(e)
          ? 'hf credits cooked no keys left'
          : 'my bad ai is taking too long try again in a sec',
        allowedMentions: allowedMentionsAiReplyPing(),
      });
      return;
    }

    if (!aiRawMode) {
      aiText = stripModelThinking(aiText);
    } else {
      aiText = String(aiText || '').trim();
    }

    if (editIntent && editTarget) {
      let rawCode = extractCodeForEdit(aiText);
      if (!rawCode) {
        await safeReply(message, {
          content: 'couldnt edit that file try again',
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      if (!aiRawMode && (looksLikePromptLeak(rawCode) || looksLikeReasoningLeak(rawCode))) {
        await safeReply(message, {
          content: 'edit failed try again',
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      if (rawCode.length > MAX_TEXT_ATTACHMENT_OUTPUT_CHARS) {
        rawCode = `${rawCode.slice(0, MAX_TEXT_ATTACHMENT_OUTPUT_CHARS)}...`;
      }

      const fileName = stripControlChars(editTarget.info?.name || 'edited.txt') || 'edited.txt';
      const buffer = Buffer.from(rawCode, 'utf8');
      const fileMsg = `edited ${fileName}`;

      const sendRes = await sendWithMentionReview({
        guild: message.guild,
        requestedBy: message.author,
        channel: message.channel,
        replyToMessageId: message.id,
        content: fileMsg,
        source: 'ai',
        allowedMentions: allowedMentionsAiReplyPing(),
        noMentionsOnApprove: true,
        files: [{ attachment: buffer, name: fileName }],
      });

      if (sendRes.sent) {
        if (sendRes.messageId) {
          trackBotMessage({ id: sendRes.messageId }, 'ai-edit');
        }
        const embed = buildModLogEmbed({
          title: 'AI edited attachment',
          moderator: message.author,
          target: null,
          reason: 'AI attachment edit',
          extraFields: [
            { name: 'Channel', value: `${message.channel} (\`${message.channel.id}\`)`, inline: false },
            { name: 'User message', value: neutralizeMentions(message.content?.slice(0, 1024) || '(empty)'), inline: false },
            { name: 'Edited file', value: fileName, inline: true },
          ],
          color: 0x57f287,
        });
        await sendLogEmbed({ guild: message.guild, config, getGuildConfig, client }, embed);
        return;
      }

      await safeReplyTracked(message, {
        content: 'failed to send edited file',
        allowedMentions: allowedMentionsAiReplyPing(),
      }, 'ai-edit-fallback');
      return;
    }

    if (!aiRawMode) {
      let sanitized = sanitizeAiOutput(aiText);
      aiText = sanitized.text;

      if (!aiText) {
        let retryErr = null;
        try {
          const strictSystem = buildStrictSystemPrompt(systemText);
          const retryText = await callAiOnce({
            system: strictSystem,
            temperature: Math.min(temperature, 0.6),
            maxTokens: isLightChat ? Math.min(maxTokens, 200) : maxTokens,
          });
          sanitized = sanitizeAiOutput(stripModelThinking(retryText));
          aiText = sanitized.text;
        } catch (e) {
          retryErr = e;
        }

        if (!aiText) {
          const reasonList = sanitized.analysis?.reasons?.length
            ? sanitized.analysis.reasons.join(', ')
            : 'unknown';
          const rawPreview = sanitized.analysis?.cleaned || '';

          const embed = buildModLogEmbed({
            title: 'AI output blocked',
            moderator: message.author,
            target: null,
            reason: `Sanitized (${reasonList})${retryErr ? ' after retry' : ''}`,
            extraFields: [
              { name: 'Channel', value: `${message.channel} (\`${message.channel.id}\`)`, inline: false },
              {
                name: 'User message',
                value: neutralizeMentions(message.content?.slice(0, 1024) || '(empty)'),
                inline: false,
              },
              {
                name: 'Model output (raw)',
                value: neutralizeMentions(rawPreview.slice(0, 1024) || '(empty)'),
                inline: false,
              },
            ],
            color: 0xed4245,
          });
          await sendLogEmbed({ guild: message.guild, config, getGuildConfig, client }, embed);

          if (AI_FORCE_VISIBLE_REPLY) {
            await safeReplyTracked(message, {
              content: FALLBACK_AI_REPLY_TEXT,
              allowedMentions: allowedMentionsSafe(),
            }, 'ai-sanitized-fallback');
          }
          return;
        }
      }
    } else if (!aiText) {
      try {
        const retryText = await callAiOnce({
          system: systemText,
          temperature: Math.min(temperature, 0.7),
          maxTokens: isLightChat ? Math.min(maxTokens, 240) : maxTokens,
        });
        aiText = String(retryText || '').trim();
      } catch {
        aiText = '';
      }

      if (!aiText) {
        await safeReplyTracked(message, {
          content: FALLBACK_AI_REPLY_TEXT,
          allowedMentions: allowedMentionsSafe(),
        }, 'ai-empty-raw');
        return;
      }
    }

    const fallbackParts = [];
    if (wantsMemberFacts) {
      const memberConfident = isMemberFactsAnswerConfident(aiText, memberFactsBlock);
      if (!memberConfident) {
        fallbackParts.push(buildMemberFactsFallbackText(memberFactsBlock));
      }
    }
    if (wantsExecutorStatusFacts) {
      const executorConfident = isExecutorStatusAnswerConfident(
        aiText,
        executorTrackerBlock,
        executorTrackerError
      );
      if (!executorConfident) {
        fallbackParts.push(buildExecutorStatusFallbackText(executorTrackerBlock, executorTrackerError));
      }
    }
    if (fallbackParts.length > 0) {
      aiText = fallbackParts.join(' ');
    }

    if (!aiRawMode) {
      // Replace role mentions with readable role names (no ping), then neutralize mentions.
      aiText = await replaceRoleMentionsWithNames(aiText, message.guild);

      // Extra safety: neutralize visible mass-mentions in AI output.
      aiText = neutralizeMentions(aiText);
    }
    aiText = normalizeAiStyle(aiText);

    // Reply to the user message
    const MAX_AI_LINES = 4;
    const hasCodeBlock = /```[\s\S]*?```/m.test(aiText);

    let parts = hasCodeBlock
      ? [aiText]
      : aiText
          .split(/\r?\n+/g)
          .map((s) => String(s || '').trim())
          .filter(Boolean);

    if (!hasCodeBlock && !aiRawMode) {
      parts = collapseRepetitiveLines(parts);
    }

    if (parts.length === 0) parts = ['nah'];

    let toSend;
    if (parts.length > 1) {
      const limited = parts.slice(0, MAX_AI_LINES);
      const combined = limited.join('\n').trim();
      toSend = combined ? [combined] : [limited[0]];
    } else {
      toSend = [parts[0]];
    }

    let lastSendRes = { sent: false, reviewed: false };
    for (const part of toSend) {
      // eslint-disable-next-line no-await-in-loop
      const sendOutcome = await sendAiReplyGuaranteed({
        content: part,
        fallbackText: FALLBACK_AI_REPLY_TEXT,
        forceVisibleReply: AI_FORCE_VISIBLE_REPLY,
        sendPrimary: (text) => sendWithMentionReview({
          guild: message.guild,
          requestedBy: message.author,
          channel: message.channel,
          replyToMessageId: message.id,
          content: text,
          source: 'ai',
          allowedMentions: allowedMentionsAiReplyPing(),
          noMentionsOnApprove: true,
        }),
        sendFallback: (text) => safeReplyTracked(message, {
          content: text,
          allowedMentions: allowedMentionsSafe(),
        }, 'ai-send-fallback'),
      });

      lastSendRes = sendOutcome.primary || { sent: false, reviewed: false };
      if (lastSendRes.sent && lastSendRes.messageId) {
        trackBotMessage({ id: lastSendRes.messageId }, 'ai-primary');
      }

      if (!sendOutcome.sent) break;
      if (sendOutcome.mode === 'fallback') break;
    }

    const embed = buildModLogEmbed({
      title: 'AI reply generated',
      moderator: message.author,
      target: null,
      reason: 'AI trigger (mention/reply)',
      extraFields: [
        { name: 'Channel', value: `${message.channel} (\`${message.channel.id}\`)`, inline: false },
        { name: 'User message', value: neutralizeMentions(message.content?.slice(0, 1024) || '(empty)'), inline: false },
        { name: 'AI output', value: neutralizeMentions(aiText.slice(0, 1024)), inline: false },
        { name: 'Reviewed', value: String(!!lastSendRes.reviewed), inline: true },
      ],
      color: 0x57f287,
    });
    await sendLogEmbed({ guild: message.guild, config, getGuildConfig, client }, embed);
    } finally {
      stopTyping();
      aiInFlight.delete(message.id);
    }
  }

  const runAiChat = createChatOrchestrator({
    execute: handleAiChat,
    onError: async (err, { message } = {}) => {
      console.error('[handleAiChat] unhandled error:', err);
      if (AI_FORCE_VISIBLE_REPLY && message) {
        await safeReplyTracked(message, {
          content: FALLBACK_AI_REPLY_TEXT,
          allowedMentions: allowedMentionsSafe(),
        }, 'ai-unhandled-fallback');
      }
    },
  });

  // =====================
  // Events
  // =====================
  client.on('error', (err) => {
    console.error('[discord client error]', err);
  });

  client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const AI_WATCHDOG_INTERVAL_MS = 1000;
    const AI_NUDGE_AFTER_MS = 15_000;
    const AI_NUDGE_AFTER_LIGHTCHAT_MS = 25_000;

    // Watchdog: poll periodically, nudge users if an AI response is still running.
    // This prevents "silent" feeling when providers stall.
    setInterval(async () => {
      const now = Date.now();
      for (const [messageId, entry] of aiInFlight.entries()) {
        const msg = entry?.message;
        if (!msg || !msg.channel) {
          aiInFlight.delete(messageId);
          continue;
        }

        const nudgeAfter = entry?.isLightChat ? AI_NUDGE_AFTER_LIGHTCHAT_MS : AI_NUDGE_AFTER_MS;

        // Nudge once after threshold.
        if (!entry.nudged && now - entry.startedAt >= nudgeAfter) {
          entry.nudged = true;
          aiInFlight.set(messageId, entry);

          await safeReply(msg, {
            content: 'gimme a sec…',
            allowedMentions: allowedMentionsSafe(),
          });
        }

        // Cleanup very old entries (shouldn't happen due to timeout, but just in case)
        if (now - entry.startedAt >= 2 * 60_000) {
          aiInFlight.delete(messageId);
        }
      }
    }, AI_WATCHDOG_INTERVAL_MS);

    setNextPresence();
    setInterval(setNextPresence, 5000);

    // Cleanup stale copy-button payloads.
    setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of pendingLoadstringCopies.entries()) {
        if (!entry?.createdAt || now - entry.createdAt > 60 * 60_000) {
          pendingLoadstringCopies.delete(id);
        }
      }
    }, 60_000);

    // Cleanup stale HF listapi panels.
    setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of pendingApiListPanels.entries()) {
        if (!entry?.createdAt || now - entry.createdAt > API_LIST_PANEL_TTL_MS) {
          pendingApiListPanels.delete(id);
        }
      }
    }, 60_000);

    // Keep reply-target tracker bounded.
    setInterval(() => {
      replyTargetTracker.prune();
    }, 60_000);

    // Keep member-facts cache bounded.
    setInterval(() => {
      pruneMemberFactsCache();
    }, 60_000);

    try {
      await registerSlashCommands();
      console.log('Slash commands registered.');
    } catch (err) {
      console.error('Failed to register slash commands:', err);
    }

    await processExpiredTempBans();
    setInterval(processExpiredTempBans, 60_000);
  });

  // Prefix + AI triggers + ban channel
  client.on('messageCreate', async (message) => {
    if (message.author.bot) {
      if (client.user && message.author.id === client.user.id) {
        trackBotMessage(message, 'messageCreate');
      }
      return;
    }

    const isGuildMessage = !!message.guild;
    const guildCfg = isGuildMessage ? getGuildConfig(config, message.guild.id) : null;

    if (isGuildMessage && guildCfg.banChannelId && message.channel.id === guildCfg.banChannelId) {
      if (message.author.id !== EXEMPT_USER_ID) {
        try {
          await message.guild.members.ban(message.author.id, {
            reason: `Message sent in ban channel (#${message.channel.id})`,
            deleteMessageSeconds: 24 * 60 * 60,
          });

          const embed = buildModLogEmbed({
            title: 'Auto-ban (ban channel)',
            moderator: client.user ? { id: client.user.id, tag: client.user.tag } : null,
            target: message.author,
            reason: 'Message sent in ban channel',
            extraFields: [
              { name: 'Channel', value: `${message.channel} (\`${message.channel.id}\`)`, inline: false },
              {
                name: 'Content',
                value: neutralizeMentions(
                  message.content && message.content.length > 1024
                    ? message.content.slice(0, 1021) + '...'
                    : message.content || '(no text)'
                ),
                inline: false,
              },
              { name: 'Message', value: `[Jump](${message.url})`, inline: false },
            ],
            color: 0xed4245,
          });
          await sendLogEmbed({ guild: message.guild, config, getGuildConfig, client }, embed);
        } catch (err) {
          console.error('Failed to enforce ban channel rule:', err);
        }
      }
      return;
    }

    if (isGuildMessage) {
      const randomProbability = isLikelyModerationCommandText(message.content) ? 0 : 0.02;
      const trigger = await detectAiTrigger({
        message,
        clientUserId: client.user?.id,
        tracker: replyTargetTracker,
        fetchReferenceMessage,
        detectDangerousMentions,
        hasMediaAttachment,
        randomProbability,
      });

      if (trigger.shouldTrigger) {
        // Blacklist: block AI usage for this user.
        if (isUserAiBlacklisted(config, guildCfg, message.author.id)) {
          return;
        }

        // Rate limit to prevent mention-spam wasting API keys.
        // Ping-only mentions have a lower limit than normal prompts.
        const nowMs = Date.now();
        const botMentionA = client.user ? `<@${client.user.id}>` : '';
        const botMentionB = client.user ? `<@!${client.user.id}>` : '';
        const withoutMention = String(message.content || '')
          .replaceAll(botMentionA, '')
          .replaceAll(botMentionB, '')
          .trim();
        const pingOnly = trigger.isMention && !trigger.isReplyToBot && !withoutMention;
        const limit = pingOnly ? AI_RATE_LIMIT_PING_ONLY_PER_MINUTE : AI_RATE_LIMIT_PER_MINUTE;
        const rl = addToUserBucket(aiRateLimitBuckets, message.author.id, nowMs, { limit, windowMs: 60_000 });
        if (!rl.ok) {
          await safeReply(message, {
            content: `slow down (${limit}/min)`,
            allowedMentions: allowedMentionsSafe(),
          });
          return;
        }

        const repliedMessage = trigger.repliedMessage || null;
        const repliedMember = repliedMessage?.member || null;
        const repliedDisplayName = repliedMember?.displayName || repliedMessage?.author?.globalName || repliedMessage?.author?.username;

        const repliedIsMod = !!(
          repliedMember && hasModPermission(repliedMember)
        );

        const context = repliedMessage
          ? {
              repliedToMessageId: repliedMessage.id,
              repliedText: repliedMessage.content,
              repliedAuthorId: repliedMessage.author?.id,
              repliedAuthorTag: repliedMessage.author?.tag,
              repliedAuthorDisplayName: repliedDisplayName,
              repliedAuthorIsMod: repliedIsMod,
              repliedAuthorIsBot: !!repliedMessage.author?.bot,
              repliedMember,
            }
          : trigger.replyToMessageId
            ? { repliedToMessageId: trigger.replyToMessageId }
            : {};

        context.isRandomTrigger = trigger.isRandomTrigger;
        context.triggerReason = trigger.reason;
        context.replySource = trigger.replySource || null;

        context.rateLimitSkip = true;

        // Fire and forget
        runAiChat(message, context).catch(() => {});
      }
    }

    // Prefix commands
    const prefix = isGuildMessage ? (guildCfg.prefix || DEFAULT_PREFIX) : DEFAULT_PREFIX;
    if (!message.content.startsWith(prefix)) return;

    const [rawCmd, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
    const cmd = (rawCmd || '').toLowerCase();

    if (cmd === 'loadstring' || cmd === 'ls') {
      await handleCreateLoadstringCommand(message, prefix);
      return;
    }

    if (cmd === 'lslist') {
      await handleListLoadstringsCommand(message);
      return;
    }

    if (cmd === 'lsremove') {
      await handleRemoveLoadstringCommand(message, args[0], prefix);
      return;
    }

    if (cmd === 'lsinfo') {
      await handleLoadstringInfoCommand(message, args[0], prefix);
      return;
    }

    if (cmd === 'blacklist' || cmd === 'aibl' || cmd === 'aiblacklist') {
      if (!isGuildMessage) return;
      if (!hasCreatorWhitelistAccess(config, message.author.id)) {
        await safeReply(message, {
          content: pickRoast(),
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      const action = String(args[0] || '').toLowerCase();
      const targetToken = String(args[1] || '').trim();
      const targetId = parseUserIdToken(targetToken);

      if (action === 'list') {
        const list = Array.isArray(config.aiBlacklistUserIds) ? config.aiBlacklistUserIds : [];
        const lines = list.length
          ? list.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`)
          : ['(empty)'];
        await safeReply(message, {
          content: `ai blacklist (global):\n${lines.join('\n')}`,
          allowedMentions: allowedMentionsAiSafe(),
        });
        return;
      }

      if (action !== 'add' && action !== 'remove') {
        await safeReply(message, {
          content: `usage: \`${prefix}blacklist <add|remove|list> <@user|id?>\``,
          allowedMentions: allowedMentionsAiSafe(),
        });
        return;
      }

      if (!targetId) {
        await safeReply(message, {
          content: `pick a user: \`${prefix}blacklist ${action} <@user|id>\``,
          allowedMentions: allowedMentionsAiSafe(),
        });
        return;
      }

      const list = Array.isArray(config.aiBlacklistUserIds) ? config.aiBlacklistUserIds : [];
      const before = list.length;

      if (action === 'add') {
        if (!list.includes(targetId)) list.push(targetId);
        config.aiBlacklistUserIds = list;
        saveConfig(config);
        await safeReply(message, {
          content: neutralizeMentions(`blacklisted <@${targetId}> for ai globally`),
          allowedMentions: allowedMentionsAiSafe(),
        });
      } else {
        config.aiBlacklistUserIds = list.filter((id) => id !== targetId);
        saveConfig(config);
        await safeReply(message, {
          content: neutralizeMentions(`unblacklisted <@${targetId}> for ai globally`),
          allowedMentions: allowedMentionsAiSafe(),
        });
      }

      const after = Array.isArray(config.aiBlacklistUserIds) ? config.aiBlacklistUserIds.length : before;
      const embed = buildModLogEmbed({
        title: 'AI blacklist updated',
        moderator: message.author,
        target: { id: targetId, tag: `id ${targetId}` },
        reason: `${action} ai global blacklist`,
        extraFields: [
          { name: 'Before', value: String(before), inline: true },
          { name: 'After', value: String(after), inline: true },
          { name: 'Message', value: `[Jump](${message.url})`, inline: false },
        ],
        color: action === 'add' ? 0xed4245 : 0x57f287,
      });
      await sendLogEmbed({ guild: message.guild, config, getGuildConfig, client }, embed);
      return;
    }

    if (cmd === 'ping') {
      const sent = await message.channel.send('pinging');
      const apiLatency = sent.createdTimestamp - message.createdTimestamp;
      const wsLatency = Math.round(client.ws.ping);
      await sent.edit(`pong\napi ${apiLatency}ms\nws ${wsLatency}ms`);
      return;
    }

    if (cmd === 'help') {
      const wantsAll = String(args[0] || '').toLowerCase() === 'all';

      if (!isGuildMessage) {
        await safeReply(message, {
          content: buildHelpText(prefix, { includeAll: wantsAll }),
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      try {
        await dmHelp(message.author, prefix, { includeAll: wantsAll });
        await message.reply(`I sent you a DM with the ${wantsAll ? 'full ' : ''}commands list.`);
      } catch {
        await message.reply('I could not DM you. Please enable DMs from server members.');
      }
      return;
    }

    if (!isGuildMessage) return;

    if (cmd === 'creatorwhitelist' || cmd === 'creatorwl' || cmd === 'cwl') {
      if (!hasCreatorWhitelistAccess(config, message.author.id)) {
        await safeReply(message, {
          content: pickRoast(),
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      const action = String(args[0] || '').toLowerCase();
      const targetToken = String(args[1] || '').trim();
      const targetId = parseUserIdToken(targetToken);
      const list = Array.isArray(config.creatorWhitelistUserIds) ? config.creatorWhitelistUserIds : [];

      if (action === 'list') {
        const lines = list.length
          ? list.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`)
          : ['(empty)'];
        await safeReply(message, {
          content: `creator whitelist:\n${lines.join('\n')}`,
          allowedMentions: allowedMentionsAiSafe(),
        });
        return;
      }

      if (action !== 'add' && action !== 'remove') {
        await safeReply(message, {
          content: `usage: \`${prefix}creatorwhitelist <add|remove|list> <@user|id?>\``,
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      if (!targetId) {
        await safeReply(message, {
          content: `pick a user: \`${prefix}creatorwhitelist ${action} <@user|id>\``,
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      if (targetId === CREATOR_USER_ID) {
        await safeReply(message, {
          content: 'creator already has access',
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      const before = list.length;
      if (action === 'add') {
        if (!list.includes(targetId)) list.push(targetId);
        config.creatorWhitelistUserIds = list;
        saveConfig(config);
        await safeReply(message, {
          content: neutralizeMentions(`creator-whitelisted <@${targetId}>`),
          allowedMentions: allowedMentionsAiSafe(),
        });
      } else {
        config.creatorWhitelistUserIds = list.filter((id) => id !== targetId);
        saveConfig(config);
        await safeReply(message, {
          content: neutralizeMentions(`removed <@${targetId}> from creator whitelist`),
          allowedMentions: allowedMentionsAiSafe(),
        });
      }

      const after = Array.isArray(config.creatorWhitelistUserIds) ? config.creatorWhitelistUserIds.length : before;
      const embed = buildModLogEmbed({
        title: 'Creator whitelist updated',
        moderator: message.author,
        target: { id: targetId, tag: `id ${targetId}` },
        reason: `${action} creator whitelist`,
        extraFields: [
          { name: 'Before', value: String(before), inline: true },
          { name: 'After', value: String(after), inline: true },
          { name: 'Message', value: `[Jump](${message.url})`, inline: false },
        ],
        color: action === 'add' ? 0x57f287 : 0xed4245,
      });
      await sendLogEmbed({ guild: message.guild, config, getGuildConfig, client }, embed);
      return;
    }

    if (cmd === 'q') {
      if (!hasCreatorWhitelistAccess(config, message.author.id)) {
        await safeReply(message, {
          content: pickRoast(),
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      const mode = String(args[0] || 'status').trim().toLowerCase();
      const current = !!config.aiRawMode;

      if (mode === 'status') {
        await safeReply(message, {
          content: `q mode is ${current ? 'on' : 'off'}`,
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      let next = current;
      if (mode === 'toggle') next = !current;
      else if (mode === 'on' || mode === 'enable' || mode === 'enabled' || mode === '1' || mode === 'true') next = true;
      else if (mode === 'off' || mode === 'disable' || mode === 'disabled' || mode === '0' || mode === 'false') next = false;
      else {
        await safeReply(message, {
          content: `usage: \`${prefix}q <on|off|toggle|status>\``,
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      config.aiRawMode = next;
      saveConfig(config);

      await safeReply(message, {
        content: `q mode ${next ? 'enabled' : 'disabled'}${next ? ' (personality/sanitize off)' : ''}`,
        allowedMentions: allowedMentionsSafe(),
      });
      return;
    }

    if (cmd === 'addhfapi') {
      if (!hasCreatorWhitelistAccess(config, message.author.id)) {
        await safeReply(message, {
          content: pickRoast(),
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      const key = String(args[0] || '').trim();
      if (!key) {
        await safeReply(message, {
          content: `usage: \`${prefix}addhfapi <key>\``,
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      const keys = Array.isArray(config.hfApiKeys) ? config.hfApiKeys : [];
      if (!keys.includes(key)) keys.push(key);
      config.hfApiKeys = keys;
      ensureHfUsageRecord(key);
      saveConfig(config);

      await safeReply(message, {
        content: `added hf key ${maskApiKey(key)} (total ${keys.length})`,
        allowedMentions: allowedMentionsSafe(),
      });
      return;
    }

    if (cmd === 'removehfapi') {
      if (!hasCreatorWhitelistAccess(config, message.author.id)) {
        await safeReply(message, {
          content: pickRoast(),
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      const token = String(args[0] || '').trim();
      if (!token) {
        await safeReply(message, {
          content: `usage: \`${prefix}removehfapi <key|masked>\``,
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      const keys = Array.isArray(config.hfApiKeys) ? config.hfApiKeys : [];
      const match = keys.find((k) => k === token) || keys.find((k) => maskApiKey(k) === token);
      if (!match) {
        await safeReply(message, {
          content: 'key not found',
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      config.hfApiKeys = keys.filter((k) => k !== match);
      const usageStore = ensureHfUsageStore();
      delete usageStore[match];
      hfDepletedCounts.delete(match);
      hfDepletedGlobalPinged.delete(match);
      hfDepletedCreatorNotified.delete(match);
      saveConfig(config);

      await safeReply(message, {
        content: `removed hf key ${maskApiKey(match)} (total ${config.hfApiKeys.length})`,
        allowedMentions: allowedMentionsSafe(),
      });
      return;
    }

    if (cmd === 'listapi') {
      if (!hasCreatorWhitelistAccess(config, message.author.id)) {
        await safeReply(message, {
          content: pickRoast(),
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      const keys = Array.isArray(config.hfApiKeys) ? config.hfApiKeys : [];
      if (keys.length === 0) {
        await safeReply(message, {
          content: 'no hf keys saved',
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      const entries = keys.map((k) => {
        const stats = readHfUsageStats(k);
        const lastUsed = formatUsageTimestamp(stats.lastUsedAt);
        return {
          masked: maskApiKey(k),
          stats,
          lastUsed,
        };
      });

      const panelId = crypto.randomBytes(12).toString('hex');
      pendingApiListPanels.set(panelId, {
        ownerId: message.author.id,
        entries,
        createdAt: Date.now(),
      });

      const payload = buildApiListPagePayload({
        entries,
        page: 1,
        panelId,
      });

      const sent = await safeReply(message, {
        ...payload,
        allowedMentions: allowedMentionsSafe(),
      });
      if (!sent) {
        pendingApiListPanels.delete(panelId);
      }
      return;
    }

    if (cmd === 'listhfprovider' || cmd === 'listhfproviders') {
      if (!hasCreatorWhitelistAccess(config, message.author.id)) {
        await safeReply(message, {
          content: pickRoast(),
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      const current = resolveHfChatModel();
      const entries = Object.entries(HF_PROVIDER_PRESETS)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, model]) => `- ${key} → ${model}`);

      const chunks = chunkLines(entries, 1750);
      for (let i = 0; i < chunks.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await safeReply(message, {
          content: `hf provider presets (current: ${current})\n\n${chunks[i]}`.trim(),
          allowedMentions: allowedMentionsSafe(),
        });
      }
      return;
    }

    if (cmd === 'sethfprovider') {
      if (!hasCreatorWhitelistAccess(config, message.author.id)) {
        await safeReply(message, {
          content: pickRoast(),
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      const provider = args[0];
      if (!provider) {
        const current = resolveHfChatModel();
        await safeReply(message, {
          content: `usage: \`${prefix}sethfprovider <${Object.keys(HF_PROVIDER_PRESETS).join('|')}>\`\ncurrent: ${current}`,
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      const res = applyHfProvider(provider);
      if (!res) {
        await safeReply(message, {
          content: `invalid provider. options: ${Object.keys(HF_PROVIDER_PRESETS).join(', ')}`,
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      await safeReply(message, {
        content: `provider set to ${res.key}`,
        allowedMentions: allowedMentionsSafe(),
      });
      return;
    }

    if (cmd === 'servers' || cmd === 'guilds') {
      if (!hasCreatorWhitelistAccess(config, message.author.id)) {
        await safeReply(message, {
          content: pickRoast(),
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      const includeInvites = !args.includes('noinvites');
      const res = await deliverServerInventory({
        requester: message.author,
        includeInvites,
        fallbackChannel: message.channel,
      });

      if (!res.ok) {
        await safeReply(message, {
          content: 'cant dm u turn on dms from server members',
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      if (res.via === 'dm') {
        await safeReply(message, {
          content: 'sent in dms',
          allowedMentions: allowedMentionsSafe(),
        });
      } else {
        await safeReply(message, {
          content: 'posted here',
          allowedMentions: allowedMentionsSafe(),
        });
      }
      return;
    }

    if (cmd === 'setbanch' || cmd === 'setbanchannel') {
      if (!hasBanPermission(message.member)) {
        await message.reply('You need **Ban Members** (or **Administrator**) permission to use this command.');
        return;
      }

      guildCfg.banChannelId = message.channel.id;
      saveConfig(config);

      await message.reply(
        `Ban channel set to ${message.channel}. Any message sent here will be deleted (last 24h) and the user will be banned (except <@${EXEMPT_USER_ID}>).`
      );

      const embed = buildModLogEmbed({
        title: 'Ban channel updated',
        moderator: message.author,
        target: null,
        reason: 'Set ban channel',
        extraFields: [
          { name: 'Channel', value: `${message.channel} (\`${message.channel.id}\`)`, inline: false },
          { name: 'Message', value: `[Jump](${message.url})`, inline: false },
        ],
        color: 0x5865f2,
      });
      await sendLogEmbed({ guild: message.guild, config, getGuildConfig, client }, embed);
      return;
    }

    if (cmd === 'setlogchannel' || cmd === 'setlogch') {
      if (!hasModPermission(message.member)) {
        await message.reply('You need **Manage Messages** (or similar moderator permissions) to use this command.');
        return;
      }

      guildCfg.logChannelId = message.channel.id;
      saveConfig(config);

      await message.reply(`Log channel set to ${message.channel}.`);

      const embed = buildModLogEmbed({
        title: 'Log channel updated',
        moderator: message.author,
        target: null,
        reason: 'Set log channel',
        extraFields: [
          { name: 'Channel', value: `${message.channel} (\`${message.channel.id}\`)`, inline: false },
          { name: 'Message', value: `[Jump](${message.url})`, inline: false },
        ],
        color: 0x5865f2,
      });
      await sendLogEmbed({ guild: message.guild, config, getGuildConfig, client }, embed);
      return;
    }

    if (cmd === 'attachments') {
      if (!hasModPermission(message.member)) {
        await message.reply('You need **Manage Messages** (or similar moderator permissions) to use this command.');
        return;
      }

      const mode = (args[0] || '').trim().toLowerCase();
      const current = !!config.allowAttachments;

      if (mode === 'status') {
        await message.reply(`Global attachment reading is currently **${current ? 'enabled' : 'disabled'}**.`);
        return;
      }

      let next = current;
      if (!mode || mode === 'toggle') next = !current;
      else if (mode === 'on' || mode === 'enable' || mode === 'enabled') next = true;
      else if (mode === 'off' || mode === 'disable' || mode === 'disabled') next = false;

      config.allowAttachments = next;
      saveConfig(config);

      await message.reply(`Global attachment reading ${next ? 'enabled' : 'disabled'}. Allowed: images, .txt, .js, .lua.`);

      const embed = buildModLogEmbed({
        title: 'Global attachment reading updated',
        moderator: message.author,
        target: null,
        reason: `Set global attachments ${next ? 'on' : 'off'}`,
        extraFields: [
          { name: 'Enabled', value: String(next), inline: true },
          { name: 'Scope', value: 'Global', inline: true },
          { name: 'Message', value: `[Jump](${message.url})`, inline: false },
        ],
        color: 0x5865f2,
      });
      await sendLogEmbed({ guild: message.guild, config, getGuildConfig, client }, embed);
      return;
    }

    if (cmd === 'setgloballog') {
      if (!hasCreatorWhitelistAccess(config, message.author.id)) {
        await safeReply(message, {
          content: pickRoast(),
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      const token = (args[0] || '').trim();
      if (token && ['off', 'none', 'clear', 'disable'].includes(token.toLowerCase())) {
        config.globalLogChannelId = null;
        saveConfig(config);
        await safeReply(message, {
          content: 'global log disabled',
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      const channelId = parseChannelId(token) || message.channel.id;
      const target = await client.channels.fetch(channelId).catch(() => null);
      if (!target || !target.isTextBased?.() || !target.guildId) {
        await safeReply(message, {
          content: 'invalid channel use a text channel in a server',
          allowedMentions: allowedMentionsSafe(),
        });
        return;
      }

      config.globalLogChannelId = target.id;
      saveConfig(config);

      await safeReply(message, {
        content: `global log set to <#${target.id}>`,
        allowedMentions: allowedMentionsSafe(),
      });
      return;
    }

    if (cmd === 'setprefix') {
      if (!hasBanPermission(message.member)) {
        await message.reply('You need **Ban Members** (or **Administrator**) permission to use this command.');
        return;
      }

      const nextPrefix = (args[0] || '').trim();
      if (!nextPrefix) {
        await message.reply(`Usage: \`${prefix}setprefix <newPrefix>\``);
        return;
      }

      guildCfg.prefix = nextPrefix;
      saveConfig(config);

      await message.reply(`Prefix updated to \`${nextPrefix}\``);
      return;
    }

    if (cmd === 'mute') {
      if (!hasModPermission(message.member)) {
        await message.reply('You need **Manage Messages** (or similar moderator permissions) to use this command.');
        return;
      }

      const targetToken = args[0];
      const durationToken = args[1];
      const reason = args.slice(2).join(' ').trim();

      let durationMs = parseDurationToMs(durationToken);
      const maxTimeoutMs = 28 * 24 * 60 * 60 * 1000;
      if (durationMs != null && durationMs > maxTimeoutMs) durationMs = maxTimeoutMs;

      if (!targetToken || !durationToken || durationMs == null) {
        await message.reply(`Usage: \`${prefix}mute <@user|userId> <duration(30m|1d)> <reason?>\``);
        return;
      }

      const userId = targetToken.replace(/<@!?([0-9]+)>/, '$1');
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (!member) {
        await message.reply('Could not find that user in this server.');
        return;
      }

      try {
        await member.timeout(durationMs, reason || 'No reason provided');
      } catch (e) {
        console.error('mute failed:', e);
        await message.reply('Failed to mute (timeout) that user. Check bot permissions.');
        return;
      }

      await message.reply(`Muted ${member.user.tag} for ${formatDuration(durationMs)}.`);

      const embed = buildModLogEmbed({
        title: 'Member muted (timeout)',
        moderator: message.author,
        target: member.user,
        reason,
        extraFields: [
          { name: 'Duration', value: formatDuration(durationMs), inline: true },
          { name: 'Message', value: `[Jump](${message.url})`, inline: true },
        ],
        color: 0xfaa61a,
      });
      await sendLogEmbed({ guild: message.guild, config, getGuildConfig, client }, embed);
      return;
    }

    if (cmd === 'kick') {
      if (!hasModPermission(message.member)) {
        await message.reply('You need **Manage Messages** (or similar moderator permissions) to use this command.');
        return;
      }

      const targetToken = args[0];
      const reason = args.slice(1).join(' ').trim();
      if (!targetToken) {
        await message.reply(`Usage: \`${prefix}kick <@user|userId> <reason?>\``);
        return;
      }

      const userId = targetToken.replace(/<@!?([0-9]+)>/, '$1');
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (!member) {
        await message.reply('Could not find that user in this server.');
        return;
      }

      try {
        await member.kick(reason || 'No reason provided');
      } catch (e) {
        console.error('kick failed:', e);
        await message.reply('Failed to kick that user. Check bot permissions.');
        return;
      }

      await message.reply(`Kicked ${member.user.tag}.`);

      const embed = buildModLogEmbed({
        title: 'Member kicked',
        moderator: message.author,
        target: member.user,
        reason,
        extraFields: [{ name: 'Message', value: `[Jump](${message.url})`, inline: false }],
        color: 0xed4245,
      });
      await sendLogEmbed({ guild: message.guild, config, getGuildConfig, client }, embed);
      return;
    }

    if (cmd === 'ban') {
      if (!hasModPermission(message.member)) {
        await message.reply('You need **Manage Messages** (or similar moderator permissions) to use this command.');
        return;
      }

      const me = message.guild.members.me || (await message.guild.members.fetchMe().catch(() => null));
      if (!me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
        await message.reply('I need **Ban Members** permission to do that.');
        return;
      }

      const targetToken = args[0];
      const maybeDelete = args[1];
      const deleteSeconds = normalizeBanDeleteSeconds(parseDurationToSeconds(maybeDelete));

      const reason = deleteSeconds == null
        ? args.slice(1).join(' ').trim()
        : args.slice(2).join(' ').trim();

      if (!targetToken) {
        await message.reply(`Usage: \`${prefix}ban <@user|userId> <delete(30m|24h|7d)?> <reason?>\``);
        return;
      }

      const userId = targetToken.replace(/<@!?([0-9]+)>/, '$1');
      const user = await client.users.fetch(userId).catch(() => null);
      if (!user) {
        await message.reply('Invalid user.');
        return;
      }

      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (member && !member.bannable) {
        await message.reply('I cannot ban that user (role hierarchy or permissions).');
        return;
      }

      try {
        await message.guild.members.ban(userId, {
          reason: reason || 'No reason provided',
          deleteMessageSeconds: deleteSeconds ?? 0,
        });
      } catch (e) {
        console.error('ban failed:', e);
        await message.reply('Failed to ban that user. Check bot permissions.');
        return;
      }

      await message.reply(`Banned ${user.tag}.`);

      const embed = buildModLogEmbed({
        title: 'Member banned',
        moderator: message.author,
        target: user,
        reason,
        extraFields: [
          {
            name: 'Delete messages',
            value: deleteSeconds == null ? '0s' : `${maybeDelete} (${deleteSeconds}s)`,
            inline: true,
          },
          { name: 'Message', value: `[Jump](${message.url})`, inline: true },
        ],
        color: 0xed4245,
      });
      await sendLogEmbed({ guild: message.guild, config, getGuildConfig, client }, embed);
      return;
    }

    if (cmd === 'tempban') {
      if (!hasModPermission(message.member)) {
        await message.reply('You need **Manage Messages** (or similar moderator permissions) to use this command.');
        return;
      }

      const me = message.guild.members.me || (await message.guild.members.fetchMe().catch(() => null));
      if (!me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
        await message.reply('I need **Ban Members** permission to do that.');
        return;
      }

      const targetToken = args[0];
      const maybeDuration = args[1];
      const durationMsParsed = parseDurationToMs(maybeDuration);
      const durationMs = durationMsParsed ?? parseDurationToMs('1d');

      const deleteSeconds = normalizeBanDeleteSeconds(parseDurationToSeconds(maybeDuration)) ?? 0;
      const reason = durationMsParsed == null ? args.slice(1).join(' ').trim() : args.slice(2).join(' ').trim();

      if (!targetToken) {
        await message.reply(`Usage: \`${prefix}tempban <@user|userId> <duration(30m|24h|7d)?> <reason?>\``);
        return;
      }

      const userId = targetToken.replace(/<@!?([0-9]+)>/, '$1');
      const user = await client.users.fetch(userId).catch(() => null);
      if (!user) {
        await message.reply('Invalid user.');
        return;
      }

      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (member && !member.bannable) {
        await message.reply('I cannot ban that user (role hierarchy or permissions).');
        return;
      }

      try {
        await message.guild.members.ban(userId, {
          reason: reason || 'No reason provided',
          deleteMessageSeconds: deleteSeconds,
        });
      } catch (e) {
        console.error('tempban failed:', e);
        await message.reply('Failed to ban that user. Check bot permissions.');
        return;
      }

      guildCfg.tempBans.push({
        userId,
        userTag: user.tag,
        reason: reason || 'No reason provided',
        expiresAt: Date.now() + durationMs,
      });
      saveConfig(config);

      await message.reply(`Tempbanned ${user.tag} for ${formatDuration(durationMs)}.`);

      const embed = buildModLogEmbed({
        title: 'Member tempbanned',
        moderator: message.author,
        target: user,
        reason,
        extraFields: [
          { name: 'Duration', value: formatDuration(durationMs), inline: true },
          { name: 'Delete messages', value: `${deleteSeconds}s`, inline: true },
          { name: 'Message', value: `[Jump](${message.url})`, inline: false },
        ],
        color: 0xed4245,
      });
      await sendLogEmbed({ guild: message.guild, config, getGuildConfig, client }, embed);
      return;
    }
  });

  // Slash commands + mention review buttons
  client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
      const copyParts = String(interaction.customId || '').split(':');
      if (copyParts.length === 2 && copyParts[0] === 'lscopy') {
        const copyId = copyParts[1];
        const pending = pendingLoadstringCopies.get(copyId);
        if (!pending?.text) {
          await interaction.reply({ content: 'This copy button has expired. Run the command again.', ephemeral: true }).catch(() => {});
          return;
        }

        await interaction.reply({
          content: pending.text,
          ephemeral: true,
        }).catch(() => {});
        return;
      }

      const apiParts = String(interaction.customId || '').split(':');
      if (apiParts.length === 3 && apiParts[0] === 'apilist') {
        const panelId = String(apiParts[1] || '').trim();
        const requestedPage = Number.parseInt(apiParts[2], 10);
        const pending = pendingApiListPanels.get(panelId);

        if (!pending?.entries || !Array.isArray(pending.entries)) {
          await interaction.reply({ content: 'This list panel has expired. Run listapi again.', ephemeral: true }).catch(() => {});
          return;
        }

        if (interaction.user.id !== pending.ownerId) {
          await interaction.reply({ content: 'This panel belongs to another user.', ephemeral: true }).catch(() => {});
          return;
        }

        if (!pending.createdAt || Date.now() - pending.createdAt > API_LIST_PANEL_TTL_MS) {
          pendingApiListPanels.delete(panelId);
          await interaction.reply({ content: 'This list panel has expired. Run listapi again.', ephemeral: true }).catch(() => {});
          return;
        }

        const payload = buildApiListPagePayload({
          entries: pending.entries,
          page: Number.isFinite(requestedPage) ? requestedPage : 1,
          panelId,
        });
        await interaction.update(payload).catch(async () => {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Failed to turn page.', ephemeral: true }).catch(() => {});
          }
        });
        return;
      }

      const parts = String(interaction.customId || '').split(':');
      if (parts.length === 3 && parts[0] === 'mentionReview') {
        const action = parts[1];
        const id = parts[2];

        const pending = pendingMentionReviews.get(id);
        if (!pending) {
          await interaction.reply({ content: 'This review is no longer active.', ephemeral: true }).catch(() => {});
          return;
        }

        if (!hasModPermission(interaction.memberPermissions || interaction.member)) {
          await interaction.reply({ content: 'You are not allowed to approve/reject.', ephemeral: true }).catch(() => {});
          return;
        }

        pendingMentionReviews.delete(id);

        const guild = await client.guilds.fetch(pending.guildId).catch(() => null);
        if (!guild) {
          await interaction.reply({ content: 'Guild not found.', ephemeral: true }).catch(() => {});
          return;
        }

        if (action === 'reject') {
          const embeds = buildMentionReviewEmbedsForPending(pending, guild, 'Rejected', 0xed4245);
          await updateMentionReviewMessages(pending.reviewMessages, embeds, []);

          await interaction.reply({ content: 'Rejected.', ephemeral: true }).catch(() => {});
          return;
        }

        // approve
        try {
          const targetChannel = await guild.channels.fetch(pending.targetChannelId).catch(() => null);
          if (!targetChannel || !targetChannel.isTextBased()) throw new Error('Target channel invalid');

          const danger = detectDangerousMentions(pending.content);
          const allowEveryone = danger.hasEveryone || danger.hasHere;

          const approvedAllowedMentions = pending.noMentionsOnApprove
            ? allowedMentionsAiReplyPing()
            : allowedMentionsApproved({
                roleIds: danger.roleIds,
                allowEveryone,
              });

          if (pending.replyToMessageId) {
            // Avoid fetching messages (can require Read Message History). Use reply reference instead.
            await targetChannel.send({
              content: pending.content,
              allowedMentions: approvedAllowedMentions,
              reply: { messageReference: pending.replyToMessageId, failIfNotExists: false },
            });
          } else {
            await targetChannel.send({
              content: pending.content,
              allowedMentions: approvedAllowedMentions,
            });
          }

          const embeds = buildMentionReviewEmbedsForPending(
            pending,
            guild,
            `Approved by ${interaction.user.tag}`,
            0x57f287
          );
          await updateMentionReviewMessages(pending.reviewMessages, embeds, []);

          await interaction.reply({ content: 'Approved and sent.', ephemeral: true }).catch(() => {});
        } catch (e) {
          console.error('Approve send failed:', e);
          await interaction.reply({ content: 'Failed to send after approval.', ephemeral: true }).catch(() => {});
        }
        return;
      }

      return;
    }

    if (!interaction.isChatInputCommand()) return;
    const isGuildInteraction = !!interaction.guildId;
    const guildCfg = isGuildInteraction ? getGuildConfig(config, interaction.guildId) : null;
    const prefix = isGuildInteraction ? (guildCfg.prefix || DEFAULT_PREFIX) : DEFAULT_PREFIX;

    // Rarely, Discord.js can deliver an interaction with guildId but interaction.guild is null.
    // Resolve it once so downstream handlers don't crash.
    const resolvedGuild = isGuildInteraction
      ? (interaction.guild || (await client.guilds.fetch(interaction.guildId).catch(() => null)))
      : null;
    const guildOnlyCommands = new Set([
      'setbanchannel',
      'setprefix',
      'setlogchannel',
      'attachments',
      'say',
      'blacklist',
      'creatorwhitelist',
      'mute',
      'kick',
      'ban',
      'tempban',
    ]);

    if (!isGuildInteraction && guildOnlyCommands.has(interaction.commandName)) {
      await interaction.reply({
        content: 'this command can only be used in a server',
      }).catch(() => {});
      return;
    }

    if (interaction.commandName === 'ping') {
      const sent = await interaction.reply({ content: 'pinging', ephemeral: false, fetchReply: true });
      const apiLatency = sent.createdTimestamp - interaction.createdTimestamp;
      const wsLatency = Math.round(client.ws.ping);
      await interaction.editReply(`pong\napi ${apiLatency}ms\nws ${wsLatency}ms`);
      return;
    }

    if (interaction.commandName === 'help') {
      if (!interaction.guildId) {
        await interaction.reply({ content: buildHelpText(prefix) }).catch(() => {});
        return;
      }

      try {
        await dmHelp(interaction.user, prefix);
        await interaction.reply({ content: 'I sent you a DM with the commands list.', ephemeral: true });
      } catch {
        await interaction.reply({
          content: 'I could not DM you. Please enable DMs from server members.',
          ephemeral: true,
        });
      }
      return;
    }

    if (interaction.commandName === 'loadstring') {
      await handleSlashCreateLoadstringCommand(interaction);
      return;
    }

    if (interaction.commandName === 'lslist') {
      await handleSlashListLoadstringsCommand(interaction);
      return;
    }

    if (interaction.commandName === 'lsremove') {
      await handleSlashRemoveLoadstringCommand(interaction);
      return;
    }

    if (interaction.commandName === 'lsinfo') {
      await handleSlashLoadstringInfoCommand(interaction);
      return;
    }

    if (interaction.commandName === 'setbanchannel') {
      if (!hasBanPermission(interaction.memberPermissions || interaction.member)) {
        await interaction.reply({
          content: 'You need **Ban Members** (or **Administrator**) permission to use this command.',
          ephemeral: true,
        });
        return;
      }

      guildCfg.banChannelId = interaction.channelId;
      saveConfig(config);

      await interaction.reply({
        content: `Ban channel set to <#${interaction.channelId}>. Any message sent there will be deleted (last 24h) and the user will be banned (except <@${EXEMPT_USER_ID}>).`,
        ephemeral: false,
      });

      const embed = buildModLogEmbed({
        title: 'Ban channel updated',
        moderator: interaction.user,
        target: null,
        reason: 'Set ban channel',
        extraFields: [
          { name: 'Channel', value: `<#${interaction.channelId}> (\`${interaction.channelId}\`)`, inline: false },
        ],
        color: 0x5865f2,
      });
      await sendLogEmbed({ guild: resolvedGuild || interaction.guild, config, getGuildConfig, client }, embed);
      return;
    }

    if (interaction.commandName === 'setlogchannel') {
      if (!hasModPermission(interaction.memberPermissions || interaction.member)) {
        await interaction.reply({
          content: 'You need **Manage Messages** (or similar moderator permissions) to use this command.',
          ephemeral: true,
        });
        return;
      }

      guildCfg.logChannelId = interaction.channelId;
      saveConfig(config);

      await interaction.reply({ content: `Log channel set to <#${interaction.channelId}>.`, ephemeral: false });

      const embed = buildModLogEmbed({
        title: 'Log channel updated',
        moderator: interaction.user,
        target: null,
        reason: 'Set log channel',
        extraFields: [
          { name: 'Channel', value: `<#${interaction.channelId}> (\`${interaction.channelId}\`)`, inline: false },
        ],
        color: 0x5865f2,
      });
      await sendLogEmbed({ guild: resolvedGuild || interaction.guild, config, getGuildConfig, client }, embed);
      return;
    }

    if (interaction.commandName === 'attachments') {
      if (!hasModPermission(interaction.memberPermissions || interaction.member)) {
        await interaction.reply({
          content: 'You need **Manage Messages** (or similar moderator permissions) to use this command.',
          ephemeral: true,
        });
        return;
      }

      const modeRaw = interaction.options.getString('mode', false);
      const mode = String(modeRaw || '').trim().toLowerCase();
      const current = !!config.allowAttachments;

      if (mode === 'status') {
        await interaction.reply({
          content: `Global attachment reading is currently **${current ? 'enabled' : 'disabled'}**.`,
          ephemeral: true,
        });
        return;
      }

      let next = current;
      if (!mode || mode === 'toggle') next = !current;
      else if (mode === 'on' || mode === 'enable' || mode === 'enabled') next = true;
      else if (mode === 'off' || mode === 'disable' || mode === 'disabled') next = false;

      config.allowAttachments = next;
      saveConfig(config);

      await interaction.reply({
        content: `Global attachment reading ${next ? 'enabled' : 'disabled'}. Allowed: images, .txt, .js, .lua.`,
        ephemeral: false,
      });

      const embed = buildModLogEmbed({
        title: 'Global attachment reading updated',
        moderator: interaction.user,
        target: null,
        reason: `Set global attachments ${next ? 'on' : 'off'}`,
        extraFields: [
          { name: 'Enabled', value: String(next), inline: true },
          { name: 'Scope', value: 'Global', inline: true },
        ],
        color: 0x5865f2,
      });
      await sendLogEmbed({ guild: resolvedGuild || interaction.guild, config, getGuildConfig, client }, embed);
      return;
    }

    if (interaction.commandName === 'setprefix') {
      if (!hasBanPermission(interaction.memberPermissions || interaction.member)) {
        await interaction.reply({
          content: 'You need **Ban Members** (or **Administrator**) permission to use this command.',
          ephemeral: true,
        });
        return;
      }

      const nextPrefix = interaction.options.getString('prefix', true).trim();
      if (!nextPrefix) {
        await interaction.reply({ content: 'Prefix cannot be empty.', ephemeral: true });
        return;
      }

      guildCfg.prefix = nextPrefix;
      saveConfig(config);
      await interaction.reply({ content: `Prefix updated to \`${nextPrefix}\``, ephemeral: false });
      return;
    }

    if (interaction.commandName === 'blacklist') {
      if (!hasCreatorWhitelistAccess(config, interaction.user.id)) {
        await interaction.reply({
          content: pickRoast(),
          ephemeral: true,
        });
        return;
      }

      const action = String(interaction.options.getString('action', true) || '').toLowerCase();
      const user = interaction.options.getUser('user', false);
      const userIdRaw = interaction.options.getString('userid', false);
      const targetId = user?.id || userIdRaw || '';

      if (action === 'list') {
        const list = Array.isArray(config.aiBlacklistUserIds) ? config.aiBlacklistUserIds : [];
        const lines = list.length
          ? list.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`)
          : ['(empty)'];
        await interaction.reply({
          content: neutralizeMentions(`ai blacklist (global):\n${lines.join('\n')}`),
          ephemeral: true,
          allowedMentions: allowedMentionsAiSafe(),
        });
        return;
      }

      if (action !== 'add' && action !== 'remove') {
        await interaction.reply({
          content: 'invalid action use add/remove/list',
          ephemeral: true,
        });
        return;
      }

      if (!targetId) {
        await interaction.reply({
          content: 'provide a user or userid',
          ephemeral: true,
        });
        return;
      }

      const list = Array.isArray(config.aiBlacklistUserIds) ? config.aiBlacklistUserIds : [];
      const before = list.length;

      const targetLabel = targetId ? `user id ${targetId}` : 'user';

      if (action === 'add') {
        if (!list.includes(targetId)) list.push(targetId);
        config.aiBlacklistUserIds = list;
        saveConfig(config);
        await interaction.reply({
          content: `blacklisted ${targetLabel} for ai globally`,
          ephemeral: false,
          allowedMentions: allowedMentionsAiSafe(),
        });
      } else {
        config.aiBlacklistUserIds = list.filter((id) => id !== targetId);
        saveConfig(config);
        await interaction.reply({
          content: `unblacklisted ${targetLabel} for ai globally`,
          ephemeral: false,
          allowedMentions: allowedMentionsAiSafe(),
        });
      }

      const after = Array.isArray(config.aiBlacklistUserIds) ? config.aiBlacklistUserIds.length : before;
      const embed = buildModLogEmbed({
        title: 'AI blacklist updated',
        moderator: interaction.user,
        target: { id: targetId, tag: `id ${targetId}` },
        reason: `${action} ai global blacklist`,
        extraFields: [
          { name: 'Before', value: String(before), inline: true },
          { name: 'After', value: String(after), inline: true },
        ],
        color: action === 'add' ? 0xed4245 : 0x57f287,
      });
      await sendLogEmbed({ guild: resolvedGuild || interaction.guild, config, getGuildConfig, client }, embed);
      return;
    }

    if (interaction.commandName === 'creatorwhitelist') {
      if (!hasCreatorWhitelistAccess(config, interaction.user.id)) {
        await interaction.reply({
          content: pickRoast(),
          ephemeral: true,
        });
        return;
      }

      const action = String(interaction.options.getString('action', true) || '').toLowerCase();
      const user = interaction.options.getUser('user', false);
      const userIdRaw = String(interaction.options.getString('userid', false) || '').trim();
      const targetId = user?.id || parseUserIdToken(userIdRaw);
      const list = Array.isArray(config.creatorWhitelistUserIds) ? config.creatorWhitelistUserIds : [];

      if (action === 'list') {
        const lines = list.length
          ? list.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`)
          : ['(empty)'];
        await interaction.reply({
          content: neutralizeMentions(`creator whitelist:\n${lines.join('\n')}`),
          ephemeral: true,
          allowedMentions: allowedMentionsAiSafe(),
        });
        return;
      }

      if (action !== 'add' && action !== 'remove') {
        await interaction.reply({
          content: 'invalid action use add/remove/list',
          ephemeral: true,
        });
        return;
      }

      if (!targetId) {
        await interaction.reply({
          content: 'provide a user or userid',
          ephemeral: true,
        });
        return;
      }

      if (targetId === CREATOR_USER_ID) {
        await interaction.reply({
          content: 'creator already has access',
          ephemeral: true,
        });
        return;
      }

      const before = list.length;
      if (action === 'add') {
        if (!list.includes(targetId)) list.push(targetId);
        config.creatorWhitelistUserIds = list;
        saveConfig(config);
        await interaction.reply({
          content: `creator-whitelisted user id ${targetId}`,
          ephemeral: false,
          allowedMentions: allowedMentionsAiSafe(),
        });
      } else {
        config.creatorWhitelistUserIds = list.filter((id) => id !== targetId);
        saveConfig(config);
        await interaction.reply({
          content: `removed user id ${targetId} from creator whitelist`,
          ephemeral: false,
          allowedMentions: allowedMentionsAiSafe(),
        });
      }

      const after = Array.isArray(config.creatorWhitelistUserIds) ? config.creatorWhitelistUserIds.length : before;
      const embed = buildModLogEmbed({
        title: 'Creator whitelist updated',
        moderator: interaction.user,
        target: { id: targetId, tag: `id ${targetId}` },
        reason: `${action} creator whitelist`,
        extraFields: [
          { name: 'Before', value: String(before), inline: true },
          { name: 'After', value: String(after), inline: true },
        ],
        color: action === 'add' ? 0x57f287 : 0xed4245,
      });
      await sendLogEmbed({ guild: resolvedGuild || interaction.guild, config, getGuildConfig, client }, embed);
      return;
    }

    if (interaction.commandName === 'say') {
      if (!hasModPermission(interaction.memberPermissions || interaction.member)) {
        await interaction.reply({
          content: 'You need **Manage Messages** (or similar moderator permissions) to use this command.',
          ephemeral: true,
        });
        return;
      }

      const text = interaction.options.getString('text', true);
      const replyTo = interaction.options.getString('reply_to', false);

      await interaction.deferReply({ ephemeral: true });

      const channel = interaction.channel;
      if (!channel || !channel.isTextBased()) {
        await interaction.editReply('This command can only be used in a text channel.').catch(() => {});
        return;
      }

      try {
        const res = await sendWithMentionReview({
          guild: resolvedGuild,
          requestedBy: interaction.user,
          channel,
          replyToMessageId: replyTo || null,
          content: text,
          source: 'say',
          allowedMentions: allowedMentionsSafe(),
        });

        if (res.reviewed && !res.sent) {
          if (res.error) {
            await interaction.editReply(`Blocked: ${res.error}`).catch(() => {});
          } else {
            await interaction.editReply('Sent for review in the log channel.').catch(() => {});
          }
        } else {
          await interaction.editReply('Sent.').catch(() => {});
        }

        const embed = buildModLogEmbed({
          title: 'Say command used',
          moderator: interaction.user,
          target: null,
          reason: 'N/A',
          extraFields: [
            { name: 'Channel', value: `<#${interaction.channelId}> (\`${interaction.channelId}\`)`, inline: false },
            { name: 'Text', value: neutralizeMentions(text.length > 1024 ? text.slice(0, 1021) + '...' : text), inline: false },
            ...(replyTo ? [{ name: 'Reply to', value: `\`${replyTo}\``, inline: false }] : []),
            { name: 'Reviewed', value: String(!!res.reviewed), inline: true },
          ],
          color: 0x57f287,
        });
        await sendLogEmbed({ guild: resolvedGuild || interaction.guild, config, getGuildConfig, client }, embed);
      } catch (err) {
        console.error('Failed to run /say:', err);
        await interaction.editReply('Failed to send the message. Check bot permissions.').catch(() => {});
      }

      return;
    }

    if (interaction.commandName === 'mute') {
      if (!interaction.guild) {
        await interaction.reply({ content: 'this command can only be used in a server', ephemeral: true }).catch(() => {});
        return;
      }
      if (!hasModPermission(interaction.memberPermissions || interaction.member)) {
        await interaction.reply({
          content: 'You need **Manage Messages** (or similar moderator permissions) to use this command.',
          ephemeral: true,
        });
        return;
      }

      const me = resolvedGuild?.members?.me || (await resolvedGuild?.members?.fetchMe?.().catch(() => null));
      if (!me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
        await interaction.reply({
          content: 'I need **Moderate Members** permission to do that.',
          ephemeral: true,
        });
        return;
      }

      const durationToken = interaction.options.getString('duration', true);
      const user = interaction.options.getUser('user', false);
      const userIdRaw = interaction.options.getString('userid', false);
      const reason = interaction.options.getString('reason', false) || '';

      let durationMs = parseDurationToMs(durationToken);
      const maxTimeoutMs = 28 * 24 * 60 * 60 * 1000;
      if (durationMs != null && durationMs > maxTimeoutMs) durationMs = maxTimeoutMs;

      if (durationMs == null) {
        await interaction.reply({ content: 'Invalid duration. Use like `30m`, `1d`, `2h`.', ephemeral: true });
        return;
      }

      const targetId = user?.id || userIdRaw;
      if (!targetId) {
        await interaction.reply({ content: 'Provide `user` or `userid`.', ephemeral: true });
        return;
      }

      const member = await resolvedGuild?.members?.fetch?.(targetId).catch(() => null);
      if (!member) {
        await interaction.reply({ content: 'Could not find that user in this server.', ephemeral: true });
        return;
      }

      if (!member.moderatable) {
        await interaction.reply({
          content: 'I cannot timeout that member (role hierarchy or permissions).',
          ephemeral: true,
        });
        return;
      }

      try {
        await member.timeout(durationMs, reason || 'No reason provided');
      } catch (e) {
        console.error('mute failed:', e);
        await interaction.reply({
          content: 'Failed to mute (timeout) that user. Check bot permissions.',
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({ content: `Muted ${member.user.tag} for ${formatDuration(durationMs)}.`, ephemeral: false });

      const embed = buildModLogEmbed({
        title: 'Member muted (timeout)',
        moderator: interaction.user,
        target: member.user,
        reason,
        extraFields: [{ name: 'Duration', value: formatDuration(durationMs), inline: true }],
        color: 0xfaa61a,
      });
      await sendLogEmbed({ guild: resolvedGuild || interaction.guild, config, getGuildConfig, client }, embed);
      return;
    }

    if (interaction.commandName === 'kick') {
      if (!interaction.guild) {
        await interaction.reply({ content: 'this command can only be used in a server', ephemeral: true }).catch(() => {});
        return;
      }
      if (!hasModPermission(interaction.memberPermissions || interaction.member)) {
        await interaction.reply({
          content: 'You need **Manage Messages** (or similar moderator permissions) to use this command.',
          ephemeral: true,
        });
        return;
      }

      const me = resolvedGuild?.members?.me || (await resolvedGuild?.members?.fetchMe?.().catch(() => null));
      if (!me?.permissions?.has(PermissionsBitField.Flags.KickMembers)) {
        await interaction.reply({
          content: 'I need **Kick Members** permission to do that.',
          ephemeral: true,
        });
        return;
      }

      const user = interaction.options.getUser('user', false);
      const userIdRaw = interaction.options.getString('userid', false);
      const reason = interaction.options.getString('reason', false) || '';

      const targetId = user?.id || userIdRaw;
      if (!targetId) {
        await interaction.reply({ content: 'Provide `user` or `userid`.', ephemeral: true });
        return;
      }

      const member = await resolvedGuild?.members?.fetch?.(targetId).catch(() => null);
      if (!member) {
        await interaction.reply({ content: 'Could not find that user in this server.', ephemeral: true });
        return;
      }

      if (!member.kickable) {
        await interaction.reply({
          content: 'I cannot kick that member (role hierarchy or permissions).',
          ephemeral: true,
        });
        return;
      }

      try {
        await member.kick(reason || 'No reason provided');
      } catch (e) {
        console.error('kick failed:', e);
        await interaction.reply({
          content: 'Failed to kick that user. Check bot permissions.',
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({ content: `Kicked ${member.user.tag}.`, ephemeral: false });

      const embed = buildModLogEmbed({
        title: 'Member kicked',
        moderator: interaction.user,
        target: member.user,
        reason,
        color: 0xed4245,
      });
      await sendLogEmbed({ guild: resolvedGuild || interaction.guild, config, getGuildConfig, client }, embed);
      return;
    }

    if (interaction.commandName === 'ban') {
      if (!interaction.guild) {
        await interaction.reply({ content: 'this command can only be used in a server', ephemeral: true }).catch(() => {});
        return;
      }
      if (!hasModPermission(interaction.memberPermissions || interaction.member)) {
        await interaction.reply({
          content: 'You need **Manage Messages** (or similar moderator permissions) to use this command.',
          ephemeral: true,
        });
        return;
      }

      const me = resolvedGuild?.members?.me || (await resolvedGuild?.members?.fetchMe?.().catch(() => null));
      if (!me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
        await interaction.reply({
          content: 'I need **Ban Members** permission to do that.',
          ephemeral: true,
        });
        return;
      }

      const user = interaction.options.getUser('user', false);
      const userIdRaw = interaction.options.getString('userid', false);
      const deleteToken = interaction.options.getString('delete', false);
      const reason = interaction.options.getString('reason', false) || '';

      const targetId = user?.id || userIdRaw;
      if (!targetId) {
        await interaction.reply({ content: 'Provide `user` or `userid`.', ephemeral: true });
        return;
      }

      const deleteSeconds = deleteToken
        ? normalizeBanDeleteSeconds(parseDurationToSeconds(deleteToken))
        : 0;

      if (deleteToken && deleteSeconds == null) {
        await interaction.reply({ content: 'Invalid delete duration. Use like `30m`, `24h`, `7d`.', ephemeral: true });
        return;
      }

      const targetUser = user || (await client.users.fetch(targetId).catch(() => null));
      if (!targetUser) {
        await interaction.reply({ content: 'Invalid user.', ephemeral: true });
        return;
      }

      const targetMember = await resolvedGuild?.members?.fetch?.(targetId).catch(() => null);
      if (targetMember && !targetMember.bannable) {
        await interaction.reply({
          content: 'I cannot ban that member (role hierarchy or permissions).',
          ephemeral: true,
        });
        return;
      }

      try {
        await resolvedGuild?.members?.ban?.(targetId, {
          reason: reason || 'No reason provided',
          deleteMessageSeconds: deleteSeconds,
        });
      } catch (e) {
        console.error('ban failed:', e);
        await interaction.reply({
          content: 'Failed to ban that user. Check bot permissions.',
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({ content: `Banned ${targetUser.tag}.`, ephemeral: false });

      const embed = buildModLogEmbed({
        title: 'Member banned',
        moderator: interaction.user,
        target: targetUser,
        reason,
        extraFields: [{ name: 'Delete messages', value: deleteToken ? `${deleteToken} (${deleteSeconds}s)` : '0s', inline: true }],
        color: 0xed4245,
      });
      await sendLogEmbed({ guild: resolvedGuild || interaction.guild, config, getGuildConfig, client }, embed);
      return;
    }

    if (interaction.commandName === 'tempban') {
      if (!interaction.guild) {
        await interaction.reply({ content: 'this command can only be used in a server', ephemeral: true }).catch(() => {});
        return;
      }
      if (!hasModPermission(interaction.memberPermissions || interaction.member)) {
        await interaction.reply({
          content: 'You need **Manage Messages** (or similar moderator permissions) to use this command.',
          ephemeral: true,
        });
        return;
      }

      const me = resolvedGuild?.members?.me || (await resolvedGuild?.members?.fetchMe?.().catch(() => null));
      if (!me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
        await interaction.reply({
          content: 'I need **Ban Members** permission to do that.',
          ephemeral: true,
        });
        return;
      }

      const user = interaction.options.getUser('user', false);
      const userIdRaw = interaction.options.getString('userid', false);
      const durationToken = interaction.options.getString('duration', false);
      const reason = interaction.options.getString('reason', false) || '';

      const targetId = user?.id || userIdRaw;
      if (!targetId) {
        await interaction.reply({ content: 'Provide `user` or `userid`.', ephemeral: true });
        return;
      }

      const durationMs = durationToken ? parseDurationToMs(durationToken) : parseDurationToMs('1d');
      if (durationToken && durationMs == null) {
        await interaction.reply({ content: 'Invalid duration. Use like `30m`, `24h`, `7d`.', ephemeral: true });
        return;
      }

      const deleteSeconds = durationToken
        ? normalizeBanDeleteSeconds(parseDurationToSeconds(durationToken))
        : 0;

      const targetUser = user || (await client.users.fetch(targetId).catch(() => null));
      if (!targetUser) {
        await interaction.reply({ content: 'Invalid user.', ephemeral: true });
        return;
      }

      const targetMember = await resolvedGuild?.members?.fetch?.(targetId).catch(() => null);
      if (targetMember && !targetMember.bannable) {
        await interaction.reply({
          content: 'I cannot ban that member (role hierarchy or permissions).',
          ephemeral: true,
        });
        return;
      }

      try {
        await resolvedGuild?.members?.ban?.(targetId, {
          reason: reason || 'No reason provided',
          deleteMessageSeconds: deleteSeconds || 0,
        });
      } catch (e) {
        console.error('tempban failed:', e);
        await interaction.reply({
          content: 'Failed to ban that user. Check bot permissions.',
          ephemeral: true,
        });
        return;
      }

      guildCfg.tempBans.push({
        userId: targetId,
        userTag: targetUser.tag,
        reason: reason || 'No reason provided',
        expiresAt: Date.now() + (durationMs || parseDurationToMs('1d')),
      });
      saveConfig(config);

      await interaction.reply({
        content: `Tempbanned ${targetUser.tag} for ${formatDuration(durationMs)}.`,
        ephemeral: false,
      });

      const embed = buildModLogEmbed({
        title: 'Member tempbanned',
        moderator: interaction.user,
        target: targetUser,
        reason,
        extraFields: [
          { name: 'Duration', value: formatDuration(durationMs), inline: true },
          { name: 'Delete messages', value: deleteSeconds ? `${deleteSeconds}s` : '0s', inline: true },
        ],
        color: 0xed4245,
      });
      await sendLogEmbed({ guild: resolvedGuild || interaction.guild, config, getGuildConfig, client }, embed);
      return;
    }
  });

  function addHfApiKey(keyRaw = '') {
    const key = String(keyRaw || '').trim();
    if (!/^hf_[a-zA-Z0-9]{10,}$/.test(key)) {
      return { ok: false, error: 'invalid hf key format' };
    }

    const keys = Array.isArray(config.hfApiKeys) ? config.hfApiKeys : [];
    if (keys.includes(key)) {
      return { ok: true, added: false, masked: maskApiKey(key), total: keys.length };
    }

    keys.push(key);
    config.hfApiKeys = keys;
    ensureHfUsageRecord(key);
    saveConfig(config);

    return { ok: true, added: true, masked: maskApiKey(key), total: keys.length };
  }

  async function start() {
    await client.login(TOKEN);
  }

  return { start, client, addHfApiKey };
}

module.exports = { createBot };
