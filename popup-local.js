import { localProcessingClient } from './utils/localProcessingClient.js';
import {
  getLocalApiBase,
  getPreferredLocalProcessor,
  LOCAL_PROCESSORS,
  setPreferredLocalProcessor
} from './utils/localProcessorConfig.js';

const START_COMMAND = 'powershell -ExecutionPolicy Bypass -File .\\scripts\\start_youchords_local.ps1';
const COLLAPSED_KEY = 'geminiApiSectionCollapsed';
const VALID_MODES = new Set(['off', 'auto', 'always']);
const MODE_DESCRIPTIONS = Object.freeze({
  off: 'Gemini runs only after you enable it again.',
  auto: 'Use Gemini only when usable YouTube captions are unavailable.',
  always: 'Prefer Gemini for subtitles and optionally fall back to YouTube captions.'
});
const FREE_GEMINI_MODELS = Object.freeze([
  ['gemini-3.8-flash', 'Gemini 3.8 Flash'],
  ['gemini-3.7-flash', 'Gemini 3.7 Flash'],
  ['gemini-3.6-flash', 'Gemini 3.6 Flash'],
  ['gemini-3.5-flash', 'Gemini 3.5 Flash'],
  ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite'],
  ['gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite'],
  ['gemini-3-flash-preview', 'Gemini 3 Flash Preview']
]);

const elements = {
  statusDot: document.getElementById('statusDot'),
  engineHeading: document.getElementById('engineHeading'),
  statusDetail: document.getElementById('statusDetail'),
  engineDetails: document.getElementById('engineDetails'),
  startHelp: document.getElementById('startHelp'),
  startHelpMessage: document.getElementById('startHelpMessage'),
  processorSelect: document.getElementById('processorSelect'),
  ytDlpUpdates: document.getElementById('ytDlpUpdates'),
  refreshStatus: document.getElementById('refreshStatus'),
  copyCommand: document.getElementById('copyCommand'),
  apiKeySection: document.getElementById('apiKeySection'),
  apiStatus: document.getElementById('apiStatus'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  apiKeyNameInput: document.getElementById('apiKeyNameInput'),
  geminiKeysList: document.getElementById('geminiKeysList'),
  toggleApiKey: document.getElementById('toggleApiKeyBtn'),
  saveApiKey: document.getElementById('saveApiKeyBtn'),
  clearApiKey: document.getElementById('clearApiKeyBtn'),
  apiMessage: document.getElementById('apiMessage'),
  apiSectionToggle: document.getElementById('apiSectionToggleBtn'),
  apiSectionArrow: document.getElementById('apiSectionToggleArrow'),
  modeDescription: document.getElementById('modeDescription'),
  modeButtons: Array.from(document.querySelectorAll('.local-mode-button')),
  promptDisclaimer: document.getElementById('promptDisclaimerCheckbox'),
  youtubeFallbackRow: document.getElementById('youtubeFallbackRow'),
  youtubeFallback: document.getElementById('youtubeFallbackCheckbox'),
  helpButton: document.getElementById('helpBtn'),
  helpPanel: document.getElementById('helpPanel'),
  helpClose: document.getElementById('helpCloseBtn'),
  version: document.getElementById('extensionVersion'),
  wordTranslationEnabled: document.getElementById('wordTranslationEnabled'),
  wordTranslationLanguage: document.getElementById('wordTranslationLanguage'),
  wordTranslationModel: document.getElementById('wordTranslationModel'),
  harmonyMapEnabled: document.getElementById('harmonyMapEnabled')
};

let hasApiKey = false;
let currentMode = 'off';
let selectedProcessor = 'docker';

function setEngineState(state, title, description) {
  elements.statusDot.className = `local-status-dot ${state}`;
  elements.engineHeading.textContent = title;
  elements.statusDetail.textContent = description;
}

async function refreshHealth() {
  elements.refreshStatus.disabled = true;
  const processor = LOCAL_PROCESSORS[selectedProcessor];
  setEngineState('checking', `Checking ${processor.label}...`, 'Connecting on this computer');
  elements.engineDetails.hidden = true;
  elements.startHelp.hidden = true;
  elements.copyCommand.hidden = selectedProcessor !== 'docker';

  try {
    const health = await localProcessingClient.getHealth();
    if (health.success) {
      setEngineState(
        'ready',
        'Local engine is ready',
        health.activeJobs > 0
          ? `${health.activeJobs} video${health.activeJobs === 1 ? '' : 's'} processing now`
          : 'Ready to process any YouTube video'
      );
      elements.engineDetails.hidden = false;
    } else {
      setEngineState('offline', `${processor.label} processor is not running`, 'Start the selected local processor, then check again');
      elements.startHelpMessage.textContent = selectedProcessor === 'docker'
        ? 'Start the Docker processor from the repository.'
        : 'Start the YouChords Windows processor from the Start menu.';
      elements.startHelp.hidden = false;
    }
  } finally {
    elements.refreshStatus.disabled = false;
  }
}

async function fetchUpdateStatus(processorId) {
  const apiBase = await getLocalApiBase(processorId);
  const response = await fetch(`${apiBase}/updates/yt-dlp`);
  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    payload = null;
  }
  if (!response.ok || !payload?.success || !payload.update) {
    throw new Error(payload?.error || `Update status unavailable (${response.status})`);
  }
  return payload.update;
}

