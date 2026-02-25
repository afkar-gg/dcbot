function stripOutputControlChars(text) {
  if (!text) return '';
  // Keep \n and \r for formatting, remove other control chars.
  return String(text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
}

function stripZeroWidth(text) {
  if (!text) return '';
  return String(text).replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
}

function stripModelThinking(text) {
  if (!text) return '';
  let out = String(text);

  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '');
  out = out.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');

  const finalMatch = out.match(
    /(?:^|\n)\s*(?:final\s*answer|final|answer|response)\s*:\s*([\s\S]+)$/i
  );
  if (finalMatch) out = finalMatch[1];

  out = out.replace(/^(?:thought|thinking|analysis|reasoning)\s*:\s*/i, '');
  return out.trim();
}

function stripLeakedPromptLines(text) {
  if (!text) return '';
  const lines = String(text).split(/\r?\n/);
  const filtered = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();

    if (lower === 'chat context') continue;
    if (lower === 'recent channel context') continue;
    if (lower.startsWith('server:')) continue;
    if (lower.startsWith('attachment:')) continue;
    if (lower.startsWith('trigger:')) continue;
    if (lower.startsWith('member facts:')) continue;
    if (lower.startsWith('visible channels:')) continue;
    if (lower.startsWith('conversation signal:')) continue;
    if (lower.startsWith('new message from')) continue;
    if (lower.startsWith('they replied to this message:')) continue;
    if (lower.startsWith('replied-to user:')) continue;
    if (lower.startsWith('owner:')) continue;
    if (lower.startsWith('system:') || lower.startsWith('assistant:') || lower.startsWith('analysis:')) continue;
    if (lower.startsWith('user ') && (lower.includes(' said:') || lower.includes(' replied:'))) continue;

    filtered.push(trimmed);
  }

  return filtered.join('\n').trim();
}

function looksLikePromptLeak(text) {
  const t = String(text || '');
  if (!t) return false;
  if (/chat context/i.test(t)) return true;
  if (/recent channel context/i.test(t)) return true;
  if (/(?:^|\s)server:\s*/i.test(t)) return true;
  if (/(?:^|\s)attachment:\s*(yes|no)/i.test(t)) return true;
  if (/(?:^|\s)trigger:\s*(direct|random)/i.test(t)) return true;
  if (/member facts:/i.test(t)) return true;
  if (/visible channels:/i.test(t)) return true;
  if (/conversation signal:/i.test(t)) return true;
  if (/new message from/i.test(t)) return true;
  if (/they replied to this message:/i.test(t)) return true;
  if (/replied-to user:/i.test(t)) return true;
  if (/owner:\s*/i.test(t)) return true;
  if (/(?:^|\s)(system|assistant|analysis)\s*:/i.test(t)) return true;
  return false;
}

function looksLikeReasoningLeak(text) {
  const raw = String(text || '');
  const lower = raw.toLowerCase();
  if (!lower) return false;

  if (lower.includes('chain of thought')) return true;
  if (/(?:^|\n)\s*(?:reasoning|analysis|thoughts?)\s*:\s*/i.test(raw)) return true;

  if (/\b(?:here'?s|here is)\s+what'?s\s+happening\b/.test(lower)) return true;
  if (/\b(?:i\s*(?:can\s*)?see)\s+(?:what'?s|whats)\s+(?:happening|going\s+on)\b/.test(lower)) return true;
  if (/\b(?:let\s+me|lemme)\s+(?:break\s+it\s+down|explain|walk\s+through)\b/.test(lower)) return true;

  const userMeta = /(the user|user is|user wants|user asked|user needs)/.test(lower);
  const selfTalk = /(i need|i should|i will|i must|i cannot|i cant|as an ai)/.test(lower);
  if (userMeta && selfTalk) return true;

  return false;
}

function looksLikeGibberish(text) {
  const s = String(text || '');
  if (!s) return false;

  // Length alone is not "gibberish" (output is truncated later).
  // Blocking long but valid answers causes false positives.
  if (/(.)\1{12,}/.test(s)) return true;
  if (/\d{20,}/.test(s)) return true;
  if (/(\b\w+\b)(?:\s+\1){4,}/i.test(s)) return true;
  if (/(\S{2,8})\1{3,}/.test(s)) return true;

  const tokens = s.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length >= 12) {
    const uniq = new Set(tokens);
    if (uniq.size / tokens.length < 0.35) return true;
  }

  return false;
}

function analyzeAiOutput(text) {
  const cleaned = stripOutputControlChars(stripZeroWidth(String(text || '')));
  const promptLeak = looksLikePromptLeak(cleaned);
  const reasoningLeak = looksLikeReasoningLeak(cleaned);
  const gibberish = looksLikeGibberish(cleaned);
  const stripped = stripLeakedPromptLines(cleaned);
  const emptyAfterStrip = !stripped;

  const reasons = [];
  if (promptLeak) reasons.push('prompt-leak');
  if (reasoningLeak) reasons.push('reasoning');
  if (gibberish) reasons.push('gibberish');
  if (emptyAfterStrip) reasons.push('empty');

  return {
    cleaned,
    stripped,
    flags: { promptLeak, reasoningLeak, gibberish, emptyAfterStrip },
    reasons,
  };
}

function sanitizeAiOutput(text, { maxLen = 800 } = {}) {
  if (!text) return { text: '', analysis: analyzeAiOutput('') };
  const analysis = analyzeAiOutput(text);
  let out = analysis.stripped;

  if (!out) return { text: '', analysis };

  const looksBad = analysis.flags.promptLeak || analysis.flags.reasoningLeak || analysis.flags.gibberish;

  if (looksBad || looksLikePromptLeak(out) || looksLikeReasoningLeak(out) || looksLikeGibberish(out)) {
    return { text: '', analysis };
  }

  if (out.length > maxLen) out = out.slice(0, maxLen).trim();
  return { text: out.trim(), analysis };
}

function isSpammyLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return true;
  const compact = trimmed.replace(/\s+/g, '');
  if (compact.length <= 2) return true;
  if (/^([a-z0-9])\1{3,}$/i.test(compact)) return true;
  return false;
}

function collapseRepetitiveLines(lines) {
  const cleaned = lines.map((line) => String(line || '').trim()).filter(Boolean);
  if (cleaned.length <= 1) return cleaned;

  const normalized = cleaned.map((line) =>
    line
      .toLowerCase()
      .replace(/^\s*(?:[-*\u2022]+|\d+[.)])\s*/, '')
      .replace(/[`*_~]/g, '')
      .replace(/[^a-z0-9\s:/.-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
  const unique = new Set();
  const deduped = [];

  for (let i = 0; i < cleaned.length; i += 1) {
    const key = normalized[i] || cleaned[i].toLowerCase();
    if (!key) continue;
    if (unique.has(key)) continue;
    unique.add(key);
    deduped.push(cleaned[i]);
  }

  const allSpammy = cleaned.every((line) => isSpammyLine(line));

  if (deduped.length <= 1 || allSpammy) {
    const first = deduped[0] || cleaned[0];
    return isSpammyLine(first) ? ['nah'] : [first];
  }

  return deduped;
}

module.exports = {
  stripOutputControlChars,
  stripZeroWidth,
  stripModelThinking,
  stripLeakedPromptLines,
  looksLikePromptLeak,
  looksLikeReasoningLeak,
  looksLikeGibberish,
  analyzeAiOutput,
  sanitizeAiOutput,
  collapseRepetitiveLines,
};
