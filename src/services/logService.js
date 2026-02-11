const { EmbedBuilder } = require('discord.js');

function buildModLogEmbed({
  title,
  moderator,
  target,
  reason,
  extraFields = [],
  color = 0x2b2d31,
}) {
  const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp(new Date());

  if (moderator) {
    embed.addFields({
      name: 'Moderator',
      value: `${moderator.tag ?? 'Unknown'} (\`${moderator.id}\`)`,
      inline: false,
    });
  }

  if (target) {
    embed.addFields({
      name: 'Target',
      value: `${target.tag ?? 'Unknown'} (\`${target.id}\`)`,
      inline: false,
    });
  }

  embed.addFields({
    name: 'Reason',
    value: reason?.trim() ? reason : 'No reason provided',
    inline: false,
  });

  if (extraFields.length) embed.addFields(...extraFields);
  return embed;
}

async function sendLogEmbed({ guild, config, getGuildConfig, client }, embed) {
  try {
    const guildCfg = getGuildConfig(config, guild.id);
    const globalLogChannelId = config?.globalLogChannelId || null;

    const hasGuildLog = !!guildCfg.logChannelId;
    const hasGlobalLog = !!globalLogChannelId;
    if (!hasGuildLog && !hasGlobalLog) return;

    if (hasGuildLog) {
      const ch = await guild.channels.fetch(guildCfg.logChannelId).catch(() => null);
      if (ch && ch.isTextBased()) {
        await ch.send({ embeds: [embed] }).catch(() => {});
      }
    }

    if (hasGlobalLog && globalLogChannelId !== guildCfg.logChannelId) {
      const globalChannel = client
        ? await client.channels.fetch(globalLogChannelId).catch(() => null)
        : await guild.channels.fetch(globalLogChannelId).catch(() => null);

      if (globalChannel && globalChannel.isTextBased()) {
        const globalEmbed = EmbedBuilder.from(embed).addFields({
          name: 'Server',
          value: `${guild?.name || 'Unknown'} (\`${guild.id}\`)`,
          inline: false,
        });
        await globalChannel.send({ embeds: [globalEmbed] }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('Failed to send log embed:', e);
  }
}

module.exports = {
  buildModLogEmbed,
  sendLogEmbed,
};
