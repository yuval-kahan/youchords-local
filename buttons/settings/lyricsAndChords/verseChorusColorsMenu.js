// Lyrics & Chords Verse/Chorus Colors Menu
// This submenu allows users to control verse and chorus background colors
// verseChorusColorsMenu.js

// Default colors
const DEFAULT_VERSE_COLOR = "#0064ff"; // כחול (rgba(0, 100, 255, 0.2) converted to hex base)
const DEFAULT_CHORUS_COLOR = "#ff0000"; // אדום (rgba(255, 0, 0, 0.3) converted to hex base)
const DEFAULT_INTRO_COLOR = "#0064ff"; // כחול (כמו Verse)
const DEFAULT_VERSE_OPACITY = 0.2;
const DEFAULT_CHORUS_OPACITY = 0.3;
const DEFAULT_INTRO_OPACITY = 0.2;

// Convert hex to rgba
function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Apply colors to CSS
function applyVerseChorusColors(settings) {
  let styleEl = document.getElementById("yc-verse-chorus-colors");

  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "yc-verse-chorus-colors";
    document.head.appendChild(styleEl);
  }

  let css = "";

  // Selector for verse only (excluding chorus and intro/instrumental/outro)
  const verseSelector = ".lyrics-chords-line[data-verse]:not(.chorus-line):not([data-intro]):not([data-instrumental]):not([data-outro])";
  // Selector for intro/instrumental/outro
  const introSelector = ".lyrics-chords-line[data-intro], .lyrics-chords-line[data-instrumental], .lyrics-chords-line[data-outro]";

  // Main toggle OFF = no colors at all
  if (!settings.enabled) {
    css = `
      .lyrics-chords-line.chorus-line {
        background-color: transparent !important;
      }
      ${verseSelector} {
        background-color: transparent !important;
      }
      ${introSelector} {
        background-color: transparent !important;
      }
    `;
  } else {
    // Verse color (only regular verses, not intro/instrumental/outro)
    if (settings.verseEnabled) {
      const verseRgba = hexToRgba(settings.verseColor, DEFAULT_VERSE_OPACITY);
      css += `
        ${verseSelector} {
          background-color: ${verseRgba} !important;
        }
      `;
    } else {
      css += `
        ${verseSelector} {
          background-color: transparent !important;
        }
      `;
    }

    // Chorus color
    if (settings.chorusEnabled) {
      const chorusRgba = hexToRgba(
        settings.chorusColor,
        DEFAULT_CHORUS_OPACITY
      );
      css += `
        .lyrics-chords-line.chorus-line {
          background-color: ${chorusRgba} !important;
        }
      `;
    } else {
      css += `
        .lyrics-chords-line.chorus-line {
          background-color: transparent !important;
        }
      `;
    }

    // Intro/Instrumental/Outro color
    if (settings.introEnabled) {
      const introRgba = hexToRgba(settings.introColor, DEFAULT_INTRO_OPACITY);
      css += `
        ${introSelector} {
          background-color: ${introRgba} !important;
        }
      `;
    } else {
      css += `
        ${introSelector} {
          background-color: transparent !important;
        }
      `;
    }
  }

  styleEl.textContent = css;
}

// Load settings from storage
async function loadVerseChorusSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["verseChorusColors"], (result) => {
      const defaults = {
        enabled: false,
        verseEnabled: true,
        verseColor: DEFAULT_VERSE_COLOR,
        chorusEnabled: true,
        chorusColor: DEFAULT_CHORUS_COLOR,
        introEnabled: true,
        introColor: DEFAULT_INTRO_COLOR,
      };
      resolve({ ...defaults, ...result.verseChorusColors });
    });
  });
}

// Save settings to storage
async function saveVerseChorusSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ verseChorusColors: settings }, resolve);
  });
}

// Initialize on load
(async function initVerseChorusColors() {
  const settings = await loadVerseChorusSettings();
  applyVerseChorusColors(settings);
})();

/**
 * Creates a toggle switch component
 */
