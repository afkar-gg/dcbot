const { REST, Routes, SlashCommandBuilder } = require('discord.js');

function buildSlashCommands() {
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

  return [
    pingCommand,
    helpCommand,
    loadstringCommand,
    lsListCommand,
    lsRemoveCommand,
    lsInfoCommand,
    setBanChannelCommand,
    setPrefixCommand,
    setLogChannelCommand,
    attachmentsCommand,
    sayCommand,
    blacklistCommand,
    creatorWhitelistCommand,
    muteCommand,
    kickCommand,
    banCommand,
    tempbanCommand,
  ];
}

async function registerSlashCommands({ token, client, commands }) {
  const rest = new REST({ version: '10' }).setToken(token);
  if (!client.application?.id) {
    throw new Error('client.application.id is missing; cannot register slash commands.');
  }

  const list = Array.isArray(commands) && commands.length > 0
    ? commands
    : buildSlashCommands();

  await rest.put(Routes.applicationCommands(client.application.id), {
    body: list.map((command) => command.toJSON()),
  });
}

module.exports = {
  buildSlashCommands,
  registerSlashCommands,
};
