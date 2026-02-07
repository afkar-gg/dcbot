const { Client, GatewayIntentBits, ActivityType, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
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
} = require('./utils/time');

const { buildModLogEmbed, sendLogEmbed } = require('./services/logService');
const { huggingfaceChatCompletion } = require('./services/huggingfaceService');
const { neutralizeMentions } = require('./utils/sanitize');

const EXEMPT_USER_ID = '777427217490903080';

// Track in-flight AI responses so we can nudge the user if the model/provider is slow.
// Keyed by triggering message id.
const aiInFlight = new Map();

const HOT_TAKES = [
  'cats are better than dogs',
  'fps games are overrated',
  'most movie sequels are mid',
  'android ui clears ios',
  'dark mode 24/7 is cringe',
  'chess is just math cosplay',
  'energy drinks taste like battery acid',
  'anime openings carry the whole show sometimes',
  'vr is still not there yet',
  'singleplayer > ranked grinding',
  'controllers > keyboard for chill gaming',
];

const lastHotTakeByGuild = new Map();

function pickHotTake(guildId) {
  const last = lastHotTakeByGuild.get(guildId);
  const choices = last ? HOT_TAKES.filter((t) => t !== last) : HOT_TAKES;
  const take = choices[Math.floor(Math.random() * choices.length)] || HOT_TAKES[0];
  lastHotTakeByGuild.set(guildId, take);
  return take;
}

function buildHelpText(prefix) {
  return [
    '**Commands**',
    `• \`/ping\` or \`${prefix}ping\` - Shows bot latency`,
    `• \`/help\` or \`${prefix}help\` - DM this command list`,
    `• \`/setbanchannel\` or \`${prefix}setbanchannel\` (alias: \`${prefix}setbanch\`) - Set ban channel`,
    `• \`/setlogchannel\` or \`${prefix}setlogchannel\` (alias: \`${prefix}setlogch\`) - Set log channel`,
    `• \`/setprefix\` or \`${prefix}setprefix <new>\` - Change server prefix`,
    `• \`/say\` - Bot says something (mods only, mention-review protected)`,
    `• \`/mute\` or \`${prefix}mute <@user|id> <duration> <reason?>\` - Timeout`,
    `• \`/kick\` or \`${prefix}kick <@user|id> <reason?>\` - Kick`,
    `• \`/ban\` or \`${prefix}ban <@user|id> <delete?> <reason?>\` - Ban`,
    `• \`/tempban\` or \`${prefix}tempban <@user|id> <duration?> <reason?>\` - Tempban`,
  ].join('\n');
}

async function dmHelp(user, prefix) {
  return user.send({ content: buildHelpText(prefix) });
}