function createToggleSwitch(initialState, onChange) {
  const container = document.createElement("div");
  container.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  let currentState = initialState;

  const toggle = document.createElement("div");
  toggle.style.cssText = `
    width: 40px;
    height: 20px;
    background-color: ${initialState ? "#3ea6ff" : "#666"};
    border-radius: 10px;
    position: relative;
    cursor: pointer;
    transition: background-color 0.3s ease;
  `;

  const knob = document.createElement("div");
  knob.style.cssText = `
    width: 16px;
    height: 16px;
    background-color: white;
    border-radius: 50%;
    position: absolute;
    top: 2px;
    left: ${initialState ? "22px" : "2px"};
    transition: left 0.3s ease;
  `;

  const status = document.createElement("span");
  status.textContent = initialState ? "ON" : "OFF";
  status.style.cssText = `
    color: ${initialState ? "#3ea6ff" : "#666"};
    font-size: 12px;
    font-weight: 500;
    min-width: 25px;
  `;

  toggle.appendChild(knob);
  container.appendChild(toggle);
  container.appendChild(status);

  const clickHandler = (event) => {
    event.stopPropagation();
    currentState = !currentState;

    toggle.style.backgroundColor = currentState ? "#3ea6ff" : "#666";
    knob.style.left = currentState ? "22px" : "2px";
    status.textContent = currentState ? "ON" : "OFF";
    status.style.color = currentState ? "#3ea6ff" : "#666";

    onChange?.(currentState);
  };

  toggle.addEventListener("click", clickHandler);

  // Update function for external state changes
  container.updateState = (newState) => {
    currentState = newState;
    toggle.style.backgroundColor = currentState ? "#3ea6ff" : "#666";
    knob.style.left = currentState ? "22px" : "2px";
    status.textContent = currentState ? "ON" : "OFF";
    status.style.color = currentState ? "#3ea6ff" : "#666";
  };

  container.cleanup = () => {
    toggle.removeEventListener("click", clickHandler);
  };

  return container;
}

/**
 * Creates a color option row with toggle, color picker, and reset button
 * @param {string} presetColor - Optional preset color button (e.g., green for Intro)
 */
