/**
 * YouChords - Utilities Module
 * קובץ שירותים מרכזי המכיל פונקציות משותפות והגדרות גלובליות
 */

// Global DEBUG flag - Single Source of Truth
window.DEBUG = false;  // שנה ל-true לזמן פיתוח

// Global timeout constants
window.TIMEOUT_MS = 5000;  // 5 שניות מקסימום לחילוץ

/**
 * מחלץ את מזהה הסרטון מ-URL של YouTube
 * @param {string} url - כתובת ה-URL לחילוץ ממנה
 * @returns {string|null} - מזהה הסרטון או null אם לא נמצא
 */
function extractVideoId(url) {
  try {
    return new URL(url).searchParams.get('v');
  } catch {
    return null;
  }
}

/**
 * פונקציה להצגת הודעת שגיאה על גבי הסרטון
 * @param {string} message - הודעת השגיאה
 * @param {number} duration - משך הזמן שההודעה תוצג (ברירת מחדל: 5000)
 */
function showErrorOverlay(message, duration = 5000) {
  if (window.DEBUG) console.log(`[YC-Utils] Showing error overlay: "${message}"`);

  // ניקוי הודעת שגיאה קודמת אם קיימת
  if (window.lastErrorOverlay) {
    if (window.DEBUG) console.log(`[YC-Utils] Removing previous error overlay`);
    window.lastErrorOverlay.remove();
    window.lastErrorOverlay = null;
  }

  const videoPlayer = document.querySelector('#movie_player') ||
    document.querySelector('.html5-video-player');

  if (!videoPlayer) {
    if (window.DEBUG) console.warn("[YC-Utils] No video player found, showing error in body");
    // אם אין נגן וידאו, נציג את ההודעה בגוף הדף
    const errorOverlay = document.createElement('div');
    errorOverlay.classList.add('yc-error-overlay');   // ← מזהה קבוע לניקוי
    errorOverlay.style.cssText = `
      position: fixed;
      bottom: 15%;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      z-index: 10000;
      font-size: 16px;
      font-weight: bold;
      box-shadow: 0 0 10px rgba(255, 0, 0, 0.5);
      border: 2px solid red;
      text-align: center;
      direction: ltr;
      min-width: 300px;
      max-width: 80%;
    `;
    errorOverlay.textContent = message;
    document.body.appendChild(errorOverlay);
    window.lastErrorOverlay = errorOverlay;

    // הסרה מיידית בניווט SPA
    document.addEventListener('yt-navigate-start', () => {
      if (window.DEBUG) console.log(`[YC-Utils] Removing error overlay on navigation`);
      errorOverlay.remove();
    }, { once: true });

    // הסרה אחרי הזמן שנקבע
    setTimeout(() => {
      if (window.DEBUG) console.log(`[YC-Utils] Auto-removing error overlay after ${duration}ms`);
      errorOverlay.remove();
      if (window.lastErrorOverlay === errorOverlay) {
        window.lastErrorOverlay = null;
      }
    }, duration);

    return;
  }

  // יצירת אלמנט ההודעה
  const errorOverlay = document.createElement('div');
  errorOverlay.classList.add('yc-error-overlay');   // ← מזהה קבוע לניקוי
  errorOverlay.style.cssText = `
    position: absolute;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    z-index: 10000;
    font-size: 16px;
    font-weight: bold;
    box-shadow: 0 0 10px rgba(255, 0, 0, 0.5);
    border: 2px solid red;
    text-align: center;
    direction: ltr;
    min-width: 300px;
    max-width: 80%;
  `;
  errorOverlay.textContent = message;

  // הוספת האלמנט לנגן הווידאו
  videoPlayer.appendChild(errorOverlay);
  if (window.DEBUG) console.log("[YC-Utils] Error overlay added to video player");

  // שמירת רפרנס גלובלי לניקוי
  window.lastErrorOverlay = errorOverlay;

  // הסרה מיידית בניווט SPA
  document.addEventListener('yt-navigate-start', () => {
    if (window.DEBUG) console.log(`[YC-Utils] Removing error overlay on navigation`);
    errorOverlay.remove();
  }, { once: true });

  // הסרת האלמנט אחרי הזמן שנקבע
  setTimeout(() => {
    try {
      if (window.DEBUG) console.log(`[YC-Utils] Auto-removing error overlay after ${duration}ms`);
      if (errorOverlay.parentNode) {
        errorOverlay.parentNode.removeChild(errorOverlay);
      }
      if (window.lastErrorOverlay === errorOverlay) {
        window.lastErrorOverlay = null;
      }
    } catch (e) {
      console.error('[YC-Utils] Error removing overlay:', e);
    }
  }, duration);
}

/**
 * פונקציה להצגת הודעת דיבאג זמנית
 * @param {string} message - הודעת הדיבאג
 * @param {number} duration - משך הזמן שההודעה תוצג (ברירת מחדל: 3000)
 */
