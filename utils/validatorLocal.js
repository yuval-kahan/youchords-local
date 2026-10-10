/**
 * Local-only video validation.
 *
 * Every valid YouTube watch video is accepted. There are no duration limits,
 * content-category checks, YouTube API prechecks, account gates, or quotas.
 */

async function checkSubtitlesInIndexedDB(videoId) {
  if (!videoId || !window.databaseManager) return false;
  try {
    let subtitlesData = await window.databaseManager.loadFromDatabase('subtitles', videoId);
    if (subtitlesData && window.databaseManager.normalizeSubtitlesForActiveMode) {
      subtitlesData = await window.databaseManager.normalizeSubtitlesForActiveMode(subtitlesData, 'off');
    }
    return Boolean(
      subtitlesData?.hasActiveDefault ||
      subtitlesData?.sentenceSRT?.trim?.() ||
      subtitlesData?.wordSRT?.trim?.()
    );
  } catch (error) {
    console.error('[VideoValidatorLocal] Subtitle cache check failed:', error);
    return false;
  }
}

async function checkChordsInIndexedDB(videoId) {
  if (!videoId || !window.databaseManager) return false;
  try {
    const chordsData = await window.databaseManager.loadFromDatabase('chords', videoId);
    return Boolean(chordsData?.chordText?.trim?.());
  } catch (error) {
    console.error('[VideoValidatorLocal] Chord cache check failed:', error);
    return false;
  }
}

async function readPageDuration() {
  const video = document.querySelector('video.html5-main-video, video');
  const duration = Number(video?.duration);
  if (Number.isFinite(duration) && duration > 0) return Math.round(duration);

  const initialDuration = Number(window.ytInitialPlayerResponse?.videoDetails?.lengthSeconds);
  return Number.isFinite(initialDuration) && initialDuration > 0 ? initialDuration : null;
}

async function validateVideo(url) {
  const videoId = window.ycUtils?.extractVideoId?.(url);
  if (!videoId) {
    return { isValid: false, message: 'Invalid YouTube URL' };
  }

  return {
    isValid: true,
    isMusic: true,
    message: 'Valid YouTube video',
    videoId,
    durationSeconds: await readPageDuration(),
    musicCategory: 'Any YouTube content',
    manualRetryEligible: false,
    musicCheckSkipped: true,
    localOnly: true
  };
}

function showErrorOverlay(message, duration = 5000) {
  window.ycUtils?.showErrorOverlay?.(message, duration);
}

function showDebugOverlay(message, duration = 3000) {
  window.ycUtils?.showDebugOverlay?.(message, duration);
}

window.videoValidator = {
  validateVideo,
  showErrorOverlay,
  showDebugOverlay,
  hasManualMusicRetryBeenShown: () => false,
  markManualMusicRetryShown: () => {},
  checkSubtitlesInIndexedDB,
  checkChordsInIndexedDB
};