function createColorOptionRow(
  label,
  initialEnabled,
  initialColor,
  defaultColor,
  onToggle,
  onColorChange,
  getIsEnabled,
  presetColor = null
) {
  const row = document.createElement("div");
  row.style.cssText = `
    padding: 10px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;

  const labelSpan = document.createElement("span");
  labelSpan.textContent = label;
  labelSpan.style.cssText = `
    font-size: 13px;
    color: #fff;
  `;

  const controlsContainer = document.createElement("div");
  controlsContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
  `;

  // Toggle switch with enabled check
  const toggleContainer = createToggleSwitch(initialEnabled, (newState) => {
    if (getIsEnabled && !getIsEnabled()) return; // Block if main toggle is off
    onToggle(newState);
  });

  // Color picker
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = initialColor;
  colorInput.style.cssText = `
    width: 36px;
    height: 24px;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
  `;

  // Store handlers for cleanup
  const colorInputHandler = (e) => {
    e.stopPropagation();
    if (getIsEnabled && !getIsEnabled()) return; // Block if main toggle is off
    onColorChange(e.target.value);
  };
  const colorClickHandler = (e) => {
    e.stopPropagation();
    if (getIsEnabled && !getIsEnabled()) {
      e.preventDefault();
    }
  };

  colorInput.addEventListener("input", colorInputHandler);
  colorInput.addEventListener("click", colorClickHandler);

  // Reset button
  const resetBtn = document.createElement("div");
  resetBtn.title = "Reset to Default";
  resetBtn.style.cssText = `
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  `;
  resetBtn.innerHTML = `
    <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: #aaa;">
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
    </svg>
  `;

  // Store handlers for cleanup
  const resetClickHandler = (e) => {
    e.stopPropagation();
    if (getIsEnabled && !getIsEnabled()) return; // Block if main toggle is off
    colorInput.value = defaultColor;
    onColorChange(defaultColor);
  };
  const resetEnterHandler = () => {
    resetBtn.style.background = "rgba(255,255,255,0.2)";
  };
  const resetLeaveHandler = () => {
    resetBtn.style.background = "rgba(255,255,255,0.1)";
  };

  resetBtn.addEventListener("click", resetClickHandler);
  resetBtn.addEventListener("mouseenter", resetEnterHandler);
  resetBtn.addEventListener("mouseleave", resetLeaveHandler);

  controlsContainer.appendChild(toggleContainer);
  controlsContainer.appendChild(colorInput);

  // Store preset button handlers for cleanup
  let presetBtn = null;
  let presetClickHandler = null;
  let presetEnterHandler = null;
  let presetLeaveHandler = null;

  // Preset color button (optional) - positioned below the color picker
  if (presetColor) {
    presetBtn = document.createElement("div");
    presetBtn.title = "Green preset";
    presetBtn.style.cssText = `
      width: 23px;
      height: 9px;
      border-radius: 0px;
      cursor: pointer;
      border: 1px solid rgba(255,255,255,0.2);
      background: ${presetColor};
      transition: opacity 0.2s;
      position: absolute;
      top: 42px;
      right: 65px;
    `;

    presetClickHandler = (e) => {
      e.stopPropagation();
      if (getIsEnabled && !getIsEnabled()) return;
      colorInput.value = presetColor;
      onColorChange(presetColor);
    };
    presetEnterHandler = () => {
      presetBtn.style.opacity = "0.8";
    };
    presetLeaveHandler = () => {
      presetBtn.style.opacity = "1";
    };

    presetBtn.addEventListener("click", presetClickHandler);
    presetBtn.addEventListener("mouseenter", presetEnterHandler);
    presetBtn.addEventListener("mouseleave", presetLeaveHandler);

    row.style.position = "relative";
    row.appendChild(presetBtn);
  }

  controlsContainer.appendChild(resetBtn);

  row.appendChild(labelSpan);
  row.appendChild(controlsContainer);

  // Cleanup function - removes all event listeners
  row.cleanup = () => {
    toggleContainer.cleanup?.();
    colorInput.removeEventListener("input", colorInputHandler);
    colorInput.removeEventListener("click", colorClickHandler);
    resetBtn.removeEventListener("click", resetClickHandler);
    resetBtn.removeEventListener("mouseenter", resetEnterHandler);
    resetBtn.removeEventListener("mouseleave", resetLeaveHandler);
    if (presetBtn && presetClickHandler) {
      presetBtn.removeEventListener("click", presetClickHandler);
      presetBtn.removeEventListener("mouseenter", presetEnterHandler);
      presetBtn.removeEventListener("mouseleave", presetLeaveHandler);
    }
  };

  row.updateColor = (color) => {
    colorInput.value = color;
  };

  return row;
}

/**
 * Creates the Verse/Chorus Colors submenu
 */
