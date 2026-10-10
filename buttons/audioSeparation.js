/* ============================================================================
 * YouChords - local AI audio separation controls
 *
 * The heavy work is performed by the local companion service with
 * MelBand-RoFormer for vocals/music and HTDemucs for individual instruments.
 * This module owns the three main YouTube buttons and synchronizes the local
 * WAV stems with the YouTube video timeline.
 * ========================================================================== */

import { getLocalApiBase } from '../utils/localProcessorConfig.js';

const YC_VOCAL_MUSIC_MODEL = 'melband-roformer-kim-vocals';
const YC_INSTRUMENT_MODEL = 'htdemucs_6s';
const YC_SEPARATION_STEMS = [
  { id: 'vocals', label: 'קול', icon: '🎤' },
  { id: 'instrumental', label: 'מוזיקה', icon: '🎵' },
  { id: 'drums', label: 'תופים', icon: '🥁' },
  { id: 'bass', label: 'בס', icon: '🎸' },
  { id: 'guitar', label: 'גיטרה', icon: '🎸' },
  { id: 'piano', label: 'פסנתר', icon: '🎹' },
  { id: 'other', label: 'כלים אחרים', icon: '🎼' }
];
const YC_SEPARATION_STEM_IDS = new Set(YC_SEPARATION_STEMS.map(stem => stem.id));

const state = {
  mode: 'normal',
  selectedInstruments: new Set(),
  video: null,
  originalMuted: null,
  originalVolume: null,
  job: null,
  jobPromise: null,
  jobPromiseModel: null,
  requestToken: 0,
  abortController: null,
  players: new Map(),
  syncTimer: null,
  playbackGuardTimer: null,
  videoObserver: null,
  boundVideoHandlers: null,
  progressPanel: null
};

function getVideo() {
  return document.querySelector('video.html5-main-video') || document.querySelector('video');
}

function getVideoId() {
  try {
    const url = new URL(window.location.href);
    const id = url.searchParams.get('v') || url.pathname.match(/\/shorts\/([^/?]+)/)?.[1];
    return String(id || '').trim();
  } catch (_) {
    return '';
  }
}

function getErrorText(error) {
  return String(error?.message || error || '').trim();
}

function showSeparationMessage(message, timeout = 6000) {
  const overlay = window.videoValidator?.showErrorOverlay;
  if (typeof overlay === 'function') {
    overlay(message, timeout);
    return;
  }
  console.warn('[AudioSeparation]', message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    throw new Error(payload?.error || `Local audio separation failed (${response.status})`);
  }
  return payload;
}

function getJobStatusText(job) {
  const progress = Number(job?.progress || 0);
  if (job?.stage === 'compute-queue') return `ממתין בתור העיבוד… ${progress}%`;
  if (job?.status === 'downloading') return `מוריד אודיו מקומית… ${progress}%`;
  if (job?.status === 'separating') {
    const model = String(job?.model || '');
    const label = model.startsWith('melband-') ? 'MelBand-RoFormer' : 'HTDemucs';
    return `מפריד קול ומוזיקה עם ${label}… ${progress}%`;
  }
  if (job?.status === 'loading') return 'טוען את ערוצי האודיו…';
  return 'מכין הפרדת אודיו…';
}

function ensureProgressPanel() {
  if (state.progressPanel?.isConnected) return state.progressPanel;
  const host = document.querySelector('#movie_player')
    || document.querySelector('.html5-video-player')
    || document.body;
  if (!host) return null;

  const panel = document.createElement('div');
  panel.className = 'yc-audio-separation-progress';
  panel.hidden = true;
  panel.setAttribute('role', 'status');
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = `
    <div class="yc-audio-separation-progress-header">
      <span class="yc-audio-separation-progress-title">הפרדת אודיו</span>
      <span class="yc-audio-separation-progress-percent">0%</span>
    </div>
    <div class="yc-audio-separation-progress-track">
      <div class="yc-audio-separation-progress-bar"></div>
    </div>
    <div class="yc-audio-separation-progress-stage">מכין הפרדה מקומית…</div>`;
  host.appendChild(panel);
  state.progressPanel = panel;
  return panel;
}

