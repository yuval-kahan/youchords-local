// --- START OF FILE subtitlesInChordsMenu.js ---

// Subtitles In Chords submenu with toggle switch & Fixes for Layout/Sync/CSS
// subtitlesInChordsMenu.js

// ───────────────────────────────────────────────
// 0. BOOTSTRAP  –  DEBUG FLAG & CLEANUP
// ───────────────────────────────────────────────

const DBG_ENABLED = false;

// Proxy-getter to ensure external scripts see DEBUG as false
Object.defineProperty(window, "DEBUG", {
  get() {
    return false;
  },
  set() {},
});

// Clean up previous references to prevent memory leaks
delete window.updateSubtitlesInChordsState;
delete window.updateSubtitlesInChords;
window.YC_MENUS = window.YC_MENUS || {};

// ------------------------------------------------------------
// 1. TOOLING – Safe Logger
// ------------------------------------------------------------
const DBG = () => {}; // Empty logger for production

const YC_SUBTITLES_IN_CHORDS_WHISPER_LANGUAGES = [
  { code: "auto", name: "Auto — זיהוי אוטומטי" },
  { code: "en", name: "English — אנגלית" },
  { code: "he", name: "Hebrew — עברית" },
  { code: "es", name: "Spanish — ספרדית" },
  { code: "fr", name: "French — צרפתית" },
  { code: "de", name: "German — גרמנית" },
  { code: "it", name: "Italian — איטלקית" },
  { code: "pt", name: "Portuguese — פורטוגזית" },
  { code: "ru", name: "Russian — רוסית" },
  { code: "ar", name: "Arabic — ערבית" },
  { code: "ja", name: "Japanese — יפנית" },
  { code: "ko", name: "Korean — קוריאנית" },
  { code: "zh", name: "Chinese — סינית" },
  { code: "hi", name: "Hindi — הינדית" },
  { code: "tr", name: "Turkish — טורקית" },
  { code: "nl", name: "Dutch — הולנדית" },
  { code: "pl", name: "Polish — פולנית" },
  { code: "uk", name: "Ukrainian — אוקראינית" },
  { code: "sv", name: "Swedish — שוודית" },
  { code: "da", name: "Danish — דנית" },
  { code: "no", name: "Norwegian — נורווגית" },
  { code: "fi", name: "Finnish — פינית" },
  { code: "cs", name: "Czech — צ׳כית" },
  { code: "el", name: "Greek — יוונית" },
  { code: "ro", name: "Romanian — רומנית" },
  { code: "hu", name: "Hungarian — הונגרית" },
  { code: "id", name: "Indonesian — אינדונזית" },
  { code: "vi", name: "Vietnamese — וייטנאמית" },
  { code: "th", name: "Thai — תאילנדית" },
  { code: "fa", name: "Persian — פרסית" },
];

const YC_SUBTITLES_IN_CHORDS_WHISPER_MODELS = [
  { code: "large-v2", name: "Whisper large-v2 — Default" },
  { code: "large-v3", name: "Whisper large-v3 — More accurate" },
];

window.addEventListener("error", (e) => {
  // Silent catch in production
});

// ------------------------------------------------------------
// 2. LOGIC – State Management & Sync Fixes
// ------------------------------------------------------------

// Helper to update the toggle UI only
function updateSubtitlesInChordsState(isEnabled) {
  const toggle = document.querySelector(".subtitles-in-chords-toggle");
  if (toggle) {
    toggle.style.backgroundColor = isEnabled ? "#3ea6ff" : "#666";
    const toggleButton = toggle.querySelector("div");
    if (toggleButton) {
      toggleButton.style.transform = `translateX(${isEnabled ? "20px" : "0"})`;
    }
    const status = toggle.parentElement?.querySelector("span:last-child");
    if (status) {
      status.textContent = isEnabled ? "ON" : "OFF";
      status.style.color = isEnabled ? "#3ea6ff" : "#666";
    }
  }
}
window.updateSubtitlesInChordsState = updateSubtitlesInChordsState;

