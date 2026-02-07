# dcbot

## Prefix
Default prefix is `s.` (configurable per server).

You can change it with:
- Prefix command: `s.setprefix <newPrefix>`
- Slash command: `/setprefix prefix:<newPrefix>`

## Commands

## Moderation (hybrid)
All moderation commands require moderator permissions (Administrator / Manage Messages / etc.).

### Mute (timeout)
- `/mute user:<user> duration:<30m|1d> reason:<optional>`
- `s.mute @user 30m reason here`

### Kick
- `/kick user:<user> reason:<optional>`
- `s.kick @user reason here`

### Ban
- `/ban user:<user|optional> userid:<optional> delete:<optional> reason:<optional>`
- `s.ban @user 24h reason here`

`delete` uses Discord's built-in ban message deletion (max 7 days). If omitted, defaults to `0s`.

### Tempban
- `/tempban user:<user|optional> userid:<optional> duration:<optional> reason:<optional>`
- `s.tempban @user 1d reason here`

If `duration` is omitted, defaults to `1d`.

Tempban will automatically unban after the duration (checked every 60 seconds).

### Set Log Channel
- `/setlogchannel`
- `s.setlogchannel` (alias: `s.setlogch`)

Sets the current channel as the log channel. The bot will log embeds for:
- ban / tempban / kick / mute
- setbanchannel changes
- say usage


### Ping
- `/ping`
- `s.ping`

Shows the bot latency.

### Help
- `/help`
- `s.help`

DMs you a list of available commands.

### Set Ban Channel
- `/setbanchannel`
- `s.setbanchannel` (alias: `s.setbanch`)

Sets the **current channel** as the *ban channel*.

When a ban channel is configured, **any user** who sends a message in that channel will:
1. Have their last 24 hours of messages deleted by Discord (built-in ban deletion)
2. Be banned

Exception: user ID `777427217490903080` is exempt.

### Say (slash only)
- `/say text:<message> reply_to:<messageId?>`

Makes the bot send a message in the current channel.
- If `reply_to` is provided, the bot replies to that message ID.
- Mods only (requires Administrator / Manage Messages / similar).

### Set Prefix
- `/setprefix prefix:<newPrefix>`
- `s.setprefix <newPrefix>`

Changes the prefix for the current server.

## Notes
- AI chatbot uses **Hugging Face Inference API**. Configure `HUGGINGFACE_API_KEY` in `.env`.
- Ban-channel enforcement uses Discord built-in ban message deletion.
