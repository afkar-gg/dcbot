/**
 * Language mismatch guard.
 * Retries when user language is non-English but AI responds in English.
 */

function detectScriptLocale(text) {
  const raw = String(text || '');
  if (!raw) return '';
  if (/[\u0600-\u06FF]/.test(raw)) return 'ar';  // Arabic
  if (/[\u0400-\u04FF]/.test(raw)) return 'ru';  // Cyrillic (Russian)
  if (/[\u3040-\u30FF]/.test(raw)) return 'ja';  // Japanese (Hiragana/Katakana)
  if (/[\uAC00-\uD7AF]/.test(raw)) return 'ko';  // Korean (Hangul)
  if (/[\u4E00-\u9FFF]/.test(raw)) return 'zh';  // Chinese (Han)
  return '';
}

function isLikelyEnglishText(text) {
  const lower = String(text || '').toLowerCase().trim();
  if (!lower) return false;

  const scriptLocale = detectScriptLocale(lower);
  if (scriptLocale) return false;

  // Simple heuristic: check for common English stopwords
  const englishStopwords = new Set([
    'the', 'and', 'is', 'are', 'you', 'your', 'for', 'that', 'this', 'with',
    'what', 'when', 'where', 'why', 'how', 'please', 'i', 'me', 'my', 'we',
    'can', 'help', 'thanks', 'thank', 'hi', 'hello',
  ]);

  const tokens = lower
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return false;

  let hitCount = 0;
  for (const token of tokens) {
    if (englishStopwords.has(token)) hitCount += 1;
  }

  return hitCount >= 2 || hitCount / Math.max(1, tokens.length) >= 0.25;
}

/**
 * Check if we should retry due to language mismatch.
 * Only retry for non-Latin script languages when AI outputs English.
 * For Latin-script languages (Indonesian, Spanish, etc.), trust the AI's judgment.
 */
function shouldRetryForLocaleMismatch({ expectedLocale = 'en', userText = '', outputText = '' } = {}) {
  const localeRaw = String(expectedLocale || '').trim().toLowerCase();
  if (!localeRaw || localeRaw === 'auto' || localeRaw === 'unknown') return false;
  const locale = localeRaw.split(/[-_]/)[0];

  const output = String(outputText || '').trim();
  if (!output) return false;

  if (locale === 'en') return false;

  // If AI responded in a non-Latin script, assume it matched the user language.
  const outputScript = detectScriptLocale(output);
  if (outputScript) return false;

  // AI responded in Latin script - check if it's English
  return isLikelyEnglishText(output);
}

module.exports = {
  isLikelyEnglishText,
  shouldRetryForLocaleMismatch,
  detectScriptLocale,
};
