import {
  DEFAULT_GEMINI_PIPELINE_SETTINGS,
  GEMINI_CHUNK_MINUTES,
  GEMINI_PIPELINE_MODELS,
  GEMINI_SOURCE_LANGUAGES,
  getGeminiApiKeyEntries,
  importGeminiApiKeys,
  loadGeminiPipelinePrompt,
  loadGeminiPipelineSettings,
  maskApiKey,
  removeGeminiApiKey,
  runGeminiSrtPipeline,
  runGeminiWhisperTranslationPipeline,
  saveGeminiPipelinePrompt,
  saveGeminiPipelineSettings,
  upsertGeminiApiKey
} from '../utils/subflowGeminiPipeline.js';

const SUBFLOW_LOCAL_API = 'http://127.0.0.1:8765';
const SUBFLOW_TERMINAL_STATES = new Set([
  'prepared',
  'completed',
  'failed',
  'cancelled',
  'interrupted'
]);
const MAX_CUSTOM_SRT_BYTES = 10 * 1024 * 1024;
const SUBFLOW_SETTINGS_STORAGE_KEY = 'subflowTranscriptionSettings';
const SUBFLOW_DEFAULT_SETTINGS = Object.freeze({
  whisperModel: 'large-v3',
  sourceLanguage: 'auto',
  targetLanguage: 'he',
  speakerCount: 'auto',
  diarization: true,
  genderDetection: true,
  professionalReview: false
});
const SUBFLOW_WHISPER_MODELS = [
  { value: 'large-v3', label: 'Large V3 — highest accuracy' },
  { value: 'large-v2', label: 'Large V2 — very high accuracy' },
  { value: 'medium', label: 'Medium — balanced' },
  { value: 'small', label: 'Small — faster' },
  { value: 'base', label: 'Base — fast' },
  { value: 'tiny', label: 'Tiny — fastest' }
];
const SUBFLOW_LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'he', label: 'Hebrew' },
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'Arabic' },
  { value: 'ru', label: 'Russian' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'it', label: 'Italian' }
];
const SUBFLOW_TARGET_LANGUAGE_OPTIONS = SUBFLOW_LANGUAGE_OPTIONS.filter(({ value }) => value !== 'auto');
const SUBFLOW_SPEAKER_OPTIONS = [
  { value: 'auto', label: 'Auto-detect' },
  ...Array.from({ length: 8 }, (_, index) => ({
    value: String(index + 1),
    label: `${index + 1} speaker${index === 0 ? '' : 's'}`
  }))
];

const subflowUi = {
  button: null,
  panel: null,
  keyboardGuard: null,
  focusTarget: null,
  outsideClickHandler: null,
  controller: null,
  geminiController: null,
  geminiVideoId: null,
  pollTimer: null,
  videoId: null,
  tracks: [],
  record: null,
  selectedTrack: null,
  sourceMode: 'subtitles',
  transcriptionSettings: { ...SUBFLOW_DEFAULT_SETTINGS },
  advancedSettingsOpen: false,
  geminiSettings: { ...DEFAULT_GEMINI_PIPELINE_SETTINGS },
  geminiKeys: [],
  geminiPrompt: '',
  geminiManagerOpen: false,
  geminiKeyEditor: null,
  geminiJob: null,
  job: null,
  busy: false,
  notice: '',
  noticeType: 'info'
};

function createElement(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function currentVideoId() {
  return window.ycUtils?.extractVideoId?.(window.location.href) ||
    new URLSearchParams(window.location.search).get('v');
}

function normalizeSubflowSettings(rawSettings = {}) {
  const settings = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const whisperModel = SUBFLOW_WHISPER_MODELS.some(option => option.value === settings.whisperModel)
    ? settings.whisperModel
    : SUBFLOW_DEFAULT_SETTINGS.whisperModel;
  const sourceLanguage = SUBFLOW_LANGUAGE_OPTIONS.some(option => option.value === settings.sourceLanguage)
    ? settings.sourceLanguage
    : SUBFLOW_DEFAULT_SETTINGS.sourceLanguage;
  const targetLanguage = SUBFLOW_TARGET_LANGUAGE_OPTIONS.some(option => option.value === settings.targetLanguage)
    ? settings.targetLanguage
    : SUBFLOW_DEFAULT_SETTINGS.targetLanguage;
  const speakerCount = settings.speakerCount === 'auto' || /^[1-8]$/.test(String(settings.speakerCount || ''))
    ? String(settings.speakerCount)
    : SUBFLOW_DEFAULT_SETTINGS.speakerCount;
  return {
    whisperModel,
    sourceLanguage,
    targetLanguage,
    speakerCount,
    diarization: settings.diarization !== false,
    genderDetection: settings.genderDetection !== false,
    professionalReview: settings.professionalReview === true
  };
}

async function loadSubflowSettings() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  const stored = await chrome.storage.local.get(SUBFLOW_SETTINGS_STORAGE_KEY);
  subflowUi.transcriptionSettings = normalizeSubflowSettings(
    stored?.[SUBFLOW_SETTINGS_STORAGE_KEY]
  );
}

function saveSubflowSettings() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return Promise.resolve();
  return chrome.storage.local.set({
    [SUBFLOW_SETTINGS_STORAGE_KEY]: subflowUi.transcriptionSettings
  });
}

function updateSubflowSetting(key, value) {
  subflowUi.transcriptionSettings = normalizeSubflowSettings({
    ...subflowUi.transcriptionSettings,
    [key]: value
  });
  saveSubflowSettings().catch(error => {
    console.warn('[SubflowButton] Failed to save transcription settings:', error);
  });
  renderPanel();
}

function setNotice(message, type = 'info') {
  subflowUi.notice = message;
  subflowUi.noticeType = type;
  renderPanel();
}

function clearPollTimer() {
  if (subflowUi.pollTimer) {
    clearTimeout(subflowUi.pollTimer);
    subflowUi.pollTimer = null;
  }
}

function closePanel() {
  clearPollTimer();
  subflowUi.controller?.abort();
  subflowUi.controller = null;
  if (subflowUi.keyboardGuard) {
    for (const eventName of ['keydown', 'keypress', 'keyup']) {
      subflowUi.panel?.removeEventListener(eventName, subflowUi.keyboardGuard);
    }
    subflowUi.keyboardGuard = null;
  }
  if (subflowUi.outsideClickHandler) {
    document.removeEventListener('pointerdown', subflowUi.outsideClickHandler, true);
    subflowUi.outsideClickHandler = null;
  }
  subflowUi.panel?.remove();
  subflowUi.panel = null;
  subflowUi.focusTarget = null;
  subflowUi.button?.classList.remove('yc-subflow-button-active');
}

