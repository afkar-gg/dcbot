/**
 * Language detection for reply context.
 * Uses script + latin heuristics; falls back to English when uncertain.
 */

const SUPPORTED_LOCALES = new Set(['en', 'id', 'es', 'pt', 'fr', 'de', 'tr', 'ar', 'ru', 'ja', 'ko', 'zh']);

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
      's', 'il', 'est', 'sur',
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

const NOTICE_BY_KIND = {
  attachments_disabled: {
    en: 'i cant check attachments rn, describe it in text',
    id: 'aku belum bisa cek lampiran sekarang, coba jelasin lewat teks',
    es: 'ahora no puedo revisar adjuntos, describelo en texto',
    pt: 'nao consigo verificar anexos agora, descreve em texto',
    fr: 'je peux pas verifier les pieces jointes la, decris en texte',
    de: 'ich kann anhaenge gerade nicht pruefen, beschreib es im text',
    tr: 'su an eklere bakamiyorum, metin olarak acikla',
    ar: 'ما اقدر افحص المرفقات حاليا، اشرحها نصيا',
    ru: 'я не могу проверить вложения сейчас, опиши текстом',
    ja: '今は添付を確認できないから、文章で説明して',
    ko: '지금 첨부파일을 확인할 수 없어서 텍스트로 설명해줘',
    zh: '我现在无法查看附件，先用文字描述一下',
  },
  media_unsupported: {
    en: 'i can read images, text files, stickers, and emoji, but this media type is unsupported rn',
    id: 'aku bisa baca gambar, file teks, stiker, dan emoji, tapi jenis media ini belum didukung',
    es: 'puedo leer imagenes, archivos de texto, stickers y emoji, pero este tipo de archivo aun no es compatible',
    pt: 'eu leio imagens, arquivos de texto, stickers e emoji, mas esse tipo de midia ainda nao e suportado',
    fr: 'je peux lire images, fichiers texte, stickers et emoji, mais ce type de media nest pas encore pris en charge',
    de: 'ich kann bilder, textdateien, sticker und emoji lesen, aber dieser medientyp wird noch nicht unterstuetzt',
    tr: 'gorsel, metin dosyasi, sticker ve emoji okuyabiliyorum ama bu medya turu henuz desteklenmiyor',
    ar: 'اقدر اقرأ الصور وملفات النص والستيكرات والايموجي، لكن هذا النوع من الوسائط غير مدعوم حاليا',
    ru: 'я могу читать изображения, текстовые файлы, стикеры и эмодзи, но этот тип медиа пока не поддерживается',
    ja: '画像・テキストファイル・スタンプ・絵文字は読めるけど、このメディア形式はまだ未対応',
    ko: '이미지, 텍스트 파일, 스티커, 이모지는 읽을 수 있지만 이 미디어 형식은 아직 지원되지 않아',
    zh: '我可以读取图片、文本文件、贴纸和表情，但这种媒体类型暂不支持',
  },
};

function normalizeLocale(locale) {
  const raw = String(locale || 'en').trim().toLowerCase();
  if (!raw) return 'en';
  const base = raw.split(/[-_]/)[0];
  if (SUPPORTED_LOCALES.has(base)) return base;
  return 'en';
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

const INDONESIAN_SLANG_REGEX = /\b(?:wkwk\w*|awok\w*|aowk\w*|woilah|jirla|jir|bg|bang|omj)\b/i;

function detectIndonesianSignal(text) {
  const raw = String(text || '');
  if (!raw) return false;
  const tokens = tokenizeLatinText(raw);
  const idRule = LATIN_LOCALE_RULES.find((rule) => rule.locale === 'id');
  const hitCount = idRule ? countStopwords(tokens, idRule.stopwords) : 0;
  if (hitCount >= 2) return true;
  return INDONESIAN_SLANG_REGEX.test(raw);
}

function detectLocaleFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const scriptLocale = detectScriptLocale(raw);
  if (scriptLocale) return scriptLocale;

  const latinLocale = detectLatinLocale(raw);
  if (latinLocale) return latinLocale;

  return '';
}

/**
 * Detect reply language based on script + Latin heuristics.
 * Returns 'en' when uncertain.
 */
function detectReplyLanguage({ messageText = '', repliedText = '', allowReplyFallback = true } = {}) {
  const messageRaw = String(messageText || '').trim();
  const replyRaw = String(repliedText || '').trim();

  const primary = messageRaw;
  const fallback = allowReplyFallback && !messageRaw ? replyRaw : '';

  const locale = detectLocaleFromText(primary || fallback);
  if (locale && SUPPORTED_LOCALES.has(locale)) return locale;

  if (primary && detectIndonesianSignal(primary)) return 'id';
  if (fallback && detectIndonesianSignal(fallback)) return 'id';

  return 'en';
}

function getLocalizedAttachmentNotice(kind, locale = 'en') {
  const normalizedLocale = normalizeLocale(locale);
  const group = NOTICE_BY_KIND[kind] || NOTICE_BY_KIND.media_unsupported;
  return group[normalizedLocale] || group.en || NOTICE_BY_KIND.media_unsupported.en;
}

module.exports = {
  detectReplyLanguage,
  getLocalizedAttachmentNotice,
  normalizeLocale,
  detectScriptLocale,
};