// Main Logic: Handles Toggling with Layout Force & Sync
window.updateSubtitlesInChords = function (isEnabled, keepSubmenuOpen = true) {
  // 1. Save state
  window.carouselSubtitlesEnabled = isEnabled;
  try {
    localStorage.setItem("yc_carousel_subtitles_enabled", isEnabled);
  } catch (err) {
    /* ignore storage errors */
  }

  // 2. Update UI Switch
  updateSubtitlesInChordsState(isEnabled);

  // 3. Handle Active Instance (Fixes for "Hole" and "Sync")
  const instance = window.CarouselSubtitles?.activeInstance;
  const video = document.querySelector("video");

  if (instance) {
    if (isEnabled) {
      // -- FIX 2: Re-enable and Force Sync --
      instance.show();

      // Force immediate content update based on current time
      // instead of waiting for the next chord/interval
      if (video && typeof instance.update === "function") {
        instance.update(video.currentTime);
      }
    } else {
      // -- FIX 1: Disable and Force Layout Recalc --
      instance.hide();
    }
  }

  // -- FIX 1 (Continued): Force Carousel Layout Update --
  // Directly call _updateVideoLayout on the carousel to immediately
  // recalculate the video container height, closing the "hole" left by subtitles.
  requestAnimationFrame(() => {
    if (
      window.ycChordCarousel &&
      typeof window.ycChordCarousel._updateVideoLayout === "function"
    ) {
      window.ycChordCarousel._updateVideoLayout();
    }
  });

  // 4. Keep submenu open logic
  if (!keepSubmenuOpen) {
    setTimeout(() => {
      const parent = document.querySelector(".chords-submenu");
      const self = document.querySelector(".subtitles-in-chords-submenu");
      if (self) self.style.display = "none";
      if (parent) parent.style.display = "block";
    }, 100);
  }
};

// Toggle Switch Component Creator (FIXED: Uses local state instead of global)
function createToggleSwitch(initialState, onChange) {
  const toggleContainer = document.createElement("div");
  toggleContainer.style.cssText = `display: flex; align-items: center; gap: 8px;`;

  // FIX: Use local state variable instead of global
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

    // FIX: Toggle local state instead of global
    currentState = !currentState;
    const newState = currentState;

    // Local UI update (fast feedback)
    toggle.style.backgroundColor = newState ? "#3ea6ff" : "#666";
    toggleButton.style.transform = `translateX(${newState ? "20px" : "0"})`;
    status.textContent = newState ? "ON" : "OFF";
    status.style.color = newState ? "#3ea6ff" : "#666";

    onChange?.(newState);

    // Keep menu open
    const submenu = document.querySelector(".subtitles-in-chords-submenu");
    if (submenu) submenu.style.display = "block";
  };

  toggle.addEventListener("click", clickHandler, { passive: true });

  return {
    toggleContainer,
    toggle,
    cleanup: () => toggle.removeEventListener("click", clickHandler),
  };
}

// Menu Singleton Helper
function getOrCreateMenu(id, buildFn, parentMenu) {
  let menu = window.YC_MENUS[id];

  if (menu && !menu.isConnected) {
    window.disposeSubtitlesInChordsSubmenu?.(menu, true);
    menu = null;
  }

  if (menu) {
    parentMenu?.style && (parentMenu.style.display = "none");
    menu.style.display = "block";
    window.placeNearControls?.(menu);

    // Sync state on reopen
    const stored = localStorage.getItem("yc_carousel_subtitles_enabled");
    const isEnabled = stored !== null ? stored === "true" : true;
    window.carouselSubtitlesEnabled = isEnabled;
    window.updateSubtitlesInChordsState?.(isEnabled);

    return menu;
  }

  menu = buildFn(parentMenu);
  menu.dataset.ycMenu = id;
  window.YC_MENUS[id] = menu;
  window.placeNearControls?.(menu);
  return menu;
}

// ------------------------------------------------------------
// 3. MENU CONSTRUCTION
// ------------------------------------------------------------

