const GEMINI_PIPELINE_SETTINGS_KEY = 'subflowGeminiPipelineSettings';
const GEMINI_PIPELINE_PROMPT_KEY = 'subflowGeminiPipelinePrompt';
const GEMINI_API_KEYS_KEY = 'geminiApiKeys';
const DEFAULT_GEMINI_PIPELINE_SETTINGS = Object.freeze({
  model: 'gemini-3.8-flash',
  sourceLanguage: 'auto',
  apiStrategy: 'auto',
  apiCount: 1,
  chunkMinutes: 30,
  selectedApiKeyId: 'default'
});
const GEMINI_PIPELINE_MODELS = [
  { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash — recommended' },
  { value: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite — faster' },
  { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite — economical' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview — strongest reasoning' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — legacy strong' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — legacy balanced' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite — legacy fast' }
];
const GEMINI_SOURCE_LANGUAGES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'he', label: 'Hebrew' },
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'Arabic' },
  { value: 'ru', label: 'Russian' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' }
];
const GEMINI_CHUNK_MINUTES = [10, 15, 20, 30, 45, 60];
const GEMINI_STAGE_LABELS = [
  'Speaker and gender map',
  'Professional Hebrew translation',
  'Full translation QA',
  'Gender and addressee QA',
  'Independent context QA',
  'Semantic QA',
  'Hebrew grammar QA',
  'Timing and line-break editing',
  'Final SRT release validation'
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hasChromeStorage() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function normalizeSettings(raw = {}, keyCount = 1) {
  const settings = raw && typeof raw === 'object' ? raw : {};
  const model = GEMINI_PIPELINE_MODELS.some(option => option.value === settings.model)
    ? settings.model
    : DEFAULT_GEMINI_PIPELINE_SETTINGS.model;
  const sourceLanguage = GEMINI_SOURCE_LANGUAGES.some(option => option.value === settings.sourceLanguage)
    ? settings.sourceLanguage
    : DEFAULT_GEMINI_PIPELINE_SETTINGS.sourceLanguage;
  const apiStrategy = settings.apiStrategy === 'manual' ? 'manual' : 'auto';
  const apiCount = clamp(Number(settings.apiCount) || 1, 1, Math.max(1, keyCount));
  const chunkMinutes = GEMINI_CHUNK_MINUTES.includes(Number(settings.chunkMinutes))
    ? Number(settings.chunkMinutes)
    : DEFAULT_GEMINI_PIPELINE_SETTINGS.chunkMinutes;
  return {
    model,
    sourceLanguage,
    apiStrategy,
    apiCount,
    chunkMinutes,
    selectedApiKeyId: String(settings.selectedApiKeyId || DEFAULT_GEMINI_PIPELINE_SETTINGS.selectedApiKeyId)
  };
}

export async function loadGeminiPipelineSettings(keyCount = 1) {
  if (!hasChromeStorage()) return { ...DEFAULT_GEMINI_PIPELINE_SETTINGS };
  const stored = await chrome.storage.local.get(GEMINI_PIPELINE_SETTINGS_KEY);
  return normalizeSettings(stored?.[GEMINI_PIPELINE_SETTINGS_KEY], keyCount);
}

export async function saveGeminiPipelineSettings(settings) {
  const normalized = normalizeSettings(settings, Math.max(1, Number(settings?.apiCount) || 1));
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [GEMINI_PIPELINE_SETTINGS_KEY]: normalized });
  }
  return normalized;
}

function cleanApiKey(value) {
  return String(value || '').trim();
}

