/**
 * Web search utilities — DuckDuckGo search, URL extraction, page fetching.
 */

const {
  WEB_SEARCH_MAX_RESULTS,
  WEB_SEARCH_MAX_PAGES,
  WEB_SEARCH_MAX_PAGE_CHARS,
  WEB_URL_MAX_FETCHES,
} = require('../services/runtimeConfig');

const MAX_WEB_RESULTS = WEB_SEARCH_MAX_RESULTS;
const MAX_WEB_PAGES = WEB_SEARCH_MAX_PAGES;
const MAX_WEB_PAGE_CHARS = WEB_SEARCH_MAX_PAGE_CHARS;
const MAX_URL_FETCHES = WEB_URL_MAX_FETCHES;

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtmlTags(html) {
  if (!html) return '';
  let out = String(html);
  out = out.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  out = out.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  out = out.replace(/<\/(p|div|br|li|h[1-6])>/gi, '\n');
  out = out.replace(/<[^>]+>/g, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  return decodeHtmlEntities(out);
}

function extractWebSearchQuery(text) {
  const t = String(text || '');
  const match = t.match(/\b(?:search|web|lookup)\s*:\s*(.+)$/i);
  if (!match) return '';
  return match[1].trim();
}

function extractUrls(text) {
  const t = String(text || '');
  const urls = [];
  const re = /\bhttps?:\/\/[^\s<>()]+/gi;
  let match;
  while ((match = re.exec(t)) && urls.length < MAX_URL_FETCHES) {
    const raw = match[0].replace(/[)\].,!?]+$/g, '');
    if (!urls.includes(raw)) urls.push(raw);
  }
  return urls;
}

function resolveDuckDuckGoUrl(href) {
  if (!href) return '';
  try {
    const url = new URL(href, 'https://duckduckgo.com');
    if (url.hostname.includes('duckduckgo.com') && url.pathname === '/l/') {
      const uddg = url.searchParams.get('uddg');
      if (uddg) return decodeURIComponent(uddg);
    }
    return href;
  } catch {
    return href;
  }
}

async function fetchWebPageText(url) {
  if (!url) return '';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  const isText =
    contentType.includes('text/html') ||
    contentType.includes('text/plain') ||
    contentType.includes('application/json') ||
    contentType.includes('application/xml') ||
    contentType.includes('text/xml');
  if (!isText) return '';
  const html = await res.text();
  const text = stripHtmlTags(html);
  return text.slice(0, MAX_WEB_PAGE_CHARS);
}

async function performWebSearch(query) {
  if (!query) return [];
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
  const html = await res.text();

  const results = [];
  const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i;

  let match;
  while ((match = linkRe.exec(html)) && results.length < MAX_WEB_RESULTS) {
    const href = resolveDuckDuckGoUrl(match[1]);
    const title = decodeHtmlEntities(stripHtmlTags(match[2]));
    const snippetMatch = html.slice(match.index).match(snippetRe);
    const snippet = snippetMatch ? decodeHtmlEntities(stripHtmlTags(snippetMatch[1] || snippetMatch[2])) : '';
    if (href) results.push({ title, url: href, snippet });
  }

  const pages = [];
  for (const r of results.slice(0, MAX_WEB_PAGES)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const content = await fetchWebPageText(r.url);
      pages.push({ ...r, content });
    } catch {
      pages.push({ ...r, content: '' });
    }
  }

  return pages;
}

module.exports = {
  decodeHtmlEntities,
  stripHtmlTags,
  extractWebSearchQuery,
  extractUrls,
  resolveDuckDuckGoUrl,
  fetchWebPageText,
  performWebSearch,
};
