/* ============================================================================
 * YouChords - local Whisper transcription client
 *
 * The companion service downloads/transcribes locally with WhisperX using
 * the selected large-v2 or large-v3 model and returns timestamped
 * sentence/word SRT for IndexedDB.
 * ========================================================================== */

import { getLocalApiBase } from './localProcessorConfig.js';

const YC_WHISPER_MODEL = 'large-v2';
const YC_WHISPER_TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);
const YC_WHISPER_LANGUAGE_STORAGE_KEY = 'whisperSubtitleLanguage';
const YC_WHISPER_MODEL_STORAGE_KEY = 'whisperSubtitleModel';
const YC_WHISPER_MODEL_OPTIONS = Object.freeze([
  { code: 'large-v2', name: 'Whisper large-v2 — Default' },
  { code: 'large-v3', name: 'Whisper large-v3 — More accurate' },
]);
const YC_WHISPER_LANGUAGE_OPTIONS = Object.freeze([
  { code: 'auto', name: 'Auto — זיהוי אוטומטי' },
  { code: 'en', name: 'English — אנגלית' },
  { code: 'he', name: 'Hebrew — עברית' },
  { code: 'es', name: 'Spanish — ספרדית' },
  { code: 'fr', name: 'French — צרפתית' },
  { code: 'de', name: 'German — גרמנית' },
  { code: 'it', name: 'Italian — איטלקית' },
  { code: 'pt', name: 'Portuguese — פורטוגזית' },
  { code: 'ru', name: 'Russian — רוסית' },
  { code: 'ar', name: 'Arabic — ערבית' },
  { code: 'ja', name: 'Japanese — יפנית' },
  { code: 'ko', name: 'Korean — קוריאנית' },
  { code: 'zh', name: 'Chinese — סינית' },
  { code: 'hi', name: 'Hindi — הינדית' },
  { code: 'tr', name: 'Turkish — טורקית' },
  { code: 'nl', name: 'Dutch — הולנדית' },
  { code: 'pl', name: 'Polish — פולנית' },
  { code: 'uk', name: 'Ukrainian — אוקראינית' },
  { code: 'sv', name: 'Swedish — שוודית' },
  { code: 'da', name: 'Danish — דנית' },
  { code: 'no', name: 'Norwegian — נורווגית' },
  { code: 'fi', name: 'Finnish — פינית' },
  { code: 'cs', name: 'Czech — צ׳כית' },
  { code: 'el', name: 'Greek — יוונית' },
  { code: 'ro', name: 'Romanian — רומנית' },
  { code: 'hu', name: 'Hungarian — הונגרית' },
  { code: 'id', name: 'Indonesian — אינדונזית' },
  { code: 'vi', name: 'Vietnamese — וייטנאמית' },
  { code: 'th', name: 'Thai — תאילנדית' },
  { code: 'fa', name: 'Persian — פרסית' },
]);

function normalizeWhisperLanguagePreference(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return YC_WHISPER_LANGUAGE_OPTIONS.some((option) => option.code === normalized)
    ? normalized
    : 'auto';
}

function normalizeWhisperModelPreference(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return YC_WHISPER_MODEL_OPTIONS.some((option) => option.code === normalized)
    ? normalized
    : YC_WHISPER_MODEL;
}

async function getWhisperLanguagePreference() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return 'auto';
    const settings = await chrome.storage.local.get([YC_WHISPER_LANGUAGE_STORAGE_KEY]);
    return normalizeWhisperLanguagePreference(settings[YC_WHISPER_LANGUAGE_STORAGE_KEY]);
  } catch (error) {
    console.warn('[Whisper] Failed to read language preference, using Auto:', error);
    return 'auto';
  }
}

async function setWhisperLanguagePreference(value) {
  const language = normalizeWhisperLanguagePreference(value);
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [YC_WHISPER_LANGUAGE_STORAGE_KEY]: language });
    }
  } catch (error) {
    console.warn('[Whisper] Failed to save language preference:', error);
  }
  return language;
}