function showDebugOverlay(message, duration = 3000) {
  // מוצג רק במצב DEBUG
  if (!window.DEBUG) return;

  console.log(`[YC-Utils] Debug overlay: ${message}`);

  // ניקוי הודעת דיבאג קודמת אם קיימת
  if (window.lastDebugOverlay) {
    console.log(`[YC-Utils] Removing previous debug overlay`);
    window.lastDebugOverlay.remove();
    window.lastDebugOverlay = null;
  }

  // יצירת אלמנט ההודעה
  const debugOverlay = document.createElement('div');
  debugOverlay.classList.add('yc-debug-overlay');  // ← מזהה קבוע לניקוי
  debugOverlay.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.8);
    color: #00ff00;
    padding: 8px 12px;
    border-radius: 4px;
    z-index: 10000;
    font-size: 14px;
    font-family: monospace;
    border: 1px solid #00ff00;
    text-align: left;
    direction: ltr;
  `;
  debugOverlay.textContent = message;
  document.body.appendChild(debugOverlay);

  // שמירת רפרנס גלובלי לניקוי
  window.lastDebugOverlay = debugOverlay;

  // הסרה מיידית בניווט SPA
  document.addEventListener('yt-navigate-start', () => {
    console.log(`[YC-Utils] Removing debug overlay on navigation`);
    debugOverlay.remove();
  }, { once: true });

  // הסרה אחרי הזמן שנקבע
  setTimeout(() => {
    console.log(`[YC-Utils] Auto-removing debug overlay after ${duration}ms`);
    debugOverlay.remove();
    if (window.lastDebugOverlay === debugOverlay) {
      window.lastDebugOverlay = null;
    }
  }, duration);
}

/**
 * ביצוע קריאת fetch עם timeout
 * @param {string} url - כתובת ה-URL לשליפה
 * @param {Object} options - אפשרויות fetch
 * @param {number} timeoutMs - זמן timeout במילישניות (ברירת מחדל: 10000)
 * @returns {Promise} - הבטחה שמתממשת עם תשובת ה-fetch
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

let ycToastHideTimerId = null;
let ycToastRemoveTimerId = null;

function clearToastTimers() {
  if (ycToastHideTimerId) {
    clearTimeout(ycToastHideTimerId);
    ycToastHideTimerId = null;
  }
  if (ycToastRemoveTimerId) {
    clearTimeout(ycToastRemoveTimerId);
    ycToastRemoveTimerId = null;
  }
}

/**
 * Toast notification (Rounded Gradient style)
 * Displays inside video player at calculated position
 * @param {string} message - הודעה להצגה
 * @param {string} icon - אייקון (ברירת מחדל: 📝)
 * @param {number} duration - משך הזמן (ברירת מחדל: 3000)
 * @param {Object} options - אפשרויות תצוגה (אופציונלי)
 * @param {Element} options.anchorElement - אלמנט שלפיו מחשבים מרכז אופקי. אם לא נשלח, ננסה לעגן לנגן YouTube.
 */
function showToast(message, icon = '📝', duration = 3000, options = {}) {
  clearToastTimers();

  // הסרת toast קודם אם קיים
  const existing = document.querySelector('.yc-toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'yc-toast-notification';
  const messageSpan = document.createElement('span');
  messageSpan.textContent = message;
  messageSpan.style.whiteSpace = 'pre-line';
  messageSpan.style.lineHeight = '1.35';
  const safeIcon = String(icon || '').trim();
  if (safeIcon) {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'yc-toast-icon';
    iconSpan.textContent = safeIcon;
    toast.appendChild(iconSpan);
  }
  toast.appendChild(messageSpan);

  const toastHost = document.fullscreenElement || document.body;
  const videoAnchorElement = options?.centerOnVideo
    ? document.querySelector('video.html5-main-video, .html5-video-container video')
    : null;
  const anchorElement =
    options?.anchorElement ||
    videoAnchorElement ||
    document.querySelector('#movie_player, .html5-video-player');
  const anchorRect = anchorElement?.getBoundingClientRect?.();
  const anchorCenterX = anchorRect && anchorRect.width > 0
    ? Math.round(anchorRect.left + (anchorRect.width / 2))
    : null;
  const toastLeft = anchorCenterX !== null ? `${anchorCenterX}px` : '50%';
  toast.style.cssText = `
    position: fixed;
    bottom: 160px;
    left: ${toastLeft};
    transform: translateX(-50%) translateY(20px);
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    color: #fff;
    padding: 16px 28px;
    border-radius: 50px;
    font-size: 16px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    border: 1px solid rgba(255,255,255,0.1);
    opacity: 0;
    transition: all 0.3s ease;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 10px;
    pointer-events: none;
  `;
  toastHost.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(-50%) translateY(0)';
    toast.style.opacity = '1';
  });

  // Auto-hide
  ycToastHideTimerId = setTimeout(() => {
    ycToastHideTimerId = null;
    if (!toast.isConnected) return;
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    toast.style.opacity = '0';
    ycToastRemoveTimerId = setTimeout(() => {
      ycToastRemoveTimerId = null;
      toast.remove();
    }, 300);
  }, duration);
}

/**
 * 🤖 Modal לשגיאות Gemini API
 * @param {Object} errorInfo - מידע על השגיאה
 * @param {string} errorInfo.type - סוג השגיאה (429, 403-key, 403-quota, 400, timeout, empty, network, generic)
 * @param {string} errorInfo.message - הודעת השגיאה
 * @param {Function} errorInfo.onRetry - פונקציה לביצוע retry (אופציונלי)
 */
function showGeminiErrorModal(errorInfo) {
  // Error configurations
  const errorConfigs = {
    '429': {
      icon: '⏱️',
      title: 'Rate Limit Reached',
      helpText: 'Wait a few moments, or add another API key for extra quota.',
      buttons: ['close', 'retry', 'manage-keys']
    },
    '403-key': {
      icon: '🔑',
      title: 'Invalid API Key',
      helpText: 'Please check your Gemini API key in the extension settings and make sure it\'s valid.',
      buttons: ['close', 'settings']
    },
    '403-quota': {
      icon: '⏳',
      title: 'Daily Quota Exceeded',
      helpText: 'Your quota resets in ~24 hours, or add another API key now for extra quota.',
      buttons: ['close', 'manage-keys']
    },
    '400': {
      icon: '⚠️',
      title: 'Invalid Request',
      helpText: 'The request to Gemini API was invalid. This might be a temporary issue.',
      buttons: ['close']
    },
    'timeout': {
      icon: '⏰',
      title: 'Transcription Timeout',
      helpText: 'The transcription took too long. The video might be too long. Please try a shorter video.',
      buttons: ['close']
    },
    'empty': {
      icon: '📭',
      title: 'No Transcription Generated',
      helpText: 'Gemini couldn\'t generate a transcription. The video might be too long, unavailable, or contain no speech.',
      buttons: ['close']
    },
    'network': {
      icon: '🌐',
      title: 'Network Error',
      helpText: 'Could not connect to Gemini API. Please check your internet connection.',
      buttons: ['close', 'retry']
    },
    'generic': {
      icon: '❌',
      title: 'Transcription Failed',
      helpText: 'An unexpected error occurred. Please try again later.',
      buttons: ['close']
    }
  };

  const config = errorConfigs[errorInfo.type] || errorConfigs['generic'];

  // Remove existing modal
  const existingModal = document.getElementById('yc-upgrade-modal');
  if (existingModal) existingModal.remove();

  const existingStyle = document.getElementById('yc-gemini-error-modal-style');
  if (existingStyle) existingStyle.remove();

  const modal = document.createElement('div');
  modal.id = 'yc-upgrade-modal';

  // Build buttons HTML - order: primary action first, then secondary options
  let buttonsHTML = '';
  if (config.buttons.includes('retry')) {
    buttonsHTML += '<button class="yc-modal-btn yc-modal-btn-success yc-modal-btn-retry">🔄 Try Again</button>';
  }
  if (config.buttons.includes('manage-keys')) {
    buttonsHTML += '<button class="yc-modal-btn yc-modal-btn-primary yc-modal-btn-manage-keys">➕ Add API Key</button>';
  }
  if (config.buttons.includes('settings')) {
    buttonsHTML += '<button class="yc-modal-btn yc-modal-btn-primary yc-modal-btn-settings">Open Settings</button>';
  }
  buttonsHTML += '<button class="yc-modal-btn yc-modal-btn-secondary yc-modal-btn-close">Close</button>';

  modal.innerHTML = `
    <div class="yc-modal-backdrop"></div>
    <div class="yc-modal-content">
      <button class="yc-modal-close-btn">×</button>
      <div class="yc-modal-icon" data-yc-modal-icon></div>
      <h2 class="yc-modal-title" data-yc-modal-title></h2>
      <p class="yc-modal-text" data-yc-modal-message></p>
      ${config.helpText ? '<p class="yc-modal-help-text" data-yc-modal-help></p>' : ''}
      <div class="yc-modal-buttons">
        ${buttonsHTML}
      </div>
    </div>
  `;

  const modalIcon = modal.querySelector('[data-yc-modal-icon]');
  if (modalIcon) modalIcon.textContent = config.icon;
  const modalTitle = modal.querySelector('[data-yc-modal-title]');
  if (modalTitle) modalTitle.textContent = config.title;
  const modalMessage = modal.querySelector('[data-yc-modal-message]');
  if (modalMessage) modalMessage.textContent = errorInfo.message || '';
  const modalHelp = modal.querySelector('[data-yc-modal-help]');
  if (modalHelp) modalHelp.textContent = config.helpText || '';

  const style = document.createElement('style');
  style.id = 'yc-gemini-error-modal-style';
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
      animation: yc-modal-appear 0.3s ease;
    }
    @keyframes yc-modal-appear {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
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
    .yc-modal-help-text {
      color: rgba(255, 255, 255, 0.7);
      font-size: 13px;
      line-height: 1.5;
      margin: 15px 0;
    }
    .yc-modal-buttons {
      display: flex;
      gap: 12px;
      margin-top: 25px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .yc-modal-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 25px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .yc-modal-btn-primary {
      background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
      color: white;
    }
    .yc-modal-btn-primary:hover {
      transform: scale(1.05);
      box-shadow: 0 5px 20px rgba(231, 76, 60, 0.4);
    }
    .yc-modal-btn-secondary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .yc-modal-btn-secondary:hover {
      transform: scale(1.05);
      box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
    }
    .yc-modal-btn-success {
      background: linear-gradient(135deg, #27ae60 0%, #1e8449 100%);
      color: white;
    }
    .yc-modal-btn-success:hover {
      transform: scale(1.05);
      box-shadow: 0 5px 20px rgba(39, 174, 96, 0.4);
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(modal);

  // Event listeners
  modal.querySelector('.yc-modal-backdrop').addEventListener('click', () => modal.remove());
  modal.querySelector('.yc-modal-close-btn').addEventListener('click', () => modal.remove());

  const closeBtn = modal.querySelector('.yc-modal-btn-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => modal.remove());
  }

  const retryBtn = modal.querySelector('.yc-modal-btn-retry');
  if (retryBtn && errorInfo.onRetry) {
    retryBtn.addEventListener('click', () => {
      modal.remove();
      errorInfo.onRetry();
    });
  }

  const settingsBtn = modal.querySelector('.yc-modal-btn-settings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      // Open extension popup (settings)
      chrome.runtime.sendMessage({ action: 'openPopup' });
      modal.remove();
    });
  }

  const manageKeysBtn = modal.querySelector('.yc-modal-btn-manage-keys');
  if (manageKeysBtn) {
    manageKeysBtn.addEventListener('click', () => {
      // Open extension popup directly to API management
      chrome.runtime.sendMessage({ action: 'openApiManagement' });
      modal.remove();
    });
  }

  if (window.DEBUG) console.log('[YC-Utils] 🤖 Showing Gemini error modal:', errorInfo.type);
}

/**
 * 💡 Modal להצעת הוספת Gemini API key - מוצג פעם אחת בלחיצה ראשונה על Chords
 * @param {Function} onAddKey - callback כשלוחצים "Add API Key"
 * @param {Function} onMaybeLater - callback כשלוחצים "Maybe Later" או סוגרים את המודל
 */
function showGeminiApiKeyPrompt(onAddKey, onMaybeLater) {
  // Remove existing modal if any
  const existingModal = document.getElementById('yc-gemini-prompt-modal');
  if (existingModal) existingModal.remove();

  const existingStyle = document.getElementById('yc-gemini-prompt-modal-style');
  if (existingStyle) existingStyle.remove();

  const modal = document.createElement('div');
  modal.id = 'yc-gemini-prompt-modal';

  modal.innerHTML = `
    <div class="yc-modal-backdrop"></div>
    <div class="yc-modal-content">
      <div class="yc-modal-icon">💡</div>
      <h2 class="yc-modal-title">Want better transcription quality?</h2>
      <p class="yc-modal-text">Add a free Gemini API key for unlimited AI transcriptions</p>
      <div class="yc-modal-buttons">
        <button class="yc-modal-btn yc-modal-btn-primary yc-modal-btn-add-key">Add API Key</button>
        <button class="yc-modal-btn yc-modal-btn-secondary yc-modal-btn-maybe-later">Maybe Later</button>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.id = 'yc-gemini-prompt-modal-style';
  style.textContent = `
    #yc-gemini-prompt-modal {
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
      animation: yc-modal-appear 0.3s ease;
    }
    @keyframes yc-modal-appear {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }
    .yc-modal-icon {
      font-size: 48px;
      margin-bottom: 20px;
    }
    .yc-modal-title {
      color: #fff;
      font-size: 24px;
      margin: 0 0 15px 0;
      font-weight: 700;
    }
    .yc-modal-text {
      color: rgba(255, 255, 255, 0.9);
      font-size: 16px;
      line-height: 1.6;
      margin: 0 0 25px 0;
    }
    .yc-modal-buttons {
      display: flex;
      gap: 12px;
      margin-top: 25px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .yc-modal-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 25px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .yc-modal-btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .yc-modal-btn-primary:hover {
      transform: scale(1.05);
      box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
    }
    .yc-modal-btn-secondary {
      background: rgba(255, 255, 255, 0.1);
      color: white;
    }
    .yc-modal-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: scale(1.05);
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(modal);

  // Event listeners
  const handleClose = () => modal.remove();

  // Backdrop click = same as "Maybe Later"
  modal.querySelector('.yc-modal-backdrop').addEventListener('click', () => {
    handleClose();
    if (onMaybeLater) onMaybeLater();
  });

  modal.querySelector('.yc-modal-btn-add-key').addEventListener('click', () => {
    handleClose();
    if (onAddKey) onAddKey();
  });

  modal.querySelector('.yc-modal-btn-maybe-later').addEventListener('click', () => {
    handleClose();
    if (onMaybeLater) onMaybeLater();
  });

  if (window.DEBUG) console.log('[YC-Utils] 💡 Showing Gemini API key prompt');
}

/**
 * ⏳ Modal אישור להמשך תמלול על סרטון ארוך
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} options.details
 * @param {string} options.continueText
 * @param {string} options.cancelText
 * @returns {Promise<boolean>} true=continue, false=cancel
 */
function showLongVideoConfirmModal(options = {}) {
  const {
    title = 'Long video detected',
    message = 'AI subtitles for long videos may take longer than usual.',
    details = '',
    icon = '⏳',
    iconSize = '48px',
    messageFontSize = '15px',
    continueText = 'Continue',
    cancelText = 'Cancel'
  } = options;

  const existingModal = document.getElementById('yc-long-video-confirm-modal');
  if (existingModal) existingModal.remove();
  const existingStyle = document.getElementById('yc-long-video-confirm-modal-style');
  if (existingStyle) existingStyle.remove();

  const modal = document.createElement('div');
  modal.id = 'yc-long-video-confirm-modal';
  modal.innerHTML = `
    <div class="yc-modal-backdrop"></div>
    <div class="yc-modal-content">
      <button class="yc-modal-close-btn">×</button>
      <div class="yc-modal-icon">${icon}</div>
      <h2 class="yc-modal-title">${title}</h2>
      <p class="yc-modal-text">${message}</p>
      ${details ? `<p class="yc-modal-help-text">${details}</p>` : ''}
      <div class="yc-modal-buttons">
        <button class="yc-modal-btn yc-modal-btn-secondary yc-modal-btn-cancel">${cancelText}</button>
        <button class="yc-modal-btn yc-modal-btn-primary yc-modal-btn-continue">${continueText}</button>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.id = 'yc-long-video-confirm-modal-style';
  style.textContent = `
    #yc-long-video-confirm-modal {
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
    #yc-long-video-confirm-modal .yc-modal-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
    }
    #yc-long-video-confirm-modal .yc-modal-content {
      position: relative;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 20px;
      padding: 40px;
      width: min(360px, calc(100vw - 32px));
      max-width: 360px;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
      animation: yc-modal-appear 0.3s ease;
    }
    #yc-long-video-confirm-modal .yc-modal-close-btn {
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
    #yc-long-video-confirm-modal .yc-modal-close-btn:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.1);
    }
    #yc-long-video-confirm-modal .yc-modal-icon {
      font-size: ${iconSize};
      margin-bottom: 20px;
    }
    #yc-long-video-confirm-modal .yc-modal-title {
      color: #fff;
      font-size: 24px;
      margin: 0 0 12px 0;
      font-weight: 700;
    }
    #yc-long-video-confirm-modal .yc-modal-text {
      color: rgba(255, 255, 255, 0.92);
      font-size: ${messageFontSize};
      line-height: 1.6;
      margin: 0 0 10px 0;
      white-space: pre-line;
    }
    #yc-long-video-confirm-modal .yc-modal-help-text {
      color: rgba(255, 255, 255, 0.7);
      font-size: 13px;
      line-height: 1.5;
      margin: 8px 0 0 0;
    }
    #yc-long-video-confirm-modal .yc-modal-buttons {
      display: flex;
      gap: 12px;
      margin-top: 24px;
      justify-content: center;
      flex-wrap: wrap;
    }
    #yc-long-video-confirm-modal .yc-modal-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 25px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    #yc-long-video-confirm-modal .yc-modal-btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    #yc-long-video-confirm-modal .yc-modal-btn-primary:hover {
      transform: scale(1.05);
      box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
    }
    #yc-long-video-confirm-modal .yc-modal-btn-secondary {
      background: rgba(255, 255, 255, 0.1);
      color: white;
    }
    #yc-long-video-confirm-modal .yc-modal-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: scale(1.05);
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(modal);

  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      document.removeEventListener('keydown', onKeydown);
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      if (style.parentNode) style.parentNode.removeChild(style);
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        finish(false);
      }
    };

    document.addEventListener('keydown', onKeydown);
    modal.querySelector('.yc-modal-backdrop').addEventListener('click', () => finish(false));
    modal.querySelector('.yc-modal-close-btn').addEventListener('click', () => finish(false));
    modal.querySelector('.yc-modal-btn-cancel').addEventListener('click', () => finish(false));
    modal.querySelector('.yc-modal-btn-continue').addEventListener('click', () => finish(true));
  });
}

// Make function globally accessible for backward compatibility
window.showGeminiErrorModal = showGeminiErrorModal;
window.showGeminiApiKeyPrompt = showGeminiApiKeyPrompt;
window.showLongVideoConfirmModal = showLongVideoConfirmModal;

window.ycSubtitleOffsetControls = (() => {
  const TIMING_MIN = -6;
  const TIMING_MAX = 6;
  const TIMING_STEP = 0.1;

  const formatTimingValue = (value) => {
    const num = Number(value) || 0;
    return `${num > 0 ? "+" : ""}${num.toFixed(1)}s`;
  };

  const clampTimingValue = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    const clamped = Math.min(TIMING_MAX, Math.max(TIMING_MIN, num));
    return Math.round(clamped / TIMING_STEP) * TIMING_STEP;
  };

  const getCurrentVideoId = () => {
    if (window.ycUtils?.extractVideoId) {
      return window.ycUtils.extractVideoId(window.location.href);
    }
    return new URLSearchParams(location.search).get("v");
  };

  const readSubtitleModeSelection = async (ownerName) => {
    let aiMode = "off";
    let useTranslation = false;

    try {
      const selection = await chrome.storage.local.get([
        "aiTranscriptionMode",
        "showTranslation",
      ]);
      const rawAiMode =
        typeof selection.aiTranscriptionMode === "string"
          ? selection.aiTranscriptionMode.toLowerCase()
          : "off";
      aiMode = ["off", "auto", "always"].includes(rawAiMode) ? rawAiMode : "off";
      useTranslation = aiMode === "off" ? false : selection.showTranslation === true;
    } catch (error) {
      console.warn(`[${ownerName}] Failed reading subtitle timing selection:`, error);
    }

    return { aiMode, useTranslation };
  };

  const resolveActiveTimingContext = async (ownerName = "SubtitleOffset") => {
    const videoId = getCurrentVideoId();
    if (!videoId) {
      return { videoId: "", sourceKey: "youtube_default", offset: 0 };
    }

    const { aiMode, useTranslation } = await readSubtitleModeSelection(ownerName);
    let subtitlesData = null;

    try {
      subtitlesData = await window.databaseManager?.loadSubtitlesFromIndexedDB?.(videoId);
      if (subtitlesData && window.databaseManager?.normalizeSubtitlesForActiveMode) {
        subtitlesData = await window.databaseManager.normalizeSubtitlesForActiveMode(
          subtitlesData,
          aiMode
        );
      }
    } catch (error) {
      console.warn(`[${ownerName}] Failed loading subtitles for timing offset:`, error);
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
        return {
          videoId,
          sourceKey: offsetResult?.sourceKey || "youtube_default",
          offset: offsetResult?.offset || 0,
        };
      } catch (error) {
        console.warn(`[${ownerName}] Failed resolving subtitle timing offset:`, error);
      }
    }

    return { videoId, sourceKey: "youtube_default", offset: 0 };
  };

  const createControl = ({ ownerName = "SubtitleOffset", source = "subtitleOffsetControl" } = {}) => {
    const item = document.createElement("div");
    item.className = "yc-subtitle-offset-inline-control";
    item.style.cssText = `
      margin-top: 2px;
      padding-top: 6px;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      display: flex;
      flex-direction: column;
      gap: 1px;
      user-select: none;
      -webkit-user-select: none;
      width: 230px;
      max-width: 100%;
      direction: ltr !important;
      unicode-bidi: isolate !important;
      text-align: left !important;
    `;
    item.setAttribute("dir", "ltr");
    item.setAttribute("data-yc-owned", "true");

    const layout = document.createElement("div");
    layout.style.cssText = `
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) 18px;
      grid-template-rows: 24px 24px;
      column-gap: 6px;
      row-gap: 1px;
      align-items: center;
      width: 100%;
      direction: ltr !important;
      unicode-bidi: isolate !important;
    `;

    const title = document.createElement("span");
    title.textContent = "Subtitle Offset";
    title.style.cssText = `
      color: #ddd;
      font-size: 12px;
      grid-column: 1 / 3;
      grid-row: 1 / 2;
      align-self: center;
      direction: ltr !important;
      unicode-bidi: isolate !important;
      text-align: left;
    `;

    const valueLabel = document.createElement("span");
    valueLabel.style.cssText = `
      color: #fff;
      font-size: 11px;
      text-align: right;
      font-variant-numeric: tabular-nums;
      grid-column: 2 / 4;
      grid-row: 1 / 2;
      line-height: 1;
      margin: 0;
      justify-self: end;
      padding-right: 22px;
      pointer-events: none;
      direction: ltr !important;
      unicode-bidi: isolate !important;
    `;
    valueLabel.textContent = "0.0s";

    const createStepButton = (label, fontSize) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.style.cssText = `
        width: 18px;
        height: 24px;
        border: none;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
        cursor: pointer;
        line-height: 1;
        font-size: ${fontSize}px;
        padding: 0;
        direction: ltr !important;
        unicode-bidi: isolate !important;
        text-align: center;
      `;
      button.addEventListener("mouseenter", () => {
        button.style.background = "rgba(255, 255, 255, 0.22)";
      });
      button.addEventListener("mouseleave", () => {
        button.style.background = "rgba(255, 255, 255, 0.14)";
      });
      return button;
    };

    const minusButton = createStepButton("-", 16);
    minusButton.style.gridColumn = "1 / 2";
    minusButton.style.gridRow = "2 / 3";

    const plusButton = createStepButton("+", 15);
    plusButton.style.gridColumn = "3 / 4";
    plusButton.style.gridRow = "2 / 3";

    const resetButton = createStepButton("\u21BA", 11);
    resetButton.title = "Reset to 0";
    resetButton.style.gridColumn = "3 / 4";
    resetButton.style.gridRow = "1 / 2";
    resetButton.style.justifySelf = "center";
    resetButton.style.alignSelf = "center";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(TIMING_MIN);
    slider.max = String(TIMING_MAX);
    slider.step = String(TIMING_STEP);
    slider.value = "0";
    slider.style.cssText = `
      width: 100%;
      margin: 0;
    `;

    const sliderWrap = document.createElement("div");
    sliderWrap.style.cssText = `
      grid-column: 2 / 3;
      grid-row: 2 / 3;
      width: 100%;
      display: flex;
      flex-direction: row;
      align-items: center;
      direction: ltr !important;
      unicode-bidi: isolate !important;
    `;
    sliderWrap.appendChild(slider);

    layout.appendChild(title);
    layout.appendChild(resetButton);
    layout.appendChild(minusButton);
    layout.appendChild(sliderWrap);
    layout.appendChild(plusButton);
    layout.appendChild(valueLabel);
    item.appendChild(layout);

    let disposed = false;
    let activeVideoId = "";
    let activeTimingSourceKey = "youtube_default";
    let timingOffsetEventRafId = null;
    let pendingTimingOffsetEvent = null;
    let queuedTimingOffsetPersist = null;
    let timingOffsetPersistPromise = null;
    let refreshSeq = 0;

    const flushTimingOffsetEvent = () => {
      timingOffsetEventRafId = null;
      if (!pendingTimingOffsetEvent || disposed) return;

      window.dispatchEvent(
        new CustomEvent("yc:subtitleTimingOffsetChanged", {
          detail: pendingTimingOffsetEvent,
        })
      );
      pendingTimingOffsetEvent = null;
    };

    const queueTimingOffsetEvent = (offsetValue) => {
      pendingTimingOffsetEvent = {
        videoId: activeVideoId || null,
        sourceKey: activeTimingSourceKey,
        offset: offsetValue,
        source,
      };

      if (timingOffsetEventRafId !== null) return;
      timingOffsetEventRafId = requestAnimationFrame(flushTimingOffsetEvent);
    };

    const applyTimingOffsetLive = (value, emitEvent = true) => {
      if (disposed) return 0;

      const nextValue = clampTimingValue(value);
      slider.value = String(nextValue);
      valueLabel.textContent = formatTimingValue(nextValue);
      item.dataset.videoId = activeVideoId || "";
      item.dataset.sourceKey = activeTimingSourceKey || "";
      item.dataset.offset = String(nextValue);

      if (window.subtitleState) {
        window.subtitleState.timing_offset = nextValue;
        window.subtitleState.timingSourceKey = activeTimingSourceKey;
      }

      if (emitEvent) queueTimingOffsetEvent(nextValue);
      return nextValue;
    };

    const captureTimingOffsetPersist = (value = slider.value) => {
      if (!activeVideoId || !activeTimingSourceKey || !window.databaseManager?.setSubtitleOffset) {
        return null;
      }

      return {
        videoId: activeVideoId,
        sourceKey: activeTimingSourceKey,
        value: clampTimingValue(value),
      };
    };

    const saveTimingOffsetSnapshot = async (snapshot) => {
      if (!snapshot || disposed) return;

      try {
        const result = await window.databaseManager.setSubtitleOffset(
          snapshot.videoId,
          snapshot.sourceKey,
          snapshot.value
        );

        const stillCurrentSource =
          !disposed &&
          activeVideoId === snapshot.videoId &&
          activeTimingSourceKey === snapshot.sourceKey &&
          clampTimingValue(slider.value) === snapshot.value;

        if (stillCurrentSource && result?.success && Number.isFinite(result.value)) {
          applyTimingOffsetLive(result.value, false);
        }
      } catch (error) {
        console.warn(`[${ownerName}] Failed to persist subtitle timing offset:`, error);
      }
    };

    const drainTimingOffsetPersistQueue = () => {
      if (timingOffsetPersistPromise) return timingOffsetPersistPromise;

      timingOffsetPersistPromise = (async () => {
        try {
          while (queuedTimingOffsetPersist && !disposed) {
            const snapshot = queuedTimingOffsetPersist;
            queuedTimingOffsetPersist = null;
            await saveTimingOffsetSnapshot(snapshot);
          }
        } finally {
          timingOffsetPersistPromise = null;
          if (queuedTimingOffsetPersist && !disposed) {
            drainTimingOffsetPersistQueue();
          }
        }
      })();

      return timingOffsetPersistPromise;
    };

    const persistTimingOffset = (value = slider.value) => {
      const snapshot = captureTimingOffsetPersist(value);
      if (!snapshot) return Promise.resolve();

      queuedTimingOffsetPersist = snapshot;
      return drainTimingOffsetPersistQueue();
    };

    const refresh = async () => {
      const seq = ++refreshSeq;
      const context = await resolveActiveTimingContext(ownerName);
      if (disposed || seq !== refreshSeq) return context;

      activeVideoId = context.videoId || "";
      activeTimingSourceKey = context.sourceKey || "youtube_default";
      applyTimingOffsetLive(context.offset || 0, false);
      return context;
    };

    slider.addEventListener("input", () => {
      applyTimingOffsetLive(slider.value);
      persistTimingOffset(slider.value);
    });
    slider.addEventListener("change", () => {
      persistTimingOffset(slider.value);
    });

    minusButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      applyTimingOffsetLive(Number(slider.value) - TIMING_STEP);
      await persistTimingOffset();
    });

    plusButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      applyTimingOffsetLive(Number(slider.value) + TIMING_STEP);
      await persistTimingOffset();
    });

    resetButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      applyTimingOffsetLive(0);
      await persistTimingOffset();
    });

    item.addEventListener("mouseover", () => {
      item.style.backgroundColor = "rgba(255,255,255,0.1)";
    });
    item.addEventListener("mouseout", () => {
      item.style.backgroundColor = "transparent";
    });

    const onExternalTimingOffset = (event) => {
      const detail = event?.detail || {};
      if (!detail || detail.source === source) return;

      const eventVideoId = detail.videoId || "";
      if (eventVideoId && activeVideoId && eventVideoId !== activeVideoId) return;

      const eventSourceKey = detail.sourceKey || "";
      if (eventSourceKey && activeTimingSourceKey && eventSourceKey !== activeTimingSourceKey) {
        return;
      }

      applyTimingOffsetLive(detail.offset || 0, false);
    };

    const onStorageChanged = (changes, areaName) => {
      if (
        areaName !== "local" ||
        !(
          changes.aiTranscriptionMode ||
          changes.showTranslation ||
          changes.alwaysAllowYoutubeFallback
        )
      ) {
        return;
      }

      refresh().catch((error) => {
        console.warn(`[${ownerName}] Failed refreshing subtitle offset control:`, error);
      });
    };

    window.addEventListener("yc:subtitleTimingOffsetChanged", onExternalTimingOffset);
    chrome.storage.onChanged.addListener(onStorageChanged);

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      window.removeEventListener("yc:subtitleTimingOffsetChanged", onExternalTimingOffset);
      chrome.storage.onChanged.removeListener(onStorageChanged);
      if (timingOffsetEventRafId !== null) {
        cancelAnimationFrame(timingOffsetEventRafId);
        timingOffsetEventRafId = null;
      }
      pendingTimingOffsetEvent = null;
      queuedTimingOffsetPersist = null;
    };

    refresh().catch((error) => {
      console.warn(`[${ownerName}] Failed initializing subtitle offset control:`, error);
    });

    return {
      element: item,
      refresh,
      dispose,
      applyTimingOffsetLive,
      setValue: async (value) => {
        applyTimingOffsetLive(value);
        await persistTimingOffset();
      },
    };
  };

  return {
    TIMING_MIN,
    TIMING_MAX,
    TIMING_STEP,
    formatTimingValue,
    clampTimingValue,
    resolveActiveTimingContext,
    createControl,
  };
})();

// אובייקט שירותים גלובלי
window.ycUtils = {
  // פונקציות חילוץ וולידציה
  extractVideoId,

  // פונקציות רשת
  fetchWithTimeout,

  // פונקציות תצוגה
  showErrorOverlay,
  showDebugOverlay,
  showToast,
  showGeminiErrorModal,
  showGeminiApiKeyPrompt,
  showLongVideoConfirmModal,
  subtitleOffsetControls: window.ycSubtitleOffsetControls,

  // פונקציית אתחול - תיקרא לאחר טעינת כל המודולים
  init() {
    // הפונקציות כבר מוגדרות ישירות במודול זה
    // אין צורך להגדיר אותן מחדש
    console.log('[YC-Utils] Initialization complete');
  }
};

// הוספת מאזין לטעינת העמוד כדי לאתחל את המודולים
document.addEventListener('DOMContentLoaded', () => {
  // המתן שנייה להבטיח שכל המודולים נטענו
  setTimeout(() => {
    window.ycUtils.init();
    console.log('[YC-Utils] Initialization complete');
  }, 1000);
});

console.log("[YC-Utils] Utilities module loaded");
