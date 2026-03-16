/**
 * Language detection for reply context.
 * Uses script + latin heuristics; falls back to English.
 */

const { detectLanguageFromText, detectScriptLocale } = require('./languageDetect');

const SUPPORTED_LOCALES = new Set(['en', 'id', 'es', 'pt', 'fr', 'de', 'tr', 'ar', 'ru', 'ja', 'ko', 'zh']);

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

/**
 * Detect reply language based on script + Latin heuristics.
 * Falls back to English when uncertain.
 */
function detectReplyLanguage({ messageText = '', repliedText = '' } = {}) {
  const sourceText = `${String(messageText || '').trim()}\n${String(repliedText || '').trim()}`.trim();
  if (!sourceText) return 'en';
  const locale = detectLanguageFromText(sourceText);
  if (locale && SUPPORTED_LOCALES.has(locale)) return locale;
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
