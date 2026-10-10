import './utils/productionConsole.js';

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
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup-local.html') });
  }
});

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

  return false;
});