function stripControlChars(text) {
  if (!text) return '';
  // Remove non-printable control chars that can sneak into usernames/messages
  return String(text).replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
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

function stripModelThinking(text) {
  if (!text) return '';
  let out = String(text);

  // Remove common chain-of-thought wrappers
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '');
  out = out.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');

  // Some models prefix with "Thought:" blocks
  out = out.replace(/^(?:thought|thinking|analysis)\s*:\s*[\s\S]*?\n\s*/i, '');

  // Trim extra whitespace
  return out.trim();
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

function safeReply(message, { content, allowedMentions } = {}) {
  if (!message) return Promise.resolve(null);
  // Try replying to the triggering message first; if that fails, fall back to sending in channel.
  return retry(() => message.reply({ content, allowedMentions }), { retries: 1, delayMs: 400 })
    .catch(() => retry(() => message.channel?.send?.({ content, allowedMentions }), { retries: 1, delayMs: 400 }))
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

async function fetchReplyChain(message, maxDepth = 4) {
  const chain = [];
  let current = message;

  for (let i = 0; i < maxDepth; i += 1) {
    const refId = current?.reference?.messageId;
    if (!refId) break;

    const prev = await current.channel.messages.fetch(refId).catch(() => null);
    if (!prev) break;

    chain.push(prev);
    current = prev;
  }

  return chain;
}

function formatMessageForContext(msg) {
  const tag = stripControlChars(msg?.author?.tag || 'unknown');
  const content = stripControlChars(msg?.content || '');

  const bits = [];
  bits.push(`${tag}: ${content || '(no text)'}`);

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

function containsSelfHarm(text) {
  const t = (text || '').toLowerCase();
  return (
    /\bkys\b/.test(t) ||
    t.includes('kill yourself') ||
    t.includes('kill urself') ||
    t.includes('end yourself') ||
    t.includes('suicide')
  );
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

function createBot() {
  const TOKEN = process.env.DISCORD_TOKEN;
  if (!TOKEN) {
    throw new Error(
      'Missing DISCORD_TOKEN environment variable. Create a .env file (see .env.example) or export DISCORD_TOKEN before starting the bot.'
    );
  }

  const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;
  const HF_CHAT_MODEL = process.env.HF_CHAT_MODEL || 'moonshotai/Kimi-K2.5:novita';

  const config = loadConfig();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  // Presence rotation
  const presenceStates = [
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
    if (!guildCfg.logChannelId) {
      return { ok: false, reason: 'No log channel set. Use /setlogchannel first.' };
    }

    const logChannel = await guild.channels.fetch(guildCfg.logChannelId).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) {
      return { ok: false, reason: 'Log channel is invalid. Set it again with /setlogchannel.' };
    }

    const id = crypto.randomBytes(6).toString('hex');
    const embed = buildMentionReviewEmbed({
      requestedBy,
      channelId: targetChannelId,
      content,
      source,
    });

    const row = buildMentionReviewRow(id);

    let msg;
    try {
      msg = await logChannel.send({ embeds: [embed], components: [row] });
    } catch (e) {
      console.error('Failed to send mention-review message to log channel:', e);
      return { ok: false, reason: 'Cant post to the log channel (missing perms?) set /setlogchannel again' };
    }

    const expiresAt = Date.now() + 60_000;
    pendingMentionReviews.set(id, {
      id,
      guildId: guild.id,
      logChannelId: logChannel.id,
      reviewMessageId: msg.id,
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

      const expiredEmbed = withStatus(
        buildMentionReviewEmbed({
          requestedBy,
          channelId: targetChannelId,
          content,
          source,
        }),
        'Auto-rejected (timeout)',
        0xed4245
      );

      await msg.edit({ embeds: [expiredEmbed], components: [] }).catch(() => {});
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
  }) {
    const danger = detectDangerousMentions(content);

    // Even if the detector misses something, we still enforce allowedMentions at send time.
    const safeAllowedMentions = allowedMentions || allowedMentionsSafe();

    if (!danger.dangerous) {
      // Safe send
      try {
        await retry(async () => {
          if (replyToMessageId) {
            // Avoid fetching messages (can require Read Message History). Use reply reference instead.
            await channel.send({
              content,
              allowedMentions: safeAllowedMentions,
              reply: { messageReference: replyToMessageId, failIfNotExists: false },
            });
          } else {
            await channel.send({ content, allowedMentions: safeAllowedMentions });
          }
        });
        return { sent: true, reviewed: false };
      } catch (e) {
        console.error('Failed to send message:', e);
        return { sent: false, reviewed: false, error: 'send failed (missing perms?)' };
      }
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
          await sendLogEmbed({ guild, config, getGuildConfig }, embed);
        } catch (e) {
          console.error('Failed to unban expired tempban:', e);
        }
      }
    }
  }

  // Slash command builders
  const pingCommand = new SlashCommandBuilder().setName('ping').setDescription('Shows the bot latency.');
  const helpCommand = new SlashCommandBuilder().setName('help').setDescription('DMs you the bot command list.');
  const setBanChannelCommand = new SlashCommandBuilder()
    .setName('setbanchannel')
    .setDescription('Set this channel as ban channel (msg => delete 24h + ban; exempt user ignored).');
  const setPrefixCommand = new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Changes the bot prefix for this server.')
    .addStringOption((opt) => opt.setName('prefix').setDescription('New prefix, e.g. s.').setRequired(true));
  const setLogChannelCommand = new SlashCommandBuilder()
    .setName('setlogchannel')
    .setDescription('Set log channel for mod actions (mods only).');

  const sayCommand = new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot send a message (mods only).')
    .addStringOption((opt) => opt.setName('text').setDescription('Text to send').setRequired(true))
    .addStringOption((opt) =>
      opt.setName('reply_to').setDescription('Message ID to reply to (optional)').setRequired(false)
    );

  const muteCommand = new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout a member (mods only).')
    .addStringOption((opt) => opt.setName('duration').setDescription('e.g. 30m, 1d').setRequired(true))
    .addUserOption((opt) => opt.setName('user').setDescription('User to mute').setRequired(false))
    .addStringOption((opt) => opt.setName('userid').setDescription('User ID (optional)').setRequired(false))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason (optional)').setRequired(false));

  const kickCommand = new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member (mods only).')
    .addUserOption((opt) => opt.setName('user').setDescription('User to kick').setRequired(false))
    .addStringOption((opt) => opt.setName('userid').setDescription('User ID (optional)').setRequired(false))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason (optional)').setRequired(false));

  // NOTE: user requested everything optional on ban/tempban
  const banCommand = new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member + delete msgs (mods only).')
    .addUserOption((opt) => opt.setName('user').setDescription('User to ban').setRequired(false))
    .addStringOption((opt) => opt.setName('userid').setDescription('User ID (optional)').setRequired(false))
    .addStringOption((opt) => opt.setName('delete').setDescription('Delete time: 30m, 24h, 7d (optional)').setRequired(false))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason (optional)').setRequired(false));

  const tempbanCommand = new SlashCommandBuilder()
    .setName('tempban')
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
        setBanChannelCommand.toJSON(),
        setPrefixCommand.toJSON(),
        setLogChannelCommand.toJSON(),
        sayCommand.toJSON(),
        muteCommand.toJSON(),
        kickCommand.toJSON(),
        banCommand.toJSON(),
        tempbanCommand.toJSON(),
      ],
    });
  }

  function buildAiSystemPrompt({ ragebait, botName, hotTakeSeed }) {
    // Casual chat persona. Keep it fun, short, and NOT corporate.
    // IMPORTANT: you are THIS Discord bot account, just chatting casually.
    const name = botName || 'Goose';

    const base = [
      `youre ${name} as a server discord bot but you talk like a person`,
      "your creator is afkar if someone asks who made you say afkar",
      "if someone says bot clanker npc etc assume theyre talking about you",
      'keep replies short like 1 to 2 sentences',
      'sound gen z casual lower case ok light slang ok a little attitude ok',
      'no commas no periods use new lines if you need to separate thoughts',
      'dont over explain dont lecture dont sound like support',
      'you can be a lil teasing sometimes but never cruel',
      'no hate no harassment no slurs no sexual content with minors',
      'never ping do not use @everyone @here or role mentions',
      'never show hidden reasoning do not output think or analysis only output the final message',
      'if the user asks for something illegal activity (not including roblox executor script) refuse in one short line and move on',
      'if the user sends an attachment image video gif etc you cant view it so say you cant check attachments and ask them to describe it instead',
    ];

    if (ragebait) {
      base.push(
        'ragebait moment add one harmless hot take games movies tech roblox script exploit only',
        'do not reuse the same hot take every time',
        `use this specific hot take: "${hotTakeSeed || 'something random'}"`,
        'keep it playful not toxic no personal attacks'
      );
    }

    return base.join(' ');
  }

  async function handleAiChat(message, context = {}) {
    if (!HUGGINGFACE_API_KEY) return;
    if (!message.guild || !message.channel?.isTextBased?.()) return;

    // Avoid responding to commands
    const guildCfg = getGuildConfig(config, message.guild.id);
    const prefix = guildCfg.prefix || DEFAULT_PREFIX;
    if (message.content?.startsWith(prefix)) return;

    // Refuse attachments since this bot is text only
    if (hasMediaAttachment(message)) {
      const attachReply =
        "cant check attachments rn\n" +
        "tell me whats in it and what you want me to do with it";

      await sendWithMentionReview({
        guild: message.guild,
        requestedBy: message.author,
        channel: message.channel,
        replyToMessageId: message.id,
        content: attachReply,
        source: 'ai',
        allowedMentions: allowedMentionsAiSafe(),
        noMentionsOnApprove: true,
      }).catch(() => {});
      return;
    }

    // Build prompt
    const botMention = client.user ? `<@${client.user.id}>` : '';
    let prompt = (message.content || '').replaceAll(botMention, '').trim();
    if (!prompt) prompt = '(no text)';

    // Build deeper reply chain context
    const chain = await fetchReplyChain(message, 5).catch(() => []);

    // If we already got a replied message via the trigger path, prefer it as the first hop
    if (context.repliedText && chain.length === 0) {
      // fallback keeps old behavior in edge cases
    }

    const chainText = chain.length
      ? chain
          .slice(0, 5)
          .reverse()
          .map((m) => formatMessageForContext(m))
          .join('\n\n')
      : '';

    const repliedText = context.repliedText ? stripControlChars(String(context.repliedText)) : '';
    const repliedAuthorTag = context.repliedAuthorTag ? stripControlChars(String(context.repliedAuthorTag)) : '';
    const repliedAuthorDisplayName = context.repliedAuthorDisplayName
      ? stripControlChars(String(context.repliedAuthorDisplayName))
      : '';
    const repliedAuthorIsMod = !!context.repliedAuthorIsMod;
    const repliedAuthorIsBot = !!context.repliedAuthorIsBot;

    const repliedWho = repliedAuthorDisplayName || repliedAuthorTag || 'someone';

    const repliedMeta = repliedText
      ? ` (replied-to user: ${repliedWho}${repliedAuthorIsMod ? ' | moderator' : ''}${repliedAuthorIsBot ? ' | bot' : ''})`
      : '';

    const userPayload = chainText
      ? `Chat context\n\n${chainText}\n\nNew message from ${message.author.tag}${repliedMeta}: ${prompt}`
      : repliedText
        ? `User ${message.author.tag}${repliedMeta} replied: ${prompt}\n\nThey replied to this message: ${repliedText}`
        : `User ${message.author.tag} said: ${prompt}`;

    // Self-harm handling: do not ragebait, do not be casual-dismissive.
    if (containsSelfHarm(message.content)) {
      const safetyReply =
        "chill dude i wont be joking around tht";

      await sendWithMentionReview({
        guild: message.guild,
        requestedBy: message.author,
        channel: message.channel,
        replyToMessageId: message.id,
        content: safetyReply,
        source: 'ai',
        allowedMentions: allowedMentionsAiSafe(),
        noMentionsOnApprove: true,
      }).catch(() => {});
      return;
    }

    const botDisplayName =
      message.guild?.members?.me?.displayName ||
      message.guild?.members?.me?.user?.username ||
      client.user?.username ||
      'Goose';

    const botName = pickBotNameFromDisplayName(botDisplayName);

    const ragebait = Math.random() < 0.08; // ~8% of the time
    const hotTakeSeed = ragebait ? pickHotTake(message.guild?.id) : '';
    const systemText = buildAiSystemPrompt({ ragebait, botName, hotTakeSeed });

    const stopTyping = startTyping(message.channel);

    const aiCallTimeoutMs = Number(process.env.AI_CALL_TIMEOUT_MS || 25_000);

    // Register in-flight request for watchdog nudges.
    aiInFlight.set(message.id, {
      message,
      startedAt: Date.now(),
      nudged: false,
    });

    let aiText = '';
    try {
      aiText = await withTimeout(
        huggingfaceChatCompletion({
          apiKey: HUGGINGFACE_API_KEY,
          model: HF_CHAT_MODEL,
          temperature: 0.9,
          maxTokens: 420,
          timeoutMs: 90_000,
          messages: [
            { role: 'system', content: systemText },
            { role: 'user', content: userPayload },
          ],
        }),
        aiCallTimeoutMs,
        `AI call exceeded ${aiCallTimeoutMs}ms`
      );
    } catch (e) {
      console.error('AI error:', e);
      await safeReply(message, {
        content: 'my bad ai is taking too long try again in a sec',
        allowedMentions: allowedMentionsSafe(),
      });
      return;
    } finally {
      stopTyping();
      aiInFlight.delete(message.id);
    }

    aiText = stripModelThinking(aiText);
    if (!aiText) {
      await safeReply(message, {
        content: "i blanked lol say it again",
        allowedMentions: allowedMentionsSafe(),
      });
      return;
    }

    // Extra safety: neutralize visible mass-mentions in AI output.
    aiText = neutralizeMentions(aiText);

    // Style pass to match requested vibe
    aiText = aiText.replace(/[,.]/g, '');

    // Reply to the user message
    const sendRes = await sendWithMentionReview({
      guild: message.guild,
      requestedBy: message.author,
      channel: message.channel,
      replyToMessageId: message.id,
      content: aiText,
      source: 'ai',
      allowedMentions: allowedMentionsAiSafe(),
      noMentionsOnApprove: true,
    });

    if (sendRes.error && !sendRes.sent) {
      await safeReply(message, {
        content: `cant send rn ${sendRes.error}`,
        allowedMentions: allowedMentionsSafe(),
      });
    }

    if (sendRes.reviewed && !sendRes.sent) {
      // If it's blocked because no log channel, tell user. If review is pending, also tell user.
      if (sendRes.error) {
        await safeReply(message, {
          content: `cant send that rn ${sendRes.error}`,
          allowedMentions: allowedMentionsSafe(),
        });
      } else {
        await safeReply(message, {
          content: 'mods gotta ok that first its in the log channel',
          allowedMentions: allowedMentionsSafe(),
        });
      }
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
        { name: 'Reviewed', value: String(!!sendRes.reviewed), inline: true },
      ],
      color: 0x57f287,
    });
    await sendLogEmbed({ guild: message.guild, config, getGuildConfig }, embed);
  }

  // =====================
  // Events
  // =====================
  client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Watchdog: every 7s, nudge users if an AI response is still running.
    // This prevents "silent" feeling when providers stall.
    setInterval(async () => {
      const now = Date.now();
      for (const [messageId, entry] of aiInFlight.entries()) {
        const msg = entry?.message;
        if (!msg || !msg.channel) {
          aiInFlight.delete(messageId);
          continue;
        }

        // Nudge once after 7s.
        if (!entry.nudged && now - entry.startedAt >= 7000) {
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
    }, 7000);

    setNextPresence();
    setInterval(setNextPresence, 5000);

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
    if (!message.guild || message.author.bot) return;

    const guildCfg = getGuildConfig(config, message.guild.id);

    // Enforce ban channel
    if (guildCfg.banChannelId && message.channel.id === guildCfg.banChannelId) {
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
          await sendLogEmbed({ guild: message.guild, config, getGuildConfig }, embed);
        } catch (err) {
          console.error('Failed to enforce ban channel rule:', err);
        }
      }
      return;
    }

    // AI trigger: pinged or replied to bot
    const isMention = client.user && message.mentions.has(client.user);

    let repliedMessage = null;
    if (message.reference?.messageId) {
      repliedMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    }

    const isReplyToBot = !!(repliedMessage && client.user && repliedMessage.author.id === client.user.id);

    // 2% random chance to reply even if user didn't call the bot
    // Avoid random replies if the message contains mass-mention strings.
    const randomChat =
      Math.random() < 0.02 &&
      !detectDangerousMentions(message.content).dangerous &&
      !hasMediaAttachment(message);

    if (isMention || isReplyToBot || randomChat) {
      const repliedMember = repliedMessage?.member || null;
      const repliedDisplayName = repliedMember?.displayName || repliedMessage?.author?.globalName || repliedMessage?.author?.username;

      const repliedIsMod = !!(
        repliedMember && hasModPermission(repliedMember)
      );

      const context = repliedMessage
        ? {
            repliedText: repliedMessage.content,
            repliedAuthorTag: repliedMessage.author?.tag,
            repliedAuthorDisplayName: repliedDisplayName,
            repliedAuthorIsMod: repliedIsMod,
            repliedAuthorIsBot: !!repliedMessage.author?.bot,
          }
        : {};

      // Fire and forget
      handleAiChat(message, context).catch(() => {});
    }

    // Prefix commands
    const prefix = guildCfg.prefix || DEFAULT_PREFIX;
    if (!message.content.startsWith(prefix)) return;

    const [rawCmd, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
    const cmd = (rawCmd || '').toLowerCase();

    if (cmd === 'ping') {
      const sent = await message.channel.send('pinging');
      const apiLatency = sent.createdTimestamp - message.createdTimestamp;
      const wsLatency = Math.round(client.ws.ping);
      await sent.edit(`pong\napi ${apiLatency}ms\nws ${wsLatency}ms`);
      return;
    }

    if (cmd === 'help') {
      try {
        await dmHelp(message.author, prefix);
        await message.reply('I sent you a DM with the commands list.');
      } catch {
        await message.reply('I could not DM you. Please enable DMs from server members.');
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
      await sendLogEmbed({ guild: message.guild, config, getGuildConfig }, embed);
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
      await sendLogEmbed({ guild: message.guild, config, getGuildConfig }, embed);
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
      await sendLogEmbed({ guild: message.guild, config, getGuildConfig }, embed);
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
      await sendLogEmbed({ guild: message.guild, config, getGuildConfig }, embed);
      return;
    }

    if (cmd === 'ban') {
      if (!hasModPermission(message.member)) {
        await message.reply('You need **Manage Messages** (or similar moderator permissions) to use this command.');
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

      await message.guild.members.ban(userId, {
        reason: reason || 'No reason provided',
        deleteMessageSeconds: deleteSeconds ?? 0,
      });

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
      await sendLogEmbed({ guild: message.guild, config, getGuildConfig }, embed);
      return;
    }

    if (cmd === 'tempban') {
      if (!hasModPermission(message.member)) {
        await message.reply('You need **Manage Messages** (or similar moderator permissions) to use this command.');
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

      await message.guild.members.ban(userId, {
        reason: reason || 'No reason provided',
        deleteMessageSeconds: deleteSeconds,
      });

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
      await sendLogEmbed({ guild: message.guild, config, getGuildConfig }, embed);
      return;
    }
  });

  // Slash commands + mention review buttons
  client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
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

        const logChannel = await guild.channels.fetch(pending.logChannelId).catch(() => null);
        const reviewMsg = logChannel && logChannel.isTextBased()
          ? await logChannel.messages.fetch(pending.reviewMessageId).catch(() => null)
          : null;

        if (action === 'reject') {
          if (reviewMsg) {
            const embed = withStatus(
              buildMentionReviewEmbed({
                requestedBy: { id: pending.requestedById, tag: pending.requestedByTag || 'Unknown' },
                channelId: pending.targetChannelId,
                content: pending.content,
                source: pending.source,
              }),
              'Rejected',
              0xed4245
            );
            await reviewMsg.edit({ embeds: [embed], components: [] }).catch(() => {});
          }

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
            ? allowedMentionsAiSafe()
            : allowedMentionsApproved({
                roleIds: danger.roleIds,
                allowEveryone,
              });

          if (pending.replyToMessageId) {
            const targetMsg = await targetChannel.messages.fetch(pending.replyToMessageId).catch(() => null);
            if (!targetMsg) throw new Error('Reply target not found');
            await targetMsg.reply({
              content: pending.content,
              allowedMentions: approvedAllowedMentions,
            });
          } else {
            await targetChannel.send({
              content: pending.content,
              allowedMentions: approvedAllowedMentions,
            });
          }

          if (reviewMsg) {
            const embed = withStatus(
              buildMentionReviewEmbed({
                requestedBy: { id: pending.requestedById, tag: pending.requestedByTag || 'Unknown' },
                channelId: pending.targetChannelId,
                content: pending.content,
                source: pending.source,
              }),
              `Approved by ${interaction.user.tag}`,
              0x57f287
            );
            await reviewMsg.edit({ embeds: [embed], components: [] }).catch(() => {});
          }

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
    if (!interaction.guildId) return;

    const guildCfg = getGuildConfig(config, interaction.guildId);
    const prefix = guildCfg.prefix || DEFAULT_PREFIX;

    if (interaction.commandName === 'ping') {
      const sent = await interaction.reply({ content: 'pinging', ephemeral: false, fetchReply: true });
      const apiLatency = sent.createdTimestamp - interaction.createdTimestamp;
      const wsLatency = Math.round(client.ws.ping);
      await interaction.editReply(`pong\napi ${apiLatency}ms\nws ${wsLatency}ms`);
      return;
    }

    if (interaction.commandName === 'help') {
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
      await sendLogEmbed({ guild: interaction.guild, config, getGuildConfig }, embed);
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
      await sendLogEmbed({ guild: interaction.guild, config, getGuildConfig }, embed);
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
          guild: interaction.guild,
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
        await sendLogEmbed({ guild: interaction.guild, config, getGuildConfig }, embed);
      } catch (err) {
        console.error('Failed to run /say:', err);
        await interaction.editReply('Failed to send the message. Check bot permissions.').catch(() => {});
      }

      return;
    }

    if (interaction.commandName === 'mute') {
      if (!hasModPermission(interaction.memberPermissions || interaction.member)) {
        await interaction.reply({
          content: 'You need **Manage Messages** (or similar moderator permissions) to use this command.',
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

      const member = await interaction.guild.members.fetch(targetId).catch(() => null);
      if (!member) {
        await interaction.reply({ content: 'Could not find that user in this server.', ephemeral: true });
        return;
      }

      await member.timeout(durationMs, reason || 'No reason provided');
      await interaction.reply({ content: `Muted ${member.user.tag} for ${formatDuration(durationMs)}.`, ephemeral: false });

      const embed = buildModLogEmbed({
        title: 'Member muted (timeout)',
        moderator: interaction.user,
        target: member.user,
        reason,
        extraFields: [{ name: 'Duration', value: formatDuration(durationMs), inline: true }],
        color: 0xfaa61a,
      });
      await sendLogEmbed({ guild: interaction.guild, config, getGuildConfig }, embed);
      return;
    }

    if (interaction.commandName === 'kick') {
      if (!hasModPermission(interaction.memberPermissions || interaction.member)) {
        await interaction.reply({
          content: 'You need **Manage Messages** (or similar moderator permissions) to use this command.',
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

      const member = await interaction.guild.members.fetch(targetId).catch(() => null);
      if (!member) {
        await interaction.reply({ content: 'Could not find that user in this server.', ephemeral: true });
        return;
      }

      await member.kick(reason || 'No reason provided');
      await interaction.reply({ content: `Kicked ${member.user.tag}.`, ephemeral: false });

      const embed = buildModLogEmbed({
        title: 'Member kicked',
        moderator: interaction.user,
        target: member.user,
        reason,
        color: 0xed4245,
      });
      await sendLogEmbed({ guild: interaction.guild, config, getGuildConfig }, embed);
      return;
    }

    if (interaction.commandName === 'ban') {
      if (!hasModPermission(interaction.memberPermissions || interaction.member)) {
        await interaction.reply({
          content: 'You need **Manage Messages** (or similar moderator permissions) to use this command.',
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

      await interaction.guild.members.ban(targetId, {
        reason: reason || 'No reason provided',
        deleteMessageSeconds: deleteSeconds,
      });

      await interaction.reply({ content: `Banned ${targetUser.tag}.`, ephemeral: false });

      const embed = buildModLogEmbed({
        title: 'Member banned',
        moderator: interaction.user,
        target: targetUser,
        reason,
        extraFields: [{ name: 'Delete messages', value: deleteToken ? `${deleteToken} (${deleteSeconds}s)` : '0s', inline: true }],
        color: 0xed4245,
      });
      await sendLogEmbed({ guild: interaction.guild, config, getGuildConfig }, embed);
      return;
    }

    if (interaction.commandName === 'tempban') {
      if (!hasModPermission(interaction.memberPermissions || interaction.member)) {
        await interaction.reply({
          content: 'You need **Manage Messages** (or similar moderator permissions) to use this command.',
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

      await interaction.guild.members.ban(targetId, {
        reason: reason || 'No reason provided',
        deleteMessageSeconds: deleteSeconds || 0,
      });

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
      await sendLogEmbed({ guild: interaction.guild, config, getGuildConfig }, embed);
      return;
    }
  });

  async function start() {
    await client.login(TOKEN);
  }

  return { start, client };
}

module.exports = { createBot };
