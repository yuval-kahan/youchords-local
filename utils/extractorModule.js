/* =============================================================================
 *  extractorModule.js  |  ESM – Chrome 112+  |  Lazy-Load ע״י dynamicLoader
 *  – טעינת נתונים מהשרת (R2) ושמירה ב-IndexedDB –
 * =============================================================================
 *  יצוא ציבורי:
 *      fetchAndSaveChords(videoId)            – Promise<Object|null>
 *      fetchAndSaveLyrics(videoId)            – Promise<Object|null>
 *      loadChordsFromIndexedDB(videoId)       – Promise<Object|null>
 *      loadSubtitlesFromIndexedDB(videoId)    – Promise<Object|null>
 *      cleanupExtractorResources()            – void
 * =============================================================================*/

const DEBUG = false;

// 🔒 AbortController for canceling API requests
let currentLyricsAbortController = null;
let currentChordsAbortController = null;

function isTutorialDemoExtractorVideo(videoId) {
  return window.__ycIsTutorialDemoVideo?.(videoId) === true;
}

function isPackedChordPayload(data) {
  return data && Number(data.v) === 2 && Array.isArray(data.c);
}

function formatPackedChordTime(timeUnits, scale) {
  const value = timeUnits / scale;
  if (Number.isInteger(value)) {
    return String(value);
  }
  const precision = scale >= 1000 ? 3 : 2;
  return value.toFixed(precision).replace(/\.?0+$/, "");
}

function decodePackedChordTimeline(encodedTimeline, chordNames, scale) {
  if (!encodedTimeline || !Array.isArray(chordNames) || !chordNames.length) {
    return "";
  }

  let currentTime = 0;
  const decodedEntries = [];

  String(encodedTimeline).split(",").forEach((part) => {
    const separatorIndex = part.indexOf(".");
    if (separatorIndex <= 0) return;

    const delta = Number(part.slice(0, separatorIndex));
    const chordIndex = Number(part.slice(separatorIndex + 1));
    const chordName = chordNames[chordIndex];

    if (!Number.isFinite(delta) || !Number.isInteger(chordIndex) || !chordName) {
      return;
    }

    currentTime += delta;
    decodedEntries.push(`${formatPackedChordTime(currentTime, scale)}:${chordName}`);
  });

  return decodedEntries.join(",");
}

function normalizeChordPayload(chordsData) {
  if (!isPackedChordPayload(chordsData)) {
    return chordsData;
  }

  const scale = Number(chordsData.s) > 0 ? Number(chordsData.s) : 1000;
  return {
    regular: decodePackedChordTimeline(chordsData.r, chordsData.c, scale),
    regularPlus: decodePackedChordTimeline(chordsData.rp, chordsData.c, scale),
    harmonic: decodePackedChordTimeline(chordsData.h, chordsData.c, scale),
    harmonicPlus: decodePackedChordTimeline(chordsData.p, chordsData.c, scale),
    tuning: chordsData.t || chordsData.tuning || "0",
    hasNonStandardTuning: chordsData.n === true || chordsData.n === 1 || chordsData.n === "1",
    capoChords: chordsData.capoChords || null,
    chordPositions: chordsData.chordPositions || null,
    chordEngineVersion: chordsData.e || chordsData.ev || chordsData.chordEngineVersion || chordsData.engineVersion || null,
  };
}

/* --------------------------------------------------------------------------- */
/* 0. Fake Progress Bar - מופיע רק בהורדה מ-R2/Docker                          */
/* --------------------------------------------------------------------------- */
const PROGRESS_SEGMENTS = 20;
const FAST_PROGRESS_END_PERCENT = 85;
const FAST_PROGRESS_END_SEGMENT = Math.floor((PROGRESS_SEGMENTS * FAST_PROGRESS_END_PERCENT) / 100);
let progressBarElement = null;
let progressInterval = null;
let slowPercentInterval = null;
let pendingLyricsProcessing = false; // Flag: יש עוד lyrics לטעון, לא לסגור progress bar

// 🆕 Progress Bar for local Whisper subtitles
let subtitlesProgressBarElement = null;
let subtitlesProgressInterval = null;
let subtitlesSlowPercentInterval = null;
const DEFAULT_QUEUE_HINT_TEXT = "Waiting in queue... Don't worry, your request is in line.";
const MINIMIZED_PROGRESS_RIGHT_PX = 20;
const MINIMIZED_PROGRESS_BASE_BOTTOM_PX = 145;
const MINIMIZED_PROGRESS_GAP_PX = 8;
const LONG_VIDEO_PROGRESS_HINT_MINUTES = 8;
const LONG_VIDEO_PROGRESS_HINT_TEXT = '⏳ This is a longer video and may take a little longer.';

function getCurrentVideoDurationMinutes() {
  const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
  const durationSeconds = Number(video?.duration);
  return Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds / 60 : null;
}

function normalizeProgressDurationMinutes(durationMinutes = null) {
  const explicitDuration = Number(durationMinutes);
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
    return explicitDuration;
  }
  return getCurrentVideoDurationMinutes();
}

function shouldShowLongVideoProgressHint(durationMinutes = null, options = {}) {
  const explicit = options?.showLongVideoHint;
  if (explicit === true) return true;
  if (explicit === false) return false;

  const normalizedDuration = normalizeProgressDurationMinutes(
    options?.durationMinutes ?? durationMinutes
  );
  return Number.isFinite(normalizedDuration) && normalizedDuration > LONG_VIDEO_PROGRESS_HINT_MINUTES;
}

function createLongVideoProgressHint(id, shouldShow) {
  const hint = document.createElement('div');
  hint.id = id;
  hint.textContent = LONG_VIDEO_PROGRESS_HINT_TEXT;
  hint.style.cssText = `
    color: rgba(255, 255, 255, 0.78);
    font-size: 10px;
    text-align: center;
    max-width: 280px;
    width: 100%;
    line-height: 1.3;
    display: ${shouldShow ? 'block' : 'none'};
    margin-top: 4px;
  `;
  return hint;
}

function applyProgressLtrIsolation(...elements) {
  elements.forEach((element) => {
    if (!element) return;
    element.style.direction = 'ltr';
    element.style.unicodeBidi = 'isolate';
  });
}

function updateLongVideoProgressHint(container, shouldShow) {
  if (!container) return;
  const hint = container.querySelector('[data-yc-long-video-hint="true"]');
  if (!hint) return;
  hint.style.display = shouldShow ? 'block' : 'none';
  requestAnimationFrame(repositionMinimizedProgressBars);
}

function repositionMinimizedProgressBars() {
  const minimizedBars = [];

  if (progressBarElement?.dataset?.ycMinimized === 'true') {
    minimizedBars.push(progressBarElement);
  }
  if (subtitlesProgressBarElement?.dataset?.ycMinimized === 'true') {
    minimizedBars.push(subtitlesProgressBarElement);
  }

  let currentBottom = MINIMIZED_PROGRESS_BASE_BOTTOM_PX;
  minimizedBars.forEach((bar) => {
    bar.style.top = 'auto';
    bar.style.left = 'auto';
    bar.style.right = `${MINIMIZED_PROGRESS_RIGHT_PX}px`;
    bar.style.bottom = `${currentBottom}px`;
    bar.style.transform = 'none';

    const height = Math.max(44, Math.ceil(bar.getBoundingClientRect().height || 0));
    currentBottom += height + MINIMIZED_PROGRESS_GAP_PX;
  });
}

// מהירויות: R2 מהיר (~7 שניות)
const SPEED_R2 = 350; // כל 350ms סגמנט = ~7 שניות ל-85%
const SPEED_DOCKER = 1000; // ברירת מחדל ל-Docker - יוחלף ע"י switchToDockerMode

// 🆕 מהירות התחלתית ל-Whisper (מוחלפת בעדכוני job אמיתיים)
const SPEED_GEMINI = 800; // compatibility fallback while the local job starts
const INITIAL_PROGRESS_END_PERCENT = 20;
const INITIAL_PROGRESS_STEP_MS = 400;

// Docker: חישוב דינמי לפי סוג ואורך הסרטון
// אקורדים בלבד: ~15 שניות בסיס
// Lyrics בלבד: ~20 שניות בסיס
// 🆕 GEMINI: ~30 שניות בסיס
// לכל 8 דקות וידאו: +5 שניות
const DOCKER_BASE_CHORDS = 15; // שניות
const DOCKER_BASE_LYRICS = 20; // שניות
const DOCKER_BASE_GEMINI = 30; // 🆕 שניות
const DOCKER_EXTRA_PER_8_MIN = 5; // שניות נוספות לכל 8 דקות