function updateProgressPanel(isLoading, job = null) {
  const panel = ensureProgressPanel();
  if (!panel) return;
  panel.hidden = !isLoading;
  if (!isLoading) return;

  const status = String(job?.status || 'queued');
  const rawProgress = Number(job?.progress);
  const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : 0;
  const bar = panel.querySelector('.yc-audio-separation-progress-bar');
  const percent = panel.querySelector('.yc-audio-separation-progress-percent');
  const stage = panel.querySelector('.yc-audio-separation-progress-stage');
  const indeterminate = status === 'queued' || status === 'separating' || status === 'loading';
  bar?.classList.toggle('indeterminate', indeterminate);
  if (bar) bar.style.width = `${Math.max(progress, status === 'separating' ? 28 : 0)}%`;
  if (percent) percent.textContent = `${progress}%`;
  if (stage) stage.textContent = getJobStatusText(job);
}

function updateLoadingState(isLoading, job = null) {
  document.querySelectorAll('.yc-audio-separation-button').forEach(button => {
    button.classList.toggle('audio-separation-loading', isLoading);
    button.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    if (isLoading && job) button.dataset.ycLoadingLabel = getJobStatusText(job);
    else delete button.dataset.ycLoadingLabel;
  });
  updateProgressPanel(isLoading, job);
}

function extractJobStems(job) {
  return Object.fromEntries(
    Object.entries(job?.stems || {}).filter(([stem, path]) => (
      YC_SEPARATION_STEM_IDS.has(stem) && typeof path === 'string' && path
    ))
  );
}

function getSeparationModel(mode) {
  return mode === 'instruments' ? YC_INSTRUMENT_MODEL : YC_VOCAL_MUSIC_MODEL;
}

async function ensureSeparationJob(model = getSeparationModel(state.mode)) {
  const videoId = getVideoId();
  if (!videoId) throw new Error('לא ניתן לזהות את הסרטון הנוכחי.');

  if (state.job?.videoId === videoId
    && state.job?.model === model
    && state.job.status === 'completed'
    && Object.keys(extractJobStems(state.job)).length) {
    return state.job;
  }
  if (state.jobPromise) {
    if (state.jobPromiseModel === model) return state.jobPromise;
    await state.jobPromise.catch(() => {});
    return ensureSeparationJob(model);
  }

  const controller = new AbortController();
  state.abortController = controller;
  state.jobPromise = (async () => {
    try {
      updateLoadingState(true, { status: 'queued', progress: 0 });
      let payload = await fetchJson('/separation/jobs', {
        method: 'POST',
        body: JSON.stringify({
          videoId,
          model
        }),
        signal: controller.signal
      });
      let job = payload.job;
      state.job = job;
      updateLoadingState(true, job);

      while (job && !['completed', 'failed', 'cancelled'].includes(job.status)) {
        await sleep(1200);
        payload = await fetchJson(`/separation/jobs/${encodeURIComponent(job.id)}`, {
          signal: controller.signal
        });
        job = payload.job;
        state.job = job;
        updateLoadingState(true, job);
      }

      if (!job || job.status !== 'completed') {
        throw new Error(job?.error || 'הפרדת האודיו נכשלה.');
      }
      if (!Object.keys(extractJobStems(job)).length) {
        throw new Error('המודל סיים ללא ערוצי אודיו זמינים.');
      }
      return job;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      const detail = getErrorText(error);
      if (detail.includes('Failed to fetch')) {
        throw new Error('YouChords Local לא פועל. הפעל את Docker עם scripts/start_youchords_local.ps1.');
      }
      throw error;
    } finally {
      updateLoadingState(false);
      if (state.jobPromiseModel === model) {
        state.jobPromise = null;
        state.jobPromiseModel = null;
      }
      state.abortController = null;
    }
  })();
  state.jobPromiseModel = model;

  return state.jobPromise;
}

function stopPlayers() {
  state.players.forEach(player => {
    try {
      player.pause();
      player.removeAttribute('src');
      player.load();
    } catch (_) {
      // Ignore cleanup errors from a player that already ended.
    }
  });
  state.players.clear();
  if (state.syncTimer) {
    clearInterval(state.syncTimer);
    state.syncTimer = null;
  }
}

