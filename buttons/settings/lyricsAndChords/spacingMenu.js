// Lyrics & Chords Spacing Menu
// This submenu allows users to control various spacing options in the Lyrics panel
// spacingMenu.js

// ───────────────────────────────────────────────
// 1. DEFAULT VALUES AND STORAGE KEYS
// ───────────────────────────────────────────────

const DEFAULT_SPACING_SETTINGS = {
  wordSpacing: 1,           // רווח אופקי בין מילים (px)
  lineSpacing: 0,           // רווח אנכי בין שורות (line-height modifier)
  sectionSpacing: 0,        // רווח אנכי בין בתים/פזמונים (לא כולל instrumental) (px)
  instrumentalSpacing: 0    // רווח אנכי לפני/אחרי Intro/Instrumental/Outro (px)
};

const SPACING_RANGES = {
  wordSpacing: { min: 0, max: 20, step: 1 },
  lineSpacing: { min: -5, max: 50, step: 0.5 },
  sectionSpacing: { min: 0, max: 80, step: 5 },
  instrumentalSpacing: { min: -20, max: 80, step: 5 }
};

const SPACING_STORAGE_KEY = 'youchords_lyrics_spacing';

// Current settings
let currentSpacingSettings = { ...DEFAULT_SPACING_SETTINGS };

// ───────────────────────────────────────────────
// 2. LOAD AND SAVE FUNCTIONS
// ───────────────────────────────────────────────

/**
 * Load spacing settings from localStorage
 */
window.loadSpacingSettings = function loadSpacingSettings() {
  try {
    const saved = localStorage.getItem(SPACING_STORAGE_KEY);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      currentSpacingSettings = { ...DEFAULT_SPACING_SETTINGS, ...parsed };
      console.log('[SpacingMenu] 📥 Loaded spacing settings:', currentSpacingSettings);
    }
  } catch (error) {
    console.error('[SpacingMenu] ❌ Error loading spacing settings:', error);
    currentSpacingSettings = { ...DEFAULT_SPACING_SETTINGS };
  }
  return currentSpacingSettings;
};

/**
 * Save spacing settings to localStorage
 */
window.saveSpacingSettings = function saveSpacingSettings() {
  try {
    localStorage.setItem(SPACING_STORAGE_KEY, JSON.stringify(currentSpacingSettings));
    console.log('[SpacingMenu] 💾 Saved spacing settings:', currentSpacingSettings);
  } catch (error) {
    console.error('[SpacingMenu] ❌ Error saving spacing settings:', error);
  }
};

/**
 * Update a single spacing setting
 */
window.updateSpacingSetting = function updateSpacingSetting(key, value) {
  try {
    currentSpacingSettings[key] = value;
    window.saveSpacingSettings();
    window.applySpacingSettings();
    console.log('[SpacingMenu] 🎨 Updated spacing:', key, '=', value);
  } catch (error) {
    console.error('[SpacingMenu] ❌ Error updating spacing:', error);
  }
};

/**
 * Reset spacing settings to defaults
 */
window.resetSpacingSettings = function resetSpacingSettings() {
  currentSpacingSettings = { ...DEFAULT_SPACING_SETTINGS };
  window.saveSpacingSettings();
  window.applySpacingSettings();
  console.log('[SpacingMenu] ✅ Reset spacing to defaults');
};

// ───────────────────────────────────────────────
// 3. APPLY SPACING TO CSS
// ───────────────────────────────────────────────

/**
 * Apply spacing settings to CSS
 */
