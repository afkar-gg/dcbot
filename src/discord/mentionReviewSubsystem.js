const crypto = require('node:crypto');

function createMentionReviewSubsystem({
  client,
  config,
  getGuildConfig,
  retry,
  detectDangerousMentions,
  allowedMentionsSafe,
  allowedMentionsAiReplyPing,
  allowedMentionsApproved,
  hasModPermission,
  buildMentionReviewRow,
  buildMentionReviewEmbedForScope,
} = {}) {
  if (!client) throw new Error('createMentionReviewSubsystem requires client');

  const pendingMentionReviews = new Map();

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
      // eslint-disable-next-line no-await-in-loop
      const channel = await client.channels.fetch(entry.channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) continue;

      // eslint-disable-next-line no-await-in-loop
      const msg = await channel.messages.fetch(entry.messageId).catch(() => null);
      if (!msg) continue;

      const embed = entry.scope === 'global' ? embeds.global : embeds.guild;
      if (!embed) continue;

      // eslint-disable-next-line no-await-in-loop
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
      expiresAt: Date.now() + 60_000,
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
    const safeAllowedMentions = allowedMentions || allowedMentionsSafe();

    if (!danger.dangerous) {
      try {
        let sentMessage = null;
        await retry(async () => {
          if (replyToMessageId) {
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

  async function handleButtonInteraction(interaction) {
    const parts = String(interaction.customId || '').split(':');
    if (!(parts.length === 3 && parts[0] === 'mentionReview')) {
      return false;
    }

    const action = parts[1];
    const id = parts[2];

    const pending = pendingMentionReviews.get(id);
    if (!pending) {
      await interaction.reply({ content: 'This review is no longer active.', ephemeral: true }).catch(() => {});
      return true;
    }

    if (!hasModPermission(interaction.memberPermissions || interaction.member)) {
      await interaction.reply({ content: 'You are not allowed to approve/reject.', ephemeral: true }).catch(() => {});
      return true;
    }

    pendingMentionReviews.delete(id);

    const guild = await client.guilds.fetch(pending.guildId).catch(() => null);
    if (!guild) {
      await interaction.reply({ content: 'Guild not found.', ephemeral: true }).catch(() => {});
      return true;
    }

    if (action === 'reject') {
      const embeds = buildMentionReviewEmbedsForPending(pending, guild, 'Rejected', 0xed4245);
      await updateMentionReviewMessages(pending.reviewMessages, embeds, []);
      await interaction.reply({ content: 'Rejected.', ephemeral: true }).catch(() => {});
      return true;
    }

    try {
      const targetChannel = await guild.channels.fetch(pending.targetChannelId).catch(() => null);
      if (!targetChannel || !targetChannel.isTextBased()) throw new Error('Target channel invalid');

      const danger = detectDangerousMentions(pending.content);
      const allowEveryone = danger.hasEveryone || danger.hasHere;

      const approvedAllowedMentions = pending.noMentionsOnApprove
        ? allowedMentionsAiReplyPing()
        : allowedMentionsApproved({ roleIds: danger.roleIds, allowEveryone });

      if (pending.replyToMessageId) {
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

    return true;
  }

  return {
    pendingMentionReviews,
    sendWithMentionReview,
    handleButtonInteraction,
  };
}

module.exports = {
  createMentionReviewSubsystem,
};