function recoverEndedPlayer(player, video) {
  if (!player?.ended || !video || video.paused || video.ended) return false;
  try {
    const duration = Number(player.duration);
    const videoTime = Math.max(0, Number(video.currentTime || 0));
    // A separated WAV can be a few milliseconds shorter than the YouTube
    // media element. Reset an ended stem to the matching timeline position
    // before calling play(); play() alone cannot restart an ended element.
    const target = Number.isFinite(duration) && duration > 0
      ? Math.min(videoTime, Math.max(0, duration - 0.05))
      : videoTime;
    player.currentTime = target;
    return true;
  } catch (_) {
    return false;
  }
}

function resumePlayerIfVideoPlaying(player, video) {
  if (!player || !video || state.mode === 'normal' || video.paused || video.ended) return;
  recoverEndedPlayer(player, video);
  if (!player.paused) return;
  player.play().catch(error => {
    if (error?.name !== 'NotAllowedError') {
      console.warn('[AudioSeparation] Stem recovery failed:', error);
    }
  });
}

function syncPlayersToVideo(force = false) {
  const video = state.video || getVideo();
  if (!video || !state.players.size) return;
  // YouTube can recreate the video element or change its muted state during
  // ads, seeking, quality changes, and SPA navigation. While a separated mode
  // is active the original YouTube soundtrack must stay silent.
  if (state.mode !== 'normal' && !video.muted) video.muted = true;
  state.players.forEach(player => {
    try {
      const videoIsPlaying = !video.paused && !video.ended;
      if (videoIsPlaying) recoverEndedPlayer(player, video);
      player.playbackRate = video.playbackRate || 1;
      // Keep the mix normalized on every sync. Previously this assignment
      // reset every stem to full volume every 700ms, which made the music-only
      // five-stem mix clip and sound like electrical interference.
      const stemCount = Math.max(1, state.players.size);
      player.volume = Math.max(
        0,
        Math.min(1, Number(video.volume ?? 1) / Math.sqrt(stemCount))
      );
      const drift = Math.abs((player.currentTime || 0) - (video.currentTime || 0));
      if (force || drift > 0.12) player.currentTime = Math.max(0, video.currentTime || 0);
      if (videoIsPlaying) resumePlayerIfVideoPlaying(player, video);
    } catch (_) {
      // Media can briefly be unavailable while the YouTube player changes source.
    }
  });
}

function playPlayers() {
  const video = state.video || getVideo();
  if (!video || !state.players.size || video.paused) return;
  if (state.mode !== 'normal') video.muted = true;
  syncPlayersToVideo(true);
  state.players.forEach(player => resumePlayerIfVideoPlaying(player, video));
}

function pausePlayers() {
  state.players.forEach(player => player.pause());
}

function bindVideo(video) {
  if (!video || state.video === video) return;
  const preserveOriginalPlaybackState = state.mode !== 'normal' && state.originalMuted !== null;
  unbindVideo();
  state.video = video;
  if (!preserveOriginalPlaybackState) {
    state.originalMuted = video.muted;
    state.originalVolume = video.volume;
  }

  const handlers = {
    play: () => playPlayers(),
    pause: () => pausePlayers(),
    seeking: () => syncPlayersToVideo(true),
    timeupdate: () => syncPlayersToVideo(false),
    ratechange: () => syncPlayersToVideo(true),
    volumechange: () => syncPlayersToVideo(false),
    loadstart: () => syncPlayersToVideo(true),
    loadedmetadata: () => syncPlayersToVideo(true),
    durationchange: () => syncPlayersToVideo(true),
    ended: () => pausePlayers()
  };
  Object.entries(handlers).forEach(([event, handler]) => video.addEventListener(event, handler));
  state.boundVideoHandlers = handlers;
}

function ensureActiveVideoBinding() {
  if (state.mode === 'normal' || !state.players.size) return;
  const video = getVideo();
  if (!video) return;

  if (state.video !== video) {
    bindVideo(video);
    console.log('[AudioSeparation] Rebound separated playback to the current YouTube video element');
  }

  // The guard is intentionally idempotent: it repairs YouTube changing
  // `muted` back to false without restarting the local stem players.
  if (!video.muted) video.muted = true;
  syncPlayersToVideo(false);
  if (!video.paused) playPlayers();
}

function startPlaybackGuard() {
  if (state.playbackGuardTimer) return;
  state.playbackGuardTimer = setInterval(ensureActiveVideoBinding, 350);

  if (!state.videoObserver) {
    const playerHost = document.querySelector('#movie_player') || document.body;
    if (playerHost && typeof MutationObserver === 'function') {
      state.videoObserver = new MutationObserver(() => {
        if (state.mode !== 'normal') ensureActiveVideoBinding();
      });
      state.videoObserver.observe(playerHost, { childList: true, subtree: true });
    }
  }
}