window.applySpacingSettings = function applySpacingSettings() {
  try {
    const settings = currentSpacingSettings;
    
    // Find or create style element
    let styleEl = document.getElementById('yc-lyrics-spacing-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'yc-lyrics-spacing-styles';
      document.head.appendChild(styleEl);
    }
    
    // Build CSS
    styleEl.textContent = `
      /* Word Spacing - horizontal space between word-chord containers */
      .yt-lyrics-chords-panel .word-chord-container {
        margin-right: ${settings.wordSpacing}px !important;
      }
      .yt-lyrics-chords-panel.yt-lyrics-chords-rtl .word-chord-container {
        margin-right: 0 !important;
        margin-left: ${settings.wordSpacing}px !important;
      }
      
      /* Line Spacing - line-height for wrapped text lines */
      .yt-lyrics-chords-panel .lyrics-chords-word-line {
        line-height: ${1.4 + (settings.lineSpacing / 10)} !important;
      }
      
      /* Section Spacing - vertical space between verses/choruses (excluding instrumental sections) */
      .yt-lyrics-chords-panel .lyrics-chords-line[data-verse]:not([data-intro]):not([data-instrumental]):not([data-outro]) {
        margin-bottom: ${settings.sectionSpacing}px !important;
      }
      
      /* Instrumental Spacing - vertical space before/after Intro/Instrumental/Outro */
      .yt-lyrics-chords-panel .lyrics-chords-line[data-intro],
      .yt-lyrics-chords-panel .lyrics-chords-line[data-instrumental],
      .yt-lyrics-chords-panel .lyrics-chords-line[data-outro] {
        margin-top: ${settings.instrumentalSpacing}px !important;
        margin-bottom: ${settings.instrumentalSpacing}px !important;
      }
    `;
    
    console.log('[SpacingMenu] ✅ Applied spacing settings');
  } catch (error) {
    console.error('[SpacingMenu] ❌ Error applying spacing settings:', error);
  }
};

// Initialize on load
(function initSpacing() {
  window.loadSpacingSettings();
  window.applySpacingSettings();
})();

// ───────────────────────────────────────────────
// 4. UI HELPER FUNCTIONS
// ───────────────────────────────────────────────

/**
 * Create a spacing control row with +/- buttons
 */
