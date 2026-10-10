// subtitleButton.js - Full version with word element recycling and fixes

// משתנה לשמירת מצב טעינת מודול subtitle location
let subtitleLocationModuleLoaded = false;
let subtitleLocationObserver = null; // שמירת ה-observer לניקוי מאוחר יותר
let subtitleDragElement = null;
let subtitleDragCleanup = null;
let subtitleDragSession = null;
let subtitleDragGuideElement = null;

// הגדרת קבועים גלובליים לשימוש בכל הקבצים - חייב להיות לפני כל שימוש
window.DEFAULT_BG_OPACITY = "85";
const DEFAULT_BG_OPACITY = window.DEFAULT_BG_OPACITY;

// הגדרת משתנה DEBUG גלובלי
const DEBUG = window.DEBUG;
const CONSENT_VERSION = '2026-02-17';
const SUBTITLE_MODE_STATUS_SHOW_MS = 2600;

function normalizeAiModeForSubtitles(value) {
  const raw = typeof value === "string" ? value.toLowerCase() : "off";
  return ["off", "auto", "always"].includes(raw) ? raw : "off";
}

function hasActiveGeminiKeyForSubtitles(keys) {
  return Array.isArray(keys)
    && keys.some((keyData) => keyData && keyData.active !== false && keyData.status !== "disabled");
}

function getSubtitleButtonVideoId() {
  return window.ycUtils?.extractVideoId?.(window.location.href) || null;
}

const YC_SUBTITLE_WHISPER_LANGUAGE_OPTIONS = Object.freeze([
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

const YC_SUBTITLE_WHISPER_MODEL_OPTIONS = Object.freeze([
  { code: 'large-v2', name: 'Whisper large-v2 — Default' },
  { code: 'large-v3', name: 'Whisper large-v3 — More accurate' },
]);

function getSubtitleWhisperLanguageOptions() {
  const sharedOptions = window.ycWhisperTranscription?.languageOptions;
  return Array.isArray(sharedOptions) && sharedOptions.length > 0
    ? sharedOptions
    : YC_SUBTITLE_WHISPER_LANGUAGE_OPTIONS;
}

function normalizeSubtitleWhisperLanguage(value) {
  const sharedNormalizer = window.ycWhisperTranscription?.normalizeLanguage;
  if (typeof sharedNormalizer === 'function') {
    return sharedNormalizer(value);
  }
  const normalized = String(value || '').trim().toLowerCase();
  return getSubtitleWhisperLanguageOptions().some((option) => option.code === normalized)
    ? normalized
    : 'auto';
}

async function getPreferredSubtitleWhisperLanguage() {
  if (typeof window.ycWhisperTranscription?.getLanguagePreference === 'function') {
    return window.ycWhisperTranscription.getLanguagePreference();
  }
  try {
    const settings = await chrome.storage.local.get(['whisperSubtitleLanguage']);
    return normalizeSubtitleWhisperLanguage(settings.whisperSubtitleLanguage);
  } catch (_) {
    return 'auto';
  }
}

async function savePreferredSubtitleWhisperLanguage(value) {
  const language = normalizeSubtitleWhisperLanguage(value);
  if (typeof window.ycWhisperTranscription?.setLanguagePreference === 'function') {
    return window.ycWhisperTranscription.setLanguagePreference(language);
  }
  try {
    await chrome.storage.local.set({ whisperSubtitleLanguage: language });
  } catch (_) {
    // Keep the transcription usable even if storage is temporarily unavailable.
  }
  return language;
}

function normalizeSubtitleWhisperModel(value) {
  const sharedNormalizer = window.ycWhisperTranscription?.normalizeModel;
  if (typeof sharedNormalizer === 'function') {
    return sharedNormalizer(value);
  }
  const normalized = String(value || '').trim().toLowerCase();
  return YC_SUBTITLE_WHISPER_MODEL_OPTIONS.some((option) => option.code === normalized)
    ? normalized
    : 'large-v2';
}

async function getPreferredSubtitleWhisperModel() {
  if (typeof window.ycWhisperTranscription?.getModelPreference === 'function') {
    return window.ycWhisperTranscription.getModelPreference();
  }
  try {
    const settings = await chrome.storage.local.get(['whisperSubtitleModel']);
    return normalizeSubtitleWhisperModel(settings.whisperSubtitleModel);
  } catch (_) {
    return 'large-v2';
  }
}

function chooseSubtitleWhisperLanguage(initialLanguage = 'auto') {
  const existing = document.getElementById('yc-whisper-language-picker');
  if (existing) existing.remove();

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'yc-whisper-language-picker';
    overlay.dir = 'rtl';
    overlay.innerHTML = `
      <div class="yc-whisper-language-backdrop"></div>
      <section class="yc-whisper-language-dialog" role="dialog" aria-modal="true" aria-labelledby="yc-whisper-language-title">
        <div class="yc-whisper-language-icon">🎙️</div>
        <h2 id="yc-whisper-language-title">שפת הסרטון ל־Whisper</h2>
        <p>אם הזיהוי האוטומטי לא מדויק, בחר כאן את שפת הדיבור. הבחירה תישמר במחשב.</p>
        <label for="yc-whisper-language-select">שפת התמלול</label>
        <select id="yc-whisper-language-select"></select>
        <div class="yc-whisper-language-buttons">
          <button type="button" class="yc-whisper-language-cancel">ביטול</button>
          <button type="button" class="yc-whisper-language-confirm">שמירה והתחלה</button>
        </div>
      </section>
    `;

    const style = document.createElement('style');
    style.id = 'yc-whisper-language-picker-style';
    style.textContent = `
      #yc-whisper-language-picker {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: Roboto, Arial, sans-serif;
      }
      #yc-whisper-language-picker .yc-whisper-language-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, .72);
        backdrop-filter: blur(4px);
      }
      #yc-whisper-language-picker .yc-whisper-language-dialog {
        position: relative;
        width: min(420px, calc(100vw - 32px));
        box-sizing: border-box;
        padding: 28px;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 16px;
        background: linear-gradient(145deg, #202124, #121212);
        color: #fff;
        box-shadow: 0 18px 70px rgba(0,0,0,.6);
      }
      #yc-whisper-language-picker .yc-whisper-language-icon {
        font-size: 30px;
        margin-bottom: 8px;
      }
      #yc-whisper-language-picker h2 {
        margin: 0 0 10px;
        font-size: 21px;
        font-weight: 600;
      }
      #yc-whisper-language-picker p {
        margin: 0 0 20px;
        color: #b8b8b8;
        font-size: 14px;
        line-height: 1.55;
      }
      #yc-whisper-language-picker label {
        display: block;
        margin-bottom: 7px;
        color: #ddd;
        font-size: 13px;
      }
      #yc-whisper-language-picker select {
        width: 100%;
        box-sizing: border-box;
        padding: 11px 12px;
        border: 1px solid #555;
        border-radius: 8px;
        background: #292a2d;
        color: #fff;
        font: inherit;
        font-size: 14px;
        outline: none;
      }
      #yc-whisper-language-picker select:focus {
        border-color: #3ea6ff;
        box-shadow: 0 0 0 2px rgba(62,166,255,.2);
      }
      #yc-whisper-language-picker .yc-whisper-language-buttons {
        display: flex;
        gap: 10px;
        margin-top: 24px;
      }
      #yc-whisper-language-picker button {
        flex: 1;
        min-height: 40px;
        border: 0;
        border-radius: 8px;
        cursor: pointer;
        font: inherit;
        font-weight: 600;
      }
      #yc-whisper-language-picker .yc-whisper-language-cancel {
        background: #3b3b3b;
        color: #ddd;
      }
      #yc-whisper-language-picker .yc-whisper-language-confirm {
        background: #3ea6ff;
        color: #fff;
      }
      #yc-whisper-language-picker button:hover {
        filter: brightness(1.12);
      }
    `;

    const select = overlay.querySelector('#yc-whisper-language-select');
    getSubtitleWhisperLanguageOptions().forEach((option) => {
      const optionElement = document.createElement('option');
      optionElement.value = option.code;
      optionElement.textContent = option.name;
      select.appendChild(optionElement);
    });
    select.value = normalizeSubtitleWhisperLanguage(initialLanguage);

    const close = (value) => {
      document.removeEventListener('keydown', keydownHandler, true);
      overlay.remove();
      style.remove();
      resolve(value);
    };
    const keydownHandler = (event) => {
      if (event.key === 'Escape') close(null);
      if (event.key === 'Enter' && document.activeElement === select) {
        event.preventDefault();
        overlay.querySelector('.yc-whisper-language-confirm').click();
      }
    };

    overlay.querySelector('.yc-whisper-language-cancel').addEventListener('click', () => close(null));
    overlay.querySelector('.yc-whisper-language-confirm').addEventListener('click', async () => {
      const language = await savePreferredSubtitleWhisperLanguage(select.value);
      close(language);
    });
    overlay.querySelector('.yc-whisper-language-backdrop').addEventListener('click', () => close(null));
    document.head.appendChild(style);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', keydownHandler, true);
    setTimeout(() => select.focus(), 0);
  });
}

window.ycWhisperLanguageOptions = YC_SUBTITLE_WHISPER_LANGUAGE_OPTIONS;
window.ycGetWhisperLanguagePreference = getPreferredSubtitleWhisperLanguage;
window.ycChooseWhisperLanguage = chooseSubtitleWhisperLanguage;

function isTutorialDemoSubtitleVideo(videoId = getSubtitleButtonVideoId()) {
  return window.__ycIsTutorialDemoVideo?.(videoId) === true;
}

async function ensureSubtitleAuthLoaded() {
  if (!window.ycAuth?.getJWTPayload) {
    if (!window.dynamicLoader?.ensureAuthLoaded) return false;
    console.log("[SubtitleButton] Loading auth on demand...");
    await window.dynamicLoader.ensureAuthLoaded();
  }

  await window.ycAuth?.waitForAuthCache?.();
  return !!window.ycAuth?.getJWTPayload;
}

function resolveSubtitleLanguageName(codeOrName) {
  if (!codeOrName || typeof codeOrName !== "string") {
    return "Unknown";
  }

  const normalized = codeOrName.trim();
  if (!normalized) {
    return "Unknown";
  }

  if (typeof window.getLanguageByCode === "function") {
    const byCode = window.getLanguageByCode(normalized.toLowerCase());
    if (byCode?.name) {
      return byCode.name;
    }
  }

  const fallbackByCode = {
    he: "Hebrew",
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    ru: "Russian",
    ar: "Arabic",
    tr: "Turkish",
    ja: "Japanese",
    ko: "Korean",
    hi: "Hindi",
  };

  const lower = normalized.toLowerCase();
  if (fallbackByCode[lower]) {
    return fallbackByCode[lower];
  }

  // If this is already a readable name, keep it.
  if (/\s/.test(normalized) || /[A-Z]/.test(normalized)) {
    return normalized;
  }

  return normalized.toUpperCase();
}

function resolveOriginalSubtitleSourceName(subtitlesData) {
  const rawName = subtitlesData?.languageName || "";
  const rawCode = subtitlesData?.languageCode || "";
  const normalizedName = String(rawName || "").trim();
  const normalizedCode = String(rawCode || "").trim();

  if (normalizedName && !/gemini|translation/i.test(normalizedName)) {
    return normalizedName;
  }
  if (normalizedCode) {
    return resolveSubtitleLanguageName(normalizedCode);
  }
  return null;
}

function showSubtitleModeStatusOverlay(text) {
  const safeText = String(text || "").trim();
  if (!safeText) return;

  const player = document.querySelector(".html5-video-player");
  if (!player) return;

  let toast = window.subtitleState?.modeStatusToastElement || null;
  if (!toast || !toast.isConnected) {
    toast = createDOMElement("div", "yc-subtitle-mode-status-toast");
    toast.style.cssText = `
      position: absolute;
      top: 68px;
      left: 64px;
      z-index: 3005;
      max-width: min(72vw, 560px);
      padding: 8px 12px;
      border-radius: 2px;
      background: rgba(0, 0, 0, 0.82);
      color: #fff;
      font: 500 20px/1.25 Roboto, Arial, sans-serif;
      letter-spacing: 0.1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
      opacity: 0;
      transform: translateY(-4px);
      transition: opacity 140ms ease, transform 140ms ease;
    `;
    player.appendChild(toast);
    window.subtitleState.modeStatusToastElement = toast;
  }

  toast.textContent = safeText;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";

  if (window.subtitleState.modeStatusToastTimeout) {
    clearTimeout(window.subtitleState.modeStatusToastTimeout);
  }
  window.subtitleState.modeStatusToastTimeout = setTimeout(() => {
    if (!toast || !toast.isConnected) return;
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-4px)";
  }, SUBTITLE_MODE_STATUS_SHOW_MS);
}

async function showSubtitleModeStatusToast(videoId = null) {
  try {
    const settings = await chrome.storage.local.get([
      "showTranslation",
      "translationLanguage",
      "translationIncludeOriginal",
      "translationSecondaryLanguage",
      "aiTranscriptionMode",
    ]);

    const aiMode = normalizeAiModeForSubtitles(settings.aiTranscriptionMode);
    let useTranslation = settings.showTranslation === true;
    if (aiMode === "off") {
      useTranslation = false;
    }

    if (!useTranslation) {
      showSubtitleModeStatusOverlay("Subtitles: DEFAULT");
      return;
    }

    const primary = resolveSubtitleLanguageName(settings.translationLanguage || "he");
    const includeOriginal = settings.translationIncludeOriginal === true;
    const secondaryCode = settings.translationSecondaryLanguage || null;

    if (secondaryCode) {
      const secondary = resolveSubtitleLanguageName(secondaryCode);
      showSubtitleModeStatusOverlay(
        `Subtitles: TRANSLATE • Primary: ${primary} • Secondary: ${secondary}`
      );
      return;
    }

    if (includeOriginal) {
      let originalSource = null;
      if (videoId && window.databaseManager?.loadSubtitlesFromIndexedDB) {
        try {
          let subtitlesData = await window.databaseManager.loadSubtitlesFromIndexedDB(videoId);
          if (subtitlesData && window.databaseManager?.normalizeSubtitlesForActiveMode) {
            subtitlesData = await window.databaseManager.normalizeSubtitlesForActiveMode(
              subtitlesData,
              aiMode
            );
          }
          originalSource = resolveOriginalSubtitleSourceName(subtitlesData);
        } catch (dbError) {
          console.warn("[SubtitleButton] Could not resolve original source language:", dbError);
        }
      }

      const normalizedOriginal = originalSource || "Source audio";
      showSubtitleModeStatusOverlay(
        `Subtitles: TRANSLATE • Primary: ${primary} • Original: ${normalizedOriginal}`
      );
      return;
    }

    showSubtitleModeStatusOverlay(`Subtitles: TRANSLATE • Primary: ${primary}`);
  } catch (error) {
    console.warn("[SubtitleButton] Failed to show subtitle mode status toast:", error);
  }
}

