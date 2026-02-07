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

async function sendLogEmbed({ guild, config, getGuildConfig }, embed) {
  try {
    const guildCfg = getGuildConfig(config, guild.id);
    if (!guildCfg.logChannelId) return;
    const ch = await guild.channels.fetch(guildCfg.logChannelId).catch(() => null);
    if (!ch || !ch.isTextBased()) return;
    await ch.send({ embeds: [embed] });
  } catch (e) {
    console.error('Failed to send log embed:', e);
  }
}

module.exports = {
  buildModLogEmbed,
  sendLogEmbed,
};
