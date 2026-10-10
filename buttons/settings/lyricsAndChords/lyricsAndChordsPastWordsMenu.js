// Lyrics & Chords Past Words Menu
// This submenu allows users to control past words styling AND highlight color
// lyricsAndChordsPastWordsMenu.js

// ───────────────────────────────────────────────
// 0. CONSTANTS & DEFAULTS
// ───────────────────────────────────────────────

// Past Words
const PAST_WORDS_STORAGE_KEY = "yc_lyrics_chords_past_words_enabled";
const PAST_WORDS_COLOR_KEY = "yc_lyrics_chords_past_words_color";
const DEFAULT_PAST_WORDS_ENABLED = true; // Default: ON
const DEFAULT_PAST_WORDS_COLOR = "#e91e63"; // ורוד (כמו בקרוסלה)

// Highlight Color - per theme
const HIGHLIGHT_COLOR_STORAGE_KEY = "yc_highlight_color";
const HIGHLIGHT_APPLY_ALL_KEY = "yc_highlight_apply_all";
const HIGHLIGHT_ALL_COLOR_KEY = "yc_highlight_all_color";
const DEFAULT_HIGHLIGHT_COLORS = {
  black: "#2a2a2a",
  sepia: "#ffff00",
  light: "#d4e8fc"
};
const DEFAULT_HIGHLIGHT_ALL = "#ffff00"; // צהוב - ברירת מחדל ל-Apply to All
const DEFAULT_APPLY_ALL = false; // ברירת מחדל: OFF

// ───────────────────────────────────────────────
// 1. STATE MANAGEMENT
// ───────────────────────────────────────────────

// Initialize global state
function initPastWordsState() {
  const stored = localStorage.getItem(PAST_WORDS_STORAGE_KEY);
  window.lyricsChordsPastWordsEnabled = stored !== null ? stored === "true" : DEFAULT_PAST_WORDS_ENABLED;
  
  const storedColor = localStorage.getItem(PAST_WORDS_COLOR_KEY);
  window.lyricsChordsPastWordsColor = storedColor || DEFAULT_PAST_WORDS_COLOR;
  
  // Apply CSS variable
  updatePastWordsCSS();
}

// Update CSS variable for past words color
function updatePastWordsCSS() {
  document.documentElement.style.setProperty(
    "--yc-past-word-color",
    window.lyricsChordsPastWordsColor || DEFAULT_PAST_WORDS_COLOR
  );
}

function refreshPastWordsClassesForCurrentTime(enabled) {
  if (typeof window.ycRefreshLyricsChordsPastWords === "function") {
    window.ycRefreshLyricsChordsPastWords(enabled);
    return;
  }

  if (!enabled) {
    const pastWords = document.querySelectorAll(".lyrics-word.past-word");
    pastWords.forEach((el) => el.classList.remove("past-word"));
    return;
  }

  const video = document.querySelector("video");
  if (!video) return;

  const currentTime = video.currentTime;
  const allWords = document.querySelectorAll(".lyrics-word");
  let markedCount = 0;

  allWords.forEach((wordEl) => {
    const wordTime = parseFloat(wordEl.dataset.time);
    if (Number.isNaN(wordTime)) return;

    if (wordTime < currentTime && !wordEl.classList.contains("active")) {
      if (!wordEl.classList.contains("past-word")) markedCount++;
      wordEl.classList.add("past-word");
    } else if (wordTime >= currentTime && wordEl.classList.contains("past-word")) {
      wordEl.classList.remove("past-word");
    }
  });

  if (markedCount > 0) {
    console.log(`[PastWords] Synced ${markedCount} past words`);
  }
}