function makeKeyId() {
  return `subflow_key_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function maskApiKey(key) {
  const value = cleanApiKey(key);
  if (value.length < 10) return '***';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export { maskApiKey };

export async function getGeminiApiKeyEntries() {
  if (!hasChromeStorage()) return [];
  const stored = await chrome.storage.local.get([
    'geminiApiKey',
    'geminiApiKeyStatus',
    'geminiApiKeyLastError',
    GEMINI_API_KEYS_KEY
  ]);
  const entries = [];
  const primaryKey = cleanApiKey(stored.geminiApiKey);
  if (primaryKey) {
    entries.push({
      id: 'default',
      name: 'DEFAULT',
      key: primaryKey,
      status: stored.geminiApiKeyStatus || 'active',
      lastError: stored.geminiApiKeyLastError || '',
      isDefault: true
    });
  }
  const seen = new Set(entries.map(entry => entry.key));
  const saved = Array.isArray(stored[GEMINI_API_KEYS_KEY]) ? stored[GEMINI_API_KEYS_KEY] : [];
  saved.forEach((entry, index) => {
    const key = cleanApiKey(entry?.key);
    if (!key || seen.has(key)) return;
    seen.add(key);
    entries.push({
      id: String(entry.id || makeKeyId()),
      name: String(entry.name || `API ${index + 1}`),
      key,
      status: String(entry.status || 'active'),
      lastError: String(entry.lastError || ''),
      active: entry.active !== false,
      isDefault: false
    });
  });
  return entries.filter(entry => entry.active !== false && entry.status !== 'disabled');
}

async function getSecondaryApiKeys() {
  const stored = await chrome.storage.local.get(GEMINI_API_KEYS_KEY);
  return Array.isArray(stored[GEMINI_API_KEYS_KEY]) ? stored[GEMINI_API_KEYS_KEY] : [];
}

export async function upsertGeminiApiKey({ id = null, name, key }) {
  if (!hasChromeStorage()) throw new Error('Chrome local storage is unavailable');
  const cleanKey = cleanApiKey(key);
  const cleanName = String(name || '').trim() || 'Gemini API';
  if (cleanKey.length < 20) throw new Error('Please enter a valid Gemini API key');

  const primary = await chrome.storage.local.get('geminiApiKey');
  if (id === 'default' || (!id && !primary.geminiApiKey)) {
    await chrome.storage.local.set({
      geminiApiKey: cleanKey,
      geminiApiKeyStatus: 'active',
      geminiApiKeyLastError: ''
    });
    return 'default';
  }

  const keys = await getSecondaryApiKeys();
  const existingIndex = id ? keys.findIndex(entry => String(entry.id) === String(id)) : -1;
  const duplicate = keys.some((entry, index) => entry.key === cleanKey && index !== existingIndex) || primary.geminiApiKey === cleanKey;
  if (duplicate) throw new Error('This API key is already saved');
  const nextEntry = {
    id: existingIndex >= 0 ? keys[existingIndex].id : (id || makeKeyId()),
    name: cleanName,
    key: cleanKey,
    status: 'active',
    lastError: '',
    active: true
  };
  if (existingIndex >= 0) keys[existingIndex] = nextEntry;
  else keys.push(nextEntry);
  await chrome.storage.local.set({ [GEMINI_API_KEYS_KEY]: keys });
  return nextEntry.id;
}

export async function removeGeminiApiKey(id) {
  if (!hasChromeStorage()) return;
  if (id === 'default') {
    await chrome.storage.local.remove([
      'geminiApiKey',
      'geminiApiKeyStatus',
      'geminiApiKeyLastError'
    ]);
    return;
  }
  const keys = await getSecondaryApiKeys();
  await chrome.storage.local.set({
    [GEMINI_API_KEYS_KEY]: keys.filter(entry => String(entry.id) !== String(id))
  });
}

export async function importGeminiApiKeys(text) {
  const source = String(text || '');
  const matches = source.match(/\b(?:AIzaSy[A-Za-z0-9_-]{20,}|AQ\.[A-Za-z0-9_-]{20,})\b/g) || [];
  const uniqueKeys = [...new Set(matches.map(cleanApiKey))];
  if (!uniqueKeys.length) throw new Error('No Gemini API keys were found in this file');
  const existing = await getGeminiApiKeyEntries();
  const existingValues = new Set(existing.map(entry => entry.key));
  const saved = await getSecondaryApiKeys();
  const imported = [];
  uniqueKeys.forEach((key, index) => {
    if (existingValues.has(key)) return;
    const entry = {
      id: makeKeyId(),
      name: `Imported API ${index + 1}`,
      key,
      status: 'active',
      lastError: '',
      active: true
    };
    saved.push(entry);
    existingValues.add(key);
    imported.push(entry);
  });
  await chrome.storage.local.set({ [GEMINI_API_KEYS_KEY]: saved });
  return { imported, skipped: uniqueKeys.length - imported.length };
}

export async function updateGeminiApiKeyStatus(id, status, lastError = '') {
  if (!hasChromeStorage()) return;
  const cleanError = String(lastError || '').slice(-500);
  if (id === 'default') {
    await chrome.storage.local.set({
      geminiApiKeyStatus: status,
      geminiApiKeyLastError: cleanError
    });
    return;
  }
  const keys = await getSecondaryApiKeys();
  const entry = keys.find(item => String(item.id) === String(id));
  if (!entry) return;
  entry.status = status;
  entry.lastError = cleanError;
  await chrome.storage.local.set({ [GEMINI_API_KEYS_KEY]: keys });
}

export async function loadGeminiPipelinePrompt() {
  if (!hasChromeStorage()) return '';
  const stored = await chrome.storage.local.get(GEMINI_PIPELINE_PROMPT_KEY);
  return typeof stored?.[GEMINI_PIPELINE_PROMPT_KEY] === 'string'
    ? stored[GEMINI_PIPELINE_PROMPT_KEY]
    : '';
}

export async function saveGeminiPipelinePrompt(promptText) {
  const prompt = String(promptText || '').trim();
  if (!prompt) throw new Error('The prompt file is empty');
  if (!/STAGE\s+0/i.test(prompt) || !/STAGE\s+8/i.test(prompt)) {
    throw new Error('Please select the complete ALL_STAGES_0_TO_8 prompt file');
  }
  if (prompt.length > 500000) throw new Error('The prompt file is too large');
  if (hasChromeStorage()) await chrome.storage.local.set({ [GEMINI_PIPELINE_PROMPT_KEY]: prompt });
  return prompt;
}

function parseTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const match = text.match(/^(\d{1,3}):([0-5]?\d):([0-5]?\d)(?:[,.](\d{1,3}))?$/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number((match[4] || '').padEnd(3, '0') || 0) / 1000;
}

function formatTime(seconds) {
  const millis = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(millis / 3600000);
  const minutes = Math.floor((millis % 3600000) / 60000);
  const secs = Math.floor((millis % 60000) / 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis % 1000).padStart(3, '0')}`;
}