async function getWhisperModelPreference() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return YC_WHISPER_MODEL;
    const settings = await chrome.storage.local.get([YC_WHISPER_MODEL_STORAGE_KEY]);
    return normalizeWhisperModelPreference(settings[YC_WHISPER_MODEL_STORAGE_KEY]);
  } catch (error) {
    console.warn('[Whisper] Failed to read model preference, using large-v2:', error);
    return YC_WHISPER_MODEL;
  }
}

async function setWhisperModelPreference(value) {
  const model = normalizeWhisperModelPreference(value);
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [YC_WHISPER_MODEL_STORAGE_KEY]: model });
    }
  } catch (error) {
    console.warn('[Whisper] Failed to save model preference:', error);
  }
  return model;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The transcription request was aborted.', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('The transcription request was aborted.', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${await getLocalApiBase()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    payload = null;
  }
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `Whisper transcription failed (${response.status})`);
  }
  return payload;
}

function emitProgress(job) {
  const progress = Number(job?.progress || 0);
  const stage = job?.stage || 'queued';
  const status = job?.status || 'queued';
  window.extractorModule?.updateSubtitlesProgress?.({
    status,
    stage,
    progress,
    model: job?.model || YC_WHISPER_MODEL,
    cached: job?.cached === true
  });
  window.dispatchEvent(new CustomEvent('yc:whisperProgress', {
    detail: {
      status,
      stage,
      progress,
      model: job?.model || YC_WHISPER_MODEL,
      cached: job?.cached === true
    }
  }));
}

function getWhisperError(error) {
  const detail = String(error?.message || error || '').trim();
  if (detail.includes('Failed to fetch')) {
    return new Error('מעבד YouChords Local שנבחר אינו פועל. הפעל אותו ובדוק שוב.');
  }
  return error;
}

async function transcribeVideo(videoId, options = {}) {
  const signal = options.signal;
  const requestedModel = options.model || await getWhisperModelPreference();
  const model = normalizeWhisperModelPreference(requestedModel);
  const requestedLanguage = String(options.language || '').trim().toLowerCase();
  // "auto" is a UI/API label. Whisper's Python API uses None for automatic
  // language detection, so do not send the literal value to the local service.
  const language = ['auto', 'automatic'].includes(requestedLanguage)
    ? ''
    : requestedLanguage;
  let job = null;

  try {
    emitProgress({ status: 'queued', stage: 'queued', progress: 0, model });
    let payload = await fetchJson('/transcription/jobs', {
      method: 'POST',
      body: JSON.stringify({
        videoId,
        model,
        ...(language ? { language } : {})
      }),
      signal
    });
    job = payload.job;
    emitProgress(job);

    while (job && !YC_WHISPER_TERMINAL_STATES.has(job.status)) {
      await sleep(1200, signal);
      payload = await fetchJson(`/transcription/jobs/${encodeURIComponent(job.id)}`, { signal });
      job = payload.job;
      emitProgress(job);
      options.onProgress?.(job);
    }

    if (!job || job.status !== 'completed') {
      throw new Error(job?.error || 'Whisper לא הצליח ליצור תמלול.');
    }
    if (!job.result?.sentenceSRT?.trim()) {
      throw new Error('Whisper סיים ללא כתוביות.');
    }
    return job.result;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw getWhisperError(error);
  }
}

window.ycWhisperTranscription = {
  transcribeVideo,
  model: YC_WHISPER_MODEL,
  modelStorageKey: YC_WHISPER_MODEL_STORAGE_KEY,
  modelOptions: YC_WHISPER_MODEL_OPTIONS,
  getApiBase: getLocalApiBase,
  languageStorageKey: YC_WHISPER_LANGUAGE_STORAGE_KEY,
  languageOptions: YC_WHISPER_LANGUAGE_OPTIONS,
  normalizeModel: normalizeWhisperModelPreference,
  normalizeLanguage: normalizeWhisperLanguagePreference,
  getModelPreference: getWhisperModelPreference,
  getLanguagePreference: getWhisperLanguagePreference,
  setModelPreference: setWhisperModelPreference,
  setLanguagePreference: setWhisperLanguagePreference,
};

console.log('[Whisper] Local WhisperX client loaded (large-v2 / large-v3, GPU when available)');