// Initialize Highlight Color state
function initHighlightColorState() {
  // Load per-theme colors
  const stored = localStorage.getItem(HIGHLIGHT_COLOR_STORAGE_KEY);
  if (stored) {
    try {
      window.ycHighlightColors = JSON.parse(stored);
    } catch (e) {
      window.ycHighlightColors = { ...DEFAULT_HIGHLIGHT_COLORS };
    }
  } else {
    window.ycHighlightColors = { ...DEFAULT_HIGHLIGHT_COLORS };
  }
  
  // Load Apply to All state
  const applyAllStored = localStorage.getItem(HIGHLIGHT_APPLY_ALL_KEY);
  window.ycHighlightApplyAll = applyAllStored === "true";
  
  // Load Apply to All color
  const allColorStored = localStorage.getItem(HIGHLIGHT_ALL_COLOR_KEY);
  window.ycHighlightAllColor = allColorStored || DEFAULT_HIGHLIGHT_ALL;
  
  updateHighlightColorCSS();
}

// Update CSS variables for highlight colors
function updateHighlightColorCSS() {
  if (window.ycHighlightApplyAll) {
    // Apply same color to all themes
    const color = window.ycHighlightAllColor || DEFAULT_HIGHLIGHT_ALL;
    document.documentElement.style.setProperty("--yc-highlight-color-black", color);
    document.documentElement.style.setProperty("--yc-highlight-color-sepia", color);
    document.documentElement.style.setProperty("--yc-highlight-color-light", color);
  } else {
    // Apply per-theme colors
    const colors = window.ycHighlightColors || DEFAULT_HIGHLIGHT_COLORS;
    document.documentElement.style.setProperty("--yc-highlight-color-black", colors.black);
    document.documentElement.style.setProperty("--yc-highlight-color-sepia", colors.sepia);
    document.documentElement.style.setProperty("--yc-highlight-color-light", colors.light);
  }
}

// Save highlight colors to localStorage
function saveHighlightColors() {
  localStorage.setItem(HIGHLIGHT_COLOR_STORAGE_KEY, JSON.stringify(window.ycHighlightColors));
  localStorage.setItem(HIGHLIGHT_APPLY_ALL_KEY, window.ycHighlightApplyAll);
  localStorage.setItem(HIGHLIGHT_ALL_COLOR_KEY, window.ycHighlightAllColor);
  updateHighlightColorCSS();
}

// Get current theme
function getCurrentTheme() {
  const panel = document.querySelector(".yt-lyrics-chords-panel");
  if (panel?.classList.contains("sepia-theme")) return "sepia";
  if (panel?.classList.contains("light-theme")) return "light";
  return "black";
}

// Initialize on load
initPastWordsState();
initHighlightColorState();

// ───────────────────────────────────────────────
// 2. TOGGLE SWITCH COMPONENT
// ───────────────────────────────────────────────

function createToggleSwitch(initialState, onChange) {
  const toggleContainer = document.createElement("div");
  toggleContainer.style.cssText = `display: flex; align-items: center; gap: 8px;`;

  let currentState = initialState;

  const toggle = document.createElement("div");
  toggle.style.cssText = `
    width: 40px; height: 20px;
    background-color: ${initialState ? "#3ea6ff" : "#666"};
    border-radius: 10px; position: relative;
    cursor: pointer; transition: background-color 0.3s ease;
  `;

  const toggleButton = document.createElement("div");
  toggleButton.style.cssText = `
    width: 16px; height: 16px; background-color: white;
    border-radius: 50%; position: absolute; top: 2px; left: 2px;
    transition: transform 0.3s ease;
    transform: translateX(${initialState ? "20px" : "0"});
  `;

  const status = document.createElement("span");
  status.textContent = initialState ? "ON" : "OFF";
  status.style.cssText = `
    color: ${initialState ? "#3ea6ff" : "#666"};
    font-size: 12px; font-weight: 500;
  `;

  toggle.appendChild(toggleButton);
  toggleContainer.appendChild(toggle);
  toggleContainer.appendChild(status);

  const clickHandler = (event) => {
    event.stopPropagation();
    currentState = !currentState;

    // Update UI
    toggle.style.backgroundColor = currentState ? "#3ea6ff" : "#666";
    toggleButton.style.transform = `translateX(${currentState ? "20px" : "0"})`;
    status.textContent = currentState ? "ON" : "OFF";
    status.style.color = currentState ? "#3ea6ff" : "#666";

    onChange?.(currentState);
  };

  toggle.addEventListener("click", clickHandler, { passive: true });

  return {
    toggleContainer,
    toggle,
    status,
    toggleButton,
    getCurrentState: () => currentState,
    cleanup: () => toggle.removeEventListener("click", clickHandler),
  };
}