function cleanSubtitleText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\[S\d+[-_]?[MFU]\]\s*/gi, '')
    .replace(/\\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function parseSrtLines(rawText) {
  const lines = String(rawText || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/^```(?:srt|subrip|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .split('\n');
  const timingRegex = /^\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{1,3})/;
  const cues = [];
  for (let index = 0; index < lines.length; index += 1) {
    let timingLine = lines[index].match(timingRegex);
    if (!timingLine && /^\s*\d+\s*$/.test(lines[index])) {
      timingLine = lines[index + 1]?.match(timingRegex);
      if (timingLine) index += 1;
    }
    if (!timingLine) continue;
    const textLines = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (lines[cursor].match(timingRegex) || (/^\s*\d+\s*$/.test(lines[cursor]) && lines[cursor + 1]?.match(timingRegex))) break;
      if (lines[cursor].trim()) textLines.push(lines[cursor]);
    }
    const start = parseTime(timingLine[1]);
    const end = parseTime(timingLine[2]);
    const text = cleanSubtitleText(textLines.join('\n'));
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && text) {
      cues.push({ start, end, text });
    }
  }
  return cues;
}

function parseJsonSubtitles(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['subtitles', 'segments', 'cues', 'items', 'data']) {
    if (Array.isArray(value[key])) return value[key];
  }
  for (const key of ['srt', 'subtitleSrt', 'translatedSrt', 'outputSrt', 'text']) {
    if (typeof value[key] === 'string') {
      const parsed = parseSrtLines(value[key]);
      if (parsed.length) return parsed;
    }
  }
  return [];
}

export function extractSrtCues(rawText) {
  const raw = String(rawText || '').trim();
  if (!raw) return [];
  try {
    const unwrapped = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(unwrapped);
    const items = parseJsonSubtitles(parsed);
    const cues = items.map(item => {
      const start = parseTime(item?.start ?? item?.startTime ?? item?.from);
      const end = parseTime(item?.end ?? item?.endTime ?? item?.to);
      const text = cleanSubtitleText(item?.text ?? item?.translation ?? item?.primary ?? '');
      return { start, end, text };
    }).filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start && item.text);
    if (cues.length) return cues;
  } catch {
    // Gemini may return plain SRT or wrap it in explanatory text.
  }
  return parseSrtLines(raw);
}

function wrapSubtitleText(text, maxLength = 42) {
  const paragraphs = cleanSubtitleText(text).split('\n').filter(Boolean);
  const words = paragraphs.join(' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words.join(' ').length <= maxLength) return words.join(' ');
  let bestIndex = -1;
  let bestScore = Infinity;
  for (let index = 1; index < words.length; index += 1) {
    const first = words.slice(0, index).join(' ');
    const second = words.slice(index).join(' ');
    if (first.length > maxLength || second.length > maxLength) continue;
    const score = Math.abs(first.length - second.length) + (words[index - 1].length === 1 || words[index].length === 1 ? 8 : 0);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  if (bestIndex > 0) return `${words.slice(0, bestIndex).join(' ')}\n${words.slice(bestIndex).join(' ')}`;
  let line = '';
  const output = [];
  words.forEach(word => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maxLength) {
      output.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) output.push(line);
  return output.join('\n');
}

function normalizeCues(cues) {
  return cues
    .filter(cue => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start && cue.text)
    .map(cue => ({
      start: Math.max(0, Number(cue.start)),
      end: Math.max(0, Number(cue.end)),
      text: cleanSubtitleText(cue.text)
    }))
    .filter(cue => cue.text)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

export function cuesToSrt(cues, wrap = false) {
  return normalizeCues(cues).map((cue, index) => (
    `${index + 1}\n${formatTime(cue.start)} --> ${formatTime(cue.end)}\n${wrap ? wrapSubtitleText(cue.text) : cue.text}`
  )).join('\n\n') + (cues?.length ? '\n' : '');
}

function adjustChunkTimes(cues, chunk) {
  const normalized = normalizeCues(cues);
  if (!normalized.length || !chunk.start) return normalized;
  const duration = Math.max(0, (chunk.end ?? chunk.start + 1) - chunk.start);
  const maxEnd = Math.max(...normalized.map(cue => cue.end));
  if (maxEnd <= duration + 5) {
    return normalized.map(cue => ({ ...cue, start: cue.start + chunk.start, end: cue.end + chunk.start }));
  }
  return normalized;
}

function buildChunks(durationSeconds, settings) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) return [{ index: 0, start: 0, end: null }];
  const chunkSeconds = Number(settings.chunkMinutes) * 60;
  const chunks = [];
  for (let start = 0; start < duration; start += chunkSeconds) {
    chunks.push({
      index: chunks.length,
      start,
      end: Math.min(duration, start + chunkSeconds)
    });
  }
  return chunks.length ? chunks : [{ index: 0, start: 0, end: duration }];
}

function formatRange(chunk) {
  return chunk.end === null
    ? 'the entire video'
    : `${formatTime(chunk.start)} through ${formatTime(chunk.end)}`;
}

function buildTranscriptionPrompt({ chunk, sourceLanguage }) {
  return [
    'אתה מתמלל מקצועי של וידאו מ-YouTube.',
    'תמלל רק דיבור ושירה שנשמעים באודיו. התעלם מתמונות, טקסט על המסך, מוזיקה ללא מילים ורעשי רקע.',
    `שפת המקור: ${sourceLanguage === 'auto' ? 'זיהוי אוטומטי' : sourceLanguage}.`,
    `עבוד רק על טווח הזמן ${formatRange(chunk)}. החזר זמנים מוחלטים ביחס לסרטון המלא.`,
    'זהו שלב תמלול בלבד — אל תתרגם לעברית.',
    'החזר אך ורק SRT מלא ותקין בקידוד טקסט, עם HH:MM:SS,mmm, ללא Markdown, ללא הסברים וללא JSON.',
    'שמור על כל המילים ועל רצף הדיבור. אם יש שני דוברים באותה כתובית, הפרד אותם לשתי שורות עם מקף.'
  ].join('\n');
}

function findStagePrompt(promptText, stage) {
  if (!promptText) return '';
  const startMarker = new RegExp(`={10,}\\s*STAGE\\s+${stage}\\s*={10,}`, 'i');
  const startMatch = startMarker.exec(promptText);
  if (!startMatch) return '';
  const rest = promptText.slice(startMatch.index + startMatch[0].length);
  const next = /={10,}\s*STAGE\s+\d+\s*={10,}/i.exec(rest);
  return rest.slice(0, next ? next.index : rest.length).trim();
}

function replacePromptPlaceholders(promptText, values) {
  return String(promptText || '').replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => values[key] ?? '');
}

function builtInStagePrompt(stage, values) {
  const source = values.SOURCE_ANNOTATED_SRT || values.SOURCE_SUBTITLES || '';
  const previous = values.TRANSLATED_SRT || values.HEBREW_QA_SRT || values.STAGE3_HEBREW_SRT || values.STAGE4_HEBREW_SRT || values.STAGE5_HEBREW_SRT || values.STAGE6_HEBREW_SRT || values.STAGE7_HEBREW_SRT || '';
  const whisperSpeakerContext = values.WHISPER_SPEAKER_CONTEXT || '';
  if (stage === 0) {
    return `קרא את מקטע המקור הבא ואת הווידאו המצורף. בנה מפת דוברים, נמענים, גוף, מגדר ומספר לשימוש בשלבי התרגום. אל תתרגם ואל תחזיר SRT. ציין speaker_id עקבי, M/F/U ורמת ביטחון.${whisperSpeakerContext ? `\n\nWHISPER SPEAKER/GENDER ANALYSIS:\n${whisperSpeakerContext}` : ''}\n\nSOURCE:\n${source}`;
  }
  const stageGoals = {
    1: 'תרגם את כל המקור לעברית טבעית בסגנון כתוביות סטרימינג.',
    2: 'בצע בקרת איכות מלאה מול המקור ותקן משמעות, מבנה, פיסוק וזמנים.',
    3: 'בדוק מחדש מגדר, גוף, מספר ונמען בעברית לפי מפת הדוברים.',
    4: 'בצע אימות עצמאי נוסף של התאמת הדוברים והעברית; תקן רק מה שנדרש.',
    5: 'בצע בדיקה סמנטית מול המקור ותקן תרגומים שאינם מתאימים להקשר.',
    6: 'בצע בקרת דקדוק, תחביר וניסוח טבעי בעברית.',
    7: 'ערוך תזמון, איחוד משפטים ושבירת שורות בסגנון Netflix; עד 42 תווים בשורה.',
    8: 'בצע אימות שחרור סופי: ללא חפיפות, ללא דילוגים, SRT מלא ותקין.'
  };
  return `${stageGoals[stage]}\nשמור על כל התוכן והזמנים ככל האפשר. הסר מטא-דאטה של דוברים מהפלט.\n\nSOURCE:\n${source}\n\nPREVIOUS HEBREW SRT:\n${previous}`;
}

function buildStagePrompt({ stage, promptText, sourceSrt, previousSrt, speakerMap, speakerContext = '', videoUrl, sourceLanguage }) {
  const values = {
    SOURCE_LANGUAGE: sourceLanguage || 'auto',
    TARGET_LANGUAGE: 'Hebrew',
    TARGET_LOCALE: 'Israel',
    CONTENT_TYPE: 'film or video',
    HISTORICAL_CONTEXT: 'Unknown; infer only when supported by the video',
    SUBTITLE_MODE: 'dialogue_only',
    CENSORSHIP_LEVEL: 'uncensored',
    GLOSSARY: '',
    CHARACTER_GLOSSARY: '',
    SPECIAL_INSTRUCTIONS: 'Final target language is always Hebrew. Return only the requested stage output.',
    OPTIONAL_MEDIA: videoUrl || '',
    SOURCE_SUBTITLES: sourceSrt,
    SOURCE_ANNOTATED_SRT: sourceSrt,
    TRANSLATED_SRT: previousSrt,
    HEBREW_QA_SRT: previousSrt,
    STAGE3_HEBREW_SRT: previousSrt,
    STAGE4_HEBREW_SRT: previousSrt,
    STAGE5_HEBREW_SRT: previousSrt,
    STAGE6_HEBREW_SRT: previousSrt,
    STAGE7_HEBREW_SRT: previousSrt,
    STAGE0_SPEAKER_ADDRESSEE_GENDER_MAP: speakerMap || '',
    WHISPER_SPEAKER_CONTEXT: speakerContext || '',
    SCENE_CONTEXT: '',
    PRODUCTION_CONTEXT: '',
    MAX_GAP_MS: '180'
  };
  const customStage = findStagePrompt(promptText, stage);
  const body = customStage
    ? replacePromptPlaceholders(customStage, values)
    : builtInStagePrompt(stage, values);
  if (stage === 0) {
    return `${body}\n\nReturn only the internal speaker/addressee/gender map. Do not return a translation or SRT.`;
  }
  return `${body}\n\nReturn only the complete Hebrew SRT. Do not include Markdown fences, explanations, speaker tags, or a progress message.`;
}

class GeminiRequestError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'GeminiRequestError';
    this.status = status;
    this.retryable = [401, 403, 408, 429, 500, 502, 503, 504].includes(status);
  }
}

async function requestGemini({ apiKey, model, videoUrl, prompt, signal }) {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 10 * 60 * 1000);
  const abortFromParent = () => timeoutController.abort();
  signal?.addEventListener('abort', abortFromParent, { once: true });
  try {
    const parts = [];
    if (videoUrl) parts.push({ fileData: { fileUri: videoUrl } });
    parts.push({ text: prompt });
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{
            parts
          }],
          generationConfig: {
            maxOutputTokens: 64000
          }
        }),
        signal: timeoutController.signal
      }
    );
    const responseText = await response.text();
    if (!response.ok) {
      let detail = responseText;
      try {
        detail = JSON.parse(responseText)?.error?.message || detail;
      } catch {
        // Keep the provider's plain-text error.
      }
      throw new GeminiRequestError(`Gemini API error ${response.status}: ${detail}`.slice(0, 1000), response.status);
    }
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new GeminiRequestError('Gemini returned an invalid response');
    }
    const text = data?.candidates?.[0]?.content?.parts
      ?.map(part => part?.text || '')
      .join('')
      .trim();
    if (!text) {
      const blockReason = data?.promptFeedback?.blockReason;
      throw new GeminiRequestError(blockReason ? `Gemini blocked the request: ${blockReason}` : 'Gemini returned an empty response');
    }
    return text;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error?.name === 'AbortError') {
      throw new GeminiRequestError('Gemini request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromParent);
  }
}

async function requestWithRotation({ keys, preferredIndex, model, videoUrl, prompt, signal }) {
  let lastError = null;
  for (let offset = 0; offset < keys.length; offset += 1) {
    const index = (preferredIndex + offset) % keys.length;
    const entry = keys[index];
    try {
      const text = await requestGemini({
        apiKey: entry.key,
        model,
        videoUrl,
        prompt,
        signal
      });
      await updateGeminiApiKeyStatus(entry.id, 'active', '');
      return { text, entry };
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      const status = error?.status || 0;
      await updateGeminiApiKeyStatus(
        entry.id,
        status === 429 ? 'rate-limited' : 'error',
        error?.message || 'Request failed'
      );
      if (!error?.retryable && offset === 0) throw error;
    }
  }
  throw new Error(lastError?.message || 'All selected Gemini API keys failed');
}

function chooseWorkerKeys(keys, settings) {
  if (!keys.length) return [];
  const selectedIndex = Math.max(0, keys.findIndex(entry => entry.id === settings.selectedApiKeyId));
  const count = settings.apiStrategy === 'manual'
    ? clamp(Number(settings.apiCount) || 1, 1, keys.length)
    : keys.length;
  return Array.from({ length: count }, (_, offset) => keys[(selectedIndex + offset) % keys.length]);
}

async function runWithConcurrency(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return output;
}

async function runChunk({ chunk, chunkIndex, chunks, workerKeys, settings, promptText, videoUrl, signal, onProgress }) {
  const preferredIndex = chunkIndex % workerKeys.length;
  onProgress?.({ phase: 'transcription', stage: -1, stageLabel: 'Transcription', chunkIndex, chunkCount: chunks.length });
  const transcriptResponse = await requestWithRotation({
    keys: workerKeys,
    preferredIndex,
    model: settings.model,
    videoUrl,
    prompt: buildTranscriptionPrompt({ chunk, sourceLanguage: settings.sourceLanguage }),
    signal
  });
  const transcriptCues = adjustChunkTimes(extractSrtCues(transcriptResponse.text), chunk);
  if (!transcriptCues.length) throw new Error(`Gemini did not return valid SRT for chunk ${chunkIndex + 1}`);
  const sourceSrt = cuesToSrt(transcriptCues);
  const translated = await runTranslationStages({
    chunk,
    chunkIndex,
    chunks,
    workerKeys,
    settings,
    promptText,
    videoUrl,
    sourceSrt,
    signal,
    onProgress
  });
  return {
    chunk,
    sourceSrt,
    finalCues: translated.finalCues,
    transcriptKey: transcriptResponse.entry.id
  };
}

async function runTranslationStages({
  chunk,
  chunkIndex,
  chunks,
  workerKeys,
  settings,
  promptText,
  videoUrl,
  sourceSrt,
  speakerMap = '',
  speakerContext = '',
  signal,
  onProgress
}) {
  const preferredIndex = chunkIndex % workerKeys.length;
  let previousSrt = sourceSrt;
  let currentSpeakerMap = speakerMap;

  for (let stage = 0; stage <= 8; stage += 1) {
    onProgress?.({ phase: 'pipeline', stage, stageLabel: GEMINI_STAGE_LABELS[stage], chunkIndex, chunkCount: chunks.length });
    const response = await requestWithRotation({
      keys: workerKeys,
      preferredIndex: (preferredIndex + stage + 1) % workerKeys.length,
      model: settings.model,
      videoUrl,
      prompt: buildStagePrompt({
        stage,
        promptText,
        sourceSrt,
        previousSrt,
        speakerMap: currentSpeakerMap,
        speakerContext,
        videoUrl,
        sourceLanguage: settings.sourceLanguage
      }),
      signal
    });
    if (stage === 0) {
      currentSpeakerMap = response.text.slice(0, 100000);
      continue;
    }
    const stageCues = extractSrtCues(response.text);
    if (!stageCues.length) throw new Error(`Gemini did not return valid SRT at stage ${stage} for chunk ${chunkIndex + 1}`);
    previousSrt = cuesToSrt(adjustChunkTimes(stageCues, chunk));
  }

  return {
    finalCues: extractSrtCues(previousSrt),
    speakerMap: currentSpeakerMap
  };
}

export async function runGeminiSrtPipeline({
  videoUrl,
  durationSeconds = 0,
  settings: rawSettings = {},
  keys = [],
  promptText = '',
  signal,
  onProgress
}) {
  const availableKeys = keys.filter(entry => entry?.key && entry.active !== false);
  if (!availableKeys.length) throw new Error('No Gemini API keys are saved. Add or import one in the SRT window.');
  const settings = normalizeSettings(rawSettings, availableKeys.length);
  const workerKeys = chooseWorkerKeys(availableKeys, settings);
  const chunks = buildChunks(durationSeconds, settings);
  const results = await runWithConcurrency(chunks, workerKeys.length, (chunk, index) => runChunk({
    chunk,
    chunkIndex: index,
    chunks,
    workerKeys,
    settings,
    promptText,
    videoUrl,
    signal,
    onProgress
  }));
  const finalCues = normalizeCues(results.flatMap(result => result.finalCues));
  if (!finalCues.length) throw new Error('Gemini completed but no final subtitles were returned');
  const finalSrt = cuesToSrt(finalCues, true);
  onProgress?.({ phase: 'complete', stage: 8, stageLabel: 'Complete', chunkIndex: chunks.length - 1, chunkCount: chunks.length });
  return {
    srt: finalSrt,
    cues: finalCues,
    chunks,
    workerKeys: workerKeys.map(entry => ({ id: entry.id, name: entry.name })),
    transcriptSrt: cuesToSrt(results.flatMap(result => extractSrtCues(result.sourceSrt)))
  };
}

export async function runGeminiWhisperTranslationPipeline({
  sourceSrt,
  speakerContext = '',
  videoUrl,
  durationSeconds = 0,
  settings: rawSettings = {},
  keys = [],
  promptText = '',
  signal,
  onProgress
}) {
  const availableKeys = keys.filter(entry => entry?.key && entry.active !== false);
  if (!availableKeys.length) throw new Error('No Gemini API keys are saved. Add or import one in the SRT window.');
  const sourceCues = extractSrtCues(sourceSrt);
  if (!sourceCues.length) throw new Error('Whisper did not return a valid source SRT');

  const settings = normalizeSettings(rawSettings, availableKeys.length);
  const workerKeys = chooseWorkerKeys(availableKeys, settings);
  const inferredDuration = Math.max(...sourceCues.map(cue => cue.end));
  const chunks = buildChunks(Number(durationSeconds) > 0 ? durationSeconds : inferredDuration, settings);
  const activeChunks = chunks
    .map(chunk => ({
      chunk,
      cues: sourceCues.filter(cue => cue.end > chunk.start && (chunk.end === null || cue.start < chunk.end))
    }))
    .filter(item => item.cues.length);

  const results = await runWithConcurrency(activeChunks, workerKeys.length, (item, index) => runTranslationStages({
    chunk: item.chunk,
    chunkIndex: index,
    chunks: activeChunks.map(entry => entry.chunk),
    workerKeys,
    settings,
    promptText,
    videoUrl,
    sourceSrt: cuesToSrt(item.cues),
    speakerMap: String(speakerContext || '').slice(0, 100000),
    speakerContext: String(speakerContext || '').slice(0, 100000),
    signal,
    onProgress
  }));
  const finalCues = normalizeCues(results.flatMap(result => result.finalCues));
  if (!finalCues.length) throw new Error('Gemini completed but no final subtitles were returned');
  const finalSrt = cuesToSrt(finalCues, true);
  onProgress?.({ phase: 'complete', stage: 8, stageLabel: 'Complete', chunkIndex: activeChunks.length - 1, chunkCount: activeChunks.length });
  return {
    srt: finalSrt,
    cues: finalCues,
    chunks: activeChunks.map(entry => entry.chunk),
    workerKeys: workerKeys.map(entry => ({ id: entry.id, name: entry.name })),
    transcriptSrt: cuesToSrt(sourceCues)
  };
}

export {
  DEFAULT_GEMINI_PIPELINE_SETTINGS,
  GEMINI_PIPELINE_MODELS,
  GEMINI_SOURCE_LANGUAGES,
  GEMINI_CHUNK_MINUTES,
  GEMINI_STAGE_LABELS,
  normalizeSettings
};
