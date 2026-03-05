# AI Mechanism Overview

This document explains how the AI flow works in this bot: trigger, context assembly, prompt building, sanitization, and fallback behavior.

## Triggering
- The bot responds when it is mentioned, when a user replies to a bot message, or via a small random trigger.
- Random triggers are blocked if the message includes mass mentions or media attachments.

## Context Assembly
- Reply chain context is collected when a user replies to a message. The chain is capped to a configured depth.
- For short messages, the bot skips deep context to reduce latency.
- If no reply chain is available and the trigger is random, the bot treats it as a standalone ambient jump-in.
- Context lines are formatted with author tag, display name, user id, and text content.

### Metadata Block
The bot includes a metadata block containing:
- Server name
- Current date/time and UTC time
- Attachment and media flags
- Trigger mode (direct/random)
- Context availability status (member facts and WEAO tracker)
- Optional: attachments, web results, executor tracker, and visible channels list

## Member Facts (Roles, Permissions, IDs)
- Member facts are only collected when the user explicitly asks for member info and provides a target.
- Explicit targets include: mentions, replies, explicit user IDs, quoted names, or @handles.
- Self and bot lookups are treated as explicit targets when the user asks for their own or the bot's info.
- If member lookup is explicitly requested and cannot be resolved, the bot asks for an @mention or a valid ID instead of guessing.

## Web Search and Executor Tracker
- Web search results are included only when a search intent is detected.
- The WEAO tracker is included only when executor status intent is detected.
- If WEAO is unavailable, the bot will not invent live status.

## Prompt Building
- System prompts are composed from JSON rule files in `src/ai/prompts/`.
- Runtime rules and mode rules (edit mode, attachments, web results) are appended to the system prompt.
- A detected reply language is injected as runtime context; the model is instructed to stay in that language unless the user switches.
- The final user payload is a combination of context text, metadata, and the user's message.

## Output Processing
- Raw model output is stripped of any `<think>` or `<analysis>` blocks.
- Output is sanitized to prevent prompt leaks, reasoning leaks, member-facts leaks, or gibberish.
- If the output is blocked, the bot retries once with a strict system prompt.
- If language detection says non-English and model output drifts into English, the bot retries once with a language-lock system prompt.

## Fallback Behavior
- If sanitization fails, the bot returns a context-specific fallback message:
  - Member facts leak: asks for @mention or ID
  - Prompt leak: asks to rephrase
  - Reasoning leak: refuses internal reasoning
  - Gibberish/empty: asks to try again
- A general fallback is used if no reason is identified.

## Final Reply
- Role mentions are converted to readable names without pinging.
- Mentions like @everyone and @here are neutralized to prevent pings.
- Replies are sent through a moderation review system when enabled.
- Exact quick-reply rule: message text `yo` returns `gurt` without an LLM call.
