/*==============================================================================
  YouChords – content.js  (Clean-SPA Hybrid • 03-May-2025, refactored)
  ------------------------------------------------------------------------------
  ▸ שומר על הכפתורים המקוריים (Settings / Subtitle / Chords)
  ▸ overlay Hybrid cleanup  – videoCtl + overlayCtl + partialCleanup
  ▸ injectButtons() אינו משנה HTML/CSS – רק מוסיף מאזין חדש אם חסר
  ▸ כל הערות # בעברית מסבירות את הלוגיקה
==============================================================================*/

/* -- הבטחת DEBUG גלובלי לפני כל IIFE -- */
window.DEBUG = false;
window.__YC_LOCAL_ONLY__ = true;

/*==============================================================================
  ID-System: local DeviceID only
  ------------------------------------------------------------------------------
  ▸ DeviceID: מזהה רנדומלי ייחודי לכל התקנת תוסף/פרופיל
  ▸ Paid device verification runs only through you-chords.com/verify on signup
==============================================================================*/

// הגדרת מפתחות
const DID_KEY = 'youchords_device_id';
const DEVICE_FINGERPRINT_KEY = 'youchords_device_fingerprint';
const DEVICE_PROOF_KEY = 'youchords_device_proof';
const CONSENT_VERSION = '2026-02-17';
const CONSENT_STORAGE_KEY = 'youchords_consent';

async function ensureYcDeviceId(stored = null) {
  const data = stored || await chrome.storage.local.get([DID_KEY]);
  if (data[DID_KEY]) return data[DID_KEY];

  const newDeviceId = 'did_' + crypto.randomUUID();
  await chrome.storage.local.set({ [DID_KEY]: newDeviceId });
  if (window.DEBUG) console.log('[ID-System] New DeviceID created:', newDeviceId);
  return newDeviceId;
}

(async () => {
  if (window.top !== window) return;
  if (window.__ycIdentificationGenerated) return;
  window.__ycIdentificationGenerated = true;

  try {
    const stored = await chrome.storage.local.get([DID_KEY]);
    await ensureYcDeviceId(stored);
    window.dispatchEvent(new CustomEvent('yc_ids_ready'));
  } catch (e) {
    console.error('[ID-System] Critical Error:', e);
  }
})();

// פונקציית עזר לשימוש בשאר חלקי האפליקציה (כמו ב-auth.js)
window.getYcIdentifiers = async function () {
  const data = await chrome.storage.local.get([DID_KEY, DEVICE_FINGERPRINT_KEY, DEVICE_PROOF_KEY]);
  const deviceId = data[DID_KEY] || await ensureYcDeviceId(data);
  return {
    fingerprint: typeof data[DEVICE_FINGERPRINT_KEY] === 'string' && data[DEVICE_FINGERPRINT_KEY].trim()
      ? data[DEVICE_FINGERPRINT_KEY].trim()
      : null,
    deviceProof: typeof data[DEVICE_PROOF_KEY] === 'string' && data[DEVICE_PROOF_KEY].trim()
      ? data[DEVICE_PROOF_KEY].trim()
      : null,
    deviceId
  };
};

/*==============================================================================
  JWT Cache (secure on YouTube): keep JWT in chrome.storage + memory cache only
==============================================================================*/
const YC_JWT_KEY = 'youchords_jwt';
const YC_UPGRADE_PENDING_KEY = 'youchords_upgrade_pending';
const YC_UPGRADE_PENDING_TTL_MS = 45 * 60 * 1000;
window.__ycJwtCache = null;
window.__ycJwtCacheReady = false;

function setYcJwtCache(jwt) {
  window.__ycJwtCache = (typeof jwt === 'string' && jwt.length > 0) ? jwt : null;
  window.__ycJwtCacheReady = true;
}

window.__ycGetCachedJwt = function () {
  if (window.__YC_LOCAL_ONLY__) return 'youchords-local';
  return window.__ycJwtCache || null;
};

window.__ycGetJwtAsync = async function () {
  if (window.__YC_LOCAL_ONLY__) return 'youchords-local';
  if (window.__ycJwtCacheReady) return window.__ycJwtCache || null;
  const result = await chrome.storage.local.get([YC_JWT_KEY]);
  const jwt = result[YC_JWT_KEY] || null;
  setYcJwtCache(jwt);
  return jwt;
};

window.__ycSetJwt = async function (jwt) {
  const cleanJwt = (typeof jwt === 'string' && jwt.length > 0) ? jwt : null;
  setYcJwtCache(cleanJwt);
  if (cleanJwt) {
    await chrome.storage.local.set({ [YC_JWT_KEY]: cleanJwt });
  } else {
    await chrome.storage.local.remove([YC_JWT_KEY]);
  }
};

window.__ycMarkUpgradePending = function (source = 'content_upgrade') {
  const now = Date.now();
  chrome.storage.local.set({
    [YC_UPGRADE_PENDING_KEY]: {
      active: true,
      source,
      markedAt: now,
      expiresAt: now + YC_UPGRADE_PENDING_TTL_MS,
      lastAttemptAt: 0
    }
  }).catch((error) => {
    console.warn('[Upgrade] Failed to mark upgrade pending:', error);
  });
};

window.__ycOpenUpgradePage = function (preferredUrl = null, source = 'content_upgrade') {
  const upgradeUrl = window.__ycBuildUpgradeUrl
    ? window.__ycBuildUpgradeUrl(preferredUrl)
    : ((typeof preferredUrl === 'string' && preferredUrl.trim()) ? preferredUrl : 'https://www.you-chords.com/upgrade');
  window.__ycMarkUpgradePending?.(source);
  window.open(upgradeUrl, '_blank');
};

window.__ycBuildUpgradeUrl = function (preferredUrl = null) {
  const fallbackUrl = 'https://www.you-chords.com/upgrade';
  const rawUrl = (typeof preferredUrl === 'string' && preferredUrl.trim()) ? preferredUrl : fallbackUrl;
  const jwt = window.__ycGetCachedJwt?.();
  if (!jwt) return rawUrl;

  try {
    const url = new URL(rawUrl);
    const hostname = String(url.hostname || '').toLowerCase();
    const isYouChordsUpgrade =
      (hostname === 'you-chords.com' || hostname === 'www.you-chords.com') &&
      url.pathname.replace(/\/+$/g, '') === '/upgrade';
    if (isYouChordsUpgrade && !url.searchParams.has('jwt')) {
      url.searchParams.set('jwt', jwt);
    }
    return url.toString();
  } catch (_) {
    return rawUrl;
  }
};

// One-time bootstrap: load secure JWT cache and remove any legacy JWT from localStorage.
(async () => {
  try {
    const storageData = await chrome.storage.local.get([YC_JWT_KEY]);
    const storageJwt = storageData[YC_JWT_KEY] || null;
    setYcJwtCache(storageJwt);
    if (localStorage.getItem(YC_JWT_KEY)) {
      localStorage.removeItem(YC_JWT_KEY);
    }
  } catch (e) {
    console.warn('[JWT-Cache] Failed to initialize cache:', e);
    setYcJwtCache(null);
  }
})();

/*==============================================================================
  YC-Status Handler: זיהוי redirect אחרי תשלום/מחיקה
  ------------------------------------------------------------------------------
  ▸ מזהה ?yc_status=success או ?yc_status=deleted ב-URL
  ▸ אם יש JWT ב-URL (אחרי תשלום) - שומר ישירות (חוסך קריאה לשרת)
  ▸ אחרת שולח הודעה ל-background.js לרענן/למחוק JWT
  ▸ מנקה את הפרמטרים מה-URL
==============================================================================*/
(async () => {
  if (window.top !== window) return;
  if (window.__ycStatusHandled) return;
  window.__ycStatusHandled = true;

  try {
    const params = new URLSearchParams(window.location.search);
    const ycStatus = params.get('yc_status');

    if (ycStatus) {
      console.log('[YC-Status] Detected status:', ycStatus);

      // Security: never trust JWT from URL.
      // Always trigger secure refresh/cleanup through background.
      chrome.runtime.sendMessage({
        action: 'ycStatusChange',
        status: ycStatus
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[YC-Status] Error sending message:', chrome.runtime.lastError);
        } else {
          console.log('[YC-Status] Background response:', response);
        }
      });

      // נקה את הפרמטרים מה-URL (בלי refresh)
      params.delete('yc_status');
      params.delete('jwt');
      const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
      window.history.replaceState({}, '', newUrl);

      // הצג הודעה למשתמש
      if (ycStatus === 'success') {
        console.log('[YC-Status] Payment successful! JWT updated.');
      } else if (ycStatus === 'deleted') {
        console.log('[YC-Status] Account deleted. Logging out.');
      } else if (ycStatus === 'cancelled') {
        console.log('[YC-Status] Subscription cancelled. JWT will be refreshed.');
      } else if (ycStatus === 'resumed') {
        console.log('[YC-Status] Subscription resumed. JWT will be refreshed.');
      }
    }
  } catch (e) {
    console.error('[YC-Status] Error:', e);
  }
})();

/*==============================================================================
  Silent Sync: מאזין לשינויים ב-chrome.storage
  ------------------------------------------------------------------------------
  ▸ כשה-JWT משתנה, כל הטאבים מתעדכנים אוטומטית
  ▸ לא צריך לשלוח הודעות ידנית לכל טאב
==============================================================================*/
let ycHarmonyMapRequestVersion = 0;

function applyHarmonyMapPreference(enabled) {
  const requestVersion = ++ycHarmonyMapRequestVersion;
  if (enabled !== true || window.extensionDisabled === true) {
    window.ycHarmonyMap?.setEnabled(false);
    return;
  }

  void (async () => {
    try {
      if (!window.ycHarmonyMap) await window.dynamicLoader?.loadGroup?.('harmonyMap');
      if (requestVersion !== ycHarmonyMapRequestVersion) return;
      await window.ycHarmonyMap?.setEnabled(true);
    } catch (error) {
      console.error('[HarmonyMap] Could not initialize the chord map:', error);
    }
  })();
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.harmonyMapEnabled) {
    applyHarmonyMapPreference(changes.harmonyMapEnabled.newValue === true);
  }

  if (namespace === 'local' && changes.youchords_jwt) {
    const newJwt = changes.youchords_jwt.newValue;
    const oldJwt = changes.youchords_jwt.oldValue;

    if (newJwt !== oldJwt) {
      console.log('[Silent-Sync] JWT changed, updating local state...');

      setYcJwtCache(newJwt || null);

      // Load auth only when a token actually changes, so downgrade/delete cleanup
      // still runs while fresh YouTube tabs stay light until user action.
      (async () => {
        try {
          if (!window.ycAuth?.checkForProDowngrade && window.dynamicLoader?.ensureAuthLoaded) {
            await window.dynamicLoader.ensureAuthLoaded();
          }

          if (window.ycAuth?.checkForProDowngrade) {
            console.log('[Silent-Sync] Calling checkForProDowngrade...');
            await window.ycAuth.checkForProDowngrade(oldJwt, newJwt);
          } else {
            console.warn('[Silent-Sync] ycAuth.checkForProDowngrade not available');
          }
        } catch (error) {
          console.warn('[Silent-Sync] Failed to run downgrade check:', error);
        }
      })();

      // שלח אירוע לעדכון ה-UI
      window.dispatchEvent(new CustomEvent('yc_jwt_updated', { detail: { jwt: newJwt } }));
    }
  }
});

/*==============================================================================
  Ram-Guard – שומר זיכרון גלובלי (25-May-2025)
  ------------------------------------------------------------------------------
  ▸ בודק צריכת זיכרון כל 60±10 שניות
  ▸ מפעיל ניקוי קל (SOFT) או מלא (HARD) לפי רף
  ▸ מונע התנגשות עם GC של כרום ע"י jitter
  ▸ תומך בכל הדפדפנים (Chrome, Edge, Firefox) עם fallback מתאים
==============================================================================*/
(() => {
  // בדיקה אם כבר הותקן - למניעת התקנה כפולה (במקרה של BF-cache)
  if (window.__ycRamGuard) return;

  // אל תרוץ בתוך iframes
  if (window.top !== window) return;

  window.__ycRamGuard = true;
  if (DEBUG) console.log('[Ram-Guard] Initializing memory monitor...');

  // פונקציית עזר לקבלת גודל הזיכרון הנוכחי במגה-בייטים
  async function getJsBytes() {
    try {
      // נסיון 1: navigator.storage.estimate()
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        if (estimate && estimate.usageDetails && estimate.usageDetails.javascript) {
          return Math.round(estimate.usageDetails.javascript / 1e6);
        }
      }

      // נסיון 2: performance.measureUserAgentSpecificMemory()
      if (performance.measureUserAgentSpecificMemory) {
        const result = await performance.measureUserAgentSpecificMemory();
        if (result && result.bytes) {
          return Math.round(result.bytes / 1e6);
        }
      }

      // נסיון 3: performance.memory
      if (performance.memory) {
        return Math.round(performance.memory.usedJSHeapSize / 1e6);
      }
    } catch (e) {
      console.warn('[Ram-Guard] Error measuring memory:', e);
    }

    // אם כל הנסיונות נכשלו
    return 0;
  }

  // הגדרת ספי התראה
  const SOFT_LIMIT_MB = 700;  // סף "רך" - ניקוי קל
  const HARD_LIMIT_MB = 1024; // סף "קשיח" - ניקוי מלא

  // משתנה לשמירת זמן ההסתרה האחרון
  let hiddenSince = null;

  // פונקציית בדיקת זיכרון
  async function checkMemory() {
    // Ram-Guard – דלג אם התוסף כבוי
    if (window.extensionDisabled) return;
    // אם הטאב מוסתר יותר מ-5 דקות, דלג על הבדיקה
    if (document.visibilityState === 'hidden') {
      if (!hiddenSince) {
        hiddenSince = Date.now();
      } else if (Date.now() - hiddenSince > 5 * 60 * 1000) {
        if (DEBUG) console.log('[Ram-Guard] Tab hidden for 5+ minutes, skipping memory check');
        return;
      }
    } else {
      hiddenSince = null;
    }

    const memoryMB = await getJsBytes();

    // אם אין נתוני זיכרון, לא עושים כלום
    if (!memoryMB) return;

    if (DEBUG) console.log(`[Ram-Guard] Memory usage: ${memoryMB}MB`);

    if (memoryMB >= HARD_LIMIT_MB) {
      if (DEBUG) console.warn(`[Ram-Guard] Memory exceeds HARD limit (${HARD_LIMIT_MB}MB). Performing full cleanup...`);

      // ניקוי מלא
      window.fullCleanup?.();
      resetYcSessionPrewarmRuntime('ram-guard-hard-cleanup');
      window.dynamicLoader?.clearCache?.();

      // 🔥 FIX #8: Lower threshold from 100 to 50 for more aggressive cleanup
      const wordSpans = document.querySelectorAll('.yt-subtitle-word, .yt-subtitle-space, .regular-subtitle-word, .regular-subtitle-space');
      if (wordSpans.length > 50) { // Lowered from 100 to 50
        wordSpans.forEach(span => {
          if (!span.closest('.yt-subtitle-overlay, .chords-backdrop')) {
            span.remove();
          }
        });
        if (DEBUG) console.log(`[Ram-Guard] Cleaned up ${wordSpans.length} word and space spans`);
      }

    } else if (memoryMB >= SOFT_LIMIT_MB) {
      if (DEBUG) console.log(`[Ram-Guard] Memory exceeds SOFT limit (${SOFT_LIMIT_MB}MB). Performing partial cleanup...`);

      // ניקוי חלקי
      window.chordsDisplay?.forceMemoryCleanup?.();
      window.chordRenderer?.clearUnusedCache?.();
      window.periodicCleanup?.();

      // 🔥 FIX #8: Lower threshold from 50 to 30 for orphan spans
      const orphanSpans = document.querySelectorAll('.yt-subtitle-word:not(.highlighted):not(.past-word), .regular-subtitle-word:not(.highlighted):not(.past-word)');
      if (orphanSpans.length > 30) { // Lowered from 50 to 30
        orphanSpans.forEach(span => {
          if (!span.textContent || span.textContent.trim() === '') {
            span.remove();
          }
        });
        if (DEBUG) console.log(`[Ram-Guard] Cleaned up ${orphanSpans.length} orphan spans`);
      }
    }
  }

  // הפעלת בדיקת זיכרון תקופתית עם jitter קטן למניעת התנגשות עם GC של כרום
  function startMemoryMonitor() {
    function scheduleNextCheck() {
      // jitter של 10± שניות סביב 60 שניות
      const jitter = Math.floor(Math.random() * 20) - 10;
      const interval = (60 + jitter) * 1000;

      setTimeout(() => {
        checkMemory().finally(scheduleNextCheck);
      }, interval);
    }

    // בדיקה ראשונית אחרי 30 שניות
    setTimeout(() => {
      checkMemory().finally(scheduleNextCheck);
    }, 30000);
  }

  // מאזין לשינויי visibility
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // כשהטאב חוזר להיות גלוי אחרי הסתרה ארוכה, בצע בדיקת זיכרון
      if (hiddenSince && Date.now() - hiddenSince > 5 * 60 * 1000) {
        if (DEBUG) console.log('[Ram-Guard] Tab visible again after long hidden period, checking memory');
        checkMemory();
      }
      hiddenSince = null;
    } else {
      hiddenSince = Date.now();
    }
  }, { passive: true });

  // התחלת המוניטור
  startMemoryMonitor();
})();
(() => {

  /*───────────────────────────────────────────────────────────────────────────┐
  │ 0. כלי-עזר בסיסיים                                                       │
  └───────────────────────────────────────────────────────────────────────────*/
  const DEBUG = false;
  window.DEBUG = DEBUG;
  window.subtitleObservers = window.subtitleObservers || [];
  window.buttonsEnabled = window.buttonsEnabled || { chords: true, subtitle: true, customSubtitle: true, lyricsChords: true, tuner: true, chordExplorer: true };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = sel => document.querySelector(sel);
  const extractVideoId = window.ycUtils?.extractVideoId || ((url) => {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.includes('youtube.com') && urlObj.pathname.startsWith('/watch')) {
        return urlObj.searchParams.get('v');
      }
    } catch (e) { /* ignore */ }
    return null;
  });

  function extractJsonObjectFromText(text, marker) {
    const markerIndex = String(text || '').indexOf(marker);
    if (markerIndex < 0) return null;

    const startIndex = text.indexOf('{', markerIndex + marker.length);
    if (startIndex < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = startIndex; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(startIndex, i + 1));
          } catch (_) {
            return null;
          }
        }
      }
    }

    return null;
  }

  function isPlayerResponseForVideo(playerResponse, videoId) {
    const responseVideoId = playerResponse?.videoDetails?.videoId || playerResponse?.videoDetails?.video_id;
    return !responseVideoId || responseVideoId === videoId;
  }

  function getYouTubePlayerResponseSnapshot(videoId) {
    if (
      (window.ytInitialPlayerResponse?.videoDetails || window.ytInitialPlayerResponse?.playabilityStatus) &&
      isPlayerResponseForVideo(window.ytInitialPlayerResponse, videoId)
    ) {
      return window.ytInitialPlayerResponse;
    }

    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';
      if (!text.includes('ytInitialPlayerResponse')) continue;

      const parsed =
        extractJsonObjectFromText(text, 'ytInitialPlayerResponse =') ||
        extractJsonObjectFromText(text, 'ytInitialPlayerResponse=');
      if ((parsed?.videoDetails || parsed?.playabilityStatus) && isPlayerResponseForVideo(parsed, videoId)) {
        return parsed;
      }
    }

    return null;
  }

  function isVisibleElement(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getClearYouTubeLiveBlockReason() {
    const videoId = extractVideoId(location.href);
    if (!videoId || isTutorialDemoVideo(videoId)) return null;

    const playerResponse = getYouTubePlayerResponseSnapshot(videoId);
    const videoDetails = playerResponse?.videoDetails || {};
    const playability = playerResponse?.playabilityStatus || {};
    const microformat = playerResponse?.microformat?.playerMicroformatRenderer || {};
    const liveDetails = microformat?.liveBroadcastDetails || {};
    const playabilityMessages = Array.isArray(playability.messages) ? playability.messages.join(' ') : '';
    const statusText = `${playability.status || ''} ${playability.reason || ''} ${playabilityMessages}`.toLowerCase();

    if (
      videoDetails.isLive === true ||
      videoDetails.isLiveNow === true ||
      liveDetails.isLiveNow === true
    ) {
      return {
        code: 'live_active',
        message: 'Live streams are not supported while they are live. Please try again after the stream becomes a regular video.'
      };
    }

    if (
      statusText.includes('live_stream_offline') ||
      statusText.includes('will begin') ||
      statusText.includes('scheduled') ||
      statusText.includes('upcoming') ||
      statusText.includes('premiere')
    ) {
      return {
        code: 'live_upcoming',
        message: 'Upcoming live videos and premieres are not supported before they start.'
      };
    }

    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    const player = document.querySelector('#movie_player, .html5-video-player');
    const liveBadge = player?.querySelector('.ytp-live-badge');
    const isLiveBadgeVisible = isVisibleElement(liveBadge) && String(liveBadge.textContent || '').toLowerCase().includes('live');
    if (
      (video && (!Number.isFinite(Number(video.duration)) || Number(video.duration) === Infinity)) ||
      (player?.classList.contains('ytp-live') && isLiveBadgeVisible)
    ) {
      return {
        code: 'live_active',
        message: 'Live streams are not supported while they are live. Please try again after the stream becomes a regular video.'
      };
    }

    const watchFlexy = document.querySelector('ytd-watch-flexy');
    if (
      watchFlexy?.hasAttribute('is-upcoming') ||
      watchFlexy?.hasAttribute('is-premiere') ||
      watchFlexy?.hasAttribute('is-live-stream-offline')
    ) {
      return {
        code: 'live_upcoming',
        message: 'Upcoming live videos and premieres are not supported before they start.'
      };
    }

    return null;
  }

  function blockClearYouTubeLiveVideoIfNeeded(source = 'unknown') {
    const blockReason = getClearYouTubeLiveBlockReason();
    if (!blockReason) return null;

    console.log('[YouChords] Blocking clear live/upcoming video in extension:', {
      source,
      code: blockReason.code
    });

    if (window.ycUtils?.showToast) {
      window.ycUtils.showToast(blockReason.message, '⚠️', 4500);
    } else {
      alert(blockReason.message);
    }

    return blockReason;
  }

  function getActiveYouTubeAdBlockReason(options = {}) {
    const includeTutorialDemo = !!options?.includeTutorialDemo;
    const videoId = extractVideoId(location.href);
    if (!videoId || (!includeTutorialDemo && isTutorialDemoVideo(videoId))) return null;

    const player = document.querySelector('#movie_player, .html5-video-player');
    if (!player) return null;

    const hasAdClass =
      player.classList.contains('ad-showing') ||
      player.classList.contains('ad-interrupting') ||
      player.classList.contains('ytp-ad-player-overlay-layout');

    const adSelectors = [
      '.ytp-ad-player-overlay',
      '.ytp-ad-module',
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      '.ytp-ad-preview-container',
      '.ytp-ad-text',
      '.ytp-ad-simple-ad-badge',
      '.video-ads'
    ];
    const hasVisibleAdUi = adSelectors.some(selector => {
      const el = player.querySelector(selector);
      return isVisibleElement(el);
    });

    if (!hasAdClass && !hasVisibleAdUi) return null;

    return {
      code: 'youtube_ad_active',
      message: 'Please wait until the YouTube ad finishes, then try YouChords again.'
    };
  }

  function blockYouTubeAdIfNeeded(source = 'unknown') {
    const blockReason = getActiveYouTubeAdBlockReason();
    if (!blockReason) return null;

    console.log('[YouChords] Blocking feature action during YouTube ad:', {
      source,
      code: blockReason.code
    });

    if (window.ycUtils?.showToast) {
      const player = document.querySelector('#movie_player, .html5-video-player');
      window.ycUtils.showToast(blockReason.message, '⚠️', 4200, {
        anchorElement: player
      });
    } else {
      alert(blockReason.message);
    }

    return blockReason;
  }

  window.__ycGetClearYouTubeLiveBlockReason = getClearYouTubeLiveBlockReason;
  window.__ycBlockClearLiveVideoIfNeeded = blockClearYouTubeLiveVideoIfNeeded;
  window.__ycGetActiveYouTubeAdBlockReason = getActiveYouTubeAdBlockReason;
  window.__ycBlockYouTubeAdIfNeeded = blockYouTubeAdIfNeeded;

  async function ensureYcAuthLoadedForAction(context = 'action') {
    if (!window.ycAuth) {
      if (!window.dynamicLoader?.ensureAuthLoaded) {
        throw new Error('dynamicLoader.ensureAuthLoaded is not available');
      }
      console.log(`[content.js] Loading auth on demand for ${context}...`);
      await window.dynamicLoader.ensureAuthLoaded();
    }
    await window.ycAuth?.waitForAuthCache?.();
    return !!window.ycAuth;
  }

  const YC_BUTTONS_TOUR_STORAGE_KEY = 'yc_buttons_tour_seen_v1';
  const YC_POPUP_TOUR_PENDING_STORAGE_KEY = 'yc_popup_tour_pending_v1';
  const YC_POPUP_TOUR_STEPS_COUNT = 5;
  const YC_TUTORIAL_DEMO_VIDEO_ID = 'H5JIpZPSmfU';
  const YC_TUTORIAL_DEMO_CHORDS_PATH = 'data/chords_H5JIpZPSmfU.json.gz';
  const YC_TUTORIAL_DEMO_SUBTITLES_PATH = 'data/subtitles_H5JIpZPSmfU.txt';
  const YC_TOUR_POSITION_CONTROL_ATTR = 'data-yc-tour-position-control-forced';
  const YC_TOUR_DEMO_ONLY_TEXT = 'Interactive demo actions run only on the tutorial video, so the tour never spends credits or starts processing on regular videos.';
  const buttonsTourState = {
    active: false,
    steps: [],
    index: 0,
    overlay: null,
    highlight: null,
    cursor: null,
    activeTargetEl: null,
    compositeTargetEl: null,
    focusEl: null,
    focusSelector: null,
    card: null,
    title: null,
    description: null,
    counter: null,
    prevBtn: null,
    nextBtn: null,
    cleanupFns: [],
    positionTimerId: null,
    actionTimerIds: new Set(),
    actionWaiters: new Set(),
    manualContinueWaiter: null,
    manualAdvanceQueue: 0,
    manualStepAdvanceRequested: false,
    pendingStepExitAction: null,
    advancingStep: false,
    advanceImmediatelyAfterStep: false,
    actionToken: 0,
    openedSurfaces: new Set(),
    activeMainKey: null,
    mainStepsCount: 0,
    mode: null,
    speed: 5,
    stepRunning: false,
    stepComplete: false,
    modeChoice: null,
    manualModeBtn: null,
    autoModeBtn: null,
    videoModeBtn: null,
    speedRange: null,
    speedLabel: null,
    modeSwitchBtn: null,
    pausedVideoEl: null,
    panelRestoreState: null,
    carouselRestoreState: null,
    scrollLockCleanup: null,
    scrollLockPosition: null
  };
  let buttonsTourScheduleTimer = null;
  let buttonsTourCheckInFlight = false;
  let tutorialDemoChordsLoadPromise = null;
  let tutorialDemoSubtitlesLoadPromise = null;
  const YC_BUTTONS_TOUR_AD_RETRY_MS = 1200;

  function isTutorialDemoVideo(videoId = extractVideoId(location.href)) {
    return videoId === YC_TUTORIAL_DEMO_VIDEO_ID;
  }

  window.__ycTutorialDemoVideoId = YC_TUTORIAL_DEMO_VIDEO_ID;
  window.__ycIsTutorialDemoVideo = isTutorialDemoVideo;

  async function ensureTutorialDemoChords(videoId = extractVideoId(location.href)) {
    if (!isTutorialDemoVideo(videoId)) return null;

    if (tutorialDemoChordsLoadPromise) {
      return tutorialDemoChordsLoadPromise;
    }

    tutorialDemoChordsLoadPromise = (async () => {
      if (window.dynamicLoader?.ensureDatabaseManagerLoaded) {
        await window.dynamicLoader.ensureDatabaseManagerLoaded();
      } else if (window.dynamicLoader?.loadGroup) {
        await window.dynamicLoader.loadGroup('shared');
      }

      if (!window.databaseManager?.loadFromDatabase || !window.databaseManager?.saveToDatabase) {
        throw new Error('databaseManager is not available for tutorial demo chords');
      }

      const existing = await window.databaseManager.loadFromDatabase('chords', videoId);
      if (existing?.chordText?.trim?.() || existing?.chordText?.regular?.trim?.()) {
        return existing;
      }

      const response = await fetch(chrome.runtime.getURL(YC_TUTORIAL_DEMO_CHORDS_PATH));
      if (!response.ok) {
        throw new Error(`Failed to load tutorial demo chords (${response.status})`);
      }
      const payloadBytes = await response.arrayBuffer();
      const isGzipPayload = new Uint8Array(payloadBytes, 0, Math.min(2, payloadBytes.byteLength));
      let rawText;
      if (isGzipPayload[0] === 0x1f && isGzipPayload[1] === 0x8b) {
        if (typeof DecompressionStream !== 'function') {
          throw new Error('Gzip decompression is not available in this browser');
        }
        const decompressedStream = new Blob([payloadBytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        rawText = await new Response(decompressedStream).text();
      } else {
        rawText = new TextDecoder('utf-8').decode(payloadBytes);
      }
      const rawData = JSON.parse(rawText);
      const dataToSave = {
        videoId,
        chordText: rawData.regular || rawData.chordText || '',
        chordTextRegularPlus: rawData.regularPlus || rawData.chordTextRegularPlus || rawData.regular || rawData.chordText || '',
        chordTextHarmonic: rawData.harmonic || rawData.chordTextHarmonic || rawData.regular || rawData.chordText || '',
        chordTextHarmonicPlus: rawData.harmonicPlus || rawData.chordTextHarmonicPlus || rawData.harmonic || rawData.regular || rawData.chordText || '',
        chordEngineVersion: rawData.chordEngineVersion || rawData.engineVersion || null,
        tuningValue: rawData.tuning || rawData.tuningValue || '0',
        hasNonStandardTuning: rawData.hasNonStandardTuning || false,
        capoChords: rawData.capoChords || null,
        chordPositions: rawData.chordPositions || null,
        offset: 0,
        timestamp: Date.now(),
        source: 'tutorial_demo'
      };

      await window.databaseManager.saveToDatabase('chords', videoId, dataToSave);
      return dataToSave;
    })().then(result => {
      tutorialDemoChordsLoadPromise = null;
      return result;
    }).catch(error => {
      tutorialDemoChordsLoadPromise = null;
      throw error;
    });

    return tutorialDemoChordsLoadPromise;
  }

  window.__ycEnsureTutorialDemoChords = ensureTutorialDemoChords;

  function parseTutorialDemoSrt(srtText) {
    const normalized = String(srtText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!normalized) return [];

    let blocks = normalized.split(/\n\s*\n/);
    if (blocks.length <= 1 && normalized.includes('-->')) {
      blocks = normalized.split(
        /\n(?=\d+\n\d{1,2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2},\d{3})/
      );
    }

    const parseTime = (timeStr) => {
      const match = String(timeStr || '').match(/^(\d{1,2}):(\d{2}):(\d{2}),(\d{3})$/);
      if (!match) return null;
      const [, h, m, s, ms] = match;
      return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
    };

    return blocks.map((block) => {
      const lines = block.trim().split('\n');
      const timeLineIndex = lines.findIndex(line => line.includes('-->'));
      if (timeLineIndex === -1 || lines.length <= timeLineIndex + 1) return null;

      const timeMatch = lines[timeLineIndex].match(
        /(\d{1,2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2},\d{3})/
      );
      if (!timeMatch) return null;

      const start = parseTime(timeMatch[1]);
      const end = parseTime(timeMatch[2]);
      const text = lines.slice(timeLineIndex + 1).join(' ').trim();
      if (!text || start === null || end === null || end <= start) return null;

      return { start, end, text };
    }).filter(Boolean);
  }

  function formatTutorialDemoSrtTime(seconds) {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = Math.floor(safeSeconds % 60);
    const milliseconds = Math.floor((safeSeconds % 1) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
  }

  function cleanTutorialDemoSubtitleText(text) {
    return String(text || '').replace(/ +([,.!?;:])/g, '$1').trim();
  }

  function buildTutorialDemoSentenceSubtitles(entries) {
    const groups = [];
    let current = [];
    let currentText = '';
    const maxLength = 41;
    const maxWords = 6;
    const maxGap = 0.5;

    const pushCurrent = () => {
      if (!current.length) return;
      const text = cleanTutorialDemoSubtitleText(current.map(item => item.text).join(' '));
      if (!text) {
        current = [];
        currentText = '';
        return;
      }
      groups.push({
        startTime: current[0].start,
        endTime: current[current.length - 1].end,
        text
      });
      current = [];
      currentText = '';
    };

    for (const entry of entries) {
      const previous = current[current.length - 1];
      if (previous && entry.start - previous.end > maxGap) {
        pushCurrent();
      }

      const nextText = cleanTutorialDemoSubtitleText(currentText ? `${currentText} ${entry.text}` : entry.text);
      if (
        current.length > 0 &&
        (nextText.length > maxLength || current.length + 1 > maxWords)
      ) {
        pushCurrent();
      }

      current.push(entry);
      currentText = cleanTutorialDemoSubtitleText(currentText ? `${currentText} ${entry.text}` : entry.text);

      if (/[.!?]$/.test(entry.text)) {
        pushCurrent();
      }
    }
    pushCurrent();

    const sentenceSRT = groups.map((group, index) => (
      `${index + 1}\n${formatTutorialDemoSrtTime(group.startTime)} --> ${formatTutorialDemoSrtTime(group.endTime)}\n${group.text}\n`
    )).join('\n');

    return {
      sentenceSRT,
      originalSentences: groups
    };
  }

  async function ensureTutorialDemoSubtitles(videoId = extractVideoId(location.href)) {
    if (!isTutorialDemoVideo(videoId)) return null;

    if (tutorialDemoSubtitlesLoadPromise) {
      return tutorialDemoSubtitlesLoadPromise;
    }

    tutorialDemoSubtitlesLoadPromise = (async () => {
      if (window.dynamicLoader?.ensureDatabaseManagerLoaded) {
        await window.dynamicLoader.ensureDatabaseManagerLoaded();
      } else if (window.dynamicLoader?.loadGroup) {
        await window.dynamicLoader.loadGroup('shared');
      }

      if (!window.databaseManager?.loadFromDatabase || !window.databaseManager?.saveToDatabase) {
        throw new Error('databaseManager is not available for tutorial demo subtitles');
      }

      const existing = await window.databaseManager.loadFromDatabase('subtitles', videoId);
      if (existing?.source === 'tutorial_demo' && existing?.sentenceSRT?.trim?.()) {
        return existing;
      }

      const response = await fetch(chrome.runtime.getURL(YC_TUTORIAL_DEMO_SUBTITLES_PATH));
      if (!response.ok) {
        throw new Error(`Failed to load tutorial demo subtitles (${response.status})`);
      }

      const sentenceSRT = String(await response.text() || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim();
      const sentenceEntries = parseTutorialDemoSrt(sentenceSRT);
      if (!sentenceEntries.length) {
        throw new Error('Tutorial demo subtitles SRT has no valid subtitle entries');
      }

      const originalSentences = sentenceEntries.map(entry => ({
        startTime: entry.start,
        endTime: entry.end,
        text: entry.text
      }));
      const dataToSave = {
        videoId,
        sentenceSRT,
        wordSRT: null,
        originalSentences,
        geminiSentenceSRT: sentenceSRT,
        geminiOriginalSentences: originalSentences,
        timestamp: Date.now(),
        source: 'tutorial_demo',
        languageCode: 'en',
        languageName: 'English',
        isAutoGenerated: false,
        hasWordLevel: false,
        hasSubtitles: true
      };

      await window.databaseManager.saveToDatabase('subtitles', videoId, dataToSave);
      window.dispatchEvent(new CustomEvent('yc:subtitlesUpdated', {
        detail: { videoId, hasDefault: true, hasTranslation: false, hasCustom: false }
      }));
      return dataToSave;
    })().then(result => {
      tutorialDemoSubtitlesLoadPromise = null;
      return result;
    }).catch(error => {
      tutorialDemoSubtitlesLoadPromise = null;
      throw error;
    });

    return tutorialDemoSubtitlesLoadPromise;
  }

  window.__ycEnsureTutorialDemoSubtitles = ensureTutorialDemoSubtitles;

  function isElementVisibleForTour(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
      rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  function wakeYouTubeControlsForTour() {
    const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
    if (!player) return;
    try {
      player.classList.remove('ytp-autohide');
      const evt = new MouseEvent('mousemove', { bubbles: true, cancelable: true });
      player.dispatchEvent(evt);
    } catch (e) {
      if (DEBUG) console.warn('[Tour] Failed to wake controls:', e);
    }
  }

  function setButtonsTourControlsForced(force) {
    const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
    if (!player) return;
    if (force) {
      player.classList.add('yc-tour-force-controls');
      player.classList.remove('ytp-autohide');
      return;
    }
    player.classList.remove('yc-tour-force-controls');
  }

  function getButtonsTourVideoElement() {
    return document.querySelector('video.html5-main-video') || document.querySelector('#movie_player video') || document.querySelector('video');
  }

  function getButtonsTourPlayerRect() {
    const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player') || document.querySelector('video');
    const rect = player?.getBoundingClientRect?.();
    if (!rect ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.bottom <= 0 ||
      rect.right <= 0 ||
      rect.top >= window.innerHeight ||
      rect.left >= window.innerWidth) {
      return null;
    }
    return rect;
  }

  function unlockButtonsTourPageScroll() {
    if (typeof buttonsTourState.scrollLockCleanup === 'function') {
      try { buttonsTourState.scrollLockCleanup(); } catch (e) { }
    }
    buttonsTourState.scrollLockCleanup = null;
    buttonsTourState.scrollLockPosition = null;
  }

  function keepButtonsTourPageScrollLocked() {
    const lock = buttonsTourState.scrollLockPosition;
    if (!buttonsTourState.active || !lock) return;

    const currentX = window.scrollX || window.pageXOffset || 0;
    const currentY = window.scrollY || window.pageYOffset || 0;
    if (Math.abs(currentX - lock.x) > 1 || Math.abs(currentY - lock.y) > 1) {
      window.scrollTo(lock.x, lock.y);
    }
  }

  function lockButtonsTourPageScrollToVideo() {
    unlockButtonsTourPageScroll();

    const currentScrollX = window.scrollX || window.pageXOffset || 0;
    const currentScrollY = window.scrollY || window.pageYOffset || 0;
    const root = document.documentElement;
    const body = document.body;
    const scrollKeys = new Set([' ', 'PageDown', 'PageUp', 'End', 'Home', 'ArrowDown', 'ArrowUp']);
    const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player') || document.querySelector('video');
    const playerRect = player?.getBoundingClientRect?.();
    let lockedScrollY = currentScrollY;
    let scrollLockFrameId = null;

    if (playerRect?.height > 0) {
      const playerTop = currentScrollY + playerRect.top;
      if (playerRect.top < 8 || playerRect.bottom > window.innerHeight - 8) {
        lockedScrollY = Math.max(0, Math.round(playerTop - 8));
      }
    }

    buttonsTourState.scrollLockPosition = {
      x: currentScrollX,
      y: lockedScrollY
    };
    keepButtonsTourPageScrollLocked();

    const preventTourPageScroll = event => {
      if (!buttonsTourState.active) return;
      event.preventDefault();
      keepButtonsTourPageScrollLocked();
    };

    const preventTourScrollKeys = event => {
      if (!buttonsTourState.active || !scrollKeys.has(event.key)) return;
      const target = event.target;
      if (
        target &&
        (
          target.closest?.('#yc-buttons-tour-card input, #yc-buttons-tour-card button') ||
          target.closest?.('#yc-buttons-tour-mode-switch')
        )
      ) {
        return;
      }
      event.preventDefault();
      keepButtonsTourPageScrollLocked();
    };

    const keepTourAnchoredOnScroll = () => {
      keepButtonsTourPageScrollLocked();
      if (scrollLockFrameId !== null) return;
      scrollLockFrameId = requestAnimationFrame(() => {
        scrollLockFrameId = null;
        if (buttonsTourState.active) {
          positionButtonsTour();
        }
      });
    };

    root?.classList.add('yc-buttons-tour-scroll-lock');
    body?.classList.add('yc-buttons-tour-scroll-lock');
    window.addEventListener('wheel', preventTourPageScroll, { passive: false, capture: true });
    window.addEventListener('touchmove', preventTourPageScroll, { passive: false, capture: true });
    window.addEventListener('keydown', preventTourScrollKeys, { capture: true });
    window.addEventListener('scroll', keepTourAnchoredOnScroll, { passive: true });

    buttonsTourState.scrollLockCleanup = () => {
      if (scrollLockFrameId !== null) {
        cancelAnimationFrame(scrollLockFrameId);
        scrollLockFrameId = null;
      }
      root?.classList.remove('yc-buttons-tour-scroll-lock');
      body?.classList.remove('yc-buttons-tour-scroll-lock');
      window.removeEventListener('wheel', preventTourPageScroll, true);
      window.removeEventListener('touchmove', preventTourPageScroll, true);
      window.removeEventListener('keydown', preventTourScrollKeys, true);
      window.removeEventListener('scroll', keepTourAnchoredOnScroll);
    };
  }

  function pauseButtonsTourVideo() {
    const video = getButtonsTourVideoElement();
    if (!video) return;
    buttonsTourState.pausedVideoEl = video;
    if (!video.paused) {
      try { video.pause(); } catch (e) { }
    }
  }

  function updateButtonsTourModeUi() {
    if (buttonsTourState.card) {
      buttonsTourState.card.classList.toggle('yc-tour-auto-active', buttonsTourState.mode === 'auto');
    }

    const switchBtn = buttonsTourState.modeSwitchBtn;
    if (!switchBtn) return;
    if (!buttonsTourState.active || !buttonsTourState.mode) {
      switchBtn.style.display = 'none';
      return;
    }

    switchBtn.textContent = buttonsTourState.mode === 'auto' ? 'Switch to Manual' : 'Switch to Auto';
    switchBtn.style.display = 'block';
    const playerRect = getButtonsTourPlayerRect();
    const btnRect = switchBtn.getBoundingClientRect();
    const viewportPad = 12;
    const controlsReserve = playerRect ? 60 : viewportPad;
    const left = playerRect ? playerRect.left + 12 : viewportPad;
    const bottom = playerRect ? playerRect.bottom - controlsReserve : window.innerHeight - viewportPad;
    const top = bottom - btnRect.height;
    switchBtn.style.left = `${Math.round(left)}px`;
    switchBtn.style.top = `${Math.round(clamp(top, viewportPad, window.innerHeight - btnRect.height - viewportPad))}px`;
  }

  function setButtonsTourCarouselControlsLocked(lock) {
    document
      .querySelectorAll('.html5-video-player')
      .forEach(player => {
        player.classList.toggle('yc-carousel-controls-locked', Boolean(lock));
        player.classList.toggle('yc-tour-carousel-hover', Boolean(lock));
      });
    document
      .querySelectorAll('.yc-root-wrapper')
      .forEach(wrapper => wrapper.classList.toggle('yc-tour-carousel-hover', Boolean(lock)));
    setButtonsTourCarouselPositionControlsForced(Boolean(lock));
  }

  function captureButtonsTourCarouselRestoreState() {
    return {
      diceActive: window.DiceIcon?.isActive ? Boolean(window.DiceIcon.isActive()) : null,
      capoActive: window.CapoIcon?.isActive ? Boolean(window.CapoIcon.isActive('carousel')) : null,
      capoFret: window.CapoIcon?.getFret ? Number(window.CapoIcon.getFret('carousel')) : null,
      mode: window.chordsMode || 'regular'
    };
  }

  function restoreButtonsTourCarouselState() {
    const state = buttonsTourState.carouselRestoreState;
    if (!state) return;

    try {
      if (
        Number.isFinite(state.capoFret) &&
        window.CapoIcon?.setFret &&
        Number(window.CapoIcon.getFret?.('carousel')) !== state.capoFret
      ) {
        window.CapoIcon.setFret('carousel', state.capoFret);
      }
    } catch (e) { }

    try {
      if (
        typeof state.capoActive === 'boolean' &&
        window.CapoIcon?.isActive &&
        window.CapoIcon?.toggle &&
        Boolean(window.CapoIcon.isActive('carousel')) !== state.capoActive
      ) {
        window.CapoIcon.toggle('carousel');
      }
    } catch (e) { }

    try {
      if (
        typeof state.diceActive === 'boolean' &&
        window.DiceIcon?.isActive &&
        window.DiceIcon?.toggle &&
        Boolean(window.DiceIcon.isActive()) !== state.diceActive
      ) {
        window.DiceIcon.toggle();
      }
    } catch (e) { }

    try {
      const normalizeMode = window.ycChordCarousel?._normalizeModeValue;
      const previousMode = normalizeMode ? normalizeMode(state.mode) : state.mode;
      const currentMode = normalizeMode ? normalizeMode(window.chordsMode || 'regular') : (window.chordsMode || 'regular');
      if (previousMode && previousMode !== currentMode && window.ycChordCarousel?._setChordMode) {
        window.ycChordCarousel._setChordMode(previousMode);
      } else if (previousMode && previousMode !== currentMode) {
        const labels = { regular: 'R', regularPlus: 'R+', harmonic: 'H', harmonicPlus: 'H+' };
        const label = labels[previousMode];
        const btn = Array.from(document.querySelectorAll('.yc-carousel-mode-btn'))
          .find(modeBtn => (modeBtn.textContent || '').trim() === label);
        btn?.click?.();
      }
    } catch (e) { }

    buttonsTourState.carouselRestoreState = null;
  }

  function closeButtonsTourCapoDropdown() {
    if (!document.querySelector('.yc-capo-dropdown')) return;
    try {
      document.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      }));
    } catch (e) { }
  }

  function setButtonsTourCarouselPositionControlsForced(force) {
    const selector = [
      '.yc-chord-carousel .chord-arrows-counter',
      '.yc-chord-carousel .global-position-globe',
      '.yc-chord-carousel .chord-arrow-left',
      '.yc-chord-carousel .chord-arrow-right',
      '.yc-chord-carousel .chord-position-counter'
    ].join(', ');
    const cleanupSelector = `[${YC_TOUR_POSITION_CONTROL_ATTR}="1"]`;
    const controls = document.querySelectorAll(force ? selector : cleanupSelector);

    controls.forEach(control => {
      if (!control?.style) return;
      if (force) {
        if (control.getAttribute(YC_TOUR_POSITION_CONTROL_ATTR) === '1') return;
        control.setAttribute(YC_TOUR_POSITION_CONTROL_ATTR, '1');
        control.style.setProperty('opacity', '1', 'important');
        control.style.setProperty('visibility', 'visible', 'important');
        control.style.setProperty('display', 'inline', 'important');
        control.style.setProperty('fill-opacity', '1', 'important');
        control.style.setProperty('stroke-opacity', '1', 'important');
        control.style.setProperty('pointer-events', 'auto', 'important');
        return;
      }
      control.removeAttribute(YC_TOUR_POSITION_CONTROL_ATTR);
      control.style.removeProperty('opacity');
      control.style.removeProperty('visibility');
      control.style.removeProperty('display');
      control.style.removeProperty('fill-opacity');
      control.style.removeProperty('stroke-opacity');
      control.style.removeProperty('pointer-events');
    });
  }

  function getButtonsTourStepDefs() {
    return [
      {
        key: 'carousel',
        selector: '[data-btn="chords"] .ytp-chords-button, .ytp-chords-button',
        title: 'Chords Carousel',
        description: 'Starts chord extraction and opens the chord carousel.'
      },
      {
        key: 'panel',
        selector: '[data-btn="lyricsChords"] .ytp-lyrics-chords-button, .ytp-lyrics-chords-button',
        title: 'Subtitles & Chords Panel',
        description: 'Opens the panel with synced subtitles/transcription and chords.'
      },
      {
        key: 'subtitles',
        selector: '[data-btn="subtitle"] .ytp-subtitle-button, .ytp-subtitle-button',
        title: 'Subtitles',
        description: 'Shows subtitle-only overlay on the video.'
      },
      {
        key: 'explorer',
        selector: '[data-btn="chordExplorer"] .ytp-chord-explorer-button, .ytp-chord-explorer-button',
        title: 'Chord Explorer',
        description: 'Browse chord diagrams and voicings quickly.'
      },
      {
        key: 'tuner',
        selector: '[data-btn="tuner"] .ytp-tuner-button, .ytp-tuner-button',
        title: 'Guitar Tuner',
        description: 'Opens the built-in tuner for fast tuning.'
      },
      {
        key: 'settings',
        selector: '[data-btn="settings"] .settings-button, .settings-button',
        title: 'Settings',
        description: 'Customize modes, display, AI options, maintenance tools, and more.'
      }
    ];
  }

  function collectAvailableButtonsTourSteps() {
    wakeYouTubeControlsForTour();
    const defs = getButtonsTourStepDefs();
    return defs
      .map(step => {
        const el = document.querySelector(step.selector);
        if (!isElementVisibleForTour(el)) return null;
        const rect = el.getBoundingClientRect();
        return { ...step, __left: rect.left, __top: rect.top };
      })
      .filter(Boolean)
      .sort((a, b) => (a.__left - b.__left) || (a.__top - b.__top))
      .map(({ __left, __top, ...step }) => step);
  }

  function getButtonsTourSubStepDefs(mainKey) {
    const defs = {
      carousel: [
        { key: 'open', title: 'Chords Carousel', description: 'The carousel shows each song chord as a card over the video so you can follow and switch positions while playing.' },
        { key: 'card', title: 'Chord Card', description: 'Each card shows the current chord, timing, diagram, and quick edit actions.' },
        { key: 'leftArrow', title: 'Previous Position', description: 'The left arrow moves back through alternate positions for the current chord.' },
        { key: 'rightArrow', title: 'Next Position', description: 'The right arrow moves forward through alternate positions for the same chord.' },
        { key: 'positionCounter', title: 'Preferred Position', description: 'Clicking the position number saves that chord voicing globally, so the same chord can keep this position across all songs.' },
        { key: 'capo', title: 'Capo', description: 'Capo toggles the carousel chord names into the selected capo position.' },
        { key: 'capoNumber', title: 'Capo Number', description: 'The capo number opens fret choices so users can pick the capo fret.' },
        { key: 'dice', title: 'Random Positions', description: 'The dice can randomize chord positions for users who want fresh voicings.' },
        { key: 'edit', title: 'Edit', description: 'Edit lets users change a detected chord without reprocessing the video.' },
        { key: 'time', title: 'TIME', description: 'TIME adjusts when this chord appears if it is early, late, too short, or too long.' },
        { key: 'remove', title: 'Remove', description: 'X removes a wrong chord from the current song arrangement.' },
        { key: 'info', title: 'Info', description: 'Info summarizes the song chords and the chord vocabulary used in this video.' },
        { key: 'edits', title: 'Edits Summary', description: 'The pencil shows saved edits and quick-chord changes for the current song.' },
        { key: 'size', title: 'A Size Control', description: 'A opens quick size controls for the carousel and subtitle text.' },
        { key: 'displayOptions', title: 'Display Options', description: 'Display Options opens diagram controls for quick chords, fret numbers, and subtitle offset.' },
        { key: 'modeRegular', title: 'Mode R', description: 'R keeps the primary chord detection mode active.' },
        { key: 'modeRegularPlus', title: 'Mode R+', description: 'R+ switches to the previous regular interpretation for comparison.' },
        { key: 'modeHarmonic', title: 'Mode H', description: 'H switches the carousel to the harmonic chord interpretation.' },
        { key: 'modeHarmonicPlus', title: 'Mode H+', description: 'H+ shows the expanded harmonic mode when users want richer chord options. The tour returns to R before continuing.' },
        { key: 'close', title: 'Close Carousel', description: 'The tour restores temporary Capo/Dice changes and closes the carousel.' }
      ],
      panel: [
        { key: 'open', title: 'Subtitles & Chords Panel', description: 'Shows synced subtitles and chords in a side panel; Preview keeps chord diagrams visible beside it.' },
        { key: 'header', title: 'Panel Controls', description: 'The header controls text size, panel width, MINI mode, preview, and close.' },
        { key: 'textSize', title: 'Text Size', description: 'Text size controls make the lyrics easier to read without changing the video.' },
        { key: 'panelWidth', title: 'Panel Width', description: 'Panel width controls how much room the lyrics panel uses beside the video.' },
        { key: 'mini', title: 'MINI', description: 'MINI keeps the panel compact.' },
        { key: 'sync', title: 'Sync With YouTube', description: 'Sync keeps the panel aligned with the YouTube playback time.' },
        { key: 'countdown', title: 'Countdown', description: 'Countdown gives a short lead-in before the next lyric or chord moment.' },
        { key: 'sentence', title: 'Sentence Mode', description: 'Sentence Mode groups text by punctuation for a cleaner reading flow.' },
        { key: 'language', title: 'Language', description: 'Language changes the panel text direction and language display when available.' },
        { key: 'autoScroll', title: 'Auto Scroll', description: 'Auto Scroll lets the panel follow the song hands-free.' },
        { key: 'scrollSpeed', title: 'Scroll Speed', description: 'Scroll speed controls how fast the panel moves when Auto Scroll is on.' },
        { key: 'theme', title: 'Theme', description: 'Theme switches the panel between the available visual styles.' },
        { key: 'lyrics', title: 'Synced Lyrics', description: 'The main panel follows the video with synchronized text and chord previews.' },
        { key: 'previewToggle', title: 'Preview Toggle', description: 'Preview opens a separate chord-diagram panel beside the main lyrics panel.' },
        { key: 'previewPanel', title: 'Preview Panel', description: 'This panel keeps chord diagrams visible while the main panel handles synced lyrics and controls.' },
        { key: 'restoreMini', title: 'Close Expanded Controls', description: 'Click MINI again to close the expanded controls.' },
        { key: 'close', title: 'Panel Ready', description: 'Subtitles are now cached, so the subtitle-only button can reuse them later in the tour.' }
      ],
      subtitles: [
        { key: 'open', title: 'Subtitles', description: 'Shows subtitles from YouTube locally when available, or from Gemini when an API key is set.' },
        { key: 'overlay', title: 'Subtitle Overlay', description: 'Subtitle-only mode keeps the synced text on top of the video.' },
        { key: 'close', title: 'Close Subtitles', description: 'The same button hides the subtitle-only overlay.' }
      ],
      explorer: [
        { key: 'open', title: 'Chord Explorer', description: 'Search any chord and inspect all available voicings.' },
        { key: 'search', title: 'Search C7', description: "Example search: type C7 to find that chord's shapes and positions." },
        { key: 'positions', title: 'C7 Positions', description: 'Explorer shows multiple C7 shapes, with page arrows and fret-number options.' },
        { key: 'close', title: 'Close Explorer', description: 'Closing the explorer clears its temporary search state.' }
      ],
      tuner: [
        { key: 'open', title: 'Guitar Tuner', description: 'Tune your guitar directly inside YouTube before playing along.' },
        { key: 'close', title: 'Close Tuner', description: 'The X closes the tuner and releases its microphone/audio listeners.' }
      ],
      settings: [
        { key: 'open', title: 'Settings', description: 'Settings contains the chord behavior controls used most often during playback.' },
        { key: 'chordsMode', title: 'Chords Mode', description: 'Choose R, R+, H, or H+ chord modes from here.' },
        { key: 'quickChords', title: 'Quick Chords', description: 'Quick Chords hides very short passing chords when you want a cleaner view.' },
        { key: 'threshold', title: 'Quick Chords Threshold', description: 'Threshold decides how short a chord must be before it is treated as quick.' },
        { key: 'fretNumbers', title: 'Fret Number', description: 'Fret Numbers controls extra fret labels on chord diagrams.' },
        { key: 'close', title: 'Close Settings', description: 'The settings menu stays open through these items, then closes at the end.' }
      ]
    };
    return defs[mainKey] || [{ key: 'intro' }];
  }

  function expandButtonsTourSteps(mainSteps) {
    return mainSteps.flatMap((mainStep, mainIndex) => {
      const subSteps = getButtonsTourSubStepDefs(mainStep.key);
      return subSteps.map((subStep, subIndex) => ({
        ...mainStep,
        key: `${mainStep.key}:${subStep.key}`,
        mainKey: mainStep.key,
        mainTitle: mainStep.title,
        mainDescription: mainStep.description,
        subKey: subStep.key,
        actionKey: `${mainStep.key}:${subStep.key}`,
        title: subStep.title || mainStep.title,
        description: subStep.description || mainStep.description,
        mainIndex,
        mainTotal: mainSteps.length,
        subIndex,
        subTotal: subSteps.length
      }));
    });
  }

  function ensureButtonsTourStyle() {
    if (document.getElementById('yc-buttons-tour-style')) return;
    const style = document.createElement('style');
    style.id = 'yc-buttons-tour-style';
    style.textContent = `
      #yc-buttons-tour-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        background: transparent;
        touch-action: none;
        overscroll-behavior: none;
      }
      html.yc-buttons-tour-scroll-lock,
      body.yc-buttons-tour-scroll-lock {
        overflow: hidden !important;
        overscroll-behavior: none !important;
      }
      #yc-buttons-tour-highlight {
        position: fixed;
        border: 0;
        border-radius: 10px;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.58);
        pointer-events: none;
        z-index: 2147483647;
        transition: left 180ms ease, top 180ms ease, width 180ms ease, height 180ms ease;
      }
      #yc-buttons-tour-cursor {
        position: fixed;
        left: 24px;
        top: 24px;
        width: 34px;
        height: 34px;
        transform: translate3d(0, 0, 0);
        transition: left 420ms cubic-bezier(.22, .9, .25, 1), top 420ms cubic-bezier(.22, .9, .25, 1), transform 120ms ease;
        pointer-events: none;
        z-index: 2147483647;
        filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.55));
      }
      #yc-buttons-tour-cursor svg {
        width: 100%;
        height: 100%;
        display: block;
      }
      #yc-buttons-tour-cursor.yc-tour-cursor-clicking {
        transform: translate3d(0, 0, 0) scale(0.88);
      }
      #yc-buttons-tour-cursor .yc-tour-click-ring {
        position: absolute;
        left: 12px;
        top: 10px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        border: 2px solid rgba(62, 166, 255, 0.95);
        opacity: 0;
        transform: scale(0.5);
      }
      #yc-buttons-tour-cursor.yc-tour-cursor-clicking .yc-tour-click-ring {
        animation: ycTourClickRing 260ms ease-out;
      }
      @keyframes ycTourClickRing {
        0% { opacity: 0.9; transform: scale(0.4); }
        100% { opacity: 0; transform: scale(2.6); }
      }
      .yc-tour-target-active {
        filter: none !important;
        backdrop-filter: none !important;
        opacity: 1 !important;
        outline: 2px solid #3ea6ff !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 4px rgba(62, 166, 255, 0.22) !important;
      }
      #yc-buttons-tour-composite-target {
        position: fixed;
        pointer-events: none;
        z-index: 2147483647;
        background: transparent;
      }
      #yc-buttons-tour-card {
        position: fixed;
        width: min(340px, calc(100vw - 24px));
        min-height: 108px;
        color: #fff;
        background: rgba(12, 12, 12, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
        padding: 12px;
        z-index: 2147483647;
        font-family: Arial, sans-serif;
        display: flex;
        flex-direction: column;
      }
      #yc-buttons-tour-card h4 {
        margin: 0 0 8px 0;
        font-size: 15px;
        line-height: 1.3;
      }
      #yc-buttons-tour-card p {
        margin: 0;
        font-size: 13px;
        line-height: 1.4;
        color: #ddd;
      }
      .yc-tour-footer {
        margin-top: auto;
        padding-top: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .yc-tour-mode-choice {
        display: none;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 12px;
      }
      #yc-buttons-tour-card.yc-tour-choice-active .yc-tour-mode-choice {
        display: grid;
      }
      #yc-buttons-tour-card.yc-tour-choice-active {
        width: min(430px, calc(100vw - 24px));
        min-height: 150px;
        text-align: center;
        transform: translate(-50%, -50%);
      }
      #yc-buttons-tour-card.yc-tour-auto-active {
        min-height: 160px;
      }
      #yc-buttons-tour-card.yc-tour-choice-active .yc-tour-footer {
        justify-content: center;
      }
      .yc-tour-speed {
        display: none;
        margin-top: 12px;
        padding: 8px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.08);
      }
      #yc-buttons-tour-card.yc-tour-auto-active .yc-tour-speed {
        display: block;
      }
      .yc-tour-speed-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
        font-size: 12px;
        color: #ddd;
      }
      .yc-tour-speed-value {
        color: #3ea6ff;
        font-weight: 700;
      }
      .yc-tour-speed input[type="range"] {
        width: 100%;
        accent-color: #3ea6ff;
        cursor: pointer;
      }
      #yc-buttons-tour-mode-switch {
        position: fixed;
        display: none;
        z-index: 2147483647;
        border: 1px solid rgba(255, 255, 255, 0.24);
        border-radius: 8px;
        background: rgba(12, 12, 12, 0.92);
        color: #fff;
        padding: 7px 10px;
        font-family: Arial, sans-serif;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.35);
      }
      .html5-video-player.yc-tour-carousel-hover .yc-carousel-info-btn,
      .html5-video-player.yc-tour-carousel-hover .yc-carousel-edits-btn,
      .html5-video-player.yc-tour-carousel-hover .yc-carousel-size-btn,
      .html5-video-player.yc-tour-carousel-hover .yc-carousel-options-btn,
      .html5-video-player.yc-tour-carousel-hover .yc-carousel-mode-switch,
      .html5-video-player.ytp-autohide.yc-tour-carousel-hover .yc-carousel-info-btn,
      .html5-video-player.ytp-autohide.yc-tour-carousel-hover .yc-carousel-edits-btn,
      .html5-video-player.ytp-autohide.yc-tour-carousel-hover .yc-carousel-size-btn,
      .html5-video-player.ytp-autohide.yc-tour-carousel-hover .yc-carousel-options-btn,
      .html5-video-player.ytp-autohide.yc-tour-carousel-hover .yc-carousel-mode-switch,
      .html5-video-player.yc-tour-carousel-hover .yc-dice-carousel,
      .html5-video-player.yc-tour-carousel-hover .yc-capo-carousel,
      .html5-video-player.yc-tour-carousel-hover .yc-capo-icon,
      .html5-video-player.yc-tour-carousel-hover .yc-capo-fret-number,
      .yc-root-wrapper.yc-tour-carousel-hover .yc-dice-carousel,
      .yc-root-wrapper.yc-tour-carousel-hover .yc-capo-carousel,
      .yc-root-wrapper.yc-tour-carousel-hover .yc-capo-icon,
      .yc-root-wrapper.yc-tour-carousel-hover .yc-capo-fret-number,
      .html5-video-player.ytp-autohide.yc-tour-carousel-hover .yc-dice-carousel,
      .html5-video-player.ytp-autohide.yc-tour-carousel-hover .yc-capo-carousel,
      .html5-video-player.ytp-autohide.yc-tour-carousel-hover .yc-capo-icon,
      .html5-video-player.ytp-autohide.yc-tour-carousel-hover .yc-capo-fret-number {
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
      }
      .html5-video-player.yc-tour-carousel-hover .yc-chord-actions {
        opacity: 1 !important;
        pointer-events: auto !important;
      }
      body.yc-timeline-always-visible .html5-video-player.yc-tour-carousel-hover .chord-arrows-counter,
      body.yc-timeline-always-visible .html5-video-player.yc-tour-carousel-hover .global-position-globe,
      body:not(.yc-timeline-always-visible) .html5-video-player.yc-tour-carousel-hover .chord-arrows-counter,
      body:not(.yc-timeline-always-visible) .html5-video-player.yc-tour-carousel-hover .global-position-globe,
      body:not(.yc-timeline-always-visible) .html5-video-player.ytp-autohide.yc-tour-carousel-hover .chord-arrows-counter,
      body:not(.yc-timeline-always-visible) .html5-video-player.ytp-autohide.yc-tour-carousel-hover .global-position-globe,
      .html5-video-player.yc-tour-carousel-hover .chord-arrows-counter,
      .html5-video-player.yc-tour-carousel-hover .global-position-globe,
      .html5-video-player.yc-tour-carousel-hover .chord-arrow-left,
      .html5-video-player.yc-tour-carousel-hover .chord-arrow-right,
      .html5-video-player.yc-tour-carousel-hover .chord-position-counter,
      .html5-video-player.yc-tour-carousel-hover .global-position-globe {
        opacity: 1 !important;
        visibility: visible !important;
        display: inline !important;
        fill-opacity: 1 !important;
        stroke-opacity: 1 !important;
        pointer-events: auto !important;
      }
      .yc-tour-counter {
        font-size: 12px;
        color: #aaa;
      }
      .yc-tour-actions {
        display: flex;
        gap: 6px;
      }
      .yc-tour-btn {
        border: 0;
        border-radius: 8px;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .yc-tour-btn-ghost {
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
      }
      .yc-tour-btn-primary {
        background: #3ea6ff;
        color: #041321;
      }
      .yc-tour-btn-wide {
        width: 100%;
        padding: 8px 10px;
      }
      .yc-tour-btn:disabled {
        opacity: 0.45;
        cursor: default;
      }
      #movie_player.yc-tour-force-controls .ytp-chrome-bottom,
      #movie_player.yc-tour-force-controls.ytp-autohide .ytp-chrome-bottom {
        opacity: 1 !important;
        transform: translateY(0) !important;
      }
      #movie_player.yc-tour-force-controls .ytp-gradient-bottom,
      #movie_player.yc-tour-force-controls.ytp-autohide .ytp-gradient-bottom {
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function getButtonsTourSeen() {
    return new Promise(resolve => {
      chrome.storage.local.get([YC_BUTTONS_TOUR_STORAGE_KEY], result => {
        const value = result?.[YC_BUTTONS_TOUR_STORAGE_KEY];
        if (value === true) {
          resolve(true);
          return;
        }
        resolve(!!(value && value.seen === true));
      });
    });
  }

  function setButtonsTourSeen() {
    chrome.storage.local.set({
      [YC_BUTTONS_TOUR_STORAGE_KEY]: {
        seen: true,
        seenAt: Date.now(),
        version: 1
      }
    });
  }

  function clearButtonsTourSchedule() {
    if (!buttonsTourScheduleTimer) return;
    clearTimeout(buttonsTourScheduleTimer);
    buttonsTourScheduleTimer = null;
  }

  function clearButtonsTourActionTimers() {
    buttonsTourState.actionTimerIds.forEach(id => clearTimeout(id));
    buttonsTourState.actionTimerIds.clear();
    buttonsTourState.actionWaiters.forEach(waiter => {
      try { waiter.reject(new DOMException('Tour step cancelled', 'AbortError')); } catch (e) { }
    });
    buttonsTourState.actionWaiters.clear();
    if (buttonsTourState.manualContinueWaiter) {
      try {
        buttonsTourState.manualContinueWaiter.reject(new DOMException('Tour step cancelled', 'AbortError'));
      } catch (e) { }
      buttonsTourState.manualContinueWaiter = null;
    }
  }

  function setButtonsTourTimeout(fn, delay) {
    const id = setTimeout(() => {
      buttonsTourState.actionTimerIds.delete(id);
      fn();
    }, delay);
    buttonsTourState.actionTimerIds.add(id);
    return id;
  }

  function waitButtonsTour(ms, token = buttonsTourState.actionToken) {
    return new Promise((resolve, reject) => {
      const waiter = { reject };
      const id = setButtonsTourTimeout(() => {
        buttonsTourState.actionWaiters.delete(waiter);
        resolve();
      }, ms);
      waiter.id = id;
      buttonsTourState.actionWaiters.add(waiter);
    }).then(() => {
      if (!buttonsTourState.active || token !== buttonsTourState.actionToken) {
        throw new DOMException('Tour step cancelled', 'AbortError');
      }
    });
  }

  function getButtonsTourSpeedMultiplier() {
    const value = Number(buttonsTourState.speed) || 2;
    const multipliers = {
      1: 2.8,
      2: 2.15,
      3: 1.55,
      4: 1,
      5: 0.65
    };
    return multipliers[value] || multipliers[2];
  }

  function getButtonsTourPacedMs(ms) {
    if (buttonsTourState.mode === 'manual') return Math.max(60, Math.round(ms * 0.45));
    return Math.max(120, Math.round(ms * getButtonsTourSpeedMultiplier()));
  }

  function waitButtonsTourPaced(ms, token = buttonsTourState.actionToken) {
    return waitButtonsTour(getButtonsTourPacedMs(ms), token);
  }

  function getButtonsTourSpeedLabel() {
    const labels = {
      1: 'Very slow',
      2: 'Calm',
      3: 'Normal',
      4: 'Fast',
      5: 'Very fast'
    };
    return labels[Number(buttonsTourState.speed)] || labels[2];
  }

  function updateButtonsTourSpeedUi() {
    if (buttonsTourState.speedRange) {
      buttonsTourState.speedRange.value = String(buttonsTourState.speed);
    }
    if (buttonsTourState.speedLabel) {
      buttonsTourState.speedLabel.textContent = getButtonsTourSpeedLabel();
    }
  }

  function waitButtonsTourManualContinue(token = buttonsTourState.actionToken) {
    if (buttonsTourState.manualStepAdvanceRequested) {
      return Promise.resolve().then(() => {
        if (!buttonsTourState.active || token !== buttonsTourState.actionToken) {
          throw new DOMException('Tour step cancelled', 'AbortError');
        }
      });
    }
    if (buttonsTourState.manualAdvanceQueue > 0) {
      buttonsTourState.manualAdvanceQueue -= 1;
      buttonsTourState.manualStepAdvanceRequested = true;
      return Promise.resolve().then(() => {
        if (!buttonsTourState.active || token !== buttonsTourState.actionToken) {
          throw new DOMException('Tour step cancelled', 'AbortError');
        }
      });
    }
    if (buttonsTourState.manualContinueWaiter) {
      try { buttonsTourState.manualContinueWaiter.resolve(); } catch (e) { }
      buttonsTourState.manualContinueWaiter = null;
    }
    if (buttonsTourState.nextBtn) {
      buttonsTourState.nextBtn.disabled = false;
      buttonsTourState.nextBtn.textContent = 'Next';
    }
    return new Promise((resolve, reject) => {
      buttonsTourState.manualContinueWaiter = {
        token,
        resolve: () => {
          buttonsTourState.manualStepAdvanceRequested = true;
          buttonsTourState.manualContinueWaiter = null;
          resolve();
        },
        reject
      };
    }).then(() => {
      if (!buttonsTourState.active || token !== buttonsTourState.actionToken) {
        throw new DOMException('Tour step cancelled', 'AbortError');
      }
    });
  }

  function continueButtonsTourManualWaiter() {
    const waiter = buttonsTourState.manualContinueWaiter;
    if (!waiter) return false;
    buttonsTourState.manualStepAdvanceRequested = true;
    try { waiter.resolve(); } catch (e) { }
    return true;
  }

  function pauseButtonsTourForUser(ms = 1400, token = buttonsTourState.actionToken) {
    if (buttonsTourState.mode === 'manual') {
      return waitButtonsTourManualContinue(token);
    }
    return waitButtonsTourPaced(ms, token);
  }

  async function waitForButtonsTourCondition(predicate, {
    timeoutMs = 8000,
    intervalMs = 120,
    token = buttonsTourState.actionToken
  } = {}) {
    const startedAt = Date.now();
    while (buttonsTourState.active && token === buttonsTourState.actionToken) {
      const result = predicate();
      if (result) return result;
      if (Date.now() - startedAt >= timeoutMs) return null;
      await waitButtonsTour(intervalMs, token);
    }
    throw new DOMException('Tour step cancelled', 'AbortError');
  }

  function waitForButtonsTourElement(selector, options = {}) {
    return waitForButtonsTourCondition(() => {
      const el = document.querySelector(selector);
      return isElementVisibleForTour(el) ? el : null;
    }, options);
  }

  function setButtonsTourFocus(target, {
    title = null,
    description = null,
    selector = null
  } = {}) {
    if (buttonsTourState.compositeTargetEl && target !== buttonsTourState.compositeTargetEl) {
      clearButtonsTourCompositeTarget();
    }
    buttonsTourState.focusEl = target || null;
    buttonsTourState.focusSelector = selector || null;
    if (title && buttonsTourState.title) buttonsTourState.title.textContent = title;
    if (description && buttonsTourState.description) buttonsTourState.description.textContent = description;
    positionButtonsTour();
  }

  function resetButtonsTourFocus() {
    clearButtonsTourCompositeTarget();
    buttonsTourState.focusEl = null;
    buttonsTourState.focusSelector = null;
    positionButtonsTour();
  }

  function isSurfaceVisibleForTour(selector) {
    const el = document.querySelector(selector);
    return isElementVisibleForTour(el) && getComputedStyle(el).display !== 'none';
  }

  function closeButtonsTourOpenedSurfaces() {
    const opened = buttonsTourState.openedSurfaces;
    if (!opened || opened.size === 0) {
      buttonsTourState.panelRestoreState = null;
      return;
    }

    if (opened.has('tuner') && typeof window.closeTuner === 'function') {
      try { window.closeTuner(); } catch (e) { }
    }
    if (opened.has('explorer') && window.ChordExplorer?.close) {
      try { window.ChordExplorer.close(); } catch (e) { }
    }
    if (opened.has('previewPanel') && window.ycChordsPreviewPanel?.isVisible) {
      try { window.ycChordsPreviewPanel.hide(); } catch (e) { }
      try { document.querySelector('#chords-preview-toggle')?.classList.remove('active'); } catch (e) { }
    }
    if (buttonsTourState.panelRestoreState?.miniActive) {
      try {
        const panel = document.querySelector('.yt-lyrics-chords-panel');
        const miniToggle = panel?.querySelector('#chords-toggle');
        if (panel && miniToggle && !panel.classList.contains('mini-mode')) {
          miniToggle.click();
        }
      } catch (e) { }
    }
    if (opened.has('panelMiniTemporarilyOpened')) {
      try {
        const panel = document.querySelector('.yt-lyrics-chords-panel');
        const miniToggle = panel?.querySelector('#chords-toggle');
        if (panel && miniToggle && !panel.classList.contains('mini-mode')) {
          miniToggle.click();
        }
      } catch (e) { }
    }
    if (opened.has('panel') && typeof window.cleanupLyricsChordsPanel === 'function') {
      try { window.cleanupLyricsChordsPanel(); } catch (e) { }
    }
    if (opened.has('carousel') && window.chordsActive && typeof window.toggleChords === 'function') {
      try { window.toggleChords(); } catch (e) { }
    }
    if (opened.has('carouselPopups')) {
      try { window.chordEditsManager?.closeChordInfoPopup?.(); } catch (e) { }
      try { window.chordEditsManager?.closeChordEditsSummaryPopup?.(); } catch (e) { }
      try { window.chordEditsManager?.closeChordTimingEditor?.(); } catch (e) { }
      try { window.ycChordCarousel?._closeCarouselSizePopup?.(); } catch (e) { }
      try { window.ycChordCarousel?._closeDiagramOptionsPopup?.(); } catch (e) { }
    }
    closeButtonsTourCapoDropdown();
    restoreButtonsTourCarouselState();
    if (opened.has('carouselModeVisibility')) {
      try { window.ycChordCarousel?._applyQuickModeSwitchVisibility?.(); } catch (e) { }
    }
    if (opened.has('carouselControls')) {
      setButtonsTourCarouselControlsLocked(false);
    }
    if (opened.has('subtitles') && window.subtitleState?.isVisible) {
      try {
        window.subtitleState.isVisible = false;
        if (typeof window.cleanupSubtitles === 'function') {
          window.cleanupSubtitles();
        } else if (window.subtitleState.overlay) {
          window.subtitleState.overlay.style.display = 'none';
        }
        document.querySelector('.ytp-subtitle-button')?.classList.remove('subtitle-button-active');
      } catch (e) { }
    }
    if (opened.has('subtitles')) {
      try {
        window.extractorModule?.abortLyricsRequest?.();
        window.extractorModule?.removeSubtitlesProgressBar?.();
        document.querySelector('.ytp-subtitle-button')?.classList.remove('subtitle-button-active');
      } catch (e) { }
    }
    if (opened.has('settings') && typeof window.closeAllMenus === 'function') {
      try { window.closeAllMenus(); } catch (e) { }
    }

    opened.clear();
    buttonsTourState.panelRestoreState = null;
  }

  function closeButtonsTourTransientSurfaces() {
    try { window.chordEditsManager?.closeChordInfoPopup?.(); } catch (e) { }
    try { window.chordEditsManager?.closeChordEditsSummaryPopup?.(); } catch (e) { }
    try { window.chordEditsManager?.closeChordTimingEditor?.(); } catch (e) { }
    try { window.ycChordCarousel?._closeCarouselSizePopup?.(); } catch (e) { }
    try { window.ycChordCarousel?._closeDiagramOptionsPopup?.(); } catch (e) { }
    closeButtonsTourCapoDropdown();
    buttonsTourState.openedSurfaces.delete('carouselPopups');
  }

  function setButtonsTourStepExitAction(action, { runOnBack = false } = {}) {
    buttonsTourState.pendingStepExitAction = typeof action === 'function'
      ? { action, runOnBack: Boolean(runOnBack) }
      : null;
  }

  async function runButtonsTourPendingStepExitAction(token = buttonsTourState.actionToken, { isBack = false } = {}) {
    const pending = buttonsTourState.pendingStepExitAction;
    buttonsTourState.pendingStepExitAction = null;
    if (!pending?.action) return;
    if (isBack && !pending.runOnBack) return;
    try {
      await pending.action(token);
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.warn('[Tour] Step exit action failed:', error);
      }
    }
  }

  function cleanupButtonsTourDom() {
    buttonsTourState.actionToken += 1;
    clearButtonsTourActionTimers();
    closeButtonsTourOpenedSurfaces();
    setButtonsTourControlsForced(false);
    if (buttonsTourState.activeTargetEl) {
      buttonsTourState.activeTargetEl.classList.remove('yc-tour-target-active');
      buttonsTourState.activeTargetEl = null;
    }
    if (buttonsTourState.positionTimerId) {
      clearInterval(buttonsTourState.positionTimerId);
      buttonsTourState.positionTimerId = null;
    }
    unlockButtonsTourPageScroll();
    buttonsTourState.cleanupFns.forEach(fn => {
      try { fn(); } catch (e) { }
    });
    buttonsTourState.cleanupFns = [];
    buttonsTourState.overlay?.remove();
    buttonsTourState.highlight?.remove();
    buttonsTourState.cursor?.remove();
    buttonsTourState.card?.remove();
    buttonsTourState.compositeTargetEl?.remove();
    buttonsTourState.overlay = null;
    buttonsTourState.highlight = null;
    buttonsTourState.cursor = null;
    buttonsTourState.compositeTargetEl = null;
    buttonsTourState.focusEl = null;
    buttonsTourState.focusSelector = null;
    buttonsTourState.card = null;
    buttonsTourState.title = null;
    buttonsTourState.description = null;
    buttonsTourState.counter = null;
    buttonsTourState.prevBtn = null;
    buttonsTourState.nextBtn = null;
    buttonsTourState.modeChoice = null;
    buttonsTourState.manualModeBtn = null;
    buttonsTourState.autoModeBtn = null;
    buttonsTourState.videoModeBtn = null;
    buttonsTourState.speedRange = null;
    buttonsTourState.speedLabel = null;
    buttonsTourState.modeSwitchBtn?.remove();
    buttonsTourState.modeSwitchBtn = null;
    buttonsTourState.pausedVideoEl = null;
    buttonsTourState.manualAdvanceQueue = 0;
    buttonsTourState.manualStepAdvanceRequested = false;
    buttonsTourState.pendingStepExitAction = null;
    buttonsTourState.advancingStep = false;
    buttonsTourState.advanceImmediatelyAfterStep = false;
    buttonsTourState.activeMainKey = null;
    buttonsTourState.mainStepsCount = 0;
    buttonsTourState.panelRestoreState = null;
    buttonsTourState.carouselRestoreState = null;
    buttonsTourState.scrollLockCleanup = null;
    buttonsTourState.scrollLockPosition = null;
    buttonsTourState.steps = [];
    buttonsTourState.index = 0;
    buttonsTourState.openedSurfaces.clear();
    buttonsTourState.mode = null;
    buttonsTourState.stepRunning = false;
    buttonsTourState.stepComplete = false;
  }

  function openPopupWithTourRequest(completedButtonsSteps = 0, totalFlowSteps = 0) {
    chrome.storage.local.set({
      [YC_POPUP_TOUR_PENDING_STORAGE_KEY]: {
        pending: true,
        requestedAt: Date.now(),
        version: 1,
        completedButtonsSteps,
        totalFlowSteps
      }
    }, () => {
      chrome.runtime.sendMessage({ action: 'openPopup' }, () => {
        // Background handles popup open and fallback tab flow
      });
    });
  }

  function stopButtonsTour({ markSeen = false, openPopupTour = false } = {}) {
    const completedButtonsSteps = buttonsTourState.mainStepsCount || buttonsTourState.steps.length || 0;
    const totalFlowSteps = completedButtonsSteps + YC_POPUP_TOUR_STEPS_COUNT;
    if (!buttonsTourState.active) {
      cleanupButtonsTourDom();
      return;
    }
    buttonsTourState.active = false;
    cleanupButtonsTourDom();
    if (markSeen) {
      setButtonsTourSeen();
    }
    if (openPopupTour) {
      openPopupWithTourRequest(completedButtonsSteps, totalFlowSteps);
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getCurrentButtonsTourTarget() {
    const step = buttonsTourState.steps[buttonsTourState.index];
    if (!step) return null;
    const el = document.querySelector(step.selector);
    return isElementVisibleForTour(el) ? el : null;
  }

  function shouldSuppressButtonsTourMainTargetFallback() {
    const step = buttonsTourState.steps[buttonsTourState.index];
    if (!step || !buttonsTourState.activeMainKey) return false;
    const stepMainKey = step.mainKey || step.key;
    return stepMainKey === buttonsTourState.activeMainKey &&
      Number.isFinite(step.subIndex) &&
      step.subIndex > 0;
  }

  function getButtonsTourFocusedTarget({ allowCurrentTargetFallback = true } = {}) {
    if (isElementVisibleForTour(buttonsTourState.focusEl)) {
      return buttonsTourState.focusEl;
    }
    if (buttonsTourState.focusSelector) {
      const el = document.querySelector(buttonsTourState.focusSelector);
      if (isElementVisibleForTour(el)) {
        buttonsTourState.focusEl = el;
        return el;
      }
    }
    if (!allowCurrentTargetFallback) {
      const currentTarget = getCurrentButtonsTourTarget();
      if (
        isElementVisibleForTour(buttonsTourState.activeTargetEl) &&
        buttonsTourState.activeTargetEl !== currentTarget
      ) {
        return buttonsTourState.activeTargetEl;
      }
      return null;
    }
    return getCurrentButtonsTourTarget();
  }

  function getButtonsTourElementsUnionRect(elements) {
    const rects = (elements || [])
      .filter(isElementVisibleForTour)
      .map(el => el.getBoundingClientRect());
    if (rects.length === 0) return null;
    const left = Math.min(...rects.map(rect => rect.left));
    const top = Math.min(...rects.map(rect => rect.top));
    const right = Math.max(...rects.map(rect => rect.right));
    const bottom = Math.max(...rects.map(rect => rect.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function clearButtonsTourCompositeTarget() {
    const target = buttonsTourState.compositeTargetEl;
    if (!target) return;
    if (buttonsTourState.activeTargetEl === target) {
      target.classList.remove('yc-tour-target-active');
      buttonsTourState.activeTargetEl = null;
    }
    target.__ycTourCompositeElements = null;
    target.remove();
    buttonsTourState.compositeTargetEl = null;
  }

  function ensureButtonsTourCompositeTarget(elements) {
    const rect = getButtonsTourElementsUnionRect(elements);
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    let target = buttonsTourState.compositeTargetEl;
    if (!target) {
      target = document.createElement('div');
      target.id = 'yc-buttons-tour-composite-target';
      document.body.appendChild(target);
      buttonsTourState.compositeTargetEl = target;
    }
    target.__ycTourCompositeElements = elements.filter(Boolean);
    target.style.left = `${Math.round(rect.left)}px`;
    target.style.top = `${Math.round(rect.top)}px`;
    target.style.width = `${Math.round(rect.width)}px`;
    target.style.height = `${Math.round(rect.height)}px`;
    return target;
  }

  function refreshButtonsTourCompositeTarget(target) {
    if (target?.__ycTourCompositeElements) {
      ensureButtonsTourCompositeTarget(target.__ycTourCompositeElements);
    }
  }

  function findNextVisibleButtonsTourIndex(fromIndex) {
    for (let i = fromIndex; i < buttonsTourState.steps.length; i += 1) {
      const el = document.querySelector(buttonsTourState.steps[i].selector);
      if (isElementVisibleForTour(el)) return i;
    }
    return -1;
  }

  function positionButtonsTour() {
    if (!buttonsTourState.active || !buttonsTourState.card || !buttonsTourState.highlight) return;
    keepButtonsTourPageScrollLocked();
    pauseButtonsTourVideo();
    wakeYouTubeControlsForTour();
    if (buttonsTourState.openedSurfaces?.has('carouselControls')) {
      setButtonsTourCarouselPositionControlsForced(true);
    }

    if (!buttonsTourState.mode) {
      if (buttonsTourState.activeTargetEl) {
        buttonsTourState.activeTargetEl.classList.remove('yc-tour-target-active');
        buttonsTourState.activeTargetEl = null;
      }
      buttonsTourState.card.classList.add('yc-tour-choice-active');
      buttonsTourState.card.classList.remove('yc-tour-auto-active');
      updateButtonsTourModeUi();
      buttonsTourState.highlight.style.display = 'none';
      if (buttonsTourState.cursor) buttonsTourState.cursor.style.display = 'none';

      const playerRect = getButtonsTourPlayerRect();
      const centerX = playerRect ? playerRect.left + playerRect.width / 2 : window.innerWidth / 2;
      const centerY = playerRect ? playerRect.top + playerRect.height / 2 : window.innerHeight / 2;
      buttonsTourState.card.style.left = `${Math.round(centerX)}px`;
      buttonsTourState.card.style.top = `${Math.round(centerY)}px`;
      return;
    }

    buttonsTourState.card.classList.remove('yc-tour-choice-active');
    updateButtonsTourModeUi();
    buttonsTourState.highlight.style.display = '';
    if (buttonsTourState.cursor) buttonsTourState.cursor.style.display = '';

    const suppressMainTargetFallback = shouldSuppressButtonsTourMainTargetFallback();
    let target = getButtonsTourFocusedTarget({
      allowCurrentTargetFallback: !suppressMainTargetFallback
    });
    if (!target) {
      if (buttonsTourState.scrollLockPosition) {
        keepButtonsTourPageScrollLocked();
        return;
      }
      if (suppressMainTargetFallback) return;
      const nextVisibleIdx = findNextVisibleButtonsTourIndex(buttonsTourState.index + 1);
      if (nextVisibleIdx === -1) {
        stopButtonsTour({ markSeen: true });
        return;
      }
      buttonsTourState.index = nextVisibleIdx;
      renderButtonsTourStep();
      target = getButtonsTourFocusedTarget();
      if (!target) return;
    }

    refreshButtonsTourCompositeTarget(target);
    const rect = target.getBoundingClientRect();
    if (buttonsTourState.activeTargetEl && buttonsTourState.activeTargetEl !== target) {
      buttonsTourState.activeTargetEl.classList.remove('yc-tour-target-active');
    }
    target.classList.add('yc-tour-target-active');
    buttonsTourState.activeTargetEl = target;

    const pad = 6;
    buttonsTourState.highlight.style.left = `${Math.round(rect.left - pad)}px`;
    buttonsTourState.highlight.style.top = `${Math.round(rect.top - pad)}px`;
    buttonsTourState.highlight.style.width = `${Math.round(rect.width + pad * 2)}px`;
    buttonsTourState.highlight.style.height = `${Math.round(rect.height + pad * 2)}px`;

    const cardAnchor = getCurrentButtonsTourTarget() || target;
    const anchorRect = cardAnchor.getBoundingClientRect();
    const cardRect = buttonsTourState.card.getBoundingClientRect();
    const viewportPad = 12;
    let top = anchorRect.bottom + 12;
    if (top + cardRect.height > window.innerHeight - viewportPad) {
      top = anchorRect.top - cardRect.height - 12;
    }
    top = clamp(top, viewportPad, window.innerHeight - cardRect.height - viewportPad);

    let left = anchorRect.left + anchorRect.width / 2 - cardRect.width / 2;
    left = clamp(left, viewportPad, window.innerWidth - cardRect.width - viewportPad);

    buttonsTourState.card.style.left = `${Math.round(left)}px`;
    buttonsTourState.card.style.top = `${Math.round(top)}px`;
  }

  function getElementCenterForTour(el) {
    const rect = el?.getBoundingClientRect?.();
    if (!rect) return null;
    return {
      x: clamp(rect.left + rect.width / 2, 12, window.innerWidth - 12),
      y: clamp(rect.top + rect.height / 2, 12, window.innerHeight - 12)
    };
  }

  async function moveButtonsTourCursorTo(el, token = buttonsTourState.actionToken, durationMs = 450) {
    if (!buttonsTourState.cursor || !isElementVisibleForTour(el)) return false;
    const center = getElementCenterForTour(el);
    if (!center) return false;
    const cursor = buttonsTourState.cursor;
    const duration = Math.max(120, Number(durationMs) || 450);
    const previousTransition = cursor.style.transition;
    if (duration !== 450) {
      cursor.style.transition =
        `left ${duration}ms cubic-bezier(.22, .9, .25, 1), ` +
        `top ${duration}ms cubic-bezier(.22, .9, .25, 1), transform 120ms ease`;
    }
    try {
      cursor.style.left = `${Math.round(center.x - 8)}px`;
      cursor.style.top = `${Math.round(center.y - 7)}px`;
      if (duration === 450) {
        await waitButtonsTourPaced(450, token);
      } else {
        await waitButtonsTour(duration, token);
      }
    } finally {
      if (duration !== 450 && buttonsTourState.cursor === cursor) {
        cursor.style.transition = previousTransition;
      }
    }
    return true;
  }

  async function previewButtonsTourElement(el, token = buttonsTourState.actionToken) {
    if (!el || !buttonsTourState.active || token !== buttonsTourState.actionToken) return false;
    setButtonsTourFocus(el);
    await moveButtonsTourCursorTo(el, token);
    return true;
  }

  async function clickButtonsTourElement(el, {
    token = buttonsTourState.actionToken,
    dispatch = true,
    move = true
  } = {}) {
    if (!el || !buttonsTourState.active || token !== buttonsTourState.actionToken) return false;
    setButtonsTourFocus(el);
    try { el.focus?.({ preventScroll: true }); } catch (e) { }
    if (move) await moveButtonsTourCursorTo(el, token);
    buttonsTourState.cursor?.classList.add('yc-tour-cursor-clicking');
    try {
      if (dispatch) {
        const rect = el.getBoundingClientRect();
        const eventInit = {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          view: window
        };
        el.dispatchEvent(new MouseEvent('mousedown', eventInit));
        await waitButtonsTourPaced(90, token);
        el.dispatchEvent(new MouseEvent('mouseup', eventInit));
        el.dispatchEvent(new MouseEvent('click', eventInit));
      } else {
        await waitButtonsTourPaced(140, token);
      }
    } finally {
      buttonsTourState.cursor?.classList.remove('yc-tour-cursor-clicking');
    }
    await waitButtonsTourPaced(160, token);
    return true;
  }

  function updateButtonsTourCopy(title, description) {
    if (title && buttonsTourState.title) buttonsTourState.title.textContent = title;
    if (description && buttonsTourState.description) buttonsTourState.description.textContent = description;
  }

  function findButtonsTourTextElement(root, text) {
    if (!root) return null;
    const lowerText = text.toLowerCase();
    const elements = root.querySelectorAll('button, span, div, label, h1, h2, h3, p');
    const candidates = Array.from(elements).map(el => ({
      el,
      value: (el.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase()
    })).filter(item => item.value);
    const exact = candidates.find(item => item.value === lowerText);
    if (exact) return exact.el;
    return candidates.find(item =>
      item.value.includes(lowerText) && item.value.length <= lowerText.length + 36
    )?.el || null;
  }

  function getButtonsTourPanelTarget(panel, selector, rowSelector = null) {
    const el = panel?.querySelector(selector);
    if (!el) return null;
    return rowSelector ? (el.closest(rowSelector) || el) : el;
  }

  async function typeButtonsTourText(input, value, token = buttonsTourState.actionToken) {
    if (!input) return;
    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    for (const char of value) {
      if (!buttonsTourState.active || token !== buttonsTourState.actionToken) {
        throw new DOMException('Tour step cancelled', 'AbortError');
      }
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await waitButtonsTourPaced(90, token);
    }
  }

  function holdButtonsTourMicroStep(ms = 1200, token = buttonsTourState.actionToken) {
    return waitButtonsTourPaced(ms, token);
  }

  async function explainButtonsTourDemoOnly(step, token) {
    const target = getCurrentButtonsTourTarget();
    updateButtonsTourCopy(step.title, YC_TOUR_DEMO_ONLY_TEXT);
    if (target) {
      setButtonsTourFocus(target);
      await moveButtonsTourCursorTo(target, token);
    }
    await holdButtonsTourMicroStep(1400, token);
    return null;
  }

  async function getButtonsTourDemoTarget(step, token) {
    const target = getCurrentButtonsTourTarget();
    if (!target) return null;
    if (!isTutorialDemoVideo()) {
      await explainButtonsTourDemoOnly(step, token);
      return null;
    }
    await ensureTutorialDemoChords();
    return target;
  }

  async function focusButtonsTourControl(control, title, description, token, waitMs = 1200) {
    if (!isElementVisibleForTour(control)) return false;
    updateButtonsTourCopy(title, description);
    await previewButtonsTourElement(control, token);
    await holdButtonsTourMicroStep(waitMs, token);
    return true;
  }

  async function focusButtonsTourCompositeControl(elements, cursorTarget, title, description, token, waitMs = 1200) {
    const compositeTarget = ensureButtonsTourCompositeTarget(elements);
    if (!compositeTarget) return false;
    updateButtonsTourCopy(title, description);
    setButtonsTourFocus(compositeTarget);
    await moveButtonsTourCursorTo(cursorTarget || compositeTarget, token);
    await holdButtonsTourMicroStep(waitMs, token);
    return true;
  }

  async function focusButtonsTourCloseControl(control, fallback, title, description, token) {
    const target = isElementVisibleForTour(control) ? control : fallback;
    if (!isElementVisibleForTour(target)) return false;
    updateButtonsTourCopy(title, description);
    setButtonsTourFocus(target);
    await moveButtonsTourCursorTo(target, token, 820);
    await holdButtonsTourMicroStep(850, token);
    return true;
  }

  function getVisibleButtonsTourPanel() {
    const panel = document.querySelector('.yt-lyrics-chords-panel');
    return isSurfaceVisibleForTour('.yt-lyrics-chords-panel') ? panel : null;
  }

  function isButtonsTourPanelMiniActive(panel) {
    return !!(
      panel?.classList.contains('mini-mode') ||
      panel?.querySelector('#chords-toggle')?.classList.contains('active')
    );
  }

  function getVisibleButtonsTourPreviewPanel() {
    const previewPanel = (
      window.ycChordsPreviewPanel?.isVisible
        ? window.ycChordsPreviewPanel.panelElement
        : document.querySelector('.yc-preview-panel.visible')
    );
    return isElementVisibleForTour(previewPanel) ? previewPanel : null;
  }

  async function ensurePanelTourSurface(step, token) {
    const target = await getButtonsTourDemoTarget(step, token);
    if (!target) return null;
    let panel = getVisibleButtonsTourPanel();
    if (!panel) {
      updateButtonsTourCopy(step.title, step.description);
      await clickButtonsTourElement(target, { token });
      buttonsTourState.openedSurfaces.add('panel');
      panel = await waitForButtonsTourElement('.yt-lyrics-chords-panel', { timeoutMs: 25000, token });
    }
    if (panel && !buttonsTourState.panelRestoreState) {
      buttonsTourState.panelRestoreState = {
        miniActive: isButtonsTourPanelMiniActive(panel)
      };
    }
    return panel ? { target, panel } : null;
  }

  function getPanelTourControl(panel, subKey) {
    const controls = {
      header: () => panel.querySelector('.lyrics-chords-header') || panel,
      textSize: () => panel.querySelector('#font-decrease')?.closest('.font-size-controls'),
      panelWidth: () => panel.querySelector('#panel-width-decrease')?.closest('.font-size-controls'),
      mini: () => panel.querySelector('#chords-toggle'),
      sync: () => panel.querySelector('#sync-youtube-toggle'),
      countdown: () => panel.querySelector('#countdown-toggle'),
      sentence: () => panel.querySelector('#sentence-mode-toggle'),
      language: () => panel.querySelector('#language-selector-btn'),
      autoScroll: () => panel.querySelector('#auto-scroll-toggle'),
      scrollSpeed: () => panel.querySelector('.speed-controls'),
      theme: () => panel.querySelector('#theme-cycle-btn'),
      lyrics: () => panel.querySelector('.lyrics-chords-content') || panel,
      previewToggle: () => panel.querySelector('#chords-preview-toggle'),
      close: () => panel.querySelector('.lyrics-chords-close')
    };
    return controls[subKey]?.() || null;
  }

  async function runPanelTourMicroAction(step, token) {
    const result = await ensurePanelTourSurface(step, token);
    if (!result) return;
    const { panel } = result;

    if (step.subKey === 'open' || step.subKey === 'header') {
      const header = getPanelTourControl(panel, 'header');
      await focusButtonsTourControl(header, step.title, step.description, token, 1300);
      return;
    }

    if (step.subKey === 'mini') {
      const miniToggle = getPanelTourControl(panel, 'mini');
      await focusButtonsTourControl(miniToggle, step.title, step.description, token, 900);
      if (miniToggle && isButtonsTourPanelMiniActive(panel)) {
        await clickButtonsTourElement(miniToggle, { token });
        buttonsTourState.openedSurfaces.add('panelMiniTemporarilyOpened');
        await waitForButtonsTourCondition(() => !isButtonsTourPanelMiniActive(panel), {
          timeoutMs: 2500,
          intervalMs: 80,
          token
        });
        await holdButtonsTourMicroStep(450, token);
      }
      return;
    }

    if (step.subKey === 'previewToggle') {
      const previewToggle = getPanelTourControl(panel, 'previewToggle');
      await focusButtonsTourControl(previewToggle, step.title, step.description, token, 800);
      if (previewToggle && !getVisibleButtonsTourPreviewPanel() && window.chordsAvailableForPreview !== false) {
        await clickButtonsTourElement(previewToggle, { token });
        buttonsTourState.openedSurfaces.add('previewPanel');
        await waitForButtonsTourCondition(getVisibleButtonsTourPreviewPanel, {
          timeoutMs: 5000,
          intervalMs: 120,
          token
        });
      }
      return;
    }

    if (step.subKey === 'previewPanel') {
      let previewPanel = getVisibleButtonsTourPreviewPanel();
      if (!previewPanel) {
        const previewToggle = getPanelTourControl(panel, 'previewToggle');
        if (previewToggle && window.chordsAvailableForPreview !== false) {
          await clickButtonsTourElement(previewToggle, { token });
          buttonsTourState.openedSurfaces.add('previewPanel');
          previewPanel = await waitForButtonsTourCondition(getVisibleButtonsTourPreviewPanel, {
            timeoutMs: 5000,
            intervalMs: 120,
            token
          });
        }
      }
      await focusButtonsTourControl(previewPanel || panel, step.title, step.description, token, 1500);
      return;
    }

    if (step.subKey === 'restoreMini') {
      const miniToggle = getPanelTourControl(panel, 'mini');
      updateButtonsTourCopy(step.title, step.description);
      if (
        buttonsTourState.panelRestoreState?.miniActive &&
        miniToggle &&
        !isButtonsTourPanelMiniActive(panel)
      ) {
        await clickButtonsTourElement(miniToggle, { token });
        const miniRestored = await waitForButtonsTourCondition(() => isButtonsTourPanelMiniActive(panel), {
          timeoutMs: 2500,
          intervalMs: 80,
          token
        });
        if (miniRestored) buttonsTourState.openedSurfaces.delete('panelMiniTemporarilyOpened');
      } else {
        await focusButtonsTourControl(miniToggle || panel, step.title, step.description, token, 900);
      }
      return;
    }

    if (step.subKey === 'close') {
      const closeBtn = getPanelTourControl(panel, 'close');
      await focusButtonsTourCloseControl(closeBtn, panel, step.title, step.description, token);
      if (closeBtn) {
        setButtonsTourStepExitAction(async exitToken => {
          const latestCloseBtn = getVisibleButtonsTourPanel()?.querySelector('.lyrics-chords-close') || closeBtn;
          if (isElementVisibleForTour(latestCloseBtn)) {
            await clickButtonsTourElement(latestCloseBtn, { token: exitToken, move: false });
          } else if (typeof window.cleanupLyricsChordsPanel === 'function') {
            window.cleanupLyricsChordsPanel();
          }
          buttonsTourState.openedSurfaces.delete('panel');
          buttonsTourState.panelRestoreState = null;
        });
      }
      return;
    }

    const control = getPanelTourControl(panel, step.subKey);
    await focusButtonsTourControl(control || panel, step.title, step.description, token, 1200);
  }

  function getVisibleButtonsTourCarousel() {
    const carousel = document.querySelector('.yc-chord-carousel');
    return isSurfaceVisibleForTour('.yc-chord-carousel') ? carousel : null;
  }

  function getButtonsTourPositionCounterInfo(counter) {
    if (!counter) return null;
    const positionText = counter.textContent || '';
    const match = positionText.match(/^(\d+)\/(\d+)$/);
    if (!match) return null;
    const svg = counter.closest('svg');
    const arrow = svg?.querySelector?.('.chord-arrow-left, .chord-arrow-right');
    const rawChordName = arrow?.getAttribute?.('data-chord-name') || '';
    const chordName = rawChordName.replace(/_pos\d+_\d+$/, '');
    if (!chordName) return null;
    return {
      chordName,
      currentPosition: parseInt(match[1], 10) - 1
    };
  }

  function getButtonsTourCarouselPositionCounter() {
    return document.querySelector('.yc-chord-tile svg .chord-position-counter, .chord-position-counter');
  }

  function getButtonsTourCarouselPositionIndex() {
    const info = getButtonsTourPositionCounterInfo(getButtonsTourCarouselPositionCounter());
    return Number.isFinite(info?.currentPosition) ? info.currentPosition : null;
  }

  function waitForButtonsTourCarouselPosition(positionIndex, token) {
    return waitForButtonsTourCondition(() => (
      getButtonsTourCarouselPositionIndex() === positionIndex
        ? getButtonsTourCarouselPositionCounter()
        : null
    ), {
      timeoutMs: 2500,
      intervalMs: 80,
      token
    });
  }

  async function moveButtonsTourCarouselToPosition(positionIndex, token) {
    let counter = getButtonsTourCarouselPositionCounter();
    let info = getButtonsTourPositionCounterInfo(counter);
    if (!counter || !info || info.currentPosition === positionIndex) return counter;

    const maxClicks = 8;
    for (let i = 0; i < maxClicks && info.currentPosition !== positionIndex; i += 1) {
      const direction = info.currentPosition < positionIndex ? 'rightArrow' : 'leftArrow';
      const arrowSelector = direction === 'rightArrow'
        ? '.yc-chord-tile svg .chord-arrow-right, .chord-arrow-right'
        : '.yc-chord-tile svg .chord-arrow-left, .chord-arrow-left';
      const arrow = document.querySelector(arrowSelector);
      if (!arrow) break;
      await clickButtonsTourElement(arrow, { token });
      await waitForButtonsTourCarouselPosition(
        direction === 'rightArrow' ? info.currentPosition + 1 : info.currentPosition - 1,
        token
      );
      counter = getButtonsTourCarouselPositionCounter();
      info = getButtonsTourPositionCounterInfo(counter);
      if (!counter || !info) break;
    }
    return getButtonsTourCarouselPositionCounter();
  }

  async function restoreButtonsTourGlobalChordPosition(info, previousPosition) {
    if (!info?.chordName || !window.databaseManager?.saveGlobalChordPosition) return;
    const positionToRestore = previousPosition == null ? 0 : previousPosition;
    await window.databaseManager.saveGlobalChordPosition(info.chordName, positionToRestore);
    if (typeof window.refreshAllGlobalIndicators === 'function') {
      try { await window.refreshAllGlobalIndicators(); } catch (e) { }
    }
  }

  async function ensureCarouselTourSurface(step, token) {
    const target = await getButtonsTourDemoTarget(step, token);
    if (!target) return null;
    let carousel = getVisibleButtonsTourCarousel();
    if (!carousel) {
      updateButtonsTourCopy(step.title, step.description);
      await clickButtonsTourElement(target, { token });
      buttonsTourState.openedSurfaces.add('carousel');
      carousel = await waitForButtonsTourElement('.yc-chord-carousel', { timeoutMs: 18000, token });
    }
    if (!carousel) return null;
    if (!buttonsTourState.carouselRestoreState) {
      buttonsTourState.carouselRestoreState = captureButtonsTourCarouselRestoreState();
    }
    setButtonsTourCarouselControlsLocked(true);
    buttonsTourState.openedSurfaces.add('carouselControls');
    if (window.ycChordCarousel?._applyQuickModeSwitchVisibility) {
      try {
        window.ycChordCarousel._applyQuickModeSwitchVisibility(true);
        buttonsTourState.openedSurfaces.add('carouselModeVisibility');
      } catch (e) { }
    }
    return { target, carousel };
  }

  function normalizeButtonsTourCarouselMode(modeValue) {
    return window.ycChordCarousel?._normalizeModeValue
      ? window.ycChordCarousel._normalizeModeValue(modeValue)
      : (['regular', 'regularPlus', 'harmonic', 'harmonicPlus'].includes(modeValue) ? modeValue : 'regular');
  }

  function getButtonsTourCarouselModeButton(modeValue) {
    const labels = { regular: 'R', regularPlus: 'R+', harmonic: 'H', harmonicPlus: 'H+' };
    const label = labels[normalizeButtonsTourCarouselMode(modeValue)];
    return Array.from(document.querySelectorAll('.yc-carousel-mode-btn'))
      .find(btn => (btn.textContent || '').trim() === label) || null;
  }

  async function restoreButtonsTourCarouselRegularMode(token) {
    const currentMode = normalizeButtonsTourCarouselMode(window.chordsMode || 'regular');
    if (currentMode === 'regular') return;

    const regularBtn = getButtonsTourCarouselModeButton('regular');
    updateButtonsTourCopy('Back to Mode R', 'The tour returns the carousel to Regular before continuing.');
    if (regularBtn) {
      await previewButtonsTourElement(regularBtn, token);
      await holdButtonsTourMicroStep(350, token);
      await clickButtonsTourElement(regularBtn, { token });
      await waitButtonsTourPaced(350, token);
      return;
    }

    if (window.ycChordCarousel?._setChordMode) {
      window.ycChordCarousel._setChordMode('regular');
      await waitButtonsTourPaced(350, token);
    }
  }

  async function runCarouselTourMicroAction(step, token) {
    const result = await ensureCarouselTourSurface(step, token);
    if (!result) return;
    const { target, carousel } = result;

    if (step.subKey === 'open' || step.subKey === 'card') {
      const tile = await waitForButtonsTourElement('.yc-chord-tile', { timeoutMs: 5000, token });
      await focusButtonsTourControl(tile || carousel, step.title, step.description, token, 1500);
      return;
    }

    const simpleTargets = {
      leftArrow: '.yc-chord-tile svg .chord-arrow-left, .chord-arrow-left',
      rightArrow: '.yc-chord-tile svg .chord-arrow-right, .chord-arrow-right',
      positionCounter: '.yc-chord-tile svg .chord-position-counter, .chord-position-counter',
      capo: '.yc-capo-carousel .yc-capo-icon',
      capoNumber: '.yc-capo-carousel .yc-capo-fret-number',
      dice: '.yc-dice-carousel',
      edit: '.yc-chord-action-edit',
      time: '.yc-chord-action-time',
      remove: '.yc-chord-action-remove',
      info: '.yc-carousel-info-btn',
      edits: '.yc-carousel-edits-btn',
      size: '.yc-carousel-size-btn',
      displayOptions: '.yc-carousel-options-btn'
    };

    if (step.subKey === 'leftArrow' || step.subKey === 'rightArrow') {
      const control = document.querySelector(simpleTargets[step.subKey]);
      await focusButtonsTourControl(control || carousel, step.title, step.description, token, 900);
      if (control) await clickButtonsTourElement(control, { token, dispatch: false });
      return;
    }

    if (step.subKey === 'positionCounter') {
      await moveButtonsTourCarouselToPosition(1, token);
      let counter = document.querySelector(simpleTargets.positionCounter);
      await focusButtonsTourControl(counter || carousel, step.title, step.description, token, 900);
      if (counter) {
        const info = getButtonsTourPositionCounterInfo(counter);
        const previousPosition = info?.chordName && window.databaseManager?.getGlobalChordPosition
          ? await window.databaseManager.getGlobalChordPosition(info.chordName).catch(() => null)
          : null;
        const restoreGlobalPosition = () => restoreButtonsTourGlobalChordPosition(info, previousPosition);
        if (info?.chordName && window.databaseManager?.saveGlobalChordPosition) {
          setButtonsTourStepExitAction(restoreGlobalPosition, { runOnBack: true });
        }
        await clickButtonsTourElement(counter, { token });
        await holdButtonsTourMicroStep(750, token);
        if (info?.chordName && window.databaseManager?.saveGlobalChordPosition) {
          counter = getButtonsTourCarouselPositionCounter() || counter;
          await clickButtonsTourElement(counter, { token });
          await holdButtonsTourMicroStep(500, token);
          await restoreGlobalPosition();
          buttonsTourState.pendingStepExitAction = null;
        }
        await moveButtonsTourCarouselToPosition(0, token);
      }
      return;
    }

    if (step.subKey === 'capo') {
      const capoIcon = document.querySelector(simpleTargets.capo);
      await focusButtonsTourControl(capoIcon || carousel, step.title, step.description, token, 900);
      if (capoIcon) await clickButtonsTourElement(capoIcon, { token });
      return;
    }

    if (step.subKey === 'capoNumber') {
      const capoNumber = document.querySelector(simpleTargets.capoNumber);
      await focusButtonsTourControl(capoNumber || carousel, step.title, step.description, token, 900);
      if (capoNumber) {
        await clickButtonsTourElement(capoNumber, { token });
        const capoDropdown = await waitForButtonsTourElement('.yc-capo-dropdown', { timeoutMs: 2500, token });
        if (capoDropdown) {
          setButtonsTourFocus(capoDropdown);
          await holdButtonsTourMicroStep(700, token);
          const previousFret = buttonsTourState.carouselRestoreState?.capoFret;
          const nextFretCell = Array.from(capoDropdown.querySelectorAll('.yc-capo-fret-cell'))
            .find(cell => {
              const match = (cell.textContent || '').match(/\d+/);
              return match && Number(match[0]) !== previousFret;
            }) || capoDropdown.querySelector('.yc-capo-fret-cell');
          if (nextFretCell) {
            await clickButtonsTourElement(nextFretCell, { token });
          } else {
            closeButtonsTourCapoDropdown();
          }
        }
      }
      return;
    }

    if (step.subKey === 'dice') {
      const diceBtn = document.querySelector(simpleTargets.dice);
      await focusButtonsTourControl(diceBtn || carousel, step.title, step.description, token, 900);
      if (diceBtn) await clickButtonsTourElement(diceBtn, { token });
      return;
    }

    if (step.subKey === 'edit' || step.subKey === 'time' || step.subKey === 'remove') {
      const btn = document.querySelector(simpleTargets[step.subKey]);
      await focusButtonsTourControl(btn || carousel, step.title, step.description, token, 1000);
      if (btn) await clickButtonsTourElement(btn, { token, dispatch: false });
      return;
    }

    if (step.subKey === 'info') {
      const infoBtn = document.querySelector(simpleTargets.info);
      await focusButtonsTourControl(infoBtn || carousel, step.title, step.description, token, 900);
      if (infoBtn) {
        await clickButtonsTourElement(infoBtn, { token });
        buttonsTourState.openedSurfaces.add('carouselPopups');
        const popup = await waitForButtonsTourElement('[role="dialog"][aria-label="Song chord info"]', { timeoutMs: 2500, token });
        if (popup) {
          setButtonsTourFocus(popup);
          await holdButtonsTourMicroStep(1300, token);
        }
      }
      return;
    }

    if (step.subKey === 'edits') {
      const editsBtn = document.querySelector(simpleTargets.edits);
      await focusButtonsTourControl(editsBtn || carousel, step.title, step.description, token, 900);
      if (editsBtn) {
        await clickButtonsTourElement(editsBtn, { token });
        buttonsTourState.openedSurfaces.add('carouselPopups');
        const popup = await waitForButtonsTourElement('[role="dialog"][aria-label="Chord edits summary"]', { timeoutMs: 2500, token });
        if (popup) {
          setButtonsTourFocus(popup);
          await holdButtonsTourMicroStep(1300, token);
        }
      }
      return;
    }

    if (step.subKey === 'size') {
      const sizeBtn = document.querySelector(simpleTargets.size);
      await focusButtonsTourControl(sizeBtn || carousel, step.title, step.description, token, 900);
      if (sizeBtn) {
        await clickButtonsTourElement(sizeBtn, { token });
        buttonsTourState.openedSurfaces.add('carouselPopups');
        const popup = await waitForButtonsTourElement('[role="dialog"][aria-label="Quick size controls"]', { timeoutMs: 2500, token });
        if (popup) {
          setButtonsTourFocus(popup);
          await holdButtonsTourMicroStep(1300, token);
        }
      }
      return;
    }

    if (step.subKey === 'displayOptions') {
      const optionsBtn = document.querySelector(simpleTargets.displayOptions);
      await focusButtonsTourControl(optionsBtn || carousel, step.title, step.description, token, 900);
      if (optionsBtn) {
        await clickButtonsTourElement(optionsBtn, { token });
        buttonsTourState.openedSurfaces.add('carouselPopups');
        const popup = await waitForButtonsTourElement('[role="dialog"][aria-label="Chord diagram display options"]', { timeoutMs: 2500, token });
        if (popup) {
          setButtonsTourFocus(popup);
          await holdButtonsTourMicroStep(1300, token);
        }
        try { window.ycChordCarousel?._closeDiagramOptionsPopup?.(); } catch (e) { }
      }
      return;
    }

    const modeMap = {
      modeRegular: 'regular',
      modeRegularPlus: 'regularPlus',
      modeHarmonic: 'harmonic',
      modeHarmonicPlus: 'harmonicPlus'
    };
    if (modeMap[step.subKey]) {
      const modeBtn = getButtonsTourCarouselModeButton(modeMap[step.subKey]);
      await focusButtonsTourControl(modeBtn || carousel, step.title, step.description, token, 900);
      if (modeBtn) await clickButtonsTourElement(modeBtn, { token });
      if (step.subKey === 'modeHarmonicPlus') {
        await waitButtonsTourPaced(350, token);
        await restoreButtonsTourCarouselRegularMode(token);
      }
      return;
    }

    if (step.subKey === 'close') {
      updateButtonsTourCopy(step.title, step.description);
      closeButtonsTourCapoDropdown();
      restoreButtonsTourCarouselState();
      try { window.ycChordCarousel?._applyQuickModeSwitchVisibility?.(); } catch (e) { }
      setButtonsTourCarouselControlsLocked(false);
      buttonsTourState.openedSurfaces.delete('carouselModeVisibility');
      buttonsTourState.openedSurfaces.delete('carouselControls');
      buttonsTourState.openedSurfaces.delete('carouselPopups');
      await focusButtonsTourControl(target, step.title, step.description, token, 900);
      await clickButtonsTourElement(target, { token });
      buttonsTourState.openedSurfaces.delete('carousel');
    }
  }

  async function ensureSubtitlesTourTarget(step, token) {
    return getButtonsTourDemoTarget(step, token);
  }

  async function runSubtitlesTourMicroAction(step, token) {
    const target = await ensureSubtitlesTourTarget(step, token);
    if (!target) return;

    if (step.subKey === 'open') {
      const wasVisible = !!window.subtitleState?.isVisible;
      updateButtonsTourCopy(step.title, step.description);
      await clickButtonsTourElement(target, { token });
      if (!wasVisible) buttonsTourState.openedSurfaces.add('subtitles');
      await waitForButtonsTourCondition(() => window.subtitleState?.isVisible || document.getElementById('yc-subtitle-auth-modal'), {
        timeoutMs: 12000,
        token
      });
      return;
    }

    if (step.subKey === 'overlay') {
      const overlay = window.subtitleState?.overlay || document.getElementById('yc-subtitle-auth-modal');
      await focusButtonsTourControl(overlay || target, step.title, step.description, token, 1500);
      return;
    }

    if (step.subKey === 'close') {
      await focusButtonsTourControl(target, step.title, step.description, token, 800);
      if (window.subtitleState?.isVisible) {
        await clickButtonsTourElement(target, { token });
        buttonsTourState.openedSurfaces.delete('subtitles');
      }
    }
  }

  async function ensureExplorerTourSurface(step, token) {
    const target = getCurrentButtonsTourTarget();
    if (!target) return null;
    let overlay = isSurfaceVisibleForTour('.chord-explorer-overlay')
      ? document.querySelector('.chord-explorer-overlay')
      : null;
    if (!overlay) {
      updateButtonsTourCopy(step.title, step.description);
      await clickButtonsTourElement(target, { token });
      buttonsTourState.openedSurfaces.add('explorer');
      overlay = await waitForButtonsTourElement('.chord-explorer-overlay', { timeoutMs: 8000, token });
    }
    return overlay ? { target, overlay } : null;
  }

  async function runExplorerTourMicroAction(step, token) {
    const result = await ensureExplorerTourSurface(step, token);
    if (!result) return;
    const { overlay } = result;

    if (step.subKey === 'open') {
      const input = overlay.querySelector('.ce-search-input');
      await focusButtonsTourControl(input || overlay, step.title, step.description, token, 1100);
      return;
    }

    if (step.subKey === 'search') {
      const input = overlay.querySelector('.ce-search-input');
      if (!input) return;
      updateButtonsTourCopy(step.title, step.description);
      await previewButtonsTourElement(input, token);
      await typeButtonsTourText(input, 'C7', token);
      const suggestion = await waitForButtonsTourCondition(() => {
        const items = document.querySelectorAll('.ce-suggestions-list .ce-suggestion-item');
        return Array.from(items).find(item => (item.dataset.chord || '').toUpperCase() === 'C7') ||
          Array.from(items).find(item => (item.textContent || '').trim().toUpperCase().startsWith('C7')) ||
          null;
      }, { timeoutMs: 5000, token });
      if (suggestion) {
        await clickButtonsTourElement(suggestion, { token });
        await waitForButtonsTourElement('.ce-chord-card', { timeoutMs: 5000, token });
      }
      return;
    }

    if (step.subKey === 'positions') {
      const card = document.querySelector('.ce-chord-card') || overlay;
      await focusButtonsTourControl(card, step.title, step.description, token, 1500);
      return;
    }

    if (step.subKey === 'close') {
      const closeBtn = await waitForButtonsTourElement('.ce-close-btn', { timeoutMs: 3000, token });
      await focusButtonsTourCloseControl(closeBtn, overlay, step.title, step.description, token);
      if (closeBtn) {
        setButtonsTourStepExitAction(async exitToken => {
          const latestCloseBtn = document.querySelector('.ce-close-btn') || closeBtn;
          if (isElementVisibleForTour(latestCloseBtn)) {
            await clickButtonsTourElement(latestCloseBtn, { token: exitToken, move: false });
          } else {
            try { window.ChordExplorer?.close?.(); } catch (e) { }
          }
          buttonsTourState.openedSurfaces.delete('explorer');
        });
      }
    }
  }

  async function ensureTunerTourSurface(step, token) {
    const target = getCurrentButtonsTourTarget();
    if (!target) return null;
    let overlay = isSurfaceVisibleForTour('.tuner-overlay')
      ? document.querySelector('.tuner-overlay')
      : null;
    if (!overlay) {
      updateButtonsTourCopy(step.title, step.description);
      await clickButtonsTourElement(target, { token });
      buttonsTourState.openedSurfaces.add('tuner');
      overlay = await waitForButtonsTourElement('.tuner-overlay', { timeoutMs: 7000, token });
    }
    return overlay ? { target, overlay } : null;
  }

  async function runTunerTourMicroAction(step, token) {
    const result = await ensureTunerTourSurface(step, token);
    if (!result) return;
    const { overlay } = result;
    if (step.subKey === 'open') {
      await focusButtonsTourControl(overlay, step.title, step.description, token, 1200);
      return;
    }
    if (step.subKey === 'close') {
      const closeBtn = await waitForButtonsTourElement('.tuner-close-btn', { timeoutMs: 3000, token });
      await focusButtonsTourCloseControl(closeBtn, overlay, step.title, step.description, token);
      if (closeBtn) {
        setButtonsTourStepExitAction(async exitToken => {
          const latestCloseBtn = document.querySelector('.tuner-close-btn') || closeBtn;
          if (isElementVisibleForTour(latestCloseBtn)) {
            await clickButtonsTourElement(latestCloseBtn, { token: exitToken, move: false });
          } else if (typeof window.closeTuner === 'function') {
            window.closeTuner();
          }
          buttonsTourState.openedSurfaces.delete('tuner');
        });
      }
    }
  }

  function findVisibleButtonsTourTextElement(root, text) {
    const lowerText = text.toLowerCase();
    const elements = Array.from(root?.querySelectorAll?.('button, span, div, label, h1, h2, h3, p') || []);
    const candidates = elements
      .filter(isElementVisibleForTour)
      .map(el => ({
        el,
        value: (el.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase()
      }))
      .filter(item => item.value);
    return candidates.find(item => item.value === lowerText)?.el ||
      candidates.find(item => item.value.includes(lowerText) && item.value.length <= lowerText.length + 36)?.el ||
      null;
  }

  function normalizeButtonsTourSettingsLabel(text) {
    return String(text || '').replace(/●/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function getSettingsQuickControlPair(menu, labelText) {
    const expected = normalizeButtonsTourSettingsLabel(labelText);
    const labels = Array.from(menu?.querySelectorAll?.('span') || [])
      .filter(isElementVisibleForTour);
    const label = labels.find(el => normalizeButtonsTourSettingsLabel(el.textContent) === expected);
    if (!label) return null;

    const labelsRow = label.parentElement;
    const controlsRow = labelsRow?.nextElementSibling;
    if (!labelsRow || !controlsRow) return null;

    const labelIndex = Array.from(labelsRow.children).indexOf(label);
    if (labelIndex < 0) return null;

    const control = controlsRow.children?.[labelIndex] || null;
    if (!isElementVisibleForTour(control)) return null;
    return { label, control };
  }

  async function ensureSettingsTourSurface(step, token) {
    const target = getCurrentButtonsTourTarget();
    if (!target) return null;
    let menu = isSurfaceVisibleForTour('.yc-settings-menu')
      ? document.querySelector('.yc-settings-menu')
      : null;
    if (!menu) {
      updateButtonsTourCopy(step.title, step.description);
      await clickButtonsTourElement(target, { token });
      buttonsTourState.openedSurfaces.add('settings');
      menu = await waitForButtonsTourElement('.yc-settings-menu', { timeoutMs: 8000, token });
    }
    return menu ? { target, menu } : null;
  }

  async function ensureSettingsChordsControls(step, token, wantedText) {
    let result = await ensureSettingsTourSurface(step, token);
    if (!result) return null;
    let { menu } = result;
    if (!wantedText || findVisibleButtonsTourTextElement(menu, wantedText)) return result;

    const toolsHeader = findVisibleButtonsTourTextElement(menu, 'Chords Tools');
    if (toolsHeader) {
      await clickButtonsTourElement(toolsHeader, { token });
      await waitButtonsTourPaced(350, token);
      result = await ensureSettingsTourSurface(step, token);
      menu = result?.menu;
    }
    return result || null;
  }

  async function runSettingsTourMicroAction(step, token) {
    if (step.subKey === 'close') {
      const result = await ensureSettingsTourSurface(step, token);
      const closeTarget = result?.target || getCurrentButtonsTourTarget();
      await focusButtonsTourControl(closeTarget, step.title, step.description, token, 700);
      if (typeof window.closeAllMenus === 'function') {
        window.closeAllMenus();
        buttonsTourState.openedSurfaces.delete('settings');
      }
      return;
    }

    const textByStep = {
      chordsMode: 'Chords Mode',
      quickChords: 'Quick Chords',
      threshold: 'Threshold',
      fretNumbers: 'Fret Numbers'
    };
    const wantedText = textByStep[step.subKey];
    const result = await ensureSettingsChordsControls(step, token, wantedText);
    if (!result) return;
    const { menu } = result;

    if (step.subKey === 'open') {
      const toolsHeader = findVisibleButtonsTourTextElement(menu, 'Chords Tools') || menu;
      await focusButtonsTourControl(toolsHeader, step.title, step.description, token, 1100);
      return;
    }

    if (['quickChords', 'threshold', 'fretNumbers'].includes(step.subKey)) {
      const pair = getSettingsQuickControlPair(menu, wantedText);
      if (pair) {
        await focusButtonsTourCompositeControl(
          [pair.label, pair.control],
          pair.control,
          step.title,
          step.description,
          token,
          1300
        );
        return;
      }
    }

    const item = findVisibleButtonsTourTextElement(menu, wantedText) || menu;
    await focusButtonsTourControl(item, step.title, step.description, token, 1300);
  }

  async function runButtonsTourMainButtonIntro(step, token) {
    const target = getCurrentButtonsTourTarget();
    if (!target) return null;
    updateButtonsTourCopy(step.title, step.description);
    resetButtonsTourFocus();
    await waitButtonsTourPaced(260, token);
    setButtonsTourFocus(target);
    await moveButtonsTourCursorTo(target, token);
    await pauseButtonsTourForUser(1400, token);
    return target;
  }

  async function runTunerTourAction(step, token) {
    const target = await runButtonsTourMainButtonIntro(step, token);
    if (!target) return;
    const wasOpen = isSurfaceVisibleForTour('.tuner-overlay');
    updateButtonsTourCopy('Guitar Tuner', 'Tune your guitar directly inside YouTube before playing along.');
    await clickButtonsTourElement(target, { token });
    if (!wasOpen) buttonsTourState.openedSurfaces.add('tuner');
    const overlay = await waitForButtonsTourElement('.tuner-overlay', { timeoutMs: 7000, token });
    const closeBtn = await waitForButtonsTourElement('.tuner-close-btn', { timeoutMs: 3000, token });
    if (closeBtn) {
      updateButtonsTourCopy('Close Tuner', 'The X closes the tuner and releases its microphone/audio listeners.');
      await pauseButtonsTourForUser(1400, token);
      await clickButtonsTourElement(closeBtn, { token });
      buttonsTourState.openedSurfaces.delete('tuner');
      buttonsTourState.advanceImmediatelyAfterStep = true;
    }
  }

  async function runExplorerTourAction(step, token) {
    const target = await runButtonsTourMainButtonIntro(step, token);
    if (!target) return;
    const wasOpen = isSurfaceVisibleForTour('.chord-explorer-overlay');
    updateButtonsTourCopy('Chord Explorer', 'Search any chord and inspect all available voicings.');
    await clickButtonsTourElement(target, { token });
    if (!wasOpen) buttonsTourState.openedSurfaces.add('explorer');
    const input = await waitForButtonsTourElement('.chord-explorer-overlay .ce-search-input', { timeoutMs: 8000, token });
    if (!input) return;

    updateButtonsTourCopy('Search C7', "Example search: type C7 to find that chord's shapes and positions.");
    setButtonsTourFocus(input);
    await moveButtonsTourCursorTo(input, token);
    await pauseButtonsTourForUser(1200, token);
    await typeButtonsTourText(input, 'C7', token);

    const suggestion = await waitForButtonsTourCondition(() => {
      const items = document.querySelectorAll('.ce-suggestions-list .ce-suggestion-item');
      return Array.from(items).find(item => (item.dataset.chord || '').toUpperCase() === 'C7') ||
        Array.from(items).find(item => (item.textContent || '').trim().toUpperCase().startsWith('C7')) ||
        null;
    }, { timeoutMs: 5000, token });
    if (suggestion) {
      await pauseButtonsTourForUser(1000, token);
      await clickButtonsTourElement(suggestion, { token });
      await waitForButtonsTourElement('.ce-chord-card', { timeoutMs: 5000, token });
    }

    const card = document.querySelector('.ce-chord-card');
    if (card) {
      updateButtonsTourCopy('C7 Positions', 'Explorer shows multiple C7 shapes, with page arrows and fret-number options.');
      setButtonsTourFocus(card);
      await pauseButtonsTourForUser(1600, token);
    }

    const closeBtn = await waitForButtonsTourElement('.ce-close-btn', { timeoutMs: 3000, token });
    if (closeBtn) {
      updateButtonsTourCopy('Close Explorer', 'Closing the explorer also clears its temporary search observers.');
      await pauseButtonsTourForUser(1200, token);
      await clickButtonsTourElement(closeBtn, { token });
      buttonsTourState.openedSurfaces.delete('explorer');
      buttonsTourState.advanceImmediatelyAfterStep = true;
    }
  }

  async function ensureButtonsTourDemoOrExplain(step, token) {
    const target = await runButtonsTourMainButtonIntro(step, token);
    if (!target) return null;
    if (!isTutorialDemoVideo()) {
      updateButtonsTourCopy(step.title, YC_TOUR_DEMO_ONLY_TEXT);
      await pauseButtonsTourForUser(1400, token);
      return null;
    }
    await Promise.all([
      ensureTutorialDemoChords(),
      ensureTutorialDemoSubtitles()
    ]);
    return target;
  }

  async function runPanelTourAction(step, token) {
    const target = await ensureButtonsTourDemoOrExplain(step, token);
    if (!target) return;
    const wasOpen = isSurfaceVisibleForTour('.yt-lyrics-chords-panel');
    updateButtonsTourCopy('Subtitles & Chords Panel', 'Shows synced subtitles and chords in a side panel; Preview keeps chord diagrams visible beside it.');
    await clickButtonsTourElement(target, { token });
    if (!wasOpen) buttonsTourState.openedSurfaces.add('panel');
    const panel = await waitForButtonsTourElement('.yt-lyrics-chords-panel', { timeoutMs: 25000, token });
    if (!panel) return;

    const header = panel.querySelector('.lyrics-chords-header') || panel;
    updateButtonsTourCopy('Panel Controls', 'The header controls text size, preview, panel width, MINI mode, and close.');
    setButtonsTourFocus(header);
    await pauseButtonsTourForUser(1500, token);

    const previewPanelControl = async (control, title, description, waitMs = 1150) => {
      if (!isElementVisibleForTour(control)) return false;
      updateButtonsTourCopy(title, description);
      await previewButtonsTourElement(control, token);
      await pauseButtonsTourForUser(waitMs, token);
      return true;
    };
    const isPanelMiniActive = () => (
      panel.classList.contains('mini-mode') ||
      !!panel.querySelector('#chords-toggle')?.classList.contains('active')
    );
    const textSizeControls = panel.querySelector('#font-decrease')?.closest('.font-size-controls');
    await previewPanelControl(textSizeControls, 'Text Size', 'Text size controls make the lyrics easier to read without changing the video.');

    const getPreviewPanel = () => {
      const previewPanel = (
        window.ycChordsPreviewPanel?.isVisible
          ? window.ycChordsPreviewPanel.panelElement
          : document.querySelector('.yc-preview-panel.visible')
      );
      return isElementVisibleForTour(previewPanel) ? previewPanel : null;
    };
    const previewToggle = panel.querySelector('#chords-preview-toggle');
    let openedPreviewForTour = false;
    await previewPanelControl(previewToggle, 'Preview Toggle', 'Preview opens a separate chord-diagram panel beside the main lyrics panel.');
    let previewPanel = await waitForButtonsTourCondition(getPreviewPanel, {
      timeoutMs: 900,
      intervalMs: 100,
      token
    });
    if (!previewPanel && previewToggle && window.chordsAvailableForPreview !== false) {
      updateButtonsTourCopy('Preview Toggle', 'Preview opens a separate chord-diagram panel beside the main lyrics panel.');
      previewPanel = getPreviewPanel();
      if (!previewPanel) {
        await clickButtonsTourElement(previewToggle, { token });
        openedPreviewForTour = true;
      }
      previewPanel = await waitForButtonsTourCondition(getPreviewPanel, {
        timeoutMs: 5000,
        intervalMs: 120,
        token
      });
    }
    if (previewPanel) {
      if (!wasOpen || openedPreviewForTour) buttonsTourState.openedSurfaces.add('previewPanel');
      updateButtonsTourCopy('Preview Panel', 'This panel keeps chord diagrams visible while the main panel handles synced lyrics and controls.');
      setButtonsTourFocus(previewPanel);
      await pauseButtonsTourForUser(1600, token);
    }

    const panelWidthControls = panel.querySelector('#panel-width-decrease')?.closest('.font-size-controls');
    await previewPanelControl(panelWidthControls, 'Panel Width', 'Panel width controls how much room the lyrics panel uses beside the video.');

    const miniToggle = panel.querySelector('#chords-toggle');
    const miniWasActive = isPanelMiniActive();
    await previewPanelControl(miniToggle, 'MINI', 'MINI keeps the panel compact.');
    if (miniWasActive && miniToggle) {
      updateButtonsTourCopy('Open Controls', 'The tour opens MINI temporarily so the hidden panel controls are visible.');
      await clickButtonsTourElement(miniToggle, { token });
      buttonsTourState.openedSurfaces.add('panelMiniTemporarilyOpened');
      await waitForButtonsTourCondition(() => !isPanelMiniActive(), {
        timeoutMs: 2500,
        intervalMs: 80,
        token
      });
    }

    await previewPanelControl(
      panel.querySelector('#sync-youtube-toggle'),
      'Sync With YouTube',
      'Sync keeps the panel aligned with the YouTube playback time.'
    );
    await previewPanelControl(
      panel.querySelector('#countdown-toggle'),
      'Countdown',
      'Countdown gives a short lead-in before the next lyric or chord moment.'
    );
    await previewPanelControl(
      panel.querySelector('#sentence-mode-toggle'),
      'Sentence Mode',
      'Sentence Mode groups text by punctuation for a cleaner reading flow.'
    );
    await previewPanelControl(
      panel.querySelector('#language-selector-btn'),
      'Language',
      'Language changes the panel text direction and language display when available.'
    );
    await previewPanelControl(
      panel.querySelector('#auto-scroll-toggle'),
      'Auto Scroll',
      'Auto Scroll lets the panel follow the song hands-free.'
    );
    await previewPanelControl(
      panel.querySelector('.speed-controls'),
      'Scroll Speed',
      'Scroll speed controls how fast the panel moves when Auto Scroll is on.'
    );
    await previewPanelControl(
      panel.querySelector('#theme-cycle-btn'),
      'Theme',
      'Theme switches the panel between the available visual styles.'
    );

    const content = panel.querySelector('.lyrics-chords-content') || panel;
    updateButtonsTourCopy('Synced Lyrics', 'The main panel follows the video with synchronized text and chord previews.');
    setButtonsTourFocus(content);
    await pauseButtonsTourForUser(1500, token);

    if (miniWasActive && miniToggle && isElementVisibleForTour(miniToggle) && !isPanelMiniActive()) {
      updateButtonsTourCopy('Restore MINI', 'The tour restores MINI so the panel returns to its original compact default.');
      await clickButtonsTourElement(miniToggle, { token });
      const miniRestored = await waitForButtonsTourCondition(() => isPanelMiniActive(), {
        timeoutMs: 2500,
        intervalMs: 80,
        token
      });
      if (miniRestored) buttonsTourState.openedSurfaces.delete('panelMiniTemporarilyOpened');
    }

    const closeBtn = panel.querySelector('.lyrics-chords-close');
    if (closeBtn) {
      updateButtonsTourCopy('Panel Ready', 'Subtitles are now cached, so the subtitle-only button can reuse them later in the tour.');
      setButtonsTourFocus(closeBtn);
      await pauseButtonsTourForUser(1300, token);
      await clickButtonsTourElement(closeBtn, { token });
      buttonsTourState.openedSurfaces.delete('panel');
      buttonsTourState.advanceImmediatelyAfterStep = true;
    }
  }

  async function runCarouselTourAction(step, token) {
    const target = await ensureButtonsTourDemoOrExplain(step, token);
    if (!target) return;
    const wasOpen = isSurfaceVisibleForTour('.yc-chord-carousel');
    updateButtonsTourCopy('Chords Carousel', 'The carousel shows each song chord as a card over the video so you can follow and switch positions while playing.');
    await clickButtonsTourElement(target, { token });
    if (!wasOpen) buttonsTourState.openedSurfaces.add('carousel');
    const carousel = await waitForButtonsTourElement('.yc-chord-carousel', { timeoutMs: 18000, token });
    if (!carousel) return;
    buttonsTourState.carouselRestoreState = captureButtonsTourCarouselRestoreState();

    setButtonsTourCarouselControlsLocked(true);
    buttonsTourState.openedSurfaces.add('carouselControls');
    if (window.ycChordCarousel?._applyQuickModeSwitchVisibility) {
      try {
        window.ycChordCarousel._applyQuickModeSwitchVisibility(true);
        buttonsTourState.openedSurfaces.add('carouselModeVisibility');
      } catch (e) { }
    }

    const tile = await waitForButtonsTourElement('.yc-chord-tile', { timeoutMs: 5000, token });
    if (tile) {
      updateButtonsTourCopy('Chord Card', 'Each card shows the current chord, timing, diagram, and quick edit actions.');
      setButtonsTourFocus(tile);
      await pauseButtonsTourForUser(1600, token);
    }

    const leftArrow = document.querySelector('.yc-chord-tile svg .chord-arrow-left, .chord-arrow-left');
    if (leftArrow) {
      updateButtonsTourCopy('Previous Position', 'The left arrow moves back through alternate positions for the current chord.');
      await previewButtonsTourElement(leftArrow, token);
      await pauseButtonsTourForUser(1200, token);
      await clickButtonsTourElement(leftArrow, { token, dispatch: false });
    }

    const rightArrow = document.querySelector('.yc-chord-tile svg .chord-arrow-right, .chord-arrow-right');
    if (rightArrow) {
      updateButtonsTourCopy('Next Position', 'The right arrow moves forward through alternate positions for the same chord.');
      await previewButtonsTourElement(rightArrow, token);
      await pauseButtonsTourForUser(1200, token);
      await clickButtonsTourElement(rightArrow, { token, dispatch: false });
    }

    const counter = document.querySelector('.yc-chord-tile svg .chord-position-counter, .chord-position-counter');
    if (counter) {
      updateButtonsTourCopy('Preferred Position', 'The position number is where users choose the voicing they prefer to keep seeing across songs.');
      await previewButtonsTourElement(counter, token);
      await pauseButtonsTourForUser(1400, token);
      await clickButtonsTourElement(counter, { token, dispatch: false });
    }

    const capoIcon = document.querySelector('.yc-capo-carousel .yc-capo-icon');
    if (capoIcon) {
      updateButtonsTourCopy('Capo', 'Capo toggles the carousel chord names into the selected capo position.');
      await previewButtonsTourElement(capoIcon, token);
      await pauseButtonsTourForUser(1200, token);
      await clickButtonsTourElement(capoIcon, { token });
    }

    const capoNumber = document.querySelector('.yc-capo-carousel .yc-capo-fret-number');
    if (capoNumber) {
      updateButtonsTourCopy('Capo Number', 'The capo number opens fret choices so users can pick the capo fret.');
      await previewButtonsTourElement(capoNumber, token);
      await pauseButtonsTourForUser(1200, token);
      await clickButtonsTourElement(capoNumber, { token });
      const capoDropdown = await waitForButtonsTourElement('.yc-capo-dropdown', { timeoutMs: 2500, token });
      if (capoDropdown) {
        setButtonsTourFocus(capoDropdown);
        await pauseButtonsTourForUser(900, token);
        const previousFret = buttonsTourState.carouselRestoreState?.capoFret;
        const nextFretCell = Array.from(capoDropdown.querySelectorAll('.yc-capo-fret-cell'))
          .find(cell => {
            const match = (cell.textContent || '').match(/\d+/);
            return match && Number(match[0]) !== previousFret;
          }) || capoDropdown.querySelector('.yc-capo-fret-cell');
        if (nextFretCell) {
          await clickButtonsTourElement(nextFretCell, { token });
          await waitButtonsTourPaced(450, token);
        } else {
          closeButtonsTourCapoDropdown();
        }
      }
    }

    const diceBtn = document.querySelector('.yc-dice-carousel');
    if (diceBtn) {
      updateButtonsTourCopy('Random Positions', 'The dice can randomize chord positions for users who want fresh voicings.');
      await previewButtonsTourElement(diceBtn, token);
      await pauseButtonsTourForUser(1200, token);
      await clickButtonsTourElement(diceBtn, { token });
      await waitButtonsTourPaced(550, token);
    }

    const editBtn = document.querySelector('.yc-chord-action-edit');
    if (editBtn) {
      updateButtonsTourCopy('Edit', 'Edit lets users change a detected chord without reprocessing the video.');
      await previewButtonsTourElement(editBtn, token);
      await pauseButtonsTourForUser(1300, token);
      await clickButtonsTourElement(editBtn, { token, dispatch: false });
    }

    const removeBtn = document.querySelector('.yc-chord-action-remove');
    if (removeBtn) {
      updateButtonsTourCopy('Remove', 'X removes a wrong chord from the current song arrangement.');
      await previewButtonsTourElement(removeBtn, token);
      await pauseButtonsTourForUser(1300, token);
      await clickButtonsTourElement(removeBtn, { token, dispatch: false });
    }

    const infoBtn = document.querySelector('.yc-carousel-info-btn');
    if (infoBtn) {
      updateButtonsTourCopy('Info', 'Info summarizes the song chords and the chord vocabulary used in this video.');
      await previewButtonsTourElement(infoBtn, token);
      await pauseButtonsTourForUser(1300, token);
      await clickButtonsTourElement(infoBtn, { token });
      buttonsTourState.openedSurfaces.add('carouselPopups');
      const infoPopup = await waitForButtonsTourElement('[role="dialog"][aria-label="Song chord info"]', { timeoutMs: 2500, token });
      if (infoPopup) {
        setButtonsTourFocus(infoPopup);
        await pauseButtonsTourForUser(1600, token);
      }
      try { window.chordEditsManager?.closeChordInfoPopup?.(); } catch (e) { }
    }

    const editsBtn = document.querySelector('.yc-carousel-edits-btn');
    if (editsBtn) {
      updateButtonsTourCopy('Edits Summary', 'The pencil shows saved edits and quick-chord changes for the current song.');
      await previewButtonsTourElement(editsBtn, token);
      await pauseButtonsTourForUser(1300, token);
      await clickButtonsTourElement(editsBtn, { token });
      buttonsTourState.openedSurfaces.add('carouselPopups');
      const editsPopup = await waitForButtonsTourElement('[role="dialog"][aria-label="Chord edits summary"]', { timeoutMs: 2500, token });
      if (editsPopup) {
        setButtonsTourFocus(editsPopup);
        await pauseButtonsTourForUser(1600, token);
      }
      try { window.chordEditsManager?.closeChordEditsSummaryPopup?.(); } catch (e) { }
    }

    const sizeBtn = document.querySelector('.yc-carousel-size-btn');
    if (sizeBtn) {
      updateButtonsTourCopy('A Size Control', 'A opens quick size controls for the carousel and subtitle text.');
      await previewButtonsTourElement(sizeBtn, token);
      await pauseButtonsTourForUser(1300, token);
      await clickButtonsTourElement(sizeBtn, { token });
      buttonsTourState.openedSurfaces.add('carouselPopups');
      const sizePopup = await waitForButtonsTourElement('[role="dialog"][aria-label="Quick size controls"]', { timeoutMs: 2500, token });
      if (sizePopup) {
        setButtonsTourFocus(sizePopup);
        await pauseButtonsTourForUser(1600, token);
      }
      try { window.ycChordCarousel?._closeCarouselSizePopup?.(); } catch (e) { }
    }

    const normalizeMode = modeValue => (
      window.ycChordCarousel?._normalizeModeValue
        ? window.ycChordCarousel._normalizeModeValue(modeValue)
        : (['regular', 'regularPlus', 'harmonic', 'harmonicPlus'].includes(modeValue) ? modeValue : 'regular')
    );
    const getModeButton = modeValue => {
      const labels = { regular: 'R', regularPlus: 'R+', harmonic: 'H', harmonicPlus: 'H+' };
      const label = labels[normalizeMode(modeValue)];
      return Array.from(document.querySelectorAll('.yc-carousel-mode-btn'))
        .find(btn => (btn.textContent || '').trim() === label) || null;
    };
    const previousMode = normalizeMode(window.chordsMode || 'regular');
    const modeSteps = [
      { value: 'regular', title: 'Mode R', description: 'R keeps the primary chord detection mode active.' },
      { value: 'regularPlus', title: 'Mode R+', description: 'R+ keeps the previous regular interpretation available for comparison.' },
      { value: 'harmonic', title: 'Mode H', description: 'H switches the carousel to the harmonic chord interpretation.' },
      { value: 'harmonicPlus', title: 'Mode H+', description: 'H+ shows the expanded harmonic mode when users want richer chord options.' }
    ];
    for (const modeStep of modeSteps) {
      const modeBtn = getModeButton(modeStep.value);
      if (!modeBtn) continue;
      updateButtonsTourCopy(modeStep.title, modeStep.description);
      await previewButtonsTourElement(modeBtn, token);
      await pauseButtonsTourForUser(1300, token);
      await clickButtonsTourElement(modeBtn, { token });
      await waitButtonsTourPaced(550, token);
    }
    const restoreModeBtn = getModeButton(previousMode);
    if (restoreModeBtn && normalizeMode(window.chordsMode || 'regular') !== previousMode) {
      await clickButtonsTourElement(restoreModeBtn, { token });
      await waitButtonsTourPaced(450, token);
    }

    if (buttonsTourState.carouselRestoreState) {
      updateButtonsTourCopy('Restore Carousel', 'The tour restores the temporary Capo and Dice changes before closing.');
      await pauseButtonsTourForUser(900, token);
      closeButtonsTourCapoDropdown();
      restoreButtonsTourCarouselState();
      await waitButtonsTourPaced(450, token);
    }

    updateButtonsTourCopy('Close Carousel', 'Clicking the carousel button again closes the carousel before moving on.');
    await previewButtonsTourElement(target, token);
    await pauseButtonsTourForUser(1300, token);
    try { window.ycChordCarousel?._applyQuickModeSwitchVisibility?.(); } catch (e) { }
    setButtonsTourCarouselControlsLocked(false);
    buttonsTourState.openedSurfaces.delete('carouselModeVisibility');
    buttonsTourState.openedSurfaces.delete('carouselControls');
    buttonsTourState.openedSurfaces.delete('carouselPopups');
    await clickButtonsTourElement(target, { token });
    buttonsTourState.openedSurfaces.delete('carousel');
  }

  async function runSubtitlesTourAction(step, token) {
    const target = await ensureButtonsTourDemoOrExplain(step, token);
    if (!target) return;
    const wasVisible = !!window.subtitleState?.isVisible;
    updateButtonsTourCopy('Subtitles', 'Shows subtitles from YouTube locally when available, or from Gemini when an API key is set.');
    await clickButtonsTourElement(target, { token });
    if (!wasVisible) buttonsTourState.openedSurfaces.add('subtitles');
    await waitForButtonsTourCondition(() => window.subtitleState?.isVisible || document.getElementById('yc-subtitle-auth-modal'), {
      timeoutMs: 12000,
      token
    });
    const overlay = window.subtitleState?.overlay;
    if (overlay) {
      updateButtonsTourCopy('Subtitle Overlay', 'Subtitle-only mode keeps the synced text on top of the video.');
      setButtonsTourFocus(overlay);
      await pauseButtonsTourForUser(1700, token);
    }
    if (window.subtitleState?.isVisible) {
      await pauseButtonsTourForUser(1100, token);
      await clickButtonsTourElement(target, { token });
      buttonsTourState.openedSurfaces.delete('subtitles');
    }
  }

  async function runSettingsTourAction(step, token) {
    const target = await runButtonsTourMainButtonIntro(step, token);
    if (!target) return;
    const wasOpen = isSurfaceVisibleForTour('.yc-settings-menu');
    updateButtonsTourCopy('Settings', 'Settings contains the chord behavior controls used most often during playback.');
    await clickButtonsTourElement(target, { token });
    if (!wasOpen) buttonsTourState.openedSurfaces.add('settings');
    let menu = await waitForButtonsTourElement('.yc-settings-menu', { timeoutMs: 8000, token });
    if (!menu) return;

    const ensureSettingsMenu = async () => {
      const visibleMenu = document.querySelector('.yc-settings-menu');
      if (isElementVisibleForTour(visibleMenu)) return visibleMenu;
      await clickButtonsTourElement(target, { token });
      buttonsTourState.openedSurfaces.add('settings');
      return waitForButtonsTourElement('.yc-settings-menu', { timeoutMs: 5000, token });
    };
    const ensureChordsToolsExpanded = async () => {
      menu = await ensureSettingsMenu();
      if (!menu) return null;
      const toolsHeader = findButtonsTourTextElement(menu, 'Chords Tools');
      if (toolsHeader) {
        await clickButtonsTourElement(toolsHeader, { token });
        await waitButtonsTourPaced(350, token);
        menu = await ensureSettingsMenu();
      }
      return menu;
    };
    const previewSettingsItem = async (text, title, description) => {
      menu = await ensureChordsToolsExpanded();
      if (!menu) return false;
      const item = findButtonsTourTextElement(menu, text);
      if (!item) return false;
      updateButtonsTourCopy(title, description);
      await previewButtonsTourElement(item, token);
      await pauseButtonsTourForUser(1400, token);
      return true;
    };

    let chordsMode = findButtonsTourTextElement(menu, 'Chords Mode') || findButtonsTourTextElement(menu, 'Chords Tools');
    if (chordsMode) {
      updateButtonsTourCopy('Chords Mode', 'Choose R, R+, H, or H+ chord modes from here.');
      await previewButtonsTourElement(chordsMode, token);
      await pauseButtonsTourForUser(1400, token);
      if ((chordsMode.textContent || '').includes('Chords Tools')) {
        await clickButtonsTourElement(chordsMode, { token });
        await waitButtonsTourPaced(400, token);
      }
    }

    await previewSettingsItem(
      'Quick Chords',
      'Quick Chords',
      'Quick Chords hides very short passing chords when you want a cleaner view.'
    );
    await previewSettingsItem(
      'Threshold',
      'Quick Chords Threshold',
      'Threshold decides how short a chord must be before it is treated as quick.'
    );
    await previewSettingsItem(
      'Fret Numbers',
      'Fret Number',
      'Fret Numbers controls extra fret labels on chord diagrams.'
    );

    if (typeof window.closeAllMenus === 'function') {
      window.closeAllMenus();
      buttonsTourState.openedSurfaces.delete('settings');
    }
  }

  async function advanceButtonsTourStep() {
    if (!buttonsTourState.active || !buttonsTourState.mode) return;
    if (buttonsTourState.advancingStep) return;
    buttonsTourState.advancingStep = true;
    const token = buttonsTourState.actionToken;
    try {
      await runButtonsTourPendingStepExitAction(token);
      if (!buttonsTourState.active || token !== buttonsTourState.actionToken) return;
      if (buttonsTourState.index >= buttonsTourState.steps.length - 1) {
        stopButtonsTour({ markSeen: true, openPopupTour: true });
        return;
      }
      buttonsTourState.index += 1;
      renderButtonsTourStep();
    } finally {
      buttonsTourState.advancingStep = false;
    }
  }

  async function runButtonsTourStepAction(step, token) {
    try {
      switch (step.mainKey || step.key) {
        case 'tuner':
          await runTunerTourMicroAction(step, token);
          break;
        case 'explorer':
          await runExplorerTourMicroAction(step, token);
          break;
        case 'panel':
          await runPanelTourMicroAction(step, token);
          break;
        case 'carousel':
          await runCarouselTourMicroAction(step, token);
          break;
        case 'subtitles':
          await runSubtitlesTourMicroAction(step, token);
          break;
        case 'settings':
          await runSettingsTourMicroAction(step, token);
          break;
        default:
          await runButtonsTourMainButtonIntro(step, token);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.warn('[Tour] Step action failed:', error);
      }
    } finally {
      if (buttonsTourState.active && token === buttonsTourState.actionToken) {
        const shouldAdvanceImmediately = buttonsTourState.advanceImmediatelyAfterStep;
        const queuedManualAdvance = buttonsTourState.mode === 'manual' &&
          (buttonsTourState.manualAdvanceQueue > 0 || buttonsTourState.manualStepAdvanceRequested);
        buttonsTourState.advanceImmediatelyAfterStep = false;
        buttonsTourState.stepRunning = false;
        buttonsTourState.stepComplete = true;
        buttonsTourState.manualAdvanceQueue = 0;
        buttonsTourState.manualStepAdvanceRequested = false;
        if (shouldAdvanceImmediately || queuedManualAdvance) {
          await advanceButtonsTourStep();
          return;
        }
        updateButtonsTourCopy(step.title, step.description);
        if (buttonsTourState.nextBtn) {
          buttonsTourState.nextBtn.disabled = false;
          buttonsTourState.nextBtn.textContent =
            buttonsTourState.index >= buttonsTourState.steps.length - 1 ? 'Continue' : 'Next';
        }
        if (buttonsTourState.mode === 'auto') {
          setButtonsTourTimeout(() => {
            if (
              buttonsTourState.active &&
              buttonsTourState.mode === 'auto' &&
              token === buttonsTourState.actionToken &&
              buttonsTourState.stepComplete
            ) {
              advanceButtonsTourStep();
            }
          }, getButtonsTourPacedMs(900));
        }
      }
    }
  }

  function renderButtonsTourStep() {
    if (!buttonsTourState.active) return;
    const step = buttonsTourState.steps[buttonsTourState.index];
    if (!step) {
      stopButtonsTour({ markSeen: true });
      return;
    }
    const nextMainKey = step.mainKey || step.key;
    const isSameMainStep = buttonsTourState.activeMainKey === nextMainKey;
    buttonsTourState.actionToken += 1;
    clearButtonsTourActionTimers();
    buttonsTourState.pendingStepExitAction = null;
    if (!isSameMainStep) {
      closeButtonsTourOpenedSurfaces();
      resetButtonsTourFocus();
      buttonsTourState.activeMainKey = nextMainKey;
    } else if (nextMainKey === 'carousel') {
      closeButtonsTourTransientSurfaces();
    }
    buttonsTourState.stepRunning = true;
    buttonsTourState.stepComplete = false;
    buttonsTourState.manualAdvanceQueue = 0;
    buttonsTourState.manualStepAdvanceRequested = false;
    buttonsTourState.advanceImmediatelyAfterStep = false;
    buttonsTourState.card?.classList.remove('yc-tour-choice-active');
    updateButtonsTourModeUi();
    buttonsTourState.title.textContent = step.title;
    buttonsTourState.description.textContent = step.description;
    const mainStepsCount = buttonsTourState.mainStepsCount || step.mainTotal || buttonsTourState.steps.length;
    const totalFlowSteps = mainStepsCount + YC_POPUP_TOUR_STEPS_COUNT;
    const mainStepNumber = Number.isFinite(step.mainIndex) ? step.mainIndex + 1 : buttonsTourState.index + 1;
    const subStepText = step.subTotal > 1 ? ` · ${step.subIndex + 1}/${step.subTotal}` : '';
    buttonsTourState.counter.textContent = `Step ${mainStepNumber}/${totalFlowSteps}${subStepText}`;
    buttonsTourState.prevBtn.disabled = buttonsTourState.index === 0;
    buttonsTourState.prevBtn.style.display = '';
    buttonsTourState.nextBtn.style.display = '';
    buttonsTourState.nextBtn.disabled = false;
    buttonsTourState.nextBtn.textContent = 'Next';
    if (!isSameMainStep) {
      positionButtonsTour();
    }
    const token = buttonsTourState.actionToken;
    runButtonsTourStepAction(step, token);
  }

  function startButtonsTourPositionLoop() {
    if (buttonsTourState.positionTimerId) {
      clearInterval(buttonsTourState.positionTimerId);
    }
    buttonsTourState.positionTimerId = setInterval(() => {
      if (!buttonsTourState.active) return;
      pauseButtonsTourVideo();
      positionButtonsTour();
    }, 300);
  }

  function showButtonsTourModeChoice() {
    if (!buttonsTourState.active) return;
    buttonsTourState.mode = null;
    buttonsTourState.stepRunning = false;
    buttonsTourState.stepComplete = false;
    buttonsTourState.card?.classList.remove('yc-tour-auto-active');
    updateButtonsTourModeUi();
    clearButtonsTourActionTimers();
    closeButtonsTourOpenedSurfaces();
    resetButtonsTourFocus();
    buttonsTourState.activeMainKey = null;

    updateButtonsTourCopy(
      'Choose Tutorial Mode',
      'Manual waits for Next at every action. Auto runs by itself. Video launches the full recording demo.'
    );
    if (buttonsTourState.counter) buttonsTourState.counter.textContent = 'Setup';
    if (buttonsTourState.prevBtn) {
      buttonsTourState.prevBtn.disabled = true;
      buttonsTourState.prevBtn.style.display = 'none';
    }
    if (buttonsTourState.nextBtn) {
      buttonsTourState.nextBtn.disabled = true;
      buttonsTourState.nextBtn.style.display = 'none';
      buttonsTourState.nextBtn.textContent = 'Next';
    }
    updateButtonsTourSpeedUi();
    positionButtonsTour();
  }

  function chooseButtonsTourMode(mode) {
    if (!buttonsTourState.active) return;
    buttonsTourState.mode = mode === 'auto' ? 'auto' : 'manual';
    buttonsTourState.card?.classList.remove('yc-tour-choice-active');
    updateButtonsTourModeUi();
    renderButtonsTourStep();
  }

  function injectButtonsTourVideoDemoScript() {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) {
        reject(new Error('Chrome runtime URL is not available.'));
        return;
      }

      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('utils/chrome_store_recording_demo_console.js');
      script.async = false;
      script.dataset.ycRecordingDemoConfig = JSON.stringify({
        autoStart: true,
        countdownSeconds: 3,
        countdownShowZero: false,
        hideYouTubePageElements: false
      });
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = () => {
        script.remove();
        reject(new Error('Recording demo script failed to load.'));
      };
      (document.documentElement || document.head || document.body).appendChild(script);
    });
  }

  async function startButtonsTourVideoDemo() {
    if (!buttonsTourState.active) return;
    if (!isTutorialDemoVideo()) {
      console.info(
        `[Tour] Video tutorial is only available on https://www.youtube.com/watch?v=${YC_TUTORIAL_DEMO_VIDEO_ID}`
      );
      return;
    }
    stopButtonsTour({ markSeen: false });

    try {
      await injectButtonsTourVideoDemoScript();
      setButtonsTourSeen();
    } catch (error) {
      console.warn('[Tour] Failed to start video demo:', error);
    }
  }

  function switchButtonsTourMode() {
    if (!buttonsTourState.active || !buttonsTourState.mode) return;
    const previousMode = buttonsTourState.mode;
    const nextMode = previousMode === 'auto' ? 'manual' : 'auto';
    const token = buttonsTourState.actionToken;
    buttonsTourState.mode = nextMode;
    updateButtonsTourModeUi();

    if (nextMode === 'auto') {
      if (buttonsTourState.nextBtn) buttonsTourState.nextBtn.disabled = false;
      if (previousMode === 'manual') {
        continueButtonsTourManualWaiter();
      }
      if (buttonsTourState.stepComplete) {
        setButtonsTourTimeout(() => {
          if (
            buttonsTourState.active &&
            buttonsTourState.mode === 'auto' &&
            token === buttonsTourState.actionToken &&
            buttonsTourState.stepComplete
          ) {
            advanceButtonsTourStep();
          }
        }, getButtonsTourPacedMs(650));
      }
      return;
    }

    if (buttonsTourState.nextBtn) {
      buttonsTourState.nextBtn.disabled = false;
    }
  }

  async function startButtonsFirstRunTour(force = false) {
    if (buttonsTourState.active || window.extensionDisabled) return;
    if (!isTutorialDemoVideo()) {
      if (force) {
        console.info(
          `[Tour] YouChords tutorial is only available on https://www.youtube.com/watch?v=${YC_TUTORIAL_DEMO_VIDEO_ID}`
        );
      }
      return;
    }

    const activeAdReason = getActiveYouTubeAdBlockReason({ includeTutorialDemo: true });
    if (activeAdReason) {
      if (force) {
        console.info('[Tour] Waiting for the YouTube ad to finish before starting the tutorial.');
      } else {
        scheduleButtonsFirstRunTour(YC_BUTTONS_TOUR_AD_RETRY_MS);
      }
      return;
    }

    if (!force) {
      if (buttonsTourCheckInFlight) return;
      buttonsTourCheckInFlight = true;
      const seen = await getButtonsTourSeen();
      buttonsTourCheckInFlight = false;
      if (seen) return;
    }

    const mainSteps = collectAvailableButtonsTourSteps();
    const steps = expandButtonsTourSteps(mainSteps);
    if (steps.length === 0) return;

    ensureButtonsTourStyle();
    cleanupButtonsTourDom();

    const overlay = document.createElement('div');
    overlay.id = 'yc-buttons-tour-overlay';

    const highlight = document.createElement('div');
    highlight.id = 'yc-buttons-tour-highlight';

    const cursor = document.createElement('div');
    cursor.id = 'yc-buttons-tour-cursor';
    cursor.innerHTML = `
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M9.2 2.8c1.1 0 2 .9 2 2v9.1l1.1-1.1c.8-.8 2-.8 2.8 0l.8.8.9-.9c.8-.8 2-.8 2.8 0l.8.8.7-.7c.8-.8 2.1-.7 2.8.1l.3.3c.4.5.6 1.1.5 1.7l-.8 8.2c-.3 3.3-3.1 5.9-6.5 5.9h-4.2c-2.1 0-4.1-1-5.4-2.7l-4.3-5.7c-.7-1-.5-2.3.5-3 .9-.7 2.2-.5 2.9.4l.3.4V4.8c0-1.1.9-2 2-2Z" fill="#fff" stroke="#111" stroke-width="1.7" stroke-linejoin="round"/>
        <path d="M11.2 14v5.3" stroke="#111" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      <span class="yc-tour-click-ring"></span>
    `;

    const card = document.createElement('div');
    card.id = 'yc-buttons-tour-card';
    card.innerHTML = `
      <h4></h4>
      <p></p>
      <div class="yc-tour-mode-choice">
        <button class="yc-tour-btn yc-tour-btn-primary yc-tour-btn-wide yc-tour-manual">MANUAL</button>
        <button class="yc-tour-btn yc-tour-btn-ghost yc-tour-btn-wide yc-tour-auto">AUTO</button>
        <button class="yc-tour-btn yc-tour-btn-ghost yc-tour-btn-wide yc-tour-video">VIDEO</button>
      </div>
      <div class="yc-tour-speed">
        <div class="yc-tour-speed-row">
          <span>Tour speed</span>
          <span class="yc-tour-speed-value"></span>
        </div>
        <input class="yc-tour-speed-input" type="range" min="1" max="5" step="1" value="5" aria-label="Tutorial speed">
      </div>
      <div class="yc-tour-footer">
        <span class="yc-tour-counter"></span>
        <div class="yc-tour-actions">
          <button class="yc-tour-btn yc-tour-btn-ghost yc-tour-skip">Skip</button>
          <button class="yc-tour-btn yc-tour-btn-ghost yc-tour-prev">Back</button>
          <button class="yc-tour-btn yc-tour-btn-primary yc-tour-next">Next</button>
        </div>
      </div>
    `;

    const modeSwitchBtn = document.createElement('button');
    modeSwitchBtn.id = 'yc-buttons-tour-mode-switch';
    modeSwitchBtn.type = 'button';
    modeSwitchBtn.textContent = 'Switch to Manual';

    document.body.appendChild(overlay);
    document.body.appendChild(highlight);
    document.body.appendChild(cursor);
    document.body.appendChild(card);
    document.body.appendChild(modeSwitchBtn);

    buttonsTourState.active = true;
    lockButtonsTourPageScrollToVideo();
    setButtonsTourControlsForced(true);
    pauseButtonsTourVideo();
    buttonsTourState.steps = steps;
    buttonsTourState.mainStepsCount = mainSteps.length;
    buttonsTourState.activeMainKey = null;
    buttonsTourState.index = 0;
    buttonsTourState.overlay = overlay;
    buttonsTourState.highlight = highlight;
    buttonsTourState.cursor = cursor;
    buttonsTourState.card = card;
    buttonsTourState.title = card.querySelector('h4');
    buttonsTourState.description = card.querySelector('p');
    buttonsTourState.counter = card.querySelector('.yc-tour-counter');
    buttonsTourState.prevBtn = card.querySelector('.yc-tour-prev');
    buttonsTourState.nextBtn = card.querySelector('.yc-tour-next');
    buttonsTourState.modeChoice = card.querySelector('.yc-tour-mode-choice');
    buttonsTourState.manualModeBtn = card.querySelector('.yc-tour-manual');
    buttonsTourState.autoModeBtn = card.querySelector('.yc-tour-auto');
    buttonsTourState.videoModeBtn = card.querySelector('.yc-tour-video');
    buttonsTourState.speedRange = card.querySelector('.yc-tour-speed-input');
    buttonsTourState.speedLabel = card.querySelector('.yc-tour-speed-value');
    buttonsTourState.modeSwitchBtn = modeSwitchBtn;
    updateButtonsTourSpeedUi();

    const blurTourChromeControl = event => {
      try { event?.currentTarget?.blur?.(); } catch (e) { }
    };
    const onSkip = (event) => {
      blurTourChromeControl(event);
      stopButtonsTour({ markSeen: true });
    };
    const onPrev = async (event) => {
      blurTourChromeControl(event);
      if (!buttonsTourState.mode) return;
      if (buttonsTourState.index > 0) {
        const token = buttonsTourState.actionToken;
        await runButtonsTourPendingStepExitAction(token, { isBack: true });
        if (!buttonsTourState.active || token !== buttonsTourState.actionToken) return;
        buttonsTourState.index -= 1;
        renderButtonsTourStep();
      }
    };
    const onNext = (event) => {
      blurTourChromeControl(event);
      if (!buttonsTourState.mode) return;
      if (continueButtonsTourManualWaiter()) {
        return;
      }
      if (buttonsTourState.mode === 'manual' && buttonsTourState.stepRunning) {
        buttonsTourState.manualAdvanceQueue = Math.min(buttonsTourState.manualAdvanceQueue + 1, 8);
        return;
      }
      advanceButtonsTourStep();
    };
    const onManualMode = (event) => {
      blurTourChromeControl(event);
      chooseButtonsTourMode('manual');
    };
    const onAutoMode = (event) => {
      blurTourChromeControl(event);
      chooseButtonsTourMode('auto');
    };
    const onVideoMode = (event) => {
      blurTourChromeControl(event);
      startButtonsTourVideoDemo();
    };
    const onSwitchMode = (event) => {
      blurTourChromeControl(event);
      switchButtonsTourMode();
    };
    const stopTourChromeEvent = event => {
      event.stopPropagation();
    };
    const onSpeedInput = (event) => {
      const nextSpeed = clamp(Number(event.currentTarget.value) || 2, 1, 5);
      buttonsTourState.speed = nextSpeed;
      updateButtonsTourSpeedUi();
    };
    const onKeydown = (e) => {
      if (!buttonsTourState.active) return;
      if (e.key === 'Escape') {
        stopButtonsTour({ markSeen: true });
      } else if (e.key === 'Enter' && buttonsTourState.mode === 'manual') {
        onNext();
      }
    };
    const onResize = () => positionButtonsTour();
    const onScroll = () => keepButtonsTourPageScrollLocked();

    const skipBtn = card.querySelector('.yc-tour-skip');
    skipBtn.addEventListener('click', onSkip);
    buttonsTourState.prevBtn.addEventListener('click', onPrev);
    buttonsTourState.nextBtn.addEventListener('click', onNext);
    buttonsTourState.manualModeBtn?.addEventListener('click', onManualMode);
    buttonsTourState.autoModeBtn?.addEventListener('click', onAutoMode);
    buttonsTourState.videoModeBtn?.addEventListener('click', onVideoMode);
    buttonsTourState.modeSwitchBtn?.addEventListener('click', onSwitchMode);
    buttonsTourState.speedRange?.addEventListener('input', onSpeedInput);
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach(eventName => {
      card.addEventListener(eventName, stopTourChromeEvent);
      modeSwitchBtn.addEventListener(eventName, stopTourChromeEvent);
    });
    window.addEventListener('keydown', onKeydown, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    buttonsTourState.cleanupFns.push(() => skipBtn.removeEventListener('click', onSkip));
    buttonsTourState.cleanupFns.push(() => buttonsTourState.prevBtn?.removeEventListener('click', onPrev));
    buttonsTourState.cleanupFns.push(() => buttonsTourState.nextBtn?.removeEventListener('click', onNext));
    buttonsTourState.cleanupFns.push(() => buttonsTourState.manualModeBtn?.removeEventListener('click', onManualMode));
    buttonsTourState.cleanupFns.push(() => buttonsTourState.autoModeBtn?.removeEventListener('click', onAutoMode));
    buttonsTourState.cleanupFns.push(() => buttonsTourState.videoModeBtn?.removeEventListener('click', onVideoMode));
    buttonsTourState.cleanupFns.push(() => buttonsTourState.modeSwitchBtn?.removeEventListener('click', onSwitchMode));
    buttonsTourState.cleanupFns.push(() => buttonsTourState.speedRange?.removeEventListener('input', onSpeedInput));
    buttonsTourState.cleanupFns.push(() => {
      ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach(eventName => {
        card.removeEventListener(eventName, stopTourChromeEvent);
        modeSwitchBtn.removeEventListener(eventName, stopTourChromeEvent);
      });
    });
    buttonsTourState.cleanupFns.push(() => window.removeEventListener('keydown', onKeydown));
    buttonsTourState.cleanupFns.push(() => window.removeEventListener('resize', onResize));
    buttonsTourState.cleanupFns.push(() => window.removeEventListener('scroll', onScroll));

    startButtonsTourPositionLoop();
    showButtonsTourModeChoice();
  }

  function scheduleButtonsFirstRunTour(delayMs = 800) {
    if (buttonsTourState.active || window.extensionDisabled) return;
    if (!isTutorialDemoVideo()) return;
    if (buttonsTourScheduleTimer) return;
    buttonsTourScheduleTimer = setTimeout(() => {
      buttonsTourScheduleTimer = null;
      startButtonsFirstRunTour(false).catch(err => {
        console.warn('[Tour] Failed to start first-run tour:', err);
      });
    }, delayMs);
  }

  // Debug helper (manual re-run from console)
  window.__ycStartButtonsTour = () => startButtonsFirstRunTour(true);

  // listenerControllers tracks AbortControllers per DOM element.
  // Must remain a Map (not WeakMap) because fullCleanup() and resetGlobalState()
  // iterate with for...of and call .clear(), which WeakMap does not support.
  // Growth is bounded because both cleanup paths call .clear().
  const listenerControllers = new Map();
  const YC_BUTTON_SPINNER_DELAY_MS = 650;
  const YC_BUTTON_SPINNER_SIZE = 18;
  const ycButtonLoadingSpinnerStates = new Set();
  const ycButtonLoadingSpinnerByButton = new WeakMap();

  function ensureYcButtonLoadingSpinnerStyle() {
    if (document.getElementById('yc-button-loading-spinner-style')) return;

    const style = document.createElement('style');
    style.id = 'yc-button-loading-spinner-style';
    style.setAttribute('data-yc', 'button-loading-spinner');
    style.textContent = `
      @keyframes yc-button-loading-spin {
        to { transform: rotate(360deg); }
      }

      .yc-button-loading-spinner {
        position: absolute;
        left: calc(50% - ${YC_BUTTON_SPINNER_SIZE / 2}px);
        top: -${YC_BUTTON_SPINNER_SIZE + 4}px;
        width: ${YC_BUTTON_SPINNER_SIZE}px;
        height: ${YC_BUTTON_SPINNER_SIZE}px;
        box-sizing: border-box;
        border: 2px solid rgba(255,255,255,0.38);
        border-top-color: #ff3b30;
        border-radius: 50%;
        pointer-events: none;
        z-index: 2147483647;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.75));
        animation: yc-button-loading-spin 0.72s linear infinite;
      }

      .yc-button-loading-spinner-anchor {
        position: relative !important;
        overflow: visible !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function attachYcButtonLoadingSpinner(button, spinner) {
    if (!button?.isConnected || !spinner) return false;

    const rect = button.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const anchor = button.closest('[data-btn], .custom-button-container') || button.parentElement || button;
    if (!anchor?.isConnected || !anchor.appendChild) return false;

    anchor.classList.add('yc-button-loading-spinner-anchor');
    spinner.dataset.ycSpinnerAnchor = 'true';
    anchor.appendChild(spinner);
    return true;
  }

  function startYcButtonLoadingSpinner(button, key = '') {
    if (!button) return () => { };

    const existingState = ycButtonLoadingSpinnerByButton.get(button);
    if (existingState?.stop) return existingState.stop;

    const state = {
      button,
      key,
      delayTimer: null,
      spinner: null,
      anchor: null,
      stopped: false,
      stop: null
    };

    state.stop = () => {
      if (state.stopped) return;
      state.stopped = true;

      if (state.delayTimer) {
        clearTimeout(state.delayTimer);
        state.delayTimer = null;
      }

      state.spinner?.remove();
      state.spinner = null;
      if (state.anchor && !state.anchor.querySelector?.('.yc-button-loading-spinner')) {
        state.anchor.classList.remove('yc-button-loading-spinner-anchor');
      }
      state.anchor = null;
      ycButtonLoadingSpinnerStates.delete(state);

      if (ycButtonLoadingSpinnerByButton.get(button) === state) {
        ycButtonLoadingSpinnerByButton.delete(button);
      }
    };

    ycButtonLoadingSpinnerStates.add(state);
    ycButtonLoadingSpinnerByButton.set(button, state);

    state.delayTimer = setTimeout(() => {
      state.delayTimer = null;
      if (state.stopped || !button.isConnected || !document.body) {
        state.stop();
        return;
      }

      ensureYcButtonLoadingSpinnerStyle();
      const spinner = document.createElement('div');
      spinner.className = 'yc-button-loading-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      if (key) spinner.dataset.ycSpinnerKey = key;
      state.spinner = spinner;

      if (!attachYcButtonLoadingSpinner(button, spinner)) {
        state.stop();
        return;
      }
      state.anchor = spinner.parentElement;
    }, YC_BUTTON_SPINNER_DELAY_MS);

    return state.stop;
  }

  function stopYcButtonLoadingSpinnerForButton(button) {
    ycButtonLoadingSpinnerByButton.get(button)?.stop?.();
  }

  function clearAllYcButtonLoadingSpinners() {
    [...ycButtonLoadingSpinnerStates].forEach(state => state.stop?.());
  }

  const getChordBtn = () => document.querySelector('[data-btn="chords"] .ytp-chords-button');
  const clearChordBtn = (source = '') => {
    const btn = getChordBtn();
    stopYcButtonLoadingSpinnerForButton(btn);
    const hasActiveClass = btn?.classList.contains('chords-active');

    if (DEBUG) {
      console.log(`%c[ניקוי${source ? ' - ' + source : ''}] כפתור? ${btn ? 'נמצא ✔' : 'לא נמצא ❌'}, אקטיבי? ${hasActiveClass ? 'כן ✔' : 'לא ❌'}, chordsActive=${chordsActive}`,
        hasActiveClass ? 'color:#FF5722' : 'color:#4CAF50');
    }

    if (btn && hasActiveClass) {
      btn.classList.remove('chords-active');
      if (DEBUG) console.log(`%c[ניקוי${source ? ' - ' + source : ''}] הסרת chords-active מכפתור האקורדים`, 'color:#4CAF50');
      return true;
    }
    return false;
  };

  const stopChordLoops = () => {
    if (DEBUG) console.log(`%c[ניקוי] קריאה ל-chordsDisplay.stopChordMonitoring אם זמין`, 'color:#2196F3');
    window.chordsDisplay?.stopChordMonitoring?.();
    window.chordsDisplay?.clearAllTimers?.();
  };

  /*───────────────────────────────────────────────────────────────────────────┐
  │ 1. משתני-מצב                                                               │
  └───────────────────────────────────────────────────────────────────────────*/
  let currentVideoId = null;
  let videoCtl = new AbortController();
  const vSignal = () => videoCtl.signal;

  let overlayCtlChords = null, overlayCtlSubs = null;
  const timersSubs = [], rafSubs = [];

  let uiCtl = new AbortController();
  const uiSignal = () => uiCtl.signal;

  const bin = { observers: [], timers: new Set() };

  let chordsActive = false;
  window.chordsActive = false;

  // 🎯 מצב טעינה - לזיהוי לחיצה באמצע טעינה
  let isChordsLoading = false;
  window.ycUserCancelledChords = false; // flag: המשתמש ביטל, לא לפתוח קרוסלה

  // --- REMOVED: userWantsChordsActive is no longer needed ---
  // let userWantsChordsActive = false; 
  // --- END REMOVED ---

  let currentPrefetchPromise = null;
  // workerTerminateTimer removed - Worker management removed

  // Navigation generation token for guarding async callbacks against stale SPA transitions.
  let navigationToken = 0;
  let navigationInProgress = false;
  const YC_SESSION_PREWARM_KEY = 'yc_feature_prewarm_session_v1';
  const YC_SESSION_PREWARM_IDLE_MS = 16 * 60 * 60 * 1000;
  const YC_SESSION_PREWARM_DELAY_MS = 3000;
  let ycSessionPrewarmTimer = null;
  let ycSessionPrewarmInFlight = false;
  let ycSessionPrewarmCompleted = false;
  let ycSessionPrewarmGeneration = 0;
  let ycSessionPrewarmLastDebug = null;
  let ycFeatureUseCaptureBound = false;
  let ycFeatureUseCaptureLastEvent = null;

  const nextNavigationToken = (reason = '') => {
    navigationToken += 1;
    if (DEBUG) {
      console.log(`[content.js] navigationToken=${navigationToken}${reason ? ` (${reason})` : ''}`);
    }
    return navigationToken;
  };
  const getNavigationToken = () => navigationToken;
  const isNavigationTokenCurrent = token => token === navigationToken;

  function getYcSessionStorageArea() {
    return (typeof chrome !== 'undefined' && chrome.storage?.session)
      ? chrome.storage.session
      : null;
  }

  function isFreshYcSessionPrewarmState(state, now = Date.now()) {
    if (!state || state.enabled !== true) return false;
    const lastUseAt = Number(state.lastUseAt || 0);
    return Number.isFinite(lastUseAt)
      && lastUseAt > 0
      && now - lastUseAt <= YC_SESSION_PREWARM_IDLE_MS;
  }

  function clearYcSessionPrewarmTimer() {
    if (ycSessionPrewarmTimer) {
      clearTimeout(ycSessionPrewarmTimer);
      ycSessionPrewarmTimer = null;
    }
  }

  function resetYcSessionPrewarmRuntime(reason = 'cleanup') {
    clearYcSessionPrewarmTimer();
    ycSessionPrewarmGeneration += 1;
    ycSessionPrewarmInFlight = false;
    ycSessionPrewarmCompleted = false;
    ycSessionPrewarmLastDebug = {
      action: 'runtime-reset',
      reason,
      at: new Date().toISOString()
    };
  }

  async function getFreshYcSessionPrewarmState() {
    const storageArea = getYcSessionStorageArea();
    if (!storageArea) return null;

    try {
      const result = await storageArea.get([YC_SESSION_PREWARM_KEY]);
      const state = result?.[YC_SESSION_PREWARM_KEY] || null;
      if (isFreshYcSessionPrewarmState(state)) {
        return state;
      }

      if (state) {
        await storageArea.remove([YC_SESSION_PREWARM_KEY]);
      }
    } catch (error) {
      DEBUG && console.warn('[SessionPrewarm] Failed reading session flag:', error);
    }

    return null;
  }

  function getYcSessionPrewarmReadiness() {
    return {
      subtitleReal: typeof window.createSubtitleButton === 'function' && !window.createSubtitleButton.isTemporaryFunction,
      carouselReady: !!window.ycChordCarousel && !!window.chordsDisplay?.activate,
      panelReady: typeof window.toggleLyricsAndChords === 'function'
    };
  }

  async function collectYcSessionPrewarmDebug(extra = {}) {
    const storageArea = getYcSessionStorageArea();
    let stored = null;
    let storageError = '';

    if (storageArea) {
      try {
        const result = await storageArea.get([YC_SESSION_PREWARM_KEY]);
        stored = result?.[YC_SESSION_PREWARM_KEY] || null;
      } catch (error) {
        storageError = String(error?.message || error || '');
      }
    }

    const now = Date.now();
    const lastUseAt = Number(stored?.lastUseAt || 0);
    return {
      at: new Date(now).toISOString(),
      url: location.href,
      visibilityState: document.visibilityState,
      extensionDisabled: !!window.extensionDisabled,
      hasDynamicLoader: !!window.dynamicLoader?.loadGroup,
      timerPending: !!ycSessionPrewarmTimer,
      inFlight: !!ycSessionPrewarmInFlight,
      completed: !!ycSessionPrewarmCompleted,
      generation: ycSessionPrewarmGeneration,
      navigationToken: getNavigationToken(),
      storageAvailable: !!storageArea,
      storageError,
      stored,
      fresh: isFreshYcSessionPrewarmState(stored, now),
      ageSeconds: Number.isFinite(lastUseAt) && lastUseAt > 0 ? Math.round((now - lastUseAt) / 1000) : null,
      readiness: getYcSessionPrewarmReadiness(),
      lastDebug: ycSessionPrewarmLastDebug,
      lastCaptureEvent: ycFeatureUseCaptureLastEvent,
      ...extra
    };
  }

  async function runYcSessionPrewarmNow(reason = 'manual-debug') {
    const before = await collectYcSessionPrewarmDebug({ action: 'run-before', reason });
    const steps = [];
    const runGeneration = ycSessionPrewarmGeneration;

    if (window.extensionDisabled) {
      return collectYcSessionPrewarmDebug({ action: 'run-blocked', reason, blockedBy: 'extensionDisabled', before, steps });
    }
    if (!window.dynamicLoader?.loadGroup) {
      return collectYcSessionPrewarmDebug({ action: 'run-blocked', reason, blockedBy: 'missingDynamicLoader', before, steps });
    }
    if (document.visibilityState !== 'visible') {
      return collectYcSessionPrewarmDebug({ action: 'run-blocked', reason, blockedBy: 'hiddenTab', before, steps });
    }

    const state = await getFreshYcSessionPrewarmState();
    if (!state) {
      return collectYcSessionPrewarmDebug({ action: 'run-blocked', reason, blockedBy: 'missingOrStaleFlag', before, steps });
    }

    ycSessionPrewarmInFlight = true;
    try {
      for (const group of ['subtitles', 'carousel', 'lyricsChords']) {
        const startedAt = performance.now();
        await window.dynamicLoader.loadGroup(group);
        steps.push({ group, ok: true, ms: Math.round(performance.now() - startedAt) });
      }
      if (runGeneration !== ycSessionPrewarmGeneration) {
        return collectYcSessionPrewarmDebug({ action: 'run-stale', reason, before, steps });
      }
      ycSessionPrewarmCompleted = true;
      ycSessionPrewarmLastDebug = { action: 'run-completed', reason, at: new Date().toISOString(), steps };
      return collectYcSessionPrewarmDebug({ action: 'run-completed', reason, before, steps });
    } catch (error) {
      ycSessionPrewarmLastDebug = {
        action: 'run-failed',
        reason,
        at: new Date().toISOString(),
        error: String(error?.message || error || ''),
        steps
      };
      return collectYcSessionPrewarmDebug({
        action: 'run-failed',
        reason,
        before,
        steps,
        error: String(error?.message || error || ''),
        stack: error?.stack || ''
      });
    } finally {
      if (runGeneration === ycSessionPrewarmGeneration) {
        ycSessionPrewarmInFlight = false;
      }
    }
  }

  function scheduleYcSessionPrewarm(reason = 'session', options = {}) {
    if (options?.force === true) {
      clearYcSessionPrewarmTimer();
    }

    if (window.extensionDisabled || ycSessionPrewarmTimer || ycSessionPrewarmInFlight || ycSessionPrewarmCompleted) {
      return;
    }
    if (!window.dynamicLoader?.loadGroup || document.visibilityState !== 'visible') {
      return;
    }

    const scheduledToken = getNavigationToken();
    const scheduledGeneration = ycSessionPrewarmGeneration;
    ycSessionPrewarmTimer = setTimeout(async () => {
      ycSessionPrewarmTimer = null;
      if (
        window.extensionDisabled ||
        ycSessionPrewarmInFlight ||
        ycSessionPrewarmCompleted ||
        scheduledGeneration !== ycSessionPrewarmGeneration ||
        document.visibilityState !== 'visible' ||
        !isNavigationTokenCurrent(scheduledToken)
      ) {
        ycSessionPrewarmLastDebug = {
          action: 'timer-blocked',
          reason,
          at: new Date().toISOString(),
          extensionDisabled: !!window.extensionDisabled,
          inFlight: !!ycSessionPrewarmInFlight,
          completed: !!ycSessionPrewarmCompleted,
          scheduledGeneration,
          currentGeneration: ycSessionPrewarmGeneration,
          visibilityState: document.visibilityState,
          scheduledToken,
          currentToken: getNavigationToken()
        };
        return;
      }

      const state = await getFreshYcSessionPrewarmState();
      if (!state) {
        ycSessionPrewarmLastDebug = {
          action: 'timer-blocked',
          reason,
          at: new Date().toISOString(),
          blockedBy: 'missingOrStaleFlag'
        };
        return;
      }

      ycSessionPrewarmInFlight = true;
      try {
        DEBUG && console.log('[SessionPrewarm] Prewarming feature modules:', reason, state.source);
        await window.dynamicLoader.loadGroup('subtitles');
        await window.dynamicLoader.loadGroup('carousel');
        await window.dynamicLoader.loadGroup('lyricsChords');
        if (scheduledGeneration !== ycSessionPrewarmGeneration) {
          ycSessionPrewarmLastDebug = {
            action: 'timer-stale',
            reason,
            source: state.source,
            at: new Date().toISOString()
          };
          return;
        }
        ycSessionPrewarmCompleted = true;
        ycSessionPrewarmLastDebug = {
          action: 'timer-completed',
          reason,
          source: state.source,
          at: new Date().toISOString()
        };
      } catch (error) {
        DEBUG && console.warn('[SessionPrewarm] Prewarm failed:', error);
        ycSessionPrewarmLastDebug = {
          action: 'timer-failed',
          reason,
          at: new Date().toISOString(),
          error: String(error?.message || error || ''),
          stack: error?.stack || ''
        };
      } finally {
        if (scheduledGeneration === ycSessionPrewarmGeneration) {
          ycSessionPrewarmInFlight = false;
        }
      }
    }, YC_SESSION_PREWARM_DELAY_MS);
  }

  async function markYouChordsFeatureUse(source = 'feature') {
    const storageArea = getYcSessionStorageArea();
    if (!storageArea) {
      ycSessionPrewarmLastDebug = {
        action: 'mark-blocked',
        source,
        at: new Date().toISOString(),
        blockedBy: 'missingStorage'
      };
      return;
    }

    try {
      const state = {
        enabled: true,
        source,
        lastUseAt: Date.now()
      };
      await storageArea.set({
        [YC_SESSION_PREWARM_KEY]: state
      });
      ycSessionPrewarmLastDebug = {
        action: 'mark-completed',
        source,
        at: new Date().toISOString(),
        state
      };
      ycSessionPrewarmCompleted = false;
      scheduleYcSessionPrewarm(`after-${source}`);
    } catch (error) {
      ycSessionPrewarmLastDebug = {
        action: 'mark-failed',
        source,
        at: new Date().toISOString(),
        error: String(error?.message || error || ''),
        stack: error?.stack || ''
      };
      DEBUG && console.warn('[SessionPrewarm] Failed marking feature use:', error);
    }
  }

  window.__ycMarkFeatureUse = markYouChordsFeatureUse;
  window.__ycScheduleSessionPrewarm = scheduleYcSessionPrewarm;
  window.__ycDebugSessionPrewarm = async (action = 'status') => {
    if (action === 'run') return runYcSessionPrewarmNow('manual-debug');
    if (action === 'schedule') {
      scheduleYcSessionPrewarm('manual-debug', { force: true });
      return collectYcSessionPrewarmDebug({ action: 'scheduled-manual-debug' });
    }
    return collectYcSessionPrewarmDebug({ action: 'status' });
  };

  function getYcFeatureUseSourceFromButtonId(buttonKey) {
    if (buttonKey === 'chords') return 'carousel';
    if (buttonKey === 'subtitle') return 'subtitles';
    if (buttonKey === 'customSubtitle') return 'subtitles';
    if (buttonKey === 'lyricsChords') return 'lyrics-chords-panel';
    return '';
  }

  function getYcFeatureUseSourceFromTarget(target) {
    const element = target instanceof Element ? target : null;
    if (!element) return '';

    const buttonContainer = element.closest?.('[data-btn]');
    const buttonKey = buttonContainer?.getAttribute?.('data-btn') || '';
    const sourceFromButtonId = getYcFeatureUseSourceFromButtonId(buttonKey);
    if (sourceFromButtonId) return sourceFromButtonId;

    if (element.closest?.('.ytp-chords-button')) return 'carousel';
    if (element.closest?.('.ytp-subtitle-button')) return 'subtitles';
    if (element.closest?.('.ytp-custom-subtitle-button')) return 'subtitles';
    if (element.closest?.('.ytp-lyrics-chords-button')) return 'lyrics-chords-panel';
    return '';
  }

  function bindYcFeatureUseCaptureOnce() {
    if (ycFeatureUseCaptureBound) return;
    ycFeatureUseCaptureBound = true;

    const handleFeatureUseCapture = event => {
      const element = event.target instanceof Element ? event.target : null;
      const source = getYcFeatureUseSourceFromTarget(event.target);
      const buttonContainer = element?.closest?.('[data-btn]');
      const buttonKey = buttonContainer?.getAttribute?.('data-btn') || '';
      if (source || buttonKey || element?.closest?.('.ytp-button')) {
        ycFeatureUseCaptureLastEvent = {
          action: 'document-capture',
          at: new Date().toISOString(),
          type: event.type,
          source,
          buttonKey,
          targetTag: element?.tagName || '',
          targetClass: String(element?.className || '').slice(0, 160)
        };
      }
      if (!source) return;
      if (getActiveYouTubeAdBlockReason()) return;
      markYouChordsFeatureUse(source);
    };

    addL(document, 'pointerdown', handleFeatureUseCapture, { capture: true }, 'ui');
    addL(document, 'click', handleFeatureUseCapture, { capture: true }, 'ui');
  }

  function hasYouChordsRuntimeFootprint() {
    if (
      isChordsLoading ||
      chordsActive ||
      window.chordsActive ||
      subsActive ||
      window.subtitleState?.isVisible ||
      window.lyricsChordsPanelActive ||
      window.periodicCleanupId ||
      buttonsTourState.active ||
      (buttonsTourState.openedSurfaces && buttonsTourState.openedSurfaces.size > 0)
    ) {
      return true;
    }

    const footprintSelectors = [
      '#yc-download-progress',
      '#yc-subtitles-progress',
      '#yc-chords-container',
      '.yt-chords-container',
      '.yc-chord-carousel',
      '.chords-carousel',
      '.chords-backdrop',
      '.chord-slot',
      '.yt-lyrics-chords-panel',
      '.lyrics-chords-panel',
      '.yc-preview-panel',
      '.yt-subtitle-overlay',
      '.yt-subtitle-container',
      '.yc-subtitle-element',
      '.yc-subtitle-overlay',
      '.subtitle-settings-menu',
      '.tuner-overlay',
      '.chord-explorer-overlay',
      '.settings-menu-container',
      '[data-yc-menu]'
    ];

    return footprintSelectors.some(selector => !!document.querySelector(selector));
  }

  function lightNavigationCleanup(reason = 'navigation') {
    DEBUG && console.log(`[content.js] Light navigation cleanup (${reason})`);

    clearAllYcButtonLoadingSpinners();
    clearButtonsTourSchedule();
    stopButtonsTour({ markSeen: false });

    if (window.extractorModule) {
      try { window.extractorModule.abortAllRequests?.(); } catch (e) { /* ignore */ }
      try { window.extractorModule.removeSubtitlesProgressBar?.(); } catch (e) { /* ignore */ }
      try { window.extractorModule.removeProgressBar?.(); } catch (e) { /* ignore */ }
    }

    try { window.chordsDisplay?.pauseRendering?.(); } catch (e) { /* ignore */ }

    chordsActive = false;
    window.chordsActive = false;
    subsActive = false;
    overlayCtlChords?.abort?.();
    overlayCtlSubs?.abort?.();
    overlayCtlChords = null;
    overlayCtlSubs = null;
    videoCtl.abort();
    videoCtl = new AbortController();

    clearChordBtn('light-navigation-cleanup');
    stopButtonCheck();

    bin.observers.forEach(observer => {
      try { observer.disconnect(); } catch (e) { /* ignore */ }
    });
    bin.observers.length = 0;
    for (const id of bin.timers) {
      clearInterval(id);
      clearTimeout(id);
    }
    bin.timers.clear();

    for (const [, controllers] of listenerControllers) {
      controllers.forEach(controller => {
        try {
          if (!controller.signal.aborted) controller.abort();
        } catch (e) { /* ignore */ }
      });
    }
    listenerControllers.clear();

    currentPrefetchPromise = null;
  }

  function closeFeaturesAfterAuthEvent(logMessage) {
    console.log(logMessage);

    try {
      if (chordsActive) {
        toggleChords();
      }
    } catch (e) {
      console.warn('[content.js] Error closing carousel on auth event:', e);
    }

    try {
      if (typeof window.cleanupLyricsChordsPanel === 'function') {
        window.cleanupLyricsChordsPanel();
      }
    } catch (e) {
      console.warn('[content.js] Error closing panel on auth event:', e);
    }

    try {
      if (window.subtitleState?.isVisible) {
        window.subtitleState.isVisible = false;
        if (typeof window.cleanupSubtitles === 'function') {
          window.cleanupSubtitles();
        }
        const subtitleBtn = document.querySelector('.ytp-subtitle-button');
        if (subtitleBtn) {
          subtitleBtn.classList.remove('subtitle-button-active');
        }
      }
    } catch (e) {
      console.warn('[content.js] Error closing subtitles on auth event:', e);
    }
  }

  function bindAuthLifecycleListenersOnce() {
    if (window.__ycAuthLifecycleListenersBound) return;
    window.__ycAuthLifecycleListenersBound = true;

    window.addEventListener('ycAuthSignOut', () => {
      closeFeaturesAfterAuthEvent('[content.js] Account deletion detected - closing chords, panel and subtitles');
    }, { passive: true });

    window.addEventListener('ycAuthSignedOut', () => {
      closeFeaturesAfterAuthEvent('[content.js] Sign out detected - closing chords, panel and subtitles (keeping IndexedDB)');
    }, { passive: true });
  }

  /*───────────────────────────────────────────────────────────────────────────┐
  │ 2. addL – רישום מאזין עם signal נכון                                      │
  └───────────────────────────────────────────────────────────────────────────*/
  function addL(target, type, fn, opts = {}, scope = 'video') {
    if (!target) return;

    // Backward compatibility:
    // Some call sites pass scope inside opts (e.g. { scope: 'ui' }).
    // Normalize it here so listeners bind to the intended lifecycle signal.
    if (opts && typeof opts === 'object' && Object.prototype.hasOwnProperty.call(opts, 'scope')) {
      const normalizedScope = opts.scope;
      opts = { ...opts };
      delete opts.scope;
      if (typeof normalizedScope === 'string' && normalizedScope.trim()) {
        scope = normalizedScope;
      }
    }

    // מאזינים שמשתמשים ב-videoCtl/uiCtl מנוהלים כבר
    if (scope === 'video' || scope === 'ui' || scope === 'chords' || scope === 'subs') {
      const signal = (scope === 'video' ? vSignal()
        : scope === 'ui' ? uiSignal()
          : scope === 'chords' ? overlayCtlChords?.signal
            : overlayCtlSubs?.signal);

      opts.passive ??= true;
      target.addEventListener(type, fn, { ...opts, signal });
      return;
    }

    // מאזינים דינמיים שאינם מכוסים ב-videoCtl/uiCtl
    const controller = new AbortController();
    const signal = controller.signal;

    target.addEventListener(type, fn, { ...opts, signal, passive: opts.passive ?? true });

    if (!listenerControllers.has(target)) {
      listenerControllers.set(target, new Set());
    }
    listenerControllers.get(target).add(controller);
  }

  // ------------------------------------------------------------------
  //  addLWithCleanup – אותו API, אבל מנקה מאזינים קודמים לאותו target
  // ------------------------------------------------------------------
  function addLWithCleanup(target, type, fn, opts = {}, scope = 'video') {
    if (listenerControllers.has(target)) {
      listenerControllers.get(target).forEach(c => { try { c.abort(); } catch (e) { } });
    }
    addL(target, type, fn, opts, scope);
  }

  // זמין לקוד חיצוני (כמו שה-sandbox משתמש ב-addL)
  window.addLWithCleanup = addLWithCleanup;
  window.toggleChords = toggleChords;

  /*───────────────────────────────────────────────────────────────────────────┐
  │ 3. overlay CHORDS – מעטפת לממשק chordsDisplay                            │
  └───────────────────────────────────────────────────────────────────────────*/
  /*==============================================================
  החלף את הפונקציה toggleChords הקיימת בקוד המתוקן הבא
==============================================================*/

  /*───────────────────────────────────────────────────────────────────────────┐
  │ 3. overlay CHORDS – מעטפת לממשק chordsDisplay (עם לוגיקת TOGGLE מתוקנת)   │
  └───────────────────────────────────────────────────────────────────────────*/
  // פונקציה לאיפוס משתנים מקומיים - נדרשת עבור resetToDefault
  window.resetLocalVariables = function () {
    console.log('[DEBUG-RESET] Resetting local variables in content.js');
    chordsActive = false;
    subtitleActive = false;
    overlayCtlChords?.abort();
    overlayCtlChords = null;
    overlayCtlSubs?.abort();
    overlayCtlSubs = null;
    console.log('[DEBUG-RESET] Local variables reset completed');
  };

  function applyYouChordsModalLtrIsolation(modal) {
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
      '.yc-modal-tip',
      '.yc-modal-buttons',
      '.yc-modal-btn',
      '.yc-modal-close-btn',
      '.yc-google-signin-btn',
      '.yc-credit-progress'
    ].join(', ')).forEach(isolate);

    modal.querySelectorAll('.yc-modal-buttons').forEach((row) => {
      row.style.setProperty('flex-direction', 'row', 'important');
    });
  }

  window.__ycApplyModalLtrIsolation = applyYouChordsModalLtrIsolation;

  // 🔐 Modal למשתמש שלא מחובר
  function showSignInRequiredModal() {
    const existingModal = document.getElementById('yc-signin-modal');
    if (existingModal) existingModal.remove();

    // Remove existing style tag to prevent accumulation
    const existingStyle = document.getElementById('yc-signin-modal-style');
    if (existingStyle) existingStyle.remove();

    const modal = document.createElement('div');
    modal.id = 'yc-signin-modal';
    modal.innerHTML = `
      <div class="yc-modal-backdrop"></div>
      <div class="yc-modal-content">
        <button class="yc-modal-close-btn">×</button>
        <div class="yc-modal-icon">🔐</div>
        <h2 class="yc-modal-title">Sign In Required</h2>
        <p class="yc-modal-text">To access <strong>Chords</strong>, please sign in.</p>
        
        <button class="yc-google-signin-btn" aria-disabled="false">
          <svg class="yc-google-icon" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>

        <p class="yc-consent-error" style="display:none;"></p>
        
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
    style.id = 'yc-signin-modal-style';
    style.textContent = `
      #yc-signin-modal {
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
      #yc-signin-modal .yc-modal-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
      }
      #yc-signin-modal .yc-modal-content {
        position: relative;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 20px;
        padding: 40px;
        max-width: 450px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      #yc-signin-modal .yc-modal-close-btn {
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
      #yc-signin-modal .yc-modal-close-btn:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: scale(1.1);
      }
      #yc-signin-modal .yc-modal-icon {
        font-size: 48px;
        margin-bottom: 20px;
      }
      #yc-signin-modal .yc-modal-title {
        color: #fff;
        font-size: 28px;
        margin: 0 0 15px 0;
        font-weight: 700;
      }
      #yc-signin-modal .yc-modal-text {
        color: rgba(255, 255, 255, 0.95);
        font-size: 16px;
        line-height: 1.6;
        margin: 0 0 15px 0;
      }
      #yc-signin-modal .yc-modal-text strong {
        color: #fff;
        font-weight: 600;
      }
      #yc-signin-modal .yc-google-signin-btn {
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
      #yc-signin-modal .yc-google-signin-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
      }
      #yc-signin-modal .yc-google-signin-btn:active {
        transform: translateY(0);
      }
      #yc-signin-modal .yc-google-signin-btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
        filter: grayscale(0.35);
      }
      #yc-signin-modal .yc-google-signin-btn:disabled:hover {
        transform: none;
        box-shadow: none;
      }
      #yc-signin-modal .yc-google-icon {
        width: 18px;
        height: 18px;
      }
      #yc-signin-modal .yc-consent-error {
        color: #fecaca;
        font-size: 12px;
        margin: 4px 0 8px 0;
      }
      #yc-signin-modal .yc-consent-notice {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
        line-height: 1.5;
        width: fit-content;
        margin: 15px auto;
        text-align: left;
      }
      #yc-signin-modal .yc-consent-notice a {
        color: white;
        text-decoration: underline;
      }
      #yc-signin-modal .yc-or-divider {
        text-align: center;
        margin: 20px 0;
        color: rgba(255, 255, 255, 0.6);
        font-size: 14px;
      }
      #yc-signin-modal .yc-toolbar-hint {
        text-align: center;
        color: rgba(255, 255, 255, 0.8);
        font-size: 14px;
        margin: 15px 0;
      }
      #yc-signin-modal .yc-modal-help {
        color: rgba(255, 255, 255, 0.9);
        font-size: 15px;
        font-weight: 500;
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }
      #yc-signin-modal .yc-help-link {
        color: white;
        text-decoration: none;
        font-size: 13px;
        transition: color 0.2s;
      }
      #yc-signin-modal .yc-help-link:hover {
        color: rgba(255, 255, 255, 0.8);
        text-decoration: underline;
      }
      #yc-signin-modal .yc-popup-icon {
        display: inline-block;
        width: 16px;
        height: 16px;
        vertical-align: middle;
        margin: 0 2px;
      }
      #yc-signin-modal .yc-signin-spinner {
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
    applyYouChordsModalLtrIsolation(modal);
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

    // Close button
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
        source: 'youtube_chords_modal'
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
          console.log('[Content] Sign in successful!', response.user);

          // 1. Store JWT securely (chrome.storage + memory cache)
          if (window.__ycSetJwt) {
            await window.__ycSetJwt(response.jwt);
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
            const chordsBtn = document.querySelector('[data-btn="chords"] .ytp-chords-button');
            if (chordsBtn) {
              console.log('[Content] Clicking chords button after sign in');
              chordsBtn.click();
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

          console.error('[Content] Sign in failed:', response.error);
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
        console.error('[Content] Sign in error:', error);
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
      console.warn('[Content] Video player not found for success notification');
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

  // ⚠️ Modal למנוי שפג תוקף
  function showSubscriptionExpiredModal() {
    const existingModal = document.getElementById('yc-subscription-expired-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'yc-subscription-expired-modal';

    const upgradeUrl = 'https://www.you-chords.com/upgrade';

    modal.innerHTML = `
      <div class="yc-modal-backdrop"></div>
      <div class="yc-modal-content">
        <div class="yc-modal-icon">⚠️</div>
        <h2 class="yc-modal-title">Subscription Expired</h2>
        <p class="yc-modal-text">Your subscription has expired.</p>
        <div class="yc-modal-divider"></div>
        <p class="yc-modal-text yc-highlight-green">✅ <strong>YouTube/Gemini subtitles</strong> are still available</p>
        <p class="yc-modal-text yc-highlight-red">❌ <strong>Chords</strong> are no longer available</p>
        <div class="yc-modal-buttons">
          <button class="yc-modal-btn yc-modal-btn-secondary yc-modal-btn-close">Close</button>
          <button class="yc-modal-btn yc-modal-btn-upgrade">Renew Subscription</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #yc-subscription-expired-modal {
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
      #yc-subscription-expired-modal .yc-modal-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
      }
      #yc-subscription-expired-modal .yc-modal-content {
        position: relative;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 20px;
        padding: 40px;
        max-width: 400px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.1);
        animation: yc-modal-appear 0.3s ease;
      }
      @keyframes yc-modal-appear {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
      }
      #yc-subscription-expired-modal .yc-modal-icon {
        font-size: 48px;
        margin-bottom: 20px;
      }
      #yc-subscription-expired-modal .yc-modal-title {
        color: #fff;
        font-size: 24px;
        margin: 0 0 15px 0;
        font-weight: 600;
      }
      #yc-subscription-expired-modal .yc-modal-text {
        color: rgba(255, 255, 255, 0.8);
        font-size: 14px;
        line-height: 1.6;
        margin: 0 0 10px 0;
      }
      #yc-subscription-expired-modal .yc-modal-text strong {
        color: #fff;
      }
      #yc-subscription-expired-modal .yc-highlight-green {
        color: #4CAF50;
      }
      #yc-subscription-expired-modal .yc-highlight-red {
        color: #f44336;
      }
      #yc-subscription-expired-modal .yc-modal-divider {
        height: 1px;
        background: rgba(255, 255, 255, 0.1);
        margin: 20px 0;
      }
      #yc-subscription-expired-modal .yc-modal-buttons {
        margin-top: 25px;
        display: flex;
        gap: 12px;
        justify-content: center;
      }
      #yc-subscription-expired-modal .yc-modal-btn {
        flex: 1;
        padding: 12px 24px;
        border-radius: 25px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        border: none;
      }
      #yc-subscription-expired-modal .yc-modal-btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: white;
      }
      #yc-subscription-expired-modal .yc-modal-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.15);
        transform: scale(1.05);
      }
      #yc-subscription-expired-modal .yc-modal-btn-upgrade {
        background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
        color: white;
      }
      #yc-subscription-expired-modal .yc-modal-btn-upgrade:hover {
        transform: scale(1.05);
        box-shadow: 0 5px 20px rgba(76, 175, 80, 0.4);
      }
    `;

    document.head.appendChild(style);
    applyYouChordsModalLtrIsolation(modal);
    document.body.appendChild(modal);

    modal.querySelector('.yc-modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('.yc-modal-btn-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.yc-modal-btn-upgrade').addEventListener('click', () => {
      if (window.__ycOpenUpgradePage) {
        window.__ycOpenUpgradePage(upgradeUrl, 'content_subscription_expired_modal');
      } else {
        window.open(upgradeUrl, '_blank');
      }
      modal.remove();
    });
  }

  // Make it globally available
  window.showSubscriptionExpiredModal = showSubscriptionExpiredModal;

  // ⏱️ Modal להגבלת קצב (Rate Limit)
  function showRateLimitModal(options = {}) {
    const {
      title = 'Oops, too fast!',
      message = 'Free users can process up to 3 songs per minute.',
      secondaryMessage = 'Please wait a moment and try again.'
    } = options;
    const existingModal = document.getElementById('yc-ratelimit-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'yc-ratelimit-modal';
    modal.innerHTML = `
      <div class="yc-modal-backdrop"></div>
      <div class="yc-modal-content">
        <div class="yc-modal-icon">⏱️</div>
        <h2 class="yc-modal-title">${title}</h2>
        <p class="yc-modal-text">${message}</p>
        <p class="yc-modal-text">${secondaryMessage}</p>
        <div class="yc-modal-buttons">
          <button class="yc-modal-btn yc-modal-btn-close">OK</button>
          <button class="yc-modal-btn yc-modal-btn-upgrade">Upgrade</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #yc-ratelimit-modal {
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
      #yc-ratelimit-modal .yc-modal-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
      }
      #yc-ratelimit-modal .yc-modal-content {
        position: relative;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 20px;
        padding: 40px;
        max-width: 400px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.1);
        animation: yc-ratelimit-modal-appear 0.3s ease;
      }
      @keyframes yc-ratelimit-modal-appear {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
      }
      #yc-ratelimit-modal .yc-modal-icon {
        font-size: 48px;
        margin-bottom: 20px;
      }
      #yc-ratelimit-modal .yc-modal-title {
        color: #fff;
        font-size: 24px;
        margin: 0 0 15px 0;
        font-weight: 600;
      }
      #yc-ratelimit-modal .yc-modal-text {
        color: rgba(255, 255, 255, 0.8);
        font-size: 14px;
        line-height: 1.6;
        margin: 0 0 10px 0;
      }
      #yc-ratelimit-modal .yc-modal-text strong {
        color: #fff;
      }
      #yc-ratelimit-modal .yc-modal-buttons {
        margin-top: 25px;
        display: flex;
        gap: 12px;
        justify-content: center;
      }
      #yc-ratelimit-modal .yc-modal-btn {
        flex: 1;
        padding: 12px 24px;
        border-radius: 25px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        border: none;
      }
      #yc-ratelimit-modal .yc-modal-btn-close {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      #yc-ratelimit-modal .yc-modal-btn-close:hover {
        transform: scale(1.05);
        box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
      }
      #yc-ratelimit-modal .yc-modal-btn-upgrade {
        background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
        color: white;
      }
      #yc-ratelimit-modal .yc-modal-btn-upgrade:hover {
        transform: scale(1.05);
        box-shadow: 0 5px 20px rgba(243, 156, 18, 0.4);
      }
    `;

    document.head.appendChild(style);
    applyYouChordsModalLtrIsolation(modal);
    document.body.appendChild(modal);

    modal.querySelector('.yc-modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('.yc-modal-btn-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.yc-modal-btn-upgrade').addEventListener('click', () => {
      const upgradeUrl = 'https://www.you-chords.com/upgrade';
      if (window.__ycOpenUpgradePage) {
        window.__ycOpenUpgradePage(upgradeUrl, 'content_rate_limit_modal');
      } else {
        window.open(upgradeUrl, '_blank');
      }
      modal.remove();
    });
  }

  // ⏱️ Modal להגבלת קצב עיבוד (Docker) - למשתמשים בתשלום
  function showProcessingRateLimitModal(options = {}) {
    const {
      title = 'Slow down!',
      message = 'You\'ve reached the processing limit (5 per minute).',
      secondaryMessage = 'Please wait a moment before processing new songs.',
      tipText = ''
    } = options;
    const existingModal = document.getElementById('yc-processing-ratelimit-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'yc-processing-ratelimit-modal';
    modal.innerHTML = `
      <div class="yc-modal-backdrop"></div>
      <div class="yc-modal-content">
        <div class="yc-modal-icon">⏱️</div>
        <h2 class="yc-modal-title">${title}</h2>
        <p class="yc-modal-text">${message}</p>
        <p class="yc-modal-text">${secondaryMessage}</p>
        ${tipText ? `<p class="yc-modal-text yc-modal-tip">${tipText}</p>` : ''}
        <div class="yc-modal-buttons">
          <button class="yc-modal-btn yc-modal-btn-close">OK</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #yc-processing-ratelimit-modal {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        z-index: 2147483647; display: flex; align-items: center; justify-content: center;
      }
      #yc-processing-ratelimit-modal .yc-modal-backdrop {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px);
      }
      #yc-processing-ratelimit-modal .yc-modal-content {
        position: relative; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 20px; padding: 40px; max-width: 420px; text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.1);
        animation: yc-modal-appear 0.3s ease;
      }
      @keyframes yc-modal-appear { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
      #yc-processing-ratelimit-modal .yc-modal-icon { font-size: 48px; margin-bottom: 20px; }
      #yc-processing-ratelimit-modal .yc-modal-title { color: #fff; font-size: 24px; margin: 0 0 15px 0; font-weight: 600; }
      #yc-processing-ratelimit-modal .yc-modal-text { color: rgba(255, 255, 255, 0.8); font-size: 14px; line-height: 1.6; margin: 0 0 10px 0; }
      #yc-processing-ratelimit-modal .yc-modal-text strong { color: #fff; }
      #yc-processing-ratelimit-modal .yc-modal-tip { color: #3ea6ff; font-size: 13px; }
      #yc-processing-ratelimit-modal .yc-modal-buttons { margin-top: 25px; display: flex; gap: 12px; justify-content: center; }
      #yc-processing-ratelimit-modal .yc-modal-btn { padding: 12px 32px; border-radius: 25px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; border: none; }
      #yc-processing-ratelimit-modal .yc-modal-btn-close { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
      #yc-processing-ratelimit-modal .yc-modal-btn-close:hover { transform: scale(1.05); box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4); }
    `;

    document.head.appendChild(style);
    applyYouChordsModalLtrIsolation(modal);
    document.body.appendChild(modal);

    modal.querySelector('.yc-modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('.yc-modal-btn-close').addEventListener('click', () => modal.remove());
  }

  // Queue pressure modal (Docker/API server busy)
  function showQueuePressureModal(options = {}) {
    const {
      mode = 'full', // 'full' | 'busy' | 'temporary'
      retryAfterSec = 8
    } = options;

    const existingModal = document.getElementById('yc-queue-pressure-modal');
    if (existingModal) existingModal.remove();

    const safeRetry = Number.isFinite(Number(retryAfterSec))
      ? Math.max(1, Math.round(Number(retryAfterSec)))
      : 30;
    const isTemporary = mode === 'temporary';
    const isFull = mode === 'full';
    const title = isTemporary
      ? 'Try Again Shortly'
      : (isFull ? 'Server Queue Is Full' : 'Server Is Busy');
    const message = isTemporary
      ? 'We couldn’t process this song right now. Please try again shortly.'
      : (isFull
        ? 'We are handling many requests right now.'
        : 'Your request waited in queue, but the server is still busy.');
    const retryLine = isTemporary
      ? ''
      : `Please try again shortly. During peak load, waiting up to ~${safeRetry}s can help.`;

    const modal = document.createElement('div');
    modal.id = 'yc-queue-pressure-modal';
    modal.innerHTML = `
      <div class="yc-modal-backdrop"></div>
      <div class="yc-modal-content">
        <div class="yc-modal-icon">${isTemporary ? '⚠️' : '⏳'}</div>
        <h2 class="yc-modal-title">${title}</h2>
        <p class="yc-modal-text">${message}</p>
        ${retryLine ? `<p class="yc-modal-text"><strong>${retryLine}</strong></p>` : ''}
        <p class="yc-modal-text yc-modal-tip">💡 Try again in a few seconds. Your settings stay as-is.</p>
        <div class="yc-modal-buttons">
          <button class="yc-modal-btn yc-modal-btn-close">OK</button>
        </div>
      </div>
    `;

    const styleId = 'yc-queue-pressure-modal-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        #yc-queue-pressure-modal {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          z-index: 2147483647; display: flex; align-items: center; justify-content: center;
        }
        #yc-queue-pressure-modal .yc-modal-backdrop {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px);
        }
        #yc-queue-pressure-modal .yc-modal-content {
          position: relative; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border-radius: 20px; padding: 40px; max-width: 420px; text-align: center;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.1);
          animation: yc-modal-appear 0.3s ease;
        }
        #yc-queue-pressure-modal .yc-modal-icon { font-size: 48px; margin-bottom: 20px; }
        #yc-queue-pressure-modal .yc-modal-title { color: #fff; font-size: 24px; margin: 0 0 15px 0; font-weight: 600; }
        #yc-queue-pressure-modal .yc-modal-text { color: rgba(255, 255, 255, 0.8); font-size: 14px; line-height: 1.6; margin: 0 0 10px 0; }
        #yc-queue-pressure-modal .yc-modal-text strong { color: #fff; }
        #yc-queue-pressure-modal .yc-modal-tip { color: #3ea6ff; font-size: 13px; }
        #yc-queue-pressure-modal .yc-modal-buttons { margin-top: 25px; display: flex; gap: 12px; justify-content: center; }
        #yc-queue-pressure-modal .yc-modal-btn { padding: 12px 32px; border-radius: 25px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; border: none; }
        #yc-queue-pressure-modal .yc-modal-btn-close { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
        #yc-queue-pressure-modal .yc-modal-btn-close:hover { transform: scale(1.05); box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4); }
      `;
      document.head.appendChild(style);
    }

    applyYouChordsModalLtrIsolation(modal);
    document.body.appendChild(modal);

    modal.querySelector('.yc-modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('.yc-modal-btn-close').addEventListener('click', () => modal.remove());
  }

  // ⏱️ Modal להגבלת קצב הורדות (R2) - למשתמשים בתשלום
  function showDownloadRateLimitModal(options = {}) {
    const {
      title = 'Slow down!',
      message = 'You\'ve reached the download limit (10 per minute).',
      secondaryMessage = 'Please wait a moment before downloading more songs.',
      tipText = ''
    } = options;
    const existingModal = document.getElementById('yc-download-ratelimit-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'yc-download-ratelimit-modal';
    modal.innerHTML = `
      <div class="yc-modal-backdrop"></div>
      <div class="yc-modal-content">
        <div class="yc-modal-icon">⏱️</div>
        <h2 class="yc-modal-title">${title}</h2>
        <p class="yc-modal-text">${message}</p>
        <p class="yc-modal-text">${secondaryMessage}</p>
        ${tipText ? `<p class="yc-modal-text yc-modal-tip">${tipText}</p>` : ''}
        <div class="yc-modal-buttons">
          <button class="yc-modal-btn yc-modal-btn-close">OK</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #yc-download-ratelimit-modal {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        z-index: 2147483647; display: flex; align-items: center; justify-content: center;
      }
      #yc-download-ratelimit-modal .yc-modal-backdrop {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px);
      }
      #yc-download-ratelimit-modal .yc-modal-content {
        position: relative; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 20px; padding: 40px; max-width: 420px; text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.1);
        animation: yc-modal-appear 0.3s ease;
      }
      #yc-download-ratelimit-modal .yc-modal-icon { font-size: 48px; margin-bottom: 20px; }
      #yc-download-ratelimit-modal .yc-modal-title { color: #fff; font-size: 24px; margin: 0 0 15px 0; font-weight: 600; }
      #yc-download-ratelimit-modal .yc-modal-text { color: rgba(255, 255, 255, 0.8); font-size: 14px; line-height: 1.6; margin: 0 0 10px 0; }
      #yc-download-ratelimit-modal .yc-modal-text strong { color: #fff; }
      #yc-download-ratelimit-modal .yc-modal-tip { color: #3ea6ff; font-size: 13px; }
      #yc-download-ratelimit-modal .yc-modal-buttons { margin-top: 25px; display: flex; gap: 12px; justify-content: center; }
      #yc-download-ratelimit-modal .yc-modal-btn { padding: 12px 32px; border-radius: 25px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; border: none; }
      #yc-download-ratelimit-modal .yc-modal-btn-close { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
      #yc-download-ratelimit-modal .yc-modal-btn-close:hover { transform: scale(1.05); box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4); }
    `;

    document.head.appendChild(style);
    applyYouChordsModalLtrIsolation(modal);
    document.body.appendChild(modal);

    modal.querySelector('.yc-modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('.yc-modal-btn-close').addEventListener('click', () => modal.remove());
  }

  // 📊 Modal למכסת מנוי (R2) - 1,500 הורדות
  function showSubscriptionLimitModal() {
    const existingModal = document.getElementById('yc-subscription-limit-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'yc-subscription-limit-modal';
    modal.innerHTML = `
      <div class="yc-modal-backdrop"></div>
      <div class="yc-modal-content">
        <div class="yc-modal-icon">📊</div>
        <h2 class="yc-modal-title">Download Limit Reached</h2>
        <p class="yc-modal-text">You've used all <strong>1,500 downloads</strong> for this subscription period.</p>
        <p class="yc-modal-text">Your limit will reset when your subscription renews.</p>
        <p class="yc-modal-text yc-modal-tip">💡 You can still process new songs with your credits.</p>
        <div class="yc-modal-buttons">
          <button class="yc-modal-btn yc-modal-btn-close">OK</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #yc-subscription-limit-modal {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        z-index: 2147483647; display: flex; align-items: center; justify-content: center;
      }
      #yc-subscription-limit-modal .yc-modal-backdrop {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px);
      }
      #yc-subscription-limit-modal .yc-modal-content {
        position: relative; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 20px; padding: 40px; max-width: 420px; text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.1);
        animation: yc-modal-appear 0.3s ease;
      }
      #yc-subscription-limit-modal .yc-modal-icon { font-size: 48px; margin-bottom: 20px; }
      #yc-subscription-limit-modal .yc-modal-title { color: #fff; font-size: 24px; margin: 0 0 15px 0; font-weight: 600; }
      #yc-subscription-limit-modal .yc-modal-text { color: rgba(255, 255, 255, 0.8); font-size: 14px; line-height: 1.6; margin: 0 0 10px 0; }
      #yc-subscription-limit-modal .yc-modal-text strong { color: #fff; }
      #yc-subscription-limit-modal .yc-modal-tip { color: #3ea6ff; font-size: 13px; }
      #yc-subscription-limit-modal .yc-modal-buttons { margin-top: 25px; display: flex; gap: 12px; justify-content: center; }
      #yc-subscription-limit-modal .yc-modal-btn { padding: 12px 32px; border-radius: 25px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; border: none; }
      #yc-subscription-limit-modal .yc-modal-btn-close { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
      #yc-subscription-limit-modal .yc-modal-btn-close:hover { transform: scale(1.05); box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4); }
    `;

    document.head.appendChild(style);
    applyYouChordsModalLtrIsolation(modal);
    document.body.appendChild(modal);

    modal.querySelector('.yc-modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('.yc-modal-btn-close').addEventListener('click', () => modal.remove());
  }

  // Expose modals globally
  window.showRateLimitModal = showRateLimitModal;
  window.showProcessingRateLimitModal = showProcessingRateLimitModal;
  window.showQueuePressureModal = showQueuePressureModal;
  window.showDownloadRateLimitModal = showDownloadRateLimitModal;
  window.showSubscriptionLimitModal = showSubscriptionLimitModal;

  // 🎵 Modal לשדרוג אקורדים (כשנגמרת המכסה)
  function showChordsUpgradeModal(options = {}) {
    const existingModal = document.getElementById('yc-chords-upgrade-modal');
    if (existingModal) existingModal.remove();
    const existingStyle = document.getElementById('yc-chords-upgrade-modal-style');
    if (existingStyle) existingStyle.remove();

    const isFreeDurationLimit = options.reason === 'free_duration_limit';
    const modalIcon = options.icon || (isFreeDurationLimit ? '⏱️' : '🎵');
    const titleText = options.title || (isFreeDurationLimit ? 'Upgrade Required' : 'Free Credits Used');
    const messageHtml = options.messageHtml || (isFreeDurationLimit
      ? 'There is no video length limit.'
      : "You've used all your free credits.<br>To unlock <strong>Chords</strong>, please upgrade your plan.");
    const tipHtml = options.tipHtml || (isFreeDurationLimit
      ? 'Please try processing the song again.'
      : 'You can still use YouTube subtitles or Gemini transcription with your own API key.');
    const upgradeSource = options.source || (isFreeDurationLimit ? 'content_free_duration_limit_modal' : 'content_chords_upgrade_modal');
    const showUpgradeButton = options.showUpgradeButton !== false;
    const closeLabel = options.closeLabel || (showUpgradeButton ? 'Maybe Later' : 'Got It');

    const modal = document.createElement('div');
    modal.id = 'yc-chords-upgrade-modal';
    modal.innerHTML = `
      <div class="yc-modal-backdrop"></div>
      <div class="yc-modal-content">
        <div class="yc-modal-icon">${modalIcon}</div>
        <h2 class="yc-modal-title">${titleText}</h2>
        <p class="yc-modal-text">${messageHtml}</p>
        <p class="yc-modal-text yc-modal-tip">${tipHtml}</p>
        <div class="yc-modal-buttons">
          <button class="yc-modal-btn yc-modal-btn-close">${closeLabel}</button>
          ${showUpgradeButton ? '<button class="yc-modal-btn yc-modal-btn-upgrade">Upgrade Now</button>' : ''}
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.id = 'yc-chords-upgrade-modal-style';
    style.textContent = `
      #yc-chords-upgrade-modal {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        z-index: 2147483647; display: flex; align-items: center; justify-content: center;
      }
      #yc-chords-upgrade-modal .yc-modal-backdrop {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px);
      }
      #yc-chords-upgrade-modal .yc-modal-content {
        position: relative; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 20px; padding: 40px; max-width: 420px; text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.1);
        animation: yc-chords-modal-appear 0.3s ease;
      }
      @keyframes yc-chords-modal-appear {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
      }
      #yc-chords-upgrade-modal .yc-modal-icon { font-size: 48px; margin-bottom: 15px; }
      #yc-chords-upgrade-modal .yc-modal-title { color: #fff; font-size: 24px; margin: 0 0 20px 0; font-weight: 600; }
      #yc-chords-upgrade-modal .yc-modal-text { color: #a0a0a0; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0; }
      #yc-chords-upgrade-modal .yc-modal-text strong { color: #fff; }
      #yc-chords-upgrade-modal .yc-modal-tip { color: #3ea6ff; font-size: 13px; }
      #yc-chords-upgrade-modal .yc-modal-buttons { display: flex; gap: 12px; margin-top: 25px; }
      #yc-chords-upgrade-modal .yc-modal-btn { flex: 1; padding: 12px 24px; border: none; border-radius: 25px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; }
      #yc-chords-upgrade-modal .yc-modal-btn-upgrade { background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); color: white; }
      #yc-chords-upgrade-modal .yc-modal-btn-upgrade:hover { transform: scale(1.05); box-shadow: 0 5px 20px rgba(243, 156, 18, 0.4); }
      #yc-chords-upgrade-modal .yc-modal-btn-close { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
      #yc-chords-upgrade-modal .yc-modal-btn-close:hover { transform: scale(1.05); box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4); }
    `;

    document.head.appendChild(style);
    applyYouChordsModalLtrIsolation(modal);
    document.body.appendChild(modal);

    modal.querySelector('.yc-modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('.yc-modal-btn-close').addEventListener('click', () => modal.remove());
    const upgradeButton = modal.querySelector('.yc-modal-btn-upgrade');
    if (upgradeButton) upgradeButton.addEventListener('click', () => {
      const upgradeUrl = window.__ycBuildUpgradeUrl
        ? window.__ycBuildUpgradeUrl('https://www.you-chords.com/upgrade')
        : 'https://www.you-chords.com/upgrade';
      if (window.__ycOpenUpgradePage) {
        window.__ycOpenUpgradePage(upgradeUrl, upgradeSource);
      } else {
        window.open(upgradeUrl, '_blank');
      }
      modal.remove();
    });
  }

  function isFreeDurationLimitValidation() {
    return false;
  }

  function showFreeDurationLimitUpgradeModal(source = 'content_free_duration_limit_modal') {
    showChordsUpgradeModal({
      reason: 'free_duration_limit',
      source,
      title: 'Upgrade Required',
      messageHtml: 'There is no video length limit.',
      tipHtml: 'Please try processing the song again.'
    });
  }

  window.showFreeDurationLimitUpgradeModal = showFreeDurationLimitUpgradeModal;

  const YC_FREE_CREDITS_LOW_MODAL_SEEN_KEY = 'yc_free_credits_low_modal_seen_v1';
  const YC_FREE_CREDITS_LOW_USED = 5;
  const YC_FREE_CREDITS_TOTAL = 7;
  const YC_FREE_RESULT_RECOVERY_KEY = 'yc_free_paid_result_recovery_candidates_v1';
  const YC_FREE_RESULT_RECOVERY_TTL_MS = 24 * 60 * 60 * 1000;
  const YC_FREE_RESULT_RECOVERY_MAX_PER_USER = 12;

  function getFreeRecoveryUserId(snapshot = {}) {
    const payload = snapshot.payload || window.ycAuth?.getJWTPayload?.() || null;
    return String(
      snapshot.userId ||
      snapshot.odI ||
      payload?.odI ||
      payload?.uid ||
      payload?.sub ||
      'anonymous'
    );
  }

  function getFreeRecoveryQuotaNumbers(quotaCheck = {}) {
    const payload = window.ycAuth?.getJWTPayload?.() || null;
    const used = Number(quotaCheck.used ?? payload?.chordsUsed);
    const limit = Number(quotaCheck.limit ?? payload?.chordsLimit ?? YC_FREE_CREDITS_TOTAL);
    return {
      used,
      limit
    };
  }

  function isFreeQuotaExhaustedNoCache(quotaCheck = {}) {
    if (!quotaCheck || quotaCheck.allowed) return false;
    const plan = String(quotaCheck.plan || 'free').toLowerCase();
    const reason = String(quotaCheck.reason || '');
    return plan === 'free' &&
      quotaCheck.canAccessCache !== true &&
      (reason === 'quota_exceeded' || reason === 'free_chords_exhausted');
  }

  function shouldMarkFreeResultRecoveryCandidate(quotaCheck = {}) {
    if (!quotaCheck?.allowed) return false;
    const plan = String(quotaCheck.plan || 'free').toLowerCase();
    const { used, limit } = getFreeRecoveryQuotaNumbers(quotaCheck);
    return plan === 'free' &&
      Number.isFinite(used) &&
      Number.isFinite(limit) &&
      limit > 0 &&
      limit <= YC_FREE_CREDITS_TOTAL &&
      used === limit - 1;
  }

  async function readFreeResultRecoveryMap() {
    try {
      if (chrome?.storage?.local) {
        const result = await chrome.storage.local.get([YC_FREE_RESULT_RECOVERY_KEY]);
        return result?.[YC_FREE_RESULT_RECOVERY_KEY] || {};
      }
    } catch (error) {
      console.warn('[FreeResultRecovery] Failed reading recovery state:', error);
    }

    try {
      return JSON.parse(localStorage.getItem(YC_FREE_RESULT_RECOVERY_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  async function writeFreeResultRecoveryMap(nextMap) {
    try {
      if (chrome?.storage?.local) {
        await chrome.storage.local.set({ [YC_FREE_RESULT_RECOVERY_KEY]: nextMap });
        return;
      }
    } catch (error) {
      console.warn('[FreeResultRecovery] Failed saving recovery state:', error);
    }

    try {
      localStorage.setItem(YC_FREE_RESULT_RECOVERY_KEY, JSON.stringify(nextMap));
    } catch (_) { }
  }

  function pruneFreeResultRecoveryMap(map, now = Date.now(), state = null) {
    const nextMap = {};
    for (const [userId, videos] of Object.entries(map || {})) {
      if (!videos || typeof videos !== 'object') {
        if (state) state.changed = true;
        continue;
      }
      const nextVideos = {};
      for (const [videoId, entry] of Object.entries(videos)) {
        const expiresAt = Number(entry?.expiresAt || 0);
        if (expiresAt > now) {
          nextVideos[videoId] = entry;
        } else if (state) {
          state.changed = true;
        }
      }
      if (Object.keys(nextVideos).length > 0) {
        nextMap[userId] = nextVideos;
      } else if (state && Object.keys(videos).length > 0) {
        state.changed = true;
      }
    }
    return nextMap;
  }

  async function markFreePaidResultRecoveryCandidate(videoId, quotaCheck = {}, source = 'unknown') {
    const safeVideoId = String(videoId || '').trim();
    if (!safeVideoId || !shouldMarkFreeResultRecoveryCandidate(quotaCheck)) return false;

    const now = Date.now();
    const userId = getFreeRecoveryUserId(quotaCheck);
    const { used, limit } = getFreeRecoveryQuotaNumbers(quotaCheck);
    const prunedMap = pruneFreeResultRecoveryMap(await readFreeResultRecoveryMap(), now);
    const userMap = prunedMap[userId] && typeof prunedMap[userId] === 'object'
      ? prunedMap[userId]
      : {};

    userMap[safeVideoId] = {
      markedAt: now,
      expiresAt: now + YC_FREE_RESULT_RECOVERY_TTL_MS,
      source,
      used,
      limit
    };
    prunedMap[userId] = Object.fromEntries(
      Object.entries(userMap)
        .sort(([, left], [, right]) => Number(right?.markedAt || 0) - Number(left?.markedAt || 0))
        .slice(0, YC_FREE_RESULT_RECOVERY_MAX_PER_USER)
    );
    await writeFreeResultRecoveryMap(prunedMap);
    return true;
  }

  async function canUseFreePaidResultRecovery(videoId, quotaCheck = {}, source = 'unknown') {
    const safeVideoId = String(videoId || '').trim();
    if (!safeVideoId || !isFreeQuotaExhaustedNoCache(quotaCheck)) return false;

    const now = Date.now();
    const userId = getFreeRecoveryUserId(quotaCheck);
    const rawMap = await readFreeResultRecoveryMap();
    const pruneState = { changed: false };
    const prunedMap = pruneFreeResultRecoveryMap(rawMap, now, pruneState);
    const entry = prunedMap?.[userId]?.[safeVideoId];
    if (pruneState.changed) {
      await writeFreeResultRecoveryMap(prunedMap);
    }

    if (!entry) return false;
    console.log('[FreeResultRecovery] Allowing paid-result recovery', {
      videoId: safeVideoId,
      source,
      markedAt: entry.markedAt || null
    });
    return true;
  }

  window.__ycMarkFreePaidResultRecoveryCandidate = markFreePaidResultRecoveryCandidate;
  window.__ycCanUseFreePaidResultRecovery = canUseFreePaidResultRecovery;
  window.__ycIsFreeQuotaExhaustedNoCache = isFreeQuotaExhaustedNoCache;

  function getFreeCreditsLowSnapshot(options = {}) {
    const payload = options.payload || window.ycAuth?.getJWTPayload?.() || null;
    const plan = String(options.plan || payload?.plan || '').toLowerCase();
    const rawTotal = options.totalCredits ?? options.limit ?? payload?.chordsLimit ?? YC_FREE_CREDITS_TOTAL;
    const rawUsed = options.usedCredits ?? options.used ?? payload?.chordsUsed;
    const totalCredits = Number(rawTotal);
    const usedCredits = Number(rawUsed);

    if (!Number.isFinite(totalCredits) || totalCredits <= 0) return null;
    if (!Number.isFinite(usedCredits) || usedCredits < 0) return null;

    return {
      plan,
      userId: String(options.userId || payload?.odI || 'anonymous'),
      usedCredits: Math.max(0, Math.floor(usedCredits)),
      totalCredits: Math.max(1, Math.floor(totalCredits)),
      remainingCredits: Math.max(0, Math.floor(totalCredits) - Math.floor(usedCredits))
    };
  }

  async function readFreeCreditsLowSeenMap() {
    try {
      if (chrome?.storage?.local) {
        const result = await chrome.storage.local.get([YC_FREE_CREDITS_LOW_MODAL_SEEN_KEY]);
        return result?.[YC_FREE_CREDITS_LOW_MODAL_SEEN_KEY] || {};
      }
    } catch (error) {
      console.warn('[FreeCreditsLowModal] Failed reading seen state:', error);
    }

    try {
      return JSON.parse(localStorage.getItem(YC_FREE_CREDITS_LOW_MODAL_SEEN_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  async function markFreeCreditsLowModalSeen(snapshot, source = 'unknown') {
    const seenMap = await readFreeCreditsLowSeenMap();
    const nextMap = {
      ...seenMap,
      [snapshot.userId]: {
        usedCredits: snapshot.usedCredits,
        totalCredits: snapshot.totalCredits,
        source,
        shownAt: new Date().toISOString()
      }
    };

    try {
      if (chrome?.storage?.local) {
        await chrome.storage.local.set({ [YC_FREE_CREDITS_LOW_MODAL_SEEN_KEY]: nextMap });
        return;
      }
    } catch (error) {
      console.warn('[FreeCreditsLowModal] Failed saving seen state:', error);
    }

    try {
      localStorage.setItem(YC_FREE_CREDITS_LOW_MODAL_SEEN_KEY, JSON.stringify(nextMap));
    } catch (_) { }
  }

  function showFreeCreditsLowModal(options = {}) {
    const snapshot = getFreeCreditsLowSnapshot({
      usedCredits: options.usedCredits ?? YC_FREE_CREDITS_LOW_USED,
      totalCredits: options.totalCredits ?? YC_FREE_CREDITS_TOTAL,
      ...options
    }) || {
      usedCredits: YC_FREE_CREDITS_LOW_USED,
      totalCredits: YC_FREE_CREDITS_TOTAL,
      remainingCredits: YC_FREE_CREDITS_TOTAL - YC_FREE_CREDITS_LOW_USED
    };

    const existingModal = document.getElementById('yc-free-credits-low-modal');
    if (existingModal) existingModal.remove();
    const existingStyle = document.getElementById('yc-free-credits-low-modal-style');
    if (existingStyle) existingStyle.remove();

    const usedCredits = snapshot.usedCredits;
    const totalCredits = snapshot.totalCredits;
    const remainingCredits = Math.max(0, snapshot.remainingCredits);
    const progressPercent = Math.min(100, Math.max(0, Math.round((usedCredits / totalCredits) * 100)));

    const modal = document.createElement('div');
    modal.id = 'yc-free-credits-low-modal';
    modal.innerHTML = `
      <div class="yc-modal-backdrop"></div>
      <div class="yc-modal-content">
        <div class="yc-modal-icon">🎵</div>
        <h2 class="yc-modal-title">Only ${remainingCredits} Free Credits Left</h2>
        <p class="yc-modal-text">
          You’ve used <strong>${usedCredits}</strong> of your <strong>${totalCredits}</strong> free song credits.
          You can keep using YouChords for free, or upgrade to Pro for more monthly songs and longer videos.
        </p>
        <div class="yc-credit-progress" aria-label="${usedCredits} of ${totalCredits} free song credits used">
          <div class="yc-credit-progress-fill" style="width: ${progressPercent}%"></div>
        </div>
        <p class="yc-modal-text yc-modal-tip">
          Pro includes <strong>1,000 songs per month</strong> instead of 7, renews every month,
          and includes a higher monthly quota.
        </p>
        <div class="yc-modal-buttons">
          <button class="yc-modal-btn yc-modal-btn-close">Keep Free</button>
          <button class="yc-modal-btn yc-modal-btn-upgrade">Upgrade</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.id = 'yc-free-credits-low-modal-style';
    style.textContent = `
      #yc-free-credits-low-modal {
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
      #yc-free-credits-low-modal .yc-modal-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
      }
      #yc-free-credits-low-modal .yc-modal-content {
        position: relative;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 20px;
        padding: 38px;
        width: min(430px, calc(100vw - 32px));
        text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.1);
        animation: yc-free-credits-low-appear 0.3s ease;
      }
      @keyframes yc-free-credits-low-appear {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
      }
      #yc-free-credits-low-modal .yc-modal-icon {
        font-size: 46px;
        margin-bottom: 14px;
      }
      #yc-free-credits-low-modal .yc-modal-title {
        color: #fff;
        font-size: 24px;
        margin: 0 0 18px 0;
        font-weight: 700;
      }
      #yc-free-credits-low-modal .yc-modal-text {
        color: #c9d3e6;
        font-size: 15px;
        line-height: 1.6;
        margin: 0 0 15px 0;
      }
      #yc-free-credits-low-modal .yc-modal-text strong {
        color: #fff;
      }
      #yc-free-credits-low-modal .yc-modal-tip {
        color: #9fd2ff;
        font-size: 13px;
        margin-top: 16px;
      }
      #yc-free-credits-low-modal .yc-credit-progress {
        height: 10px;
        width: 100%;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.11);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.25);
      }
      #yc-free-credits-low-modal .yc-credit-progress-fill {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
        box-shadow: 0 0 14px rgba(76, 175, 80, 0.35);
      }
      #yc-free-credits-low-modal .yc-modal-buttons {
        display: flex;
        gap: 12px;
        margin-top: 24px;
      }
      #yc-free-credits-low-modal .yc-modal-btn {
        flex: 1;
        padding: 12px 24px;
        border: none;
        border-radius: 25px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.25s ease;
      }
      #yc-free-credits-low-modal .yc-modal-btn-close {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      #yc-free-credits-low-modal .yc-modal-btn-close:hover {
        transform: scale(1.05);
        box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
      }
      #yc-free-credits-low-modal .yc-modal-btn-upgrade {
        background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
        color: white;
      }
      #yc-free-credits-low-modal .yc-modal-btn-upgrade:hover {
        transform: scale(1.05);
        box-shadow: 0 5px 20px rgba(243, 156, 18, 0.4);
      }
    `;

    document.head.appendChild(style);
    applyYouChordsModalLtrIsolation(modal);
    document.body.appendChild(modal);

    let isClosed = false;
    const closeModal = () => {
      if (isClosed) return;
      isClosed = true;
      modal.remove();
      style.remove();
    };
    modal.querySelector('.yc-modal-backdrop').addEventListener('click', closeModal);
    modal.querySelector('.yc-modal-btn-close').addEventListener('click', closeModal);
    modal.querySelector('.yc-modal-btn-upgrade').addEventListener('click', () => {
      const upgradeUrl = 'https://www.you-chords.com/upgrade';
      if (window.__ycOpenUpgradePage) {
        window.__ycOpenUpgradePage(upgradeUrl, 'content_free_credits_low_modal');
      } else {
        window.open(upgradeUrl, '_blank');
      }
      closeModal();
    });

    return modal;
  }

  async function maybeShowFreeCreditsLowModal(options = {}) {
    const snapshot = getFreeCreditsLowSnapshot(options);
    if (!snapshot) return false;
    if (options.force === true) {
      showFreeCreditsLowModal(snapshot);
      return true;
    }
    if (snapshot.plan !== 'free') return false;
    if (snapshot.totalCredits !== YC_FREE_CREDITS_TOTAL) return false;
    if (snapshot.usedCredits !== YC_FREE_CREDITS_LOW_USED) return false;

    const seenMap = await readFreeCreditsLowSeenMap();
    if (seenMap?.[snapshot.userId]) return false;

    await markFreeCreditsLowModalSeen(snapshot, options.source || 'free_credits_low');
    showFreeCreditsLowModal(snapshot);
    return true;
  }

  window.__ycShowFreeCreditsLowModal = showFreeCreditsLowModal;
  window.__ycMaybeShowFreeCreditsLowModal = maybeShowFreeCreditsLowModal;

  function isMaxDurationLimitValidation() {
    return false;
  }

  function showMaxDurationLimitModal(source = 'content_max_duration_limit_modal') {
    const message = 'This YouTube video could not be processed';
    if (window.ycUtils?.showToast) {
      window.ycUtils.showToast(message, '⚠️', 3500);
      return;
    }

    document.getElementById('yc-max-duration-toast-fallback')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'yc-max-duration-toast-fallback';
    overlay.style.cssText = `
      position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
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
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 3500);
  }

  window.showMaxDurationLimitModal = showMaxDurationLimitModal;

  function isMaxDurationErrorMessage() {
    return false;
  }

  // 🔄 Modal לרענון דף (כשה-Extension התעדכן)
  function showRefreshRequiredOverlay() {
    const existingModal = document.getElementById('yc-refresh-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'yc-refresh-modal';
    modal.innerHTML = `
      <div class="yc-modal-backdrop"></div>
      <div class="yc-modal-content">
        <div class="yc-modal-icon">🔄</div>
        <h2 class="yc-modal-title">Refresh Required</h2>
        <p class="yc-modal-text">The extension was updated.<br>Please <strong>refresh the page</strong> to continue.</p>
        <div class="yc-modal-buttons">
          <button class="yc-modal-btn yc-modal-btn-close">Later</button>
          <button class="yc-modal-btn yc-modal-btn-refresh">Refresh Now</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #yc-refresh-modal {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        z-index: 2147483647; display: flex; align-items: center; justify-content: center;
      }
      #yc-refresh-modal .yc-modal-backdrop {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px);
      }
      #yc-refresh-modal .yc-modal-content {
        position: relative; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 20px; padding: 40px; max-width: 420px; text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.1);
        animation: yc-refresh-modal-appear 0.3s ease;
      }
      @keyframes yc-refresh-modal-appear {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
      }
      #yc-refresh-modal .yc-modal-icon { font-size: 48px; margin-bottom: 15px; }
      #yc-refresh-modal .yc-modal-title { color: #fff; font-size: 24px; margin: 0 0 20px 0; font-weight: 600; }
      #yc-refresh-modal .yc-modal-text { color: #a0a0a0; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0; }
      #yc-refresh-modal .yc-modal-text strong { color: #fff; }
      #yc-refresh-modal .yc-modal-buttons { display: flex; gap: 12px; margin-top: 25px; }
      #yc-refresh-modal .yc-modal-btn { flex: 1; padding: 12px 24px; border: none; border-radius: 25px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; }
      #yc-refresh-modal .yc-modal-btn-refresh { background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%); color: white; }
      #yc-refresh-modal .yc-modal-btn-refresh:hover { transform: scale(1.05); box-shadow: 0 5px 20px rgba(39, 174, 96, 0.4); }
      #yc-refresh-modal .yc-modal-btn-close { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
      #yc-refresh-modal .yc-modal-btn-close:hover { transform: scale(1.05); box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4); }
    `;

    document.head.appendChild(style);
    applyYouChordsModalLtrIsolation(modal);
    document.body.appendChild(modal);

    modal.querySelector('.yc-modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('.yc-modal-btn-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.yc-modal-btn-refresh').addEventListener('click', () => {
      location.reload();
    });
  }

  async function toggleChords() {
    console.log('[DEBUG-TOGGLE] toggleChords called! Current state:', {
      'chordsActive': chordsActive,
      'window.chordsActive': window.chordsActive,
      'overlayCtlChords exists': !!overlayCtlChords,
      'dynamicLoader exists': !!window.dynamicLoader,
      'chordsDisplay exists': !!window.chordsDisplay
    });

    let stopChordsButtonSpinner = null;

    if (!chordsActive && !isChordsLoading && blockClearYouTubeLiveVideoIfNeeded('chords')) {
      clearChordBtn('live-or-upcoming-video');
      return;
    }

    if (!chordsActive && !isChordsLoading) {
      await markYouChordsFeatureUse('carousel');

      const initialChordsBtn = getChordBtn();
      if (initialChordsBtn) {
        initialChordsBtn.classList.add('chords-active');
        console.log('[toggleChords] Immediate UI feedback: chords button turned red');

        const needsFirstChordsLoad = !window.ensurePanelSubset
          || !window.chordsDisplay?.activate
          || !window.ycChordCarousel;
        if (needsFirstChordsLoad) {
          stopChordsButtonSpinner = startYcButtonLoadingSpinner(initialChordsBtn, 'chords');
        }
      }
    }

    // 🔧 טעינת המודולים הנדרשים (כולל lyricsChords עבור ensurePanelSubset)
    if (window.dynamicLoader?.loadGroup && !window.ensurePanelSubset) {
      try {
        console.log('[toggleChords] Loading chords dependencies...');
        await window.dynamicLoader.loadGroup('chords');
        console.log('[toggleChords] ✅ Chords dependencies loaded');
      } catch (err) {
        console.warn('[toggleChords] Failed to load chords dependencies:', err);
      }
    }

    // 🎵 טעינת chordsMode מ-storage (תמיד - לא רק אם לא קיים)
    try {
      const result = await chrome.storage.sync.get(['chordsMode']);
      window.chordsMode = result.chordsMode || 'regular';
      console.log('[toggleChords] Loaded chordsMode from storage:', window.chordsMode);
    } catch (err) {
      console.warn('[toggleChords] Failed to load chordsMode:', err);
      if (!window.chordsMode) window.chordsMode = 'regular';
    }

    // 🎯 בדיקה ראשונה: האם בטעינה? (חשוב לבדוק לפני chordsActive!)
    if (isChordsLoading) {
      console.log('[toggleChords] 🎯 User cancelled during loading - hiding progress bar');

      // סימון שהמשתמש ביטל (הבקשה ממשיכה ברקע, תשמור ב-IndexedDB, אבל לא נפתח קרוסלה)
      window.ycUserCancelledChords = true;
      isChordsLoading = false;
      chordsActive = false;
      window.chordsActive = false;

      // הסרת Progress Bar (גם רגיל וגם Gemini)
      if (window.extractorModule?.removeProgressBar) {
        window.extractorModule.removeProgressBar();
      }
      if (window.extractorModule?.removeSubtitlesProgressBar) {
        window.extractorModule.removeSubtitlesProgressBar();
      }

      // החזרת כפתור ללבן
      clearChordBtn('user-cancelled-loading');

      return;
    }

    // שלב 1: בדיקה פשוטה וחד-משמעית של המצב הנוכחי
    // אנחנו מסתמכים על המשתנה הגלובלי `chordsActive` כמקור האמת היחיד.
    if (chordsActive) {
      // --- מסלול כיבוי ---
      if (DEBUG) console.log('[toggleChords] Deactivating chords...');

      // בטל את ה-controller הפעיל
      overlayCtlChords?.abort();
      overlayCtlChords = null;

      // 🎸 הסתרת הקרוסלה האופקית
      if (window.ycChordCarousel?.hide) {
        window.ycChordCarousel.hide();
        if (DEBUG) console.log('[toggleChords] Chord carousel hidden');
      }

      // קרא לפונקציית הניקוי של התצוגה
      if (window.chordsDisplay?.partialCleanup) {
        window.chordsDisplay.partialCleanup();
      }

      window.chordRenderer?.stopAutoCleanup?.();

      // עצור לולאות רינדור אם קיימות
      stopChordLoops();

      // עדכן את המצב הגלובלי
      chordsActive = false;
      window.chordsActive = false;

      // 🔄 עדכון מיקום כתוביות כשקרוסלה נסגרת
      if (window.subtitleLocationHandlers?.handleTimelineAlwaysVisibleChange) {
        window.subtitleLocationHandlers.handleTimelineAlwaysVisibleChange();
      }

      // נקה את המצב הויזואלי של הכפתור
      clearChordBtn('toggleChords-off');

      // 🎵 Reset pitch אם Pitch Change mode ושני הפאנלים סגורים
      const tuningMode = localStorage.getItem("youchords_tuning_mode") || "songTuning";
      if (tuningMode === "songTuning" && !window.lyricsChordsPanelActive && window.resetPitchFromPitchChange) {
        window.resetPitchFromPitchChange();
        if (DEBUG) console.log('[toggleChords] 🎵 Reset pitch (both panels closed)');
      }

      if (DEBUG) console.log('[content.js] Chords overlay turned OFF by user.');

      // אין צורך ב-return כי אין קוד נוסף בהמשך, אבל זה מוסיף לבהירות.
      return;

    } else {
      // --- מסלול הפעלה ---
      console.log('[DEBUG-TOGGLE] Entering activation path...');
      if (DEBUG) console.log('[toggleChords] Activating chords...');
      const activationVideoId = extractVideoId(location.href);
      const isTutorialDemoAccess = isTutorialDemoVideo(activationVideoId);

      // Respect "Chords Processing" setting from main Settings menu.
      let chordsProcessingEnabled = true;
      try {
        const settingResult = await chrome.storage.sync.get(['chordsProcessingEnabled']);
        chordsProcessingEnabled = settingResult?.chordsProcessingEnabled !== false;
      } catch (settingError) {
        console.warn('[toggleChords] Failed reading chordsProcessingEnabled, defaulting to ON:', settingError);
      }

      if (!chordsProcessingEnabled) {
        if (window.ycUtils?.showToast) {
          window.ycUtils.showToast(
            'Chords are turned off in Settings. Enable Chords Processing to use this button. To enable: Open Settings -> Chords Processing -> set Processing to ON.',
            '⚙️',
            3000
          );
        }
        clearChordBtn('chords-processing-off');
        return;
      }

      // 🔐 SECURITY: בדיקת JWT לפני הכל - חסימת גישה ללא אימות
      const jwt = window.__YC_LOCAL_ONLY__
        ? 'local-only'
        : (window.__ycGetJwtAsync
          ? await window.__ycGetJwtAsync()
          : (window.__ycGetCachedJwt ? window.__ycGetCachedJwt() : null));
      if (!window.__YC_LOCAL_ONLY__ && !jwt && !isTutorialDemoAccess) {
        console.log('[toggleChords] 🔒 No JWT found - user not signed in');
        clearChordBtn('not-signed-in');
        showSignInRequiredModal();
        return;
      } else if (!jwt && isTutorialDemoAccess) {
        console.log('[toggleChords] 🎬 Tutorial demo video - allowing local chords without sign-in');
      }

      // 💡 ONE-TIME PROMPT: הצעת הוספת Gemini API key (רק פעם אחת)
      if (!window.__YC_LOCAL_ONLY__ && !isTutorialDemoAccess) {
        try {
          const result = await chrome.storage.local.get(['geminiApiKeyPromptShown', 'geminiApiKey', 'geminiApiKeys']);
          const promptShown = result.geminiApiKeyPromptShown || false;
          const apiKeys = result.geminiApiKeys || [];
          const hasApiKey = !!result.geminiApiKey || apiKeys.some((keyData) => keyData && keyData.active !== false && keyData.status !== 'disabled');

          // הצג הודעה רק אם: לא הוצגה עדיין + אין API key
          if (!promptShown && !hasApiKey) {
            console.log('[toggleChords] 💡 Showing Gemini API key prompt (first time)');

            // הצג את ההודעה
            if (window.ycUtils?.showGeminiApiKeyPrompt) {
              window.ycUtils.showGeminiApiKeyPrompt(
                // onAddKey - פתיחת popup עם הדגשה
                () => {
                  console.log('[toggleChords] User clicked "Add API Key"');
                  chrome.storage.local.set({
                    geminiApiKeyPromptShown: true,
                    highlightGeminiInput: true
                  });
                  chrome.runtime.sendMessage({ action: 'openPopup' });
                },
                // onMaybeLater - סגירה בלבד
                () => {
                  console.log('[toggleChords] User clicked "Maybe Later"');
                  chrome.storage.local.set({ geminiApiKeyPromptShown: true }, () => {
                    setTimeout(() => {
                      if (chordsActive || isChordsLoading || window.chordsActive) return;
                      toggleChords().catch((retryError) => {
                        console.warn('[toggleChords] Failed to continue after Gemini prompt:', retryError);
                        clearChordBtn('gemini-api-key-prompt-retry-failed');
                      });
                    }, 0);
                  });
                }
              );

              // Pause only while the prompt is open. If the user chooses Later,
              // the callback above resumes the original carousel action.
              clearChordBtn('gemini-api-key-prompt');
              return;
            }
          }
        } catch (promptError) {
          console.warn('[toggleChords] Error checking Gemini API key prompt:', promptError);
          // ממשיכים בכל מקרה - לא חוסמים את הפעולה
        }
      }

      if (!window.__YC_LOCAL_ONLY__ && !isTutorialDemoAccess) {
        try {
          const gate = await chrome.storage.local.get([
            'aiTranscriptionMode',
            'geminiApiKey',
            'geminiApiKeys',
            'promptDisclaimerAccepted'
          ]);
          const mode = typeof gate.aiTranscriptionMode === 'string'
            ? gate.aiTranscriptionMode.toLowerCase()
            : 'off';
          const normalizedMode = (mode === 'auto' || mode === 'always') ? mode : 'off';
          const hasApiKey = !!gate.geminiApiKey
            || (Array.isArray(gate.geminiApiKeys)
              && gate.geminiApiKeys.some((keyData) => keyData && keyData.active !== false && keyData.status !== 'disabled'));

          if (normalizedMode === 'always' && hasApiKey && gate.promptDisclaimerAccepted !== true) {
            if (window.ycUtils?.showToast) {
              window.ycUtils.showToast(
                'Gemini ALWAYS requires prompt responsibility approval first.',
                '⚠️',
                5000
              );
            }
            chrome.storage.local.set({ highlightPromptDisclaimer: true }, () => {
              chrome.runtime.sendMessage({ action: 'openPopup' });
            });
            clearChordBtn('gemini-prompt-responsibility-required');
            return;
          }
        } catch (geminiGateError) {
          console.warn('[toggleChords] Failed checking Gemini prompt responsibility gate:', geminiGateError);
        }
      }

      // 🔐 QUOTA CHECK: בדיקת מכסה לפני הכל (Fail-Safe: חסום אם יש בעיה)
      let quotaCheck = null;
      let cacheOnlyMode = false; // מצב שבו רק IndexedDB זמין (מנוי פעיל אבל סיים לימיט)
      let allowPaidResultRecovery = false;

      if (!isTutorialDemoAccess) {
        try {
          await ensureYcAuthLoadedForAction('toggleChords');

          // Fail-Safe: אם ycAuth לא נטען - חסום גישה
          if (!window.ycAuth?.checkQuotaLocal) {
            console.error('[toggleChords] ycAuth not available - blocking access (Fail-Safe)');
            if (window.ycUtils?.showErrorOverlay) {
              window.ycUtils.showErrorOverlay('⚠️ Authentication system not loaded. Please reload the page.', 5000);
            } else {
              alert('Authentication system not loaded. Please reload the page.');
            }
            clearChordBtn('auth-system-not-loaded');
            return;
          }


          if (window.ycAuth?.ensureFreshSubscriptionForGating) {
            try {
              await window.ycAuth.ensureFreshSubscriptionForGating();
            } catch (refreshError) {
              console.warn('[toggleChords] Silent subscription refresh before quota check failed:', refreshError);
            }
          }

          quotaCheck = window.ycAuth.checkQuotaLocal('chords');
          console.log('[toggleChords] Quota check result:', quotaCheck);
          allowPaidResultRecovery = await canUseFreePaidResultRecovery(activationVideoId, quotaCheck, 'carousel');

        // Check if we need to delete IndexedDB (bonus expired or free chords exhausted)
        if (quotaCheck.shouldDeleteChordsDB && !allowPaidResultRecovery) {
          console.log('[toggleChords] Deleting ChordsDB due to:', quotaCheck.reason);
          try {
            if (window.databaseManager?.deleteChordsDatabase) {
              await window.databaseManager.deleteChordsDatabase();
            } else {
              console.warn('[toggleChords] databaseManager.deleteChordsDatabase not available - skipping DB deletion');
            }
            console.log('[toggleChords] Chords DB deleted successfully');
          } catch (e) {
            console.error('[toggleChords] Failed to delete Chords DB:', e);
          }
        }

        if (!quotaCheck.allowed) {
          console.log('[toggleChords] Quota check failed:', quotaCheck.reason);

          // בדיקה אם המשתמש לא מחובר - הצגת modal יפה
          if (quotaCheck.reason === 'not_logged_in') {
            clearChordBtn('quota-not-logged-in');
            showSignInRequiredModal();
            return;
          }

          // 🆕 subscription_ended - מנוי שפג תוקף (Pro → Free)
          if (quotaCheck.reason === 'subscription_ended') {
            clearChordBtn('subscription-ended');
            showSubscriptionExpiredModal();
            return;
          }

          if (allowPaidResultRecovery) {
            console.log('[toggleChords] Free quota exhausted - attempting already-paid result recovery for this video');
            cacheOnlyMode = false;
          }

          // bonus_expired or free_chords_exhausted - no access at all
          if (quotaCheck.reason === 'bonus_expired' || (quotaCheck.reason === 'free_chords_exhausted' && !allowPaidResultRecovery)) {
            clearChordBtn('credits-exhausted');
            showChordsUpgradeModal();
            return;
          }

          // subscription_ended - מנוי שהסתיים, צריך לשדרג
          if (quotaCheck.reason === 'subscription_ended') {
            clearChordBtn('subscription-ended-upgrade');
            showChordsUpgradeModal();
            return;
          }

          // bonus_exhausted - can still access cache
          if (quotaCheck.reason === 'bonus_exhausted') {
            if (quotaCheck.canAccessCache) {
              console.log('[toggleChords] Bonus exhausted but can access cache');
              cacheOnlyMode = true;
            } else {
              let errorMessage = '🎵 You\'ve used all your bonus chords.\n\nYou can still view previously downloaded chords until your bonus expires.';
              if (window.ycUtils?.showErrorOverlay) {
                window.ycUtils.showErrorOverlay(errorMessage, 5000);
              } else {
                alert(errorMessage);
              }
              clearChordBtn('bonus-exhausted-no-cache');
              return;
            }
          }

          // quota_exceeded - בדיקה אם יכול לגשת ל-cache (מנוי פעיל)
          if (quotaCheck.reason === 'quota_exceeded') {
            if (quotaCheck.canAccessCache) {
              // מנוי פעיל שסיים לימיט - יכול לראות רק מה שב-IndexedDB
              console.log('[toggleChords] Paid user with exhausted quota - cache-only mode');
              cacheOnlyMode = true;
              // ממשיכים - לא חוסמים
            } else {
              // Free user שסיים קרדיטים - חסום לגמרי
              if (!allowPaidResultRecovery) {
                clearChordBtn('quota-exceeded-no-cache');
                showChordsUpgradeModal();
                return;
              }
            }
          }
        }
        if (DEBUG) console.log('[toggleChords] Quota check passed:', quotaCheck, 'cacheOnlyMode:', cacheOnlyMode, 'allowPaidResultRecovery:', allowPaidResultRecovery);
        } catch (quotaError) {
          // Fail-Safe: אם יש שגיאה בבדיקה - חסום גישה
          console.error('[toggleChords] Quota check error - blocking access (Fail-Safe):', quotaError);
          if (window.ycUtils?.showErrorOverlay) {
            window.ycUtils.showErrorOverlay('⚠️ Authentication error. Please reload the page.', 5000);
          } else {
            alert('Authentication error. Please reload the page.');
          }
          clearChordBtn('quota-error');
          return;
        }
      } else {
        quotaCheck = { allowed: true, reason: 'tutorial_demo' };
        cacheOnlyMode = false;
        allowPaidResultRecovery = false;
        console.log('[toggleChords] 🎬 Tutorial demo - skipping quota check and using local demo chords');
      }

      // שמירת מצב cache-only לשימוש בהמשך
      window.ycCacheOnlyMode = cacheOnlyMode;

      // צור controller חדש לפעולה הנוכחית
      overlayCtlChords = new AbortController();
      console.log('[DEBUG-TOGGLE] Created new AbortController');

      // 🎨 Optimistic UI: הפוך את הכפתור לאדום מיד (לפני validation)
      const chordsBtn = getChordBtn();
      if (chordsBtn) {
        chordsBtn.classList.add('chords-active');
        console.log('[DEBUG-TOGGLE] Optimistic UI: Added chords-active class immediately');
      }

      const videoId = extractVideoId(location.href);

      if (!videoId) {
        if (DEBUG) console.log('[content.js] No video ID found in URL for chords.');
        // 🎨 Optimistic UI: החזר ללבן אם אין videoId
        clearChordBtn('no-video-id');
        return; // אין טעם להמשיך
      }

      if (isTutorialDemoAccess) {
        try {
          await ensureTutorialDemoChords(videoId);
        } catch (demoError) {
          console.error('[toggleChords] Failed loading tutorial demo chords:', demoError);
          clearChordBtn('tutorial-demo-chords-error');
          return;
        }
      }

      const activationNavigationToken = getNavigationToken();
      const requestedVideoId = videoId;
      const isActivationStale = () => (
        navigationInProgress ||
        !isNavigationTokenCurrent(activationNavigationToken) ||
        extractVideoId(location.href) !== requestedVideoId
      );
      const throwIfActivationStale = (stage) => {
        if (!isActivationStale()) return;
        if (DEBUG) {
          console.log(`[toggleChords] Stale activation blocked at ${stage}`, {
            activationNavigationToken,
            currentNavigationToken: getNavigationToken(),
            navigationInProgress,
            requestedVideoId,
            currentVideoId: extractVideoId(location.href)
          });
        }
        throw new DOMException('Activation became stale due to navigation', 'AbortError');
      };
      const handleStaleActivationAbort = (stage, err) => {
        if (err?.name !== 'AbortError') return false;
        if (DEBUG) {
          console.log(`[toggleChords] Activation skipped at ${stage} due to navigation`);
        }
        isChordsLoading = false;
        chordsActive = false;
        window.chordsActive = false;
        clearChordBtn(`stale-${stage}`);
        overlayCtlChords?.abort();
        overlayCtlChords = null;
        return true;
      };
      try {
        throwIfActivationStale('before-validation');
      } catch (err) {
        if (handleStaleActivationAbort('before-validation', err)) return;
        throw err;
      }

      // 🔥 VALIDATION: בדיקת התאמת הסרטון לפני שינוי המצב הויזואלי
      try {
        const currentUrl = window.location.href;
        if (isTutorialDemoAccess) {
          console.log('[toggleChords] 🎬 Tutorial demo - skipping music validation');
        } else if (window.videoValidator && typeof window.videoValidator.validateVideo === 'function') {
          const validationResult = await window.videoValidator.validateVideo(currentUrl, {
            durationContext: 'processing'
          });
          if (!validationResult.isValid) {
            console.log('[toggleChords] Video validation failed:', validationResult.message);
            const validationToastDuration = validationResult.toastDurationMs || 3000;

            // 🎨 Optimistic UI: החזר ללבן כי הvalidation נכשל
            clearChordBtn('validation-failed');

            if (isFreeDurationLimitValidation(validationResult)) {
              showFreeDurationLimitUpgradeModal('content_carousel_free_duration_validation');
              overlayCtlChords?.abort();
              overlayCtlChords = null;
              return;
            }
            if (isMaxDurationLimitValidation(validationResult)) {
              showMaxDurationLimitModal('content_carousel_max_duration_validation');
              overlayCtlChords?.abort();
              overlayCtlChords = null;
              return;
            }

            // הצגת הודעת שגיאה בסגנון Toast (בלי אייקון)
            if (window.ycUtils && typeof window.ycUtils.showToast === 'function') {
              window.ycUtils.showToast(validationResult.message || 'This YouTube video could not be validated', '⚠️', validationToastDuration);
            } else {
              // fallback - הצגה מקומית
              console.warn('[toggleChords] ycUtils not available, showing local error message');
              const errorMessage = validationResult.message || 'This YouTube video could not be validated';
              // יצירת overlay מקומי פשוט
              const overlay = document.createElement('div');
              overlay.style.cssText = `
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.8); color: white; padding: 20px; border-radius: 8px;
                z-index: 10000; font-size: 16px; text-align: center; max-width: 400px;
                white-space: pre-line; line-height: 1.4;
              `;
              overlay.textContent = errorMessage;
              document.body.appendChild(overlay);
              setTimeout(() => overlay.remove(), validationToastDuration);
            }

            // ניקוי ה-controller שנוצר
            overlayCtlChords?.abort();
            overlayCtlChords = null;

            return; // יציאה מהפונקציה אם הבדיקה נכשלת
          }
        } else {
          // 🔧 FIX: Wait for videoValidator to load (max 3 seconds)
          console.log('[toggleChords] ⏳ Waiting for videoValidator to load...');

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
            const validationResult = await window.videoValidator.validateVideo(currentUrl, {
              durationContext: 'processing'
            });
            if (!validationResult.isValid) {
              console.log('[toggleChords] Video validation failed:', validationResult.message);
              const validationToastDuration = validationResult.toastDurationMs || 3000;
              clearChordBtn('validation-failed');
              if (isFreeDurationLimitValidation(validationResult)) {
                showFreeDurationLimitUpgradeModal('content_carousel_free_duration_validation_waited');
                overlayCtlChords?.abort();
                overlayCtlChords = null;
                return;
              }
              if (isMaxDurationLimitValidation(validationResult)) {
                showMaxDurationLimitModal('content_carousel_max_duration_validation_waited');
                overlayCtlChords?.abort();
                overlayCtlChords = null;
                return;
              }
              if (window.ycUtils?.showToast) {
                window.ycUtils.showToast(validationResult.message || 'This YouTube video could not be validated', '⚠️', validationToastDuration);
              }
              overlayCtlChords?.abort();
              overlayCtlChords = null;
              return;
            }
            console.log('[toggleChords] ✅ Validation passed after waiting');
          } else {
            // Validator failed to load - block access for safety
            console.error('[toggleChords] ❌ videoValidator failed to load - blocking for safety');
            clearChordBtn('validator-not-loaded');
            if (window.ycUtils?.showErrorOverlay) {
              window.ycUtils.showErrorOverlay('⚠️ Please reload the page and try again.', 3000);
            }
            overlayCtlChords?.abort();
            overlayCtlChords = null;
            return;
          }
        }
      } catch (validationError) {
        console.error('[toggleChords] Error during video validation:', validationError);

        // 🎨 Optimistic UI: החזר ללבן כי הייתה שגיאה
        clearChordBtn('validation-error');

        // ניקוי ה-controller שנוצר
        overlayCtlChords?.abort();
        overlayCtlChords = null;

        return; // יציאה מהפונקציה במקרה של שגיאה
      }

      try {
        throwIfActivationStale('before-state-commit');
      } catch (err) {
        if (handleStaleActivationAbort('before-state-commit', err)) return;
        throw err;
      }

      if (window.extractorModule?.createProgressBar) {
        const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
        const durationMinutes = video?.duration ? video.duration / 60 : null;
        window.extractorModule.createProgressBar(false, false, null, {
          durationMinutes,
          initialProgress: true
        });
      }

      // עדכן את המצב הגלובלי *רק אחרי* שהvalidation עבר בהצלחה
      console.log('[DEBUG-TOGGLE] Setting chordsActive to true...');
      chordsActive = true;
      window.chordsActive = true;

      // 🔄 עדכון מיקום כתוביות כשקרוסלה נפתחת
      if (window.subtitleLocationHandlers?.handleTimelineAlwaysVisibleChange) {
        window.subtitleLocationHandlers.handleTimelineAlwaysVisibleChange();
      }
      // הכפתור כבר אדום מה-Optimistic UI למעלה

      // הקוד האסינכרוני להפעלת האקורדים
      window.dynamicLoader?.loadGroup('carousel')
        .then(async () => {
          throwIfActivationStale('after-loadGroup');

          // 🎯 טעינת chordRenderer לפני הצגת הקרוסלה
          console.log('[toggleChords] 🎨 Loading chordRenderer...');
          if (window.ensureChordDependencies) {
            const rendererLoaded = await window.ensureChordDependencies();
            throwIfActivationStale('after-ensureChordDependencies');
            if (rendererLoaded) {
              console.log('[toggleChords] ✅ chordRenderer loaded successfully');
            } else {
              console.warn('[toggleChords] ⚠️ chordRenderer failed to load, diagrams may not appear');
            }
          } else {
            console.warn('[toggleChords] ⚠️ ensureChordDependencies not available');
          }

          // 🎯 טעינת PANEL_SUBSET לפני הצגת הקרוסלה
          console.log('[toggleChords] 📦 Loading PANEL_SUBSET...');
          if (window.ensurePanelSubset) {
            const panelSubset = await window.ensurePanelSubset(videoId);
            throwIfActivationStale('after-ensurePanelSubset');
            if (panelSubset) {
              console.log('[toggleChords] ✅ PANEL_SUBSET loaded successfully with', Object.keys(panelSubset.chords).length, 'chords');
              // 🎸 בדיקת tuning והצגת הודעה אם צריך
              if (window.checkNonStandardTuning) {
                window.checkNonStandardTuning(panelSubset.tuningValue, panelSubset.hasNonStandardTuning);
              }
            } else {
              // Not a warning - carousel has fallback and diagrams still appear
              console.log('[toggleChords] PANEL_SUBSET not loaded from main panel - using fallback');
            }
          } else {
            console.warn('[toggleChords] ⚠️ ensurePanelSubset not available');
          }

          if (!window.chordsDisplay?.activate) {
            throw new Error("chordsDisplay.activate is not available");
          }

          // 🎯 סימון תחילת טעינה ואיפוס flag ביטול
          isChordsLoading = true;
          window.ycUserCancelledChords = false;

          // 🚀 Start subtitles extraction in parallel (save promise for later)
          window.ycSubtitlesExtractionPromise = (async () => {
            try {
              if (isActivationStale()) {
                return false;
              }

              if (!window.videoValidator || !window.databaseManager || !window.extractorModule) {
                console.log('[toggleChords] Subtitles modules not loaded, skipping parallel extraction');
                return false;
              }

              // 1. Check what prompt the user selected
              const settings = await chrome.storage.local.get(['showTranslation', 'translationLanguage']);
              const requestedTranslation = settings.showTranslation || false;
              const aiSettings = await chrome.storage.local.get([
                'aiTranscriptionMode',
                'promptDisclaimerAccepted',
                'whisperSubtitleLanguage',
                'whisperSubtitleModel',
              ]);
              const storedWhisperLanguage = String(aiSettings.whisperSubtitleLanguage || '').trim().toLowerCase();
              const preferredWhisperLanguage = storedWhisperLanguage === 'auto'
                ? 'auto'
                : (/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(storedWhisperLanguage)
                  ? storedWhisperLanguage
                  : 'auto');
              const storedWhisperModel = String(aiSettings.whisperSubtitleModel || '').trim().toLowerCase();
              const preferredWhisperModel = typeof window.ycWhisperTranscription?.normalizeModel === 'function'
                ? window.ycWhisperTranscription.normalizeModel(storedWhisperModel)
                : (['large-v2', 'large-v3'].includes(storedWhisperModel) ? storedWhisperModel : 'large-v2');
              const rawAiMode = typeof aiSettings.aiTranscriptionMode === 'string'
                ? aiSettings.aiTranscriptionMode.toLowerCase()
                : 'off';
              const configuredAiMode = isTutorialDemoAccess
                ? 'off'
                : (['off', 'auto', 'always'].includes(rawAiMode) ? rawAiMode : 'off');
              const aiMode = aiSettings.promptDisclaimerAccepted === true ? configuredAiMode : 'off';
              const useTranslation = aiMode === 'off' ? false : requestedTranslation;

              if (requestedTranslation && aiMode === 'off') {
                console.log('[toggleChords] AI mode OFF - ignoring translation selection, using DEFAULT');
              }

              // 2. Load from IndexedDB
              const rawSubtitlesData = await window.databaseManager.loadFromDatabase('subtitles', videoId);
              let subtitlesData = rawSubtitlesData;
              if (subtitlesData && window.databaseManager?.normalizeSubtitlesForActiveMode) {
                subtitlesData = await window.databaseManager.normalizeSubtitlesForActiveMode(subtitlesData, aiMode);
              }

              // 3. Check if the specific prompt exists
              let needsExtraction = false;
              if (!subtitlesData) {
                // No data at all
                needsExtraction = true;
                console.log('[toggleChords] No subtitles in DB, extraction needed');
              } else if (useTranslation) {
                // User wants TRANSLATION - check if translationSRT exists
                needsExtraction = !subtitlesData.translationSRT?.trim();
                if (needsExtraction) {
                  console.log('[toggleChords] TRANSLATION not in DB, extraction needed');
                } else {
                  console.log('[toggleChords] TRANSLATION already in DB');
                }
              } else {
                // User wants DEFAULT. The normalized active default already
                // must now be backed by a local Whisper transcript.
                const hasWhisperDefault = !!rawSubtitlesData?.whisperSentenceSRT?.trim();
                const cachedWhisperLanguage = String(
                  rawSubtitlesData?.whisperRequestedLanguage
                    || rawSubtitlesData?.requestedLanguage
                    || 'auto'
                ).trim().toLowerCase() || 'auto';
                const cachedWhisperModel = String(rawSubtitlesData?.whisperModel || 'large-v2').trim().toLowerCase();
                needsExtraction = !hasWhisperDefault
                  || cachedWhisperLanguage !== preferredWhisperLanguage
                  || cachedWhisperModel !== preferredWhisperModel;
                if (needsExtraction) {
                  console.log('[toggleChords] DEFAULT not in DB, extraction needed', {
                    aiMode,
                    hasActiveDefault: !!subtitlesData.hasActiveDefault,
                    hasWhisperDefault,
                    cachedWhisperLanguage,
                    preferredWhisperLanguage,
                    cachedWhisperModel,
                    preferredWhisperModel,
                  });
                } else {
                  console.log('[toggleChords] DEFAULT already in DB');
                }
              }

              if (!needsExtraction) {
                return true; // Already have the requested prompt
              }

              console.log('[toggleChords] 🚀 Starting parallel subtitles extraction...');

              // Whisper is always the local transcription engine, regardless
              // of the legacy Gemini preference. Show progress for every job.
              const video = document.querySelector('video.html5-main-video');
              const durationMinutes = video?.duration ? video.duration / 60 : 3;
              if (window.extractorModule?.createSubtitlesProgressBar) {
                window.extractorModule.createSubtitlesProgressBar(durationMinutes, {
                  showLongVideoHint: false,
                  label: `Whisper ${preferredWhisperModel}`
                });
              }

              // Start extraction
              const result = await window.extractorModule.extractSubtitlesFromTarGz(
                videoId,
                preferredWhisperLanguage === 'auto' ? null : preferredWhisperLanguage,
                null,
                {
                  ignoreCustomPrompts: true,
                  whisperModel: preferredWhisperModel,
                }
              );
              console.log('[toggleChords] ✅ Parallel subtitles extraction completed');
              return result;
            } catch (error) {
              console.error('[toggleChords] Error in parallel subtitles extraction:', error);
              if (window.extractorModule?.removeSubtitlesProgressBar) {
                window.extractorModule.removeSubtitlesProgressBar();
              }
              return false;
            }
          })();

          // העבר את ה-controller החדש לפונקציית ההפעלה
          throwIfActivationStale('before-chordsDisplay.activate');
          stopChordsButtonSpinner?.();
          stopChordsButtonSpinner = null;
          return window.chordsDisplay.activate(videoId, overlayCtlChords, {
            allowPaidResultRecovery
          });
        })
        .then(activationResult => {
          // 🎯 סיום טעינה
          isChordsLoading = false;
          stopChordsButtonSpinner?.();
          stopChordsButtonSpinner = null;

          if (isActivationStale()) {
            console.log('[toggleChords] Stale activation result ignored');
            chordsActive = false;
            window.chordsActive = false;
            clearChordBtn('stale-activation-result');
            return;
          }

          // 🎯 בדיקה אם המשתמש ביטל באמצע הטעינה
          if (window.ycUserCancelledChords) {
            console.log('[toggleChords] 🎯 User cancelled - not showing carousel (data saved to IndexedDB)');
            window.ycUserCancelledChords = false;
            chordsActive = false;
            window.chordsActive = false;
            clearChordBtn('user-cancelled-after-load');
            return;
          }

          // בדיקה אם הפעולה בוטלה בזמן הטעינה
          if (overlayCtlChords?.signal.aborted) {
            console.log('[toggleChords] Activation was aborted during process.');
            // ניקוי נוסף אם צריך
            if (chordsActive) { // אם המצב עדיין "פעיל" למרות הביטול
              toggleChords(); // קרא שוב לפונקציה כדי לכבות הכל בצורה נקייה
            }
            return;
          }

          if (!activationResult) {
            throw new Error("Chord activation failed or returned a falsy value.");
          }

          // וודא שהכפתור נשאר פעיל אחרי הצלחה
          const chordsBtn = getChordBtn();
          if (chordsBtn && !chordsBtn.classList.contains('chords-active')) {
            chordsBtn.classList.add('chords-active');
            if (DEBUG) console.log('[content.js] Re-added chords-active class to button after successful activation.');
          }

          // 🎸 הצגת הקרוסלה האופקית
          if (window.ycChordCarousel && window.chordsDisplay?.currentSongData?.chords) {
            try {
              // המרת נתוני האקורדים לפורמט של הקרוסלה
              const chords = window.chordsDisplay.currentSongData.chords.map(chord => ({
                name: chord.name,
                time: chord.time
              }));

              // מציאת אלמנט הוידאו
              const videoElement = document.querySelector('video.html5-main-video');

              if (chords.length > 0 && videoElement) {
                window.ycChordCarousel.show(chords, videoElement);
                if (DEBUG) console.log('[toggleChords] Chord carousel shown with', chords.length, 'chords');
              } else {
                console.warn('[toggleChords] Cannot show carousel - missing chords or video element');
              }
            } catch (carouselError) {
              console.error('[toggleChords] Error showing chord carousel:', carouselError);
            }
          }

          if (DEBUG) console.log('[content.js] Chords overlay turned ON successfully.');
          window.extractorModule?.completeProgressBar?.();
        })
        .catch(err => {
          // 🎯 סיום טעינה (גם במקרה של שגיאה)
          isChordsLoading = false;
          stopChordsButtonSpinner?.();
          stopChordsButtonSpinner = null;

          if (err.name === 'AbortError') {
            if (DEBUG) console.log('[content.js] Chord activation aborted by signal.');
          } else if (err.message === 'QUOTA_EXHAUSTED') {
            // Quota exhausted - delete IndexedDB and show upgrade modal
            console.log('[content.js] Quota exhausted from server - deleting IndexedDB and showing upgrade modal');
            if (err.shouldDeleteChordsDB) {
              try {
                if (window.databaseManager?.deleteChordsDatabase) {
                  window.databaseManager.deleteChordsDatabase();
                } else {
                  console.warn('[content.js] databaseManager.deleteChordsDatabase not available - skipping DB deletion');
                }
                console.log('[content.js] Chords DB deleted');
              } catch (e) {
                console.error('[content.js] Failed to delete Chords DB:', e);
              }
            }
            showChordsUpgradeModal();
          } else if (err.message?.includes('Extension context invalidated')) {
            // Extension was reloaded - show refresh message
            console.log('[content.js] Extension context invalidated - showing refresh message');
            showRefreshRequiredOverlay();
          } else {
            console.error('[content.js] Failed to activate chords:', err);
          }

          // במקרה של כל שגיאה, בצע כיבוי נקי
          chordsActive = false; // החזר את המצב ל-false
          window.chordsActive = false;
          clearChordBtn('activation-error');
          window.extractorModule?.removeProgressBar?.();
          overlayCtlChords?.abort(); // בטל את ה-controller אם עדיין קיים
          overlayCtlChords = null;
          window.chordsDisplay?.partialCleanup();
        });
    }
  }

  /*───────────────────────────────────────────────────────────────────────────┐
  │ 4. overlay SUBTITLES – toggle + partialCleanup                            │
  └───────────────────────────────────────────────────────────────────────────*/
  let subsActive = false;
  function toggleSubs() {
    subsActive = !subsActive;

    if (subsActive) {
      markYouChordsFeatureUse('subtitles');

      // הפעלת ניקוי תקופתי אם לא פעיל
      if (DEBUG && !window.periodicCleanupId) {
        window.periodicCleanupId = setInterval(periodicCleanup, 5 * 60 * 1000);
        bin.timers.add(window.periodicCleanupId);
        DEBUG && console.log('[toggleSubs] Started periodic cleanup');
      }
    }

    return subsActive;
  }
  window.toggleSubs = toggleSubs;
  window.setSubsActive = function (active) {
    subsActive = active === true;
    return subsActive;
  };
  function activateSubs() {
    overlayCtlSubs = new AbortController();
    timersSubs.length = rafSubs.length = 0;
    overlayCtlSubs?.signal?.addEventListener('abort', () => {
      // placeholder for potential future cleanup
    }, { once: true });
    DEBUG && console.log('[overlay ON] subtitles');
  }
  function partialCleanupSubs() {
    // 🔥 FIX #6: Always clean RAF arrays, even if overlayCtlSubs is null
    // Clean RAF callbacks first (defensive)
    if (Array.isArray(rafSubs) && rafSubs.length > 0) {
      rafSubs.forEach(id => {
        try {
          cancelAnimationFrame(id);
        } catch (e) {
          // Ignore errors for invalid RAF IDs
        }
      });
      rafSubs.length = 0;
      if (DEBUG) console.log('[partialCleanupSubs] Cleaned RAF callbacks');
    }

    // Clean timers
    if (Array.isArray(timersSubs) && timersSubs.length > 0) {
      timersSubs.forEach(id => {
        try {
          clearInterval(id);
          clearTimeout(id);
          bin.timers?.delete(id);
        } catch (e) {
          // Ignore errors
        }
      });
      timersSubs.length = 0;
      if (DEBUG) console.log('[partialCleanupSubs] Cleaned timers');
    }

    // Abort controller if exists
    if (overlayCtlSubs) {
      overlayCtlSubs.abort?.();
      overlayCtlSubs = null;
      if (DEBUG) console.log('[partialCleanupSubs] Aborted overlayCtlSubs');
    } else {
      if (DEBUG) console.log('[partialCleanupSubs] overlayCtlSubs was already null');
    }
  }

  /*───────────────────────────────────────────────────────────────────────────┐
  │ 5. fullCleanup – במעבר-סרטון / רענון                                      │
  └───────────────────────────────────────────────────────────────────────────*/
  function fullCleanup() {
    console.log('%c[YouChords] fullCleanup - start', 'background:#f44; color:white; padding:2px 5px; border-radius:3px;');
    resetYcSessionPrewarmRuntime('fullCleanup');
    clearAllYcButtonLoadingSpinners();
    clearButtonsTourSchedule();
    stopButtonsTour({ markSeen: false });

    // ניתוק מיידי של בקרי Overlay לפני כל פעולה אחרת
    overlayCtlChords?.abort?.();
    overlayCtlSubs?.abort?.();

    if (chordsActive && window.chordsDisplay?.partialCleanup) {
      window.chordsDisplay.partialCleanup();
    }
    overlayCtlChords = null;

    // 🔥 FIX #1: Stop chordRenderer auto-cleanup interval
    if (window.chordRenderer?.stopAutoCleanup) {
      window.chordRenderer.stopAutoCleanup();
      if (DEBUG) console.log('[fullCleanup] Stopped chordRenderer auto-cleanup interval');
    }

    // 🔥 FIX #2: Clear spanCleanupTimerId interval
    if (window.spanCleanupTimerId) {
      clearInterval(window.spanCleanupTimerId);
      window.spanCleanupTimerId = null;
      if (DEBUG) console.log('[fullCleanup] Cleared spanCleanupTimerId interval');
    }

    // 🔥 FIX #3: Cleanup all progress bars (chords + subtitles)
    if (window.extractorModule?.cleanupAllProgressBars) {
      window.extractorModule.cleanupAllProgressBars();
      if (DEBUG) console.log('[fullCleanup] Cleaned up all progress bars');
    }

    // 🔥 FIX #4: Clear periodicCleanupId interval
    if (window.periodicCleanupId) {
      clearInterval(window.periodicCleanupId);
      window.periodicCleanupId = null;
      if (DEBUG) console.log('[fullCleanup] Cleared periodicCleanupId interval');
    }

    // --- MODIFIED: Always clean up subtitles regardless of subsActive state ---
    // השתמש באופציונלי chaining במקום בדיקת typeof לביטחון רב יותר
    if (window.cleanupSubtitles) {
      if (DEBUG) console.log('[content.js fullCleanup] Calling window.cleanupSubtitles() regardless of subsActive state');
      try {
        window.cleanupSubtitles();
      } catch (e) {
        if (DEBUG) console.warn('[content.js fullCleanup] Error calling cleanupSubtitles:', e);
      }
    } else {
      // ניקוי חלופי באמצעות optional chaining (שיטה בטוחה יותר)
      if (DEBUG) console.log('[content.js fullCleanup] cleanupSubtitles not yet loaded, using fallback cleanup');

      // ניקוי אלמנטי כתוביות באופן ישיר (לא כולל הכפתור עצמו!)
      document.querySelectorAll('.yc-subtitle-element, .yc-subtitle-overlay, .subtitle-settings-menu').forEach(el => {
        try { el.remove(); } catch (e) { /* ignore */ }
      });

      // ניקוי משתני כתוביות גלובליים אם הם קיימים
      if (window.subtitleState) {
        if (window.subtitleState.overlay) {
          try { window.subtitleState.overlay.remove(); } catch (e) { /* ignore */ }
        }
        if (window.subtitleState.textContainer) {
          try { window.subtitleState.textContainer.remove(); } catch (e) { /* ignore */ }
        }
        window.subtitleState.isVisible = false;
      }
    }
    // --- END MODIFIED ---

    if (window.cleanupSubflowManager) {
      try {
        window.cleanupSubflowManager();
      } catch (e) {
        if (DEBUG) console.warn('[content.js fullCleanup] Error cleaning subtitle workflow:', e);
      }
    } else {
      document.querySelectorAll('.yc-subflow-panel').forEach(el => el.remove());
    }

    // partialCleanupSubs() המקורית עדיין נשארת כי היא מנקה דברים ספציפיים ל-overlay של content.js
    // MODIFIED: Always call partialCleanupSubs regardless of subsActive state
    partialCleanupSubs();
    overlayCtlSubs = null;

    stopChordLoops();

    chordsActive = false;
    window.chordsActive = false;
    subsActive = false;
    // --- REMOVED: userWantsChordsActive is no longer set or reset here ---

    clearChordBtn('fullCleanup');

    // עצירת בדיקת כפתורים
    stopButtonCheck();

    // Worker management removed - using direct import() now

    // ניקוי prefetch promise
    currentPrefetchPromise = null;

    // ניקוי נתוני אקורדים גלובליים
    window.COMPLETE_CHORDS = null;
    window.COMPLETE_CHORDS_COMPACT = null;

    // עצירת Firestore realtime listeners שנשארו מעיבוד שננטש בניווט
    window.firestoreListener?.stopAllListeners?.();

    // ניקוי רפרנסים לווידאו
    if (window.subtitleVideoElement) {
      window.subtitleVideoElement = null;
    }

    // ניקוי heap monitor אם קיים
    if (window.heapMonitorId) {
      clearInterval(window.heapMonitorId);
      bin.timers.delete(window.heapMonitorId);
      window.heapMonitorId = null;
    }

    videoCtl.abort();
    videoCtl = new AbortController();

    DEBUG && console.log(`%c[ניקוי ב-fullCleanup] observers: ${bin.observers.length}, timers: ${bin.timers.size}`, 'color:#FF9800');
    bin.observers.forEach(o => o.disconnect());
    bin.observers.length = 0;
    for (const id of bin.timers) { clearInterval(id); clearTimeout(id); } // Clear both types
    bin.timers.clear();

    // ניקוי מאזינים דינמיים מהמפה - גרסה משופרת וקצרה יותר
    for (const [element, controllers] of listenerControllers) {
      controllers.forEach(c => !c.signal.aborted && c.abort());
    }

    // ניקוי המפה בפעולה אחת במקום מחיקה תוך כדי איטרציה
    listenerControllers.clear();

    // Dispose of settings submenus if present
    if (window.disposeButtonsDisplaySubmenu) {
      window.disposeButtonsDisplaySubmenu(undefined, true);
    } else {
      const submenu = document.querySelector('.buttons-display-submenu');
      if (submenu) {
        if (submenu.observer) {
          submenu.observer.disconnect();
          delete submenu.observer;
        }
        submenu.remove();
      }
    }

    if (window.disposeChordsModeSubmenu) {
      window.disposeChordsModeSubmenu(undefined, true);
      window.resetChordsModeSubmenu?.();
    } else {
      const submenu = document.querySelector('.chords-mode-submenu');
      if (submenu) {
        if (submenu.observer) {
          submenu.observer.disconnect();
          delete submenu.observer;
        }
        submenu.remove();
      }
    }

    // 🔥 MEMORY FIX: Dispose sizes submenu to prevent Detached DOM nodes
    if (window.disposeSizesSubmenu) {
      window.disposeSizesSubmenu(undefined, true);
    } else {
      const submenu = document.querySelector('.sizes-submenu');
      if (submenu) {
        if (submenu.observer) {
          submenu.observer.disconnect();
          delete submenu.observer;
        }
        // Cleanup AbortControllers if present
        if (submenu.abortController) {
          submenu.abortController.abort();
          delete submenu.abortController;
        }
        if (submenu.controlElement?.abortController) {
          submenu.controlElement.abortController.abort();
          delete submenu.controlElement.abortController;
        }
        submenu.remove();
      }
    }

    // ניקוי תפריטים משניים עם data-attribute
    document.querySelectorAll('[data-yc-menu]').forEach(menu => {
      if (menu.observer) {
        menu.observer.disconnect();
        delete menu.observer;
      }

      // ניקוי הרשומה במפה בדיוק לפני מחיקת האלמנט
      if (window.YC_MENUS && menu.dataset.ycMenu) {
        delete window.YC_MENUS[menu.dataset.ycMenu];
      }
      menu.remove();
    });

    // ניקוי תפריטים "יתומים" - רק אלה שמחוץ לנגן
    document.querySelectorAll('[class*="-menu"].yc, [class*="-submenu"].yc').forEach(menu => {
      if (!menu.closest('#movie_player')) {
        if (menu.observer) {
          menu.observer.disconnect();
          delete menu.observer;
        }
        menu.remove();
      }
    });

    // ריקון מערך המשקיפים של הכתוביות
    if (window.subtitleObservers) {
      window.subtitleObservers.length = 0;
    }

    document.querySelectorAll('#yc-chords-container,' +
      '.yc-error-overlay, .yc-debug-overlay')
      .forEach(el => el.remove());
    window.lastErrorOverlay = null;
    window.lastDebugOverlay = null;

    window.chordRenderer?.clearCache?.();
    // Worker management removed - using direct import() now
    resetYcSessionPrewarmRuntime('fullCleanup-dynamic-cache-clear');
    window.dynamicLoader?.clearCache?.();
    window.databaseManager?.disposeAllDatabases?.();

    // 🔥 MEMORY FIX: ניקוי נוסף של Lyrics & Chords ב-fullCleanup
    if (typeof window.cleanupLyricsChordsPanel === 'function') {
      try {
        window.cleanupLyricsChordsPanel();
        DEBUG && console.log('[🔥 MEMORY FIX] Additional Lyrics & Chords cleanup in fullCleanup');
      } catch (error) {
        console.warn('[🔥 MEMORY FIX] Error in additional Lyrics & Chords cleanup:', error);
      }
    }

    // Clear chord texts cache
    if (window.chordTextsCache) {
      window.chordTextsCache = {};
      DEBUG && console.log('[fullCleanup] Cleared chord texts cache');
    }

    // איפוס כל המשתנים של תפריט ההגדרות
    window.resetSettingsMenu?.();

    // uiCtl.abort(); // Only abort uiCtl if the entire extension is shutting down, not on video navigation.
    // uiCtl = new AbortController();

    console.log('[YouChords] fullCleanup - complete');
  }

  /*───────────────────────────────────────────────────────────────────────────┐
  │ 5.4 🔥 MEMORY FIX: Navigation Memory Cleanup                              │
  └───────────────────────────────────────────────────────────────────────────*/
  function navigationMemoryCleanup() {
    DEBUG && console.log('%c[🔥 MEMORY FIX] Navigation cleanup started', 'color:#FF5722; font-weight:bold');

    // 🔥 1. נקה את chordRenderer cache בכל מעבר סרטון
    if (window.chordRenderer?.clearCache) {
      window.chordRenderer.clearCache();
      DEBUG && console.log('[🔥 MEMORY FIX] Cleared chordRenderer cache');
    }

    // 🔥 1.5. נקה את YouTube captions cache
    if (window.youtubeSubtitles?.clearCaptionsCache) {
      window.youtubeSubtitles.clearCaptionsCache();
      DEBUG && console.log('[🔥 MEMORY FIX] Cleared YouTube captions cache');
    }

    // 🔥 2. עצור intervals כפולים
    if (window.periodicCleanupId) {
      clearInterval(window.periodicCleanupId);
      bin.timers.delete(window.periodicCleanupId);
      window.periodicCleanupId = null;
      DEBUG && console.log('[🔥 MEMORY FIX] Cleared periodic cleanup interval');
    }

    // 🔥 3. נקה AbortControllers ישנים
    if (overlayCtlChords && !overlayCtlChords.signal.aborted) {
      overlayCtlChords.abort();
      DEBUG && console.log('[🔥 MEMORY FIX] Aborted overlayCtlChords');
    }
    if (overlayCtlSubs && !overlayCtlSubs.signal.aborted) {
      overlayCtlSubs.abort();
      DEBUG && console.log('[🔥 MEMORY FIX] Aborted overlayCtlSubs');
    }

    // 🔥 4. נקה event listeners שנשארו "תלויים"
    const orphanedElements = document.querySelectorAll('[data-bound="1"]');
    orphanedElements.forEach(el => {
      if (el._lastHandler) {
        el.removeEventListener('click', el._lastHandler, true);
        delete el.dataset.bound;
        delete el._lastHandler;
      }
    });
    if (orphanedElements.length > 0) {
      DEBUG && console.log(`[🔥 MEMORY FIX] Cleaned ${orphanedElements.length} orphaned event listeners`);
    }

    // 🔥 5. ניקוי ספציפי לפאנל Lyrics & Chords
    if (typeof window.cleanupLyricsChordsPanel === 'function') {
      try {
        window.cleanupLyricsChordsPanel();
        DEBUG && console.log('[🔥 MEMORY FIX] Cleaned up Lyrics & Chords panel in navigation');
      } catch (error) {
        console.warn('[🔥 MEMORY FIX] Error cleaning Lyrics & Chords panel in navigation:', error);
      }
    }

    // 🔥 6. כפה garbage collection אם זמין
    if (window.gc && typeof window.gc === 'function') {
      try {
        window.gc();
        DEBUG && console.log('[🔥 MEMORY FIX] Forced garbage collection');
      } catch (e) {
        // Ignore errors - gc might not be available
      }
    }

    DEBUG && console.log('%c[🔥 MEMORY FIX] Navigation cleanup completed', 'color:#4CAF50; font-weight:bold');
  }

  /*───────────────────────────────────────────────────────────────────────────┐
  │ 5.5 onVideoEnded – ניקוי משאבים בסיום סרטון (בלי ניווט)                  │
  └───────────────────────────────────────────────────────────────────────────*/
  function onVideoEnded() {
    // מגן מפני קריאות כפולות אם האירוע מופעל בטעות יותר מפעם אחת
    if (!chordsActive && !subsActive) {
      DEBUG && console.log('[onVideoEnded] No active features, skipping cleanup.');
      return;
    }

    console.log('%c[YouChords] Video ended. Performing partial cleanup.', 'background:#f39c12; color:white; padding:2px 5px; border-radius:3px;');

    // 1. כיבוי וניקוי מודול האקורדים
    if (chordsActive) {
      overlayCtlChords?.abort();
      overlayCtlChords = null;
      window.chordsDisplay?.partialCleanup?.();
      stopChordLoops(); // עוצר את monitorLoop
      chordsActive = false;
      window.chordsActive = false;
      clearChordBtn('onVideoEnded');
    }

    // 2. כיבוי וניקוי מודול הכתוביות
    if (subsActive) {
      if (window.cleanupSubtitles) {
        window.cleanupSubtitles();
      }
      partialCleanupSubs(); // מנקה controllers וטיימרים מקומיים
      // 🔥 MEMORY FIX: ניקוי פאנל Lyrics & Chords בסיום סרטון
      if (window.cleanupLyricsChordsPanel) {
        try {
          window.cleanupLyricsChordsPanel();
          DEBUG && console.log('[🔥 MEMORY FIX] Cleaned up Lyrics & Chords panel on video end');
        } catch (error) {
          console.warn('[🔥 MEMORY FIX] Error cleaning Lyrics & Chords panel on video end:', error);
        }
      }
      subsActive = false;
    }

    // 3. ניתוק כל ה-Observers שעדיין פעילים (חשוב!)
    // זה ינתק ResizeObserver, MutationObserver, IntersectionObserver וכו'
    bin.observers.forEach(o => o.disconnect());
    bin.observers.length = 0;
    DEBUG && console.log('[onVideoEnded] Disconnected all active observers.');

    // 4. הפעלת ניקוי זיכרון אגרסיבי יותר של הרנדרר (אופציונלי אבל מומלץ)
    window.chordRenderer?.clearCache?.();
  }

  // פונקציית עזר לחיבור המאזין לאירוע ended
  function attachEndedListener() {
    const videoElement = document.querySelector('video');
    if (videoElement) {
      // 'videoCtl' הוא ה-AbortController הראשי של הסרטון.
      // המאזין יוסר אוטומטית כשתקרא ל-fullCleanup.
      addL(videoElement, 'ended', onVideoEnded, { once: true }, 'video');
      DEBUG && console.log('[YouChords] "ended" event listener attached to video element.');
    }
  }

  /*───────────────────────────────────────────────────────────────────────────┐
  │ 6. injectButtons – שמירת הכפתורים המקוריים                               │
  └───────────────────────────────────────────────────────────────────────────*/
  // Helper function to insert buttons in the correct order
  const YC_BUTTON_ORDER_BY_ID = {
    tuner: 2,
    chordExplorer: 3,
    lyricsChords: 5,
    chords: 10,
    audioVocals: 11,
    audioMusic: 12,
    audioInstruments: 13,
    subtitle: 20,
    customSubtitle: 22,
    subflow: 25,
    settings: 30
  };

  function getYcButtonOrder(id) {
    const buttonOrder = window.BUTTON_ORDER || {};
    const orderFromSettings = {
      settings: buttonOrder.settingsButton,
      subflow: buttonOrder.subflowButton,
      customSubtitle: buttonOrder.customSubtitleButton,
      subtitle: buttonOrder.subtitleButton,
      chords: buttonOrder.chordsButton,
      lyricsChords: buttonOrder.lyricsAndChordsButton,
      audioVocals: buttonOrder.audioVocalsButton,
      audioMusic: buttonOrder.audioMusicButton,
      audioInstruments: buttonOrder.audioInstrumentsButton,
      chordExplorer: buttonOrder.chordExplorerButton,
      tuner: buttonOrder.tunerButton
    };
    const value = Number(orderFromSettings[id] ?? YC_BUTTON_ORDER_BY_ID[id]);
    return Number.isFinite(value) ? value : null;
  }

  const YC_TOOLBAR_CLUSTER_CLASS = 'yc-toolbar-cluster';

  function isYcButtonContainerElement(child) {
    if (!child?.classList?.contains('custom-button-container')) return false;
    const id = child.getAttribute('data-btn');
    if (getYcButtonOrder(id) !== null) return true;
    return Boolean(child.querySelector?.([
      '.ytp-chords-button',
      '.ytp-subtitle-button',
      '.ytp-custom-subtitle-button',
      '.ytp-subflow-button',
      '.settings-button',
      '.ytp-lyrics-chords-button',
      '.ytp-chord-explorer-button',
      '.ytp-tuner-button'
    ].join(',')));
  }

  function ensureYcToolbarCluster(controls = $('.ytp-right-controls')) {
    if (!controls) return null;

    let cluster = Array.from(controls.children).find(child =>
      child?.classList?.contains(YC_TOOLBAR_CLUSTER_CLASS)
    );

    if (!cluster) {
      cluster = document.createElement('span');
      cluster.className = YC_TOOLBAR_CLUSTER_CLASS;
      cluster.setAttribute('aria-label', 'YouChords controls');

      const firstNonYcChild = Array.from(controls.children).find(child =>
        !isYcButtonContainerElement(child) &&
        !child?.classList?.contains(YC_TOOLBAR_CLUSTER_CLASS)
      );

      if (firstNonYcChild) {
        controls.insertBefore(cluster, firstNonYcChild);
      } else {
        controls.appendChild(cluster);
      }
    }

    cluster.setAttribute('data-yc-owned', 'true');
    cluster.setAttribute('dir', 'ltr');

    Array.from(controls.children).forEach(child => {
      if (
        child !== cluster &&
        isYcButtonContainerElement(child)
      ) {
        cluster.appendChild(child);
      }
    });

    return cluster;
  }

  function normalizeYouChordsButtonOrder(controls = $('.ytp-right-controls')) {
    if (!controls) return;
    const cluster = ensureYcToolbarCluster(controls);
    if (!cluster) return;

    const knownContainers = Array.from(cluster.children).filter(child => {
      if (!isYcButtonContainerElement(child)) return false;
      const id = child.getAttribute('data-btn');
      child.setAttribute('data-yc-owned', 'true');
      child.setAttribute('dir', 'ltr');
      child.querySelector('button')?.setAttribute('data-yc-owned', 'true');
      child.querySelector('button')?.setAttribute('dir', 'ltr');
      return getYcButtonOrder(id) !== null;
    });

    if (knownContainers.length < 2) return;

    const orderedContainers = knownContainers.slice().sort((a, b) => {
      const orderA = getYcButtonOrder(a.getAttribute('data-btn'));
      const orderB = getYcButtonOrder(b.getAttribute('data-btn'));
      return orderA - orderB;
    });

    for (const container of orderedContainers) {
      cluster.appendChild(container);
    }
  }

  window.normalizeYouChordsButtonOrder = normalizeYouChordsButtonOrder;

  function isYcButtonContainerMountedInControls(container, controls) {
    return Boolean(container && controls && controls.contains(container));
  }

  function insertButtonInOrder(controls, id, container) {
    const cluster = ensureYcToolbarCluster(controls);
    if (!cluster) return;

    const buttonOrder = window.BUTTON_ORDER || {
      settingsButton: 30,
      subflowButton: 25,
      customSubtitleButton: 22,
      subtitleButton: 20,
      chordsButton: 10,
      audioVocalsButton: 11,
      audioMusicButton: 12,
      audioInstrumentsButton: 13,
      lyricsAndChordsButton: 5,
      chordExplorerButton: 3,
      tunerButton: 2
    };

    // Use the BUTTON_CONFIG from buttonsDisplay.js when loaded, with a local fallback
    const BUTTON_CONFIG = {
      chords: { class: '.ytp-chords-button', order: buttonOrder.chordsButton },
      audioVocals: { class: '.ytp-vocal-button', order: buttonOrder.audioVocalsButton || 11 },
      audioMusic: { class: '.ytp-music-button', order: buttonOrder.audioMusicButton || 12 },
      audioInstruments: { class: '.ytp-instruments-button', order: buttonOrder.audioInstrumentsButton || 13 },
      subtitle: { class: '.ytp-subtitle-button', order: buttonOrder.subtitleButton },
      customSubtitle: { class: '.ytp-custom-subtitle-button', order: buttonOrder.customSubtitleButton },
      subflow: { class: '.ytp-subflow-button', order: buttonOrder.subflowButton },
      settings: { class: '.settings-button', order: buttonOrder.settingsButton },
      lyricsChords: { class: '.ytp-lyrics-chords-button', order: buttonOrder.lyricsAndChordsButton || 4 },
      chordExplorer: { class: '.ytp-chord-explorer-button', order: buttonOrder.chordExplorerButton || 3 },
      tuner: { class: '.ytp-tuner-button', order: buttonOrder.tunerButton || 2 }
    };

    const order = BUTTON_CONFIG[id]?.order || 0;

    const localFindInsertionPoint = (controlsEl, newButtonOrder) => {
      const buttons = Array.from(controlsEl.children);
      for (const existingContainer of buttons) {
        if (!existingContainer.classList.contains('custom-button-container')) continue;
        for (const config of Object.values(BUTTON_CONFIG)) {
          if (existingContainer.querySelector(config.class) && config.order > newButtonOrder) {
            return existingContainer;
          }
        }
      }

      return buttons.find(child => !child.classList.contains('custom-button-container')) || null;
    };

    const ref = localFindInsertionPoint(cluster, order);

    if (ref) {
      cluster.insertBefore(container, ref);
    } else {
      cluster.appendChild(container);
    }
    normalizeYouChordsButtonOrder(controls);
  }

  const YC_BUTTON_TOOLTIPS = {
    tuner: 'Guitar Tuner',
    chordExplorer: 'Chord Explorer',
    lyricsChords: 'Subtitles & Chords',
    chords: 'Chords',
    subtitle: 'Subtitles',
    customSubtitle: 'Translated Subtitles',
    subflow: 'Subtitle Workflow',
    audioVocals: 'Only Vocals',
    audioMusic: 'Only Music',
    audioInstruments: 'Choose Instruments',
    settings: 'Settings'
  };

  function applyYcButtonTooltip(id, container, button) {
    if (!container || !button) return;
    const label = YC_BUTTON_TOOLTIPS[id] || button.getAttribute('aria-label') || button.title;
    if (!label) return;

    container.setAttribute('data-yc-tooltip', label);
    button.setAttribute('aria-label', label);
    button.removeAttribute('title');
  }
  window.applyYcButtonTooltip = applyYcButtonTooltip;

  // 🔧 FIX: מניעת קריאות מקבילות ל-injectButtons
  let injectButtonsRunning = false;

  function injectButtons() {
    // מניעת race condition - אם כבר רץ, לא מתחילים שוב
    if (injectButtonsRunning) {
      DEBUG && console.log('[content.js] injectButtons already running, skipping');
      return;
    }
    injectButtonsRunning = true;

    try {
      const controls = $('.ytp-right-controls');
      if (!controls) {
        DEBUG && console.warn("[content.js] ytp-right-controls not found for button injection.");
        return;
      }

      const mount = (id, factory, handler) => {
        if (typeof factory !== 'function') {
          DEBUG && console.error(`[content.js] Factory for button ${id} is not a function.`);
          return;
        }
        const cluster = ensureYcToolbarCluster(controls);
        if (!cluster) return;

        let btnContainer = cluster.querySelector(`[data-btn="${id}"]`);
        const legacyContainer = controls.querySelector(`:scope > [data-btn="${id}"]`);
        if (!btnContainer && legacyContainer?.classList?.contains('custom-button-container')) {
          cluster.appendChild(legacyContainer);
          btnContainer = legacyContainer;
        }
        let actualButton;

        // 🔧 FIX: בדיקה אם יש כפתור זמני שצריך לשדרג
        // אם הקונטיינר קיים, בודקים אם הכפתור בתוכו הוא זמני
        // ואם הפונקציה הנוכחית היא כבר האמיתית (לא זמנית)
        if (btnContainer) {
          const existingButton = btnContainer.querySelector('button');
          const isTemporaryButton = existingButton?.getAttribute('data-temporary') === 'true';
          const isRealFactoryAvailable = !factory.isTemporaryFunction;

          if (isTemporaryButton && isRealFactoryAvailable) {
            // יש כפתור זמני והפונקציה האמיתית זמינה - נותנים ל-factory לשדרג אותו
            DEBUG && console.log(`[content.js] Upgrading temporary button for ${id} with real button`);

            // קוראים ל-factory - היא תמצא את הכפתור הקיים ותשדרג אותו
            const updatedContainer = factory();

            // אם factory החזירה אלמנט שונה, מחליפים
            if (updatedContainer && updatedContainer !== btnContainer) {
              btnContainer.replaceWith(updatedContainer);
              btnContainer = updatedContainer;
              btnContainer.setAttribute('data-btn', id);
            }

            actualButton = btnContainer.querySelector('button');
          } else {
            // כפתור קיים ולא זמני - פשוט משתמשים בו
            actualButton = existingButton;
          }
        }

        if (!btnContainer) {
          // 🔧 FIX: בדיקה כפולה למניעת race condition
          // בודקים שוב אחרי יצירת הכפתור שאין כבר כפתור קיים
          const existingContainer =
            cluster.querySelector(`[data-btn="${id}"]`) ||
            controls.querySelector(`:scope > [data-btn="${id}"]`);
          if (existingContainer) {
            DEBUG && console.log(`[content.js] Button ${id} already exists (race condition prevented)`);
            btnContainer = existingContainer;
            if (btnContainer.parentElement !== cluster) {
              cluster.appendChild(btnContainer);
            }
            actualButton = btnContainer.querySelector('button');
          } else {
            btnContainer = factory();
            if (!btnContainer || typeof btnContainer.setAttribute !== 'function') {
              DEBUG && console.error(`[content.js] Factory for button ${id} did not return a valid element.`);
              return;
            }
            btnContainer.setAttribute('data-btn', id);

            // 🔧 FIX: בדיקה אחרונה לפני הוספה - למניעת race condition
            const lastCheck =
              cluster.querySelector(`[data-btn="${id}"]`) ||
              controls.querySelector(`:scope > [data-btn="${id}"]`);
            if (lastCheck) {
              DEBUG && console.log(`[content.js] Button ${id} appeared during creation (race condition) - using existing`);
              btnContainer = lastCheck;
              if (btnContainer.parentElement !== cluster) {
                cluster.appendChild(btnContainer);
              }
              actualButton = btnContainer.querySelector('button');
            } else {
              // Use the shared insertion logic instead of prepend
              insertButtonInOrder(controls, id, btnContainer);
              actualButton = btnContainer.querySelector('button');
            }
          }
        }

        if (!actualButton) {
          DEBUG && console.error(`[content.js] Could not find actual button element for ${id}.`);
          return;
        }

        btnContainer.setAttribute('dir', 'ltr');
        btnContainer.setAttribute('data-yc-owned', 'true');
        actualButton.setAttribute('dir', 'ltr');
        actualButton.setAttribute('data-yc-owned', 'true');
        applyYcButtonTooltip(id, btnContainer, actualButton);

        // --- MODIFIED: Enhanced sync between button state and global variables ---
        if (id === 'chords') {
          // סנכרון מושלם בין מצב הכפתור למשתנים הגלובליים
          const currentlyHasClass = actualButton.classList.contains('chords-active');
          if (chordsActive && !currentlyHasClass) {
            actualButton.classList.add('chords-active');
            if (DEBUG) console.log('[injectButtons] Added chords-active class to sync with chordsActive=true');
          } else if (!chordsActive && currentlyHasClass) {
            actualButton.classList.remove('chords-active');
            if (DEBUG) console.log('[injectButtons] Removed chords-active class to sync with chordsActive=false');
          }
          actualButton.disabled = false;
        } else if (id === 'subtitle') {
          // סנכרון לכפתור כתוביות
          if (subsActive && window.subtitleState?.displaySource !== 'custom') {
            actualButton.classList.add('subtitle-button-active');
          } else {
            actualButton.classList.remove('subtitle-button-active');
          }
          actualButton.disabled = false;
        } else if (id === 'customSubtitle') {
          actualButton.classList.toggle(
            'custom-subtitle-button-active',
            subsActive && window.subtitleState?.displaySource === 'custom'
          );
          actualButton.disabled = false;
        }
        // --- END MODIFIED ---

        /* -----------------------------------------------------------------
           תמיד מחברים את ה-handler שהועבר (גם לכפתור האקורדים).
           זה מחזיר את ‎toggleChords‎ להיות נקודת הכניסה הראשית,
           וכך --loadGroup('carousel')-- ייטען לפני הקריאה ל-activate.
        ----------------------------------------------------------------- */

        // תיקון: ניקוי מאזינים ישנים והחלפה במאזין חדש
        if (actualButton.dataset.bound) {
          // הסרת המאזין הישן למניעת דליפת זיכרון
          actualButton.removeEventListener('click', actualButton._lastHandler, true);
          delete actualButton.dataset.bound;
        }

        const featureUseSource = getYcFeatureUseSourceFromButtonId(id);
        const trackedHandler = event => {
          if (featureUseSource) {
            const adBlockReason = blockYouTubeAdIfNeeded(`${featureUseSource}-button`);
            if (adBlockReason) {
              event?.preventDefault?.();
              event?.stopPropagation?.();
              event?.stopImmediatePropagation?.();
              return false;
            }
            ycFeatureUseCaptureLastEvent = {
              action: 'button-mount-click',
              at: new Date().toISOString(),
              type: event?.type || 'click',
              source: featureUseSource,
              buttonKey: id,
              targetTag: event?.target?.tagName || '',
              targetClass: String(event?.target?.className || '').slice(0, 160)
            };
            markYouChordsFeatureUse(featureUseSource);
          }
          return handler(event);
        };
        const clickHandler = featureUseSource ? trackedHandler : handler;

        addLWithCleanup(actualButton, 'click', clickHandler, { capture: true }, 'ui');
        actualButton.dataset.bound = '1';
        actualButton._lastHandler = clickHandler; // שמירת המאזין לניקוי עתידי
      };

      const prefs = window.buttonsEnabled || {};

      // 🔧 FIX: יצירת כפתורים לפי סדר ה-order (מהנמוך לגבוה)
      // זה מבטיח שכל כפתור שנוצר יכול למצוא את הכפתורים שכבר נוצרו לפניו
      // Order: tuner(2) -> chordExplorer(3) -> lyricsChords(5) -> chords(10) -> subtitle(20) -> settings(30)
      // 🔧 FIX: יוצרים מהגבוה לנמוך כדי שכפתורים עם order נמוך ימצאו את הגבוהים כנקודת הכנסה

      // 🔍 Chord Explorer button (order: 3) - נוצר קודם כדי ש-Tuner ימצא אותו
      if (prefs.chordExplorer !== false && window.createChordExplorerButton) {
        mount('chordExplorer', window.createChordExplorerButton, () => { });
      }
      // 🎸 Tuner button (order: 2) - נוצר אחרי Chord Explorer כדי להיכנס לפניו
      if (prefs.tuner !== false && window.createTunerButton) {
        mount('tuner', window.createTunerButton, () => { });
      }
      // 🎵 Lyrics & Chords button (order: 5)
      if (prefs.lyricsChords !== false && window.createLyricsAndChordsButton) {
        mount('lyricsChords', window.createLyricsAndChordsButton, () => { }); // Handler ריק - הלוגיקה בתוך הכפתור
      }
      // 🎸 Chords button (order: 10)
      if (prefs.chords !== false && window.createChordsButton) {
        mount('chords', window.createChordsButton, toggleChords);
      }
      // 🎤🎵 Audio separation buttons (orders: 11-13)
      if (window.createAudioVocalsButton) {
        mount('audioVocals', window.createAudioVocalsButton, () => window.ycAudioSeparation?.toggleMode?.('vocals'));
      }
      if (window.createAudioMusicButton) {
        mount('audioMusic', window.createAudioMusicButton, () => window.ycAudioSeparation?.toggleMode?.('music'));
      }
      if (window.createAudioInstrumentsButton) {
        mount('audioInstruments', window.createAudioInstrumentsButton, () => window.ycAudioSeparation?.toggleInstrumentMenu?.());
      }
      // 📝 Subtitle button (order: 20)
      if (prefs.subtitle !== false && window.createSubtitleButton) {
        const subtitleHandler = window.createSubtitleButton.isTemporaryFunction ? () => { } : toggleSubs;
        mount('subtitle', window.createSubtitleButton, subtitleHandler);
      }
      // Translated SRT subtitles (order: 22)
      if (prefs.customSubtitle !== false && window.createCustomSubtitleButton) {
        mount('customSubtitle', window.createCustomSubtitleButton, () => { });
      }
      // Subtitle import/export and local Subflow preparation (order: 25)
      if (window.createSubflowButton) {
        mount('subflow', window.createSubflowButton, () => { });
      }
      // ⚙️ Settings button (order: 30)
      if (window.createSettingsButton) {
        mount('settings', window.createSettingsButton, () => { /* Settings logic */ });
      }
      normalizeYouChordsButtonOrder(controls);
      scheduleButtonsFirstRunTour();
    } finally {
      // 🔧 FIX: שחרור ה-lock בסיום
      injectButtonsRunning = false;
    }
  }

  window.injectButtons = injectButtons;

  function isButtonMissing() {
    const prefs = window.buttonsEnabled || {};
    if (prefs.chords !== false && !document.querySelector('[data-btn="chords"] .ytp-chords-button')) {
      return true;
    }
    if (window.createAudioVocalsButton && !document.querySelector('[data-btn="audioVocals"] .ytp-vocal-button')) {
      return true;
    }
    if (window.createAudioMusicButton && !document.querySelector('[data-btn="audioMusic"] .ytp-music-button')) {
      return true;
    }
    if (window.createAudioInstrumentsButton && !document.querySelector('[data-btn="audioInstruments"] .ytp-instruments-button')) {
      return true;
    }
    if (prefs.subtitle !== false && !document.querySelector('[data-btn="subtitle"] .ytp-subtitle-button')) {
      return true;
    }
    if (prefs.customSubtitle !== false && !document.querySelector('[data-btn="customSubtitle"] .ytp-custom-subtitle-button')) {
      return true;
    }
    if (!document.querySelector('[data-btn="subflow"] .ytp-subflow-button')) {
      return true;
    }
    if (prefs.lyricsChords !== false && !document.querySelector('[data-btn="lyricsChords"] .ytp-lyrics-chords-button')) {
      return true;
    }
    if (prefs.tuner !== false && !document.querySelector('[data-btn="tuner"]')) {
      return true;
    }
    if (prefs.chordExplorer !== false && !document.querySelector('[data-btn="chordExplorer"]')) {
      return true;
    }
    if (!document.querySelector('[data-btn="settings"] .settings-button')) {
      return true;
    }
    return false;
  }

  let buttonCheckTimer = null;
  let buttonCheckActive = false; // דגל למניעת כפילויות
  const YC_PLAYER_READY_MAX_WAIT_MS = 2000;

  function waitForPlayerReadyBeforeButtonInjection(maxWaitMs = YC_PLAYER_READY_MAX_WAIT_MS) {
    return new Promise(resolve => {
      let settled = false;
      let observer = null;
      const videoEvents = ['playing', 'canplay', 'loadeddata', 'loadedmetadata'];
      let video = document.querySelector('video.html5-main-video') || document.querySelector('video');

      const cleanup = () => {
        if (observer) {
          observer.disconnect();
          const index = bin.observers.indexOf(observer);
          if (index !== -1) bin.observers.splice(index, 1);
          observer = null;
        }
        if (video) {
          videoEvents.forEach(eventName => video.removeEventListener(eventName, finish));
        }
      };

      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        clearTimeout(timeoutId);
        bin.timers.delete(timeoutId);
        resolve();
      };

      const isVideoReady = candidate => {
        if (!candidate) return false;
        return candidate.readyState >= 2 || (!candidate.paused && !candidate.ended);
      };

      const attachToVideo = candidate => {
        if (!candidate || candidate === video) return;
        if (video) {
          videoEvents.forEach(eventName => video.removeEventListener(eventName, finish));
        }
        video = candidate;
        if (isVideoReady(video)) {
          finish();
          return;
        }
        videoEvents.forEach(eventName => video.addEventListener(eventName, finish, { once: true, passive: true }));
      };

      const timeoutId = setTimeout(finish, maxWaitMs);
      bin.timers.add(timeoutId);

      if (isVideoReady(video)) {
        finish();
        return;
      }

      if (video) {
        videoEvents.forEach(eventName => video.addEventListener(eventName, finish, { once: true, passive: true }));
      }

      observer = new MutationObserver(() => {
        const nextVideo = document.querySelector('video.html5-main-video') || document.querySelector('video');
        attachToVideo(nextVideo);
      });
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
      bin.observers.push(observer);
    });
  }

  function startButtonCheck() {
    // מניעת הפעלה כפולה
    if (buttonCheckActive || buttonCheckTimer) return;

    buttonCheckActive = true;
    const checkInterval = 3000;

    const scheduleNextButtonCheck = () => {
      const timeoutId = setTimeout(() => {
        // Prevent timer ID accumulation in long sessions.
        bin.timers.delete(timeoutId);
        if (buttonCheckTimer === timeoutId) {
          buttonCheckTimer = null;
        }
        checkButtonsExist();
      }, checkInterval);
      buttonCheckTimer = timeoutId;
      bin.timers.add(timeoutId);
    };

    function checkButtonsExist() {
      // בדיקה אם עדיין צריך לרוץ
      if (!buttonCheckActive || window.extensionDisabled) {
        stopButtonCheck();
        return;
      }

      if (DEBUG) console.log('[YouChords] Performing light button check');

      // בדיקה אם חסרים כפתורים ויש controls
      if (isButtonMissing() && $('.ytp-right-controls')) {
        DEBUG && console.log('[YouChords] Button missing, re-injecting');
        injectButtons();
      }

      // המשך רק אם יש player
      if ($('.html5-video-player') && buttonCheckActive) {
        scheduleNextButtonCheck();
      } else {
        stopButtonCheck();
      }
    }

    // התחלה ראשונית
    scheduleNextButtonCheck();
  }

  function stopButtonCheck() {
    buttonCheckActive = false;
    if (buttonCheckTimer) {
      clearTimeout(buttonCheckTimer);
      bin.timers.delete(buttonCheckTimer);
      buttonCheckTimer = null;
    }
    if (DEBUG) console.log('[YouChords] Button check stopped');
  }

  async function waitAndInjectButtons() {
    const injectionNavigationToken = getNavigationToken();

    // בדיקה אם התוסף מושבת - אם כן, לא מזריקים כפתורים
    if (window.extensionDisabled) {
      DEBUG && console.log('[content.js] Extension is disabled, not injecting buttons');
      return;
    }

    // קריאת מצב הכפתורים מה-storage לפני הזרקה
    await new Promise(resolve => {
      chrome.storage.sync.get(['button_chords_enabled', 'button_subtitle_enabled', 'button_customSubtitle_enabled', 'button_lyricsChords_enabled', 'button_tuner_enabled', 'button_chordExplorer_enabled'], (res) => {
        window.buttonsEnabled = {
          chords: res.button_chords_enabled !== false,
          subtitle: res.button_subtitle_enabled !== false,
          customSubtitle: res.button_customSubtitle_enabled !== false,
          lyricsChords: res.button_lyricsChords_enabled !== false,
          tuner: res.button_tuner_enabled !== false,
          chordExplorer: res.button_chordExplorer_enabled !== false
        };
        resolve();
      });
    });

    await waitForPlayerReadyBeforeButtonInjection();
    if (!isNavigationTokenCurrent(injectionNavigationToken) || window.extensionDisabled) {
      DEBUG && console.log('[content.js] Skipping stale button injection after player-ready wait');
      return;
    }

    // Load the local AI audio controls before mounting the main YouTube buttons.
    // The separation model itself stays in Docker and is started only on demand.
    try {
      await window.dynamicLoader?.loadGroup?.('audioSeparation');
    } catch (error) {
      console.error('[AudioSeparation] Failed to load audio controls:', error);
    }

    // יצירת כפתורים זמניים עם lazy loading - לפני טעינת הכפתורים האמיתיים!
    // זה מבטיח שהכפתור הזמני תמיד יהיה ראשון (חוסך זיכרון)

    // 🎸 Chords - כפתור זמני
    if (!window.createChordsButton) {
      window.createChordsButton = function () {
        console.log('[Chords] יצירת כפתור זמני עם lazy loading');

        const container = document.createElement('div');
        container.className = 'custom-button-container';

        const button = document.createElement('button');
        button.className = 'ytp-button ytp-chords-button';
        button.title = 'Chords';
        button.setAttribute('data-temporary', 'true');

        // SVG זהה לאמיתי - גיטרה (בלי fill="#fff" כדי שה-CSS יוכל לשלוט בצבע)
        button.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <use class="ytp-svg-shadow"/>
          <g class="ytp-svg-fill">
            <path d="M8 2v20l4 1.5 4-1.5V2l-4-1-4 1zm1 1.5l3-.75 3 .75v17l-3 1-3-1v-17z"/>
            <rect x="9" y="6" width="6" height="1" rx="0.3"/>
            <rect x="9" y="10" width="6" height="1" rx="0.3"/>
            <rect x="9" y="14" width="6" height="1" rx="0.3"/>
            <rect x="9" y="18" width="6" height="1" rx="0.3"/>
            <circle cx="5" cy="5" r="1.5"/>
            <circle cx="5" cy="9" r="1.5"/>
            <circle cx="5" cy="13" r="1.5"/>
            <circle cx="19" cy="5" r="1.5"/>
            <circle cx="19" cy="9" r="1.5"/>
            <circle cx="19" cy="13" r="1.5"/>
            <rect x="6" y="4.5" width="3" height="1"/>
            <rect x="6" y="8.5" width="3" height="1"/>
            <rect x="6" y="12.5" width="3" height="1"/>
            <rect x="15" y="4.5" width="3" height="1"/>
            <rect x="15" y="8.5" width="3" height="1"/>
            <rect x="15" y="12.5" width="3" height="1"/>
          </g>
        </svg>`;

        container.appendChild(button);
        return container;
      };

      // סימון שזו פונקציה זמנית
      window.createChordsButton.isTemporaryFunction = true;
    }

    // 📝 Subtitles - כפתור זמני, הקוד המלא נטען רק בלחיצה
    if (!window.createSubtitleButton) {
      window.createSubtitleButton = function () {
        console.log('[SubtitleButton] Creating temporary lazy button');

        const container = document.createElement('div');
        container.className = 'custom-button-container';

        const button = document.createElement('button');
        button.className = 'ytp-button ytp-subtitle-button';
        button.title = 'Toggle Subtitles';
        button.setAttribute('data-temporary', 'true');

        button.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <use class="ytp-svg-shadow"/>
          <circle class="ytp-svg-stroke" cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="1.5"/>
          <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-size="7" font-weight="bold" fill="#fff" class="ytp-svg-fill">CC</text>
        </svg>`;

        button.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (button.dataset.loading === 'true') return;

          if (blockClearYouTubeLiveVideoIfNeeded('subtitles-temp-button')) {
            button.classList.remove('subtitle-button-active');
            button.style.opacity = '';
            return;
          }

          button.dataset.loading = 'true';
          button.classList.add('subtitle-button-active');
          button.style.opacity = '0.65';
          const stopLoadingSpinner = startYcButtonLoadingSpinner(button, 'subtitle');

          try {
            console.log('[SubtitleButton] Loading full subtitle button on demand...');
            await window.dynamicLoader?.loadGroup?.('subtitles');

            if (typeof window.createSubtitleButton !== 'function' || window.createSubtitleButton.isTemporaryFunction) {
              throw new Error('Real subtitle button was not loaded');
            }

            const controls = $('.ytp-right-controls');
            const currentContainer = button.closest('[data-btn="subtitle"]') || container;
            if (!isYcButtonContainerMountedInControls(currentContainer, controls)) {
              button.classList.remove('subtitle-button-active');
              return;
            }

            const realContainer = window.createSubtitleButton();
            realContainer.setAttribute('data-btn', 'subtitle');
            currentContainer.remove();
            insertButtonInOrder(controls, 'subtitle', realContainer);
            normalizeYouChordsButtonOrder(controls);
            const realButton = realContainer.querySelector('.ytp-subtitle-button');
            if (realButton) {
              applyYcButtonTooltip('subtitle', realContainer, realButton);
              addLWithCleanup(realButton, 'click', toggleSubs, { capture: true }, 'ui');
              realButton.dataset.bound = '1';
              realButton._lastHandler = toggleSubs;
              realButton.classList.add('subtitle-button-active');
              realButton.click();
            }
          } catch (error) {
            console.error('[SubtitleButton] Failed to load subtitle button:', error);
            if (button.isConnected) {
              button.classList.remove('subtitle-button-active');
            }
          } finally {
            stopLoadingSpinner();
            if (button.isConnected) {
              button.dataset.loading = 'false';
              button.style.opacity = '';
            }
          }
        });

        container.appendChild(button);
        return container;
      };

      window.createSubtitleButton.isTemporaryFunction = true;
    }

    // CCT - uploaded translated SRT, loaded through the subtitle module.
    if (!window.createCustomSubtitleButton) {
      window.createCustomSubtitleButton = function () {
        const container = document.createElement('div');
        container.className = 'custom-button-container';

        const button = document.createElement('button');
        button.className = 'ytp-button ytp-custom-subtitle-button';
        button.title = 'Translated Subtitles';
        button.setAttribute('aria-label', 'Translated Subtitles');
        button.setAttribute('data-temporary', 'true');
        button.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <use class="ytp-svg-shadow"/>
          <circle class="ytp-svg-stroke" cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="1.5"/>
          <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-size="5.3" font-weight="bold" fill="#fff" class="ytp-svg-fill">CCT</text>
        </svg>`;

        button.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (button.dataset.loading === 'true') return;
          button.dataset.loading = 'true';
          button.style.opacity = '0.65';
          const stopLoadingSpinner = startYcButtonLoadingSpinner(button, 'subtitles');

          try {
            await window.dynamicLoader?.loadGroup?.('subtitles');
            if (
              typeof window.createCustomSubtitleButton !== 'function' ||
              window.createCustomSubtitleButton.isTemporaryFunction
            ) {
              throw new Error('Real translated subtitle button was not loaded');
            }

            const controls = $('.ytp-right-controls');
            const currentContainer = button.closest('[data-btn="customSubtitle"]') || container;
            if (!isYcButtonContainerMountedInControls(currentContainer, controls)) return;

            const realContainer = window.createCustomSubtitleButton();
            realContainer.setAttribute('data-btn', 'customSubtitle');
            currentContainer.remove();
            insertButtonInOrder(controls, 'customSubtitle', realContainer);
            normalizeYouChordsButtonOrder(controls);
            const realButton = realContainer.querySelector('.ytp-custom-subtitle-button');
            if (realButton) {
              applyYcButtonTooltip('customSubtitle', realContainer, realButton);
              realButton.click();
            }
          } catch (error) {
            console.error('[SubtitleButton] Failed to load CCT button:', error);
          } finally {
            stopLoadingSpinner();
            if (button.isConnected) {
              button.dataset.loading = 'false';
              button.style.opacity = '';
            }
          }
        });

        container.appendChild(button);
        return container;
      };
      window.createCustomSubtitleButton.isTemporaryFunction = true;
    }

    // SRT / Subflow - lightweight placeholder; full UI loads only on click.
    if (!window.createSubflowButton) {
      window.createSubflowButton = function () {
        const container = document.createElement('div');
        container.className = 'custom-button-container';

        const button = document.createElement('button');
        button.className = 'ytp-button ytp-subflow-button';
        button.title = 'Subtitle Workflow';
        button.setAttribute('aria-label', 'Subtitle Workflow');
        button.setAttribute('data-temporary', 'true');
        button.innerHTML = '<span class="yc-subflow-button-label" style="display:grid;place-items:center;width:22px;height:18px;border:1.5px solid currentColor;border-radius:3px;font:700 8px/1 Arial,sans-serif;letter-spacing:0">SRT</span>';

        button.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (button.dataset.loading === 'true') return;
          button.dataset.loading = 'true';
          button.style.opacity = '0.65';
          const stopLoadingSpinner = startYcButtonLoadingSpinner(button, 'subflow');

          try {
            await window.dynamicLoader?.loadGroup?.('subflow');
            if (typeof window.createSubflowButton !== 'function' || window.createSubflowButton.isTemporaryFunction) {
              throw new Error('Real subtitle workflow button was not loaded');
            }

            const controls = $('.ytp-right-controls');
            const currentContainer = button.closest('[data-btn="subflow"]') || container;
            if (!isYcButtonContainerMountedInControls(currentContainer, controls)) return;

            const realContainer = window.createSubflowButton();
            realContainer.setAttribute('data-btn', 'subflow');
            currentContainer.remove();
            insertButtonInOrder(controls, 'subflow', realContainer);
            normalizeYouChordsButtonOrder(controls);
            const realButton = realContainer.querySelector('.ytp-subflow-button');
            if (realButton) {
              applyYcButtonTooltip('subflow', realContainer, realButton);
              realButton.click();
            }
          } catch (error) {
            console.error('[SubflowButton] Failed to load subtitle workflow:', error);
          } finally {
            stopLoadingSpinner();
            if (button.isConnected) {
              button.dataset.loading = 'false';
              button.style.opacity = '';
            }
          }
        });

        container.appendChild(button);
        return container;
      };
      window.createSubflowButton.isTemporaryFunction = true;
    }

    // 🎵 Lyrics & Chords Panel - כפתור זמני (כמו ChordExplorer ו-Tuner)
    if (!window.createLyricsAndChordsButton) {
      window.createLyricsAndChordsButton = function () {
        console.log('[LyricsChords] יצירת כפתור זמני עם lazy loading');

        const container = document.createElement('div');
        container.className = 'custom-button-container';

        const button = document.createElement('button');
        button.className = 'ytp-button ytp-lyrics-chords-button';
        button.title = 'Subtitles & Chords';
        button.setAttribute('data-temporary', 'true');

        // SVG זהה למקורי - subs & chords עם מסגרת
        button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <use class="ytp-svg-shadow"/>
          <rect x="0.7" y="3.3" width="22.6" height="18.7" rx="2" ry="2" fill="none" stroke="#ffffff" stroke-width="0.7"/>
          <g class="ytp-svg-fill" font-family="Arial, sans-serif" font-weight="bold" text-anchor="middle" fill="#fff">
            <text x="12" y="9.3" font-size="6.7">subs</text>
            <text x="12" y="14.7" font-size="4.7">&amp;</text>
            <text x="12" y="20" font-size="6.7">chords</text>
          </g>
        </svg>`;

        button.addEventListener('mouseenter', () => { button.style.opacity = '1'; });
        button.addEventListener('mouseleave', () => { button.style.opacity = '0.9'; });

        // לחיצה - טעינת הקובץ המלא ואז הפעלת הפונקציה
        button.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (button.dataset.loading === 'true') return;

          if (blockClearYouTubeLiveVideoIfNeeded('lyrics-chords-temp-button')) {
            button.classList.remove('lyrics-chords-active');
            return;
          }

          markYouChordsFeatureUse('lyrics-chords-panel');
          console.log('[LyricsChords] טעינת הקובץ המלא בפעם הראשונה...');
          button.dataset.loading = 'true';
          button.classList.add('lyrics-chords-active');
          const stopLoadingSpinner = startYcButtonLoadingSpinner(button, 'lyrics-chords');
          try {
            await window.dynamicLoader?.loadGroup?.('lyricsChords');
            stopLoadingSpinner();

            // קריאה לפונקציה האמיתית
            if (typeof window.toggleLyricsAndChords === 'function') {
              await window.toggleLyricsAndChords();
            } else {
              button.classList.remove('lyrics-chords-active');
              console.error('[LyricsChords] toggleLyricsAndChords לא נמצא אחרי טעינה');
            }
          } catch (error) {
            console.error('[LyricsChords] שגיאה בטעינת הקובץ:', error);
            button.classList.remove('lyrics-chords-active');
          } finally {
            stopLoadingSpinner();
            button.dataset.loading = 'false';
          }
        });

        container.appendChild(button);
        return container;
      };

      // סימון שזו פונקציה זמנית
      window.createLyricsAndChordsButton.isTemporaryFunction = true;
    }

    // 🔍 Chord Explorer - כפתור זמני
    if (!window.createChordExplorerButton) {
      window.createChordExplorerButton = function () {
        console.log('[ChordExplorer] יצירת כפתור זמני עם lazy loading');

        const container = document.createElement('div');
        container.className = 'custom-button-container chord-explorer-container';

        const button = document.createElement('button');
        button.className = 'ytp-button ytp-chord-explorer-button';
        button.title = 'Chord Explorer';

        // SVG של זכוכית מגדלת
        button.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>`;

        button.addEventListener('mouseenter', () => { button.style.opacity = '1'; });
        button.addEventListener('mouseleave', () => { button.style.opacity = '0.9'; });

        // לחיצה - טעינת הקובץ המלא
        button.addEventListener('click', async () => {
          console.log('[ChordExplorer] טעינת הקובץ המלא בפעם הראשונה...');
          const stopLoadingSpinner = startYcButtonLoadingSpinner(button, 'chord-explorer');
          try {
            await window.dynamicLoader?.loadGroup?.('chordExplorer');

            // קריאה לפונקציה האמיתית
            if (window.ChordExplorer && window.ChordExplorer.open) {
              window.ChordExplorer.open();
            }
          } catch (error) {
            console.error('[ChordExplorer] שגיאה בטעינת הקובץ:', error);
          } finally {
            stopLoadingSpinner();
          }
        });

        container.appendChild(button);
        return container;
      };
    }

    // 🎸 Tuner - כפתור זמני
    if (!window.createTunerButton) {
      window.createTunerButton = function () {
        console.log('[Tuner] יצירת כפתור זמני עם lazy loading');

        const container = document.createElement('div');
        container.className = 'custom-button-container tuner-container';

        const button = document.createElement('button');
        button.className = 'ytp-button ytp-tuner-button';
        button.title = 'Guitar Tuner';

        // SVG של טיונר (מד כיוון)
        button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <g transform="translate(12, 16)">
            <path d="M -10 -4 A 10.5 10.5 0 0 1 -2 -10.2" stroke="currentColor" stroke-width="2.8" opacity="0.4" stroke-linecap="butt" />
            <path d="M -1.6 -10.2 A 10.5 10.5 0 0 1 1.6 -10.2" stroke="currentColor" stroke-width="2.8" opacity="1" stroke-linecap="butt" />
            <path d="M 2 -10.2 A 10.5 10.5 0 0 1 10 -4" stroke="currentColor" stroke-width="2.8" opacity="0.4" stroke-linecap="butt" />
            <g transform="rotate(5)"><path d="M -0.6 0 L 0 -11 L 0.6 0 Z" fill="currentColor" /></g>
            <circle cx="0" cy="0" r="1.8" fill="currentColor" />
          </g>
        </svg>`;

        button.addEventListener('mouseenter', () => { button.style.opacity = '1'; });
        button.addEventListener('mouseleave', () => { button.style.opacity = '0.9'; });

        // לחיצה - טעינת הקובץ המלא
        button.addEventListener('click', async () => {
          console.log('[Tuner] טעינת הקובץ המלא בפעם הראשונה...');
          button.style.color = '#ff0000'; // סימון שהכפתור פעיל
          const stopLoadingSpinner = startYcButtonLoadingSpinner(button, 'tuner');
          try {
            await window.dynamicLoader?.loadGroup?.('tuner');

            // קריאה לפונקציה האמיתית
            if (window.openTuner) {
              window.openTuner();
            }
          } catch (error) {
            console.error('[Tuner] שגיאה בטעינת הקובץ:', error);
            button.style.color = ''; // החזרת הצבע במקרה של שגיאה
          } finally {
            stopLoadingSpinner();
          }
        });

        container.appendChild(button);
        return container;
      };
    }

    // ⚙️ Settings - כפתור זמני, טעינת ההגדרות המלאה רק בלחיצה
    if (!window.createSettingsButton) {
      window.createSettingsButton = function () {
        console.log('[SettingsButton] Creating temporary lazy button');

        const container = document.createElement('div');
        container.className = 'custom-button-container';

        const button = document.createElement('button');
        button.className = 'ytp-button settings-button';
        button.title = 'Settings';
        button.setAttribute('data-temporary', 'true');
        button.innerHTML = `
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <use class="ytp-svg-shadow"></use>
            <path class="ytp-svg-fill" d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" fill="#fff"></path>
          </svg>`;

        button.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (button.dataset.loading === 'true') return;

          button.dataset.loading = 'true';
          button.style.opacity = '0.65';
          const stopLoadingSpinner = startYcButtonLoadingSpinner(button, 'settings');

          try {
            console.log('[SettingsButton] Loading full settings button on demand...');
            await window.dynamicLoader?.ensureButtonsLoaded?.();

            if (typeof window.createSettingsButton !== 'function' || window.createSettingsButton.isTemporaryFunction) {
              throw new Error('Real settings button was not loaded');
            }

            const controls = $('.ytp-right-controls');
            const currentContainer = button.closest('[data-btn="settings"]') || container;
            if (!isYcButtonContainerMountedInControls(currentContainer, controls)) return;

            const realContainer = window.createSettingsButton();
            realContainer.setAttribute('data-btn', 'settings');
            currentContainer.remove();
            insertButtonInOrder(controls, 'settings', realContainer);
            normalizeYouChordsButtonOrder(controls);
            const realButton = realContainer.querySelector('.settings-button');
            if (realButton) {
              applyYcButtonTooltip('settings', realContainer, realButton);
              realButton.click();
            }
          } catch (error) {
            console.error('[SettingsButton] Failed to load settings button:', error);
            if (button.isConnected) {
              button.dataset.loading = 'false';
              button.style.opacity = '';
            }
          } finally {
            stopLoadingSpinner();
            if (button.isConnected) {
              button.dataset.loading = 'false';
              button.style.opacity = '';
            }
          }
        });

        container.appendChild(button);
        return container;
      };

      window.createSettingsButton.isTemporaryFunction = true;
    }

    DEBUG && console.log('[content.js] All lazy loading buttons created without preloading button modules');

    // בדיקה נוספת אם התוסף הושבת בינתיים
    if (window.extensionDisabled) {
      DEBUG && console.log('[content.js] Extension was disabled during button loading, aborting');
      return;
    }

    if ($('.ytp-right-controls')) {
      injectButtons();
      // No need to explicitly clear chord button here, injectButtons ensures it starts non-active.
      // רק אם התוסף עדיין מופעל
      if (!window.extensionDisabled) {
        startButtonCheck();
      }
      return;
    }

    const obs = new MutationObserver((mutationsList, observer) => {
      // בדיקה אם התוסף מושבת בתוך ה-observer
      if (window.extensionDisabled) {
        DEBUG && console.log('[YouChords] Extension is disabled, disconnecting observer without injecting buttons');
        observer.disconnect();
        const index = bin.observers.indexOf(observer);
        if (index !== -1) bin.observers.splice(index, 1);
        return;
      }

      if ($('.ytp-right-controls')) {
        observer.disconnect();
        const index = bin.observers.indexOf(observer);
        if (index !== -1) bin.observers.splice(index, 1);
        DEBUG && console.log('[YouChords] Controls found by MutationObserver, injecting buttons.');
        injectButtons();
        // רק אם התוסף עדיין מופעל
        if (!window.extensionDisabled) {
          startButtonCheck();
        }
      }
    });

    const observerTimeoutDuration = 10000;
    const timeoutId = setTimeout(() => {
      // בדיקה אם התוסף מושבת בתוך הטיימר
      if (window.extensionDisabled) {
        DEBUG && console.log('[YouChords] Extension is disabled, cleaning up observer without injecting buttons');
        obs.disconnect();
        const index = bin.observers.indexOf(obs);
        if (index !== -1) bin.observers.splice(index, 1);
        bin.timers.delete(timeoutId);
        return;
      }

      DEBUG && console.log(`[YouChords] MutationObserver timeout (${observerTimeoutDuration}ms) reached, disconnecting.`);
      obs.disconnect();
      const index = bin.observers.indexOf(obs);
      if (index !== -1) bin.observers.splice(index, 1);
      bin.timers.delete(timeoutId);

      // בדיקה נוספת אם התוסף עדיין מופעל
      if (!window.extensionDisabled) {
        if ($('.ytp-right-controls')) {
          DEBUG && console.warn('[YouChords] Controls found after observer timeout. Injecting buttons.');
          injectButtons();
        } else {
          DEBUG && console.warn('[YouChords] Controls still not found after observer timeout.');
        }
        startButtonCheck();
      }
    }, observerTimeoutDuration);

    bin.timers.add(timeoutId);

    uiCtl.signal.addEventListener('abort', () => {
      obs.disconnect();
      clearTimeout(timeoutId);
      bin.timers.delete(timeoutId);
      DEBUG && console.log('[YouChords] MutationObserver and timeout aborted by uiCtl.');
    }, { once: true });

    obs.observe(document.body, { childList: true, subtree: true });
    bin.observers.push(obs);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      DEBUG && console.log('%c[Visibility] Tab hidden - pausing rendering & resources', 'color:#FF9800');
      clearYcSessionPrewarmTimer();
      if (window.chordsDisplay && chordsActive) window.chordsDisplay.pauseRendering();

      // השהיית button check כשהטאב מוסתר
      if (buttonCheckActive) {
        stopButtonCheck();
      }

      // Worker management removed - using direct import() now
      window.databaseManager?.closeConnections?.();
    } else {
      DEBUG && console.log('%c[Visibility] Tab visible - resuming rendering', 'color:#4CAF50');
      if (window.chordsDisplay && chordsActive) window.chordsDisplay.resumeRendering();

      // חידוש button check כשהטאב גלוי
      if ($('.ytp-right-controls') && !window.extensionDisabled && !buttonCheckActive) {
        // 🔧 FIX: בדיקה מיידית והזרקה מחדש של כפתורים חסרים כשחוזרים לטאב
        if (isButtonMissing()) {
          DEBUG && console.log('[Visibility] Buttons missing after tab visible, re-injecting');
          injectButtons();
        }
        startButtonCheck();
      }

      scheduleYcSessionPrewarm('visibility-visible', { force: true });

      // Worker management removed - using direct import() now
    }
  }

  /*───────────────────────────────────────────────────────────────────────────┐
  │ 6.5 setupScrubListeners – sync chords during progress bar scrubbing       │
  └───────────────────────────────────────────────────────────────────────────*/
  function setupScrubListeners() {
    const bar = document.querySelector('.ytp-progress-bar');
    if (!bar) return;

    let dragging = false;
    // זיכרון זמן-תצוגה אחרון כדי למנוע רינדור מיותר לאותה שנייה
    let lastPreviewTime = -1;

    const updateTimeFromEvent = e => {
      const rect = bar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const clamped = Math.min(1, Math.max(0, pct));
      const video = document.querySelector('video');
      const scrubTime = clamped * (video?.duration || 0);
      /* --- רינדור חי בזמן Drag --- */
      // 1. אקורדים – בדיוק כפי שהיה עד עכשיו
      window.chordsDisplay?.updateDisplay?.(scrubTime);

      // 2. כתוביות – תצוגה מיידית עם הדגשה, בתנאי שהזמן השתנה ≥ 0.05 ש׳
      if (Math.abs(scrubTime - lastPreviewTime) > 0.05) {          // ‎⟵‎ סף רענון
        window.previewSubtitles?.(scrubTime);
        lastPreviewTime = scrubTime;
      }
    };

    const onPointerDown = e => {
      dragging = true;
      bar.setPointerCapture?.(e.pointerId);
      updateTimeFromEvent(e);
    };

    const onPointerMove = e => {
      if (!dragging) return;
      updateTimeFromEvent(e);
    };

    const endDrag = e => {
      if (!dragging) return;
      dragging = false;
      bar.releasePointerCapture?.(e.pointerId);
      const video = document.querySelector('video');
      window.chordsDisplay?.updateDisplay?.(video?.currentTime || 0);
      // כתוביות רגילות יתעדכנו באירוע timeupdate → אין צורך לקרוא כאן
      lastPreviewTime = -1;                                        // איפוס
    };

    addLWithCleanup(bar, 'pointerdown', onPointerDown, { capture: true }, 'video');
    addLWithCleanup(bar, 'pointermove', onPointerMove, { capture: true }, 'video');
    addLWithCleanup(bar, 'pointerup', endDrag, { capture: true }, 'video');
    addLWithCleanup(bar, 'pointercancel', endDrag, { capture: true }, 'video');
  }

  /*───────────────────────────────────────────────────────────────────────────┐
  │ 6.5. טעינת Sizes הוסרה - עכשיו נטען רק בהפעלת אקורדים                   │
  └───────────────────────────────────────────────────────────────────────────*/
  // Sizes נטען עכשיו רק ב-chordsDisplay.js בעת הפעלת אקורדים

  /*───────────────────────────────────────────────────────────────────────────┐
  │ 7. init – אתחול ההרחבה                                                   │
  └───────────────────────────────────────────────────────────────────────────*/
  async function init() {
    // בדיקה אם התוסף מושבת
    if (window.extensionDisabled) {
      DEBUG && console.log('[content.js] Extension is disabled, not initializing');
      return;
    }

    // Auth/Firestore is intentionally deferred until an action needs quota/auth checks.
    // This keeps a fresh YouTube tab lighter before the user clicks a YouChords button.

    // Load carousel position number setting
    chrome.storage.sync.get(['carouselPositionNumberEnabled'], (result) => {
      const isEnabled = result.carouselPositionNumberEnabled ?? true;
      window.carouselPositionNumberEnabled = isEnabled;

      if (isEnabled) {
        document.body.classList.add('yc-carousel-position-always-visible');
      } else {
        document.body.classList.remove('yc-carousel-position-always-visible');
      }

      DEBUG && console.log('[content.js] Carousel position number enabled:', isEnabled);
    });

    // Load Primary Chords Position setting
    chrome.storage.sync.get(['primaryChordPositionEnabled', 'globeIconEnabled'], (result) => {
      const primaryEnabled = result.primaryChordPositionEnabled ?? true;
      const globeEnabled = result.globeIconEnabled ?? true;

      window.primaryChordPositionEnabled = primaryEnabled;
      window.globeIconEnabled = globeEnabled;

      if (primaryEnabled) {
        document.body.classList.add('yc-primary-chord-position-enabled');
      } else {
        document.body.classList.remove('yc-primary-chord-position-enabled');
      }

      DEBUG && console.log('[content.js] Primary Chord Position enabled:', primaryEnabled, 'Globe Icon:', globeEnabled);
    });

    // Sizes נטען עכשיו רק בהפעלת אקורדים ב-chordsDisplay.js
    // loadSavedSizes(); // הוסר - לא צריך עוד

    // ניקוי מטמון של dynamicLoader למניעת הצטברות מודולים ישנים בזיכרון
    if (window.dynamicLoader?._loadedGroups) {
      window.dynamicLoader._loadedGroups = new Set(); // מנקה את ה-cache
      DEBUG && console.log('[content.js] Cleared dynamicLoader._loadedGroups cache');
    }

    // Modules will be loaded on-demand when user clicks buttons
    // No auto-loading to save memory!


    // וודא שה-CSS של האקורדים והקרוסלה נטענים מחדש
    if (window.chordsDisplay && typeof window.chordsDisplay.reinitialize === 'function') {
      window.chordsDisplay.reinitialize();
      DEBUG && console.log('[content.js] Called chordsDisplay.reinitialize()');
    } else if (window.chordsDisplay && typeof window.chordsDisplay.initialize === 'function') {
      window.chordsDisplay.initialize();
      DEBUG && console.log('[content.js] Called chordsDisplay.initialize() (fallback)');
    }

    currentVideoId = extractVideoId(location.href);
    bindYcFeatureUseCaptureOnce();
    await waitAndInjectButtons();
    scheduleYcSessionPrewarm('init');
    setupScrubListeners();
    attachEndedListener();

    bindAuthLifecycleListenersOnce();
    if (window.__ycUiLifecycleSignal !== uiCtl) {
      window.__ycUiLifecycleSignal = uiCtl;

      addL(window, 'yt-navigate-start', () => {
        navigationInProgress = true;
        const shouldRunHeavyCleanup = hasYouChordsRuntimeFootprint();
        nextNavigationToken('yt-navigate-start');

        if (isChordsLoading) {
          window.ycUserCancelledChords = true;
          isChordsLoading = false;
          chordsActive = false;
          window.chordsActive = false;
          clearChordBtn('navigation-abort');
        }
        window.ycUserCancelledPanel = true;

        if (window.extractorModule) {
          if (typeof window.extractorModule.abortAllRequests === 'function') {
            window.extractorModule.abortAllRequests();
          }
          if (typeof window.extractorModule.removeSubtitlesProgressBar === 'function') {
            window.extractorModule.removeSubtitlesProgressBar();
          }
          if (typeof window.extractorModule.removeProgressBar === 'function') {
            window.extractorModule.removeProgressBar();
          }
        }

        if (shouldRunHeavyCleanup) {
          window.chordsDisplay?.pauseRendering?.();
          if (window.lyricsChordsPanelActive && typeof window.cleanupLyricsChordsPanel === 'function') {
            try {
              window.cleanupLyricsChordsPanel();
            } catch (error) {
              console.error('[content.js] Error cleaning Lyrics & Chords panel on navigation:', error);
            }
          }

          navigationMemoryCleanup();
          fullCleanup();
          window.extractorModule?.cleanupExtractorResources?.();
        } else {
          lightNavigationCleanup('yt-navigate-start:no-footprint');
        }
      }, { scope: 'ui' });

      addL(window, 'yt-navigate-finish', async () => {
        const finishToken = nextNavigationToken('yt-navigate-finish');
        await sleep(150);
        if (!isNavigationTokenCurrent(finishToken)) return;

        const newVideoId = extractVideoId(location.href);
        currentVideoId = newVideoId;

        if (window.extractorModule) {
          if (typeof window.extractorModule.removeSubtitlesProgressBar === 'function') {
            window.extractorModule.removeSubtitlesProgressBar();
          }
          if (typeof window.extractorModule.removeProgressBar === 'function') {
            window.extractorModule.removeProgressBar();
          }
        }

        if (window.lyricsChordsPanelActive) {
          window.lyricsChordsPanelActive = false;
          if (window.subtitleLocationHandlers?.handleTimelineAlwaysVisibleChange) {
            window.subtitleLocationHandlers.handleTimelineAlwaysVisibleChange();
          }
          const panel = document.querySelector('.lyrics-chords-panel');
          if (panel) {
            panel.remove();
          }
        }

        chordsActive = false;
        window.chordsActive = false;
        subsActive = false;
        clearChordBtn('navigate-finish');
        clearChordBtn('navigate-finish-ensure-off');

        await waitAndInjectButtons();
        scheduleYcSessionPrewarm('yt-navigate-finish', { force: true });
        setupScrubListeners();
        attachEndedListener();
        navigationInProgress = false;
      }, { scope: 'ui' });

      let lastUrl = window.location.href;
      addL(window, 'popstate', () => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
          navigationInProgress = true;
          const shouldRunHeavyCleanup = hasYouChordsRuntimeFootprint();
          const popstateToken = nextNavigationToken('popstate');

          if (shouldRunHeavyCleanup) {
            if (window.lyricsChordsPanelActive && typeof window.cleanupLyricsChordsPanel === 'function') {
              try {
                window.cleanupLyricsChordsPanel();
              } catch (error) {
                console.error('[content.js] Error cleaning Lyrics & Chords panel on popstate:', error);
              }
            }

            navigationMemoryCleanup();
          } else {
            lightNavigationCleanup('popstate:no-footprint');
          }

          lastUrl = currentUrl;
          setTimeout(() => {
            if (isNavigationTokenCurrent(popstateToken)) {
              navigationInProgress = false;
            }
          }, 1200);
        }
      }, { scope: 'ui' });
    }
    DEBUG && console.log('[content.js] init OK, event listeners set.');
  }

  addL(document, 'visibilitychange', handleVisibilityChange, { scope: 'ui' });
  addL(window, 'pagehide', e => {
    if (e.persisted) {
      DEBUG && console.log('%c[pagehide] Page is being persisted (bfcache). Performing full cleanup.', 'color:#F44336');

      // 🔥 CRITICAL FIX: ניקוי פאנל Lyrics & Chords לפני bfcache
      if (window.lyricsChordsPanelActive && typeof window.cleanupLyricsChordsPanel === 'function') {
        try {
          console.log('%c[🔥 CRITICAL FIX] Cleaning Lyrics & Chords panel on pagehide', 'color:#E91E63; font-weight:bold');
          window.cleanupLyricsChordsPanel();
        } catch (error) {
          console.error('[🔥 CRITICAL FIX] Error cleaning Lyrics & Chords panel on pagehide:', error);
        }
      }

      fullCleanup();
    }
    // startHeapMonitor(); // Re-enable if needed
  }, { scope: 'ui' });

  // מאזין לאירוע beforeunload לביצוע ניקוי מלא
  addL(window, 'beforeunload', () => {
    DEBUG && console.log('%c[beforeunload] Page is closing. Performing full cleanup.', 'color:#E91E63');

    // 🔥 CRITICAL FIX: ניקוי פאנל Lyrics & Chords לפני סגירת הדף
    if (window.lyricsChordsPanelActive && typeof window.cleanupLyricsChordsPanel === 'function') {
      try {
        console.log('%c[🔥 CRITICAL FIX] Cleaning Lyrics & Chords panel on beforeunload', 'color:#E91E63; font-weight:bold');
        window.cleanupLyricsChordsPanel();
      } catch (error) {
        console.error('[🔥 CRITICAL FIX] Error cleaning Lyrics & Chords panel on beforeunload:', error);
      }
    }

    fullCleanup();
    uiCtl.abort();
  }, { scope: 'ui' });

  /*───────────────────────────────────────────────────────────────────────────┐
  │ 8. Heap-Monitor (אופציונלי)                                              │
  └───────────────────────────────────────────────────────────────────────────*/
  function startHeapMonitor() {
    if (window.heapMonitorId) {
      clearInterval(window.heapMonitorId);
      bin.timers?.delete(window.heapMonitorId);
      DEBUG && console.log('[Heap] Cleared old heap monitor.');
    }

    if (DEBUG) {
      const memoryReadings = []; // לשמירת קריאות אחרונות
      const MAX_READINGS = 5; // כמה קריאות לשמור
      const ALERT_THRESHOLD_MB = 50; // סף התראה לגידול ב-MB

      const hm = setInterval(() => {
        let mb = 0;
        try {
          if (performance?.memory) {
            mb = Math.round(performance.memory.usedJSHeapSize / 1e6);

            // שמירת הקריאה הנוכחית
            memoryReadings.push(mb);
            if (memoryReadings.length > MAX_READINGS) {
              memoryReadings.shift(); // הסרת הקריאה הישנה ביותר
            }

            // בדיקת גידול חריג
            if (memoryReadings.length >= 2) {
              const oldestReading = memoryReadings[0];
              const growth = mb - oldestReading;

              if (growth > ALERT_THRESHOLD_MB) {
                console.warn(`[Heap Warning] Memory grew by ${growth} MB in the last ${MAX_READINGS} readings!`);

                // בדיקה אם כבר קיימת התראה
                if (!document.querySelector('#yc-heap-warning')) {
                  // הצגת התראה למשתמש
                  const overlay = document.createElement('div');
                  overlay.id = 'yc-heap-warning';
                  overlay.style.cssText = `
                    position: fixed;
                    bottom: 10px;
                    right: 10px;
                    background: rgba(255, 0, 0, 0.8);
                    color: white;
                    padding: 5px 10px;
                    border-radius: 4px;
                    z-index: 9999;
                    font-size: 12px;
                  `;
                  overlay.textContent = `Memory warning: ${growth} MB increase detected`;
                  document.body.appendChild(overlay);

                  // הסרת ההתראה אחרי 5 שניות
                  setTimeout(() => overlay.remove(), 5000);
                }
              }
            }
          }
        } catch (e) { /* ignore */ }

        console.log('[Heap]', mb, 'MB');

        // דיווח נוסף על Worker פעיל אם קיים
        if (window.DEBUG && window.extractorModule?.activeExtractionWorker) {
          console.log('[Heap] Active extraction worker detected');
        }
      }, 10000);

      bin.timers?.add(hm);
      window.heapMonitorId = hm;
      DEBUG && console.log('[Heap] New heap monitor started.');
    }
  }
  if (DEBUG) startHeapMonitor();

  /*───────────────────────────────────────────────────────────────────────────┐
  │ 9. מאזין להודעות מהחלון הקופץ (popup)                                     │
  └───────────────────────────────────────────────────────────────────────────*/
  // משתנה למניעת קריאות כפולות ל-disableExtension
  let isDisablingExtension = false;

  function disableExtension() {
    // מניעת קריאות כפולות
    if (isDisablingExtension || window.extensionDisabled) {
      DEBUG && console.log('[content.js] Extension already disabled or being disabled, skipping');
      return;
    }

    isDisablingExtension = true;
    DEBUG && console.log('[content.js] Disabling extension completely');

    // כיבוי ישיר של אקורדים וכתוביות לפני הניקוי המלא
    if (chordsActive) {
      // כיבוי ישיר של האקורדים
      window.chordsDisplay?.pauseRendering?.();
      window.chordsDisplay?.hideChords?.();
      window.chordsDisplay?.clearAllTimers?.();
      document.querySelectorAll('#yc-chords-container, .yc-chord-element, .yc-chord-overlay').forEach(el => el.remove());
    }

    if (subsActive) {
      // כיבוי ישיר של הכתוביות - שימוש באופציונלי chaining בטוח
      if (window.cleanupSubtitles) {
        try {
          window.cleanupSubtitles();
        } catch (e) {
          if (DEBUG) console.warn('[disableExtension] Error calling cleanupSubtitles:', e);
        }
      }
      // ניקוי חלופי לבטיחות
      document.querySelectorAll('.yc-subtitle-element, .yc-subtitle-overlay').forEach(el => el.remove());
    }

    // ביצוע ניקוי מלא
    fullCleanup();

    // ניתוק uiCtl (בניגוד לניקוי רגיל שמשאיר אותו)
    uiCtl.abort();
    uiCtl = new AbortController();

    // ניקוי כפתורים - כל הכפתורים של התוסף
    const controls = $('.ytp-right-controls');
    if (controls) {
      ['chords', 'subtitle', 'customSubtitle', 'subflow', 'settings', 'lyricsChords', 'tuner', 'chordExplorer'].forEach(id => {
        const btn = controls.querySelector(`[data-btn="${id}"]`);
        if (btn) btn.remove();
      });
    }

    // ניקוי נוסף של טיימרים
    if (buttonCheckTimer) {
      clearTimeout(buttonCheckTimer);
      buttonCheckTimer = null;
    }

    // ניקוי workers ו-prefetch
    if (currentPrefetchPromise) {
      // אין דרך ישירה לבטל את ה-prefetch, אבל אפשר לנקות את המשתנה
      currentPrefetchPromise = null;
      resetYcSessionPrewarmRuntime('disable-extension-prefetch-clear');
      window.dynamicLoader?.clearCache?.();
    }

    // הסרת רק אלמנטים ספציפיים של התוסף - לא [class*="yc-"] כי זה תופס אלמנטים של YouTube
    document.querySelectorAll('#yc-chords-container, .yc-chord-element, .yc-chord-overlay, .yc-subtitle-element, .yc-subtitle-overlay, .yc-subflow-panel, .yc-error-overlay, .yc-debug-overlay, .yc-chord-carousel, .chords-backdrop, .yt-subtitle-overlay, .subtitle-settings-menu, .settings-menu-container').forEach(el => el.remove());

    // עצירת heap monitor
    if (window.heapMonitorId) {
      clearInterval(window.heapMonitorId);
      window.heapMonitorId = null;
    }

    // סימון שהתוסף מושבת
    window.extensionDisabled = true;

    // סיום תהליך הכיבוי
    isDisablingExtension = false;

    DEBUG && console.log('[content.js] Extension fully disabled and cleaned up');
  }

  // פונקציה חדשה לאיפוס מלא של המצב הגלובלי - גרסה מתוקנת עם כל השיפורים
  function resetGlobalState() {
    DEBUG && console.log('[content.js] Resetting all global state variables with memory leak prevention');
    clearAllYcButtonLoadingSpinners();

    // עצירת כל הטיימרים הפעילים מיד
    stopButtonCheck();
    if (window.heapMonitorId) {
      clearInterval(window.heapMonitorId);
      window.heapMonitorId = null;
    }

    // == שלב 1: ניתוק מיידי של כל ה-Controllers למניעת מאזינים "תלויים" ==
    if (overlayCtlChords && !overlayCtlChords.signal.aborted) {
      overlayCtlChords.abort();
    }
    if (overlayCtlSubs && !overlayCtlSubs.signal.aborted) {
      overlayCtlSubs.abort();
    }
    if (videoCtl && !videoCtl.signal.aborted) {
      videoCtl.abort();
    }

    // == שלב 2: ניקוי מיידי של Timers וRAF למניעת דליפות ==
    for (const id of bin.timers) {
      clearInterval(id);
      clearTimeout(id);
    }
    bin.timers.clear();

    // Worker management removed - using direct import() now
    if (buttonCheckTimer) {
      clearTimeout(buttonCheckTimer);
      buttonCheckTimer = null;
    }

    // == שלב 3: ניקוי chordsDisplay הפנימי לפני איפוס המשתנים ==
    if (window.chordsDisplay?.partialCleanup) {
      try {
        window.chordsDisplay.partialCleanup({ removeContainer: true });
        DEBUG && console.log('[resetGlobalState] Called chordsDisplay.partialCleanup()');
      } catch (e) {
        DEBUG && console.warn('[resetGlobalState] Error in chordsDisplay.partialCleanup:', e);
      }
    }

    // עצירת מעקב האקורדים
    if (window.chordsDisplay?.stopChordMonitoring) {
      window.chordsDisplay.stopChordMonitoring();
    }

    // == שלב 4: ניקוי Observers למניעת דליפות DOM ==
    bin.observers.forEach(o => {
      try {
        o.disconnect();
      } catch (e) {
        /* ignore cleanup errors */
      }
    });
    bin.observers.length = 0;

    if (window.subtitleObservers) {
      window.subtitleObservers.forEach(o => {
        try {
          o.disconnect?.();
        } catch (e) {
          /* ignore cleanup errors */
        }
      });
      window.subtitleObservers.length = 0;
    }

    // == שלב 5: ניקוי Event Listeners דינמיים ==
    for (const [element, controllers] of listenerControllers) {
      controllers.forEach(c => {
        try {
          if (!c.signal.aborted) c.abort();
        } catch (e) {
          /* ignore abort errors */
        }
      });
      controllers.clear();
    }
    listenerControllers.clear();

    /* == שלב 6: ניקוי CSS שההרחבה הוסיפה בלבד =========================
       - משתמשים בסימון data-yc כדי לא לגעת בקובצי-ליבה של YouTube     */
    const dynamicStyles = document.querySelectorAll('style[data-yc], link[data-yc]');
    dynamicStyles.forEach(style => {
      try {
        style.remove();
        if (DEBUG) console.log(`[resetGlobalState] Removed style/link: ${style.id || style.href}`);
      } catch (e) { /* ignore */ }
    });

    // == שלב 7: ניקוי Prefetch Promises למניעת דליפות ==
    // Worker management removed - using direct import() now
    resetYcSessionPrewarmRuntime('reset-global-state-cache-clear');
    window.dynamicLoader?.clearCache?.();
    currentPrefetchPromise = null;

    // == שלב 7: ניקוי מטמונים ו-Caches ==
    window.chordRenderer?.clearCache?.();
    if (window.databaseManager?.disposeAllDatabases) {
      window.databaseManager.disposeAllDatabases();
    }

    // ניקוי cache של הכלים הגלובליים
    window.COMPLETE_CHORDS = null;
    window.COMPLETE_CHORDS_COMPACT = null;
    window.lastErrorOverlay = null;
    window.lastDebugOverlay = null;

    // == שלב 8: איפוס המשתנים הגלובליים ==

    // איפוס משתני האקורדים לפני ניקוי הכפתור
    chordsActive = false;
    window.chordsActive = false;
    currentVideoId = null;

    // == שלב 9: ניקוי כפתור האקורדים (קריטי!) ==
    clearChordBtn('resetGlobalState');

    // וודא שהכפתור לא נראה פעיל
    setTimeout(() => {
      const chordsBtn = getChordBtn();
      if (chordsBtn) {
        chordsBtn.classList.remove('chords-active');
        chordsBtn.disabled = false;
        DEBUG && console.log('[resetGlobalState] Force-cleared chords button state');
      }
    }, 100);

    // == שלב 10: איפוס משתני הכתוביות ==
    if (window.subtitleState) {
      if (window.activeVideoListenersCleanup) {
        try {
          window.activeVideoListenersCleanup();
        } catch (e) { /* ignore */ }
        window.activeVideoListenersCleanup = null;
      }

      // איפוס מלא עם NULL assignment
      window.subtitleState.isVisible = false;
      window.subtitleState.sentences = null;
      window.subtitleState.words = null;
      window.subtitleState.isRTL = false;
      window.subtitleState.isSettingsVisible = false;
      window.subtitleState.timing_offset = 0;

      // נקה רפרנסים לאלמנטי DOM עם NULL assignment
      window.subtitleState.overlay = null;
      window.subtitleState.textContainer = null;
      window.subtitleState.line1Element = null;
      window.subtitleState.line2Element = null;
      window.subtitleState.line1WordSpans = null;
      window.subtitleState.line2WordSpans = null;
      window.subtitleState.settingsMenu = null;
      window.subtitleState.wordCountdownState = null;

      // יצירה מחדש של המערכים הריקים
      window.subtitleState.sentences = [];
      window.subtitleState.words = [];
      window.subtitleState.line1WordSpans = [];
      window.subtitleState.line2WordSpans = [];
      window.subtitleState.wordCountdownState = {};
    }

    // איפוס משתני מצב נוספים
    if (window.subtitleModeState) {
      window.subtitleModeState.isLyricsMode = true;
      window.subtitleModeState.isSubtitleMode = false;
      window.subtitleModeState.lastMode = 'lyrics';
      window.subtitleModeState.isLyricsHighlightEnabled = true;
      window.subtitleModeState.isChordsHighlightEnabled = true;  // במקום false
    }

    // == שלב 11: איפוס משתני overlay ==
    overlayCtlChords = null;
    overlayCtlSubs = null;
    subsActive = false;

    // == שלב 12: יצירת Controllers חדשים ==
    videoCtl = new AbortController();

    // == שלב 13: גרביג' קלקטור מאולץ (אם זמין) ==
    if (window.gc && DEBUG) {
      try {
        window.gc();
        console.log('[content.js] Manual garbage collection triggered');
      } catch (e) {
        /* GC not available in production */
      }
    }

    // == שלב 14: בדיקת זיכרון ודיווח ==
    if (DEBUG && performance?.memory) {
      const memAfterCleanup = Math.round(performance.memory.usedJSHeapSize / 1e6);
      console.log(`[content.js] Memory after state reset: ${memAfterCleanup} MB`);

      if (memAfterCleanup > 100) {
        console.warn(`[content.js] Memory usage still high after reset: ${memAfterCleanup} MB - possible memory leak`);
      }
    }

    // ניקוי CSS מהדף
    document.querySelectorAll('style[id^="yc-"]').forEach(s => s.remove());

    // ניקוי נתוני אקורדים גלובליים
    window.COMPLETE_CHORDS = null;
    window.COMPLETE_CHORDS_COMPACT = null;

    // ניקוי רפרנסים לווידאו
    window.subtitleVideoElement = null;

    // ניקוי prefetch
    currentPrefetchPromise = null;

    // Worker management removed - using direct import() now

    // ניקוי periodic cleanup timer אם קיים
    if (window.periodicCleanupId) {
      clearInterval(window.periodicCleanupId);
      bin.timers.delete(window.periodicCleanupId);
      window.periodicCleanupId = null;
    }

    DEBUG && console.log('[content.js] Global state reset completed with chords fix');

    // == שלב 15: איפוס נוסף של DOM עם delay קצר ==
    setTimeout(() => {
      if (typeof resetSubtitleDOM === 'function') {
        resetSubtitleDOM();
      } else {
        document.querySelectorAll('.yt-subtitle-overlay, .yt-subtitle-container, .yc-subtitle-element, .yc-subtitle-overlay').forEach(el => {
          try {
            el.remove();
          } catch (e) { /* ignore DOM errors */ }
        });
      }

      // ניקוי נוסף של אלמנטי אקורדים
      document.querySelectorAll('.yt-chords-container, .chords-carousel, .chord-slot, .yc-chord-element').forEach(el => {
        try {
          el.remove();
        } catch (e) { /* ignore DOM errors */ }
      });

      DEBUG && console.log('[resetGlobalState] Final DOM cleanup completed');
    }, 50);
  }

  // פונקציה לאיפוס DOM של הכתוביות - גרסה משופרת למניעת דליפות זיכרון
  function resetSubtitleDOM() {
    DEBUG && console.log('[SubtitleButton] Resetting subtitle DOM with memory leak prevention');

    // == שלב 1: ניקוי מאזינים אקטיביים של כתוביות ==
    if (window.activeVideoListenersCleanup) {
      try {
        window.activeVideoListenersCleanup();
      } catch (e) {
        DEBUG && console.warn('[SubtitleButton] Error during video listeners cleanup:', e);
      }
      window.activeVideoListenersCleanup = null;
    }

    // ביטול כל ה-controllers של הכתוביות
    if (window.subtitleClickController && !window.subtitleClickController.signal.aborted) {
      window.subtitleClickController.abort();
      window.subtitleClickController = null;
    }

    // == שלב 2: ניקוי DOM elements עם try-catch למניעת שגיאות ==
    const subtitleSelectors = [
      '.yt-subtitle-overlay',
      '.yt-subtitle-container',
      '.yc-subtitle-element',
      '.yc-subtitle-overlay',
      '.yt-subtitle-line',
      '.yt-subtitle-word',
      '.yt-subtitle-space',
      '.regular-subtitle-word',
      '.regular-subtitle-space',
      '.regular-subtitle-punctuation'
    ];

    subtitleSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          // ניקוי event listeners שעלולים להיות על האלמנטים
          el.onclick = null;
          el.onmouseenter = null;
          el.onmouseleave = null;

          // הסרת datasets שעלולים להחזיק הפניות
          if (el.dataset) {
            Object.keys(el.dataset).forEach(key => {
              delete el.dataset[key];
            });
          }

          el.remove();
        });
      } catch (e) {
        DEBUG && console.warn(`[SubtitleButton] Error cleaning selector ${selector}:`, e);
      }
    });

    // == שלב 3: איפוס מלא של subtitleState עם NULL assignments ==
    if (window.subtitleState) {
      // ניקוי observers של settings menus
      if (window.subtitleState.settingsMenu && window.subtitleState.settingsMenu.observer) {
        try {
          window.subtitleState.settingsMenu.observer.disconnect();
        } catch (e) { /* ignore */ }
        delete window.subtitleState.settingsMenu.observer;
      }

      // איפוס כל הרפרנסים עם NULL
      window.subtitleState.overlay = null;
      window.subtitleState.textContainer = null;
      window.subtitleState.line1Element = null;
      window.subtitleState.line2Element = null;
      window.subtitleState.settingsMenu = null;

      // ניקוי arrays של spans
      if (window.subtitleState.line1WordSpans) {
        window.subtitleState.line1WordSpans.forEach(span => {
          if (span) {
            span.onclick = null;
            span.textContent = '';
          }
        });
        window.subtitleState.line1WordSpans = null;
      }

      if (window.subtitleState.line2WordSpans) {
        window.subtitleState.line2WordSpans.forEach(span => {
          if (span) {
            span.onclick = null;
            span.textContent = '';
          }
        });
        window.subtitleState.line2WordSpans = null;
      }

      // איפוס נתונים
      window.subtitleState.sentences = null;
      window.subtitleState.words = null;
      window.subtitleState.wordCountdownState = null;

      // יצירה מחדש של מבנים ריקים
      window.subtitleState.line1WordSpans = [];
      window.subtitleState.line2WordSpans = [];
      window.subtitleState.sentences = [];
      window.subtitleState.words = [];
      window.subtitleState.wordCountdownState = {};
      window.subtitleState.isVisible = false;
      window.subtitleState.isSettingsVisible = false;
    }

    // == שלב 4: איפוס רפרנס לאלמנט הווידאו ==
    if (window.subtitleVideoElement) {
      window.subtitleVideoElement = null;
    }

    // == שלב 5: ניקוי CSS styles שנוספו דינמית ==
    const dynamicStyles = document.querySelectorAll('style[id*="subtitle"], style[id*="yc-"]');
    dynamicStyles.forEach(style => {
      if (style.id.includes('subtitle') || style.id.includes('yc-')) {
        // אל תסיר styles בסיסיים, רק דינמיים
        if (!style.id.includes('yc-chords-css') && !style.id.includes('base')) {
          try {
            style.remove();
          } catch (e) { /* ignore */ }
        }
      }
    });

    DEBUG && console.log('[SubtitleButton] Subtitle DOM reset completed with memory leak prevention');
  }

  const YC_DIAGNOSTICS_MAX_EVENTS = 80;
  const ycDiagnosticsState = window.__ycDiagnosticsState || {
    activeUntil: 0,
    events: []
  };
  window.__ycDiagnosticsState = ycDiagnosticsState;

  function isYcDiagnosticsActive() {
    return Date.now() < (ycDiagnosticsState.activeUntil || 0);
  }

  function sanitizeDiagnosticText(value, maxLength = 220) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }

  function recordYcDiagnosticEvent(type, message, details = {}) {
    if (!isYcDiagnosticsActive()) return;

    const event = {
      at: new Date().toISOString(),
      type: sanitizeDiagnosticText(type, 40),
      message: sanitizeDiagnosticText(message),
      details
    };

    ycDiagnosticsState.events.push(event);
    if (ycDiagnosticsState.events.length > YC_DIAGNOSTICS_MAX_EVENTS) {
      ycDiagnosticsState.events.splice(0, ycDiagnosticsState.events.length - YC_DIAGNOSTICS_MAX_EVENTS);
    }
  }

  function installYcDiagnosticErrorListeners() {
    if (window.__ycDiagnosticErrorListenersInstalled) return;
    window.__ycDiagnosticErrorListenersInstalled = true;

    window.addEventListener('error', (event) => {
      recordYcDiagnosticEvent('error', event?.message || 'Page error', {
        source: sanitizeDiagnosticText(event?.filename || 'unknown', 120),
        line: Number(event?.lineno || 0) || null
      });
    }, { passive: true });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event?.reason;
      recordYcDiagnosticEvent('unhandledrejection', reason?.message || reason || 'Unhandled promise rejection');
    }, { passive: true });
  }

  function getYcButtonSnapshot() {
    const buttons = {
      chords: !!document.querySelector('[data-btn="chords"] .ytp-chords-button'),
      subtitles: !!document.querySelector('[data-btn="subtitle"] .ytp-subtitle-button, [data-btn="subtitle"] .yt-subtitle-button'),
      translatedSubtitles: !!document.querySelector('[data-btn="customSubtitle"] .ytp-custom-subtitle-button'),
      panel: !!document.querySelector('[data-btn="lyricsChords"] .lyrics-chords-button, [data-btn="lyricsChords"] button'),
      tuner: !!document.querySelector('[data-btn="tuner"] button, [data-btn="tuner"] .tuner-button'),
      chordExplorer: !!document.querySelector('[data-btn="chordExplorer"] button, [data-btn="chordExplorer"] .chord-explorer-button'),
      settings: !!document.querySelector('[data-btn="settings"] .settings-button')
    };

    return {
      present: buttons,
      missing: Object.entries(buttons)
        .filter(([, exists]) => !exists)
        .map(([name]) => name)
    };
  }

  function getYcDiagnosticSnapshot() {
    const video = document.querySelector('video.html5-main-video');
    const progressActive = !!document.querySelector('#yc-download-progress, #yc-subtitles-progress');
    const player = document.getElementById('movie_player');

    return {
      at: new Date().toISOString(),
      url: {
        host: location.hostname,
        path: location.pathname,
        videoId: extractVideoId(location.href) || null
      },
      video: {
        exists: !!video,
        readyState: video ? video.readyState : null,
        networkState: video ? video.networkState : null,
        paused: video ? !!video.paused : null,
        ended: video ? !!video.ended : null,
        currentTime: video && Number.isFinite(video.currentTime) ? Math.round(video.currentTime) : null,
        duration: video && Number.isFinite(video.duration) ? Math.round(video.duration) : null
      },
      player: {
        exists: !!player,
        hasControls: !!document.querySelector('.ytp-right-controls'),
        visible: !!player && player.getBoundingClientRect().width > 0 && player.getBoundingClientRect().height > 0
      },
      buttons: getYcButtonSnapshot(),
      progress: {
        active: progressActive
      },
      features: {
        carouselActive: !!(chordsActive || window.chordsActive || document.querySelector('.yc-chord-carousel, #yc-chords-container')),
        panelActive: !!(window.lyricsChordsPanelActive || document.querySelector('.yt-lyrics-chords-panel, .lyrics-chords-panel')),
        subtitlesVisible: !!(subsActive || window.subtitleState?.isVisible || document.querySelector('.yc-subtitle-overlay, .yt-subtitle-overlay')),
        runtimeFootprint: hasYouChordsRuntimeFootprint()
      },
      auth: {
        authLoaded: !!window.ycAuth,
        jwtCacheReady: !!window.__ycJwtCacheReady,
        hasCachedJwt: !!window.__ycGetCachedJwt?.()
      },
      recentErrors: ycDiagnosticsState.events.slice(-10)
    };
  }

  // מאזין להודעות מהחלון הקופץ - גרסה מתוקנת עם delay לפני init()
  const handleRuntimeMessage = (message, sender, sendResponse) => {
    if (message.action === 'YC_DIAGNOSTICS_START') {
      ycDiagnosticsState.activeUntil = Number(message.expiresAt || 0) || (Date.now() + 10 * 60 * 1000);
      ycDiagnosticsState.events = [];
      installYcDiagnosticErrorListeners();
      recordYcDiagnosticEvent('info', 'Diagnostics started');
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'YC_DIAGNOSTICS_CLEAR') {
      ycDiagnosticsState.activeUntil = 0;
      ycDiagnosticsState.events = [];
      sendResponse({ success: true });
      return true;
    }

    if (message.action === 'YC_DIAGNOSTICS_SNAPSHOT') {
      sendResponse({
        success: true,
        snapshot: getYcDiagnosticSnapshot()
      });
      return true;
    }

    if (message.action === 'openAiTranscriptionSettings') {
      if (typeof window.openAiTranscriptionSettings === 'function') {
        Promise.resolve(window.openAiTranscriptionSettings())
          .then((opened) => sendResponse({ success: !!opened }))
          .catch((error) => {
            console.error('[Content] Failed to open AI Transcription settings:', error);
            sendResponse({ success: false, error: error?.message || 'open_failed' });
          });
      } else {
        sendResponse({ success: false, error: 'settings_not_ready' });
      }
      return true;
    }

    // Translation refresh from popup - single message listener path
    if (message.action === 'refreshTranslation') {
      const videoId = message.videoId;
      const currentSettings = message.currentSettings;

      console.log('[Content] Received refreshTranslation request for video:', videoId);
      console.log('[Content] Current settings:', currentSettings);

      // Check if databaseManager is available
      if (!window.databaseManager) {
        console.error('[Content] databaseManager not available');
        sendResponse({ success: false, error: 'databaseManager not available' });
        return true;
      }

      // Load cached translation to check settings
      window.databaseManager.loadFromDatabase('subtitles', videoId)
        .then((cached) => {
          if (!cached || !cached.translationSRT) {
            console.log('[Content] No cached translation found');
            sendResponse({ success: true, unchanged: false, error: 'No translation to refresh' });
            return;
          }

          // Compare settings
          const cachedLanguage = cached.translationLanguage || 'he';
          const cachedIncludeOriginal = cached.translationIncludeOriginal !== undefined ? cached.translationIncludeOriginal : false;
          const cachedSecondaryLanguage = cached.translationSecondaryLanguage || null;

          console.log('[Content] Cached settings:', {
            language: cachedLanguage,
            includeOriginal: cachedIncludeOriginal,
            secondaryLanguage: cachedSecondaryLanguage
          });

          // Check if settings are identical
          if (cachedLanguage === currentSettings.language &&
            cachedIncludeOriginal === currentSettings.includeOriginal &&
            cachedSecondaryLanguage === currentSettings.secondaryLanguage) {
            console.log('[Content] Settings unchanged, no refresh needed');
            sendResponse({ success: true, unchanged: true });
            return;
          }

          // Settings changed - delete translation
          console.log('[Content] Settings changed, deleting translation...');
          return window.databaseManager.deleteTranslation(videoId)
            .then(() => {
              console.log('[Content] Translation cache deleted successfully');

              // Notify carousel directly if it exists
              if (window.ycChordCarousel && typeof window.ycChordCarousel._handleTranslationRefresh === 'function') {
                console.log('[Content] Calling carousel._handleTranslationRefresh directly');
                window.ycChordCarousel._handleTranslationRefresh({ detail: { videoId } });
              } else {
                console.log('[Content] Carousel not available or method not found');
              }

              // Notify panel directly if it exists
              if (window.ycLyricsChords && typeof window.ycLyricsChords.handleTranslationRefresh === 'function') {
                console.log('[Content] Calling panel.handleTranslationRefresh directly');
                window.ycLyricsChords.handleTranslationRefresh(videoId);
              } else {
                console.log('[Content] Panel not available or method not found');
              }

              // Notify subtitles directly if visible
              if (window.ycSubtitles && typeof window.ycSubtitles.handleTranslationRefresh === 'function') {
                console.log('[Content] Calling subtitles.handleTranslationRefresh directly');
                window.ycSubtitles.handleTranslationRefresh(videoId);
              } else {
                console.log('[Content] Subtitles not available or method not found');
              }

              sendResponse({ success: true, unchanged: false });
            });
        })
        .catch((error) => {
          console.error('[Content] Error refreshing translation:', error);
          sendResponse({ success: false, error: error.message });
        });

      // Return true to indicate async response
      return true;
    }

    // Built-in about-song prompt refresh from popup
    if (message.action === 'refreshAboutSongPrompt') {
      const videoId = message.videoId;
      const promptId = message.promptId || 'about-song';

      console.log('[Content] Received refreshAboutSongPrompt request for video:', videoId, 'prompt:', promptId);

      if (!window.databaseManager || typeof window.databaseManager.deleteCustomPromptResponse !== 'function') {
        console.error('[Content] databaseManager.deleteCustomPromptResponse not available');
        sendResponse({ success: false, error: 'databaseManager not available' });
        return true;
      }

      window.databaseManager.deleteCustomPromptResponse(videoId, promptId)
        .then(async (deleteResult) => {
          const selectedResult = await chrome.storage.local.get(['selectedCustomPromptId']);
          const selectedCustomPromptId = selectedResult.selectedCustomPromptId || null;
          const shouldRegenerateNow = selectedCustomPromptId === promptId;

          if (!shouldRegenerateNow) {
            console.log('[Content] About prompt not selected - cache cleared only');
            sendResponse({
              success: true,
              deleted: !!deleteResult?.deleted,
              regenerated: false,
              reason: 'prompt_not_selected'
            });
            return;
          }

          if (!window.youtubeSubtitles || typeof window.youtubeSubtitles.fetchAndSaveYouTubeSubtitles !== 'function') {
            console.warn('[Content] youtubeSubtitles.fetchAndSaveYouTubeSubtitles not available');
            sendResponse({
              success: true,
              deleted: !!deleteResult?.deleted,
              regenerated: false,
              reason: 'fetcher_missing'
            });
            return;
          }

          const video = document.querySelector('video.html5-main-video');
          const durationMinutes = video?.duration ? video.duration / 60 : 3;

          if (window.extractorModule?.createSubtitlesProgressBar) {
            window.extractorModule.createSubtitlesProgressBar(durationMinutes);
          }

          try {
            await window.youtubeSubtitles.fetchAndSaveYouTubeSubtitles(videoId);

            if (window.extractorModule?.completeSubtitlesProgressBar) {
              window.extractorModule.completeSubtitlesProgressBar();
            }

            if (window.ycLyricsChords && typeof window.ycLyricsChords.refreshWithNewPrompt === 'function') {
              await window.ycLyricsChords.refreshWithNewPrompt(null, promptId);
            }

            sendResponse({
              success: true,
              deleted: !!deleteResult?.deleted,
              regenerated: true
            });
          } catch (error) {
            if (window.extractorModule?.removeSubtitlesProgressBar) {
              window.extractorModule.removeSubtitlesProgressBar();
            }
            console.error('[Content] Error regenerating about-song prompt:', error);
            sendResponse({ success: false, error: error?.message || 'Failed to regenerate prompt' });
          }
        })
        .catch((error) => {
          console.error('[Content] Error refreshing about-song prompt:', error);
          sendResponse({ success: false, error: error?.message || 'Failed to refresh prompt' });
        });

      return true;
    }

    // 🔐 Auth updated from popup
    if (message.command === 'authUpdated' && message.jwt) {
      console.log('[content.js] Auth updated from popup, storing JWT');
      if (window.__ycSetJwt) {
        window.__ycSetJwt(message.jwt).catch((err) => {
          console.warn('[content.js] Failed to store JWT securely:', err);
        });
      }
      // Reinitialize auth cache
      if (window.ycAuth?.initAuthCache) {
        window.ycAuth.initAuthCache();
      }
      sendResponse({ success: true });
      return true;
    }

    // 🚪 Sign Out - clear localStorage
    if (message.command === 'signOut') {
      console.log('[content.js] Sign out detected - clearing localStorage');
      if (window.__ycSetJwt) {
        window.__ycSetJwt(null).catch((err) => {
          console.warn('[content.js] Failed to clear JWT securely:', err);
        });
      }
      localStorage.removeItem('youchords_user');

      // Clear auth cache in memory (if ycAuth is loaded)
      if (window.ycAuth) {
        window.dispatchEvent(new CustomEvent('ycAuthSignedOut'));
        console.log('[content.js] Dispatched ycAuthSignedOut event');
      }

      sendResponse({ success: true });
      return true;
    }

    // 🗑️ Clear all data (account deleted from website)
    if (message.command === 'clearAllData') {
      console.log('[content.js] Clearing all local data (account deleted)');

      // Clear localStorage
      if (window.__ycSetJwt) {
        window.__ycSetJwt(null).catch((err) => {
          console.warn('[content.js] Failed to clear JWT securely:', err);
        });
      }
      localStorage.removeItem('youchords_user');

      // Clear auth cache in memory (if ycAuth is loaded)
      if (window.ycAuth) {
        // Dispatch event to trigger cache clearing in auth.js
        window.dispatchEvent(new CustomEvent('ycAuthSignOut'));
        console.log('[content.js] Dispatched ycAuthSignOut event');
      }

      // Clear IndexedDB databases (obfuscated names from DB_CONFIG in databaseManager.js)
      const dbNames = [
        'ycdb_4c8d1f6a', // subtitles
        'ycdb_7a3f9e2b', // chords
        'ycdb_9b2e5c7d', // guitar
        'ycdb_1f4a8b3c'  // globalPositions
      ];

      // Close live connections first (if databaseManager is loaded)
      if (window.databaseManager?.disposeAllDatabases) {
        window.databaseManager.disposeAllDatabases();
      }

      dbNames.forEach(dbName => {
        try {
          indexedDB.deleteDatabase(dbName);
          console.log(`[content.js] Deleted IndexedDB: ${dbName}`);
        } catch (e) {
          console.warn(`[content.js] Failed to delete ${dbName}:`, e);
        }
      });

      sendResponse({ success: true });
      return true;
    }

    if (message.command === 'toggleExtension') {
      DEBUG && console.log(`[content.js] Received toggleExtension command, isEnabled: ${message.isEnabled}`);

      try {
        if (message.isEnabled === false) {
          // כיבוי התוסף
          disableExtension();

          // הסרה מיידית של כל האלמנטים החזותיים של התוסף
          setTimeout(() => {
            const controls = $('.ytp-right-controls');
            if (controls) {
              ['chords', 'subtitle', 'customSubtitle', 'subflow', 'settings', 'lyricsChords', 'tuner', 'chordExplorer'].forEach(id => {
                const btn = controls.querySelector(`[data-btn="${id}"]`);
                if (btn) btn.remove();
              });
            }

            // הסרת רק אלמנטים ספציפיים של התוסף - לא [class*="yc-"] כי זה תופס אלמנטים של YouTube
            document.querySelectorAll('#yc-chords-container, .yc-chord-element, .yc-chord-overlay, .yc-subtitle-element, .yc-subtitle-overlay, .yc-subflow-panel, .yc-error-overlay, .yc-debug-overlay, .yc-chord-carousel, .chords-backdrop, .yt-subtitle-overlay, .subtitle-settings-menu, .settings-menu-container').forEach(el => el.remove());
          }, 100);
        } else if (window.extensionDisabled) {
          // הפעלה מחדש אם היה מושבת - עם איפוס מלא של המצב
          DEBUG && console.log('[content.js] Re-enabling extension with full state reset');

          // איפוס מלא של כל המשתנים הגלובליים
          resetGlobalState();
          resetSubtitleDOM();

          // איפוס נוסף של משתנים גלובליים
          chordsActive = false;
          window.chordsActive = false;
          subsActive = false;

          // סימון שהתוסף פעיל
          window.extensionDisabled = false;

          // הפעלה מחדש עם delay
          setTimeout(() => {
            init();
          }, 200); // delay קצר לוודא שהכל התנקה
        }

        sendResponse({ success: true });
      } catch (error) {
        console.error('[content.js] Error in toggleExtension handler:', error);
        sendResponse({ success: false, error: error.message });
      }
    }

    // 🆕 Prompt changed from popup - refresh panel if open
    if (message.command === 'promptChanged') {
      console.log('[content.js] 📥 Received promptChanged:', {
        showDefault: message.showDefault,
        showTranslation: message.showTranslation,
        selectedCustomPromptId: message.selectedCustomPromptId
      });

      // 🎯 Handle panel refresh
      const panel = document.querySelector('.yt-lyrics-chords-panel');
      if (panel && panel.style.display !== 'none') {
        console.log('[content.js] 🎯 Panel is open - handling prompt change...');

        if (window.ycLyricsChords?.refreshWithNewPrompt) {
          // Pass both showTranslation and selectedCustomPromptId
          window.ycLyricsChords.refreshWithNewPrompt(message.showTranslation, message.selectedCustomPromptId);
        } else {
          console.warn('[content.js] ⚠️ Panel refresh function not available');
        }
      }

      // 🆕 Handle carousel refresh
      const carousel = document.querySelector('.yc-chord-carousel');
      if (carousel && carousel.style.display !== 'none') {
        console.log('[content.js] 🎯 Carousel is open - handling prompt change...');

        // Always call refreshWithNewPrompt - let carousel decide what to do
        if (window.ycChordCarousel?.refreshWithNewPrompt) {
          window.ycChordCarousel.refreshWithNewPrompt(message.showTranslation, message.showDefault);
        } else {
          console.warn('[content.js] ⚠️ Carousel refresh function not available');
        }
      }

      // 🆕 Handle subtitles refresh
      if (window.subtitleState?.isVisible) {
        console.log('[content.js] 🎯 Subtitles are visible - handling prompt change...');

        // Refresh subtitles with new prompt (supports DEFAULT, TRANSLATION, and CUSTOM)
        if (window.ycSubtitles?.refreshWithNewPrompt) {
          window.ycSubtitles.refreshWithNewPrompt(message.showTranslation, message.selectedCustomPromptId);
        } else {
          console.warn('[content.js] ⚠️ Subtitles refresh function not available');
        }
      }

      sendResponse({ success: true });
      return true;
    }

    return true;
  };

  if (window.__ycMainOnMessageHandler) {
    try {
      chrome.runtime.onMessage.removeListener(window.__ycMainOnMessageHandler);
    } catch (e) {
      console.warn('[content.js] Failed to remove previous runtime message listener:', e);
    }
  }
  window.__ycMainOnMessageHandler = handleRuntimeMessage;
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  /*───────────────────────────────────────────────────────────────────────────┐
  │ 10. הפעלה אוטומטית                                                       │
  └───────────────────────────────────────────────────────────────────────────*/
  // Check if there's a pending IndexedDB clear (account was deleted while YouTube wasn't open)
  chrome.storage.local.get(['pendingIndexedDBClear'], function (result) {
    if (result.pendingIndexedDBClear) {
      console.log('[content.js] Pending IndexedDB clear detected, clearing now...');

      // Clear IndexedDB databases (obfuscated names from DB_CONFIG in databaseManager.js)
      const dbNames = [
        'ycdb_4c8d1f6a', // subtitles
        'ycdb_7a3f9e2b', // chords
        'ycdb_9b2e5c7d', // guitar
        'ycdb_1f4a8b3c'  // globalPositions
      ];

      // Close live connections first (if databaseManager is loaded)
      if (window.databaseManager?.disposeAllDatabases) {
        window.databaseManager.disposeAllDatabases();
      }

      dbNames.forEach(dbName => {
        try {
          indexedDB.deleteDatabase(dbName);
          console.log(`[content.js] Deleted IndexedDB: ${dbName}`);
        } catch (e) {
          console.warn(`[content.js] Failed to delete ${dbName}:`, e);
        }
      });

      // Clear localStorage
      if (window.__ycSetJwt) {
        window.__ycSetJwt(null).catch((err) => {
          console.warn('[content.js] Failed to clear JWT securely:', err);
        });
      }
      localStorage.removeItem('youchords_user');

      // Remove the flag
      chrome.storage.local.remove(['pendingIndexedDBClear']);
      console.log('[content.js] Pending IndexedDB clear completed');
    }
  });

  // בדיקה אם התוסף מושבת לפני הפעלה
  chrome.storage.sync.get(['extensionEnabled', 'harmonyMapEnabled'], function (result) {
    const isEnabled = result.extensionEnabled !== false; // ברירת מחדל היא true

    if (!isEnabled) {
      DEBUG && console.log('[content.js] Extension is disabled in storage, not initializing');
      window.extensionDisabled = true;
      return;
    }

    if (result.harmonyMapEnabled === true) {
      applyHarmonyMapPreference(true);
    }

    // 🔄 Prime secure JWT cache from chrome.storage and remove legacy localStorage token
    chrome.storage.local.get([YC_JWT_KEY], function (storageResult) {
      setYcJwtCache(storageResult[YC_JWT_KEY] || null);
      if (localStorage.getItem(YC_JWT_KEY)) {
        localStorage.removeItem(YC_JWT_KEY);
      }
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true, passive: true });
    } else {
      init();
    }
  });

  /*───────────────────────────────────────────────────────────────────────────┐
  │ Grace Period Check - Delete DB after 24 hours                             │
  └───────────────────────────────────────────────────────────────────────────*/
  // Check on load
  (async () => {
    // Wait for databaseManager to load
    if (window.databaseManager?.checkAndDeleteExpiredData) {
      await window.databaseManager.checkAndDeleteExpiredData();
    } else {
      // Retry after 1 second if not loaded yet
      setTimeout(async () => {
        if (window.databaseManager?.checkAndDeleteExpiredData) {
          await window.databaseManager.checkAndDeleteExpiredData();
        }
      }, 1000);
    }
  })();

  // == שיפורים נוספים למניעת דליפות זיכרון ==

  // פונקציה למניטור זיכרון (אופציונלית)
  function monitorMemoryUsage() {
    if (!DEBUG || !performance?.memory) return;

    const memUsed = Math.round(performance.memory.usedJSHeapSize / 1e6);
    const memLimit = Math.round(performance.memory.jsHeapSizeLimit / 1e6);
    const percentage = Math.round((memUsed / memLimit) * 100);

    console.log(`[Memory Monitor] Used: ${memUsed}MB / ${memLimit}MB (${percentage}%)`);

    // התראה אם הזיכרון מעל 80%
    if (percentage > 80) {
      console.warn(`[Memory Warning] High memory usage: ${percentage}%`);

      // הצעה לניקוי אוטומטי
      if (percentage > 90) {
        console.error(`[Memory Critical] Very high memory usage: ${percentage}% - suggesting cleanup`);

        // הצגת התראה למשתמש (אופציונלי)
        if (window.ycUtils?.showErrorOverlay) {
          window.ycUtils.showErrorOverlay('High memory usage detected. Consider refreshing the page.', 10000);
        }
      }
    }
  }

  // פונקציה לניקוי תקופתי (מומלץ להפעיל כל כמה דקות)
  function periodicCleanup() {
    // בדיקה אם האקורדים או הכתוביות פעילים
    const chordsOrSubsActive = window.chordsActive || subsActive;

    // ניקוי מטמון אקורדים רק אם האקורדים פעילים
    if (window.chordsActive && window.chordRenderer?.clearUnusedCache) {
      window.chordRenderer.clearUnusedCache();
      DEBUG && console.log('[periodicCleanup] Cleaned chord cache');
    }

    // ניקוי מטמון כתוביות רק אם הכתוביות פעילות
    if (subsActive && window.subtitleState?.cleanCache) {
      window.subtitleState.cleanCache();
      DEBUG && console.log('[periodicCleanup] Cleaned subtitle cache');
    }

    // ניקוי connections ישנים רק אם אחת מהתכונות פעילה
    if (chordsOrSubsActive && window.databaseManager?.closeIdleConnections) {
      window.databaseManager.closeIdleConnections();
    }

    // 🔥 MEMORY FIX: ניקוי תקופתי של Lyrics & Chords אם פעיל
    if (window.lyricsChordsPanelActive && typeof window.cleanupLyricsChordsPanel === 'function') {
      try {
        // ניקוי קל של cache וtooltips
        if (typeof cleanupChordTooltip === 'function') {
          cleanupChordTooltip();
        }
        if (typeof cachedWordElements !== 'undefined' && cachedWordElements && cachedWordElements.length > 1000) {
          cachedWordElements = null; // ניקוי cache גדול
        }
        DEBUG && console.log('[🔥 periodicCleanup] Cleaned Lyrics & Chords cache');
      } catch (error) {
        console.warn('[🔥 periodicCleanup] Error cleaning Lyrics & Chords:', error);
      }
    }

    // ניקוי אלמנטי DOM יתומים
    const orphanElements = document.querySelectorAll('[class*="yc-"]:not([data-active])');
    orphanElements.forEach(el => {
      if (!el.isConnected || !el.closest('#movie_player')) {
        try {
          el.remove();
        } catch (e) { /* ignore */ }
      }
    });

    // אם שום דבר לא פעיל, עצור את הניקוי התקופתי
    if (!chordsOrSubsActive && window.periodicCleanupId) {
      clearInterval(window.periodicCleanupId);
      bin.timers.delete(window.periodicCleanupId);
      window.periodicCleanupId = null;
      DEBUG && console.log('[periodicCleanup] Stopped periodic cleanup - no active features');
    }

    if (DEBUG) {
      monitorMemoryUsage();
      console.log('[Periodic Cleanup] Completed cleanup cycle');
    }
  }

  // הניקוי התקופתי יופעל רק כשהאקורדים או הכתוביות יופעלו
  // לא צריך להפעיל אותו באתחול
  window.monitorMemoryUsage = monitorMemoryUsage;
  window.periodicCleanup = periodicCleanup;
  // DEBUG – expose for manual testing
  window.fullCleanup = fullCleanup;
  window.resetGlobalState = resetGlobalState;
})();


// Image Guide Lightbox functionality
function releaseLightboxMedia(lightbox) {
  const video = lightbox?.querySelector?.('video');
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}

function removeExistingLightbox() {
  const existing = document.querySelector('.yc-lightbox');
  if (existing) {
    existing.__ycLightboxCleanup?.();
    releaseLightboxMedia(existing);
    existing.remove();
  }
}

function createImageLightbox() {
  // Remove existing lightbox if any
  removeExistingLightbox();

  // Create lightbox
  const lightbox = document.createElement('div');
  lightbox.className = 'yc-lightbox';
  lightbox.innerHTML = `
    <div class="yc-lightbox-content">
      <button class="yc-lightbox-close">×</button>
      <img src="${chrome.runtime.getURL('images/how_to_sign_in.png')}" alt="How to Sign In Guide" class="yc-lightbox-image">
    </div>
  `;

  // Add to body
  document.body.appendChild(lightbox);

  // Show lightbox
  setTimeout(() => lightbox.classList.add('active'), 10);

  // Event handlers with proper cleanup
  const closeBtn = lightbox.querySelector('.yc-lightbox-close');

  const handleClose = () => closeLightbox(lightbox, handleBackgroundClick, handleEscKey);
  const handleBackgroundClick = (e) => {
    if (e.target === lightbox) closeLightbox(lightbox, handleBackgroundClick, handleEscKey);
  };
  const handleEscKey = (e) => {
    if (e.key === 'Escape') closeLightbox(lightbox, handleBackgroundClick, handleEscKey);
  };
  lightbox.__ycLightboxCleanup = () => {
    closeBtn.removeEventListener('click', handleClose);
    lightbox.removeEventListener('click', handleBackgroundClick);
    document.removeEventListener('keydown', handleEscKey);
  };

  // Attach listeners
  closeBtn.addEventListener('click', handleClose);
  lightbox.addEventListener('click', handleBackgroundClick);
  document.addEventListener('keydown', handleEscKey);
}

function closeLightbox(lightbox, backgroundClickHandler, escKeyHandler) {
  releaseLightboxMedia(lightbox);

  // Remove event listeners to prevent memory leaks
  lightbox.__ycLightboxCleanup?.();
  lightbox.__ycLightboxCleanup = null;
  if (backgroundClickHandler) {
    lightbox.removeEventListener('click', backgroundClickHandler);
  }
  if (escKeyHandler) {
    document.removeEventListener('keydown', escKeyHandler);
  }

  // Close animation and remove
  lightbox.classList.remove('active');
  setTimeout(() => lightbox.remove(), 200);
}

function createVideoLightbox() {
  removeExistingLightbox();

  const lightbox = document.createElement('div');
  lightbox.className = 'yc-lightbox';
  lightbox.innerHTML = `
    <div class="yc-lightbox-content">
      <button class="yc-lightbox-close">×</button>
      <video
        src="${chrome.runtime.getURL('videos/signin_tutorial.mp4')}"
        class="yc-lightbox-video"
        controls
        autoplay
        muted
        playsinline
        preload="metadata"
      ></video>
    </div>
  `;

  document.body.appendChild(lightbox);
  setTimeout(() => lightbox.classList.add('active'), 10);

  const closeBtn = lightbox.querySelector('.yc-lightbox-close');
  const video = lightbox.querySelector('video');

  const handleClose = () => closeLightbox(lightbox, handleBackgroundClick, handleEscKey);
  const handleBackgroundClick = (e) => {
    if (e.target === lightbox) closeLightbox(lightbox, handleBackgroundClick, handleEscKey);
  };
  const handleEscKey = (e) => {
    if (e.key === 'Escape') closeLightbox(lightbox, handleBackgroundClick, handleEscKey);
  };

  lightbox.__ycLightboxCleanup = () => {
    closeBtn.removeEventListener('click', handleClose);
    lightbox.removeEventListener('click', handleBackgroundClick);
    document.removeEventListener('keydown', handleEscKey);
  };

  closeBtn.addEventListener('click', handleClose);
  lightbox.addEventListener('click', handleBackgroundClick);
  document.addEventListener('keydown', handleEscKey);
  video?.play?.().catch(() => {});
}

// Add event listeners for image guide buttons
function addImageGuideListeners() {
  if (window.__ycImageGuideListenersBound) return;
  window.__ycImageGuideListenersBound = true;

  document.addEventListener('click', (e) => {
    const imageGuideButton = e.target.closest?.('.yc-image-guide-btn');
    if (imageGuideButton) {
      e.preventDefault();
      e.stopPropagation();
      createImageLightbox();
    }
  });
}

function addVideoTutorialListeners() {
  if (window.__ycVideoTutorialListenersBound) return;
  window.__ycVideoTutorialListenersBound = true;

  document.addEventListener('click', (e) => {
    const videoTutorialLink = e.target.closest?.('.yc-video-tutorial-link');
    if (videoTutorialLink) {
      e.preventDefault();
      e.stopPropagation();
      createVideoLightbox();
    }
  });
}

// Initialize image guide listeners
addImageGuideListeners();
addVideoTutorialListeners();


