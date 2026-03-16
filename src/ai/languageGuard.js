/**
 * Language mismatch guard.
 * Retries when user language is non-English but AI responds in English.
 */

const { detectScriptLocale, isLikelyEnglishText } = require('./languageDetect');

/**
 * Check if we should retry due to language mismatch.
 * Only retry for non-Latin script languages when AI outputs English.
 * For Latin-script languages (Indonesian, Spanish, etc.), trust the AI's judgment.
 */
function shouldRetryForLocaleMismatch({ expectedLocale = 'en', userText = '', outputText = '' } = {}) {
  const locale = String(expectedLocale || 'en').trim().toLowerCase().split(/[-_]/)[0];

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
