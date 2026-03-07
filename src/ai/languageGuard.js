/**
 * Language detection based on script (character set) only.
 * Relies on the AI model to naturally detect and respond in the user's language.
 * Only intervenes for obvious script mismatches (e.g., AI responds in English
 * when user wrote in Arabic, Russian, Japanese, Korean, or Chinese).
 */

const NON_LATIN_SCRIPT_LOCALES = ['ar', 'ru', 'ja', 'ko', 'zh'];

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
  const locale = String(expectedLocale || 'en').trim().toLowerCase().split(/[-_]/)[0];

  const output = String(outputText || '').trim();
  if (!output) return false;

  // Only retry for non-Latin script languages
  if (!NON_LATIN_SCRIPT_LOCALES.includes(locale)) {
    return false;
  }

  // Check if user wrote in a non-Latin script
  const userScript = detectScriptLocale(userText);
  if (userScript !== locale) {
    return false;
  }

  // Check if AI responded in English (Latin script with English patterns)
  const outputScript = detectScriptLocale(output);
  if (outputScript) {
    // AI responded in a non-Latin script - good, no retry needed
    return false;
  }

  // AI responded in Latin script - check if it's English
  return isLikelyEnglishText(output);
}

module.exports = {
  isLikelyEnglishText,
  shouldRetryForLocaleMismatch,
  detectScriptLocale,
};