function createSpacingControl(label, key, currentValue, range) {
  const controlRow = document.createElement('div');
  controlRow.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 24px;
  `;

  // Hover effect - store handlers for cleanup
  const rowMouseOver = () => {
    controlRow.style.backgroundColor = 'rgba(255,255,255,0.05)';
  };
  const rowMouseOut = () => {
    controlRow.style.backgroundColor = 'transparent';
  };
  controlRow.addEventListener('mouseover', rowMouseOver);
  controlRow.addEventListener('mouseout', rowMouseOut);

  // Label
  const labelElement = document.createElement('span');
  labelElement.textContent = label;
  labelElement.style.cssText = `
    font-size: 13px;
    color: #fff;
    flex: 1;
  `;

  // Controls container
  const controlsContainer = document.createElement('div');
  controlsContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  // Minus button
  const minusButton = document.createElement('button');
  minusButton.textContent = '−';
  minusButton.style.cssText = `
    width: 28px;
    height: 28px;
    border: 1px solid rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.1);
    color: #fff;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  `;

  // Helper to format value display
  const formatValue = (val) => {
    // For lineSpacing, don't show "px" since it's a line-height modifier
    if (key === 'lineSpacing') {
      return Number.isInteger(val) ? `${val}` : val.toFixed(1);
    }
    return `${val}px`;
  };

  // Value display
  const valueDisplay = document.createElement('span');
  valueDisplay.textContent = formatValue(currentValue);
  valueDisplay.id = `spacing-val-${key}`;
  valueDisplay.style.cssText = `
    min-width: 50px;
    text-align: center;
    font-size: 13px;
    color: #fff;
    background: rgba(255,255,255,0.1);
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid rgba(255,255,255,0.2);
  `;

  // Plus button
  const plusButton = document.createElement('button');
  plusButton.textContent = '+';
  plusButton.style.cssText = minusButton.style.cssText;

  // Event handlers
  const decreaseHandler = (e) => {
    e.stopPropagation(); // מניעת סגירת התפריט
    let newValue = currentSpacingSettings[key] - range.step;
    // Round to avoid floating point issues
    newValue = Math.round(newValue * 10) / 10;
    newValue = Math.max(range.min, newValue);
    if (newValue !== currentSpacingSettings[key]) {
      window.updateSpacingSetting(key, newValue);
      valueDisplay.textContent = formatValue(newValue);
    }
  };

  const increaseHandler = (e) => {
    e.stopPropagation(); // מניעת סגירת התפריט
    let newValue = currentSpacingSettings[key] + range.step;
    // Round to avoid floating point issues
    newValue = Math.round(newValue * 10) / 10;
    newValue = Math.min(range.max, newValue);
    if (newValue !== currentSpacingSettings[key]) {
      window.updateSpacingSetting(key, newValue);
      valueDisplay.textContent = formatValue(newValue);
    }
  };

  minusButton.addEventListener('click', decreaseHandler);
  plusButton.addEventListener('click', increaseHandler);

  // Hover effects for buttons - store handlers for cleanup
  const minusBtnEnter = () => { minusButton.style.background = 'rgba(255,255,255,0.2)'; };
  const minusBtnLeave = () => { minusButton.style.background = 'rgba(255,255,255,0.1)'; };
  const plusBtnEnter = () => { plusButton.style.background = 'rgba(255,255,255,0.2)'; };
  const plusBtnLeave = () => { plusButton.style.background = 'rgba(255,255,255,0.1)'; };
  
  minusButton.addEventListener('mouseenter', minusBtnEnter);
  minusButton.addEventListener('mouseleave', minusBtnLeave);
  plusButton.addEventListener('mouseenter', plusBtnEnter);
  plusButton.addEventListener('mouseleave', plusBtnLeave);

  // Store cleanup function - remove ALL event listeners
  controlRow.cleanup = () => {
    minusButton.removeEventListener('click', decreaseHandler);
    plusButton.removeEventListener('click', increaseHandler);
    minusButton.removeEventListener('mouseenter', minusBtnEnter);
    minusButton.removeEventListener('mouseleave', minusBtnLeave);
    plusButton.removeEventListener('mouseenter', plusBtnEnter);
    plusButton.removeEventListener('mouseleave', plusBtnLeave);
    controlRow.removeEventListener('mouseover', rowMouseOver);
    controlRow.removeEventListener('mouseout', rowMouseOut);
  };

  // Store update function for external value changes
  controlRow.updateValue = (newValue) => {
    valueDisplay.textContent = formatValue(newValue);
  };

  controlsContainer.appendChild(minusButton);
  controlsContainer.appendChild(valueDisplay);
  controlsContainer.appendChild(plusButton);

  controlRow.appendChild(labelElement);
  controlRow.appendChild(controlsContainer);

  return controlRow;
}

// ───────────────────────────────────────────────
// 5. CREATE SUBMENU
// ───────────────────────────────────────────────

/**
 * Creates the Spacing submenu
 */
