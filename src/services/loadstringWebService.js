const http = require('node:http');

const {
  LOADSTRING_WEB_PORT,
  createLoadstringStore,
} = require('./loadstringService');

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildPage({ title, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --bg: #f7f3ec;
        --ink: #2d2a26;
        --muted: #6f6559;
        --card: #fffdfa;
        --line: #dfd2bf;
        --brand: #c45a2d;
      }
      body {
        margin: 0;
        font-family: "Trebuchet MS", "Segoe UI", sans-serif;
        color: var(--ink);
        background: radial-gradient(circle at top right, #f2e3cc, var(--bg));
        min-height: 100vh;
      }
      .wrap {
        max-width: 900px;
        margin: 40px auto;
        padding: 0 16px;
      }
      .card {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 22px;
        box-shadow: 0 12px 30px rgba(63, 34, 17, 0.08);
      }
      h1 {
        margin-top: 0;
        color: var(--brand);
      }
      p, li {
        line-height: 1.6;
      }
      .muted {
        color: var(--muted);
      }
      a {
        color: var(--brand);
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="card">
        ${body}
      </section>
    </main>
  </body>
</html>`;
}

function sanitizeHistoryHash(raw) {
  const token = String(raw || '').trim().toLowerCase();
  if (!/^[a-z0-9]{6,80}$/.test(token)) return '';
  return token;
}

function parseHistoryHash(url) {
  const search = String(url.search || '').trim();
  if (!search || search === '?') return '';

  const fromNamedParam = [
    url.searchParams.get('h'),
    url.searchParams.get('hash'),
    url.searchParams.get('v'),
  ].find((value) => value != null && String(value).trim() !== '');

  if (fromNamedParam != null) {
    return sanitizeHistoryHash(fromNamedParam);
  }

  const raw = search.slice(1);
  if (!raw || raw.includes('&') || raw.includes('=')) return '';

  try {
    return sanitizeHistoryHash(decodeURIComponent(raw));
  } catch {
    return sanitizeHistoryHash(raw);
  }
}

function createLoadstringWebServer({ loadstringStore, port = LOADSTRING_WEB_PORT } = {}) {
  const store = loadstringStore || createLoadstringStore();
  let server = null;

  function send(res, code, body, contentType) {
    res.writeHead(code, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    });
    res.end(body);
  }

  function handleRequest(req, res) {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname || '/';

    if (pathname === '/health') {
      send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
      return;
    }

    if (pathname === '/') {
      const html = buildPage({
        title: 'sc.afkar.lol',
        body: [
          '<h1>Script Host</h1>',
          '<p class="muted">Public raw script hosting for authorized bot users.</p>',
          '<p>Policies: <a href="/tos">Terms of Service</a> | <a href="/privacy">Privacy Policy</a></p>',
        ].join(''),
      });
      send(res, 200, html, 'text/html; charset=utf-8');
      return;
    }

    if (pathname === '/tos') {
      const html = buildPage({
        title: 'Terms of Service',
        body: [
          '<h1>Terms of Service</h1>',
          '<p class="muted">Last updated: February 12, 2026</p>',
          '<p>By using this bot and script hosting service, you agree not to upload unlawful, malicious, or abusive content.</p>',
          '<p>You are responsible for your uploaded scripts and any sharing of your links.</p>',
          '<p>The service may remove content or revoke access at any time to protect users and infrastructure.</p>',
        ].join(''),
      });
      send(res, 200, html, 'text/html; charset=utf-8');
      return;
    }

    if (pathname === '/privacy') {
      const html = buildPage({
        title: 'Privacy Policy',
        body: [
          '<h1>Privacy Policy</h1>',
          '<p class="muted">Last updated: February 12, 2026</p>',
          '<p>The bot stores Discord user ID, username slug, script name, timestamps, and script contents required to provide hosted links.</p>',
          '<p>Data is used only for command functionality, listing scripts, and serving public raw files from generated URLs.</p>',
          '<p>Uploaded script links are public by design. Do not upload secrets.</p>',
          '<p>To request data removal, contact the bot owner.</p>',
        ].join(''),
      });
      send(res, 200, html, 'text/html; charset=utf-8');
      return;
    }

    const parts = pathname.split('/').filter(Boolean);
    if (parts.length !== 2) {
      send(res, 404, 'not found', 'text/plain; charset=utf-8');
      return;
    }

    let username;
    let script;
    try {
      username = decodeURIComponent(parts[0]);
      script = decodeURIComponent(parts[1]);
    } catch {
      send(res, 400, 'bad route encoding', 'text/plain; charset=utf-8');
      return;
    }

    const historyHash = parseHistoryHash(url);
    if (historyHash) {
      const historyVersion = store.resolveLoadstringHistoryByRoute({
        usernameSegment: username,
        scriptSegment: script,
        hash: historyHash,
      });

      if (!historyVersion) {
        send(res, 404, 'script not found', 'text/plain; charset=utf-8');
        return;
      }

      send(res, 200, historyVersion.content, 'text/plain; charset=utf-8');
      return;
    }

    const found = store.getLoadstringByRoute(username, script);
    if (!found) {
      send(res, 404, 'script not found', 'text/plain; charset=utf-8');
      return;
    }

    send(res, 200, found.content, 'text/plain; charset=utf-8');
  }

  async function start() {
    if (server) return server;

    server = http.createServer(handleRequest);

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    return server;
  }

  async function stop() {
    if (!server) return;
    const current = server;
    server = null;

    await new Promise((resolve) => {
      current.close(() => resolve());
    });
  }

  return { start, stop };
}

module.exports = {
  createLoadstringWebServer,
};
