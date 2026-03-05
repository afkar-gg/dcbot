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
- `s.help all` (includes creator-only commands)

### AI Blacklist (mods)
- `/blacklist action:<add|remove|list> user:<optional> userid:<optional>`
- `s.blacklist <add|remove|list> <@user|id?>`

Blocks a user from using the AI chatbot in that server.

DMs you a list of available commands.

### Loadstring Hosting
- `s.loadstring <scriptName> [inlineScriptText]`
- `s.ls <scriptName> [inlineScriptText]`
- `/loadstring name:<scriptName> file:<optional> inline:<optional>`
- `s.lslist` / `/lslist`
- `s.lsremove <scriptName>` / `/lsremove name:<scriptName>`
- `s.lsinfo <scriptName>` / `/lsinfo name:<scriptName>`

Behavior:
- Reads a script from:
  1. file attachment on the command message,
  2. file attachment on the replied message,
  3. fallback inline script text after `<scriptName>`.
- For `/loadstring`, when both `file` and `inline` are provided, the attachment is used.
- Creates/updates a hosted raw script URL on `https://sc.afkar.lol/<username>/<scriptName>`.
- Stores up to `15` loadstrings per user (new names above the limit are rejected).
- Keeps up to `5` old versions per loadstring when content changes.
- `lsinfo` sends details in DM (current URL, timestamps, size, and old-version links).
- Old versions can be fetched via query hash (example: `https://sc.afkar.lol/<username>/<scriptName>?<hash>`).
- Copy button returns raw snippet text (mobile copy friendly).

### DM Support
Commands that do not depend on server context can be used in DM:
- Prefix: `s.ping`, `s.help`, `s.loadstring`, `s.ls`, `s.lslist`, `s.lsremove`, `s.lsinfo`
- Slash: `/ping`, `/help`, `/loadstring`, `/lslist`, `/lsremove`, `/lsinfo`

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
- AI chatbot uses **Groq API**. Configure `GROQ_API_KEY` in `config.json` or save keys via `s.addgq <key>`.
- Creator Groq commands: `s.addgq`, `s.rmgq`, `s.lsgq`, `s.lsgqmodel`, `s.setgq <modelId>`.
- Creator utility commands renamed: `s.setglog <#channel|channelId|off>` and `s.wl <add|remove|list> <@user|id?>`.
- Creator-only raw AI mode toggle: `s.q <on|off|toggle|status>` (turns off personality/sanitization shaping).
- AI chat is rate-limited per user (config keys: `AI_RATE_LIMIT_PER_MINUTE`, `AI_RATE_LIMIT_PING_ONLY_PER_MINUTE`).
- Reply detection for AI uses message tracking + fetch fallback (config: `AI_REPLY_TRACKER_MAX_IDS`, `AI_REPLY_TRACKER_TTL_MS`).
- Member facts context can be tuned with: `AI_MEMBER_FACTS_ALWAYS_INCLUDE_AUTHOR`, `AI_MEMBER_FACTS_CACHE_TTL_MS`, `AI_MEMBER_FACTS_FORCE_REFRESH_ON_INTENT`.
- Reply-thread participant signal (new speaker in thread context) can be toggled with `AI_THREAD_NEW_PARTICIPANT_SIGNAL`.
- Guaranteed visible AI fallback reply can be configured with `AI_FORCE_VISIBLE_REPLY` and `AI_FALLBACK_REPLY_TEXT`.
- Date/time answers use runtime clock context. Optional: set `BOT_TIMEZONE` (default `UTC`) and `BOT_TIME_LOCALE` (default `en-US`) in `config.json`.
- Ban-channel enforcement uses Discord built-in ban message deletion.
- Loadstring storage/serving is now expected to run as a separate `sc` service. Configure bot -> sc internal API with `LOADSTRING_API_BASE_URL`, `LOADSTRING_API_TOKEN`, and `LOADSTRING_API_TIMEOUT_MS`.
- AI now follows detected user language more aggressively (multilingual lock + retry when model drifts).
- AI personality now uses a medium-snark Gen Z tone (playful ragebait vibe, less abrasive), uses emojis often with a preference for `💀`, avoids `🙏`, and keeps punctuation minimal.
- Exact text `yo` gets a direct quick reply: `gurt`.