async function installYtDlpUpdate(processorId, button) {
  button.disabled = true;
  button.textContent = 'Installing update...';
  try {
    const apiBase = await getLocalApiBase(processorId);
    const response = await fetch(`${apiBase}/updates/yt-dlp/install`, { method: 'POST' });
    let payload = null;
    try {
      payload = await response.json();
    } catch (_) {
      payload = null;
    }
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || `Update failed (${response.status})`);
    }
    await refreshUpdateCards();
  } catch (error) {
    button.disabled = false;
    const card = button.closest('.local-yt-dlp-update');
    card?.classList.add('error');
    let detail = card?.querySelector('.local-update-error');
    if (card && !detail) {
      detail = document.createElement('div');
      detail.className = 'local-update-error';
      card.insertBefore(detail, button);
    }
    if (detail) detail.textContent = error.message || 'Could not install update';
    button.textContent = 'Try again';
  }
}

async function refreshUpdateCards() {
  elements.ytDlpUpdates.replaceChildren();
  const updates = await Promise.all(Object.keys(LOCAL_PROCESSORS).map(async (processorId) => {
    try {
      return { processorId, status: await fetchUpdateStatus(processorId) };
    } catch (_) {
      return null;
    }
  }));

  let updateAvailable = false;
  for (const entry of updates) {
    if (!entry) continue;
    const { processorId, status } = entry;
    const processor = LOCAL_PROCESSORS[processorId];
    if (!status.updateAvailable && !status.installing) continue;
    updateAvailable ||= status.updateAvailable;

    const card = document.createElement('div');
    card.className = 'local-yt-dlp-update';
    const message = document.createElement('div');
    message.textContent = status.installing
      ? `Installing yt-dlp update for ${processor.label}...`
      : `yt-dlp update available for ${processor.label}: ${status.currentVersion} → ${status.latestVersion}`;
    card.append(message);

    if (status.updateAvailable && !status.installing) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `Approve & install on ${processor.label}`;
      button.addEventListener('click', () => installYtDlpUpdate(processorId, button));
      card.append(button);
    }
    elements.ytDlpUpdates.append(card);
  }

  try {
    await chrome.runtime.sendMessage({ action: 'localUpdateStatus', updateAvailable });
  } catch (_) {
    // The badge is a convenience; the update card remains available here.
  }
}

function setApiStatus(status, text) {
  elements.apiStatus.className = `api-status ${status}`;
  const label = elements.apiStatus.querySelector('span:last-child');
  if (label) label.textContent = text;
}