// ───────────────────────────────────────────────
// 3. MENU CONSTRUCTION
// ───────────────────────────────────────────────

window.createLyricsAndChordsPastWordsSubmenu = function (parentMenu) {
  const submenu = document.createElement("div");
  submenu.className = "settings-menu lyrics-chords-past-words-submenu yc";
  submenu.setAttribute("data-yc-menu", "lyrics-chords-past-words");
  submenu.style.cssText = `
    position: absolute;
    background: rgba(28, 28, 28, 0.95);
    right: 12px;
    border-radius: 8px;
    padding: 0;
    z-index: 2001;
    width: 300px;
    font-family: Roboto, Arial, sans-serif;
    color: #fff;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    display: none;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
  `;

  // Cleanup array for event listeners
  submenu.cleanups = [];

  // --- Header ---
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
    font-size: 14px;
  `;

  const backClickHandler = (e) => {
    e.stopPropagation();
    submenu.style.display = "none";
    if (parentMenu) parentMenu.style.display = "block";
  };
  backButton.addEventListener("click", backClickHandler);
  submenu.cleanups.push(() => backButton.removeEventListener("click", backClickHandler));

  const headerText = document.createElement("span");
  headerText.textContent = "Word Colors";
  headerText.style.fontWeight = "500";

  header.appendChild(backButton);
  header.appendChild(headerText);
  submenu.appendChild(header);

  // --- Options Container ---
  const optionsContainer = document.createElement("div");
  optionsContainer.style.padding = "8px 0";

  // Helper: Add hover effect
  const addHoverEffect = (element) => {
    const clickHandler = (e) => e.stopPropagation();
    const mouseoverHandler = () => {
      element.style.backgroundColor = "rgba(255,255,255,0.1)";
    };
    const mouseoutHandler = () => {
      element.style.backgroundColor = "transparent";
    };
    element.style.cursor = "pointer";
    element.addEventListener("click", clickHandler);
    element.addEventListener("mouseover", mouseoverHandler);
    element.addEventListener("mouseout", mouseoutHandler);
    submenu.cleanups.push(
      () => element.removeEventListener("click", clickHandler),
      () => element.removeEventListener("mouseover", mouseoverHandler),
      () => element.removeEventListener("mouseout", mouseoutHandler)
    );
  };

  // ─────────────────────────────────────────────
  // 1. ENABLE TOGGLE
  // ─────────────────────────────────────────────
  const toggleOption = document.createElement("div");
  toggleOption.className = "settings-item";
  toggleOption.style.cssText = `
    padding: 12px 24px;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;

  const toggleText = document.createElement("span");
  toggleText.textContent = "Enable Past Words Color";
  toggleText.style.color = "#ffffff";

  // Get current state
  const storedEnabled = localStorage.getItem(PAST_WORDS_STORAGE_KEY);
  const isEnabled = storedEnabled !== null ? storedEnabled === "true" : DEFAULT_PAST_WORDS_ENABLED;
  window.lyricsChordsPastWordsEnabled = isEnabled;

  // Reference to color picker for enabling/disabling
  let colorInput = null;
  let defaultBtn = null;
  let colorOptionRow = null; // 🎯 Reference לשורה של Color Picker

  const toggleComp = createToggleSwitch(isEnabled, (newState) => {
    // Save state
    localStorage.setItem(PAST_WORDS_STORAGE_KEY, newState);
    window.lyricsChordsPastWordsEnabled = newState;

    // 🎯 Update entire color row state (cursor + opacity for whole row)
    if (colorOptionRow) {
      colorOptionRow.style.cursor = newState ? "default" : "not-allowed";
      colorOptionRow.style.opacity = newState ? "1" : "0.5";
      // עדכון כל האלמנטים הילדים
      const allChildren = colorOptionRow.querySelectorAll("*");
      allChildren.forEach((child) => {
        child.style.cursor = newState ? "" : "not-allowed";
      });
    }

    // Update color picker state
    if (colorInput) {
      colorInput.disabled = !newState;
      colorInput.style.cursor = newState ? "pointer" : "not-allowed";
      colorInput.style.opacity = newState ? "1" : "0.5";
    }
    if (defaultBtn) {
      defaultBtn.style.cursor = newState ? "pointer" : "not-allowed";
      defaultBtn.style.opacity = newState ? "1" : "0.5";
      defaultBtn.style.pointerEvents = newState ? "auto" : "none";
    }

    refreshPastWordsClassesForCurrentTime(newState);

    console.log(`[PastWords] ${newState ? "Enabled" : "Disabled"}`);
  });

  toggleComp.toggle.className = "past-words-toggle";
  submenu.cleanups.push(toggleComp.cleanup);

  toggleOption.appendChild(toggleText);
  toggleOption.appendChild(toggleComp.toggleContainer);
  addHoverEffect(toggleOption);

  // ─────────────────────────────────────────────
  // 2. COLOR PICKER
  // ─────────────────────────────────────────────
  const colorOption = document.createElement("div");
  colorOption.className = "settings-item past-words-color-row";
  colorOption.style.cssText = `
    padding: 12px 24px;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: ${isEnabled ? "default" : "not-allowed"};
    opacity: ${isEnabled ? "1" : "0.5"};
  `;
  colorOptionRow = colorOption; // 🎯 שמירת reference

  const colorLabel = document.createElement("span");
  colorLabel.textContent = "Past Words Color";
  colorLabel.style.cssText = `
    font-size: 12px;
    color: #ddd;
  `;

  const controlsContainer = document.createElement("div");
  controlsContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  const currentColor = localStorage.getItem(PAST_WORDS_COLOR_KEY) || DEFAULT_PAST_WORDS_COLOR;

  // Color input
  colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = currentColor;
  colorInput.disabled = !isEnabled;
  colorInput.style.cssText = `
    width: 40px;
    height: 24px;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 4px;
    cursor: ${isEnabled ? "pointer" : "not-allowed"};
    background: transparent;
    opacity: ${isEnabled ? "1" : "0.5"};
  `;

  const colorInputHandler = (e) => {
    e.stopPropagation();
    if (!window.lyricsChordsPastWordsEnabled) return;
    
    const color = e.target.value;
    localStorage.setItem(PAST_WORDS_COLOR_KEY, color);
    window.lyricsChordsPastWordsColor = color;
    updatePastWordsCSS();
    console.log(`[PastWords] Color changed to: ${color}`);
  };

  const colorClickHandler = (e) => e.stopPropagation();
  colorInput.addEventListener("input", colorInputHandler);
  colorInput.addEventListener("click", colorClickHandler);
  submenu.cleanups.push(
    () => colorInput.removeEventListener("input", colorInputHandler),
    () => colorInput.removeEventListener("click", colorClickHandler)
  );

  // Default button (reset)
  defaultBtn = document.createElement("div");
  defaultBtn.title = "Reset to Default";
  defaultBtn.style.cssText = `
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: ${isEnabled ? "pointer" : "not-allowed"};
    border: 1px solid rgba(255,255,255,0.2);
    transition: all 0.2s;
    background: rgba(255,255,255,0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: ${isEnabled ? "1" : "0.5"};
    pointer-events: ${isEnabled ? "auto" : "none"};
  `;
  defaultBtn.innerHTML = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 14px; height: 14px; fill: #aaa;">
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
    </svg>
  `;

  const defaultClickHandler = (e) => {
    e.stopPropagation();
    if (!window.lyricsChordsPastWordsEnabled) return;
    
    localStorage.setItem(PAST_WORDS_COLOR_KEY, DEFAULT_PAST_WORDS_COLOR);
    colorInput.value = DEFAULT_PAST_WORDS_COLOR;
    window.lyricsChordsPastWordsColor = DEFAULT_PAST_WORDS_COLOR;
    updatePastWordsCSS();
    console.log(`[PastWords] Color reset to default: ${DEFAULT_PAST_WORDS_COLOR}`);
  };

  const defaultMouseenterHandler = () => {
    if (window.lyricsChordsPastWordsEnabled) {
      defaultBtn.style.background = "rgba(255,255,255,0.2)";
    }
  };
  const defaultMouseleaveHandler = () => {
    defaultBtn.style.background = "rgba(255,255,255,0.1)";
  };

  defaultBtn.addEventListener("click", defaultClickHandler);
  defaultBtn.addEventListener("mouseenter", defaultMouseenterHandler);
  defaultBtn.addEventListener("mouseleave", defaultMouseleaveHandler);
  submenu.cleanups.push(
    () => defaultBtn.removeEventListener("click", defaultClickHandler),
    () => defaultBtn.removeEventListener("mouseenter", defaultMouseenterHandler),
    () => defaultBtn.removeEventListener("mouseleave", defaultMouseleaveHandler)
  );

  controlsContainer.appendChild(colorInput);
  controlsContainer.appendChild(defaultBtn);

  colorOption.appendChild(colorLabel);
  colorOption.appendChild(controlsContainer);
  addHoverEffect(colorOption);

  // ─────────────────────────────────────────────
  // 3. HIGHLIGHT COLOR SECTION
  // ─────────────────────────────────────────────
  
  // Section Header
  const highlightHeader = document.createElement("div");
  highlightHeader.style.cssText = `
    padding: 12px 24px 8px 24px;
    font-size: 13px;
    font-weight: 500;
    color: #fff;
    border-top: 1px solid rgba(255,255,255,0.1);
    margin-top: 8px;
  `;
  highlightHeader.textContent = "Highlight Color";

  // References for theme rows (to enable/disable based on Apply All toggle)
  let themeRows = [];
  let applyAllColorInput = null;
  let applyAllResetBtn = null;

  // ─────────────────────────────────────────────
  // 3.1 APPLY TO ALL THEMES - with Toggle
  // ─────────────────────────────────────────────
  const applyAllRow = document.createElement("div");
  applyAllRow.className = "settings-item highlight-color-row";
  applyAllRow.style.cssText = `
    padding: 12px 24px;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;

  const applyAllLabel = document.createElement("span");
  applyAllLabel.textContent = "Apply to all themes";
  applyAllLabel.style.cssText = `
    font-size: 12px;
    color: #ddd;
  `;

  const applyAllControls = document.createElement("div");
  applyAllControls.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  // Get current Apply All state
  const isApplyAllEnabled = window.ycHighlightApplyAll || false;

  // Color input for Apply All
  applyAllColorInput = document.createElement("input");
  applyAllColorInput.type = "color";
  applyAllColorInput.value = window.ycHighlightAllColor || DEFAULT_HIGHLIGHT_ALL;
  applyAllColorInput.disabled = !isApplyAllEnabled;
  applyAllColorInput.style.cssText = `
    width: 40px;
    height: 24px;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 4px;
    cursor: ${isApplyAllEnabled ? "pointer" : "not-allowed"};
    background: transparent;
    opacity: ${isApplyAllEnabled ? "1" : "0.5"};
  `;

  const applyAllColorHandler = (e) => {
    e.stopPropagation();
    if (!window.ycHighlightApplyAll) return;
    
    const color = e.target.value;
    window.ycHighlightAllColor = color;
    saveHighlightColors();
    console.log(`[HighlightColor] Apply All color changed to: ${color}`);
  };

  applyAllColorInput.addEventListener("input", applyAllColorHandler);
  const applyAllColorClick = (e) => e.stopPropagation();
  applyAllColorInput.addEventListener("click", applyAllColorClick);
  submenu.cleanups.push(
    () => applyAllColorInput.removeEventListener("input", applyAllColorHandler),
    () => applyAllColorInput.removeEventListener("click", applyAllColorClick)
  );

  // Reset button for Apply All
  applyAllResetBtn = document.createElement("div");
  applyAllResetBtn.title = "Reset to Default";
  applyAllResetBtn.style.cssText = `
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: ${isApplyAllEnabled ? "pointer" : "not-allowed"};
    border: 1px solid rgba(255,255,255,0.2);
    transition: all 0.2s;
    background: rgba(255,255,255,0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: ${isApplyAllEnabled ? "1" : "0.5"};
  `;
  applyAllResetBtn.innerHTML = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 14px; height: 14px; fill: #aaa;">
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
    </svg>
  `;

  const applyAllResetHandler = (e) => {
    e.stopPropagation();
    if (!window.ycHighlightApplyAll) return;
    
    applyAllColorInput.value = DEFAULT_HIGHLIGHT_ALL;
    window.ycHighlightAllColor = DEFAULT_HIGHLIGHT_ALL;
    saveHighlightColors();
    console.log(`[HighlightColor] Apply All reset to default: ${DEFAULT_HIGHLIGHT_ALL}`);
  };

  applyAllResetBtn.addEventListener("click", applyAllResetHandler);
  const applyAllResetMouseenter = () => {
    if (window.ycHighlightApplyAll) applyAllResetBtn.style.background = "rgba(255,255,255,0.2)";
  };
  const applyAllResetMouseleave = () => applyAllResetBtn.style.background = "rgba(255,255,255,0.1)";
  applyAllResetBtn.addEventListener("mouseenter", applyAllResetMouseenter);
  applyAllResetBtn.addEventListener("mouseleave", applyAllResetMouseleave);
  submenu.cleanups.push(
    () => applyAllResetBtn.removeEventListener("click", applyAllResetHandler),
    () => applyAllResetBtn.removeEventListener("mouseenter", applyAllResetMouseenter),
    () => applyAllResetBtn.removeEventListener("mouseleave", applyAllResetMouseleave)
  );

  // Toggle for Apply All
  const applyAllToggle = createToggleSwitch(isApplyAllEnabled, (newState) => {
    window.ycHighlightApplyAll = newState;
    saveHighlightColors();

    // Update color input and reset button state
    applyAllColorInput.disabled = !newState;
    applyAllColorInput.style.cursor = newState ? "pointer" : "not-allowed";
    applyAllColorInput.style.opacity = newState ? "1" : "0.5";
    
    applyAllResetBtn.style.cursor = newState ? "pointer" : "not-allowed";
    applyAllResetBtn.style.opacity = newState ? "1" : "0.5";

    // Update theme rows state (disable when Apply All is ON)
    themeRows.forEach(row => {
      row.style.opacity = newState ? "0.5" : "1";
      row.style.pointerEvents = newState ? "none" : "auto";
      const input = row.querySelector('input[type="color"]');
      if (input) {
        input.disabled = newState;
        input.style.cursor = newState ? "not-allowed" : "pointer";
      }
    });

    console.log(`[HighlightColor] Apply to All: ${newState ? "ON" : "OFF"}`);
  });

  submenu.cleanups.push(applyAllToggle.cleanup);

  applyAllControls.appendChild(applyAllColorInput);
  applyAllControls.appendChild(applyAllResetBtn);
  applyAllControls.appendChild(applyAllToggle.toggleContainer);

  applyAllRow.appendChild(applyAllLabel);
  applyAllRow.appendChild(applyAllControls);
  addHoverEffect(applyAllRow);

  // Separator
  const separator = document.createElement("div");
  separator.style.cssText = `
    padding: 8px 24px;
    font-size: 11px;
    color: #666;
  `;
  separator.textContent = "Or set per theme:";

  // Helper: Create color row for themes
  const createThemeColorRow = (label, themeKey, defaultColor, icon = null) => {
    const row = document.createElement("div");
    row.className = "settings-item highlight-color-row theme-color-row";
    row.style.cssText = `
      padding: 12px 24px;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      opacity: ${isApplyAllEnabled ? "0.5" : "1"};
      pointer-events: ${isApplyAllEnabled ? "none" : "auto"};
    `;

    const labelContainer = document.createElement("span");
    labelContainer.style.cssText = `
      font-size: 12px;
      color: #ddd;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    if (icon) {
      const themeIcon = document.createElement("span");
      themeIcon.style.cssText = `
        width: 16px;
        height: 16px;
        border-radius: 4px;
        display: inline-block;
        ${icon}
      `;
      labelContainer.appendChild(themeIcon);
    }

    const labelText = document.createElement("span");
    labelText.textContent = label;
    labelContainer.appendChild(labelText);

    const controls = document.createElement("div");
    controls.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    // Get current color
    const currentColor = window.ycHighlightColors?.[themeKey] || defaultColor;

    // Color input
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = currentColor;
    colorInput.dataset.theme = themeKey;
    colorInput.dataset.default = defaultColor;
    colorInput.disabled = isApplyAllEnabled;
    colorInput.style.cssText = `
      width: 40px;
      height: 24px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 4px;
      cursor: ${isApplyAllEnabled ? "not-allowed" : "pointer"};
      background: transparent;
    `;

    const colorInputHandler = (e) => {
      e.stopPropagation();
      if (window.ycHighlightApplyAll) return;
      
      const color = e.target.value;
      window.ycHighlightColors[themeKey] = color;
      saveHighlightColors();
      console.log(`[HighlightColor] ${themeKey} changed to: ${color}`);
    };

    colorInput.addEventListener("input", colorInputHandler);
    const colorInputClick = (e) => e.stopPropagation();
    colorInput.addEventListener("click", colorInputClick);
    submenu.cleanups.push(
      () => colorInput.removeEventListener("input", colorInputHandler),
      () => colorInput.removeEventListener("click", colorInputClick)
    );

    // Reset button
    const resetBtn = document.createElement("div");
    resetBtn.title = "Reset to Default";
    resetBtn.style.cssText = `
      width: 24px;
      height: 24px;
      border-radius: 4px;
      cursor: pointer;
      border: 1px solid rgba(255,255,255,0.2);
      transition: all 0.2s;
      background: rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    resetBtn.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 14px; height: 14px; fill: #aaa;">
        <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
      </svg>
    `;

    const resetClickHandler = (e) => {
      e.stopPropagation();
      if (window.ycHighlightApplyAll) return;
      
      colorInput.value = defaultColor;
      window.ycHighlightColors[themeKey] = defaultColor;
      saveHighlightColors();
      console.log(`[HighlightColor] ${themeKey} reset to default: ${defaultColor}`);
    };

    const resetMouseenter = () => resetBtn.style.background = "rgba(255,255,255,0.2)";
    const resetMouseleave = () => resetBtn.style.background = "rgba(255,255,255,0.1)";
    resetBtn.addEventListener("click", resetClickHandler);
    resetBtn.addEventListener("mouseenter", resetMouseenter);
    resetBtn.addEventListener("mouseleave", resetMouseleave);
    submenu.cleanups.push(
      () => resetBtn.removeEventListener("click", resetClickHandler),
      () => resetBtn.removeEventListener("mouseenter", resetMouseenter),
      () => resetBtn.removeEventListener("mouseleave", resetMouseleave)
    );

    controls.appendChild(colorInput);
    controls.appendChild(resetBtn);

    row.appendChild(labelContainer);
    row.appendChild(controls);
    addHoverEffect(row);

    return row;
  };

  // Theme rows
  const blackRow = createThemeColorRow("BLACK", "black", DEFAULT_HIGHLIGHT_COLORS.black, "background: #1a1a1a; border: 1px solid #444;");
  const sepiaRow = createThemeColorRow("SEPIA", "sepia", DEFAULT_HIGHLIGHT_COLORS.sepia, "background: #f5e6c8;");
  const lightRow = createThemeColorRow("LIGHT", "light", DEFAULT_HIGHLIGHT_COLORS.light, "background: #ffffff; border: 1px solid #ddd;");
  
  // Store references for toggle to update
  themeRows = [blackRow, sepiaRow, lightRow];

  // Highlight Info Text
  const highlightInfoText = document.createElement("div");
  highlightInfoText.style.cssText = `
    padding: 12px 24px;
    font-size: 11px;
    color: #888;
    border-top: 1px solid rgba(255,255,255,0.1);
  `;
  highlightInfoText.textContent = "Changes the highlight color for the current word being sung.";

  // ─────────────────────────────────────────────
  // APPEND ALL
  // ─────────────────────────────────────────────
  optionsContainer.appendChild(toggleOption);
  optionsContainer.appendChild(colorOption);
  
  // Highlight Color Section
  optionsContainer.appendChild(highlightHeader);
  optionsContainer.appendChild(applyAllRow);
  optionsContainer.appendChild(separator);
  optionsContainer.appendChild(blackRow);
  optionsContainer.appendChild(sepiaRow);
  optionsContainer.appendChild(lightRow);
  optionsContainer.appendChild(highlightInfoText);
  
  submenu.appendChild(optionsContainer);

  // --- Position Observer ---
  const observer = new MutationObserver(() => {
    if (submenu.style.display === "block") {
      window.placeNearControls?.(submenu);
      observer.disconnect();
    }
  });
  observer.observe(submenu, { attributes: true, attributeFilter: ["style"] });
  submenu.observer = observer;

  return submenu;
};

