/*==============================================================
  YouChords – buttons/lyricsAndChordsButton.js
  --------------------------------------------------------------
  • כפתור משולב לאקורדים וכתוביות יחד
  • תומך Chrome 112+ (Manifest v3, ES Modules)
  • Zero-Reflow: צביעת כפתור ע״י מחלקת CSS
  • SVG נטען פעם אחת בלבד ונשמר ב-cache גלובלי
  • AbortController → לוחץ פעמיים? הקריאה הישנה מתבטלת
  • מניעת הזרקות כפולות ודליפות זיכרון
==============================================================*/

/**
 * 🎯 מיפוי קודי שפה ישנים לחדשים (להצגה ב-UI)
 */
const OLD_TO_NEW_LANG_CODE_PANEL = {
  'iw': 'he',  // עברית
  'in': 'id',  // אינדונזית
  'ji': 'yi',  // יידיש
  'jw': 'jv',  // ג'אוונית
};

const CONSENT_VERSION = '2026-02-17';
const LYRICS_TOOLTIP_POSITION_CONTROLS_TIME_ROW_CLASS = "yc-position-controls-time-row";
let lyricsTooltipPositionControlsPending = false;

/**
 * 🎯 המרת קוד שפה להצגה (iw -> he)
 */
function getDisplayLangCodePanel(langCode) {
  if (!langCode) return langCode;
  const base = langCode.split('-')[0].toLowerCase();
  return OLD_TO_NEW_LANG_CODE_PANEL[base] || base;
}

async function normalizeActiveSubtitlesData(subtitlesData, aiMode = null) {
  if (!subtitlesData || !window.databaseManager?.normalizeSubtitlesForActiveMode) {
    return subtitlesData;
  }
  return window.databaseManager.normalizeSubtitlesForActiveMode(subtitlesData, aiMode);
}

function normalizeAiMode(value) {
  const raw = typeof value === "string" ? value.toLowerCase() : "off";
  return ["off", "auto", "always"].includes(raw) ? raw : "off";
}

function hasActiveGeminiKey(keys) {
  return Array.isArray(keys)
    && keys.some((keyData) => keyData && keyData.active !== false && keyData.status !== "disabled");
}

async function readAiMode() {
  try {
    const result = await chrome.storage.local.get(["aiTranscriptionMode"]);
    return normalizeAiMode(result.aiTranscriptionMode);
  } catch (error) {
    console.warn("[LyricsChords] Failed to read aiTranscriptionMode, defaulting to OFF:", error);
    return "off";
  }
}

function getCurrentPanelVideoId() {
  return window.ycUtils?.extractVideoId?.(window.location.href) || null;
}

function isTutorialDemoPanelVideo(videoId = getCurrentPanelVideoId()) {
  return window.__ycIsTutorialDemoVideo?.(videoId) === true;
}

async function ensurePanelAuthLoaded() {
  if (!window.ycAuth) {
    if (!window.dynamicLoader?.ensureAuthLoaded) return false;
    console.log("[LyricsChords] Loading auth on demand...");
    await window.dynamicLoader.ensureAuthLoaded();
  }
  await window.ycAuth?.waitForAuthCache?.();
  return !!window.ycAuth;
}

async function ensureTutorialDemoPanelChords(videoId = getCurrentPanelVideoId()) {
  if (!isTutorialDemoPanelVideo(videoId)) return null;
  if (typeof window.__ycEnsureTutorialDemoChords !== "function") return null;
  return window.__ycEnsureTutorialDemoChords(videoId);
}

function getCurrentVideoDurationSeconds(fallbackSeconds = null) {
  const fallback = Number(fallbackSeconds);
  if (Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }

  const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
  const duration = Number(video?.duration);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

async function maybeConfirmLongGeminiVideo(aiMode, durationSeconds, sourceLabel = "AI transcription") {
  return true;
}

function getPanelWordTimings() {
  return Array.isArray(window.ycPanelWordTimings) ? window.ycPanelWordTimings : [];
}

function getSubtitleTimingOffsetSeconds() {
  const offset = Number(window.subtitleState?.timing_offset);
  return Number.isFinite(offset) ? offset : 0;
}

function getAdjustedSubtitleTime(currentTime) {
  return currentTime + getSubtitleTimingOffsetSeconds();
}

/**
 * מחשב כמה תווים (בערך) נכנסים בשורה אחת
 * @param {number} panelWidthPx – רוחב הפאנל בפיקסלים
 * @returns {number}  מספר תווים מומלץ לפני שבירה
 */
function calcMaxCharsPerLine(panelWidthPx) {
  const avgCharPx = 8; // Monospace ‑ 8 px לתו
  const safety = 0.9; // מרווח ביטחון
  const hardCap = 80; // לא לעבור 80 תווים גם בפאנל ענק
  return Math.min(Math.floor((panelWidthPx / avgCharPx) * safety), hardCap);
}

/**
 * 🎬 פיצול טקסט לשורות מאוזנות (Netflix style)
 * @param {string} text - הטקסט לפיצול
 * @param {number} maxCharsPerLine - מקסימום תווים לשורה (ברירת מחדל: 42)
 * @returns {string[]} - מערך של שורות מאוזנות
 */
function splitTextBalanced(text, maxCharsPerLine = 42) {
  if (!text || text.length <= maxCharsPerLine) {
    return [text];
  }

  const words = text.split(' ');

  // חישוב כמה שורות צריך
  const numLines = Math.ceil(text.length / maxCharsPerLine);

  // חלוקה מאוזנת - כל שורה תקבל בערך אותו מספר מילים
  const wordsPerLine = Math.ceil(words.length / numLines);

  const lines = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    const lineWords = words.slice(i, i + wordsPerLine);
    lines.push(lineWords.join(' '));
  }

  return lines;
}

/**
 * זיהוי אם אנחנו במסך מלא
 * @returns {boolean} true אם במסך מלא
 */
function isFullscreenMode() {
  // בדיקה אם יוטיוב במסך מלא
  const player = document.querySelector("#movie_player");
  if (player && player.classList.contains("ytp-fullscreen")) {
    return true;
  }

  // בדיקה אם הדפדפן במסך מלא
  if (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  ) {
    return true;
  }

  return false;
}

// מניעת הזרקות כפולות
if (window.ycLyricsChordsInit) {
  console.log("[LyricsChords] סקריפט כבר נטען - מדלג על הזרקה כפולה");
  // יציאה מהסקריפט כדי למנוע הרצה כפולה
} else {
  window.ycLyricsChordsInit = true;
  console.log("[LyricsChords] איניציאליזציה ראשונה של סקריפט");

  // הכל מכאן ואילך רק ירוץ אם זו ההזרקה הראשונה

  function applyLyricsChordsModalLtrIsolation(modal) {
    if (typeof window.__ycApplyModalLtrIsolation === 'function') {
      window.__ycApplyModalLtrIsolation(modal);
      return;
    }
    if (!modal || modal.dataset?.ycLtrIsolated === 'true') return;
    if (modal.dataset) modal.dataset.ycLtrIsolated = 'true';

    const isolate = (el) => {
      if (!el) return;
      el.setAttribute('dir', 'ltr');
      el.style.setProperty('direction', 'ltr', 'important');
      el.style.setProperty('unicode-bidi', 'isolate', 'important');
    };

    isolate(modal);
    modal.querySelectorAll([
      '.yc-modal-content',
      '.yc-modal-title',
      '.yc-modal-text',
      '.yc-modal-buttons',
      '.yc-modal-btn',
      '.yc-modal-close-btn',
      '.yc-google-signin-btn'
    ].join(', ')).forEach(isolate);

    modal.querySelectorAll('.yc-modal-buttons').forEach((row) => {
      row.style.setProperty('flex-direction', 'row', 'important');
    });
  }

  /*------------------------------------------------------------
    🔐 Modal לשגיאת אימות (Fail-Safe)
  ------------------------------------------------------------*/
  function showAuthErrorModal(message) {
    const existingModal = document.getElementById('yc-upgrade-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'yc-upgrade-modal';
    modal.innerHTML = `
      <div class="yc-modal-backdrop"></div>
      <div class="yc-modal-content">
        <div class="yc-modal-icon">⚠️</div>
        <h2 class="yc-modal-title">System Error</h2>
        <p class="yc-modal-text">${message}</p>
        <div class="yc-modal-buttons">
          <button class="yc-modal-btn yc-modal-btn-reload">Reload Page</button>
          <button class="yc-modal-btn yc-modal-btn-close">Close</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #yc-upgrade-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .yc-modal-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
      }
      .yc-modal-content {
        position: relative;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 20px;
        padding: 40px;
        max-width: 400px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      .yc-modal-icon { font-size: 48px; margin-bottom: 20px; }
      .yc-modal-title { color: #fff; font-size: 24px; margin: 0 0 15px 0; font-weight: 600; }
      .yc-modal-text { color: rgba(255, 255, 255, 0.8); font-size: 14px; line-height: 1.6; margin: 0 0 10px 0; }
      .yc-modal-buttons { margin-top: 25px; display: flex; gap: 12px; justify-content: center; }
      .yc-modal-btn { padding: 12px 24px; border-radius: 25px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; border: none; }
      .yc-modal-btn-reload { background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); color: white; }
      .yc-modal-btn-reload:hover { transform: scale(1.05); box-shadow: 0 5px 20px rgba(231, 76, 60, 0.4); }
      .yc-modal-btn-close { background: rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.8); }
      .yc-modal-btn-close:hover { background: rgba(255, 255, 255, 0.2); }
    `;

    document.head.appendChild(style);
    applyLyricsChordsModalLtrIsolation(modal);
    document.body.appendChild(modal);

    modal.querySelector('.yc-modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('.yc-modal-btn-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.yc-modal-btn-reload').addEventListener('click', () => location.reload());
  }

  /*------------------------------------------------------------
    🔐 Modal למשתמש שלא מחובר
  ------------------------------------------------------------*/
  function showSignInRequiredModal() {
    // הסרת modal קיים אם יש
    const existingModal = document.getElementById('yc-upgrade-modal');
    if (existingModal) existingModal.remove();

    // Remove existing style tag to prevent accumulation
    const existingStyle = document.getElementById('yc-lyrics-signin-modal-style');
    if (existingStyle) existingStyle.remove();

    const modal = document.createElement('div');
    modal.id = 'yc-upgrade-modal';
    modal.innerHTML = `
      <div class="yc-modal-backdrop"></div>
      <div class="yc-modal-content">
        <button class="yc-modal-close-btn">×</button>
        <div class="yc-modal-icon">🔐</div>
        <h2 class="yc-modal-title">Sign In Required</h2>
        <p class="yc-modal-text">To access <strong>Subtitles & Chords</strong>, please sign in.</p>
        
        <button class="yc-google-signin-btn" aria-disabled="false">
          <svg class="yc-google-icon" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>

        <p class="yc-consent-error" style="display:none;">Please confirm consent to continue.</p>
        
        <p class="yc-consent-notice">By signing in, you agree to our <a href="https://you-chords.com/terms" target="_blank">Terms of Service</a><br>and <a href="https://you-chords.com/privacy" target="_blank">Privacy Policy</a>.</p>
        
        <div class="yc-or-divider">OR</div>
        
        <p class="yc-toolbar-hint">
          Click the extension icon <img src="${chrome.runtime.getURL('images/icons/icon-16.png')}" class="yc-popup-icon" alt="Extension Icon"> in the toolbar
        </p>
        
        <p class="yc-modal-help">
          Can't find the extension icon in the toolbar?
          <div style="display:flex;gap:10px;justify-content:center;margin-top:8px;">
            <a href="${chrome.runtime.getURL('videos/signin_tutorial.mp4')}" target="_blank" class="yc-help-link yc-video-tutorial-link" style="display:flex;align-items:center;gap:5px;text-decoration:none;text-underline-offset:2px;">
              🎥 Video Tutorial
            </a>
            <button type="button" class="yc-help-link yc-image-guide-btn" style="display:flex;align-items:center;gap:5px;background:none;border:none;cursor:pointer;color:white;text-decoration:none;text-underline-offset:2px;font-size:13px;padding:0;">
              📷 Image Guide
            </button>
          </div>
        </p>
      </div>
    `;

    // הוספת סגנונות (אותם סגנונות כמו upgrade modal)
    const style = document.createElement('style');
    style.id = 'yc-lyrics-signin-modal-style';
    style.textContent = `
      #yc-upgrade-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .yc-modal-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
      }
      .yc-modal-content {
        position: relative;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 20px;
        padding: 40px;
        max-width: 450px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      .yc-modal-close-btn {
        position: absolute;
        top: 15px;
        right: 15px;
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        font-size: 28px;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        line-height: 1;
        padding: 0;
      }
      .yc-modal-close-btn:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: scale(1.1);
      }
      .yc-modal-icon {
        font-size: 48px;
        margin-bottom: 20px;
      }
      .yc-modal-title {
        color: #fff;
        font-size: 28px;
        margin: 0 0 15px 0;
        font-weight: 700;
      }
      .yc-modal-text {
        color: rgba(255, 255, 255, 0.95);
        font-size: 16px;
        line-height: 1.6;
        margin: 0 0 15px 0;
      }
      .yc-modal-text strong {
        color: #fff;
        font-weight: 600;
      }
      .yc-google-signin-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        background: white;
        color: #1f1f1f;
        border: none;
        border-radius: 50px;
        padding: 12px 24px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        margin: 20px auto;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }
      .yc-google-signin-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
      }
      .yc-google-signin-btn:active {
        transform: translateY(0);
      }
      .yc-google-signin-btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
        filter: grayscale(0.35);
      }
      .yc-google-signin-btn:disabled:hover {
        transform: none;
        box-shadow: none;
      }
      .yc-google-icon {
        width: 18px;
        height: 18px;
      }
      .yc-consent-error {
        color: #fecaca;
        font-size: 12px;
        margin: 4px 0 8px 0;
      }
      .yc-consent-notice {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
        line-height: 1.5;
        margin: 15px 0;
      }
      .yc-consent-notice a {
        color: white;
        text-decoration: underline;
      }
      .yc-or-divider {
        text-align: center;
        margin: 20px 0;
        color: rgba(255, 255, 255, 0.6);
        font-size: 14px;
      }
      .yc-toolbar-hint {
        text-align: center;
        color: rgba(255, 255, 255, 0.8);
        font-size: 14px;
        margin: 15px 0;
      }
      .yc-modal-help {
        color: rgba(255, 255, 255, 0.9);
        font-size: 15px;
        font-weight: 500;
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }
      .yc-help-link {
        color: white;
        text-decoration: none;
        font-size: 13px;
        transition: color 0.2s;
      }
      .yc-help-link:hover {
        color: rgba(255, 255, 255, 0.8);
        text-decoration: underline;
      }
      .yc-popup-icon {
        display: inline-block;
        width: 16px;
        height: 16px;
        vertical-align: middle;
        margin: 0 2px;
      }
      .yc-signin-spinner {
        width: 18px;
        height: 18px;
        border: 3px solid rgba(0, 0, 0, 0.2);
        border-top-color: #1f1f1f;
        border-radius: 50%;
        animation: yc-spin 0.8s linear infinite;
      }
      @keyframes yc-spin {
        to { transform: rotate(360deg); }
      }
    `;

    document.head.appendChild(style);
    applyLyricsChordsModalLtrIsolation(modal);
    document.body.appendChild(modal);

    const consentError = modal.querySelector('.yc-consent-error');

    const getSignInFailureMessage = (error) => {
      const message = String(error || '').trim();
      if (!message) return 'Sign in failed. Please try again.';
      if (/oauth|client|credentials|authorization|identity/i.test(message)) {
        return 'Google sign-in could not start for this extension build. If this is a local test build, check the extension ID and OAuth setup.';
      }
      if (/cancel|approve|denied|dismiss/i.test(message)) {
        return 'Google sign-in was cancelled. Please try again.';
      }
      if (/network|fetch|timeout|connection/i.test(message)) {
        return 'Could not reach YouChords. Check your connection and try again.';
      }
      return message.length > 180 ? `${message.slice(0, 180)}...` : message;
    };

    // Event listeners
    modal.querySelector('.yc-modal-close-btn').addEventListener('click', () => modal.remove());
    modal.querySelector('.yc-modal-backdrop').addEventListener('click', () => modal.remove());

    // Sign In button
    modal.querySelector('.yc-google-signin-btn').addEventListener('click', async () => {
      const btn = modal.querySelector('.yc-google-signin-btn');
      if (consentError) consentError.style.display = 'none';
      const consent = {
        accepted: true,
        version: CONSENT_VERSION,
        acceptedAt: new Date().toISOString(),
        source: 'youtube_panel_modal'
      };

      btn.innerHTML = '<div class="yc-signin-spinner"></div> Signing in...';
      btn.disabled = true;
      btn.style.opacity = '0.8';
      btn.style.cursor = 'wait';

      try {
        // Send message to background script to handle sign in
        const response = await chrome.runtime.sendMessage(
          { action: 'signIn', consent }
        );

        if (response.success) {
          console.log('[LyricsAndChords] Sign in successful!', response.user);

          // 1. Store JWT securely (chrome.storage + memory cache)
        if (window.__ycSetJwt) {
          await window.__ycSetJwt(response.jwt);
        } else {
          await chrome.storage.local.set({ youchords_jwt: response.jwt });
        }

          // 2. Update in-memory auth state
          if (window.ycAuth?.initAuthCache) {
            window.ycAuth.initAuthCache();
          }

          // Show success notification
          const userName = response.user?.displayName?.split(' ')[0] || response.user?.email?.split('@')[0] || 'there';
          showSignInSuccessNotification(userName);

          modal.remove();

          // 3. Retry action - simulate button click
          setTimeout(() => {
            const panelBtn = document.querySelector('[data-btn="lyricsChords"] .ytp-lyrics-chords-button');
            if (panelBtn) {
              console.log('[LyricsAndChords] Clicking panel button after sign in');
              panelBtn.click();
            }
          }, 100);
        } else {
          if (response.error === 'CONSENT_REQUIRED') {
            if (consentError) {
              consentError.textContent = 'Could not record sign-in consent. Please try again.';
              consentError.style.display = 'block';
            }
            btn.innerHTML = `
              <svg class="yc-google-icon" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            `;
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            return;
          }

          console.error('[LyricsAndChords] Sign in failed:', response.error);
          if (consentError) {
            consentError.textContent = getSignInFailureMessage(response.error);
            consentError.style.display = 'block';
          }
          btn.textContent = 'Sign in failed. Try again';
          btn.disabled = false;
          setTimeout(() => {
            btn.innerHTML = `
              <svg class="yc-google-icon" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            `;
          }, 2000);
        }
      } catch (error) {
        console.error('[LyricsAndChords] Sign in error:', error);
        if (consentError) {
          consentError.textContent = getSignInFailureMessage(error?.message || error);
          consentError.style.display = 'block';
        }
        btn.textContent = 'Error. Try again';
        btn.disabled = false;
      }
    });
  }

  /*------------------------------------------------------------
    ✅ Success notification after sign in
  ------------------------------------------------------------*/
  function showSignInSuccessNotification(userName) {
    // Remove existing notification if any
    const existing = document.getElementById('yc-signin-success-toast');
    if (existing) existing.remove();

    // Find video player container
    const videoPlayer = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
    if (!videoPlayer) {
      console.warn('[LyricsAndChords] Video player not found for success notification');
      return;
    }

    // Create notification
    const toast = document.createElement('div');
    toast.id = 'yc-signin-success-toast';
    toast.innerHTML = `
      <span class="yc-toast-icon">✅</span>
      <div class="yc-toast-text">
        <div class="yc-toast-title">Successfully signed in!</div>
        <div class="yc-toast-subtitle">Welcome ${userName}</div>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.id = 'yc-signin-success-toast-style';
    style.textContent = `
      #yc-signin-success-toast {
        position: absolute;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(16, 185, 129, 0.4);
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 15px;
        font-weight: 600;
        z-index: 9999;
        animation: ycSlideUp 0.3s ease-out;
        pointer-events: none;
      }
      @keyframes ycSlideUp {
        from {
          transform: translateX(-50%) translateY(50px);
          opacity: 0;
        }
        to {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
      }
      #yc-signin-success-toast .yc-toast-icon {
        font-size: 24px;
        flex-shrink: 0;
      }
      #yc-signin-success-toast .yc-toast-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      #yc-signin-success-toast .yc-toast-title {
        font-size: 15px;
        font-weight: 600;
      }
      #yc-signin-success-toast .yc-toast-subtitle {
        font-size: 13px;
        opacity: 0.9;
      }
    `;

    // Remove existing style if any
    const existingStyle = document.getElementById('yc-signin-success-toast-style');
    if (existingStyle) existingStyle.remove();

    document.head.appendChild(style);
    videoPlayer.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
      toast.style.animation = 'ycSlideDown 0.3s ease-out';
      setTimeout(() => {
        toast.remove();
        style.remove();
      }, 300);
    }, 3000);
  }

  /*------------------------------------------------------------
    🔐 Modal למשתמש שמנסה לגשת ל-Lyrics & Chords בלי הרשאה
  ------------------------------------------------------------*/
  function buildUpgradeUrlForPanel() {
    if (window.__ycBuildUpgradeUrl) {
      return window.__ycBuildUpgradeUrl('https://www.you-chords.com/upgrade');
    }
    const jwt = window.__ycGetCachedJwt ? window.__ycGetCachedJwt() : null;
    return jwt
      ? `https://www.you-chords.com/upgrade?jwt=${encodeURIComponent(jwt)}`
      : 'https://www.you-chords.com/upgrade';
  }

  function showFreeUserUpgradeModal(options = {}) {
    // הסרת modal קיים אם יש
    const existingModal = document.getElementById('yc-upgrade-modal');
    if (existingModal) existingModal.remove();
    const existingStyle = document.getElementById('yc-upgrade-modal-style');
    if (existingStyle) existingStyle.remove();

    // זיהוי סוג המנוי להתאמת ההודעה
    let currentPlan = 'free';
    try {
      if (window.ycAuth?.getSubscriptionInfo) {
        const subInfo = window.ycAuth.getSubscriptionInfo();
        currentPlan = subInfo?.plan || 'free';
      }
    } catch (e) {
      console.warn('[LyricsChords] Could not get plan info:', e);
    }

    const isFreeDurationLimit = options.reason === 'free_duration_limit';
    const modalIcon = options.icon || (isFreeDurationLimit ? '⏱️' : '🎵');

    // הודעות מותאמות לפי סוג מנוי
    const isChordsOnly = currentPlan === 'chords_only';
    const titleText = options.title || (isChordsOnly ? 'Lyrics Not Included' : 'Upgrade Required');
    const messageText = options.messageHtml || (isFreeDurationLimit
      ? `There is no video length limit.`
      : (isChordsOnly
      ? `Your <strong>"Pro"</strong> plan includes chords, but doesn't include synced lyrics.`
      : ``));
    const upgradeText = options.tipHtml || (isFreeDurationLimit
      ? `Please try processing the song again.`
      : (isChordsOnly
      ? `Upgrade to unlock the Subtitles & Chords panel.`
      : `To unlock <strong>Subtitles & Chords</strong> panel with synced subtitles, please upgrade your plan.`));
    const upgradeSource = options.source || (isFreeDurationLimit ? 'lyrics_chords_free_duration_modal' : 'lyrics_chords_upgrade_modal');
    const showUpgradeButton = options.showUpgradeButton !== false;
    const closeLabel = options.closeLabel || (showUpgradeButton ? 'Maybe Later' : 'Got It');

    // יצירת ה-modal
    const modal = document.createElement('div');
    modal.id = 'yc-upgrade-modal';
    modal.innerHTML = `
      <div class="yc-modal-backdrop"></div>
      <div class="yc-modal-content">
        <div class="yc-modal-icon">${modalIcon}</div>
        <h2 class="yc-modal-title">${titleText}</h2>
        <p class="yc-modal-text">${messageText}</p>
        <p class="yc-modal-text">${upgradeText}</p>
        <div class="yc-modal-buttons">
          <button class="yc-modal-btn yc-modal-btn-close">${closeLabel}</button>
          ${showUpgradeButton ? '<button class="yc-modal-btn yc-modal-btn-upgrade">Upgrade Now</button>' : ''}
        </div>
      </div>
    `;

    // הוספת סגנונות
    const style = document.createElement('style');
    style.id = 'yc-upgrade-modal-style';
    style.textContent = `
      #yc-upgrade-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .yc-modal-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
      }
      .yc-modal-content {
        position: relative;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 20px;
        padding: 40px;
        max-width: 420px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.1);
        animation: yc-modal-appear 0.3s ease;
      }
      @keyframes yc-modal-appear {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
      }
      .yc-modal-icon {
        font-size: 48px;
        margin-bottom: 15px;
      }
      .yc-modal-title {
        color: #fff;
        font-size: 24px;
        margin: 0 0 20px 0;
        font-weight: 600;
      }
      .yc-modal-text {
        color: #a0a0a0;
        font-size: 15px;
        line-height: 1.6;
        margin: 0 0 15px 0;
      }
      .yc-modal-text strong {
        color: #fff;
      }
      .yc-modal-buttons {
        display: flex;
        gap: 12px;
        margin-top: 25px;
      }
      .yc-modal-btn {
        flex: 1;
        padding: 12px 24px;
        border: none;
        border-radius: 25px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
      }
      .yc-modal-btn-upgrade {
        background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
        color: white;
      }
      .yc-modal-btn-upgrade:hover {
        transform: scale(1.05);
        box-shadow: 0 5px 20px rgba(243, 156, 18, 0.4);
      }
      .yc-modal-btn-close {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      .yc-modal-btn-close:hover {
        transform: scale(1.05);
        box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
      }
    `;
    document.head.appendChild(style);
    applyLyricsChordsModalLtrIsolation(modal);
    document.body.appendChild(modal);

    // Event listeners
    modal.querySelector('.yc-modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('.yc-modal-btn-close').addEventListener('click', () => modal.remove());
    const upgradeButton = modal.querySelector('.yc-modal-btn-upgrade');
    if (upgradeButton) upgradeButton.addEventListener('click', () => {
      // פתיחת דף השדרוג באתר
      const upgradeUrl = buildUpgradeUrlForPanel();
      if (window.__ycOpenUpgradePage) {
        window.__ycOpenUpgradePage(upgradeUrl, upgradeSource);
      } else {
        window.open(upgradeUrl, '_blank');
      }
      modal.remove();
    });

    console.log('[LyricsChords] 🔐 Showing upgrade modal for free user');
  }

  function isFreeDurationLimitValidation() {
    return false;
  }

  function showFreeDurationLimitUpgradeModal(source = 'lyrics_chords_free_duration_validation') {
    showFreeUserUpgradeModal({
      reason: 'free_duration_limit',
      source,
      title: 'Upgrade Required',
      messageHtml: 'There is no video length limit.',
      tipHtml: 'Please try processing the song again.'
    });
  }

  window.showLyricsChordsFreeDurationLimitUpgradeModal = showFreeDurationLimitUpgradeModal;

  function isMaxDurationLimitValidation() {
    return false;
  }

  function showMaxDurationLimitModal(source = 'lyrics_chords_max_duration_validation') {
    const message = 'This YouTube video could not be processed';
    if (window.ycUtils?.showToast) {
      window.ycUtils.showToast(message, '⚠️', 3500);
      return;
    }

    document.getElementById('yc-lyrics-max-duration-toast-fallback')?.remove();
    const videoPlayer = document.querySelector('.html5-video-player') || document.body;
    const overlay = document.createElement('div');
    overlay.id = 'yc-lyrics-max-duration-toast-fallback';
    overlay.style.cssText = `
      position: ${videoPlayer === document.body ? 'fixed' : 'absolute'};
      top: ${videoPlayer === document.body ? '24px' : '70px'};
      left: 50%; transform: translateX(-50%);
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white; padding: 16px 28px; border-radius: 50px;
      z-index: 2147483647; font-size: 16px; font-weight: 600;
      line-height: 1.35; max-width: min(668px, calc(100vw - 32px));
      display: flex; align-items: center; gap: 12px;
      box-shadow: 0 12px 38px rgba(0, 0, 0, 0.35);
    `;
    const icon = document.createElement('span');
    icon.textContent = '⚠️';
    const text = document.createElement('span');
    text.textContent = message;
    overlay.append(icon, text);
    videoPlayer.appendChild(overlay);
    setTimeout(() => overlay.remove(), 3500);
  }

  window.showLyricsChordsMaxDurationLimitModal = showMaxDurationLimitModal;

  function isMaxDurationErrorMessage() {
    return false;
  }

  /*------------------------------------------------------------
    Credits Exhausted Banner - באנר למשתמש FREE שנגמרו לו הקרדיטים
  ------------------------------------------------------------*/
  const CREDITS_EXHAUSTED_DONT_SHOW_KEY = 'yc_credits_exhausted_dont_show';
  const SUBSCRIPTION_ENDED_NOTICE_DONT_SHOW_KEY = 'yc_subscription_ended_subtitles_notice_dont_show';

  function getChordsUnavailableBannerCopy(reason) {
    if (reason === 'subscription_ended') {
      return {
        storageKey: SUBSCRIPTION_ENDED_NOTICE_DONT_SHOW_KEY,
        title: 'Subscription Ended',
        text: 'Chords are no longer available, but you can still use YouTube or Gemini subtitles.',
        button: null
      };
    }

    return {
      storageKey: CREDITS_EXHAUSTED_DONT_SHOW_KEY,
      title: 'Free Credits Used',
      text: 'You can still use subtitles from YouTube or Gemini with your API key. Upgrade to unlock chords.',
      button: 'Upgrade Now'
    };
  }

  function showCreditsExhaustedBanner(reason = 'quota_exceeded') {
    const bannerCopy = getChordsUnavailableBannerCopy(reason);

    // בדיקה אם המשתמש ביקש לא להציג יותר
    if (localStorage.getItem(bannerCopy.storageKey) === 'true') {
      console.log('[LyricsChords] Chords unavailable banner disabled by user:', reason);
      return;
    }

    // בדיקה שהפאנל קיים
    if (!lyricsChordsPanelElement) return;

    // הסרת באנר קיים אם יש
    const existingBanner = lyricsChordsPanelElement.querySelector('.credits-exhausted-banner');
    if (existingBanner) existingBanner.remove();

    // יצירת הבאנר
    const banner = document.createElement('div');
    banner.className = 'credits-exhausted-banner';
    banner.innerHTML = `
      <button class="credits-banner-close">×</button>
      <div class="credits-banner-title">${bannerCopy.title}</div>
      <div class="credits-banner-text">
        ${bannerCopy.text}
      </div>
      ${bannerCopy.button ? `<button class="credits-banner-upgrade-btn">${bannerCopy.button}</button>` : ''}
      <label class="credits-banner-dont-show">
        <input type="checkbox" id="creditsBannerDontShow">
        <span>Don't show again</span>
      </label>
    `;

    // הוספת סגנונות אם לא קיימים
    if (!document.getElementById('credits-banner-styles')) {
      const style = document.createElement('style');
      style.id = 'credits-banner-styles';
      style.textContent = `
        .credits-exhausted-banner {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 15px;
          text-align: center;
          position: relative;
          animation: slideDown 0.3s ease;
        }
        @keyframes slideDown {
          from { 
            opacity: 0;
            transform: translateY(-20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        .credits-banner-close {
          position: absolute;
          top: 8px;
          right: 10px;
          background: none;
          border: none;
          color: rgba(255,255,255,0.7);
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }
        .credits-banner-close:hover {
          color: white;
        }
        .credits-banner-title {
          color: white;
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 6px;
        }
        .credits-banner-text {
          color: rgba(255,255,255,0.9);
          font-size: 12px;
          margin-bottom: 10px;
          line-height: 1.4;
        }
        .credits-banner-upgrade-btn {
          background: white;
          color: #667eea;
          border: none;
          padding: 8px 20px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          margin-bottom: 8px;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .credits-banner-upgrade-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 15px rgba(255,255,255,0.3);
        }
        .credits-banner-dont-show {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: rgba(255,255,255,0.7);
          font-size: 11px;
          cursor: pointer;
        }
        .credits-banner-dont-show input {
          cursor: pointer;
        }
      `;
      document.head.appendChild(style);
    }

    // הוספה בראש הפאנל (אחרי ה-header)
    const header = lyricsChordsPanelElement.querySelector('.lyrics-chords-header');
    if (header && header.nextSibling) {
      header.parentNode.insertBefore(banner, header.nextSibling);
    } else {
      lyricsChordsPanelElement.prepend(banner);
    }

    // פונקציה לסגירת הבאנר
    function closeBanner() {
      banner.style.animation = 'slideDown 0.3s ease reverse';
      setTimeout(() => banner.remove(), 300);
    }

    // Event listeners
    banner.querySelector('.credits-banner-close').addEventListener('click', closeBanner);

    banner.querySelector('.credits-banner-upgrade-btn')?.addEventListener('click', () => {
      const jwt = window.__ycGetCachedJwt ? window.__ycGetCachedJwt() : null;
      const upgradeUrl = jwt
        ? `https://www.you-chords.com/upgrade?jwt=${encodeURIComponent(jwt)}`
        : 'https://www.you-chords.com/upgrade';
      if (window.__ycOpenUpgradePage) {
        window.__ycOpenUpgradePage(upgradeUrl, 'lyrics_chords_credits_banner');
      } else {
        window.open(upgradeUrl, '_blank');
      }
      closeBanner();
    });

    banner.querySelector('#creditsBannerDontShow').addEventListener('change', (e) => {
      if (e.target.checked) {
        localStorage.setItem(bannerCopy.storageKey, 'true');
        console.log('[LyricsChords] Chords unavailable banner disabled by user:', reason);
        closeBanner();
      }
    });

    // סגירה אוטומטית אחרי 5 שניות
    setTimeout(() => {
      if (banner.parentNode) {
        closeBanner();
      }
    }, 5000);

    console.log('[LyricsChords] 🎵 Showing chords unavailable banner:', reason);
  }

  // הוספת listener גלובלי לסנכרון פוזיציות עם קרוסלה
  window.addEventListener("chordPositionChanged", (e) => {
    const { chordName, position } = e.detail;
    console.log(
      `[LyricsChords] 📡 קיבל event: ${chordName} -> פוזיציה ${position + 1}`
    );

    // עדכון הפוזיציה ב-Map תמיד (גם אם אין tooltip)
    currentChordPositions.set(chordName, position);
    console.log(`[LyricsChords] � ע דכן Map: ${chordName} -> ${position + 1}`);

    // אם יש tooltip פתוח לאותו אקורד, עדכן גם את הדיאגרמה
    if (chordTooltip && currentHoveredChord === chordName) {
      console.log(`[LyricsChords] 🔄 מעדכן tooltip לפוזיציה ${position + 1}`);
      // עדכון הדיאגרמה
      updateChordTooltipDiagram(chordName, position);
    }
  });

  // 🎸 האזנה לאירועי קאפו - רענון תצוגת האקורדים בפאנל
  window.addEventListener("yc:capoToggled", (e) => {
    const type = e.detail?.type;
    // רענון רק אם השינוי רלוונטי לפאנל
    if (type === "panel" || type === "both") {
      console.log("[LyricsChords] 🎸 Capo toggled - refreshing panel chords");
      refreshPanelChordsForCapo();
    }
  });

  window.addEventListener("yc:capoChanged", (e) => {
    const type = e.detail?.type;
    // רענון רק אם השינוי רלוונטי לפאנל
    if (type === "panel" || type === "both") {
      console.log("[LyricsChords] 🎸 Capo fret changed - refreshing panel chords");
      refreshPanelChordsForCapo();
    }
  });

  // 🆕 האזנה להפעלה/כיבוי של פיצ'ר הקאפו
  window.addEventListener("yc:capoFeatureToggled", () => {
    console.log("[LyricsChords] 🎸 Capo FEATURE toggled - refreshing panel chords");
    refreshPanelChordsForCapo();
  });

  // 🆕 האזנה לשינוי מצב סנכרון
  window.addEventListener("yc:capoSyncToggled", () => {
    console.log("[LyricsChords] 🎸 Capo SYNC toggled - refreshing panel chords");
    refreshPanelChordsForCapo();
  });

  window.addEventListener("yc:keyTransposeChanged", () => {
    console.log("[LyricsChords] 🎼 Key transpose changed - refreshing panel chords");
    refreshPanelChordsForCapo();
  });

  // 🚀 האזנה לשינוי Hide Quick Chords
  window.addEventListener("yc:hideQuickChordsChanged", async (e) => {
    window.hideQuickChordsEnabled = e.detail.enabled;
    window.hideQuickChordsThreshold = e.detail.threshold;
    console.log("[LyricsChords] 🚀 Hide Quick Chords changed:", e.detail);

    // רענון הפאנל אם פתוח
    if (window.lyricsChordsPanelActive && typeof window.refreshLyricsChordsPanel === 'function') {
      await window.refreshLyricsChordsPanel();
    }
  });

  // 🎯 Listen for forced panel direction changes (AUTO/LTR/RTL)
  window.addEventListener("yc:panelsDirectionChanged", async (e) => {
    const requestedMode = normalizePanelsDirectionMode(e?.detail?.direction);
    window.panelsDirectionMode = requestedMode;

    if (!window.lyricsChordsPanelActive || !lyricsChordsPanelElement) {
      return;
    }

    try {
      let detectedDirection = cachedDirection;

      if (!detectedDirection) {
        const videoId = window.ycUtils?.extractVideoId(window.location.href);
        if (videoId) {
          let subtitlesData = await window.databaseManager.loadFromDatabase(
            "subtitles",
            videoId
          );
          const aiMode = await readAiMode();
          subtitlesData = await normalizeActiveSubtitlesData(subtitlesData, aiMode);
          detectedDirection = detectTextDirection(subtitlesData, videoId, true);
          subtitlesData = null;
        }
      }

      const direction = resolvePanelsDirection(detectedDirection || "ltr");
      applyLyricsPanelDirectionClass(direction);

      resetVideoAndPagePosition();
      adjustVideoPosition(direction, true);

      if (window.ycChordsPreviewPanel?.isVisible) {
        if (typeof window.ycChordsPreviewPanel._updatePosition === "function") {
          window.ycChordsPreviewPanel._updatePosition();
        }
        if (typeof window.ycChordsPreviewPanel._refreshChords === "function") {
          const refreshPromise = window.ycChordsPreviewPanel._refreshChords();
          if (refreshPromise && typeof refreshPromise.catch === "function") {
            refreshPromise.catch((error) => {
              console.warn("[LyricsChords] Failed to refresh preview after panel direction change:", error);
            });
          }
        }
      }
    } catch (error) {
      console.warn("[LyricsChords] Failed to apply panels direction change:", error);
    }
  });

  if (!window.__ycLyricsSubtitlesUpdatedBound) {
    window.__ycLyricsSubtitlesUpdatedBound = true;
    window.addEventListener('yc:subtitlesUpdated', async (event) => {
      if (!window.lyricsChordsPanelActive) return;

      const currentVideoId = window.ycUtils?.extractVideoId?.(window.location.href);
      if (!currentVideoId || (event.detail?.videoId && event.detail.videoId !== currentVideoId)) {
        return;
      }

      try {
        const settings = await chrome.storage.local.get(['showTranslation']);
        await window.ycLyricsChords?.refreshWithNewPrompt?.(
          settings.showTranslation === true,
          null
        );
      } catch (error) {
        console.error('[LyricsChords] Failed to refresh the active subtitle source:', error);
      }
    });
  }

  // 🚀 האזנה לשינויים בפרומפטים מה-POPUP
  chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.command === 'promptChanged') {
      console.log('[LyricsChords] 📨 Received promptChanged message');

      // בדיקה אם הפאנל פתוח
      if (!window.lyricsChordsPanelActive) {
        console.log('[LyricsChords] ⏸️ Panel not open, ignoring prompt change');
        return;
      }

      console.log('[LyricsChords] 🔄 Panel is open, checking if new data needed...');

      try {
        const videoId = new URL(window.location.href).searchParams.get('v');
        if (!videoId) {
          console.log('[LyricsChords] ❌ No video ID found');
          return;
        }

        const aiModeSettings = await chrome.storage.local.get(['aiTranscriptionMode']);
        const aiMode = aiModeSettings.aiTranscriptionMode || 'off';

        // בדיקה מה חסר ב-IndexedDB
        let subtitlesData = await window.databaseManager.loadFromDatabase('subtitles', videoId);
        subtitlesData = await normalizeActiveSubtitlesData(subtitlesData, aiMode);

        console.log('[LyricsChords] 🔍 Checking what data exists:', {
          hasSentenceSRT: !!subtitlesData?.sentenceSRT,
          hasCustomPromptResponse: !!subtitlesData?.customPromptResponse,
          hasTranslationSRT: !!subtitlesData?.translationSRT,
          customPromptId: subtitlesData?.customPromptId,
          messageShowDefault: message.showDefault,
          messageSelectedCustomPromptId: message.selectedCustomPromptId,
          messageShowTranslation: message.showTranslation
        });

        const hasDefaultForMode = !!(
          subtitlesData?.hasActiveDefault ||
          subtitlesData?.sentenceSRT?.trim()
        );

        const needDefault = message.showDefault && !hasDefaultForMode;
        const needCustom = message.selectedCustomPromptId &&
          (!subtitlesData?.customPromptResponse || subtitlesData?.customPromptId !== message.selectedCustomPromptId);
        const needTranslation = message.showTranslation && !subtitlesData?.translationSRT;

        if (needDefault || needCustom || needTranslation) {
          console.log('[LyricsChords] 🚀 Missing data detected:', {
            needDefault,
            needCustom: needCustom ? message.selectedCustomPromptId : false,
            needTranslation
          });

          // בדיקה אם AI Transcription מופעל
          const aiSettings = await new Promise((resolve) => {
            chrome.storage.local.get(['aiTranscriptionMode'], (result) => {
              resolve(result);
            });
          });
          const aiMode = aiSettings.aiTranscriptionMode || 'off';

          if (aiMode !== 'off') {
            // הצגת progress bar בוידאו
            const video = document.querySelector('video.html5-main-video');
            const durationMinutes = video?.duration ? video.duration / 60 : 3;

            if (window.extractorModule?.createSubtitlesProgressBar) {
              console.log('[LyricsChords] 🎬 Creating progress bar in video player...');
              window.extractorModule.createSubtitlesProgressBar(durationMinutes);
            }

            // קריאה ל-API
            await window.youtubeSubtitles.fetchAndSaveYouTubeSubtitles(videoId, null, null, {
              showDefault: message.showDefault,
              selectedCustomPromptId: message.selectedCustomPromptId,
              showTranslation: message.showTranslation
            });

            // רענון הפאנל
            if (window.ycLyricsChords?.refreshWithNewPrompt) {
              console.log('[LyricsChords] 🔄 Refreshing panel with new data...');
              await window.ycLyricsChords.refreshWithNewPrompt();
            }
          }
        } else {
          console.log('[LyricsChords] ✅ All required data already exists in IndexedDB');

          // רענון הפאנל גם אם הכל קיים (אולי הוסרו פרומפטים)
          if (window.ycLyricsChords?.refreshWithNewPrompt) {
            console.log('[LyricsChords] 🔄 Refreshing panel with existing data...');
            await window.ycLyricsChords.refreshWithNewPrompt();
          }
        }

      } catch (error) {
        console.error('[LyricsChords] ❌ Error handling prompt change:', error);
      }
    }
  });

  /**
   * 🎸 רענון כל האקורדים בפאנל לפי קאפו
   */
  function refreshPanelChordsForCapo() {
    const panel = document.querySelector(".yt-lyrics-chords-panel");
    if (!panel) return;

    const chordElements = panel.querySelectorAll(".lyrics-chord");
    chordElements.forEach((el) => {
      const originalChord = el.dataset.chordName;
      if (originalChord) {
        const displayName = window.getCapoChord ? window.getCapoChord(originalChord, "panel") : originalChord;
        el.textContent = displayName;
      }
    });
    console.log(`[LyricsChords] 🎸 Refreshed ${chordElements.length} chords for capo`);
  }

  window.createLyricsAndChordsButton = function () {
    console.log("[LyricsChords] יצירת כפתור Lyrics & Chords - דיבוג מופעל");

    // 🔧 SINGLETON: בדיקה אם כבר יש כפתור קיים ב-DOM
    const existingContainer = document.querySelector('[data-btn="lyricsChords"]');
    if (existingContainer) {
      const existingBtn = existingContainer.querySelector('.ytp-lyrics-chords-button');
      if (existingBtn) {
        console.log("[LyricsChords] כפתור כבר קיים ב-DOM - מחזיר אותו (Singleton)");
        return existingContainer;
      }
    }

    // ניקוי מצב קודם לפני יצירת הכפתור החדש
    if (typeof window.cleanupLyricsChordsPanel === "function") {
      window.cleanupLyricsChordsPanel();
    }

    // אם יש כפתור זמני קיים, נחליף את התוכן שלו
    const existingButton = document.querySelector(".ytp-lyrics-chords-button");
    if (existingButton && existingButton.getAttribute('data-temporary') === 'true') {
      console.log("[LyricsChords] מחליף כפתור זמני בכפתור אמיתי");
      existingButton.removeAttribute('data-temporary'); // הסרת הסימון
      // נחליף את התוכן של הכפתור הקיים
      updateExistingButton(existingButton);
      return existingButton.parentElement;
    }

    /*------------------------------------------------------------
    0. יצירת אלמנט הכפתור + מחלקת CSS לצבע אדום
  ------------------------------------------------------------*/
    const container = document.createElement("div");
    container.className = "custom-button-container";

    const button = document.createElement("button");
    button.className = "ytp-button ytp-lyrics-chords-button";
    button.title = "Subtitles & Chords";

    console.log(
      "[LyricsChords] כפתור נוצר, מצב נוכחי: chordsActive=" +
      window.chordsActive +
      ", subsActive=" +
      window.subsActive
    );

    // מחלקת CSS לצבע אדום - דרושה לפני קריאות syncButtonWithGlobalState
    const COLOR_CLASS = "lyrics-chords-active";

    /*------------------------------------------------------------
    1. טעינת ה-SVG (פעם ראשונה בלבד)
  ------------------------------------------------------------*/
    if (!window.cachedLyricsChordsSVG) {
      fetch(chrome.runtime.getURL("images/lyricsAndChords/lyricsAndChords.svg"))
        .then((r) => (r.ok ? r.text() : Promise.reject(`fetch ${r.status}`)))
        .then((svg) => (window.cachedLyricsChordsSVG = svg))
        .catch((err) => {
          console.error("[LyricsChords] SVG load failed:", err);
          window.cachedLyricsChordsSVG = "<svg></svg>";
        })
        .finally(() => {
          button.innerHTML = window.cachedLyricsChordsSVG;
          syncButtonWithGlobalState();
        });
    } else {
      button.innerHTML = window.cachedLyricsChordsSVG;
      syncButtonWithGlobalState();
    }

    /*------------------------------------------------------------
  2. סנכרון מצב הכפתור עם המשתנים הגלובליים
------------------------------------------------------------*/
    function syncButtonWithGlobalState() {
      // 🔧 תיקון: הכפתור פעיל רק אם הפאנל Lyrics & Chords פתוח
      const isActive = lyricsChordsPanelActive; // לא תלוי באקורדים או כתוביות

      if (isActive && !button.classList.contains(COLOR_CLASS)) {
        button.classList.add(COLOR_CLASS);
        if (window.DEBUG) console.log("[LyricsChords] הוספת מחלקת צבע אדום");
      } else if (!isActive && button.classList.contains(COLOR_CLASS)) {
        button.classList.remove(COLOR_CLASS);
        if (window.DEBUG) console.log("[LyricsChords] הסרת מחלקת צבע אדום");
      }
    }

    // חשיפת הפונקציה לעדכון חיצוני
    button.syncWithGlobalState = syncButtonWithGlobalState;

    // פונקציית ניקוי שתיקרא כשהכפתור נהרס
    button.dispose = function () {
      console.log("[LyricsChords] כפתור נהרס - מפעיל ניקוי");
      window.cleanupLyricsChordsPanel();
    };

    /*------------------------------------------------------------
    3. הוספת click event listener לכפתור
  ------------------------------------------------------------*/
    button.addEventListener('click', () => {
      console.log("[LyricsChords] כפתור אמיתי נלחץ");
      if (typeof window.toggleLyricsAndChords === 'function') {
        window.toggleLyricsAndChords();
      } else {
        console.error("[LyricsChords] toggleLyricsAndChords לא נמצא");
      }
    });

    /*------------------------------------------------------------
    4. הוספת הכפתור לקונטיינר והחזרה
  ------------------------------------------------------------*/
    container.appendChild(button);
    return container;
  };

  // סימון שזו הפונקציה האמיתית (לא זמנית)
  window.createLyricsAndChordsButton.isTemporaryFunction = false;

  // פונקציה לעדכון כפתור זמני קיים
  function updateExistingButton(existingButton) {
    console.log("[LyricsChords] מעדכן כפתור זמני לאמיתי");

    // טעינת SVG אמיתי
    if (!window.cachedLyricsChordsSVG) {
      fetch(chrome.runtime.getURL("images/lyricsAndChords/lyricsAndChords.svg"))
        .then((r) => (r.ok ? r.text() : Promise.reject(`fetch ${r.status}`)))
        .then((svg) => {
          window.cachedLyricsChordsSVG = svg;
          existingButton.innerHTML = svg;
          setupRealButton(existingButton);
        })
        .catch((err) => {
          console.error("[LyricsChords] SVG load failed:", err);
          window.cachedLyricsChordsSVG = "<svg></svg>";
          existingButton.innerHTML = window.cachedLyricsChordsSVG;
          setupRealButton(existingButton);
        });
    } else {
      existingButton.innerHTML = window.cachedLyricsChordsSVG;
      setupRealButton(existingButton);
    }
  }

  // הגדרת הכפתור האמיתי
  function setupRealButton(button) {
    const COLOR_CLASS = "lyrics-chords-active";

    // סנכרון מצב הכפתור
    function syncButtonWithGlobalState() {
      // 🔧 תיקון: הכפתור פעיל רק אם הפאנל Lyrics & Chords פתוח
      const isActive = window.lyricsChordsPanelActive; // לא תלוי באקורדים או כתוביות

      if (isActive && !button.classList.contains(COLOR_CLASS)) {
        button.classList.add(COLOR_CLASS);
        if (window.DEBUG) console.log("[LyricsChords] הוספת מחלקת צבע אדום");
      } else if (!isActive && button.classList.contains(COLOR_CLASS)) {
        button.classList.remove(COLOR_CLASS);
        if (window.DEBUG) console.log("[LyricsChords] הסרת מחלקת צבע אדום");
      }
    }

    // חשיפת הפונקציה לעדכון חיצוני
    button.syncWithGlobalState = syncButtonWithGlobalState;

    // פונקציית ניקוי
    button.dispose = function () {
      console.log("[LyricsChords] כפתור נהרס - מפעיל ניקוי");
      if (typeof window.cleanupLyricsChordsPanel === "function") {
        window.cleanupLyricsChordsPanel();
      }
    };

    // סנכרון ראשוני
    syncButtonWithGlobalState();

    console.log("[LyricsChords] כפתור אמיתי מוכן");
  }

  /*------------------------------------------------------------
  4. מערכת ניהול בטוחה של timeouts
------------------------------------------------------------*/

  // Set לניהול כל ה-timeouts הפעילים
  const activeTimeouts = new Set();

  /**
   * יוצר timeout בטוח עם מעקב אוטומטי
   * @param {Function} callback - הפונקציה שתרוץ
   * @param {number} delay - זמן ההמתנה במילישניות
   * @param {string} description - תיאור ל-timeout (לדיבוג)
   * @returns {number} ID של ה-timeout
   */
  function createSafeTimeout(callback, delay, description = "unknown") {
    const timeoutId = setTimeout(() => {
      try {
        // הסרת ה-timeout מהמעקב לפני הרצת ה-callback
        activeTimeouts.delete(timeoutId);

        // הרצת ה-callback עם טיפול בשגיאות
        callback();

        if (window.DEBUG) {
          console.log(`[SafeTimeout] ✓ הושלם: ${description}`);
        }
      } catch (error) {
        console.error(`[SafeTimeout] ERROR ב-${description}:`, error);
        // הסרת ה-timeout גם במקרה של שגיאה
        activeTimeouts.delete(timeoutId);
      }
    }, delay);

    // הוספת ה-timeout למעקב
    activeTimeouts.add(timeoutId);

    if (window.DEBUG) {
      console.log(
        `[SafeTimeout] נוצר: ${description} (${delay}ms) - סה"כ פעילים: ${activeTimeouts.size}`
      );
    }

    return timeoutId;
  }

  /**
   * מנקה timeout ספציפי בבטחה
   * @param {number} timeoutId - ID של ה-timeout
   * @param {string} description - תיאור ל-timeout (לדיבוג)
   */
  function clearSafeTimeout(timeoutId, description = "unknown") {
    if (timeoutId) {
      clearTimeout(timeoutId);
      activeTimeouts.delete(timeoutId);

      if (window.DEBUG) {
        console.log(
          `[SafeTimeout] ניקיתי: ${description} - סה"כ פעילים: ${activeTimeouts.size}`
        );
      }
    }
  }

  /**
   * מנקה את כל ה-timeouts הפעילים
   */
  function clearAllActiveTimeouts() {
    const count = activeTimeouts.size;

    for (const timeoutId of activeTimeouts) {
      clearTimeout(timeoutId);
    }

    activeTimeouts.clear();

    if (window.DEBUG) {
      console.log(`[SafeTimeout] ניקיתי ${count} timeouts פעילים`);
    }
  }

  // חשיפת הפונקציות לשימוש גלובלי
  window.createSafeTimeout = createSafeTimeout;
  window.clearSafeTimeout = clearSafeTimeout;
  window.clearAllActiveTimeouts = clearAllActiveTimeouts;

  /*------------------------------------------------------------
  5. פונקציות עצירה/המשכה של לולאות בהתבסס על נראות
------------------------------------------------------------*/

  // עצירת לולאות הרנדרינג כשהפאנל לא נראה
  function pausePanelRendering() {
    if (panelPaused) return;
    panelPaused = true;

    console.log("[LyricsChords] עצירת לולאות - הפאנל לא נראה");

    // עצירת סנכרון הדגשה
    if (typeof stopLyricsChordsSync === "function") {
      stopLyricsChordsSync();
    }

    // Timeline Keep-Alive removed
  }

  // המשכת לולאות הרנדרינג כשהפאנל חוזר להיות נראה
  function resumePanelRendering() {
    if (!panelPaused || !window.lyricsChordsPanelActive) return;
    panelPaused = false;

    console.log("[LyricsChords] המשכת לולאות - הפאנל חזר להיות נראה");

    // הפעלת סנכרון הדגשה
    if (typeof startLyricsChordsSync === "function") {
      startLyricsChordsSync();
    }

    // Timeline Keep-Alive removed
  }

  // הצמדת IntersectionObserver לפאנל
  function attachPanelObserver() {
    if (!window.IntersectionObserver || !lyricsChordsPanelElement) {
      console.warn("[LyricsChords] IntersectionObserver לא נתמך או שאין פאנל");
      return;
    }

    // ניתוק observer קודם אם קיים
    if (panelObserver) {
      panelObserver.disconnect();
    }

    // יצירת observer חדש
    panelObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // הפאנל נראה - המשכת לולאות
          resumePanelRendering();
        } else {
          // הפאנל לא נראה - עצירת לולאות
          pausePanelRendering();
        }
      },
      {
        threshold: 0.05, // עצירה כשפחות מ-5% מהפאנל נראה
        rootMargin: "50px", // מרווח בטיחות נוסף
      }
    );

    // התחלת מעקב אחר הפאנל
    panelObserver.observe(lyricsChordsPanelElement);

    console.log("[LyricsChords] IntersectionObserver הוצמד לפאנל");
  }

  /*------------------------------------------------------------
  6. משתנים גלובליים לפאנל Lyrics & Chords
------------------------------------------------------------*/
  window.lyricsChordsPanelActive = false;
  let lyricsChordsPanelElement = null;
  let lyricsChordsPanelController = null;
  let isPanelLoading = false; // 🎯 מעקב אחרי מצב טעינה
  window.ycUserCancelledPanel = false; // 🎯 flag: המשתמש ביטל, לא לפתוח פאנל
  let lyricsChordsSyncInterval = null;
  let currentLyricsData = null;
  let currentChordsData = null;
  let panelWidthUpdateTimeout = null; // Timeout for delayed preview position update
  let videoFitRafId = null;
  const videoFitTimeoutIds = new Set();
  let panelSeparationRafId = null;
  const panelSeparationTimeoutIds = new Set();

  // Cache לאלמנטים לצמצום querySelectorAll תכופים
  let cachedWordElements = null;
  let cachedChordElements = null;

  // מניעת הצטברות visibility listeners
  let globalVisibilityHandler = null;

  // מערכת IntersectionObserver לעצירת לולאות כשהפאנל לא נראה
  let panelObserver = null;
  let panelPaused = false;

  // משתנים לניהול גודל פונט
  let currentFontSize = 15; // גודל ברירת מחדל
  const MIN_FONT_SIZE = 10; // מינימום
  const MAX_FONT_SIZE = 50; // מקסימום
  const FONT_SIZE_STORAGE_KEY = "ycLyricsFontSize";

  // 🎯 Performance Optimization: Cache for direction detection
  let cachedDirection = null; // Cached direction result (prevents re-detection)
  let cachedVideoId = null; // VideoId for which direction was cached
  // Note: This cache persists across panel open/close to avoid re-detection when reopening
  const PANELS_DIRECTION_STORAGE_KEY = "youchords_panels_direction";
  const PANELS_DIRECTION_VALUES = ["auto", "ltr", "rtl"];

  function normalizePanelsDirectionMode(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return PANELS_DIRECTION_VALUES.includes(normalized) ? normalized : "auto";
  }

  function readPanelsDirectionMode() {
    if (typeof window.panelsDirectionMode === "string") {
      return normalizePanelsDirectionMode(window.panelsDirectionMode);
    }

    try {
      const stored = localStorage.getItem(PANELS_DIRECTION_STORAGE_KEY);
      const normalized = normalizePanelsDirectionMode(stored);
      window.panelsDirectionMode = normalized;
      return normalized;
    } catch (error) {
      console.warn("[LyricsChords] Failed to read panels direction mode:", error);
      window.panelsDirectionMode = "auto";
      return "auto";
    }
  }

  function resolvePanelsDirection(detectedDirection) {
    const autoDirection = detectedDirection === "rtl" ? "rtl" : "ltr";
    const mode = readPanelsDirectionMode();
    return mode === "auto" ? autoDirection : mode;
  }

  function applyLyricsPanelDirectionClass(direction) {
    if (!lyricsChordsPanelElement) return;
    const normalizedDirection = direction === "rtl" ? "rtl" : "ltr";
    lyricsChordsPanelElement.classList.remove(
      "yt-lyrics-chords-ltr",
      "yt-lyrics-chords-rtl"
    );
    lyricsChordsPanelElement.classList.add(
      `yt-lyrics-chords-${normalizedDirection}`
    );
  }

  function getPanelDirectionFromSubtitlesData(
    subtitlesData,
    videoId,
    forceDetect = false
  ) {
    const detectedDirection = detectTextDirection(
      subtitlesData,
      videoId,
      forceDetect
    );
    return resolvePanelsDirection(detectedDirection);
  }

  window.getPanelsDirectionMode = function () {
    return readPanelsDirectionMode();
  };

  window.setPanelsDirectionMode = function (direction) {
    const normalized = normalizePanelsDirectionMode(direction);
    window.panelsDirectionMode = normalized;
    try {
      localStorage.setItem(PANELS_DIRECTION_STORAGE_KEY, normalized);
    } catch (error) {
      console.warn("[LyricsChords] Failed to persist panels direction mode:", error);
    }
    window.dispatchEvent(
      new CustomEvent("yc:panelsDirectionChanged", {
        detail: { direction: normalized },
      })
    );
    return normalized;
  };

  window.resetPanelsDirectionToDefault = function () {
    return window.setPanelsDirectionMode("auto");
  };

  // משתנים לניהול גלילה ידנית
  let manualScrollActive = false;
  let manualScrollTimer = null;
  const MANUAL_SCROLL_TIMEOUT = 400; // ms
  let lastVideoTime = -1; // לזיהוי שינויי זמן
  let programmaticScroll = false; // דגל לגלילה מתוכנתת
  let wasPlayingBeforeScroll = false; // זכירת מצב הסרטון לפני הגלילה
  let isMouseDragging = false; // מעקב אחר גרירת עכבר

  /*------------------------------------------------------------
  5. פונקציית רענון פאנל עם prompt חדש
------------------------------------------------------------*/
  window.ycLyricsChords = window.ycLyricsChords || {};

  // 🔒 Lock mechanism to prevent concurrent refresh calls
  let isRefreshingPrompt = false;
  // 🔄 Background custom-hydration guard (panel open should not block on CUSTOM fetch)
  let customHydrationInFlight = null;
  let customHydrationKey = null;

  window.ycLyricsChords.refreshWithNewPrompt = async function (showTranslation, selectedCustomPromptId = null) {
    // 🔒 Check if already refreshing
    if (isRefreshingPrompt) {
      console.log('[LyricsChords] ⚠️ Already refreshing prompt - ignoring duplicate call');
      return;
    }

    console.log('[LyricsChords] 🔄 Refreshing panel with new prompt:', {
      showTranslation: showTranslation ? 'TRANSLATION' : 'DEFAULT',
      customPromptId: selectedCustomPromptId || 'none'
    });

    // 🔒 Set lock
    isRefreshingPrompt = true;

    try {
      // Get current video ID
      const videoId = window.ycUtils?.extractVideoId(window.location.href);
      if (!videoId) {
        console.warn('[LyricsChords] No video ID - cannot refresh');
        return;
      }

      const aiModeSettings = await chrome.storage.local.get(['aiTranscriptionMode']);
      const aiMode = aiModeSettings.aiTranscriptionMode || 'off';

      // Check IndexedDB for required data
      let subtitlesData = await window.databaseManager.loadFromDatabase('subtitles', videoId);
      subtitlesData = await normalizeActiveSubtitlesData(subtitlesData, aiMode);

      if (!subtitlesData) {
        console.log('[LyricsChords] No data in IndexedDB - will fetch on next open');
        return;
      }

      // Check if we have the required data
      const hasTranslation = !!(subtitlesData.translationSRT?.trim());
      const hasDefault = !!(
        subtitlesData.hasActiveDefault ||
        subtitlesData.sentenceSRT?.trim()
      );
      const hasCustom = !!(subtitlesData.customPromptResponse?.trim());

      console.log('[LyricsChords] 🔍 Data check:', {
        showTranslation,
        selectedCustomPromptId,
        hasTranslation,
        hasDefault,
        hasCustom,
        customPromptIdInDB: subtitlesData.customPromptId
      });

      // 🎯 If CUSTOM selected
      if (selectedCustomPromptId) {
        // Check if we have this CUSTOM in cache
        if (!hasCustom || subtitlesData.customPromptId !== selectedCustomPromptId) {
          console.log('[LyricsChords] ⚠️ CUSTOM prompt not in cache or mismatch - will fetch on next panel open');
          // Don't fetch - just refresh with what we have
          if (typeof window.refreshLyricsChordsPanel === 'function') {
            await window.refreshLyricsChordsPanel(showTranslation, selectedCustomPromptId);
          }
          return;
        }
        // CUSTOM exists in cache - refresh panel with parameters
        console.log('[LyricsChords] ✅ CUSTOM data exists - refreshing panel display');
        if (typeof window.refreshLyricsChordsPanel === 'function') {
          await window.refreshLyricsChordsPanel(showTranslation, selectedCustomPromptId);
        }
        return;
      }

      // 🎯 If TRANSLATION selected
      if (showTranslation && !hasTranslation) {
        console.log('[LyricsChords] ⚠️ Translation selected but not in cache - will fetch on next panel open');
        // Don't fetch - just refresh with what we have
        if (typeof window.refreshLyricsChordsPanel === 'function') {
          await window.refreshLyricsChordsPanel(showTranslation, null);
        }
        return;
      }

      // 🎯 If DEFAULT selected
      if (!showTranslation && !hasDefault) {
        console.log('[LyricsChords] ⚠️ Default selected but not in cache - will fetch on next panel open');
        // Don't fetch - just refresh with what we have
        if (typeof window.refreshLyricsChordsPanel === 'function') {
          await window.refreshLyricsChordsPanel(showTranslation, null);
        }
        return;
      }

      // Data exists - refresh panel with parameters
      console.log('[LyricsChords] ✅ Data exists - refreshing panel display');
      if (typeof window.refreshLyricsChordsPanel === 'function') {
        await window.refreshLyricsChordsPanel(showTranslation, null);
      }
    } catch (error) {
      console.error('[LyricsChords] Error refreshing with new prompt:', error);
    } finally {
      // 🔒 Always release lock
      isRefreshingPrompt = false;
      console.log('[LyricsChords] 🔓 Lock released');
    }
  };

  /**
   * Open-first strategy for panel:
   * If DEFAULT/TRANSLATION is already available and CUSTOM is missing,
   * fetch CUSTOM in background and refresh panel when ready.
   */
  async function maybeHydrateCustomInBackground(videoId) {
    try {
      if (!videoId || !window.youtubeSubtitles?.fetchAndSaveYouTubeSubtitles) return;

      const aiMode = await readAiMode();
      if (aiMode === "off") return;

      const selection = await chrome.storage.local.get([
        "showDefault",
        "showTranslation",
        "selectedCustomPromptId",
        "selectedPromptId",
      ]);

      // Support both old and new prompt selection format
      let showDefault = selection.showDefault;
      let selectedCustomPromptId = selection.selectedCustomPromptId;
      if (showDefault === undefined && selection.selectedPromptId) {
        if (selection.selectedPromptId === "default") {
          showDefault = true;
          selectedCustomPromptId = null;
        } else {
          showDefault = false;
          selectedCustomPromptId = selection.selectedPromptId;
        }
      }
      if (showDefault === undefined) showDefault = true;
      if (selectedCustomPromptId === undefined) selectedCustomPromptId = null;

      const showTranslation = selection.showTranslation || false;
      if (!selectedCustomPromptId) return;

      let subtitlesData = await window.databaseManager.loadFromDatabase("subtitles", videoId);
      subtitlesData = await normalizeActiveSubtitlesData(subtitlesData, aiMode);

      const hasCustomData = !!subtitlesData?.customPromptResponse?.trim();
      const customPromptMatches = subtitlesData?.customPromptId === selectedCustomPromptId;
      if (hasCustomData && customPromptMatches) return;

      // Only do background hydration if panel can already show something immediately.
      const hasDefaultData = !!(
        subtitlesData?.hasActiveDefault ||
        subtitlesData?.sentenceSRT?.trim()
      );
      const hasTranslationData = !!subtitlesData?.translationSRT?.trim();
      const hasImmediatePrimary =
        (showTranslation && hasTranslationData) || (!showTranslation && showDefault && hasDefaultData);
      if (!hasImmediatePrimary) return;

      const hydrationKey = `${videoId}:${selectedCustomPromptId}:${showTranslation ? "translation" : "default"}`;
      if (customHydrationInFlight && customHydrationKey === hydrationKey) return;

      customHydrationKey = hydrationKey;
      customHydrationInFlight = (async () => {
        console.log("[LyricsChords] 🚀 Background CUSTOM hydration started:", {
          videoId,
          selectedCustomPromptId,
          showDefault,
          showTranslation,
        });

        const video = document.querySelector("video.html5-main-video");
        const durationMinutes = video?.duration ? video.duration / 60 : 3;
        let subtitlesProgressShown = false;

        if (window.extractorModule?.createSubtitlesProgressBar) {
          window.extractorModule.createSubtitlesProgressBar(durationMinutes);
          subtitlesProgressShown = true;
          console.log("[LyricsChords] 🎬 Progress bar shown for background CUSTOM hydration");
        }

        try {
          await window.youtubeSubtitles.fetchAndSaveYouTubeSubtitles(videoId, null, null, {
            showDefault,
            showTranslation,
            selectedCustomPromptId,
          });

          if (subtitlesProgressShown && window.extractorModule?.completeSubtitlesProgressBar) {
            window.extractorModule.completeSubtitlesProgressBar();
          }
        } catch (error) {
          if (subtitlesProgressShown && window.extractorModule?.removeSubtitlesProgressBar) {
            window.extractorModule.removeSubtitlesProgressBar();
          }
          throw error;
        }

        const currentVideoId = window.ycUtils?.extractVideoId(window.location.href);
        if (
          window.lyricsChordsPanelActive &&
          currentVideoId === videoId &&
          typeof window.refreshLyricsChordsPanel === "function"
        ) {
          await window.refreshLyricsChordsPanel(showTranslation, selectedCustomPromptId);
          console.log("[LyricsChords] ✅ Background CUSTOM hydration applied to open panel");
        }
      })()
        .catch((error) => {
          console.warn("[LyricsChords] Background CUSTOM hydration failed:", error);
        })
        .finally(() => {
          customHydrationInFlight = null;
          customHydrationKey = null;
        });
    } catch (error) {
      console.warn("[LyricsChords] Failed scheduling background CUSTOM hydration:", error);
    }
  }

  /**
   * 🔄 Handle translation refresh from popup
   * Called when user clicks "Refresh" button in popup after changing translation settings
   */
  window.ycLyricsChords.handleTranslationRefresh = async function (videoId) {
    console.log('[LyricsChords] 🔄 Translation refresh requested for video:', videoId);

    // Check if panel is open
    if (!window.lyricsChordsPanelActive) {
      console.log('[LyricsChords] ⏸️ Panel not open - ignoring translation refresh');
      return;
    }

    // Check if this is the current video
    const currentVideoId = window.ycUtils?.extractVideoId(window.location.href);
    if (currentVideoId !== videoId) {
      console.log('[LyricsChords] ⚠️ Video ID mismatch - ignoring translation refresh');
      return;
    }

    // Check if user is viewing translation mode
    const userSettings = await new Promise((resolve) => {
      chrome.storage.local.get(['showTranslation'], (result) => resolve(result));
    });

    if (!userSettings.showTranslation) {
      console.log('[LyricsChords] ℹ️ User not in translation mode - ignoring refresh');
      return;
    }

    console.log('[LyricsChords] 🚀 Starting translation refresh...');

    // Show progress bar
    const video = document.querySelector('video.html5-main-video');
    const durationMinutes = video?.duration ? video.duration / 60 : 3;

    if (window.extractorModule?.createSubtitlesProgressBar) {
      console.log('[LyricsChords] 🎬 Creating progress bar...');
      window.extractorModule.createSubtitlesProgressBar(durationMinutes);
    }

    try {
      // Fetch new translation from Gemini
      await window.youtubeSubtitles.fetchAndSaveYouTubeSubtitles(videoId, null, null, {
        showDefault: false,
        selectedCustomPromptId: null,
        showTranslation: true
      });

      console.log('[LyricsChords] ✅ Translation fetched successfully');

      // Refresh panel with new data
      if (window.ycLyricsChords?.refreshWithNewPrompt) {
        console.log('[LyricsChords] 🔄 Refreshing panel with new translation...');
        await window.ycLyricsChords.refreshWithNewPrompt(true, null);
      }
    } catch (error) {
      console.error('[LyricsChords] ❌ Error refreshing translation:', error);
    }
  };

  /*------------------------------------------------------------
  6. פונקציית טוגל לפאנל Lyrics & Chords
------------------------------------------------------------*/
  window.toggleLyricsAndChords = async function () {
    console.log("[LyricsChords] כפתור Lyrics & Chords נלחץ - דיבוג מופעל");
    console.log(
      "[LyricsChords] מצב פאנל נוכחי:",
      window.lyricsChordsPanelActive
    );

    // דיבוג - בדיקת נתונים
    console.log("[LyricsChords] בדיקת נתונים:");

    // בדיקת נתוני כתוביות
    const subtitleSentences = window.subtitleState?.sentences || [];
    const subtitleWords = window.subtitleState?.words || [];
    console.log(
      "- subtitleState.sentences קיים:",
      !!window.subtitleState?.sentences
    );
    console.log("- subtitleState.sentences אורך:", subtitleSentences.length);
    console.log("- subtitleState.words קיים:", !!window.subtitleState?.words);
    console.log("- subtitleState.words אורך:", subtitleWords.length);

    // בדיקת נתוני אקורדים - נחפש במקומות השונים
    let chordData = null;
    if (window.chordsDisplay?.currentSongData?.chords) {
      chordData = window.chordsDisplay.currentSongData.chords;
      console.log("- chordData מ-chordsDisplay קיים:", !!chordData);
      console.log("- chordData אורך:", chordData.length);
    } else {
      console.log("- chordData לא נמצא ב-chordsDisplay");
    }

    if (subtitleSentences.length > 0) {
      const firstItem = subtitleSentences[0];
      console.log("- פריט ראשון ב-subtitleSentences:", firstItem);
    }

    if (chordData && chordData.length > 0) {
      const firstChord = chordData[0];
      console.log("- פריט ראשון ב-chordData:", firstChord);
    }

    // 🎯 בדיקה ראשונה: האם בטעינה? (חשוב לבדוק לפני lyricsChordsPanelActive!)
    if (isPanelLoading) {
      console.log('[LyricsChords] 🎯 User cancelled during loading - hiding progress bar');

      // סימון שהמשתמש ביטל (הבקשה ממשיכה ברקע, תשמור ב-IndexedDB, אבל לא נפתח פאנל)
      window.ycUserCancelledPanel = true;
      isPanelLoading = false;

      // הסרת Progress Bars (שניהם!)
      if (window.extractorModule?.removeSubtitlesProgressBar) {
        window.extractorModule.removeSubtitlesProgressBar();
      }
      if (window.extractorModule?.removeProgressBar) {
        window.extractorModule.removeProgressBar();
      }

      // החזרת כפתור ללבן
      document.querySelectorAll(".ytp-lyrics-chords-button").forEach((btn) => btn.classList.remove("lyrics-chords-active"));
      return;
    }

    if (window.lyricsChordsPanelActive) {
      closeLyricsChordsPanel();
    } else {
      if (window.__ycBlockClearLiveVideoIfNeeded?.('lyrics-chords-panel')) {
        document.querySelectorAll(".ytp-lyrics-chords-button").forEach((btn) => btn.classList.remove("lyrics-chords-active"));
        return;
      }

      window.__ycMarkFeatureUse?.('lyrics-chords-panel');

      // 🎯 OPTIMISTIC UI: הפוך את הכפתור לאדום מיד (לפני כל בדיקה)
      const allBtns = document.querySelectorAll(".ytp-lyrics-chords-button");
      allBtns.forEach((btn) => btn.classList.add("lyrics-chords-active"));
      console.log("[LyricsChords] 🎯 Optimistic UI: Button turned red immediately");

      // 🎯 סימון תחילת טעינה ואיפוס flag ביטול
      isPanelLoading = true;
      window.ycUserCancelledPanel = false;

      await openLyricsChordsPanel();

      // 🎯 סיום טעינה
      isPanelLoading = false;
    }

    // עדכון מצב הכפתור
    const lyricsChordsBtns = document.querySelectorAll(
      ".ytp-lyrics-chords-button"
    );
    lyricsChordsBtns.forEach((btn) => {
      if (btn.syncWithGlobalState) {
        btn.syncWithGlobalState();
      }
    });
  };

  /*------------------------------------------------------------
  6. פתיחת פאנל Lyrics & Chords (עם טיפול בשגיאות)
------------------------------------------------------------*/
  async function openLyricsChordsPanel() {
    if (window.DEBUG) {
      console.log("[LyricsChords] פתיחת פאנל");
    }

    const currentPanelVideoId = getCurrentPanelVideoId();
    const isTutorialDemoAccess = isTutorialDemoPanelVideo(currentPanelVideoId);

    // 🆕 Clean up split view translation mode flag at the start
    if (window.ycLyricsSplitViewTranslationMode !== undefined) {
      delete window.ycLyricsSplitViewTranslationMode;
      console.log("[LyricsChords] 🧹 Cleaned up old split view translation mode flag");
    }

    // 🔐 SECURITY: בדיקת JWT לפני הכל - חסימת גישה ללא אימות
    const jwt = window.__ycGetJwtAsync
      ? await window.__ycGetJwtAsync()
      : (window.__ycGetCachedJwt ? window.__ycGetCachedJwt() : null);
    if (!jwt && !isTutorialDemoAccess) {
      console.log('[LyricsChords] 🔒 No JWT found - user not signed in');
      document.querySelectorAll(".ytp-lyrics-chords-button").forEach((btn) => btn.classList.remove("lyrics-chords-active"));
      showSignInRequiredModal();
      return;
    } else if (!jwt && isTutorialDemoAccess) {
      console.log('[LyricsChords] 🎬 Tutorial demo video - allowing panel without sign-in');
    }

    // 🔐 QUOTA CHECK: Lyrics חינם לכולם, אקורדים דורשים קרדיטים
    let chordsCacheOnlyMode = false; // מצב שבו אקורדים חדשים לא זמינים (רק מ-cache)
    let chordsUnavailableReason = null;
    let allowPaidResultRecovery = false;
    if (!isTutorialDemoAccess) {
      try {
        await ensurePanelAuthLoaded();

        // Fail-Safe: אם ycAuth לא נטען - חסום גישה
        if (!window.ycAuth?.checkQuotaLocal) {
          console.error('[LyricsChords] ycAuth not available - blocking access (Fail-Safe)');
          // 🎯 Optimistic UI: החזר כפתור ללבן
          document.querySelectorAll(".ytp-lyrics-chords-button").forEach((btn) => btn.classList.remove("lyrics-chords-active"));
          showAuthErrorModal('Authentication system not loaded. Please reload the page.');
          return;
        }

      // בדיקת lyrics quota (תמיד מותר למשתמש מחובר)

      if (window.ycAuth?.ensureFreshSubscriptionForGating) {
        try {
          await window.ycAuth.ensureFreshSubscriptionForGating();
        } catch (refreshError) {
          console.warn('[LyricsChords] Silent subscription refresh before quota check failed:', refreshError);
        }
      }

      const lyricsQuotaCheck = window.ycAuth.checkQuotaLocal('lyrics');
      console.log('[LyricsChords] Lyrics quota check result:', lyricsQuotaCheck);

      if (!lyricsQuotaCheck.allowed) {
        // המשתמש לא מחובר
        if (lyricsQuotaCheck.reason === 'not_logged_in') {
          console.log('[LyricsChords] User not logged in');
          document.querySelectorAll(".ytp-lyrics-chords-button").forEach((btn) => btn.classList.remove("lyrics-chords-active"));
          showSignInRequiredModal();
          return;
        }
      }

      // בדיקת chords quota (לקבוע אם יכול להוריד אקורדים חדשים)
      const chordsQuotaCheck = window.ycAuth.checkQuotaLocal('chords');
      console.log('[LyricsChords] Chords quota check result:', chordsQuotaCheck);
      allowPaidResultRecovery = (await window.__ycCanUseFreePaidResultRecovery?.(
        currentPanelVideoId,
        chordsQuotaCheck,
        'lyrics-chords-panel'
      )) === true;

      // Check if we need to delete ChordsDB
      if (chordsQuotaCheck.shouldDeleteChordsDB && !allowPaidResultRecovery) {
        console.log('[LyricsChords] Deleting ChordsDB due to:', chordsQuotaCheck.reason);
        try {
          if (window.databaseManager?.deleteChordsDatabase) {
            await window.databaseManager.deleteChordsDatabase();
          } else {
            console.warn('[LyricsChords] databaseManager.deleteChordsDatabase not available - skipping DB deletion');
          }
          console.log('[LyricsChords] Chords DB deleted successfully');
        } catch (e) {
          console.error('[LyricsChords] Failed to delete Chords DB:', e);
        }
      }

      // אם אין קרדיטים לאקורדים - מצב chords-cache-only
      if (!chordsQuotaCheck.allowed) {
        if (allowPaidResultRecovery) {
          console.log('[LyricsChords] Free quota exhausted - attempting already-paid chords result recovery for this video');
          chordsCacheOnlyMode = false;
          chordsUnavailableReason = null;
        } else {
          console.log('[LyricsChords] Chords quota exceeded - chords cache-only mode');
          chordsCacheOnlyMode = true;
          chordsUnavailableReason = chordsQuotaCheck.reason || 'quota_exceeded';
          // ממשיכים - לא חוסמים, יראה lyrics + אקורדים מ-cache אם יש
        }
      }

        if (window.DEBUG) console.log('[LyricsChords] Quota check passed, chordsCacheOnlyMode:', chordsCacheOnlyMode, 'allowPaidResultRecovery:', allowPaidResultRecovery);
      } catch (quotaError) {
        // Fail-Safe: אם יש שגיאה בבדיקה - חסום גישה
        console.error('[LyricsChords] Quota check error - blocking access (Fail-Safe):', quotaError);
        // 🎯 Optimistic UI: החזר כפתור ללבן
        document.querySelectorAll(".ytp-lyrics-chords-button").forEach((btn) => btn.classList.remove("lyrics-chords-active"));
        showAuthErrorModal('Authentication error. Please reload the page.');
        return;
      }
    } else {
      chordsCacheOnlyMode = false;
      chordsUnavailableReason = null;
      allowPaidResultRecovery = false;
      console.log('[LyricsChords] 🎬 Tutorial demo - skipping quota checks and using local demo chords');
    }

    // שמירת מצב chords-cache-only לשימוש בהמשך
    window.ycChordsCacheOnlyMode = chordsCacheOnlyMode;
    window.ycChordsUnavailableReason = chordsUnavailableReason;
    window.ycChordsPaidResultRecoveryMode = allowPaidResultRecovery;

    let panelCreated = false;

    // 🎯 אתחול Past Words CSS variable
    const pastWordsColor = localStorage.getItem("yc_lyrics_chords_past_words_color") || "#e91e63";
    document.documentElement.style.setProperty("--yc-past-word-color", pastWordsColor);

    // אתחול מצב Past Words
    const pastWordsEnabled = localStorage.getItem("yc_lyrics_chords_past_words_enabled");
    window.lyricsChordsPastWordsEnabled = pastWordsEnabled !== null ? pastWordsEnabled === "true" : true;

    try {
      // בדיקת validation של הסרטון (משך זמן ותוכן מוזיקלי)
      console.log("[LyricsChords] מבצע בדיקת validation לסרטון...");
      const currentUrl = window.location.href;
      let aiModeForLongVideo = await readAiMode();
      if (isTutorialDemoAccess) {
        aiModeForLongVideo = "off";
      }
      const allowLongVideoForGemini = aiModeForLongVideo === "auto" || aiModeForLongVideo === "always";

      let validationResult = null;
      let isMusic = false; // 🎯 משתנה לשמירת מצב מוזיקה
      const showManualMusicRetryHint = (result) => {
        if (!result || result.isMusic || !result.manualRetryEligible) {
          return;
        }

        const currentVideoId = window.ycUtils?.extractVideoId(window.location.href);
        if (!currentVideoId) {
          return;
        }

        if (window.videoValidator?.hasManualMusicRetryBeenShown?.(currentVideoId)) {
          return;
        }

        window.videoValidator?.markManualMusicRetryShown?.(currentVideoId);

        if (window.ycUtils?.showToast) {
          window.ycUtils.showToast(
            result.manualRetryMessage ||
              "If this is actually a song, press Like once. If it's already liked, turn Like off and on once, then try again.\n\nNote: The Like only helps verify the song. You can remove it afterward if you want.",
            "👍",
            result.toastDurationMs || 10000
          );
        }
      };

      if (isTutorialDemoAccess) {
        isMusic = true;
        console.log("[LyricsChords] 🎬 Tutorial demo - skipping validation and treating video as music");
        try {
          await ensureTutorialDemoPanelChords(currentPanelVideoId);
        } catch (demoError) {
          console.warn("[LyricsChords] Failed to prepare tutorial demo chords:", demoError);
        }
      } else if (
        window.videoValidator &&
        typeof window.videoValidator.validateVideo === "function"
      ) {
        validationResult = await window.videoValidator.validateVideo(
          currentUrl,
          {
            allowNonMusic: true,
            allowLongVideo: allowLongVideoForGemini,
            durationContext: 'processing'
          } // 🎯 Panel מאפשר סרטונים לא-מוזיקליים + מאפשר סרטונים ארוכים במצבי AI
        );

        if (!validationResult.isValid) {
          console.log(
            "[LyricsChords] בדיקת validation נכשלה:",
            validationResult
          );

          // הכנת הודעת שגיאה אחידה
          const errorMessage = validationResult.message || "This YouTube video could not be validated";

          console.log("[LyricsChords] הודעת שגיאה סופית:", errorMessage);

          if (isFreeDurationLimitValidation(validationResult)) {
            document.querySelectorAll(".ytp-lyrics-chords-button").forEach((btn) => btn.classList.remove("lyrics-chords-active"));
            showFreeDurationLimitUpgradeModal('lyrics_chords_free_duration_validation');
            return;
          }
          if (isMaxDurationLimitValidation(validationResult)) {
            document.querySelectorAll(".ytp-lyrics-chords-button").forEach((btn) => btn.classList.remove("lyrics-chords-active"));
            showMaxDurationLimitModal('lyrics_chords_max_duration_validation');
            return;
          }

          // הצגת הודעת שגיאה בסגנון Toast (בלי אייקון)
          if (window.ycUtils && window.ycUtils.showToast) {
            window.ycUtils.showToast(errorMessage, '⚠️', 3000);
          } else {
            // גיבוי מקומי אם showToast לא זמין
            const videoPlayer = document.querySelector(".html5-video-player");
            if (videoPlayer) {
              const errorOverlay = document.createElement("div");
              errorOverlay.className = "yc-error-message-local";
              errorOverlay.style.cssText = `
              position: absolute; bottom: 70px; left: 50%; transform: translateX(-50%);
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 16px 28px;
              border-radius: 50px; z-index: 2147483647; font-size: 16px; text-align: center;
            `;
              errorOverlay.textContent = errorMessage;
              videoPlayer.appendChild(errorOverlay);
              setTimeout(() => errorOverlay.remove(), 3000);
            } else {
              console.warn(
                "[LyricsChords] לא ניתן להציג הודעת שגיאה - video player לא נמצא"
              );
            }
          }

          // 🎯 Optimistic UI: החזר כפתור ללבן
          document.querySelectorAll(".ytp-lyrics-chords-button").forEach((btn) => btn.classList.remove("lyrics-chords-active"));
          return; // יציאה מהפונקציה אם הבדיקה נכשלת
        }

        // 🎯 שמירת מצב מוזיקה
        isMusic = validationResult.isMusic || false;
        showManualMusicRetryHint(validationResult);
        console.log(
          "[LyricsChords] בדיקת validation עברה בהצלחה:",
          validationResult.message,
          "| isMusic:",
          isMusic
        );
      } else {
        // 🔧 FIX: Wait for videoValidator to load (max 3 seconds)
        console.log('[LyricsChords] ⏳ Waiting for videoValidator to load...');

        let validatorReady = false;
        for (let i = 0; i < 30; i++) { // Try for 3 seconds (30 x 100ms)
          await new Promise(r => setTimeout(r, 100));
          if (window.videoValidator?.validateVideo) {
            validatorReady = true;
            break;
          }
        }

        if (validatorReady) {
          // Validator loaded - now validate
          validationResult = await window.videoValidator.validateVideo(currentUrl, {
            allowNonMusic: true,
            allowLongVideo: allowLongVideoForGemini,
            durationContext: 'processing'
          });
          if (!validationResult.isValid) {
            console.log('[LyricsChords] בדיקת validation נכשלה:', validationResult.message);
            document.querySelectorAll(".ytp-lyrics-chords-button").forEach((btn) => btn.classList.remove("lyrics-chords-active"));
            if (isFreeDurationLimitValidation(validationResult)) {
              showFreeDurationLimitUpgradeModal('lyrics_chords_free_duration_validation_waited');
              return;
            }
            if (isMaxDurationLimitValidation(validationResult)) {
              showMaxDurationLimitModal('lyrics_chords_max_duration_validation_waited');
              return;
            }
            if (window.ycUtils?.showToast) {
              window.ycUtils.showToast(validationResult.message || 'This YouTube video could not be validated', '⚠️', 3000);
            }
            return;
          }
          // 🎯 שמירת מצב מוזיקה
          isMusic = validationResult.isMusic || false;
          showManualMusicRetryHint(validationResult);
          console.log('[LyricsChords] ✅ Validation passed after waiting | isMusic:', isMusic);
        } else {
          // Validator failed to load - block access for safety
          console.error('[LyricsChords] ❌ videoValidator failed to load - blocking for safety');
          document.querySelectorAll(".ytp-lyrics-chords-button").forEach((btn) => btn.classList.remove("lyrics-chords-active"));
          if (window.ycUtils?.showErrorOverlay) {
            window.ycUtils.showErrorOverlay('⚠️ Please reload the page and try again.', 3000);
          }
          return;
        }
      }

      // 🎯 שמירת מצב isMusic למשתנה גלובלי לשימוש ב-checkLyricsAndChordsAvailable
      window.ycCurrentVideoIsMusic = isMusic;

      // 🎯 Whisper מתמלל את האודיו המקומי ישירות; אין צורך לבדוק YouTube captions.
      try {
        const videoId = window.ycUtils.extractVideoId(currentUrl);
        console.log('[LyricsChords] Whisper-only transcript path enabled for', videoId);
      } catch (captionCheckError) {
        console.warn('[LyricsChords] Whisper transcript preflight failed, continuing:', captionCheckError);
      }

      // בדיקה אם יש נתוני מילים ואקורדים
      // שמירת מצב chords-cache-only לשימוש ב-checkLyricsAndChordsAvailable
      window.ycChordsCacheOnlyMode = chordsCacheOnlyMode;
      const availability = await checkLyricsAndChordsAvailable();
      if (!availability.available) {
        if (window.DEBUG) {
          console.log("[LyricsChords] אין נתוני מילים או אקורדים זמינים");
          console.log("[LyricsChords] פרטי זמינות:", availability);
        }
        // 🎯 Optimistic UI: החזר כפתור ללבן
        document.querySelectorAll(".ytp-lyrics-chords-button").forEach((btn) => btn.classList.remove("lyrics-chords-active"));
        return;
      }

      // יצירת AbortController לניהול זיכרון
      lyricsChordsPanelController = new AbortController();

      // 🎯 בדיקה אם המשתמש ביטל לפני יצירת הפאנל
      if (window.ycUserCancelledPanel) {
        console.log('[LyricsChords] 🎯 User cancelled before panel creation');
        window.ycUserCancelledPanel = false;
        document.querySelectorAll(".ytp-lyrics-chords-button").forEach((btn) => btn.classList.remove("lyrics-chords-active"));
        return;
      }

      // יצירת הפאנל
      await createLyricsChordsPanel();
      panelCreated = true;

      // Open-first behavior: if CUSTOM is missing but DEFAULT/TRANSLATION is ready,
      // hydrate CUSTOM in background and update panel when ready.
      {
        const currentVideoId = window.ycUtils?.extractVideoId(window.location.href);
        void maybeHydrateCustomInBackground(currentVideoId);
      }

      // 🎯 הפעלת Position Counter Listeners אחרי שהפאנל נוצר
      if (window.primaryChordPositionEnabled) {
        // Load primaryChordsPositionMenu.js if not already loaded
        if (typeof window.setupPositionCounterListeners !== "function") {
          if (window.dynamicLoader && window.dynamicLoader.loadGroup) {
            await window.dynamicLoader.loadGroup("settings");
          }
        }

        if (typeof window.setupPositionCounterListeners === "function") {
          // Use setTimeout to ensure DOM is fully ready
          setTimeout(() => {
            window.setupPositionCounterListeners(true);
            console.log(
              "[LyricsChords] ✓ Position counter listeners enabled for panel"
            );
          }, 100);
        }
      }

      // הפעלת סנכרון
      startLyricsChordsSync();

      // 🎯 Past Words: סנכרון ראשוני של מילים שכבר עברו כשהפאנל נפתח
      if (window.lyricsChordsPastWordsEnabled) {
        schedulePastWordsSyncAfterRender(300);
      }

      // 🎯 הפעלת Countdown Manager
      initializeCountdownManager();

      // הוספת מאזין גלילת גלגלת
      addWheelScrollListener();

      // 🔧 הוספת Event Delegation מיד אחרי פתיחת הפאנל
      // זה מבטיח שלחיצות על מילים/אקורדים/תוויות יעבדו גם כשהווידאו על PAUSE
      setTimeout(() => {
        if (typeof addWordClickListeners === "function") {
          addWordClickListeners();
          console.log("[LyricsChords] ✅ Event Delegation added on panel open");
        }
      }, 200);

      // 🎯 בדיקה אם המשתמש ביטל באמצע הטעינה
      if (window.ycUserCancelledPanel) {
        console.log('[LyricsChords] 🎯 User cancelled - not showing panel (data saved to IndexedDB)');
        window.ycUserCancelledPanel = false;
        // הסרת הפאנל שנוצר
        if (lyricsChordsPanelElement) {
          lyricsChordsPanelElement.remove();
          lyricsChordsPanelElement = null;
        }
        // החזרת כפתור ללבן
        document.querySelectorAll(".ytp-lyrics-chords-button").forEach((btn) => btn.classList.remove("lyrics-chords-active"));
        return;
      }

      window.lyricsChordsPanelActive = true;

      // Ensure sync loop starts after panel becomes active.
      // This fixes an open-time race where startLyricsChordsSync() ran too early.
      try {
        if (lyricsChordsSyncInterval?.schedule) {
          lyricsChordsSyncInterval.schedule();
        }
      } catch (syncStartError) {
        console.warn(
          "[LyricsChords] Failed to resume sync after panel activation:",
          syncStartError
        );
      }

      // 🔴 עדכון צבע הכפתור לאדום
      const lyricsChordsBtns = document.querySelectorAll(".ytp-lyrics-chords-button");
      lyricsChordsBtns.forEach((btn) => {
        btn.classList.add("lyrics-chords-active");
        if (btn.syncWithGlobalState) {
          btn.syncWithGlobalState();
        }
      });
      console.log("[LyricsChords] 🔴 Button color updated to red");

      // 🆕 הוספת קלאס שמסמן שהפאנל פתוח (לצורך Preview Panel)
      if (lyricsChordsPanelElement) {
        lyricsChordsPanelElement.classList.add("yt-lyrics-chords-open");
        console.log("[LyricsChords] ✅ Added yt-lyrics-chords-open class");
      }

      // 🎵 הצגת באנר Credits Exhausted למשתמש FREE שנגמרו לו הקרדיטים
      if (window.ycChordsCacheOnlyMode) {
        try {
          const reason = window.ycChordsUnavailableReason || 'quota_exceeded';
          setTimeout(() => {
            showCreditsExhaustedBanner(reason);
          }, 500); // המתנה קצרה שהפאנל יהיה מוכן
        } catch (e) {
          console.warn('[LyricsChords] Could not show chords unavailable banner:', e);
        }
      }

      // 🎲 הוספת אייקון קוביות לפאנל - רק אם יש אקורדים בכלל (גם אם אין word-level)
      setTimeout(() => {
        if (window.chordsAvailableForPreview) {
          if (window.DiceIcon && window.DiceIcon.initPanel) {
            window.DiceIcon.initPanel();
            console.log("[LyricsChords] 🎲 Dice icon added to panel");
          }
          // 🎸 הוספת אייקון קאפו לפאנל
          if (window.CapoIcon && window.CapoIcon.initPanel) {
            window.CapoIcon.initPanel();
            console.log("[LyricsChords] 🎸 Capo icon added to panel");
          }
        } else {
          console.log("[LyricsChords] ⚠️ No chords available - skipping Dice and Capo icons");
        }
      }, 300);

      // 🆕 פתיחה אוטומטית של Preview אם הכפתור פעיל
      // קריאה ישירה מ-localStorage כדי לוודא מצב עדכני
      const savedPreviewState = localStorage.getItem(
        "youchords_chords_preview_active"
      );
      const shouldOpenPreview =
        savedPreviewState === null || savedPreviewState === "true";

      if (shouldOpenPreview) {
        console.log(
          "[LyricsChords] 🎸 Will open preview panel (from localStorage)"
        );
        // Wait longer to ensure preview panel AND chordRenderer are initialized
        setTimeout(async () => {
          // בדיקה אם יש אקורדים זמינים ל-Preview - משתמש במשתנה הגלובלי החדש
          if (!window.chordsAvailableForPreview) {
            console.log(
              "[LyricsChords] ⚠️ No chords available for preview - skipping preview panel"
            );
            return;
          }

          // Ensure chordRenderer is loaded before opening preview
          if (!window.chordRenderer?.renderChord) {
            console.log(
              "[LyricsChords] 🔄 Loading chordRenderer for preview..."
            );
            await ensureChordDependencies();
          }

          if (window.ycChordsPreviewPanel) {
            window.ycChordsPreviewPanel.show();
            console.log("[LyricsChords] ✅ Preview panel opened");

            // Reflow once Preview has measured its real width.
            const isRTL = lyricsChordsPanelElement?.classList.contains(
              "yt-lyrics-chords-rtl"
            );
            console.log(
              "[LyricsChords] 🔍 Direction check:",
              isRTL ? "RTL" : "LTR"
            );

            if (isRTL) {
              console.log(
                "[LyricsChords] 🔄 RTL: Waiting for Preview to be fully positioned..."
              );
              setTimeout(() => {
                window.ycChordsPreviewPanel?._requestLayoutReflow?.(
                  "restore preview"
                );
              }, 400);
            }
          } else {
            console.warn("[LyricsChords] ⚠️ Preview panel not ready yet");
          }
        }, 300);
      }

      // Timeline Always Visible removed

      if (window.DEBUG) {
        console.log("[LyricsChords] פאנל נפתח בהצלחה");
      }
    } catch (error) {
      console.error("[LyricsChords] שגיאה בפתיחת הפאנל:", error);

      // 🎯 חסום גישה במקרה של שגיאה
      document.querySelectorAll(".ytp-lyrics-chords-button").forEach((btn) =>
        btn.classList.remove("lyrics-chords-active")
      );

      // הצגת הודעת שגיאה למשתמש
      if (isMaxDurationErrorMessage(error?.message)) {
        showMaxDurationLimitModal('lyrics_chords_max_duration_processor');
      } else if (window.ycUtils && window.ycUtils.showToast) {
        window.ycUtils.showToast(
          'An error occurred. Please try again.',
          '⚠️',
          3000
        );
      }

      // 🎯 איפוס מצב טעינה
      isPanelLoading = false;

      // ניקוי במקרה של שגיאה
      if (panelCreated && lyricsChordsPanelElement) {
        lyricsChordsPanelElement.remove();
        lyricsChordsPanelElement = null;
      }

      if (lyricsChordsPanelController) {
        lyricsChordsPanelController.abort();
        lyricsChordsPanelController = null;
      }

      window.lyricsChordsPanelActive = false;

      // 🔧 יציאה מהפונקציה - לא ממשיכים לפתוח את הפאנל!
      return;
    } finally {
      // עדכון מצב הכפתור בכל מקרה
      const lyricsChordsBtns = document.querySelectorAll(
        ".ytp-lyrics-chords-button"
      );
      lyricsChordsBtns.forEach((btn) => {
        if (btn.syncWithGlobalState) {
          btn.syncWithGlobalState();
        }
      });
    }
  }

  /*------------------------------------------------------------
  7. סגירת פאנל Lyrics & Chords
------------------------------------------------------------*/
  function closeLyricsChordsPanel() {
    console.log("[LyricsChords] סגירת פאנל - התחלה");

    // 🎯 תיקון קריטי: ניקוי Cache של כיוון השפה
    cachedDirection = null;
    cachedVideoId = null;
    console.log("[LyricsChords] 🧹 כיוון שפה (Direction Cache) נוקה");

    // 🆕 Clean up split view translation mode flag
    if (window.ycLyricsSplitViewTranslationMode !== undefined) {
      delete window.ycLyricsSplitViewTranslationMode;
      console.log("[LyricsChords] 🧹 Cleaned up split view translation mode flag");
    }

    // Dispatch custom event BEFORE any DOM changes to notify Preview Panel
    window.dispatchEvent(
      new CustomEvent("yc:panelClosing", {
        detail: { timestamp: Date.now() },
      })
    );
    if (window.DEBUG) {
      console.log("[LyricsChords] 📡 Dispatched yc:panelClosing event");
    }

    if (window.DEBUG) {
      console.log("[LyricsChords] סגירת פאנל");
    }

    // עצירת סנכרון
    stopLyricsChordsSync();

    // ניקוי Event Delegation listeners
    if (window.lyricsChordsDelegatedListeners) {
      window.lyricsChordsDelegatedListeners.forEach((listenerData) => {
        try {
          if (
            listenerData.element &&
            listenerData.listener &&
            listenerData.type
          ) {
            listenerData.element.removeEventListener(
              listenerData.type,
              listenerData.listener
            );
          }
        } catch (error) {
          console.warn("[LyricsChords] שגיאה בהסרת event listener:", error);
        }
      });
      window.lyricsChordsDelegatedListeners.clear();
      console.log("[LyricsChords] ניקיתי Event Delegation listeners");
    }

    // ניקוי מאזין גלילת גלגלת
    cleanupWheelScroll();

    // 🎯 ניקוי panelWidthUpdateTimeout
    if (panelWidthUpdateTimeout) {
      clearTimeout(panelWidthUpdateTimeout);
      panelWidthUpdateTimeout = null;
      console.log("[LyricsChords] ניקיתי panelWidthUpdateTimeout");
    }

    // 🎯 ניקוי resize listener
    if (window.lyricsChordsPanelResizeListener) {
      window.removeEventListener("resize", window.lyricsChordsPanelResizeListener);
      window.lyricsChordsPanelResizeListener = null;
      console.log("[LyricsChords] ניקיתי resize listener");
    }

    // 🎯 ניקוי resize timeout
    if (window.lyricsChordsPanelResizeTimeout) {
      clearTimeout(window.lyricsChordsPanelResizeTimeout);
      window.lyricsChordsPanelResizeTimeout = null;
    }

    // 🎯 ניקוי כל ה-timeouts הפעילים
    if (typeof clearAllActiveTimeouts === "function") {
      clearAllActiveTimeouts();
    }

    if (pastWordsRenderSyncTimeout !== null) {
      clearTimeout(pastWordsRenderSyncTimeout);
      pastWordsRenderSyncTimeout = null;
    }

    // 🎯 איפוס כל ה-caches
    if (typeof invalidateAllCaches === "function") {
      invalidateAllCaches();
    }

    // 🎯 ניקוי IntersectionObserver
    if (panelObserver) {
      panelObserver.disconnect();
      panelObserver = null;
      console.log("[LyricsChords] ניקיתי IntersectionObserver");
    }

    // Timeline Always Visible removed

    // ניקוי AbortController
    if (lyricsChordsPanelController) {
      lyricsChordsPanelController.abort();
      lyricsChordsPanelController = null;
    }

    // החזרת הוידאו למיקום הרגיל
    adjustVideoPosition(null, false);

    // 🆕 איפוס מצב מסך מלא אם פעיל
    if (
      window.resetFullscreenPanel &&
      typeof window.resetFullscreenPanel === "function"
    ) {
      window.resetFullscreenPanel();
      console.log("[LyricsChords] איפוס מצב מסך מלא");
    }

    // 🎲 איפוס מצב הקוביה לפני סגירת הפאנל
    // הסרת הפאנל מה-DOM
    if (lyricsChordsPanelElement) {
      // 🆕 הסרת קלאס לפני הסרת הפאנל (לצורך Preview Panel)
      lyricsChordsPanelElement.classList.remove("yt-lyrics-chords-open");
      console.log("[LyricsChords] ✅ Removed yt-lyrics-chords-open class");

      lyricsChordsPanelElement.remove();
      lyricsChordsPanelElement = null;
    }

    window.lyricsChordsPanelActive = false;

    // ⚪ עדכון צבע הכפתור ללבן (הסרת האדום)
    const lyricsChordsBtnsClose = document.querySelectorAll(".ytp-lyrics-chords-button");
    lyricsChordsBtnsClose.forEach((btn) => {
      btn.classList.remove("lyrics-chords-active");
    });
    console.log("[LyricsChords] ⚪ Button color updated to white");

    // 🎵 Reset pitch אם Pitch Change mode ושני הפאנלים סגורים
    const tuningMode = localStorage.getItem("youchords_tuning_mode") || "songTuning";
    if (tuningMode === "songTuning" && !window.chordsActive && window.resetPitchFromPitchChange) {
      window.resetPitchFromPitchChange();
      console.log('[LyricsChords] 🎵 Reset pitch (both panels closed)');
    }

    // 🎯 איפוס משתני הדגשה
    lastHighlightTime = -1;
    lastActiveWordIndex = -1;
    lastActiveChordIndex = -1;
    lastVideoCurrentTime = -1;
    pendingHighlightUpdate = false;
    lastPastWordsVideoTime = -1; // 🎯 Past Words: איפוס

    // 🎯 איפוס משתני הדגשה ברמת משפט
    lastActiveSentenceIndex = -1;
    lastHighlightedWordElements = [];
    sentenceWordElementsMap = null;
    sentenceWordElementsMapKey = "";

    // Timeline Always Visible removed

    // עדכון מצב הכפתור הראשי
    const lyricsChordsBtns = document.querySelectorAll(
      ".ytp-lyrics-chords-button"
    );
    lyricsChordsBtns.forEach((btn) => {
      if (btn.syncWithGlobalState) {
        btn.syncWithGlobalState();
      }
    });

    console.log("[LyricsChords] פאנל נסגר בהצלחה - כל המשאבים נוקו");
    if (window.DEBUG) {
      console.log("[LyricsChords] פאנל נסגר בהצלחה");
    }
  }

  /*------------------------------------------------------------
  8. בדיקת זמינות נתונים וטעינה אוטומטית של נתונים חסרים
------------------------------------------------------------*/
  async function checkLyricsAndChordsAvailable() {
    console.log("[LyricsChords] בדיקת זמינות נתונים...");

    // קבלת מצב chords-cache-only מ-window (מוגדר ב-openLyricsChordsPanel)
    const chordsCacheOnlyMode = window.ycChordsCacheOnlyMode || false;

    // 🎯 קבלת מצב isMusic מ-window (מוגדר ב-openLyricsChordsPanel)
    const isMusic = window.ycCurrentVideoIsMusic || false;
    console.log("[LyricsChords] 🎵 Video is music:", isMusic);

    // קבלת מזהה הסרטון
    const videoId = window.ycUtils?.extractVideoId(window.location.href);
    if (!videoId) {
      console.log("[LyricsChords] לא ניתן לחלץ videoId");
      return { hasLyrics: false, hasChords: false, available: false };
    }

    console.log("[LyricsChords] בדיקה עבור videoId:", videoId);

    if (isTutorialDemoPanelVideo(videoId)) {
      try {
        await ensureTutorialDemoPanelChords(videoId);
      } catch (demoError) {
        console.warn("[LyricsChords] Failed to ensure tutorial demo chords:", demoError);
      }
    }

    let hasLyrics = false;
    let hasChords = false;
    let hasWordLevelSubtitles = false; // 🎯 בדיקה אם יש כתוביות ברמת מילה
    let chordsProcessingEnabled = true;

    try {
      // 🤖 Read AI Transcription settings
      const aiSettings = await new Promise((resolve) => {
        chrome.storage.local.get(['aiTranscriptionMode', 'geminiApiKey', 'geminiApiKeys'], (result) => {
          resolve(result);
        });
      });
      let aiMode = aiSettings.aiTranscriptionMode || 'off';
      if (isTutorialDemoPanelVideo(videoId)) {
        aiMode = 'off';
      }
      const hasApiKey = !!aiSettings.geminiApiKey || hasActiveGeminiKey(aiSettings.geminiApiKeys);

      const chordsSettings = await new Promise((resolve) => {
        chrome.storage.sync.get(['chordsProcessingEnabled'], (result) => {
          resolve(result || {});
        });
      });
      chordsProcessingEnabled = chordsSettings.chordsProcessingEnabled !== false;

      // בדיקת כתוביות מ-IndexedDB
      let subtitlesData = await window.databaseManager.loadFromDatabase(
        "subtitles",
        videoId
      );
      subtitlesData = await normalizeActiveSubtitlesData(subtitlesData, aiMode);
      console.log("[LyricsChords] subtitlesData מ-IndexedDB:", subtitlesData);

      // 🎯 בדיקה אם יש דגל שלילי (כבר בדקנו ואין כתוביות)
      if (subtitlesData?.hasSubtitles === false) {
        hasLyrics = false;
        console.log("[LyricsChords] ⚡ Known video without subtitles - skipping API call");
        console.log("[LyricsChords] 🎯 Checked at:", new Date(subtitlesData.checkedAt).toLocaleString());
      }
      // In ALWAYS, normalizeActiveSubtitlesData resolves the active default:
      // Gemini first, or YouTube when fallback is enabled.
      else if (aiMode === 'always' && hasApiKey) {
        if (subtitlesData) {
          // 🎯 Get currently selected prompts (new format: showDefault + selectedCustomPromptId)
          const promptResult = await chrome.storage.local.get(['showDefault', 'selectedCustomPromptId', 'selectedPromptId']);

          // Support both old and new format
          let showDefault = promptResult.showDefault;
          let selectedCustomPromptId = promptResult.selectedCustomPromptId;

          // Migration: if old format exists, convert it
          if (showDefault === undefined && promptResult.selectedPromptId) {
            if (promptResult.selectedPromptId === 'default') {
              showDefault = true;
              selectedCustomPromptId = null;
            } else {
              showDefault = false;
              selectedCustomPromptId = promptResult.selectedPromptId;
            }
          }

          // Default values
          if (showDefault === undefined) showDefault = true;
          if (selectedCustomPromptId === undefined) selectedCustomPromptId = null;

          const cachedPromptId = subtitlesData.customPromptId || null;

          // 🆕 Check if user selected translation
          const translationResult = await chrome.storage.local.get(['showTranslation']);
          const showTranslation = translationResult.showTranslation || false;

          // 🎯 Check what data we have and what we need
          const hasDefaultData = !!(
            subtitlesData.hasActiveDefault ||
            subtitlesData.sentenceSRT?.trim()
          );
          const hasTranslationData = !!subtitlesData.translationSRT;
          const hasCustomData = !!subtitlesData.customPromptResponse;
          const customPromptMatches = selectedCustomPromptId === cachedPromptId;

          const needDefault = showDefault && !showTranslation;
          const needTranslation = showTranslation;
          const needCustom = !!selectedCustomPromptId;

          console.log("[LyricsChords] 🤖 Active subtitles cache check:");
          console.log("[LyricsChords]   Need default:", needDefault, "| Has:", hasDefaultData);
          console.log("[LyricsChords]   Need translation:", needTranslation, "| Has:", hasTranslationData);
          console.log("[LyricsChords]   Need custom:", needCustom, selectedCustomPromptId, "| Has:", hasCustomData, cachedPromptId);
          console.log("[LyricsChords]   Custom matches:", customPromptMatches);

          // Check if we have all the data we need
          const hasAllNeededData =
            (!needDefault || hasDefaultData) &&
            (!needTranslation || hasTranslationData) &&
            (!needCustom || (customPromptMatches && hasCustomData));

          const hasReadyDefaultOrTranslation =
            (needDefault && hasDefaultData) || (needTranslation && hasTranslationData);

          if (hasAllNeededData) {
            // Active default/translation/custom cache has everything needed.
            hasLyrics = true;
            hasWordLevelSubtitles = false;
            console.log("[LyricsChords] ✅ Using cached active subtitles data");
          } else if (needCustom && hasReadyDefaultOrTranslation) {
            // Open-first: don't block panel opening on CUSTOM if DEFAULT/TRANSLATION is ready.
            // CUSTOM will be fetched in background after panel opens.
            hasLyrics = true;
            hasWordLevelSubtitles = false;
            console.log("[LyricsChords] ⚡ CUSTOM missing, but DEFAULT/TRANSLATION ready - opening panel immediately");
          } else {
            // Prompt לא תואם או חסר data → מוריד מחדש
            console.log("[LyricsChords] ⚠️ Prompt mismatch or missing data - will fetch");
            subtitlesData = null; // מאלץ הורדה מחדש
          }
        } else {
          console.log("[LyricsChords] 🤖 No active subtitles in cache - will fetch (ALWAYS mode)");
          subtitlesData = null; // מאלץ הורדה מחדש
        }
      }
      // בדיקה אם יש כתוביות בפועל (במצב רגיל או AUTO)
      else if (
        subtitlesData &&
        ((subtitlesData.sentenceSRT &&
          subtitlesData.sentenceSRT.trim() !== "") ||
          (subtitlesData.wordSRT && subtitlesData.wordSRT.trim() !== "") ||
          (subtitlesData.translationSRT && subtitlesData.translationSRT.trim() !== "")) // 🆕 Support translation
      ) {
        hasLyrics = true;
        // 🎯 בדיקה אם יש wordSRT (כתוביות ברמת מילה)
        hasWordLevelSubtitles = !!(subtitlesData.wordSRT && subtitlesData.wordSRT.trim() !== "");
        console.log("[LyricsChords] נמצאו כתוביות ב-IndexedDB");
        console.log("[LyricsChords] 🎯 Word-level subtitles:", hasWordLevelSubtitles);
        if (subtitlesData.sentences)
          console.log("- sentences אורך:", subtitlesData.sentences.length);
        if (subtitlesData.words)
          console.log("- words אורך:", subtitlesData.words.length);
      }

      // 🎯 טעינה מקבילית של כתוביות ואקורדים (אם צריך)
      const needToLoadSubtitles = !hasLyrics;
      const needToLoadChords =
        chordsProcessingEnabled &&
        isMusic &&
        !hasChords &&
        !chordsCacheOnlyMode;

      // 🎯 Long-video Gemini UX now lives inside the Gemini progress bar.
      if (needToLoadSubtitles) {
        const effectiveAiModeForLongVideo = hasApiKey ? aiMode : "off";
        const longVideoApproved = await maybeConfirmLongGeminiVideo(
          effectiveAiModeForLongVideo,
          getCurrentVideoDurationSeconds(),
          "AI subtitles"
        );
        if (!longVideoApproved) {
          console.log("[LyricsChords] Long video Gemini confirmation declined by user");
          return {
            hasLyrics: false,
            hasChords: false,
            hasWordLevelSubtitles: false,
            chordsAvailableForPreview: false,
            available: false
          };
        }
      }

      // 🎯 אם צריך לטעון משהו - נעשה את זה במקביל
      if (needToLoadSubtitles || needToLoadChords) {
        console.log("[LyricsChords] 🚀 Starting parallel loading:", {
          subtitles: needToLoadSubtitles,
          chords: needToLoadChords
        });

        const loadingPromises = [];

        // 🎯 Promise לטעינת כתוביות
        if (needToLoadSubtitles) {
          const subtitlesPromise = (async () => {
            console.log("[LyricsChords] לא נמצאו כתוביות ב-IndexedDB");
            console.log("[LyricsChords] מנסה לטעון lyrics מיוטיוב...");

            if (
              window.extractorModule &&
              typeof window.extractorModule.extractSubtitlesFromTarGz === "function"
            ) {
              try {
                console.log("[LyricsChords] טוען כתוביות מהשרת...");

                // 🆕 קבלת אורך הסרטון לחישוב מהירות Progress Bar
                const video = document.querySelector('video.html5-main-video');
                const durationMinutes = video?.duration ? video.duration / 60 : 3;

                // 🆕 הצגת Progress Bar לכתוביות (סגול) עם מהירות דינמית
                if (window.extractorModule.createSubtitlesProgressBar) {
                  window.extractorModule.createSubtitlesProgressBar(durationMinutes);
                }

                const extractResult =
                  await window.extractorModule.extractSubtitlesFromTarGz(videoId);

                // 🆕 השלמת Progress Bar
                if (window.extractorModule.completeSubtitlesProgressBar) {
                  window.extractorModule.completeSubtitlesProgressBar();
                }

                if (extractResult) {
                  // בדיקה אם הנתונים נשמרו ב-IndexedDB
                  let loadedSubtitles =
                    await window.databaseManager.loadFromDatabase(
                      "subtitles",
                      videoId
                    );
                  loadedSubtitles = await normalizeActiveSubtitlesData(loadedSubtitles, aiMode);
                  if (
                    loadedSubtitles &&
                    (loadedSubtitles.sentenceSRT || loadedSubtitles.wordSRT || loadedSubtitles.customPromptResponse || loadedSubtitles.translationSRT)
                  ) {
                    hasLyrics = true;
                    hasWordLevelSubtitles = !!(loadedSubtitles.wordSRT && loadedSubtitles.wordSRT.trim() !== "");
                    console.log("[LyricsChords] כתוביות נטענו ונשמרו בהצלחה");
                    console.log("[LyricsChords] 🎯 Word-level subtitles:", hasWordLevelSubtitles);
                    console.log("[LyricsChords] 🎯 Custom prompt:", !!loadedSubtitles.customPromptResponse);
                  } else {
                    console.log("[LyricsChords] טעינה הצליחה אך לא נמצאו נתונים");
                  }
                } else {
                  console.log("[LyricsChords] לא נמצאו כתוביות בשרת");
                }
              } catch (loadError) {
                console.error(
                  "[LyricsChords] שגיאה בטעינת כתוביות מהשרת:",
                  loadError
                );
                if (window.extractorModule.removeSubtitlesProgressBar) {
                  window.extractorModule.removeSubtitlesProgressBar();
                }
              }
            } else {
              console.log(
                "[LyricsChords] extractorModule או extractSubtitlesFromTarGz לא זמין"
              );
            }
          })();
          loadingPromises.push(subtitlesPromise);
        }

        // 🎯 Promise לטעינת אקורדים
        if (needToLoadChords) {
          const chordsPromise = (async () => {
            console.log("[LyricsChords] 🎵 Video is music - checking chords...");

            // בדיקת אקורדים מ-IndexedDB (שוב, למקרה שנוסף בינתיים)
            let chordsData = await window.databaseManager.loadFromDatabase(
              "chords",
              videoId
            );
            console.log("[LyricsChords] chordsData מ-IndexedDB:", chordsData);

            if (
              chordsData &&
              chordsData.chordText &&
              chordsData.chordText.trim() !== ""
            ) {
              hasChords = true;
              console.log("[LyricsChords] נמצאו אקורדים ב-IndexedDB");
              if (chordsData.chords)
                console.log("- chords אורך:", chordsData.chords.length);
            } else {
              console.log("[LyricsChords] לא נמצאו אקורדים ב-IndexedDB");
              console.log("[LyricsChords] מנסה לטעון אקורדים מהשרת...");

              // 🎯 מיד מציגים progress bar - לא מחכים לתשובה מהשרת
              if (window.extractorModule?.createProgressBar) {
                const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
                const durationMinutes = video?.duration ? video.duration / 60 : null;
                window.extractorModule.createProgressBar(false, false, null, { durationMinutes }); // מתחילים במצב R2 (מהיר)
              }

              if (
                window.extractorModule &&
                typeof window.extractorModule.extractChordsFromTarGz === "function"
              ) {
                try {
                  console.log("[LyricsChords] טוען אקורדים מהשרת...");
                  const extractResult =
                    await window.extractorModule.extractChordsFromTarGz(videoId, {
                      allowPaidResultRecovery: !!window.ycChordsPaidResultRecoveryMode
                    });

                  if (extractResult) {
                    const loadedChords =
                      await window.databaseManager.loadFromDatabase(
                        "chords",
                        videoId
                      );
                    if (
                      loadedChords &&
                      loadedChords.chordText &&
                      loadedChords.chordText.trim() !== ""
                    ) {
                      hasChords = true;
                      console.log("[LyricsChords] אקורדים נטענו ונשמרו בהצלחה");
                    } else {
                      console.log("[LyricsChords] טעינה הצליחה אך לא נמצאו נתונים");
                    }
                  } else {
                    console.log("[LyricsChords] לא נמצאו אקורדים בשרת");
                  }
                } catch (loadError) {
                  console.error(
                    "[LyricsChords] שגיאה בטעינת אקורדים מהשרת:",
                    loadError
                  );
                }
              } else {
                console.log(
                  "[LyricsChords] extractorModule או extractChordsFromTarGz לא זמין"
                );
              }
            }
          })();
          loadingPromises.push(chordsPromise);
        }

        // 🎯 מחכים לשני ה-Promises במקביל
        await Promise.all(loadingPromises);
        console.log("[LyricsChords] ✅ Parallel loading completed!");
      }

      // 🎯 אם זה לא מוזיקה - אין אקורדים
      if (!isMusic) {
        console.log("[LyricsChords] 🎬 Video is not music - skipping chords");
        hasChords = false;
      }
    } catch (error) {
      console.error("[LyricsChords] שגיאה בטעינת נתונים:", error);
      return { hasLyrics: false, hasChords: false, hasWordLevelSubtitles: false, available: false };
    }

    if (!chordsProcessingEnabled) {
      hasChords = false;
    }

    // 🎯 שמירת מידע על אקורדים לפני בדיקת word-level (ל-Preview Panel)
    const chordsAvailableForPreview = hasChords;

    // 🎯 אם אין כתוביות ברמת מילה - לכבות את האקורדים בפאנל הראשי (אבל לא ב-Preview)
    if (!hasWordLevelSubtitles && hasChords) {
      console.log("[LyricsChords] 🎯 אין כתוביות ברמת מילה - מכבה אקורדים בפאנל הראשי (Preview עדיין יעבוד)");
      hasChords = false;
    }

    const result = { hasLyrics, hasChords, hasWordLevelSubtitles, chordsAvailableForPreview, available: hasLyrics };

    // עדכון המשתנה הגלובלי לזמינות אקורדים (לפאנל הראשי)
    chordsAvailable = hasChords;
    // 🎯 משתנה גלובלי חדש לזמינות אקורדים ל-Preview Panel
    window.chordsAvailableForPreview = chordsAvailableForPreview;
    console.log("[LyricsChords] עדכון chordsAvailable:", chordsAvailable, "chordsAvailableForPreview:", chordsAvailableForPreview);

    console.log("[LyricsChords] תוצאה סופית אחרי טעינה אוטומטית:", result);

    // הודעה מיוחדת כשאין lyrics (לא אמור לקרות כי lyrics חינם מיוטיוב)
    if (!hasLyrics) {
      console.log("[LyricsChords] No lyrics available - this shouldn't happen");
    }

    if (!hasLyrics) {
      console.log("[LyricsChords] חסרים נתוני מילים - לא ניתן לטעון");
    }

    if (!hasChords) {
      console.log("[LyricsChords] חסרים נתוני אקורדים - לא ניתן לטעון");
    }

    return result;
  }

  /*------------------------------------------------------------
  9. יצירת הפאנל
------------------------------------------------------------*/

  async function createLyricsChordsPanel() {
    console.log("[LyricsChords] יוצר פאנל");

    // 🎯 בדיקה אם המשתמש ביטל
    if (window.ycUserCancelledPanel) {
      console.log("[LyricsChords] 🎯 User cancelled - not creating panel");
      window.ycUserCancelledPanel = false;
      return;
    }

    // 🔧 SINGLETON: בדיקה אם כבר קיים פאנל ב-DOM
    const existingPanel = document.querySelector('.yt-lyrics-chords-panel');
    if (existingPanel) {
      console.log("[LyricsChords] פאנל כבר קיים ב-DOM - מדלג על יצירה");
      lyricsChordsPanelElement = existingPanel;
      return;
    }

    const aiMode = await readAiMode();

    // 🎯 Check if this is a custom prompt - show special panel
    const videoId = window.ycUtils?.extractVideoId(window.location.href);
    if (videoId) {
      let subtitlesData = await window.databaseManager.loadFromDatabase("subtitles", videoId);
      subtitlesData = await normalizeActiveSubtitlesData(subtitlesData, aiMode);
      console.log("[LyricsChords] 🔍 Loaded subtitles data:", {
        hasData: !!subtitlesData,
        isCustomPrompt: subtitlesData?.isCustomPrompt,
        hasResponse: !!subtitlesData?.customPromptResponse,
        responseLength: subtitlesData?.customPromptResponse?.length
      });
    }

    // אתחול Global Positions DB אם לא קיים
    try {
      const globalExists = await window.databaseManager.loadFromDatabase(
        "globalPositions",
        "globalPositions"
      );
      if (!globalExists) {
        await window.databaseManager.saveToDatabase(
          "globalPositions",
          "globalPositions",
          {
            positions: {},
            lastUpdated: Date.now(),
          }
        );
        console.log("[LyricsChords] ✅ Global positions DB initialized!");
      }
    } catch (error) {
      console.warn(
        "[LyricsChords] Failed to initialize global positions:",
        error
      );
    }

    // 🆕 טעינת PANEL_SUBSET לפני יצירת הפאנל (אופציונלי - עובד גם בלי אקורדים)
    // videoId already defined above
    console.log("[LyricsChords] 🔄 Loading PANEL_SUBSET...");
    const subset = await ensurePanelSubset(videoId);
    if (!subset) {
      // 🔧 לא זורקים שגיאה - הפאנל יעבוד גם בלי אקורדים (רק עם כתוביות)
      console.log(
        "[LyricsChords] ⚠️ No chord data available - panel will show lyrics only"
      );
    } else {
      console.log(
        `[LyricsChords] ✅ PANEL_SUBSET ready with ${Object.keys(subset.chords).length
        } chords`
      );
      // 🎸 בדיקת tuning והצגת הודעה אם צריך
      if (window.checkNonStandardTuning) {
        window.checkNonStandardTuning(subset.tuningValue, subset.hasNonStandardTuning);
      }
    }

    // 🆕 Load preview panel module
    console.log("[LyricsChords] 🔄 Loading preview panel module...");
    try {
      const previewPanelUrl = chrome.runtime.getURL(
        "buttons/chordsPreviewPanel.js"
      );
      await import(previewPanelUrl);
      console.log("[LyricsChords] ✅ Preview panel module loaded");
    } catch (error) {
      console.warn("[LyricsChords] ⚠️ Failed to load preview panel:", error);
    }

    let subtitlesData = await window.databaseManager.loadFromDatabase(
      "subtitles",
      videoId
    );
    subtitlesData = await normalizeActiveSubtitlesData(subtitlesData, aiMode);

    // 🔄 קריאת הגדרות המשתמש לפני זיהוי כיוון
    const userSettings = await new Promise((resolve) => {
      chrome.storage.local.get(
        ['showDefault', 'showTranslation', 'selectedCustomPromptId'],
        (result) => resolve(result)
      );
    });

    const showDefault = userSettings.showDefault ?? true;
    const showTranslation = userSettings.showTranslation ?? false;
    const selectedCustomPromptId = userSettings.selectedCustomPromptId || null;

    // 🎯 זיהוי כיוון לפי הטקסט שבאמת יוצג
    let textForDirection = "";
    if (showTranslation && subtitlesData?.translationSRT) {
      textForDirection = subtitlesData.translationSRT;
    } else if (showDefault && subtitlesData?.sentenceSRT) {
      textForDirection = subtitlesData.sentenceSRT;
    } else if (selectedCustomPromptId && subtitlesData?.customPromptResponse) {
      textForDirection = subtitlesData.customPromptResponse;
    }

    // זיהוי כיוון מדויק
    let detectedDirection = "ltr";
    if (textForDirection) {
      const rtlCount = (textForDirection.match(/[\u0590-\u05FF\u0600-\u06FF]/g) || []).length;
      const ltrCount = (textForDirection.match(/[A-Za-z]/g) || []).length;
      detectedDirection = rtlCount > ltrCount ? "rtl" : "ltr";
      console.log(`[LyricsChords] 🎯 זיהוי כיוון מדויק: ${detectedDirection.toUpperCase()} (RTL: ${rtlCount}, LTR: ${ltrCount})`);
    }
    const direction = resolvePanelsDirection(detectedDirection);

    // עדכון cache (auto-detected base direction, not forced setting)
    cachedDirection = detectedDirection;
    cachedVideoId = videoId;

    // 🎯 Help GC by clearing the large subtitles object
    subtitlesData = null;

    lyricsChordsPanelElement = document.createElement("div");
    lyricsChordsPanelElement.className = `yt-lyrics-chords-panel yt-lyrics-chords-${direction}`;
    lyricsChordsPanelElement.setAttribute("dir", "ltr");

    // הוספת Theme לפי מצב שמור (0=BLACK, 1=SEPIA, 2=LIGHT)
    const themeClasses = ["black-theme", "sepia-theme", "light-theme"];
    lyricsChordsPanelElement.classList.add(themeClasses[themeState]);

    // רוחב יוגדר ב-setupPanelWidthControls() לפי localStorage או ברירת מחדל
    // window.currentLyricsChordsPanelWidth יוגדר שם
    lyricsChordsPanelElement.innerHTML = `
    <div class="lyrics-chords-header">
      <h1 class="lyrics-chords-title">Transcribe & Chords</h1>
      <div class="header-controls-row">
        <h3>Text size</h3>
        <div class="font-size-controls">
          <button class="font-size-btn" id="font-decrease" title="הקטן טקסט">−</button>
          <span class="font-size-display" id="font-size-display">15</span>
          <button class="font-size-btn" id="font-increase" title="הגדל טקסט">+</button>
        </div>
        <h3>Preview</h3>
        <div class="scroll-toggle preview-toggle" id="chords-preview-toggle">
          <div class="toggle-slider"></div>
        </div>
      </div>
      <div class="header-controls-row">
        <h3>Panel width</h3>
        <div class="font-size-controls">
          <button class="font-size-btn" id="panel-width-decrease" title="הקטן רוחב פאנל">−</button>
          <span class="font-size-display" id="panel-width-display">15</span>
          <button class="font-size-btn" id="panel-width-increase" title="הגדל רוחב פאנל">+</button>
        </div>
        <h3>MINI</h3>
        <div class="scroll-toggle" id="chords-toggle">
          <div class="toggle-slider"></div>
        </div>
      </div>
      <button class="lyrics-chords-close">×</button>
    </div>
    <div class="lyrics-chords-controls">
      <div class="scroll-control-row">
        <span class="scroll-control-icon">🔄</span>
        <span class="scroll-control-label">Sync with YouTube</span>
        <div class="scroll-toggle active" id="sync-youtube-toggle">
          <div class="toggle-slider"></div>
        </div>
        <span class="scroll-control-label">Countdown</span>
        <div class="scroll-toggle active" id="countdown-toggle">
          <div class="toggle-slider"></div>
        </div>
        <button class="sentence-mode-icon" id="sentence-mode-toggle" title="Sentence Mode (break by punctuation)">¶</button>
        <button class="language-selector-btn" id="language-selector-btn" title="Select Language">
          <span class="language-code-text">EN</span>
          <div class="language-dropdown" id="language-dropdown"></div>
        </button>
      </div>
      <div class="scroll-control-row">
        <span class="scroll-control-icon">🅰️</span>
        <span class="scroll-control-label">Auto scroll</span>
        <div class="scroll-toggle" id="auto-scroll-toggle">
          <div class="toggle-slider"></div>
        </div>
        <div class="speed-controls">
          <button class="speed-btn" id="speed-decrease">−</button>
          <span class="speed-display" id="speed-display">1.0</span>
          <button class="speed-btn" id="speed-increase">+</button>
        </div>
        <button class="theme-cycle-icon theme-sepia" id="theme-cycle-btn" title="Theme">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <path fill="currentColor" d="M32 6C17.1 6 5 17.2 5 31c0 9.4 5.7 17.8 14.6 22.3 2.5 1.2 5.4.7 7.3-1.2l1.8-1.8c2.8-2.8 7.3-2.8 10.1 0l1.3 1.3c1.6 1.6 3.8 2.5 6 2.5h.8c6.7 0 12.1-5.4 12.1-12.1 0-1.2-.2-2.4-.5-3.5-.7-2.4-2.8-4-5.3-4h-8.7c-4.4 0-8-3.6-8-8v-.4c0-4.4 3.6-8 8-8H53c3.3 0 6-2.7 6-6S56.3 8 53 8h-1C45.7 6.7 38.9 6 32 6z"/>
            <circle cx="17" cy="23" r="4.6" fill="#ffffff"/>
            <circle cx="24" cy="15" r="3.6" fill="#ffffff"/>
            <circle cx="28.8" cy="27.5" r="3.2" fill="#ffffff"/>
            <path fill="currentColor" d="M42 23h12v6H42z"/>
            <path fill="currentColor" d="M45 19h6v28h-6z"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="lyrics-chords-content">
      <div class="lyrics-chords-loading">טוען מילים ואקורדים...</div>
    </div>
  `;

    document.body.appendChild(lyricsChordsPanelElement);
    console.log("[LyricsChords] פאנל נוסף ל-DOM עם כיוון:", direction);

    // הוספת event listener לכפתור הסגירה
    const closeButton = lyricsChordsPanelElement.querySelector(
      ".lyrics-chords-close"
    );
    if (closeButton) {
      closeButton.addEventListener(
        "click",
        function () {
          console.log("[LyricsChords] כפתור סגירה נלחץ!");
          closeLyricsChordsPanel();
        },
        { signal: lyricsChordsPanelController.signal }
      );
      console.log("[LyricsChords] Event listener נוסף לכפתור הסגירה");
    }

    // הוספת event listeners לכפתורי שינוי גודל פונט
    setupFontSizeControls();

    // הוספת event listeners לאלמנטי הבקרה החדשים
    setupScrollControls();

    // הוספת פונקציונליות לכפתורי PANEL WIDTH - לפני הכל כדי שהרוחב יהיה זמין!
    setupPanelWidthControls();

    // הזחת הוידאו כדי לפנות מקום לפאנל - עכשיו עם הרוחב הנכון
    adjustVideoPosition(direction, true);

    // טעינת תוכן הפאנל
    loadLyricsChordsContent();

    // הצמדת IntersectionObserver לפאנל לעצירת לולאות כשלא נראה
    attachPanelObserver();

    // הוספת event listener לשינויי גודל חלון (כולל זום)
    if (!window.lyricsChordsPanelResizeListener) {
      // משתנה גלובלי למניעת קריאות כפולות ולניקוי
      window.lyricsChordsPanelResizeTimeout = null;

      window.lyricsChordsPanelResizeListener = function () {
        if (lyricsChordsPanelActive && lyricsChordsPanelElement) {
          console.log(
            "[LyricsChords] זיהוי שינוי גודל חלון - מעדכן מיקום פאנל"
          );

          // ביטול timeout קודם למניעת קריאות כפולות
          if (window.lyricsChordsPanelResizeTimeout) {
            clearTimeout(window.lyricsChordsPanelResizeTimeout);
          }

          // עיכוב קצר כדי לתת לדף להסתדר אחרי שינוי הזום
          window.lyricsChordsPanelResizeTimeout = setTimeout(async () => {
            try {
              const videoId = window.ycUtils?.extractVideoId(
                window.location.href
              );
              let subtitlesData = await window.databaseManager.loadFromDatabase(
                "subtitles",
                videoId
              );
              subtitlesData = await normalizeActiveSubtitlesData(subtitlesData, aiMode);
              const direction = getPanelDirectionFromSubtitlesData(
                subtitlesData,
                videoId
              );

              // 🎯 Help GC by clearing the large subtitles object
              subtitlesData = null;

              adjustVideoPosition(direction, true); // כבר כולל את כל הלוגיקה של מיקום ו-overlap
            } catch (error) {
              console.warn("[LyricsChords] שגיאה בעדכון מיקום פאנל:", error);
            }
            window.lyricsChordsPanelResizeTimeout = null;
          }, 100);
        }
      };

      window.addEventListener("resize", window.lyricsChordsPanelResizeListener);
      console.log("[LyricsChords] הוסף מאזין לשינויי גודל חלון");
    }
  }

  /*------------------------------------------------------------
  9.5. ניהול כפתורי רוחב הפאנל
------------------------------------------------------------*/
  function setupPanelWidthControls() {
    // קבועים לרוחב הפאנל
    const MIN_PANEL_WIDTH = 300;
    const MAX_PANEL_WIDTH = 500;
    const DEFAULT_PANEL_WIDTH = 350;
    const PANEL_WIDTH_STEP = 50;
    const STORAGE_KEY = "youchords_panel_width";

    // פונקציות המרה בין ערכים אמיתיים לתצוגה למשתמש
    function pxToDisplay(px) {
      return (px - 200) / 10;
    }

    function displayToPx(display) {
      return display * 10 + 200;
    }

    // טעינת רוחב משמור או ברירת מחדל
    let currentPanelWidth = DEFAULT_PANEL_WIDTH;
    try {
      const savedWidth = localStorage.getItem(STORAGE_KEY);
      if (savedWidth) {
        const parsedWidth = parseInt(savedWidth, 10);
        if (parsedWidth >= MIN_PANEL_WIDTH && parsedWidth <= MAX_PANEL_WIDTH) {
          currentPanelWidth = parsedWidth;
        }
      }
    } catch (error) {
      console.warn("[LyricsChords] שגיאה בטעינת רוחב פאנל משמור:", error);
    }

    // עדכון תצוגה ראשונית - הצגת ערך מומר
    const displayElement = document.getElementById("panel-width-display");
    if (displayElement) {
      displayElement.textContent = pxToDisplay(currentPanelWidth);
    }

    // עדכון רוחב הפאנל בפועל
    if (lyricsChordsPanelElement) {
      lyricsChordsPanelElement.style.width = currentPanelWidth + "px";
      window.currentLyricsChordsPanelWidth = currentPanelWidth;
    }

    // פונקציה לעדכון רוחב
    async function updatePanelWidth(newWidth) {
      try {
        // עדכון התצוגה - הצגת ערך מומר
        if (displayElement) {
          displayElement.textContent = pxToDisplay(newWidth);
        }

        // עדכון רוחב הפאנל
        if (lyricsChordsPanelElement) {
          lyricsChordsPanelElement.style.width = newWidth + "px";
          window.currentLyricsChordsPanelWidth = newWidth;
        }

        // שמירה ב-localStorage
        localStorage.setItem(STORAGE_KEY, newWidth.toString());

        // 🔧 תיקון: אם Preview Panel פעיל, נעדכן ישירות בלי reset
        const isPreviewActive =
          window.ycChordsPreviewPanel && window.ycChordsPreviewPanel.isVisible;

        const direction = lyricsChordsPanelElement.classList.contains(
          "yt-lyrics-chords-rtl"
        )
          ? "rtl"
          : "ltr";

        resetVideoAndPagePosition();
        if (!window.reflowLyricsChordsLayout?.(direction, "panel width")) {
          adjustVideoPosition(direction, true);
        }

        if (isPreviewActive) {
          window.ycChordsPreviewPanel?._requestLayoutReflow?.("panel width");
        }

        scheduleVideoFitToScreen("panel width");

        console.log(
          "[LyricsChords] רוחב פאנל עודכן ל-",
          newWidth + "px",
          "- מיקום חושב מחדש מיד"
        );

        // רינדור מחדש של הטקסט בהתאם לרוחב החדש
        if (typeof loadLyricsChordsContent === "function") {
          console.log("[LyricsChords] טוען תוכן מחדש עם חלוקת שורות מעודכנת");
          await loadLyricsChordsContent(); // משתמש בנתונים שכבר בזיכרון

          // 🎯 Past Words: סנכרון מחדש אחרי re-render
          if (window.lyricsChordsPastWordsEnabled) {
            schedulePastWordsSyncAfterRender(300);
          }
        }

        // 🔧 תיקון: אם Preview Panel פעיל, נריץ reflow מלא אחרי שה-DOM התייצב
        if (isPreviewActive) {
          if (window.ycChordsPreviewPanel?._requestLayoutReflow) {
            window.ycChordsPreviewPanel._requestLayoutReflow("panel width content");

            // ניקוי טיימר ישן (מניעת הצטברות)
            if (panelWidthUpdateTimeout) {
              clearTimeout(panelWidthUpdateTimeout);
              panelWidthUpdateTimeout = null;
            }

            // מאלץ עדכון נוסף לאחר שהאנימציה/שינוי הגודל הסתיים
            panelWidthUpdateTimeout = setTimeout(() => {
              if (
                window.ycChordsPreviewPanel &&
                window.ycChordsPreviewPanel._requestLayoutReflow
              ) {
                window.ycChordsPreviewPanel._requestLayoutReflow("panel width settled");
                if (window.DEBUG)
                  console.log(
                    "[LyricsChords] 📏 Resize: delayed layout reflow"
                  );
              }
              panelWidthUpdateTimeout = null; // איפוס אחרי ביצוע
            }, 250);

            if (window.DEBUG) {
              console.log("[LyricsChords] 📐 Requested preview layout reflow");
            }
          }
        }
      } catch (error) {
        console.error("[LyricsChords] שגיאה בעדכון רוחב פאנל:", error);
      }
    }

    // כפתור הקטנה
    const decreaseBtn = document.getElementById("panel-width-decrease");
    if (decreaseBtn) {
      decreaseBtn.addEventListener(
        "click",
        async () => {
          const newWidth = Math.max(
            MIN_PANEL_WIDTH,
            currentPanelWidth - PANEL_WIDTH_STEP
          );
          if (newWidth !== currentPanelWidth) {
            currentPanelWidth = newWidth;
            await updatePanelWidth(newWidth);
          }

          // עדכון מצב כפתורים
          decreaseBtn.disabled = newWidth <= MIN_PANEL_WIDTH;
          const increaseBtn = document.getElementById("panel-width-increase");
          if (increaseBtn) increaseBtn.disabled = false;
        },
        { signal: lyricsChordsPanelController.signal }
      );
    }

    // כפתור הגדלה
    const increaseBtn = document.getElementById("panel-width-increase");
    if (increaseBtn) {
      increaseBtn.addEventListener(
        "click",
        async () => {
          const newWidth = Math.min(
            MAX_PANEL_WIDTH,
            currentPanelWidth + PANEL_WIDTH_STEP
          );
          if (newWidth !== currentPanelWidth) {
            currentPanelWidth = newWidth;
            await updatePanelWidth(newWidth);
          }

          // עדכון מצב כפתורים
          increaseBtn.disabled = newWidth >= MAX_PANEL_WIDTH;
          const decreaseBtn = document.getElementById("panel-width-decrease");
          if (decreaseBtn) decreaseBtn.disabled = false;
        },
        { signal: lyricsChordsPanelController.signal }
      );
    }

    // עדכון מצב כפתורים ראשוני
    if (decreaseBtn)
      decreaseBtn.disabled = currentPanelWidth <= MIN_PANEL_WIDTH;
    if (increaseBtn)
      increaseBtn.disabled = currentPanelWidth >= MAX_PANEL_WIDTH;

    console.log(
      "[LyricsChords] כפתורי רוחב פאנל הוקמו - רוחב נוכחי:",
      currentPanelWidth + "px"
    );
  }

  /*------------------------------------------------------------
  10. טעינת תוכן הפאנל (עם איפוס cache)
------------------------------------------------------------*/
  async function loadLyricsChordsContent(overrideShowTranslation = null, overrideSelectedCustomPromptId = null) {
    const contentDiv = lyricsChordsPanelElement.querySelector(
      ".lyrics-chords-content"
    );
    if (!contentDiv) return;

    // 🎯 Check if this is a custom prompt response - show it instead of lyrics
    const videoId = window.ycUtils?.extractVideoId(window.location.href);
    if (videoId) {
      const aiMode = await readAiMode();
      let subtitlesData = await window.databaseManager.loadFromDatabase("subtitles", videoId);
      subtitlesData = await normalizeActiveSubtitlesData(subtitlesData, aiMode);

      // 🎯 Get current selection (new format: showDefault + showTranslation + selectedCustomPromptId)
      // If override parameters provided, use them instead of storage
      let showDefault, showTranslation, translationLanguage, selectedCustomPromptId;

      if (overrideShowTranslation !== null || overrideSelectedCustomPromptId !== null) {
        // Use override parameters (from refreshWithNewPrompt)
        console.log("[LyricsChords] 🔄 Using override parameters:", {
          overrideShowTranslation,
          overrideSelectedCustomPromptId
        });

        // 🔧 Read showDefault from storage (don't calculate it)
        const selectionResult = await chrome.storage.local.get(['showDefault', 'translationLanguage']);
        showDefault = selectionResult.showDefault !== undefined ? selectionResult.showDefault : true;

        showTranslation = overrideShowTranslation !== null ? overrideShowTranslation : false;
        selectedCustomPromptId = overrideSelectedCustomPromptId;
        translationLanguage = selectionResult.translationLanguage || 'he';

        console.log("[LyricsChords] 🔄 Read showDefault from storage:", showDefault);
      } else {
        // Read from storage (normal flow)
        const selectionResult = await chrome.storage.local.get(['showDefault', 'showTranslation', 'translationLanguage', 'selectedCustomPromptId', 'selectedPromptId']);

        // Support both old and new format
        showDefault = selectionResult.showDefault;
        showTranslation = selectionResult.showTranslation || false; // 🆕
        translationLanguage = selectionResult.translationLanguage || 'he'; // 🆕
        selectedCustomPromptId = selectionResult.selectedCustomPromptId;

        // Migration: if old format exists, convert it
        if (showDefault === undefined && selectionResult.selectedPromptId) {
          if (selectionResult.selectedPromptId === 'default') {
            showDefault = true;
            selectedCustomPromptId = null;
          } else {
            showDefault = false;
            selectedCustomPromptId = selectionResult.selectedPromptId;
          }
        }

        // Default values
        if (showDefault === undefined) showDefault = true;
        if (selectedCustomPromptId === undefined) selectedCustomPromptId = null;
      }

      // OFF mode is YouTube DEFAULT-only for panel content rendering.
      if (aiMode === "off" && showTranslation) {
        console.log("[LyricsChords] AI mode OFF - ignoring translation selection in panel");
        showTranslation = false;
        showDefault = true;
        window.ycLyricsSplitViewTranslationMode = false;
      }

      console.log("[LyricsChords] 🔍 Current selection:", {
        showDefault,
        showTranslation, // 🆕
        translationLanguage, // 🆕
        selectedCustomPromptId,
        hasData: !!subtitlesData,
        hasSentenceSRT: !!subtitlesData?.sentenceSRT,
        hasTranslationSRT: !!subtitlesData?.translationSRT, // 🆕
        hasCustomPromptResponse: !!subtitlesData?.customPromptResponse,
        cachedCustomPromptId: subtitlesData?.customPromptId
      });

      // 🎯 Check what we should display
      // User can choose either DEFAULT or TRANSLATION (not both)
      const shouldShowDefault = showDefault && !showTranslation && !!subtitlesData?.sentenceSRT;
      const shouldShowTranslation = showTranslation && !!subtitlesData?.translationSRT; // 🆕
      const customPromptMatches = selectedCustomPromptId === subtitlesData?.customPromptId;
      const shouldShowCustom = selectedCustomPromptId && customPromptMatches && !!subtitlesData?.customPromptResponse;
      const showBoth = (shouldShowDefault || shouldShowTranslation) && shouldShowCustom; // 🆕 Support TRANSLATION + CUSTOM

      console.log("[LyricsChords] 🎯 Display decision:", {
        shouldShowDefault,
        shouldShowTranslation, // 🆕
        shouldShowCustom,
        showBoth
      });

      // 🎯 תיקון קריטי: זיהוי כיוון מחדש לפי הטקסט שמוצג בפועל
      let activeTextForDirection = "";

      if (shouldShowTranslation && subtitlesData?.translationSRT) {
        activeTextForDirection = subtitlesData.translationSRT;
      } else if (shouldShowDefault && subtitlesData?.sentenceSRT) {
        activeTextForDirection = subtitlesData.sentenceSRT;
      } else if (shouldShowCustom && subtitlesData?.customPromptResponse) {
        activeTextForDirection = subtitlesData.customPromptResponse;
      }

      // זיהוי כיוון רק אם יש טקסט
      if (activeTextForDirection) {
        // לוגיקה מקומית לזיהוי כיוון (אותה לוגיקה כמו ב-detectTextDirection אבל על הטקסט הספציפי)
        const rtlCount = (activeTextForDirection.match(/[\u0590-\u05FF\u0600-\u06FF]/g) || []).length;
        const ltrCount = (activeTextForDirection.match(/[A-Za-z]/g) || []).length;
        const detectedDirection = rtlCount > ltrCount ? "rtl" : "ltr";
        const newDirection = resolvePanelsDirection(detectedDirection);

        console.log(`[LyricsChords] 🔄 עדכון כיוון דינמי: ${newDirection.toUpperCase()} (לפי הטקסט הפעיל)`);

        // עדכון ה-Class של הפאנל (רק CSS, לא מיקום!)
        if (lyricsChordsPanelElement) {
          applyLyricsPanelDirectionClass(newDirection);

          // עדכון ה-Cache הגלובלי לכיוון שזוהה אוטומטית (לא forced)
          cachedDirection = detectedDirection;
          cachedVideoId = videoId;

          // 🎯 לא מזיזים את הפאנל כשמרעננים prompts - רק כשפותחים מחדש
          // adjustVideoPosition יקרא רק בפתיחה ראשונית של הפאנל
        }
      }

      // 🎯 Case 1: Show both (split view) - DEFAULT/TRANSLATION + CUSTOM
      if (showBoth) {
        const isTranslationMode = shouldShowTranslation; // 🆕
        console.log(`[LyricsChords] 📄 Displaying SPLIT VIEW (${isTranslationMode ? 'translation' : 'default'} + custom)`);

        // 🆕 Store translation mode flag for later use
        window.ycLyricsSplitViewTranslationMode = isTranslationMode;

        // Get custom prompt name
        let promptName = "Custom Prompt";
        if (subtitlesData.customPromptId) {
          try {
            const result = await chrome.storage.local.get(['geminiPrompts']);
            const customPrompts = result.geminiPrompts || [];
            const prompt = customPrompts.find(p => p.id === subtitlesData.customPromptId);
            if (prompt?.title) {
              promptName = prompt.title;
            }
          } catch (e) {
            console.warn("[LyricsChords] Failed to load prompt name:", e);
          }
        }

        // Clean custom response
        let cleanResponse = (subtitlesData.customPromptResponse || "").trim();
        const customResponseDirection = detectTextDirection(
          { customPromptResponse: cleanResponse },
          null,
          true
        );
        const customResponseTextAlign =
          customResponseDirection === "rtl" ? "right" : "left";

        // Reset contentDiv styles
        contentDiv.style.padding = '0';
        contentDiv.style.alignItems = 'initial';
        contentDiv.style.display = 'flex';
        contentDiv.style.flexDirection = 'column';
        contentDiv.style.height = '100%';
        contentDiv.style.overflow = 'hidden';
        contentDiv.scrollTop = 0;

        // Check if custom section should be minimized (from localStorage)
        const customMinimizedKey = 'yc_custom_section_minimized';
        const isMinimized = localStorage.getItem(customMinimizedKey) === 'true';

        // Create split view HTML
        contentDiv.innerHTML = `
          <div class="custom-section" id="customPromptSection" style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: ${isMinimized ? '8px 0' : '15px 0'};
            margin: 10px 10px 0 10px;
            border-radius: 8px;
            ${isMinimized ? '' : 'max-height: 300px;'}
            overflow: hidden;
            flex-shrink: 0;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            transition: max-height 0.3s ease, padding 0.3s ease;">
            <div class="custom-header" style="
              display: flex;
              align-items: center;
              margin-bottom: ${isMinimized ? '0' : '10px'};
              font-size: 14px;
              font-weight: 600;
              opacity: 0.9;
              position: relative;">
              <span dir="auto" class="yc-custom-prompt-title" style="flex: 1; padding-left: 30px; padding-right: 85px;"></span>
              <button class="resize-minus-btn" style="
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                font-size: 16px;
                width: 22px;
                height: 22px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                flex-shrink: 0;
                position: absolute;
                right: 50px;
                top: 50%;
                transform: translateY(-50%);">
                −
              </button>
              <button class="resize-plus-btn" style="
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                font-size: 16px;
                width: 22px;
                height: 22px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                flex-shrink: 0;
                position: absolute;
                right: 25px;
                top: 50%;
                transform: translateY(-50%);">
                +
              </button>
              <button class="minimize-btn" style="
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                font-size: 14px;
                width: 22px;
                height: 22px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                flex-shrink: 0;
                position: absolute;
                right: 0;
                top: 50%;
                transform: translateY(-50%);">
                ${isMinimized ? '▶' : '▼'}
              </button>
              <button class="dismiss-btn" title="Dismiss custom prompt" style="
                background: rgba(255,100,100,0.25);
                border: none;
                color: white;
                font-size: 14px;
                width: 22px;
                height: 22px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                flex-shrink: 0;
                position: absolute;
                left: 0;
                top: 50%;
                transform: translateY(-50%);">
                ✕
              </button>
            </div>
            <div class="custom-content" style="
              overflow-y: auto;
              max-height: ${isMinimized ? '0' : '270px'};
              transition: max-height 0.3s ease, opacity 0.3s ease;
              opacity: ${isMinimized ? '0' : '1'};">
              <div class="custom-prompt-response" dir="${customResponseDirection}" style="
                font-size: 13px;
                line-height: 1.6;
                white-space: pre-wrap;
                padding: 10px 10px 0 10px;
                word-wrap: break-word;
                overflow-wrap: break-word;
                direction: ${customResponseDirection};
                text-align: ${customResponseTextAlign};
                unicode-bidi: plaintext;">
              </div>
            </div>
          </div>
          <div class="default-section" id="defaultLyricsSection" style="
            flex: 1;
            overflow-y: auto;
            padding: 15px;
            margin: 10px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;">
            <!-- Default lyrics will be inserted here -->
          </div>
        `;

        const promptTitleEl = contentDiv.querySelector('.yc-custom-prompt-title');
        if (promptTitleEl) {
          promptTitleEl.textContent = promptName;
        }
        const customResponse = contentDiv.querySelector('.custom-prompt-response');
        if (customResponse) {
          customResponse.textContent = cleanResponse;
          customResponse.style.direction = customResponseDirection;
          customResponse.style.textAlign = customResponseTextAlign;
          customResponse.setAttribute("dir", customResponseDirection);
        }

        // Add minimize/expand functionality
        const minimizeBtn = contentDiv.querySelector('.minimize-btn');
        const resizeMinusBtn = contentDiv.querySelector('.resize-minus-btn');
        const resizePlusBtn = contentDiv.querySelector('.resize-plus-btn');
        const customContent = contentDiv.querySelector('.custom-content');
        const customSection = contentDiv.querySelector('.custom-section');
        const customHeader = contentDiv.querySelector('.custom-header');

        // Get saved height from localStorage (default 300px)
        const customHeightKey = 'yc_custom_section_height';
        const CUSTOM_HEIGHT_MIN = 150;
        const CUSTOM_HEIGHT_MAX = 800;
        const CUSTOM_HEIGHT_STEP = 100;
        const CUSTOM_HEADER_OFFSET = 30;
        let customSectionHeight = parseInt(localStorage.getItem(customHeightKey), 10) || 300;

        const clampCustomHeight = (value) => {
          const numeric = Number.isFinite(value) ? value : 300;
          return Math.max(CUSTOM_HEIGHT_MIN, Math.min(CUSTOM_HEIGHT_MAX, Math.round(numeric)));
        };

        const readStoredCustomHeight = () => {
          const storedHeight = parseInt(localStorage.getItem(customHeightKey), 10);
          return clampCustomHeight(storedHeight);
        };

        const isCustomSectionMinimized = () => {
          if (localStorage.getItem(customMinimizedKey) === 'true') return true;
          const inlineMaxHeight = parseFloat(customContent.style.maxHeight || 'NaN');
          if (Number.isFinite(inlineMaxHeight)) return inlineMaxHeight <= 1;
          const computedMaxHeight = parseFloat(getComputedStyle(customContent).maxHeight || 'NaN');
          return Number.isFinite(computedMaxHeight) && computedMaxHeight <= 1;
        };

        const applyExpandedCustomState = (height, persist = true) => {
          const normalizedHeight = clampCustomHeight(height);
          customSectionHeight = normalizedHeight;
          customSection.style.maxHeight = normalizedHeight + 'px';
          customContent.style.maxHeight = (normalizedHeight - CUSTOM_HEADER_OFFSET) + 'px';
          customContent.style.opacity = '1';
          customSection.style.padding = '15px 0';
          if (customHeader) customHeader.style.marginBottom = '10px';
          if (minimizeBtn) {
            minimizeBtn.textContent = '\u25BC';
          }
          localStorage.setItem(customMinimizedKey, 'false');
          if (persist) {
            localStorage.setItem(customHeightKey, String(normalizedHeight));
          }
        };

        const applyMinimizedCustomState = () => {
          customContent.style.maxHeight = '0px';
          customContent.style.opacity = '0';
          customSection.style.maxHeight = 'none';
          customSection.style.padding = '8px 0';
          if (customHeader) customHeader.style.marginBottom = '0';
          if (minimizeBtn) {
            minimizeBtn.textContent = '\u25B6';
          }
          localStorage.setItem(customMinimizedKey, 'true');
        };

        const getEffectiveCustomHeight = () => {
          const renderedHeight = Math.round(customSection.getBoundingClientRect().height);
          if (Number.isFinite(renderedHeight) && renderedHeight > 0) {
            return clampCustomHeight(renderedHeight);
          }
          const inlineMaxHeight = parseFloat(customSection.style.maxHeight || 'NaN');
          if (Number.isFinite(inlineMaxHeight) && inlineMaxHeight > 0) {
            return clampCustomHeight(inlineMaxHeight);
          }
          return readStoredCustomHeight();
        };

        // Apply initial state on load
        if (isCustomSectionMinimized()) {
          applyMinimizedCustomState();
        } else {
          applyExpandedCustomState(readStoredCustomHeight(), false);
        }

        if (minimizeBtn && customContent && customSection) {
          minimizeBtn.addEventListener('click', () => {
            const currentlyMinimized = isCustomSectionMinimized();
            if (currentlyMinimized) {
              applyExpandedCustomState(readStoredCustomHeight(), false);
            } else {
              applyMinimizedCustomState();
            }
          });

          // Hover effect
          minimizeBtn.addEventListener('mouseenter', () => {
            minimizeBtn.style.background = 'rgba(255,255,255,0.3)';
            minimizeBtn.style.transform = 'translateY(-50%) scale(1.1)';
          });

          minimizeBtn.addEventListener('mouseleave', () => {
            minimizeBtn.style.background = 'rgba(255,255,255,0.2)';
            minimizeBtn.style.transform = 'translateY(-50%) scale(1)';
          });
        }

        // Resize functionality (+/-)
        if (resizePlusBtn && resizeMinusBtn && customSection && customContent) {
          // Plus button - increase height
          resizePlusBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            // Don't resize if minimized
            if (isCustomSectionMinimized()) {
              return;
            }

            const nextHeight = clampCustomHeight(getEffectiveCustomHeight() + CUSTOM_HEIGHT_STEP);
            applyExpandedCustomState(nextHeight);
          });

          // Minus button - decrease height
          resizeMinusBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            // Don't resize if minimized
            if (isCustomSectionMinimized()) {
              return;
            }

            const nextHeight = clampCustomHeight(getEffectiveCustomHeight() - CUSTOM_HEIGHT_STEP);
            applyExpandedCustomState(nextHeight);
          });

          // Hover effects for resize buttons
          [resizePlusBtn, resizeMinusBtn].forEach(btn => {
            btn.addEventListener('mouseenter', () => {
              btn.style.background = 'rgba(255,255,255,0.3)';
              btn.style.transform = 'translateY(-50%) scale(1.1)';
            });

            btn.addEventListener('mouseleave', () => {
              btn.style.background = 'rgba(255,255,255,0.2)';
              btn.style.transform = 'translateY(-50%) scale(1)';
            });
          });
        }

        const dismissBtn = contentDiv.querySelector('.dismiss-btn');
        if (dismissBtn) {
          dismissBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            console.log('[LyricsChords] ✕ Dismiss custom prompt clicked');

            // Update storage: deselect custom, ensure default is on
            await chrome.storage.local.set({
              selectedCustomPromptId: null,
              showDefault: true
            });

            console.log('[LyricsChords] ✕ Storage updated - custom deselected, default enabled');

            // Animate out the custom section
            customSection.style.transition = 'max-height 0.3s ease, opacity 0.3s ease, padding 0.3s ease';
            customSection.style.maxHeight = '0';
            customSection.style.opacity = '0';
            customSection.style.padding = '0';
            customSection.style.margin = '0';
            customSection.style.overflow = 'hidden';

            // After animation, remove from DOM and expand default section
            setTimeout(() => {
              customSection.remove();
              const defaultSection = contentDiv.querySelector('.default-section');
              if (defaultSection) {
                defaultSection.style.flex = '1';
              }
            }, 300);

            // Notify popup if it's open (so checkboxes update)
            chrome.runtime.sendMessage({
              command: 'dismissCustomPrompt'
            }).catch(() => {
              // Popup might not be open - that's fine, storage is already updated
            });
          });

          // Hover effect for dismiss button
          dismissBtn.addEventListener('mouseenter', () => {
            dismissBtn.style.background = 'rgba(255,100,100,0.5)';
            dismissBtn.style.transform = 'translateY(-50%) scale(1.1)';
          });

          dismissBtn.addEventListener('mouseleave', () => {
            dismissBtn.style.background = 'rgba(255,100,100,0.25)';
            dismissBtn.style.transform = 'translateY(-50%) scale(1)';
          });
        }

        // Apply font size
        setTimeout(() => {
          applyFontSize();
        }, 0);

        // Continue to load default lyrics into the default section
        // (don't return - let the code below handle default lyrics)

      } else if (shouldShowCustom) {
        // 🎯 Case 2: Show only custom prompt
        console.log("[LyricsChords] 📄 Displaying custom prompt only");

        // Get prompt name
        let promptName = "Custom Prompt";
        if (subtitlesData.customPromptId) {
          try {
            const result = await chrome.storage.local.get(['geminiPrompts']);
            const customPrompts = result.geminiPrompts || [];
            const prompt = customPrompts.find(p => p.id === subtitlesData.customPromptId);
            if (prompt?.title) {
              promptName = prompt.title;
            }
          } catch (e) {
            console.warn("[LyricsChords] Failed to load prompt name:", e);
          }
        }

        // Clean response
        let cleanResponse = (subtitlesData.customPromptResponse || "").trim();
        const customResponseDirection = detectTextDirection(
          { customPromptResponse: cleanResponse },
          null,
          true
        );
        const customResponseTextAlign =
          customResponseDirection === "rtl" ? "right" : "left";

        // 🔧 Reset contentDiv styles (exit split view if needed)
        contentDiv.style.padding = '15px';
        contentDiv.style.alignItems = 'initial';
        contentDiv.style.display = 'block';
        contentDiv.style.flexDirection = ''; // Reset flex
        contentDiv.style.height = ''; // Reset height
        contentDiv.style.overflow = 'auto'; // ✅ Enable scrolling!
        contentDiv.scrollTop = 0;

        contentDiv.innerHTML = `
          <div class="custom-prompt-response" dir="${customResponseDirection}" style="
            padding: 0 10px 20px 10px;
            margin-top: 0;
            line-height: 1.5;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            unicode-bidi: plaintext;
            direction: ${customResponseDirection};
            text-align: ${customResponseTextAlign};">
            <div class="custom-prompt-title" style="margin: 0 0 10px 0; padding-bottom: 8px; text-align: center;">
              <strong style="font-size: 1.2em; text-decoration: underline; display: block; width: 100%; text-align: center;"></strong>
            </div>
            <div class="custom-prompt-body" style="white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word;"></div>
          </div>
        `;

        const customTitleEl = contentDiv.querySelector('.custom-prompt-title strong');
        if (customTitleEl) {
          customTitleEl.textContent = promptName;
        }
        const customBodyEl = contentDiv.querySelector('.custom-prompt-body');
        if (customBodyEl) {
          customBodyEl.textContent = cleanResponse;
          customBodyEl.style.direction = customResponseDirection;
          customBodyEl.style.textAlign = customResponseTextAlign;
          customBodyEl.setAttribute("dir", customResponseDirection);
        }

        // Always open custom-only from the top.
        contentDiv.scrollTop = 0;

        // Apply font size
        setTimeout(() => {
          applyFontSize();
        }, 0);

        // Set flag for carousel
        if (window.subtitleState) {
          window.subtitleState.isCustomPrompt = true;
        }

        return; // Exit - custom prompt only
      }

      // 🎯 Case 3: Show only default/translation (no custom)
      // If we were in split view but now we're not, reset the HTML
      if (!showBoth) {
        console.log("[LyricsChords] 📄 Displaying default/translation only (no custom)");

        // Check if we need to exit split view
        const wasInSplitView = !!document.getElementById('defaultLyricsSection');
        if (wasInSplitView) {
          console.log("[LyricsChords] 🔄 Exiting split view - resetting HTML");
          // Reset contentDiv to normal state
          contentDiv.style.padding = '0';
          contentDiv.style.alignItems = 'initial';
          contentDiv.style.display = 'block';
          contentDiv.style.flexDirection = '';
          contentDiv.style.height = '';
          contentDiv.style.overflow = '';
          contentDiv.innerHTML = ''; // Clear split view HTML

          // Clear split view flag
          if (window.ycLyricsSplitViewTranslationMode !== undefined) {
            delete window.ycLyricsSplitViewTranslationMode;
          }
        }
      }

      // Continue with normal flow below...
    }

    // 🎯 Check if we're in split view mode
    const isSplitView = !!document.getElementById('defaultLyricsSection');
    const targetContainer = isSplitView
      ? document.getElementById('defaultLyricsSection')
      : contentDiv;

    if (isSplitView) {
      const isTranslation = window.ycLyricsSplitViewTranslationMode || false;
      console.log(`[LyricsChords] 🎯 Split view mode - inserting ${isTranslation ? 'translation' : 'default'} lyrics into defaultLyricsSection`);
    }

    // 🎯 איפוס כל ה-caches לפני טעינת תוכן חדש
    if (typeof invalidateAllCaches === "function") {
      invalidateAllCaches();
    } else {
      // Fallback אם הפונקציה לא קיימת עדיין
      cachedWordElements = null;
      cachedChordElements = null;
      cachedWordElementsValid = false;
      cachedChordElementsValid = false;
    }
    console.log("[LyricsChords] איפוס cache אלמנטים לשיר חדש");

    // שילוב נתוני מילים ואקורדים
    const combinedData = await combineLyricsAndChords();

    if (combinedData.length === 0) {
      targetContainer.innerHTML =
        '<div class="lyrics-chords-error">No synchronized data available</div>';
      return;
    }

    // יצירת HTML לתוכן עם טיפול בשגיאות
    console.log("[LyricsChords] יצירת HTML עבור", combinedData.length, "שורות");
    console.log("[LyricsChords] שורה ראשונה:", combinedData[0]);

    let html = '<div class="lyrics-chords-lines">';
    let htmlBuildSuccess = false;

    try {
      // הפרדה לבלוקים לפי פערי זמן גדולים
      const BLOCK_GAP_THRESHOLD = 3.0; // פער זמני לחלוקת בלוקים (3 שניות)
      const blocks = [];
      let currentBlock = [];

      // קיבוץ שורות לבלוקים לפי פערי זמן
      combinedData.forEach((line, lineIndex) => {
        const nextLine = combinedData[lineIndex + 1];

        // הוספת השורה הנוכחית לבלוק
        currentBlock.push(line);

        // בדיקה אם צריך לסיים את הבלוק
        let shouldEndBlock = false;

        if (!nextLine) {
          // זו השורה האחרונה - סיום הבלוק
          shouldEndBlock = true;
        } else {
          // חישוב הפער הזמני בין השורה הנוכחית לבאה
          const currentLineEnd = line.end || 0;
          const nextLineStart = nextLine.start || 0;
          const timeGap = nextLineStart - currentLineEnd;

          // אם הפער גדול מהסף - בלוק חדש
          if (timeGap > BLOCK_GAP_THRESHOLD) {
            shouldEndBlock = true;
            console.log(
              `[LyricsChords] פער זמני גדול (${timeGap.toFixed(
                2
              )}s > ${BLOCK_GAP_THRESHOLD}s) - יוצר בלוק חדש`
            );
          }
        }

        // אם צריך לסיים את הבלוק
        if (shouldEndBlock && currentBlock.length > 0) {
          blocks.push(currentBlock);
          console.log(
            `[LyricsChords] יצר בלוק עם ${currentBlock.length} שורות`
          );
          currentBlock = [];
        }
      });

      console.log(`[LyricsChords] חולק תוכן ל-${blocks.length} בלוקים`);

      // יצירת HTML עבור כל בלוק
      blocks.forEach((block, blockIndex) => {
        // הוספת מעטפת בלוק
        html += `<div class="lyrics-chords-block" data-block="${blockIndex}">`;

        block.forEach((line, lineIndex) => {
          // 🎵 הוספת class לפזמון ובית (זמני - לבדיקה)
          const chorusClass = line.isChorus ? " chorus-line" : "";
          const verseClass = line.verseNumber ? ` verse-${line.verseNumber}` : "";

          // זיהוי סוג הקטע (intro/instrumental/outro)
          let sectionAttr = "";
          if (line.isInstrumental && line.text) {
            if (line.text === "[Intro]") sectionAttr = ' data-intro="true"';
            else if (line.text === "[Instrumental]") sectionAttr = ' data-instrumental="true"';
            else if (line.text === "[Outro]") sectionAttr = ' data-outro="true"';
          }

          html += `<div class="lyrics-chords-line${chorusClass}${verseClass}" data-line="${lineIndex}" data-verse="${line.verseNumber || 0}" data-chorus="${line.isChorus || false}"${sectionAttr}>`;

          // ✅ טיפול בטקסט עם ירידת שורה (תרגום דו-לשוני)
          // חשוב! זה חייב לבוא לפני הבדיקה של line.words
          if (line.text && line.text.includes('\n')) {
            const textParts = line.text.split('\n');

            // 🎯 פונקציית עזר לזיהוי RTL
            const isRTL = (text) => /[\u0590-\u05FF\u0600-\u06FF]/.test(text);

            // 🎬 פיצול כל חלק לשורות מאוזנות (42 תווים - Netflix standard)
            const allBalancedParts = [];
            textParts.forEach(part => {
              const balancedLines = splitTextBalanced(part, 42);
              allBalancedParts.push(...balancedLines);
            });

            // בונים HTML עם direction מפורש לכל שורה
            const innerHtml = allBalancedParts.map(part => {
              const dirStyle = isRTL(part)
                ? 'direction: rtl; text-align: center; unicode-bidi: embed; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; max-width: 100%;'
                : 'direction: ltr; text-align: center; unicode-bidi: embed; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; max-width: 100%;';

              return `<div style="${dirStyle}">${part}</div>`;
            }).join('');

            html += `<div class="lyrics-chords-word-line" style="display: block; width: 100%;">
              <span class="lyrics-word" data-time="${line.start}" data-end="${line.end}" style="display: block; width: 100%; cursor: pointer;">
                ${innerHtml}
              </span>
            </div>`;
          }
          // טיפול בקטעים אינסטרומנטליים
          else if (line.isInstrumental) {
            // הוספת קו מפריד לפני הסקשן
            if (line.text === "[Intro]") {
              // Intro - ללא קו מעליו
            } else if (line.text === "[Instrumental]") {
              // Instrumental - קו רגיל מעליו
              html += `<div class="section-separator-line"></div>`;
            } else if (line.text === "[Outro]") {
              // Outro - קו עם נקודות מעליו
              html += `<div class="section-separator-with-dots"><span class="section-separator-dots">• • •</span></div>`;
            }

            html += `<div class="instrumental-label" data-start="${line.start}" data-end="${line.end}">${line.text}</div>`;

            if (line.chords && line.chords.length > 0) {
              html += '<div class="lyrics-chords-word-line">';

              // בדיקה אם הפאנל הוא RTL
              const isRTL =
                lyricsChordsPanelElement &&
                lyricsChordsPanelElement.classList.contains(
                  "yt-lyrics-chords-rtl"
                );
              const marginProperty = isRTL ? "margin-left" : "margin-right";

              // חישוב רווחים לפי משך זמן של כל אקורד
              line.chords.forEach((chord, chordIndex) => {
                const chordName = chord.chord || chord.name || chord;
                // 🎸 תמיכה בקאפו - הצגת האקורד המתורגם
                const displayName = window.getCapoChord ? window.getCapoChord(chordName, "panel") : chordName;
                const currentTime = chord.time;

                // חישוב משך זמן האקורד
                let duration;
                if (chordIndex < line.chords.length - 1) {
                  // יש אקורד הבא - חשב את ההפרש
                  const nextChord = line.chords[chordIndex + 1];
                  duration = nextChord.time - currentTime;
                } else {
                  // אקורד אחרון - עד סוף הקטע
                  duration = line.end - currentTime;
                }

                // המרה לרווח בפיקסלים (פקטור: 15px לשנייה)
                // מינימום 4px, מקסימום 60px
                const spacing = Math.min(Math.max(duration * 15, 4), 60);

                html += `<span class="lyrics-chord" data-time="${chord.time}" data-chord-name="${chordName}" style="${marginProperty}: ${spacing}px">${displayName}</span>`;
              });

              html += "</div>";
            }

            // הוספת קו מפריד אחרי האקורדים
            if (line.text === "[Intro]") {
              // Intro - קו עם נקודות מתחת
              html += `<div class="section-separator-with-dots"><span class="section-separator-dots">• • •</span></div>`;
            } else if (line.text === "[Instrumental]") {
              // Instrumental - קו רגיל מתחת
              html += `<div class="section-separator-line"></div>`;
            } else if (line.text === "[Outro]") {
              // Outro - ללא קו מתחת
            }
          }
          // יצירת שורה משולבת עם אקורדים מעל מילים
          else if (line.words && line.words.length > 0) {
            // Word-level view stays clean (Gemini + YouTube native look the same)
            const showChords = false;

            // 🔧 שלב 1: יצירת מבנה מילה+אקורד עם תמיכה ב-Chord Gaps
            const allChords = line.chords || [];
            const usedChordIndices = new Set();

            // יצירת מבנה מילה+אקורד
            const wordChordPairs = line.words.map((word) => {
              // מציאת אקורדים שמתחילים בזמן המילה
              const wordChords = allChords.filter((chord, idx) => {
                if (chord.time >= word.start && chord.time <= word.end) {
                  usedChordIndices.add(idx);
                  return true;
                }
                return false;
              });

              return {
                word: word,
                chords: wordChords,
                isChordGap: false,
              };
            });

            // 🔧 שלב 2: מציאת אקורדים "יתומים" שלא משויכים לאף מילה
            const orphanChords = allChords.filter(
              (chord, idx) => !usedChordIndices.has(idx)
            );

            // 🔧 שלב 3: שיוך אקורדים יתומים למילה הקרובה או יצירת Chord Gap
            const ORPHAN_THRESHOLD = 0.5; // סף מרחק לשיוך למילה קרובה (0.5 שניות)

            orphanChords.forEach((orphanChord) => {
              // מציאת המילה הקרובה ביותר
              let closestPairIndex = -1;
              let minDistance = Infinity;

              wordChordPairs.forEach((pair, idx) => {
                if (pair.isChordGap) return; // דלג על Chord Gaps קיימים

                const wordStart = pair.word.start || 0;
                const wordEnd = pair.word.end || wordStart;

                // חישוב המרחק מהאקורד למילה
                const distToStart = Math.abs(orphanChord.time - wordStart);
                const distToEnd = Math.abs(orphanChord.time - wordEnd);
                const dist = Math.min(distToStart, distToEnd);

                if (dist < minDistance) {
                  minDistance = dist;
                  closestPairIndex = idx;
                }
              });

              // אם המרחק קטן מהסף - שייך למילה הקרובה
              if (closestPairIndex !== -1 && minDistance <= ORPHAN_THRESHOLD) {
                wordChordPairs[closestPairIndex].chords.push(orphanChord);
                // מיון האקורדים לפי זמן
                wordChordPairs[closestPairIndex].chords.sort((a, b) => a.time - b.time);
                console.log(`[LyricsChords] 🔧 אקורד "${orphanChord.chord || orphanChord.name}" שויך למילה "${wordChordPairs[closestPairIndex].word.word}" (מרחק: ${minDistance.toFixed(3)}s)`);
              } else if (showChords) {
                // המרחק גדול מהסף - יצירת Chord Gap (רק אם אקורדים מופעלים!)
                const chordIdx = allChords.indexOf(orphanChord);
                const nextChord = allChords[chordIdx + 1];
                const duration = nextChord
                  ? nextChord.time - orphanChord.time
                  : line.end - orphanChord.time;

                const chordGap = {
                  word: {
                    word: "", // מילה ריקה
                    start: orphanChord.time,
                    end: orphanChord.time + duration,
                  },
                  chords: [orphanChord],
                  isChordGap: true,
                  gapDuration: duration,
                };

                // מציאת המיקום הנכון להכנסה (לפי זמן)
                let insertIndex = wordChordPairs.findIndex(
                  (pair) => pair.word.start > orphanChord.time
                );
                if (insertIndex === -1) {
                  wordChordPairs.push(chordGap);
                } else {
                  wordChordPairs.splice(insertIndex, 0, chordGap);
                }
                console.log(`[LyricsChords] 🔧 אקורד "${orphanChord.chord || orphanChord.name}" נשאר כ-Chord Gap (מרחק: ${minDistance.toFixed(3)}s > ${ORPHAN_THRESHOLD}s)`);
              }
              // אם אקורדים כבויים - פשוט מדלגים על האקורד היתום (לא יוצרים Chord Gap)
            });

            // 🎵 Check if Sentence Mode is enabled (default: true)
            const savedSentenceMode = localStorage.getItem("yc_sentence_mode");
            if (typeof window.ycSentenceModeEnabled !== "boolean") {
              window.ycSentenceModeEnabled =
                savedSentenceMode === null ? true : savedSentenceMode === "true";
            }
            const sentenceModeEnabled = window.ycSentenceModeEnabled === true;

            // Time gap threshold for line breaks
            const TIME_GAP_THRESHOLD = 1.0;

            let finalLines = [];

            if (sentenceModeEnabled) {
              // ═══════════════════════════════════════════════════════════
              // 🆕 NEW MODE: Sentence Mode ON - punctuation + balanced split
              // ═══════════════════════════════════════════════════════════

              // Helper: check if word ends with sentence-ending punctuation
              const endsWithPunct = (word) => /[.!?]$/.test(word);

              // Helper: calculate line length in characters
              const getLineChars = (pairs) => pairs.reduce((sum, p) => {
                const w = p.word.word || p.word.text || "";
                return sum + w.length + 1;
              }, 0);

              // STEP 1: Split by PUNCTUATION first
              const punctLines = [];
              let currentLine = [];

              wordChordPairs.forEach((pair, pairIndex) => {
                const wordText = pair.word.word || pair.word.text || "";
                currentLine.push(pair);

                if (endsWithPunct(wordText) && pairIndex < wordChordPairs.length - 1) {
                  punctLines.push(currentLine);
                  currentLine = [];
                }
              });
              if (currentLine.length > 0) punctLines.push(currentLine);

              // STEP 2: Further split by TIME GAPS
              const wordLines = [];
              punctLines.forEach(line => {
                let subLine = [];
                let prevWordEnd = null;

                line.forEach((pair) => {
                  const wordStart = pair.word.start || 0;
                  const wordEnd = pair.word.end || wordStart;

                  if (prevWordEnd !== null) {
                    const timeGap = wordStart - prevWordEnd;
                    if (timeGap >= TIME_GAP_THRESHOLD && subLine.length > 0) {
                      wordLines.push(subLine);
                      subLine = [];
                    }
                  }

                  subLine.push(pair);
                  prevWordEnd = wordEnd;
                });

                if (subLine.length > 0) wordLines.push(subLine);
              });

              // STEP 3: Balanced split for long lines
              const balancedSplit = (pairs, maxChars) => {
                const totalChars = getLineChars(pairs);
                if (totalChars <= maxChars || pairs.length <= 2) return [pairs];

                const numLines = Math.ceil(totalChars / maxChars);
                const targetPerLine = totalChars / numLines;

                const result = [];
                let current = [];
                let currentChars = 0;

                for (let i = 0; i < pairs.length; i++) {
                  const w = pairs[i].word.word || pairs[i].word.text || "";
                  const wChars = w.length + 1;
                  const remaining = pairs.length - i;

                  current.push(pairs[i]);
                  currentChars += wChars;

                  if (currentChars >= targetPerLine * 1.1 && current.length >= 2 && remaining > 1) {
                    result.push(current);
                    current = [];
                    currentChars = 0;
                  }
                }
                if (current.length > 0) result.push(current);

                // Fix orphans
                for (let i = result.length - 1; i > 0; i--) {
                  if (result[i].length === 1 && result[i - 1].length > 1) {
                    const merged = [...result[i - 1], ...result[i]];
                    const half = getLineChars(merged) / 2;
                    let chars = 0, splitAt = 1;

                    for (let j = 0; j < merged.length - 1; j++) {
                      const ww = merged[j].word.word || merged[j].word.text || "";
                      chars += ww.length + 1;
                      if (chars <= half) splitAt = j + 1;
                    }

                    splitAt = Math.max(Math.ceil(merged.length / 2), splitAt);
                    splitAt = Math.min(splitAt, merged.length - 1);

                    result[i - 1] = merged.slice(0, splitAt);
                    result[i] = merged.slice(splitAt);
                  }
                }
                return result;
              };

              const panelWidth = window.currentLyricsChordsPanelWidth || 300;
              const maxChars = Math.floor(calcMaxCharsPerLine(panelWidth) * 0.75);

              wordLines.forEach(line => {
                const split = balancedSplit(line, maxChars);
                finalLines.push(...split);
              });

            } else {
              // ═══════════════════════════════════════════════════════════
              // 📜 OLD MODE: Sentence Mode OFF - only time gaps (original)
              // ═══════════════════════════════════════════════════════════

              let currentLine = [];
              let prevWordEnd = null;

              wordChordPairs.forEach((pair) => {
                const wordStart = pair.word.start || 0;
                const wordEnd = pair.word.end || wordStart;

                if (prevWordEnd !== null) {
                  const timeGap = wordStart - prevWordEnd;
                  if (timeGap >= TIME_GAP_THRESHOLD && currentLine.length > 0) {
                    finalLines.push(currentLine);
                    currentLine = [];
                  }
                }

                currentLine.push(pair);
                prevWordEnd = wordEnd;
              });

              if (currentLine.length > 0) finalLines.push(currentLine);
            }

            // Generate HTML for each line
            finalLines.forEach((linePairs) => {
              html += '<div class="lyrics-chords-word-line">';

              linePairs.forEach((pair) => {
                const wordTextRaw = pair.word.word || pair.word.text || "";
                // Remove punctuation from display (always) and convert to lowercase
                const wordText = wordTextRaw.replace(/[.!?]$/, "").toLowerCase(); // 🎯 אותיות קטנות

                // 🔧 Chord Gap - אקורד עם רווח ריק מתחתיו
                if (pair.isChordGap) {
                  // חישוב רוחב לפי משך הזמן (15px לשנייה, מינימום 20px, מקסימום 80px)
                  const gapWidth = Math.min(
                    Math.max((pair.gapDuration || 1) * 15, 20),
                    80
                  );

                  html += `<div class="word-chord-container chord-gap" style="min-width: ${gapWidth}px">`;

                  // אקורד מעל
                  html += '<div class="chord-above">';
                  pair.chords.forEach((chord) => {
                    const chordName = chord.chord || chord.name || chord;
                    // 🎸 תמיכה בקאפו
                    const displayName = window.getCapoChord ? window.getCapoChord(chordName, "panel") : chordName;
                    html += `<span class="lyrics-chord" data-time="${chord.time}" data-chord-name="${chordName}">${displayName}</span>`;
                  });
                  html += "</div>";

                  // רווח ריק מתחת (במקום מילה)
                  html += `<div class="word-below"><span class="lyrics-word chord-gap-spacer" data-time="${pair.word.start}" data-end="${pair.word.end}">&nbsp;</span></div>`;

                  html += "</div>";
                } else {
                  // מילה רגילה
                  html += '<div class="word-chord-container">';

                  // אקורדים מעל מילים כבויים תמיד במצב word-level
                  if (showChords) {
                    if (pair.chords.length > 0) {
                      html += '<div class="chord-above">';
                      pair.chords.forEach((chord) => {
                        const chordName = chord.chord || chord.name || chord;
                        // 🎸 תמיכה בקאפו
                        const displayName = window.getCapoChord ? window.getCapoChord(chordName, "panel") : chordName;
                        html += `<span class="lyrics-chord" data-time="${chord.time}" data-chord-name="${chordName}">${displayName}</span>`;
                      });
                      html += "</div>";
                    } else {
                      html += '<div class="chord-above"></div>';
                    }
                  }

                  // המילה
                  html += `<div class="word-below"><span class="lyrics-word" data-time="${pair.word.start}" data-end="${pair.word.end}">${wordText}</span></div>`;

                  html += "</div>";
                }
              });

              html += "</div>"; // סגירת lyrics-chords-word-line
            });
          } else if (line.text) {
            // אם אין מילים נפרדות, הצג את הטקסט המלא
            html += `<div class="lyrics-chords-word-line"><span class="lyrics-word" data-time="${line.start}" data-end="${line.end}">${line.text.toLowerCase()}</span></div>`; // 🎯 אותיות קטנות
          }

          html += "</div>"; // סגירת lyrics-chords-line
        });

        html += "</div>"; // סגירת lyrics-chords-block

        // הוספת הפרדה בין בלוקים (חוץ מהבלוק האחרון)
        if (blockIndex < blocks.length - 1) {
          html += '<div class="lyrics-chords-block-separator"></div>';
        }
      });

      html += "</div>";
      targetContainer.innerHTML = html;
      htmlBuildSuccess = true;
      schedulePastWordsSyncAfterRender(0);

      // Avoid expensive stringify here; it spikes memory on large payloads.
      const combinedDataSize = combinedData.length;
      console.log(
        `[LyricsChords] combinedData ready: ${combinedDataSize} lines`
      );

      // חישוב רוחב הפאנל בהתאם לתוכן - רק אם לא נקבע כבר רוחב
      // אם יש כבר רוחב מוגדר (מ-setupPanelWidthControls) - לא לדרוס אותו!
      if (!window.currentLyricsChordsPanelWidth) {
        console.log("[LyricsChords] לא נמצא רוחב מוגדר - מחשב רוחב אוטומטי");
        // שמירת הנתונים לחישוב רוחב בלבד
        const combinedDataForWidth = combinedData.slice(); // עותק רחב לחישוב רוחב
        calculateAndSetPanelWidth(combinedDataForWidth);
        // שחרור העותק מיד אחרי השימוש
        setTimeout(() => (combinedDataForWidth.length = 0), 100);
      } else {
        console.log(
          "[LyricsChords] רוחב כבר מוגדר:",
          window.currentLyricsChordsPanelWidth + "px - מדלג על חישוב אוטומטי"
        );
      }

      // 🗑️ שחרור הנתונים הראשיים מיד אחרי יצירת ה-HTML
      combinedData.length = 0; // שחרור המערך מידית
      console.log("[LyricsChords] combinedData released");

      // ניסיון לכפות garbage collection מיידי
      if (window.gc && typeof window.gc === "function") {
        try {
          window.gc();
          console.log("[🗑️ LyricsChords] כפה GC אחרי שחרור combinedData");
        } catch (gcError) {
          // שקט - GC לא זמין
        }
      }

      // החלת גודל פונט על התוכן החדש
      setTimeout(() => {
        applyFontSize();
        // הוספת hover listeners לאקורדים החדשים
        addChordHoverListeners();
        console.log("[LyricsChords] הוספת hover listeners לתוכן חדש");

        // 🔄 אתחול מחדש של CountdownManager אחרי re-render
        if (countdownManagerInstance) {
          console.log(
            "[LyricsChords] 🔄 Re-initializing CountdownManager after content re-render"
          );
          // ניקוי המופע הישן
          countdownManagerInstance.cleanup();
          countdownManagerInstance = null;
          // אתחול מחדש
          initializeCountdownManager();
        }

        // הפעלת הגלילה אם אחד מהמצבים פעיל
        if (syncWithYouTubeActive || autoScrollActive) {
          startScrolling();
          console.log("[LyricsChords] הפעלתי גלילה לאחר טעינת תוכן");
        }
      }, 50);
    } catch (error) {
      console.error("[LyricsChords] שגיאה בבניית HTML:", error);
      contentDiv.innerHTML =
        '<div class="lyrics-chords-error">שגיאה בטעינת התוכן</div>';
    } finally {
      // וידוא שה-cache מתאפס אם הבנייה נכשלה
      if (!htmlBuildSuccess) {
        cachedWordElements = null;
        cachedChordElements = null;
        console.log("[LyricsChords] איפוס cache לאחר כשל בבניית HTML");
      }
    }
  }

  // חישוב ועדכון רוחב הפאנל
  async function calculateAndSetPanelWidth(combinedData) {
    let maxLineWidth = 0;

    combinedData.forEach((line) => {
      if (line.words && line.words.length > 0) {
        // חישוב אורך השורה (מילים + אקורדים)
        const wordChordPairs = line.words.map((word) => {
          const wordChords = (line.chords || []).filter(
            (chord) => chord.time >= word.start && chord.time <= word.end
          );
          return {
            word: word,
            chords: wordChords,
          };
        });

        // חלוקה לשורות (אותו אלגוריתם כמו ביצירת ה-HTML)
        const optimalWordsPerLine = Math.ceil(
          Math.sqrt(wordChordPairs.length) * 1.5
        );
        const lines = [];

        for (let i = 0; i < wordChordPairs.length; i += optimalWordsPerLine) {
          const lineWords = wordChordPairs.slice(i, i + optimalWordsPerLine);
          lines.push(lineWords);
        }

        if (
          lines.length > 1 &&
          lines[lines.length - 1].length < optimalWordsPerLine / 2
        ) {
          const lastLine = lines.pop();
          const secondLastLine = lines[lines.length - 1];
          const combined = [...secondLastLine, ...lastLine];
          const midPoint = Math.ceil(combined.length / 2);
          lines[lines.length - 1] = combined.slice(0, midPoint);
          lines.push(combined.slice(midPoint));
        }

        // חישוב רוחב כל שורה
        lines.forEach((lineWords) => {
          let lineWidth = 0;
          lineWords.forEach((pair) => {
            const wordText = pair.word.word || pair.word.text || "";

            // רוחב מילה (הערכה: 6px לתו)
            const wordWidth = wordText.length * 6;

            // רוחב אקורדים
            let chordWidth = 0;
            if (pair.chords.length > 0) {
              pair.chords.forEach((chord) => {
                const chordName = chord.chord || chord.name || chord;
                chordWidth += chordName.length * 5 + 12; // 5px לתו + 12px עבור padding ורקע
              });
            }

            // לקחת את הרוחב הגדול יותר (מילה או אקורד)
            lineWidth += Math.max(wordWidth, chordWidth);

            // רווח בין מילים
            lineWidth += 8; // 3px gap + 5px עבור מרגין
          });

          maxLineWidth = Math.max(maxLineWidth, lineWidth);
        });
      }
    });

    // חישוב רוחב אלמנטי הבקרה (כפתורים ותוויות)
    let controlsWidth = 0;

    // רוחב שורת "Sync with YouTube": אייקון (20px) + תווית (110px) + toggle (44px) + רווחים (20px)
    const syncRowWidth = 20 + 110 + 44 + 20; // = 194px

    // רוחב שורת "Auto scroll": אייקון (20px) + תווית (110px) + toggle (44px) + כפתורי מהירות + רווחים
    // כפתורי מהירות: כפתור "-" (24px) + תצוגת מהירות (28px) + כפתור "+" (24px) + רווחים (16px)
    const speedControlsWidth = 24 + 28 + 24 + 16; // = 92px
    const autoScrollRowWidth = 20 + 110 + 44 + 10 + speedControlsWidth + 20; // = 296px

    // לקחת את הרוחב הגדול יותר מבין שתי השורות
    controlsWidth = Math.max(syncRowWidth, autoScrollRowWidth);

    console.log("[LyricsChords] חישוב רוחב אלמנטי בקרה:", {
      syncRowWidth,
      autoScrollRowWidth,
      controlsWidth,
    });

    // הוספת padding ומרגין לפאנל
    const panelPadding = 80; // 40px מכל צד (כולל header וסקרול + מרגין ביטחון)
    const calculatedContentWidth = maxLineWidth + panelPadding;
    const calculatedControlsWidth = controlsWidth + panelPadding;

    // לקחת את הרוחב הגדול יותר - תוכן או אלמנטי בקרה
    const calculatedWidth = Math.max(
      calculatedContentWidth,
      calculatedControlsWidth
    );

    // הגדרת מינימום ומקסימום
    const minWidth = 300;
    const maxWidth = Math.min(800, window.innerWidth * 0.4); // מקסימום 40% מרוחב המסך

    const finalWidth = Math.max(minWidth, Math.min(maxWidth, calculatedWidth));

    console.log("[LyricsChords] חישוב רוחב מלא:", {
      maxLineWidth,
      controlsWidth,
      calculatedContentWidth,
      calculatedControlsWidth,
      calculatedWidth,
      finalWidth,
      minWidth,
      maxWidth,
    });

    // עדכון רוחב הפאנל
    if (lyricsChordsPanelElement) {
      lyricsChordsPanelElement.style.width = finalWidth + "px";

      // שמירת הרוחב לשימוש בפונקציות אחרות
      window.currentLyricsChordsPanelWidth = finalWidth;

      // עדכון מיקום הוידאו עם הרוחב החדש
      const videoId = window.ycUtils?.extractVideoId(window.location.href);
      let subtitlesData = await window.databaseManager.loadFromDatabase(
        "subtitles",
        videoId
      );
      const aiMode = await readAiMode();
      subtitlesData = await normalizeActiveSubtitlesData(subtitlesData, aiMode);
      const direction = getPanelDirectionFromSubtitlesData(
        subtitlesData,
        videoId
      );

      // 🎯 Help GC by clearing the large subtitles object
      subtitlesData = null;

      adjustVideoPosition(direction, true);
    }
  }

  /*------------------------------------------------------------
  10.5 Language Selector Functions - MOVED TO buttons/languageSelector.js
  הפונקציות עברו לקובץ נפרד, הפאנל מאזין ל-event yc:languageChanged
------------------------------------------------------------*/

  /*------------------------------------------------------------
  11. פונקציות פרסור
------------------------------------------------------------*/
  // פרסור SRT פשוט
  function parseSRT(srtText) {
    if (!srtText || typeof srtText !== "string") return [];

    const items = [];
    const blocks = srtText.trim().split(/\n\s*\n/);

    // 🔧 Use accurate word timings only in true word-level mode.
    // This prevents stale timings from previous videos/modes from corrupting sentence parsing.
    const panelWordTimings = getPanelWordTimings();
    const shouldUseAccurateWords =
      !window.ycSentenceLevelHighlight &&
      panelWordTimings.length > 0;
    const accurateWords = shouldUseAccurateWords ? panelWordTimings : [];
    let accurateWordIndex = 0;

    blocks.forEach((block) => {
      const lines = block.trim().split("\n");
      if (lines.length < 3) return;

      const timeLine = lines[1];
      const textLines = lines.slice(2);

      // פרסור זמן: 00:00:01,000 --> 00:00:03,000
      const timeMatch = timeLine.match(
        /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
      );
      if (!timeMatch) return;

      const startTime =
        parseFloat(timeMatch[1]) * 3600 +
        parseFloat(timeMatch[2]) * 60 +
        parseFloat(timeMatch[3]) +
        parseFloat(timeMatch[4]) / 1000;
      const endTime =
        parseFloat(timeMatch[5]) * 3600 +
        parseFloat(timeMatch[6]) * 60 +
        parseFloat(timeMatch[7]) +
        parseFloat(timeMatch[8]) / 1000;

      // ✅ Keep \n for dual-language translations (join with \n instead of space)
      const text = textLines.join("\n").trim();
      if (text) {
        // חילוק למילים נפרדות
        const words = text.split(/\s+/).filter((w) => w.length > 0);

        // 🔧 FIX: שימוש בזמנים מדויקים מ-window.subtitleState.words
        const wordObjects = words.map((word, index) => {
          // חיפוש מילה מדויקת בטווח הזמן של המשפט
          let accurateWord = null;
          const tolerance = 0.1;

          // חיפוש מילה תואמת בזמנים המדויקים
          for (let i = accurateWordIndex; i < accurateWords.length; i++) {
            const aw = accurateWords[i];
            // בדיקה אם המילה בטווח הזמן של המשפט
            if (
              aw.startTime >= startTime - tolerance &&
              aw.startTime <= endTime + tolerance
            ) {
              // בדיקה אם הטקסט תואם (התעלמות מסימני פיסוק)
              const awText = (aw.text || "")
                .replace(/[.,!?;:'"]/g, "")
                .toLowerCase();
              const wordText = word.replace(/[.,!?;:'"]/g, "").toLowerCase();
              if (
                awText === wordText ||
                awText.includes(wordText) ||
                wordText.includes(awText)
              ) {
                accurateWord = aw;
                accurateWordIndex = i + 1; // התקדם לחיפוש הבא
                break;
              }
            }
            // אם עברנו את זמן הסיום של המשפט, עצור
            if (aw.startTime > endTime + tolerance) break;
          }

          // אם מצאנו זמנים מדויקים, השתמש בהם
          if (accurateWord) {
            return {
              word: word,
              start: accurateWord.startTime,
              end: accurateWord.endTime,
            };
          }

          // אחרת, חזור לחישוב משוער (fallback)
          const wordDuration = (endTime - startTime) / words.length;
          return {
            word: word,
            start: startTime + index * wordDuration,
            end: startTime + (index + 1) * wordDuration,
          };
        });

        items.push({
          start: startTime,
          end: endTime,
          text: text,
          words: wordObjects,
        });
      }
    });

    return items;
  }

  // 🔧 FIX: פרסור wordSRT לקבלת זמנים מדויקים לכל מילה
  // פונקציה זו מפרסרת את wordSRT ומחזירה מערך של מילים עם startTime ו-endTime מדויקים
  function parseWordSRTForAccurateTiming(wordSRT) {
    if (!wordSRT || typeof wordSRT !== "string") return [];

    const words = [];
    const normalizedContent = wordSRT.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    let blocks = normalizedContent.trim().split("\n\n");

    if (blocks.length === 1 && blocks[0] === "") blocks = [];

    if (blocks.length <= 1 && normalizedContent.includes("-->")) {
      blocks = normalizedContent
        .trim()
        .split(/\n(?=\d+\n\d{1,2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2},\d{3})/);
    }

    blocks.forEach((block) => {
      const lines = block.trim().split("\n");
      if (lines.length < 2) return;

      let timeLineIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("-->")) {
          timeLineIndex = i;
          break;
        }
      }
      if (timeLineIndex === -1 || lines.length <= timeLineIndex) return;

      const timeMatch = lines[timeLineIndex].match(
        /(\d{1,2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2},\d{3})/
      );
      if (!timeMatch) return;

      const textContent = lines.slice(timeLineIndex + 1).join(" ").trim();
      if (!textContent) return;

      // פרסור זמן
      const parseTimeStr = (timeStr) => {
        const parts = timeStr.split(/[:,]/);
        if (parts.length < 4) return 0;
        return (
          parseFloat(parts[0]) * 3600 +
          parseFloat(parts[1]) * 60 +
          parseFloat(parts[2]) +
          parseFloat(parts[3]) / 1000
        );
      };

      words.push({
        text: textContent,
        startTime: parseTimeStr(timeMatch[1]),
        endTime: parseTimeStr(timeMatch[2]),
      });
    });

    return words;
  }

  // 🎯 הכנת משפטים מקוריים מיוטיוב להדגשה
  // מקבל מערך של { text, startTime, endTime } ומוסיף words מנוקות
  function prepareOriginalSentencesForHighlight(originalSentences) {
    if (!originalSentences || !Array.isArray(originalSentences)) return [];

    return originalSentences.map(sentence => {
      // ניקוי הטקסט והפיכה למערך מילים
      const cleanText = sentence.text
        .replace(/[^\w\s\u0590-\u05FF\u0600-\u06FF]/g, "") // הסרת סימני פיסוק (שומר עברית וערבית)
        .toLowerCase()
        .trim();
      const wordsArray = cleanText.split(/\s+/).filter(w => w.length > 0);

      return {
        text: sentence.text,
        cleanText: cleanText,
        words: wordsArray,
        startTime: sentence.startTime,
        endTime: sentence.endTime,
      };
    }).filter(s => s.words.length > 0);
  }

  // 🎯 פרסור sentenceSRT להדגשה ברמת משפט (Fallback)
  // מחזיר מערך של משפטים עם: text (מנוקה), words (מערך מילים), startTime, endTime
  function parseSentenceSRTForHighlight(sentenceSRT) {
    if (!sentenceSRT || typeof sentenceSRT !== "string") return [];

    const sentences = [];
    const normalizedContent = sentenceSRT.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    let blocks = normalizedContent.trim().split("\n\n");

    if (blocks.length === 1 && blocks[0] === "") blocks = [];

    if (blocks.length <= 1 && normalizedContent.includes("-->")) {
      blocks = normalizedContent
        .trim()
        .split(/\n(?=\d+\n\d{1,2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2},\d{3})/);
    }

    blocks.forEach((block) => {
      const lines = block.trim().split("\n");
      if (lines.length < 2) return;

      let timeLineIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("-->")) {
          timeLineIndex = i;
          break;
        }
      }
      if (timeLineIndex === -1 || lines.length <= timeLineIndex) return;

      const timeMatch = lines[timeLineIndex].match(
        /(\d{1,2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2},\d{3})/
      );
      if (!timeMatch) return;

      const textContent = lines.slice(timeLineIndex + 1).join(" ").trim();
      if (!textContent) return;

      // פרסור זמן
      const parseTimeStr = (timeStr) => {
        const parts = timeStr.split(/[:,]/);
        if (parts.length < 4) return 0;
        return (
          parseFloat(parts[0]) * 3600 +
          parseFloat(parts[1]) * 60 +
          parseFloat(parts[2]) +
          parseFloat(parts[3]) / 1000
        );
      };

      // ניקוי הטקסט והפיכה למערך מילים
      const cleanText = textContent
        .replace(/[^\w\s\u0590-\u05FF\u0600-\u06FF]/g, "") // הסרת סימני פיסוק (שומר עברית וערבית)
        .toLowerCase()
        .trim();
      const wordsArray = cleanText.split(/\s+/).filter(w => w.length > 0);

      sentences.push({
        text: textContent,
        cleanText: cleanText,
        words: wordsArray,
        startTime: parseTimeStr(timeMatch[1]),
        endTime: parseTimeStr(timeMatch[2]),
      });
    });

    console.log("[LyricsChords] 🎯 Parsed sentences for highlight:", sentences.length);
    return sentences;
  }

  // זיהוי כיוון השפה על פי הכתוביות - לפי רוב התווים
  function detectTextDirection(subtitlesData, videoId, forceDetect = false) {
    // 🎯 Check cache first - avoid re-detection (unless forced)
    if (!forceDetect && videoId && cachedVideoId === videoId && cachedDirection) {
      console.log(
        "[LyricsChords] ✅ Using cached direction:",
        cachedDirection,
        "for",
        videoId
      );
      return cachedDirection;
    }

    if (forceDetect) {
      console.log("[LyricsChords] 🔄 Force detecting direction (ignoring cache)");
    }

    // 🎯 Get text from either translationSRT, sentenceSRT, or customPromptResponse
    let text = null;
    if (subtitlesData?.translationSRT) {
      text = subtitlesData.translationSRT; // 🆕 Check translation first!
      console.log("[LyricsChords] 🎯 Detecting direction from translation");
    } else if (subtitlesData?.sentenceSRT) {
      text = subtitlesData.sentenceSRT;
    } else if (subtitlesData?.customPromptResponse) {
      text = subtitlesData.customPromptResponse;
      console.log("[LyricsChords] 🎯 Detecting direction from custom prompt response");
    }

    if (!text) {
      const defaultDirection = "ltr";
      // 🎯 Cache the default direction
      if (videoId) {
        cachedDirection = defaultDirection;
        cachedVideoId = videoId;
      }
      return defaultDirection;
    }

    // ספירת תווים RTL (עברית/ערבית)
    const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF]/g;
    const rtlMatches = text.match(rtlRegex);
    const rtlCount = rtlMatches ? rtlMatches.length : 0;

    // ספירת תווים LTR (אנגלית/לטינית)
    const ltrRegex = /[A-Za-z]/g;
    const ltrMatches = text.match(ltrRegex);
    const ltrCount = ltrMatches ? ltrMatches.length : 0;

    // הכיוון נקבע לפי מה שיש יותר
    const isRTL = rtlCount > ltrCount;
    const direction = isRTL ? "rtl" : "ltr";

    // 🎯 Cache the detected direction for future use
    if (videoId) {
      cachedDirection = direction;
      cachedVideoId = videoId;
      console.log(
        `[LyricsChords] זיהוי כיוון שפה: ${direction.toUpperCase()} (RTL: ${rtlCount}, LTR: ${ltrCount})`
      );
    } else {
      console.log(
        `[LyricsChords] זיהוי כיוון שפה: ${direction.toUpperCase()} (RTL: ${rtlCount}, LTR: ${ltrCount})`
      );
    }

    return direction;
  }

  function getLyricsPageShiftContainer() {
    const pageSelectors = [
      "#page-manager",
      "#content",
      "#container",
      "#main",
      "ytd-app",
      "body",
    ];

    for (const selector of pageSelectors) {
      const pageContainer = document.querySelector(selector);
      if (pageContainer) return pageContainer;
    }

    return null;
  }

  function readTranslateX(element) {
    if (!element) return 0;

    const transform =
      window.getComputedStyle(element).transform || element.style.transform || "";
    if (!transform || transform === "none") return 0;

    const translateMatch = transform.match(/translateX\((-?\d+(?:\.\d+)?)px\)/);
    if (translateMatch) return Number.parseFloat(translateMatch[1]) || 0;

    const matrixMatch = transform.match(/matrix\(([^)]+)\)/);
    if (!matrixMatch) return 0;

    const values = matrixMatch[1]
      .split(",")
      .map((value) => Number.parseFloat(value.trim()));
    return values.length >= 6 && Number.isFinite(values[4]) ? values[4] : 0;
  }

  function shiftPageBy(delta) {
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.5) return;
    const pageContainer = getLyricsPageShiftContainer();
    const currentShift = readTranslateX(pageContainer);
    shiftPage(currentShift + delta);
  }

  function ensurePanelDoesNotOverlapVideo(direction = null) {
    if (!window.lyricsChordsPanelActive || !lyricsChordsPanelElement) return false;

    const videoElement = findVideoElement();
    if (!videoElement) return false;

    const resolvedDirection =
      direction ||
      (lyricsChordsPanelElement.classList.contains("yt-lyrics-chords-rtl")
        ? "rtl"
        : "ltr");
    const panelRect = lyricsChordsPanelElement.getBoundingClientRect();
    const videoRect = videoElement.getBoundingClientRect();
    const tolerance = 1;

    if (resolvedDirection === "rtl") {
      const edgeDelta = panelRect.left - videoRect.right;
      if (Math.abs(edgeDelta) > tolerance) {
        shiftPageBy(edgeDelta);
        console.log("[LyricsChords] 🔧 הצמדתי RTL בין הפאנל לווידאו:", edgeDelta);
        return true;
      }
      return false;
    }

    const edgeDelta = videoRect.left - panelRect.right;
    if (Math.abs(edgeDelta) > tolerance) {
      shiftPageBy(-edgeDelta);
      console.log("[LyricsChords] 🔧 הצמדתי LTR בין הפאנל לווידאו:", edgeDelta);
      return true;
    }

    return false;
  }

  function runPanelVideoSeparation(direction = null, reason = "layout") {
    const shifted = ensurePanelDoesNotOverlapVideo(direction);
    if (shifted) {
      scheduleVideoFitToScreen(`panel separation ${reason}`);
    }
    return shifted;
  }

  function cancelScheduledPanelVideoSeparation() {
    if (panelSeparationRafId !== null) {
      cancelAnimationFrame(panelSeparationRafId);
      panelSeparationRafId = null;
    }

    panelSeparationTimeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
    panelSeparationTimeoutIds.clear();
  }

  function schedulePanelVideoSeparation(direction = null, reason = "layout") {
    cancelScheduledPanelVideoSeparation();

    panelSeparationRafId = requestAnimationFrame(() => {
      panelSeparationRafId = null;
      runPanelVideoSeparation(direction, reason);
    });

    [80, 220].forEach((delay) => {
      const timeoutId = setTimeout(() => {
        panelSeparationTimeoutIds.delete(timeoutId);
        runPanelVideoSeparation(direction, reason);
      }, delay);
      panelSeparationTimeoutIds.add(timeoutId);
    });
  }

  const LYRICS_CHORDS_PREVIEW_GAP = 0;

  function getCurrentLyricsChordsPanelDirection() {
    return lyricsChordsPanelElement?.classList?.contains("yt-lyrics-chords-rtl")
      ? "rtl"
      : "ltr";
  }

  function getOpenPreviewPanelMetrics() {
    const previewPanel = window.ycChordsPreviewPanel;
    const isPreviewOpen = Boolean(
      previewPanel?.isVisible &&
      previewPanel?.panelElement?.classList?.contains("visible")
    );
    const previewWidth = isPreviewOpen
      ? previewPanel?.panelElement?.offsetWidth || 0
      : 0;
    return {
      isPreviewOpen,
      previewWidth,
      gap: isPreviewOpen ? LYRICS_CHORDS_PREVIEW_GAP : 0,
    };
  }

  // מיקום הפאנל צמוד לוידאו עם הזחת דף במידת הצורך
  function adjustVideoPosition(direction, isOpen) {
    if (!isOpen) {
      // איפוס מיקום הדף והוידאו
      resetPagePosition();
      resetVideoAndPagePosition();
      return;
    }

    // במסך מלא - טיפול מיוחד עם כיווץ נגן ופאנל overlay
    if (isFullscreenMode()) {
      if (window.handleFullscreenPanel) {
        window.handleFullscreenPanel(direction, isOpen);
      } else {
        console.warn("[LyricsChords] מודול fullscreen לא נטען");
      }
      return;
    }

    // מציאת הוידאו
    const videoElement = findVideoElement();
    if (!videoElement) {
      console.log("[LyricsChords] לא נמצא אלמנט וידאו");
      return;
    }

    const panelWidth =
      window.currentLyricsChordsPanelWidth ||
      lyricsChordsPanelElement?.offsetWidth ||
      450;
    const screenWidth = window.innerWidth;
    const videoRect = videoElement.getBoundingClientRect();
    const previewMetrics = getOpenPreviewPanelMetrics();
    const totalPanelWidth =
      panelWidth + previewMetrics.previewWidth + previewMetrics.gap;
    const viewportBounds = getLyricsChordsViewportBounds();

    console.log("[LyricsChords] מידות:", {
      screenWidth,
      panelWidth,
      previewOpen: previewMetrics.isPreviewOpen,
      previewWidth: previewMetrics.previewWidth,
      totalPanelWidth,
      videoLeft: videoRect.left,
      videoRight: videoRect.right,
      videoWidth: videoRect.width,
      viewportLeft: viewportBounds.left,
      viewportRight: viewportBounds.right,
    });

    let needPageShift = false;
    let panelLeft, panelRight;

    if (direction === "rtl") {
      // RTL: פאנל צריך להיות מימין לוידאו
      const spaceOnRight = screenWidth - videoRect.right;

      console.log("[LyricsChords] 🔍 RTL - מצב Preview:", {
        isPreviewOpen: previewMetrics.isPreviewOpen,
        previewWidth: previewMetrics.previewWidth,
        gap: previewMetrics.gap,
      });

      console.log("[LyricsChords] 📏 חישוב רוחב:", {
        panelWidth,
        previewWidth: previewMetrics.previewWidth,
        gap: previewMetrics.gap,
        totalPanelWidth,
        spaceOnRight,
      });

      if (previewMetrics.isPreviewOpen) {
        const desiredPanelLeft = viewportBounds.right - totalPanelWidth;
        const pageShiftDelta = desiredPanelLeft - videoRect.right;
        shiftPageBy(pageShiftDelta);
        panelLeft = desiredPanelLeft;
        needPageShift = Math.abs(pageShiftDelta) > 0.5;

        console.log("[LyricsChords] 🧲 RTL Preview group anchored:", {
          desiredPanelLeft,
          pageShiftDelta,
          groupRight: viewportBounds.right,
        });
      } else if (spaceOnRight >= totalPanelWidth) {
        // יש מקום לשניהם מימין לוידאו
        panelLeft = videoRect.right;
        needPageShift = false;

        // איפוס הדף למקום המקורי (אם היה מוזז)
        resetPagePosition();
        console.log("[LyricsChords] ✅ יש מקום - פאנל צמוד לוידאו, דף אופס");
      } else {
        // אין מקום - צריך להזיז את הדף שמאלה
        const shiftAmount = totalPanelWidth - spaceOnRight;
        shiftPage(-shiftAmount);
        panelLeft = videoRect.right - shiftAmount;
        needPageShift = true;

        console.log("[LyricsChords] ⬅️ אין מקום - הזזת דף:", -shiftAmount);
      }

      // תיקון קריטי: אם Preview פתוח, ודא שהפאנל לא "עולה" על ה-Preview
      if (!previewMetrics.isPreviewOpen) {
        // המיקום המינימלי של הפאנל (שמאלה ביותר) כדי לא לעלות על Preview
        const minLeft =
          screenWidth - panelWidth - previewMetrics.previewWidth - previewMetrics.gap;

        if (panelLeft > minLeft) {
          // הפאנל מנסה להיות ימינה מדי - נזיז את הדף עוד קצת
          const extraShift = panelLeft - minLeft;
          const currentShift = needPageShift
            ? totalPanelWidth - spaceOnRight
            : 0;
          shiftPage(-(currentShift + extraShift));
          panelLeft = minLeft;
          needPageShift = true;

          console.log(
            "[LyricsChords] 🔧 תיקון חפיפה - הזזה נוספת:",
            extraShift
          );
        }
      }
    } else {
      // LTR: פאנל צריך להיות משמאל לוידאו
      const spaceOnLeft = videoRect.left;

      if (previewMetrics.isPreviewOpen) {
        const desiredPanelLeft =
          viewportBounds.left + previewMetrics.previewWidth + previewMetrics.gap;
        const desiredVideoLeft = viewportBounds.left + totalPanelWidth;
        const pageShiftDelta = desiredVideoLeft - videoRect.left;
        shiftPageBy(pageShiftDelta);
        panelLeft = desiredPanelLeft;
        needPageShift = Math.abs(pageShiftDelta) > 0.5;

        console.log("[LyricsChords] 🧲 LTR Preview group anchored:", {
          desiredPanelLeft,
          desiredVideoLeft,
          pageShiftDelta,
          groupLeft: viewportBounds.left,
        });
      } else if (spaceOnLeft >= totalPanelWidth) {
        // יש מקום - Preview + פאנל צמודים לוידאו
        panelLeft = videoRect.left - panelWidth;
        needPageShift = false;

        resetPagePosition();
      } else {
        // אין מקום - הזח את הדף ימינה כדי לפנות מקום לכל הקבוצה
        const shiftAmount = totalPanelWidth - spaceOnLeft;
        shiftPage(shiftAmount);
        panelLeft = previewMetrics.previewWidth + previewMetrics.gap;
        needPageShift = true;
      }
    }

    // עדכון מיקום הפאנל
    if (lyricsChordsPanelElement) {
      if (panelLeft !== undefined) {
        lyricsChordsPanelElement.style.left = panelLeft + "px";
        lyricsChordsPanelElement.style.right = "auto";
      } else if (panelRight !== undefined) {
        lyricsChordsPanelElement.style.right = panelRight + "px";
        lyricsChordsPanelElement.style.left = "auto";
      }
    }

    const preventedPanelOverlap = runPanelVideoSeparation(direction, "panel layout");

    // בדיקה והתאמת רוחב הוידאו אם צריך
    if (needPageShift || preventedPanelOverlap) {
      adjustVideoWidth();
    }

    // 🔧 כיווץ וידאו אם חורג מהמסך (אחרי כל ההזזות)
    // נותנים לדפדפן זמן לסיים את ההזזה לפני המדידה
    schedulePanelVideoSeparation(direction, "panel layout settled");
    scheduleVideoFitToScreen("panel layout");

    console.log("[LyricsChords] מיקום פאנל:", {
      direction,
      needPageShift,
      panelLeft,
      panelRight,
    });
  }

  /**
   * 🔧 כיווץ וידאו חכם - אם הנגן חורג מהמסך (תומך LTR ו-RTL)
   * נקרא בסוף adjustVideoPosition אחרי שכל ההזזות הסתיימו
   */
  function getLyricsChordsViewportBounds() {
    const visualViewport = window.visualViewport;
    const left = Number.isFinite(visualViewport?.offsetLeft)
      ? visualViewport.offsetLeft
      : 0;
    const widthCandidates = [
      visualViewport?.width,
      document.documentElement?.clientWidth,
      window.innerWidth,
    ].filter((value) => Number.isFinite(value) && value > 0);
    const width = widthCandidates.length ? Math.min(...widthCandidates) : 0;
    return { left, right: left + width, width };
  }

  function isLyricsChordsLayoutActive() {
    return Boolean(
      window.lyricsChordsPanelActive ||
        lyricsChordsPanelElement?.classList?.contains("yt-lyrics-chords-open") ||
        window.ycChordsPreviewPanel?.isVisible
    );
  }

  function getVideoMainElement(player) {
    return (
      player?.querySelector?.("video.html5-main-video") ||
      player?.querySelector?.("video") ||
      document.querySelector("video.html5-main-video") ||
      document.querySelector("video")
    );
  }

  function applyVideoCornerClip(player) {
    if (!player) return;

    player.style.setProperty("border-radius", "12px", "important");
    player.style.setProperty("overflow", "hidden", "important");

    const video = getVideoMainElement(player);
    if (video) {
      video.style.setProperty("border-radius", "12px", "important");
    }
  }

  function clearVideoCornerClip(player) {
    if (!player) return;

    player.style.removeProperty("border-radius");
    player.style.removeProperty("overflow");

    const video = getVideoMainElement(player);
    if (video) {
      video.style.removeProperty("border-radius");
    }
  }

  function clearVideoScaleStyles(player, controls, options = {}) {
    if (!player) return;
    player.style.removeProperty("transform");
    player.style.removeProperty("transform-origin");
    player.classList.remove("yc-video-scaled");
    if (options.clearCornerClip) {
      clearVideoCornerClip(player);
    }

    if (controls) {
      controls.style.removeProperty("width");
      controls.style.removeProperty("transform");
      controls.style.removeProperty("transform-origin");
    }

    dispatchVideoScaleChanged(player, 1);
  }

  function getCurrentVideoScaleX(player) {
    if (!player) return 1;

    const transform = player.style.transform || window.getComputedStyle(player).transform;
    if (!transform || transform === "none") return 1;

    const scaleXMatch = transform.match(/scaleX\((-?\d+(?:\.\d+)?)\)/);
    if (scaleXMatch) {
      const scale = Number.parseFloat(scaleXMatch[1]);
      return Number.isFinite(scale) && scale > 0 ? scale : 1;
    }

    const scaleMatch = transform.match(/scale\((-?\d+(?:\.\d+)?)(?:,\s*-?\d+(?:\.\d+)?)?\)/);
    if (scaleMatch) {
      const scale = Number.parseFloat(scaleMatch[1]);
      return Number.isFinite(scale) && scale > 0 ? scale : 1;
    }

    const matrixMatch = transform.match(/matrix\(([^)]+)\)/);
    if (!matrixMatch) return 1;

    const values = matrixMatch[1]
      .split(",")
      .map((value) => Number.parseFloat(value.trim()));
    const scale = values[0];
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  function dispatchVideoScaleChanged(player, scaleX = null, originX = null) {
    try {
      window.dispatchEvent(
        new CustomEvent("yc:videoScaleChanged", {
          detail: {
            scaleX: scaleX ?? getCurrentVideoScaleX(player),
            originX: originX || getVideoTransformOriginX(player),
          },
        })
      );
    } catch (error) {
      console.warn("[LyricsChords] Failed dispatching video scale change:", error);
    }
  }

  function getVideoTransformOriginX(player) {
    const inlineOrigin = String(player?.style?.transformOrigin || "").toLowerCase();
    if (inlineOrigin.includes("right")) return "right";
    if (inlineOrigin.includes("center")) return "center";
    if (inlineOrigin.includes("left")) return "left";

    const computedOrigin = window.getComputedStyle(player).transformOrigin;
    const originX = Number.parseFloat(String(computedOrigin).split(/\s+/)[0]);
    const width = player?.offsetWidth || 0;
    if (!Number.isFinite(originX) || width <= 0) return "left";
    if (originX >= width * 0.75) return "right";
    if (originX >= width * 0.25) return "center";
    return "left";
  }

  function getUnscaledVideoRect(player) {
    const visualRect = player.getBoundingClientRect();
    const scale = getCurrentVideoScaleX(player);
    const layoutWidth =
      player.offsetWidth ||
      (scale > 0 ? visualRect.width / scale : visualRect.width);

    if (!layoutWidth || Math.abs(scale - 1) < 0.001) {
      return {
        left: visualRect.left,
        right: visualRect.left + layoutWidth,
        width: layoutWidth,
      };
    }

    const originX = getVideoTransformOriginX(player);
    let left = visualRect.left;

    if (originX === "right") {
      left = visualRect.right - layoutWidth;
    } else if (originX === "center") {
      left = visualRect.left + visualRect.width / 2 - layoutWidth / 2;
    }

    return {
      left,
      right: left + layoutWidth,
      width: layoutWidth,
    };
  }

  function isVideoWithinSafeBounds(player, safeLeft, safeRight, tolerancePx = 1.25) {
    const rect = player.getBoundingClientRect();
    return rect.left >= safeLeft - tolerancePx && rect.right <= safeRight + tolerancePx;
  }

  function shouldKeepCurrentVideoScale(player, originX, scaleRatio, safeLeft, safeRight) {
    if (!player.classList.contains("yc-video-scaled")) return false;
    if (getVideoTransformOriginX(player) !== originX) return false;

    const currentScale = getCurrentVideoScaleX(player);
    const nextScale = Math.max(0.1, Math.min(1, scaleRatio));
    const scaleDiff = Math.abs(currentScale - nextScale);
    const scaleTolerance = 0.004;

    return (
      scaleDiff <= scaleTolerance &&
      isVideoWithinSafeBounds(player, safeLeft, safeRight)
    );
  }

  function applyVideoScale(player, controls, originX, scaleRatio) {
    const safeScale = Math.max(0.1, Math.min(1, scaleRatio));
    applyVideoCornerClip(player);
    player.style.setProperty("transform-origin", `${originX} top`, "important");
    player.style.setProperty("transform", `scaleX(${safeScale})`, "important");
    player.classList.add("yc-video-scaled");

    if (controls) {
      controls.style.setProperty("width", "100%", "important");
      controls.style.setProperty(
        "transform-origin",
        `${originX} bottom`,
        "important"
      );
      controls.style.setProperty(
        "transform",
        `scale(1, ${safeScale})`,
        "important"
      );
    }

    dispatchVideoScaleChanged(player, safeScale, originX);
  }

  function calculateVideoScale(rect, safeLeft, safeRight) {
    const width = Number(rect?.width) || 0;
    if (width <= 0) return null;

    const overflowLeft = rect.left < safeLeft;
    const overflowRight = rect.right > safeRight;
    if (!overflowLeft && !overflowRight) return null;

    let originX = "center";
    let scaleRatio = 1;

    if (overflowLeft && overflowRight) {
      const centerX = rect.left + width / 2;
      const availableFromCenter = Math.min(centerX - safeLeft, safeRight - centerX);
      scaleRatio = (Math.max(1, availableFromCenter) * 2) / width;
      originX = "center";
    } else if (overflowLeft) {
      originX = "right";
      scaleRatio = (rect.right - safeLeft) / width;
    } else {
      originX = "left";
      scaleRatio = (safeRight - rect.left) / width;
    }

    scaleRatio = Math.max(0.1, Math.min(1, scaleRatio - 0.003));
    return { originX, scaleRatio, overflowLeft, overflowRight };
  }

  function fitVideoToScreen() {
    if (!isLyricsChordsLayoutActive()) return;

    const player = document.querySelector("#movie_player");
    if (!player) return;

    const controls = player.querySelector(".ytp-chrome-bottom");

    const viewportBounds = getLyricsChordsViewportBounds();
    const safeLeft = viewportBounds.left + 2;
    const safeRight = viewportBounds.right - 2;
    if (safeRight <= safeLeft) return;

    const hadScale =
      player.classList.contains("yc-video-scaled") ||
      Math.abs(getCurrentVideoScaleX(player) - 1) > 0.001;
    applyVideoCornerClip(player);
    const scaleInfo = calculateVideoScale(getUnscaledVideoRect(player), safeLeft, safeRight);
    if (!scaleInfo) {
      if (hadScale) {
        clearVideoScaleStyles(player, controls);
        applyVideoCornerClip(player);
      }
      console.log("[LyricsChords] 📏 וידאו לא חורג, לא צריך כיווץ");
      return;
    }

    let { originX, scaleRatio, overflowLeft, overflowRight } = scaleInfo;
    if (!shouldKeepCurrentVideoScale(player, originX, scaleRatio, safeLeft, safeRight)) {
      applyVideoScale(player, controls, originX, scaleRatio);
    }

    // Verification pass: covers browser rounding and YouTube layout changes.
    void player.offsetWidth;
    const fittedRect = player.getBoundingClientRect();
    if (fittedRect.left < safeLeft - 1 || fittedRect.right > safeRight + 1) {
      const nextScaleInfo = calculateVideoScale(fittedRect, safeLeft, safeRight);
      if (nextScaleInfo) {
        originX = nextScaleInfo.originX;
        scaleRatio = Math.max(0.1, Math.min(scaleRatio, scaleRatio * nextScaleInfo.scaleRatio));
        overflowLeft = overflowLeft || nextScaleInfo.overflowLeft;
        overflowRight = overflowRight || nextScaleInfo.overflowRight;
        applyVideoScale(player, controls, originX, scaleRatio);
      }
    }

    console.log(
      `[LyricsChords] 📏 כיווץ וידאו: ${overflowLeft ? "LEFT" : ""}${overflowRight ? " RIGHT" : ""}, origin=${originX}, scale=${scaleRatio.toFixed(3)}`
    );
  }

  function cancelScheduledVideoFit() {
    if (videoFitRafId !== null) {
      cancelAnimationFrame(videoFitRafId);
      videoFitRafId = null;
    }

    videoFitTimeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
    videoFitTimeoutIds.clear();
  }

  function runVideoFitOnNextFrame() {
    if (videoFitRafId !== null) {
      cancelAnimationFrame(videoFitRafId);
    }

    videoFitRafId = requestAnimationFrame(() => {
      videoFitRafId = requestAnimationFrame(() => {
        videoFitRafId = null;
        fitVideoToScreen();
      });
    });
  }

  function scheduleVideoFitToScreen(reason = "layout") {
    cancelScheduledVideoFit();

    [90, 260].forEach((delay) => {
      const timeoutId = setTimeout(() => {
        videoFitTimeoutIds.delete(timeoutId);
        runVideoFitOnNextFrame();
      }, delay);
      videoFitTimeoutIds.add(timeoutId);
    });

    console.log("[LyricsChords] 📏 Scheduled video fit:", reason);
  }

  /**
   * 🔧 איפוס כיווץ וידאו
   */
  function resetVideoScale() {
    const player = document.querySelector("#movie_player");
    cancelScheduledVideoFit();
    cancelScheduledPanelVideoSeparation();
    if (!player) return;

    const controls = player.querySelector(".ytp-chrome-bottom");

    // איפוס הנגן
    clearVideoScaleStyles(player, controls, { clearCornerClip: true });

    console.log("[LyricsChords] 📏 איפוס כיווץ וידאו");
  }

  // חשיפה גלובלית
  window.fitVideoToScreen = fitVideoToScreen;
  window.scheduleLyricsChordsVideoFit = scheduleVideoFitToScreen;
  window.resetVideoScale = resetVideoScale;
  window.ensureLyricsChordsPanelVideoSeparation = function (direction = null) {
    schedulePanelVideoSeparation(direction, "external");
    return runPanelVideoSeparation(direction, "external");
  };

  window.reflowLyricsChordsLayout = function (direction = null, reason = "external") {
    if (!window.lyricsChordsPanelActive || !lyricsChordsPanelElement) {
      return false;
    }
    const resolvedDirection = direction || getCurrentLyricsChordsPanelDirection();
    console.log("[LyricsChords] 🔄 Reflow layout:", {
      direction: resolvedDirection,
      reason,
    });
    adjustVideoPosition(resolvedDirection, true);
    return true;
  };

  // פונקציה גלובלית לעדכון לייאוט - נקראת על ידי Preview Panel
  window.updateLyricsChordsLayout = async function () {
    if (!window.lyricsChordsPanelActive || !lyricsChordsPanelElement) {
      console.log("[LyricsChords] ⚠️ לא ניתן לעדכן לייאוט - הפאנל לא פעיל");
      return;
    }

    console.log("[LyricsChords] 🔄 עדכון לייאוט כפוי (Force Update)");

    // השג מחדש את הכיוון
    const videoId = window.ycUtils?.extractVideoId(window.location.href);
    let subtitlesData = await window.databaseManager.loadFromDatabase(
      "subtitles",
      videoId
    );
    const aiMode = await readAiMode();
    subtitlesData = await normalizeActiveSubtitlesData(subtitlesData, aiMode);
    const direction = getPanelDirectionFromSubtitlesData(
      subtitlesData,
      videoId
    );

    // 🎯 Help GC by clearing the large subtitles object
    subtitlesData = null;

    // הפעל את חישוב המיקום מחדש
    adjustVideoPosition(direction, true);
  };

  // פונקציות עזר למיקום הפאנל
  function findVideoElement() {
    const videoSelectors = [
      "#movie_player",
      ".html5-video-player",
      "#player-container",
      "#player",
      ".ytp-player-content",
    ];

    for (const selector of videoSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log("[LyricsChords] נמצא אלמנט וידאו:", selector);
        return element;
      }
    }
    return null;
  }

  function shiftPage(amount) {
    // במסך מלא - לא מזיזים כלום
    if (isFullscreenMode()) {
      console.log("[LyricsChords] מסך מלא - מדלג על הזזת דף");
      return;
    }

    const pageSelectors = [
      "#page-manager",
      "#content",
      "#container",
      "#main",
      "ytd-app",
      "body",
    ];

    let pageContainer = null;
    for (const selector of pageSelectors) {
      pageContainer = document.querySelector(selector);
      if (pageContainer) {
        console.log("[LyricsChords] נמצא קונטיינר דף:", selector);
        break;
      }
    }

    if (pageContainer) {
      pageContainer.classList.add("yc-page-adjusted");
      // שימוש ב-transform במקום margin למניעת צמצום אוטומטי של YouTube
      pageContainer.style.setProperty(
        "transform",
        `translateX(${amount}px)`,
        "important"
      );
      console.log("[LyricsChords] הדף הוזח ב-transform:", amount + "px");
    }
  }

  function resetPagePosition() {
    const pageSelectors = [
      "#page-manager",
      "#content",
      "#container",
      "#main",
      "ytd-app",
      "body",
    ];

    let pageContainer = null;
    for (const selector of pageSelectors) {
      pageContainer = document.querySelector(selector);
      if (
        pageContainer &&
        pageContainer.classList.contains("yc-page-adjusted")
      ) {
        // ניקוי transform (החדש) ו-margin (ישן) למקרה של שאריות
        pageContainer.style.removeProperty("transform");
        pageContainer.style.removeProperty("margin-left");
        pageContainer.style.removeProperty("margin-right");
        pageContainer.classList.remove("yc-page-adjusted");
        console.log("[LyricsChords] איפוס מיקום הדף (transform + margin)");
        break;
      }
    }
  }

  // ניקוי שאריות style ישנות מהנגן (ללא כיווץ חדש)
  function adjustVideoWidth() {
    const videoElement = findVideoElement();
    if (!videoElement) {
      console.log("[LyricsChords] לא נמצא אלמנט וידאו");
      return;
    }

    // ניקוי כל שאריות style ישנות שעלולות לכווץ את הנגן
    videoElement.style.removeProperty("width");
    videoElement.style.removeProperty("max-width");
    videoElement.style.removeProperty("height");
    videoElement.classList.remove("yc-video-width-adjusted");

    console.log(
      "[LyricsChords] ניקיתי שאריות style מהנגן - הנגן יישאר בגודל מלא"
    );

    // לא מכווצים יותר את הנגן - רק הזזת דף עם transform
    // הנגן יישאר בגודל המקורי ופשוט יזוז עם הדף
  }

  // איפוס הזזת דף ושינויי וידאו
  function resetVideoAndPagePosition() {
    console.log("[LyricsChords] resetVideoAndPagePosition - התחלה");

    // 🔧 איפוס כיווץ וידאו (fitVideoToScreen)
    resetVideoScale();

    // איפוס שינויי וידאו (אם יש כאלה)
    const videoElements = document.querySelectorAll(".yc-video-width-adjusted");
    videoElements.forEach((videoElement) => {
      videoElement.style.removeProperty("max-width");
      videoElement.style.removeProperty("width");
      videoElement.style.removeProperty("height");
      videoElement.style.removeProperty("transform");
      videoElement.style.removeProperty("transform-origin");
      videoElement.classList.remove("yc-video-width-adjusted");
    });

    // איפוס הזזת דף (גם transform וגם margin לשאריות)
    const pageShiftedLeft = document.querySelector(".yc-page-shifted-left");
    const pageShiftedRight = document.querySelector(".yc-page-shifted-right");
    const pageAdjusted = document.querySelector(".yc-page-adjusted");

    if (pageShiftedLeft) {
      pageShiftedLeft.style.removeProperty("margin-left");
      pageShiftedLeft.style.removeProperty("transform");
      pageShiftedLeft.classList.remove("yc-page-shifted-left");
      console.log("[LyricsChords] איפס הזזת דף שמאלה");
    }

    if (pageShiftedRight) {
      pageShiftedRight.style.removeProperty("margin-right");
      pageShiftedRight.style.removeProperty("transform");
      pageShiftedRight.classList.remove("yc-page-shifted-right");
      console.log("[LyricsChords] איפס הזזת דף ימינה");
    }

    // ניקוי נוסף למקרה של yc-page-adjusted
    if (pageAdjusted) {
      pageAdjusted.style.removeProperty("margin-left");
      pageAdjusted.style.removeProperty("margin-right");
      pageAdjusted.style.removeProperty("transform");
      pageAdjusted.classList.remove("yc-page-adjusted");
      console.log("[LyricsChords] איפס yc-page-adjusted");
    }

    if (videoElements.length > 0) {
      console.log(
        "[LyricsChords] איפס שינויי וידאו עבור",
        videoElements.length,
        "אלמנטים"
      );
    }
  }

  // פרסור אקורדים מטקסט
  function parseChordText(chordText) {
    if (!chordText || typeof chordText !== "string") return [];

    const chords = [];
    console.log(
      "[LyricsChords] פרסור chordText:",
      chordText.substring(0, 200) + "..."
    );

    // הפורמט הוא: time:chord,time:chord
    const chordPairs = chordText.split(",");

    chordPairs.forEach((pair) => {
      const parts = pair.split(":");
      if (parts.length >= 2) {
        const time = parseFloat(parts[0]);
        const chordName = parts[1];

        if (!isNaN(time) && chordName) {
          chords.push({
            time: time,
            chord: chordName,
            name: chordName,
          });
        }
      }
    });

    console.log("[LyricsChords] פורסרו", chords.length, "אקורדים");
    return chords;
  }

  /*------------------------------------------------------------
  12. הוספת קטעים אינסטרומנטליים עם אקורדים
------------------------------------------------------------*/
  function addInstrumentalSectionsWithChords(combinedLines, allChords) {
    // 🔧 עובד גם בלי אקורדים - רק לפי פערי זמן
    if (!combinedLines || combinedLines.length === 0) {
      return combinedLines;
    }

    const result = [];
    const INTRO_THRESHOLD = 3; // 🔧 שונה מ-2 ל-3 שניות
    const INSTRUMENTAL_THRESHOLD = 5;
    const hasChords = allChords && allChords.length > 0;

    // 1. Intro - פער בהתחלה לפני הכתובית הראשונה (3 שניות ומעלה)
    if (combinedLines.length > 0) {
      const firstLineStart = combinedLines[0].start;

      if (firstLineStart >= INTRO_THRESHOLD) {
        const introChords = hasChords
          ? allChords.filter(
            (chord) => chord.time >= 0 && chord.time < firstLineStart
          )
          : [];

        // 🔧 מוסיף Intro גם בלי אקורדים (אם יש פער זמן מספיק)
        if (introChords.length > 0 || !hasChords) {
          console.log(
            `[LyricsChords] ✓ נמצא Intro${hasChords ? ` עם ${introChords.length} אקורדים` : " (ללא אקורדים)"}`
          );
          result.push({
            start: 0,
            end: firstLineStart,
            words: [],
            chords: introChords,
            text: "[Intro]",
            isInstrumental: true,
          });
        }
      }
    }

    // 2. שורות רגילות + Instrumental
    for (let i = 0; i < combinedLines.length; i++) {
      const currentLine = combinedLines[i];
      const nextLine = combinedLines[i + 1];

      result.push(currentLine);

      if (nextLine) {
        const gapStart = currentLine.end;
        const gapEnd = nextLine.start;
        const gapDuration = gapEnd - gapStart;

        if (gapDuration > INSTRUMENTAL_THRESHOLD) {
          const instrumentalChords = hasChords
            ? allChords.filter(
              (chord) => chord.time >= gapStart && chord.time < gapEnd
            )
            : [];

          // 🔧 מוסיף Instrumental גם בלי אקורדים (אם יש פער זמן מספיק)
          if (instrumentalChords.length > 0 || !hasChords) {
            console.log(
              `[LyricsChords] ✓ נמצא Instrumental${hasChords ? ` עם ${instrumentalChords.length} אקורדים` : " (ללא אקורדים)"}`
            );
            result.push({
              start: gapStart,
              end: gapEnd,
              words: [],
              chords: instrumentalChords,
              text: "[Instrumental]",
              isInstrumental: true,
            });
          }
        }
      }
    }

    // 3. Outro - פער בסוף אחרי הכתובית האחרונה
    if (combinedLines.length > 0) {
      const lastLine = combinedLines[combinedLines.length - 1];
      const lastLineEnd = lastLine.end;

      const outroChords = hasChords
        ? allChords.filter((chord) => chord.time > lastLineEnd)
        : [];

      // 🔧 Outro תמיד אחרי הכתובית האחרונה - מודגש עד סוף הסרטון
      // משתמשים בערך גדול מאוד (Infinity) כדי שיישאר מודגש עד הסוף
      const outroEnd = Infinity;

      console.log(
        `[LyricsChords] ✓ נמצא Outro${hasChords && outroChords.length > 0 ? ` עם ${outroChords.length} אקורדים` : " (ללא אקורדים)"}`
      );
      result.push({
        start: lastLineEnd,
        end: outroEnd,
        words: [],
        chords: outroChords,
        text: "[Outro]",
        isInstrumental: true,
      });
    }

    // 🔧 הסרת אקורדים כפולים - אקורדים שכבר שויכו לקטעים אינסטרומנטליים
    // לא צריכים להופיע גם בשורות הרגילות
    if (hasChords) {
      // איסוף כל האקורדים שכבר שויכו לקטעים אינסטרומנטליים
      const instrumentalChordTimes = new Set();
      result.forEach(line => {
        if (line.isInstrumental && line.chords) {
          line.chords.forEach(chord => {
            instrumentalChordTimes.add(chord.time);
          });
        }
      });

      // הסרת האקורדים האלה מהשורות הרגילות
      if (instrumentalChordTimes.size > 0) {
        console.log(`[LyricsChords] 🔧 מסיר ${instrumentalChordTimes.size} אקורדים כפולים מהשורות הרגילות`);
        result.forEach(line => {
          if (!line.isInstrumental && line.chords && line.chords.length > 0) {
            const originalCount = line.chords.length;
            line.chords = line.chords.filter(chord => !instrumentalChordTimes.has(chord.time));
            if (line.chords.length < originalCount) {
              console.log(`[LyricsChords] 🔧 הוסרו ${originalCount - line.chords.length} אקורדים כפולים משורה`);
            }
          }
        });
      }
    }

    return result;
  }

  /*------------------------------------------------------------
  12.5 עיבוד בתים ופזמון
------------------------------------------------------------*/

  /**
   * נרמול טקסט לצורך השוואה
   */
  function normalizeTextForComparison(text) {
    if (!text) return "";
    return text
      .toLowerCase()
      .replace(/[.,!?;:'"()\[\]]/g, "") // הסרת סימני פיסוק
      .replace(/\s+/g, " ") // רווחים כפולים לרווח אחד
      .replace(/\b(oh|yeah|la|na|ooh|ah|hey|uh)\b/gi, "") // הסרת מילות מילוי
      .trim();
  }

  /**
   * חישוב Levenshtein Distance בין שני מחרוזות
   */
  function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }
    return dp[m][n];
  }

  /**
   * חישוב אחוז דמיון בין שני טקסטים
   * כולל אופטימיזציות: בדיקת אורך מקדימה וחיתוך חכם
   */
  function calculateSimilarity(text1, text2) {
    const norm1 = normalizeTextForComparison(text1);
    const norm2 = normalizeTextForComparison(text2);

    if (norm1 === norm2) return 100;
    if (!norm1 || !norm2) return 0;

    // אופטימיזציה 1: Fail Fast - אם הפרש האורכים > 20%, דלג
    const len1 = norm1.length;
    const len2 = norm2.length;
    const lengthDiff = Math.abs(len1 - len2) / Math.max(len1, len2);
    if (lengthDiff > 0.2) {
      return 0; // טקסטים באורכים שונים מדי - לא יכולים להיות פזמון
    }

    // אופטימיזציה 2: חיתוך חכם - התחלה + סוף (רק אם מעל 400 תווים)
    const MAX_LEN = 400;
    let s1 = norm1;
    let s2 = norm2;

    if (len1 > MAX_LEN) {
      s1 = norm1.substring(0, 100) + norm1.substring(len1 - 100);
    }
    if (len2 > MAX_LEN) {
      s2 = norm2.substring(0, 100) + norm2.substring(len2 - 100);
    }

    const distance = levenshteinDistance(s1, s2);
    const maxLen = Math.max(s1.length, s2.length);

    return Math.round((1 - distance / maxLen) * 100);
  }

  /**
   * זיהוי רצפי פזמון - מציאת שורות שחוזרות על עצמן
   */
  function detectChorusSequences(lines) {
    const chorusRanges = []; // מערך של { start, end } לכל פזמון
    const MIN_SEQ = 2; // מינימום 2 שורות רצופות זהות

    // סינון רק שורות טקסט (לא אינסטרומנטלי)
    const textLines = lines
      .map((line, idx) => ({
        text: normalizeTextForComparison(line.text),
        originalIndex: idx,
        isInstrumental: line.isInstrumental
      }))
      .filter(item => !item.isInstrumental && item.text.length > 0);

    if (textLines.length < 4) return chorusRanges;

    // חיפוש רצפים זהים
    for (let i = 0; i < textLines.length - MIN_SEQ; i++) {
      for (let j = i + MIN_SEQ; j < textLines.length - MIN_SEQ + 1; j++) {
        let matchLen = 0;
        while (i + matchLen < j && j + matchLen < textLines.length &&
          textLines[i + matchLen].text === textLines[j + matchLen].text) {
          matchLen++;
        }

        if (matchLen >= MIN_SEQ) {
          // מצאנו רצף זהה - שמירת שני המיקומים
          chorusRanges.push({ start: textLines[i].originalIndex, end: textLines[i + matchLen - 1].originalIndex });
          chorusRanges.push({ start: textLines[j].originalIndex, end: textLines[j + matchLen - 1].originalIndex });
          console.log(`[🎵 CHORUS] נמצא רצף זהה: שורות ${textLines[i].originalIndex}-${textLines[i + matchLen - 1].originalIndex} = שורות ${textLines[j].originalIndex}-${textLines[j + matchLen - 1].originalIndex}`);
        }
      }
    }

    console.log(`[🎵 CHORUS] נמצאו ${chorusRanges.length / 2} רצפי פזמון`);
    return chorusRanges;
  }

  /**
   * עיבוד שורות לבתים וזיהוי פזמון
   */
  function processVersesAndChorus(lines) {
    if (!lines || lines.length === 0) return lines;

    const VERSE_GAP_THRESHOLD = 2.0; // פער של 2 שניות = בית חדש
    const VERSE_SIMILARITY_THRESHOLD = 80; // 80% דמיון בין בתים = פזמון (הועלה מ-60% למניעת זיהוי שגוי)

    // שלב 1: איחוד שורות לבתים לפי פער זמני (קודם!)
    const verses = [];
    let currentVerse = { lines: [], startIdx: 0 };

    lines.forEach((line, idx) => {
      if (line.isInstrumental) {
        if (currentVerse.lines.length > 0) {
          verses.push(currentVerse);
          currentVerse = { lines: [], startIdx: idx + 1 };
        }
        line.verseNumber = 0;
        return;
      }

      currentVerse.lines.push({ line, idx });

      const nextLine = lines[idx + 1];
      if (!nextLine || nextLine.isInstrumental) {
        if (currentVerse.lines.length > 0) {
          verses.push(currentVerse);
          currentVerse = { lines: [], startIdx: idx + 1 };
        }
      } else {
        const gap = nextLine.start - line.end;
        if (gap >= VERSE_GAP_THRESHOLD) {
          verses.push(currentVerse);
          currentVerse = { lines: [], startIdx: idx + 1 };
        }
      }
    });

    if (currentVerse.lines.length > 0) {
      verses.push(currentVerse);
    }

    console.log(`[🎵 VERSES] זוהו ${verses.length} בתים`);

    // שלב 2: יצירת טקסט מלא לכל בית
    verses.forEach((verse, idx) => {
      verse.text = verse.lines.map(item => item.line.text || "").join(" ").trim();
      verse.normalizedText = normalizeTextForComparison(verse.text);
      verse.verseNumber = idx + 1;
      console.log(`[🎵 VERSE ${idx + 1}] "${verse.text.substring(0, 60)}..."`);
    });

    // שלב 3: זיהוי פזמון - רצפי שורות זהות
    const chorusRanges = detectChorusSequences(lines);
    const chorusIndicesFromLines = new Set();
    chorusRanges.forEach(range => {
      for (let i = range.start; i <= range.end; i++) {
        chorusIndicesFromLines.add(i);
      }
    });
    console.log(`[🎵 CHORUS-LINES] ${chorusIndicesFromLines.size} שורות מרצפים זהים`);

    // שלב 4: זיהוי פזמון - בתים דומים
    const chorusVerseIndices = new Set();

    for (let i = 0; i < verses.length; i++) {
      if (verses[i].normalizedText.length < 50) continue; // בית קצר מדי

      for (let j = i + 1; j < verses.length; j++) {
        if (verses[j].normalizedText.length < 50) continue;

        const similarity = calculateSimilarity(verses[i].normalizedText, verses[j].normalizedText);

        if (similarity >= VERSE_SIMILARITY_THRESHOLD) {
          chorusVerseIndices.add(i);
          chorusVerseIndices.add(j);
          console.log(`[🎵 CHORUS-VERSE] דמיון ${similarity}%: בית ${i + 1} ↔ בית ${j + 1}`);
        }
      }
    }

    // שלב 5: סימון השורות
    const allChorusIndices = new Set(chorusIndicesFromLines);

    // הוספת שורות מבתים שזוהו כפזמון
    chorusVerseIndices.forEach(verseIdx => {
      verses[verseIdx].lines.forEach(item => {
        allChorusIndices.add(item.idx);
      });
    });

    console.log(`[🎵 CHORUS] סה"כ ${allChorusIndices.size} שורות סומנו כפזמון`);

    // סימון כל השורות
    verses.forEach(verse => {
      verse.lines.forEach(item => {
        item.line.verseNumber = verse.verseNumber;
        item.line.isChorus = allChorusIndices.has(item.idx);
      });
    });

    // שלב 6: איחוד שורות רצופות עם אותו צבע (פזמון/בית)
    const mergedLines = [];
    let currentGroup = null;

    lines.forEach((line, idx) => {
      // שורה אינסטרומנטלית - סוגרת קבוצה קודמת ונשמרת בנפרד
      if (line.isInstrumental) {
        if (currentGroup) {
          mergedLines.push(createMergedLine(currentGroup));
          currentGroup = null;
        }
        mergedLines.push(line);
        return;
      }

      // ✅ שורה דו-לשונית - לא מאחדים, שומרים בנפרד
      if (line.text && line.text.includes('\n')) {
        if (currentGroup) {
          mergedLines.push(createMergedLine(currentGroup));
          currentGroup = null;
        }
        mergedLines.push(line);
        return;
      }

      // בדיקה אם להתחיל קבוצה חדשה או להמשיך קיימת
      if (!currentGroup) {
        // התחלת קבוצה חדשה
        currentGroup = { lines: [line], isChorus: line.isChorus };
      } else if (currentGroup.isChorus === line.isChorus) {
        // אותו צבע - הוספה לקבוצה
        currentGroup.lines.push(line);
      } else {
        // צבע שונה - סגירת קבוצה קודמת והתחלת חדשה
        mergedLines.push(createMergedLine(currentGroup));
        currentGroup = { lines: [line], isChorus: line.isChorus };
      }
    });

    // סגירת קבוצה אחרונה
    if (currentGroup) {
      mergedLines.push(createMergedLine(currentGroup));
    }

    console.log(`[🎵 FINAL] ${lines.length} שורות → ${mergedLines.length} בלוקים מאוחדים`);

    return mergedLines;
  }

  /**
   * יצירת שורה מאוחדת מקבוצת שורות
   */
  function createMergedLine(group) {
    const lines = group.lines;

    // איחוד כל הנתונים
    const mergedWords = [];
    const mergedChords = [];
    let mergedText = "";
    let startTime = Infinity;
    let endTime = 0;

    lines.forEach(line => {
      if (line.words && line.words.length > 0) {
        mergedWords.push(...line.words);
      }
      if (line.chords && line.chords.length > 0) {
        mergedChords.push(...line.chords);
      }
      if (line.text) {
        mergedText += (mergedText ? " " : "") + line.text;
      }
      if (line.start < startTime) startTime = line.start;
      if (line.end > endTime) endTime = line.end;
    });

    const result = {
      text: mergedText,
      words: mergedWords,
      chords: mergedChords.sort((a, b) => a.time - b.time),
      start: startTime,
      end: endTime,
      verseNumber: lines[0].verseNumber,
      isChorus: group.isChorus, // שומר על הצבע המקורי!
      isMerged: true,
      originalLineCount: lines.length
    };

    console.log(`[🎵 MERGED] ${group.isChorus ? 'פזמון' : 'בית'} - ${lines.length} שורות → 1`);
    return result;
  }

  /*------------------------------------------------------------
  13. שילוב נתוני מילים ואקורדים
------------------------------------------------------------*/
  async function combineLyricsAndChords() {
    console.log("[LyricsChords] שילוב מילים ואקורדים...");

    const videoId = window.ycUtils?.extractVideoId(window.location.href);
    if (!videoId) {
      console.log("[LyricsChords] לא ניתן לחלץ videoId");
      return [];
    }

    // משתנים לניקוי זיכרון
    let subtitleItems = null;
    let chordsList = null;
    let combined = null;

    try {
      // טעינת נתונים מ-IndexedDB (עם cache לאקורדים)
      console.log("[LyricsChords] טוען נתונים עבור videoId:", videoId);

      // Resolve AI mode once for this load cycle.
      let aiMode = "off";
      try {
        const aiModeResult = await chrome.storage.local.get(["aiTranscriptionMode"]);
        const rawAiMode = typeof aiModeResult.aiTranscriptionMode === "string"
          ? aiModeResult.aiTranscriptionMode.toLowerCase()
          : "off";
        aiMode = ["off", "auto", "always"].includes(rawAiMode) ? rawAiMode : "off";
      } catch (e) {
        console.warn("[LyricsChords] Failed to read AI mode, defaulting to OFF:", e);
      }

      let chordsProcessingEnabled = true;
      try {
        const chordsSetting = await chrome.storage.sync.get(["chordsProcessingEnabled"]);
        chordsProcessingEnabled = chordsSetting?.chordsProcessingEnabled !== false;
      } catch (e) {
        console.warn("[LyricsChords] Failed to read chords processing setting, defaulting to ON:", e);
      }

      // טעינת כתוביות (תמיד מה-DB כי הן לא משתנות לפי MODE)
      let subtitlesData = await window.databaseManager.loadFromDatabase(
        "subtitles",
        videoId
      );
      subtitlesData = await normalizeActiveSubtitlesData(subtitlesData, aiMode);

      console.log("[LyricsChords] נתוני כתוביות נטענו:", {
        hasSubtitlesData: !!subtitlesData,
        hasSentenceSRT: !!subtitlesData?.sentenceSRT,
        hasWordSRT: !!subtitlesData?.wordSRT,
        sentenceSRTLength: subtitlesData?.sentenceSRT?.length || 0,
        wordSRTLength: subtitlesData?.wordSRT?.length || 0,
      });

      if (
        !subtitlesData ||
        (!subtitlesData.sentenceSRT && !subtitlesData.wordSRT && !subtitlesData.translationSRT) // 🆕 Support translation
      ) {
        console.log("[LyricsChords] חסרים נתוני כתוביות לשילוב");
        return [];
      }

      // 🆕 Check if user selected translation mode
      // In split view, use the stored flag; otherwise check storage
      let useTranslation = false;
      if (window.ycLyricsSplitViewTranslationMode !== undefined) {
        // Split view mode - use the flag we set earlier
        useTranslation = window.ycLyricsSplitViewTranslationMode;
        console.log("[LyricsChords] 🎯 Split view - using translation mode from flag:", useTranslation);
      } else {
        // Normal mode - check storage
        try {
          const selectionResult = await chrome.storage.local.get(['showTranslation']);
          useTranslation = selectionResult.showTranslation || false;
        } catch (e) {
          console.warn("[LyricsChords] Failed to check translation mode:", e);
        }
      }

      // OFF mode is YouTube DEFAULT-only in panel as well.
      if (aiMode === "off" && useTranslation) {
        console.log("[LyricsChords] AI mode OFF - forcing DEFAULT subtitles in panel");
        useTranslation = false;
      }

      // 🆕 Determine which subtitles to use based on user selection
      const useSentenceSRT = (useTranslation && subtitlesData.translationSRT)
        ? subtitlesData.translationSRT
        : subtitlesData.sentenceSRT;
      const useOriginalSentences = (useTranslation && subtitlesData.translationOriginalSentences)
        ? subtitlesData.translationOriginalSentences
        : subtitlesData.originalSentences;

      console.log("[LyricsChords] 🎯 Using subtitles:", {
        useTranslation,
        hasTranslationSRT: !!subtitlesData.translationSRT,
        hasSentenceSRT: !!subtitlesData.sentenceSRT,
        selectedSRT: useTranslation ? 'translation' : 'default'
      });

      const activeDefaultSource =
        subtitlesData?.activeDefaultSource === "custom"
          ? "custom"
          : subtitlesData?.activeDefaultSource === "gemini"
            ? "gemini"
            : "youtube";
      const hasYoutubeWordLevelTimings =
        activeDefaultSource === "youtube" &&
        typeof subtitlesData?.wordSRT === "string" &&
        subtitlesData.wordSRT.trim() !== "";
      const suppressPanelChordsForYoutubeWordLevel =
        hasYoutubeWordLevelTimings && !useTranslation;

      if (suppressPanelChordsForYoutubeWordLevel) {
        console.log(
          "[LyricsChords] YouTube word-level subtitles active - hiding chords inside the lyrics panel"
        );
      }

      // טעינת אקורדים עם cache - מדלגים לגמרי כשפאנל YouTube word-level לא מציג אקורדים.
      let chordsData = null;
      if (chordsProcessingEnabled && !suppressPanelChordsForYoutubeWordLevel) {
        chordsData = window.chordTextsCache?.[videoId];
        if (!chordsData) {
          console.log("[LyricsChords] טוען אקורדים מ-DB (לא ב-cache)");
          chordsData = await window.databaseManager.loadFromDatabase(
            "chords",
            videoId
          );
          // שמירה ב-cache לשימוש חוזר
          if (chordsData && !window.chordTextsCache) {
            window.chordTextsCache = {};
          }
          if (chordsData) {
            window.chordTextsCache[videoId] = {
              chordText: chordsData.chordText,
              chordTextRegularPlus: chordsData.chordTextRegularPlus,
              chordTextHarmonic: chordsData.chordTextHarmonic,
              chordTextHarmonicPlus: chordsData.chordTextHarmonicPlus,
            };
          }
        } else {
          console.log("[LyricsChords] משתמש באקורדים מ-cache (ללא גישה ל-DB)");
        }
      } else if (suppressPanelChordsForYoutubeWordLevel) {
        console.log(
          "[LyricsChords] מדלג על טעינת אקורדים לפאנל YouTube word-level"
        );
      } else {
        console.log("[LyricsChords] Chords processing is OFF - panel will run in subtitles-only mode");
      }

      console.log("[LyricsChords] נתוני אקורדים נטענו:", {
        hasChordsData: !!chordsData,
        hasChordText: !!chordsData?.chordText,
        chordTextLength: chordsData?.chordText?.length || 0,
      });

      if (window.subtitleState) {
        window.subtitleState.useTranslation = useTranslation;
        window.subtitleState.activeDefaultSource = activeDefaultSource;
      }

      if (window.databaseManager?.getSubtitleOffsetForActiveSource) {
        try {
          const offsetResult = await window.databaseManager.getSubtitleOffsetForActiveSource(
            videoId,
            {
              useTranslation,
              aiMode,
              subtitlesData,
            }
          );
          if (window.subtitleState) {
            window.subtitleState.timing_offset = Number(offsetResult?.offset) || 0;
            window.subtitleState.timingSourceKey = offsetResult?.sourceKey || null;
          }
        } catch (offsetError) {
          console.warn("[LyricsChords] Failed to sync subtitle timing offset:", offsetError);
        }
      }

      // פרסור נתוני אקורדים לפי המצב הנוכחי
      chordsList = [];
      if (chordsData) {
        // טעינת מצב האקורדים מ-storage אם לא קיים
        if (!window.chordsMode) {
          try {
            const result = await chrome.storage.sync.get(["chordsMode"]);
            window.chordsMode = result.chordsMode || "regular";
            console.log(
              "[LyricsChords] טען מצב אקורדים מ-storage:",
              window.chordsMode
            );
          } catch (error) {
            console.warn(
              "[LyricsChords] שגיאה בטעינת מצב אקורדים מ-storage:",
              error
            );
            window.chordsMode = "regular";
          }
        }

        // בחירת הטקסט הנכון לפי chords mode
        let chordTextToUse = null;
        const currentMode = window.chordsMode || "regular";

        console.log("[LyricsChords] מצב אקורדים נוכחי:", currentMode);
        console.log("[LyricsChords] נתוני אקורדים זמינים:", {
          regular: !!chordsData.chordText,
          regularPlus: !!chordsData.chordTextRegularPlus,
          harmonic: !!chordsData.chordTextHarmonic,
          harmonicPlus: !!chordsData.chordTextHarmonicPlus,
        });

        switch (currentMode) {
          case "regularPlus":
            chordTextToUse =
              chordsData.chordTextRegularPlus || chordsData.chordText;
            console.log("[LyricsChords] משתמש בטקסט Regular+");
            break;
          case "harmonic":
            chordTextToUse =
              chordsData.chordTextHarmonic || chordsData.chordText;
            console.log("[LyricsChords] משתמש בטקסט Harmonic");
            break;
          case "harmonicPlus":
            chordTextToUse =
              chordsData.chordTextHarmonicPlus || chordsData.chordText;
            console.log("[LyricsChords] משתמש בטקסט Harmonic+");
            break;
          default: // 'regular'
            chordTextToUse = chordsData.chordText;
            console.log("[LyricsChords] משתמש בטקסט Regular");
            break;
        }

        if (chordTextToUse && chordTextToUse.trim() !== "") {
          // 🎯 בדיקה: אם אין כתוביות ברמת מילה - לא להציג אקורדים
          if (suppressPanelChordsForYoutubeWordLevel) {
            console.log(
              "[LyricsChords] 🎯 YouTube word-level panel - skipping panel chord rendering"
            );
            chordsList = [];
          } else if (!subtitlesData.wordSRT || subtitlesData.wordSRT.trim() === "") {
            console.log("[LyricsChords] 🎯 אין כתוביות ברמת מילה - מדלג על אקורדים");
            chordsList = [];
          } else {
            console.log("[LyricsChords] פרסור chordText עבור מצב:", currentMode);
            chordsList = parseChordText(chordTextToUse);

            // 🚀 Filter quick chords if enabled
            if (window.filterQuickChords) {
              const originalCount = chordsList.length;
              chordsList = window.filterQuickChords(chordsList);
              if (chordsList.length !== originalCount) {
                console.log(`[LyricsChords] 🚀 Filtered ${originalCount - chordsList.length} quick chords`);
              }
            }
          }
        }
      }

      if (chordsList.length === 0) {
        console.log("[LyricsChords] אין אקורדים - ממשיך רק עם כתוביות");
        // לא מחזירים מערך ריק - ממשיכים עם כתוביות בלבד
      }

      // פרסור נתוני כתוביות מ-SRT
      subtitleItems = [];

      // 🔧 FIX: טעינת זמנים מדויקים מ-wordSRT לפני פרסור sentenceSRT
      // זה מבטיח שהמילה המודגשת תהיה מסונכרנת גם כשהקרוסלה סגורה
      if (subtitlesData.wordSRT && subtitlesData.wordSRT.trim() !== "") {
        console.log("[LyricsChords] 🔧 טוען זמנים מדויקים מ-wordSRT...");
        const accurateWordTimings = parseWordSRTForAccurateTiming(subtitlesData.wordSRT);

        // שמירה ב-state ייעודי של הפאנל (לא נוגעים ב-subtitleState של הקרוסלה)
        window.ycPanelWordTimings = accurateWordTimings;
        window.ycSentenceLevelHighlight = false; // יש word-level, לא צריך sentence-level
        window.ycUsingApproximateWordTimings = false;
        window.ycParsedSentences = [];
        console.log(`[LyricsChords] 🔧 נטענו ${accurateWordTimings.length} מילים עם זמנים מדויקים`);
      } else if ((subtitlesData.originalSentences && subtitlesData.originalSentences.length > 0) ||
        (subtitlesData.translationOriginalSentences && subtitlesData.translationOriginalSentences.length > 0)) { // 🆕 Support translation
        // 🎯 No word-level - same source as carousel: originalSentences timeline
        console.log("[LyricsChords] 🎯 אין word-level - משתמש ב-originalSentences להדגשת משפטים (כמו קרוסלה)...");
        window.ycPanelWordTimings = [];
        window.ycSentenceLevelHighlight = true;
        window.ycUsingApproximateWordTimings = false;
        window.ycParsedSentences = prepareOriginalSentencesForHighlight(useOriginalSentences);
        if (lyricsChordsPanelElement) {
          lyricsChordsPanelElement
            .querySelectorAll(".lyrics-word.past-word")
            .forEach((el) => el.classList.remove("past-word"));
        }
        console.log(`[LyricsChords] 🎯 נטענו ${window.ycParsedSentences.length} משפטים מקוריים להדגשה`);
      } else if ((subtitlesData.sentenceSRT && subtitlesData.sentenceSRT.trim() !== "") ||
        (subtitlesData.translationSRT && subtitlesData.translationSRT.trim() !== "")) { // 🆕 Support translation
        // 🎯 Fallback - אין originalSentences, נפרסר את sentenceSRT
        console.log("[LyricsChords] 🎯 אין word-level ואין originalSentences, מפרסר sentenceSRT...");
        window.ycPanelWordTimings = [];
        window.ycSentenceLevelHighlight = true;
        window.ycUsingApproximateWordTimings = false;
        // 🆕 Use selected SRT (translation or default based on user choice)
        window.ycParsedSentences = parseSentenceSRTForHighlight(useSentenceSRT);
        if (lyricsChordsPanelElement) {
          lyricsChordsPanelElement
            .querySelectorAll(".lyrics-word.past-word")
            .forEach((el) => el.classList.remove("past-word"));
        }
        console.log(`[LyricsChords] 🎯 נטענו ${window.ycParsedSentences.length} משפטים להדגשה`);
      }

      // ננסה לפרסר SRT
      if (
        (subtitlesData.sentenceSRT && subtitlesData.sentenceSRT.trim() !== "") ||
        (subtitlesData.translationSRT && subtitlesData.translationSRT.trim() !== "") // 🆕 Support translation
      ) {
        console.log("[LyricsChords] פרסור sentenceSRT או translationSRT...");
        // 🆕 Use selected SRT (translation or default based on user choice)
        subtitleItems = parseSRT(useSentenceSRT);
      } else if (subtitlesData.wordSRT && subtitlesData.wordSRT.trim() !== "") {
        console.log("[LyricsChords] פרסור wordSRT...");
        subtitleItems = parseSRT(subtitlesData.wordSRT);
      }

      console.log(
        "[LyricsChords] subtitleItems אחרי פרסור:",
        subtitleItems.length
      );

      if (subtitleItems.length === 0) {
        console.log("[LyricsChords] לא ניתן לפרסר נתוני כתוביות");
        return [];
      }

      combined = [];

      console.log(
        "[LyricsChords] מתחיל ליצור שורות משולבות עבור",
        subtitleItems.length,
        "כתוביות"
      );
      console.log(
        "[LyricsChords] רשימת אקורדים זמינה:",
        chordsList.length,
        "אקורדים"
      );

      // 🔧 שלב 1: יצירת שורות עם אקורדים שנופלים בטווח הזמן שלהן
      const usedChordIndices = new Set();

      subtitleItems.forEach((subtitleItem, index) => {
        if (!subtitleItem.words || subtitleItem.words.length === 0) {
          console.log(`[LyricsChords] מדלג על כתובית ${index} - אין מילים`);
          return;
        }

        const startTime = subtitleItem.start;
        const endTime = subtitleItem.end;

        // מצא אקורדים בטווח הזמן הזה (אם יש)
        const relevantChords =
          chordsList.length > 0
            ? chordsList.filter((chord, idx) => {
              if (chord.time >= startTime && chord.time <= endTime) {
                usedChordIndices.add(idx);
                return true;
              }
              return false;
            })
            : [];

        // צור שורה משולבת
        const line = {
          start: startTime,
          end: endTime,
          words: subtitleItem.words,
          chords: relevantChords,
          text:
            subtitleItem.text ||
            subtitleItem.words.map((w) => w.word).join(" "),
        };

        console.log(`[LyricsChords] שורה ${index}:`, {
          text: line.text,
          wordsCount: line.words.length,
          chordsCount: line.chords.length,
          timeRange: `${startTime.toFixed(2)}-${endTime.toFixed(2)}`,
        });

        combined.push(line);
      });

      // מיין לפי זמן
      combined.sort((a, b) => a.start - b.start);

      // 🔧 שלב 2: מציאת אקורדים "יתומים" (Chord Gaps) שלא משויכים לאף שורה
      const orphanChords = chordsList.filter(
        (chord, idx) => !usedChordIndices.has(idx)
      );

      if (orphanChords.length > 0) {
        console.log(
          `[LyricsChords] 🔧 נמצאו ${orphanChords.length} אקורדים יתומים (Chord Gaps)`
        );

        // 🔧 שלב 3: שיוך אקורדים יתומים לשורה הקרובה
        orphanChords.forEach((orphanChord) => {
          // מצא את השורה הקרובה ביותר (לפני או אחרי)
          let closestLineIndex = -1;
          let minDistance = Infinity;

          combined.forEach((line, idx) => {
            // מרחק מתחילת השורה
            const distToStart = Math.abs(orphanChord.time - line.start);
            // מרחק מסוף השורה
            const distToEnd = Math.abs(orphanChord.time - line.end);
            const minDist = Math.min(distToStart, distToEnd);

            if (minDist < minDistance) {
              minDistance = minDist;
              closestLineIndex = idx;
            }
          });

          if (closestLineIndex !== -1) {
            // הוסף את האקורד היתום לשורה הקרובה
            combined[closestLineIndex].chords.push(orphanChord);
            // מיין את האקורדים בשורה לפי זמן
            combined[closestLineIndex].chords.sort((a, b) => a.time - b.time);

            console.log(
              `[LyricsChords] 🔧 Chord Gap "${orphanChord.name || orphanChord.chord}" (${orphanChord.time.toFixed(2)}s) שויך לשורה ${closestLineIndex}`
            );
          }
        });
      }

      console.log("[LyricsChords] נוצרו", combined.length, "שורות משולבות");

      // 🔧 הוספת קטעים אינסטרומנטליים (Intro/Instrumental/Outro)
      // עובד גם בלי אקורדים - רק לפי פערי זמן בין הכתוביות
      combined = addInstrumentalSectionsWithChords(combined, chordsList || []);
      console.log(
        "[LyricsChords] אחרי הוספת קטעים אינסטרומנטליים:",
        combined.length,
        "שורות"
      );

      // 🎵 שלב חדש: איחוד שורות לבתים וזיהוי פזמון
      combined = processVersesAndChorus(combined);
      console.log(
        "[LyricsChords] 🎵 אחרי עיבוד בתים ופזמון:",
        combined.length,
        "שורות"
      );

      return combined;
    } catch (error) {
      console.error("[LyricsChords] שגיאה בשילוב נתונים:", error);
      return [];
    } finally {
      // ניקוי זיכרון - שחרור הפניות למערכים גדולים
      if (subtitleItems && subtitleItems.length > 100) {
        console.log("[LyricsChords] ניקוי subtitleItems גדול");
        subtitleItems = null;
      }
      if (chordsList && chordsList.length > 100) {
        console.log("[LyricsChords] ניקוי chordsList גדול");
        chordsList = null;
      }
      // combined לא מנוקה כי היא חוזרת
    }
  }

  /*------------------------------------------------------------
  14. הפעלת סנכרון משופר
------------------------------------------------------------*/
  // משתנה גלובלי לשמירת ה-handler של אירוע play
  let videoPlayHandler = null;
  // 🎯 Past Words: משתנה לשמירת ה-handler של אירוע seeked
  let videoSeekedHandler = null;

  function startLyricsChordsSync() {
    // Stop any previous sync loop before starting a new one.
    stopLyricsChordsSync();
    const video = document.querySelector("video");
    let rafId = null;
    let lastUpdate = 0;
    const UPDATE_INTERVAL = 100; // 100ms
    const setRafState = (nextRafId) => {
      rafId = nextRafId;
      if (lyricsChordsSyncInterval) {
        lyricsChordsSyncInterval.rafId = nextRafId;
        lyricsChordsSyncInterval.isRunning = nextRafId !== null;
      }
    };
    const cancelSyncFrame = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      setRafState(null);
    };
    function syncLoop(timestamp) {
      // Consume the current frame id so stale ids are never reused.
      setRafState(null);
      if (
        document.hidden ||
        !window.lyricsChordsPanelActive ||
        !lyricsChordsPanelElement
      ) {
        return;
      }
      const activeVideo = document.querySelector("video");
      if (!activeVideo || activeVideo.paused) {
        return;
      }
      if (timestamp - lastUpdate >= UPDATE_INTERVAL) {
        try {
          updateLyricsChordsHighlight();
        } catch (error) {
          console.error("[LyricsChords] Highlight update failed:", error);
        }
        lastUpdate = timestamp;
      }
      setRafState(requestAnimationFrame(syncLoop));
    }
    const ensureSyncLoopRunning = () => {
      if (
        document.hidden ||
        !window.lyricsChordsPanelActive ||
        !lyricsChordsPanelElement
      ) {
        return;
      }
      const activeVideo = document.querySelector("video");
      if (!activeVideo || activeVideo.paused) {
        return;
      }
      if (rafId === null) {
        setRafState(requestAnimationFrame(syncLoop));
      }
    };
    // Resume sync when playback resumes (and reset manual-scroll state).
    if (video && !videoPlayHandler) {
      videoPlayHandler = () => {
        if (manualScrollActive) {
          manualScrollActive = false;
          lastVideoTime = -1;
          console.log(
            "[LyricsChords] Playback resumed - resetting manual scroll state"
          );
        }
        ensureSyncLoopRunning();
      };
      video.addEventListener("play", videoPlayHandler);
      console.log("[LyricsChords] Added video play listener");
    }
    // Past words sync on seek (also updates highlight while paused).
    if (video && !videoSeekedHandler) {
      videoSeekedHandler = () => {
        if (!window.lyricsChordsPastWordsEnabled) return;
        const currentTime = video.currentTime;
        const subtitleCurrentTime = getAdjustedSubtitleTime(currentTime);
        if (typeof ensureElementsCached === "function") {
          ensureElementsCached();
        }
        if (
          typeof syncPastWordsOnSeek === "function" &&
          lastPastWordsVideoTime >= 0
        ) {
          syncPastWordsOnSeek(subtitleCurrentTime, lastPastWordsVideoTime);
        }
        try {
          updateLyricsChordsHighlight();
        } catch (error) {
          console.error("[LyricsChords] Highlight update after seek failed:", error);
        }
        lastPastWordsVideoTime = subtitleCurrentTime;
        console.log("[PastWords] Seeked to " + subtitleCurrentTime.toFixed(2) + "s");
        ensureSyncLoopRunning();
      };
      video.addEventListener("seeked", videoSeekedHandler);
      console.log("[LyricsChords] Added video seeked listener (Past Words)");
    }
    // Track RAF state in the shared sync object.
    lyricsChordsSyncInterval = {
      rafId: null,
      isRunning: false,
      cancel: cancelSyncFrame,
      schedule: ensureSyncLoopRunning,
      removeVisibilityListener: null, // initialized below
    };
    ensureSyncLoopRunning();
    // Pause loop while tab is hidden; resume only when needed.
    if (!globalVisibilityHandler) {
      globalVisibilityHandler = () => {
        if (document.hidden) {
          console.log("[LyricsChords] Tab hidden - sync paused");
          cancelSyncFrame();
        } else if (lyricsChordsPanelActive && lyricsChordsSyncInterval) {
          console.log("[LyricsChords] Tab visible - sync resumed");
          ensureSyncLoopRunning();
        }
      };
      document.addEventListener("visibilitychange", globalVisibilityHandler);
      console.log("[LyricsChords] Added global visibility listener");
    }
    // visibility listener cleanup hook
    lyricsChordsSyncInterval.removeVisibilityListener = () => {
      if (globalVisibilityHandler) {
        document.removeEventListener(
          "visibilitychange",
          globalVisibilityHandler
        );
        globalVisibilityHandler = null;
        console.log("[LyricsChords] Removed global visibility listener");
      }
    };
  }
  /*------------------------------------------------------------
  15. עצירת סנכרון משופר
------------------------------------------------------------*/
  function stopLyricsChordsSync() {
    // ניקוי מאזין play של הווידאו
    if (videoPlayHandler) {
      const video = document.querySelector("video");
      if (video) {
        video.removeEventListener("play", videoPlayHandler);
      }
      videoPlayHandler = null;
      console.log("[LyricsChords] מאזין play לווידאו הוסר");
    }

    // 🎯 Past Words: ניקוי מאזין seeked של הווידאו
    if (videoSeekedHandler) {
      const video = document.querySelector("video");
      if (video) {
        video.removeEventListener("seeked", videoSeekedHandler);
      }
      videoSeekedHandler = null;
      console.log("[LyricsChords] מאזין seeked לווידאו הוסר (Past Words)");
    }

    if (lyricsChordsSyncInterval) {
      // ניקוי requestAnimationFrame
      if (lyricsChordsSyncInterval.cancel) {
        lyricsChordsSyncInterval.cancel();
      }

      // ניקוי visibility listener
      if (lyricsChordsSyncInterval.removeVisibilityListener) {
        lyricsChordsSyncInterval.removeVisibilityListener();
      }

      // תמיכה לאחורה - אם זה עדיין interval רגיל
      if (typeof lyricsChordsSyncInterval === "number") {
        clearInterval(lyricsChordsSyncInterval);
      }

      lyricsChordsSyncInterval = null;
      console.log("[LyricsChords] סנכרון נעצר");
    }
  }

  /*------------------------------------------------------------
  15. עדכון הדגשה מאופטמז (עם binary search ועדכון חלקי)
------------------------------------------------------------*/

  // משתנים לאופטימיזציה משופרים
  let lastHighlightTime = -1;
  let lastActiveWordIndex = -1;
  let lastActiveChordIndex = -1;
  let lastVideoCurrentTime = -1;
  let highlightUpdateCount = 0;

  // 🎯 משתנים להדגשה ברמת משפט
  let lastActiveSentenceIndex = -1;
  let lastHighlightedWordElements = [];
  let sentenceWordElementsMap = null;
  let sentenceWordElementsMapKey = "";

  // 🎯 Past Words: משתנה לזיהוי קפיצות בזמן
  let lastPastWordsVideoTime = -1;
  let pastWordsRenderSyncTimeout = null;

  // סף זמן דינמי - מתאים לפי מהירות השינויים
  const BASE_TIME_THRESHOLD = 0.05; // בסיס של 0.05 שניות לרספונסיביות טובה יותר
  const ADAPTIVE_THRESHOLD_MAX = 0.15; // מקסימום 0.15 שניות
  let currentTimeThreshold = BASE_TIME_THRESHOLD;

  // Throttling חכם
  let lastHighlightUpdate = 0;
  const MIN_UPDATE_INTERVAL = 16; // ~60fps מקסימום
  let pendingHighlightUpdate = false;

  // Cache משופר עם lazy loading
  let cachedWordElementsValid = false;
  let cachedChordElementsValid = false;
  // 🎯 הוסר lastCacheInvalidation - ה-cache מתעדכן רק כשהתוכן משתנה

  // סטטיסטיקות ביצועים מורחבות
  let highlightStats = {
    totalCalls: 0,
    skippedCalls: 0,
    throttledCalls: 0,
    wordUpdates: 0,
    chordUpdates: 0,
    binarySearches: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgUpdateTime: 0,
    maxUpdateTime: 0,
  };

  function updateLyricsChordsHighlight() {
    const updateStartTime = performance.now();
    const video = document.querySelector("video");

    if (!video || !lyricsChordsPanelElement) return;

    const currentTime = video.currentTime;
    const subtitleCurrentTime = getAdjustedSubtitleTime(currentTime);
    highlightStats.totalCalls++;

    // אופטימיזציה 1: Throttling חכם - מניעת עדכונים תכופים מדי
    const now = performance.now();
    if (now - lastHighlightUpdate < MIN_UPDATE_INTERVAL) {
      highlightStats.throttledCalls++;

      // שמירת עדכון מושהה אם לא קיים
      if (!pendingHighlightUpdate) {
        pendingHighlightUpdate = true;
        setTimeout(() => {
          pendingHighlightUpdate = false;
          updateLyricsChordsHighlight();
        }, MIN_UPDATE_INTERVAL - (now - lastHighlightUpdate));
      }
      return;
    }

    lastHighlightUpdate = now;

    // אופטימיזציה 2: Adaptive Time Threshold - התאמה למהירות השינויים
    updateAdaptiveThreshold(currentTime);

    if (Math.abs(subtitleCurrentTime - lastHighlightTime) < currentTimeThreshold) {
      highlightStats.skippedCalls++;
      return; // אין צורך בעדכון
    }

    lastHighlightTime = subtitleCurrentTime;
    highlightUpdateCount++;

    // אופטימיזציה 3: Cache משופר עם lazy loading
    ensureElementsCached();

    // 🎯 Past Words: זיהוי קפיצה בזמן וסנכרון מילים
    if (window.lyricsChordsPastWordsEnabled && lastPastWordsVideoTime >= 0) {
      syncPastWordsOnSeek(subtitleCurrentTime, lastPastWordsVideoTime);
    }
    lastPastWordsVideoTime = subtitleCurrentTime;

    // 🎯 בדיקה: האם להשתמש בהדגשה ברמת משפט או ברמת מילה?
    if (window.ycSentenceLevelHighlight && window.ycParsedSentences?.length > 0) {
      // הדגשה ברמת משפט
      updateSentenceLevelHighlight(subtitleCurrentTime);
    } else {
      // אופטימיזציה 4: חיפוש בינארי משופר למילים (word-level)
      const activeWordIndex = findActiveWordIndexOptimized(subtitleCurrentTime);
      if (activeWordIndex !== lastActiveWordIndex) {
        updateWordHighlightOptimized(activeWordIndex, lastActiveWordIndex, subtitleCurrentTime);
        lastActiveWordIndex = activeWordIndex;
        highlightStats.wordUpdates++;
      }
    }

    // אופטימיזציה 5: חיפוש בינארי משופר לאקורדים
    const activeChordIndex = findActiveChordIndexOptimized(currentTime);
    if (activeChordIndex !== lastActiveChordIndex) {
      updateChordHighlightOptimized(activeChordIndex, lastActiveChordIndex);
      lastActiveChordIndex = activeChordIndex;
      highlightStats.chordUpdates++;
    }

    // 🎯 שליחת עדכון זמן ל-Preview Panel (תמיד, גם בלי word-level)
    if (window.ycChordsPreviewPanel?.isVisible) {
      window.dispatchEvent(
        new CustomEvent("yc:timeUpdate", {
          detail: { time: currentTime, isScrubbing: false },
        })
      );
    }

    // עדכון הדגשת תוויות אינסטרומנטליות
    updateInstrumentalLabelHighlight(subtitleCurrentTime);

    // מדידת ביצועים
    const updateTime = performance.now() - updateStartTime;
    highlightStats.avgUpdateTime =
      (highlightStats.avgUpdateTime * (highlightUpdateCount - 1) + updateTime) /
      highlightUpdateCount;
    if (updateTime > highlightStats.maxUpdateTime) {
      highlightStats.maxUpdateTime = updateTime;
    }
  }

  // פונקציה לעדכון סף הזמן הדינמי
  function updateAdaptiveThreshold(currentTime) {
    const timeDiff = Math.abs(currentTime - lastVideoCurrentTime);

    if (timeDiff > 1.0) {
      // שינוי גדול - הגדל את הסף זמנית
      currentTimeThreshold = Math.min(
        ADAPTIVE_THRESHOLD_MAX,
        BASE_TIME_THRESHOLD * 2
      );
    } else if (timeDiff < 0.1) {
      // שינוי קטן - הקטן את הסף לרספונסיביות
      currentTimeThreshold = BASE_TIME_THRESHOLD;
    } else {
      // שינוי בינוני - התאם בהדרגה
      const factor = 1 + timeDiff / 2;
      currentTimeThreshold = Math.min(
        ADAPTIVE_THRESHOLD_MAX,
        BASE_TIME_THRESHOLD * factor
      );
    }

    lastVideoCurrentTime = currentTime;
  }

  // 🎯 Cache לתוויות אינסטרומנטליות - מונע querySelectorAll בכל frame
  let cachedInstrumentalLabels = null;
  let cachedInstrumentalLabelsValid = false;

  // פונקציה לעדכון הדגשת תוויות אינסטרומנטליות (Intro, Instrumental, Outro)
  function updateInstrumentalLabelHighlight(currentTime) {
    if (!lyricsChordsPanelElement) return;

    // 🎯 שימוש ב-cache במקום querySelectorAll בכל קריאה
    if (!cachedInstrumentalLabels || !cachedInstrumentalLabelsValid) {
      cachedInstrumentalLabels = Array.from(
        lyricsChordsPanelElement.querySelectorAll(".instrumental-label")
      );
      cachedInstrumentalLabelsValid = true;
    }

    if (cachedInstrumentalLabels.length === 0) return;

    cachedInstrumentalLabels.forEach((label) => {
      const start = parseFloat(label.getAttribute("data-start"));
      const end = parseFloat(label.getAttribute("data-end"));

      if (isNaN(start) || isNaN(end)) return;

      const isActive = currentTime >= start && currentTime <= end;

      if (isActive) {
        if (!label.classList.contains("active")) {
          label.classList.add("active");
        }
      } else {
        if (label.classList.contains("active")) {
          label.classList.remove("active");
        }
      }
    });
  }

  // פונקציה לוידוא cache תקין עם lazy loading
  // 🎯 תיקון: הסרת cache invalidation כל 5 שניות - ה-cache יתעדכן רק כשהתוכן משתנה
  function ensureElementsCached() {
    // טעינת cache למילים אם צריך (רק אם לא קיים או לא תקין)
    if (!cachedWordElements || !cachedWordElementsValid) {
      const elements =
        lyricsChordsPanelElement.querySelectorAll(".lyrics-word[data-time]:not(.chord-gap-spacer)");
      if (elements.length > 0) {
        cachedWordElements = Array.from(elements);
        cachedWordElementsValid = true;
        highlightStats.cacheMisses++;

        // הוספת listeners למילים (רק אם הcache התעדכן)
        // 🎯 addWordClickListeners כבר בודק אם יש delegation - לא יוסיף כפול
        if (typeof addWordClickListeners === "function") {
          addWordClickListeners();
        }
      }
    } else {
      highlightStats.cacheHits++;
    }

    // טעינת cache לאקורדים אם צריך (רק אם לא קיים או לא תקין)
    if (!cachedChordElements || !cachedChordElementsValid) {
      const elements =
        lyricsChordsPanelElement.querySelectorAll(".lyrics-chord");
      if (elements.length > 0) {
        cachedChordElements = Array.from(elements);
        cachedChordElementsValid = true;
        highlightStats.cacheMisses++;

        // הוספת hover listeners לאקורדים (רק אם הcache התעדכן)
        if (typeof addChordHoverListeners === "function") {
          addChordHoverListeners();
        }
      }
    } else {
      highlightStats.cacheHits++;
    }
  }

  // 🎯 פונקציה לאיפוס כל ה-caches - תיקרא רק כשהתוכן משתנה
  function invalidateAllCaches() {
    cachedWordElements = null;
    cachedChordElements = null;
    cachedInstrumentalLabels = null;
    cachedWordElementsValid = false;
    cachedChordElementsValid = false;
    cachedInstrumentalLabelsValid = false;
    lastHighlightTime = -1;
    lastActiveWordIndex = -1;
    lastActiveChordIndex = -1;
    lastActiveSentenceIndex = -1;
    lastHighlightedWordElements = [];
    lastPastWordsVideoTime = -1;
    sentenceWordElementsMap = null;
    sentenceWordElementsMapKey = "";
    console.log("[LyricsChords] 🗑️ All caches invalidated");
  }

  function applyPastWordClassForElement(wordEl, currentTime) {
    if (!wordEl) return false;

    const wordTime = parseFloat(wordEl.dataset.time);
    if (Number.isNaN(wordTime)) return false;

    const shouldBePast =
      window.lyricsChordsPastWordsEnabled &&
      wordTime < currentTime &&
      !wordEl.classList.contains("active");

    if (shouldBePast) {
      if (!wordEl.classList.contains("past-word")) {
        wordEl.classList.add("past-word");
        return true;
      }
    } else if (wordEl.classList.contains("past-word")) {
      wordEl.classList.remove("past-word");
    }

    return false;
  }

  function syncPastWordsForCurrentTime(currentTime, reason = "") {
    if (!lyricsChordsPanelElement || !Number.isFinite(currentTime)) return;

    if (!window.lyricsChordsPastWordsEnabled) {
      lyricsChordsPanelElement
        .querySelectorAll(".lyrics-word.past-word")
        .forEach((el) => el.classList.remove("past-word"));
      return;
    }

    ensureElementsCached();
    if (!cachedWordElements || cachedWordElements.length === 0) return;

    let markedCount = 0;
    for (let i = 0; i < cachedWordElements.length; i++) {
      if (applyPastWordClassForElement(cachedWordElements[i], currentTime)) {
        markedCount++;
      }
    }

    if (markedCount > 0) {
      console.log(
        `[PastWords] Synced ${markedCount} past words${reason ? ` (${reason})` : ""}`
      );
    }
  }

  function schedulePastWordsSyncAfterRender(delayMs = 0) {
    if (pastWordsRenderSyncTimeout !== null) {
      clearTimeout(pastWordsRenderSyncTimeout);
      pastWordsRenderSyncTimeout = null;
    }

    pastWordsRenderSyncTimeout = setTimeout(() => {
      pastWordsRenderSyncTimeout = null;

      if (!lyricsChordsPanelElement) return;
      const video = document.querySelector("video");
      if (!video) return;

      const subtitleCurrentTime = getAdjustedSubtitleTime(video.currentTime);
      try {
        updateLyricsChordsHighlight();
      } catch (error) {
        console.error("[LyricsChords] Highlight update after render failed:", error);
      }
      syncPastWordsForCurrentTime(subtitleCurrentTime, "render");
      lastPastWordsVideoTime = subtitleCurrentTime;
    }, delayMs);
  }

  function refreshLyricsChordsTimingOffsetNow(reason = "offset") {
    if (!window.lyricsChordsPanelActive || !lyricsChordsPanelElement) return;

    const video = document.querySelector("video");
    if (!video) return;

    const subtitleCurrentTime = getAdjustedSubtitleTime(video.currentTime);
    lastHighlightTime = Number.NEGATIVE_INFINITY;
    lastHighlightUpdate = 0;

    try {
      updateLyricsChordsHighlight();
    } catch (error) {
      console.error("[LyricsChords] Highlight update after timing offset failed:", error);
    }

    syncPastWordsForCurrentTime(subtitleCurrentTime, reason);
    lastPastWordsVideoTime = subtitleCurrentTime;
    lyricsChordsSyncInterval?.schedule?.();
  }

  window.ycRefreshLyricsChordsTimingOffset = refreshLyricsChordsTimingOffsetNow;

  if (!window.__ycLyricsChordsTimingOffsetListenerBound) {
    window.__ycLyricsChordsTimingOffsetListenerBound = true;
    window.addEventListener("yc:subtitleTimingOffsetChanged", (e) => {
      if (!window.lyricsChordsPanelActive) return;

      const currentVideoId = window.ycUtils?.extractVideoId
        ? window.ycUtils.extractVideoId(window.location.href)
        : new URLSearchParams(location.search).get("v");
      const eventVideoId = e?.detail?.videoId;
      if (eventVideoId && currentVideoId && eventVideoId !== currentVideoId) return;

      window.ycRefreshLyricsChordsTimingOffset?.("offset-slider");
    });
  }

  window.ycRefreshLyricsChordsPastWords = function (enabled = window.lyricsChordsPastWordsEnabled) {
    window.lyricsChordsPastWordsEnabled = enabled;

    if (!enabled) {
      const video = document.querySelector("video");
      syncPastWordsForCurrentTime(getAdjustedSubtitleTime(video?.currentTime || 0));
      return;
    }

    schedulePastWordsSyncAfterRender(0);
  };

  // 🎯 Past Words: פונקציה לסנכרון מילים עבר בעת קפיצה בזמן
  function syncPastWordsOnSeek(currentTime, previousTime) {
    if (!window.lyricsChordsPastWordsEnabled) {
      syncPastWordsForCurrentTime(currentTime);
      return;
    }
    if (!cachedWordElements || cachedWordElements.length === 0) {
      ensureElementsCached();
    }
    if (!cachedWordElements || cachedWordElements.length === 0) return;

    const timeDiff = currentTime - previousTime;

    if (Math.abs(timeDiff) > 0.5) {
      syncPastWordsForCurrentTime(
        currentTime,
        timeDiff > 0 ? "seek-forward" : "seek-back"
      );

      if (timeDiff < -0.5) {
        lastActiveWordIndex = -1;
      }
    }
  }

  // Binary Search אמיתי למציאת המילה הפעילה
  function findActiveWordIndex(currentTime) {
    if (!cachedWordElements || cachedWordElements.length === 0) return -1;

    // אופטימיזציה: בדיקה קודם אם המילה הקודמת עדיין פעילה
    if (
      lastActiveWordIndex >= 0 &&
      lastActiveWordIndex < cachedWordElements.length
    ) {
      const wordEl = cachedWordElements[lastActiveWordIndex];
      const startTime = parseFloat(wordEl.dataset.time);
      const endTime = parseFloat(wordEl.dataset.end);

      if (currentTime >= startTime && currentTime <= endTime) {
        return lastActiveWordIndex; // אותה מילה עדיין פעילה
      }
    }

    // Binary Search אמיתי
    highlightStats.binarySearches++;
    let left = 0;
    let right = cachedWordElements.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const wordEl = cachedWordElements[mid];
      const startTime = parseFloat(wordEl.dataset.time);
      const endTime = parseFloat(wordEl.dataset.end);

      if (currentTime >= startTime && currentTime <= endTime) {
        return mid; // מצאנו את המילה הפעילה
      } else if (currentTime < startTime) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return -1; // לא נמצאה מילה פעילה
  }

  // Binary Search אמיתי למציאת האקורד הפעיל
  function findActiveChordIndex(currentTime) {
    if (!cachedChordElements || cachedChordElements.length === 0) return -1;

    // אופטימיזציה: בדיקה קודם אם האקורד הקודם עדיין פעיל
    if (
      lastActiveChordIndex >= 0 &&
      lastActiveChordIndex < cachedChordElements.length
    ) {
      const chordEl = cachedChordElements[lastActiveChordIndex];
      const chordTime = parseFloat(chordEl.dataset.time);

      // בדיקה אם האקורד עדיין פעיל (לא עבר לאקורד הבא)
      const nextChordIndex = lastActiveChordIndex + 1;
      const nextChordTime =
        nextChordIndex < cachedChordElements.length
          ? parseFloat(cachedChordElements[nextChordIndex].dataset.time)
          : Infinity;

      if (chordTime <= currentTime && currentTime < nextChordTime) {
        return lastActiveChordIndex; // אותו אקורד עדיין פעיל
      }
    }

    // Binary Search אמיתי - מחפש את האקורד האחרון שהזמן שלו <= currentTime
    highlightStats.binarySearches++;
    let left = 0;
    let right = cachedChordElements.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const chordEl = cachedChordElements[mid];
      const chordTime = parseFloat(chordEl.dataset.time);

      if (chordTime <= currentTime) {
        result = mid; // אקורד פוטנציאלי פעיל
        left = mid + 1; // מחפש אקורד מאוחר יותר
      } else {
        right = mid - 1;
      }
    }

    return result;
  }

  // עדכון חלקי של הדגשת מילים
  function updateWordHighlight(newActiveIndex, oldActiveIndex) {
    // הסרת הדגשה מהמילה הקודמת
    if (oldActiveIndex >= 0 && oldActiveIndex < cachedWordElements.length) {
      cachedWordElements[oldActiveIndex].classList.remove("active");
      // 🎯 הסרת word-active מה-container
      const oldContainer = cachedWordElements[oldActiveIndex].closest('.word-chord-container');
      if (oldContainer) {
        oldContainer.classList.remove("word-active");
      }
    }

    // הוספת הדגשה למילה החדשה
    if (newActiveIndex >= 0 && newActiveIndex < cachedWordElements.length) {
      cachedWordElements[newActiveIndex].classList.add("active");
      // 🎯 הוספת word-active ל-container
      const newContainer = cachedWordElements[newActiveIndex].closest('.word-chord-container');
      if (newContainer) {
        newContainer.classList.add("word-active");
      }
    }
  }

  // עדכון חלקי של הדגשת אקורדים
  function updateChordHighlight(newActiveIndex, oldActiveIndex) {
    // הסרת הדגשה מהאקורד הקודם
    if (oldActiveIndex >= 0 && oldActiveIndex < cachedChordElements.length) {
      cachedChordElements[oldActiveIndex].classList.remove("active");
    }

    // הוספת הדגשה לאקורד החדש
    if (newActiveIndex >= 0 && newActiveIndex < cachedChordElements.length) {
      cachedChordElements[newActiveIndex].classList.add("active");
    }
  }

  // פונקציות משופרות לחיפוש בינארי ועדכון הדגשה

  // 🔧 חיפוש מילה פעילה באמצעות זמנים מדויקים ייעודיים של הפאנל
  // ואז מציאת ה-DOM element המתאים
  function findActiveWordIndexOptimized(currentTime) {
    if (!cachedWordElements || cachedWordElements.length === 0) return -1;

    // שימוש בזמנים מדויקים של הפאנל בלבד (ללא תלות בקרוסלה)
    const accurateWords = getPanelWordTimings();

    if (accurateWords.length === 0) {
      return -1; // אין זמנים מדויקים - לא ניתן להדגיש
    }

    // חיפוש המילה הפעילה בזמנים המדויקים
    let activeWordText = null;
    let activeWordStartTime = null;

    for (let i = 0; i < accurateWords.length; i++) {
      const word = accurateWords[i];
      if (currentTime >= word.startTime && currentTime <= word.endTime) {
        activeWordText = word.text;
        activeWordStartTime = word.startTime;
        break;
      }
    }

    // אם לא מצאנו מילה פעילה בזמנים המדויקים
    if (activeWordText === null) {
      return -1;
    }

    // חיפוש ה-DOM element עם הטקסט והזמן הקרוב ביותר
    for (let i = 0; i < cachedWordElements.length; i++) {
      const wordEl = cachedWordElements[i];
      const elTime = parseFloat(wordEl.dataset.time);
      const elText = wordEl.textContent.trim();

      // התאמה לפי טקסט וזמן קרוב (tolerance של 0.5 שניות)
      const textMatch =
        elText.toLowerCase().replace(/[.,!?;:'"]/g, "") ===
        activeWordText.toLowerCase().replace(/[.,!?;:'"]/g, "");
      const timeClose = Math.abs(elTime - activeWordStartTime) < 0.5;

      if (textMatch && timeClose) {
        return i;
      }
    }

    // אם לא מצאנו התאמה מדויקת, חפש רק לפי זמן קרוב
    let closestIndex = -1;
    let closestDiff = Infinity;
    for (let i = 0; i < cachedWordElements.length; i++) {
      const elTime = parseFloat(cachedWordElements[i].dataset.time);
      const diff = Math.abs(elTime - activeWordStartTime);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = i;
      }
    }

    if (closestDiff < 1.0) {
      return closestIndex;
    }

    return -1; // לא נמצאה מילה פעילה
  }

  // Binary Search משופר למציאת האקורד הפעיל
  function findActiveChordIndexOptimized(currentTime) {
    if (!cachedChordElements || cachedChordElements.length === 0) return -1;

    // אופטימיזציה 1: בדיקה מורחבת של האקורד הקודם והסמוכים
    if (
      lastActiveChordIndex >= 0 &&
      lastActiveChordIndex < cachedChordElements.length
    ) {
      const currentChordEl = cachedChordElements[lastActiveChordIndex];
      const currentChordTime = parseFloat(currentChordEl.dataset.time);

      // בדיקה אם האקורד עדיין פעיל
      const nextChordIndex = lastActiveChordIndex + 1;
      const nextChordTime =
        nextChordIndex < cachedChordElements.length
          ? parseFloat(cachedChordElements[nextChordIndex].dataset.time)
          : Infinity;

      if (currentChordTime <= currentTime && currentTime < nextChordTime) {
        return lastActiveChordIndex; // אותו אקורד עדיין פעיל
      }

      // בדיקת האקורד הבא (אופטימיזציה לניגון רציף)
      if (nextChordIndex < cachedChordElements.length) {
        const nextNextChordIndex = nextChordIndex + 1;
        const nextNextChordTime =
          nextNextChordIndex < cachedChordElements.length
            ? parseFloat(cachedChordElements[nextNextChordIndex].dataset.time)
            : Infinity;

        if (nextChordTime <= currentTime && currentTime < nextNextChordTime) {
          return nextChordIndex;
        }
      }
    }

    // Binary Search משופר - מחפש את האקורד האחרון שהזמן שלו <= currentTime
    highlightStats.binarySearches++;

    let left = 0;
    let right = cachedChordElements.length - 1;
    let result = -1;

    // אופטימיזציה: התחלה מהאקורד הקודם אם אפשר
    if (
      lastActiveChordIndex >= 0 &&
      lastActiveChordIndex < cachedChordElements.length
    ) {
      const lastChordTime = parseFloat(
        cachedChordElements[lastActiveChordIndex].dataset.time
      );
      if (currentTime >= lastChordTime) {
        left = lastActiveChordIndex; // התחל מהאקורד הקודם
        result = lastActiveChordIndex; // שמירת תוצאה בסיסית
      } else {
        right = lastActiveChordIndex; // התחל מהתחלה עד האקורד הקודם
      }
    }

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const chordEl = cachedChordElements[mid];
      const chordTime = parseFloat(chordEl.dataset.time);

      if (chordTime <= currentTime) {
        result = mid; // אקורד פוטנציאלי פעיל
        left = mid + 1; // מחפש אקורד מאוחר יותר
      } else {
        right = mid - 1;
      }
    }

    return result;
  }

  function normalizeSentenceToken(text) {
    return (text || "")
      .replace(/[^\w\s\u0590-\u05FF\u0600-\u06FF]/g, "")
      .toLowerCase()
      .trim();
  }

  function getSentenceMappingScope() {
    return (
      lyricsChordsPanelElement?.querySelector(".lyrics-chords-content") ||
      lyricsChordsPanelElement ||
      document
    );
  }

  function getPanelWordElementsForSentenceMap() {
    const scope = getSentenceMappingScope();
    return Array.from(
      scope.querySelectorAll(".lyrics-word[data-time]:not(.chord-gap-spacer)")
    );
  }

  function buildSentenceWordElementsMap() {
    const parsedSentences = window.ycParsedSentences;
    if (!Array.isArray(parsedSentences) || parsedSentences.length === 0) {
      return null;
    }

    const allWordElements = getPanelWordElementsForSentenceMap();
    if (allWordElements.length === 0) {
      return null;
    }

    const firstText = normalizeSentenceToken(allWordElements[0]?.textContent);
    const lastText = normalizeSentenceToken(
      allWordElements[allWordElements.length - 1]?.textContent
    );
    const firstTime = allWordElements[0]?.dataset?.time || "";
    const lastTime =
      allWordElements[allWordElements.length - 1]?.dataset?.time || "";
    const firstSentence = parsedSentences[0] || {};
    const lastSentence = parsedSentences[parsedSentences.length - 1] || {};
    const mapKey = `${parsedSentences.length}|${allWordElements.length}|${firstText}|${lastText}|${firstTime}|${lastTime}|${normalizeSentenceToken(
      firstSentence.text
    )}|${firstSentence.startTime ?? ""}|${normalizeSentenceToken(
      lastSentence.text
    )}|${lastSentence.endTime ?? ""}`;

    if (sentenceWordElementsMap && sentenceWordElementsMapKey === mapKey) {
      return sentenceWordElementsMap;
    }

    const sentenceTokens = [];
    parsedSentences.forEach((sentence, sentenceIndex) => {
      if (!Array.isArray(sentence.words)) return;
      sentence.words.forEach((word) => {
        const normalized = normalizeSentenceToken(word);
        if (normalized) {
          sentenceTokens.push({ token: normalized, sentenceIndex });
        }
      });
    });

    if (sentenceTokens.length === 0) {
      sentenceWordElementsMap = null;
      sentenceWordElementsMapKey = "";
      return null;
    }

    const map = Array.from({ length: parsedSentences.length }, () => []);
    let tokenCursor = 0;
    let lastAssignedSentenceIndex = -1;
    const lookaheadWindow = 140;

    const findSentenceByTime = (timeValue) => {
      if (!Number.isFinite(timeValue)) return -1;

      for (let i = 0; i < parsedSentences.length; i++) {
        const sentence = parsedSentences[i];
        if (timeValue >= sentence.startTime && timeValue <= sentence.endTime) {
          return i;
        }
      }

      const tolerance = 0.9;
      for (let i = 0; i < parsedSentences.length; i++) {
        const sentence = parsedSentences[i];
        if (
          timeValue >= sentence.startTime - tolerance &&
          timeValue <= sentence.endTime + tolerance
        ) {
          return i;
        }
      }

      return -1;
    };

    allWordElements.forEach((el) => {
      const tokens = normalizeSentenceToken(el.textContent)
        .split(/\s+/)
        .filter(Boolean);

      let matchedSentenceIndex = -1;

      for (let t = 0; t < tokens.length; t++) {
        const token = tokens[t];
        let foundIndex = -1;
        const upperBound = Math.min(
          sentenceTokens.length - 1,
          tokenCursor + lookaheadWindow
        );

        for (let i = tokenCursor; i <= upperBound; i++) {
          if (sentenceTokens[i].token === token) {
            foundIndex = i;
            break;
          }
        }

        if (foundIndex !== -1) {
          matchedSentenceIndex = sentenceTokens[foundIndex].sentenceIndex;
          tokenCursor = foundIndex + 1;
        }
      }

      if (matchedSentenceIndex === -1) {
        const wordTime = parseFloat(el.dataset.time);
        matchedSentenceIndex = findSentenceByTime(wordTime);
      }

      if (matchedSentenceIndex === -1) {
        matchedSentenceIndex = lastAssignedSentenceIndex;
      }

      if (matchedSentenceIndex >= 0 && matchedSentenceIndex < map.length) {
        map[matchedSentenceIndex].push(el);
        el.dataset.sourceSentenceIndex = String(matchedSentenceIndex);
        lastAssignedSentenceIndex = matchedSentenceIndex;
      } else {
        delete el.dataset.sourceSentenceIndex;
      }
    });

    sentenceWordElementsMap = map;
    sentenceWordElementsMapKey = mapKey;

    return sentenceWordElementsMap;
  }

  function getMappedWordsForSentence(sentenceIndex) {
    if (!Number.isInteger(sentenceIndex) || sentenceIndex < 0) return [];

    const map = buildSentenceWordElementsMap();
    if (!Array.isArray(map) || !Array.isArray(map[sentenceIndex])) return [];

    return map[sentenceIndex];
  }

  // 🎯 הדגשה ברמת משפט - כשאין word-level subtitles
  function updateSentenceLevelHighlight(currentTime) {
    if (!window.ycParsedSentences || window.ycParsedSentences.length === 0) return;

    // מצא את המשפט הפעיל לפי זמן
    let activeSentenceIndex = -1;
    for (let i = 0; i < window.ycParsedSentences.length; i++) {
      const sentence = window.ycParsedSentences[i];
      if (currentTime >= sentence.startTime && currentTime <= sentence.endTime) {
        activeSentenceIndex = i;
        break;
      }
    }

    // אם אין שינוי - לא צריך לעדכן
    if (activeSentenceIndex === lastActiveSentenceIndex) return;

    // 🔍 DEBUG: הדפס את המשפט הפעיל
    if (activeSentenceIndex >= 0) {
      const s = window.ycParsedSentences[activeSentenceIndex];
      console.log(`[SentenceHighlight] 🎯 Active sentence #${activeSentenceIndex}: "${s.text}" (${s.startTime.toFixed(2)}s - ${s.endTime.toFixed(2)}s)`);
      console.log(`[SentenceHighlight] 🔤 Words:`, s.words);
    }

    // הסרת הדגשה מהמילים הקודמות
    lastHighlightedWordElements.forEach(el => {
      if (el) {
        el.classList.remove("active");
        // 🎯 הסרת word-active מה-container
        const container = el.closest('.word-chord-container');
        if (container) container.classList.remove("word-active");
        applyPastWordClassForElement(el, currentTime);
      }
    });
    lastHighlightedWordElements = [];

    // אם אין משפט פעיל - סיימנו
    if (activeSentenceIndex === -1) {
      lastActiveSentenceIndex = -1;
      return;
    }

    // Strict mode: highlight only by deterministic mapping to original sentence index.
    const matchedElements = getMappedWordsForSentence(activeSentenceIndex);

    // הדגש את כל המילים שנמצאו
    matchedElements.forEach(el => {
      el.classList.add("active");
      // 🎯 הוספת word-active ל-container
      const container = el.closest('.word-chord-container');
      if (container) {
        container.classList.add("word-active");
      }
      el.classList.remove("past-word");
    });

    lastHighlightedWordElements = matchedElements;
    lastActiveSentenceIndex = activeSentenceIndex;
    highlightStats.wordUpdates++;
  }

  // 🎯 מציאת מילים בפאנל שמתאימות למשפט
  function findWordsMatchingSentence(sentence) {
    if (!sentence || !sentence.words || sentence.words.length === 0) return [];

    // קבל את כל המילים בפאנל (ללא רווחי chord-gap ריקים)
    const scope =
      lyricsChordsPanelElement?.querySelector(".lyrics-chords-content") ||
      lyricsChordsPanelElement ||
      document;
    const allWordElements = Array.from(
      scope.querySelectorAll(".lyrics-word[data-time]:not(.chord-gap-spacer)")
    );
    if (allWordElements.length === 0) return [];

    // Try carousel-like timing first: sentence window decides the active words.
    const byTime = allWordElements.filter((el) => {
      const wordStart = parseFloat(el.dataset.time);
      const wordEndRaw = parseFloat(el.dataset.end);
      const wordEnd = Number.isNaN(wordEndRaw) ? wordStart : wordEndRaw;
      return (
        !Number.isNaN(wordStart) &&
        !Number.isNaN(wordEnd) &&
        wordEnd >= sentence.startTime &&
        wordStart <= sentence.endTime
      );
    });

    if (byTime.length > 0) return byTime;

    // Match like carousel, but only in local time window around active sentence.
    const timeWindow = 2.0;
    const candidates = allWordElements.filter((el) => {
      const wordTime = parseFloat(el.dataset.time);
      return !Number.isNaN(wordTime) && Math.abs(wordTime - sentence.startTime) <= timeWindow;
    });

    const localElements = candidates.length > 0 ? candidates : allWordElements;
    const bubbleWords = localElements.map((el) => {
      const cleanWord = (el.textContent || "")
        .replace(/[^\w\s\u0590-\u05FF\u0600-\u06FF]/g, "")
        .toLowerCase()
        .trim();
      return {
        el,
        cleanWord,
        startTime: parseFloat(el.dataset.time),
      };
    });

    const sentenceWords = sentence.words;
    const tolerance = 3;

    for (let startIdx = 0; startIdx < bubbleWords.length; startIdx++) {
      const firstWord = bubbleWords[startIdx];
      if (Number.isNaN(firstWord.startTime)) continue;
      if (Math.abs(firstWord.startTime - sentence.startTime) > tolerance) continue;

      let matchCount = 0;
      const matchedElements = [];

      for (let i = 0; i < sentenceWords.length && (startIdx + i) < bubbleWords.length; i++) {
        if (bubbleWords[startIdx + i].cleanWord === sentenceWords[i]) {
          matchCount++;
          matchedElements.push(bubbleWords[startIdx + i].el);
        } else {
          break;
        }
      }

      if (matchCount >= Math.ceil(sentenceWords.length * 0.5)) {
        return matchedElements;
      }
    }

    // Last fallback: closest single word.
    let closestElement = null;
    let minDistance = Infinity;
    localElements.forEach((el) => {
      const wordTime = parseFloat(el.dataset.time);
      if (Number.isNaN(wordTime)) return;
      const distance = Math.abs(wordTime - sentence.startTime);
      if (distance < minDistance) {
        minDistance = distance;
        closestElement = el;
      }
    });

    return closestElement ? [closestElement] : [];
  }

  // עדכון מאופטמז של הדגשת מילים
  function updateWordHighlightOptimized(newActiveIndex, oldActiveIndex, currentTime) {
    // אופטימיזציה: בדיקה מוקדמת אם יש שינוי
    if (newActiveIndex === oldActiveIndex) return;

    // הסרת הדגשה מהמילה הקודמת - עם בדיקת קיום
    if (oldActiveIndex >= 0 && oldActiveIndex < cachedWordElements.length) {
      const oldElement = cachedWordElements[oldActiveIndex];
      if (oldElement && oldElement.classList.contains("active")) {
        oldElement.classList.remove("active");

        // 🎯 Past Words: הוספת class למילה שעברה (אם הפיצ'ר מופעל)
        applyPastWordClassForElement(oldElement, currentTime);
      }
    }

    // הוספת הדגשה למילה החדשה - עם בדיקת קיום
    if (newActiveIndex >= 0 && newActiveIndex < cachedWordElements.length) {
      const newElement = cachedWordElements[newActiveIndex];
      if (newElement && !newElement.classList.contains("active")) {
        newElement.classList.add("active");
        // הסרת past-word מהמילה הנוכחית (אם קיים)
        newElement.classList.remove("past-word");
      }

      // 🎯 Past Words Fix: סמן גם מילים קצרות שדילגנו עליהן
      // מילים שהזמן שלהן < הזמן של המילה הנוכחית ועדיין לא סומנו
      if (
        window.lyricsChordsPastWordsEnabled &&
        newActiveIndex > 0
      ) {
        const currentWordTime = parseFloat(newElement.dataset.time);
        for (let i = 0; i < newActiveIndex; i++) {
          const wordEl = cachedWordElements[i];
          if (!wordEl.classList.contains("past-word") && !wordEl.classList.contains("active")) {
            const wordTime = parseFloat(wordEl.dataset.time);
            if (wordTime < currentWordTime) {
              wordEl.classList.add("past-word");
            }
          }
        }
      }
    }
  }

  // עדכון מאופטמז של הדגשת אקורדים
  function updateChordHighlightOptimized(newActiveIndex, oldActiveIndex) {
    // אופטימיזציה: בדיקה מוקדמת אם יש שינוי
    if (newActiveIndex === oldActiveIndex) return;

    // הסרת הדגשה מהאקורד הקודם - עם בדיקת קיום
    if (oldActiveIndex >= 0 && oldActiveIndex < cachedChordElements.length) {
      const oldElement = cachedChordElements[oldActiveIndex];
      if (oldElement && oldElement.classList.contains("active")) {
        oldElement.classList.remove("active");
      }
    }

    // הוספת הדגשה לאקורד החדש - עם בדיקת קיום
    if (newActiveIndex >= 0 && newActiveIndex < cachedChordElements.length) {
      const newElement = cachedChordElements[newActiveIndex];
      if (newElement && !newElement.classList.contains("active")) {
        newElement.classList.add("active");

        // 🆕 Dispatch chord changed event for preview panel
        const chordName = newElement.dataset.chordName;
        const chordTime = newElement.dataset.time;

        DEBUG &&
          console.log(
            `📤 [DEBUG] Dispatching chord change: name="${chordName}", time=${chordTime}, has time? ${chordTime !== undefined
            }`
          );

        if (chordName && chordTime) {
          window.dispatchEvent(
            new CustomEvent("yc:chordChanged", {
              detail: { chordName, time: parseFloat(chordTime) },
            })
          );
          DEBUG &&
            console.log(
              `[LyricsChords] 🎵 Dispatched chord change: ${chordName} at ${chordTime}s`
            );
        }
      }
    }
  }

  /*------------------------------------------------------------
  15. מערכת Word Click - קפיצה לזמן מילה בסרטון
------------------------------------------------------------*/

  // פונקציה לטיפול בלחיצה על מילה
  function handleWordClick(event, wordElement) {
    try {
      const timeValue = wordElement.getAttribute("data-time");

      // Debug: בדיקה אם יש data-time
      if (!timeValue) {
        console.warn(
          "[WordClick] ERROR: לא מצאתי data-time למילה:",
          wordElement.textContent
        );
        return;
      }

      const timeInSeconds = parseFloat(timeValue);

      // Debug: בדיקה אם הזמן תקין
      if (isNaN(timeInSeconds)) {
        console.warn(
          "[WordClick] ERROR: זמן לא תקין:",
          timeValue,
          "למילה:",
          wordElement.textContent
        );
        return;
      }

      // מציאת הסרטון של יוטיוב
      const video = document.querySelector("video");

      // Debug: בדיקה אם מצאנו את הסרטון
      if (!video) {
        console.warn("[WordClick] ERROR: לא מצאתי את הסרטון של יוטיוב");
        return;
      }

      // Debug: מידע על הסרטון
      console.log("[WordClick] מצאתי סרטון:", {
        duration: video.duration,
        currentTime: video.currentTime,
        readyState: video.readyState,
      });

      // בדיקה שהסרטון מוכן
      if (video.readyState < 2) {
        console.warn(
          "[WordClick] ERROR: הסרטון לא מוכן עדיין (readyState:",
          video.readyState,
          ")"
        );
        return;
      }

      // שמירת הזמן הישן לdebug
      const oldTime = video.currentTime;

      // עדכון זמן הסרטון
      video.currentTime = timeInSeconds;

      // Debug: אישור העדכון
      console.log("[WordClick] ✓ נלחצה מילה:", wordElement.textContent);
      console.log(
        "[WordClick] ✓ עדכנתי זמן סרטון מ-",
        oldTime.toFixed(2),
        "ל-",
        timeInSeconds.toFixed(2)
      );

      // אפקט ויזואלי עדין
      addWordClickEffect(wordElement);
    } catch (error) {
      console.error("[WordClick] ERROR בטיפול בלחיצה על מילה:", error);
    }
  }

  // פונקציה לטיפול בלחיצה על אקורד
  function handleChordClick(event, chordElement) {
    try {
      const timeValue = chordElement.getAttribute("data-time");

      // בדיקה אם יש data-time
      if (!timeValue) {
        console.warn(
          "[ChordClick] ERROR: לא מצאתי data-time לאקורד:",
          chordElement.textContent
        );
        return;
      }

      const timeInSeconds = parseFloat(timeValue);

      // בדיקה אם הזמן תקין
      if (isNaN(timeInSeconds)) {
        console.warn(
          "[ChordClick] ERROR: זמן לא תקין:",
          timeValue,
          "לאקורד:",
          chordElement.textContent
        );
        return;
      }

      // מציאת הסרטון של יוטיוב
      const video = document.querySelector("video");

      // בדיקה אם מצאנו את הסרטון
      if (!video) {
        console.warn("[ChordClick] ERROR: לא מצאתי את הסרטון של יוטיוב");
        return;
      }

      // בדיקה שהסרטון מוכן
      if (video.readyState < 2) {
        console.warn(
          "[ChordClick] ERROR: הסרטון לא מוכן עדיין (readyState:",
          video.readyState,
          ")"
        );
        return;
      }

      // שמירת הזמן הישן לdebug
      const oldTime = video.currentTime;

      // עדכון זמן הסרטון
      video.currentTime = timeInSeconds;

      console.log(
        `[ChordClick] ✓ קפיצה לאקורד "${chordElement.textContent
        }" בזמן ${timeInSeconds.toFixed(2)}s (היה: ${oldTime.toFixed(2)}s)`
      );
    } catch (error) {
      console.error("[ChordClick] ERROR בטיפול בלחיצה על אקורד:", error);
    }
  }

  // פונקציה לטיפול בלחיצה על תווית אינסטרומנטלית (Intro/Instrumental/Outro)
  function handleInstrumentalLabelClick(event, labelElement) {
    try {
      const timeValue = labelElement.getAttribute("data-start");

      // בדיקה אם יש data-start
      if (!timeValue) {
        console.warn(
          "[InstrumentalClick] ERROR: לא מצאתי data-start לתווית:",
          labelElement.textContent
        );
        return;
      }

      const timeInSeconds = parseFloat(timeValue);

      // בדיקה אם הזמן תקין
      if (isNaN(timeInSeconds)) {
        console.warn(
          "[InstrumentalClick] ERROR: זמן לא תקין:",
          timeValue,
          "לתווית:",
          labelElement.textContent
        );
        return;
      }

      // מציאת הסרטון של יוטיוב
      const video = document.querySelector("video");

      // בדיקה אם מצאנו את הסרטון
      if (!video) {
        console.warn("[InstrumentalClick] ERROR: לא מצאתי את הסרטון של יוטיוב");
        return;
      }

      // בדיקה שהסרטון מוכן
      if (video.readyState < 2) {
        console.warn(
          "[InstrumentalClick] ERROR: הסרטון לא מוכן עדיין (readyState:",
          video.readyState,
          ")"
        );
        return;
      }

      // 🔧 ניקוי כל אלמנטי הספירה הקיימים לפני שינוי הזמן
      // זה מונע מצב של ספירות כפולות כשקופצים בין קטעים
      const existingCountdowns = document.querySelectorAll(".countdown-number");
      if (existingCountdowns.length > 0) {
        console.log(`[InstrumentalClick] מנקה ${existingCountdowns.length} ספירות קיימות`);
        existingCountdowns.forEach(el => el.remove());
      }

      // שמירת הזמן הישן לdebug
      const oldTime = video.currentTime;

      // עדכון זמן הסרטון
      video.currentTime = timeInSeconds;

      console.log(
        `[InstrumentalClick] ✓ קפיצה ל-"${labelElement.textContent
        }" בזמן ${timeInSeconds.toFixed(2)}s (היה: ${oldTime.toFixed(2)}s)`
      );

      // אפקט ויזואלי עדין
      addWordClickEffect(labelElement);
    } catch (error) {
      console.error("[InstrumentalClick] ERROR בטיפול בלחיצה על תווית:", error);
    }
  }

  // פונקציה לאפקט ויזואלי עדין
  function addWordClickEffect(wordElement) {
    try {
      // הוספת class לאפקט
      wordElement.classList.add("word-clicked");

      // הסרת האפקט אחרי 200ms
      setTimeout(() => {
        if (wordElement && wordElement.classList) {
          wordElement.classList.remove("word-clicked");
        }
      }, 200);

      console.log(
        "[WordClick] ✓ הוספתי אפקט ויזואלי למילה:",
        wordElement.textContent
      );
    } catch (error) {
      console.error("[WordClick] ERROR באפקט ויזואלי:", error);
    }
  }

  // פונקציה להוספת מאזיני לחיצה למילים
  function addWordClickListeners() {
    try {
      if (!lyricsChordsPanelElement) {
        console.warn("[WordClick] פאנל לא קיים");
        return;
      }

      const content = lyricsChordsPanelElement.querySelector(
        ".lyrics-chords-content"
      );
      if (!content) {
        console.warn("[WordClick] לא מצאתי content של הפאנל");
        return;
      }

      // בדיקה אם כבר יש Event Delegation למניעת כפילויות
      if (content.hasAttribute("data-word-delegation-added")) {
        console.log("[🚀 WordClick] Event Delegation כבר קיים - מדלג");
        return;
      }

      // מציאת כל המילים לספירה בלבד
      const words = content.querySelectorAll(".lyrics-word[data-time]");
      console.log(
        `[🚀 WordClick] Event Delegation ל-${words.length} מילים (חיסכון: ${words.length - 1
        } listeners)`
      );

      // יצירת listener יחיד עם Event Delegation למילים, אקורדים ותוויות אינסטרומנטליות
      const delegatedClickListener = (event) => {
        // חיפוש המילה הקרובה ביותר
        const wordElement = event.target.closest(".lyrics-word[data-time]");
        if (wordElement) {
          event.preventDefault();
          event.stopPropagation();
          handleWordClick(event, wordElement);
          return;
        }

        // חיפוש האקורד הקרוב ביותר
        const chordElement = event.target.closest(".lyrics-chord[data-time]");
        if (chordElement) {
          event.preventDefault();
          event.stopPropagation();
          handleChordClick(event, chordElement);
          return;
        }

        // חיפוש תווית אינסטרומנטלית (Intro/Instrumental/Outro)
        const instrumentalLabel = event.target.closest(".instrumental-label[data-start]");
        if (instrumentalLabel) {
          event.preventDefault();
          event.stopPropagation();
          handleInstrumentalLabelClick(event, instrumentalLabel);
          return;
        }
      };

      // הוספת listener יחיד ל-content
      content.addEventListener("click", delegatedClickListener);

      // סימון שהוספנו Event Delegation
      content.setAttribute("data-word-delegation-added", "true");
      content.setAttribute("data-chord-delegation-added", "true");

      // שמירה לניקוי עתידי - רק listener אחד!
      if (!window.lyricsChordsDelegatedListeners) {
        window.lyricsChordsDelegatedListeners = new Set();
      }

      window.lyricsChordsDelegatedListeners.add({
        element: content,
        listener: delegatedClickListener,
        type: "click",
        description: "word-and-chord-click-delegation",
      });

      // ספירת אקורדים לדיבוג
      const chords = content.querySelectorAll(".lyrics-chord[data-time]");
      console.log(
        `[🚀 WordClick] Event Delegation הוסף - 1 listener במקום ${words.length + chords.length
        } (${words.length} מילים + ${chords.length} אקורדים)`
      );
    } catch (error) {
      console.error("[WordClick] ERROR בהוספת מאזין לחיצה למילים:", error);
    }
  }

  // 🚀 פונקציית דיבוג לבדיקת מצב Event Delegation
  function checkEventDelegationStatus() {
    console.log("\n🚀 ===== מצב Event Delegation בפאנל Lyrics & Chords =====");

    if (!window.lyricsChordsDelegatedListeners) {
      console.log("❌ אין משתנה גלובלי lyricsChordsDelegatedListeners");
      return;
    }

    console.log(
      `✅ מספר Event Delegation listeners: ${window.lyricsChordsDelegatedListeners.size}`
    );

    let wordDelegationCount = 0;
    let chordDelegationCount = 0;

    window.lyricsChordsDelegatedListeners.forEach((listenerData) => {
      console.log(
        `  • ${listenerData.description || "unknown"} (${listenerData.type})`
      );
      if (
        listenerData.description &&
        listenerData.description.includes("word")
      ) {
        wordDelegationCount++;
      } else if (
        listenerData.description &&
        listenerData.description.includes("chord")
      ) {
        chordDelegationCount++;
      }
    });

    console.log(
      `📊 סיכום: ${wordDelegationCount} word delegation, ${chordDelegationCount} chord delegation`
    );

    // בדיקת אלמנטים בפאנל
    const content = document.querySelector(".lyrics-chords-content");
    if (content) {
      const hasWordDelegation = content.hasAttribute(
        "data-word-delegation-added"
      );
      const hasChordDelegation = content.hasAttribute(
        "data-chord-delegation-added"
      );
      console.log(
        `🏷️ סימוני DOM: word=${hasWordDelegation}, chord=${hasChordDelegation}`
      );

      const words = content.querySelectorAll(".lyrics-word[data-time]");
      const chords = content.querySelectorAll(".lyrics-chord");
      console.log(
        `📄 אלמנטים בפאנל: ${words.length} מילים, ${chords.length} אקורדים`
      );

      if (hasWordDelegation && words.length > 0) {
        console.log(
          `✅ חיסכון: 1 listener במקום ${words.length} listeners למילים`
        );
      }
    } else {
      console.log("❌ לא נמצא פאנל .lyrics-chords-content");
    }

    console.log("🚀 ================================================\n");
  }

  // הפיכת הפונקציה לגלובלית לדיבוג
  window.checkLyricsChordsEventDelegation = checkEventDelegationStatus;

  // פונקציה להסרת מאזין לחיצה למילים
  function removeWordClickListeners() {
    try {
      // בדיקה שהמשתנה קיים ומאותחל
      if (!wordClickListeners || !window.wordClickListeners) {
        console.log("[WordClick] wordClickListeners לא מאותחל - מדלג");
        return;
      }

      // וידוא שאנחנו עובדים עם אותו אובייקט
      wordClickListeners = window.wordClickListeners;

      console.log(
        "[WordClick] מנקה",
        wordClickListeners.size,
        "listeners למילים"
      );

      // בדיקה שזה Set עם forEach
      if (typeof wordClickListeners.forEach === "function") {
        wordClickListeners.forEach((listenerData) => {
          try {
            const { element, listener } = listenerData;
            if (element && listener) {
              element.removeEventListener("click", listener);
              element.removeAttribute("data-word-click-added");
            }
          } catch (error) {
            console.warn("[WordClick] שגיאה בניקוי listener יחיד:", error);
          }
        });

        wordClickListeners.clear();
        console.log("[WordClick] ✓ ניקיתי את כל ה-listeners למילים");
      } else {
        console.warn(
          "[WordClick] wordClickListeners אינו Set תקין - לא יכול לנקות"
        );
      }
    } catch (error) {
      console.error("[WordClick] ERROR בניקוי listeners למילים:", error);
    }
  }

  /*------------------------------------------------------------
  16. מערכת Wheel Scroll - טיפול בגלילת גלגלת עכבר
------------------------------------------------------------*/

  // פונקציה לטיפול בגלילת גלגלת עכבר
  function handleWheelScroll(event) {
    try {
      // בדיקה שהסנכרון פעיל
      if (!syncWithYouTubeActive) {
        return;
      }

      // מציאת הסרטון
      const video = document.querySelector("video");
      if (!video) {
        console.warn("[WheelScroll] לא מצאתי את הסרטון");
        return;
      }

      // אם זו הגלילה הראשונה - שמירת מצב הסרטון
      if (!wheelScrollTimeout) {
        wasPlayingBeforeWheel = !video.paused;

        // אם הסרטון מנגן - עצירה זמנית
        if (wasPlayingBeforeWheel) {
          video.pause();
          console.log("[WheelScroll] התחלת גלילה - pause זמני");
        }
      }

      // ביטול טיימר קודם למניעת הצטברות
      if (wheelScrollTimeout) {
        clearSafeTimeout(wheelScrollTimeout, "wheelScroll-previous");
      }

      // טיימר לחזרה ל-play אחרי סיום הגלילה - שימוש במערכת הבטיחות
      wheelScrollTimeout = createSafeTimeout(
        () => {
          try {
            // חזרה ל-play אם הסרטון היה מנגן לפני הגלילה
            if (wasPlayingBeforeWheel && video.paused) {
              video.play();
              console.log("[WheelScroll] סיום גלילה - חזרה ל-play");
            }

            // איפוס משתנים
            wheelScrollTimeout = null;
            wasPlayingBeforeWheel = false;
          } catch (error) {
            console.error("[WheelScroll] ERROR בחזרה ל-play:", error);
          }
        },
        250,
        "wheelScroll"
      ); // 250ms אחרי גלילה אחרונה - מהיר יותר!
    } catch (error) {
      console.error("[WheelScroll] ERROR בטיפול בגלילה:", error);
    }
  }

  // פונקציה להוספת מאזין גלילת גלגלת
  function addWheelScrollListener() {
    try {
      if (!lyricsChordsPanelElement) {
        console.warn("[WheelScroll] פאנל לא קיים");
        return;
      }

      const content = lyricsChordsPanelElement.querySelector(
        ".lyrics-chords-content"
      );
      if (!content) {
        console.warn("[WheelScroll] לא מצאתי content של הפאנל");
        return;
      }

      // הסרת מאזין קיים לפני הוספת חדש
      removeWheelScrollListener();

      // יצירת מאזין חדש
      wheelScrollListener = (event) => handleWheelScroll(event);

      // הוספת מאזין
      content.addEventListener("wheel", wheelScrollListener, { passive: true });

      console.log("[WheelScroll] ✓ הוספתי מאזין גלילת גלגלת");
    } catch (error) {
      console.error("[WheelScroll] ERROR בהוספת מאזין גלילה:", error);
    }
  }

  // פונקציה להסרת מאזין גלילת גלגלת
  function removeWheelScrollListener() {
    try {
      if (wheelScrollListener && lyricsChordsPanelElement) {
        const content = lyricsChordsPanelElement.querySelector(
          ".lyrics-chords-content"
        );
        if (content) {
          content.removeEventListener("wheel", wheelScrollListener);
        }
      }

      wheelScrollListener = null;
      console.log("[WheelScroll] ✓ הסרתי מאזין גלילת גלגלת");
    } catch (error) {
      console.error("[WheelScroll] ERROR בהסרת מאזין גלילה:", error);
    }
  }

  // פונקציה לניקוי מלא של מערכת גלילת גלגלת
  function cleanupWheelScroll() {
    try {
      // ביטול טיימר פעיל
      if (wheelScrollTimeout) {
        clearTimeout(wheelScrollTimeout);
        wheelScrollTimeout = null;
        console.log("[WheelScroll] ✓ ביטלתי טיימר גלילה");
      }

      // הסרת מאזין
      removeWheelScrollListener();

      // איפוס משתנים
      wasPlayingBeforeWheel = false;

      console.log("[WheelScroll] ✓ ניקוי מלא הושלם");
    } catch (error) {
      console.error("[WheelScroll] ERROR בניקוי מערכת גלילה:", error);
    }
  }

  /*------------------------------------------------------------
  17. מערכת Chord Tooltips - הצגת דיאגרמות אקורדים ב-hover
------------------------------------------------------------*/

  // משתנים גלובליים למניעת דליפות זיכרון
  let chordTooltip = null;
  let tooltipTimeout = null;
  let tooltipAutoHideTimeout = null; // 🆕 timeout להסתרה אוטומטית אחרי 5 שניות
  let currentHoveredChord = null;
  let tooltipListeners = new Set(); // מעקב אחר כל המאזינים
  // איניציאליזציה בטוחה של wordClickListeners
  if (!window.wordClickListeners) {
    window.wordClickListeners = new Set();
  }
  let wordClickListeners = window.wordClickListeners; // מעקב אחר מאזיני לחיצה על מילים

  // המערכת הבטוחה של timeouts כבר מוגדרת למעלה בקובץ
  let wheelScrollTimeout = null; // טיימר לזיהוי סיום גלילת גלגלת
  let wasPlayingBeforeWheel = false; // זכירת מצב הסרטון לפני גלילה
  let wheelScrollListener = null; // מאזין גלילת גלגלת

  // 🆕 משתנים משותפים לניווט בין פוזיציות
  if (!window.currentChordPositions) {
    window.currentChordPositions = new Map(); // chordName -> current position index (משותף!)
  }
  const currentChordPositions = window.currentChordPositions; // רפרנס מקומי לנוחות

  let chordPositionData = new Map(); // chordName -> array of positions
  let PANEL_SUBSET = null; // SUBSET של אקורדים לפאנל (chords + modes)
  let PANEL_SUBSET_VIDEO_ID = null; // videoId של ה-SUBSET הנוכחי
  let panelChordPositionsLoadPromise = null;
  let panelChordPositionsSourceCache = null;
  let panelChordPositionsSourceCacheTimer = null;
  const PANEL_CHORD_POSITIONS_SOURCE_TTL_MS = 2 * 60 * 1000;
  const PANEL_CHORD_POSITIONS_CACHE_MAX = 600;
  const panelChordPositionsByNameCache = new Map();

  // Cache מקומי לאקורדים שבשימוש - מפחית גישות ל-PANEL_SUBSET
  let localChordCache = new Map();
  const MAX_CACHE_SIZE = 100; // מקסימום 100 אקורדים ב-cache

  // סטטיסטיקות cache
  let cacheStats = {
    hits: 0,
    misses: 0,
    loads: 0,
  };

  // 🆕 פונקציה לטעינת אקורד מ-PANEL_SUBSET
  function getCachedChordData(chordName) {
    const clean = chordName.replace(/\s+/g, "");

    // בדיקה ב-cache מקומי קודם
    if (localChordCache.has(clean)) {
      cacheStats.hits++;
      return localChordCache.get(clean);
    }

    // אם לא ב-cache, נחפש ב-PANEL_SUBSET
    if (PANEL_SUBSET && PANEL_SUBSET.chords && PANEL_SUBSET.chords[chordName]) {
      cacheStats.misses++;
      cacheStats.loads++;
      const chordData = PANEL_SUBSET.chords[chordName];

      // שמירה ב-cache עם הגבלת גודל
      if (localChordCache.size >= MAX_CACHE_SIZE) {
        // הסרת האקורד הראשון (הישן ביותר)
        const firstKey = localChordCache.keys().next().value;
        localChordCache.delete(firstKey);
      }

      localChordCache.set(clean, chordData);
      const hitRate = (
        (cacheStats.hits / (cacheStats.hits + cacheStats.misses)) *
        100
      ).toFixed(1);
      console.log(
        `[LyricsChords] 💾 Loaded from PANEL_SUBSET: ${chordName} (Hit Rate: ${hitRate}%)`
      );
      return chordData;
    }

    return null;
  }

  // פונקציה להצגת סטטיסטיקות cache
  function showCacheStats() {
    const total = cacheStats.hits + cacheStats.misses;
    const hitRate =
      total > 0 ? ((cacheStats.hits / total) * 100).toFixed(1) : 0;
    console.log(
      `[LyricsChords] 📊 Cache Stats: ${cacheStats.hits} hits, ${cacheStats.misses} misses, ${cacheStats.loads} loads | Hit Rate: ${hitRate}% | Cache Size: ${localChordCache.size}/${MAX_CACHE_SIZE}`
    );
  }

  // פונקציה משופרת להצגת סטטיסטיקות ביצועי הדגשה
  function showHighlightStats() {
    const total = highlightStats.totalCalls;
    if (total === 0) {
      console.log(
        `[LyricsChords] ⚡ Highlight Performance: לא בוצעו עדכונים עדיין`
      );
      return;
    }

    const skipRate = ((highlightStats.skippedCalls / total) * 100).toFixed(1);
    const throttleRate = (
      (highlightStats.throttledCalls / total) *
      100
    ).toFixed(1);
    const avgSearches = (highlightStats.binarySearches / total).toFixed(2);
    const cacheTotal = highlightStats.cacheHits + highlightStats.cacheMisses;
    const cacheHitRate =
      cacheTotal > 0
        ? ((highlightStats.cacheHits / cacheTotal) * 100).toFixed(1)
        : 0;
    const avgUpdateTime = highlightStats.avgUpdateTime.toFixed(2);

    console.log(`[LyricsChords] ⚡ Highlight Performance משופר:`);
    console.log(`  🔄 Total Calls: ${total}`);
    console.log(
      `  ⏭️ Skipped: ${highlightStats.skippedCalls} (${skipRate}% - חיסכון CPU!)`
    );
    console.log(
      `  🚦 Throttled: ${highlightStats.throttledCalls} (${throttleRate}% - מניעת עומס)`
    );
    console.log(`  🔤 Word Updates: ${highlightStats.wordUpdates}`);
    console.log(`  🎵 Chord Updates: ${highlightStats.chordUpdates}`);
    console.log(
      `  🔍 Binary Searches: ${highlightStats.binarySearches} (avg: ${avgSearches}/call)`
    );
    console.log(
      `  💾 Cache: ${highlightStats.cacheHits} hits, ${highlightStats.cacheMisses} misses (${cacheHitRate}% hit rate)`
    );
    console.log(
      `  ⏱️ Avg Update Time: ${avgUpdateTime}ms (max: ${highlightStats.maxUpdateTime.toFixed(
        2
      )}ms)`
    );
    console.log(`  🎯 Current Threshold: ${currentTimeThreshold.toFixed(3)}s`);

    // חישוב יעילות כללי
    const efficiency = (
      (parseFloat(skipRate) + parseFloat(throttleRate)) /
      2
    ).toFixed(1);
    console.log(`  📊 Overall Efficiency: ${efficiency}% (חיסכון בעיבוד)`);
  }

  // פונקציה לטעינה אוטומטית של chordRenderer
  async function ensureChordDependencies() {
    try {
      // טעינת chordRenderer אם לא קיים
      if (!window.chordRenderer?.renderChord) {
        const chordRendererUrl = chrome.runtime.getURL(
          "utils/chordRenderer.js"
        );
        const rendererModule = await import(chordRendererUrl);

        if (
          rendererModule &&
          rendererModule.default &&
          typeof rendererModule.default.renderChord === "function"
        ) {
          window.chordRenderer = rendererModule.default;
        } else if (
          rendererModule &&
          typeof rendererModule.renderChord === "function"
        ) {
          window.chordRenderer = rendererModule;
        } else if (
          window.chordRenderer &&
          typeof window.chordRenderer.renderChord === "function"
        ) {
          // chordRenderer כבר קיים ב-window - משתמש בו
        } else {
          throw new Error("ChordRenderer failed to initialize");
        }
      }

      return true;
    } catch (error) {
      console.warn("[LyricsChords] שגיאה בטעינת dependencies:", error);
      return false;
    }
  }

  // 🎯 חשיפה גלובלית כדי ש-content.js יוכל להשתמש בה
  window.ensureChordDependencies = ensureChordDependencies;

  // ═══════════════════════════════════════════════════════════════
  // 🎸 CAPO TRANSPOSITION FUNCTIONS
  // ═══════════════════════════════════════════════════════════════
  const CAPO_NOTES = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const FLAT_TO_SHARP = {
    Db: "C#",
    Eb: "D#",
    Gb: "F#",
    Ab: "G#",
    Bb: "A#",
  };

  function transposeNote(note, semitones) {
    const n = FLAT_TO_SHARP[note] || note;
    const idx = CAPO_NOTES.indexOf(n);
    if (idx === -1) return null;
    return CAPO_NOTES[(idx + semitones + 12) % 12];
  }

  function transposeChord(chordName, semitones) {
    if (!chordName || semitones === 0) return chordName;

    if (chordName.includes("/")) {
      const [base, bass] = chordName.split("/");
      const transposedBase = transposeChord(base, semitones);
      let bassNote;
      if (bass.length > 1 && (bass[1] === "#" || bass[1] === "b")) {
        bassNote = bass.slice(0, 2);
      } else {
        bassNote = bass[0];
      }
      const transposedBass = transposeNote(bassNote, semitones);
      if (!transposedBase || !transposedBass) return chordName;
      return `${transposedBase}/${transposedBass}`;
    }

    let root, quality;
    if (
      chordName.length > 1 &&
      (chordName[1] === "#" || chordName[1] === "b")
    ) {
      root = chordName.slice(0, 2);
      quality = chordName.slice(2);
    } else {
      root = chordName[0];
      quality = chordName.slice(1);
    }

    const newRoot = transposeNote(root, semitones);
    if (!newRoot) return chordName;
    return `${newRoot}${quality}`;
  }

  function buildCapoChords(uniqueChords) {
    const capoChords = {};
    for (let capo = 1; capo <= 12; capo++) {
      capoChords[capo] = {};
      const semitones = -capo;
      for (const chord of uniqueChords) {
        capoChords[capo][chord] = transposeChord(chord, semitones);
      }
    }
    return capoChords;
  }

  function hasObjectEntries(value) {
    return value && typeof value === "object" && Object.keys(value).length > 0;
  }

  function parseCompactChordPositionForPanel(value) {
    const [frets = "", fingers = "", barres = "", capo = ""] = String(value).split("|");
    return {
      frets,
      fingers,
      barres: barres || "",
      capo: capo === "1" ? "true" : "false",
    };
  }

  function parseJsonStringLiteral(rawValue) {
    try {
      return JSON.parse(`"${rawValue}"`);
    } catch {
      return rawValue;
    }
  }

  function parseCompactPositionBlock(block) {
    const positions = [];
    const valueRegex = /"((?:\\.|[^"\\])*)"/g;
    let match;
    while ((match = valueRegex.exec(block)) !== null) {
      positions.push(parseCompactChordPositionForPanel(parseJsonStringLiteral(match[1])));
    }
    return positions;
  }

  function collectChordNamesForPositions(uniqueChords, capoChords) {
    const names = new Set(uniqueChords);
    if (capoChords && typeof capoChords === "object") {
      Object.values(capoChords).forEach((capoMap) => {
        if (!capoMap || typeof capoMap !== "object") return;
        Object.values(capoMap).forEach((chordName) => {
          if (chordName && chordName !== "N") {
            names.add(chordName);
          }
        });
      });
    }
    return names;
  }

  function scheduleChordPositionsSourceRelease() {
    if (panelChordPositionsSourceCacheTimer) {
      clearTimeout(panelChordPositionsSourceCacheTimer);
    }
    panelChordPositionsSourceCacheTimer = setTimeout(() => {
      panelChordPositionsSourceCache = null;
      panelChordPositionsSourceCacheTimer = null;
      console.log("[LyricsChords] 🧹 Released cached chord positions source after idle TTL");
    }, PANEL_CHORD_POSITIONS_SOURCE_TTL_MS);
  }

  async function getChordPositionsSourceText() {
    if (panelChordPositionsSourceCache) {
      scheduleChordPositionsSourceRelease();
      return panelChordPositionsSourceCache;
    }

    if (!panelChordPositionsLoadPromise) {
      panelChordPositionsLoadPromise = fetch(chrome.runtime.getURL("data/chords.complete.js"))
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to load chord data (${response.status})`);
          }
          return response.text();
        })
        .then((sourceText) => {
          panelChordPositionsSourceCache = sourceText;
          scheduleChordPositionsSourceRelease();
          return sourceText;
        })
        .finally(() => {
          panelChordPositionsLoadPromise = null;
        });
    }

    return panelChordPositionsLoadPromise;
  }

  function getCachedLocalChordPositions(chordName) {
    const clean = String(chordName || "").trim();
    if (!clean) return null;
    const compact = clean.replace(/\s+/g, "");
    const cached = panelChordPositionsByNameCache.get(clean) ||
      panelChordPositionsByNameCache.get(compact);
    if (!cached) return null;

    // Refresh insertion order for a tiny LRU behavior.
    panelChordPositionsByNameCache.delete(clean);
    panelChordPositionsByNameCache.set(clean, cached);
    if (compact !== clean) {
      panelChordPositionsByNameCache.delete(compact);
      panelChordPositionsByNameCache.set(compact, cached);
    }
    return cached;
  }

  function rememberLocalChordPositions(chordName, positions) {
    const clean = String(chordName || "").trim();
    if (!clean || !Array.isArray(positions) || !positions.length) return;
    const compact = clean.replace(/\s+/g, "");
    panelChordPositionsByNameCache.set(clean, positions);
    if (compact !== clean) {
      panelChordPositionsByNameCache.set(compact, positions);
    }

    while (panelChordPositionsByNameCache.size > PANEL_CHORD_POSITIONS_CACHE_MAX) {
      const oldestKey = panelChordPositionsByNameCache.keys().next().value;
      if (!oldestKey) break;
      panelChordPositionsByNameCache.delete(oldestKey);
    }
  }

  function releaseHeavyChordLibraryGlobals() {
    if (window.COMPLETE_CHORDS_COMPACT) {
      window.COMPLETE_CHORDS_COMPACT = null;
    }
  }

  async function loadChordPositionsFromLocalData(chordNames) {
    const targetLookup = new Map();
    const originalTargets = new Set();
    [...chordNames].forEach((name) => {
      if (!name || name === "N") return;
      originalTargets.add(name);
      targetLookup.set(name, name);
      targetLookup.set(String(name).replace(/\s+/g, ""), name);
    });
    if (!targetLookup.size) return {};

    const result = {};
    const missingTargets = new Set();
    for (const originalChordName of originalTargets) {
      const cached = getCachedLocalChordPositions(originalChordName);
      if (cached) {
        result[originalChordName] = cached;
      } else {
        missingTargets.add(originalChordName);
      }
    }

    if (!missingTargets.size) return result;

    const source = await getChordPositionsSourceText();
    const entryRegex = /(?:"((?:\\.|[^"\\])*)"|([A-Za-z_$][\w$]*))\s*:\s*\[([\s\S]*?)\]\s*,?/g;
    let match;
    let foundCount = 0;

    while ((match = entryRegex.exec(source)) !== null) {
      const chordName = match[1] !== undefined
        ? parseJsonStringLiteral(match[1])
        : match[2];
      const originalChordName = targetLookup.get(chordName);
      if (!originalChordName || !missingTargets.has(originalChordName)) continue;

      const positions = parseCompactPositionBlock(match[3]);
      if (positions.length) {
        result[originalChordName] = positions;
        rememberLocalChordPositions(originalChordName, positions);
        if (chordName !== originalChordName) {
          rememberLocalChordPositions(chordName, positions);
        }
        foundCount++;
      }

      if (foundCount >= missingTargets.size) break;
    }

    return result;
  }

  function parsePanelChordEntries(text) {
    if (!text) return [];
    return text
      .split(",")
      .map((entry) => {
        const [timeStr, chordName] = entry.split(":");
        if (!timeStr || !chordName) return null;
        return { time: parseFloat(timeStr), chord: chordName };
      })
      .filter((entry) => entry !== null);
  }

  async function completeChordPositionsForPanel(videoId, data, uniqueChords, capoChords, chordPositions) {
    const positions = hasObjectEntries(chordPositions) ? { ...chordPositions } : {};
    const positionChordNames = collectChordNamesForPositions(uniqueChords, capoChords);
    const missingPositionNames = [...positionChordNames].filter((chordName) => !positions[chordName]);

    if (!missingPositionNames.length) {
      console.log("[LyricsChords] 🎸 All chord positions already cached");
      return { chordPositions: positions, repaired: false, missingCount: 0, generatedCount: 0 };
    }

    try {
      const generatedPositions = await loadChordPositionsFromLocalData(missingPositionNames);
      Object.assign(positions, generatedPositions);
      const generatedCount = Object.keys(generatedPositions).length;
      console.log(
        `[LyricsChords] 🎸 Generated ${generatedCount}/${missingPositionNames.length} missing chord positions on client`
      );

      if (generatedCount > 0 && data) {
        await window.databaseManager.saveToDatabase("chords", videoId, {
          ...data,
          chordPositions: positions,
          capoChords: capoChords,
          localChordPositions: data.localChordPositions || {},
        });
        console.log("[LyricsChords] ✅ Repaired cached chord positions in IndexedDB");
      }

      return {
        chordPositions: positions,
        repaired: generatedCount > 0,
        missingCount: missingPositionNames.length,
        generatedCount,
      };
    } catch (error) {
      console.warn("[LyricsChords] Failed to generate missing chord positions on client:", error);
      return {
        chordPositions: positions,
        repaired: false,
        missingCount: missingPositionNames.length,
        generatedCount: 0,
      };
    }
  }

  window.transposeChord = transposeChord;
  // ═══════════════════════════════════════════════════════════════

  // 🆕 פונקציה לבניית PANEL_SUBSET - חכם ויעיל!
  async function ensurePanelSubset(videoId, forceRebuild = false) {
    // בדיקה: האם כבר יש SUBSET לסרטון הזה?
    if (!forceRebuild && PANEL_SUBSET && PANEL_SUBSET_VIDEO_ID === videoId) {
      console.log("[LyricsChords] ✅ Using existing PANEL_SUBSET from memory");
      return PANEL_SUBSET;
    }

    // ניקוי SUBSET ישן אם יש
    if (PANEL_SUBSET) {
      const oldCount = Object.keys(PANEL_SUBSET.chords).length;
      PANEL_SUBSET = null;
      PANEL_SUBSET_VIDEO_ID = null;
      window.PANEL_SUBSET = null; // ✅ ניקוי גם מ-window
      console.log(
        `[LyricsChords] 🗑️ Cleaned old PANEL_SUBSET (${oldCount} chords)${forceRebuild ? ' (force rebuild)' : ''}`
      );
    }

    try {
      // 1. טוען מ-IndexedDB
      console.log("[LyricsChords] 📥 Loading chord data from IndexedDB...");
      const data = await window.databaseManager.loadChordsFromIndexedDB(
        videoId
      );

      if (!data || !data.chordText) {
        // 🔧 אין אקורדים - מחזיר null במקום לזרוק שגיאה
        console.log(
          "[LyricsChords] ⚠️ No chord data found in IndexedDB - lyrics only mode"
        );
        return null;
      }

      // 3. מפרסר את כל 3 ה-Modes לפני בדיקת cache כדי לוודא שה-cache של הפוזיציות מלא.
      const regularChords = parsePanelChordEntries(data.chordText);
      const regularPlusChords = parsePanelChordEntries(
        data.chordTextRegularPlus || data.chordText
      );
      const harmonicChords = parsePanelChordEntries(
        data.chordTextHarmonic || data.chordText
      );
      const harmonicPlusChords = parsePanelChordEntries(
        data.chordTextHarmonicPlus || data.chordText
      );

      const uniqueChords = new Set();
      const addUniqueChord = (entry) => {
        if (entry?.chord && entry.chord !== "N") {
          uniqueChords.add(entry.chord);
        }
      };
      regularChords.forEach(addUniqueChord);
      regularPlusChords.forEach(addUniqueChord);
      harmonicChords.forEach(addUniqueChord);
      harmonicPlusChords.forEach(addUniqueChord);

      const chordModes = {
        Regular: [...new Set(regularChords.map((c) => c.chord))],
        "Regular+": [...new Set(regularPlusChords.map((c) => c.chord))],
        Harmonic: [...new Set(harmonicChords.map((c) => c.chord))],
        "Harmonic+": [...new Set(harmonicPlusChords.map((c) => c.chord))],
      };

      // 2. בדיקה: האם יש פוזיציות + קאפו שמורים?
      if (
        hasObjectEntries(data.chordPositions) &&
        data.chordModes &&
        hasObjectEntries(data.capoChords)
      ) {
        console.log("[LyricsChords] ✅ Found cached positions in IndexedDB!");
        console.log(
          `[LyricsChords] Loaded ${Object.keys(data.chordPositions).length
          } chords from cache`
        );
        if (data.capoChords) {
          console.log("[LyricsChords] 🎸 Loaded capo transposition map");
        }

        const repairedPositions = await completeChordPositionsForPanel(
          videoId,
          data,
          uniqueChords,
          data.capoChords,
          data.chordPositions
        );

        // All Pro users now get complete data from server - no need for separate fetch
        PANEL_SUBSET = {
          videoId,
          chords: repairedPositions.chordPositions,
          modes: data.chordModes,
          capoChords: data.capoChords || null,
          chordText: {
            regular: data.chordText,
            regularPlus: data.chordTextRegularPlus || data.chordText,
            harmonic: data.chordTextHarmonic || data.chordText,
            harmonicPlus: data.chordTextHarmonicPlus || data.chordText,
          },
          tuningValue: data.tuningValue || null, // 🎸 tuning של השיר
          hasNonStandardTuning: data.hasNonStandardTuning || false, // 🎸 flag for non-Pro users
        };
        PANEL_SUBSET_VIDEO_ID = videoId;
        window.PANEL_SUBSET = PANEL_SUBSET; // ✅ חשוב! כדי ש-chordRenderer יוכל לגשת
        console.log(
          "[LyricsChords] 📝 Added chordText to PANEL_SUBSET for Preview Panel"
        );
        if (data.tuningValue) {
          console.log(`[LyricsChords] 🎸 tuningValue: ${data.tuningValue}`);
        }
        return PANEL_SUBSET;
      }

      // 3. אין פוזיציות - צריך לבנות (פעם ראשונה)
      console.log(
        "[LyricsChords] 🔄 Building PANEL_SUBSET (first time for this video)..."
      );

      console.log(
        `[LyricsChords] Found ${uniqueChords.size} unique chords across all modes`
      );

      // 8. בונה רשימות Modes
      console.log(
        `[LyricsChords] Mode lists: Regular=${chordModes.Regular.length}, Regular+=${chordModes["Regular+"].length}, Harmonic=${chordModes.Harmonic.length}, Harmonic+=${chordModes["Harmonic+"].length}`
      );

      // 9. 🎸 capoChords - נבנה בצד המשתמש ונשמר ב-IndexedDB
      const capoChords = hasObjectEntries(data.capoChords)
        ? data.capoChords
        : buildCapoChords(uniqueChords);

      if (capoChords) {
        console.log("[LyricsChords] 🎸 Capo transposition map ready");
      } else {
        console.log("[LyricsChords] 🎸 No capoChords generated");
      }

      // 10. 🎸 chordPositions - נשלפות מקובץ התוסף המקומי רק לאקורדים של הסרטון
      const completedPositions = await completeChordPositionsForPanel(
        videoId,
        null,
        uniqueChords,
        capoChords,
        data.chordPositions
      );
      const chordPositions = completedPositions.chordPositions;

      console.log(
        `[LyricsChords] 📊 Total chords in chordPositions: ${Object.keys(chordPositions).length}`
      );

      // 12. שומר ב-IndexedDB לפעם הבאה
      console.log(
        "[LyricsChords] 💾 Saving positions to IndexedDB for next time..."
      );
      await window.databaseManager.saveToDatabase("chords", videoId, {
        ...data,
        chordPositions: chordPositions,
        chordModes: chordModes,
        capoChords: capoChords,
        localChordPositions: data.localChordPositions || {},
      });

      console.log("[LyricsChords] ✅ Positions cached in IndexedDB!");

      // 10.5 אתחול Global Positions DB אם לא קיים
      try {
        const globalExists = await window.databaseManager.loadFromDatabase(
          "globalPositions",
          "globalPositions"
        );
        if (!globalExists) {
          await window.databaseManager.saveToDatabase(
            "globalPositions",
            "globalPositions",
            {
              positions: {},
              lastUpdated: Date.now(),
            }
          );
          console.log("[LyricsChords] ✅ Global positions DB initialized!");
        }
      } catch (error) {
        console.warn(
          "[LyricsChords] Failed to initialize global positions:",
          error
        );
      }

      // 14. שומר ב-memory וב-window כדי ש-chordRenderer יוכל לגשת
      PANEL_SUBSET = {
        videoId,
        chords: chordPositions,
        modes: chordModes,
        capoChords: capoChords,
        chordText: {
          regular: data.chordText,
          regularPlus: data.chordTextRegularPlus || data.chordText,
          harmonic: data.chordTextHarmonic || data.chordText,
          harmonicPlus: data.chordTextHarmonicPlus || data.chordText,
        },
        tuningValue: data.tuningValue || null, // 🎸 tuning של השיר
        hasNonStandardTuning: data.hasNonStandardTuning || false, // 🎸 flag for non-Pro users
      };
      PANEL_SUBSET_VIDEO_ID = videoId;
      window.PANEL_SUBSET = PANEL_SUBSET; // ✅ חשוב! כדי ש-chordRenderer יוכל לגשת
      console.log(
        "[LyricsChords] 📝 Added chordText to PANEL_SUBSET for Preview Panel"
      );
      if (data.tuningValue) {
        console.log(`[LyricsChords] 🎸 tuningValue: ${data.tuningValue}`);
      }

      return PANEL_SUBSET;
    } catch (error) {
      // 🔧 לא מדפיס ERROR אם פשוט אין אקורדים
      if (error.message?.includes("No chord data")) {
        console.log(
          "[LyricsChords] ⚠️ No chord data available - lyrics only mode"
        );
      } else {
        console.error("[LyricsChords] ❌ Error building PANEL_SUBSET:", error);
      }
      // במקרה של שגיאה, ננסה לנקות
      if (window.COMPLETE_CHORDS) {
        window.COMPLETE_CHORDS = null;
      }
      releaseHeavyChordLibraryGlobals();
      return null;
    }
  }

  // ✅ חשיפת הפונקציות ל-window כדי שהקרוסלה תוכל להשתמש בהן
  window.ensurePanelSubset = ensurePanelSubset;
  window.cleanupPanelSubset = cleanupPanelSubset;

  // פונקציה לניקוי PANEL_SUBSET
  function cleanupPanelSubset() {
    if (PANEL_SUBSET) {
      const count = Object.keys(PANEL_SUBSET.chords).length;
      const hasChordText = PANEL_SUBSET.chordText ? true : false;
      PANEL_SUBSET = null;
      PANEL_SUBSET_VIDEO_ID = null;
      window.PANEL_SUBSET = null; // ✅ ניקוי גם מ-window

      // ניקוי cache של chordRenderer
      if (
        window.chordRenderer &&
        typeof window.chordRenderer.clearCache === "function"
      ) {
        window.chordRenderer.clearCache();
        console.log(`[LyricsChords] 🗑️ Cleared chordRenderer cache`);
      }

      console.log(
        `[LyricsChords] 🗑️ Cleaned PANEL_SUBSET (${count} chords${hasChordText ? " + chordText" : ""
        })`
      );
    }
  }

  // 🎸 Tuning Alert - הועבר ל-buttons/settings/Tuning/tuningAlert.js
  // הפונקציות window.applyTuningCorrection ו-window.showTuningAlert נטענות משם

  // 🆕 פונקציה לטעינת כל הפוזיציות של אקורד מ-PANEL_SUBSET
  async function loadChordPositions(chordName) {
    // וידוא ש-PANEL_SUBSET נטען לפני השימוש
    if (!PANEL_SUBSET) {
      console.warn("[LyricsChords] PANEL_SUBSET לא נטען עדיין");
      return [];
    }

    const clean = chordName.replace(/\s+/g, "");

    // שימוש ב-cache חכם לפני גישה ל-PANEL_SUBSET
    let positions = getCachedChordData(chordName);

    // אם לא נמצא ב-cache, ננסה ב-PANEL_SUBSET ישירות
    if (!positions && PANEL_SUBSET.chords) {
      positions = PANEL_SUBSET.chords[chordName];
    }

    if (!positions || !Array.isArray(positions) || positions.length === 0) {
      console.warn(`[LyricsChords] לא נמצאו פוזיציות עבור אקורד: ${chordName}`);
      return [];
    }

    // שמירת הפוזיציות ב-cache
    chordPositionData.set(chordName, positions);

    // איניציאליזציה של מיקום נוכחי אם לא קיים
    if (!currentChordPositions.has(chordName)) {
      // ניסיון טעינה מ-IndexedDB קודם (כמו שהקרוסלה עושה)
      if (
        window.databaseManager &&
        window.databaseManager.getLocalChordPosition
      ) {
        try {
          const videoId = new URLSearchParams(window.location.search).get("v");
          if (videoId) {
            const savedPosition =
              await window.databaseManager.getLocalChordPosition(
                videoId,
                chordName
              );
            console.log(
              `[DEBUG] 💾 loadChordPositions: IndexedDB החזיר עבור ${chordName}:`,
              savedPosition
            );
            if (
              savedPosition !== null &&
              savedPosition !== undefined &&
              savedPosition >= 0
            ) {
              currentChordPositions.set(chordName, savedPosition);
              console.log(
                `[DEBUG] ✓ loadChordPositions: נטען מ-Local: ${chordName} -> פוזיציה ${savedPosition + 1
                }`
              );
            } else {
              // אם אין Local, בדוק Global
              const globalPosition =
                await window.databaseManager.getGlobalChordPosition(chordName);
              if (
                globalPosition !== null &&
                globalPosition !== undefined &&
                globalPosition >= 0
              ) {
                currentChordPositions.set(chordName, globalPosition);
                console.log(
                  `[DEBUG] ✓ loadChordPositions: נטען מ-Global: ${chordName} -> פוזיציה ${globalPosition + 1
                  }`
                );
              } else {
                // אם אין Local או Global, איניציאליזציה עם 0
                currentChordPositions.set(chordName, 0);
                console.log(
                  `[DEBUG] 💾 loadChordPositions: אין Local או Global, מאתחל ל-0`
                );
              }
            }
          } else {
            currentChordPositions.set(chordName, 0);
          }
        } catch (error) {
          console.warn(
            `[DEBUG] ⚠️ loadChordPositions: שגיאה בטעינה מ-IndexedDB:`,
            error
          );
          currentChordPositions.set(chordName, 0);
        }
      } else {
        // אם אין IndexedDB, איניציאליזציה עם 0
        currentChordPositions.set(chordName, 0);
        console.log(`[DEBUG] 💾 loadChordPositions: אין IndexedDB, מאתחל ל-0`);
      }
    }

    console.log(
      `[LyricsChords] נטענו ${positions.length} פוזיציות עבור אקורד ${chordName}`
    );
    return positions;
  }

  // פונקציה להזרקת CSS ל-tooltip - פעם אחת בלבד
  function injectTooltipStyles() {
    // בדיקה אם ה-CSS כבר קיים
    if (document.getElementById("lyrics-chords-tooltip-styles")) {
      return; // כבר קיים - לא צריך להוסיף שוב
    }

    const style = document.createElement("style");
    style.id = "lyrics-chords-tooltip-styles";
    style.textContent = `
      /* סגנונות ל-tooltip של אקורדים - גרסה נקייה ללא פסים */
      .lyrics-chords-tooltip {
        position: fixed !important;
        z-index: 2147483647 !important;
        background: transparent !important;
        border: none !important;
        border-radius: 0 !important;
        padding: 0 !important;
        pointer-events: auto !important;
        opacity: 0;
        transition: opacity 0.2s ease;
        box-shadow: none !important;
      }

      .lyrics-chords-tooltip .chord-slot {
        background-color: white;
        border-radius: 5px;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        opacity: 1;
        padding: 2px 0 !important;
      }

      .lyrics-chords-tooltip .chord-container {
        flex: 1 0 auto;
        width: 93px !important;
        height: 160px !important;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent !important;
        box-shadow: none !important;
        border-radius: inherit;
        margin: 0 !important;
        padding: 0 !important;
        border: 3.5px solid #2196F3 !important;
        border-radius: 8px !important;
        transform: scale(1.12) !important;
      }

      .lyrics-chords-tooltip .chord-diagram {
        width: 100% !important;
        height: 100% !important;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: white !important;
        border-radius: 3px !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
      }

      .lyrics-chords-tooltip .chord-diagram svg {
        width: 75% !important;
        height: 85% !important;
        transform: scale(1.2) !important;
        transform-origin: center 60% !important;
        margin-top: 25px !important;
      }

      .lyrics-chords-tooltip .chord-name-inner {
        font-weight: bold;
        font-size: 13px;
        text-align: center;
        color: #333;
        position: absolute;
        top: 2px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10;
        width: 100%;
        pointer-events: none !important;
      }

      .lyrics-chords-tooltip .chord-time-inner {
        font-size: 13px;
        color: #666;
        position: absolute;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        width: 100%;
        text-align: center;
        margin-bottom: 0;
        z-index: 10;
      }

      .lyrics-chords-tooltip .chord-arrow-left,
      .lyrics-chords-tooltip .chord-arrow-right {
        cursor: pointer !important;
        pointer-events: auto !important;
        transform: translateY(-1px) !important;
      }

      .lyrics-chords-tooltip.yc-position-controls-time-row .chord-arrow-left,
      .lyrics-chords-tooltip.yc-position-controls-time-row .chord-arrow-right,
      .lyrics-chords-tooltip.yc-position-controls-time-row .chord-position-counter,
      .lyrics-chords-tooltip.yc-position-controls-time-row .global-position-globe {
        transform: translateY(10px) !important;
      }

      .lyrics-chords-tooltip svg {
        cursor: default !important;
      }

      .lyrics-chords-tooltip .chord-not-found {
        font-size: 24px;
        color: #ccc;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    `;

    document.head.appendChild(style);
    console.log("[LyricsChords] ✓ CSS של tooltip הוזרק ל-head");
  }

  function scheduleTooltipPositionControlsPlacement() {
    if (!chordTooltip || lyricsTooltipPositionControlsPending) return;

    lyricsTooltipPositionControlsPending = true;
    const run = () => {
      lyricsTooltipPositionControlsPending = false;
      syncTooltipPositionControlsPlacement();
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
  }

  function syncTooltipPositionControlsPlacement() {
    if (!chordTooltip || !chordTooltip.isConnected) return;

    const nameEl = chordTooltip.querySelector(".chord-name-inner");
    const svg = chordTooltip.querySelector("svg");
    if (!nameEl || !svg) return;

    chordTooltip.classList.remove(LYRICS_TOOLTIP_POSITION_CONTROLS_TIME_ROW_CLASS);

    const nameRect = nameEl.getBoundingClientRect();
    if (!nameRect.width || !nameRect.height) return;

    const controls = svg.querySelectorAll(
      ".chord-arrow-left, .chord-arrow-right, .chord-position-counter, .global-position-globe"
    );
    const hasOverlap = Array.from(controls).some((control) => {
      const rect = control.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;

      const horizontalOverlap =
        nameRect.left < rect.right + 2 && nameRect.right > rect.left - 2;
      const verticalOverlap = nameRect.bottom > rect.top - 4;

      return horizontalOverlap && verticalOverlap;
    });

    chordTooltip.classList.toggle(
      LYRICS_TOOLTIP_POSITION_CONTROLS_TIME_ROW_CLASS,
      hasOverlap
    );
  }

  // 🌐 פונקציה להוספת אינדיקטור גלובוס לפוזיציה גלובלית
  async function addGlobalPositionIndicator(
    chordName,
    currentPosition,
    arrowElement
  ) {
    console.log(`[GlobalGlobe] 🌐 === התחלת בדיקה עבור ${chordName} ===`);
    console.log(`[GlobalGlobe] 📍 פוזיציה נוכחית: ${currentPosition + 1}`);

    try {
      // בדיקה 0: שמירת מצב Globe Icon (אבל לא יציאה מהפונקציה!)
      const shouldShowGlobe = window.globeIconEnabled;
      if (!shouldShowGlobe) {
        console.log(
          `[GlobalGlobe] ℹ️ Globe Icon disabled בהגדרות - לא יציג גלובוס (אבל ימשיך לבדוק חצים שחורים)`
        );
      } else {
        console.log(`[GlobalGlobe] ✓ Globe Icon enabled בהגדרות`);
      }

      // בדיקה 1: האם databaseManager קיים?
      if (!window.databaseManager) {
        console.warn(`[GlobalGlobe] ❌ window.databaseManager לא קיים`);
        return;
      }
      console.log(`[GlobalGlobe] ✓ window.databaseManager קיים`);

      // בדיקה 2: האם הפונקציה getGlobalChordPosition קיימת?
      if (typeof window.databaseManager.getGlobalChordPosition !== "function") {
        console.warn(`[GlobalGlobe] ❌ getGlobalChordPosition לא קיימת`);
        return;
      }
      console.log(`[GlobalGlobe] ✓ getGlobalChordPosition קיימת`);

      // בדיקה 3: מציאת ה-SVG (לפני הכל כדי למחוק גלובוס ישן)
      const svg = arrowElement.closest("svg");
      if (!svg) {
        console.warn(`[GlobalGlobe] ❌ לא נמצא SVG parent`);
        return;
      }
      console.log(`[GlobalGlobe] ✓ נמצא SVG parent`);

      // בדיקה 4: מחיקת גלובוס ישן (תמיד! לפני כל בדיקה)
      const oldGlobe = svg.querySelector(".global-position-globe");
      if (oldGlobe) {
        console.log(`[GlobalGlobe] 🗑️ מוחק גלובוס ישן...`);
        oldGlobe.remove();
      }
      const positionCounter = svg.querySelector(".chord-position-counter");

      // בדיקה 5: טעינת הפוזיציה הגלובלית
      console.log(
        `[GlobalGlobe] 🔍 מנסה לטעון פוזיציה גלובלית עבור ${chordName}...`
      );
      const globalPosition =
        await window.databaseManager.getGlobalChordPosition(chordName);
      console.log(`[GlobalGlobe] 📦 תוצאה מ-DB:`, globalPosition);

      // בדיקה 6: האם יש פוזיציה גלובלית?
      if (
        globalPosition === null ||
        globalPosition === undefined ||
        globalPosition === 0
      ) {
        console.log(
          `[GlobalGlobe] ℹ️ אין פוזיציה גלובלית עבור ${chordName} - מסיר גלובוס וחצים שחורים`
        );
        // הסרת class מהחצים (אם היה)
        const leftArrow = svg.querySelector(".chord-arrow-left");
        const rightArrow = svg.querySelector(".chord-arrow-right");
        if (leftArrow) {
          leftArrow.classList.remove("global-position-arrow");
          console.log(`[GlobalGlobe] 🗑️ הסרת class מחץ שמאל`);
        }
        if (rightArrow) {
          rightArrow.classList.remove("global-position-arrow");
          console.log(`[GlobalGlobe] 🗑️ הסרת class מחץ ימין`);
        }
        if (positionCounter) {
          positionCounter.classList.remove("global-position-counter");
        }
        return; // הגלובוס כבר נמחק למעלה
      }
      console.log(
        `[GlobalGlobe] ✓ נמצאה פוזיציה גלובלית: ${globalPosition + 1}`
      );

      // בדיקה 7: האם הפוזיציה הנוכחית שווה לגלובלית?
      const isGlobalPosition = currentPosition === globalPosition;
      console.log(
        `[GlobalGlobe] 🔍 השוואה: נוכחי=${currentPosition + 1}, גלובלי=${globalPosition + 1
        }, שווה=${isGlobalPosition}`
      );

      if (!isGlobalPosition) {
        console.log(
          `[GlobalGlobe] ℹ️ הפוזיציה הנוכחית (${currentPosition + 1
          }) לא שווה לגלובלית (${globalPosition + 1
          }) - גלובוס נמחק (אם היה) וסיום`
        );
        // הסרת class מהחצים (אם היה)
        const leftArrow = svg.querySelector(".chord-arrow-left");
        const rightArrow = svg.querySelector(".chord-arrow-right");
        if (leftArrow) leftArrow.classList.remove("global-position-arrow");
        if (rightArrow) rightArrow.classList.remove("global-position-arrow");
        if (positionCounter) {
          positionCounter.classList.remove("global-position-counter");
        }
        return; // הגלובוס כבר נמחק למעלה
      }
      console.log(`[GlobalGlobe] ✅ זו הפוזיציה הגלובלית! מוסיף גלובוס...`);

      // הוספת class לחצים (תמיד! ה-CSS יטפל בצבע לפי ההגדרות)
      console.log(`[GlobalGlobe] ⬛ מוסיף class לחצים...`);
      const leftArrow = svg.querySelector(".chord-arrow-left");
      const rightArrow = svg.querySelector(".chord-arrow-right");
      if (leftArrow) {
        leftArrow.classList.add("global-position-arrow");
        console.log(`[GlobalGlobe] ✓ הוסף class לחץ שמאל`);
      }
      if (rightArrow) {
        rightArrow.classList.add("global-position-arrow");
        console.log(`[GlobalGlobe] ✓ הוסף class לחץ ימין`);
      }
      if (positionCounter) {
        positionCounter.classList.add("global-position-counter");
        console.log(`[GlobalGlobe] ✓ הוסף class למספר הפוזיציה`);
      }

      if (!window.blackArrowsEnabled) {
        console.log(
          `[GlobalGlobe] ℹ️ Black Arrows disabled - החצים יהיו אפורים (CSS)`
        );
      }

      // יצירת אלמנט הגלובוס (תמיד! ה-CSS יטפל בהסתרה/הצגה)
      console.log(`[GlobalGlobe] 🎨 יוצר אלמנט גלובוס...`);
      const globe = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      globe.setAttribute("x", "3");
      globe.setAttribute("y", "7");
      globe.setAttribute("font-family", "Arial");
      globe.setAttribute("font-size", "8px");
      globe.setAttribute("text-anchor", "start");
      globe.setAttribute("class", "global-position-globe");
      globe.setAttribute("fill", "#4CAF50"); // ירוק יפה
      globe.textContent = "🌐";

      // הוספה ל-SVG
      svg.appendChild(globe);
      console.log(
        `[GlobalGlobe] ✅ גלובוס נוסף בהצלחה ל-SVG! (CSS יטפל בהצגה/הסתרה)`
      );

      if (!shouldShowGlobe) {
        console.log(
          `[GlobalGlobe] ℹ️ Globe Icon disabled - הגלובוס יוסתר ע"י CSS`
        );
      }

      console.log(`[GlobalGlobe] 🌐 === סיום מוצלח ===`);
    } catch (error) {
      console.error(`[GlobalGlobe] ❌ שגיאה:`, error);
      console.error(`[GlobalGlobe] Stack trace:`, error.stack);
    }
  }

  // הפיכת הפונקציה לגלובלית כדי שניתן יהיה לקרוא לה מקבצים אחרים
  window.addGlobalPositionIndicator = addGlobalPositionIndicator;

  // פונקציה ליצירת tooltip לאקורד עם חצים לניווט בין פוזיציות
  async function createChordTooltip(chordName, x, y, chordTime) {
    console.log(
      `[LyricsChords] 🔍 DEBUG: createChordTooltip נקרא עבור אקורד: ${chordName}, זמן: ${chordTime}`
    );

    console.log(
      `[DEBUG] 🔍 בתחילת createChordTooltip - currentChordPositions:`,
      Array.from(currentChordPositions.entries())
    );

    // הזרקת CSS אם עדיין לא קיים
    injectTooltipStyles();

    // וידוא שהdependencies טעונים
    const dependenciesReady = await ensureChordDependencies();
    if (!dependenciesReady) {
      console.warn("[LyricsChords] ❌ DEBUG: dependencies לא מוכנים");
      return;
    }
    console.log("[LyricsChords] ✓ DEBUG: dependencies מוכנים");

    try {
      // ניקוי tooltip קודם
      cleanupChordTooltip();

      // טעינת כל הפוזיציות של האקורד
      console.log(
        `[LyricsChords] 🔍 DEBUG: מנסה לטעון פוזיציות עבור ${chordName}`
      );
      console.log(
        `[LyricsChords] 🔍 DEBUG: PANEL_SUBSET קיים? ${!!PANEL_SUBSET}`
      );
      const positions = await loadChordPositions(chordName);
      if (!positions || positions.length === 0) {
        console.warn(
          `[LyricsChords] ❌ DEBUG: לא נמצאו פוזיציות עבור אקורד: ${chordName}`
        );
        return;
      }
      console.log(`[LyricsChords] ✓ DEBUG: נמצאו ${positions.length} פוזיציות`);

      // יצירת אלמנט tooltip
      chordTooltip = document.createElement("div");
      chordTooltip.className = "lyrics-chords-tooltip";
      chordTooltip.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      background: transparent;
      border: none;
      border-radius: 0;
      padding: 0;
      pointer-events: auto;
      opacity: 0;
      transition: opacity 0.2s ease;
      box-shadow: none;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    `;

      // יצירת מיכל עם חצים ודיאגרמה
      const tooltipContainer = document.createElement("div");
      tooltipContainer.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

      // יצירת דיאגרמת אקורד באמצעות המערכת הקיימת
      // טעינה מ-IndexedDB אם אין ב-Map (כמו שהקרוסלה עושה)
      if (!currentChordPositions.has(chordName) && window.chordPositionsDB) {
        console.log(
          `[DEBUG] 🔍 אין ב-Map, מנסה לטעון מ-IndexedDB: ${chordName}`
        );
        try {
          const savedPosition = await window.chordPositionsDB.getPosition(
            chordName
          );
          console.log(`[DEBUG] 🔍 IndexedDB החזיר:`, savedPosition);
          if (
            savedPosition !== null &&
            savedPosition !== undefined &&
            savedPosition >= 0
          ) {
            currentChordPositions.set(chordName, savedPosition);
            console.log(
              `[DEBUG] ✓ נטען מ-IndexedDB: ${chordName} -> פוזיציה ${savedPosition + 1
              }`
            );
          }
        } catch (error) {
          console.warn(`[DEBUG] ⚠️ שגיאה בטעינה מ-IndexedDB:`, error);
        }
      }

      const currentPos = currentChordPositions.get(chordName) || 0;
      console.log(
        `[DEBUG] 🔍 טוען דיאגרמה: ${chordName} -> פוזיציה ${currentPos + 1}`
      );
      console.log(
        `[DEBUG] 🔍 currentChordPositions.get("${chordName}"):`,
        currentChordPositions.get(chordName)
      );
      console.log(
        `[DEBUG] 🔍 currentChordPositions size:`,
        currentChordPositions.size
      );
      console.log(
        `[DEBUG] 🔍 window.chordPositionsDB קיים?`,
        !!window.chordPositionsDB
      );

      const chordElement = renderChordAtPosition(chordName, currentPos);
      if (!chordElement) {
        console.warn(
          `[LyricsChords] לא ניתן ליצור דיאגרמה עבור אקורד: ${chordName}`
        );
        return;
      }

      // העתקת כל ה-container כדי לשמור על המבנה הנכון
      const containerClone = chordElement.cloneNode(true);

      // הסרת רק הזמן מה-clone, השארת שם האקורד
      const timeElements = containerClone.querySelectorAll(".chord-time-inner");
      timeElements.forEach((el) => el.remove());

      // הוספת הדיאגרמה למיכל
      tooltipContainer.appendChild(containerClone);

      // הוספת זמן האקורד מה-DOM
      if (chordTime && !isNaN(parseFloat(chordTime))) {
        const formatTime = (seconds) => {
          if (isNaN(seconds)) return "0:00";
          const minutes = Math.floor(seconds / 60);
          const secs = Math.floor(seconds % 60);
          return `${minutes}:${secs.toString().padStart(2, "0")}`;
        };

        const timeElement = document.createElement("div");
        timeElement.className = "chord-time-inner";
        timeElement.textContent = formatTime(parseFloat(chordTime));
        timeElement.style.cssText = `
          position: absolute;
          bottom: 8px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 12px;
          color: #666;
          background: transparent;
          padding: 2px 6px;
          border-radius: 3px;
          white-space: nowrap;
        `;
        containerClone.appendChild(timeElement);
        console.log(
          `[LyricsChords] ✓ הוסף זמן לtooltip: ${timeElement.textContent}`
        );
      }

      // הגדלת הדיאגרמה כדי שתכסה את כל השטח ולא יראה לבן מחוץ למסגרת
      const diagramElement = containerClone.querySelector(".chord-diagram");
      if (diagramElement) {
        diagramElement.style.backgroundColor = "white";
        diagramElement.style.width = "100%";
        diagramElement.style.height = "100%";
        diagramElement.style.margin = "0";
        diagramElement.style.padding = "0";
      }

      // וידוא שה-container עצמו לא מוסיף רקע נוסף
      const containerElement = containerClone.querySelector(".chord-container");
      if (containerElement) {
        containerElement.style.backgroundColor = "transparent";
      }

      // עדכון הספירה עם המספרים הנכונים (לפני הוספה ל-DOM)
      const positionCounter = containerClone.querySelector(
        ".chord-position-counter"
      );
      if (positionCounter && positions && positions.length > 0) {
        const currentPos = currentChordPositions.get(chordName) || 0;
        positionCounter.textContent = `${currentPos + 1}/${positions.length}`;
        console.log(
          `[LyricsChords] ✓ עדכון ספירה: ${currentPos + 1}/${positions.length}`
        );
      } else {
        console.warn(`[LyricsChords] ⚠️ לא נמצאה ספירה או פוזיציות`);
      }

      // הוספת המיכל ל-tooltip
      chordTooltip.appendChild(tooltipContainer);

      // הוספה ל-DOM
      document.body.appendChild(chordTooltip);
      scheduleTooltipPositionControlsPlacement();
      console.log(
        `[DEBUG] ✅ tooltip נוסף ל-DOM, class: ${chordTooltip.className}`
      );
      console.log(
        `[DEBUG] ✅ tooltip ב-DOM? ${document.body.contains(chordTooltip)}`
      );

      // החצים והספירה האפורים כבר קיימים ב-SVG מה-chordRenderer
      // נוסיף להם event listeners אחרי שה-tooltip ב-DOM
      const leftArrow = chordTooltip.querySelector(".chord-arrow-left");
      const rightArrow = chordTooltip.querySelector(".chord-arrow-right");

      if (leftArrow && rightArrow) {
        console.log(
          `[LyricsChords] 🔧 מוסיף event listeners לחצים (אחרי DOM)...`
        );

        // הוספת event listeners לחצים
        leftArrow.addEventListener(
          "click",
          async (e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log(
              `[LyricsChords] 🖱️ לחיצה על חץ שמאל - אקורד: ${chordName}`
            );
            await navigateChordPosition(chordName, -1);
          },
          { signal: lyricsChordsPanelController.signal }
        );

        rightArrow.addEventListener(
          "click",
          async (e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log(
              `[LyricsChords] 🖱️ לחיצה על חץ ימין - אקורד: ${chordName}`
            );
            await navigateChordPosition(chordName, 1);
          },
          { signal: lyricsChordsPanelController.signal }
        );

        // הוספת cursor pointer לחצים + styling לקליקים קלים
        leftArrow.style.cursor = "pointer";
        leftArrow.style.pointerEvents = "auto";
        leftArrow.setAttribute("cursor", "pointer"); // SVG attribute

        rightArrow.style.cursor = "pointer";
        rightArrow.style.pointerEvents = "auto";
        rightArrow.setAttribute("cursor", "pointer"); // SVG attribute

        // גם להוסיף cursor ל-SVG עצמו
        const svg = chordTooltip.querySelector("svg");
        if (svg) {
          svg.style.cursor = "default"; // SVG עצמו default, רק החצים pointer
        }

        console.log(
          `[LyricsChords] ✓ הוספו event listeners לחצים האפורים (אחרי DOM)`
        );

        // 🌐 הוספת גלובוס אם זו פוזיציה גלובלית (רק אם Primary Chord Position מופעל)
        if (window.primaryChordPositionEnabled) {
          await addGlobalPositionIndicator(chordName, currentPos, leftArrow);
        } else {
          console.log(
            "[LyricsChords] ℹ️ Primary Chord Position is OFF - skipping global indicators"
          );
        }
      } else {
        console.warn(`[LyricsChords] ⚠️ לא נמצאו חצים אפורים ב-SVG`);
      }

      // מיקום הtooltip ליד העכבר
      positionChordTooltip(x, y);

      // 🆕 הגדרת טיימר להסתרה אוטומטית אחרי 5 שניות
      if (tooltipAutoHideTimeout) {
        clearTimeout(tooltipAutoHideTimeout);
      }
      tooltipAutoHideTimeout = setTimeout(() => {
        console.log(
          "[LyricsChords] 🕐 DEBUG: Auto-hide tooltip after 5 seconds (initial)"
        );
        cleanupChordTooltip();
        tooltipAutoHideTimeout = null;
      }, 5000); // 5 שניות

      // הוספת מאזיני אירועים ל-tooltip כדי שלא ייעלם כשהעכבר עליו
      chordTooltip.addEventListener(
        "mouseenter",
        () => {
          // ביטול timeout של סגירה
          if (tooltipTimeout) {
            clearTimeout(tooltipTimeout);
            tooltipTimeout = null;
          }
          // ביטול timeout של הסתרה אוטומטית
          if (tooltipAutoHideTimeout) {
            clearTimeout(tooltipAutoHideTimeout);
            tooltipAutoHideTimeout = null;
          }
        },
        { signal: lyricsChordsPanelController.signal }
      );

      chordTooltip.addEventListener(
        "mouseleave",
        () => {
          // סגירה מיידית כשהעכבר יוצא מה-tooltip
          tooltipTimeout = setTimeout(() => {
            cleanupChordTooltip();
          }, 100);
        },
        { signal: lyricsChordsPanelController.signal }
      );

      // הצגה עם אנימציה
      requestAnimationFrame(() => {
        if (chordTooltip) {
          chordTooltip.style.opacity = "1";
        }
      });

      console.log(
        `[LyricsChords] נוצר tooltip לאקורד: ${chordName} עם ${positions.length} פוזיציות`
      );
      return chordTooltip;
    } catch (error) {
      console.error("[LyricsChords] שגיאה ביצירת tooltip:", error);
      cleanupChordTooltip();
    }

    return null;
  }

  // פונקציה להמרת אותיות למספרים (הקסדצימלי)
  function convertHexToDecimal(hexChar) {
    if (hexChar >= "0" && hexChar <= "9") {
      return parseInt(hexChar);
    }
    const hexMap = {
      a: 10,
      b: 11,
      c: 12,
      d: 13,
      e: 14,
      f: 15,
      g: 16,
      h: 17,
      i: 18,
      j: 19,
      k: 20,
      l: 21,
      m: 22,
      n: 23,
      o: 24,
      p: 25,
      q: 26,
      r: 27,
    };
    return hexMap[hexChar.toLowerCase()] || 0;
  }

  // פונקציה לעיבוד פוזיציית אקורד עם ברות גבוהות
  function processChordPosition(positionData) {
    console.log(`[DEBUG] processChordPosition התחיל - נתונים:`, positionData);

    if (!positionData.frets) {
      console.log(`[DEBUG] אין frets - מחזיר כמו שהוא`);
      return positionData;
    }

    const frets = positionData.frets;
    console.log(`[DEBUG] frets מקורי: ${frets}`);
    const fretNumbers = [];

    // המרת כל תו למספר
    for (let i = 0; i < frets.length; i++) {
      const char = frets[i];
      if (char === "x") {
        fretNumbers.push("x");
      } else {
        const converted = convertHexToDecimal(char);
        console.log(`[DEBUG] המרת תו '${char}' למספר: ${converted}`);
        fretNumbers.push(converted);
      }
    }
    console.log(`[DEBUG] fretNumbers אחרי המרה:`, fretNumbers);

    // בדיקה אם יש כבר barres מוגדר - צריך להמיר דו-ספרתי להקסדצימלי
    if (positionData.barres) {
      console.log(`[DEBUG] נמצא barres קיים: ${positionData.barres}`);

      // השארת המספר כמו שהוא – אין המרה ל-hex
      let processedBarres = positionData.barres;
      console.log(`[DEBUG] שמירת barres כמו שהוא: ${processedBarres}`);

      return {
        ...positionData,
        barres: processedBarres,
      };
    }

    // מציאת המספר הנמוך ביותר (למעט x ו-0) - רק אם אין barres קיים
    const validFrets = fretNumbers.filter((f) => f !== "x" && f !== 0);
    if (validFrets.length === 0) {
      console.log(`[DEBUG] אין frets תקינים - מחזיר כמו שהוא`);
      return {
        ...positionData,
        frets: fretNumbers.join(""),
      };
    }

    const minFret = Math.min(...validFrets);
    console.log(`[DEBUG] minFret שחושב: ${minFret}`);

    // אם המספר הנמוך ביותר גדול מ-4, צריך ברה (רק אם אין barres קיים)
    if (minFret > 4) {
      console.log(`[DEBUG] יוצר barres חדש: ${minFret}`);
      // יצירת פוזיציה חדשה עם ברה
      const newFrets = fretNumbers
        .map((f) => {
          if (f === "x" || f === 0) return f;
          return f - minFret + 1; // התאמה לברה
        })
        .join("");

      return {
        ...positionData,
        frets: newFrets,
        barres: minFret.toString(),
        capo: "true",
      };
    }

    // אם המספרים נמוכים, פשוט נמיר חזרה למחרוזת
    console.log(`[DEBUG] frets נמוכים - לא צריך barres`);
    return {
      ...positionData,
      frets: fretNumbers.join(""),
    };
  }

  // פונקציה ליצירת דיאגרמת אקורד בפוזיציה מסוימת
  function renderChordAtPosition(chordName, positionIndex) {
    console.log(
      `[DEBUG] renderChordAtPosition התחיל - אקורד: ${chordName}, פוזיציה: ${positionIndex}`
    );

    const positions = chordPositionData.get(chordName);
    console.log(
      `[DEBUG] נמצאו ${positions ? positions.length : 0} פוזיציות עבור אקורד`
    );

    if (!positions || positionIndex < 0 || positionIndex >= positions.length) {
      console.warn(
        `[DEBUG] פוזיציה לא חוקית: ${positionIndex} עבור אקורד ${chordName}`
      );
      return null;
    }

    try {
      // עיבוד הפוזיציה (המרת אותיות וטיפול בברות)
      const rawPositionData = positions[positionIndex];
      console.log(`[DEBUG] נתוני פוזיציה גולמיים:`, rawPositionData);

      const processedPositionData = processChordPosition(rawPositionData);
      console.log(`[DEBUG] נתוני פוזיציה אחרי עיבוד:`, processedPositionData);

      console.log(`[DEBUG] עיבוד פוזיציה ${positionIndex}:`, {
        original: rawPositionData.frets,
        processed: processedPositionData.frets,
        barres: processedPositionData.barres,
      });

      // יצירת שם אקורד ייחודי לכל פוזיציה כדי לעקוף את ה-cache
      const uniqueChordName = `${chordName}_pos${positionIndex}_${Date.now()}`;
      console.log(`[DEBUG] שם אקורד ייחודי: ${uniqueChordName}`);

      // הוספת האקורד זמנית ל-PANEL_SUBSET
      console.log(
        `[DEBUG] מוסיף אקורד זמני ל-PANEL_SUBSET: ${uniqueChordName}...`
      );

      const tempChordAdded = !window.PANEL_SUBSET?.chords?.[uniqueChordName];
      if (tempChordAdded && window.PANEL_SUBSET) {
        window.PANEL_SUBSET.chords[uniqueChordName] = [processedPositionData];
        console.log(`[DEBUG] אקורד זמני נוסף ל-PANEL_SUBSET בהצלחה`);
      }

      // ניקוי cache של chordRenderer אם קיימת הפונקציה
      if (
        window.chordRenderer &&
        typeof window.chordRenderer.clearCache === "function"
      ) {
        console.log(`[DEBUG] מנקה cache של chordRenderer...`);
        window.chordRenderer.clearCache();
      }

      // רינדור האקורד עם השם הייחודי
      console.log(
        `[DEBUG] קורא ל-chordRenderer.renderChord עם שם: ${uniqueChordName}`
      );
      console.log(`[DEBUG] window.PANEL_SUBSET קיים?`, !!window.PANEL_SUBSET);
      console.log(`[DEBUG] window.chordRenderer קיים?`, !!window.chordRenderer);

      const chordElement = window.chordRenderer.renderChord(
        uniqueChordName,
        "",
        false
      );

      console.log(`[DEBUG] chordRenderer.renderChord החזיר:`, chordElement);
      console.log(`[DEBUG] האם chordElement null?`, chordElement === null);

      // החלפת השם הייחודי בשם המקורי לתצוגה למשתמש
      if (chordElement) {
        const chordNameElements = chordElement.querySelectorAll(
          '.chord-name, .chord-title, [class*="chord-name"], [class*="name"]'
        );
        chordNameElements.forEach((element) => {
          if (
            element.textContent &&
            element.textContent.includes(uniqueChordName)
          ) {
            element.textContent = element.textContent.replace(
              uniqueChordName,
              chordName
            );
          }
        });

        // גם בדיקה כללית לכל טקסט שמכיל את השם הייחודי
        const allTextNodes = [];
        const walker = document.createTreeWalker(
          chordElement,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        let node;
        while ((node = walker.nextNode())) {
          if (node.textContent && node.textContent.includes(uniqueChordName)) {
            node.textContent = node.textContent.replace(
              uniqueChordName,
              chordName
            );
          }
        }

        console.log(
          `[DEBUG] החלפתי שם אקורד מ-${uniqueChordName} ל-${chordName} בתצוגה`
        );
      }
      console.log(`[DEBUG] chordRenderer החזיר:`, chordElement);

      // הסרת האקורד הזמני מ-PANEL_SUBSET
      if (tempChordAdded && window.PANEL_SUBSET?.chords?.[uniqueChordName]) {
        delete window.PANEL_SUBSET.chords[uniqueChordName];
        console.log(
          `[DEBUG] אקורד זמני הוסר מ-PANEL_SUBSET: ${uniqueChordName}`
        );
      }

      console.log(`[DEBUG] renderChordAtPosition מסיים - מחזיר אלמנט`);
      return chordElement;
    } catch (error) {
      console.error(
        `[LyricsChords] שגיאה ביצירת דיאגרמה לפוזיציה ${positionIndex}:`,
        error
      );
      return null;
    }
  }

  // פונקציה לניווט בין פוזיציות אקורד
  function navigateChordPosition(chordName, direction) {
    console.log(
      `[DEBUG] 🚀 navigateChordPosition התחיל - אקורד: ${chordName}, כיוון: ${direction}`
    );

    // 🔍 DEBUG: בדיקת currentChordPositions
    console.log(
      `[DEBUG] 🔍 window.currentChordPositions קיים?`,
      !!window.currentChordPositions
    );
    console.log(
      `[DEBUG] 🔍 currentChordPositions === window.currentChordPositions?`,
      currentChordPositions === window.currentChordPositions
    );
    console.log(
      `[DEBUG] 🔍 currentChordPositions.size:`,
      currentChordPositions.size
    );
    console.log(
      `[DEBUG] 🔍 כל הפוזיציות ב-Map:`,
      Array.from(currentChordPositions.entries())
    );

    const positions = chordPositionData.get(chordName);
    if (!positions || positions.length <= 1) {
      console.log(
        `[DEBUG] אין פוזיציות לניווט - positions: ${positions ? positions.length : "null"
        }`
      );
      return; // אין מה לנווט
    }

    // קבלת המיקום הנוכחי
    let currentPos = currentChordPositions.get(chordName) || 0;
    console.log(`[DEBUG] מיקום נוכחי לפני שינוי: ${currentPos}`);
    console.log(
      `[DEBUG] 🔍 currentChordPositions.get("${chordName}"):`,
      currentChordPositions.get(chordName)
    );
    console.log(
      `[DEBUG] 🔍 window.currentChordPositions.get("${chordName}"):`,
      window.currentChordPositions?.get(chordName)
    );

    // חישוב המיקום החדש (עם מעבר מעגלי)
    const newPos =
      (currentPos + direction + positions.length) % positions.length;
    console.log(`[DEBUG] מיקום חדש אחרי חישוב: ${newPos}`);

    // עדכון המיקום הנוכחי
    currentChordPositions.set(chordName, newPos);
    console.log(
      `[DEBUG] מיקום נשמר ב-Map: ${currentChordPositions.get(chordName)}`
    );

    // שמירה ב-IndexedDB לסנכרון עם הקרוסלה
    if (
      window.databaseManager &&
      window.databaseManager.saveLocalChordPosition
    ) {
      const videoId = new URLSearchParams(window.location.search).get("v");
      if (videoId) {
        console.log(
          `[DEBUG] 💾 לפני saveLocalChordPosition: ${chordName} -> ${newPos + 1
          }`
        );
        window.databaseManager
          .saveLocalChordPosition(videoId, chordName, newPos)
          .then(() => {
            console.log(
              `[LyricsChords] ✓ נשמר ב-IndexedDB: ${chordName} -> פוזיציה ${newPos + 1
              }`
            );
          });

        // שידור event לסנכרון עם קרוסלה
        window.dispatchEvent(
          new CustomEvent("chordPositionChanged", {
            detail: { chordName, position: newPos },
          })
        );
        console.log(`[LyricsChords] 📡 שודר event לסנכרון`);
      }
    } else {
      console.warn(
        `[DEBUG] ⚠️ databaseManager.saveLocalChordPosition לא קיים!`
      );
    }

    // הצגת הפוזיציה החדשה
    console.log(`[DEBUG] פוזיציה חדשה:`, positions[newPos]);

    // עדכון הדיאגרמה ב-tooltip
    console.log(`[DEBUG] קורא ל-updateChordTooltipDiagram...`);
    updateChordTooltipDiagram(chordName, newPos);

    console.log(
      `[DEBUG] ניווט לפוזיציה ${newPos + 1}/${positions.length
      } עבור אקורד ${chordName} הושלם`
    );
  }

  // פונקציה לעדכון הדיאגרמה ב-tooltip הקיים
  function updateChordTooltipDiagram(chordName, positionIndex) {
    console.log(
      `[DEBUG] updateChordTooltipDiagram התחיל - אקורד: ${chordName}, פוזיציה: ${positionIndex}`
    );

    if (!chordTooltip) {
      console.log(`[DEBUG] chordTooltip לא קיים - יוצא`);
      return;
    }

    try {
      // מציאת המיכל הנוכחי ב-tooltip
      const tooltipContainer = chordTooltip.querySelector("div");
      console.log(`[DEBUG] tooltipContainer נמצא:`, !!tooltipContainer);

      // 💾 שמירת אלמנט הזמן לפני ההחלפה!
      let savedTimeElement = null;
      if (tooltipContainer) {
        savedTimeElement = tooltipContainer.querySelector(".chord-time-inner");
        console.log(`[DEBUG] ⏰ זמן נמצא לפני החלפה?`, !!savedTimeElement);
        if (savedTimeElement) {
          console.log(`[DEBUG] ⏰ תוכן זמן:`, savedTimeElement.textContent);
          // שמירת העתק של האלמנט
          savedTimeElement = savedTimeElement.cloneNode(true);
        }
      }

      // יצירת דיאגרמה חדשה בפוזיציה החדשה
      console.log(`[DEBUG] קורא ל-renderChordAtPosition...`);
      const newChordElement = renderChordAtPosition(chordName, positionIndex);
      if (!newChordElement) {
        console.warn(
          `[DEBUG] renderChordAtPosition החזיר null - לא ניתן ליצור דיאגרמה חדשה`
        );
        return;
      }
      console.log(`[DEBUG] דיאגרמה חדשה נוצרה בהצלחה:`, newChordElement);

      // העתקת המיכל (ללא הסרת זמן - הוא לא קיים בדיאגרמה החדשה)
      console.log(`[DEBUG] מעתיק את האלמנט...`);
      const containerClone = newChordElement.cloneNode(true);

      if (tooltipContainer) {
        // מציאת הדיאגרמה הישנה (האלמנט עם class chord-diagram)
        const existingDiagram =
          tooltipContainer.querySelector(".chord-diagram")?.parentElement;
        console.log(`[DEBUG] existingDiagram נמצא:`, !!existingDiagram);

        if (existingDiagram) {
          // החלפת הדיאגרמה הישנה בחדשה
          console.log(`[DEBUG] מחליף דיאגרמה קיימת...`);
          tooltipContainer.replaceChild(containerClone, existingDiagram);
          console.log(`[DEBUG] החלפה הושלמה!`);
        } else {
          // אם לא נמצאה דיאגרמה קיימת, הוספה בתחילת המיכל
          console.log(`[DEBUG] לא נמצאה דיאגרמה קיימת - מוסיף בתחילה...`);
          tooltipContainer.insertBefore(
            containerClone,
            tooltipContainer.firstChild
          );
          console.log(`[DEBUG] הוספה הושלמה!`);
        }

        // ✨ החזרת אלמנט הזמן אחרי ההחלפה!
        if (savedTimeElement) {
          console.log(`[DEBUG] ✅ מחזיר את הזמן למקום!`);
          tooltipContainer.appendChild(savedTimeElement);
        }

        // הוספת event listeners מחדש לחצים האפורים
        console.log(`[DEBUG] 🔍 מחפש חצים ב-containerClone...`);
        const leftArrow = containerClone.querySelector(".chord-arrow-left");
        const rightArrow = containerClone.querySelector(".chord-arrow-right");
        console.log(`[DEBUG] 🔍 leftArrow נמצא:`, !!leftArrow, leftArrow);
        console.log(`[DEBUG] 🔍 rightArrow נמצא:`, !!rightArrow, rightArrow);

        if (leftArrow && rightArrow) {
          console.log(`[DEBUG] 🔧 מוסיף event listeners לחצים...`);

          leftArrow.addEventListener(
            "click",
            async (e) => {
              console.log(`[DEBUG] 🖱️ לחיצה על חץ שמאל זוהתה!`);
              e.stopPropagation();
              e.preventDefault();
              await navigateChordPosition(chordName, -1);
            },
            { signal: lyricsChordsPanelController.signal }
          );

          rightArrow.addEventListener(
            "click",
            async (e) => {
              console.log(`[DEBUG] 🖱️ לחיצה על חץ ימין זוהתה!`);
              e.stopPropagation();
              e.preventDefault();
              await navigateChordPosition(chordName, 1);
            },
            { signal: lyricsChordsPanelController.signal }
          );

          leftArrow.style.cursor = "pointer";
          leftArrow.style.pointerEvents = "auto";
          leftArrow.setAttribute("cursor", "pointer"); // SVG attribute

          rightArrow.style.cursor = "pointer";
          rightArrow.style.pointerEvents = "auto";
          rightArrow.setAttribute("cursor", "pointer"); // SVG attribute

          console.log(`[DEBUG] ✓ הוספו event listeners מחדש לחצים האפורים`);
        }

        // עדכון מונה הפוזיציות האפור ב-SVG
        const positionCounter = containerClone.querySelector(
          ".chord-position-counter"
        );
        console.log(`[DEBUG] positionCounter נמצא:`, !!positionCounter);

        if (positionCounter) {
          const positions = chordPositionData.get(chordName);
          if (positions) {
            const newCounterText = `${positionIndex + 1}/${positions.length}`;
            positionCounter.textContent = newCounterText;
            console.log(`[DEBUG] מונה עודכן ל: ${newCounterText}`);
          }
        }

        // 🌐 עדכון גלובוס אחרי שינוי פוזיציה
        console.log(
          `[DEBUG] 🌐 קורא ל-addGlobalPositionIndicator אחרי עדכון...`
        );
        if (leftArrow) {
          const indicatorResult = addGlobalPositionIndicator(
            chordName,
            positionIndex,
            leftArrow
          );
          if (indicatorResult && typeof indicatorResult.finally === "function") {
            indicatorResult.finally(scheduleTooltipPositionControlsPlacement);
          }
        }
        scheduleTooltipPositionControlsPlacement();

        console.log(
          `[DEBUG] עדכון tooltip הושלם - פוזיציה ${positionIndex + 1}`
        );
      } else {
        console.warn(`[DEBUG] tooltipContainer לא נמצא - לא ניתן לעדכן`);
      }
    } catch (error) {
      console.error("[LyricsChords] שגיאה בעדכון דיאגרמה:", error);
    }
  }

  // מיקום tooltip ליד העכבר
  function positionChordTooltip(mouseX, mouseY) {
    if (!chordTooltip) return;

    const tooltipRect = chordTooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = mouseX + 15; // מרחק מהעכבר
    let y = mouseY - tooltipRect.height - 10; // מעל העכבר

    // בדיקה שלא יוצא מהמסך
    if (x + tooltipRect.width > viewportWidth) {
      x = mouseX - tooltipRect.width - 15;
    }
    if (y < 0) {
      y = mouseY + 15; // מתחת לעכבר
    }

    chordTooltip.style.left = `${x}px`;
    chordTooltip.style.top = `${y}px`;
  }

  // ניקוי tooltip
  function cleanupChordTooltip() {
    // ניקוי timeout עם מערכת הבטיחות
    if (tooltipTimeout) {
      clearSafeTimeout(tooltipTimeout, "tooltip-cleanup");
      tooltipTimeout = null;
    }

    // 🆕 ניקוי timeout של הסתרה אוטומטית
    if (tooltipAutoHideTimeout) {
      clearTimeout(tooltipAutoHideTimeout);
      tooltipAutoHideTimeout = null;
    }

    // הסרת tooltip מה-DOM
    if (chordTooltip) {
      try {
        if (chordTooltip.parentNode) {
          chordTooltip.parentNode.removeChild(chordTooltip);
        }
      } catch (error) {
        console.warn("[LyricsChords] שגיאה בהסרת tooltip:", error);
      }
      chordTooltip = null;
    }

    currentHoveredChord = null;
  }

  // הוספת hover listeners לאקורדים
  function addChordHoverListeners() {
    console.log("[LyricsChords] 🔍 DEBUG: addChordHoverListeners נקרא");
    if (!lyricsChordsPanelElement) {
      console.warn("[LyricsChords] ❌ DEBUG: lyricsChordsPanelElement לא קיים");
      return;
    }

    // מציאת כל האקורדים בפאנל
    const chordElements =
      lyricsChordsPanelElement.querySelectorAll(".lyrics-chord");
    console.log(
      `[LyricsChords] 🔍 DEBUG: נמצאו ${chordElements.length} אקורדים בפאנל`
    );

    chordElements.forEach((chordElement) => {
      // בדיקה שלא כבר יש listeners
      if (chordElement.hasAttribute("data-chord-hover-added")) return;

      // 🎸 לא שומרים את chordName ב-closure - קוראים אותו בזמן ה-hover
      // כדי שיתעדכן כשמשנים קאפו
      const initialChordName = chordElement.textContent.trim();
      if (!initialChordName) return;

      // פונקציות event listeners
      const mouseEnterHandler = (event) => {
        // 🎸 קריאת שם האקורד בזמן ה-hover (לא מה-closure) - כדי לקבל את השם המתורגם העדכני
        const chordName = chordElement.textContent.trim();

        // ביטול timeout קודם עם מערכת הבטיחות
        if (tooltipTimeout) {
          clearSafeTimeout(tooltipTimeout, "tooltip-previous");
          tooltipTimeout = null;
        }

        currentHoveredChord = chordName;

        // קריאת זמן האקורד מה-DOM
        const chordTime = chordElement.getAttribute("data-time");

        // עיכוב קצר לפני הצגת tooltip - שימוש במערכת הבטיחות
        tooltipTimeout = createSafeTimeout(
          async () => {
            if (currentHoveredChord === chordName) {
              await createChordTooltip(
                chordName,
                event.clientX,
                event.clientY,
                chordTime
              );
            }
            tooltipTimeout = null;
          },
          50,
          "tooltip-show"
        ); // 50ms עיכוב - מהיר יותר!
      };

      const mouseLeaveHandler = () => {
        // 🔧 FIX: לא להסתיר tooltip אם הגלילה היא פרוגרמטית (Sync with YouTube)
        if (programmaticScroll) {
          console.log(
            "[LyricsChords] 🔍 DEBUG: Ignoring mouseleave - programmatic scroll active"
          );
          return; // לא להסתיר את ה-tooltip
        }

        currentHoveredChord = null;

        // עיכוב קצר לפני הסתרת tooltip - שימוש במערכת הבטיחות
        tooltipTimeout = createSafeTimeout(
          () => {
            cleanupChordTooltip();
            tooltipTimeout = null;
          },
          100,
          "tooltip-hide"
        );
      };

      const mouseMoveHandler = (event) => {
        // 🎸 קריאת שם האקורד בזמן אמת (לא מה-closure)
        const currentChordName = chordElement.textContent.trim();
        if (chordTooltip && currentHoveredChord === currentChordName) {
          positionChordTooltip(event.clientX, event.clientY);

          // 🆕 איפוס טיימר ההסתרה האוטומטית כשהעכבר זז
          if (tooltipAutoHideTimeout) {
            clearTimeout(tooltipAutoHideTimeout);
            tooltipAutoHideTimeout = null;
          }

          // הגדרת טיימר חדש - 5 שניות
          tooltipAutoHideTimeout = setTimeout(() => {
            console.log(
              "[LyricsChords] 🕐 DEBUG: Auto-hide tooltip after 5 seconds of no movement"
            );
            cleanupChordTooltip();
            tooltipAutoHideTimeout = null;
          }, 5000); // 5 שניות
        }
      };

      // הוספת listeners
      chordElement.addEventListener("mouseenter", mouseEnterHandler);
      chordElement.addEventListener("mouseleave", mouseLeaveHandler);
      chordElement.addEventListener("mousemove", mouseMoveHandler);

      // סימון שlisteners נוספו
      chordElement.setAttribute("data-chord-hover-added", "true");

      // שמירת listeners לניקוי
      tooltipListeners.add({
        element: chordElement,
        mouseEnter: mouseEnterHandler,
        mouseLeave: mouseLeaveHandler,
        mouseMove: mouseMoveHandler,
      });
    });

    console.log(
      `[LyricsChords] נוספו hover listeners ל-${chordElements.length} אקורדים`
    );
  }

  // ניקוי כל hover listeners
  function cleanupChordHoverListeners() {
    // ניקוי tooltip
    cleanupChordTooltip();

    // ניקוי כל הlisteners
    tooltipListeners.forEach((listenerData) => {
      const { element, mouseEnter, mouseLeave, mouseMove } = listenerData;
      if (element && element.removeEventListener) {
        element.removeEventListener("mouseenter", mouseEnter);
        element.removeEventListener("mouseleave", mouseLeave);
        element.removeEventListener("mousemove", mouseMove);
        element.removeAttribute("data-chord-hover-added");
      }
    });

    tooltipListeners.clear();

    // ניקוי משתנים חדשים לניווט פוזיציות
    currentChordPositions.clear();
    chordPositionData.clear();

    console.log("[LyricsChords] ניקוי hover listeners ונתוני פוזיציות הושלם");
  }

  /*------------------------------------------------------------
  16. רענון מיידי של הפאנל כשמשנים chords mode
------------------------------------------------------------*/
  window.refreshLyricsChordsPanel = async function (overrideShowTranslation = null, overrideSelectedCustomPromptId = null) {
    console.log("[LyricsChords] מתחיל רענון פאנל למצב חדש:", window.chordsMode, {
      overrideShowTranslation,
      overrideSelectedCustomPromptId
    });

    // בדיקה שהפאנל אכן פתוח
    if (!window.lyricsChordsPanelActive || !lyricsChordsPanelElement) {
      console.warn("[LyricsChords] פאנל לא פתוח - מדלג על רענון");
      return;
    }

    try {
      // עצירת סנכרון זמנית
      stopLyricsChordsSync();

      // ניקוי cache אלמנטים לפני טעינה מחדש
      cachedWordElements = null;
      cachedChordElements = null;

      // ניקוי hover listeners קיימים
      cleanupChordHoverListeners();

      // טעינת תוכן מחדש עם המצב החדש (העברת פרמטרים)
      await loadLyricsChordsContent(overrideShowTranslation, overrideSelectedCustomPromptId);

      // הפעלת סנכרון מחדש
      startLyricsChordsSync();

      console.log("[LyricsChords] ✅ רענון פאנל הושלם בהצלחה");
    } catch (error) {
      console.error("[LyricsChords] שגיאה ברענון פאנל:", error);
    }
  };

  /*------------------------------------------------------------
  16.5. מערכת Countdown - ספירה לאחור
------------------------------------------------------------*/

  // משתנה גלובלי למנהל הספירה
  let countdownManagerInstance = null;

  /**
   * אתחול מנהל הספירה
   */
  function initializeCountdownManager() {
    console.log("[LyricsChords] מאתחל Countdown Manager");

    try {
      // טעינת countdownManager.js אם לא נטען
      if (!window.CountdownManager) {
        const countdownUrl = chrome.runtime.getURL("utils/countdownManager.js");
        import(countdownUrl)
          .then(() => {
            console.log("[LyricsChords] CountdownManager נטען בהצלחה");
            startCountdown();
          })
          .catch((err) => {
            console.error("[LyricsChords] שגיאה בטעינת CountdownManager:", err);
          });
      } else {
        startCountdown();
      }

      // טעינת countdown.css
      if (!document.querySelector('link[href*="countdown.css"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = chrome.runtime.getURL("css/countdown.css");
        document.head.appendChild(link);
        console.log("[LyricsChords] countdown.css נטען בהצלחה");
      }
    } catch (error) {
      console.error("[LyricsChords] שגיאה באתחול Countdown Manager:", error);
    }
  }

  /**
   * התחלת הספירה
   */
  function startCountdown() {
    // יצירת instance חדש
    countdownManagerInstance = new window.CountdownManager();

    // קבלת אלמנט הווידאו
    const videoElement = document.querySelector("video.html5-main-video");

    if (!videoElement) {
      console.warn("[LyricsChords] לא נמצא אלמנט ווידאו");
      return;
    }

    // אתחול המנהל
    const success = countdownManagerInstance.initialize(
      lyricsChordsPanelElement,
      videoElement
    );

    if (success) {
      console.log("[LyricsChords] Countdown Manager אותחל בהצלחה");
    }
  }

  /**
   * ניקוי מנהל הספירה
   */
  function cleanupCountdownManager() {
    if (countdownManagerInstance) {
      console.log("[LyricsChords] 🧹 מנקה Countdown Manager");
      countdownManagerInstance.cleanup();
      countdownManagerInstance = null;
      console.log(
        "[LyricsChords] ✅ Countdown Manager נוקה - אין דליפות זיכרון"
      );
    }
  }

  /*------------------------------------------------------------
  17. ניקוי כשעוברים לסרטון אחר או כשמסתירים את הכפתור
------------------------------------------------------------*/
  window.cleanupLyricsChordsPanel = function () {
    // Delegate to the canonical implementation once it is defined later in file.
    if (typeof window.__ycCleanupLyricsChordsPanelImpl === "function") {
      return window.__ycCleanupLyricsChordsPanelImpl();
    }
    // Early fallback (safe minimal cleanup path before canonical impl is loaded).
    try {
      stopLyricsChordsSync();
      cleanupCountdownManager();
      if (lyricsChordsPanelController) {
        try {
          lyricsChordsPanelController.abort();
        } catch (abortError) {
          console.warn("[LyricsChords] Abort cleanup failed:", abortError);
        }
        lyricsChordsPanelController = null;
      }
    } catch (error) {
      console.error("[LyricsChords] fallback cleanup failed:", error);
    } finally {
      window.lyricsChordsPanelActive = false;
    }
  };

  // הוספה לניקוי הגלובלי - רק פעם אחת
  if (window.addEventListener && !window.ycLyricsChordsBeforeUnloadAdded) {
    // ניקוי listeners קודמים אם קיימים
    if (window.ycLyricsChordsCleanupHandler) {
      window.removeEventListener(
        "beforeunload",
        window.ycLyricsChordsCleanupHandler
      );
      window.ycLyricsChordsCleanupHandler = null;
    }

    // יצירת handler חדש ושמירתו לניקוי עתידי
    window.ycLyricsChordsCleanupHandler = function () {
      console.log("[LyricsChords] beforeunload - מפעיל ניקוי");
      if (typeof window.cleanupLyricsChordsPanel === "function") {
        window.cleanupLyricsChordsPanel();
      }
      // ניקוי עצמי
      window.ycLyricsChordsCleanupHandler = null;
      window.ycLyricsChordsBeforeUnloadAdded = false;
    };

    // הוספת listener חדש עם once: true
    window.addEventListener(
      "beforeunload",
      window.ycLyricsChordsCleanupHandler,
      { once: true }
    );
    window.ycLyricsChordsBeforeUnloadAdded = true;

    console.log("[LyricsChords] beforeunload listener חדש נוסף");
  }

  /*------------------------------------------------------------
  פונקציות ניהול גודל פונט
------------------------------------------------------------*/

  // טעינת גודל פונט מהאחסון
  function loadFontSize() {
    try {
      const savedSize = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
      if (savedSize) {
        const size = parseInt(savedSize, 10);
        if (size >= MIN_FONT_SIZE && size <= MAX_FONT_SIZE) {
          currentFontSize = size;
          return;
        }
      }
    } catch (e) {
      console.log("[LyricsChords] שגיאה בטעינת גודל פונט:", e);
    }
    currentFontSize = 15; // ברירת מחדל
  }

  // שמירת גודל פונט באחסון
  function saveFontSize() {
    try {
      localStorage.setItem(FONT_SIZE_STORAGE_KEY, currentFontSize.toString());
    } catch (e) {
      console.log("[LyricsChords] שגיאה בשמירת גודל פונט:", e);
    }
  }

  // החלת גודל פונט על הפאנל
  function applyFontSize() {
    if (!lyricsChordsPanelElement) return;

    // עדכון גודל טקסט של מילים
    const wordElements =
      lyricsChordsPanelElement.querySelectorAll(".lyrics-word");
    wordElements.forEach((word) => {
      word.style.fontSize = currentFontSize + "px";
    });

    // עדכון גודל טקסט של אקורדים
    const chordElements =
      lyricsChordsPanelElement.querySelectorAll(".lyrics-chord");
    chordElements.forEach((chord) => {
      chord.style.fontSize = currentFontSize - 1 + "px"; // אקורדים קצת יותר קטנים
    });

    // 🎯 עדכון גודל טקסט של custom prompt response
    const customPromptElements =
      lyricsChordsPanelElement.querySelectorAll(".custom-prompt-response");
    customPromptElements.forEach((element) => {
      element.style.fontSize = currentFontSize + "px";
    });

    // עדכון תצוגת הגודל
    const displayElement =
      lyricsChordsPanelElement.querySelector("#font-size-display");
    if (displayElement) {
      displayElement.textContent = currentFontSize;
    }

    // עדכון מצב הכפתורים
    updateFontSizeButtons();
  }

  // עדכון מצב כפתורי שינוי גודל
  function updateFontSizeButtons() {
    if (!lyricsChordsPanelElement) return;

    const decreaseBtn =
      lyricsChordsPanelElement.querySelector("#font-decrease");
    const increaseBtn =
      lyricsChordsPanelElement.querySelector("#font-increase");

    if (decreaseBtn) {
      decreaseBtn.disabled = currentFontSize <= MIN_FONT_SIZE;
      decreaseBtn.style.opacity = decreaseBtn.disabled ? "0.5" : "1";
    }

    if (increaseBtn) {
      increaseBtn.disabled = currentFontSize >= MAX_FONT_SIZE;
      increaseBtn.style.opacity = increaseBtn.disabled ? "0.5" : "1";
    }
  }

  // הגדלת גודל פונט
  function increaseFontSize() {
    if (currentFontSize < MAX_FONT_SIZE) {
      currentFontSize++;
      applyFontSize();
      saveFontSize();
      console.log("[LyricsChords] גודל פונט הוגדל ל:", currentFontSize);
    }
  }

  // הקטנת גודל פונט
  function decreaseFontSize() {
    if (currentFontSize > MIN_FONT_SIZE) {
      currentFontSize--;
      applyFontSize();
      saveFontSize();
      console.log("[LyricsChords] גודל פונט הוקטן ל:", currentFontSize);
    }
  }

  // הגדרת event listeners לכפתורי שינוי גודל
  function setupFontSizeControls() {
    if (!lyricsChordsPanelElement) return;

    // טעינת גודל שמור
    loadFontSize();

    const decreaseBtn =
      lyricsChordsPanelElement.querySelector("#font-decrease");
    const increaseBtn =
      lyricsChordsPanelElement.querySelector("#font-increase");

    if (decreaseBtn) {
      decreaseBtn.addEventListener("click", decreaseFontSize, {
        signal: lyricsChordsPanelController.signal,
      });
    }

    if (increaseBtn) {
      increaseBtn.addEventListener("click", increaseFontSize, {
        signal: lyricsChordsPanelController.signal,
      });
    }

    // החלת גודל ראשוני
    setTimeout(() => {
      applyFontSize();
    }, 100); // המתנה קצרה כדי שהתוכן יטען

    console.log("[LyricsChords] כפתורי שינוי גודל פונט הוגדרו");
  }

  /*------------------------------------------------------------
  פונקציות ניהול אלמנטי הבקרה החדשים
------------------------------------------------------------*/

  // משתנים לניהול מצבי הגלילה
  let syncWithYouTubeActive = true; // ברירת מחדל - פעיל
  let autoScrollActive = false; // כבוי ברירת מחדל
  let autoScrollSpeed = 0.4; // מהירות ברירת מחדל
  let themeState = 1; // מצב Theme: 0=BLACK, 1=SEPIA (ברירת מחדל), 2=LIGHT
  let chordsToggleActive = true; // מצב MINI toggle - פעיל כברירת מחדל
  let chordDiagramsActive = true; // מצב Chord Diagrams - ON ברירת מחדל
  let countdownActive = true; // מצב Countdown - ON ברירת מחדל
  let chordsAvailable = false; // האם יש אקורדים זמינים לשיר הנוכחי
  let chordsPreviewActive = true; // מצב Chords Preview - ON ברירת מחדל
  // Keeps highlighted lyrics at the same visual height when MINI collapses controls.
  let miniControlsHeightPx = 56;
  const MIN_SCROLL_SPEED = 0.1;
  const MAX_SCROLL_SPEED = 3;

  // טעינת מצבים שמורים מ-localStorage
  function loadToggleStates() {
    try {
      // טעינת מצב Theme (0=BLACK, 1=SEPIA, 2=LIGHT)
      const savedThemeState = localStorage.getItem("youchords_theme_state");
      if (savedThemeState !== null) {
        const parsed = parseInt(savedThemeState, 10);
        if (parsed >= 0 && parsed <= 2) {
          themeState = parsed;
        }
        console.log("[LyricsChords] טענתי מצב Theme משמור:", themeState);
      }

      const savedChordsState = localStorage.getItem("youchords_mini_mode_active");
      if (savedChordsState !== null) {
        chordsToggleActive = savedChordsState === "true";
        console.log(
          "[LyricsChords] טענתי מצב MINI משמור:",
          chordsToggleActive
        );
      } else {
        chordsToggleActive = true;
        console.log("[LyricsChords] מצב MINI: ON (ברירת מחדל)");
      }

      // טעינת מהירות גלילה שמורה
      const savedScrollSpeed = localStorage.getItem(
        "youchords_auto_scroll_speed"
      );
      if (savedScrollSpeed !== null) {
        const speed = parseFloat(savedScrollSpeed);
        if (speed >= MIN_SCROLL_SPEED && speed <= MAX_SCROLL_SPEED) {
          autoScrollSpeed = speed;
          console.log(
            "[LyricsChords] טענתי מהירות גלילה משמורה:",
            autoScrollSpeed
          );
        }
      }

      // טעינת מצב Sync with YouTube שמור
      const savedSyncState = localStorage.getItem(
        "youchords_sync_with_youtube"
      );
      if (savedSyncState !== null) {
        syncWithYouTubeActive = savedSyncState === "true";
        console.log(
          "[LyricsChords] טענתי מצב Sync with YouTube משמור:",
          syncWithYouTubeActive
        );
      }

      // טעינת מצב Chord Diagrams שמור
      const savedChordDiagramsState = localStorage.getItem(
        "youchords_chord_diagrams_active"
      );
      if (savedChordDiagramsState !== null) {
        chordDiagramsActive = savedChordDiagramsState === "true";
        console.log(
          "[LyricsChords] טענתי מצב Chord Diagrams משמור:",
          chordDiagramsActive
        );
      } else {
        // ברירת מחדל: ON
        chordDiagramsActive = true;
        console.log("[LyricsChords] מצב Chord Diagrams: ON (ברירת מחדל)");
      }

      // טעינת מצב Countdown שמור
      const savedCountdownState = localStorage.getItem(
        "youchords_countdown_active"
      );
      if (savedCountdownState !== null) {
        countdownActive = savedCountdownState === "true";
        console.log(
          "[LyricsChords] טענתי מצב Countdown משמור:",
          countdownActive
        );
      } else {
        // ברירת מחדל: ON
        countdownActive = true;
        console.log("[LyricsChords] מצב Countdown: ON (ברירת מחדל)");
      }

      // עדכון משתנה גלובלי לשימוש countdownManager
      window.countdownActive = countdownActive;
      // Countdown duration selection was removed; clear legacy persisted value
      localStorage.removeItem("youchords_countdown_duration");

      // טעינת מצב Chords Preview שמור
      const savedChordsPreviewState = localStorage.getItem(
        "youchords_chords_preview_active"
      );
      if (savedChordsPreviewState !== null) {
        chordsPreviewActive = savedChordsPreviewState === "true";
        console.log(
          "[LyricsChords] טענתי מצב Chords Preview משמור:",
          chordsPreviewActive
        );
      } else {
        // ברירת מחדל: ON
        chordsPreviewActive = true;
        console.log("[LyricsChords] מצב Chords Preview: ON (ברירת מחדל)");
      }
    } catch (error) {
      console.warn("[LyricsChords] שגיאה בטעינת מצבים שמורים:", error);
    }
  }

  // שמירת מצב Theme (0=BLACK, 1=SEPIA, 2=LIGHT)
  function saveThemeState() {
    try {
      localStorage.setItem("youchords_theme_state", themeState.toString());
      console.log("[LyricsChords] שמרתי מצב Theme:", themeState);
    } catch (error) {
      console.warn("[LyricsChords] שגיאה בשמירת מצב Theme:", error);
    }
  }

  // שמירת מצב MINI toggle
  function saveChordsToggleState() {
    try {
      localStorage.setItem(
        "youchords_mini_mode_active",
        chordsToggleActive.toString()
      );
      console.log("[LyricsChords] שמרתי מצב MINI:", chordsToggleActive);
    } catch (error) {
      console.warn("[LyricsChords] שגיאה בשמירת מצב MINI:", error);
    }
  }

  function applyMiniModeLayoutState() {
    if (!lyricsChordsPanelElement) return;

    const controls = lyricsChordsPanelElement.querySelector(
      ".lyrics-chords-controls"
    );
    // Cache controls height while visible so mini-mode scroll can compensate.
    if (controls && controls.offsetHeight > 0) {
      miniControlsHeightPx = controls.offsetHeight;
    }

    lyricsChordsPanelElement.classList.toggle("mini-mode", chordsToggleActive);
  }

  // שמירת מהירות גלילה
  function saveAutoScrollSpeed() {
    try {
      localStorage.setItem(
        "youchords_auto_scroll_speed",
        autoScrollSpeed.toString()
      );
      console.log("[LyricsChords] שמרתי מהירות גלילה:", autoScrollSpeed);
    } catch (error) {
      console.warn("[LyricsChords] שגיאה בשמירת מהירות גלילה:", error);
    }
  }

  // שמירת מצב Chords Preview
  function saveChordsPreviewState() {
    try {
      localStorage.setItem(
        "youchords_chords_preview_active",
        chordsPreviewActive.toString()
      );
      console.log(
        "[LyricsChords] שמרתי מצב Chords Preview:",
        chordsPreviewActive
      );
    } catch (error) {
      console.warn("[LyricsChords] שגיאה בשמירת מצב Chords Preview:", error);
    }
  }

  // שמירת מצב Sync with YouTube
  function saveSyncWithYouTubeState() {
    try {
      localStorage.setItem(
        "youchords_sync_with_youtube",
        syncWithYouTubeActive.toString()
      );
      console.log(
        "[LyricsChords] שמרתי מצב Sync with YouTube:",
        syncWithYouTubeActive
      );
    } catch (error) {
      console.warn("[LyricsChords] שגיאה בשמירת מצב Sync with YouTube:", error);
    }
  }

  // שמירת מצב Chord Diagrams
  function saveChordDiagramsState() {
    try {
      localStorage.setItem(
        "youchords_chord_diagrams_active",
        chordDiagramsActive.toString()
      );
      console.log(
        "[LyricsChords] שמרתי מצב Chord Diagrams:",
        chordDiagramsActive
      );
    } catch (error) {
      console.warn("[LyricsChords] שגיאה בשמירת מצב Chord Diagrams:", error);
    }
  }

  // שמירת מצב Countdown
  function saveCountdownState() {
    try {
      localStorage.setItem(
        "youchords_countdown_active",
        countdownActive.toString()
      );
      console.log("[LyricsChords] שמרתי מצב Countdown:", countdownActive);
    } catch (error) {
      console.warn("[LyricsChords] שגיאה בשמירת מצב Countdown:", error);
    }
  }

  // משתנים לניהול הגלילה
  let scrollInterval = null;
  let lastHighlightedElement = null;
  let scrollAnimationFrame = null;

  // משתנים לניהול גרירת Progress Bar
  let isDraggingProgressBar = false;
  let progressBarListeners = {
    mousedown: null,
    mousemove: null,
    mouseup: null,
  };

  // הגדרת event listeners לאלמנטי הבקרה החדשים
  function setupScrollControls() {
    if (!lyricsChordsPanelElement) return;

    // טעינת מצבים שמורים
    loadToggleStates();

    // אלמנטי Toggle
    const syncYouTubeToggle = lyricsChordsPanelElement.querySelector(
      "#sync-youtube-toggle"
    );
    const autoScrollToggle = lyricsChordsPanelElement.querySelector(
      "#auto-scroll-toggle"
    );
    const themeCycleBtn =
      lyricsChordsPanelElement.querySelector("#theme-cycle-btn");
    const chordsToggle =
      lyricsChordsPanelElement.querySelector("#chords-toggle");

    // כפתורי מהירות
    const speedDecrease =
      lyricsChordsPanelElement.querySelector("#speed-decrease");
    const speedIncrease =
      lyricsChordsPanelElement.querySelector("#speed-increase");

    // Event listener ל-Sync with YouTube toggle
    if (syncYouTubeToggle) {
      syncYouTubeToggle.addEventListener(
        "click",
        function () {
          syncWithYouTubeActive = !syncWithYouTubeActive;

          if (syncWithYouTubeActive) {
            // כבה Auto scroll אם פעיל
            if (autoScrollActive) {
              autoScrollActive = false;
            }
            console.log("[LyricsChords] Sync with YouTube הופעל");
            startScrolling(); // הפעלת הגלילה
          } else {
            console.log("[LyricsChords] Sync with YouTube כובה");
            stopScrolling(); // עצירת הגלילה
          }

          updateToggleStates();
          updateSpeedControlsState();
          saveSyncWithYouTubeState(); // שמירת המצב החדש
        },
        { signal: lyricsChordsPanelController.signal }
      );
    }

    // Event listener ל-Auto scroll toggle
    if (autoScrollToggle) {
      autoScrollToggle.addEventListener(
        "click",
        function () {
          autoScrollActive = !autoScrollActive;

          if (autoScrollActive) {
            // כבה Sync with YouTube אם פעיל
            if (syncWithYouTubeActive) {
              syncWithYouTubeActive = false;
            }
            console.log(
              "[LyricsChords] Auto scroll הופעל במהירות:",
              autoScrollSpeed
            );
            startScrolling(); // הפעלת הגלילה
          } else {
            console.log("[LyricsChords] Auto scroll כובה");
            stopScrolling(); // עצירת הגלילה
          }

          updateToggleStates();
          updateSpeedControlsState();
          saveSyncWithYouTubeState(); // שמירת מצב Sync מעודכן
        },
        { signal: lyricsChordsPanelController.signal }
      );
    }

    // Event listener ל-Theme icon (3 מצבים: BLACK/SEPIA/LIGHT)
    if (themeCycleBtn) {
      themeCycleBtn.addEventListener(
        "click",
        function () {
          // מעבר למצב הבא במעגל: 0→1→2→0
          themeState = (themeState + 1) % 3;
          const themeNames = ["black", "sepia", "light"];

          console.log(
            "[LyricsChords] Theme שונה ל:",
            themeNames[themeState].toUpperCase()
          );

          // עדכון ויזואלי מיידי
          updateToggleStates();

          // שמירה ב-localStorage
          saveThemeState();

          // 🎨 Dispatch theme change event for Preview Panel
          window.dispatchEvent(
            new CustomEvent("yc:themeChanged", {
              detail: {
                theme: themeNames[themeState],
                themeState: themeState,
              },
            })
          );
          console.log("[LyricsChords] 🎨 Dispatched yc:themeChanged event");
        },
        { signal: lyricsChordsPanelController.signal }
      );
    }

    // Event listener ל-MINI toggle
    if (chordsToggle) {
      chordsToggle.addEventListener(
        "click",
        function () {
          // שינוי מצב ויזואלי
          chordsToggleActive = !chordsToggleActive;

          // עדכון ויזואלי של הכפתור
          if (chordsToggleActive) {
            chordsToggle.classList.add("active");
          } else {
            chordsToggle.classList.remove("active");
          }

          applyMiniModeLayoutState();

          console.log(
            "[LyricsChords] MINI toggle שונה ל:",
            chordsToggleActive ? "ON" : "OFF"
          );

          // עדכון אייקון Chords Preview
          updateChordsPreviewIcon();

          // Countdown תמיד גלוי - אין צורך בעדכון דינמי

          // שמירה ל-localStorage
          saveChordsToggleState();
        },
        { signal: lyricsChordsPanelController.signal }
      );
    }

    // Event listener לכפתור הדינמי (Chord Diagrams / Countdown)
    // Event listener ל-Countdown Toggle
    const countdownToggle =
      lyricsChordsPanelElement.querySelector("#countdown-toggle");
    if (countdownToggle) {
      countdownToggle.addEventListener(
        "click",
        function () {
          // Countdown - החלפת מצב
          countdownActive = !countdownActive;

          // עדכון משתנה גלובלי לשימוש countdownManager
          window.countdownActive = countdownActive;

          // עדכון ויזואלי
          if (countdownActive) {
            countdownToggle.classList.add("active");
            console.log("[LyricsChords] Countdown הופעל");
          } else {
            countdownToggle.classList.remove("active");
            console.log("[LyricsChords] Countdown כובה");
          }

          // שמירת המצב
          saveCountdownState();
        },
        { signal: lyricsChordsPanelController.signal }
      );
    }

    // 🌐 Event listener ל-Language Selector (Globe Button)
    const languageSelectorBtn = lyricsChordsPanelElement.querySelector("#language-selector-btn");
    const languageDropdown = lyricsChordsPanelElement.querySelector("#language-dropdown");

    if (languageSelectorBtn && languageDropdown) {
      // 🎯 בדיקה אם יש יותר משפה אחת - אם לא, מסתירים את הכפתור
      // 🎯 גם מעדכנים את קוד השפה הנוכחי
      if (window.LanguageSelector) {
        window.LanguageSelector.getAvailableLanguages().then(languages => {
          if (!languages || languages.length <= 1) {
            languageSelectorBtn.style.display = "none";
            console.log("[LyricsChords] 🌐 Only one language available - hiding language selector");
          } else {
            languageSelectorBtn.style.display = "";
            // 🎯 עדכון קוד השפה הנוכחי
            const currentLang = window.currentSubtitleLanguage || languages[0]?.code || "en";
            const langCodeText = languageSelectorBtn.querySelector(".language-code-text");
            if (langCodeText) {
              langCodeText.textContent = getDisplayLangCodePanel(currentLang).toUpperCase();
            }
          }
        });
      }

      // פתיחה/סגירה של dropdown
      languageSelectorBtn.addEventListener(
        "click",
        async function (e) {
          e.stopPropagation();
          const isOpen = languageDropdown.classList.contains("open");

          if (isOpen) {
            languageDropdown.classList.remove("open");
          } else {
            // טעינת רשימת השפות הזמינות - משתמש ב-LanguageSelector
            if (window.LanguageSelector) {
              await window.LanguageSelector.populateDropdown(languageDropdown);
            }
            languageDropdown.classList.add("open");
          }
        },
        { signal: lyricsChordsPanelController.signal }
      );

      // סגירת dropdown בלחיצה מחוץ לו
      document.addEventListener(
        "click",
        function (e) {
          if (!languageSelectorBtn.contains(e.target) && !languageDropdown.contains(e.target)) {
            languageDropdown.classList.remove("open");
          }
        },
        { signal: lyricsChordsPanelController.signal }
      );
    }

    // 🌐 האזנה לשינוי שפה (מהפאנל או מהקרוסלה)
    window.addEventListener(
      "yc:languageChanged",
      async function (e) {
        console.log("[LyricsChords] 🌐 Language changed event received:", e.detail.langCode);

        // 🎯 עדכון קוד השפה בפאנל
        const langCodeText = lyricsChordsPanelElement?.querySelector(".language-code-text");
        if (langCodeText && e.detail.langCode) {
          langCodeText.textContent = getDisplayLangCodePanel(e.detail.langCode).toUpperCase();
        }

        // עדכון hasWordLevelSubtitles לפי השפה החדשה
        const videoId = e.detail.videoId;
        let subtitlesData = await window.databaseManager?.loadFromDatabase("subtitles", videoId);
        const aiMode = await readAiMode();
        subtitlesData = await normalizeActiveSubtitlesData(subtitlesData, aiMode);
        if (subtitlesData) {
          window.hasWordLevelSubtitles = !!subtitlesData.wordSRT;

          // מצב MINI נשמר פר-משתמש ואינו תלוי בסוג כתוביות
          updateToggleStates();
        }

        // ניקוי listeners ישנים
        if (window.lyricsChordsDelegatedListeners) {
          window.lyricsChordsDelegatedListeners.forEach((listenerData) => {
            try {
              listenerData.element?.removeEventListener(listenerData.type, listenerData.listener);
            } catch (e) { }
          });
          window.lyricsChordsDelegatedListeners.clear();
        }

        // עדכון התוכן
        await loadLyricsChordsContent();

        // הוספת event listeners חדשים
        addWordClickListeners();

        // 🔄 רענון כתוביות הקרוסלה
        if (window.ycCarouselSubtitles && typeof window.ycCarouselSubtitles._preprocessSubtitles === 'function') {
          window.ycCarouselSubtitles.processedSubtitles = window.ycCarouselSubtitles._preprocessSubtitles();
          console.log("[LyricsChords] 🔄 Refreshed carousel subtitles after language switch");
        }
      },
      { signal: lyricsChordsPanelController.signal }
    );

    // Event listeners לכפתורי מהירות
    if (speedDecrease) {
      speedDecrease.addEventListener(
        "click",
        function () {
          if (autoScrollSpeed > MIN_SCROLL_SPEED) {
            autoScrollSpeed = Math.max(MIN_SCROLL_SPEED, autoScrollSpeed - 0.1);
            console.log(
              "[LyricsChords] מהירות גלילה הוקטנה ל:",
              autoScrollSpeed
            );
            updateSpeedDisplay();
            updateSpeedControlsState();
            saveAutoScrollSpeed(); // שמירת המהירות החדשה
            // הפעלה מחדש אם Auto scroll פעיל
            if (autoScrollActive) {
              startScrolling();
            }
          }
        },
        { signal: lyricsChordsPanelController.signal }
      );
    }

    if (speedIncrease) {
      speedIncrease.addEventListener(
        "click",
        function () {
          if (autoScrollSpeed < MAX_SCROLL_SPEED) {
            autoScrollSpeed = Math.min(MAX_SCROLL_SPEED, autoScrollSpeed + 0.1);
            console.log(
              "[LyricsChords] מהירות גלילה הוגדלה ל:",
              autoScrollSpeed
            );
            updateSpeedDisplay();
            updateSpeedControlsState();
            saveAutoScrollSpeed(); // שמירת המהירות החדשה
            // הפעלה מחדש אם Auto scroll פעיל
            if (autoScrollActive) {
              startScrolling();
            }
          }
        },
        { signal: lyricsChordsPanelController.signal }
      );
    }

    // Event listener ל-Chords Preview toggle
    const chordsPreviewToggle = lyricsChordsPanelElement.querySelector(
      "#chords-preview-toggle"
    );
    if (chordsPreviewToggle) {
      chordsPreviewToggle.addEventListener(
        "click",
        function () {
          // בדיקה אם אין אקורדים זמינים ל-Preview - אם כן, לא לעשות כלום
          if (!window.chordsAvailableForPreview) {
            console.log(
              "[LyricsChords] לא ניתן להפעיל Chords Preview - אין אקורדים"
            );
            return;
          }

          // החלפת מצב
          chordsPreviewActive = !chordsPreviewActive;

          console.log(
            "[LyricsChords] Chords Preview שונה ל:",
            chordsPreviewActive ? "ON" : "OFF"
          );

          // עדכון ויזואלי
          updateChordsPreviewIcon();

          // שמירת המצב
          saveChordsPreviewState();

          // Toggle the preview panel
          if (window.ycChordsPreviewPanel) {
            window.ycChordsPreviewPanel.toggle();
          }
        },
        { signal: lyricsChordsPanelController.signal }
      );

      // 🎯 האזנה לסגירת Preview Panel מכפתור ה-X
      window.addEventListener(
        "yc:previewPanelClosed",
        function () {
          console.log("[LyricsChords] 🔴 Preview panel closed from X button");
          chordsPreviewActive = false;
          updateChordsPreviewIcon();
          saveChordsPreviewState();
        },
        { signal: lyricsChordsPanelController.signal }
      );
    }

    // Event listener ל-Sentence Mode Toggle (punctuation line breaks)
    const sentenceModeToggle = lyricsChordsPanelElement.querySelector(
      "#sentence-mode-toggle"
    );
    if (sentenceModeToggle) {
      // Load saved state (Default: true - ON)
      const savedState = localStorage.getItem("yc_sentence_mode");
      window.ycSentenceModeEnabled = savedState === null ? true : savedState === "true";

      // Update visual state
      if (window.ycSentenceModeEnabled) {
        sentenceModeToggle.classList.add("active");
      } else {
        sentenceModeToggle.classList.remove("active");
      }

      sentenceModeToggle.addEventListener(
        "click",
        async function () {
          // Toggle state
          window.ycSentenceModeEnabled = !window.ycSentenceModeEnabled;

          console.log(
            "[LyricsChords] Sentence Mode שונה ל:",
            window.ycSentenceModeEnabled ? "ON" : "OFF"
          );

          // Update visual
          if (window.ycSentenceModeEnabled) {
            sentenceModeToggle.classList.add("active");
          } else {
            sentenceModeToggle.classList.remove("active");
          }

          // Save state
          localStorage.setItem("yc_sentence_mode", window.ycSentenceModeEnabled);

          // Refresh panel content
          if (typeof window.refreshLyricsChordsPanel === "function") {
            await window.refreshLyricsChordsPanel();
          }
        },
        { signal: lyricsChordsPanelController.signal }
      );
    }

    // הגדרת מצב ראשוני
    updateToggleStates();
    updateSpeedDisplay();
    updateSpeedControlsState();
    updateDynamicFeatureButton(); // עדכון ראשוני של הכפתור הדינמי
    updateChordsPreviewIcon(); // עדכון ראשוני של אייקון Chords Preview

    /* ---------------------------------------------------------
     האזנה לגלילה ידנית בפאנל
  --------------------------------------------------------- */
    const content = getLyricsContainer();
    if (content) {
      content.addEventListener("scroll", (event) => handleManualScroll(event), {
        passive: true,
        signal: lyricsChordsPanelController.signal,
      });

      // מאזיני עכבר לזיהוי גרירה
      content.addEventListener(
        "mousedown",
        (event) => {
          isMouseDragging = true;
          console.log("[LyricsChords] התחלת גרירת עכבר בפאנל");
        },
        { signal: lyricsChordsPanelController.signal }
      );

      // מאזין mouseup גלובלי (כי העכבר יכול לצאת מהפאנל)
      document.addEventListener("mouseup", handleMouseUp, {
        signal: lyricsChordsPanelController.signal,
      });

      console.log("[LyricsChords] מאזיני גלילה ועכבר נוספו");
    }

    console.log("[LyricsChords] אלמנטי הבקרה החדשים הוגדרו");
  }

  /* ------------------------------------------------------------
   טיפול בשחרור עכבר - חזרת play וחזרה לסנכרון
-------------------------------------------------------------*/
  function handleMouseUp() {
    if (!isMouseDragging) return;

    isMouseDragging = false;
    console.log("[LyricsChords] שחרור עכבר - בדיקת חזרת סנכרון");

    // בדיקה אם הווידאו מנגן - אם כן, נאפס את הגלילה הידנית ונחזור לסנכרון
    const video = document.querySelector("video");
    const isVideoPlaying = video && !video.paused;

    if (isVideoPlaying && manualScrollActive) {
      // איפוס גלילה ידנית - חזרה לסנכרון עם הווידאו
      manualScrollActive = false;
      lastVideoTime = -1; // איפוס כדי לאפשר קפיצה מיידית לזמן הנוכחי
      console.log("[LyricsChords] שחרור עכבר - חזרה לסנכרון עם הווידאו");
    }

    // חזרת play לסרטון אם היה מנגן לפני הגלילה
    if (wasPlayingBeforeScroll) {
      if (video && video.paused) {
        video.play();
        console.log("[LyricsChords] שחרור עכבר - play לסרטון");
      }
      wasPlayingBeforeScroll = false; // איפוס המשתנה
    }
  }

  /* ------------------------------------------------------------
   טיפול בגלילה ידנית
   NOTE: גלילה ידנית לא משנה את זמן הווידאו - רק מסמנת שהמשתמש גולל
-------------------------------------------------------------*/
  function handleManualScroll(event) {
    if (!syncWithYouTubeActive) return; // רק כשsync פעיל

    // בדיקה אם זו גלילה ידנית אמיתית או מתוכנתת
    if (!event.isTrusted || programmaticScroll) {
      console.log("[LyricsChords] גלילה מתוכנתת - מדלג");
      return;
    }

    // סימון שהמשתמש גולל ידנית (לא משנה את זמן הווידאו)
    manualScrollActive = true;
    if (manualScrollTimer) clearTimeout(manualScrollTimer);

    // בדיקה אם הווידאו מושהה או אם העכבר לחוץ (גרירה)
    const video = document.querySelector("video");
    const isVideoPaused = video && video.paused;
    const isDragging = isMouseDragging;

    const reason = isVideoPaused
      ? " (וידאו מושהה)"
      : isDragging
        ? " (גרירת עכבר)"
        : "";
    console.log("[LyricsChords] גלילה ידנית - לא משנה זמן סרטון" + reason);

    // טיימר לאיפוס דגל גלילה - רק אם הווידאו לא מושהה ואין גרירת עכבר
    // כשהווידאו מושהה או העכבר לחוץ, הגלילה הידנית נשארת פעילה
    if (manualScrollTimer) {
      clearSafeTimeout(manualScrollTimer, "manualScroll-previous");
    }

    if (!isVideoPaused && !isDragging) {
      // וידאו מנגן ואין גרירה - הפעלת טיימר לאיפוס דגל גלילה
      manualScrollTimer = createSafeTimeout(
        () => {
          manualScrollActive = false;
          lastVideoTime = -1; // איפוס כדי למנוע "קפיצה אחורה"
          manualScrollTimer = null;
          console.log("[LyricsChords] גלילה ידנית הסתיימה - חזרה לסנכרון רגיל");
        },
        MANUAL_SCROLL_TIMEOUT,
        "manualScroll"
      );
    }
    // אם הווידאו מושהה או העכבר לחוץ - לא מפעילים טיימר, הגלילה הידנית נשארת פעילה
  }

  // חישוב זמן מתוךמיקום הגלילה (הפוך לcalculateScrollPositionForTime)
  function calculateTimeFromScroll() {
    const content = getLyricsContainer();
    if (!content) return NaN;

    // בדיקה אם המשתמש בתחילת הפאנל - חזרה לתחילת הסרטון
    if (content.scrollTop <= 50) {
      console.log("[LyricsChords] גלילה לתחילת הפאנל - חזרה לתחילת הסרטון");
      return 0;
    }

    // חישוב אחוז גלילה לתנועה חלקה ורציפה
    const scrollPercentage =
      content.scrollTop / (content.scrollHeight - content.clientHeight);

    // וידוא שהאחוז בטווח 0-1
    const clampedPercentage = Math.max(0, Math.min(1, scrollPercentage));

    // מציאת משך הסרטון
    const video = document.querySelector("video");
    if (!video || !video.duration) {
      console.warn("[LyricsChords] לא ניתן למצוא משך סרטון");
      return NaN;
    }

    // מיפוי ליניארי מאחוז גלילה לזמן סרטון (100% מהסרטון)
    const calculatedTime = clampedPercentage * video.duration;

    console.log(
      `[LyricsChords] גלילה חלקה: ${(clampedPercentage * 100).toFixed(
        1
      )}% -> ${calculatedTime.toFixed(2)}s`
    );

    return calculatedTime;
  }

  // עדכון מצב ויזואלי של הToggle-ים
  function updateToggleStates() {
    if (!lyricsChordsPanelElement) return;

    const syncYouTubeToggle = lyricsChordsPanelElement.querySelector(
      "#sync-youtube-toggle"
    );
    const autoScrollToggle = lyricsChordsPanelElement.querySelector(
      "#auto-scroll-toggle"
    );
    const themeCycleBtn =
      lyricsChordsPanelElement.querySelector("#theme-cycle-btn");
    const chordsToggle =
      lyricsChordsPanelElement.querySelector("#chords-toggle");

    // עדכון Sync with YouTube toggle
    if (syncYouTubeToggle) {
      if (syncWithYouTubeActive) {
        syncYouTubeToggle.classList.add("active");
      } else {
        syncYouTubeToggle.classList.remove("active");
      }
    }

    // עדכון Auto scroll toggle
    if (autoScrollToggle) {
      if (autoScrollActive) {
        autoScrollToggle.classList.add("active");
      } else {
        autoScrollToggle.classList.remove("active");
      }
    }

    // עדכון Theme (3 מצבים: BLACK/SEPIA/LIGHT)
    const themeClasses = ["black-theme", "sepia-theme", "light-theme"];
    const themeIconClasses = ["theme-black", "theme-sepia", "theme-light"];

    // הסרת כל ה-theme classes והוספת הנכון
    lyricsChordsPanelElement.classList.remove(
      "black-theme",
      "sepia-theme",
      "light-theme"
    );
    lyricsChordsPanelElement.classList.add(themeClasses[themeState]);

    // עדכון צבע האייקון לפי theme נוכחי
    if (themeCycleBtn) {
      themeCycleBtn.classList.remove(
        "theme-black",
        "theme-sepia",
        "theme-light"
      );
      themeCycleBtn.classList.add(themeIconClasses[themeState]);
    }

    // עדכון MINI toggle
    if (chordsToggle) {
      if (chordsToggleActive) {
        chordsToggle.classList.add("active");
      } else {
        chordsToggle.classList.remove("active");
      }
    }

    // החלת מצב MINI על הפאנל
    applyMiniModeLayoutState();

    // עדכון Countdown toggle
    const countdownToggle =
      lyricsChordsPanelElement.querySelector("#countdown-toggle");
    if (countdownToggle) {
      if (countdownActive) {
        countdownToggle.classList.add("active");
      } else {
        countdownToggle.classList.remove("active");
      }
    }

    // עדכון Dynamic Feature toggle - בהתאם למצב Chords
    const dynamicFeatureToggle = lyricsChordsPanelElement.querySelector(
      "#dynamic-feature-toggle"
    );
    if (dynamicFeatureToggle) {
      // בדיקה איזה כפתור פעיל כרגע
      const isActive = chordsToggleActive
        ? chordDiagramsActive
        : countdownActive;

      if (isActive) {
        dynamicFeatureToggle.classList.add("active");
      } else {
        dynamicFeatureToggle.classList.remove("active");
      }
    }

    // עדכון מצב Chords Preview
    updateChordsPreviewIcon();
  }

  // עדכון מצב ויזואלי של toggle ה-Preview
  function updateChordsPreviewIcon() {
    if (!lyricsChordsPanelElement) return;

    const chordsPreviewToggle = lyricsChordsPanelElement.querySelector(
      "#chords-preview-toggle"
    );

    if (!chordsPreviewToggle) return;

    // הסרת כל ה-classes
    chordsPreviewToggle.classList.remove("active", "disabled");

    // אם אין אקורדים זמינים ל-Preview - האייקון יהיה disabled
    if (!window.chordsAvailableForPreview) {
      chordsPreviewToggle.classList.add("disabled");
    } else {
      // אם יש אקורדים - בדוק אם Preview פעיל
      if (chordsPreviewActive) {
        chordsPreviewToggle.classList.add("active");
      }
    }
  }

  // עדכון תצוגת מספר המהירות
  function updateSpeedDisplay() {
    if (!lyricsChordsPanelElement) return;

    const speedDisplay =
      lyricsChordsPanelElement.querySelector("#speed-display");
    if (speedDisplay) {
      speedDisplay.textContent = autoScrollSpeed.toFixed(1);
    }
  }

  // עדכון מצב כפתורי המהירות
  function updateSpeedControlsState() {
    if (!lyricsChordsPanelElement) return;

    const speedDecrease =
      lyricsChordsPanelElement.querySelector("#speed-decrease");
    const speedIncrease =
      lyricsChordsPanelElement.querySelector("#speed-increase");

    if (speedDecrease) {
      speedDecrease.disabled =
        !autoScrollActive || autoScrollSpeed <= MIN_SCROLL_SPEED;
      speedDecrease.style.opacity = speedDecrease.disabled ? "0.4" : "1";
    }

    if (speedIncrease) {
      speedIncrease.disabled =
        !autoScrollActive || autoScrollSpeed >= MAX_SCROLL_SPEED;
      speedIncrease.style.opacity = speedIncrease.disabled ? "0.4" : "1";
    }
  }

  // עדכון הכפתור הדינמי (Chord Diagrams / Countdown)
  function updateDynamicFeatureButton() {
    if (!lyricsChordsPanelElement) return;

    const icon = lyricsChordsPanelElement.querySelector(
      "#dynamic-feature-icon"
    );
    const label = lyricsChordsPanelElement.querySelector(
      "#dynamic-feature-label"
    );
    const toggle = lyricsChordsPanelElement.querySelector(
      "#dynamic-feature-toggle"
    );

    if (!icon || !label || !toggle) return;

    // בדיקת מצב Chords toggle
    if (chordsToggleActive) {
      // Chords ON → הצג Chord Diagrams
      icon.textContent = "🎼";
      label.textContent = "Chord Diagrams";

      // עדכון מצב הtoggle בהתאם למצב השמור
      if (chordDiagramsActive) {
        toggle.classList.add("active");
      } else {
        toggle.classList.remove("active");
      }

      console.log(
        "[LyricsChords] Dynamic button עודכן ל-Chord Diagrams:",
        chordDiagramsActive ? "ON" : "OFF"
      );
    } else {
      // Chords OFF → הצג Countdown
      icon.textContent = "⏱️";
      label.textContent = "Countdown";

      // עדכון מצב הtoggle בהתאם למצב השמור
      if (countdownActive) {
        toggle.classList.add("active");
      } else {
        toggle.classList.remove("active");
      }

      console.log(
        "[LyricsChords] Dynamic button עודכן ל-Countdown:",
        countdownActive ? "ON" : "OFF"
      );
    }

  }

  /*------------------------------------------------------------
  פונקציות הגלילה האמיתית
------------------------------------------------------------*/

  // הפעלת הגלילה לפי המצב הנוכחי
  function startScrolling() {
    stopScrolling(); // עצירת גלילה קודמת

    if (syncWithYouTubeActive) {
      startSyncWithYouTube();
      console.log("[LyricsChords] הופעל Sync with YouTube");
    } else if (autoScrollActive) {
      startAutoScroll();
      console.log("[LyricsChords] הופעל Auto scroll במהירות:", autoScrollSpeed);
    }
  }

  // עצירת כל סוגי הגלילה
  function stopScrolling() {
    // עצירת Auto scroll
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
    }

    // עצירת Sync with YouTube
    if (scrollAnimationFrame) {
      cancelAnimationFrame(scrollAnimationFrame);
      scrollAnimationFrame = null;
    }

    // הסרת Progress Bar listeners
    removeProgressBarListeners();

    // עדכון מרווח תחתון לפי מצב חדש
    updateBottomPadding();

    console.log("[LyricsChords] עצרתי כל סוגי הגלילה");
  }

  // ניהול מרווח תחתון דינמי לSYNC WITH YOUTUBE
  let bottomPaddingElement = null;

  // הוספת מרווח ריק בתחתית (רק לSYNC WITH YOUTUBE)
  function addBottomPadding() {
    if (!lyricsChordsPanelElement) return;

    const content = getLyricsContainer();
    if (!content) return;

    // בדיקה אם כבר קיים מרווח
    if (bottomPaddingElement) {
      console.log("[LyricsChords] מרווח תחתון כבר קיים");
      return;
    }

    // יצירת אלמנט מרווח ריק
    bottomPaddingElement = document.createElement("div");
    bottomPaddingElement.className = "lyrics-chords-bottom-padding";
    bottomPaddingElement.style.height = "80vh"; // מרווח של 80% מגובה המסך
    bottomPaddingElement.style.pointerEvents = "none"; // לא מפריע לאינטראקציה
    bottomPaddingElement.setAttribute("data-yc-element", "true"); // סימון לניקוי

    // הוספה לסוף התוכן
    content.appendChild(bottomPaddingElement);

    console.log("[LyricsChords] ✓ הוספתי מרווח תחתון לSYNC WITH YOUTUBE");
  }

  // הסרת מרווח ריק (לAUTO SCROLL או כשהכל כבוי)
  function removeBottomPadding() {
    if (!bottomPaddingElement) return;

    try {
      // הסרה בטוחה של האלמנט
      if (bottomPaddingElement.parentNode) {
        bottomPaddingElement.parentNode.removeChild(bottomPaddingElement);
      }

      // ניקוי זיכרון
      bottomPaddingElement = null;

      console.log("[LyricsChords] ✓ הסרתי מרווח תחתון");
    } catch (error) {
      console.error("[LyricsChords] שגיאה בהסרת מרווח תחתון:", error);
      bottomPaddingElement = null; // ניקוי בכל מקרה
    }
  }

  // עדכון מרווח תחתון לפי מצב הגלילה
  function updateBottomPadding() {
    // מרווח רק כש-SYNC WITH YOUTUBE פעיל ו-AUTO SCROLL כבוי
    if (syncWithYouTubeActive && !autoScrollActive) {
      addBottomPadding();
    } else {
      removeBottomPadding();
    }
  }

  // Auto scroll - גלילה בקצב קבוע
  function startAutoScroll() {
    if (!lyricsChordsPanelElement) return;

    const content = getLyricsContainer();
    if (!content) return;

    // עדכון מרווח תחתון - הסרה לAUTO SCROLL
    updateBottomPadding();

    // חישוב מהירות גלילה - מותאם למהירויות נמוכות
    let intervalMs, pixelsPerStep;

    if (autoScrollSpeed >= 1.0) {
      // מהירויות גבוהות - עדכון תכוף
      intervalMs = 50;
      const pixelsPerSecond = autoScrollSpeed * 30;
      pixelsPerStep = (pixelsPerSecond * intervalMs) / 1000;
    } else {
      // מהירויות נמוכות - עדכון פחות תכוף אבל תמיד לפחות פיקסל אחד
      pixelsPerStep = 1;
      intervalMs = Math.round(1000 / (autoScrollSpeed * 30)); // חישוב הזמן בין עדכונים
    }

    scrollInterval = setInterval(() => {
      const currentScroll = content.scrollTop;
      const maxScroll = content.scrollHeight - content.clientHeight;

      if (currentScroll >= maxScroll) {
        // הגענו לסוף - עצירה (ללא מרווח ריק)
        stopScrolling();
        return;
      }

      content.scrollTop = currentScroll + pixelsPerStep;
    }, intervalMs);
  }

  // Sync with YouTube - גלילה רציפה מסונכרנת עם השיר
  function startSyncWithYouTube() {
    if (!lyricsChordsPanelElement) return;

    const content = getLyricsContainer();
    if (!content) return;

    // עדכון מרווח תחתון - הוספה לSYNC WITH YOUTUBE
    updateBottomPadding();

    // שימוש במשתנה הגלובלי למניעת לולאות
    let targetScrollPosition = content.scrollTop;

    // Ensure an immediate first alignment to current playback time.
    // Without this, opening the panel mid-video can miss the initial scroll
    // until playback time changes enough (or the user toggles sync).
    const video = document.querySelector("video");
    if (video) {
      const initialTargetPosition = calculateScrollPositionForTime(video.currentTime);
      targetScrollPosition = initialTargetPosition;
      lastVideoTime = video.currentTime;
      programmaticScroll = true;
      content.scrollTop = initialTargetPosition;
      requestAnimationFrame(() => {
        programmaticScroll = false;
      });
    }

    // גלילה רציפה כמו Auto scroll
    const intervalMs = 50; // עדכון כל 50ms

    scrollInterval = setInterval(() => {
      if (!syncWithYouTubeActive || !lyricsChordsPanelElement) {
        return;
      }

      const activeVideo = document.querySelector("video");
      if (!activeVideo) return;

      const currentTime = activeVideo.currentTime;
      const timeDiff = Math.abs(currentTime - lastVideoTime);

      // עדכון מיקום היעד לפי זמן הסרטון - רק אם לא בגלילה ידנית
      if (!manualScrollActive && timeDiff > 0.1) {
        const newTargetPosition = calculateScrollPositionForTime(currentTime);

        // בדילוגים גדולים - קפיצה מיידית
        if (timeDiff > 2.0) {
          programmaticScroll = true;
          content.scrollTop = newTargetPosition;
          targetScrollPosition = newTargetPosition;
          requestAnimationFrame(() => {
            programmaticScroll = false;
          });
          console.log(`[LyricsChords] קפיצה לזמן ${currentTime.toFixed(1)}s`);
        } else {
          targetScrollPosition = newTargetPosition;
        }

        lastVideoTime = currentTime;
      }

      // גלילה חלקה למיקום היעד - רק אם לא בגלילה ידנית
      if (!manualScrollActive) {
        const currentScroll = content.scrollTop;
        const maxScroll = content.scrollHeight - content.clientHeight;
        const scrollPercentage = maxScroll > 0 ? currentScroll / maxScroll : 0;

        // עצירה חלקה ב-90% מהתוכן - ללא קפיצות
        if (scrollPercentage >= 0.9) {
          console.log(`[LyricsChords] הגעתי ל-90% מהתוכן - עצירת גלילה`);
          return; // עצירת הגלילה בלי לשנות כלום
        }

        const scrollDiff = targetScrollPosition - currentScroll;

        if (Math.abs(scrollDiff) > 1) {
          // גלילה הדרגתית למיקום היעד
          programmaticScroll = true;
          const scrollStep = scrollDiff * 0.1; // 10% מהמרחק בכל צעד
          content.scrollTop = currentScroll + scrollStep;
          requestAnimationFrame(() => {
            programmaticScroll = false;
          });
        }
      }

      // הסרתי את הבדיקה שעוצרת בסוף - עכשיו הגלילה ממשיכה גם לתוך המרווח הריק!
    }, intervalMs);

    // הוספת listeners לגרירת Progress Bar
    addProgressBarListeners();

    console.log(
      "[LyricsChords] התחלתי Sync with YouTube - גלילה רציפה עם מרווח ריק"
    );
  }

  // גלילה למיקום המתאים לפי זמן הסרטון (לגרירת Progress Bar)
  function scrollToTimePosition(currentTime, isLargeJump = false) {
    if (!lyricsChordsPanelElement) return;

    const content = getLyricsContainer();
    if (!content) return;

    // שימוש בפונקציה החדשה לחישוב מיקום
    const targetScroll = calculateScrollPositionForTime(currentTime);

    // הדלקת דגל גלילה מתוכנתת לפני הגלילה
    programmaticScroll = true;

    // גלילה מיידית לגרירת Progress Bar
    content.scrollTo({
      top: targetScroll,
      behavior: "instant", // תמיד מיידי לגרירה
    });

    // כיבוי הדגל מיד אחרי הגלילה
    requestAnimationFrame(() => {
      programmaticScroll = false;
    });

    console.log(`[LyricsChords] גרירה לזמן ${currentTime.toFixed(1)}s`);
  }

  // ניהול Progress Bar listeners
  function addProgressBarListeners() {
    if (!syncWithYouTubeActive) return;

    // הסרת listeners קיימים לפני הוספת חדשים
    removeProgressBarListeners();

    // חיפוש Progress Bar עם מספר selectors
    const progressBar = document.querySelector(
      ".ytp-progress-bar-container, .ytp-progress-bar, .ytp-scrubber-container, .ytp-chrome-bottom .ytp-progress-bar"
    );

    if (!progressBar) {
      console.log("[LyricsChords] לא מצאתי Progress Bar");
      return;
    }

    // יצירת event listeners
    progressBarListeners.mousedown = function (e) {
      if (!syncWithYouTubeActive) return;

      isDraggingProgressBar = true;
      console.log("[LyricsChords] התחלתי לגרור Progress Bar");

      // חישוב זמן ראשוני
      const timeFromPosition = calculateTimeFromMousePosition(e, progressBar);
      if (timeFromPosition !== null) {
        scrollToTimePosition(timeFromPosition, true);
      }
    };

    progressBarListeners.mousemove = function (e) {
      if (!isDraggingProgressBar || !syncWithYouTubeActive) return;

      const timeFromPosition = calculateTimeFromMousePosition(e, progressBar);
      if (timeFromPosition !== null) {
        scrollToTimePosition(timeFromPosition, true);

        // 🎯 Dispatch simple time update for Preview Panel (decoupled)
        window.dispatchEvent(
          new CustomEvent("yc:timeUpdate", {
            detail: { time: timeFromPosition, isScrubbing: true },
          })
        );
      }
    };

    progressBarListeners.mouseup = function (e) {
      if (!isDraggingProgressBar) return;

      isDraggingProgressBar = false;
      console.log("[LyricsChords] סיימתי לגרור Progress Bar");
    };

    // הוספת listeners
    progressBar.addEventListener("mousedown", progressBarListeners.mousedown);
    document.addEventListener("mousemove", progressBarListeners.mousemove);
    document.addEventListener("mouseup", progressBarListeners.mouseup);

    console.log("[LyricsChords] הוספתי Progress Bar listeners");
  }

  function removeProgressBarListeners() {
    const progressBar = document.querySelector(
      ".ytp-progress-bar-container, .ytp-progress-bar, .ytp-scrubber-container, .ytp-chrome-bottom .ytp-progress-bar"
    );

    if (progressBar && progressBarListeners.mousedown) {
      progressBar.removeEventListener(
        "mousedown",
        progressBarListeners.mousedown
      );
    }

    if (progressBarListeners.mousemove) {
      document.removeEventListener("mousemove", progressBarListeners.mousemove);
    }

    if (progressBarListeners.mouseup) {
      document.removeEventListener("mouseup", progressBarListeners.mouseup);
    }

    isDraggingProgressBar = false;
    console.log("[LyricsChords] הסרתי Progress Bar listeners");
  }

  // חישוב זמן ממיקום העכבר
  function calculateTimeFromMousePosition(event, progressBar) {
    const video = document.querySelector("video");
    if (!video) return null;

    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const barWidth = rect.width;

    // חישוב אחוז ממיקום העכבר
    const percentage = Math.max(0, Math.min(1, clickX / barWidth));
    const calculatedTime = percentage * video.duration;

    return calculatedTime;
  }

  // 🎯 Helper: Get the correct lyrics container (handles split view)
  function getLyricsContainer() {
    if (!lyricsChordsPanelElement) return null;

    // Check if we're in split view mode
    const defaultSection = lyricsChordsPanelElement.querySelector("#defaultLyricsSection");
    if (defaultSection) {
      // Split view: lyrics are inside defaultLyricsSection
      return defaultSection;
    }

    // Normal mode: lyrics are directly in lyrics-chords-content
    return lyricsChordsPanelElement.querySelector(".lyrics-chords-content");
  }

  // חישוב מיקום גלילה לפי זמן הסרטון
  function calculateScrollPositionForTime(currentTime) {
    if (!lyricsChordsPanelElement) return 0;

    const content = getLyricsContainer();
    if (!content) return 0;

    // חיפוש המילה הקרובה ביותר לזמן הנוכחי
    const allWords = content.querySelectorAll(".lyrics-word[data-time]");
    let targetElement = null;
    let closestTimeDiff = Infinity;

    allWords.forEach((word) => {
      const wordTime = parseFloat(word.getAttribute("data-time"));
      if (wordTime <= currentTime) {
        const timeDiff = currentTime - wordTime;
        if (timeDiff < closestTimeDiff) {
          closestTimeDiff = timeDiff;
          targetElement = word;
        }
      }
    });

    // אם לא מצאנו מילה מתאימה, נחפש אקורד (לתמיכה ב-INTRO/INSTRUMENTAL)
    if (!targetElement) {
      const allChords = content.querySelectorAll(".lyrics-chord[data-time]");
      closestTimeDiff = Infinity;

      allChords.forEach((chord) => {
        const chordTime = parseFloat(chord.getAttribute("data-time"));
        if (chordTime <= currentTime) {
          const timeDiff = currentTime - chordTime;
          if (timeDiff < closestTimeDiff) {
            closestTimeDiff = timeDiff;
            targetElement = chord;
          }
        }
      });
    }

    if (targetElement) {
      // חישוב מיקום הגלילה
      const elementRect = targetElement.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const relativeTop = elementRect.top - contentRect.top + content.scrollTop;

      // הסרת מנגנון isNearEnd למניעת קפיצות בגלילה
      // עכשיו האלמנט תמיד יהיה ב-10% מלמעלה ללא קפיצות

      // MINI mode removes controls; compensate so highlighted lyrics stay at same height.
      const miniModeCompensation = lyricsChordsPanelElement?.classList.contains(
        "mini-mode"
      )
        ? miniControlsHeightPx * 0.9
        : 0;
      const targetScroll =
        relativeTop - (content.clientHeight * 0.1 + miniModeCompensation);
      return Math.max(0, targetScroll);
    }

    return content.scrollTop; // אם לא מצאנו מילה או אקורד - שמור על המיקום הנוכחי
  }

  // בדיקה וגלילה למילה הנוכחית (פונקציה ישנה - לא בשימוש)
  function checkAndScrollToCurrentWord() {
    if (!lyricsChordsPanelElement) return;

    const content = getLyricsContainer();
    if (!content) return;

    // חיפוש המילה המודגשת הנוכחית
    const highlightedWord = content.querySelector(".lyrics-word.highlighted");

    if (highlightedWord && highlightedWord !== lastHighlightedElement) {
      lastHighlightedElement = highlightedWord;

      // בדיקה אם המילה נמצאת מחוץ לתצוגה
      const wordRect = highlightedWord.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();

      // חישוב מיקום יחסי לתוך הפאנל
      const relativeTop = wordRect.top - contentRect.top + content.scrollTop;
      const relativeBottom =
        wordRect.bottom - contentRect.top + content.scrollTop;

      const visibleTop = content.scrollTop;
      const visibleBottom = content.scrollTop + content.clientHeight;

      // בדיקה אם המילה מתקרבת לחלק התחתון או יצאה מהתצוגה
      const threshold = content.clientHeight * 0.7; // גלול כשהמילה ב-70% מהגובה

      if (
        relativeTop > visibleTop + threshold ||
        relativeBottom > visibleBottom
      ) {
        // גלילה חלקה כדי שהמילה תהיה בחלק העליון
        const targetScroll = relativeTop - content.clientHeight * 0.2; // 20% מלמעלה

        content.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: "smooth",
        });

        console.log("[LyricsChords] גללתי למילה חדשה");
      }
    }
  }

  /*------------------------------------------------------------
  17. פונקציית ניקוי גלובלית
------------------------------------------------------------*/

  // Canonical global cleanup implementation for the panel.
  window.__ycCleanupLyricsChordsPanelImpl = function () {
    try {
      console.log("[🔥 LyricsChords] ניקוי מקיף של פאנל Lyrics & Chords");

      // 🔥 1. עצירת כל הלולאות והטיימרים
      if (typeof stopLyricsChordsSync === "function") {
        stopLyricsChordsSync();
      }
      if (typeof stopSyncWithYouTube === "function") {
        stopSyncWithYouTube();
      }

      // ניקוי מקיף של כל ה-timeouts
      const timeoutsToClean = [
        { name: "manualScrollTimer", ref: () => manualScrollTimer },
        { name: "tooltipTimeout", ref: () => tooltipTimeout },
        { name: "wheelScrollTimeout", ref: () => wheelScrollTimeout },
      ];

      timeoutsToClean.forEach(({ name, ref }) => {
        try {
          const timeoutId = ref();
          if (timeoutId) {
            clearTimeout(timeoutId);
            // איפוס המשתנה אם אפשר
            if (name === "manualScrollTimer") manualScrollTimer = null;
            if (name === "tooltipTimeout") tooltipTimeout = null;
            if (name === "wheelScrollTimeout") wheelScrollTimeout = null;
            console.log(`[🔥 LyricsChords] ניקיתי ${name}`);
          }
        } catch (error) {
          console.warn(`[🔥 LyricsChords] שגיאה בניקוי ${name}:`, error);
        }
      });

      // 🔥 2. ניקוי RAF ו-intervals
      if (
        typeof window.lyricsChordsSyncRAF !== "undefined" &&
        window.lyricsChordsSyncRAF
      ) {
        cancelAnimationFrame(window.lyricsChordsSyncRAF);
        window.lyricsChordsSyncRAF = null;
        console.log("[🔥 LyricsChords] ניקיתי lyricsChordsSyncRAF");
      }

      // ניקוי lyricsChordsSyncInterval (שמשתמש ב-RAF)
      if (
        typeof lyricsChordsSyncInterval !== "undefined" &&
        lyricsChordsSyncInterval
      ) {
        if (typeof lyricsChordsSyncInterval.cancel === "function") {
          lyricsChordsSyncInterval.cancel();
          console.log(
            "[🔥 LyricsChords] ניקיתי lyricsChordsSyncInterval עם cancel()"
          );
        } else if (lyricsChordsSyncInterval.rafId) {
          cancelAnimationFrame(lyricsChordsSyncInterval.rafId);
          console.log(
            "[🔥 LyricsChords] ניקיתי lyricsChordsSyncInterval.rafId"
          );
        }
        lyricsChordsSyncInterval = null;
      }

      // ניקוי כל ה-timeouts הפעילים במערכת הבטיחות
      if (typeof clearAllActiveTimeouts === "function") {
        clearAllActiveTimeouts();
      }

      // 🔥 3. ניקוי resize listeners
      if (window.lyricsChordsPanelResizeListener) {
        window.removeEventListener(
          "resize",
          window.lyricsChordsPanelResizeListener
        );

        // ניקוי timeout פעיל אם קיים
        if (window.lyricsChordsPanelResizeTimeout) {
          clearTimeout(window.lyricsChordsPanelResizeTimeout);
          window.lyricsChordsPanelResizeTimeout = null;
        }

        window.lyricsChordsPanelResizeListener = null;
      }

      // 🔥 4. ניקוי visibility listeners
      if (typeof window.lyricsChordsSyncVisibilityListener !== "undefined") {
        document.removeEventListener(
          "visibilitychange",
          window.lyricsChordsSyncVisibilityListener
        );
        window.lyricsChordsSyncVisibilityListener = null;
      }

      // 🔥 5. ניקוי mouse listeners
      if (typeof window.lyricsChordsPanelMouseUpListener !== "undefined") {
        document.removeEventListener(
          "mouseup",
          window.lyricsChordsPanelMouseUpListener
        );
        window.lyricsChordsPanelMouseUpListener = null;
      }

      // 🔥 10. ניקוי אגרסיבי של Chord Cache ונתונים

      // ניקוי מלא של localChordCache
      if (typeof localChordCache !== "undefined" && localChordCache) {
        const cacheSize = localChordCache.size;
        localChordCache.clear();
        console.log(
          `[LyricsChords] ניקה localChordCache - ${cacheSize} אקורדים`
        );
      }

      // ניקוי currentChordPositions
      if (
        typeof currentChordPositions !== "undefined" &&
        currentChordPositions
      ) {
        const positionsSize = currentChordPositions.size;
        currentChordPositions.clear();
        console.log(
          `[LyricsChords] ניקה currentChordPositions - ${positionsSize} פוזיציות`
        );
      }

      // ניקוי chordPositionData
      if (typeof chordPositionData !== "undefined" && chordPositionData) {
        const dataSize = chordPositionData.size;
        chordPositionData.clear();
        console.log(
          `[LyricsChords] ניקה chordPositionData - ${dataSize} אקורדים`
        );
      }

      // ניקוי סטטיסטיקות
      if (typeof cacheStats !== "undefined") {
        cacheStats.hits = 0;
        cacheStats.misses = 0;
        cacheStats.loads = 0;
        console.log("[LyricsChords] איפס cacheStats");
      }

      if (typeof highlightStats !== "undefined") {
        Object.keys(highlightStats).forEach((key) => {
          if (typeof highlightStats[key] === "number") {
            highlightStats[key] = 0;
          }
        });
        console.log("[LyricsChords] איפס highlightStats");
      }

      // 🎯 ניקוי משתני הדגשה ברמת משפט
      window.ycSentenceLevelHighlight = false;
      window.ycParsedSentences = null;
      window.ycPanelWordTimings = null;

      // 🆕 ניקוי PANEL_SUBSET
      cleanupPanelSubset();

      // ניקוי מרווח תחתון דינמי
      if (typeof dynamicBottomMargin !== "undefined") {
        dynamicBottomMargin = 0;
      }
      if (typeof wasPlayingBeforeScroll !== "undefined") {
        wasPlayingBeforeScroll = false;
      }
      if (typeof isMouseDragging !== "undefined") {
        isMouseDragging = false;
      }
      if (typeof manualScrollActive !== "undefined") {
        manualScrollActive = false;
      }
      if (typeof syncWithYouTubeActive !== "undefined") {
        syncWithYouTubeActive = false;
      }
      if (typeof autoScrollActive !== "undefined") {
        autoScrollActive = false;
      }

      // 🔥 7. ניקוי listeners ספציפיים

      // ניקוי Event Delegation listeners
      if (window.lyricsChordsDelegatedListeners) {
        let cleanedCount = 0;
        window.lyricsChordsDelegatedListeners.forEach((listenerData) => {
          try {
            if (
              listenerData.element &&
              listenerData.listener &&
              listenerData.type
            ) {
              listenerData.element.removeEventListener(
                listenerData.type,
                listenerData.listener
              );
              cleanedCount++;
            }
          } catch (error) {
            console.warn(
              "[🔥 LyricsChords] שגיאה בהסרת event listener:",
              error
            );
          }
        });
        window.lyricsChordsDelegatedListeners.clear();
        console.log(
          `[🔥 LyricsChords] ניקיתי ${cleanedCount} Event Delegation listeners`
        );
      }

      if (typeof cleanupWheelScroll === "function") {
        cleanupWheelScroll();
      }
      if (typeof cleanupChordHoverListeners === "function") {
        cleanupChordHoverListeners();
      }

      // 🔥 8. ניקוי IntersectionObserver
      if (panelObserver) {
        panelObserver.disconnect();
        panelObserver = null;
        console.log("[LyricsChords] IntersectionObserver נותק");
      }

      // איפוס משתני נראות
      panelPaused = false;

      // עצירת מוניטור ביצועים
      if (typeof window.stopLyricsChordsPerformanceMonitor === "function") {
        window.stopLyricsChordsPerformanceMonitor();
      }

      // 🔥 9. ניקוי אגרסיבי של DOM Cache וEvent Listeners

      // 🚀 ניקוי Event Delegation Listeners
      if (
        window.lyricsChordsDelegatedListeners &&
        window.lyricsChordsDelegatedListeners.size > 0
      ) {
        let delegatedCount = 0;
        window.lyricsChordsDelegatedListeners.forEach((listenerData) => {
          try {
            if (
              listenerData.element &&
              listenerData.listener &&
              listenerData.type
            ) {
              listenerData.element.removeEventListener(
                listenerData.type,
                listenerData.listener
              );
              // הסרת סימון delegation
              if (listenerData.element.hasAttribute) {
                listenerData.element.removeAttribute(
                  "data-word-delegation-added"
                );
                listenerData.element.removeAttribute(
                  "data-chord-delegation-added"
                );
              }
              delegatedCount++;
            }
          } catch (error) {
            console.warn(
              "[🚀 LyricsChords] שגיאה בניקוי delegated listener:",
              error
            );
          }
        });
        window.lyricsChordsDelegatedListeners.clear();
        console.log(
          `[🚀 LyricsChords] ניקה ${delegatedCount} Event Delegation listeners`
        );
      }

      // ניקוי מלא של DOM Cache
      if (typeof cachedWordElements !== "undefined" && cachedWordElements) {
        // ניקוי event listeners מכל אלמנט
        cachedWordElements.forEach((element) => {
          if (element && element.parentNode) {
            // הסרת כל ה-listeners
            element.removeEventListener("click", element._clickHandler);
            element.removeEventListener(
              "mouseenter",
              element._mouseEnterHandler
            );
            element.removeEventListener(
              "mouseleave",
              element._mouseLeaveHandler
            );
            // ניקוי רפרנסים
            delete element._clickHandler;
            delete element._mouseEnterHandler;
            delete element._mouseLeaveHandler;
          }
        });
        cachedWordElements.length = 0; // ניקוי ה-Array
        cachedWordElements = null;
        console.log("[LyricsChords] ניקה cachedWordElements אגרסיבי");
      }

      if (typeof cachedChordElements !== "undefined" && cachedChordElements) {
        // ניקוי event listeners מכל אלמנט
        cachedChordElements.forEach((element) => {
          if (element && element.parentNode) {
            // הסרת כל ה-listeners
            element.removeEventListener(
              "mouseenter",
              element._mouseEnterHandler
            );
            element.removeEventListener(
              "mouseleave",
              element._mouseLeaveHandler
            );
            element.removeEventListener("mousemove", element._mouseMoveHandler);
            element.removeEventListener("click", element._clickHandler);
            // ניקוי רפרנסים
            delete element._mouseEnterHandler;
            delete element._mouseLeaveHandler;
            delete element._mouseMoveHandler;
            delete element._clickHandler;
          }
        });
        cachedChordElements.length = 0; // ניקוי ה-Array
        cachedChordElements = null;
        console.log("[LyricsChords] ניקה cachedChordElements אגרסיבי");
      }

      // ניקוי אגרסיבי של כל אלמנטי DOM של הפאנל
      if (lyricsChordsPanelElement) {
        try {
          // ניקוי כל ה-event listeners מכל האלמנטים
          const allElements = lyricsChordsPanelElement.querySelectorAll("*");
          allElements.forEach((element) => {
            // ניקוי כל ה-listeners האפשריים
            const events = [
              "click",
              "mouseenter",
              "mouseleave",
              "mousemove",
              "mousedown",
              "mouseup",
              "scroll",
              "wheel",
            ];
            events.forEach((eventType) => {
              if (element[`_${eventType}Handler`]) {
                element.removeEventListener(
                  eventType,
                  element[`_${eventType}Handler`]
                );
                delete element[`_${eventType}Handler`];
              }
            });

            // ניקוי כל ה-attributes המיועדים
            if (element.hasAttribute) {
              [
                "data-chord-hover-added",
                "data-word-click-added",
                "data-tooltip-id",
              ].forEach((attr) => {
                if (element.hasAttribute(attr)) {
                  element.removeAttribute(attr);
                }
              });
            }
          });

          // ניקוי תוכן הפאנל לחלוטין
          lyricsChordsPanelElement.innerHTML = "";
          console.log(
            `[LyricsChords] ניקה ${allElements.length} אלמנטי DOM מהפאנל`
          );
        } catch (error) {
          console.warn("[LyricsChords] שגיאה בניקוי DOM:", error);
        }
      }

      // 🔥 9. ניקוי מרווח תחתון דינמי
      removeBottomPadding();

      // איפוס משתני אופטימיזציה של הדגשה המשופרים
      if (typeof lastHighlightTime !== "undefined") {
        lastHighlightTime = -1;
      }
      if (typeof lastActiveWordIndex !== "undefined") {
        lastActiveWordIndex = -1;
      }
      if (typeof lastActiveChordIndex !== "undefined") {
        lastActiveChordIndex = -1;
      }
      if (typeof lastVideoCurrentTime !== "undefined") {
        lastVideoCurrentTime = -1;
      }
      if (typeof highlightUpdateCount !== "undefined") {
        highlightUpdateCount = 0;
      }
      if (typeof currentTimeThreshold !== "undefined") {
        currentTimeThreshold = BASE_TIME_THRESHOLD;
      }
      if (typeof lastHighlightUpdate !== "undefined") {
        lastHighlightUpdate = 0;
      }
      if (typeof pendingHighlightUpdate !== "undefined") {
        pendingHighlightUpdate = false;
      }
      if (typeof cachedWordElementsValid !== "undefined") {
        cachedWordElementsValid = false;
      }
      if (typeof cachedChordElementsValid !== "undefined") {
        cachedChordElementsValid = false;
      }
      // 🎯 ניקוי cache של תוויות אינסטרומנטליות
      if (typeof cachedInstrumentalLabels !== "undefined") {
        cachedInstrumentalLabels = null;
      }
      if (typeof cachedInstrumentalLabelsValid !== "undefined") {
        cachedInstrumentalLabelsValid = false;
      }
      // 🎯 lastCacheInvalidation הוסר - לא בשימוש יותר
      if (typeof lastActiveWordIndex !== "undefined") {
        lastActiveWordIndex = -1;
      }
      if (typeof lastActiveChordIndex !== "undefined") {
        lastActiveChordIndex = -1;
      }

      // איפוס סטטיסטיקות ביצועי הדגשה
      if (typeof highlightStats !== "undefined") {
        // הצגת סטטיסטיקות לפני איפוס
        if (
          typeof showHighlightStats === "function" &&
          highlightStats.totalCalls > 0
        ) {
          showHighlightStats();
        }
        highlightStats.totalCalls = 0;
        highlightStats.skippedCalls = 0;
        highlightStats.wordUpdates = 0;
        highlightStats.chordUpdates = 0;
        highlightStats.binarySearches = 0;
        console.log("[🔥 LyricsChords] ניקיתי סטטיסטיקות ביצועי הדגשה");
      }

      // 🔥 9. ניקוי נתוני אקורדים ופוזיציות
      if (typeof currentChordPositions !== "undefined") {
        currentChordPositions.clear();
      }
      if (typeof chordPositionData !== "undefined") {
        chordPositionData.clear();
      }

      // 🔥 10. ניקוי tooltips פעילים
      if (typeof cleanupChordTooltip === "function") {
        cleanupChordTooltip();
      }
      if (typeof tooltipListeners !== "undefined") {
        tooltipListeners.clear();
      }
      if (typeof wordClickListeners !== "undefined" && wordClickListeners) {
        wordClickListeners.clear();
        console.log("[🔥 LyricsChords] ניקיתי wordClickListeners");
      }
      if (window.wordClickListeners) {
        window.wordClickListeners.clear();
        window.wordClickListeners = null;
      }

      // 🔥 11. סגירת הפאנל אם פתוח
      if (window.lyricsChordsPanelActive) {
        closeLyricsChordsPanel();
      }

      // 🔥 11.1 ניקוי אגרסיבי - חיפוש ישיר ב-DOM והסרה (למקרה שהמשתנים לא מסונכרנים)
      const panelInDOM = document.querySelector('.yt-lyrics-chords-panel');
      if (panelInDOM) {
        console.log('[🔥 LyricsChords] מצאתי פאנל ב-DOM שלא נוקה - מסיר אותו');
        panelInDOM.remove();
      }

      // איפוס המשתנים בכל מקרה
      window.lyricsChordsPanelActive = false;
      if (typeof lyricsChordsPanelElement !== 'undefined') {
        lyricsChordsPanelElement = null;
      }

      // 🔥 12. ניקוי cache מקומי של COMPLETE_CHORDS
      if (typeof localChordCache !== "undefined") {
        // הצגת סטטיסטיקות לפני הניקוי
        if (typeof showCacheStats === "function") {
          showCacheStats();
        }
        localChordCache.clear();
        // איפוס סטטיסטיקות
        cacheStats.hits = 0;
        cacheStats.misses = 0;
        cacheStats.loads = 0;
        console.log("[🔥 LyricsChords] ניקיתי localChordCache + סטטיסטיקות");
      }

      // 🔥 ניקוי COMPLETE_CHORDS כשהפאנל נסגר (חיסכון 16MB)
      if (window.COMPLETE_CHORDS) {
        const chordsCount = Object.keys(window.COMPLETE_CHORDS).length;
        window.COMPLETE_CHORDS = null;
        releaseHeavyChordLibraryGlobals();
        console.log(
          `[🔥 LyricsChords] ניקיתי COMPLETE_CHORDS (${chordsCount} אקורדים, ~16MB)`
        );
      } else {
        releaseHeavyChordLibraryGlobals();
      }

      // 🔥 13. ניקוי כפתורי רוחב הפאנל
      const panelWidthDecreaseBtn = document.getElementById(
        "panel-width-decrease"
      );
      const panelWidthIncreaseBtn = document.getElementById(
        "panel-width-increase"
      );

      if (panelWidthDecreaseBtn) {
        // הסרת event listeners על ידי החלפת האלמנט
        const newDecreaseBtn = panelWidthDecreaseBtn.cloneNode(true);
        if (panelWidthDecreaseBtn.parentNode) {
          panelWidthDecreaseBtn.parentNode.replaceChild(
            newDecreaseBtn,
            panelWidthDecreaseBtn
          );
        }
        console.log(
          "[🔥 LyricsChords] ניקיתי event listeners של כפתור הקטנת רוחב"
        );
      }

      if (panelWidthIncreaseBtn) {
        // הסרת event listeners על ידי החלפת האלמנט
        const newIncreaseBtn = panelWidthIncreaseBtn.cloneNode(true);
        if (panelWidthIncreaseBtn.parentNode) {
          panelWidthIncreaseBtn.parentNode.replaceChild(
            newIncreaseBtn,
            panelWidthIncreaseBtn
          );
        }
        console.log(
          "[🔥 LyricsChords] ניקיתי event listeners של כפתור הגדלת רוחב"
        );
      }

      // איפוס משתנה רוחב פאנל גלובלי
      if (typeof window.currentLyricsChordsPanelWidth !== "undefined") {
        window.currentLyricsChordsPanelWidth = null;
      }

      // איפוס משתנה זמינות אקורדים
      if (typeof chordsAvailable !== "undefined") {
        chordsAvailable = false;
        console.log("[🔥 LyricsChords] איפסתי chordsAvailable");
      }

      // איפוס משתנה Theme state (0=BLACK, 1=SEPIA, 2=LIGHT)
      if (typeof themeState !== "undefined") {
        themeState = 1; // ברירת מחדל: SEPIA
        console.log("[🔥 LyricsChords] איפסתי themeState ל-SEPIA");
      }

      // 🔥 14. איפוס משתנה הפאנל
      window.lyricsChordsPanelActive = false;

      // 🚀 איפוס משתנה Event Delegation גלובלי
      if (window.lyricsChordsDelegatedListeners) {
        window.lyricsChordsDelegatedListeners = null;
        console.log(
          "[🚀 LyricsChords] איפסתי משתנה lyricsChordsDelegatedListeners גלובלי"
        );
      }

      // Timeline Always Visible cleanup removed

      // 🔥 16. כפיית Garbage Collection לחיסכון מקסימלי ב-RAM
      try {
        // ניסיון לכפות garbage collection אם זמין
        if (window.gc && typeof window.gc === "function") {
          window.gc();
          console.log("[🔥 LyricsChords] 🗑️ כפה Garbage Collection");
        }

        // ניסיון נוסף עם performance API
        if (performance && performance.memory) {
          const beforeMem = Math.round(
            performance.memory.usedJSHeapSize / 1024 / 1024
          );

          // המתנה קצרה לתת לדפדפן לנקות
          setTimeout(() => {
            if (performance.memory) {
              const afterMem = Math.round(
                performance.memory.usedJSHeapSize / 1024 / 1024
              );
              const saved = beforeMem - afterMem;
              console.log(
                `[🔥 LyricsChords] 📊 זיכרון לפני: ${beforeMem}MB, אחרי: ${afterMem}MB, חוסך: ${saved}MB`
              );
            }
          }, 1000);
        }
      } catch (gcError) {
        console.warn("[🔥 LyricsChords] לא ניתן לכפות GC:", gcError);
      }

      // 🔥 ניקוי Progress Bars (כתוביות ואקורדים)
      if (window.extractorModule) {
        // 🛑 ביטול בקשות API פעילות
        if (typeof window.extractorModule.abortAllRequests === 'function') {
          console.log('[🔥 LyricsChords] 🛑 מבטל בקשות API פעילות');
          window.extractorModule.abortAllRequests();
        }
        // הסרת Progress Bars
        if (typeof window.extractorModule.removeSubtitlesProgressBar === 'function') {
          console.log('[🔥 LyricsChords] 🟣 מסיר Progress Bar של כתוביות');
          window.extractorModule.removeSubtitlesProgressBar();
        }
        if (typeof window.extractorModule.removeProgressBar === 'function') {
          console.log('[🔥 LyricsChords] 🔵 מסיר Progress Bar של אקורדים');
          window.extractorModule.removeProgressBar();
        }
      }

      console.log("[🔥 LyricsChords] ✓ ניקוי מקיף הושלם");
    } catch (error) {
      console.error("[🔥 LyricsChords] ERROR בניקוי מקיף:", error);
    }
  };
  window.cleanupLyricsChordsPanel = window.__ycCleanupLyricsChordsPanelImpl;

  // פונקציה גלובלית לבדיקת סטטיסטיקות (לדיבוג)
  window.showLyricsChordsStats = function () {
    console.log("[LyricsChords] 📈 סטטיסטיקות מקיפות:");

    if (typeof showCacheStats === "function") {
      showCacheStats();
    }

    if (typeof showHighlightStats === "function") {
      showHighlightStats();
    }

    if (
      typeof showCacheStats !== "function" &&
      typeof showHighlightStats !== "function"
    ) {
      console.log("[LyricsChords] סטטיסטיקות לא זמינות");
    }
  };

  // פונקציה לבדיקת מצב האופטימיזציה
  window.checkLyricsChordsOptimization = function () {
    console.log("[LyricsChords] 🔍 בדיקת מצב אופטימיזציה:");

    // בדיקת IntersectionObserver
    const observerStatus = panelObserver ? "✅ פעיל" : "❌ לא פעיל";
    const pausedStatus = panelPaused ? "⏸️ מושהה" : "▶️ פעיל";
    console.log(`  🔍 IntersectionObserver: ${observerStatus}`);
    console.log(`  🔍 מצב לולאות: ${pausedStatus}`);

    // בדיקת פאנל
    const panelStatus = window.lyricsChordsPanelActive ? "✅ פתוח" : "❌ סגור";
    const elementStatus = lyricsChordsPanelElement ? "✅ קיים" : "❌ לא קיים";
    console.log(`  🔍 פאנל: ${panelStatus}`);
    console.log(`  🔍 אלמנט DOM: ${elementStatus}`);

    // בדיקת סנכרון
    const syncStatus = lyricsChordsSyncInterval ? "✅ פעיל" : "❌ לא פעיל";
    console.log(`  🔍 סנכרון: ${syncStatus}`);

    // Timeline Keep-Alive removed

    // בדיקת Cache
    const wordCacheStatus = cachedWordElements
      ? `✅ ${cachedWordElements.length} מילים`
      : "❌ ריק";
    const chordCacheStatus = cachedChordElements
      ? `✅ ${cachedChordElements.length} אקורדים`
      : "❌ ריק";
    console.log(`  🔍 Word Cache: ${wordCacheStatus}`);
    console.log(`  🔍 Chord Cache: ${chordCacheStatus}`);

    // סיכום
    const isOptimized =
      panelObserver && !panelPaused && window.lyricsChordsPanelActive;
    const optimizationStatus = isOptimized
      ? "✅ מואץ לביצועים"
      : "⚠️ יש מקום לשיפור";
    console.log(`  🏆 מצב כללי: ${optimizationStatus}`);

    // מידע נוסף לדיבוג
    console.log("  Panel active:", !!window.lyricsChordsPanelActive);
    console.log(
      "  Current time threshold:",
      typeof currentTimeThreshold !== "undefined"
        ? currentTimeThreshold
        : "Not set"
    );
    console.log(
      "  Last highlight time:",
      typeof lastHighlightTime !== "undefined" ? lastHighlightTime : "Not set"
    );
    console.log(
      "  Cache valid - Words:",
      typeof cachedWordElementsValid !== "undefined"
        ? cachedWordElementsValid
        : "Not set"
    );
    console.log(
      "  Cache valid - Chords:",
      typeof cachedChordElementsValid !== "undefined"
        ? cachedChordElementsValid
        : "Not set"
    );
    console.log(
      "  Pending update:",
      typeof pendingHighlightUpdate !== "undefined"
        ? pendingHighlightUpdate
        : "Not set"
    );

    if (typeof highlightStats !== "undefined") {
      const efficiency =
        highlightStats.totalCalls > 0
          ? (
            ((highlightStats.skippedCalls + highlightStats.throttledCalls) /
              highlightStats.totalCalls) *
            100
          ).toFixed(1) + "%"
          : "N/A";
      console.log("  Overall efficiency:", efficiency);
    }
  };

  // פונקציה לבדיקת ביצועים בזמן אמת
  window.startLyricsChordsPerformanceMonitor = function (intervalMs = 5000) {
    if (window.lyricsPerformanceMonitorId) {
      clearInterval(window.lyricsPerformanceMonitorId);
    }

    console.log("[LyricsChords] 📊 מתחיל מוניטור ביצועים");

    window.lyricsPerformanceMonitorId = setInterval(() => {
      if (!window.lyricsChordsPanelActive) {
        console.log("[LyricsChords] 📊 פאנל לא פעיל, עוצר מוניטור");
        window.stopLyricsChordsPerformanceMonitor();
        return;
      }

      // בדיקת זיכרון
      if (performance.memory) {
        const memInfo = {
          used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
          limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
        };

        console.log(
          `[LyricsChords] 📊 זיכרון: ${memInfo.used}MB / ${memInfo.total}MB (מגבלה: ${memInfo.limit}MB)`
        );

        // אזהרה אם הזיכרון גבוה
        if (memInfo.used > 100) {
          console.warn(
            `[LyricsChords] ⚠️ שימוש זיכרון גבוה: ${memInfo.used}MB`
          );
        }
      }

      // בדיקת מצב האופטימיזציה
      const isOptimal = panelObserver && !panelPaused;
      console.log(
        `[LyricsChords] 📊 מצב אופטימיזציה: ${isOptimal ? "✅ מיטבי" : "⚠️ לא מיטבי"
        }`
      );

      // 🎯 ספירת אלמנטים מ-cache (ללא querySelectorAll)
      const wordCount = cachedWordElements?.length || 0;
      const chordCount = cachedChordElements?.length || 0;
      console.log(
        `[LyricsChords] 📊 אלמנטים (מ-cache): ${wordCount} מילים, ${chordCount} אקורדים`
      );
    }, intervalMs);
  };

  // פונקציה לעצירת מוניטור הביצועים
  window.stopLyricsChordsPerformanceMonitor = function () {
    if (window.lyricsPerformanceMonitorId) {
      clearInterval(window.lyricsPerformanceMonitorId);
      window.lyricsPerformanceMonitorId = null;
      console.log("[LyricsChords] 📊 מוניטור ביצועים נעצר");
    }
  };

  /*============================================================
  🔧 פונקציות דיבוג ומוניטורינג - הוראות שימוש
============================================================

פונקציות זמינות בקונסול:

1. בדיקת מצב אופטימיזציה:
   checkLyricsChordsOptimization()
   
2. הצגת סטטיסטיקות:
   showLyricsChordsStats()
   
3. התחלת מוניטור ביצועים (כל 5 שניות):
   startLyricsChordsPerformanceMonitor()
   
4. התחלת מוניטור ביצועים (כל 10 שניות):
   startLyricsChordsPerformanceMonitor(10000)
   
5. עצירת מוניטור ביצועים:
   stopLyricsChordsPerformanceMonitor()
   
6. ניקוי ידני של הפאנל:
   cleanupLyricsChordsPanel()

============================================================*/

  /*------------------------------------------------------------
  פונקציה להצגת הודעות זמניות למשתמש
------------------------------------------------------------*/
  function showTemporaryMessage(message, duration = 2000) {
    try {
      // הסרת הודעה קודמת אם קיימת
      const existingMessage = document.querySelector(".yc-temporary-message");
      if (existingMessage) {
        existingMessage.remove();
      }

      // יצירת אלמנט הודעה
      const messageElement = document.createElement("div");
      messageElement.className = "yc-temporary-message";
      messageElement.textContent = message;
      messageElement.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.9);
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      pointer-events: none;
      border: 1px solid #3ea6ff;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

      // הוספה לדף
      document.body.appendChild(messageElement);

      // אנימציה להצגה
      setTimeout(() => {
        messageElement.style.opacity = "1";
      }, 10);

      // הסרה אוטומטית אחרי הזמן הנדרש
      setTimeout(() => {
        messageElement.style.opacity = "0";
        setTimeout(() => {
          if (messageElement.parentNode) {
            messageElement.remove();
          }
        }, 300); // המתנה לסיום האנימציה
      }, duration);

      console.log("[LyricsChords] הצגת הודעה זמנית:", message);
    } catch (error) {
      console.error("[LyricsChords] שגיאה בהצגת הודעה זמנית:", error);
    }
  }
} // סיום ה-if של מניעת הזרקות כפולות

// Timeline Always Visible completely removed - was causing high CPU usage

/*============================================================
  MAIN EXECUTION - הרצה ראשית
============================================================*/

// הגנה מפני הזרקות כפולות
if (!window.ycLyricsChordsInit) {
  window.ycLyricsChordsInit = true;

  // יצירת כפתור Lyrics & Chords
  createLyricsChordsButton();

  // הוספת מאזין לניקוי בעת סגירת הדף
  window.addEventListener(
    "beforeunload",
    () => {
      cleanupLyricsChordsPanel();
    },
    { once: true }
  );

  if (window.DEBUG) {
    console.log("[LyricsChords] מודול נטען בהצלחה");
  }
} // סיום ה-if של מניעת הזרקות כפולות

/*==============================================================
  סוף הקובץ
==============================================================*/
