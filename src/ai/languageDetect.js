const NON_LATIN_SCRIPT_LOCALES = ['ar', 'ru', 'ja', 'ko', 'zh'];

function detectScriptLocale(text) {
  const raw = String(text || '');
  if (!raw) return '';
  if (/[\u0600-\u06FF]/.test(raw)) return 'ar'; // Arabic
  if (/[\u0400-\u04FF]/.test(raw)) return 'ru'; // Cyrillic (Russian)
  if (/[\u3040-\u30FF]/.test(raw)) return 'ja'; // Japanese (Hiragana/Katakana)
  if (/[\uAC00-\uD7AF]/.test(raw)) return 'ko'; // Korean (Hangul)
  if (/[\u4E00-\u9FFF]/.test(raw)) return 'zh'; // Chinese (Han)
  return '';
}

const LATIN_LOCALE_RULES = [
  {
    locale: 'id',
    stopwords: new Set([
      'yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'aku', 'kamu', 'dia', 'mereka',
      'saya', 'kami', 'kita', 'ini', 'itu', 'gak', 'ga', 'nggak', 'tidak',
      'udah', 'sudah', 'bisa', 'tolong', 'mohon', 'lagi', 'banget', 'aja', 'dong',
      'nih', 'kok', 'gue', 'lu', 'nya', 'dengan', 'atau',
    ]),
    diacritics: null,
  },
  {
    locale: 'es',
    stopwords: new Set([
      'que', 'de', 'no', 'a', 'la', 'el', 'y', 'en', 'los', 'las', 'por',
      'para', 'con', 'una', 'como', 'pero', 'porque', 'hola', 'gracias', 'favor',
      'porfavor', 'porfa', 'si',
    ]),
    diacritics: /[áéíóúñü]/gi,
  },
  {
    locale: 'pt',
    stopwords: new Set([
      'que', 'de', 'nao', 'não', 'a', 'o', 'os', 'as', 'e', 'em', 'para', 'por',
      'com', 'uma', 'como', 'mas', 'porque', 'ola', 'olá', 'obrigado', 'obrigada',
      'porfavor', 'por favor', 'sim',
    ]),
    diacritics: /[áéíóúâêôãõç]/gi,
  },
  {
    locale: 'fr',
    stopwords: new Set([
      'le', 'la', 'les', 'de', 'des', 'et', 'en', 'un', 'une', 'pour', 'avec',
      'pas', 'que', 'bonjour', 'merci', 'je', 'tu', 'vous', 'nous', 'mais',
      's il', 'est', 'sur',
    ]),
    diacritics: /[àâçéèêëîïôûùüÿœ]/gi,
  },
  {
    locale: 'de',
    stopwords: new Set([
      'der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'zu', 'mit',
      'auf', 'für', 'danke', 'bitte', 'ich', 'du', 'sie', 'wir', 'ihr', 'aber',
      'wie', 'was', 'wo',
    ]),
    diacritics: /[äöüß]/gi,
  },
  {
    locale: 'tr',
    stopwords: new Set([
      've', 'bir', 'bu', 'icin', 'için', 'degil', 'değil', 'ben', 'sen', 'o',
      'biz', 'siz', 'ama', 'neden', 'merhaba', 'tesekkur', 'teşekkür', 'lutfen',
      'lütfen', 'mi', 'mı', 'mu', 'mü',
    ]),
    diacritics: /[çğıİöşü]/gi,
  },
];

function tokenizeLatinText(text) {
  const raw = String(text || '').toLowerCase();
  if (!raw) return [];
  try {
    return raw.replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter(Boolean);
  } catch {
    return raw.replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean);
  }
}

function countStopwords(tokens, stopwords) {
  let count = 0;
  for (const token of tokens) {
    if (stopwords.has(token)) count += 1;
  }
  return count;
}

function detectLatinLocale(text) {
  const tokens = tokenizeLatinText(text);
  if (tokens.length === 0) return '';

  let best = {
    locale: '',
    score: 0,
    hits: 0,
    diacritics: 0,
  };

  for (const rule of LATIN_LOCALE_RULES) {
    const hits = countStopwords(tokens, rule.stopwords);
    let score = hits / Math.max(4, tokens.length);

    let diacritics = 0;
    if (rule.diacritics) {
      const matches = String(text || '').match(rule.diacritics) || [];
      diacritics = matches.length;
      if (diacritics > 0) {
        score += 0.25 + Math.min(0.15, diacritics * 0.05);
      }
    }

    if (score > best.score) {
      best = { locale: rule.locale, score, hits, diacritics };
    }
  }

  if (!best.locale) return '';
  const smallSample = tokens.length <= 4;
  const strongHit = best.hits >= 2 || (best.hits >= 1 && smallSample) || best.diacritics > 0;
  if (!strongHit || best.score < 0.2) return '';
  return best.locale;
}

function isLikelyEnglishText(text) {
  const lower = String(text || '').toLowerCase().trim();
  if (!lower) return false;

  const scriptLocale = detectScriptLocale(lower);
  if (scriptLocale) return false;

  const englishStopwords = new Set([
    'the', 'and', 'is', 'are', 'you', 'your', 'for', 'that', 'this', 'with',
    'what', 'when', 'where', 'why', 'how', 'please', 'i', 'me', 'my', 'we',
    'can', 'help', 'thanks', 'thank', 'hi', 'hello',
  ]);

  const tokens = tokenizeLatinText(lower);
  if (tokens.length === 0) return false;

  let hitCount = 0;
  for (const token of tokens) {
    if (englishStopwords.has(token)) hitCount += 1;
  }

  return hitCount >= 2 || hitCount / Math.max(1, tokens.length) >= 0.25;
}

function detectLanguageFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const scriptLocale = detectScriptLocale(raw);
  if (scriptLocale) return scriptLocale;

  const latinLocale = detectLatinLocale(raw);
  if (latinLocale) return latinLocale;

  if (isLikelyEnglishText(raw)) return 'en';
  return '';
}

module.exports = {
  NON_LATIN_SCRIPT_LOCALES,
  detectScriptLocale,
  detectLanguageFromText,
  isLikelyEnglishText,
};