function stopPlaybackGuard() {
  if (state.playbackGuardTimer) {
    clearInterval(state.playbackGuardTimer);
    state.playbackGuardTimer = null;
  }
  state.videoObserver?.disconnect?.();
  state.videoObserver = null;
}

function unbindVideo() {
  if (!state.video || !state.boundVideoHandlers) return;
  Object.entries(state.boundVideoHandlers).forEach(([event, handler]) => {
    state.video.removeEventListener(event, handler);
  });
  state.boundVideoHandlers = null;
}

async function loadPlayersForMode(mode, selectedInstruments = []) {
  const video = getVideo();
  if (!video) throw new Error('נגן הווידאו לא נמצא.');
  bindVideo(video);
  const job = await ensureSeparationJob(getSeparationModel(mode));
  const stems = extractJobStems(job);
  const wanted = mode === 'vocals'
    ? ['vocals']
    : mode === 'music'
      ? ['instrumental']
      : selectedInstruments.filter(stem => stems[stem]);
  const available = wanted.filter(stem => stems[stem]);
  if (!available.length) throw new Error('לא נמצאו ערוצי כלי נגינה זמינים עבור הסרטון.');

  stopPlayers();
  updateLoadingState(true, { status: 'loading', progress: 100 });
  const initialTime = Math.max(0, video.currentTime || 0);
  const loadPromises = [];
  const apiBase = await getLocalApiBase();
  available.forEach(stem => {
    const player = new Audio();
    player.preload = 'auto';
    // Keep a stem alive if its encoded duration is a fraction shorter than
    // YouTube's timeline. The video ended handler still pauses all stems when
    // the actual video finishes.
    player.loop = true;
    player.crossOrigin = 'anonymous';
    player.src = new URL(stems[stem], `${apiBase}/`).href;
    player.currentTime = initialTime;
    player.playbackRate = video.playbackRate || 1;
    player.volume = Math.max(0, Math.min(1, Number(video.volume ?? 1) / Math.sqrt(available.length)));
    loadPromises.push(new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        player.removeEventListener('canplay', onReady);
        player.removeEventListener('loadedmetadata', onReady);
        player.removeEventListener('error', onError);
      };
      const finish = callback => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const onReady = () => finish(resolve);
      const onError = () => finish(() => reject(new Error(`לא ניתן לטעון את ערוץ ${stem}.`)));
      player.addEventListener('ended', () => {
        if (state.players.get(stem) !== player) return;
        const currentVideo = state.video || getVideo();
        if (state.mode !== 'normal' && currentVideo && !currentVideo.paused && !currentVideo.ended) {
          recoverEndedPlayer(player, currentVideo);
          resumePlayerIfVideoPlaying(player, currentVideo);
        }
      });
      const recoverUnexpectedStop = () => {
        if (state.players.get(stem) !== player) return;
        const currentVideo = state.video || getVideo();
        if (!currentVideo || currentVideo.paused || currentVideo.ended || state.mode === 'normal') return;
        setTimeout(() => {
          if (state.players.get(stem) === player
            && state.mode !== 'normal'
            && !currentVideo.paused
            && !currentVideo.ended) {
            syncPlayersToVideo(true);
            resumePlayerIfVideoPlaying(player, currentVideo);
          }
        }, 120);
      };
      player.addEventListener('pause', recoverUnexpectedStop);
      player.addEventListener('waiting', recoverUnexpectedStop);
      player.addEventListener('stalled', recoverUnexpectedStop);
      player.addEventListener('canplay', onReady);
      player.addEventListener('loadedmetadata', onReady);
      player.addEventListener('error', onError);
      setTimeout(() => finish(resolve), 15000);
    }));
    player.load();
    state.players.set(stem, player);
  });

  await Promise.all(loadPromises);
  updateLoadingState(false);

  video.muted = true;
  state.syncTimer = setInterval(() => syncPlayersToVideo(false), 700);
  startPlaybackGuard();
  syncPlayersToVideo(true);
  if (!video.paused) playPlayers();
}

