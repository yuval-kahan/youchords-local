// AI Transcription Settings Menu
// Manages when and how to use Gemini API for transcription

window.createAITranscriptionSubmenu = function(parentMenu) {
  const submenu = document.createElement('div');
  submenu.className = 'settings-menu ai-transcription-submenu yc';
  submenu.setAttribute('data-yc-menu', 'ai-transcription');
  submenu.style.cssText = `
    position: absolute;
    background: rgba(28, 28, 28, 0.9);
    right: 12px;
    border-radius: 8px;
    padding: 0;
    z-index: 2001;
    width: 320px;
    font-family: Roboto, Arial, sans-serif;
    color: #fff;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    display: none;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
  `;

  // Store cleanup functions
  const cleanupFunctions = [];

  // Prevent menu from closing when clicking inside it
  const menuClickHandler = (e) => {
    e.stopPropagation();
  };
  submenu.addEventListener('click', menuClickHandler);
  cleanupFunctions.push(() => {
    submenu.removeEventListener('click', menuClickHandler);
  });

  // Cleanup function to prevent memory leaks
  submenu.cleanup = function() {
    console.log('[AI Transcription] Cleaning up menu...');
    cleanupFunctions.forEach(fn => fn());
    cleanupFunctions.length = 0;
  };

  // Header with back button
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 12px 24px;
    font-size: 13px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  `;

  const backButton = document.createElement('span');
  backButton.innerHTML = '◄';
  backButton.style.cssText = `
    cursor: pointer;
    margin-right: 12px;
    color: #aaa;
  `;

  const backButtonHandler = (e) => {
    e.stopPropagation();
    e.preventDefault();
    submenu.style.display = 'none';
    // Don't call cleanup() here - menu is just hidden, not destroyed
    // The MutationObserver will handle cleanup only when truly needed
    if (parentMenu) parentMenu.style.display = 'block';
  };
  
  backButton.addEventListener('click', backButtonHandler);
  cleanupFunctions.push(() => {
    backButton.removeEventListener('click', backButtonHandler);
  });

  const headerText = document.createElement('span');
  headerText.textContent = 'AI Transcription';
  headerText.style.fontWeight = '500';

  header.appendChild(backButton);
  header.appendChild(headerText);
  submenu.appendChild(header);

  // Content container
  const content = document.createElement('div');
  content.style.padding = '12px 0';

  // Store references to dynamic UI elements
  let statusIcon, statusText, statusBox, configureButton;
  let alwaysFallbackWrap, alwaysFallbackCheckbox;
  let modeItems = [];
  let modeGuardHint;
  let hasApiKeyState = false;
  let promptDisclaimerAcceptedState = false;
  let alwaysAllowYoutubeFallbackState = true;

  const hasActiveGeminiMultiKey = (keys) => Array.isArray(keys)
    && keys.some((keyData) => keyData && keyData.active !== false && keyData.status !== 'disabled');

  const openApiConfigPopup = () => {
    chrome.storage.local.set({ highlightGeminiInput: true }, () => {
      chrome.runtime.sendMessage({ action: 'openPopup' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[AI Transcription] Error opening popup:', chrome.runtime.lastError);
        } else if (response && response.success) {
          console.log('[AI Transcription] Popup opened, highlight flag set');
        }
      });
    });
  };

  const openPromptResponsibilityPopup = () => {
    chrome.storage.local.set({ highlightPromptDisclaimer: true }, () => {
      chrome.runtime.sendMessage({ action: 'openPopup' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[AI Transcription] Error opening popup:', chrome.runtime.lastError);
        } else if (response && response.success) {
          console.log('[AI Transcription] Popup opened, prompt disclaimer highlighted');
        }
      });
    });
  };

  const showApiKeyRequiredHint = (modeLabel = '') => {
    if (!modeGuardHint) return;

    modeGuardHint.innerHTML = '';
    const text = document.createElement('span');
    text.textContent = modeLabel
      ? `"${modeLabel}" requires a Gemini API key.`
      : 'AI modes require a Gemini API key.';

    const actionBtn = document.createElement('button');
    actionBtn.textContent = 'Configure API Key';
    actionBtn.style.cssText = `
      background: transparent;
      border: none;
      color: #93c5fd;
      text-decoration: underline;
      cursor: pointer;
      font-size: 11px;
      margin-left: 6px;
      padding: 0;
    `;
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      openApiConfigPopup();
    });

    modeGuardHint.appendChild(text);
    modeGuardHint.appendChild(actionBtn);
    modeGuardHint.style.display = 'block';
  };

  const showPromptResponsibilityRequiredHint = (modeLabel = '') => {
    if (!modeGuardHint) return;

    modeGuardHint.innerHTML = '';
    const text = document.createElement('span');
    text.textContent = modeLabel
      ? `"${modeLabel}" requires prompt responsibility approval first.`
      : 'Gemini requires prompt responsibility approval first.';

    const actionBtn = document.createElement('button');
    actionBtn.textContent = 'Review in Popup';
    actionBtn.style.cssText = `
      background: transparent;
      border: none;
      color: #93c5fd;
      text-decoration: underline;
      cursor: pointer;
      font-size: 11px;
      margin-left: 6px;
      padding: 0;
    `;
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      openPromptResponsibilityPopup();
    });

    modeGuardHint.appendChild(text);
    modeGuardHint.appendChild(actionBtn);
    modeGuardHint.style.display = 'block';
  };

  const showApiKeyRequiredModal = () => {
    if (window.ycUtils?.showGeminiApiKeyPrompt) {
      window.ycUtils.showGeminiApiKeyPrompt(
        () => {
          if (modeGuardHint) modeGuardHint.style.display = 'none';
          openApiConfigPopup();
        },
        () => {}
      );
      return true;
    }
    return false;
  };

  // Load settings
  chrome.storage.local.get(['aiTranscriptionMode', 'geminiApiKey', 'geminiApiKeys', 'alwaysAllowYoutubeFallback', 'promptDisclaimerAccepted'], (result) => {
    let transcriptionMode = result.aiTranscriptionMode || 'off'; // default 'off'
    const hasSingleKey = !!result.geminiApiKey;
    const hasMultiKeys = hasActiveGeminiMultiKey(result.geminiApiKeys);
    const hasApiKey = hasSingleKey || hasMultiKeys;
    hasApiKeyState = hasApiKey;
    promptDisclaimerAcceptedState = result.promptDisclaimerAccepted === true;
    alwaysAllowYoutubeFallbackState = result.alwaysAllowYoutubeFallback !== false;

    if (!hasApiKey && (transcriptionMode === 'auto' || transcriptionMode === 'always')) {
      transcriptionMode = 'off';
      chrome.storage.local.set({ aiTranscriptionMode: 'off' });
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 1: Auto Transcription Mode
    // ═══════════════════════════════════════════════════════════
    const modeSection = document.createElement('div');
    modeSection.style.cssText = `
      padding: 12px 24px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    `;

    const modeTitle = document.createElement('div');
    modeTitle.textContent = 'Auto Transcription';
    modeTitle.style.cssText = `
      font-size: 11px;
      color: #888;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    modeSection.appendChild(modeTitle);

    const modes = [
      { value: 'always', label: 'Always prefer AI', desc: 'Always use Gemini preference for default subtitles' },
      { value: 'auto', label: 'Auto when no subtitles', desc: 'Transcribe if YouTube has no subtitles' },
      { value: 'off', label: 'Off', desc: 'Manual only - no auto transcription' }
    ];

    const updateAlwaysFallbackVisibility = (modeValue) => {
      if (!alwaysFallbackWrap) return;
      alwaysFallbackWrap.style.display = modeValue === 'always' ? 'block' : 'none';
    };

    modes.forEach(mode => {
      const modeItem = document.createElement('div');
      modeItem.className = 'ai-mode-option';
      modeItem.dataset.modeValue = mode.value;
      modeItem.style.cssText = `
        padding: 10px 12px;
        margin-bottom: 8px;
        border: 2px solid ${transcriptionMode === mode.value ? '#4ade80' : 'rgba(255,255,255,0.1)'};
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        background: ${transcriptionMode === mode.value ? 'rgba(74, 222, 128, 0.1)' : 'transparent'};
      `;

      const modeLabel = document.createElement('div');
      modeLabel.style.cssText = `
        font-size: 13px;
        color: ${transcriptionMode === mode.value ? '#4ade80' : '#fff'};
        font-weight: ${transcriptionMode === mode.value ? '600' : '400'};
        margin-bottom: 4px;
      `;
      modeLabel.textContent = mode.label;

      const modeDesc = document.createElement('div');
      modeDesc.style.cssText = `
        font-size: 11px;
        color: #888;
        line-height: 1.3;
      `;
      modeDesc.textContent = mode.desc;

      modeItem.appendChild(modeLabel);
      modeItem.appendChild(modeDesc);

      const mouseoverHandler = () => {
        if (transcriptionMode !== mode.value) {
          modeItem.style.borderColor = 'rgba(255,255,255,0.3)';
          modeItem.style.background = 'rgba(255,255,255,0.05)';
        }
      };

      const mouseoutHandler = () => {
        if (transcriptionMode !== mode.value) {
          modeItem.style.borderColor = 'rgba(255,255,255,0.1)';
          modeItem.style.background = 'transparent';
        }
      };

      const clickHandler = (e) => {
        e.stopPropagation();
        e.preventDefault();

        const modeRequiresApiKey = mode.value === 'auto' || mode.value === 'always';
        if (modeRequiresApiKey && !hasApiKeyState) {
          const showedModal = showApiKeyRequiredModal();
          if (!showedModal) {
            showApiKeyRequiredHint(mode.label);
          }
          return;
        }

        if (modeRequiresApiKey && !promptDisclaimerAcceptedState) {
          showPromptResponsibilityRequiredHint(mode.label);
          openPromptResponsibilityPopup();
          return;
        }

        if (modeGuardHint) {
          modeGuardHint.style.display = 'none';
        }

        transcriptionMode = mode.value;
        chrome.storage.local.set({ aiTranscriptionMode: mode.value }, () => {
          // Update all mode items
          modeItems.forEach(item => {
            const itemMode = item.dataset.modeValue;
            const isSelected = itemMode === mode.value;
            item.style.borderColor = isSelected ? '#4ade80' : 'rgba(255,255,255,0.1)';
            item.style.background = isSelected ? 'rgba(74, 222, 128, 0.1)' : 'transparent';
            const label = item.querySelector('div:first-child');
            if (label) {
              label.style.color = isSelected ? '#4ade80' : '#fff';
              label.style.fontWeight = isSelected ? '600' : '400';
            }
          });
          updateAlwaysFallbackVisibility(mode.value);
          console.log('[AI Transcription] Mode changed to:', mode.value);
        });
      };

      modeItem.addEventListener('mouseover', mouseoverHandler);
      modeItem.addEventListener('mouseout', mouseoutHandler);
      modeItem.addEventListener('click', clickHandler);

      // Add cleanup for this mode item
      cleanupFunctions.push(() => {
        modeItem.removeEventListener('mouseover', mouseoverHandler);
        modeItem.removeEventListener('mouseout', mouseoutHandler);
        modeItem.removeEventListener('click', clickHandler);
      });

      modeSection.appendChild(modeItem);
      modeItems.push(modeItem);
    });

    alwaysFallbackWrap = document.createElement('label');
    alwaysFallbackWrap.style.cssText = `
      display: none;
      margin-bottom: 8px;
      padding: 10px 12px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      background: rgba(255,255,255,0.03);
      cursor: pointer;
    `;

    const alwaysFallbackHeader = document.createElement('div');
    alwaysFallbackHeader.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 8px;
    `;

    alwaysFallbackCheckbox = document.createElement('input');
    alwaysFallbackCheckbox.type = 'checkbox';
    alwaysFallbackCheckbox.checked = alwaysAllowYoutubeFallbackState;
    alwaysFallbackCheckbox.style.cssText = `
      margin-top: 1px;
      accent-color: #4ade80;
      cursor: pointer;
    `;

    const alwaysFallbackText = document.createElement('div');
    alwaysFallbackText.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 3px;
      flex: 1;
    `;

    const alwaysFallbackTitle = document.createElement('div');
    alwaysFallbackTitle.textContent = 'Allow YouTube fallback in ALWAYS';
    alwaysFallbackTitle.style.cssText = `
      font-size: 12px;
      color: #fff;
      font-weight: 500;
      line-height: 1.3;
    `;

    const alwaysFallbackDesc = document.createElement('div');
    alwaysFallbackDesc.textContent = 'When OFF, ALWAYS is strict Gemini-only.';
    alwaysFallbackDesc.style.cssText = `
      font-size: 11px;
      color: #9ca3af;
      line-height: 1.35;
    `;

    const alwaysFallbackChangeHandler = (e) => {
      e.stopPropagation();
      const checked = !!alwaysFallbackCheckbox?.checked;
      alwaysAllowYoutubeFallbackState = checked;
      chrome.storage.local.set({ alwaysAllowYoutubeFallback: checked }, () => {
        console.log('[AI Transcription] ALWAYS YouTube fallback:', checked ? 'enabled' : 'disabled');
      });
    };

    alwaysFallbackCheckbox.addEventListener('change', alwaysFallbackChangeHandler);
    cleanupFunctions.push(() => {
      alwaysFallbackCheckbox.removeEventListener('change', alwaysFallbackChangeHandler);
    });

    alwaysFallbackText.appendChild(alwaysFallbackTitle);
    alwaysFallbackText.appendChild(alwaysFallbackDesc);
    alwaysFallbackHeader.appendChild(alwaysFallbackCheckbox);
    alwaysFallbackHeader.appendChild(alwaysFallbackText);
    alwaysFallbackWrap.appendChild(alwaysFallbackHeader);
    const autoModeItem = modeItems.find(item => item.dataset.modeValue === 'auto');
    if (autoModeItem) {
      modeSection.insertBefore(alwaysFallbackWrap, autoModeItem);
    } else {
      modeSection.appendChild(alwaysFallbackWrap);
    }
    updateAlwaysFallbackVisibility(transcriptionMode);

    modeGuardHint = document.createElement('div');
    modeGuardHint.style.cssText = `
      display: none;
      margin-top: 6px;
      padding: 8px 10px;
      border-radius: 6px;
      background: rgba(251, 191, 36, 0.12);
      border: 1px solid rgba(251, 191, 36, 0.3);
      color: #fcd34d;
      font-size: 11px;
      line-height: 1.35;
    `;
    modeSection.appendChild(modeGuardHint);

    content.appendChild(modeSection);

    // ═══════════════════════════════════════════════════════════
    // SECTION 3: API Key Status (Read-Only)
    // ═══════════════════════════════════════════════════════════
    const statusSection = document.createElement('div');
    statusSection.style.cssText = `
      padding: 12px 24px;
    `;

    statusBox = document.createElement('div');
    const isGeminiReady = hasApiKey && promptDisclaimerAcceptedState;
    statusBox.style.cssText = `
      padding: 10px 12px;
      border-radius: 6px;
      background: ${isGeminiReady ? 'rgba(74, 222, 128, 0.1)' : 'rgba(251, 191, 36, 0.1)'};
      border: 1px solid ${isGeminiReady ? 'rgba(74, 222, 128, 0.3)' : 'rgba(251, 191, 36, 0.3)'};
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    `;

    statusIcon = document.createElement('span');
    statusIcon.textContent = isGeminiReady ? '✅' : '⚠️';
    statusIcon.style.fontSize = '14px';

    statusText = document.createElement('span');
    statusText.style.cssText = `
      color: ${isGeminiReady ? '#4ade80' : '#fbbf24'};
      flex: 1;
    `;
    statusText.textContent = isGeminiReady
      ? 'Gemini ready'
      : (hasApiKey ? 'Prompt responsibility required' : 'No API key found');

    statusBox.appendChild(statusIcon);
    statusBox.appendChild(statusText);
    statusSection.appendChild(statusBox);

    // Configure Button - Opens popup (Glassmorphism style)
    configureButton = document.createElement('button');
    configureButton.textContent = '🔑 Configure API Key';
    configureButton.style.cssText = `
      width: 100%;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    `;

    const configureMouseoverHandler = () => {
      configureButton.style.background = 'rgba(255, 255, 255, 0.1)';
      configureButton.style.borderColor = 'rgba(255, 255, 255, 0.2)';
      configureButton.style.transform = 'translateY(-1px)';
    };

    const configureMouseoutHandler = () => {
      configureButton.style.background = 'rgba(255, 255, 255, 0.05)';
      configureButton.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      configureButton.style.transform = 'translateY(0)';
    };

    const configureClickHandler = (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (hasApiKeyState && !promptDisclaimerAcceptedState) {
        openPromptResponsibilityPopup();
      } else {
        openApiConfigPopup();
      }
    };

    configureButton.addEventListener('mouseover', configureMouseoverHandler);
    configureButton.addEventListener('mouseout', configureMouseoutHandler);
    configureButton.addEventListener('click', configureClickHandler);

    // Don't cleanup configure button listeners - they should persist
    // The button doesn't change and the listener doesn't depend on state
    // Removing this from cleanup fixes the "second click doesn't work" bug

    if (hasApiKey && !promptDisclaimerAcceptedState) {
      configureButton.textContent = 'Review Prompt Responsibility';
    }

    // Hide button if Gemini is fully ready
    if (isGeminiReady) {
      configureButton.style.display = 'none';
    }

    statusSection.appendChild(configureButton);

    content.appendChild(statusSection);
  });

  submenu.appendChild(content);

  // 🔄 Refresh State Function - Updates UI from storage
  const refreshState = () => {
    console.log('[AI Transcription] Refreshing state from storage...');
    chrome.storage.local.get(['aiTranscriptionMode', 'geminiApiKey', 'geminiApiKeys', 'alwaysAllowYoutubeFallback', 'promptDisclaimerAccepted'], (result) => {
      let transcriptionMode = result.aiTranscriptionMode || 'off';
      const hasSingleKey = !!result.geminiApiKey;
      const hasMultiKeys = hasActiveGeminiMultiKey(result.geminiApiKeys);
      const hasApiKey = hasSingleKey || hasMultiKeys;
      hasApiKeyState = hasApiKey;
      promptDisclaimerAcceptedState = result.promptDisclaimerAccepted === true;
      alwaysAllowYoutubeFallbackState = result.alwaysAllowYoutubeFallback !== false;

      if (!hasApiKey && (transcriptionMode === 'auto' || transcriptionMode === 'always')) {
        transcriptionMode = 'off';
        chrome.storage.local.set({ aiTranscriptionMode: 'off' });
      }

      // Update mode items
      modeItems.forEach(item => {
        const itemMode = item.dataset.modeValue;
        const isSelected = itemMode === transcriptionMode;
        item.style.borderColor = isSelected ? '#4ade80' : 'rgba(255,255,255,0.1)';
        item.style.background = isSelected ? 'rgba(74, 222, 128, 0.1)' : 'transparent';
        const label = item.querySelector('div:first-child');
        if (label) {
          label.style.color = isSelected ? '#4ade80' : '#fff';
          label.style.fontWeight = isSelected ? '600' : '400';
        }
      });

      // Update status box
      if (statusIcon && statusText && statusBox) {
        const isGeminiReady = hasApiKey && promptDisclaimerAcceptedState;
        statusIcon.textContent = isGeminiReady ? '✅' : '⚠️';
        statusText.textContent = isGeminiReady
          ? 'Gemini ready'
          : (hasApiKey ? 'Prompt responsibility required' : 'No API key found');
        statusText.style.color = isGeminiReady ? '#4ade80' : '#fbbf24';
        statusBox.style.background = isGeminiReady ? 'rgba(74, 222, 128, 0.1)' : 'rgba(251, 191, 36, 0.1)';
        statusBox.style.borderColor = isGeminiReady ? 'rgba(74, 222, 128, 0.3)' : 'rgba(251, 191, 36, 0.3)';
      }

      // Update configure button visibility
      if (configureButton) {
        const isGeminiReady = hasApiKey && promptDisclaimerAcceptedState;
        configureButton.textContent = hasApiKey && !promptDisclaimerAcceptedState
          ? 'Review Prompt Responsibility'
          : '🔑 Configure API Key';
        configureButton.style.display = isGeminiReady ? 'none' : 'block';
      }

      if (alwaysFallbackCheckbox) {
        alwaysFallbackCheckbox.checked = alwaysAllowYoutubeFallbackState;
      }
      if (alwaysFallbackWrap) {
        alwaysFallbackWrap.style.display = transcriptionMode === 'always' ? 'block' : 'none';
      }

      if (modeGuardHint && hasApiKey && promptDisclaimerAcceptedState) {
        modeGuardHint.style.display = 'none';
      }

      console.log('[AI Transcription] UI refreshed:', { transcriptionMode, hasApiKey, promptDisclaimerAccepted: promptDisclaimerAcceptedState });
    });
  };

  // 🔗 Expose refreshState to DOM for external access
  submenu.refreshState = refreshState;

  // Listen for storage changes to sync with popup (when menu is open)
  const storageChangeListener = (changes, areaName) => {
    if (areaName === 'local' && (changes.geminiApiKey || changes.geminiApiKeys || changes.aiTranscriptionMode || changes.alwaysAllowYoutubeFallback || changes.promptDisclaimerAccepted)) {
      console.log('[AI Transcription] Storage changed, refreshing UI...');
      refreshState();
    }
  };

  chrome.storage.onChanged.addListener(storageChangeListener);
  
  // Add to cleanup
  cleanupFunctions.push(() => {
    chrome.storage.onChanged.removeListener(storageChangeListener);
  });

  // Add MutationObserver to cleanup only when menu is truly removed from DOM
  // Not just hidden - we want to keep listeners alive for reuse
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
        // Check if submenu was removed from DOM
        mutation.removedNodes.forEach(node => {
          if (node === submenu && submenu.cleanup) {
            console.log('[AI Transcription] Menu removed from DOM, cleaning up...');
            submenu.cleanup();
          }
        });
      }
    });
  });

  // Observe the parent node for removal
  if (submenu.parentNode) {
    observer.observe(submenu.parentNode, { childList: true });
  }
  
  // Store observer for cleanup
  submenu.observer = observer;
  cleanupFunctions.push(() => {
    if (observer) observer.disconnect();
  });

  return submenu;
};
