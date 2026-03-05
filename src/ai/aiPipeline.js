const aiPromptConfig = require('./prompts/aiSystemPrompt.json');
const rawPromptConfig = require('./prompts/rawSystemPrompt.json');

function interpolateTemplate(text, values = {}) {
  return String(text || '').replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const replacement = values[key];
    return replacement === undefined || replacement === null ? '' : String(replacement);
  });
}

function applyTemplateList(items, values) {
  if (!Array.isArray(items)) return [];
  return items.map((line) => interpolateTemplate(line, values)).filter(Boolean);
}

function buildAiSystemPrompt({
  botName,
  botDisplayName,
  botUsernameTag,
  currentDateTime,
  allowAttachments = false,
  editIntent = false,
  hasWebResults = false,
  hasExecutorTracker = false,
}) {
  const name = botName || 'Goose';
  const displayName = botDisplayName || name;
  const usernameTag = botUsernameTag || 'Goose#9289';
  const templateValues = {
    botName: name,
    botDisplayName: displayName,
    botUsernameTag: usernameTag,
  };

  const identityRules = applyTemplateList(aiPromptConfig.identityRules, templateValues);
  const styleRules = applyTemplateList(aiPromptConfig.styleRules, templateValues);
  const safetyAndOutputRules = applyTemplateList(aiPromptConfig.safetyAndOutputRules, templateValues);
  const factAndContextRules = applyTemplateList(aiPromptConfig.factAndContextRules, templateValues);
  const attachmentRules = allowAttachments
    ? applyTemplateList(aiPromptConfig.attachmentRulesWithAttachments, templateValues)
    : applyTemplateList(aiPromptConfig.attachmentRulesNoAttachments, templateValues);

  const runtimeRules = [];
  if (currentDateTime?.localText && currentDateTime?.isoUtc) {
    runtimeRules.push(
      `current datetime in ${currentDateTime.timeZone} is ${currentDateTime.localText}`,
      `current utc datetime is ${currentDateTime.isoUtc}`,
      'if user asks for current date/time, use this runtime context exactly'
    );
  }

  const modeRules = [];
  if (editIntent) {
    modeRules.push(
      'the user wants you to edit the attached file',
      'reply with ONLY the full updated file in one code block and no extra text'
    );
  } else if (allowAttachments) {
    modeRules.push('if user asks for explanation, avoid code blocks unless they ask for code');
  }
  if (hasWebResults) {
    modeRules.push('if Web pages/search results are provided, you may use them to answer');
  }
  if (hasExecutorTracker) {
    modeRules.push('Executor tracker block is provided and should be treated as authoritative for live executor status');
  }

  return [
    'Identity Rules:',
    ...identityRules.map((line) => `- ${line}`),
    '',
    'Style Rules:',
    ...styleRules.map((line) => `- ${line}`),
    '',
    'Safety And Output Rules:',
    ...safetyAndOutputRules.map((line) => `- ${line}`),
    '',
    'Fact And Context Rules:',
    ...factAndContextRules.map((line) => `- ${line}`),
    '',
    'Attachment Rules:',
    ...attachmentRules.map((line) => `- ${line}`),
    ...(runtimeRules.length > 0
      ? ['', 'Runtime Rules:', ...runtimeRules.map((line) => `- ${line}`)]
      : []),
    ...(modeRules.length > 0
      ? ['', 'Mode Rules:', ...modeRules.map((line) => `- ${line}`)]
      : []),
  ].join('\n');
}

function buildRawAiSystemPrompt({
  currentDateTime,
  allowAttachments = false,
  editIntent = false,
  hasWebResults = false,
  hasExecutorTracker = false,
}) {
  const base = [...applyTemplateList(rawPromptConfig.baseRules, {})];

  if (currentDateTime?.localText && currentDateTime?.isoUtc) {
    base.push(
      `current datetime in ${currentDateTime.timeZone} is ${currentDateTime.localText}`,
      `current utc datetime is ${currentDateTime.isoUtc}`,
      'if user asks date or time use this runtime context'
    );
  }

  if (allowAttachments) {
    base.push(...applyTemplateList(rawPromptConfig.attachmentRulesWithAttachments, {}));
  } else {
    base.push(...applyTemplateList(rawPromptConfig.attachmentRulesNoAttachments, {}));
  }

  if (editIntent) {
    base.push(
      'the user wants a file edit',
      'reply with only the full updated file in a single code block'
    );
  }

  if (hasWebResults) {
    base.push('if web pages or search results are provided use them as primary context');
  }
  if (hasExecutorTracker) {
    base.push('if executor tracker block is present use it as authoritative');
  }

  return base.join(' ');
}

