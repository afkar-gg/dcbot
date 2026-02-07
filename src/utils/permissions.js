const { PermissionFlagsBits } = require('discord.js');

function getPermissions(source) {
  // source can be GuildMember, interaction.memberPermissions, etc.
  if (!source) return null;
  if (typeof source.has === 'function') return source; // PermissionsBitField
  if (source.permissions && typeof source.permissions.has === 'function') return source.permissions;
  return null;
}

function hasBanPermission(source) {
  const perms = getPermissions(source);
  return (
    perms?.has(PermissionFlagsBits.Administrator) ||
    perms?.has(PermissionFlagsBits.BanMembers)
  );
}

function hasModPermission(source) {
  const perms = getPermissions(source);
  return (
    perms?.has(PermissionFlagsBits.Administrator) ||
    perms?.has(PermissionFlagsBits.ManageGuild) ||
    perms?.has(PermissionFlagsBits.ManageMessages) ||
    perms?.has(PermissionFlagsBits.BanMembers) ||
    perms?.has(PermissionFlagsBits.KickMembers) ||
    perms?.has(PermissionFlagsBits.ModerateMembers)
  );
}

module.exports = {
  hasBanPermission,
  hasModPermission,
};
