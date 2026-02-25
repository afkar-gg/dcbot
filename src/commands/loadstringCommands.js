const LOADSTRING_PREFIX_COMMANDS = new Set(['loadstring', 'ls', 'lslist', 'lsremove', 'lsinfo']);
const LOADSTRING_SLASH_COMMANDS = new Set(['loadstring', 'lslist', 'lsremove', 'lsinfo']);

function isLoadstringPrefixCommand(cmd) {
  return LOADSTRING_PREFIX_COMMANDS.has(String(cmd || '').toLowerCase());
}

function isLoadstringSlashCommand(commandName) {
  return LOADSTRING_SLASH_COMMANDS.has(String(commandName || '').toLowerCase());
}

module.exports = {
  LOADSTRING_PREFIX_COMMANDS,
  LOADSTRING_SLASH_COMMANDS,
  isLoadstringPrefixCommand,
  isLoadstringSlashCommand,
};