window.createVerseChorusColorsSubmenu = function (parentMenu) {
  const submenu = document.createElement("div");
  submenu.className = "settings-menu verse-chorus-colors-submenu yc";
  submenu.setAttribute("data-yc-menu", "verse-chorus-colors");
  submenu.style.cssText = `
    position: absolute;
    background: rgba(28, 28, 28, 0.95);
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

  // Header with back button
  const header = document.createElement("div");
  header.style.cssText = `
    padding: 12px 24px;
    font-size: 13px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  `;

  const backButton = document.createElement("span");
  backButton.innerHTML = "◄";
  backButton.style.cssText = `
    cursor: pointer;
    margin-right: 12px;
    color: #aaa;
  `;

  const backButtonClickHandler = (event) => {
    event.stopPropagation();
    submenu.style.display = "none";
    if (parentMenu) parentMenu.style.display = "block";
  };

  backButton.addEventListener("click", backButtonClickHandler);
  submenu.backButtonClickHandler = backButtonClickHandler;
  submenu.backButton = backButton;

  const headerText = document.createElement("span");
  headerText.textContent = "Verse/Chorus Colors";
  headerText.style.fontWeight = "500";

  header.appendChild(backButton);
  header.appendChild(headerText);
  submenu.appendChild(header);

  // Content container
  const content = document.createElement("div");
  content.style.padding = "8px 0 20px 0";

  // Load settings and build UI
  loadVerseChorusSettings().then((settings) => {
    if (!submenu.isConnected) return;

    // Main Toggle Row
    const mainToggleRow = document.createElement("div");
    mainToggleRow.style.cssText = `
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    `;

    const mainLabel = document.createElement("span");
    mainLabel.textContent = "Enable Colors";
    mainLabel.style.cssText = `
      font-size: 13px;
      color: #fff;
      font-weight: 500;
    `;

    const mainToggle = createToggleSwitch(settings.enabled, async (enabled) => {
      settings.enabled = enabled;
      await saveVerseChorusSettings(settings);
      applyVerseChorusColors(settings);
      updateSubOptionsVisibility();
    });

    mainToggleRow.appendChild(mainLabel);
    mainToggleRow.appendChild(mainToggle);
    content.appendChild(mainToggleRow);

    // Sub-options container
    const subOptions = document.createElement("div");
    subOptions.style.cssText = `
      transition: opacity 0.3s ease;
    `;

    // Function to check if main toggle is enabled
    const getIsEnabled = () => settings.enabled;

    // Verse Color Row
    const verseRow = createColorOptionRow(
      "Verse",
      settings.verseEnabled,
      settings.verseColor,
      DEFAULT_VERSE_COLOR,
      async (enabled) => {
        settings.verseEnabled = enabled;
        await saveVerseChorusSettings(settings);
        applyVerseChorusColors(settings);
      },
      async (color) => {
        settings.verseColor = color;
        await saveVerseChorusSettings(settings);
        applyVerseChorusColors(settings);
      },
      getIsEnabled
    );
    subOptions.appendChild(verseRow);

    // Chorus Color Row
    const chorusRow = createColorOptionRow(
      "Chorus",
      settings.chorusEnabled,
      settings.chorusColor,
      DEFAULT_CHORUS_COLOR,
      async (enabled) => {
        settings.chorusEnabled = enabled;
        await saveVerseChorusSettings(settings);
        applyVerseChorusColors(settings);
      },
      async (color) => {
        settings.chorusColor = color;
        await saveVerseChorusSettings(settings);
        applyVerseChorusColors(settings);
      },
      getIsEnabled
    );
    subOptions.appendChild(chorusRow);

    // Intro/Instrumental/Outro Color Row (with green preset button)
    const introRow = createColorOptionRow(
      "Intro/Instr./Outro",
      settings.introEnabled,
      settings.introColor,
      DEFAULT_INTRO_COLOR,
      async (enabled) => {
        settings.introEnabled = enabled;
        await saveVerseChorusSettings(settings);
        applyVerseChorusColors(settings);
      },
      async (color) => {
        settings.introColor = color;
        await saveVerseChorusSettings(settings);
        applyVerseChorusColors(settings);
      },
      getIsEnabled,
      "#00ff00" // Green preset color
    );
    subOptions.appendChild(introRow);

    content.appendChild(subOptions);

    // Track enabled state for click prevention
    submenu.isColorsEnabled = settings.enabled;

    // Update sub-options visibility based on main toggle
    function updateSubOptionsVisibility() {
      subOptions.style.opacity = settings.enabled ? "1" : "0.4";
      subOptions.style.cursor = settings.enabled ? "auto" : "not-allowed";
      submenu.isColorsEnabled = settings.enabled;
      
      // Set cursor on all child elements too
      const allChildren = subOptions.querySelectorAll("*");
      allChildren.forEach((child) => {
        child.style.cursor = settings.enabled ? "" : "not-allowed";
      });
    }
    updateSubOptionsVisibility();

    // Store cleanup functions
    submenu.cleanups = [
      () => mainToggle.cleanup?.(),
      () => verseRow.cleanup?.(),
      () => chorusRow.cleanup?.(),
      () => introRow.cleanup?.(),
    ];
  });

  submenu.appendChild(content);
  return submenu;
};

/**
 * Dispose function for cleanup
 */
window.disposeVerseChorusColorsSubmenu = function (submenu, remove = false) {
  if (!submenu) return;

  // Run cleanup functions
  if (submenu.cleanups) {
    submenu.cleanups.forEach((cleanup) => cleanup?.());
  }

  // Remove back button listener
  if (submenu.backButton && submenu.backButtonClickHandler) {
    submenu.backButton.removeEventListener(
      "click",
      submenu.backButtonClickHandler
    );
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

// Expose for external use
window.applyVerseChorusColors = applyVerseChorusColors;
window.loadVerseChorusSettings = loadVerseChorusSettings;