window.createSpacingSubmenu = function(parentMenu) {
  // Load current settings
  window.loadSpacingSettings();
  
  const submenu = document.createElement('div');
  submenu.className = 'settings-menu spacing-submenu yc';
  submenu.setAttribute('data-yc-menu', 'spacing');
  submenu.style.cssText = `
    position: absolute;
    background: rgba(28, 28, 28, 0.95);
    right: 12px;
    border-radius: 8px;
    padding: 0;
    z-index: 2001;
    width: 280px;
    font-family: Roboto, Arial, sans-serif;
    color: #fff;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    display: none;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
  `;

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

  const backButtonClickHandler = (event) => {
    event.stopPropagation();
    submenu.style.display = 'none';
    if (parentMenu) parentMenu.style.display = 'block';
  };

  backButton.addEventListener('click', backButtonClickHandler);
  submenu.backButtonClickHandler = backButtonClickHandler;
  submenu.backButton = backButton;

  const headerText = document.createElement('span');
  headerText.textContent = 'Spacing';
  headerText.style.fontWeight = '500';

  header.appendChild(backButton);
  header.appendChild(headerText);
  submenu.appendChild(header);

  // Reset option
  const resetOption = document.createElement('div');
  resetOption.className = 'settings-item reset-spacing';
  resetOption.style.cssText = `
    padding: 12px 24px;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    user-select: none;
    -webkit-user-select: none;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  `;

  const resetText = document.createElement('span');
  resetText.textContent = 'Reset Spacing';
  resetText.style.color = '#ff3860';
  resetOption.appendChild(resetText);

  // Hover effect for reset - store handlers for cleanup
  const resetMouseOver = () => {
    resetOption.style.backgroundColor = 'rgba(255,255,255,0.1)';
  };
  const resetMouseOut = () => {
    resetOption.style.backgroundColor = 'transparent';
  };
  resetOption.addEventListener('mouseover', resetMouseOver);
  resetOption.addEventListener('mouseout', resetMouseOut);

  // Reset click handler - shows confirmation dialog
  const resetClickHandler = () => {
    showResetSpacingConfirmation(() => {
      // Update all value displays after reset
      if (wordSpacingControl) wordSpacingControl.updateValue(DEFAULT_SPACING_SETTINGS.wordSpacing);
      if (lineSpacingControl) lineSpacingControl.updateValue(DEFAULT_SPACING_SETTINGS.lineSpacing);
      if (sectionSpacingControl) sectionSpacingControl.updateValue(DEFAULT_SPACING_SETTINGS.sectionSpacing);
      if (instrumentalSpacingControl) instrumentalSpacingControl.updateValue(DEFAULT_SPACING_SETTINGS.instrumentalSpacing);
    });
  };
  resetOption.addEventListener('click', resetClickHandler);

  submenu.appendChild(resetOption);

  // Content container
  const content = document.createElement('div');
  content.style.padding = '8px 0 16px 0';

  // Create spacing controls
  const wordSpacingControl = createSpacingControl(
    'Word Spacing',
    'wordSpacing',
    currentSpacingSettings.wordSpacing,
    SPACING_RANGES.wordSpacing
  );
  content.appendChild(wordSpacingControl);

  const lineSpacingControl = createSpacingControl(
    'Line Spacing',
    'lineSpacing',
    currentSpacingSettings.lineSpacing,
    SPACING_RANGES.lineSpacing
  );
  content.appendChild(lineSpacingControl);

  const sectionSpacingControl = createSpacingControl(
    'Section Spacing',
    'sectionSpacing',
    currentSpacingSettings.sectionSpacing,
    SPACING_RANGES.sectionSpacing
  );
  content.appendChild(sectionSpacingControl);

  const instrumentalSpacingControl = createSpacingControl(
    'Instrumental Spacing',
    'instrumentalSpacing',
    currentSpacingSettings.instrumentalSpacing,
    SPACING_RANGES.instrumentalSpacing
  );
  content.appendChild(instrumentalSpacingControl);

  submenu.appendChild(content);

  // Store cleanup functions - include ALL event listeners
  submenu.cleanups = [
    () => wordSpacingControl.cleanup?.(),
    () => lineSpacingControl.cleanup?.(),
    () => sectionSpacingControl.cleanup?.(),
    () => instrumentalSpacingControl.cleanup?.(),
    () => resetOption.removeEventListener('click', resetClickHandler),
    () => resetOption.removeEventListener('mouseover', resetMouseOver),
    () => resetOption.removeEventListener('mouseout', resetMouseOut)
  ];

  return submenu;
};

/**
 * Dispose function for cleanup
 */