// ───────────────────────────────────────────────
// 4. CLEANUP
// ───────────────────────────────────────────────

window.disposeLyricsAndChordsPastWordsSubmenu = function (submenu, remove = false) {
  if (!submenu) {
    submenu = document.querySelector(".lyrics-chords-past-words-submenu");
  }

  if (submenu) {
    // Kill Observer
    if (submenu.observer) {
      submenu.observer.disconnect();
      delete submenu.observer;
    }

    // Kill Listeners
    if (remove && submenu.cleanups) {
      submenu.cleanups.forEach((fn) => fn());
      delete submenu.cleanups;
    }

    // Remove DOM if needed
    if (remove && submenu.parentNode) {
      submenu.parentNode.removeChild(submenu);
    }
  }
};

// ───────────────────────────────────────────────
// 5. RESET FUNCTION (for Reset to Default)
// ───────────────────────────────────────────────

window.resetLyricsChordsPastWordsSettings = function () {
  // Reset Past Words
  localStorage.setItem(PAST_WORDS_STORAGE_KEY, DEFAULT_PAST_WORDS_ENABLED);
  localStorage.setItem(PAST_WORDS_COLOR_KEY, DEFAULT_PAST_WORDS_COLOR);
  window.lyricsChordsPastWordsEnabled = DEFAULT_PAST_WORDS_ENABLED;
  window.lyricsChordsPastWordsColor = DEFAULT_PAST_WORDS_COLOR;
  updatePastWordsCSS();
  
  refreshPastWordsClassesForCurrentTime(DEFAULT_PAST_WORDS_ENABLED);
  
  // Reset Highlight Colors
  localStorage.removeItem(HIGHLIGHT_COLOR_STORAGE_KEY);
  localStorage.removeItem(HIGHLIGHT_APPLY_ALL_KEY);
  localStorage.removeItem(HIGHLIGHT_ALL_COLOR_KEY);
  window.ycHighlightColors = { ...DEFAULT_HIGHLIGHT_COLORS };
  window.ycHighlightApplyAll = DEFAULT_APPLY_ALL;
  window.ycHighlightAllColor = DEFAULT_HIGHLIGHT_ALL;
  updateHighlightColorCSS();
  
  // Close and dispose the submenu so it rebuilds with new values
  const submenu = document.querySelector(".lyrics-chords-past-words-submenu");
  if (submenu) {
    window.disposeLyricsAndChordsPastWordsSubmenu(submenu, true);
  }
  
  console.log("[PastWords] Settings reset to default");
  return true;
};