function showApiMessage(message = '', type = '') {
  elements.apiMessage.textContent = message;
  elements.apiMessage.className = `local-api-message${type ? ` ${type}` : ''}`;
}

function normalizeMode(mode) {
  return VALID_MODES.has(mode) ? mode : 'off';
}

function renderMode(mode = currentMode) {
  currentMode = normalizeMode(mode);
  const consentAccepted = elements.promptDisclaimer.checked;

  for (const button of elements.modeButtons) {
    const buttonMode = button.dataset.mode;
    const active = buttonMode === currentMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
    button.disabled = buttonMode !== 'off' && (!hasApiKey || !consentAccepted);
  }

  elements.modeDescription.textContent = MODE_DESCRIPTIONS[currentMode];
  elements.youtubeFallbackRow.hidden = currentMode !== 'always';
}

function setApiCollapsed(collapsed) {
  elements.apiKeySection.classList.toggle('api-section-collapsed', collapsed);
  elements.apiSectionToggle.setAttribute('aria-expanded', String(!collapsed));
  elements.apiSectionToggle.setAttribute(
    'aria-label',
    collapsed ? 'Expand Gemini settings' : 'Minimize Gemini settings'
  );
  elements.apiSectionToggle.title = collapsed ? 'Expand Gemini settings' : 'Minimize Gemini settings';
  elements.apiSectionArrow.innerHTML = collapsed ? '&#9656;' : '&#9662;';
}

async function validateApiKey(apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    { method: 'GET', cache: 'no-store' }
  );

  if (response.ok) return { valid: true };

  let message = 'Google rejected this API key.';
  try {
    const payload = await response.json();
    message = payload?.error?.message || message;
  } catch (_) {
    // Keep the concise fallback message when Google does not return JSON.
  }
  return { valid: false, message };
}