function restoreNormalPlayback() {
  stopPlaybackGuard();
  stopPlayers();
  const video = state.video || getVideo();
  if (video && state.originalMuted !== null) video.muted = state.originalMuted;
  if (video && state.originalVolume !== null) video.volume = state.originalVolume;
  state.mode = 'normal';
  updateLoadingState(false);
  updateButtonStates();
}

async function applyMode(mode, selectedInstruments = []) {
  const requestToken = ++state.requestToken;
  state.mode = mode;
  updateButtonStates();
  try {
    await loadPlayersForMode(mode, selectedInstruments);
    if (requestToken !== state.requestToken || state.mode !== mode) return;
    updateButtonStates();
  } catch (error) {
    if (requestToken !== state.requestToken) return;
    restoreNormalPlayback();
    if (error?.name !== 'AbortError') showSeparationMessage(getErrorText(error));
  }
}

function updateInstrumentMenus() {
  document.querySelectorAll('.yc-audio-instrument-option').forEach(option => {
    const stem = option.dataset.ycInstrument;
    const selected = state.selectedInstruments.has(stem);
    option.classList.toggle('selected', selected);
    option.setAttribute('aria-checked', selected ? 'true' : 'false');
    const check = option.querySelector('.yc-audio-instrument-check');
    if (check) check.textContent = selected ? '✓' : '';
  });
}

