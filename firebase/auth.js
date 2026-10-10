import '../utils/productionConsole.js';
import { localProcessingClient } from '../utils/localProcessingClient.js';

const LOCAL_USER = Object.freeze({
  uid: 'youchords-local',
  displayName: 'YouChords Local',
  email: '',
  photoURL: '',
  plan: 'local',
  localOnly: true
});

const LOCAL_PAYLOAD = Object.freeze({
  sub: 'youchords-local',
  plan: 'local',
  localOnly: true,
  chordsUsed: 0,
  chordsLimit: 0,
  processingChordsUsed: 0,
  processingChordsLimit: 0,
  chordsQuotaExhausted: false,
  blocked: false
});

const CLOUD_STORAGE_KEYS = [
  'youchords_jwt',
  'youchords_user',
  'youchords_device_id',
  'youchords_device_fingerprint',
  'youchords_device_proof',
  'youchords_pro_last_refresh',
  'youchords_free_gating_last_refresh',
  'youchords_account_blocked_state',
  'youchords_upgrade_pending',
  'youchords_subscription_state_dirty'
];

let authCacheReadyPromise = null;

function cleanLegacyPopupStorage() {
  try {
    for (const key of CLOUD_STORAGE_KEYS) localStorage.removeItem(key);
  } catch (_) {
    // localStorage is not available in every extension execution context.
  }
}

async function initAuthCache() {
  if (authCacheReadyPromise) return authCacheReadyPromise;
  authCacheReadyPromise = (async () => {
    cleanLegacyPopupStorage();
    await Promise.allSettled([
      chrome.storage.local.remove(CLOUD_STORAGE_KEYS),
      chrome.storage.local.set({
        geminiApiKeyPromptShown: true,
        youchordsLocalOnly: true,
        user: LOCAL_USER
      })
    ]);
    return LOCAL_USER;
  })();
  return authCacheReadyPromise;
}

async function signInWithGoogle() {
  await initAuthCache();
  return { success: true, user: LOCAL_USER, localOnly: true };
}

async function signOutUser() {
  await initAuthCache();
  return { success: true, user: LOCAL_USER, localOnly: true };
}

async function getCurrentUser() {
  await initAuthCache();
  return LOCAL_USER;
}

function getJWTPayload() {
  return LOCAL_PAYLOAD;
}

function checkQuotaLocal(type) {
  if (type !== 'chords' && type !== 'lyrics') {
    return { allowed: false, canAccessCache: false, reason: 'unknown_type' };
  }
  return {
    allowed: true,
    canAccessCache: true,
    plan: 'local',
    localOnly: true,
    unlimited: true,
    reason: null,
    shouldDeleteChordsDB: false
  };
}

function updateLocalProgress(job) {
  const status = String(job?.status || '');
  if (status === 'queued') {
    window.extractorModule?.setChordsQueueHint?.('queued');
    return;
  }
  if (['downloading', 'converting', 'analyzing'].includes(status)) {
    window.extractorModule?.setChordsQueueHint?.(job?.stage || 'processing');
  }
}

async function getChords(videoId, options = {}) {
  if (options.signal?.aborted) {
    return { success: false, aborted: true, error: 'Request aborted' };
  }

  if (options.enqueueIfMissing) {
    const durationSeconds = Number(options.durationSeconds) || window.ytPlayer?.getDuration?.() || 180;
    window.extractorModule?.switchToDockerMode?.('chords', durationSeconds / 60);
  }

  try {
    return await localProcessingClient.getOrProcessChords(videoId, {
      enqueueIfMissing: options.enqueueIfMissing !== false,
      signal: options.signal || null,
      onStatus: updateLocalProgress
    });
  } finally {
    window.extractorModule?.setChordsQueueHint?.(null);
  }
}

async function processVideoViaServer(videoId, durationSeconds = 180, options = {}) {
  return getChords(videoId, {
    ...options,
    durationSeconds,
    enqueueIfMissing: true
  });
}

function getSubscriptionInfo() {
  return {
    plan: 'local',
    localOnly: true,
    unlimited: true,
    chordsUsed: 0,
    chordsLimit: 0,
    chordsQuotaExhausted: false,
    processingChordsUsed: 0,
    processingChordsLimit: 0,
    resetDate: null,
    renewalAt: null,
    cancelPending: false,
    blocked: false,
    deletionPending: false
  };
}

async function ensureFreshSubscriptionForGating() {
  await initAuthCache();
  return { success: true, localOnly: true, subscription: getSubscriptionInfo() };
}

async function checkForProDowngrade() {
  return { changed: false, localOnly: true };
}

function clearAuthCache() {
  authCacheReadyPromise = null;
  return initAuthCache();
}

export {
  signInWithGoogle,
  signOutUser,
  getCurrentUser,
  checkQuotaLocal,
  getChords,
  getSubscriptionInfo,
  getJWTPayload,
  processVideoViaServer,
  ensureFreshSubscriptionForGating
};

window.ycAuth = {
  signInWithGoogle,
  signOutUser,
  getCurrentUser,
  checkQuotaLocal,
  getChords,
  getSubscriptionInfo,
  getJWTPayload,
  processVideoViaServer,
  initAuthCache,
  waitForAuthCache: () => authCacheReadyPromise || initAuthCache(),
  clearAuthCache,
  checkForProDowngrade,
  ensureFreshSubscriptionForGating
};

void initAuthCache();