async function savePrimaryApiKey(apiKey, name) {
  const result = await chrome.storage.local.get(['geminiApiKeys']);
  const keys = Array.isArray(result.geminiApiKeys) ? [...result.geminiApiKeys] : [];
  const existing = keys.find((entry) => entry?.key === apiKey);
  if (existing) throw new Error('This API key is already saved.');
  const id = `key-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const primary = {
    id,
    name: name || `Gemini key ${keys.length + 1}`,
    key: apiKey,
    active: true,
    status: 'active',
    lastError: null,
    createdAt: Date.now()
  };
  keys.push(primary);

  await chrome.storage.local.set({
    geminiApiKey: result.geminiApiKey || apiKey,
    geminiApiKeys: keys,
    geminiApiKeyStatus: 'active',
    geminiApiKeyValidatedAt: Date.now()
  });
}

async function handleSaveApiKey() {
  const apiKey = elements.apiKeyInput.value.trim();
  if (!apiKey) {
    showApiMessage('Enter a Gemini API key first.', 'error');
    return;
  }

  elements.saveApiKey.disabled = true;
  elements.saveApiKey.textContent = 'Testing...';
  setApiStatus('testing', 'Testing');
  showApiMessage('Checking the key with Google...');

  try {
    const validation = await validateApiKey(apiKey);
    if (!validation.valid) {
      setApiStatus('invalid', 'Invalid');
      showApiMessage(validation.message, 'error');
      await renderGeminiApiKeys();
      renderMode();
      return;
    }

    await savePrimaryApiKey(apiKey, elements.apiKeyNameInput.value.trim());
    hasApiKey = true;
    elements.apiKeyInput.value = '';
    elements.apiKeyNameInput.value = '';
    elements.apiKeyInput.classList.remove('has-value');
    elements.saveApiKey.disabled = true;
    await renderGeminiApiKeys();
    setApiStatus('active', 'Active');

    if (elements.promptDisclaimer.checked && currentMode === 'off') {
      currentMode = 'auto';
      await chrome.storage.local.set({ aiTranscriptionMode: currentMode });
      showApiMessage('Key saved. Gemini is set to Auto.', 'success');
    } else if (!elements.promptDisclaimer.checked) {
      showApiMessage('Key saved. Accept the notice below to enable Gemini.', 'success');
    } else {
      showApiMessage('Gemini API key saved.', 'success');
    }
    renderMode();
  } catch (error) {
    setApiStatus('invalid', 'Error');
    showApiMessage(error?.message || 'Could not validate the API key.', 'error');
    await renderGeminiApiKeys();
    renderMode();
  } finally {
    elements.saveApiKey.textContent = 'Test & add key';
    elements.saveApiKey.disabled = elements.apiKeyInput.value.trim().length === 0;
  }
}

async function handleClearApiKey() {
  if (!window.confirm('Remove all saved Gemini API keys?')) return;
  await chrome.storage.local.remove([
    'geminiApiKey',
    'geminiApiKeys',
    'geminiApiKeyStatus',
    'geminiApiKeyValidatedAt',
    'lastUsedKeyIndex'
  ]);
  await chrome.storage.local.set({ aiTranscriptionMode: 'off' });
  elements.apiKeyInput.value = '';
  elements.apiKeyInput.classList.remove('has-value');
  elements.saveApiKey.disabled = true;
  hasApiKey = false;
  currentMode = 'off';
  setApiStatus('not-set', 'Not set');
  showApiMessage('Gemini API key removed.', 'success');
  await renderGeminiApiKeys();
  renderMode();
}

async function loadGeminiSettings() {
  const settings = await chrome.storage.local.get([
    'geminiApiKey',
    'geminiApiKeys',
    'geminiApiKeyStatus',
    'aiTranscriptionMode',
    'promptDisclaimerAccepted',
    'alwaysAllowYoutubeFallback',
    COLLAPSED_KEY,
    'highlightGeminiInput',
    'highlightPromptDisclaimer'
  ]);

  const apiKey = typeof settings.geminiApiKey === 'string' ? settings.geminiApiKey.trim() : '';

  hasApiKey = Boolean(apiKey);
  elements.apiKeyInput.value = '';
  elements.apiKeyInput.classList.remove('has-value');
  elements.saveApiKey.disabled = true;
  await renderGeminiApiKeys(settings);
  elements.promptDisclaimer.checked = settings.promptDisclaimerAccepted === true;
  elements.youtubeFallback.checked = settings.alwaysAllowYoutubeFallback !== false;
  currentMode = normalizeMode(settings.aiTranscriptionMode);

  if (!hasApiKey && currentMode !== 'off') {
    currentMode = 'off';
    await chrome.storage.local.set({ aiTranscriptionMode: 'off' });
  }

  setApiStatus(
    hasApiKey && settings.geminiApiKeyStatus !== 'invalid' ? 'active' : 'not-set',
    hasApiKey ? 'Active' : 'Not set'
  );
  setApiCollapsed(settings[COLLAPSED_KEY] === true);
  renderMode();

  if (settings.highlightGeminiInput || settings.highlightPromptDisclaimer) {
    setApiCollapsed(false);
    await chrome.storage.local.set({ [COLLAPSED_KEY]: false });
    if (settings.highlightGeminiInput) {
      elements.apiKeyInput.classList.add('shake-highlight');
      elements.apiKeyInput.focus();
      setTimeout(() => elements.apiKeyInput.classList.remove('shake-highlight'), 1200);
    } else {
      elements.promptDisclaimer.focus();
    }
    await chrome.storage.local.remove(['highlightGeminiInput', 'highlightPromptDisclaimer']);
  }
}

async function loadWordTranslationSettings() {
  for (const [value, label] of FREE_GEMINI_MODELS) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    elements.wordTranslationModel.append(option);
  }
  const settings = await chrome.storage.local.get([
    'wordTranslationEnabled', 'wordTranslationLanguages', 'geminiGlobalModel'
  ]);
  elements.wordTranslationEnabled.checked = settings.wordTranslationEnabled === true;
  elements.wordTranslationLanguage.value = ['he', 'en', 'both'].includes(settings.wordTranslationLanguages)
    ? settings.wordTranslationLanguages : 'he';
  elements.wordTranslationModel.value = FREE_GEMINI_MODELS.some(([value]) => value === settings.geminiGlobalModel)
    ? settings.geminiGlobalModel : 'gemini-3.8-flash';

  elements.wordTranslationEnabled.addEventListener('change', () => {
    chrome.storage.local.set({ wordTranslationEnabled: elements.wordTranslationEnabled.checked });
  });
  elements.wordTranslationLanguage.addEventListener('change', () => {
    chrome.storage.local.set({ wordTranslationLanguages: elements.wordTranslationLanguage.value });
  });
  elements.wordTranslationModel.addEventListener('change', () => {
    chrome.storage.local.set({ geminiGlobalModel: elements.wordTranslationModel.value });
  });
}

async function loadHarmonyMapSetting() {
  const result = await chrome.storage.sync.get(['harmonyMapEnabled']);
  const enabled = result.harmonyMapEnabled === true;
  elements.harmonyMapEnabled.checked = enabled;
  if (result.harmonyMapEnabled === undefined) {
    await chrome.storage.sync.set({ harmonyMapEnabled: enabled });
  }
}

async function renderGeminiApiKeys(prefetched = null) {
  const settings = prefetched || await chrome.storage.local.get(['geminiApiKeys', 'geminiApiKey']);
  let keys = Array.isArray(settings.geminiApiKeys) ? [...settings.geminiApiKeys] : [];
  if (settings.geminiApiKey && !keys.some((entry) => entry?.key === settings.geminiApiKey)) {
    keys.unshift({ id: 'legacy-primary', name: 'Primary key', key: settings.geminiApiKey, active: true, status: 'active' });
  }
  elements.geminiKeysList.replaceChildren();
  keys.forEach((entry) => {
    if (!entry?.key) return;
    const row = document.createElement('div');
    row.className = 'local-gemini-key-row';
    const label = document.createElement('span');
    const key = entry.key;
    label.textContent = `${entry.name || 'Gemini key'} · ••••${key.slice(-4)}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => removeGeminiApiKey(entry.id, key));
    row.append(label, remove);
    elements.geminiKeysList.append(row);
  });
  const active = keys.filter((entry) => entry?.key && entry.active !== false && entry.status !== 'disabled');
  hasApiKey = active.length > 0;
  renderMode();
  setApiStatus(hasApiKey ? 'active' : 'not-set', hasApiKey ? `${active.length} saved` : 'Not set');
}