function parseTimestamp(value) {
  const match = String(value || '').trim().match(/^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4]);
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function formatTimestamp(value) {
  const milliseconds = Math.max(0, Math.round(Number(value) * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function parseAndNormalizeSrt(rawSrt) {
  const normalized = String(rawSrt || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (!normalized) throw new Error('The SRT file is empty');

  const lines = normalized.split('\n');
  const timingRegex =
    /^(\d{1,3}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{1,3})/;
  const timingLines = [];

  lines.forEach((line, index) => {
    const timing = line.trim().match(timingRegex);
    if (timing) timingLines.push({ lineIndex: index, timing });
  });

  const cues = [];
  for (let index = 0; index < timingLines.length; index += 1) {
    const { lineIndex, timing } = timingLines[index];
    const nextTimingLineIndex = timingLines[index + 1]?.lineIndex ?? lines.length;
    let textLines = lines.slice(lineIndex + 1, nextTimingLineIndex);

    while (textLines.length && !textLines[textLines.length - 1].trim()) {
      textLines.pop();
    }
    if (
      textLines.length &&
      /^\s*\d+\s*$/.test(textLines[textLines.length - 1])
    ) {
      textLines.pop();
    }

    const startTime = parseTimestamp(timing[1]);
    const endTime = parseTimestamp(timing[2]);
    // Keep intentional line breaks from the SRT. The subtitle renderer uses
    // them for the normal two-line CC layout.
    const text = textLines
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n')
      .trim();
    if (startTime === null || endTime === null || endTime <= startTime || !text) {
      throw new Error('The SRT file contains an invalid or empty cue');
    }
    cues.push({ startTime, endTime, text });
  }
  if (!cues.length) throw new Error('No valid subtitle cues were found in this SRT file');
  cues.sort((a, b) => a.startTime - b.startTime);

  const srt = cues.map((cue, index) => (
    `${index + 1}\n${formatTimestamp(cue.startTime)} --> ${formatTimestamp(cue.endTime)}\n${cue.text}`
  )).join('\n\n');
  return { srt: `${srt}\n`, cues };
}

function safeDownloadName(label, fallback = 'subtitles') {
  const safe = String(label || fallback)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return safe || fallback;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadText(text, filename) {
  downloadBlob(new Blob([text], { type: 'application/x-subrip;charset=utf-8' }), filename);
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${SUBFLOW_LOCAL_API}${path}`, {
    ...options,
    signal: options.signal || subflowUi.controller?.signal,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    throw new Error(data?.error || `Local service returned HTTP ${response.status}`);
  }
  return { response, data };
}

async function loadRecord() {
  subflowUi.record = await window.databaseManager?.loadFromDatabase?.('subtitles', subflowUi.videoId) || null;
  return subflowUi.record;
}

async function saveRecord(changes) {
  const current = await loadRecord();
  const next = {
    ...(current || {}),
    videoId: subflowUi.videoId,
    ...changes,
    timestamp: Date.now()
  };
  await window.databaseManager.saveToDatabase('subtitles', subflowUi.videoId, next);
  subflowUi.record = next;
  return next;
}

function notifySubtitleUpdate() {
  window.dispatchEvent(new CustomEvent('yc:subtitlesUpdated', {
    detail: { videoId: subflowUi.videoId, source: 'subflow-custom' }
  }));
}

async function fetchTrack(track) {
  if (!track) throw new Error('Select a YouTube subtitle track first');
  return window.youtubeSubtitles.fetchCaptionTrackAsSrt(
    subflowUi.videoId,
    track.languageCode,
    track.isAutoGenerated
  );
}

async function useYoutubeTrack(track) {
  const downloaded = await fetchTrack(track);
  subflowUi.selectedTrack = track;
  await saveRecord({
    sentenceSRT: downloaded.srt,
    wordSRT: null,
    originalSentences: downloaded.originalSentences,
    source: 'youtube',
    languageCode: downloaded.languageCode,
    languageName: downloaded.languageName,
    isAutoGenerated: downloaded.isAutoGenerated,
    hasSubtitles: true,
    customSubtitleActive: false
  });
  notifySubtitleUpdate();
  setNotice(`${downloaded.languageName} is now the active subtitle track`, 'success');
}

async function downloadYoutubeTrack(track) {
  const downloaded = await fetchTrack(track);
  const suffix = track.isAutoGenerated ? '-auto' : '';
  downloadText(
    downloaded.srt,
    `${subflowUi.videoId}-${safeDownloadName(downloaded.languageCode)}${suffix}.srt`
  );
  setNotice('Subtitle file downloaded', 'success');
}

async function importCustomSrt(file) {
  if (!file) return;
  if (file.size > MAX_CUSTOM_SRT_BYTES) {
    throw new Error('The SRT file is larger than 10 MB');
  }
  const parsed = parseAndNormalizeSrt(await file.text());
  const savedRecord = await saveRecord({
    customSubtitleSRT: parsed.srt,
    customSubtitleOriginalSentences: parsed.cues,
    customSubtitleLabel: file.name,
    customSubtitleLanguage: 'auto',
    customSubtitleImportedAt: Date.now(),
    customSubtitleActive: true,
    hasSubtitles: true
  });
  subflowUi.selectedTrack = 'custom';
  // Do not report success if a storage layer silently dropped the uploaded
  // track. This also makes failures visible instead of forcing a re-upload.
  if (!savedRecord.customSubtitleSRT || savedRecord.customSubtitleActive !== true) {
    throw new Error('The uploaded SRT could not be saved');
  }
  const persistedRecord = await window.databaseManager.loadFromDatabase(
    'subtitles',
    subflowUi.videoId
  );
  if (!persistedRecord?.customSubtitleSRT || persistedRecord.customSubtitleActive !== true) {
    throw new Error('The uploaded SRT was not persisted on this computer');
  }
  subflowUi.record = persistedRecord;
  notifySubtitleUpdate();
  setNotice(`${file.name} is now active and saved on this computer`, 'success');
}

async function setCustomActive(active) {
  if (active && !subflowUi.record?.customSubtitleSRT) {
    throw new Error('No custom SRT has been uploaded for this video');
  }
  await saveRecord({ customSubtitleActive: Boolean(active) });
  subflowUi.selectedTrack = active
    ? 'custom'
    : subflowUi.tracks.find(track => (
      track.languageCode === subflowUi.record?.languageCode &&
      track.isAutoGenerated === (subflowUi.record?.isAutoGenerated === true)
    )) || subflowUi.tracks[0] || null;
  notifySubtitleUpdate();
  setNotice(active ? 'Custom subtitles are active' : 'Original subtitles are active', 'success');
}

function sourceTrackForPreparation() {
  if (subflowUi.selectedTrack === 'custom' && subflowUi.record?.customSubtitleSRT) {
    return {
      srt: subflowUi.record.customSubtitleSRT,
      languageCode: subflowUi.record.customSubtitleLanguage || 'auto'
    };
  }
  return null;
}

function preferredYoutubeTrack() {
  const storedTrack = subflowUi.record?.languageCode
    ? subflowUi.tracks.find(track => (
      track.languageCode === subflowUi.record.languageCode &&
      track.isAutoGenerated === (subflowUi.record.isAutoGenerated === true)
    ))
    : null;
  return storedTrack || subflowUi.tracks[0] || null;
}

function subtitleTrackLabel(track) {
  const language = track.languageName || track.languageCode || 'Unknown language';
  return `${language} — ${track.isAutoGenerated ? 'YouTube Auto-generated' : 'YouTube Manual'}`;
}

function currentVideoUrl() {
  const videoId = currentVideoId();
  return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : window.location.href;
}

function isGeminiPipelineRunning() {
  return subflowUi.geminiJob?.status === 'running' &&
    subflowUi.geminiController &&
    !subflowUi.geminiController.signal.aborted;
}

function setGeminiJobFailure(error, pipelineController) {
  if (pipelineController?.signal.aborted || error?.name === 'AbortError') {
    subflowUi.geminiJob = {
      ...(subflowUi.geminiJob || {}),
      status: 'cancelled',
      message: 'Gemini stopped by user',
      error: ''
    };
  } else {
    subflowUi.geminiJob = {
      ...(subflowUi.geminiJob || {}),
      status: 'failed',
      message: error?.message || 'Gemini pipeline failed',
      error: error?.message || 'Gemini pipeline failed'
    };
  }
  renderPanel();
}

function updateGeminiJob(progress = {}) {
  const chunkIndex = Number(progress.chunkIndex) || 0;
  const chunkCount = Math.max(1, Number(progress.chunkCount) || 1);
  const pipeline = subflowUi.geminiJob?.pipeline || 'direct';
  let percent = 0;
  if (progress.phase === 'complete') {
    percent = 100;
  } else if (pipeline === 'whisper-gemini' && progress.phase === 'whisper') {
    percent = 5 + (Math.max(0, Math.min(100, Number(progress.progress) || 0)) * 0.25);
  } else if (pipeline === 'whisper-gemini') {
    const stage = Math.max(0, Number(progress.stage) || 0);
    percent = 30 + ((chunkIndex + ((stage + 1) / 9)) / chunkCount) * 70;
  } else if (progress.phase === 'transcription') {
    percent = ((chunkIndex + 0.35) / chunkCount) * 100;
  } else {
    const stage = Math.max(0, Number(progress.stage) || 0);
    percent = ((chunkIndex + 0.35 + ((stage + 1) / 9) * 0.65) / chunkCount) * 100;
  }
  subflowUi.geminiJob = {
    ...(subflowUi.geminiJob || {}),
    status: progress.phase === 'complete' ? 'completed' : 'running',
    progress: Math.max(0, Math.min(100, Math.round(percent))),
    message: progress.message || (progress.phase === 'whisper'
      ? `Whisper + speaker analysis — ${Math.round(Number(progress.progress) || 0)}%`
      : progress.phase === 'transcription'
      ? `Gemini transcription — part ${chunkIndex + 1}/${chunkCount}`
      : `${progress.stageLabel || 'Gemini processing'} — part ${chunkIndex + 1}/${chunkCount}`)
  };
  renderPanel();
}

async function startGeminiPreparation() {
  if (isGeminiPipelineRunning()) {
    throw new Error('A Gemini pipeline is already running for this video');
  }
  subflowUi.geminiKeys = await getGeminiApiKeyEntries();
  if (!subflowUi.geminiKeys.length) {
    throw new Error('No Gemini API keys are saved. Add or import one below.');
  }
  const pipelineKeys = [...subflowUi.geminiKeys];
  const pipelinePrompt = subflowUi.geminiPrompt;
  const settings = await saveGeminiPipelineSettings(subflowUi.geminiSettings);
  subflowUi.geminiSettings = settings;
  const pipelineController = new AbortController();
  subflowUi.geminiController = pipelineController;
  subflowUi.geminiVideoId = subflowUi.videoId;
  subflowUi.geminiJob = {
    pipeline: 'direct',
    status: 'running',
    progress: 0,
    message: 'Starting Gemini transcription'
  };
  renderPanel();
  try {
    let durationSeconds = 0;
    try {
      durationSeconds = await window.getLocalDuration?.(subflowUi.videoId) || 0;
    } catch {
      durationSeconds = 0;
    }
    const result = await runGeminiSrtPipeline({
      videoUrl: currentVideoUrl(),
      durationSeconds,
      settings,
      keys: pipelineKeys,
      promptText: pipelinePrompt,
      signal: pipelineController.signal,
      onProgress: updateGeminiJob
    });
    if (pipelineController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const savedRecord = await saveRecord({
      sentenceSRT: result.srt,
      translationSRT: result.srt,
      wordSRT: null,
      originalSentences: result.cues.map(cue => ({
        startTime: cue.start,
        endTime: cue.end,
        text: cue.text
      })),
      customSubtitleSRT: result.srt,
      customSubtitleOriginalSentences: result.cues.map(cue => ({
        startTime: cue.start,
        endTime: cue.end,
        text: cue.text
      })),
      customSubtitleLabel: 'Gemini Hebrew SRT',
      customSubtitleLanguage: 'he',
      customSubtitleImportedAt: Date.now(),
      customSubtitleActive: true,
      hasSubtitles: true,
      source: 'gemini-pipeline',
      languageCode: 'he',
      languageName: 'Hebrew',
      isAutoGenerated: false,
      geminiPipelineSettings: settings,
      geminiPipelineUpdatedAt: Date.now()
    });
    if (!savedRecord?.customSubtitleSRT || savedRecord.customSubtitleActive !== true) {
      throw new Error('Gemini finished, but the Hebrew SRT could not be saved');
    }
    subflowUi.geminiJob = {
      pipeline: 'direct',
      status: 'completed',
      progress: 100,
      message: `Hebrew SRT ready (${result.chunks.length} part${result.chunks.length === 1 ? '' : 's'})`,
      workerKeys: result.workerKeys
    };
    notifySubtitleUpdate();
    setNotice('Gemini Hebrew SRT is ready and now active', 'success');
  } catch (error) {
    setGeminiJobFailure(error, pipelineController);
    if (!(pipelineController.signal.aborted || error?.name === 'AbortError')) throw error;
  } finally {
    if (subflowUi.geminiController === pipelineController) {
      subflowUi.geminiController = null;
    }
  }
}

async function stopGeminiPipeline() {
  const job = subflowUi.geminiJob;
  if (!job || job.status !== 'running') return;

  if (job.subflowJobId) {
    fetch(`${SUBFLOW_LOCAL_API}/v1/subflow/jobs/${job.subflowJobId}`, { method: 'DELETE' })
      .catch(() => {});
  }
  subflowUi.geminiController?.abort();
  subflowUi.geminiController = null;
  subflowUi.geminiJob = {
    ...job,
    status: 'cancelled',
    message: 'Gemini stopped by user',
    error: ''
  };
  renderPanel();
}

function waitWithSignal(delay, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, delay);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function waitForSubflowJob(jobId, signal) {
  while (true) {
    const { data } = await apiFetch(`/v1/subflow/jobs/${jobId}`, { signal });
    const job = data?.job;
    if (!job) throw new Error('The local Subflow service returned no job status');
    subflowUi.geminiJob = {
      ...(subflowUi.geminiJob || {}),
      subflowJobId: jobId,
      subflowJob: job
    };
    updateGeminiJob({
      phase: 'whisper',
      progress: job.progress,
      message: job.message || job.stage || 'Whisper preparation'
    });
    if (SUBFLOW_TERMINAL_STATES.has(job.status)) return job;
    await waitWithSignal(1800, signal);
  }
}

async function fetchSubflowOutputText(output, signal) {
  if (!output?.url) return '';
  const response = await fetch(`${SUBFLOW_LOCAL_API}${output.url}`, { signal });
  if (!response.ok) {
    throw new Error(`Could not download Subflow output (${response.status})`);
  }
  return response.text();
}

async function startWhisperGeminiPreparation() {
  if (isGeminiPipelineRunning()) {
    throw new Error('A Gemini pipeline is already running for this video');
  }
  subflowUi.geminiKeys = await getGeminiApiKeyEntries();
  if (!subflowUi.geminiKeys.length) {
    throw new Error('No Gemini API keys are saved. Add or import one below.');
  }
  const pipelineKeys = [...subflowUi.geminiKeys];
  const pipelinePrompt = subflowUi.geminiPrompt;

  const geminiSettings = await saveGeminiPipelineSettings(subflowUi.geminiSettings);
  subflowUi.geminiSettings = geminiSettings;
  const whisperSettings = normalizeSubflowSettings({
    ...subflowUi.transcriptionSettings,
    targetLanguage: 'he'
  });
  const pipelineController = new AbortController();
  subflowUi.geminiController = pipelineController;
  subflowUi.geminiVideoId = subflowUi.videoId;
  subflowUi.geminiJob = {
    pipeline: 'whisper-gemini',
    status: 'running',
    progress: 0,
    message: 'Starting Whisper transcription and speaker analysis'
  };
  renderPanel();

  try {
    const { data } = await apiFetch('/v1/subflow/jobs', {
      method: 'POST',
      body: JSON.stringify({
        videoId: subflowUi.videoId,
        sourceMode: 'media',
        sourceLanguage: whisperSettings.sourceLanguage,
        settings: whisperSettings
      }),
      signal: pipelineController.signal
    });
    const subflowJobId = data?.job?.id;
    if (!subflowJobId) throw new Error('Subflow did not return a preparation job');
    subflowUi.geminiJob.subflowJobId = subflowJobId;
    const preparedJob = await waitForSubflowJob(subflowJobId, pipelineController.signal);
    if (preparedJob.status !== 'prepared' && preparedJob.status !== 'completed') {
      throw new Error(preparedJob.error || preparedJob.message || 'Whisper preparation failed');
    }

    const sourceOutput = (preparedJob.outputs || []).find(output => output.filename === 'source.srt') ||
      (preparedJob.outputs || []).find(output => /\.srt$/i.test(output.filename || ''));
    if (!sourceOutput) throw new Error('Subflow finished without a source SRT output');
    const sourceSrt = await fetchSubflowOutputText(sourceOutput, pipelineController.signal);
    const metadataOutput = (preparedJob.outputs || []).find(output => output.filename === 'source.json');
    const speakerContext = metadataOutput
      ? await fetchSubflowOutputText(metadataOutput, pipelineController.signal)
      : '';

    updateGeminiJob({
      phase: 'pipeline',
      stage: 0,
      stageLabel: 'Starting Gemini translation',
      chunkIndex: 0,
      chunkCount: 1,
      message: 'Whisper SRT ready — sending it to Gemini'
    });

    let durationSeconds = 0;
    try {
      durationSeconds = await window.getLocalDuration?.(subflowUi.videoId) || 0;
    } catch {
      durationSeconds = 0;
    }
    const result = await runGeminiWhisperTranslationPipeline({
      sourceSrt,
      speakerContext,
      // The hybrid mode sends Whisper's transcript and speaker metadata to
      // Gemini; it does not need to attach the YouTube URL again.
      videoUrl: '',
      durationSeconds,
      settings: geminiSettings,
      keys: pipelineKeys,
      promptText: pipelinePrompt,
      signal: pipelineController.signal,
      onProgress: updateGeminiJob
    });
    if (pipelineController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const savedRecord = await saveRecord({
      sentenceSRT: result.srt,
      translationSRT: result.srt,
      wordSRT: null,
      originalSentences: result.cues.map(cue => ({
        startTime: cue.start,
        endTime: cue.end,
        text: cue.text
      })),
      customSubtitleSRT: result.srt,
      customSubtitleOriginalSentences: result.cues.map(cue => ({
        startTime: cue.start,
        endTime: cue.end,
        text: cue.text
      })),
      customSubtitleLabel: 'Whisper + Gemini Hebrew SRT',
      customSubtitleLanguage: 'he',
      customSubtitleImportedAt: Date.now(),
      customSubtitleActive: true,
      hasSubtitles: true,
      source: 'whisper-gemini-pipeline',
      languageCode: 'he',
      languageName: 'Hebrew',
      isAutoGenerated: false,
      whisperTranscriptSRT: sourceSrt,
      whisperSpeakerMetadata: speakerContext,
      whisperSettings,
      geminiPipelineSettings: geminiSettings,
      geminiPipelineUpdatedAt: Date.now()
    });
    if (!savedRecord?.customSubtitleSRT || savedRecord.customSubtitleActive !== true) {
      throw new Error('Whisper + Gemini finished, but the Hebrew SRT could not be saved');
    }
    subflowUi.geminiJob = {
      pipeline: 'whisper-gemini',
      status: 'completed',
      progress: 100,
      message: `Hebrew SRT ready (${result.chunks.length} part${result.chunks.length === 1 ? '' : 's'})`,
      workerKeys: result.workerKeys,
      subflowJobId
    };
    notifySubtitleUpdate();
    setNotice('Whisper + Gemini Hebrew SRT is ready and now active', 'success');
  } catch (error) {
    setGeminiJobFailure(error, pipelineController);
    if (!(pipelineController.signal.aborted || error?.name === 'AbortError')) throw error;
  } finally {
    if (subflowUi.geminiController === pipelineController) {
      subflowUi.geminiController = null;
    }
  }
}

async function startSubflowPreparation() {
  if (subflowUi.sourceMode === 'gemini') {
    return startGeminiPreparation();
  }
  if (subflowUi.sourceMode === 'whisper-gemini') {
    return startWhisperGeminiPreparation();
  }
  const settings = normalizeSubflowSettings(subflowUi.transcriptionSettings);
  let subtitleSrt = '';
  let sourceLanguage = settings.sourceLanguage;
  if (subflowUi.sourceMode === 'subtitles') {
    const custom = sourceTrackForPreparation();
    if (custom) {
      subtitleSrt = custom.srt;
      sourceLanguage = custom.languageCode;
    } else {
      const track = subflowUi.tracks.find(item => item === subflowUi.selectedTrack) || subflowUi.tracks[0];
      const downloaded = await fetchTrack(track);
      subtitleSrt = downloaded.srt;
      sourceLanguage = downloaded.languageCode;
      subflowUi.selectedTrack = track;
    }
  }

  settings.sourceLanguage = sourceLanguage;

  const { data } = await apiFetch('/v1/subflow/jobs', {
    method: 'POST',
    body: JSON.stringify({
      videoId: subflowUi.videoId,
      sourceMode: subflowUi.sourceMode,
      sourceLanguage,
      subtitleSrt,
      settings
    })
  });
  subflowUi.job = data.job;
  await saveRecord({
    subflowJobId: data.job.id,
    subflowJobUpdatedAt: Date.now()
  });
  setNotice('Subflow preparation started locally', 'success');
  scheduleJobPoll(250);
}

async function pollJob() {
  clearPollTimer();
  if (!subflowUi.panel?.isConnected || !subflowUi.job?.id) return;
  try {
    const { data } = await apiFetch(`/v1/subflow/jobs/${subflowUi.job.id}`);
    subflowUi.job = data.job;
    renderPanel();
    if (!SUBFLOW_TERMINAL_STATES.has(subflowUi.job.status)) {
      scheduleJobPoll(1800);
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    setNotice(error.message, 'error');
    scheduleJobPoll(3500);
  }
}

function scheduleJobPoll(delay = 1800) {
  clearPollTimer();
  if (!subflowUi.panel?.isConnected || !subflowUi.job?.id) return;
  if (SUBFLOW_TERMINAL_STATES.has(subflowUi.job.status)) return;
  subflowUi.pollTimer = setTimeout(pollJob, delay);
}

async function restoreJob() {
  const jobId = subflowUi.record?.subflowJobId;
  if (!jobId) return;
  try {
    const { data } = await apiFetch(`/v1/subflow/jobs/${jobId}`);
    subflowUi.job = data.job;
    scheduleJobPoll();
  } catch (error) {
    if (error.name !== 'AbortError' && !/not found/i.test(error.message)) {
      subflowUi.notice = error.message;
      subflowUi.noticeType = 'error';
    }
  }
}

async function downloadSubflowOutput(output) {
  const { response } = await apiFetch(output.url);
  const blob = await response.blob();
  downloadBlob(blob, `subflow-${subflowUi.videoId}-${safeDownloadName(output.filename, 'result.txt')}`);
}

async function runAction(action, { allowWhileBusy = false } = {}) {
  if (subflowUi.busy && !allowWhileBusy) return;
  subflowUi.busy = true;
  renderPanel();
  try {
    await action();
  } catch (error) {
    if (error.name !== 'AbortError') setNotice(error.message || 'The action failed', 'error');
  } finally {
    subflowUi.busy = false;
    renderPanel();
  }
}

function actionButton(label, onClick, options = {}) {
  const button = createElement('button', options.primary ? 'yc-subflow-action primary' : 'yc-subflow-action', label);
  button.type = 'button';
  button.disabled = (!options.allowWhileBusy && subflowUi.busy) || options.disabled === true;
  button.addEventListener('click', onClick);
  return button;
}

function isSubflowTextEntryTarget(target) {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable === true;
}

function stopSubflowPlayerShortcuts(event) {
  if (!isSubflowTextEntryTarget(event.target)) return;
  // Keep typing, selecting and deleting working, but prevent YouTube from
  // interpreting letters/space/arrows as player shortcuts.
  event.stopPropagation();
}

function focusSubflowTarget() {
  const targetClass = subflowUi.focusTarget;
  if (!targetClass || !subflowUi.panel?.isConnected) return;
  subflowUi.focusTarget = null;
  requestAnimationFrame(() => {
    const target = subflowUi.panel?.querySelector(`.${targetClass}`);
    if (!target || subflowUi.busy) return;
    target.focus({ preventScroll: true });
  });
}

function settingSelect(labelText, settingKey, options, description = '', disabled = false) {
  const field = createElement('label', 'yc-subflow-setting');
  const label = createElement('span', '', labelText);
  const select = createElement('select', 'yc-subflow-select');
  options.forEach(optionData => {
    const option = createElement('option', '', optionData.label);
    option.value = optionData.value;
    select.appendChild(option);
  });
  select.value = subflowUi.transcriptionSettings[settingKey];
  select.disabled = subflowUi.busy || disabled;
  select.addEventListener('change', () => updateSubflowSetting(settingKey, select.value));
  field.append(label, select);
  if (description) field.appendChild(createElement('small', '', description));
  return field;
}

function settingToggle(settingKey, labelText, description = '', disabled = false) {
  const label = createElement('label', 'yc-subflow-setting-check');
  const input = createElement('input');
  input.type = 'checkbox';
  input.checked = subflowUi.transcriptionSettings[settingKey] === true;
  input.disabled = subflowUi.busy || disabled;
  input.addEventListener('change', () => updateSubflowSetting(settingKey, input.checked));
  const copy = createElement('span');
  copy.appendChild(createElement('strong', '', labelText));
  if (description) copy.appendChild(createElement('small', '', description));
  label.append(input, copy);
  return label;
}

function renderAdvancedSettings(section, { includeOutputLanguage = true } = {}) {
  const advanced = createElement('div', 'yc-subflow-advanced-settings');
  const toggle = createElement('button', 'yc-subflow-advanced-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(subflowUi.advancedSettingsOpen));
  toggle.appendChild(createElement('strong', '', 'Advanced transcription settings'));
  toggle.appendChild(createElement('span', '', subflowUi.advancedSettingsOpen ? 'Hide ▲' : 'Show ▼'));
  toggle.addEventListener('click', () => {
    subflowUi.advancedSettingsOpen = !subflowUi.advancedSettingsOpen;
    renderPanel();
  });
  advanced.appendChild(toggle);

  if (subflowUi.advancedSettingsOpen) {
    const settingsBody = createElement('div', 'yc-subflow-advanced-body');
    settingsBody.appendChild(settingSelect(
      'Whisper model',
      'whisperModel',
      SUBFLOW_WHISPER_MODELS,
      'Larger models are more accurate but need more time and memory.'
    ));
    settingsBody.appendChild(settingSelect(
      'Audio language',
      'sourceLanguage',
      SUBFLOW_LANGUAGE_OPTIONS,
      'Use Auto-detect unless you know the spoken language.'
    ));
    if (includeOutputLanguage) {
      settingsBody.appendChild(settingSelect(
        'Output / translation language',
        'targetLanguage',
        SUBFLOW_TARGET_LANGUAGE_OPTIONS
      ));
    }
    settingsBody.appendChild(settingSelect(
      'Expected speakers',
      'speakerCount',
      SUBFLOW_SPEAKER_OPTIONS,
      'Auto-detect is recommended when the number is unknown.',
      !subflowUi.transcriptionSettings.diarization
    ));
    settingsBody.appendChild(settingToggle(
      'diarization',
      'Identify different speakers',
      'Splits the transcript into speaker labels.'
    ));
    settingsBody.appendChild(settingToggle(
      'genderDetection',
      'Detect speaker gender',
      'Attempts to label speakers as male or female.',
      !subflowUi.transcriptionSettings.diarization
    ));
    settingsBody.appendChild(settingToggle(
      'professionalReview',
      'Professional review package',
      'Requests the additional review output when supported by Subflow.'
    ));
    advanced.appendChild(settingsBody);
  }
  section.appendChild(advanced);
}

function updateGeminiSetting(key, value) {
  subflowUi.geminiSettings = {
    ...subflowUi.geminiSettings,
    [key]: value
  };
  saveGeminiPipelineSettings(subflowUi.geminiSettings).then(settings => {
    subflowUi.geminiSettings = settings;
  }).catch(error => {
    console.warn('[SubflowButton] Failed to save Gemini pipeline settings:', error);
  });
  renderPanel();
}

function geminiSettingSelect(section, labelText, settingKey, options, description = '', disabled = false) {
  const field = createElement('label', 'yc-subflow-gemini-setting');
  field.appendChild(createElement('span', '', labelText));
  const select = createElement('select', 'yc-subflow-select');
  options.forEach(optionData => {
    const option = createElement('option', '', optionData.label);
    option.value = optionData.value;
    select.appendChild(option);
  });
  select.value = String(subflowUi.geminiSettings[settingKey]);
  select.disabled = subflowUi.busy || disabled;
  select.addEventListener('change', () => updateGeminiSetting(settingKey, select.value));
  field.appendChild(select);
  if (description) field.appendChild(createElement('small', '', description));
  section.appendChild(field);
}

function renderGeminiApiManager(section) {
  const manager = createElement('div', 'yc-subflow-gemini-manager');
  const header = createElement('div', 'yc-subflow-gemini-manager-header');
  header.appendChild(createElement('strong', '', `Gemini API keys (${subflowUi.geminiKeys.length})`));
  const manageButton = createElement('button', 'yc-subflow-small-button', subflowUi.geminiManagerOpen ? 'Hide manager' : 'Manage keys');
  manageButton.type = 'button';
  manageButton.disabled = subflowUi.busy;
  manageButton.addEventListener('click', () => {
    subflowUi.geminiManagerOpen = !subflowUi.geminiManagerOpen;
    subflowUi.focusTarget = subflowUi.geminiManagerOpen
      ? 'yc-subflow-gemini-name-input'
      : null;
    renderPanel();
  });
  header.appendChild(manageButton);
  manager.appendChild(header);

  const picker = createElement('label', 'yc-subflow-gemini-setting');
  picker.appendChild(createElement('span', '', 'Starting API key'));
  const pickerSelect = createElement('select', 'yc-subflow-select');
  subflowUi.geminiKeys.forEach(entry => {
    const option = createElement('option', '', `${entry.name} — ${maskApiKey(entry.key)}`);
    option.value = entry.id;
    pickerSelect.appendChild(option);
  });
  if (subflowUi.geminiKeys.length) {
    if (!subflowUi.geminiKeys.some(entry => entry.id === subflowUi.geminiSettings.selectedApiKeyId)) {
      subflowUi.geminiSettings.selectedApiKeyId = subflowUi.geminiKeys[0].id;
    }
    pickerSelect.value = subflowUi.geminiSettings.selectedApiKeyId;
  }
  pickerSelect.disabled = subflowUi.busy || !subflowUi.geminiKeys.length;
  pickerSelect.addEventListener('change', () => updateGeminiSetting('selectedApiKeyId', pickerSelect.value));
  picker.appendChild(pickerSelect);
  picker.appendChild(createElement('small', '', 'Automatic mode rotates through the available active keys.'));
  manager.appendChild(picker);

  if (subflowUi.geminiManagerOpen) {
    const keyList = createElement('div', 'yc-subflow-gemini-key-list');
    if (!subflowUi.geminiKeys.length) {
      keyList.appendChild(createElement('p', 'yc-subflow-empty', 'No Gemini API keys saved yet.'));
    }
    subflowUi.geminiKeys.forEach(entry => {
      const row = createElement('div', 'yc-subflow-gemini-key-row');
      const details = createElement('div', 'yc-subflow-gemini-key-details');
      details.appendChild(createElement('strong', '', entry.name));
      details.appendChild(createElement('span', '', `${maskApiKey(entry.key)} · ${entry.status || 'active'}`));
      if (entry.lastError) details.appendChild(createElement('small', '', entry.lastError));
      row.appendChild(details);
      const actions = createElement('div', 'yc-subflow-row-actions');
      const edit = createElement('button', 'yc-subflow-small-button', 'Edit');
      edit.type = 'button';
      edit.disabled = subflowUi.busy;
      edit.addEventListener('click', () => {
        subflowUi.geminiKeyEditor = { id: entry.id, name: entry.name, key: entry.key };
        renderPanel();
      });
      const remove = createElement('button', 'yc-subflow-small-button danger', 'Remove');
      remove.type = 'button';
      remove.disabled = subflowUi.busy;
      remove.addEventListener('click', () => {
        if (!window.confirm(`Remove ${entry.name}?`)) return;
        runAction(async () => {
          await removeGeminiApiKey(entry.id);
          subflowUi.geminiKeys = await getGeminiApiKeyEntries();
          if (!subflowUi.geminiKeys.some(item => item.id === subflowUi.geminiSettings.selectedApiKeyId)) {
            subflowUi.geminiSettings = await saveGeminiPipelineSettings({
              ...subflowUi.geminiSettings,
              selectedApiKeyId: subflowUi.geminiKeys[0]?.id || 'default'
            });
          }
          setNotice('Gemini API key removed', 'success');
        });
      });
      actions.append(edit, remove);
      row.appendChild(actions);
      keyList.appendChild(row);
    });
    manager.appendChild(keyList);

    const editor = createElement('div', 'yc-subflow-gemini-key-editor');
    const editorTitle = subflowUi.geminiKeyEditor ? 'Edit API key' : 'Add API key';
    editor.appendChild(createElement('strong', '', editorTitle));
    const nameInput = createElement('input', 'yc-subflow-text-input');
    nameInput.classList.add('yc-subflow-gemini-name-input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Name (for example: Work)';
    nameInput.maxLength = 40;
    nameInput.value = subflowUi.geminiKeyEditor?.name || '';
    const keyInput = createElement('input', 'yc-subflow-text-input');
    keyInput.type = 'password';
    keyInput.placeholder = 'Paste Gemini API key';
    keyInput.autocomplete = 'off';
    keyInput.value = subflowUi.geminiKeyEditor?.key || '';
    const editorActions = createElement('div', 'yc-subflow-row-actions');
    const saveButton = createElement('button', 'yc-subflow-small-button selected', 'Save key');
    saveButton.type = 'button';
    saveButton.addEventListener('click', () => {
      const name = nameInput.value;
      const key = keyInput.value;
      runAction(async () => {
        await upsertGeminiApiKey({ id: subflowUi.geminiKeyEditor?.id, name, key });
        subflowUi.geminiKeys = await getGeminiApiKeyEntries();
        subflowUi.geminiKeyEditor = null;
        setNotice('Gemini API key saved locally', 'success');
      });
    });
    const cancelButton = createElement('button', 'yc-subflow-small-button', 'Cancel');
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', () => {
      subflowUi.geminiKeyEditor = null;
      renderPanel();
    });
    editorActions.append(saveButton, cancelButton);
    editor.append(nameInput, keyInput, editorActions);
    manager.appendChild(editor);

    const importLabel = createElement('label', 'yc-subflow-upload compact');
    importLabel.appendChild(createElement('span', '', 'Import API list (.txt)'));
    importLabel.appendChild(createElement('small', '', 'Reads keys from a text file and stores them locally.'));
    const importInput = createElement('input');
    importInput.type = 'file';
    importInput.accept = '.txt,text/plain';
    importInput.disabled = subflowUi.busy;
    importInput.addEventListener('change', () => {
      const file = importInput.files?.[0];
      if (!file) return;
      runAction(async () => {
        const result = await importGeminiApiKeys(await file.text());
        subflowUi.geminiKeys = await getGeminiApiKeyEntries();
        setNotice(`Imported ${result.imported.length} API keys${result.skipped ? `, skipped ${result.skipped} duplicates` : ''}`, 'success');
      });
    });
    importLabel.appendChild(importInput);
    manager.appendChild(importLabel);
  }
  section.appendChild(manager);
}

function renderGeminiPromptManager(section) {
  const promptBox = createElement('div', 'yc-subflow-gemini-prompt');
  const title = createElement('div', 'yc-subflow-gemini-manager-header');
  title.appendChild(createElement('strong', '', 'Translation prompt'));
  title.appendChild(createElement('span', '', subflowUi.geminiPrompt ? 'Full 0–8 prompt loaded' : 'Built-in fallback'));
  promptBox.appendChild(title);
  promptBox.appendChild(createElement(
    'small',
    '',
    subflowUi.geminiPrompt
      ? 'The imported ALL_STAGES_0_TO_8 prompt will be used stage by stage.'
      : 'Import ALL_STAGES_0_TO_8_AI_DECIDES_MERGING_V2_HE.txt to use your complete prompt.'
  ));
  const importLabel = createElement('label', 'yc-subflow-upload compact');
  importLabel.appendChild(createElement('span', '', subflowUi.geminiPrompt ? 'Replace prompt file' : 'Import full 0–8 prompt (.txt)'));
  const input = createElement('input');
  input.type = 'file';
  input.accept = '.txt,text/plain';
  input.disabled = subflowUi.busy;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    runAction(async () => {
      subflowUi.geminiPrompt = await saveGeminiPipelinePrompt(await file.text());
      setNotice('Full translation prompt saved locally', 'success');
    });
  });
  importLabel.appendChild(input);
  promptBox.appendChild(importLabel);
  section.appendChild(promptBox);
}

function renderGeminiSettings(section) {
  const settingsGrid = createElement('div', 'yc-subflow-gemini-settings-grid');
  geminiSettingSelect(settingsGrid, 'Gemini model', 'model', GEMINI_PIPELINE_MODELS);
  geminiSettingSelect(settingsGrid, 'Audio language', 'sourceLanguage', GEMINI_SOURCE_LANGUAGES, 'Auto-detect is recommended.');
  geminiSettingSelect(settingsGrid, 'API allocation', 'apiStrategy', [
    { value: 'auto', label: 'Automatic — use all active keys' },
    { value: 'manual', label: 'Manual — choose number of keys' }
  ]);
  geminiSettingSelect(settingsGrid, 'Part length', 'chunkMinutes', GEMINI_CHUNK_MINUTES.map(value => ({
    value: String(value),
    label: `${value} minutes per part`
  })), 'Long videos are divided by time range.');
  if (subflowUi.geminiSettings.apiStrategy === 'manual') {
    geminiSettingSelect(settingsGrid, 'Number of APIs', 'apiCount', Array.from({ length: Math.max(1, subflowUi.geminiKeys.length) }, (_, index) => ({
      value: String(index + 1),
      label: `${index + 1} API${index ? 's' : ''}`
    })), '', !subflowUi.geminiKeys.length);
  }
  section.appendChild(settingsGrid);
  renderGeminiApiManager(section);
  renderGeminiPromptManager(section);
}

function renderGeminiJobCard(section) {
  if (!subflowUi.geminiJob) return;
  const isWhisperPipeline = subflowUi.geminiJob.pipeline === 'whisper-gemini';
  const job = createElement('div', `yc-subflow-job yc-subflow-gemini-job ${subflowUi.geminiJob.status}`);
  const jobHeader = createElement('div', 'yc-subflow-job-header');
  jobHeader.appendChild(createElement(
    'strong',
    '',
    subflowUi.geminiJob.status === 'completed'
      ? (isWhisperPipeline ? 'Whisper + Gemini SRT ready' : 'Gemini SRT ready')
      : (isWhisperPipeline ? 'Whisper + Gemini pipeline' : 'Gemini pipeline')
  ));
  jobHeader.appendChild(createElement('span', '', `${Math.max(0, Math.min(100, Number(subflowUi.geminiJob.progress) || 0))}%`));
  job.appendChild(jobHeader);
  const progress = createElement('div', 'yc-subflow-progress');
  const progressBar = createElement('i');
  progressBar.style.width = `${Math.max(0, Math.min(100, Number(subflowUi.geminiJob.progress) || 0))}%`;
  progress.appendChild(progressBar);
  job.appendChild(progress);
  job.appendChild(createElement('p', '', subflowUi.geminiJob.message || ''));
  if (subflowUi.geminiJob.error) job.appendChild(createElement('p', 'yc-subflow-job-error', subflowUi.geminiJob.error));
  if (subflowUi.geminiJob.status === 'running') {
    job.appendChild(actionButton(
      'Stop Gemini',
      () => runAction(stopGeminiPipeline, { allowWhileBusy: true }),
      { allowWhileBusy: true }
    ));
  }
  section.appendChild(job);
}

function renderGeminiPreparation(body) {
  const section = createElement('section', 'yc-subflow-section yc-subflow-gemini-section');
  const heading = createElement('div', 'yc-subflow-section-heading');
  heading.appendChild(createElement('h3', '', 'Google Gemini SRT pipeline'));
  heading.appendChild(createElement('span', 'yc-subflow-safe-badge', 'Hebrew output'));
  section.appendChild(heading);
  section.appendChild(createElement(
    'p',
    'yc-subflow-help',
    'Gemini transcribes the public YouTube video, runs the 0–8 translation stages, and saves the final Hebrew SRT. Closing this window does not stop the pipeline.'
  ));
  renderGeminiSettings(section);

  const startButton = actionButton(
    'Start Gemini transcription + translation',
    () => runAction(startGeminiPreparation),
    { primary: true, disabled: !subflowUi.geminiKeys.length || isGeminiPipelineRunning() }
  );
  section.appendChild(startButton);
  renderGeminiJobCard(section);
  body.appendChild(section);
}

function renderWhisperGeminiPreparation(body) {
  const section = createElement('section', 'yc-subflow-section yc-subflow-gemini-section');
  const heading = createElement('div', 'yc-subflow-section-heading');
  heading.appendChild(createElement('h3', '', 'Whisper + Gemini SRT pipeline'));
  heading.appendChild(createElement('span', 'yc-subflow-safe-badge', 'Hebrew output'));
  section.appendChild(heading);
  section.appendChild(createElement(
    'p',
    'yc-subflow-help',
    'Whisper downloads and transcribes the audio locally through Subflow, detects speakers and gender, then Gemini runs the 0–8 Hebrew translation stages. Closing this window does not stop the pipeline.'
  ));
  renderAdvancedSettings(section, { includeOutputLanguage: false });
  renderGeminiSettings(section);
  section.appendChild(actionButton(
    'Start Whisper + Gemini translation',
    () => runAction(startWhisperGeminiPreparation),
    { primary: true, disabled: !subflowUi.geminiKeys.length || isGeminiPipelineRunning() }
  ));
  renderGeminiJobCard(section);
  body.appendChild(section);
}

function renderCaptionSources(body) {
  const section = createElement('section', 'yc-subflow-section');
  section.appendChild(createElement('h3', '', 'Video subtitles'));

  if (!subflowUi.tracks.length) {
    section.appendChild(createElement('p', 'yc-subflow-empty', 'No YouTube subtitle tracks were found. You can still upload an SRT or transcribe the audio.'));
  }

  for (const track of subflowUi.tracks) {
    const row = createElement('div', 'yc-subflow-source-row');
    const details = createElement('div', 'yc-subflow-source-details');
    details.appendChild(createElement('strong', '', track.languageName || track.languageCode));
    details.appendChild(createElement('span', '', track.isAutoGenerated ? 'YouTube Auto-generated' : 'YouTube Manual'));
    row.appendChild(details);
    const actions = createElement('div', 'yc-subflow-row-actions');
    actions.appendChild(actionButton('Use', () => runAction(() => useYoutubeTrack(track))));
    actions.appendChild(actionButton('Download', () => runAction(() => downloadYoutubeTrack(track))));
    row.appendChild(actions);
    section.appendChild(row);
  }

  if (subflowUi.record?.customSubtitleSRT) {
    const row = createElement('div', 'yc-subflow-source-row custom');
    const details = createElement('div', 'yc-subflow-source-details');
    details.appendChild(createElement('strong', '', subflowUi.record.customSubtitleLabel || 'Custom SRT'));
    details.appendChild(createElement('span', '', subflowUi.record.customSubtitleActive ? 'Custom track active' : 'Saved on this computer'));
    row.appendChild(details);
    const actions = createElement('div', 'yc-subflow-row-actions');
    if (!subflowUi.record.customSubtitleActive) {
      actions.appendChild(actionButton('Use', () => runAction(() => setCustomActive(true))));
    } else {
      actions.appendChild(actionButton('Use original', () => runAction(() => setCustomActive(false))));
    }
    actions.appendChild(actionButton('Download', () => {
      downloadText(
        subflowUi.record.customSubtitleSRT,
        safeDownloadName(subflowUi.record.customSubtitleLabel, `${subflowUi.videoId}-custom.srt`)
      );
    }));
    row.appendChild(actions);
    section.appendChild(row);
  }

  const upload = createElement('label', 'yc-subflow-upload');
  upload.appendChild(createElement('span', '', 'Upload translated SRT'));
  upload.appendChild(createElement('small', '', 'It becomes the active subtitle track and is stored locally.'));
  const input = createElement('input');
  input.type = 'file';
  input.accept = '.srt,application/x-subrip,text/plain';
  input.disabled = subflowUi.busy;
  input.addEventListener('change', () => runAction(() => importCustomSrt(input.files?.[0])));
  upload.appendChild(input);
  section.appendChild(upload);
  body.appendChild(section);
}

function renderPreparation(body) {
  const section = createElement('section', 'yc-subflow-section');
  const heading = createElement('div', 'yc-subflow-section-heading');
  heading.appendChild(createElement('h3', '', 'Prepare with Subflow'));
  heading.appendChild(createElement('span', 'yc-subflow-safe-badge', 'Stops before AI'));
  section.appendChild(heading);

  const modes = createElement('div', 'yc-subflow-segments');
  const subtitleMode = actionButton('Source subtitles + audio', () => {
    subflowUi.sourceMode = 'subtitles';
    renderPanel();
  });
  const mediaMode = actionButton('Transcribe movie / audio', () => {
    subflowUi.sourceMode = 'media';
    subflowUi.advancedSettingsOpen = true;
    renderPanel();
  });
  const geminiMode = actionButton('Google Gemini SRT', () => {
    subflowUi.sourceMode = 'gemini';
    subflowUi.geminiManagerOpen = false;
    subflowUi.focusTarget = null;
    renderPanel();
  });
  const whisperGeminiMode = actionButton('Whisper + Gemini', () => {
    subflowUi.sourceMode = 'whisper-gemini';
    subflowUi.advancedSettingsOpen = true;
    subflowUi.geminiManagerOpen = false;
    subflowUi.focusTarget = null;
    renderPanel();
  });
  subtitleMode.classList.toggle('selected', subflowUi.sourceMode === 'subtitles');
  mediaMode.classList.toggle('selected', subflowUi.sourceMode === 'media');
  geminiMode.classList.toggle('selected', subflowUi.sourceMode === 'gemini');
  whisperGeminiMode.classList.toggle('selected', subflowUi.sourceMode === 'whisper-gemini');
  modes.append(subtitleMode, mediaMode, geminiMode, whisperGeminiMode);
  section.appendChild(modes);

  if (subflowUi.sourceMode === 'gemini') {
    body.appendChild(section);
    renderGeminiPreparation(body);
    return;
  }
  if (subflowUi.sourceMode === 'whisper-gemini') {
    body.appendChild(section);
    renderWhisperGeminiPreparation(body);
    return;
  }

  if (subflowUi.sourceMode === 'subtitles') {
    section.appendChild(createElement('label', 'yc-subflow-source-label', 'Subtitle source for this SRT'));
    const select = createElement('select', 'yc-subflow-select');
    if (subflowUi.record?.customSubtitleSRT) {
      const option = createElement('option', '', `Custom SRT — ${subflowUi.record.customSubtitleLabel || 'uploaded file'}`);
      option.value = 'custom';
      select.appendChild(option);
    }
    subflowUi.tracks.forEach((track, index) => {
      const option = createElement('option', '', subtitleTrackLabel(track));
      option.value = `track-${index}`;
      select.appendChild(option);
    });
    const selectedValue = subflowUi.selectedTrack === 'custom'
      ? 'custom'
      : `track-${Math.max(0, subflowUi.tracks.indexOf(subflowUi.selectedTrack))}`;
    select.value = selectedValue;
    select.setAttribute('aria-label', 'Subtitle source for SRT');
    select.disabled = subflowUi.busy || !select.options.length;
    select.addEventListener('change', () => {
      subflowUi.selectedTrack = select.value === 'custom'
        ? 'custom'
        : subflowUi.tracks[Number(select.value.replace('track-', ''))] || null;
    });
    section.appendChild(select);
  } else {
    renderAdvancedSettings(section);
  }

  section.appendChild(createElement(
    'p',
    'yc-subflow-help',
    subflowUi.sourceMode === 'subtitles'
      ? 'Subflow uses the selected subtitles and the video soundtrack for speaker analysis.'
      : 'Subflow downloads the soundtrack and creates a fresh transcription locally.'
  ));
  const hasSubtitleSource = Boolean(subflowUi.record?.customSubtitleSRT || subflowUi.tracks.length);
  section.appendChild(actionButton(
    'Prepare in Subflow',
    () => runAction(startSubflowPreparation),
    { primary: true, disabled: subflowUi.sourceMode === 'subtitles' && !hasSubtitleSource }
  ));

  if (subflowUi.job) {
    const job = createElement('div', 'yc-subflow-job');
    const jobHeader = createElement('div', 'yc-subflow-job-header');
    jobHeader.appendChild(createElement('strong', '', subflowUi.job.status === 'prepared' ? 'Ready for manual AI translation' : 'Latest preparation'));
    jobHeader.appendChild(createElement('span', '', `${Math.max(0, Math.min(100, Number(subflowUi.job.progress) || 0))}%`));
    job.appendChild(jobHeader);
    const progress = createElement('div', 'yc-subflow-progress');
    const progressBar = createElement('i');
    progressBar.style.width = `${Math.max(0, Math.min(100, Number(subflowUi.job.progress) || 0))}%`;
    progress.appendChild(progressBar);
    job.appendChild(progress);
    job.appendChild(createElement('p', '', subflowUi.job.message || subflowUi.job.stage || subflowUi.job.status));
    if (subflowUi.job.error && SUBFLOW_TERMINAL_STATES.has(subflowUi.job.status)) {
      job.appendChild(createElement('p', 'yc-subflow-job-error', subflowUi.job.error));
    }
    if (subflowUi.job.outputs?.length) {
      const outputs = createElement('div', 'yc-subflow-outputs');
      for (const output of subflowUi.job.outputs) {
        outputs.appendChild(actionButton(
          output.label || output.filename,
          () => runAction(() => downloadSubflowOutput(output))
        ));
      }
      job.appendChild(outputs);
    }
    section.appendChild(job);
  }
  body.appendChild(section);
}

function renderPanel() {
  const panel = subflowUi.panel;
  if (!panel?.isConnected) return;
  const previousBody = panel.querySelector('.yc-subflow-body');
  const previousBodyScrollTop = previousBody?.scrollTop || 0;
  const pageScrollX = window.scrollX;
  const pageScrollY = window.scrollY;
  panel.replaceChildren();

  const header = createElement('header', 'yc-subflow-header');
  const title = createElement('div');
  title.appendChild(createElement('strong', '', 'Subtitle workflow'));
  title.appendChild(createElement('span', '', 'YouTube, custom SRT and local Subflow'));
  header.appendChild(title);
  const close = createElement('button', 'yc-subflow-close', 'X');
  close.type = 'button';
  close.title = 'Close';
  close.addEventListener('click', closePanel);
  header.appendChild(close);
  panel.appendChild(header);

  const body = createElement('div', 'yc-subflow-body');
  if (subflowUi.notice) {
    body.appendChild(createElement('div', `yc-subflow-notice ${subflowUi.noticeType}`, subflowUi.notice));
  }
  if (isGeminiPipelineRunning() && subflowUi.sourceMode !== 'gemini' && subflowUi.sourceMode !== 'whisper-gemini') {
    const backgroundNotice = createElement('div', 'yc-subflow-notice');
    backgroundNotice.appendChild(createElement('span', '', 'Gemini is running in the background.'));
    const stopButton = actionButton(
      'Stop Gemini',
      () => runAction(stopGeminiPipeline, { allowWhileBusy: true }),
      { allowWhileBusy: true }
    );
    stopButton.classList.add('danger');
    backgroundNotice.appendChild(stopButton);
    body.appendChild(backgroundNotice);
  }
  renderCaptionSources(body);
  renderPreparation(body);
  panel.appendChild(body);

  // Re-rendering the panel should not move the YouTube page or the panel's
  // own scroll position unexpectedly (for example when switching to Gemini).
  body.scrollTop = Math.min(previousBodyScrollTop, body.scrollHeight);
  window.scrollTo(pageScrollX, pageScrollY);
  focusSubflowTarget();
}

async function openPanel() {
  const requestedVideoId = currentVideoId();
  const keepGeminiJob = subflowUi.geminiVideoId === requestedVideoId
    ? subflowUi.geminiJob
    : null;
  if (
    subflowUi.geminiVideoId &&
    subflowUi.geminiVideoId !== requestedVideoId &&
    subflowUi.geminiController
  ) {
    subflowUi.geminiController.abort();
    subflowUi.geminiController = null;
  }
  closePanel();
  const videoId = requestedVideoId;
  if (!videoId) return;
  subflowUi.videoId = videoId;
  subflowUi.controller = new AbortController();
  subflowUi.tracks = [];
  subflowUi.record = null;
  subflowUi.selectedTrack = null;
  subflowUi.transcriptionSettings = { ...SUBFLOW_DEFAULT_SETTINGS };
  subflowUi.advancedSettingsOpen = false;
  subflowUi.geminiSettings = { ...DEFAULT_GEMINI_PIPELINE_SETTINGS };
  subflowUi.geminiKeys = [];
  subflowUi.geminiPrompt = '';
  subflowUi.focusTarget = null;
  subflowUi.geminiManagerOpen = false;
  subflowUi.geminiKeyEditor = null;
  subflowUi.geminiJob = keepGeminiJob;
  subflowUi.job = null;
  subflowUi.notice = 'Loading subtitle sources...';
  subflowUi.noticeType = 'info';

  const panel = createElement('div', 'yc-subflow-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Subtitle workflow');
  panel.setAttribute('dir', 'ltr');
  const player = document.querySelector('#movie_player, .html5-video-player') || document.body;
  player.appendChild(panel);
  subflowUi.panel = panel;
  subflowUi.keyboardGuard = stopSubflowPlayerShortcuts;
  for (const eventName of ['keydown', 'keypress', 'keyup']) {
    panel.addEventListener(eventName, subflowUi.keyboardGuard);
  }
  subflowUi.button?.classList.add('yc-subflow-button-active');
  subflowUi.outsideClickHandler = (event) => {
    const target = event.target;
    if (subflowUi.panel?.contains(target) || subflowUi.button?.contains(target)) return;
    closePanel();
  };
  document.addEventListener('pointerdown', subflowUi.outsideClickHandler, true);
  renderPanel();

  try {
    const [tracks, , , geminiKeys, geminiSettings, geminiPrompt] = await Promise.all([
      window.youtubeSubtitles.getAvailableCaptions(videoId),
      loadRecord(),
      loadSubflowSettings(),
      getGeminiApiKeyEntries(),
      loadGeminiPipelineSettings(16),
      loadGeminiPipelinePrompt()
    ]);
    if (!subflowUi.panel?.isConnected || subflowUi.videoId !== videoId) return;
    subflowUi.tracks = tracks || [];
    subflowUi.geminiKeys = geminiKeys || [];
    subflowUi.geminiSettings = await saveGeminiPipelineSettings({
      ...geminiSettings,
      apiCount: Math.min(geminiSettings.apiCount, Math.max(1, subflowUi.geminiKeys.length))
    });
    subflowUi.geminiPrompt = geminiPrompt || '';
    subflowUi.selectedTrack = subflowUi.record?.customSubtitleActive && subflowUi.record?.customSubtitleSRT
      ? 'custom'
      : preferredYoutubeTrack();
    subflowUi.notice = '';
    await restoreJob();
    renderPanel();
  } catch (error) {
    if (error.name !== 'AbortError') setNotice(error.message, 'error');
  }
}

function togglePanel() {
  if (subflowUi.panel?.isConnected) closePanel();
  else openPanel();
}

window.createSubflowButton = function createSubflowButton() {
  const container = createElement('div', 'custom-button-container');
  const button = createElement('button', 'ytp-button ytp-subflow-button');
  button.type = 'button';
  button.title = 'Subtitle Workflow';
  button.setAttribute('aria-label', 'Subtitle Workflow');
  button.appendChild(createElement('span', 'yc-subflow-button-label', 'SRT'));
  button.addEventListener('click', togglePanel);
  container.appendChild(button);
  subflowUi.button = button;
  return container;
};
window.createSubflowButton.isTemporaryFunction = false;

window.cleanupSubflowManager = function cleanupSubflowManager() {
  subflowUi.geminiController?.abort();
  subflowUi.geminiController = null;
  subflowUi.geminiVideoId = null;
  closePanel();
  subflowUi.button = null;
  subflowUi.videoId = null;
  subflowUi.tracks = [];
  subflowUi.record = null;
  subflowUi.selectedTrack = null;
  subflowUi.transcriptionSettings = { ...SUBFLOW_DEFAULT_SETTINGS };
  subflowUi.advancedSettingsOpen = false;
  subflowUi.geminiSettings = { ...DEFAULT_GEMINI_PIPELINE_SETTINGS };
  subflowUi.geminiKeys = [];
  subflowUi.geminiPrompt = '';
  subflowUi.focusTarget = null;
  subflowUi.geminiManagerOpen = false;
  subflowUi.geminiKeyEditor = null;
  subflowUi.geminiJob = null;
  subflowUi.job = null;
  subflowUi.busy = false;
  subflowUi.notice = '';
};

export { parseAndNormalizeSrt };
