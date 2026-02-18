const { createBot } = require('./src/bot');
const { createLoadstringStore, LOADSTRING_WEB_PORT } = require('./src/services/loadstringService');
const { createLoadstringWebServer } = require('./src/services/loadstringWebService');

// Keep the process alive on unexpected runtime errors.
// Discord bots should prefer logging + continuing over hard-crashing.
process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[process] Uncaught exception:', err);
});

async function bootstrap() {
  const loadstringStore = createLoadstringStore();
  const loadstringWebServer = createLoadstringWebServer({
    loadstringStore,
    port: LOADSTRING_WEB_PORT,
  });

  await loadstringWebServer.start();
  console.log(`Loadstring web server listening on 127.0.0.1:${LOADSTRING_WEB_PORT}`);

  const bot = createBot({ loadstringStore });

  // Console listener: paste a HuggingFace key (hf_...) into the process stdin to auto-add it.
  // Useful when API keys get rotated and you want a fast, no-Discord-command way to add keys.
  if (process.stdin.isTTY) {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      const text = String(chunk || '').trim();
      if (!text) return;

      const matches = [...text.matchAll(/\bhf_[a-zA-Z0-9]{10,}\b/g)].map((m) => m[0]);
      if (matches.length === 0) return;

      for (const key of matches) {
        const res = bot.addHfApiKey(key);
        if (res.ok) {
          const verb = res.added ? 'added' : 'already saved';
          console.log(`[hf key] ${verb}: ${res.masked} (total ${res.total})`);
        } else {
          console.log(`[hf key] rejected: ${res.error || 'invalid'}`);
        }
      }
    });

    // Ensure stdin is flowing.
    process.stdin.resume();
  }

  await bot.start();
}

bootstrap().catch((err) => {
  console.error('Bot failed to start:', err);
  process.exitCode = 1;
});