async function removeGeminiApiKey(id, key) {
  const { geminiApiKeys = [], geminiApiKey: primaryKey } = await chrome.storage.local.get(['geminiApiKeys', 'geminiApiKey']);
  const keys = (Array.isArray(geminiApiKeys) ? geminiApiKeys : []).filter((entry) => entry?.id !== id && entry?.key !== key);
  const nextPrimary = primaryKey === key ? (keys.find((entry) => entry?.active !== false && entry?.status !== 'disabled')?.key || '') : primaryKey;
  const update = { geminiApiKeys: keys };
  if (nextPrimary) update.geminiApiKey = nextPrimary;
  else delete update.geminiApiKey;
  await chrome.storage.local.set(update);
  if (!keys.length && !nextPrimary) {
    await chrome.storage.local.remove(['geminiApiKey', 'geminiApiKeyStatus', 'geminiApiKeyValidatedAt', 'lastUsedKeyIndex']);
    currentMode = 'off';
    await chrome.storage.local.set({ aiTranscriptionMode: 'off' });
  }
  await renderGeminiApiKeys();
  showApiMessage('Gemini API key removed.', 'success');
}

async function selectMode(mode) {
  const nextMode = normalizeMode(mode);
  if (nextMode !== 'off' && !hasApiKey) {
    showApiMessage('Save a valid Gemini API key first.', 'error');
    elements.apiKeyInput.focus();
    return;
  }
  if (nextMode !== 'off' && !elements.promptDisclaimer.checked) {
    showApiMessage('Accept the Gemini notice before enabling this mode.', 'error');
    elements.promptDisclaimer.focus();
    return;
  }

  currentMode = nextMode;
  await chrome.storage.local.set({ aiTranscriptionMode: currentMode });
  showApiMessage(
    currentMode === 'off' ? 'Gemini subtitles are off.' : `Gemini mode changed to ${currentMode}.`,
    'success'
  );
  renderMode();
}

