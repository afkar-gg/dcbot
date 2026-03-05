const SUPPORTED_LOCALES = new Set(['en', 'id', 'es', 'pt', 'fr', 'de', 'tr', 'ar', 'ru', 'ja', 'ko', 'zh']);

const KEYWORD_MAP = {
  id: ['aku', 'kamu', 'tolong', 'yang', 'nggak', 'enggak', 'gak', 'tidak', 'banget', 'dong', 'nih', 'itu', 'ini'],
  es: ['hola', 'gracias', 'por', 'favor', 'puedes', 'como', 'esto', 'archivo', 'adjunto', 'ayuda', 'porque'],
  pt: ['ola', 'obrigado', 'obrigada', 'por', 'favor', 'voce', 'como', 'isso', 'arquivo', 'anexo', 'ajuda'],
  fr: ['bonjour', 'merci', 'sil', 'vous', 'plait', 'fichier', 'piece', 'jointe', 'peux', 'comment', 'pourquoi'],
  de: ['hallo', 'danke', 'bitte', 'kannst', 'nicht', 'datei', 'anhang', 'wie', 'warum', 'hilfe'],
  tr: ['merhaba', 'tesekkur', 'lutfen', 'yardim', 'nasil', 'degil', 'dosya', 'ek', 'neden'],
};

const PHRASE_HINTS = {
  id: ['bahasa indonesia', 'pakai bahasa indonesia'],
  es: ['en espanol', 'habla espanol'],
  pt: ['em portugues', 'fala portugues'],
  fr: ['en francais', 'parle francais'],
  de: ['auf deutsch', 'sprich deutsch'],
  tr: ['turkce konus', 'turkce yaz'],
};

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

function tokenizeLatin(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function scoreKeywordHits(tokens, keywords) {
  if (!Array.isArray(tokens) || tokens.length === 0) return 0;
  const tokenSet = new Set(tokens);
  let score = 0;
  for (const word of keywords) {
    if (!word) continue;
    if (tokenSet.has(word)) score += 1;
  }
  return score;
}

function detectReplyLanguage({ messageText = '', repliedText = '' } = {}) {
  const sourceText = `${String(messageText || '').trim()}\n${String(repliedText || '').trim()}`.trim();
  if (!sourceText) return 'en';

  const scriptLocale = detectScriptLocale(sourceText);
  if (scriptLocale) return scriptLocale;

  const lower = sourceText.toLowerCase();
  const tokens = tokenizeLatin(lower);
  let bestLocale = 'en';
  let bestScore = 0;

  for (const [locale, phrases] of Object.entries(PHRASE_HINTS)) {
    if ((phrases || []).some((phrase) => phrase && lower.includes(phrase))) {
      return locale;
    }
  }

  for (const [locale, keywords] of Object.entries(KEYWORD_MAP)) {
    const score = scoreKeywordHits(tokens, keywords);
    if (score > bestScore) {
      bestScore = score;
      bestLocale = locale;
    }
  }

  if (bestScore >= 2) return bestLocale;
  if (bestScore >= 1 && tokens.length <= 4) return bestLocale;
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
};