window.disposeSpacingSubmenu = function(submenu, remove = false) {
  if (!submenu) return;

  // Run cleanup functions
  if (submenu.cleanups) {
    submenu.cleanups.forEach(cleanup => cleanup?.());
  }

  // Remove back button listener
  if (submenu.backButton && submenu.backButtonClickHandler) {
    submenu.backButton.removeEventListener('click', submenu.backButtonClickHandler);
  }

  // Disconnect observer if exists
  if (submenu.observer) {
    submenu.observer.disconnect();
    delete submenu.observer;
  }

  // Remove from DOM if requested
  if (remove && submenu.parentNode) {
    submenu.parentNode.removeChild(submenu);
  }
};

/**
 * Remove spacing styles from DOM (call when extension is disabled/unloaded)
 */
window.removeSpacingStyles = function() {
  const styleEl = document.getElementById('yc-lyrics-spacing-styles');
  if (styleEl && styleEl.parentNode) {
    styleEl.parentNode.removeChild(styleEl);
    console.log('[SpacingMenu] 🗑️ Removed spacing styles from DOM');
  }
};

// ───────────────────────────────────────────────
// 6. CONFIRMATION DIALOG
// ───────────────────────────────────────────────

/**
 * Show confirmation dialog for resetting spacing settings
 * @param {Function} onSuccess - Callback to run after successful reset (e.g., update UI)
 */
function showResetSpacingConfirmation(onSuccess) {
  // Remove existing overlay if any
  const existingOverlay = document.querySelector('.yc-confirm-overlay');
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement('div');
  overlay.className = 'yc-confirm-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.7);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: #1c1c1c;
    border-radius: 8px;
    padding: 24px;
    max-width: 350px;
    text-align: center;
    color: #fff;
    font-family: Roboto, Arial, sans-serif;
  `;

  dialog.innerHTML = `
    <h3 style="margin: 0 0 16px; font-size: 16px;">Reset Spacing?</h3>
    <p style="margin: 0 0 20px; font-size: 13px; color: #aaa;">
      This will reset all spacing settings to their default values.
    </p>
    <div style="display: flex; gap: 12px; justify-content: center;">
      <button id="yc-cancel-reset-spacing" style="
        padding: 8px 20px;
        background: #444;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
      ">Cancel</button>
      <button id="yc-confirm-reset-spacing" style="
        padding: 8px 20px;
        background: #ff3860;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
      ">Reset</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Event handlers with cleanup
  const cancelBtn = dialog.querySelector('#yc-cancel-reset-spacing');
  const confirmBtn = dialog.querySelector('#yc-confirm-reset-spacing');

  const cleanup = () => {
    cancelBtn.removeEventListener('click', handleCancel);
    confirmBtn.removeEventListener('click', handleConfirm);
    overlay.removeEventListener('click', handleOverlayClick);
    overlay.remove();
  };

  const handleCancel = () => cleanup();
  const handleOverlayClick = (e) => {
    if (e.target === overlay) cleanup();
  };
  const handleConfirm = () => {
    confirmBtn.textContent = 'Resetting...';
    confirmBtn.disabled = true;

    try {
      window.resetSpacingSettings();
      
      // Call success callback to update UI
      if (typeof onSuccess === 'function') {
        onSuccess();
      }

      dialog.innerHTML = `
        <p style="margin: 0; font-size: 14px; color: #4CAF50;">✓ Spacing reset successfully</p>
      `;
      setTimeout(cleanup, 1500);
    } catch (error) {
      console.error('[SpacingMenu] ❌ Failed to reset spacing:', error);
      dialog.innerHTML = `
        <p style="margin: 0; font-size: 14px; color: #ff3860;">✗ Failed to reset spacing</p>
      `;
      setTimeout(cleanup, 2000);
    }
  };

  cancelBtn.addEventListener('click', handleCancel);
  overlay.addEventListener('click', handleOverlayClick);
  confirmBtn.addEventListener('click', handleConfirm);
}

// Expose default settings for reset functionality
window.DEFAULT_SPACING_SETTINGS = DEFAULT_SPACING_SETTINGS;
window.SPACING_STORAGE_KEY = SPACING_STORAGE_KEY;