/**
 * חישוב מהירות Docker לפי סוג ואורך הסרטון
 * @param {string} type - 'chords' / 'lyrics' / 'gemini'
 * @param {number} durationMinutes - אורך הסרטון בדקות
 * @returns {number} מהירות ב-ms לכל סגמנט
 */
function calculateDockerSpeed(type, durationMinutes) {
  let baseSeconds;
  if (type === 'chords') {
    baseSeconds = DOCKER_BASE_CHORDS;
  } else if (type === 'gemini') {
    baseSeconds = DOCKER_BASE_GEMINI;
  } else {
    baseSeconds = DOCKER_BASE_LYRICS;
  }

  const extraSeconds = (durationMinutes / 8) * DOCKER_EXTRA_PER_8_MIN;
  const totalSeconds = baseSeconds + extraSeconds;

  // חישוב מהירות לכל סגמנט עד 85%
  const speedPerSegment = (totalSeconds * 1000) / FAST_PROGRESS_END_SEGMENT;

  console.log(`[Progress] ${type}: ${totalSeconds.toFixed(1)}s total, ${speedPerSegment.toFixed(0)}ms per segment (video: ${durationMinutes.toFixed(1)} min)`);
  return speedPerSegment;
}

function getRandomDelayMs(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function getSlowProgressDelay(percent) {
  if (percent <= 89) return getRandomDelayMs(1800, 2600);
  if (percent <= 94) return getRandomDelayMs(2800, 4200);
  if (percent <= 97) return getRandomDelayMs(4200, 6200);
  return getRandomDelayMs(6200, 9000);
}

function fillSegmentByPercent(segments, percent, color) {
  if (!segments || !segments.length) return;
  const scaled = percent * PROGRESS_SEGMENTS;
  if (scaled % 100 !== 0) return;
  const segmentIndex = Math.floor(scaled / 100) - 1;
  if (segmentIndex >= 0 && segmentIndex < segments.length) {
    segments[segmentIndex].style.backgroundColor = color;
  }
}

function readProgressPercent(percentLabel) {
  const value = parseInt(String(percentLabel?.textContent || '0').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(value) ? Math.max(0, Math.min(99, value)) : 0;
}

function paintSegmentsToPercent(segments, percent, color) {
  if (!segments || !segments.length) return;
  const filledSegments = Math.floor((Math.max(0, Math.min(100, percent)) / 100) * segments.length);
  segments.forEach((segment, index) => {
    if (index < filledSegments) {
      segment.style.backgroundColor = color;
    }
  });
}

function getFilledSegmentCount(segments, filledColor) {
  if (!segments || !segments.length) return 0;
  let count = 0;
  for (const segment of segments) {
    const color = String(segment.style.backgroundColor || '').trim();
    if (!color || color === 'transparent') break;
    count += 1;
  }
  return count;
}

function stopChordsProgressTimers() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  if (slowPercentInterval) {
    clearTimeout(slowPercentInterval);
    slowPercentInterval = null;
  }
}

function stopSubtitlesProgressTimers() {
  if (subtitlesProgressInterval) {
    clearInterval(subtitlesProgressInterval);
    subtitlesProgressInterval = null;
  }
  if (subtitlesSlowPercentInterval) {
    clearTimeout(subtitlesSlowPercentInterval);
    subtitlesSlowPercentInterval = null;
  }
}

function startInitialChordsProgress(percentLabel, segments) {
  stopChordsProgressTimers();
  let currentPercent = Math.min(readProgressPercent(percentLabel), INITIAL_PROGRESS_END_PERCENT);
  paintSegmentsToPercent(segments, currentPercent, '#3ea6ff');
  if (percentLabel) percentLabel.textContent = `${currentPercent}%`;

  progressInterval = setInterval(() => {
    currentPercent = Math.min(INITIAL_PROGRESS_END_PERCENT, currentPercent + 1);
    paintSegmentsToPercent(segments, currentPercent, '#3ea6ff');
    if (percentLabel) percentLabel.textContent = `${currentPercent}%`;

    if (currentPercent >= INITIAL_PROGRESS_END_PERCENT) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }, INITIAL_PROGRESS_STEP_MS);
}

function startInitialSubtitlesProgress(percentLabel, segments) {
  stopSubtitlesProgressTimers();
  let currentPercent = Math.min(readProgressPercent(percentLabel), INITIAL_PROGRESS_END_PERCENT);
  paintSegmentsToPercent(segments, currentPercent, '#9333ea');
  if (percentLabel) percentLabel.textContent = `${currentPercent}%`;

  subtitlesProgressInterval = setInterval(() => {
    currentPercent = Math.min(INITIAL_PROGRESS_END_PERCENT, currentPercent + 1);
    paintSegmentsToPercent(segments, currentPercent, '#9333ea');
    if (percentLabel) percentLabel.textContent = `${currentPercent}%`;

    if (currentPercent >= INITIAL_PROGRESS_END_PERCENT) {
      clearInterval(subtitlesProgressInterval);
      subtitlesProgressInterval = null;
    }
  }, INITIAL_PROGRESS_STEP_MS);
}

function continueChordsProgress(speed) {
  if (!progressBarElement) return;
  stopChordsProgressTimers();

  const segments = progressBarElement.querySelectorAll('.progress-segment');
  const percentLabel = progressBarElement.querySelector('#yc-progress-percent');
  let currentSegment = getFilledSegmentCount(segments, '#3ea6ff');

  progressInterval = setInterval(() => {
    if (currentSegment < FAST_PROGRESS_END_SEGMENT) {
      segments[currentSegment].style.backgroundColor = '#3ea6ff';
      currentSegment++;
      const percent = Math.round((currentSegment / PROGRESS_SEGMENTS) * 100);
      if (percentLabel) percentLabel.textContent = `${percent}%`;
    }
    if (currentSegment >= FAST_PROGRESS_END_SEGMENT) {
      clearInterval(progressInterval);
      progressInterval = null;
      if (percentLabel) startSlowPercentCount(percentLabel, segments, '#3ea6ff');
    }
  }, speed);
}

function continueSubtitlesProgress(speed) {
  if (!subtitlesProgressBarElement) return;
  stopSubtitlesProgressTimers();

  const segments = subtitlesProgressBarElement.querySelectorAll('.subtitles-progress-segment');
  const percentLabel = subtitlesProgressBarElement.querySelector('#yc-subtitles-progress-percent');
  let currentSegment = getFilledSegmentCount(segments, '#9333ea');

  subtitlesProgressInterval = setInterval(() => {
    if (currentSegment < FAST_PROGRESS_END_SEGMENT) {
      segments[currentSegment].style.backgroundColor = '#9333ea';
      currentSegment++;
      const percent = Math.round((currentSegment / PROGRESS_SEGMENTS) * 100);
      if (percentLabel) percentLabel.textContent = `${percent}%`;
    }
    if (currentSegment >= FAST_PROGRESS_END_SEGMENT) {
      clearInterval(subtitlesProgressInterval);
      subtitlesProgressInterval = null;
      if (percentLabel) startSlowPercentCountSubtitles(percentLabel, segments);
    }
  }, speed);
}

function startSlowPercentCount(percentLabel, segments = null, segmentColor = '#3ea6ff') {
  let currentPercent = FAST_PROGRESS_END_PERCENT + 1;

  function scheduleNextPercent() {
    if (currentPercent <= 99) {
      const delay = getSlowProgressDelay(currentPercent);

      slowPercentInterval = setTimeout(() => {
        fillSegmentByPercent(segments, currentPercent, segmentColor);
        percentLabel.textContent = `${currentPercent}%`;

        // 🆕 הצגת הודעה ב-99%
        if (currentPercent === 99) {
          const message99 = document.getElementById('yc-progress-message-99');
          if (message99) {
            message99.style.display = 'block';
            requestAnimationFrame(repositionMinimizedProgressBars);
          }
        }

        currentPercent++;

        if (currentPercent <= 99) {
          scheduleNextPercent();
        }
      }, delay);
    }
  }

  scheduleNextPercent();
}

function createProgressBar(isDockerProcessing = false, forceNew = false, customText = null, options = {}) {
  const initialProgress = options?.initialProgress === true;
  const showLongVideoHint = shouldShowLongVideoProgressHint(null, {
    ...options,
    showLongVideoHint: options?.showLongVideoHint ?? (customText ? false : undefined)
  });

  // אם כבר יש Progress Bar פתוח
  if (progressBarElement) {
    if (forceNew) {
      // מבקשים progress bar חדש - מסירים את הישן קודם
      console.log('[Progress] Force new - removing existing progress bar');
      removeProgressBar();
    } else {
      console.log('[Progress] Progress bar already exists, skipping creation');
      updateLongVideoProgressHint(progressBarElement, showLongVideoHint);
      if (!initialProgress && progressBarElement.dataset.ycInitialProgress === 'true') {
        progressBarElement.dataset.ycInitialProgress = 'false';
        continueChordsProgress(isDockerProcessing ? SPEED_DOCKER : SPEED_R2);
      }
      return progressBarElement;
    }
  }

  console.log(`[Progress] Creating progress bar (Docker: ${isDockerProcessing}, customText: ${customText})`);

  // טעינת העדפת מזעור מ-storage
  let isMinimized = false;
  chrome.storage.local.get(['chordsProgressMinimized'], (result) => {
    isMinimized = result.chordsProgressMinimized || false;
    if (isMinimized && progressBarElement) {
      applyMinimizedStyle();
    }
  });

  // מציאת הוידאו כדי למקם את ה-progress bar בתוכו
  const videoPlayer = document.querySelector('#movie_player');

  // יצירת container
  const container = document.createElement('div');
  container.id = 'yc-download-progress';

  container.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 2147483647;
    background: rgba(0, 0, 0, 0.85);
    padding: 20px 30px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    direction: ltr;
    unicode-bidi: isolate;
    gap: 10px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    transition: all 0.3s ease;
  `;

  // הוספה לנגן הווידאו (אם קיים) או ל-body
  const parentElement = videoPlayer || document.body;

  // אם מוסיפים ל-body, צריך position: fixed
  if (!videoPlayer) {
    container.style.position = 'fixed';
  }

  // כפתור סגירה (X)
  const closeBtn = document.createElement('button');
  closeBtn.id = 'yc-chords-close-btn';
  closeBtn.innerHTML = '×';
  closeBtn.title = 'Close';
  closeBtn.style.cssText = `
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: #fff;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease;
  `;

  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = 'rgba(255, 0, 0, 0.3)';
  });

  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
  });

  closeBtn.addEventListener('click', () => {
    console.log('[Progress] ❌ Close button clicked - simulating chords button click');

    // פשוט קוראים ל-toggleChords - זה יעשה הכל!
    if (typeof toggleChords === 'function') {
      toggleChords();
    } else {
      console.warn('[Progress] toggleChords function not found');
    }
  });

  // כפתור מזעור
  const minimizeBtn = document.createElement('button');
  minimizeBtn.id = 'yc-chords-minimize-btn';
  minimizeBtn.innerHTML = '−';
  minimizeBtn.title = 'Minimize';
  minimizeBtn.style.cssText = `
    position: absolute;
    top: 8px;
    right: 40px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: #fff;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease;
  `;

  minimizeBtn.addEventListener('mouseenter', () => {
    minimizeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
  });

  minimizeBtn.addEventListener('mouseleave', () => {
    minimizeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
  });

  minimizeBtn.addEventListener('click', () => {
    isMinimized = !isMinimized;
    chrome.storage.local.set({ chordsProgressMinimized: isMinimized });

    if (isMinimized) {
      applyMinimizedStyle();
    } else {
      applyExpandedStyle();
    }
  });

  // טקסט - משתמש בטקסט מותאם אם קיים
  const label = document.createElement('div');
  label.id = 'yc-progress-label';
  label.textContent = customText || 'Preparing your song...';
  label.style.cssText = `
    color: #fff;
    font-size: 14px;
    font-weight: 500;
  `;
  container.appendChild(label);

  // Progress bar container - נראה כמו פס אחד חלק
  const barContainer = document.createElement('div');
  barContainer.id = 'yc-chords-progress-bar-container';
  barContainer.style.cssText = `
    display: flex;
    flex-direction: row;
    direction: ltr;
    unicode-bidi: isolate;
    gap: 0;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
    width: 280px;
    height: 8px;
  `;

  // יצירת סגמנטים - צמודים בלי רווחים, נראים כמו פס אחד
  for (let i = 0; i < PROGRESS_SEGMENTS; i++) {
    const segment = document.createElement('div');
    segment.className = 'progress-segment';
    segment.style.cssText = `
      flex: 1;
      height: 100%;
      direction: ltr;
      unicode-bidi: isolate;
      background: transparent;
      transition: background-color 0.1s ease;
    `;
    barContainer.appendChild(segment);
  }

  container.appendChild(barContainer);

  // אחוזים
  const percentLabel = document.createElement('div');
  percentLabel.id = 'yc-progress-percent';
  percentLabel.textContent = '0%';
  percentLabel.style.cssText = `
    color: #aaa;
    font-size: 12px;
  `;
  container.appendChild(percentLabel);

  // כפתורים - מוסיף בסוף
  container.appendChild(minimizeBtn);
  container.appendChild(closeBtn);

  const longVideoHint = createLongVideoProgressHint('yc-progress-long-video-hint', showLongVideoHint);
  longVideoHint.dataset.ycLongVideoHint = 'true';
  container.appendChild(longVideoHint);

  // 🆕 הודעת 99% (מוסתרת בהתחלה)
  const message99 = document.createElement('div');
  message99.id = 'yc-progress-message-99';
  message99.textContent = "Don't worry, it's not stuck - it may just take a bit longer sometimes";
  message99.style.cssText = `
    color: rgba(255, 255, 255, 0.78);
    font-size: 10px;
    text-align: center;
    max-width: 280px;
    width: 100%;
    line-height: 1.3;
    display: none;
    margin-top: 4px;
  `;
  container.appendChild(message99);

  const queueHint = document.createElement('div');
  queueHint.id = 'yc-progress-queue-message';
  queueHint.textContent = DEFAULT_QUEUE_HINT_TEXT;
  queueHint.style.cssText = `
    color: rgba(255, 255, 255, 0.78);
    font-size: 10px;
    text-align: center;
    max-width: 280px;
    width: 100%;
    line-height: 1.3;
    display: none;
    margin-top: 4px;
  `;
  container.appendChild(queueHint);
  applyProgressLtrIsolation(container, label, barContainer, percentLabel, longVideoHint, message99, queueHint);

  // פונקציות עזר למזעור/הרחבה
  function applyMinimizedStyle() {
    container.style.top = 'auto';
    container.style.bottom = '145px'; // CHORDS למטה
    container.style.left = 'auto';
    container.style.right = '20px';
    container.style.transform = 'none';
    container.style.padding = '12px 16px';
    container.style.flexDirection = 'row';
    container.style.gap = '8px';
    container.style.alignItems = 'center';
    container.style.width = 'auto'; // רוחב אוטומטי לפי התוכן
    container.style.maxWidth = '420px'; // 🆕 מגביל רוחב כדי שהודעת 99% תרד
    container.style.flexWrap = 'wrap'; // 🆕 הודעת 99% תרד למטה

    label.style.fontSize = '12px';
    label.style.width = '140px'; // רוחב קבוע לטקסט
    label.style.flexShrink = '0';
    barContainer.style.width = '120px';
    barContainer.style.height = '6px';
    percentLabel.style.fontSize = '11px';
    percentLabel.style.width = '35px'; // רוחב קבוע ל-%
    percentLabel.style.textAlign = 'right';

    minimizeBtn.style.position = 'relative';
    minimizeBtn.style.top = 'auto';
    minimizeBtn.style.right = 'auto';
    minimizeBtn.style.width = '20px';
    minimizeBtn.style.height = '20px';
    minimizeBtn.style.fontSize = '14px';
    minimizeBtn.innerHTML = '□';
    minimizeBtn.title = 'Expand';

    closeBtn.style.position = 'relative';
    closeBtn.style.top = 'auto';
    closeBtn.style.right = 'auto';
    closeBtn.style.width = '20px';
    closeBtn.style.height = '20px';
    closeBtn.style.fontSize = '16px';

    message99.style.maxWidth = '100%';
    queueHint.style.maxWidth = '100%';
    longVideoHint.style.maxWidth = '100%';

    // Stable minimized layout: fixed columns + dynamic stacking to avoid overlap/jump
    container.dataset.ycMinimized = 'true';
    container.style.padding = '10px 14px';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = '140px 120px 35px 20px 20px';
    container.style.gridTemplateRows = 'auto auto auto auto';
    container.style.columnGap = '8px';
    container.style.rowGap = '6px';
    container.style.alignItems = 'center';
    container.style.width = 'auto';
    container.style.maxWidth = 'none';

    label.style.width = '140px';
    label.style.gridColumn = '1';
    label.style.gridRow = '1';

    barContainer.style.width = '120px';
    barContainer.style.height = '6px';
    barContainer.style.gridColumn = '2';
    barContainer.style.gridRow = '1';

    percentLabel.style.width = '35px';
    percentLabel.style.textAlign = 'right';
    percentLabel.style.gridColumn = '3';
    percentLabel.style.gridRow = '1';

    minimizeBtn.innerHTML = '+';
    minimizeBtn.style.gridColumn = '4';
    minimizeBtn.style.gridRow = '1';

    closeBtn.style.gridColumn = '5';
    closeBtn.style.gridRow = '1';

    longVideoHint.style.gridColumn = '1 / -1';
    longVideoHint.style.gridRow = '2';
    longVideoHint.style.maxWidth = 'none';
    longVideoHint.style.width = '100%';
    longVideoHint.style.marginTop = '0';

    message99.style.gridColumn = '1 / -1';
    message99.style.gridRow = '3';
    message99.style.maxWidth = 'none';
    message99.style.width = '100%';
    message99.style.marginTop = '0';

    queueHint.style.gridColumn = '1 / -1';
    queueHint.style.gridRow = '4';
    queueHint.style.maxWidth = 'none';
    queueHint.style.width = '100%';
    queueHint.style.marginTop = '0';

    requestAnimationFrame(repositionMinimizedProgressBars);
  }

  function applyExpandedStyle() {
    container.style.top = '50%';
    container.style.bottom = 'auto';
    container.style.left = '50%';
    container.style.right = 'auto';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.padding = '20px 30px';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    container.style.alignItems = 'center';

    label.style.fontSize = '14px';
    barContainer.style.width = '280px';
    barContainer.style.height = '8px';
    percentLabel.style.fontSize = '12px';

    minimizeBtn.style.position = 'absolute';
    minimizeBtn.style.top = '8px';
    minimizeBtn.style.right = '40px';
    minimizeBtn.style.width = '24px';
    minimizeBtn.style.height = '24px';
    minimizeBtn.style.fontSize = '18px';
    minimizeBtn.innerHTML = '−';
    minimizeBtn.title = 'Minimize';

    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '8px';
    closeBtn.style.right = '8px';
    closeBtn.style.width = '24px';
    closeBtn.style.height = '24px';
    closeBtn.style.fontSize = '20px';

    message99.style.maxWidth = '280px';
    queueHint.style.maxWidth = '280px';
    longVideoHint.style.maxWidth = '280px';

    // Restore expanded layout from minimized overrides
    container.dataset.ycMinimized = 'false';
    container.style.display = 'flex';
    container.style.gridTemplateColumns = '';
    container.style.gridTemplateRows = '';
    container.style.columnGap = '';
    container.style.rowGap = '';

    label.style.width = '';
    label.style.gridColumn = '';
    label.style.gridRow = '';

    barContainer.style.gridColumn = '';
    barContainer.style.gridRow = '';

    percentLabel.style.width = '';
    percentLabel.style.textAlign = '';
    percentLabel.style.gridColumn = '';
    percentLabel.style.gridRow = '';

    minimizeBtn.innerHTML = '-';
    minimizeBtn.style.gridColumn = '';
    minimizeBtn.style.gridRow = '';

    closeBtn.style.gridColumn = '';
    closeBtn.style.gridRow = '';

    message99.style.width = '100%';
    message99.style.gridColumn = '';
    message99.style.gridRow = '';
    message99.style.marginTop = '4px';

    queueHint.style.width = '100%';
    queueHint.style.gridColumn = '';
    queueHint.style.gridRow = '';
    queueHint.style.marginTop = '4px';

    longVideoHint.style.width = '100%';
    longVideoHint.style.gridColumn = '';
    longVideoHint.style.gridRow = '';
    longVideoHint.style.marginTop = '4px';

    requestAnimationFrame(repositionMinimizedProgressBars);
  }

  parentElement.appendChild(container);
  progressBarElement = container;
  progressBarElement.dataset.ycInitialProgress = initialProgress ? 'true' : 'false';

  // התחלת אנימציה - מהירות שונה לפי מצב
  const segments = barContainer.querySelectorAll('.progress-segment');
  const speed = isDockerProcessing ? SPEED_DOCKER : SPEED_R2;

  if (initialProgress) {
    startInitialChordsProgress(percentLabel, segments);
  } else {
    continueChordsProgress(speed);
  }

  return container;
}

// 🆕 יצירת Progress Bar לכתוביות Whisper מקומי - סגול
function createSubtitlesProgressBar(durationMinutes = null, options = {}) {
  const initialProgress = options?.initialProgress === true;
  const normalizedDurationMinutes = normalizeProgressDurationMinutes(durationMinutes);
  const showLongVideoHint = shouldShowLongVideoProgressHint(normalizedDurationMinutes, options);

  // אם כבר יש Progress Bar של כתוביות פתוח
  if (subtitlesProgressBarElement) {
    console.log('[Progress] Subtitles progress bar already exists, skipping creation');
    updateLongVideoProgressHint(subtitlesProgressBarElement, showLongVideoHint);
    if (!initialProgress && subtitlesProgressBarElement.dataset.ycInitialProgress === 'true') {
      subtitlesProgressBarElement.dataset.ycInitialProgress = 'false';
      continueSubtitlesProgress(calculateDockerSpeed('gemini', normalizedDurationMinutes || 3));
    }
    return subtitlesProgressBarElement;
  }

  console.log(`[Progress] Creating local Whisper progress bar for ${(normalizedDurationMinutes || 3).toFixed(1)} min video`);

  // טעינת העדפת מזעור מ-storage
  let isMinimized = false;
  chrome.storage.local.get(['geminiProgressMinimized'], (result) => {
    isMinimized = result.geminiProgressMinimized || false;
    if (isMinimized && subtitlesProgressBarElement) {
      applyMinimizedStyle();
    }
  });

  // מציאת הוידאו כדי למקם את ה-progress bar בתוכו
  const videoPlayer = document.querySelector('#movie_player');

  // יצירת container
  const container = document.createElement('div');
  container.id = 'yc-subtitles-progress';

  // בדיקה אם יש גם Progress Bar של אקורדים
  const hasChordsBar = !!progressBarElement;

  // אם יש CHORDS bar, מציבים את SUBTITLES bar ממש מעליו
  // CHORDS bar ממורכז (top: 50%), אז SUBTITLES צריך להיות קצת מעליו
  const topPosition = hasChordsBar ? 'calc(50% - 100px)' : '50%';
  const transform = 'translate(-50%, -50%)';

  container.style.cssText = `
    position: absolute;
    top: ${topPosition};
    left: 50%;
    transform: ${transform};
    z-index: 2147483647;
    background: rgba(0, 0, 0, 0.85);
    padding: 20px 30px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    direction: ltr;
    unicode-bidi: isolate;
    gap: 10px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    transition: all 0.3s ease;
  `;

  // הוספה לנגן הווידאו (אם קיים) או ל-body
  const parentElement = videoPlayer || document.body;

  // אם מוסיפים ל-body, צריך position: fixed
  if (!videoPlayer) {
    container.style.position = 'fixed';
  }

  // כפתור סגירה (X)
  const closeBtn = document.createElement('button');
  closeBtn.id = 'yc-subtitles-close-btn';
  closeBtn.innerHTML = '×';
  closeBtn.title = 'Close';
  closeBtn.style.cssText = `
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: #fff;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease;
  `;

  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = 'rgba(255, 0, 0, 0.3)';
  });

  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
  });

  closeBtn.addEventListener('click', () => {
    console.log('[Progress] ❌ Subtitles progress bar close clicked - closing subtitle button');

    // Remove progress bar
    removeSubtitlesProgressBar();

    // Turn off subtitle button (simulate button click)
    const subtitleButton = document.querySelector('[data-btn="subtitle"] .ytp-subtitle-button');
    if (subtitleButton) {
      // Update subtitle state
      if (window.subtitleState) {
        window.subtitleState.isVisible = false;
        if (window.subtitleState.overlay) {
          window.subtitleState.overlay.style.display = "none";
        }
      }

      // Remove red button class (correct class name!)
      subtitleButton.classList.remove('subtitle-button-active');

      console.log('[Progress] ✅ Subtitle button closed');
    } else {
      console.warn('[Progress] ⚠️ Subtitle button not found');
    }
  });

  // כפתור מזעור
  const minimizeBtn = document.createElement('button');
  minimizeBtn.id = 'yc-subtitles-minimize-btn';
  minimizeBtn.innerHTML = '−'; // minus sign for minimize
  minimizeBtn.title = 'Minimize';
  minimizeBtn.style.cssText = `
    position: absolute;
    top: 8px;
    right: 40px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: #fff;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease;
  `;

  minimizeBtn.addEventListener('mouseenter', () => {
    minimizeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
  });

  minimizeBtn.addEventListener('mouseleave', () => {
    minimizeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
  });

  minimizeBtn.addEventListener('click', () => {
    isMinimized = !isMinimized;
    chrome.storage.local.set({ geminiProgressMinimized: isMinimized });

    if (isMinimized) {
      applyMinimizedStyle();
    } else {
      applyExpandedStyle();
    }
  });

  // טקסט
  const label = document.createElement('div');
  label.id = 'yc-subtitles-progress-label';
  label.textContent = options?.label || 'Whisper large-v2...';
  label.style.cssText = `
    color: #fff;
    font-size: 14px;
    font-weight: 500;
  `;
  container.appendChild(label);

  // Progress bar container
  const barContainer = document.createElement('div');
  barContainer.id = 'yc-subtitles-progress-bar-container';
  barContainer.style.cssText = `
    display: flex;
    flex-direction: row;
    direction: ltr;
    unicode-bidi: isolate;
    gap: 0;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
    width: 280px;
    height: 8px;
  `;

  // יצירת סגמנטים
  for (let i = 0; i < PROGRESS_SEGMENTS; i++) {
    const segment = document.createElement('div');
    segment.className = 'subtitles-progress-segment';
    segment.style.cssText = `
      flex: 1;
      height: 100%;
      direction: ltr;
      unicode-bidi: isolate;
      background: transparent;
      transition: background-color 0.1s ease;
    `;
    barContainer.appendChild(segment);
  }

  container.appendChild(barContainer);

  // אחוזים
  const percentLabel = document.createElement('div');
  percentLabel.id = 'yc-subtitles-progress-percent';
  percentLabel.textContent = '0%';
  percentLabel.style.cssText = `
    color: #aaa;
    font-size: 12px;
  `;
  container.appendChild(percentLabel);

  // כפתורים - מוסיף בסוף כדי שיהיו אחרי ה-% במצב ממוזער
  container.appendChild(minimizeBtn);
  container.appendChild(closeBtn);

  const longVideoHint = createLongVideoProgressHint('yc-subtitles-progress-long-video-hint', showLongVideoHint);
  longVideoHint.dataset.ycLongVideoHint = 'true';
  container.appendChild(longVideoHint);

  // 🆕 הודעת 99% (מוסתרת בהתחלה)
  const message99 = document.createElement('div');
  message99.id = 'yc-subtitles-progress-message-99';
  message99.textContent = "Don't worry, it's not stuck - it may just take a bit longer sometimes";
  message99.style.cssText = `
    color: rgba(255, 255, 255, 0.78);
    font-size: 10px;
    text-align: center;
    max-width: 280px;
    width: 100%;
    line-height: 1.3;
    display: none;
    margin-top: 4px;
  `;
  container.appendChild(message99);
  applyProgressLtrIsolation(container, label, barContainer, percentLabel, longVideoHint, message99);

  // פונקציות עזר למזעור/הרחבה
  function applyMinimizedStyle() {
    container.style.top = 'auto';
    container.style.bottom = '190px'; // GEMINI צמוד מעל CHORDS (שנמצא ב-145px)
    container.style.left = 'auto';
    container.style.right = '20px';
    container.style.transform = 'none';
    container.style.padding = '12px 16px';
    container.style.flexDirection = 'row';
    container.style.gap = '8px';
    container.style.alignItems = 'center';
    container.style.width = 'auto'; // רוחב אוטומטי לפי התוכן
    container.style.maxWidth = '420px'; // 🆕 מגביל רוחב כדי שהודעת 99% תרד
    container.style.flexWrap = 'wrap'; // 🆕 הודעת 99% תרד למטה

    label.style.fontSize = '12px';
    label.style.width = '140px'; // רוחב קבוע לטקסט
    label.style.flexShrink = '0';
    barContainer.style.width = '120px';
    barContainer.style.height = '6px';
    percentLabel.style.fontSize = '11px';
    percentLabel.style.width = '35px'; // רוחב קבוע ל-%
    percentLabel.style.textAlign = 'right';
    // message99 - לא משנים display, תישאר מוצגת ב-99%

    // במצב ממוזער, הכפתורים הופכים לחלק מה-flexbox (לא absolute)
    minimizeBtn.style.position = 'relative';
    minimizeBtn.style.top = 'auto';
    minimizeBtn.style.right = 'auto';
    minimizeBtn.style.width = '20px';
    minimizeBtn.style.height = '20px';
    minimizeBtn.style.fontSize = '14px';
    minimizeBtn.innerHTML = '□';
    minimizeBtn.title = 'Expand';

    closeBtn.style.position = 'relative';
    closeBtn.style.top = 'auto';
    closeBtn.style.right = 'auto';
    closeBtn.style.width = '20px';
    closeBtn.style.height = '20px';
    closeBtn.style.fontSize = '16px';
    longVideoHint.style.maxWidth = '100%';
    message99.style.maxWidth = '100%';

    // Stable minimized layout: fixed columns + dynamic stacking to avoid overlap/jump
    container.dataset.ycMinimized = 'true';
    container.style.padding = '10px 14px';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = '140px 120px 35px 20px 20px';
    container.style.gridTemplateRows = 'auto auto auto';
    container.style.columnGap = '8px';
    container.style.rowGap = '6px';
    container.style.alignItems = 'center';
    container.style.width = 'auto';
    container.style.maxWidth = 'none';

    label.style.width = '140px';
    label.style.gridColumn = '1';
    label.style.gridRow = '1';

    barContainer.style.width = '120px';
    barContainer.style.height = '6px';
    barContainer.style.gridColumn = '2';
    barContainer.style.gridRow = '1';

    percentLabel.style.width = '35px';
    percentLabel.style.textAlign = 'right';
    percentLabel.style.gridColumn = '3';
    percentLabel.style.gridRow = '1';

    minimizeBtn.innerHTML = '+';
    minimizeBtn.style.gridColumn = '4';
    minimizeBtn.style.gridRow = '1';

    closeBtn.style.gridColumn = '5';
    closeBtn.style.gridRow = '1';

    longVideoHint.style.gridColumn = '1 / -1';
    longVideoHint.style.gridRow = '2';
    longVideoHint.style.maxWidth = 'none';
    longVideoHint.style.width = '100%';
    longVideoHint.style.marginTop = '0';

    message99.style.gridColumn = '1 / -1';
    message99.style.gridRow = '3';
    message99.style.maxWidth = 'none';
    message99.style.width = '100%';
    message99.style.marginTop = '0';

    requestAnimationFrame(repositionMinimizedProgressBars);
  }

  function applyExpandedStyle() {
    const hasChordsBar = !!progressBarElement;
    const topPosition = hasChordsBar ? 'calc(50% - 100px)' : '50%';

    container.style.top = topPosition;
    container.style.bottom = 'auto';
    container.style.left = '50%';
    container.style.right = 'auto';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.padding = '20px 30px';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    container.style.alignItems = 'center';

    label.style.fontSize = '14px';
    barContainer.style.width = '280px';
    barContainer.style.height = '8px';
    percentLabel.style.fontSize = '12px';

    // במצב מורחב, הכפתורים חוזרים להיות absolute בפינה
    minimizeBtn.style.position = 'absolute';
    minimizeBtn.style.top = '8px';
    minimizeBtn.style.right = '40px';
    minimizeBtn.style.width = '24px';
    minimizeBtn.style.height = '24px';
    minimizeBtn.style.fontSize = '18px';
    minimizeBtn.innerHTML = '−';
    minimizeBtn.title = 'Minimize';

    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '8px';
    closeBtn.style.right = '8px';
    closeBtn.style.width = '24px';
    closeBtn.style.height = '24px';
    closeBtn.style.fontSize = '20px';
    longVideoHint.style.maxWidth = '280px';
    message99.style.maxWidth = '280px';

    // Restore expanded layout from minimized overrides
    container.dataset.ycMinimized = 'false';
    container.style.display = 'flex';
    container.style.gridTemplateColumns = '';
    container.style.gridTemplateRows = '';
    container.style.columnGap = '';
    container.style.rowGap = '';

    label.style.width = '';
    label.style.gridColumn = '';
    label.style.gridRow = '';

    barContainer.style.gridColumn = '';
    barContainer.style.gridRow = '';

    percentLabel.style.width = '';
    percentLabel.style.textAlign = '';
    percentLabel.style.gridColumn = '';
    percentLabel.style.gridRow = '';

    minimizeBtn.innerHTML = '-';
    minimizeBtn.style.gridColumn = '';
    minimizeBtn.style.gridRow = '';

    closeBtn.style.gridColumn = '';
    closeBtn.style.gridRow = '';

    message99.style.width = '100%';
    message99.style.gridColumn = '';
    message99.style.gridRow = '';
    message99.style.marginTop = '4px';

    longVideoHint.style.width = '100%';
    longVideoHint.style.gridColumn = '';
    longVideoHint.style.gridRow = '';
    longVideoHint.style.marginTop = '4px';

    requestAnimationFrame(repositionMinimizedProgressBars);
  }

  parentElement.appendChild(container);
  subtitlesProgressBarElement = container;
  subtitlesProgressBarElement.dataset.ycInitialProgress = initialProgress ? 'true' : 'false';

  // חישוב מהירות דינמית לפי אורך הסרטון
  const speed = calculateDockerSpeed('gemini', normalizedDurationMinutes || 3);

  const segments = barContainer.querySelectorAll('.subtitles-progress-segment');
  if (initialProgress) {
    startInitialSubtitlesProgress(percentLabel, segments);
  } else {
    continueSubtitlesProgress(speed);
  }

  return container;
}

// עדכון פס ההתקדמות לפי ה-job האמיתי של Whisper המקומי.
// אם אין עדיין update מהשירות, פס ההתקדמות האנימטיבי נשאר פעיל; ברגע שמגיע
// עדכון job אנחנו עוצרים את האנימציה ומציגים את הערך שהשירות דיווח עליו.
function updateSubtitlesProgress(job = {}) {
  if (!subtitlesProgressBarElement) return;

  const progress = Math.max(0, Math.min(100, Math.round(Number(job.progress) || 0)));
  const segments = subtitlesProgressBarElement.querySelectorAll('.subtitles-progress-segment');
  const percentLabel = subtitlesProgressBarElement.querySelector('#yc-subtitles-progress-percent');
  const label = subtitlesProgressBarElement.querySelector('#yc-subtitles-progress-label');
  const stageLabels = {
    queued: 'Whisper large-v2 — ממתין בתור...',
    download: 'Whisper large-v2 — מוריד אודיו...',
    'compute-queue': 'Whisper large-v2 — ממתין לתור העיבוד...',
    model: 'Whisper large-v2 — טוען מודל...',
    whisper: 'Whisper large-v2 — מתמלל...',
    ready: 'Whisper large-v2 — נשמר במחשב',
    failed: 'Whisper large-v2 — התמלול נכשל',
    cancelled: 'Whisper large-v2 — בוטל'
  };

  stopSubtitlesProgressTimers();
  fillSegmentByPercent(segments, progress, '#9333ea');
  if (percentLabel) percentLabel.textContent = `${progress}%`;
  if (label) label.textContent = stageLabels[job.stage] || 'Whisper large-v2 — מעבד...';

  if (progress >= 99 && subtitlesProgressBarElement) {
    const message99 = subtitlesProgressBarElement.querySelector('#yc-subtitles-progress-message-99');
    if (message99) message99.style.display = 'block';
  }

  // Whisper does not expose a per-frame percentage while decoding a segment.
  // Keep the UI moving between service checkpoints, but never pretend that
  // the job is complete before the backend reports 100%.
  if (progress < 100 && job.status !== 'failed' && job.status !== 'cancelled') {
    const cap = job.stage === 'download'
      ? Math.max(progress, 22)
      : job.stage === 'whisper'
        ? 95
        : Math.max(progress, 5);
    let displayedProgress = progress;
    subtitlesProgressInterval = setInterval(() => {
      if (!subtitlesProgressBarElement || displayedProgress >= cap) {
        clearInterval(subtitlesProgressInterval);
        subtitlesProgressInterval = null;
        return;
      }
      displayedProgress = Math.min(cap, displayedProgress + 1);
      fillSegmentByPercent(segments, displayedProgress, '#9333ea');
      if (percentLabel) percentLabel.textContent = `${displayedProgress}%`;
    }, job.stage === 'whisper' ? 1200 : 700);
  }
}

// 🆕 ספירה איטית לכתוביות
function startSlowPercentCountSubtitles(percentLabel, segments = null) {
  let currentPercent = FAST_PROGRESS_END_PERCENT + 1;

  function scheduleNextPercent() {
    if (currentPercent <= 99) {
      const delay = getSlowProgressDelay(currentPercent);

      subtitlesSlowPercentInterval = setTimeout(() => {
        fillSegmentByPercent(segments, currentPercent, '#9333ea');
        percentLabel.textContent = `${currentPercent}%`;

        // 🆕 הצגת הודעה כשמציגים 99%
        if (currentPercent === 99 && subtitlesProgressBarElement) {
          const message99 = subtitlesProgressBarElement.querySelector('#yc-subtitles-progress-message-99');
          if (message99) {
            message99.style.display = 'block';
            requestAnimationFrame(repositionMinimizedProgressBars);
          }
        }

        currentPercent++;

        if (currentPercent <= 99) {
          scheduleNextPercent();
        }
      }, delay);
    }
  }

  scheduleNextPercent();
}

// 🆕 השלמת Progress Bar של כתוביות
function completeSubtitlesProgressBar() {
  if (subtitlesProgressBarElement) {
    // עצירת intervals
    if (subtitlesProgressInterval) {
      clearInterval(subtitlesProgressInterval);
      subtitlesProgressInterval = null;
    }
    if (subtitlesSlowPercentInterval) {
      clearTimeout(subtitlesSlowPercentInterval);
      subtitlesSlowPercentInterval = null;
    }

    // עדכון ל-100%
    const segments = subtitlesProgressBarElement.querySelectorAll('.subtitles-progress-segment');
    segments.forEach(seg => {
      seg.style.backgroundColor = '#9333ea'; // סגול
    });
    const percentLabel = subtitlesProgressBarElement.querySelector('#yc-subtitles-progress-percent');
    if (percentLabel) {
      percentLabel.textContent = '100%';
    }

    // הסרה אחרי 500ms
    setTimeout(() => {
      removeSubtitlesProgressBar();
    }, 500);
  }
}

// 🆕 הסרת Progress Bar של כתוביות
function removeSubtitlesProgressBar() {
  if (subtitlesProgressBarElement) {
    console.log('[Progress] Removing subtitles progress bar');

    // עצירת intervals
    if (subtitlesProgressInterval) {
      clearInterval(subtitlesProgressInterval);
      subtitlesProgressInterval = null;
    }
    if (subtitlesSlowPercentInterval) {
      clearTimeout(subtitlesSlowPercentInterval);
      subtitlesSlowPercentInterval = null;
    }

    // הסרת האלמנט
    subtitlesProgressBarElement.remove();
    subtitlesProgressBarElement = null;
    requestAnimationFrame(repositionMinimizedProgressBars);
  }
}

// פונקציה להחלפה למצב Docker - עם חישוב דינמי לפי סוג ואורך
function switchToDockerMode(type = 'lyrics', durationMinutes = 3) {
  if (progressBarElement) {
    // חישוב מהירות לפי סוג ואורך
    const dockerSpeed = calculateDockerSpeed(type, durationMinutes);
    progressBarElement.dataset.ycInitialProgress = 'false';
    continueChordsProgress(dockerSpeed);
  }
}

function completeProgressBar() {
  // אם יש lyrics בהמתנה, לא סוגרים את ה-progress bar
  if (pendingLyricsProcessing) {
    console.log('[Progress] Skipping complete - pending lyrics processing');
    return;
  }

  if (progressBarElement) {
    stopChordsProgressTimers();

    // מילוי כל הסגמנטים
    const segments = progressBarElement.querySelectorAll('.progress-segment');
    segments.forEach((seg) => (seg.style.backgroundColor = '#3ea6ff'));

    // עדכון ל-100%
    const percentLabel = progressBarElement.querySelector('#yc-progress-percent');
    if (percentLabel) {
      percentLabel.textContent = '100%';
    }

    // הסרה אחרי 300ms
    setTimeout(() => {
      removeProgressBar();
    }, 300);
  }
}

// פונקציה לסימון שיש lyrics בהמתנה
function setPendingLyrics(pending) {
  pendingLyricsProcessing = pending;
  console.log(`[Progress] Pending lyrics: ${pending}`);
}

function setChordsQueueHint(statusOrText = null) {
  if (!progressBarElement) return false;
  const queueHint = progressBarElement.querySelector('#yc-progress-queue-message');
  if (!queueHint) return false;

  if (!statusOrText) {
    queueHint.style.display = 'none';
    queueHint.textContent = DEFAULT_QUEUE_HINT_TEXT;
    requestAnimationFrame(repositionMinimizedProgressBars);
    return true;
  }

  let text = statusOrText;
  if (statusOrText === 'queued') {
    text = DEFAULT_QUEUE_HINT_TEXT;
  } else if (statusOrText === 'processing') {
    text = 'Processing started... This may take a little longer.';
  }

  queueHint.textContent = text;
  queueHint.style.display = 'block';
  requestAnimationFrame(repositionMinimizedProgressBars);
  return true;
}

function removeProgressBar() {
  stopChordsProgressTimers();
  if (progressBarElement) {
    progressBarElement.remove();
    progressBarElement = null;
    requestAnimationFrame(repositionMinimizedProgressBars);
  }
  // איפוס ה-flag
  pendingLyricsProcessing = false;
}

// 🔥 FIX #3: Cleanup ALL progress bars (chords + subtitles)
function cleanupAllProgressBars() {
  // Clear chords progress bar
  stopChordsProgressTimers();
  if (progressBarElement) {
    progressBarElement.remove();
    progressBarElement = null;
    requestAnimationFrame(repositionMinimizedProgressBars);
  }

  // Clear subtitles progress bar
  stopSubtitlesProgressTimers();
  if (subtitlesProgressBarElement) {
    subtitlesProgressBarElement.remove();
    subtitlesProgressBarElement = null;
    requestAnimationFrame(repositionMinimizedProgressBars);
  }

  // Reset flags
  pendingLyricsProcessing = false;

  if (DEBUG) console.log('[extractorModule] All progress bars cleaned up');
}

// Export the cleanup function
window.extractorModule = window.extractorModule || {};
window.extractorModule.cleanupAllProgressBars = cleanupAllProgressBars;

/* --------------------------------------------------------------------------- */
/* 1. טעינת אקורדים מהשרת ושמירה ב-IndexedDB                                  */
/* --------------------------------------------------------------------------- */
export async function fetchAndSaveChords(videoId, options = {}) {
  const {
    skipCompleteProgressBar = false,
    allowPaidResultRecovery = false
  } = options;
  const externalSignal = options.signal || null;
  const localChordsAbortController = new AbortController();
  currentChordsAbortController = localChordsAbortController;
  const chordsSignal = localChordsAbortController.signal;
  const abortFromExternalSignal = () => localChordsAbortController.abort();

  if (externalSignal?.aborted) {
    currentChordsAbortController = null;
    return null;
  }
  externalSignal?.addEventListener?.('abort', abortFromExternalSignal, { once: true });

  if (!window.ycAuth) {
    console.error('[Extractor] ycAuth not available');
    currentChordsAbortController = null;
    externalSignal?.removeEventListener?.('abort', abortFromExternalSignal);
    return null;
  }

  console.log(`[Extractor] Fetching chords for ${videoId}...`);

  // Progress Bar נוצר ב-auth.js - שם יודעים אם זה R2 או Docker

  try {
    if (chordsSignal.aborted) {
      return null;
    }

    const durationSeconds = window.ytPlayer?.getDuration?.() || 180;
    if (!allowPaidResultRecovery && window.__ycMarkFreePaidResultRecoveryCandidate && window.ycAuth?.checkQuotaLocal) {
      try {
        const localQuota = window.ycAuth.checkQuotaLocal('chords');
        await window.__ycMarkFreePaidResultRecoveryCandidate(videoId, localQuota, 'extractor-get-chords');
      } catch (recoveryMarkError) {
        console.warn('[Extractor] Failed to mark free paid-result recovery candidate:', recoveryMarkError);
      }
    }

    const result = await window.ycAuth.getChords(videoId, {
      enqueueIfMissing: true,
      durationSeconds,
      signal: chordsSignal,
      allowPaidResultRecovery
    });

    if (chordsSignal.aborted) {
      return null;
    }

    if (!result.success) {
      removeProgressBar(); // הסרה במקרה של שגיאה
      if (result.aborted) {
        return null;
      }
      if (result.localServiceUnavailable) {
        const localError = new Error(result.error || 'YouChords Local is not running.');
        localError.code = 'LOCAL_SERVICE_UNAVAILABLE';
        throw localError;
      }
      if (result.quotaExhausted) {
        const error = new Error('QUOTA_EXHAUSTED');
        error.shouldDeleteChordsDB = result.shouldDeleteChordsDB;
        throw error;
      }
      if (result.insufficientCredits || result.needsUpgrade) {
        const error = new Error('QUOTA_EXHAUSTED');
        error.shouldDeleteChordsDB = result.shouldDeleteChordsDB !== false;
        throw error;
      }
      if (result.needsLogin) throw new Error('NEEDS_LOGIN');
      if (result.processingFailed) {
        const rawProcessingError = String(result.error || '').trim();
        const allowedProcessingErrors = new Set([
          "This video is private and can't be processed.",
          'This video is currently unavailable.',
          "Some songs are currently unavailable. We're aware of this and working on it."
        ]);
        const userFacingProcessingError = window.__YC_LOCAL_ONLY__
          ? (rawProcessingError || 'Local processing failed. Check the Docker logs for details.')
          : (allowedProcessingErrors.has(rawProcessingError)
            ? rawProcessingError
            : 'Processing failed. Please try again later.');
        const processingError = new Error(userFacingProcessingError);
        processingError.code = 'PROCESSING_FAILED';
        throw processingError;
      }
      if (result.unsupportedVideo || result.precheckRejected) {
        const rawUnsupportedError = String(result.error || '').trim();
        const userFacingUnsupportedError = rawUnsupportedError ||
          "Some songs are currently unavailable. We're aware of this and working on it.";
        const unsupportedError = new Error(userFacingUnsupportedError);
        unsupportedError.code = 'PROCESSING_FAILED';
        unsupportedError.hardBlockReason = result.hardBlockReason || null;
        throw unsupportedError;
      }
      if (result.notInCache) {
        console.log(`[Extractor] Chords not found for ${videoId}`);
        return null;
      }
      throw new Error(result.error || 'Unknown error');
    }

    // The local companion returns the packed JSON directly.
    const chordsData = normalizeChordPayload(result.chordsData);

    if (!chordsData) {
      removeProgressBar();
      console.error('[Extractor] No chords data in response');
      return null;
    }

    const chordTextObject = chordsData.chordText && typeof chordsData.chordText === 'object'
      ? chordsData.chordText
      : null;
    const regularChordText = chordsData.regular || chordTextObject?.regular || (typeof chordsData.chordText === 'string' ? chordsData.chordText : '') || "";
    const regularPlusChordText = chordsData.regularPlus || chordsData.chordTextRegularPlus || chordTextObject?.regularPlus || regularChordText;
    const harmonicChordText = chordsData.harmonic || chordsData.chordTextHarmonic || chordTextObject?.harmonic || regularChordText;
    const harmonicPlusChordText = chordsData.harmonicPlus || chordsData.chordTextHarmonicPlus || chordTextObject?.harmonicPlus || harmonicChordText;

    // שמירה ב-IndexedDB
    const dataToSave = {
      videoId,
      chordText: regularChordText,
      chordTextRegularPlus: regularPlusChordText,
      chordTextHarmonic: harmonicChordText,
      chordTextHarmonicPlus: harmonicPlusChordText,
      chordEngineVersion: chordsData.chordEngineVersion || chordsData.engineVersion || null,
      tuningValue: chordsData.tuning || chordsData.tuningValue || '0',
      hasNonStandardTuning: chordsData.hasNonStandardTuning || false,  // Flag for non-Pro+ users
      capoChords: chordsData.capoChords || null,  // Backward compatibility for older R2 files
      chordPositions: chordsData.chordPositions || null,  // Generated client-side when missing
      offset: 0,
      timestamp: Date.now(),
      source: window.__YC_LOCAL_ONLY__ ? 'local' : 'r2',
      shouldDeleteChordsDBAfter: result.shouldDeleteChordsDBAfter  // Flag to delete IndexedDB after displaying
    };

    await window.databaseManager.saveToDatabase('chords', videoId, dataToSave);
    console.log(`[Extractor] ✅ Chords saved for ${videoId}`);

    // השלמת Progress Bar - רק אם לא ביקשו לדלג (כי יש עוד עבודה)
    if (!skipCompleteProgressBar) {
      completeProgressBar();
    }

    return dataToSave;
  } catch (error) {
    if (error.name === 'AbortError' || chordsSignal.aborted) {
      console.log('[Extractor] ⚠️ Chords request was aborted');
      return null;
    }
    removeProgressBar(); // הסרה במקרה של שגיאה
    console.error('[Extractor] fetchAndSaveChords error:', error);
    throw error;
  } finally {
    externalSignal?.removeEventListener?.('abort', abortFromExternalSignal);
    if (currentChordsAbortController?.signal === chordsSignal) {
      currentChordsAbortController = null;
    }
  }
}

/* --------------------------------------------------------------------------- */
/* 2. תמלול Whisper מקומי ושמירה ב-IndexedDB                                  */
/* --------------------------------------------------------------------------- */
export async function fetchAndSaveLyrics(videoId, durationMinutes, languageCode = null, isAutoGenerated = null, options = {}) {
  console.log(`[Extractor] Transcribing ${videoId} with local Whisper...`);

  currentLyricsAbortController = new AbortController();
  const signal = currentLyricsAbortController.signal;

  try {
    if (signal.aborted) return null;
    if (!window.ycWhisperTranscription?.transcribeVideo) {
      await window.dynamicLoader?.loadGroup?.('whisper');
    }
    if (!window.ycWhisperTranscription?.transcribeVideo) {
      throw new Error('Local Whisper module is not available.');
    }

    let requestedWhisperLanguage = languageCode || options.language || '';
    if (!requestedWhisperLanguage && typeof window.ycWhisperTranscription.getLanguagePreference === 'function') {
      requestedWhisperLanguage = await window.ycWhisperTranscription.getLanguagePreference();
    }
    let requestedWhisperModel = options.whisperModel || options.model || '';
    if (!requestedWhisperModel && typeof window.ycWhisperTranscription.getModelPreference === 'function') {
      requestedWhisperModel = await window.ycWhisperTranscription.getModelPreference();
    }
    const normalizedWhisperModel = typeof window.ycWhisperTranscription.normalizeModel === 'function'
      ? window.ycWhisperTranscription.normalizeModel(requestedWhisperModel)
      : (String(requestedWhisperModel || 'large-v2').trim().toLowerCase() === 'large-v3' ? 'large-v3' : 'large-v2');
    const normalizedWhisperLanguage = typeof window.ycWhisperTranscription.normalizeLanguage === 'function'
      ? window.ycWhisperTranscription.normalizeLanguage(requestedWhisperLanguage)
      : (String(requestedWhisperLanguage || 'auto').trim().toLowerCase() || 'auto');

    // Reuse the finished IndexedDB transcript even when another caller reaches
    // the transcription module directly (for example, the Chords button).
    // This keeps all entry points consistent and prevents duplicate GPU work.
    if (options.forceWhisperRefresh !== true) {
      const cached = await window.databaseManager?.loadSubtitlesFromIndexedDB?.(videoId);
      const cachedModel = String(cached?.whisperModel || 'large-v2').trim().toLowerCase();
      const cachedLanguage = typeof window.ycWhisperTranscription.normalizeLanguage === 'function'
        ? window.ycWhisperTranscription.normalizeLanguage(
          cached?.whisperRequestedLanguage || cached?.requestedLanguage || 'auto'
        )
        : String(cached?.whisperRequestedLanguage || cached?.requestedLanguage || 'auto').trim().toLowerCase();
      const cachedSentenceSRT = cached?.whisperSentenceSRT || '';
      if (
        cachedSentenceSRT.trim()
        && cachedModel === normalizedWhisperModel
        && cachedLanguage === normalizedWhisperLanguage
      ) {
        console.log(`[Extractor] Reusing cached Whisper ${cachedModel} transcript for ${videoId}`);
        return cached;
      }
    }

    const result = await window.ycWhisperTranscription.transcribeVideo(videoId, {
      signal,
      model: normalizedWhisperModel,
      language: requestedWhisperLanguage,
      onProgress: options.onProgress,
    });
    if (signal.aborted) return null;

    const dataToSave = {
      ...result,
      videoId,
      source: 'whisper',
      whisperSentenceSRT: result.sentenceSRT,
      whisperWordSRT: result.wordSRT,
      whisperOriginalSentences: result.originalSentences,
      whisperModel: result.model || requestedWhisperModel || 'large-v2',
      whisperRequestedLanguage: result.requestedLanguage || requestedWhisperLanguage || 'auto',
      timestamp: Date.now(),
      checkedAt: Date.now(),
      hasSubtitles: true,
    };
    await window.databaseManager.saveToDatabase('subtitles', videoId, dataToSave);
    window.dispatchEvent(new CustomEvent('yc:subtitlesUpdated', {
      detail: { videoId, source: 'whisper', data: dataToSave }
    }));
    console.log(`[Extractor] ✅ Whisper transcript saved to IndexedDB for ${videoId}`, {
      model: dataToSave.whisperModel,
      language: dataToSave.languageCode,
      segments: dataToSave.originalSentences?.length || 0,
    });
    return dataToSave;

  } catch (error) {
    if (error.name === 'AbortError' || signal.aborted) {
      console.log('[Extractor] ⚠️ Whisper request was aborted');
      return null;
    }
    console.error('[Extractor] Whisper transcription error:', error);
    throw error;
  } finally {
    currentLyricsAbortController = null;
  }
}

/* --------------------------------------------------------------------------- */
/* 3. טעינה מ-IndexedDB                                                       */
/* --------------------------------------------------------------------------- */
export function loadChordsFromIndexedDB(videoId) {
  return window.databaseManager.loadFromDatabase('chords', videoId);
}

export function loadSubtitlesFromIndexedDB(videoId) {
  return window.databaseManager.loadFromDatabase('subtitles', videoId);
}

/* --------------------------------------------------------------------------- */
/* 4. ניקוי זיכרון                                                            */
/* --------------------------------------------------------------------------- */
export function cleanupExtractorResources() {
  if (DEBUG) console.log('[Extractor] Cleaning up resources...');

  if (window.subtitleCache?.clear) {
    window.subtitleCache.clear();
    if (DEBUG) console.log('[Extractor] Cleared subtitle cache');
  }
}

/* --------------------------------------------------------------------------- */
/* Legacy compatibility - פונקציות ישנות שעדיין נקראות                        */
/* --------------------------------------------------------------------------- */
export async function extractSubtitlesFromTarGz(videoId, languageCode = null, isAutoGenerated = null, options = {}) {
  // Redirect to new function with language code, isAutoGenerated, and options
  const result = await fetchAndSaveLyrics(videoId, null, languageCode, isAutoGenerated, options);
  return !!result;
}

export async function extractChordsFromTarGz(videoId, options = {}) {
  // Redirect to new function - מעביר את ה-options
  const result = await fetchAndSaveChords(videoId, options);
  if (!result) return false;

  // Return object with shouldDeleteChordsDBAfter flag if present
  return {
    success: true,
    shouldDeleteChordsDBAfter: result.shouldDeleteChordsDBAfter
  };
}

// לא צריך יותר - אין tar.gz
export async function ensureLibrariesLoaded() {
  // No-op - לא צריך pako/tarball יותר
  return;
}

if (DEBUG) console.log('[Extractor] module loaded – ready (R2 mode)');

/* --------------------------------------------------------------------------- */
/* 🔒 Abort Functions - ביטול בקשות API                                       */
/* --------------------------------------------------------------------------- */
export function abortLyricsRequest() {
  if (currentLyricsAbortController) {
    console.log('[Extractor] 🛑 Aborting lyrics request');
    currentLyricsAbortController.abort();
    currentLyricsAbortController = null;
  }
}

export function abortChordsRequest() {
  if (currentChordsAbortController) {
    console.log('[Extractor] 🛑 Aborting chords request');
    currentChordsAbortController.abort();
    currentChordsAbortController = null;
  }
}

export function abortAllRequests() {
  console.log('[Extractor] 🛑 Aborting all active requests');
  abortLyricsRequest();
  abortChordsRequest();
}

/* --------------------------------------------------------------------------- */
/* חשיפה ל-window                                                             */
/* --------------------------------------------------------------------------- */
if (typeof window !== 'undefined') {
  window.extractorModule ??= {};
  Object.assign(window.extractorModule, {
    // New API
    fetchAndSaveChords,
    fetchAndSaveLyrics,
    loadChordsFromIndexedDB,
    loadSubtitlesFromIndexedDB,
    cleanupExtractorResources,
    // 🔒 Abort functions
    abortLyricsRequest,
    abortChordsRequest,
    abortAllRequests,
    // Legacy compatibility
    extractSubtitlesFromTarGz,
    extractChordsFromTarGz,
    ensureLibrariesLoaded,
    // Progress Bar API (for auth.js to use)
    createProgressBar,
    completeProgressBar,
    removeProgressBar,
    switchToDockerMode,
    setPendingLyrics,
    setChordsQueueHint,
    hasActiveProgressBar: () => !!progressBarElement,
    // 🆕 Subtitles Progress Bar API
    createSubtitlesProgressBar,
    updateSubtitlesProgress,
    completeSubtitlesProgressBar,
    removeSubtitlesProgressBar
  });
}