function getSubtitleVideoDurationSeconds(fallbackSeconds = null) {
  const fallback = Number(fallbackSeconds);
  if (Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }

  const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
  const duration = Number(video?.duration);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

async function maybeConfirmLongGeminiForSubtitles(aiMode, durationSeconds) {
  return true;
}

// ------------------------------
// 🎬 Create Subtitle Button (Real Version)
// ------------------------------
window.createSubtitleButton = function () {
  const container = document.createElement('div');
  container.className = 'custom-button-container';

  const button = document.createElement('button');
  button.className = 'ytp-button ytp-subtitle-button';
  button.title = 'Toggle Subtitles';

  // SVG - CC בעיגול
  button.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <use class="ytp-svg-shadow"/>
    <circle class="ytp-svg-stroke" cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="1.5"/>
    <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-size="7" font-weight="bold" fill="#fff" class="ytp-svg-fill">CC</text>
  </svg>`;

  container.appendChild(button);
  return container;
};

// ------------------------------
// 🔐 Modal Functions for Authentication
// ------------------------------
function showSubtitleModal(icon, title, message, buttons = [{ text: 'OK', action: 'close' }]) {
  const existingModal = document.getElementById('yc-subtitle-auth-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'yc-subtitle-auth-modal';

  const buttonsHtml = buttons.map(btn => {
    const btnClass = btn.action === 'reload' ? 'yc-modal-btn-reload' :
      btn.action === 'upgrade' ? 'yc-modal-btn-upgrade' : 'yc-modal-btn-close';
    return `<button class="yc-modal-btn ${btnClass}" data-action="${btn.action}">${btn.text}</button>`;
  }).join('');

  modal.innerHTML = `
    <div class="yc-modal-backdrop"></div>
    <div class="yc-modal-content">
      <div class="yc-modal-icon">${icon}</div>
      <h2 class="yc-modal-title">${title}</h2>
      <p class="yc-modal-text">${message}</p>
      <div class="yc-modal-buttons">${buttonsHtml}</div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #yc-subtitle-auth-modal {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      z-index: 2147483647; display: flex; align-items: center; justify-content: center;
    }
    #yc-subtitle-auth-modal .yc-modal-backdrop {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px);
    }
    #yc-subtitle-auth-modal .yc-modal-content {
      position: relative; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 20px; padding: 40px; max-width: 420px; text-align: center;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.1);
    }
    #yc-subtitle-auth-modal .yc-modal-icon { font-size: 48px; margin-bottom: 15px; }
    #yc-subtitle-auth-modal .yc-modal-title { color: #fff; font-size: 24px; margin: 0 0 20px 0; font-weight: 600; }
    #yc-subtitle-auth-modal .yc-modal-text { color: #a0a0a0; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0; }
    #yc-subtitle-auth-modal .yc-modal-text strong { color: #fff; }
    #yc-subtitle-auth-modal .yc-modal-buttons { margin-top: 25px; display: flex; gap: 12px; }
    #yc-subtitle-auth-modal .yc-modal-btn { flex: 1; padding: 12px 24px; border-radius: 25px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; border: none; }
    #yc-subtitle-auth-modal .yc-modal-btn-close { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    #yc-subtitle-auth-modal .yc-modal-btn-close:hover { transform: scale(1.05); box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4); }
    #yc-subtitle-auth-modal .yc-modal-btn-reload { background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); color: white; }
    #yc-subtitle-auth-modal .yc-modal-btn-reload:hover { transform: translateY(-2px); box-shadow: 0 5px 20px rgba(231, 76, 60, 0.4); }
    #yc-subtitle-auth-modal .yc-modal-btn-upgrade { background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); color: white; }
    #yc-subtitle-auth-modal .yc-modal-btn-upgrade:hover { transform: translateY(-2px); box-shadow: 0 5px 20px rgba(243, 156, 18, 0.4); }
  `;

  document.head.appendChild(style);
  document.body.appendChild(modal);

  modal.querySelector('.yc-modal-backdrop').addEventListener('click', () => modal.remove());
  modal.querySelectorAll('.yc-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'reload') location.reload();
      else if (action === 'upgrade') {
        if (window.__ycOpenUpgradePage) {
          window.__ycOpenUpgradePage();
        } else {
          window.open('https://www.you-chords.com/upgrade', '_blank');
        }
      }
      modal.remove();
    });
  });
}

function showSubtitleSignInRequired() {
  const existingModal = document.getElementById('yc-subtitle-signin-modal');
  if (existingModal) existingModal.remove();

  // Remove existing style tag to prevent accumulation
  const existingStyle = document.getElementById('yc-subtitle-signin-modal-style');
  if (existingStyle) existingStyle.remove();

  const modal = document.createElement('div');
  modal.id = 'yc-subtitle-signin-modal';
  modal.innerHTML = `
    <div class="yc-modal-backdrop"></div>
    <div class="yc-modal-content">
      <button class="yc-modal-close-btn">×</button>
      <div class="yc-modal-icon">🔐</div>
      <h2 class="yc-modal-title">Sign In Required</h2>
      <p class="yc-modal-text">To access <strong>Subtitles</strong>, please sign in.</p>
      
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

  const style = document.createElement('style');
  style.id = 'yc-subtitle-signin-modal-style';
  style.textContent = `
    #yc-subtitle-signin-modal {
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
    #yc-subtitle-signin-modal .yc-modal-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
    }
    #yc-subtitle-signin-modal .yc-modal-content {
      position: relative;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 20px;
      padding: 40px;
      max-width: 450px;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    #yc-subtitle-signin-modal .yc-modal-close-btn {
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
    #yc-subtitle-signin-modal .yc-modal-close-btn:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.1);
    }
    #yc-subtitle-signin-modal .yc-modal-icon {
      font-size: 48px;
      margin-bottom: 20px;
    }
    #yc-subtitle-signin-modal .yc-modal-title {
      color: #fff;
      font-size: 28px;
      margin: 0 0 15px 0;
      font-weight: 700;
    }
    #yc-subtitle-signin-modal .yc-modal-text {
      color: rgba(255, 255, 255, 0.95);
      font-size: 16px;
      line-height: 1.6;
      margin: 0 0 15px 0;
    }
    #yc-subtitle-signin-modal .yc-modal-text strong {
      color: #fff;
      font-weight: 600;
    }
    #yc-subtitle-signin-modal .yc-google-signin-btn {
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
    #yc-subtitle-signin-modal .yc-google-signin-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
    }
    #yc-subtitle-signin-modal .yc-google-signin-btn:active {
      transform: translateY(0);
    }
    #yc-subtitle-signin-modal .yc-google-signin-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
      filter: grayscale(0.35);
    }
    #yc-subtitle-signin-modal .yc-google-signin-btn:disabled:hover {
      transform: none;
      box-shadow: none;
    }
    #yc-subtitle-signin-modal .yc-google-icon {
      width: 18px;
      height: 18px;
    }
    #yc-subtitle-signin-modal .yc-consent-error {
      color: #fecaca;
      font-size: 12px;
      margin: 4px 0 8px 0;
    }
    #yc-subtitle-signin-modal .yc-consent-notice {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
      line-height: 1.5;
      margin: 15px 0;
    }
    #yc-subtitle-signin-modal .yc-consent-notice a {
      color: white;
      text-decoration: underline;
    }
    #yc-subtitle-signin-modal .yc-or-divider {
      text-align: center;
      margin: 20px 0;
      color: rgba(255, 255, 255, 0.6);
      font-size: 14px;
    }
    #yc-subtitle-signin-modal .yc-toolbar-hint {
      text-align: center;
      color: rgba(255, 255, 255, 0.8);
      font-size: 14px;
      margin: 15px 0;
    }
    #yc-subtitle-signin-modal .yc-modal-help {
      color: rgba(255, 255, 255, 0.9);
      font-size: 15px;
      font-weight: 500;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    #yc-subtitle-signin-modal .yc-help-link {
      color: white;
      text-decoration: none;
      font-size: 13px;
      transition: color 0.2s;
    }
    #yc-subtitle-signin-modal .yc-help-link:hover {
      color: rgba(255, 255, 255, 0.8);
      text-decoration: underline;
    }
    #yc-subtitle-signin-modal .yc-signin-spinner {
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
      source: 'youtube_subtitle_modal'
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
        console.log('[Subtitle] Sign in successful!', response.user);

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
          const subtitleBtn = document.querySelector('[data-btn="subtitle"] .ytp-subtitle-button');
          if (subtitleBtn) {
            console.log('[Subtitle] Clicking subtitle button after sign in');
            subtitleBtn.click();
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

        console.error('[Subtitle] Sign in failed:', response.error);
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
      console.error('[Subtitle] Sign in error:', error);
      if (consentError) {
        consentError.textContent = getSignInFailureMessage(error?.message || error);
        consentError.style.display = 'block';
      }
      btn.textContent = 'Error. Try again';
      btn.disabled = false;
    }
  });
}

// ✅ Success notification after sign in
function showSignInSuccessNotification(userName) {
  // Remove existing notification if any
  const existing = document.getElementById('yc-signin-success-toast');
  if (existing) existing.remove();

  // Find video player container
  const videoPlayer = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
  if (!videoPlayer) {
    console.warn('[Subtitle] Video player not found for success notification');
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

function showSubtitleAuthError(message) {
  showSubtitleModal('⚠️', 'System Error', message,
    [{ text: 'Reload Page', action: 'reload' }, { text: 'Close', action: 'close' }]);
}

// ------------------------------
// 0. פונקציות עזר לטיפול בטקסט
// ------------------------------
function fixPunctuation(text) {
  if (!text || typeof text !== "string") return text;
  return text.replace(/([.!?])(?=\S)/g, "$1 ");
}

function normalizeWord(text) {
  if (!text || typeof text !== "string") return "";
  return fixPunctuation(text).trim();
}

function normalizeSubtitleText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isGeminiDefaultSubtitleSource() {
  return (
    window.subtitleState?.timingSourceKey === "gemini_default" &&
    window.subtitleState?.useTranslation === false
  );
}

function canMergeGeminiDefaultSentences(first, second) {
  if (!first || !second) return false;

  const firstText = normalizeSubtitleText(first.text);
  const secondText = normalizeSubtitleText(second.text);
  if (!firstText || !secondText) return false;

  const gapSec = Math.max(0, (second.startTime || 0) - (first.endTime || 0));
  if (gapSec > GEMINI_DEFAULT_MERGE_GAP_SEC) return false;

  const mergedDurationSec = Math.max(
    0,
    (second.endTime || 0) - (first.startTime || 0)
  );
  if (mergedDurationSec > GEMINI_DEFAULT_MERGE_MAX_WINDOW_SEC) return false;

  const mergedText = `${firstText} ${secondText}`;
  if (mergedText.length < GEMINI_DEFAULT_MIN_MERGE_CHARS) return false;

  return true;
}

function mergeGeminiDefaultSentences(first, second) {
  return {
    ...first,
    text: normalizeSubtitleText(`${first.text} ${second.text}`),
    startTime: first.startTime,
    endTime: second.endTime,
    _ycMergedGeminiDefault: true,
  };
}

function buildGeminiDefaultMergePairs(sentences) {
  if (!Array.isArray(sentences) || sentences.length === 0) return [];

  const pairsByIndex = new Array(sentences.length).fill(null);
  let i = 0;
  while (i < sentences.length - 1) {
    const first = sentences[i];
    const second = sentences[i + 1];

    if (canMergeGeminiDefaultSentences(first, second)) {
      const merged = mergeGeminiDefaultSentences(first, second);
      merged._ycMergedStartIndex = i;
      merged._ycMergedEndIndex = i + 1;
      pairsByIndex[i] = merged;
      pairsByIndex[i + 1] = merged;
      i += 2; // non-overlapping pairs only
      continue;
    }

    i += 1;
  }

  return pairsByIndex;
}

// ------------------------------
// 1. בדיקת RTL
// ------------------------------
function isRTLText(text) {
  const rtlCharsRegex =
    /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  if (!text || typeof text !== "string") return false;
  const matches = text.match(rtlCharsRegex);
  if (matches && matches.length > 0) {
    const rtlCharsCount = text
      .split("")
      .filter((char) => rtlCharsRegex.test(char)).length;
    const textWithoutSpaces = text.replace(/\s/g, "");
    if (textWithoutSpaces.length === 0) return false;
    const rtlRatio = rtlCharsCount / textWithoutSpaces.length;
    return rtlRatio > 0.1;
  }
  return false;
}

// ------------------------------
// 2. ניהול מצב הכתוביות - עם הוספת מערכי SPANs
// ------------------------------
const MAX_WORDS_PER_LINE = 30; // כמות SPAN-ים מוכנים מראש
const MAX_PIXEL_RATIO = 0.8; // לשימוש עתידי (מדידה-בפיקסלים)
const MAX_CHARS_PER_LINE = 42; // 🎬 Netflix standard (42 chars per line)
const MIN_SPLIT_LENGTH = 21; // 🎬 Netflix minimum (half of 42)
const MAX_LINES = 8; // 🆕 הגדלנו ל-8 שורות לתמיכה בדו-לשוני (4 לכל שפה)
const GEMINI_DEFAULT_MERGE_GAP_SEC = 0.45;
const GEMINI_DEFAULT_MERGE_MAX_WINDOW_SEC = 8.5;
const GEMINI_DEFAULT_MIN_MERGE_CHARS = 20;
const LEADING_PUNCT_REGEX = /^[.,;!?…]+$/; // מזהה סימני פיסוק "בודדים"
window.ycWordTranslationEnabled = false;

if (!window.subtitleState) {
  window.subtitleState = {
    isVisible: false,
    sentences: [],
    words: [],
    isRTL: false,
    sizePercentage: "300",
    overlay: null, // Main overlay div
    textContainer: null, // Inner container for lines (yt-subtitle-container)
    line1Element: null,
    line2Element: null,
    line3Element: null,
    line4Element: null,
    line5Element: null, // 🆕
    line6Element: null, // 🆕
    line7Element: null, // 🆕
    line8Element: null, // 🆕
    line1WordSpans: [],
    line2WordSpans: [],
    line3WordSpans: [],
    line4WordSpans: [],
    line5WordSpans: [], // 🆕
    line6WordSpans: [], // 🆕
    line7WordSpans: [], // 🆕
    line8WordSpans: [], // 🆕
    settingsMenu: null,
    isSettingsVisible: false,
    wordCountdownState: {},
    timing_offset: 0,
    displaySource: null,
    geminiDefaultMergePairsByIndex: null,
    useTranslation: false,
    translationIncludeOriginal: false,
    translationSecondaryLanguage: null,
    isSingleLanguageTranslation: false,
    modeStatusToastElement: null,
    modeStatusToastTimeout: null,
  };
}
if (!window.subtitleObservers) {
  window.subtitleObservers = [];
}
if (!window.subtitleModeState) {
  window.subtitleModeState = {
    isLyricsMode: true,
    isSubtitleMode: false,
    lastMode: "lyrics",
    isLyricsHighlightEnabled: true,
    isChordsHighlightEnabled: false,
  };
}
window.currentSubtitleColor = window.currentSubtitleColor || "#FFFFFF";
window.currentHighlightColor =
  window.currentHighlightColor || "rgba(255, 255, 0, 0.5)";
window.currentHighlightBackgroundEnabled =
  window.currentHighlightBackgroundEnabled === true;
window.currentFontOpacity = window.currentFontOpacity || "100";
window.currentBackgroundColor =
  window.currentBackgroundColor || "rgba(0, 0, 0, 0.8)";
window.currentBackgroundOpacity =
  window.currentBackgroundOpacity || DEFAULT_BG_OPACITY;
window.currentWordCountdownType = window.currentWordCountdownType || "none";
window.currentWordHighlightTextColor =
  window.currentWordHighlightTextColor || "#FFFFFF";
window.hasCustomWordHighlightTextColor =
  window.hasCustomWordHighlightTextColor || false;

// Shared preference for the word-level Whisper/WhisperX highlight. The
// sentence remains active when this is false; only the moving word highlight
// is disabled.
const storedWordHighlightPreference = localStorage.getItem("yc_carousel_word_highlight");
window.wordHighlightEnabled =
  storedWordHighlightPreference !== null
    ? storedWordHighlightPreference === "true"
    : true;

window.setWordHighlightPreference = function (isEnabled) {
  const enabled = isEnabled !== false;
  window.wordHighlightEnabled = enabled;
  localStorage.setItem("yc_carousel_word_highlight", String(enabled));

  if (window.subtitleModeState) {
    window.subtitleModeState.isLyricsHighlightEnabled = enabled;
  }
  try {
    chrome.storage.sync.set({ subtitleLyricsHighlightEnabled: enabled });
  } catch (error) {
    console.warn("[SubtitleButton] Failed to persist word highlight preference:", error);
  }

  window.applyCurrentSubtitlePreferences?.();
  window.updateSubtitles?.();

  const instance = window.CarouselSubtitles?.activeInstance;
  if (instance?.isVisible && instance.videoElement) {
    instance._renderSubtitles(instance.videoElement.currentTime);
  }
};

// ------------------------------
// 3. פונקציות עזר: debounce ויצירת אלמנטים
// ------------------------------
const debounce = (fn, delay = 50) => {
  let timer = null;
  function wrapper(...args) {
    const context = this;
    clearTimeout(timer);
    if (window.requestIdleCallback) {
      timer = setTimeout(() => {
        requestIdleCallback(() => fn.apply(context, args), { timeout: delay });
      }, delay / 2);
    } else {
      timer = setTimeout(() => fn.apply(context, args), delay);
    }
  }
  /* ⬅️ מאפשר ביטול ידני — נשתמש ב-beforeunload */
  wrapper.cancel = () => clearTimeout(timer);
  return wrapper;
};

const createDOMElement = (tag, className, styles = "") => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (styles) element.style.cssText = styles;
  return element;
};

// ------------------------------
// 4. פונקציות לפענוח SRT
// ------------------------------
const parseTime = (timeStr) => {
  if (!timeStr || typeof timeStr !== "string") return 0;
  const match = timeStr.trim().match(/^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) return 0;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const secs = parseInt(match[3], 10);
  const ms = parseInt(match[4].padEnd(3, "0"), 10);

  if (
    isNaN(hours) ||
    isNaN(minutes) ||
    isNaN(secs) ||
    isNaN(ms) ||
    minutes > 59 ||
    secs > 59 ||
    ms > 999
  ) return 0;
  return hours * 3600 + minutes * 60 + secs + ms / 1000;
};

const parseSRT = (content) => {
  if (!content || typeof content !== "string")
    return { subtitles: [], isRTL: false };
  const normalizedContent = content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = normalizedContent.trim() ? normalizedContent.trim().split("\n") : [];
  const timingRegex =
    /(\d{1,3}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{1,3})/;
  const timingLines = [];

  // Locate every timing line directly instead of relying on blank lines.
  // Some YouTube/SRT exporters omit a blank separator between two cues;
  // block-based parsing would then swallow the following cue.
  lines.forEach((line, index) => {
    const match = line.match(timingRegex);
    if (match) timingLines.push({ lineIndex: index, match });
  });

  const parsedSubs = timingLines
    .map(({ lineIndex, match }, cueIndex) => {
      const nextTimingLineIndex = timingLines[cueIndex + 1]?.lineIndex ?? lines.length;
      let textLines = lines.slice(lineIndex + 1, nextTimingLineIndex);

      // Remove the numeric cue index immediately before the next timing line.
      while (textLines.length && !textLines[textLines.length - 1].trim()) {
        textLines.pop();
      }
      if (
        textLines.length &&
        /^\s*\d+\s*$/.test(textLines[textLines.length - 1])
      ) {
        textLines.pop();
      }

      const textContent = textLines
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n")
        .trim();
      if (!textContent) return null;

      const startTime = parseTime(match[1]);
      const endTime = parseTime(match[2]);
      if (endTime <= startTime) return null;

      return { startTime, endTime, text: textContent };
    })
    .filter(Boolean)
    .sort((a, b) => a.startTime - b.startTime);

  let isRTLContent = false;
  if (parsedSubs.length > 0) {
    const sampleSize = Math.min(10, parsedSubs.length);
    let rtlCount = 0;
    for (let i = 0; i < sampleSize; i++) {
      const subtitleIndex = Math.floor((i * parsedSubs.length) / sampleSize);
      const subtitle = parsedSubs[subtitleIndex];
      if (subtitle && isRTLText(subtitle.text)) rtlCount++;
    }
    isRTLContent = rtlCount / sampleSize > 0.3;
  }
  return { subtitles: parsedSubs, isRTL: isRTLContent };
};

const SUBTITLE_MERGE_MAX_GAP_SEC = 0.35;
const SUBTITLE_MERGE_MAX_WINDOW_SEC = 8;
const SUBTITLE_MERGE_MAX_CHARS = MAX_CHARS_PER_LINE * 2;
const SUBTITLE_TERMINAL_PUNCTUATION_REGEX = /[.!?…。！？]$/u;

function mergeAdjacentSubtitleCues(subtitles) {
  if (!Array.isArray(subtitles) || subtitles.length < 2) {
    return subtitles || [];
  }

  const merged = [];
  subtitles.forEach((cue) => {
    if (!cue || !Number.isFinite(cue.startTime) || !Number.isFinite(cue.endTime)) {
      return;
    }

    const current = { ...cue };
    const previous = merged[merged.length - 1];
    if (!previous) {
      merged.push(current);
      return;
    }

    const previousText = String(previous.text || "")
      .replace(/\s+/g, " ")
      .trim();
    const currentText = String(current.text || "")
      .replace(/\s+/g, " ")
      .trim();
    const gap = current.startTime - previous.endTime;
    const combinedText = `${previousText} ${currentText}`.trim();
    const previousEndsSentence = SUBTITLE_TERMINAL_PUNCTUATION_REGEX.test(previousText);
    const hasOverlap = gap < -0.05;
    const exceedsGap = gap > SUBTITLE_MERGE_MAX_GAP_SEC;
    const exceedsWindow = current.endTime - previous.startTime > SUBTITLE_MERGE_MAX_WINDOW_SEC;
    const exceedsTwoLines = combinedText.length > SUBTITLE_MERGE_MAX_CHARS;

    // Merge only clear continuations: cues must be almost touching, the first
    // cue must not already end a sentence, and the result must fit two lines.
    if (
      previousText &&
      currentText &&
      !previousEndsSentence &&
      !hasOverlap &&
      !exceedsGap &&
      !exceedsWindow &&
      !exceedsTwoLines
    ) {
      previous.text = combinedText;
      previous.endTime = current.endTime;
      previous._ycMergedCueCount = (previous._ycMergedCueCount || 1) + 1;
      return;
    }

    merged.push(current);
  });

  return merged;
}

// ------------------------------
// 5. טעינת כתוביות
// ------------------------------
async function loadSubtitles(forceLoad = false, sourceOverride = null) {
  try {
    const translationSettings = await chrome.storage.local.get(["wordTranslationEnabled"]);
    window.ycWordTranslationEnabled = translationSettings.wordTranslationEnabled === true;
    if (window.DEBUG)
      console.log(`[SubtitleButton DEBUG] loadSubtitles: Function started`);
    const currentUrl = window.location.href;
    const videoId = window.ycUtils?.extractVideoId
      ? window.ycUtils.extractVideoId(currentUrl)
      : null;

    if (!videoId) {
      console.error(
        "[SubtitleButton] loadSubtitles: Could not extract video ID from URL"
      );
      showError("Invalid YouTube URL (loadSubtitles)");
      window.subtitleState.sentences = [];
      window.subtitleState.words = [];
      window.subtitleState.isRTL = false;
      window.subtitleState.isCustomPrompt = false;
      return false;
    }

    if (window.DEBUG)
      console.log(
        `[SubtitleButton] loadSubtitles: Loading subtitles for video ${videoId} from IndexedDB...`
      );

    // 🤖 Check AI Transcription mode
    const aiSettings = await new Promise((resolve) => {
      chrome.storage.local.get(['aiTranscriptionMode', 'geminiApiKey', 'geminiApiKeys'], (result) => {
        resolve(result);
      });
    });
    const aiMode = aiSettings.aiTranscriptionMode || 'off';
    const hasApiKey = !!aiSettings.geminiApiKey || hasActiveGeminiKeyForSubtitles(aiSettings.geminiApiKeys);

    let subtitlesData =
      await window.databaseManager?.loadSubtitlesFromIndexedDB?.(videoId);
    if (sourceOverride === "custom") {
      const customSRT = typeof subtitlesData?.customSubtitleSRT === "string"
        ? subtitlesData.customSubtitleSRT.trim()
        : "";
      if (!customSRT) {
        return false;
      }
      subtitlesData = {
        ...subtitlesData,
        sentenceSRT: customSRT,
        wordSRT: "",
        translationSRT: customSRT,
        activeDefaultSource: "custom",
        hasActiveDefault: true,
        customSubtitleActive: true,
      };
    } else if (sourceOverride === "original" && subtitlesData) {
      // CC is intentionally independent from the uploaded translated track.
      subtitlesData = { ...subtitlesData, customSubtitleActive: false };
    }
    if (subtitlesData && window.databaseManager?.normalizeSubtitlesForActiveMode) {
      subtitlesData = await window.databaseManager.normalizeSubtitlesForActiveMode(subtitlesData, aiMode);
    }
    if (window.DEBUG)
      console.log(
        `[SubtitleButton DEBUG] loadSubtitles: subtitlesData from DB:`,
        subtitlesData
      );

    // In ALWAYS, the normalized active default already respects strict mode
    // vs YouTube fallback, so do not require Gemini-only cache here.
    if (aiMode === 'always' && hasApiKey && !forceLoad) {
      const hasActiveDefault = !!(
        subtitlesData?.hasActiveDefault ||
        subtitlesData?.sentenceSRT?.trim()
      );
      const hasTranslationSRT = !!subtitlesData?.translationSRT?.trim();

      if (subtitlesData && (hasActiveDefault || hasTranslationSRT)) {
        if (window.DEBUG) console.log('[SubtitleButton] 🤖 Found active subtitles in cache - loading (ALWAYS mode)');
      } else {
        if (window.DEBUG) console.log('[SubtitleButton] 🤖 No active subtitles in cache - returning false to force fetch (ALWAYS mode)');
        window.subtitleState.sentences = [];
        window.subtitleState.words = [];
        window.subtitleState.isRTL = false;
        window.subtitleState.isCustomPrompt = false;
        return false;
      }
    }

    if (
      !subtitlesData ||
      (!subtitlesData.sentenceSRT?.trim() && !subtitlesData.wordSRT?.trim() && !subtitlesData.translationSRT?.trim())
    ) {
      // Not a warning - this is normal when video has no subtitles
      console.log(
        `[SubtitleButton] No subtitles in IndexedDB for video ${videoId} - will try to fetch`
      );
      window.subtitleState.sentences = [];
      window.subtitleState.words = [];
      window.subtitleState.isRTL = false;
      window.subtitleState.isCustomPrompt = false;
      return false;
    }

    // 🎯 Store custom prompt flag in subtitleState for carousel visibility control
    // But only if it matches the currently selected prompt!
    let isCustomPromptActive = false;
    if (subtitlesData.isCustomPrompt && subtitlesData.customPromptId) {
      try {
        const result = await chrome.storage.local.get(['selectedPromptId']);
        const selectedPromptId = result.selectedPromptId || 'default';

        // Only set flag if custom prompt matches currently selected prompt
        if (selectedPromptId === subtitlesData.customPromptId) {
          isCustomPromptActive = true;
          console.log('[SubtitleButton] ✅ Custom prompt matches selected prompt - carousel will skip subtitles');
        } else {
          console.log('[SubtitleButton] ⚠️ Custom prompt mismatch - DB:', subtitlesData.customPromptId, 'Selected:', selectedPromptId);
          console.log('[SubtitleButton] 🔄 Will use default prompt data instead');
        }
      } catch (e) {
        console.warn('[SubtitleButton] Failed to check selected prompt:', e);
      }
    }
    window.subtitleState.isCustomPrompt = isCustomPromptActive;

    let isRTL = false;

    // 🆕 בדיקה אם המשתמש בחר תרגום
    let useTranslation = false;
    let translationIncludeOriginal = false;
    let translationSecondaryLanguage = null;
    try {
      const selectionResult = await chrome.storage.local.get([
        'showTranslation',
        'translationIncludeOriginal',
        'translationSecondaryLanguage'
      ]);
      useTranslation = selectionResult.showTranslation === true;
      translationIncludeOriginal = selectionResult.translationIncludeOriginal === true;
      const secondaryRaw =
        typeof selectionResult.translationSecondaryLanguage === 'string'
          ? selectionResult.translationSecondaryLanguage.trim()
          : '';
      translationSecondaryLanguage = secondaryRaw || null;
    } catch (e) {
      console.warn("[SubtitleButton] Failed to check translation mode:", e);
    }

    // OFF mode is YouTube-only. Ignore translation selection and force DEFAULT.
    if (aiMode === 'off' && useTranslation) {
      console.log('[SubtitleButton] AI mode OFF - forcing DEFAULT subtitles');
      useTranslation = false;
    }

    // 🆕 שמור את useTranslation ב-subtitleState לשימוש בהמשך
    window.subtitleState.useTranslation = useTranslation;
    window.subtitleState.translationIncludeOriginal =
      useTranslation && translationIncludeOriginal;
    window.subtitleState.translationSecondaryLanguage =
      useTranslation ? translationSecondaryLanguage : null;
    window.subtitleState.isSingleLanguageTranslation =
      useTranslation &&
      !window.subtitleState.translationIncludeOriginal &&
      !window.subtitleState.translationSecondaryLanguage;
    window.subtitleState.geminiDefaultMergePairsByIndex = null;
    window.subtitleState.activeDefaultSource =
      subtitlesData?.activeDefaultSource === "custom"
        ? "custom"
        : subtitlesData?.activeDefaultSource === "whisper"
          ? "whisper"
        : subtitlesData?.activeDefaultSource === "gemini"
          ? "gemini"
          : "youtube";

    const fallbackSourceKey = window.databaseManager?.resolveSubtitleOffsetSourceKey
      ? window.databaseManager.resolveSubtitleOffsetSourceKey({
        useTranslation,
        activeDefaultSource: window.subtitleState.activeDefaultSource,
      })
        : (useTranslation
        ? "gemini_translation"
        : window.subtitleState.activeDefaultSource === "whisper"
          ? "whisper_default"
          : window.subtitleState.activeDefaultSource === "gemini"
            ? "gemini_default"
            : "youtube_default");

    window.subtitleState.timingSourceKey = fallbackSourceKey;
    window.subtitleState.timing_offset = 0;

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
        window.subtitleState.timing_offset = Number(offsetResult?.offset) || 0;
        window.subtitleState.timingSourceKey =
          offsetResult?.sourceKey || fallbackSourceKey;
      } catch (offsetError) {
        console.warn("[SubtitleButton] Failed to load subtitle timing offset:", offsetError);
      }
    }

    // 🎯 Validate that we have the required data for the selected prompt
    const hasTranslation = !!(subtitlesData.translationSRT?.trim());
    const hasDefault = !!(subtitlesData.sentenceSRT?.trim());

    // If user wants TRANSLATION but we only have DEFAULT → return false
    if (useTranslation && !hasTranslation) {
      console.log('[SubtitleButton] ⚠️ User wants TRANSLATION but only DEFAULT in cache - returning false');
      window.subtitleState.sentences = [];
      window.subtitleState.words = [];
      return false;
    }

    // If user wants DEFAULT but we only have TRANSLATION → return false
    if (!useTranslation && !hasDefault && hasTranslation) {
      console.log('[SubtitleButton] ⚠️ User wants DEFAULT but only TRANSLATION in cache - returning false');
      window.subtitleState.sentences = [];
      window.subtitleState.words = [];
      return false;
    }

    // 🆕 בחירת ה-SRT המתאים
    const useSRT = (useTranslation && hasTranslation)
      ? subtitlesData.translationSRT
      : subtitlesData.sentenceSRT;

    if (useSRT?.trim()) {
      const parsedResult = parseSRT(useSRT);
      window.subtitleState.sentences = mergeAdjacentSubtitleCues(parsedResult.subtitles);
      isRTL = parsedResult.isRTL;
      if (window.DEBUG)
        console.log(
          `[SubtitleButton] loadSubtitles: Loaded ${parsedResult.subtitles.length} sentence subtitles, displayed as ${window.subtitleState.sentences.length} cues after continuation merge. isRTL: ${isRTL}`,
          useTranslation ? '(translation)' : '(default)'
        );
    } else {
      window.subtitleState.sentences = [];
    }

    if (
      !window.subtitleModeState?.isSubtitleMode &&
      subtitlesData.wordSRT?.trim()
    ) {
      const parsedWords = parseSRT(subtitlesData.wordSRT);
      window.subtitleState.words = parsedWords.subtitles;
      if (!isRTL && parsedWords.isRTL) {
        isRTL = true;
      }
      if (window.DEBUG)
        console.log(
          `[SubtitleButton] loadSubtitles: Loaded ${parsedWords.subtitles.length} word timings. Overall isRTL: ${isRTL}`
        );
    } else {
      window.subtitleState.words = [];
    }

    window.subtitleState.isRTL = isRTL;

    if (
      window.subtitleState.sentences.length === 0 &&
      window.subtitleState.words.length === 0
    ) {
      console.warn(
        `[SubtitleButton] loadSubtitles: No actual subtitle content after parsing for video ${videoId}`
      );
      return false;
    }
    if (window.ycWordTranslationEnabled && window.subtitleState.words.length) {
      window.startWordTranslation?.();
    }
    return true;
  } catch (error) {
    console.error(
      "[SubtitleButton] loadSubtitles: Error loading subtitles from IndexedDB:",
      error
    );
    showError("Error loading subtitles: " + error.message);
    window.subtitleState.sentences = [];
    window.subtitleState.words = [];
    window.subtitleState.isRTL = false;
    window.subtitleState.isCustomPrompt = false;
    return false;
  }
}

// Export loadSubtitles for use by other modules (e.g., chordCarousel)
window.loadSubtitles = loadSubtitles;

window.startWordTranslation = async function startWordTranslation() {
  if (!window.ycWordTranslationEnabled || !window.subtitleState?.words?.length) return;
  try {
    await window.dynamicLoader?.ensureDatabaseManagerLoaded?.();
    await window.dynamicLoader?.loadGroup?.("whisper");
    const videoId = window.ycUtils?.extractVideoId?.(window.location.href);
    const translationSettings = await chrome.storage.local.get(["wordTranslationLanguages"]);
    const choice = translationSettings.wordTranslationLanguages || "he";
    const languages = choice === "both" ? ["he", "en"] : [choice];
    window.subtitleState.wordTranslationByWord = new Map();
    window.updateSubtitles?.();
    const translated = await window.ycWordTranslations?.translate(
      videoId,
      window.subtitleState.words,
      languages
    );
    if (!translated) return;
    const byWord = new Map();
    window.subtitleState.words.forEach((word, index) => {
      const label = languages.map((lang) => translated[index]?.[lang]).filter(Boolean).join(" · ");
      if (label) byWord.set(`${Math.round(word.startTime * 1000)}|${normalizeWord(word.text)}`, label);
    });
    window.subtitleState.wordTranslationByWord = byWord;
    window.updateSubtitles?.();
  } catch (error) {
    console.warn("[WordTranslation] Could not translate words:", error);
    window.showYouChordsToast?.(error?.message || "Word translation failed. Check your Gemini API key.");
  }
};

chrome.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const translationChanged = changes.wordTranslationEnabled || changes.wordTranslationLanguages || changes.geminiGlobalModel;
  if (!translationChanged) return;
  window.ycWordTranslationEnabled = changes.wordTranslationEnabled
    ? changes.wordTranslationEnabled.newValue === true
    : window.ycWordTranslationEnabled;
  if (window.ycWordTranslationEnabled) window.startWordTranslation?.();
  else {
    window.subtitleState.wordTranslationByWord = new Map();
    window.updateSubtitles?.();
  }
});

// ------------------------------
// 🔄 Subtitle Refresh API for Prompt Changes
// ------------------------------
window.ycSubtitles = {
  /**
   * Reload the currently visible subtitle overlay after its IndexedDB source
   * changes. Keep the existing click controller and video listeners alive so
   * the refresh cannot be mistaken for a second toggle click.
   */
  async refreshActiveSource(videoId = null) {
    if (!window.subtitleState?.isVisible) return false;

    const currentVideoId = window.ycUtils?.extractVideoId?.(window.location.href);
    if (!currentVideoId || (videoId && currentVideoId !== videoId)) return false;

    const source = window.subtitleState.displaySource === "custom" ? "custom" : "original";
    const loadedSuccessfully = await loadSubtitles(true, source);
    const hasSubtitles = Boolean(
      (window.subtitleState.sentences?.length || 0) > 0 ||
      (window.subtitleState.words?.length || 0) > 0
    );
    if (!loadedSuccessfully || !hasSubtitles) return false;

    if (!ensureSubtitleDOM()) return false;
    window.subtitleState.isVisible = true;
    if (window.subtitleState.overlay) {
      window.subtitleState.overlay.style.display = "block";
    }
    setSubtitleButtonVisualSource(source);
    updateSubtitles();
    return true;
  },

  /**
   * Refresh subtitles when prompt changes in popup
   */
  async refreshWithNewPrompt(showTranslation, selectedCustomPromptId = null) {
    console.log('[SubtitleButton] 🔄 Refreshing with new prompt:', {
      showTranslation: showTranslation ? 'TRANSLATION' : 'DEFAULT',
      customPromptId: selectedCustomPromptId || 'none'
    });

    if (!window.subtitleState?.isVisible) {
      console.log('[SubtitleButton] ⏸️ Subtitles not visible - ignoring');
      return;
    }

    const currentUrl = window.location.href;
    const videoId = window.ycUtils?.extractVideoId?.(currentUrl);
    if (!videoId) return;

    try {
      const aiModeSettings = await chrome.storage.local.get(['aiTranscriptionMode']);
      const aiMode = aiModeSettings.aiTranscriptionMode || 'off';
      const canUseGemini = aiMode === 'auto' || aiMode === 'always';

      let subtitlesData = await window.databaseManager?.loadFromDatabase?.('subtitles', videoId);
      if (subtitlesData && window.databaseManager?.normalizeSubtitlesForActiveMode) {
        subtitlesData = await window.databaseManager.normalizeSubtitlesForActiveMode(subtitlesData, aiMode);
      }

      if (!subtitlesData) {
        console.log('[SubtitleButton] ⚠️ No data in IndexedDB - hiding subtitles');
        this.hide();
        return;
      }

      const hasTranslation = !!(subtitlesData.translationSRT?.trim());
      if (aiMode === 'off' && showTranslation && !selectedCustomPromptId) {
        console.log('[SubtitleButton] AI mode OFF - ignoring TRANSLATION refresh request');
        showTranslation = false;
      }
      const hasDefault = !!(
        subtitlesData.hasActiveDefault ||
        subtitlesData.sentenceSRT?.trim()
      );
      const hasCustom = !!(subtitlesData.customPromptResponse?.trim());
      const customPromptMatches = selectedCustomPromptId === subtitlesData.customPromptId;

      console.log('[SubtitleButton] 🔍 Data check:', {
        hasTranslation,
        hasDefault,
        hasCustom,
        customPromptMatches,
        selectedCustomPromptId,
        cachedCustomPromptId: subtitlesData.customPromptId
      });

      // 🎯 Check if we have the required data
      let needsData = false;

      if (selectedCustomPromptId && (!hasCustom || !customPromptMatches)) {
        console.log('[SubtitleButton] ⚠️ Custom prompt not in cache or mismatch');
        needsData = true;
      } else if (showTranslation && !hasTranslation) {
        console.log('[SubtitleButton] ⚠️ Translation not in cache');
        needsData = true;
      } else if (!showTranslation && !selectedCustomPromptId && !hasDefault) {
        console.log('[SubtitleButton] ⚠️ Default not in cache');
        needsData = true;
      }

      if (needsData) {
        if (!canUseGemini) {
          console.log('[SubtitleButton] AI mode OFF - fetching missing DEFAULT subtitles from YouTube without Gemini progress');
        } else {
          console.log('[SubtitleButton] 🚀 Fetching missing data from Gemini...');
        }

        // Show progress bar only when Gemini can actually run.
        if (canUseGemini) {
          const video = document.querySelector('video.html5-main-video');
          const durationMinutes = video?.duration ? video.duration / 60 : 3;

          if (window.extractorModule?.createSubtitlesProgressBar) {
            console.log('[SubtitleButton] 🎬 Creating progress bar...');
            window.extractorModule.createSubtitlesProgressBar(durationMinutes);
          }
        }

        // 🎯 Set flag to ignore custom prompts
        window.ycIgnoreCustomPromptForSubtitles = true;
        console.log('[SubtitleButton] 🎯 Ignoring custom prompts during refresh');

        try {
          // Fetch data
          await window.youtubeSubtitles.fetchAndSaveYouTubeSubtitles(videoId, null, null, {
            showDefault: !showTranslation && !selectedCustomPromptId,
            selectedCustomPromptId: selectedCustomPromptId,
            showTranslation: showTranslation
          });

          console.log('[SubtitleButton] ✅ Data fetched successfully');
        } finally {
          // 🎯 Always clear the flag
          window.ycIgnoreCustomPromptForSubtitles = false;
        }
      } else {
        console.log('[SubtitleButton] ✅ Data already in cache');
      }

      // Reload and display subtitles (always, whether we fetched or not)
      console.log('[SubtitleButton] 🔄 Reloading subtitles...');
      await loadSubtitles();

    } catch (error) {
      console.error('[SubtitleButton] Error refreshing:', error);
      this.hide();
    }
  },

  async showSource(source) {
    return activateSubtitleSource(source);
  },

  async hasCustomTrack(videoId = null) {
    const activeVideoId = videoId || window.ycUtils?.extractVideoId?.(window.location.href);
    if (!activeVideoId) return false;
    await window.dynamicLoader?.ensureDatabaseManagerLoaded?.();
    const record = await window.databaseManager?.loadFromDatabase?.('subtitles', activeVideoId);
    return Boolean(record?.customSubtitleSRT?.trim());
  },

  /**
   * 🔄 Handle translation refresh from popup
   * Called when user clicks "Refresh" button in popup after changing translation settings
   */
  async handleTranslationRefresh(videoId) {
    console.log('[SubtitleButton] 🔄 Translation refresh requested for video:', videoId);

    // Check if subtitles are visible
    if (!window.subtitleState?.isVisible) {
      console.log('[SubtitleButton] ⏸️ Subtitles not visible - ignoring translation refresh');
      return;
    }

    // Check if this is the current video
    const currentVideoId = window.ycUtils?.extractVideoId?.(window.location.href);
    if (currentVideoId !== videoId) {
      console.log('[SubtitleButton] ⚠️ Video ID mismatch - ignoring translation refresh');
      return;
    }

    // Check if user is viewing translation mode
    const userSettings = await new Promise((resolve) => {
      chrome.storage.local.get(['showTranslation'], (result) => resolve(result));
    });

    if (!userSettings.showTranslation) {
      console.log('[SubtitleButton] ℹ️ User not in translation mode - ignoring refresh');
      return;
    }

    console.log('[SubtitleButton] 🚀 Starting translation refresh...');

    // Show progress bar
    const video = document.querySelector('video.html5-main-video');
    const durationMinutes = video?.duration ? video.duration / 60 : 3;

    if (window.extractorModule?.createSubtitlesProgressBar) {
      console.log('[SubtitleButton] 🎬 Creating progress bar...');
      window.extractorModule.createSubtitlesProgressBar(durationMinutes);
    }

    // Set flag to ignore custom prompts
    window.ycIgnoreCustomPromptForSubtitles = true;

    try {
      // Fetch new translation from Gemini
      await window.youtubeSubtitles.fetchAndSaveYouTubeSubtitles(videoId, null, null, {
        showDefault: false,
        selectedCustomPromptId: null,
        showTranslation: true
      });

      console.log('[SubtitleButton] ✅ Translation fetched successfully');

      // Reload subtitles with new data
      console.log('[SubtitleButton] 🔄 Reloading subtitles...');
      await loadSubtitles();
    } catch (error) {
      console.error('[SubtitleButton] ❌ Error refreshing translation:', error);
    } finally {
      // Always clear the flag
      window.ycIgnoreCustomPromptForSubtitles = false;
    }
  },

  /**
   * Hide subtitles
   */
  hide() {
    console.log('[SubtitleButton] Hiding subtitles');
    deactivateSubtitleOverlay();
  }
};

// ------------------------------
// 🚀 Listen to prompt changes from popup
// ------------------------------
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.command === 'promptChanged') {
    console.log('[SubtitleButton] 📨 Received promptChanged message');

    // Check if subtitles are visible
    if (!window.subtitleState?.isVisible) {
      console.log('[SubtitleButton] ⏸️ Subtitles not visible - ignoring prompt change');
      return;
    }

    console.log('[SubtitleButton] 🔄 Subtitles visible - refreshing with new prompt...');

    try {
      // Refresh subtitles with new prompt
      if (window.ycSubtitles?.refreshWithNewPrompt) {
        await window.ycSubtitles.refreshWithNewPrompt(
          message.showTranslation,
          message.selectedCustomPromptId
        );
      }
    } catch (error) {
      console.error('[SubtitleButton] Error handling prompt change:', error);
    }
  }
});

// ------------------------------
// 6. הצגת הודעות שגיאה
// ------------------------------
const showError = (message, duration = 5000) => {
  if (window.ycUtils && window.ycUtils.showErrorOverlay) {
    window.ycUtils.showErrorOverlay(message, duration);
    return;
  }
  const videoPlayer = document.querySelector(".html5-video-player");
  if (!videoPlayer) return;

  const errorOverlay = createDOMElement(
    "div",
    "yc-error-message-local",
    `
    position: absolute; bottom: 70px; left: 50%; transform: translateX(-50%);
    background: rgba(200, 0, 0, 0.9); color: white; padding: 10px 15px;
    border-radius: 5px; z-index: 2147483647; font-size: 14px; text-align: center;
  `
  );
  errorOverlay.textContent = message;
  videoPlayer.appendChild(errorOverlay);
  setTimeout(() => errorOverlay.remove(), duration);
};

// ------------------------------
// 7. איתור הכתוביות והמילה הנוכחית לפי זמן
// ------------------------------
const findCurrentSubtitles = (currentTime) => {
  const adjustedTime = currentTime + (window.subtitleState.timing_offset || 0);

  const sentences = window.subtitleState.sentences || [];
  const currentSentenceIndex = sentences.findIndex(
    (sub) => adjustedTime >= sub.startTime && adjustedTime <= sub.endTime
  );
  let currentSentence =
    currentSentenceIndex >= 0 ? sentences[currentSentenceIndex] : null;

  const allowGeminiDefaultMerge =
    !!currentSentence &&
    isGeminiDefaultSubtitleSource() &&
    (window.subtitleModeState?.isSubtitleMode || !window.subtitleState.words?.length);

  if (allowGeminiDefaultMerge && currentSentenceIndex >= 0) {
    if (
      !Array.isArray(window.subtitleState.geminiDefaultMergePairsByIndex) ||
      window.subtitleState.geminiDefaultMergePairsByIndex.length !== sentences.length
    ) {
      window.subtitleState.geminiDefaultMergePairsByIndex =
        buildGeminiDefaultMergePairs(sentences);
    }

    const mergedForCurrentIndex =
      window.subtitleState.geminiDefaultMergePairsByIndex?.[currentSentenceIndex];
    if (mergedForCurrentIndex) {
      currentSentence = mergedForCurrentIndex;
    }
  }

  let currentWord =
    !window.subtitleModeState?.isSubtitleMode && window.subtitleState.words
      ? window.subtitleState.words.find(
          (word) =>
            adjustedTime >= word.startTime && adjustedTime <= word.endTime
        )
      : null;

  // For merged Gemini-DEFAULT subtitle pairs, keep display-only mode (no word highlight mismatch).
  if (currentSentence?._ycMergedGeminiDefault) {
    currentWord = null;
  }
  return { currentSentence, currentWord };
};

// ------------------------------
// 7.5 פונקציה גלובלית previewSubtitles
// ------------------------------
// • מקבלת ‎time‎ (שניות) ומרנדרת מיידית כתוביות למיקום זה—ל-"Preview" בעת גרירה
// • משתמשת באותן SPANS ממוחזרים → אין הקצאות חדשות → ללא דליפות RAM
// • אם הכתוביות אינן פעילות – יוצאת מיד (early-return)
// • שומרת על הלוגיקה של highlight כמו בפונקציה updateSubtitles
window.previewSubtitles = function (time) {
  if (!window.subtitleState?.isVisible) return; // ‎⟵‎ אין כתוביות מוצגות

  // מאתרים משפט + מילה בזמן שרירותי (לא video.currentTime)
  const { currentSentence, currentWord } = findCurrentSubtitles(time);

  // רענון תוכן <span>-ים ממוחזרים – אותה פונקציה שמשמשת בזמן Play
  populateRecycledWordSpans(
    currentSentence,
    currentWord,
    window.subtitleState.line1WordSpans,
    window.subtitleState.line2WordSpans,
    window.subtitleState.line3WordSpans,
    window.subtitleState.line4WordSpans,
    window.subtitleState.line5WordSpans,
    window.subtitleState.line6WordSpans,
    window.subtitleState.line7WordSpans,
    window.subtitleState.line8WordSpans
  );

  // הצגת / הסתרת מיכל הטקסט בהתאם למצב
  if (currentSentence && window.subtitleState.textContainer) {
    window.subtitleState.textContainer.style.display = "inline-block";
  } else if (window.subtitleState.textContainer) {
    window.subtitleState.textContainer.style.display = "none";
  }
};

if (!window.__ycSubtitleTimingOffsetListenerBound) {
  window.__ycSubtitleTimingOffsetListenerBound = true;
  window.addEventListener("yc:subtitleTimingOffsetChanged", (e) => {
    if (!window.subtitleState?.isVisible) return;

    const currentVideoId = window.ycUtils?.extractVideoId
      ? window.ycUtils.extractVideoId(window.location.href)
      : new URLSearchParams(location.search).get("v");
    const eventVideoId = e?.detail?.videoId;
    if (eventVideoId && currentVideoId && eventVideoId !== currentVideoId) return;

    const video =
      document.querySelector("video.html5-main-video") ||
      document.querySelector("video");
    if (!video) return;

    window.previewSubtitles?.(video.currentTime);
  });
}

// ---------- 8. חלוקה אופטימלית של מערך מילים (עפ״י מספר-תווים) ----------

/* חישוב אורך כולל של מקטע (מילים+רווחים) */
function computeSegmentLength(wordsArr) {
  return (
    wordsArr.reduce((s, w) => s + w.text.trim().length, 0) +
    (wordsArr.length > 1 ? wordsArr.length - 1 : 0)
  );
}

/* 1) balanced 50-50  (כשהטקסט ≤ 53 תווים) */
function balancedTextSplit(words) {
  if (!words || words.length <= 1) return [words];
  const total = words.map((w) => w.text).join(" ");
  const targetLen = Math.ceil(total.length * 0.5);
  let curr = 0,
    i = 0;
  for (; i < words.length - 1; i++) {
    curr += words[i].text.length + (i > 0 ? 1 : 0);
    if (curr >= targetLen) break;
  }
  if (i === 0) i = 1; // וידוא שיש מילה בשורה 1
  return [words.slice(0, i), words.slice(i)];
}

/* 2) פיצול "even" כשהטקסט חורג מ-53 תווים */
function evenSegmentWords(words, maxLen) {
  const segments = [],
    totalLen = computeSegmentLength(words);
  let remaining = [...words],
    segs = Math.ceil(totalLen / maxLen);
  for (let s = 0; s < segs - 1; s++) {
    let curr = 0,
      best = 1,
      bestDiff = Infinity,
      ideal = computeSegmentLength(remaining) / (segs - s);
    for (let i = 0; i < remaining.length; i++) {
      curr += (i ? 1 : 0) + remaining[i].text.length;
      if (curr > maxLen) break;
      const d = Math.abs(curr - ideal);
      if (d < bestDiff) {
        bestDiff = d;
        best = i + 1;
      }
    }
    segments.push(remaining.slice(0, best));
    remaining = remaining.slice(best);
  }
  segments.push(remaining);
  return segments;
}

/* 3) fine-tune לאיזון טוב יותר */
function adjustSegmentation(seg, maxLen) {
  if (seg.length < 2) return seg;
  const join = (t) => t.map((w) => w.text).join(" ");
  const [a, b] = seg;
  if (!b.length) return seg;
  const candidate = [...a, b[0]];
  if (
    join(candidate).length <= maxLen &&
    Math.abs(join(candidate).length - join(b.slice(1)).length) <
    Math.abs(join(a).length - join(b).length)
  ) {
    seg[0] = candidate;
    seg[1] = b.slice(1);
  }
  return seg.filter((line) => line.length);
}

/*  ===> ה-API הראשי: */
function segmentByCharRules(words) {
  const full = words.map((w) => w.text).join(" ");
  let seg;
  if (full.length < MIN_SPLIT_LENGTH) {
    seg = [words]; // שורה בודדת
  } else if (full.length <= MAX_CHARS_PER_LINE) {
    seg = balancedTextSplit(words); // 50-50
  } else {
    seg = evenSegmentWords(words, MAX_CHARS_PER_LINE);
    seg = adjustSegmentation(seg, MAX_CHARS_PER_LINE);
  }
  return seg.slice(0, MAX_LINES); // מקס׳ 4 שורות
}

// ------------------------------
// 🆕 Split text into balanced lines (for dual-language subtitles)
// ------------------------------
function splitTextBalanced(text, maxCharsPerLine) {
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

// Keep SRT line breaks when they exist, and create a readable two-line layout
// for YouTube cues that arrive as one long sentence.
function splitSubtitleLinesForDisplay(text, maxLines = 2) {
  // Netflix-style layout: treat existing SRT line breaks as hints, then
  // reflow the complete cue so the two rendered lines are balanced.
  const normalized = String(text || "")
    .replace(/\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return [];
  if (maxLines <= 1 || normalized.length <= MAX_CHARS_PER_LINE) {
    return [normalized];
  }

  const words = normalized.split(" ").filter(Boolean);
  if (words.length < 2) return [normalized];

  const joinWords = (start, end) => words.slice(start, end).join(" ");
  let best = null;

  for (let splitIndex = 1; splitIndex < words.length; splitIndex += 1) {
    const first = joinWords(0, splitIndex);
    const second = joinWords(splitIndex, words.length);
    if (!first || !second) continue;

    const firstLength = first.length;
    const secondLength = second.length;
    const shorterLength = Math.min(firstLength, secondLength);
    const lengthDifference = Math.abs(firstLength - secondLength);
    const overflow =
      Math.max(0, firstLength - MAX_CHARS_PER_LINE) +
      Math.max(0, secondLength - MAX_CHARS_PER_LINE);
    const createsSingleWordLine =
      words.length >= 4 && (splitIndex === 1 || splitIndex === words.length - 1);
    const startsWithClosingPunctuation = /^[\])}>,.!?;:]/.test(second);
    const endsAtNaturalPause = /[,;:!?…。！？]$/.test(first);

    // Balance is the main rule. Overflow is expensive, but avoiding a lonely
    // word is even more important when a better multi-word split exists.
    const score =
      lengthDifference +
      overflow * 80 +
      (createsSingleWordLine ? 500 : 0) +
      Math.max(0, 12 - shorterLength) * 3 +
      (startsWithClosingPunctuation ? 120 : 0) -
      (endsAtNaturalPause ? 8 : 0);

    if (!best || score < best.score) {
      best = { first, second, score };
    }
  }

  // Keep every word even when a single word is longer than the line limit.
  return best ? [best.first, best.second] : [normalized];
}

function splitGeminiDefaultNetflixLines(text, durationSec = 0) {
  // Keep one algorithm for YouTube CC, uploaded SRT and translated tracks so
  // all subtitle sources use the same readable line-breaking rules.
  return splitSubtitleLinesForDisplay(text, 2);
}

// ------------------------------
// 9. עיבוד הכתוביות לאלמנטי SPAN ממוחזרים
// ------------------------------
function populateRecycledWordSpans(
  sentence,
  currentWord,
  line1Spans,
  line2Spans,
  line3Spans = [],
  line4Spans = [],
  line5Spans = [],
  line6Spans = [],
  line7Spans = [],
  line8Spans = []
) {
  // נקה את תוכן ה-spans הקיימים - כל 8 השורות
  [line1Spans, line2Spans, line3Spans, line4Spans, line5Spans, line6Spans, line7Spans, line8Spans].forEach((lineSpans) => {
    if (lineSpans) {
      lineSpans.forEach((span) => {
        span.textContent = "";
        span.style.display = "none";
        span.className = "regular-subtitle-word";
        span.style.backgroundColor = "";
        span.style.color = window.currentSubtitleColor || "#FFFFFF";
        span.style.opacity = getSubtitleFontOpacityValue();
      });
    }
  });

  if (!sentence?.text) return;

  let textToProcess = sentence.text;
  let wordsInSentence =
    window.subtitleState.words
      ?.filter(
        (word) =>
          word.startTime >= sentence.startTime &&
          word.endTime <= sentence.endTime
      )
      .map((word) => ({ ...word, text: normalizeWord(word.text) })) || [];

  /* ⭐️ אם המילה הראשונה היא רק סימן פיסוק – מדלגים, כדי שלא תהיה
       שורה נפרדת של "." בלבד                                */
  if (
    wordsInSentence.length &&
    LEADING_PUNCT_REGEX.test(wordsInSentence[0].text)
  ) {
    wordsInSentence.shift();
  }

  if (
    window.subtitleModeState?.isSubtitleMode ||
    window.wordHighlightEnabled === false ||
    wordsInSentence.length === 0
  ) {
    // 🆕 זיהוי דו-לשוני בטקסט עצמו
    const textWords = textToProcess.split(/\s+/);
    let textHasRTL = false;
    let textHasLTR = false;

    textWords.forEach(word => {
      if (isRTLText(word)) {
        textHasRTL = true;
      } else if (word.trim()) {
        textHasLTR = true;
      }
    });

    const isTextDualLanguage = textHasRTL && textHasLTR;

    // אם זוהה דו-לשוני - פצל לפי שפה
    if (isTextDualLanguage) {
      const rtlWords = [];
      const ltrWords = [];

      textWords.forEach(word => {
        if (isRTLText(word)) {
          rtlWords.push(word);
        } else if (word.trim()) {
          ltrWords.push(word);
        }
      });

      const rtlText = rtlWords.join(' ');
      const ltrText = ltrWords.join(' ');

      let lineIndex = 0;

      // הצג עברית קודם (למעלה)
      if (rtlText) {
        const rtlLines = splitSubtitleLinesForDisplay(rtlText, 2);
        rtlLines.forEach((lineText) => {
          lineIndex++;
          const targetSpans = window.subtitleState[`line${lineIndex}WordSpans`];
          const lineElement = window.subtitleState[`line${lineIndex}Element`];

          if (targetSpans && targetSpans[0]) {
            targetSpans[0].textContent = lineText;
            targetSpans[0].style.display = "inline";
            targetSpans[0].className = "regular-subtitle-line-full";
            targetSpans[0].style.direction = "rtl";
            applySubtitleElementPreferences(targetSpans[0]);
          }

          // 🎬 הוסף text-align ל-LINE ELEMENT (parent)
          if (lineElement) {
            lineElement.style.textAlign = "right";
          }
        });
      }

      // הצג אנגלית אחר כך (למטה)
      if (ltrText) {
        const ltrLines = splitSubtitleLinesForDisplay(ltrText, 2);
        ltrLines.forEach((lineText) => {
          lineIndex++;
          const targetSpans = window.subtitleState[`line${lineIndex}WordSpans`];
          const lineElement = window.subtitleState[`line${lineIndex}Element`];

          if (targetSpans && targetSpans[0]) {
            targetSpans[0].textContent = lineText;
            targetSpans[0].style.display = "inline";
            targetSpans[0].className = "regular-subtitle-line-full";
            targetSpans[0].style.direction = "ltr";
            applySubtitleElementPreferences(targetSpans[0]);
          }

          // 🎬 הוסף text-align ל-LINE ELEMENT (parent), לא ל-span!
          if (lineElement) {
            lineElement.style.textAlign = "left";
          }
        });
      }

      return;
    }

    // 🆕 לוגיקה לשפה אחת (DEFAULT או TRANSLATE)
    const isGeminiDefault = isGeminiDefaultSubtitleSource();
    const isGeminiTranslation =
      window.subtitleState?.timingSourceKey === "gemini_translation";

    const useDefaultSingleLanguageLayout =
      isGeminiDefault ||
      (isGeminiTranslation && window.subtitleState?.isSingleLanguageTranslation === true);

    if (isGeminiDefault || isGeminiTranslation) {
      const sentenceDurationSec = Math.max(
        0,
        (sentence?.endTime || 0) - (sentence?.startTime || 0)
      );
      const singleLangLines = useDefaultSingleLanguageLayout
        ? splitGeminiDefaultNetflixLines(textToProcess, sentenceDurationSec)
        : splitTextBalanced(textToProcess, MAX_CHARS_PER_LINE);
      const safeLines =
        singleLangLines && singleLangLines.length > 0
          ? singleLangLines
          : [normalizeSubtitleText(textToProcess)];
      const limitedLines = useDefaultSingleLanguageLayout
        ? safeLines.slice(0, 2)
        : safeLines.slice(0, 4);

      // 🎬 זיהוי כיוון השפה
      const isRTL = isRTLText(textToProcess);

      limitedLines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        const targetSpans = window.subtitleState[`line${lineNum}WordSpans`];
        const lineElement = window.subtitleState[`line${lineNum}Element`];

        if (targetSpans && targetSpans[0]) {
          targetSpans[0].textContent = lineText;
          targetSpans[0].style.display = "inline";
          targetSpans[0].className = "regular-subtitle-line-full";
          targetSpans[0].style.direction = isRTL ? "rtl" : "ltr";
          applySubtitleElementPreferences(targetSpans[0]);
        }

        // 🎬 הוסף text-align ל-LINE ELEMENT
        if (lineElement) {
          lineElement.style.textAlign = isRTL ? "right" : "left";
        }
      });
    } else {
      // YouTube or custom SRT: preserve explicit SRT lines and balance the
      // text into two readable lines instead of showing only the first line.
      const lines = splitSubtitleLinesForDisplay(textToProcess, 2);

      // 🎬 זיהוי כיוון השפה
      const isRTL = isRTLText(textToProcess);

      if (lines[0] && line1Spans[0]) {
        line1Spans[0].textContent = lines[0];
        line1Spans[0].style.display = "inline";
        line1Spans[0].className = "regular-subtitle-line-full";
        line1Spans[0].style.direction = isRTL ? "rtl" : "ltr";
        applySubtitleElementPreferences(line1Spans[0]);

        // 🎬 הוסף text-align ל-LINE ELEMENT
        if (window.subtitleState.line1Element) {
          window.subtitleState.line1Element.style.textAlign = isRTL ? "right" : "left";
        }
      }
      if (lines[1] && line2Spans[0]) {
        line2Spans[0].textContent = lines[1];
        line2Spans[0].style.display = "inline";
        line2Spans[0].className = "regular-subtitle-line-full";
        line2Spans[0].style.direction = isRTL ? "rtl" : "ltr";
        applySubtitleElementPreferences(line2Spans[0]);

        // 🎬 הוסף text-align ל-LINE ELEMENT גם לשורה 2
        if (window.subtitleState.line2Element) {
          window.subtitleState.line2Element.style.textAlign = isRTL ? "right" : "left";
        }
      }
    }
    return;
  }

  let segmentation = segmentByCharRules(wordsInSentence); // ‎⟵‎ משתמשים בחוקים

  /* --------------------------------------------------------
   * ❶ אם אחת השורות חורגת מהמגבלה – מפצלים אותה שוב
   *    ולאחר מכן לוקחים רק את שתי השורות הראשונות.
   * -------------------------------------------------------- */
  const forceCharLimit = (segment) => {
    const result = [];
    let current = [];
    let lengthSoFar = 0;

    segment.forEach((wordObj) => {
      const wLen = (wordObj.text || "").length;
      const extra = lengthSoFar === 0 ? wLen : wLen + 1; /* +1 = הרווח */

      if (lengthSoFar + extra > MAX_CHARS_PER_LINE && current.length) {
        result.push(current);
        current = [wordObj];
        lengthSoFar = wLen;
      } else {
        if (lengthSoFar) lengthSoFar += 1; /* רווח */
        lengthSoFar += wLen;
        current.push(wordObj);
      }
    });
    if (current.length) result.push(current);
    return result;
  };

  segmentation = segmentation
    .flatMap(forceCharLimit) /* חיתוך לפי ‎MAX_CHARS_PER_LINE‎ */
    .slice(0, MAX_LINES); /* ‎MAX_LINES‎=2 → שתי שורות בלבד */

  segmentation = segmentation.map((segment) =>
    segment.filter((word) => word.text?.trim() !== "")
  );
  segmentation = segmentation.filter((segment) => segment.length > 0);

  segmentation.forEach((segment, lineIndex) => {
    if (segment.length === 0) return;
    const targetSpans = window.subtitleState[`line${lineIndex + 1}WordSpans`];
    let currentSpanIndex = 0;

    segment.forEach((wordObj, wordIdxInSegment) => {
      if (currentSpanIndex < targetSpans.length) {
        const wordSpan = targetSpans[currentSpanIndex];
        wordSpan.textContent = wordObj.text;
        wordSpan.style.display = "inline-block";
        wordSpan.className = "regular-subtitle-word";
        const translationKey = `${Math.round(wordObj.startTime * 1000)}|${normalizeWord(wordObj.text)}`;
        const translationLabel = window.subtitleState.wordTranslationByWord?.get(translationKey);
        if (window.ycWordTranslationEnabled && translationLabel) {
          wordSpan.classList.add("yc-word-translation");
          wordSpan.dataset.ycWordTranslation = translationLabel;
        } else {
          delete wordSpan.dataset.ycWordTranslation;
        }
        applySubtitleElementPreferences(wordSpan, { highlighted: false });

        wordSpan.dataset.startTime = wordObj.startTime;
        wordSpan.dataset.endTime = wordObj.endTime;
        wordSpan.dataset.duration = (
          wordObj.endTime - wordObj.startTime
        ).toFixed(3);

        if (
          currentWord &&
          window.wordHighlightEnabled !== false &&
          window.subtitleModeState?.isLyricsHighlightEnabled !== false
        ) {
          const normalizedCurrentWordText = normalizeWord(currentWord.text);
          const normalizedWordObjText = wordObj.text;

          const wordStartTimeMs = Math.round(wordObj.startTime * 1000);
          const currentWordStartTimeMs = Math.round(
            currentWord.startTime * 1000
          );
          const toleranceMs = 50;

          if (
            normalizedWordObjText === normalizedCurrentWordText &&
            Math.abs(wordStartTimeMs - currentWordStartTimeMs) <= toleranceMs
          ) {
            wordSpan.classList.add("highlighted");
            applySubtitleElementPreferences(wordSpan, { highlighted: true });
          }
        }
        currentSpanIndex++;
      }

      if (
        wordIdxInSegment < segment.length - 1 &&
        currentSpanIndex < targetSpans.length
      ) {
        const spaceSpan = targetSpans[currentSpanIndex];
        spaceSpan.textContent = " ";
        spaceSpan.style.display = "inline-block";
        spaceSpan.className = "regular-subtitle-space";
        applySubtitleElementPreferences(spaceSpan, { highlighted: false });
        currentSpanIndex++;
      }
    });
  });
}

// ------------------------------
// 10. פונקציות עזר להדגשה ופיסוק
// ------------------------------
function getFinalHighlightColor(baseColor, opacityPercent) {
  let opacity = parseFloat(opacityPercent) / 100;
  if (isNaN(opacity) || opacity < 0 || opacity > 1) opacity = 0.5;

  if (!baseColor) return `rgba(255, 255, 0, ${opacity})`;

  const colorMatch = baseColor.match(
    /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/
  );
  if (colorMatch) {
    const [, r, g, b] = colorMatch;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  if (
    baseColor.startsWith("#") &&
    (baseColor.length === 4 || baseColor.length === 7)
  ) {
    let r = 0,
      g = 0,
      b = 0;
    if (baseColor.length === 4) {
      r = parseInt(baseColor[1] + baseColor[1], 16);
      g = parseInt(baseColor[2] + baseColor[2], 16);
      b = parseInt(baseColor[3] + baseColor[3], 16);
    } else {
      r = parseInt(baseColor.substring(1, 3), 16);
      g = parseInt(baseColor.substring(3, 5), 16);
      b = parseInt(baseColor.substring(5, 7), 16);
    }
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
  }
  return `rgba(255, 255, 0, ${opacity})`;
}

function getSubtitleFontOpacityValue() {
  const opacity = parseInt(window.currentFontOpacity || "100", 10) / 100;
  return Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1;
}

function shouldStyleSentenceLevelSubtitleAsHighlighted() {
  return (
    window.subtitleModeState?.isLyricsHighlightEnabled !== false &&
    (window.subtitleModeState?.isSubtitleMode === true ||
      window.wordHighlightEnabled === false ||
      !(window.subtitleState?.words?.length > 0))
  );
}

function applySubtitleElementPreferences(element, options = {}) {
  if (!element) return;

  const isSentenceLevelLine = element.classList?.contains(
    "regular-subtitle-line-full"
  );
  const shouldHighlight =
    options.highlighted === true ||
    element.classList?.contains("highlighted") ||
    (isSentenceLevelLine && shouldStyleSentenceLevelSubtitleAsHighlighted());

  element.style.opacity = String(getSubtitleFontOpacityValue());

  if (shouldHighlight) {
    element.classList?.add("highlighted");
    element.style.backgroundColor =
      window.currentHighlightBackgroundEnabled === false
        ? "transparent"
        : getFinalHighlightColor(
            window.currentHighlightColor || "rgba(255, 255, 0, 0.5)",
            parseInt(window.currentHighlightOpacity || "50", 10)
          );
    element.style.color =
      !isSentenceLevelLine || window.hasCustomWordHighlightTextColor
        ? window.currentWordHighlightTextColor ||
          window.currentSubtitleColor ||
          "#FFFFFF"
        : window.currentSubtitleColor || "#FFFFFF";
    element.style.borderRadius =
      window.currentHighlightBackgroundEnabled === false ? "0" : "2px";
    return;
  }

  element.classList?.remove("highlighted");
  element.style.backgroundColor = "transparent";
  element.style.color = window.currentSubtitleColor || "#FFFFFF";
}

window.applyCurrentSubtitlePreferences = function () {
  const subtitleElements = document.querySelectorAll(
    ".regular-subtitle-word, .regular-subtitle-punctuation, .regular-subtitle-space, .regular-subtitle-line-full"
  );
  subtitleElements.forEach((element) => applySubtitleElementPreferences(element));

  const container = document.querySelector(".yt-subtitle-container");
  if (container) {
    const bgColor = window.currentBackgroundColor || "rgba(0, 0, 0, 0.8)";
    const bgOpacityPercent = parseInt(
      window.currentBackgroundOpacity || DEFAULT_BG_OPACITY,
      10
    );
    container.style.backgroundColor = getFinalHighlightColor(
      bgColor,
      bgOpacityPercent
    );
  }
};

if (!window.__ycStandaloneSubtitlesUpdatedBound) {
  window.__ycStandaloneSubtitlesUpdatedBound = true;
  window.addEventListener('yc:subtitlesUpdated', (event) => {
    if (!window.subtitleState?.isVisible) return;
    const refresh = window.ycSubtitles?.refreshActiveSource?.(event.detail?.videoId || null);
    if (refresh && typeof refresh.catch === 'function') {
      refresh.catch((error) => {
        console.error('[SubtitleButton] Failed to refresh the active subtitle source:', error);
      });
    }
  });
}

// ------------------------------
// 11. עדכון הכתוביות בזמן אמת - עם שימוש ב-populateRecycledWordSpans
// ------------------------------
let subtitleVideoElement = null;
let subtitleRecoveryTimerId = null;
let subtitleRecoveryInFlight = false;
let subtitleRecoveryGeneration = 0;
const _acquireSubtitleVideoElement = () => {
  if (!subtitleVideoElement || !subtitleVideoElement.isConnected) {
    subtitleVideoElement = document.querySelector("video");
  }
  return subtitleVideoElement;
};

const updateSubtitles = debounce(() => {
  requestAnimationFrame(() => {
    // אם אין כתוביות גלויות, לא צריך לעדכן
    if (!window.subtitleState || !window.subtitleState.isVisible) {
      return;
    }
    const videoPlayer = document.querySelector(".html5-video-player");
    const state = window.subtitleState;
    const subtitleSpanPoolsNeedRepair = Array.from(
      { length: MAX_LINES },
      (_, index) => state[`line${index + 1}WordSpans`]
    ).some(
      (spans, index) =>
        !Array.isArray(spans) ||
        spans.length < MAX_WORDS_PER_LINE * 2 ||
        !spans.every(
          (span) =>
            span &&
            span.isConnected &&
            span.parentElement === state[`line${index + 1}Element`]
        )
    );
    const domNeedsRepair =
      !state.overlay ||
      !state.overlay.isConnected ||
      !state.textContainer ||
      !state.textContainer.isConnected ||
      !state.line1Element ||
      !state.line1Element.isConnected ||
      !state.line2Element ||
      !state.line2Element.isConnected ||
      (videoPlayer && !videoPlayer.contains(state.overlay)) ||
      subtitleSpanPoolsNeedRepair;
    if (domNeedsRepair && !ensureSubtitleDOM()) return;
    if (state.overlay) state.overlay.style.display = "block";
    if (state.textContainer) state.textContainer.style.display = "";
    if (
      !window.subtitleState ||
      !window.subtitleState.overlay ||
      !window.subtitleState.isVisible ||
      !window.subtitleState.line1Element ||
      !window.subtitleState.line2Element ||
      !window.subtitleState.overlay.isConnected
    ) {
      if (window.DEBUG && window.subtitleState?.isVisible) {
        console.warn(
          "[updateSubtitles] Aborting update: essential elements missing or overlay not connected, though isVisible is true."
        );
      }
      return;
    }

    const video = _acquireSubtitleVideoElement();
    const container = window.subtitleState.textContainer;
    if (!video) return;

    const { currentSentence, currentWord } = findCurrentSubtitles(
      video.currentTime
    );

    if (currentSentence) {
      populateRecycledWordSpans(
        currentSentence,
        currentWord,
        window.subtitleState.line1WordSpans,
        window.subtitleState.line2WordSpans,
        window.subtitleState.line3WordSpans,
        window.subtitleState.line4WordSpans,
        window.subtitleState.line5WordSpans,
        window.subtitleState.line6WordSpans,
        window.subtitleState.line7WordSpans,
        window.subtitleState.line8WordSpans
      );

      if (container) {
        container.style.display = "inline-block";
        container.style.setProperty(
          "--subtitle-size",
          `${window.subtitleState.sizePercentage || "300"}%`
        );
        const bgColor = window.currentBackgroundColor || "rgba(0, 0, 0, 0.8)";
        const bgOpacityPercent = parseInt(
          window.currentBackgroundOpacity || DEFAULT_BG_OPACITY
        );
        container.style.backgroundColor = getFinalHighlightColor(
          bgColor,
          bgOpacityPercent
        );
        if (window.subtitleState.isRTL) {
          container.classList.add("rtl");
        } else {
          container.classList.remove("rtl");
        }
      }
    } else {
      window.subtitleState.line1WordSpans.forEach((span) => {
        span.textContent = "";
        span.style.display = "none";
      });
      window.subtitleState.line2WordSpans.forEach((span) => {
        span.textContent = "";
        span.style.display = "none";
      });
      if (container) container.style.display = "none";
    }
  });
});

// ------------------------------
// 12. אתחול הגדרות הכתוביות
// ------------------------------
async function initializeSubtitlePreferences() {
  try {
    const storageArea = chrome.storage?.sync;
    if (!storageArea) {
      console.warn(
        "[SubtitleButton] chrome.storage.sync not available. Using default preferences."
      );
      return; // Defaults are already set at the top
    }

    const result = await storageArea.get([
      "subtitleSize",
      "subtitleColor",
      "subtitleHighlightColor",
      "subtitleHighlightBackgroundEnabled",
      "subtitleFontOpacity",
      "subtitleBackgroundColor",
      "subtitleBackgroundOpacity",
      "subtitleWordCountdownType",
      "subtitleLyricsMode",
      "subtitleSubtitleMode",
      "subtitleLastMode",
      "subtitleLyricsHighlightEnabled",
      "subtitleChordsHighlightEnabled",
      "subtitleWordHighlightTextColor",
    ]);

    window.subtitleState.sizePercentage =
      result.subtitleSize || window.subtitleState.sizePercentage;
    window.currentSubtitleColor =
      result.subtitleColor || window.currentSubtitleColor;
    window.currentHighlightColor =
      result.subtitleHighlightColor || window.currentHighlightColor;
    window.currentHighlightBackgroundEnabled =
      result.subtitleHighlightBackgroundEnabled === true;
    window.currentFontOpacity =
      result.subtitleFontOpacity || window.currentFontOpacity;
    window.currentBackgroundColor =
      result.subtitleBackgroundColor || window.currentBackgroundColor;
    window.currentBackgroundOpacity =
      result.subtitleBackgroundOpacity || window.currentBackgroundOpacity;
    window.currentWordCountdownType =
      result.subtitleWordCountdownType || window.currentWordCountdownType;
    window.currentWordHighlightTextColor =
      result.subtitleWordHighlightTextColor ||
      window.currentWordHighlightTextColor;
    window.hasCustomWordHighlightTextColor =
      result.subtitleWordHighlightTextColor != null ||
      window.hasCustomWordHighlightTextColor === true;

    const defaultModeState = {
      isLyricsMode: true,
      isSubtitleMode: false,
      lastMode: "lyrics",
      isLyricsHighlightEnabled: true,
      isChordsHighlightEnabled: false,
    };
    window.subtitleModeState = {
      ...defaultModeState,
      ...(window.subtitleModeState || {}),
      isLyricsMode: result.subtitleLyricsMode !== false,
      isSubtitleMode: result.subtitleSubtitleMode === true,
      lastMode:
        result.subtitleLastMode ||
        window.subtitleModeState?.lastMode ||
        "lyrics",
      isLyricsHighlightEnabled: result.subtitleLyricsHighlightEnabled !== false,
      isChordsHighlightEnabled: result.subtitleChordsHighlightEnabled !== false,
    };

    if (result.subtitleLyricsHighlightEnabled !== undefined) {
      window.wordHighlightEnabled = result.subtitleLyricsHighlightEnabled !== false;
      localStorage.setItem(
        "yc_carousel_word_highlight",
        String(window.wordHighlightEnabled)
      );
    }

    if (window.DEBUG)
      console.log("[SubtitleButton] Preferences loaded from storage:", {
        result,
        state: window.subtitleState,
        modeState: window.subtitleModeState,
      });
    window.applyCurrentSubtitlePreferences?.();
  } catch (error) {
    console.error("[SubtitleButton] Error initializing preferences:", error);
  }
}

window.changeSubtitleSize = function (percentage) {
  window.subtitleState.sizePercentage = percentage;
  const container = window.subtitleState.overlay?.querySelector(
    ".yt-subtitle-container"
  );
  if (container) {
    container.style.setProperty("--subtitle-size", `${percentage}%`);
  }
  try {
    if (chrome.storage?.sync) {
      chrome.storage.sync.set({ subtitleSize: percentage });
    }
  } catch (error) {
    /* no log */
  }
  updateSubtitles();
};

// ------------------------------
// 13. מאזיני אירועים לווידאו
// ------------------------------
let activeVideoListenersCleanup = null;
let subtitleClickController = null;

function stopSubtitleRecoveryLoop() {
  subtitleRecoveryGeneration += 1;
  if (subtitleRecoveryTimerId !== null) {
    clearInterval(subtitleRecoveryTimerId);
    subtitleRecoveryTimerId = null;
  }
  subtitleRecoveryInFlight = false;
}

async function repairActiveSubtitleDisplay() {
  const state = window.subtitleState;
  const source = state?.displaySource;
  if (
    window.extensionDisabled ||
    !state?.isVisible ||
    (source !== "custom" && source !== "original")
  ) {
    stopSubtitleRecoveryLoop();
    return;
  }
  if (subtitleRecoveryInFlight) return;

  const recoveryGeneration = subtitleRecoveryGeneration;

  const player = document.querySelector(".html5-video-player");
  const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
  if (!player || !video) return;

  const domNeedsRepair =
    !state.overlay ||
    !state.overlay.isConnected ||
    !state.textContainer ||
    !state.textContainer.isConnected ||
    !state.line1Element ||
    !state.line1Element.isConnected ||
    !state.line2Element ||
    !state.line2Element.isConnected ||
    !player.contains(state.overlay);
  const videoChanged = subtitleVideoElement !== video;
  const listenersNeedRepair = !activeVideoListenersCleanup || videoChanged;
  const subtitleStateNeedsReload =
    !Array.isArray(state.sentences) ||
    (!state.sentences.length && !state.words?.length);

  if (!domNeedsRepair && !listenersNeedRepair && !subtitleStateNeedsReload) return;

  subtitleRecoveryInFlight = true;
  try {
    if (subtitleStateNeedsReload) {
      const loadedSuccessfully = await loadSubtitles(true, source);
      if (
        !loadedSuccessfully ||
        recoveryGeneration !== subtitleRecoveryGeneration ||
        window.subtitleState !== state ||
        !state.isVisible ||
        state.displaySource !== source
      ) {
        return;
      }
    }

    if (!ensureSubtitleDOM()) return;
    state.isVisible = true;
    state.displaySource = source;
    state.overlay.style.display = "block";
    state.textContainer.style.display = "";

    if (!subtitleClickController || subtitleClickController.signal.aborted) {
      subtitleClickController = new AbortController();
    }
    if (listenersNeedRepair) {
      activeVideoListenersCleanup?.();
      subtitleVideoElement = video;
      activeVideoListenersCleanup = setupVideoEventListeners(
        subtitleClickController.signal
      );
    }

    // Reapply the user's saved position after YouTube recreates the player.
    const locationState = window.subtitleLocationState;
    window.subtitleLocationHandlers?.applySubtitlePosition?.({
      bottom: locationState?.currentValue,
      horizontalOffset: locationState?.horizontalOffset,
    }, true);
    setSubtitleButtonVisualSource(source);
    window.setSubsActive?.(true);
    updateSubtitles();
  } catch (error) {
    if (window.DEBUG) {
      console.warn("[SubtitleButton] Automatic subtitle recovery failed:", error);
    }
  } finally {
    subtitleRecoveryInFlight = false;
  }
}

function startSubtitleRecoveryLoop() {
  if (subtitleRecoveryTimerId !== null) return;
  subtitleRecoveryTimerId = window.setInterval(() => {
    repairActiveSubtitleDisplay().catch(() => {});
  }, 1000);
}

function setupVideoEventListeners(signal) {
  const video = _acquireSubtitleVideoElement();

  if (!video) return null;

  const handlers = {
    timeupdate: updateSubtitles,
    seeking: updateSubtitles,
    play: updateSubtitles,
    pause: updateSubtitles,
  };

  const unregisterFunctions = [];

  Object.entries(handlers).forEach(([event, handler]) => {
    const options = { passive: true, signal };
    try {
      video.addEventListener(event, handler, options);
      unregisterFunctions.push(() => {
        try {
          if (video && (!signal || !signal.aborted)) {
            video.removeEventListener(event, handler, options);
          }
        } catch (e) {
          /*ignore*/
        }
      });
    } catch (e) {
      console.warn(
        `[SubtitleButton] Browser might not support AbortSignal in addEventListener for event: ${event}`,
        e
      );
      video.addEventListener(event, handler, { passive: true });
      unregisterFunctions.push(() => {
        try {
          video.removeEventListener(event, handler, { passive: true });
        } catch (err) {
          /*ignore*/
        }
      });
    }
  });

  return () => {
    unregisterFunctions.forEach((unregister) => {
      try {
        unregister();
      } catch (e) {
        /* ignore */
      }
    });
    if (window.DEBUG)
      console.log(
        "[SubtitleButton] Video event listeners cleaned up via returned function."
      );
  };
}

// ------------------------------
// 14. יצירת כפתור הפעלת כתוביות - עם יצירת SPANs ממוחזרים
// ------------------------------
const SUBTITLE_BUTTON_ACTIVE_CLASS = "subtitle-button-active";

function clampSubtitleDragValue(value, min, max, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(min, Math.min(max, numericValue));
}

function createSubtitleDragGuides(player) {
  if (
    subtitleDragGuideElement?.isConnected &&
    subtitleDragGuideElement.parentElement === player
  ) {
    return subtitleDragGuideElement;
  }

  subtitleDragGuideElement?.remove();
  const guide = document.createElement("div");
  guide.className = "yc-subtitle-drag-guides";
  guide.setAttribute("aria-hidden", "true");
  Object.assign(guide.style, {
    position: "absolute",
    inset: "0",
    display: "none",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "39",
    transition: "opacity 140ms ease",
    mixBlendMode: "screen",
  });

  const horizontal = document.createElement("i");
  horizontal.className = "yc-subtitle-drag-guide-horizontal";
  Object.assign(horizontal.style, {
    position: "absolute",
    top: "50%",
    left: "8%",
    right: "8%",
    height: "1px",
    background: "rgba(255, 255, 255, 0.28)",
    boxShadow: "0 0 3px rgba(0, 0, 0, 0.35)",
  });

  const vertical = document.createElement("i");
  vertical.className = "yc-subtitle-drag-guide-vertical";
  Object.assign(vertical.style, {
    position: "absolute",
    left: "50%",
    top: "8%",
    bottom: "8%",
    width: "1px",
    background: "rgba(255, 255, 255, 0.28)",
    boxShadow: "0 0 3px rgba(0, 0, 0, 0.35)",
  });

  const center = document.createElement("b");
  center.className = "yc-subtitle-drag-guide-center";
  Object.assign(center.style, {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "7px",
    height: "7px",
    border: "1px solid rgba(255, 255, 255, 0.45)",
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    boxShadow: "0 0 4px rgba(0, 0, 0, 0.4)",
  });

  guide.append(horizontal, vertical, center);
  player.appendChild(guide);
  subtitleDragGuideElement = guide;
  return guide;
}

function updateSubtitleDragGuides(
  guide,
  { visible = false, snappedX = false, snappedY = false } = {}
) {
  if (!guide) return;
  guide.style.display = visible ? "block" : "none";
  guide.style.opacity = visible ? "1" : "0";

  const horizontal = guide.querySelector(".yc-subtitle-drag-guide-horizontal");
  const vertical = guide.querySelector(".yc-subtitle-drag-guide-vertical");
  const center = guide.querySelector(".yc-subtitle-drag-guide-center");
  if (horizontal) {
    horizontal.style.background = snappedY
      ? "rgba(62, 166, 255, 0.68)"
      : "rgba(255, 255, 255, 0.28)";
  }
  if (vertical) {
    vertical.style.background = snappedX
      ? "rgba(62, 166, 255, 0.68)"
      : "rgba(255, 255, 255, 0.28)";
  }
  if (center) {
    center.style.borderColor = snappedX && snappedY
      ? "rgba(62, 166, 255, 0.9)"
      : "rgba(255, 255, 255, 0.45)";
  }
}

function hideSubtitleDragGuides(guide) {
  if (!guide) return;
  guide.style.opacity = "0";
  window.setTimeout(() => {
    if (guide.isConnected && subtitleDragSession === null) {
      guide.style.display = "none";
    }
  }, 150);
}

function applySubtitlePositionFromDrag(position, persist) {
  const applier =
    window.subtitleLocationHandlers?.applySubtitlePosition ||
    window.applySubtitlePosition;

  if (typeof applier === "function") {
    // During movement use a system-style update so storage is written once,
    // on pointerup, instead of on every pointermove event.
    applier(position, !persist);
    return;
  }

  // Fallback for the very small window before the location module finishes
  // loading. The normal activation path uses the shared module above.
  const overlay = window.subtitleState?.overlay;
  const container = window.subtitleState?.textContainer;
  if (overlay && position.bottom !== undefined) {
    overlay.style.bottom = `${position.bottom}%`;
  }
  if (container && position.horizontalOffset !== undefined) {
    container.style.position = "relative";
    container.style.left = `${position.horizontalOffset}%`;
  }

  if (window.subtitleLocationState) {
    if (position.bottom !== undefined) {
      window.subtitleLocationState.currentValue = position.bottom;
    }
    if (position.horizontalOffset !== undefined) {
      window.subtitleLocationState.horizontalOffset = position.horizontalOffset;
    }
  }

  if (persist && chrome.storage?.sync) {
    chrome.storage.sync.set({
      subtitleLocation: position.bottom,
      subtitleHorizontalOffset: position.horizontalOffset,
    });
  }
}

function unbindSubtitleDragHandlers() {
  subtitleDragCleanup?.();
  subtitleDragCleanup = null;
  subtitleDragElement = null;
  subtitleDragSession = null;
}

function bindSubtitleDragHandlers() {
  const container = window.subtitleState?.textContainer;
  if (!container) return;
  if (subtitleDragElement === container) return;

  unbindSubtitleDragHandlers();

  // The overlay remains click-through; only the visible subtitle box accepts
  // a pointer so the user can drag it without disabling the YouTube player.
  container.style.pointerEvents = "auto";
  container.style.cursor = "grab";
  container.style.touchAction = "none";
  container.style.userSelect = "none";
  container.title = "Drag to move subtitles";

  const handlePointerDown = (event) => {
    if (event.isPrimary === false) return;
    if (event.button !== undefined && event.button !== 0) return;
    if (!window.subtitleState?.isVisible) return;
    if (window.subtitleLocationState?.isLocked) return;

    const player =
      container.closest(".html5-video-player") ||
      document.querySelector(".html5-video-player");
    const playerRect = player?.getBoundingClientRect?.();
    const containerRect = container.getBoundingClientRect();
    if (
      !playerRect ||
      playerRect.width <= 0 ||
      playerRect.height <= 0 ||
      containerRect.width <= 0 ||
      containerRect.height <= 0
    ) {
      return;
    }

    const currentBottom = clampSubtitleDragValue(
      window.subtitleLocationState?.currentValue,
      0,
      100,
      10
    );
    const currentHorizontal = clampSubtitleDragValue(
      window.subtitleLocationState?.horizontalOffset,
      -45,
      45,
      0
    );
    const guide = createSubtitleDragGuides(player);

    subtitleDragSession = {
      pointerId: event.pointerId,
      player,
      container,
      offsetX: event.clientX - containerRect.left,
      offsetY: event.clientY - containerRect.top,
      startPosition: {
        bottom: currentBottom,
        horizontalOffset: currentHorizontal,
      },
      lastPosition: {
        bottom: currentBottom,
        horizontalOffset: currentHorizontal,
      },
      guide,
      snappedX: false,
      snappedY: false,
      moved: false,
    };

    try {
      container.setPointerCapture?.(event.pointerId);
    } catch (_) {
      // Pointer capture is optional on older browsers.
    }
    container.classList.add("yc-subtitle-dragging");
    container.style.cursor = "grabbing";
    updateSubtitleDragGuides(guide, { visible: true });
    event.preventDefault();
    event.stopPropagation();
  };

  const handlePointerMove = (event) => {
    const session = subtitleDragSession;
    if (!session || event.pointerId !== session.pointerId) return;

    const playerRect = session.player.getBoundingClientRect();
    const containerRect = session.container.getBoundingClientRect();
    if (playerRect.width <= 0 || playerRect.height <= 0) return;

    const desiredLeft = event.clientX - session.offsetX;
    const desiredTop = event.clientY - session.offsetY;
    const desiredCenter = desiredLeft + containerRect.width / 2;
    const playerCenter = playerRect.left + playerRect.width / 2;
    const rawHorizontal =
      ((desiredCenter - playerCenter) / playerRect.width) * 100;
    const maxHorizontal = Math.max(
      0,
      ((playerRect.width - containerRect.width) /
        (2 * playerRect.width)) *
        100
    );
    const rawBottom =
      ((playerRect.bottom - (desiredTop + containerRect.height)) /
        playerRect.height) *
      100;
    const maxBottom = Math.max(
      0,
      (1 - containerRect.height / playerRect.height) * 100
    );
    const centerBottom = clampSubtitleDragValue(
      ((playerRect.bottom - (playerRect.top + containerRect.height / 2)) /
        playerRect.height) *
        100,
      0,
      maxBottom,
      10
    );
    const snappedX = Math.abs(rawHorizontal) <= 2.5;
    const snappedY = Math.abs(rawBottom - centerBottom) <= 2.5;
    const position = {
      bottom: snappedY
        ? centerBottom
        : clampSubtitleDragValue(rawBottom, 0, maxBottom, 10),
      horizontalOffset: snappedX
        ? 0
        : clampSubtitleDragValue(
        rawHorizontal,
        -maxHorizontal,
        maxHorizontal,
        0
          ),
    };

    session.lastPosition = position;
    session.snappedX = snappedX;
    session.snappedY = snappedY;
    updateSubtitleDragGuides(session.guide, {
      visible: true,
      snappedX,
      snappedY,
    });
    session.moved =
      Math.abs(position.bottom - session.startPosition.bottom) > 0.15 ||
      Math.abs(
        position.horizontalOffset - session.startPosition.horizontalOffset
      ) > 0.15;
    applySubtitlePositionFromDrag(position, false);
    event.preventDefault();
    event.stopPropagation();
  };

  const finishPointerDrag = (event) => {
    const session = subtitleDragSession;
    if (!session || event.pointerId !== session.pointerId) return;

    try {
      session.container.releasePointerCapture?.(session.pointerId);
    } catch (_) {
      // Pointer capture may already have been released.
    }
    session.container.classList.remove("yc-subtitle-dragging");
    session.container.style.cursor = "grab";
    subtitleDragSession = null;
    hideSubtitleDragGuides(session.guide);

    if (session.moved) {
      applySubtitlePositionFromDrag(session.lastPosition, true);
    }
    event.preventDefault();
    event.stopPropagation();
  };

  container.addEventListener("pointerdown", handlePointerDown);
  container.addEventListener("pointermove", handlePointerMove);
  container.addEventListener("pointerup", finishPointerDrag);
  container.addEventListener("pointercancel", finishPointerDrag);

  subtitleDragElement = container;
  subtitleDragCleanup = () => {
    container.removeEventListener("pointerdown", handlePointerDown);
    container.removeEventListener("pointermove", handlePointerMove);
    container.removeEventListener("pointerup", finishPointerDrag);
    container.removeEventListener("pointercancel", finishPointerDrag);
    container.classList.remove("yc-subtitle-dragging");
    container.style.cursor = "grab";
    subtitleDragGuideElement?.remove();
    subtitleDragGuideElement = null;
  };
}

// --- NEW: Helper function to ensure all subtitle DOM elements are ready ---
function ensureSubtitleDOM() {
  let createdOrEnsuredSomething = false;
  const videoPlayer = document.querySelector(".html5-video-player");

  if (
    !window.subtitleState.overlay ||
    !window.subtitleState.overlay.isConnected
  ) {
    if (window.subtitleState.overlay) window.subtitleState.overlay.remove();
    window.subtitleState.overlay = createDOMElement(
      "div",
      "yt-subtitle-overlay"
    );
    // style.display will be handled by the click listener
    createdOrEnsuredSomething = true;
  }

  if (
    !window.subtitleState.textContainer ||
    !window.subtitleState.textContainer.isConnected
  ) {
    if (window.subtitleState.textContainer)
      window.subtitleState.textContainer.remove();
    window.subtitleState.textContainer = createDOMElement(
      "div",
      "yt-subtitle-container"
    );
    // Apply initial styles to the text container
    window.subtitleState.textContainer.style.setProperty(
      "--subtitle-size",
      `${window.subtitleState.sizePercentage || "300"}%`
    );
    const bgColor = window.currentBackgroundColor || "rgba(0, 0, 0, 0.8)";
    const bgOpacityPercent = parseInt(
      window.currentBackgroundOpacity || DEFAULT_BG_OPACITY
    );
    window.subtitleState.textContainer.style.backgroundColor =
      getFinalHighlightColor(bgColor, bgOpacityPercent);
    if (window.subtitleState.isRTL)
      window.subtitleState.textContainer.classList.add("rtl");

    window.subtitleState.overlay.appendChild(
      window.subtitleState.textContainer
    );
    createdOrEnsuredSomething = true;
  }

  /* --- יצירת עד 2 div-ים לשורות, עם white-space:normal --- */
  for (let i = 1; i <= MAX_LINES; i++) {
    // כעת יוצר רק line1 & line2
    const key = `line${i}Element`;
    if (!window.subtitleState[key] || !window.subtitleState[key].isConnected) {
      if (window.subtitleState[key]) window.subtitleState[key].remove();

      const lineEl = createDOMElement("div", "yt-subtitle-line");
      lineEl.style.whiteSpace = "normal"; /* שבירה אוטומטית */
      lineEl.style.direction = "inherit"; /* ‎RTL/LTR עובר בירושה */

      window.subtitleState.textContainer.appendChild(lineEl);
      window.subtitleState[key] = lineEl;
      window.subtitleState[`${key}WordSpans`] = [];
    }
  }

  // 🆕 יצירת spans לכל השורות בלולאה (line1, line2, line3, line4)
  for (let lineNum = 1; lineNum <= MAX_LINES; lineNum++) {
    const spansKey = `line${lineNum}WordSpans`;
    const elementKey = `line${lineNum}Element`;

    if (
      !window.subtitleState[spansKey] ||
      window.subtitleState[spansKey].length < MAX_WORDS_PER_LINE * 2 ||
      !window.subtitleState[spansKey].every(
        (span) =>
          span &&
          span.isConnected &&
          span.parentElement === window.subtitleState[elementKey]
      )
    ) {
      if (window.subtitleState[elementKey]) {
        window.subtitleState[elementKey].innerHTML = "";
      }
      window.subtitleState[spansKey] = [];
      for (let i = 0; i < MAX_WORDS_PER_LINE * 2; i++) {
        const wordSpan = createDOMElement("span", "regular-subtitle-word");
        wordSpan.style.display = "none";
        window.subtitleState[elementKey].appendChild(wordSpan);
        window.subtitleState[spansKey].push(wordSpan);
      }
      createdOrEnsuredSomething = true;
    }
  }

  if (
    window.subtitleState.overlay &&
    videoPlayer &&
    window.subtitleState.overlay.parentElement !== videoPlayer
  ) {
    videoPlayer.appendChild(window.subtitleState.overlay);
    createdOrEnsuredSomething = true;
    if (window.DEBUG)
      console.log(
        "[SubtitleButton] ensureSubtitleDOM: Overlay (re)attached to player."
      );
  } else if (window.subtitleState.overlay && !videoPlayer) {
    console.error(
      "[SubtitleButton] ensureSubtitleDOM: Video player not found for overlay attachment."
    );
    return false;
  }
  if (window.DEBUG && createdOrEnsuredSomething)
    console.log(
      "[SubtitleButton] ensureSubtitleDOM: DOM elements ensured/recreated."
    );
  bindSubtitleDragHandlers();
  return true;
}
// --- END NEW HELPER ---

function setSubtitleButtonVisualSource(source = null) {
  const visible = window.subtitleState?.isVisible === true;
  document.querySelectorAll('.ytp-subtitle-button').forEach((button) => {
    button.classList.toggle(
      SUBTITLE_BUTTON_ACTIVE_CLASS,
      visible && source === 'original'
    );
  });
  document.querySelectorAll('.ytp-custom-subtitle-button').forEach((button) => {
    button.classList.toggle(
      'custom-subtitle-button-active',
      visible && source === 'custom'
    );
  });
}

function clearRenderedSubtitleLines() {
  for (let index = 1; index <= MAX_LINES; index += 1) {
    const line = window.subtitleState?.[`line${index}Element`];
    if (line) line.innerHTML = '';
  }
}

function deactivateSubtitleOverlay() {
  stopSubtitleRecoveryLoop();
  subtitleClickController?.abort();
  subtitleClickController = null;

  if (activeVideoListenersCleanup) {
    activeVideoListenersCleanup();
    activeVideoListenersCleanup = null;
  }

  if (window.subtitleState) {
    window.subtitleState.isVisible = false;
    window.subtitleState.displaySource = null;
  }
  if (window.subtitleState?.overlay) {
    window.subtitleState.overlay.style.display = 'none';
  }
  if (window.subtitleState?.textContainer) {
    window.subtitleState.textContainer.style.display = 'none';
  }
  clearRenderedSubtitleLines();
  setSubtitleButtonVisualSource(null);
  window.setSubsActive?.(false);
}

async function ensureSubtitleLocationModule() {
  if (subtitleLocationModuleLoaded) {
    window.subtitleLocationHandlers?.handleTimelineAlwaysVisibleChange?.();
    return;
  }

  try {
    const {
      initializeSubtitleLocationPreferences,
      handleTimelineAlwaysVisibleChange,
      applySubtitlePosition,
    } = await import("./settings/subtitles/subtitleLocationMenu.js");

    window.subtitleLocationHandlers = window.subtitleLocationHandlers || {};
    window.subtitleLocationHandlers.handleTimelineAlwaysVisibleChange =
      handleTimelineAlwaysVisibleChange;
    window.subtitleLocationHandlers.applySubtitlePosition = applySubtitlePosition;

    await initializeSubtitleLocationPreferences();

    if (typeof MutationObserver !== "undefined") {
      subtitleLocationObserver = new MutationObserver((mutations) => {
        const isRelevantChange = mutations.some((mutation) => {
          if (!mutation.addedNodes.length && !mutation.removedNodes.length) {
            return false;
          }
          const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
          return nodes.some((node) => {
            if (node.nodeType !== 1) return false;
            const className = typeof node.className === "string" ? node.className : "";
            return (
              className.includes("yt-lyrics-chords-panel") ||
              className.includes("chords-carousel") ||
              className.includes("carousel")
            );
          });
        });

        if (isRelevantChange) handleTimelineAlwaysVisibleChange();
      });

      subtitleLocationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    subtitleLocationModuleLoaded = true;
    handleTimelineAlwaysVisibleChange();
  } catch (error) {
    console.error("[SubtitleButton] Error loading subtitle location module:", error);
  }
}

async function activateSubtitleSource(requestedSource) {
  const source = requestedSource === 'custom' ? 'custom' : 'original';
  const previousState = {
    sentences: window.subtitleState?.sentences || [],
    words: window.subtitleState?.words || [],
    isRTL: window.subtitleState?.isRTL || false,
    activeDefaultSource: window.subtitleState?.activeDefaultSource,
    timingSourceKey: window.subtitleState?.timingSourceKey,
    timing_offset: window.subtitleState?.timing_offset || 0,
  };

  await initializeSubtitlePreferences();
  await window.dynamicLoader?.ensureDatabaseManagerLoaded?.();

  const loadedSuccessfully = await loadSubtitles(true, source);
  const hasSubtitles = Boolean(
    (window.subtitleState?.sentences?.length || 0) > 0 ||
    (window.subtitleState?.words?.length || 0) > 0
  );
  if (!loadedSuccessfully || !hasSubtitles || !ensureSubtitleDOM()) {
    Object.assign(window.subtitleState, previousState);
    if (window.subtitleState?.isVisible) updateSubtitles();
    return false;
  }

  subtitleClickController?.abort();
  if (activeVideoListenersCleanup) {
    activeVideoListenersCleanup();
    activeVideoListenersCleanup = null;
  }

  subtitleClickController = new AbortController();
  window.subtitleState.isVisible = true;
  await ensureSubtitleLocationModule();
  window.subtitleState.displaySource = source;
  window.subtitleState.overlay.style.display = 'block';
  if (window.subtitleState.textContainer) {
    window.subtitleState.textContainer.style.display = '';
  }
  activeVideoListenersCleanup = setupVideoEventListeners(
    subtitleClickController.signal
  );
  startSubtitleRecoveryLoop();
  setSubtitleButtonVisualSource(source);
  window.setSubsActive?.(true);
  updateSubtitles();
  return true;
}

// שמירת הפונקציה הזמנית אם קיימת
const tempCreateSubtitleFunction = window.createSubtitleButton;

window.createSubtitleButton = function () {
  // אם יש כפתור זמני קיים, מחליפים אותו בכפתור חדש כדי לנקות listeners זמניים
  const existingButton = document.querySelector(".ytp-subtitle-button");
  if (existingButton && existingButton.getAttribute('data-temporary') === 'true') {
    console.log("[SubtitleButton] מחליף כפתור זמני בכפתור אמיתי");
    const existingContainer = existingButton.parentElement;
    const button = createDOMElement("button", "ytp-button ytp-subtitle-button");
    button.setAttribute("title", "Toggle Subtitles");
    setupRealSubtitleButton(button);
    existingContainer.replaceChildren(button);
    return existingContainer;
  }

  const container = createDOMElement("div", "custom-button-container");
  const button = createDOMElement("button", "ytp-button ytp-subtitle-button");
  button.setAttribute("title", "Toggle Subtitles");

  setupRealSubtitleButton(button);
  container.appendChild(button);
  return container;
};

// סימון שזו הפונקציה האמיתית (לא זמנית)
window.createSubtitleButton.isTemporaryFunction = false;

window.createCustomSubtitleButton = function () {
  const existingButton = document.querySelector('.ytp-custom-subtitle-button');
  if (existingButton?.getAttribute('data-temporary') === 'true') {
    const existingContainer = existingButton.parentElement;
    const button = createDOMElement(
      'button',
      'ytp-button ytp-custom-subtitle-button'
    );
    setupCustomSubtitleButton(button);
    existingContainer.replaceChildren(button);
    return existingContainer;
  }

  const container = createDOMElement('div', 'custom-button-container');
  const button = createDOMElement(
    'button',
    'ytp-button ytp-custom-subtitle-button'
  );
  setupCustomSubtitleButton(button);
  container.appendChild(button);
  return container;
};
window.createCustomSubtitleButton.isTemporaryFunction = false;

function setupCustomSubtitleButton(button) {
  button.setAttribute('title', 'Translated Subtitles');
  button.setAttribute('aria-label', 'Translated Subtitles');
  button.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <use class="ytp-svg-shadow"/>
    <circle class="ytp-svg-stroke" cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="1.5"/>
    <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-size="5.3" font-weight="bold" fill="#fff" class="ytp-svg-fill">CCT</text>
  </svg>`;

  button.addEventListener('click', async () => {
    if (
      window.subtitleState?.isVisible &&
      window.subtitleState.displaySource === 'custom'
    ) {
      deactivateSubtitleOverlay();
      return;
    }

    try {
      const activated = await activateSubtitleSource('custom');
      if (!activated) {
        showSubtitleModeStatusOverlay('Upload a translated SRT first');
        document.querySelector('.ytp-subflow-button')?.click();
      }
    } catch (error) {
      console.error('[SubtitleButton] Failed to activate custom subtitles:', error);
      setSubtitleButtonVisualSource(null);
    }
  });
}

