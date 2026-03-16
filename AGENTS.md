# Repository Guidelines

## Project Structure & Module Organization
- `index.js` boots the bot by calling `createBot()`.
- `src/` holds the implementation, grouped by domain.
- `src/commands/`, `src/discord/`, `src/services/`, `src/ai/`, `src/utils/`.
- `test/` contains Node test runner suites.
- `data/` stores runtime state.
- `config.example.json` and `.env.example` document required config keys.

## Build, Test, and Development Commands
- `npm install` installs dependencies.
- `npm start` runs the bot (`node index.js`).
- `npm test` runs the Node test runner (`node --test`).

## Coding Style & Naming Conventions
- CommonJS modules with 2-space indentation.
- Keep Discord API and command wiring in `src/discord/` and `src/commands/`.
- Service logic and AI pipeline changes belong in `src/services/` and `src/ai/`.

## Testing Guidelines
- Tests live in `test/` and follow `*.test.js` naming.
- Add or update tests for AI pipeline changes and any new command behavior.

## Configuration & Security Tips
- Keep tokens and keys in `config.json` or `.env`, never in source control.
- When changing AI provider settings, document the new keys in `config.example.json`.

## Commit & Pull Request Guidelines
- History uses conventional prefixes (`feat:`, `fix(scope):`) alongside informal messages. Prefer the conventional style for new work.
- PRs should include a concise summary, test results (`npm test`), and config changes when applicable.
- For behavior changes in AI responses, note expected tone/behavior impacts in the PR description.