async function copyStartCommand() {
  try {
    await navigator.clipboard.writeText(START_COMMAND);
  } catch (_) {
    const field = document.createElement('textarea');
    field.value = START_COMMAND;
    field.readOnly = true;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    document.execCommand('copy');
    field.remove();
  }
  elements.copyCommand.textContent = 'Copied';
  setTimeout(() => {
    elements.copyCommand.textContent = 'Copy start command';
  }, 1200);
}

async function init() {
  elements.version.textContent = `v${chrome.runtime.getManifest().version}`;
  selectedProcessor = await getPreferredLocalProcessor();
  elements.processorSelect.value = selectedProcessor;
  elements.refreshStatus.addEventListener('click', refreshHealth);
  elements.processorSelect.addEventListener('change', async () => {
    selectedProcessor = await setPreferredLocalProcessor(elements.processorSelect.value);
    await Promise.all([refreshHealth(), refreshUpdateCards()]);
  });
  elements.copyCommand.addEventListener('click', copyStartCommand);
  elements.saveApiKey.addEventListener('click', handleSaveApiKey);
  elements.clearApiKey.addEventListener('click', handleClearApiKey);
  elements.apiKeyInput.addEventListener('input', () => {
    elements.saveApiKey.disabled = elements.apiKeyInput.value.trim().length === 0;
    showApiMessage();
  });
  elements.apiKeyInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !elements.saveApiKey.disabled) {
      handleSaveApiKey();
    }
  });
  elements.toggleApiKey.addEventListener('click', () => {
    const reveal = elements.apiKeyInput.type === 'password';
    elements.apiKeyInput.type = reveal ? 'text' : 'password';
    elements.toggleApiKey.querySelector('.eye-icon').hidden = reveal;
    elements.toggleApiKey.querySelector('.eye-off-icon').hidden = !reveal;
  });
  elements.apiSectionToggle.addEventListener('click', async () => {
    const collapsed = !elements.apiKeySection.classList.contains('api-section-collapsed');
    setApiCollapsed(collapsed);
    await chrome.storage.local.set({ [COLLAPSED_KEY]: collapsed });
  });
  for (const button of elements.modeButtons) {
    button.addEventListener('click', () => selectMode(button.dataset.mode));
  }
  elements.promptDisclaimer.addEventListener('change', async () => {
    await chrome.storage.local.set({ promptDisclaimerAccepted: elements.promptDisclaimer.checked });
    if (!elements.promptDisclaimer.checked && currentMode !== 'off') {
      currentMode = 'off';
      await chrome.storage.local.set({ aiTranscriptionMode: 'off' });
      showApiMessage('Gemini was turned off because the notice is no longer accepted.', 'success');
    }
    renderMode();
  });
  elements.youtubeFallback.addEventListener('change', () => {
    chrome.storage.local.set({ alwaysAllowYoutubeFallback: elements.youtubeFallback.checked });
  });
  elements.harmonyMapEnabled.addEventListener('change', async () => {
    await chrome.storage.sync.set({ harmonyMapEnabled: elements.harmonyMapEnabled.checked });
  });
  elements.helpButton.addEventListener('click', () => {
    elements.helpPanel.hidden = false;
  });
  elements.helpClose.addEventListener('click', () => {
    elements.helpPanel.hidden = true;
  });

  await Promise.all([
    refreshHealth(),
    refreshUpdateCards(),
    loadGeminiSettings(),
    loadWordTranslationSettings(),
    loadHarmonyMapSetting()
  ]);
}

void init();