window.createSubtitlesInChordsSubmenu = function (parentMenu) {
  const submenu = getOrCreateMenu(
    "subtitles-in-chords",
    (_parent) => {
      const el = document.createElement("div");
      el.className = "settings-menu subtitles-in-chords-submenu yc";
      return el;
    },
    parentMenu
  );

  if (submenu.dataset.built) {
    window.placeNearControls?.(submenu);
    return submenu;
  }
  submenu.dataset.built = "1";

  // Style
  submenu.style.cssText = `
        position: absolute; background: rgba(28, 28, 28, 0.95);
        right: 12px; border-radius: 8px; padding: 0;
        z-index: 2001; width: 340px;
        font-family: Roboto, Arial, sans-serif; color: #fff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        display: none; overflow-y: auto; overflow-x: hidden;
        user-select: none; -webkit-user-select: none;
        max-height: 450px;
    `;

  // Cleanup array for all event listeners (memory management)
  submenu.cleanups = [];

  // --- Header ---
  const header = document.createElement("div");
  header.style.cssText = `padding: 12px 24px; font-size: 13px; display: flex; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1);`;

  const backButton = document.createElement("span");
  backButton.innerHTML = "◄";
  backButton.style.cssText = `cursor: pointer; margin-right: 12px; color: #aaa; font-size: 14px;`;
  const backClickHandler = (e) => {
    e.stopPropagation();
    submenu.style.display = "none";
    if (parentMenu) parentMenu.style.display = "block";
  };
  backButton.addEventListener("click", backClickHandler);
  submenu.cleanups.push(() =>
    backButton.removeEventListener("click", backClickHandler)
  );

  const headerText = document.createElement("span");
  headerText.textContent = "Subtitles In Chords";
  headerText.style.fontWeight = "500";

  header.appendChild(backButton);
  header.appendChild(headerText);
  submenu.appendChild(header);

  // --- Reset Option (at top, after header) ---
  const resetOption = document.createElement("div");
  resetOption.className = "settings-item reset-subtitles-settings";
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

  const resetText = document.createElement("span");
  resetText.textContent = "Reset Subtitles Settings";
  resetText.style.color = "#ff3860";

  resetOption.appendChild(resetText);

  // Actual reset function
  const performSubtitlesReset = async () => {
    try {
      // Reset all subtitles settings to defaults
      localStorage.setItem("yc_carousel_subtitles_enabled", "true");
      localStorage.setItem("yc_carousel_split_lines", "true");
      localStorage.setItem("yc_carousel_subtitle_font_size", "20");
      localStorage.setItem("yc_carousel_word_spacing", "-3.6");
      localStorage.setItem("yc_carousel_word_highlight", "true");
      localStorage.setItem("yc_carousel_passed_words", "true");
      await chrome.storage.local.set({
        whisperSubtitleLanguage: "auto",
        whisperSubtitleModel: "large-v2",
      });

      // Reset colors to defaults
      localStorage.setItem("yc_carousel_subtitle_panel_bg", "#f9f9f9");
      localStorage.setItem("yc_carousel_subtitle_ellipse_bg", "#ffffff");
      localStorage.setItem("yc_carousel_subtitle_highlight", "#ffff00");
      localStorage.setItem("yc_carousel_subtitle_highlight_text", "#000000");
      localStorage.setItem("yc_carousel_subtitle_word_color", "#000000");
      localStorage.setItem("yc_carousel_subtitle_passed_color", "#e91e63");

      // Update global state
      window.carouselSubtitlesEnabled = true;
      window.wordHighlightEnabled = true;
      window.passedWordsEnabled = true;

      // Apply to active instance if exists
      if (window.CarouselSubtitles?.activeInstance) {
        const instance = window.CarouselSubtitles.activeInstance;
        instance.show();
        if (typeof instance.updateFontSize === "function")
          instance.updateFontSize(20);
        if (typeof instance.updateWordSpacing === "function")
          instance.updateWordSpacing(-3.6);
        if (typeof instance.updateSplitLines === "function")
          instance.updateSplitLines(true);
        if (typeof instance.updatePanelBackground === "function")
          instance.updatePanelBackground("#f9f9f9");
        if (typeof instance.updateEllipseBackground === "function")
          instance.updateEllipseBackground("#ffffff");
        if (typeof instance.updateHighlightColor === "function")
          instance.updateHighlightColor("#ffff00");
        if (typeof instance.updateHighlightTextColor === "function")
          instance.updateHighlightTextColor("#000000");
        if (typeof instance.updateWordColor === "function")
          instance.updateWordColor("#000000");
      }

      // Update UI toggle
      window.updateSubtitlesInChordsState?.(true);

      console.log("[SubtitlesInChords] ✅ Reset to default completed");
      return true;
    } catch (error) {
      console.error("[SubtitlesInChords] ❌ Reset failed:", error);
      return false;
    }
  };

  // Show confirmation dialog
  const resetClickHandler = () => {
    const existingOverlay = document.querySelector(".yc-confirm-overlay");
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement("div");
    overlay.className = "yc-confirm-overlay";
    overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.7);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

    const dialog = document.createElement("div");
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
            <h3 style="margin: 0 0 16px; font-size: 16px;">Reset Subtitles Settings?</h3>
            <p style="margin: 0 0 20px; font-size: 13px; color: #aaa;">
                This will reset all subtitle settings including colors, font size, and spacing to defaults.
            </p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="yc-cancel-reset-subtitles" style="
                    padding: 8px 20px;
                    background: #444;
                    color: #fff;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                ">Cancel</button>
                <button id="yc-confirm-reset-subtitles" style="
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

    const cancelBtn = dialog.querySelector("#yc-cancel-reset-subtitles");
    const confirmBtn = dialog.querySelector("#yc-confirm-reset-subtitles");

    const cleanup = () => {
      cancelBtn.removeEventListener("click", handleCancel);
      confirmBtn.removeEventListener("click", handleConfirm);
      overlay.removeEventListener("click", handleOverlayClick);
      overlay.remove();
    };

    const handleCancel = () => cleanup();
    const handleOverlayClick = (e) => {
      if (e.target === overlay) cleanup();
    };
    const handleConfirm = async () => {
      confirmBtn.textContent = "Resetting...";
      confirmBtn.disabled = true;

      const success = await performSubtitlesReset();

      if (success) {
        dialog.innerHTML = `
                    <p style="margin: 0; font-size: 14px; color: #4CAF50;">✓ Subtitles settings reset successfully</p>
                `;
        setTimeout(() => {
          cleanup();
          // Dispose menu completely so it rebuilds fresh on next open
          window.disposeSubtitlesInChordsSubmenu?.(submenu, true);
        }, 1500);
      } else {
        dialog.innerHTML = `
                    <p style="margin: 0; font-size: 14px; color: #ff3860;">✗ Failed to reset settings</p>
                `;
        setTimeout(cleanup, 2000);
      }
    };

    cancelBtn.addEventListener("click", handleCancel);
    overlay.addEventListener("click", handleOverlayClick);
    confirmBtn.addEventListener("click", handleConfirm);
  };

  resetOption.addEventListener("click", resetClickHandler);
  resetOption.addEventListener("mouseover", () => {
    resetOption.style.backgroundColor = "rgba(255,255,255,0.1)";
  });
  resetOption.addEventListener("mouseout", () => {
    resetOption.style.backgroundColor = "transparent";
  });

  submenu.cleanups.push(() => {
    resetOption.removeEventListener("click", resetClickHandler);
  });

  submenu.appendChild(resetOption);

  // --- Options Container ---
  const optionsContainer = document.createElement("div");
  optionsContainer.style.padding = "8px 0";

  // Helper: Add hover effect to menu item and prevent menu close
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

  // 1. Toggle Option
  const toggleOption = document.createElement("div");
  toggleOption.className = "settings-item";
  toggleOption.style.cssText = `padding: 12px 24px; font-size: 13px; display: flex; align-items: center; justify-content: space-between;`;

  const toggleText = document.createElement("span");
  toggleText.textContent = "Enable Subtitles";
  toggleText.style.color = "#ffffff";

  const storedEnabled = localStorage.getItem("yc_carousel_subtitles_enabled");
  const isEnabled = storedEnabled !== null ? storedEnabled === "true" : true;
  window.carouselSubtitlesEnabled = isEnabled;

  const toggleComp = createToggleSwitch(isEnabled, (newState) => {
    window.updateSubtitlesInChords(newState, true);
  });

  toggleComp.toggle.className = "subtitles-in-chords-toggle";
  submenu.cleanups.push(toggleComp.cleanup);

  toggleOption.appendChild(toggleText);
  toggleOption.appendChild(toggleComp.toggleContainer);
  addHoverEffect(toggleOption);

  // 2. Whisper Model Option
  const whisperModelOption = document.createElement("div");
  whisperModelOption.className = "settings-item";
  whisperModelOption.style.cssText = `
    padding: 12px 24px;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  `;

  const whisperModelLabel = document.createElement("span");
  whisperModelLabel.textContent = "Whisper Model";
  whisperModelLabel.style.cssText = "color: #ffffff; white-space: nowrap;";

  const whisperModelSelect = document.createElement("select");
  whisperModelSelect.className = "yc-whisper-model-setting";
  whisperModelSelect.setAttribute("aria-label", "Whisper transcription model");
  whisperModelSelect.title = "The next transcription uses this model. large-v3 may take longer on its first run.";
  whisperModelSelect.style.cssText = `
    min-width: 170px;
    max-width: 210px;
    padding: 7px 8px;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 6px;
    background: #292a2d;
    color: #fff;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  `;

  const whisperModelOptions = Array.isArray(window.ycWhisperTranscription?.modelOptions)
    && window.ycWhisperTranscription.modelOptions.length > 0
    ? window.ycWhisperTranscription.modelOptions
    : YC_SUBTITLES_IN_CHORDS_WHISPER_MODELS;
  whisperModelOptions.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = option.code;
    optionElement.textContent = option.name;
    whisperModelSelect.appendChild(optionElement);
  });

  const normalizeStoredWhisperModel = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return whisperModelOptions.some((option) => option.code === normalized)
      ? normalized
      : "large-v2";
  };
  chrome.storage.local.get(["whisperSubtitleModel"]).then((settings) => {
    whisperModelSelect.value = normalizeStoredWhisperModel(settings.whisperSubtitleModel);
  }).catch(() => {
    whisperModelSelect.value = "large-v2";
  });

  const whisperModelChangeHandler = (event) => {
    event.stopPropagation();
    chrome.storage.local.set({
      whisperSubtitleModel: normalizeStoredWhisperModel(event.target.value),
    }).catch(() => {});
  };
  whisperModelSelect.addEventListener("change", whisperModelChangeHandler);
  whisperModelSelect.addEventListener("click", (event) => event.stopPropagation());
  submenu.cleanups.push(() => whisperModelSelect.removeEventListener("change", whisperModelChangeHandler));

  whisperModelOption.appendChild(whisperModelLabel);
  whisperModelOption.appendChild(whisperModelSelect);
  addHoverEffect(whisperModelOption);

  // 3. Whisper Language Option
  const whisperLanguageOption = document.createElement("div");
  whisperLanguageOption.className = "settings-item";
  whisperLanguageOption.style.cssText = `
    padding: 12px 24px;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  `;

  const whisperLanguageLabel = document.createElement("span");
  whisperLanguageLabel.textContent = "Whisper Language";
  whisperLanguageLabel.style.cssText = "color: #ffffff; white-space: nowrap;";

  const whisperLanguageSelect = document.createElement("select");
  whisperLanguageSelect.className = "yc-whisper-language-setting";
  whisperLanguageSelect.setAttribute("aria-label", "Whisper transcription language");
  whisperLanguageSelect.style.cssText = `
    min-width: 170px;
    max-width: 190px;
    padding: 7px 8px;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 6px;
    background: #292a2d;
    color: #fff;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  `;

  const whisperLanguageOptions = Array.isArray(window.ycWhisperTranscription?.languageOptions)
    && window.ycWhisperTranscription.languageOptions.length > 0
    ? window.ycWhisperTranscription.languageOptions
    : YC_SUBTITLES_IN_CHORDS_WHISPER_LANGUAGES;
  whisperLanguageOptions.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = option.code;
    optionElement.textContent = option.name;
    whisperLanguageSelect.appendChild(optionElement);
  });

  const normalizeStoredWhisperLanguage = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return whisperLanguageOptions.some((option) => option.code === normalized)
      ? normalized
      : "auto";
  };
  chrome.storage.local.get(["whisperSubtitleLanguage"]).then((settings) => {
    whisperLanguageSelect.value = normalizeStoredWhisperLanguage(settings.whisperSubtitleLanguage);
  }).catch(() => {
    whisperLanguageSelect.value = "auto";
  });

  const whisperLanguageChangeHandler = (event) => {
    event.stopPropagation();
    chrome.storage.local.set({
      whisperSubtitleLanguage: normalizeStoredWhisperLanguage(event.target.value),
    }).catch(() => {});
  };
  whisperLanguageSelect.addEventListener("change", whisperLanguageChangeHandler);
  whisperLanguageSelect.addEventListener("click", (event) => event.stopPropagation());
  submenu.cleanups.push(() => whisperLanguageSelect.removeEventListener("change", whisperLanguageChangeHandler));

  whisperLanguageOption.appendChild(whisperLanguageLabel);
  whisperLanguageOption.appendChild(whisperLanguageSelect);
  addHoverEffect(whisperLanguageOption);

  // 4. Split Long Lines Toggle Option
  const splitLinesOption = document.createElement("div");
  splitLinesOption.className = "settings-item";
  splitLinesOption.style.cssText = `padding: 12px 24px; font-size: 13px; display: flex; align-items: center; justify-content: space-between;`;

  const splitLinesLabel = document.createElement("span");
  splitLinesLabel.textContent = "Split Long Lines";
  splitLinesLabel.style.color = "#ffffff";

  const storedSplitLines = localStorage.getItem("yc_carousel_split_lines");
  const isSplitLinesEnabled =
    storedSplitLines !== null ? storedSplitLines === "true" : true;

  const splitLinesToggle = createToggleSwitch(
    isSplitLinesEnabled,
    (newState) => {
      localStorage.setItem("yc_carousel_split_lines", newState);

      // Update active instance
      if (window.CarouselSubtitles?.activeInstance) {
        window.CarouselSubtitles.activeInstance.updateSplitLines(newState);
      }
    }
  );

  splitLinesToggle.toggle.className = "split-lines-toggle";
  submenu.cleanups.push(splitLinesToggle.cleanup);

  splitLinesOption.appendChild(splitLinesLabel);
  splitLinesOption.appendChild(splitLinesToggle.toggleContainer);
  addHoverEffect(splitLinesOption);

  // 3.5. Word Highlight Toggle Option
  const wordHighlightOption = document.createElement("div");
  wordHighlightOption.className = "settings-item";
  wordHighlightOption.style.cssText = `padding: 12px 24px; font-size: 13px; display: flex; align-items: center; justify-content: space-between;`;

  const wordHighlightLabel = document.createElement("span");
  wordHighlightLabel.textContent = "Word Highlight";
  wordHighlightLabel.style.color = "#ffffff";

  const storedWordHighlight = localStorage.getItem("yc_carousel_word_highlight");
  const isWordHighlightEnabled =
    storedWordHighlight !== null ? storedWordHighlight === "true" : true;
  window.wordHighlightEnabled = isWordHighlightEnabled;

  const wordHighlightToggle = createToggleSwitch(
    isWordHighlightEnabled,
    (newState) => {
      if (typeof window.setWordHighlightPreference === "function") {
        window.setWordHighlightPreference(newState);
      } else {
        localStorage.setItem("yc_carousel_word_highlight", String(newState));
        window.wordHighlightEnabled = newState;
      }
    }
  );

  wordHighlightToggle.toggle.className = "word-highlight-toggle";
  submenu.cleanups.push(wordHighlightToggle.cleanup);

  wordHighlightOption.appendChild(wordHighlightLabel);
  wordHighlightOption.appendChild(wordHighlightToggle.toggleContainer);
  addHoverEffect(wordHighlightOption);

  // 3.6. Passed Words Toggle Option
  const passedWordsOption = document.createElement("div");
  passedWordsOption.className = "settings-item";
  passedWordsOption.style.cssText = `padding: 12px 24px; font-size: 13px; display: flex; align-items: center; justify-content: space-between;`;

  const passedWordsLabel = document.createElement("span");
  passedWordsLabel.textContent = "Passed Words Color";
  passedWordsLabel.style.color = "#ffffff";

  const storedPassedWords = localStorage.getItem("yc_carousel_passed_words");
  const isPassedWordsEnabled =
    storedPassedWords !== null ? storedPassedWords === "true" : true;
  window.passedWordsEnabled = isPassedWordsEnabled;

  const passedWordsToggle = createToggleSwitch(
    isPassedWordsEnabled,
    (newState) => {
      localStorage.setItem("yc_carousel_passed_words", newState);
      window.passedWordsEnabled = newState;

      // Force re-render to apply change immediately
      if (window.CarouselSubtitles?.activeInstance) {
        const instance = window.CarouselSubtitles.activeInstance;
        if (instance.isVisible && instance.videoElement) {
          instance._renderSubtitles(instance.videoElement.currentTime);
        }
      }
    }
  );

  passedWordsToggle.toggle.className = "passed-words-toggle";
  submenu.cleanups.push(passedWordsToggle.cleanup);

  passedWordsOption.appendChild(passedWordsLabel);
  passedWordsOption.appendChild(passedWordsToggle.toggleContainer);
  addHoverEffect(passedWordsOption);

  // 4. Word Spacing Option
  const wordSpacingOption = document.createElement("div");
  wordSpacingOption.className = "settings-item";
  wordSpacingOption.style.cssText = `padding: 12px 24px; font-size: 13px; display: flex; align-items: center; justify-content: space-between;`;

  const wordSpacingLabel = document.createElement("span");
  wordSpacingLabel.textContent = "Word Spacing";
  wordSpacingLabel.style.color = "#ffffff";

  const wordSpacingControls = document.createElement("div");
  wordSpacingControls.style.cssText = `display: flex; align-items: center; gap: 8px;`;

  const currentSpacing =
    parseFloat(localStorage.getItem("yc_carousel_word_spacing")) || -3.6;

  const decreaseBtn = document.createElement("button");
  decreaseBtn.textContent = "−";
  decreaseBtn.style.cssText = `
        width: 24px; height: 24px;
        background: rgba(255,255,255,0.1);
        color: #fff; border: 1px solid rgba(255,255,255,0.2);
        border-radius: 4px; cursor: pointer; font-size: 16px;
        font-weight: bold; display: flex; align-items: center;
        justify-content: center; transition: all 0.2s;
    `;

  const spacingDisplay = document.createElement("span");
  spacingDisplay.textContent = currentSpacing.toFixed(1);
  spacingDisplay.style.cssText = `
        min-width: 40px; text-align: center;
        font-size: 12px; color: #fff;
        background: rgba(255,255,255,0.1);
        padding: 4px 8px; border-radius: 4px;
        border: 1px solid rgba(255,255,255,0.2);
    `;

  const increaseBtn = document.createElement("button");
  increaseBtn.textContent = "+";
  increaseBtn.style.cssText = decreaseBtn.style.cssText;

  const updateWordSpacing = (newSpacing) => {
    spacingDisplay.textContent = newSpacing.toFixed(1);
    localStorage.setItem("yc_carousel_word_spacing", newSpacing);

    // Update active instance
    if (window.CarouselSubtitles?.activeInstance) {
      window.CarouselSubtitles.activeInstance.updateWordSpacing(newSpacing);
    }
  };

  const decreaseClickHandler = (e) => {
    e.stopPropagation();
    const current =
      parseFloat(localStorage.getItem("yc_carousel_word_spacing")) || -3.6;
    const newValue = Math.max(-10, current - 0.1); // Min: -10
    updateWordSpacing(newValue);
  };
  const increaseClickHandler = (e) => {
    e.stopPropagation();
    const current =
      parseFloat(localStorage.getItem("yc_carousel_word_spacing")) || -3.6;
    const newValue = Math.min(10, current + 0.1); // Max: 10
    updateWordSpacing(newValue);
  };
  const decreaseEnterHandler = () => {
    decreaseBtn.style.background = "rgba(255,255,255,0.2)";
  };
  const decreaseLeaveHandler = () => {
    decreaseBtn.style.background = "rgba(255,255,255,0.1)";
  };
  const increaseEnterHandler = () => {
    increaseBtn.style.background = "rgba(255,255,255,0.2)";
  };
  const increaseLeaveHandler = () => {
    increaseBtn.style.background = "rgba(255,255,255,0.1)";
  };

  decreaseBtn.addEventListener("click", decreaseClickHandler);
  increaseBtn.addEventListener("click", increaseClickHandler);
  decreaseBtn.addEventListener("mouseenter", decreaseEnterHandler);
  decreaseBtn.addEventListener("mouseleave", decreaseLeaveHandler);
  increaseBtn.addEventListener("mouseenter", increaseEnterHandler);
  increaseBtn.addEventListener("mouseleave", increaseLeaveHandler);

  submenu.cleanups.push(
    () => decreaseBtn.removeEventListener("click", decreaseClickHandler),
    () => increaseBtn.removeEventListener("click", increaseClickHandler),
    () => decreaseBtn.removeEventListener("mouseenter", decreaseEnterHandler),
    () => decreaseBtn.removeEventListener("mouseleave", decreaseLeaveHandler),
    () => increaseBtn.removeEventListener("mouseenter", increaseEnterHandler),
    () => increaseBtn.removeEventListener("mouseleave", increaseLeaveHandler)
  );

  wordSpacingControls.appendChild(decreaseBtn);
  wordSpacingControls.appendChild(spacingDisplay);
  wordSpacingControls.appendChild(increaseBtn);

  wordSpacingOption.appendChild(wordSpacingLabel);
  wordSpacingOption.appendChild(wordSpacingControls);
  addHoverEffect(wordSpacingOption);

  // --- COLOR OPTIONS SECTION (Collapsible) ---
  const colorsSeparator = document.createElement("div");
  colorsSeparator.style.cssText = `
        height: 1px;
        background: rgba(255,255,255,0.1);
        margin: 8px 24px;
    `;

  const colorsHeader = document.createElement("div");
  colorsHeader.style.cssText = `
        padding: 12px 24px;
        font-size: 13px;
        font-weight: 600;
        color: #4A90E2;
        letter-spacing: 1px;
        cursor: pointer;
        display: flex;
        align-items: center;
        text-transform: uppercase;
        user-select: none;
    `;
  colorsHeader.innerHTML = `
        <span style="margin-right: 8px; font-size: 10px; transition: transform 0.3s; display: inline-block;">▶</span>
        <span>COLORS</span>
    `;

  // Colors content container (collapsible)
  const colorsContent = document.createElement("div");
  colorsContent.style.cssText = `
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.3s ease;
    `;

  // Toggle collapse/expand
  let colorsExpanded = false;
  const colorsHeaderClickHandler = (e) => {
    e.stopPropagation();
    colorsExpanded = !colorsExpanded;
    const arrow = colorsHeader.querySelector("span:first-child");
    if (colorsExpanded) {
      colorsContent.style.maxHeight = "600px";
      arrow.style.transform = "rotate(90deg)";
    } else {
      colorsContent.style.maxHeight = "0";
      arrow.style.transform = "rotate(0deg)";
    }
  };
  colorsHeader.addEventListener("click", colorsHeaderClickHandler);
  submenu.cleanups.push(() =>
    colorsHeader.removeEventListener("click", colorsHeaderClickHandler)
  );
  addHoverEffect(colorsHeader);

  // Helper function to create color option with native color picker
  function createColorPaletteRow(label, storageKey, defaultColor, updateFn) {
    const row = document.createElement("div");
    row.className = "settings-item color-palette-row";
    row.style.cssText = `
            padding: 10px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;
    labelSpan.style.cssText = `
            font-size: 12px;
            color: #ddd;
            flex-shrink: 0;
        `;

    const controlsContainer = document.createElement("div");
    controlsContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
        `;

    const currentColor = localStorage.getItem(storageKey) || defaultColor;

    // Color input (native color picker)
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = currentColor;
    colorInput.style.cssText = `
            width: 40px;
            height: 24px;
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 4px;
            cursor: pointer;
            background: transparent;
        `;

    const colorInputHandler = (e) => {
      e.stopPropagation();
      const color = e.target.value;
      localStorage.setItem(storageKey, color);
      if (window.CarouselSubtitles?.activeInstance && updateFn) {
        updateFn(color);
      }
    };

    colorInput.addEventListener("input", colorInputHandler);
    colorInput.addEventListener("click", (e) => e.stopPropagation());
    submenu.cleanups.push(() =>
      colorInput.removeEventListener("input", colorInputHandler)
    );

    // Default button (reset)
    const defaultBtn = document.createElement("div");
    defaultBtn.title = "Reset to Default";
    defaultBtn.style.cssText = `
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
    defaultBtn.innerHTML = `
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 14px; height: 14px; fill: #aaa;">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
        `;

    const defaultClickHandler = (e) => {
      e.stopPropagation();
      localStorage.setItem(storageKey, defaultColor);
      colorInput.value = defaultColor;
      if (window.CarouselSubtitles?.activeInstance && updateFn) {
        updateFn(defaultColor);
      }
    };

    defaultBtn.addEventListener("click", defaultClickHandler);
    defaultBtn.addEventListener("mouseenter", () => {
      defaultBtn.style.background = "rgba(255,255,255,0.2)";
    });
    defaultBtn.addEventListener("mouseleave", () => {
      defaultBtn.style.background = "rgba(255,255,255,0.1)";
    });
    submenu.cleanups.push(() =>
      defaultBtn.removeEventListener("click", defaultClickHandler)
    );

    controlsContainer.appendChild(colorInput);
    controlsContainer.appendChild(defaultBtn);

    row.appendChild(labelSpan);
    row.appendChild(controlsContainer);
    addHoverEffect(row);

    return row;
  }

  // 5. Panel Background Color
  const panelBgOption = createColorPaletteRow(
    "Panel Background",
    "yc_carousel_subtitle_panel_bg",
    "#f9f9f9",
    (color) =>
      window.CarouselSubtitles.activeInstance.updatePanelBackground(color)
  );

  // 6. Ellipse Background Color
  const ellipseBgOption = createColorPaletteRow(
    "Ellipse Background",
    "yc_carousel_subtitle_ellipse_bg",
    "#ffffff",
    (color) =>
      window.CarouselSubtitles.activeInstance.updateEllipseBackground(color)
  );

  // 7. Highlighted Word Background Color
  const highlightOption = createColorPaletteRow(
    "Highlight Background",
    "yc_carousel_subtitle_highlight",
    "#ffff00",
    (color) =>
      window.CarouselSubtitles.activeInstance.updateHighlightColor(color)
  );

  // 8. Highlighted Word Text Color
  const highlightTextOption = createColorPaletteRow(
    "Highlight Text",
    "yc_carousel_subtitle_highlight_text",
    "#000000",
    (color) =>
      window.CarouselSubtitles.activeInstance.updateHighlightTextColor(color)
  );

  // 9. Normal Word Color
  const wordColorOption = createColorPaletteRow(
    "Word Color",
    "yc_carousel_subtitle_word_color",
    "#000000",
    (color) => window.CarouselSubtitles.activeInstance.updateWordColor(color)
  );

  // 10. Passed Word Color
  const passedWordColorOption = createColorPaletteRow(
    "Passed Word Color",
    "yc_carousel_subtitle_passed_color",
    "#e91e63",
    (color) => window.CarouselSubtitles.activeInstance.updatePassedWordColor(color)
  );

  // Add color options to collapsible content
  colorsContent.append(
    panelBgOption,
    ellipseBgOption,
    highlightOption,
    highlightTextOption,
    wordColorOption,
    passedWordColorOption
  );

  // Append to container (order: Enable, Whisper Model, Whisper Language, Split Long Lines, Word Highlight, Passed Words, Word Spacing, Colors)
  optionsContainer.append(
    toggleOption,
    whisperModelOption,
    whisperLanguageOption,
    splitLinesOption,
    wordHighlightOption,
    passedWordsOption,
    wordSpacingOption
  );
  optionsContainer.append(colorsSeparator, colorsHeader, colorsContent);
  submenu.appendChild(optionsContainer);

  // --- Position Observer ---
  const observer = new MutationObserver(() => {
    if (submenu.style.display === "block") {
      const controls = document.querySelector(".ytp-chrome-bottom");
      if (controls) {
        const rect = controls.getBoundingClientRect();
        submenu.style.bottom = `${rect.height + 12}px`;
        submenu.style.right = "12px";
      }
      // Disconnect immediately after positioning to save CPU
      observer.disconnect();
    }
  });

  observer.observe(submenu, { attributes: true, attributeFilter: ["style"] });
  submenu.observer = observer;

  return submenu;
};

// ------------------------------------------------------------
// 4. CLEANUP (Memory Management)
// ------------------------------------------------------------

window.disposeSubtitlesInChordsSubmenu = function (submenu, remove = false) {
  if (!submenu) {
    submenu = document.querySelector(".subtitles-in-chords-submenu");
  }

  if (submenu) {
    // 1. Kill Observer
    if (submenu.observer) {
      submenu.observer.disconnect();
      delete submenu.observer;
    }

    // 2. Kill Listeners - ONLY when removing from DOM
    if (remove && submenu.cleanups) {
      submenu.cleanups.forEach((fn) => fn());
      delete submenu.cleanups;
    }

    // 3. Remove DOM if needed
    if (remove && submenu.parentNode) {
      submenu.parentNode.removeChild(submenu);
      delete window.YC_MENUS["subtitles-in-chords"];
    }
  }
};