function setupRealSubtitleButton(button) {
  fetch(chrome.runtime.getURL("images/subtitle/subtitle.svg"))
    .then((response) =>
      response.ok ? response.text() : Promise.reject("Failed to load SVG")
    )
    .then((svgText) => {
      button.innerHTML = svgText;
    })
    .catch((error) => {
      console.error("[SubtitleButton] Error loading SVG:", error);
      button.textContent = "SRT";
    });

  // Initial DOM setup (hidden)
  ensureSubtitleDOM();
  if (window.subtitleState.overlay)
    window.subtitleState.overlay.style.display = "none";

  button.addEventListener(
    "click",
    async () => {
      let initialIsVisibleState = window.subtitleState.isVisible;
      if (window.DEBUG)
        console.log(
          `[DEBUG SubtitleButton] Clicked. Initial isVisible: ${initialIsVisibleState}`
        );

      if (
        initialIsVisibleState &&
        window.subtitleState.displaySource === 'custom'
      ) {
        const switchedToOriginal = await activateSubtitleSource('original');
        if (switchedToOriginal) return;
        deactivateSubtitleOverlay();
        initialIsVisibleState = false;
      }

      // 🎯 Check if there's an active extraction process (Gemini API call)
      if (subtitleClickController && !subtitleClickController.signal.aborted) {
        console.log('[SubtitleButton] 🛑 Active extraction detected - aborting and closing');

        stopSubtitleRecoveryLoop();

        // Abort the extraction
        subtitleClickController.abort();

        // Clean up video listeners
        if (activeVideoListenersCleanup) {
          activeVideoListenersCleanup();
          activeVideoListenersCleanup = null;
        }

        // Turn off subtitles
        window.subtitleState.isVisible = false;
        window.subtitleState.displaySource = null;
        if (window.subtitleState.overlay) {
          window.subtitleState.overlay.style.display = "none";
        }

        // Remove red button
        button.classList.remove(SUBTITLE_BUTTON_ACTIVE_CLASS);
        document
          .querySelector('.ytp-custom-subtitle-button')
          ?.classList.remove('custom-subtitle-button-active');

        // Remove progress bar
        if (window.extractorModule?.removeSubtitlesProgressBar) {
          window.extractorModule.removeSubtitlesProgressBar();
        }

        // Clear the controller
        subtitleClickController = null;
        window.setSubsActive?.(false);

        console.log('[SubtitleButton] ✅ Extraction aborted, subtitles closed');
        return; // Exit - don't start a new operation
      }

      subtitleClickController = new AbortController();
      const { signal } = subtitleClickController;
      let subtitlesProgressShown = false;

      try {
        if (initialIsVisibleState) {
          if (window.DEBUG)
            console.log("[DEBUG SubtitleButton] Turning subtitles OFF.");
          window.subtitleState.isVisible = false;
        } else {
          if (window.DEBUG)
            console.log(
              "[DEBUG SubtitleButton] Turning subtitles ON. Loading dependencies..."
            );

          const isTutorialDemoAccess = isTutorialDemoSubtitleVideo();
          if (!isTutorialDemoAccess && window.__ycBlockClearLiveVideoIfNeeded?.('subtitles-button')) {
            button.classList.remove(SUBTITLE_BUTTON_ACTIVE_CLASS);
            return;
          }

          // 🎯 OPTIMISTIC UI: הפוך את הכפתור לאדום מיד (לפני כל בדיקה)
          button.classList.add(SUBTITLE_BUTTON_ACTIVE_CLASS);
          console.log("[SubtitleButton] 🎯 Optimistic UI: Button turned red immediately");

          // 🔐 SIGN-IN CHECK: Lyrics are free for all signed-in users
          try {
            if (!isTutorialDemoAccess) {
              await ensureSubtitleAuthLoaded();
            }

            // Fail-Safe: אם ycAuth לא נטען - חסום גישה
            if (!window.ycAuth?.getJWTPayload && !isTutorialDemoAccess) {
              console.error('[SubtitleButton] ycAuth not available - blocking access (Fail-Safe)');
              button.classList.remove(SUBTITLE_BUTTON_ACTIVE_CLASS);
              showSubtitleAuthError('Authentication system not loaded. Please reload the page.');
              return;
            }

            const jwt = window.ycAuth?.getJWTPayload?.();
            if (!jwt && !isTutorialDemoAccess) {
              console.log('[SubtitleButton] User not signed in');
              button.classList.remove(SUBTITLE_BUTTON_ACTIVE_CLASS);
              showSubtitleSignInRequired();
              return;
            } else if (!jwt && isTutorialDemoAccess) {
              console.log('[SubtitleButton] 🎬 Tutorial demo video - allowing subtitles without sign-in');
            }

            console.log('[SubtitleButton] User signed in - lyrics access granted');
          } catch (authError) {
            console.error('[SubtitleButton] Auth check error - blocking access (Fail-Safe):', authError);
            button.classList.remove(SUBTITLE_BUTTON_ACTIVE_CLASS);
            showSubtitleAuthError('Authentication error. Please reload the page.');
            return;
          }

          await initializeSubtitlePreferences();
          if (signal.aborted)
            throw new Error("Operation aborted after preferences init.");

          // (לוגיקת טעינת מודולים, ולידציה, חילוץ נשארת כפי שהייתה)
          if (window.dynamicLoader) {
            await window.dynamicLoader
              .ensureDatabaseManagerLoaded()
              .catch((e) => {
                throw new Error("DB Manager load failed: " + e.message);
              });
            if (!window.extractorModule) {
              await window.dynamicLoader.loadGroup("extractor").catch((e) => {
                throw new Error("Extractor module load failed: " + e.message);
              });
              if (!window.extractorModule && window.DEBUG) {
                /* ... fallback import ... */
              }
            }
          } else {
            throw new Error("dynamicLoader not available.");
          }
          if (
            !window.videoValidator ||
            !window.databaseManager ||
            !window.extractorModule
          ) {
            throw new Error("Critical modules missing");
          }
          const currentUrl = window.location.href;
          const videoId = window.ycUtils.extractVideoId(currentUrl);
          if (!videoId) throw new Error("Invalid YouTube URL");
          if (window.DEBUG)
            console.log(
              `[DEBUG SubtitleButton] Processing videoId: ${videoId}`
            );

          showSubtitleModeStatusToast(videoId);

          // 🎯 Set flag to ignore custom prompts EARLY (before any API calls)
          window.ycIgnoreCustomPromptForSubtitles = true;
          console.log('[SubtitleButton] 🎯 Ignoring custom prompts (subtitles only support DEFAULT/TRANSLATION)');

          const cachedWhisperData = await window.databaseManager?.loadSubtitlesFromIndexedDB?.(videoId);
          const preferredWhisperLanguage = await getPreferredSubtitleWhisperLanguage();
          const preferredWhisperModel = await getPreferredSubtitleWhisperModel();
          const cachedWhisperLanguage = normalizeSubtitleWhisperLanguage(
            cachedWhisperData?.whisperRequestedLanguage || cachedWhisperData?.requestedLanguage || 'auto'
          );
          const cachedWhisperModel = normalizeSubtitleWhisperModel(cachedWhisperData?.whisperModel);
          let needsExtraction = !cachedWhisperData?.whisperSentenceSRT?.trim?.()
            || cachedWhisperLanguage !== preferredWhisperLanguage
            || cachedWhisperModel !== preferredWhisperModel;
          if (cachedWhisperData?.whisperSentenceSRT?.trim?.()
            && (cachedWhisperLanguage !== preferredWhisperLanguage
              || cachedWhisperModel !== preferredWhisperModel)) {
            console.log('[SubtitleButton] Whisper language or model preference changed; a new transcript is required', {
              cachedWhisperLanguage,
              preferredWhisperLanguage,
              cachedWhisperModel,
              preferredWhisperModel,
            });
          }
          if (signal.aborted)
            throw new Error("Operation aborted after DB check.");
          if (needsExtraction) {
            const aiModeRaw = (await chrome.storage.local.get(['aiTranscriptionMode'])).aiTranscriptionMode;
            const aiModeForLongVideo = isTutorialDemoAccess
              ? 'off'
              : normalizeAiModeForSubtitles(aiModeRaw);
            const allowLongVideoForWhisper = true;

            const validationResult = isTutorialDemoAccess
              ? { isValid: true, isMusic: true, durationSeconds: getSubtitleVideoDurationSeconds() }
              : await window.videoValidator.validateVideo(
                currentUrl,
                {
                  signal,
                  allowNonMusic: true,
                  allowLongVideo: allowLongVideoForWhisper
                } // 🎯 Subtitles work for all videos + long videos in AI modes
              );
            if (signal.aborted || !validationResult.isValid) {
              // הצגת הודעת שגיאה בסגנון Toast
              if (window.ycUtils && window.ycUtils.showToast) {
                window.ycUtils.showToast(validationResult.message || "This YouTube video could not be validated", '⚠️', 3000);
              }
              button.classList.remove(SUBTITLE_BUTTON_ACTIVE_CLASS);
              return; // יציאה מהפונקציה בלי לזרוק Error
            }

            const selectedWhisperLanguage = typeof window.ycChooseWhisperLanguage === 'function'
              ? await window.ycChooseWhisperLanguage(preferredWhisperLanguage)
              : preferredWhisperLanguage;
            if (selectedWhisperLanguage === null) {
              window.ycIgnoreCustomPromptForCarousel = false;
              window.ycIgnoreCustomPromptForSubtitles = false;
              button.classList.remove(SUBTITLE_BUTTON_ACTIVE_CLASS);
              return;
            }
            if (signal.aborted) throw new Error("Operation aborted after Whisper language selection.");

            // Whisper can transcribe music and speech directly, so no
            // YouTube/Gemini caption or music-only gate is applied here.
            window.ycIgnoreCustomPromptForCarousel = true;

            // Whisper transcribes the local soundtrack directly. YouTube
            // caption availability is intentionally not checked anymore.
            console.log('[SubtitleButton] Whisper-only mode: skipping YouTube caption lookup');

            // Whisper is now the only transcription source. Always show a
            // real local-transcription progress bar when the cache is missing.
            const video = document.querySelector('video.html5-main-video');
            const durationMinutes = video?.duration ? video.duration / 60 : 3;
            if (window.extractorModule?.createSubtitlesProgressBar) {
              console.log('[SubtitleButton] 🎙️ Creating Whisper progress bar...');
              window.extractorModule.createSubtitlesProgressBar(durationMinutes, {
                showLongVideoHint: false,
                label: `Whisper ${preferredWhisperModel}`
              });
              subtitlesProgressShown = true;
            }

            const extractResult =
              await window.extractorModule.extractSubtitlesFromTarGz(videoId, selectedWhisperLanguage, null, {
                signal,
                ignoreCustom: true,
                whisperModel: preferredWhisperModel,
              });

            // 🎯 Clear flags after extraction
            window.ycIgnoreCustomPromptForCarousel = false;
            window.ycIgnoreCustomPromptForSubtitles = false;

            if (signal.aborted || !extractResult)
              throw new Error("Extraction failed/aborted or no subs in tar.gz");

            if (subtitlesProgressShown && window.extractorModule?.completeSubtitlesProgressBar) {
              window.extractorModule.completeSubtitlesProgressBar();
            }

            if (window.DEBUG)
              console.log(
                `[DEBUG SubtitleButton] Extracted and saved to DB for ${videoId}`
              );

            // ⏱️ המתנה של 1000ms לאחר extraction כדי לאפשר ל-IndexedDB לסיים commit
            console.log('[SubtitleButton] ⏱️ Waiting 1000ms for IndexedDB commit...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('[SubtitleButton] ✅ Wait complete, proceeding to load');
          } else {
            if (window.DEBUG)
              console.log(
                `[DEBUG SubtitleButton] Subs found in DB for ${videoId}.`
              );
          }

          // ✅ רק עכשיו - אחרי שאישרנו שיש כתוביות - ניצור את ה-DOM!
          if (!ensureSubtitleDOM()) {
            throw new Error(
              "Failed to ensure subtitle DOM structure on click."
            );
          }

          // 🎯 אם היה extraction, נעביר forceLoad=true כדי לעקוף בדיקות
          const loadedSuccessfully = await loadSubtitles(needsExtraction, 'original');
          if (signal.aborted)
            throw new Error("Operation aborted after loading subs to state.");

          if (
            loadedSuccessfully &&
            (window.subtitleState.sentences?.length > 0 ||
              window.subtitleState.words?.length > 0)
          ) {
            window.subtitleState.isVisible = true;
          } else {
            if (window.DEBUG)
              console.warn(
                "[SubtitleButton] No subtitles to display even after attempting loadSubtitles()."
              );
            if (loadedSuccessfully === false && needsExtraction === false) {
              showError("No subtitle content found in database.");
            } else if (loadedSuccessfully === false) {
              showError("No subtitle content could be displayed.");
            }
            window.subtitleState.isVisible = false;
          }
        }

        // עדכון סופי של מראה הכפתור והתצוגה
        if (window.subtitleState.isVisible) {
          await ensureSubtitleLocationModule();

          window.subtitleState.displaySource = 'original';
          button.classList.add(SUBTITLE_BUTTON_ACTIVE_CLASS);
          document
            .querySelector('.ytp-custom-subtitle-button')
            ?.classList.remove('custom-subtitle-button-active');
          if (window.subtitleState.overlay)
            window.subtitleState.overlay.style.display = "block";
          if (window.subtitleState.textContainer)
            window.subtitleState.textContainer.style.display = "";
          if (activeVideoListenersCleanup) activeVideoListenersCleanup();
          activeVideoListenersCleanup = setupVideoEventListeners(signal);
          startSubtitleRecoveryLoop();
          updateSubtitles();
          if (window.DEBUG)
            console.log("[DEBUG SubtitleButton] Subtitles display ON.");
        } else {
          stopSubtitleRecoveryLoop();
          button.classList.remove(SUBTITLE_BUTTON_ACTIVE_CLASS);
          window.subtitleState.displaySource = null;
          document
            .querySelector('.ytp-custom-subtitle-button')
            ?.classList.remove('custom-subtitle-button-active');
          if (window.subtitleState.overlay)
            window.subtitleState.overlay.style.display = "none";
          if (activeVideoListenersCleanup) {
            activeVideoListenersCleanup();
            activeVideoListenersCleanup = null;
          }
          subtitleVideoElement = null;
          subtitleClickController = null;
          window.setSubsActive?.(false);
          if (window.subtitleState.line1Element)
            window.subtitleState.line1Element.innerHTML = "";
          if (window.subtitleState.line2Element)
            window.subtitleState.line2Element.innerHTML = "";
          if (window.subtitleState.line3Element)
            window.subtitleState.line3Element.innerHTML = "";
          if (window.subtitleState.line4Element)
            window.subtitleState.line4Element.innerHTML = "";
          if (window.subtitleState.line5Element)
            window.subtitleState.line5Element.innerHTML = "";
          if (window.subtitleState.line6Element)
            window.subtitleState.line6Element.innerHTML = "";
          if (window.subtitleState.line7Element)
            window.subtitleState.line7Element.innerHTML = "";
          if (window.subtitleState.line8Element)
            window.subtitleState.line8Element.innerHTML = "";
          if (window.DEBUG)
            console.log("[DEBUG SubtitleButton] Subtitles display OFF.");
        }
        if (window.DEBUG)
          console.log(
            `[DEBUG SubtitleButton] Final isVisible state: ${window.subtitleState.isVisible}, Button class: ${button.className}`
          );
      } catch (err) {
        if (subtitlesProgressShown && window.extractorModule?.removeSubtitlesProgressBar) {
          window.extractorModule.removeSubtitlesProgressBar();
        }
        if (err.name === "AbortError" || signal.aborted) {
          if (window.DEBUG)
            console.log("[SubtitleButton] Click operation was aborted.");
        } else {
          console.error("[SubtitleButton] Error during click handler:", err);
          showError(err.message || "An error occurred.");
        }
      } finally {
        // 🎯 Always clear the flag, even if there was an error
        window.ycIgnoreCustomPromptForSubtitles = false;
      }
    },
    { passive: true }
  );
}

// ------------------------------
// 15. ניקוי הכתוביות
// ------------------------------
window.cleanupSubtitles = function () {
  if (window.DEBUG)
    console.log("[SubtitleButton DEBUG] cleanupSubtitles called.");
  unbindSubtitleDragHandlers();
  stopSubtitleRecoveryLoop();
  subtitleClickController?.abort();
  subtitleClickController = null;
  if (activeVideoListenersCleanup) {
    activeVideoListenersCleanup();
    activeVideoListenersCleanup = null;
  }

  // ניקוי subtitle location observer
  if (subtitleLocationObserver) {
    subtitleLocationObserver.disconnect();
    subtitleLocationObserver = null;
    subtitleLocationModuleLoaded = false;
    if (window.DEBUG) {
      console.log("[SubtitleButton] Disconnected subtitle location observer");
    }
  }

  if (Array.isArray(window.subtitleObservers)) {
    window.subtitleObservers.forEach((o) => o.disconnect?.());
    window.subtitleObservers.length = 0;
  }
  if (Array.isArray(window.subtitleObserverTimeouts)) {
    window.subtitleObserverTimeouts.forEach((id) => clearTimeout(id));
    window.subtitleObserverTimeouts.length = 0;
  }

  if (window.subtitleState.modeStatusToastTimeout) {
    clearTimeout(window.subtitleState.modeStatusToastTimeout);
    window.subtitleState.modeStatusToastTimeout = null;
  }
  if (window.subtitleState.modeStatusToastElement) {
    window.subtitleState.modeStatusToastElement.remove();
    window.subtitleState.modeStatusToastElement = null;
  }

  const menus = document.querySelectorAll(
    ".font-size-submenu, .font-color-submenu, .font-opacity-submenu," +
    " .word-highlight-text-color-submenu, .highlight-color-submenu," +
    " .highlight-opacity-submenu, .background-color-submenu," +
    " .background-opacity-submenu, .subtitle-mode-submenu," +
    " .subtitle-settings-menu, .adjustments-submenu," +
    " .buttons-display-submenu"
  );
  menus.forEach((menu) => {
    if (menu.observer) {
      menu.observer.disconnect();
      delete menu.observer;
    }
  });

  // נקה תוכן במקום למחוק את האלמנטים הממוחזרים עצמם
  ["line1WordSpans", "line2WordSpans", "line3WordSpans", "line4WordSpans", "line5WordSpans", "line6WordSpans", "line7WordSpans", "line8WordSpans"].forEach((arrayName) => {
    window.subtitleState[arrayName]?.forEach((span) => {
      span.textContent = "";
      span.style.display = "none";
    });
  });
  for (let i = 1; i <= MAX_LINES; i++) {
    if (window.subtitleState[`line${i}Element`])
      window.subtitleState[`line${i}Element`].innerHTML = "";
  }
  if (window.subtitleState.textContainer)
    window.subtitleState.textContainer.remove(); // הסר את הקונטיינר הפנימי
  if (window.subtitleState.overlay) window.subtitleState.overlay.remove();

  // אפס את הרפרנסים כדי ש-ensureSubtitleDOM ייצור אותם מחדש
  window.subtitleState.overlay = null;
  window.subtitleState.textContainer = null;
  window.subtitleState.line1Element = null;
  window.subtitleState.line2Element = null;
  window.subtitleState.line3Element = null;
  window.subtitleState.line4Element = null;
  window.subtitleState.line5Element = null; // 🆕
  window.subtitleState.line6Element = null; // 🆕
  window.subtitleState.line7Element = null; // 🆕
  window.subtitleState.line8Element = null; // 🆕
  window.subtitleState.line1WordSpans = [];
  window.subtitleState.line2WordSpans = [];
  window.subtitleState.line3WordSpans = [];
  window.subtitleState.line4WordSpans = [];
  window.subtitleState.line5WordSpans = []; // 🆕
  window.subtitleState.line6WordSpans = []; // 🆕
  window.subtitleState.line7WordSpans = []; // 🆕
  window.subtitleState.line8WordSpans = []; // 🆕

  window.subtitleState.isVisible = false;
  window.subtitleState.displaySource = null;
  window.subtitleState.isSettingsVisible = false;
  window.subtitleState.sentences = [];
  window.subtitleState.words = [];
  window.subtitleState.isRTL = false;
  window.subtitleState.isCustomPrompt = false;
  window.subtitleState.geminiDefaultMergePairsByIndex = null;
  setSubtitleButtonVisualSource(null);
  window.setSubsActive?.(false);

  // ניקוי מערכי SPANs - קריטי למניעת דליפות!
  if (
    window.subtitleState.line1WordSpans &&
    window.subtitleState.line1WordSpans.length > 0
  ) {
    // ניקוי event listeners מכל span
    window.subtitleState.line1WordSpans.forEach((span) => {
      if (span && span.parentNode) {
        span.onclick = null;
        span.onmouseenter = null;
        span.onmouseleave = null;
        span.remove();
      }
    });
    window.subtitleState.line1WordSpans = [];
    if (DEBUG) console.log("[cleanupSubtitles] Cleared line1WordSpans");
  }

  if (
    window.subtitleState.line2WordSpans &&
    window.subtitleState.line2WordSpans.length > 0
  ) {
    // ניקוי event listeners מכל span
    window.subtitleState.line2WordSpans.forEach((span) => {
      if (span && span.parentNode) {
        span.onclick = null;
        span.onmouseenter = null;
        span.onmouseleave = null;
        span.remove();
      }
    });
    window.subtitleState.line2WordSpans = [];
    if (DEBUG) console.log("[cleanupSubtitles] Cleared line2WordSpans");
  }

  // ניקוי רפרנס לווידאו
  if (window.subtitleVideoElement) {
    window.subtitleVideoElement = null;
    if (DEBUG)
      console.log("[cleanupSubtitles] Cleared video element reference");
  }

  /* ביטול הטיימר שמנקה SPAN-ים אם קיים */
  if (typeof window.spanCleanupTimerId === "number") {
    clearInterval(window.spanCleanupTimerId);
    window.spanCleanupTimerId = null;
    if (DEBUG) console.log("[cleanupSubtitles] spanCleanupTimer cancelled");
  }

  subtitleVideoElement = null;

  const subtitleBtn = document.querySelector(".ytp-button.ytp-subtitle-button");
  subtitleBtn?.classList.remove(SUBTITLE_BUTTON_ACTIVE_CLASS);

  if (window.DEBUG) console.log("[SubtitleButton] Subtitles cleaned up.");
};

// ------------------------------
// 16. ניקוי תקופתי של SPANs ישנים
// ------------------------------
function cleanupOldSpans() {
  if (!window.subtitleState) return;

  // ניקוי spans שלא מחוברים ל-DOM
  ["line1WordSpans", "line2WordSpans", "line3WordSpans", "line4WordSpans", "line5WordSpans", "line6WordSpans", "line7WordSpans", "line8WordSpans"].forEach((arrayName) => {
    const spans = window.subtitleState[arrayName];
    if (spans && spans.length > 0) {
      const validSpans = spans.filter((span) => span && span.isConnected);
      if (validSpans.length < spans.length) {
        const removed = spans.length - validSpans.length;
        window.subtitleState[arrayName] = validSpans;
        if (DEBUG)
          console.log(
            `[cleanupOldSpans] Removed ${removed} disconnected spans from ${arrayName}`
          );
      }
    }
  });

  // ✅ בדיקה נוספת - ניקוי spans יתומים עם הclasses החדשים
  const orphanRegularSpans = document.querySelectorAll(
    ".regular-subtitle-word:not(.highlighted):not(.past-word)"
  );
  let cleanedOrphans = 0;
  orphanRegularSpans.forEach((span) => {
    if (!span.closest(".yt-subtitle-overlay") || !span.textContent?.trim()) {
      span.remove();
      cleanedOrphans++;
    }
  });
  if (DEBUG && cleanedOrphans > 0) {
    console.log(
      `[cleanupOldSpans] Cleaned ${cleanedOrphans} orphan regular-subtitle spans`
    );
  }
}

/* ניקוי spans יתומים פעם בדקה — הגנה נוספת מדליפות */
if (!window.spanCleanupTimerId) {
  window.spanCleanupTimerId = setInterval(cleanupOldSpans, 60_000);
}

/* ביטול טיימר ה-debounce של updateSubtitles בעת סגירת הדף */
window.addEventListener(
  "beforeunload",
  () => {
    if (updateSubtitles && typeof updateSubtitles.cancel === "function") {
      updateSubtitles.cancel();
      if (DEBUG)
        console.log(
          "[SubtitleButton] Cancelled updateSubtitles debounce timer"
        );
    }
  },
  { once: true }
);

// ------------------------------
// 17. ייצוא פונקציות חיצוניות וטעינת הגדרות ראשונית
// ------------------------------

// ייצוא updateSubtitles לחלון הגלובלי כדי לאפשר ביטול הטיימר מבחוץ
window.updateSubtitles = updateSubtitles;
if (
  document.readyState === "complete" ||
  document.readyState === "interactive"
) {
  initializeSubtitlePreferences().catch((err) => {
    console.error(
      "[SubtitleButton] Error during initial auto preferences load:",
      err
    );
  });
} else {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      initializeSubtitlePreferences().catch((err) => {
        console.error(
          "[SubtitleButton] Error during initial auto preferences load (DOMContentLoaded):",
          err
        );
      });
    },
    { once: true }
  );
}

// הערה: subtitle location module נטען באופן דינמי רק כשהכתוביות מופעלות בפעם הראשונה
// ראה את הקוד בתוך "if (window.subtitleState.isVisible)" למעלה