function updateButtonStates() {
  const vocal = document.querySelector('.ytp-vocal-button');
  const music = document.querySelector('.ytp-music-button');
  const instruments = document.querySelector('.ytp-instruments-button');
  const setState = (button, active) => {
    if (!button) return;
    button.classList.toggle('audio-separation-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  };
  setState(vocal, state.mode === 'vocals');
  setState(music, state.mode === 'music');
  setState(instruments, state.mode === 'instruments');
  if (instruments) instruments.setAttribute('aria-expanded', instruments.closest('[data-yc-audio-picker]')?.querySelector('.yc-audio-instrument-menu')?.hidden === false ? 'true' : 'false');
  updateInstrumentMenus();
}

async function toggleMode(mode) {
  bindVideo(getVideo());
  if (state.mode === mode) {
    restoreNormalPlayback();
    return;
  }
  await applyMode(mode, [...state.selectedInstruments]);
}

async function selectInstrument(stem) {
  if (!YC_SEPARATION_STEM_IDS.has(stem) || stem === 'vocals') return;
  if (state.selectedInstruments.has(stem)) state.selectedInstruments.delete(stem);
  else state.selectedInstruments.add(stem);
  updateInstrumentMenus();
  if (!state.selectedInstruments.size) {
    restoreNormalPlayback();
    return;
  }
  await applyMode('instruments', [...state.selectedInstruments]);
}

function closeInstrumentMenus() {
  document.querySelectorAll('.yc-audio-instrument-menu').forEach(menu => {
    menu.hidden = true;
  });
  updateButtonStates();
}

function toggleInstrumentMenu() {
  const menu = document.querySelector('[data-yc-audio-picker] .yc-audio-instrument-menu');
  if (!menu) return;
  const shouldOpen = menu.hidden;
  closeInstrumentMenus();
  menu.hidden = !shouldOpen;
  updateButtonStates();
}

function createAudioButton({ id, className, label, svg }) {
  const container = document.createElement('div');
  container.className = 'custom-button-container yc-audio-separation-container';
  container.setAttribute('data-yc-audio-control', id);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `ytp-button yc-audio-separation-button ${className}`;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = svg;
  container.appendChild(button);
  return container;
}

function createInstrumentButton() {
  const container = createAudioButton({
    id: 'audioInstruments',
    className: 'instruments-button ytp-instrument-picker-button',
    label: 'Choose Instruments',
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <use class="ytp-svg-shadow"></use>
      <g class="ytp-svg-fill">
        <rect x="3" y="4" width="3" height="16" rx="1"></rect>
        <rect x="10.5" y="8" width="3" height="12" rx="1"></rect>
        <rect x="18" y="2" width="3" height="18" rx="1"></rect>
        <circle cx="4.5" cy="8" r="1.5"></circle>
        <circle cx="12" cy="14" r="1.5"></circle>
        <circle cx="19.5" cy="6" r="1.5"></circle>
      </g>
    </svg>`
  });
  container.setAttribute('data-yc-audio-picker', 'true');
  const menu = document.createElement('div');
  menu.className = 'yc-audio-instrument-menu';
  menu.hidden = true;
  menu.setAttribute('data-yc-audio-menu', 'true');
  menu.innerHTML = `
    <div class="yc-audio-menu-title">בחירת כלים</div>
    <div class="yc-audio-menu-subtitle">אפשר לבחור כמה כלים יחד</div>
    <div class="yc-audio-instrument-options"></div>
    <div class="yc-audio-menu-model">כלים: HTDemucs 6-stem · קול/מוזיקה: MelBand-RoFormer</div>`;
  const options = menu.querySelector('.yc-audio-instrument-options');
  YC_SEPARATION_STEMS.filter(stem => !['vocals', 'instrumental'].includes(stem.id)).forEach(stem => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'yc-audio-instrument-option';
    option.dataset.ycInstrument = stem.id;
    option.setAttribute('role', 'checkbox');
    option.innerHTML = `<span class="yc-audio-instrument-icon">${stem.icon}</span><span>${stem.label}</span><span class="yc-audio-instrument-check" aria-hidden="true"></span>`;
    options.appendChild(option);
  });
  menu.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const option = event.target.closest('[data-yc-instrument]');
    if (option) selectInstrument(option.dataset.ycInstrument);
  });
  menu.addEventListener('pointerdown', event => event.stopPropagation());
  container.appendChild(menu);
  updateInstrumentMenus();
  updateButtonStates();
  return container;
}

function createVocalsButton() {
  return createAudioButton({
    id: 'audioVocals',
    className: 'ytp-vocal-button',
    label: 'Only Vocals',
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <use class="ytp-svg-shadow"></use>
      <g class="ytp-svg-fill">
        <path d="M12 3a4 4 0 0 0-4 4v4a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4Zm-2 4a2 2 0 0 1 4 0v4a2 2 0 0 1-4 0V7Z"></path>
        <path d="M5.5 11a1 1 0 0 1 1 1 5.5 5.5 0 0 0 11 0 1 1 0 1 1 2 0 7.5 7.5 0 0 1-6.5 7.42V22h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-2.58A7.5 7.5 0 0 1 4.5 12a1 1 0 0 1 1-1Z" transform="translate(0 -1)"></path>
      </g>
    </svg>`
  });
}

function createMusicButton() {
  return createAudioButton({
    id: 'audioMusic',
    className: 'ytp-music-button',
    label: 'Only Music',
    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <use class="ytp-svg-shadow"></use>
      <g class="ytp-svg-fill">
        <path d="M14 3v11.1a3.8 3.8 0 1 0 2 3.4V8h4V3h-6Zm-2 14.5a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0Z"></path>
        <path d="M3 8h5v2H3V8Zm0 4h5v2H3v-2Zm13 8h5v2h-5v-2Z"></path>
      </g>
    </svg>`
  });
}

function resetForNavigation() {
  state.requestToken += 1;
  state.abortController?.abort();
  state.abortController = null;
  state.jobPromise = null;
  state.jobPromiseModel = null;
  stopPlaybackGuard();
  stopPlayers();
  if (state.video && state.originalMuted !== null) state.video.muted = state.originalMuted;
  unbindVideo();
  state.video = null;
  state.job = null;
  state.mode = 'normal';
  state.originalMuted = null;
  state.originalVolume = null;
  updateLoadingState(false);
  updateButtonStates();
}

document.addEventListener('pointerdown', event => {
  if (!event.target.closest('[data-yc-audio-picker]')) closeInstrumentMenus();
}, true);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeInstrumentMenus();
}, true);
window.addEventListener('yt-navigate-start', resetForNavigation, { passive: true });
window.addEventListener('yt-navigate-finish', resetForNavigation, { passive: true });
window.addEventListener('pagehide', resetForNavigation, { once: true, passive: true });

window.ycAudioSeparation = {
  toggleMode,
  toggleInstrumentMenu,
  reset: resetForNavigation,
  getState: () => ({
    mode: state.mode,
    selectedInstruments: [...state.selectedInstruments],
    videoId: state.job?.videoId || getVideoId(),
    model: state.job?.model || getSeparationModel(state.mode)
  })
};

window.createAudioVocalsButton = createVocalsButton;
window.createAudioMusicButton = createMusicButton;
window.createAudioInstrumentsButton = createInstrumentButton;

console.log('[AudioSeparation] Local MelBand/HTDemucs controls loaded');
