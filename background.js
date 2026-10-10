import './utils/productionConsole.js';

const LOCAL_PROCESSOR_PORTS = [8765, 8766];
const YTDLP_UPDATE_ALARM = 'youchords-ytdlp-update-status';

const LOCAL_USER = Object.freeze({
  uid: 'youchords-local',
  displayName: 'YouChords Local',
  email: '',
  photoURL: '',
  plan: 'local',
  localOnly: true
});

try {
  chrome.storage.session?.setAccessLevel?.({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
} catch (_) {
  // Older Chromium builds may not expose session access controls.
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.alarms.create(YTDLP_UPDATE_ALARM, { periodInMinutes: 24 * 60 });
  void refreshLocalUpdateBadge();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup-local.html') });
  }
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(YTDLP_UPDATE_ALARM, { periodInMinutes: 24 * 60 });
  void refreshLocalUpdateBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === YTDLP_UPDATE_ALARM) void refreshLocalUpdateBadge();
});

async function refreshLocalUpdateBadge() {
  const statuses = await Promise.all(LOCAL_PROCESSOR_PORTS.map(async (port) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/updates/yt-dlp`);
      if (!response.ok) return false;
      const payload = await response.json();
      return payload?.success === true && payload.update?.updateAvailable === true;
    } catch (_) {
      return false;
    }
  }));
  const updateAvailable = statuses.some(Boolean);
  await chrome.action.setBadgeText({ text: updateAvailable ? 'UPD' : '' });
  if (updateAvailable) await chrome.action.setBadgeBackgroundColor({ color: '#d97706' });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const action = message?.action;

  if (action === 'signIn') {
    sendResponse({ success: true, user: LOCAL_USER, localOnly: true });
    return false;
  }

  if (action === 'openPopup' || action === 'openApiManagement') {
    chrome.action.openPopup()
      .then(() => sendResponse({ success: true, localOnly: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (action === 'ycStatusChange') {
    sendResponse({ success: true, localOnly: true });
    return false;
  }

  if (action === 'localUpdateStatus') {
    const updateAvailable = message?.updateAvailable === true;
    chrome.action.setBadgeText({ text: updateAvailable ? 'UPD' : '' })
      .then(() => updateAvailable
        ? chrome.action.setBadgeBackgroundColor({ color: '#d97706' })
        : undefined)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return false;
});
