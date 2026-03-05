const LOCALE_KEYWORDS = {
  id: ['aku', 'kamu', 'tolong', 'yang', 'nggak', 'enggak', 'tidak', 'gak', 'bisa'],
  es: ['hola', 'gracias', 'por', 'favor', 'puedes', 'esto', 'como', 'porque'],
  pt: ['ola', 'por', 'favor', 'voce', 'isso', 'obrigado', 'obrigada', 'porque'],
  fr: ['bonjour', 'merci', 'peux', 'fichier', 'comment', 'pourquoi'],
  de: ['hallo', 'bitte', 'danke', 'kannst', 'nicht', 'warum'],
  tr: ['merhaba', 'lutfen', 'yardim', 'nasil', 'degil', 'neden'],
};

const ENGLISH_STOPWORDS = new Set([
  'the', 'and', 'is', 'are', 'you', 'your', 'for', 'that', 'this', 'with', 'can', 'cant', 'cannot', 'not',
  'what', 'when', 'where', 'why', 'how', 'please', 'i', 'me', 'my', 'we', 'our', 'it', 'to', 'in', 'on',
]);

function normalizeLocale(locale) {
  const raw = String(locale || 'en').trim().toLowerCase();
  const base = raw.split(/[-_]/)[0];
  if (!base) return 'en';
  return base;
}

function detectScriptLocale(text) {
  const raw = String(text || '');
  if (!raw) return '';
  if (/[\u0600-\u06FF]/.test(raw)) return 'ar';
  if (/[\u0400-\u04FF]/.test(raw)) return 'ru';
  if (/[\u3040-\u30FF]/.test(raw)) return 'ja';
  if (/[\uAC00-\uD7AF]/.test(raw)) return 'ko';
  if (/[\u4E00-\u9FFF]/.test(raw)) return 'zh';
  return '';
}

function hasLocaleKeyword(text, locale) {
  const keywords = LOCALE_KEYWORDS[locale] || [];
  if (keywords.length === 0) return false;
  const tokenSet = new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
  return keywords.some((keyword) => tokenSet.has(keyword));
}

function isLikelyEnglishText(text) {
  const lower = String(text || '').toLowerCase().trim();
  if (!lower) return false;

  const scriptLocale = detectScriptLocale(lower);
  if (scriptLocale) return false;

  const tokens = lower
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return false;

  let hitCount = 0;
  for (const token of tokens) {
    if (ENGLISH_STOPWORDS.has(token)) hitCount += 1;
  }

  return hitCount >= 2 || hitCount / Math.max(1, tokens.length) >= 0.25;
}

function shouldRetryForLocaleMismatch({ expectedLocale = 'en', userText = '', outputText = '' } = {}) {
  const locale = normalizeLocale(expectedLocale);
  if (!locale || locale === 'en') return false;

  const output = String(outputText || '').trim();
  if (!output) return false;

  const outputScript = detectScriptLocale(output);
  if (['ar', 'ru', 'ja', 'ko', 'zh'].includes(locale)) {
    if (outputScript === locale) return false;
    return isLikelyEnglishText(output);
  }

  if (!isLikelyEnglishText(output)) return false;

  // For Latin-script locales, only retry if user clearly wrote in that locale.
  return hasLocaleKeyword(userText, locale);
}

module.exports = {
  isLikelyEnglishText,
  shouldRetryForLocaleMismatch,
};
