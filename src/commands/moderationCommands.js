const MODERATION_PREFIX_COMMANDS = new Set([
  'setbanch',
  'setbanchannel',
  'setlogchannel',
  'setlogch',
  'setgloballog',
  'setprefix',
  'mute',
  'kick',
  'ban',
  'tempban',
]);

const MODERATION_SLASH_COMMANDS = new Set([
  'setbanchannel',
  'setprefix',
  'setlogchannel',
  'attachments',
  'say',
  'mute',
  'kick',
  'ban',
  'tempban',
]);

function isModerationPrefixCommand(cmd) {
  return MODERATION_PREFIX_COMMANDS.has(String(cmd || '').toLowerCase());
}

function isModerationSlashCommand(commandName) {
  return MODERATION_SLASH_COMMANDS.has(String(commandName || '').toLowerCase());
}

module.exports = {
  MODERATION_PREFIX_COMMANDS,
  MODERATION_SLASH_COMMANDS,
  isModerationPrefixCommand,
  isModerationSlashCommand,
};