function buildStrictSystemPrompt(basePrompt, reasons = []) {
  const reasonText = Array.isArray(reasons) && reasons.length > 0
    ? reasons.join(', ')
    : 'policy reasons';

  return [
    String(basePrompt || ''),
    'STRICT MODE: reply with only the final message. 1-2 sentences max. no reasoning no analysis no meta.',
    `The previous draft was blocked by the output sanitizer (${reasonText}).`,
    'Regenerate a safe final user-facing answer without metadata headers or hidden reasoning.',
  ].join(' ');
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeMessageText(messageText = '') {
  return String(messageText || '').replace(/\s+/g, ' ').trim();
}

function computeMessageComplexityScore(messageText = '') {
  const normalized = normalizeMessageText(messageText);
  if (!normalized) return 0.4;

  const chars = normalized.length;
  const tokens = normalized.split(' ').filter(Boolean).length;
  const questions = (normalized.match(/\?/g) || []).length;
  const lineBreaks = (String(messageText || '').match(/\n/g) || []).length;
  const stepMarkers = (normalized.match(/\b(and|then|also|next|finally|compare|pros\s*and\s*cons|pros\/cons|step[-\s]*by[-\s]*step)\b/gi) || []).length;
  const numberedSteps = (String(messageText || '').match(/(^|\n)\s*(?:\d+[\).:-]|[-*])\s+/g) || []).length;
  const technicalSignals = (normalized.match(/(```|`|\{|\}|\[|\]|\(|\)|=>|stack|trace|error|debug|refactor|optimi[sz]e|patch|rewrite)/gi) || []).length;

  const lengthScore =
    chars <= 20 ? 0
      : chars <= 80 ? 0.25
        : chars <= 180 ? 0.55
          : chars <= 320 ? 0.8
            : 1;
  const tokenScore =
    tokens <= 4 ? 0
      : tokens <= 12 ? 0.25
        : tokens <= 28 ? 0.55
          : tokens <= 55 ? 0.8
            : 1;
  const questionScore = clampNumber(questions / 3, 0, 1);
  const structureScore = clampNumber((stepMarkers + numberedSteps) / 4, 0, 1);
  const technicalScore = clampNumber(technicalSignals / 4, 0, 1);
  const multilineScore = lineBreaks > 0 ? clampNumber(lineBreaks / 4, 0, 1) : 0;

  const weighted = (
    (0.3 * lengthScore) +
    (0.2 * tokenScore) +
    (0.15 * questionScore) +
    (0.2 * structureScore) +
    (0.1 * technicalScore) +
    (0.05 * multilineScore)
  );
  return clampNumber(weighted, 0, 1);
}

function computeDynamicTemperature({ messageText, isRandomTrigger, editIntent, hasAttachments }) {
  const t = normalizeMessageText(messageText).toLowerCase();

  if (editIntent) return 0.35;
  if (/(story|poem|joke|roast|rap|creative|meme)/.test(t)) return 0.95;
  if (isRandomTrigger) return 1.0;

  const complexity = computeMessageComplexityScore(messageText);
  const hasTechnicalIntent = /(bug|error|stack|fix|debug|refactor|optimi[sz]e|patch|rewrite)/.test(t);
  const hasExplainIntent = /(explain|help|how|why|what|guide|doc)/.test(t);

  let temperature = complexity >= 0.6
    ? 0.86
    : complexity >= 0.25
      ? 0.68
      : 0.5;

  // Keep help/explain prompts in a stable middle band (except explicit technical fixes).
  if (hasExplainIntent && !hasTechnicalIntent && complexity < 0.6) {
    temperature = clampNumber(Math.max(temperature, 0.62), 0.62, 0.72);
  }

  // Keep deterministic behavior for short/medium technical fix asks.
  if (hasTechnicalIntent && complexity < 0.6) {
    temperature = Math.min(temperature, 0.58);
  }

  if (hasAttachments) {
    temperature = Math.min(temperature, 0.78);
  }

  return temperature;
}

module.exports = {
  buildAiSystemPrompt,
  buildRawAiSystemPrompt,
  buildStrictSystemPrompt,
  computeDynamicTemperature,
};
