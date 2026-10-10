//settingsButton.js
window.createSettingsButton = function () {
  const container = document.createElement("div");
  container.className = "custom-button-container";

  const button = document.createElement("button");
  button.className = "ytp-button settings-button";
  button.title = "Settings";

  fetch(chrome.runtime.getURL("images/settings/settings.svg"))
    .then((response) => response.text())
    .then((svgText) => {
      button.innerHTML = svgText;
    })
    .catch((error) => {
      console.error("Failed to load settings icon:", error);
      button.innerHTML = `
                <svg height="36" version="1.1" viewBox="0 0 36 36" width="36">
                    <use class="ytp-svg-shadow"></use>
                    <path class="ytp-svg-fill" d="m 23.94,18.78 c .03,-0.25 .05,-0.51 .05,-0.78 0,-0.27 -0.02,-0.52 -0.05,-0.78 l 1.68,-1.32 c .15,-0.12 .19,-0.33 .1,-0.51 l -1.6,-2.76 c -0.1,-0.18 -0.31,-0.24 -0.49,-0.18 l -1.99,.8 c -0.42,-0.32 -0.86,-0.58 -1.35,-0.78 l -0.30,-2.12 c -0.02,-0.19 -0.19,-0.33 -0.39,-0.33 l -3.2,0 c -0.2,0 -0.36,.14 -0.39,.33 l -0.30,2.12 c -0.48,.2 -0.93,.47 -1.35,.78 l -1.99,-0.8 c -0.18,-0.07 -0.39,0 -0.49,.18 l -1.6,2.76 c -0.1,.17 -0.05,.39 .1,.51 l 1.68,1.32 c -0.03,.25 -0.05,.52 -0.05,.78 0,.26 .02,.52 .05,.78 l -1.68,1.32 c -0.15,.12 -0.19,.33 -0.1,.51 l 1.6,2.76 c .1,.18 .31,.24 .49,.18 l 1.99,-0.8 c .42,.32 .86,.58 1.35,.78 l .30,2.12 c .02,.19 .19,.33 .39,.33 l 3.2,0 c .2,0 .36,-0.14 .39,-0.33 l .30,-2.12 c .48,-0.2 .93,-0.47 1.35,-0.78 l 1.99,.8 c .18,.07 .39,0 .49,-0.18 l 1.6,-2.76 c .1,-0.17 .05,-0.39 -0.1,-0.51 l -1.68,-1.32 z m -5.94,2.01 c -1.54,0 -2.8,-1.25 -2.8,-2.8 0,-1.54 1.25,-2.8 2.8,-2.8 1.54,0 2.8,1.25 2.8,2.8 0,1.54 -1.25,2.8 -2.8,2.8 z" fill="#fff"></path>
                </svg>`;
    });

  let settingsMenu = null;
  let subtitleMenu = null;
  let fontSizeSubmenu = null;
  let buttonsDisplaySubmenu = null;
  let adjustmentsSubmenu = null; // הוספת משתנה חסר לתפריט ההתאמות
  let subtitleModeSubmenu = null; // Added for Subtitle Mode
  let chordsModeSubmenu = null; // submenu for Chords Mode
  let chordDisplaySubmenu = null; // submenu for Chord Display options
  let aiTranscriptionSubmenu = null; // submenu for AI Transcription
  let chordsSubmenu = null; // submenu for Chords options
  let lyricsAndChordsSubmenu = null; // submenu for Lyrics & Chords options
  let lyricsAndChordsPastWordsSubmenu = null;
  let lyricsAndChordsFontSubmenu = null;
  let verseChorusColorsSubmenu = null;
  let spacingSubmenu = null; // submenu for Spacing options
  let progressBarsSubmenu = null; // submenu for Progress Bars
  let activeChordPositionSubmenu = null; // submenu for Active Chord Position
  let chordsLocationSubmenu = null; // submenu for Carousel Direction
  let subtitleLocationSubmenu = null; // submenu for Subtitle Location
  let sizesSubmenu = null; // submenu for Sizes
  let timelineAlwaysVisibleSubmenu = null; // submenu for Timeline Always Visible
  let tuningSubmenu = null; // submenu for Tuning settings
  let capoSubmenu = null; // submenu for Capo settings
  let refreshSubtitleTimingControl = null;
  let refreshQuickChordAndFretControl = null;
  let refreshChordsProcessingControl = null;
  let refreshSubtitleAndChordsGroupControl = null;
  let chordsModeInlineSyncHandler = null;
  let quickChordsInlineSyncHandler = null;
  let fretNumbersInlineSyncHandler = null;
  let closeQuickChordMenusRef = null;
  let closeChordsProcessingInlineRef = null;
  let closeChordEditsInlineRef = null;
  let updateChordEditsGroupCollapsedStateRef = null;
  let subtitleTimingStorageChangeHandler = null;
  let isSettingsVisible = false;
  let originalAutoHide = null;

  // Expose a helper to reset all menu references
  window.resetSettingsMenu = () => {
    // 🔥 FIX: Reset button active state on SPA navigation
    isSettingsVisible = false;
    button.classList.remove("active");
    
    settingsMenu = null;
    subtitleMenu = null;
    fontSizeSubmenu = null;
    buttonsDisplaySubmenu = null;
    adjustmentsSubmenu = null;
    subtitleModeSubmenu = null;
    refreshSubtitleTimingControl = null;
    refreshQuickChordAndFretControl = null;
    refreshChordsProcessingControl = null;
    refreshSubtitleAndChordsGroupControl = null;
    if (chordsModeInlineSyncHandler) {
      window.removeEventListener("yc:modeChanged", chordsModeInlineSyncHandler);
      chordsModeInlineSyncHandler = null;
    }
    if (quickChordsInlineSyncHandler) {
      window.removeEventListener("yc:hideQuickChordsChanged", quickChordsInlineSyncHandler);
      quickChordsInlineSyncHandler = null;
    }
    if (fretNumbersInlineSyncHandler) {
      window.removeEventListener("yc:fretNumbersChanged", fretNumbersInlineSyncHandler);
      fretNumbersInlineSyncHandler = null;
    }
    closeQuickChordMenusRef = null;
    closeChordsProcessingInlineRef = null;
    closeChordEditsInlineRef = null;
    updateChordEditsGroupCollapsedStateRef = null;
    if (subtitleTimingStorageChangeHandler) {
      chrome.storage.onChanged.removeListener(subtitleTimingStorageChangeHandler);
      subtitleTimingStorageChangeHandler = null;
    }
    window.updateChordsProcessingToggleState = null;
    window.updateSubtitleAndChordsGroupCollapsedState = null;
    window.updateChordEditsGroupCollapsedState = null;

    // ניקוי מלא של תפריטי Chords Mode + Chord Display (כולל listeners גלובליים)
    if (chordsModeSubmenu) {
      if (typeof window.disposeChordsModeSubmenu === "function") {
        window.disposeChordsModeSubmenu(chordsModeSubmenu, true);
      } else {
        if (chordsModeSubmenu.observer) {
          chordsModeSubmenu.observer.disconnect();
        }
        if (chordsModeSubmenu.parentNode) {
          chordsModeSubmenu.parentNode.removeChild(chordsModeSubmenu);
        }
      }
      chordsModeSubmenu = null;
    }

    if (chordDisplaySubmenu) {
      if (typeof window.disposeChordDisplaySubmenu === "function") {
        window.disposeChordDisplaySubmenu(chordDisplaySubmenu, true);
      } else {
        if (chordDisplaySubmenu.observer) {
          chordDisplaySubmenu.observer.disconnect();
        }
        if (chordDisplaySubmenu.parentNode) {
          chordDisplaySubmenu.parentNode.removeChild(chordDisplaySubmenu);
        }
      }
      chordDisplaySubmenu = null;
    }

    // ניקוי מלא של תפריט ה-AI Transcription
    if (aiTranscriptionSubmenu) {
      // Cleanup before removing
      if (aiTranscriptionSubmenu.cleanup) {
        aiTranscriptionSubmenu.cleanup();
      }
      if (aiTranscriptionSubmenu.observer) {
        aiTranscriptionSubmenu.observer.disconnect();
      }
      if (aiTranscriptionSubmenu.parentNode) {
        aiTranscriptionSubmenu.parentNode.removeChild(aiTranscriptionSubmenu);
      }
      aiTranscriptionSubmenu = null;
    }

    // ניקוי מלא של תפריט ה-Chords
    if (chordsSubmenu) {
      if (chordsSubmenu.observer) {
        chordsSubmenu.observer.disconnect();
      }
      if (chordsSubmenu.parentNode) {
        chordsSubmenu.parentNode.removeChild(chordsSubmenu);
      }
      chordsSubmenu = null;
    }

    // ניקוי מלא של תפריט ה-Lyrics & Chords
    if (lyricsAndChordsSubmenu) {
      if (lyricsAndChordsSubmenu.observer) {
        lyricsAndChordsSubmenu.observer.disconnect();
      }
      if (lyricsAndChordsSubmenu.parentNode) {
        lyricsAndChordsSubmenu.parentNode.removeChild(lyricsAndChordsSubmenu);
      }
      lyricsAndChordsSubmenu = null;
    }

    // ניקוי תת-תפריטי Lyrics & Chords
    if (lyricsAndChordsPastWordsSubmenu) {
      window.disposeLyricsAndChordsPastWordsSubmenu(
        lyricsAndChordsPastWordsSubmenu,
        true
      );
      lyricsAndChordsPastWordsSubmenu = null;
    }
    if (lyricsAndChordsFontSubmenu) {
      window.disposeLyricsAndChordsFontSubmenu(
        lyricsAndChordsFontSubmenu,
        true
      );
      lyricsAndChordsFontSubmenu = null;
    }
    if (verseChorusColorsSubmenu) {
      window.disposeVerseChorusColorsSubmenu(
        verseChorusColorsSubmenu,
        true
      );
      verseChorusColorsSubmenu = null;
    }
    if (spacingSubmenu) {
      window.disposeSpacingSubmenu(spacingSubmenu, true);
      spacingSubmenu = null;
    }

    // ניקוי מלא של תפריט ה-Progress Bars
    if (progressBarsSubmenu) {
      window.disposeProgressBarsSubmenu(progressBarsSubmenu, true);
      progressBarsSubmenu = null;
    }

    // ניקוי מלא של תפריט ה-Active Chord Position
    if (activeChordPositionSubmenu) {
      window.disposeActiveChordPositionSubmenu(activeChordPositionSubmenu, true);
      activeChordPositionSubmenu = null;
    }

    // ניקוי מלא של תפריט ה-Carousel Direction
    if (chordsLocationSubmenu) {
      window.disposeChordsLocationSubmenu(chordsLocationSubmenu, true);
      chordsLocationSubmenu = null;
    }

    // ניקוי מלא של תפריט ה-Timeline Always Visible
    if (timelineAlwaysVisibleSubmenu) {
      window.disposeTimelineAlwaysVisibleSubmenu(
        timelineAlwaysVisibleSubmenu,
        true
      );
      timelineAlwaysVisibleSubmenu = null;
    }

    // ניקוי מלא של תפריט ה-Tuning
    if (tuningSubmenu) {
      if (window.disposeTuningSubmenu) {
        window.disposeTuningSubmenu(tuningSubmenu, true);
      }
      tuningSubmenu = null;
    }

    // ניקוי מלא של תפריט ה-Capo
    if (capoSubmenu) {
      if (window.disposeCapoSubmenu) {
        window.disposeCapoSubmenu(capoSubmenu, true);
      }
      capoSubmenu = null;
    }

    // ניקוי מלא של תפריט ה-Visual Indicators
    if (window.visualIndicatorsSubmenu) {
      window.disposeVisualIndicatorsSubmenu(
        window.visualIndicatorsSubmenu,
        true
      );
      window.visualIndicatorsSubmenu = null;
    }

    // ניקוי מלא של תפריט ה-Carousel Subtitles Font
    if (window.carouselSubtitlesFontSubmenu) {
      window.disposeCarouselSubtitlesFontSubmenu(
        window.carouselSubtitlesFontSubmenu,
        true
      );
      window.carouselSubtitlesFontSubmenu = null;
    }

    // ניקוי מלא של תפריט ה-Primary Chords Position
    if (window.primaryChordsPositionSubmenu) {
      window.disposePrimaryChordsPositionSubmenu(
        window.primaryChordsPositionSubmenu,
        true
      );
      window.primaryChordsPositionSubmenu = null;
    }

    isSettingsVisible = false;
  };

  function forceControlsVisible() {
    const player = document.querySelector(".html5-video-player");
    if (player) {
      originalAutoHide = player.hasAttribute("data-autohide");
      player.setAttribute("data-autohide", "0");
      player.classList.add("ytp-autohide-off");
      player.classList.remove("ytp-autohide");

      const controls = document.querySelector(".ytp-chrome-bottom");
      if (controls) {
        controls.style.opacity = "1";
      }
    }
  }

  function restoreControlsBehavior() {
    const player = document.querySelector(".html5-video-player");
    if (player) {
      if (originalAutoHide) {
        player.setAttribute("data-autohide", "1");
      } else {
        player.removeAttribute("data-autohide");
      }

      player.classList.remove("ytp-autohide-off");

      const controls = document.querySelector(".ytp-chrome-bottom");
      if (controls) {
        controls.style.opacity = "";
      }

      originalAutoHide = null;
    }
  }

  function closeAllMenus() {
    if (typeof closeQuickChordMenusRef === "function") {
      closeQuickChordMenusRef();
    }
    if (typeof closeChordsProcessingInlineRef === "function") {
      closeChordsProcessingInlineRef();
    }
    if (typeof closeChordEditsInlineRef === "function") {
      closeChordEditsInlineRef();
    }

    if (settingsMenu) {
      settingsMenu.style.display = "none";
      isSettingsVisible = false;
      button.classList.remove("active");
      restoreControlsBehavior();
    }

    if (subtitleMenu) {
      subtitleMenu.style.display = "none";
    }

    if (fontSizeSubmenu) {
      fontSizeSubmenu.style.display = "none";
    }

    if (buttonsDisplaySubmenu) {
      if (buttonsDisplaySubmenu.observer) {
        buttonsDisplaySubmenu.observer.disconnect();
        delete buttonsDisplaySubmenu.observer;
      }
      buttonsDisplaySubmenu.style.display = "none";
    }

    if (subtitleModeSubmenu) {
      // Added for Subtitle Mode
      subtitleModeSubmenu.style.display = "none";
    }

    if (chordsModeSubmenu) {
      if (typeof window.disposeChordsModeSubmenu === "function") {
        window.disposeChordsModeSubmenu(chordsModeSubmenu, true);
      } else {
        if (chordsModeSubmenu.observer) {
          chordsModeSubmenu.observer.disconnect();
          delete chordsModeSubmenu.observer;
        }
        if (chordsModeSubmenu.parentNode) {
          chordsModeSubmenu.parentNode.removeChild(chordsModeSubmenu);
        }
      }
      chordsModeSubmenu = null;
    }

    if (chordDisplaySubmenu) {
      if (typeof window.disposeChordDisplaySubmenu === "function") {
        window.disposeChordDisplaySubmenu(chordDisplaySubmenu, true);
      } else {
        if (chordDisplaySubmenu.observer) {
          chordDisplaySubmenu.observer.disconnect();
          delete chordDisplaySubmenu.observer;
        }
        if (chordDisplaySubmenu.parentNode) {
          chordDisplaySubmenu.parentNode.removeChild(chordDisplaySubmenu);
        }
      }
      chordDisplaySubmenu = null;
    }

    if (chordsSubmenu) {
      if (chordsSubmenu.observer) {
        chordsSubmenu.observer.disconnect();
        delete chordsSubmenu.observer;
      }
      chordsSubmenu.style.display = "none";
    }

    if (lyricsAndChordsSubmenu) {
      if (lyricsAndChordsSubmenu.observer) {
        lyricsAndChordsSubmenu.observer.disconnect();
        delete lyricsAndChordsSubmenu.observer;
      }
      lyricsAndChordsSubmenu.style.display = "none";
    }

    // סגירת תת-תפריטי Lyrics & Chords
    if (lyricsAndChordsPastWordsSubmenu) {
      if (lyricsAndChordsPastWordsSubmenu.observer) {
        lyricsAndChordsPastWordsSubmenu.observer.disconnect();
        delete lyricsAndChordsPastWordsSubmenu.observer;
      }
      lyricsAndChordsPastWordsSubmenu.style.display = "none";
    }
    if (lyricsAndChordsFontSubmenu) {
      if (lyricsAndChordsFontSubmenu.observer) {
        lyricsAndChordsFontSubmenu.observer.disconnect();
        delete lyricsAndChordsFontSubmenu.observer;
      }
      lyricsAndChordsFontSubmenu.style.display = "none";
    }
    if (verseChorusColorsSubmenu) {
      if (verseChorusColorsSubmenu.observer) {
        verseChorusColorsSubmenu.observer.disconnect();
        delete verseChorusColorsSubmenu.observer;
      }
      verseChorusColorsSubmenu.style.display = "none";
    }
    if (spacingSubmenu) {
      if (spacingSubmenu.observer) {
        spacingSubmenu.observer.disconnect();
        delete spacingSubmenu.observer;
      }
      spacingSubmenu.style.display = "none";
    }

    if (progressBarsSubmenu) {
      if (progressBarsSubmenu.observer) {
        progressBarsSubmenu.observer.disconnect();
        delete progressBarsSubmenu.observer;
      }
      progressBarsSubmenu.style.display = "none";
    }

    if (activeChordPositionSubmenu) {
      if (activeChordPositionSubmenu.observer) {
        activeChordPositionSubmenu.observer.disconnect();
        delete activeChordPositionSubmenu.observer;
      }
      activeChordPositionSubmenu.style.display = "none";
    }

    if (chordsLocationSubmenu) {
      if (chordsLocationSubmenu.observer) {
        chordsLocationSubmenu.observer.disconnect();
        delete chordsLocationSubmenu.observer;
      }
      chordsLocationSubmenu.style.display = "none";
    }

    if (subtitleLocationSubmenu) {
      if (subtitleLocationSubmenu.observer) {
        subtitleLocationSubmenu.observer.disconnect();
        delete subtitleLocationSubmenu.observer;
      }
      subtitleLocationSubmenu.style.display = "none";
    }

    if (sizesSubmenu) {
      if (sizesSubmenu.observer) {
        sizesSubmenu.observer.disconnect();
        delete sizesSubmenu.observer;
      }
      sizesSubmenu.style.display = "none";
    }

    if (timelineAlwaysVisibleSubmenu) {
      if (timelineAlwaysVisibleSubmenu.observer) {
        timelineAlwaysVisibleSubmenu.observer.disconnect();
        delete timelineAlwaysVisibleSubmenu.observer;
      }
      timelineAlwaysVisibleSubmenu.style.display = "none";
    }

    if (tuningSubmenu) {
      if (tuningSubmenu.observer) {
        tuningSubmenu.observer.disconnect();
        delete tuningSubmenu.observer;
      }
      tuningSubmenu.style.display = "none";
    }

    if (window.visualIndicatorsSubmenu) {
      if (window.visualIndicatorsSubmenu.observer) {
        window.visualIndicatorsSubmenu.observer.disconnect();
        delete window.visualIndicatorsSubmenu.observer;
      }
      window.visualIndicatorsSubmenu.style.display = "none";
    }

    if (window.primaryChordsPositionSubmenu) {
      if (window.primaryChordsPositionSubmenu.observer) {
        window.primaryChordsPositionSubmenu.observer.disconnect();
        delete window.primaryChordsPositionSubmenu.observer;
      }
      window.primaryChordsPositionSubmenu.style.display = "none";
    }

    // טיפול בתפריט Subtitles In Chords
    if (window.subtitlesInChordsSubmenu) {
      if (window.subtitlesInChordsSubmenu.observer) {
        window.subtitlesInChordsSubmenu.observer.disconnect();
        delete window.subtitlesInChordsSubmenu.observer;
      }
      window.subtitlesInChordsSubmenu.style.display = "none";

      // ניקוי התפריט אם צריך
      if (window.disposeSubtitlesInChordsSubmenu) {
        window.disposeSubtitlesInChordsSubmenu(
          window.subtitlesInChordsSubmenu,
          false
        );
      }
    }

    document
      .querySelectorAll(".settings-menu, .font-size-submenu")
      .forEach((menu) => {
        menu.style.display = "none";
      });
  }

  /* ──────────────  חשיפה גלובלית  ────────────── */
  window.closeAllMenus = closeAllMenus;

  function createSettingsMenu() {
    if (settingsMenu) return settingsMenu;

    settingsMenu = document.createElement("div");
    settingsMenu.className = "ytp-panel yc-settings-menu yc";
    settingsMenu.setAttribute("data-yc-menu", "settings");
    settingsMenu.setAttribute("dir", "ltr");
    settingsMenu.style.cssText = `
            display: none;
            position: absolute;
            bottom: 50px;
            right: 0;
            background-color: rgba(28, 28, 28, 0.9);
            border-radius: 8px;
            width: 250px;
            max-height: 360px;
            overflow-y: auto;
            color: white;
            z-index: 2000;
            font-size: 12px;
            padding: 8px 0;
            box-shadow: 0 0 4px rgba(0, 0, 0, 0.4);
        `;

    const optionsContainer = document.createElement("div");
    optionsContainer.style.padding = "8px 0";

    const TIMING_MIN = -6;
    const TIMING_MAX = 6;
    const TIMING_STEP = 0.1;
    const CHORDS_PROCESSING_STORAGE_KEY = "chordsProcessingEnabled";

    const formatTimingValue = (value) => {
      const num = Number(value) || 0;
      return `${num > 0 ? "+" : ""}${num.toFixed(1)}s`;
    };

    const clampTimingValue = (value) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return 0;
      const clamped = Math.min(TIMING_MAX, Math.max(TIMING_MIN, num));
      return Math.round(clamped / TIMING_STEP) * TIMING_STEP;
    };

    const getCurrentVideoId = () => {
      if (window.ycUtils?.extractVideoId) {
        return window.ycUtils.extractVideoId(window.location.href);
      }
      return new URLSearchParams(location.search).get("v");
    };

    const subtitleTimingItem = document.createElement("div");
    subtitleTimingItem.className = "settings-item";
    subtitleTimingItem.style.cssText = `
            margin-top: 6px;
            padding-top: 6px;
            border-top: 1px solid rgba(255, 255, 255, 0.12);
            display: flex;
            flex-direction: column;
            gap: 1px;
            user-select: none;
            -webkit-user-select: none;
        `;

    const subtitleTimingLayout = document.createElement("div");
    subtitleTimingLayout.style.cssText = `
            display: grid;
            grid-template-columns: 18px minmax(0, 1fr) 18px;
            grid-template-rows: 24px 24px;
            column-gap: 6px;
            row-gap: 1px;
            align-items: center;
            width: 100%;
        `;

    const subtitleTimingTitle = document.createElement("span");
    subtitleTimingTitle.textContent = "Subtitle Offset";
    subtitleTimingTitle.style.cssText = `
            color: #ddd;
            font-size: 12px;
            grid-column: 1 / 3;
            grid-row: 1 / 2;
            align-self: center;
        `;

    const timingValueLabel = document.createElement("span");
    timingValueLabel.style.cssText = `
            color: #fff;
            font-size: 11px;
            text-align: right;
            font-variant-numeric: tabular-nums;
            grid-column: 2 / 4;
            grid-row: 1 / 2;
            line-height: 1;
            margin: 0;
            justify-self: end;
            padding-right: 22px;
            pointer-events: none;
        `;
    timingValueLabel.textContent = "0.0s";

    const minusButton = document.createElement("button");
    minusButton.textContent = "-";
    minusButton.style.cssText = `
            width: 18px;
            height: 24px;
            border: none;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.14);
            color: #fff;
            cursor: pointer;
            line-height: 1;
            font-size: 16px;
            padding: 0;
            grid-column: 1 / 2;
            grid-row: 2 / 3;
        `;

    const plusButton = document.createElement("button");
    plusButton.textContent = "+";
    plusButton.style.cssText = `
            width: 18px;
            height: 24px;
            border: none;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.14);
            color: #fff;
            cursor: pointer;
            line-height: 1;
            font-size: 15px;
            padding: 0;
            grid-column: 3 / 4;
            grid-row: 2 / 3;
        `;

    const resetButton = document.createElement("button");
    resetButton.textContent = "↺";
    resetButton.style.cssText = `
            width: 18px;
            height: 24px;
            border: none;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.14);
            color: #fff;
            cursor: pointer;
            line-height: 1;
            font-size: 11px;
            padding: 0;
            grid-column: 3 / 4;
            grid-row: 1 / 2;
            justify-self: center;
            align-self: center;
        `;
    resetButton.title = "Reset to 0";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(TIMING_MIN);
    slider.max = String(TIMING_MAX);
    slider.step = String(TIMING_STEP);
    slider.value = "0";
    slider.style.cssText = `
            width: 100%;
            margin: 0;
        `;

    const sliderWrap = document.createElement("div");
    sliderWrap.style.cssText = `
            grid-column: 2 / 3;
            grid-row: 2 / 3;
            width: 100%;
            display: flex;
            align-items: center;
        `;
    sliderWrap.appendChild(slider);

    subtitleTimingLayout.appendChild(subtitleTimingTitle);
    subtitleTimingLayout.appendChild(resetButton);
    subtitleTimingLayout.appendChild(minusButton);
    subtitleTimingLayout.appendChild(sliderWrap);
    subtitleTimingLayout.appendChild(plusButton);
    subtitleTimingLayout.appendChild(timingValueLabel);
    subtitleTimingItem.appendChild(subtitleTimingLayout);
    subtitleTimingItem.style.borderBottom = "none";
    subtitleTimingItem.style.marginBottom = "0";

    // Quick chords + fret numbers shortcut block (main menu)
    const QUICK_CHORDS_ENABLED_KEY = "youchords_hide_quick_enabled";
    const QUICK_CHORDS_THRESHOLD_KEY = "youchords_hide_quick_threshold";
    const ADDITIONAL_FRET_NUMBERS_KEY = "additionalFretNumbers";
    const SHOW_EDIT_CHORD_KEY = "youchords_show_chord_edit";
    const SHOW_REMOVE_CHORD_KEY = "youchords_show_chord_remove";
    const SHOW_QUICK_MODE_SWITCH_KEY = "youchords_show_quick_mode_switch";
    const PREVIEW_ACTIVE_CHORD_DIRECTION_STORAGE_KEY =
      "youchords_preview_active_chord_direction";
    const PANELS_DIRECTION_STORAGE_KEY = "youchords_panels_direction";
    const quickChordAndFretItem = document.createElement("div");
    quickChordAndFretItem.style.cssText = `
            margin-top: 4px;
            padding-top: 5px;
            border-top: 1px solid rgba(255, 255, 255, 0.12);
            display: flex;
            flex-direction: column;
            gap: 4px;
            user-select: none;
            -webkit-user-select: none;
        `;

    const quickLabelsRow = document.createElement("div");
    quickLabelsRow.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 6px;
            align-items: center;
            font-size: 11px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.78);
        `;

    const quickToggleLabel = document.createElement("span");
    quickToggleLabel.textContent = "Quick Chords";
    quickToggleLabel.style.color = "rgba(255, 255, 255, 0.78)";

    const quickThresholdLabel = document.createElement("span");
    quickThresholdLabel.textContent = "Threshold";
    quickThresholdLabel.style.cssText = `
            display: block;
            width: 100%;
            text-align: center;
            color: rgba(255, 255, 255, 0.78);
        `;

    const thresholdEditedBadge = document.createElement("span");
    thresholdEditedBadge.textContent = "●";
    thresholdEditedBadge.style.cssText = `
            margin-left: 4px;
            font-size: 10px;
            color: #4ade80;
            display: none;
            vertical-align: middle;
        `;
    quickThresholdLabel.appendChild(thresholdEditedBadge);

    const fretNumbersLabel = document.createElement("span");
    fretNumbersLabel.textContent = "Fret Numbers";
    fretNumbersLabel.style.cssText = `
            text-align: left;
            color: rgba(255, 255, 255, 0.78);
        `;

    quickLabelsRow.appendChild(quickToggleLabel);
    quickLabelsRow.appendChild(quickThresholdLabel);
    quickLabelsRow.appendChild(fretNumbersLabel);

    const quickControlsRow = document.createElement("div");
    quickControlsRow.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 6px;
            align-items: center;
        `;

    const closeQuickDropdownMenus = [];

    const createQuickDropdown = ({
      options,
      defaultValue,
      onChange,
      numericText = false,
      centerValueText = false,
      gridColumns = 1,
      menuWidthPx = null,
      menuCentered = false,
      linkedLabel = null,
      closeOnSelect = true,
    }) => {
      const root = document.createElement("div");
      root.style.cssText = `
              position: relative;
              width: 100%;
          `;

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.style.cssText = `
              width: 100%;
              height: 26px;
              min-height: 26px;
              padding: 0 6px;
              font-size: 12px;
              color: #fff;
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 6px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 6px;
          `;

      const triggerLabel = document.createElement("span");
      triggerLabel.style.cssText = `
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              text-align: center;
              flex: 1 1 auto;
              font-weight: 600;
              font-size: 12px;
          `;
        if (numericText) {
          triggerLabel.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
          triggerLabel.style.fontWeight = "700";
          triggerLabel.style.fontVariantNumeric = "tabular-nums lining-nums";
          triggerLabel.style.fontFeatureSettings = "\"tnum\" 1, \"lnum\" 1";
          triggerLabel.style.letterSpacing = "0";
          triggerLabel.style.textRendering = "geometricPrecision";
          triggerLabel.style.fontSize = "13px";
        }

      const triggerArrow = document.createElement("span");
      triggerArrow.textContent = "▾";
      triggerArrow.style.cssText = `
              color: rgba(255, 255, 255, 0.75);
              font-size: 11px;
              line-height: 1;
              flex: 0 0 auto;
          `;
      if (centerValueText) {
        trigger.style.justifyContent = "center";
        trigger.style.position = "relative";
        triggerLabel.style.flex = "0 1 auto";
        triggerLabel.style.margin = "0 auto";
        triggerArrow.style.position = "absolute";
        triggerArrow.style.right = "6px";
        triggerArrow.style.top = "50%";
        triggerArrow.style.transform = "translateY(-50%)";
      }
      trigger.appendChild(triggerLabel);
      trigger.appendChild(triggerArrow);

      const menu = document.createElement("div");
      menu.style.cssText = `
              position: absolute;
              left: 0;
              right: 0;
              top: calc(100% + 4px);
              background: rgba(18, 18, 18, 0.98);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 6px;
              box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
              z-index: 2600;
              overflow: hidden;
              display: none;
          `;
      const isGridMenu = Number.isFinite(gridColumns) && gridColumns > 1;
      const openDisplayMode = isGridMenu ? "grid" : "block";
      const baseOptionBackground = isGridMenu
        ? "rgba(255, 255, 255, 0.04)"
        : "rgba(255, 255, 255, 0.02)";
      const hoverOptionBackground = isGridMenu
        ? "rgba(255, 255, 255, 0.12)"
        : "rgba(255, 255, 255, 0.1)";

      if (isGridMenu) {
        const resolvedWidth = Number.isFinite(menuWidthPx)
          ? Math.max(96, Number(menuWidthPx))
          : Math.max(126, Math.floor(gridColumns) * 42);
        menu.style.padding = "6px";
        menu.style.gap = "4px";
        menu.style.gridTemplateColumns = `repeat(${Math.floor(gridColumns)}, minmax(0, 1fr))`;
        menu.style.width = `${resolvedWidth}px`;
        menu.style.right = "auto";
        if (menuCentered) {
          menu.style.left = "50%";
          menu.style.transform = "translateX(-50%)";
        }
      }

      let currentValue = defaultValue;
      const optionButtons = new Map();
      let isOpen = false;
      let isHovering = false;
      let isLinkedLabelHovering = false;

      const updateLinkedLabelState = (active) => {
        if (!linkedLabel) return;
        linkedLabel.style.color = active
          ? "#fff"
          : "rgba(255, 255, 255, 0.78)";
        linkedLabel.style.textShadow = "none";
      };

      const updateTriggerHighlightState = () => {
        const active =
          !trigger.disabled && (isOpen || isHovering || isLinkedLabelHovering);
        trigger.style.background = active
          ? "rgba(255, 255, 255, 0.16)"
          : "rgba(255, 255, 255, 0.1)";
        trigger.style.borderColor = active
          ? "rgba(255, 255, 255, 0.35)"
          : "rgba(255, 255, 255, 0.2)";
        trigger.style.boxShadow = "none";
        triggerArrow.style.color = active
          ? "#fff"
          : "rgba(255, 255, 255, 0.75)";
        updateLinkedLabelState(active);
      };

      const closeMenu = () => {
        menu.style.display = "none";
        isOpen = false;
        updateTriggerHighlightState();
      };

      closeQuickDropdownMenus.push(closeMenu);

      const setValue = (value, emitChange = false) => {
        const selected = options.find((opt) => opt.value === value) || options[0];
        if (!selected) return;
        currentValue = selected.value;
        triggerLabel.textContent = selected.label;

        optionButtons.forEach((btn, optionValue) => {
          const isSelected = optionValue === currentValue;
          btn.style.background = isSelected
            ? "rgba(255, 255, 255, 0.16)"
            : baseOptionBackground;
          btn.style.color = "#fff";
        });

        if (emitChange && typeof onChange === "function") {
          onChange(currentValue);
        }
      };

      const setDisabled = (disabled) => {
        trigger.disabled = disabled === true;
        trigger.style.pointerEvents = trigger.disabled ? "none" : "auto";
        trigger.style.cursor = trigger.disabled ? "not-allowed" : "pointer";
        trigger.style.opacity = trigger.disabled ? "0.5" : "1";
        if (trigger.disabled) {
          closeMenu();
          isHovering = false;
        }
        updateTriggerHighlightState();
      };

      options.forEach((opt) => {
        const item = document.createElement("button");
        item.type = "button";
        item.textContent = opt.label;
        item.style.cssText = `
                width: 100%;
                border: none;
                background: ${baseOptionBackground};
                color: #fff;
                font-size: 12px;
                text-align: left;
                padding: 6px 8px;
                cursor: pointer;
            `;
        if (isGridMenu) {
          item.style.padding = "6px 0";
          item.style.textAlign = "center";
          item.style.borderRadius = "5px";
          item.style.border = "1px solid rgba(255, 255, 255, 0.16)";
        }
        if (numericText) {
          item.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
          item.style.fontWeight = "700";
          item.style.fontVariantNumeric = "tabular-nums lining-nums";
          item.style.fontFeatureSettings = "\"tnum\" 1, \"lnum\" 1";
          item.style.textAlign = "center";
          item.style.fontSize = "13px";
        }
        item.addEventListener("mouseover", () => {
          if (opt.value !== currentValue) {
            item.style.background = hoverOptionBackground;
          }
        });
        item.addEventListener("mouseout", () => {
          if (opt.value !== currentValue) {
            item.style.background = baseOptionBackground;
          }
        });
        item.addEventListener("click", (event) => {
          event.stopPropagation();
          setValue(opt.value, true);
          if (closeOnSelect) {
            closeMenu();
          } else {
            menu.style.display = openDisplayMode;
            isOpen = true;
            updateTriggerHighlightState();
          }
        });
        optionButtons.set(opt.value, item);
        menu.appendChild(item);
      });

      trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        if (trigger.disabled) return;
        const shouldOpen = menu.style.display !== openDisplayMode;
        closeQuickDropdownMenus.forEach((closeFn) => closeFn());
        menu.style.display = shouldOpen ? openDisplayMode : "none";
        isOpen = shouldOpen;
        updateTriggerHighlightState();
      });

      trigger.addEventListener("mouseenter", () => {
        isHovering = true;
        updateTriggerHighlightState();
      });

      trigger.addEventListener("mouseleave", () => {
        isHovering = false;
        updateTriggerHighlightState();
      });

      root.addEventListener("click", (event) => {
        event.stopPropagation();
      });

      root.appendChild(trigger);
      root.appendChild(menu);
      setValue(defaultValue, false);
      updateTriggerHighlightState();

      return {
        root,
        setValue,
        closeMenu,
        setDisabled,
        setLinkedLabelHover: (hovered) => {
          isLinkedLabelHovering = hovered === true;
          updateTriggerHighlightState();
        },
      };
    };

    const quickToggle = document.createElement("button");
    quickToggle.type = "button";
      quickToggle.style.cssText = `
            width: 100%;
            height: 26px;
            min-height: 26px;
            border: 1px solid rgba(255, 255, 255, 0.25);
            border-radius: 6px;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.25px;
            cursor: pointer;
            transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
            padding: 0 4px;
            background-color: rgba(255, 255, 255, 0.14);
            color: #ddd;
        `;
    let quickToggleHovered = false;
    const updateQuickToggleLabelState = () => {
      const active = quickToggleHovered;
      quickToggleLabel.style.color = active
        ? "#fff"
        : "rgba(255, 255, 255, 0.78)";
      quickToggleLabel.style.textShadow = "none";
    };
    const updateQuickToggleHighlightState = () => {
      const active = quickToggleHovered;
      quickToggle.style.backgroundColor = active
        ? "rgba(255, 255, 255, 0.16)"
        : "rgba(255, 255, 255, 0.14)";
      quickToggle.style.borderColor = active
        ? "rgba(255, 255, 255, 0.35)"
        : "rgba(255, 255, 255, 0.25)";
      quickToggle.style.boxShadow = "none";
      updateQuickToggleLabelState();
    };

    const quickThresholdValues = Array.from({ length: 12 }, (_, idx) => (idx + 1) / 10);
    const quickThresholdOptions = quickThresholdValues.map((val) => ({
      value: val.toFixed(1),
      label: val.toFixed(1),
    }));

    const fretOptions = [
      { value: "none", label: "None" },
      { value: "one", label: "+1 fret" },
      { value: "all", label: "2nd fret" },
    ];
    const quickThresholdDropdown = createQuickDropdown({
      options: quickThresholdOptions,
      defaultValue: "0.5",
      numericText: true,
      centerValueText: true,
      gridColumns: 3,
      menuWidthPx: 156,
      menuCentered: true,
      linkedLabel: quickThresholdLabel,
      closeOnSelect: false,
      onChange: (value) => {
        const parsedValue = parseFloat(value);
        localStorage.setItem(QUICK_CHORDS_THRESHOLD_KEY, parsedValue.toFixed(1));
        window.hideQuickChordsThreshold = parsedValue;
        emitQuickChordsChanged();
      },
    });

    const fretNumbersDropdown = createQuickDropdown({
      options: fretOptions,
      defaultValue: "none",
      linkedLabel: fretNumbersLabel,
      closeOnSelect: false,
      onChange: async (value) => {
        window.additionalFretNumbers = value;
        try {
          await chrome.storage.sync.set({ [ADDITIONAL_FRET_NUMBERS_KEY]: value });
        } catch (error) {
          console.warn("[Settings] Failed to persist fret numbers mode:", error);
        }

        if (window.chordRenderer?.clearCache) {
          window.chordRenderer.clearCache();
        }
        if (window.ycChordCarousel?.isVisible && window.ycChordCarousel.refreshAllDiagrams) {
          window.ycChordCarousel.refreshAllDiagrams();
        }
        if (window.refreshPreviewPanelDiagrams) {
          window.refreshPreviewPanelDiagrams();
        }
        window.dispatchEvent(
          new CustomEvent("yc:fretNumbersChanged", {
            detail: { value, source: "settingsQuickDropdown" },
          })
        );
      },
    });

    quickThresholdLabel.addEventListener("mouseenter", () => {
      quickThresholdDropdown.setLinkedLabelHover(true);
    });
    quickThresholdLabel.addEventListener("mouseleave", () => {
      quickThresholdDropdown.setLinkedLabelHover(false);
    });

    fretNumbersLabel.addEventListener("mouseenter", () => {
      fretNumbersDropdown.setLinkedLabelHover(true);
    });
    fretNumbersLabel.addEventListener("mouseleave", () => {
      fretNumbersDropdown.setLinkedLabelHover(false);
    });

    quickControlsRow.appendChild(quickToggle);
    quickControlsRow.appendChild(quickThresholdDropdown.root);
    quickControlsRow.appendChild(fretNumbersDropdown.root);

    quickChordAndFretItem.appendChild(quickLabelsRow);
    quickChordAndFretItem.appendChild(quickControlsRow);
    quickChordAndFretItem.appendChild(subtitleTimingItem);

    const chordEditsControlsItem = document.createElement("div");
    chordEditsControlsItem.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 4px;
            width: 100%;
        `;

    const chordEditsLabelsRow = document.createElement("div");
    chordEditsLabelsRow.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            align-items: center;
            font-size: 11px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.78);
            width: 100%;
        `;

    const showActionsLabel = document.createElement("span");
    showActionsLabel.textContent = "Show Actions";
    showActionsLabel.title = "Show Edit, Time, and Remove buttons";
    showActionsLabel.style.cssText = `
            text-align: center;
            white-space: nowrap;
        `;
    const showModeSwitchLabel = document.createElement("span");
    showModeSwitchLabel.textContent = "Show R/H/H+";
    showModeSwitchLabel.style.cssText = `
            text-align: center;
            white-space: nowrap;
        `;

    chordEditsLabelsRow.appendChild(showActionsLabel);
    chordEditsLabelsRow.appendChild(showModeSwitchLabel);

    const chordEditsControlsRow = document.createElement("div");
    chordEditsControlsRow.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            align-items: center;
            width: 100%;
        `;

    const showActionsToggle = document.createElement("button");
    showActionsToggle.type = "button";
    showActionsToggle.style.cssText = quickToggle.style.cssText;
    showActionsToggle.title = "Show Edit, Time, and Remove buttons";

    const showModeSwitchToggle = document.createElement("button");
    showModeSwitchToggle.type = "button";
    showModeSwitchToggle.style.cssText = quickToggle.style.cssText;

    chordEditsControlsRow.appendChild(showActionsToggle);
    chordEditsControlsRow.appendChild(showModeSwitchToggle);
    chordEditsControlsItem.appendChild(chordEditsLabelsRow);
    chordEditsControlsItem.appendChild(chordEditsControlsRow);

    let quickChordsEnabled = true;
    let showEditChordEnabled = true;
    let showRemoveChordEnabled = true;
    let showQuickModeSwitchEnabled = true;
    let thresholdIndicatorRequestId = 0;
    let modeIndicatorRequestId = 0;
    const modeEditedBadges = new Map();

    const applyShowToggleButtonState = (button, enabled) => {
      button.textContent = enabled ? "ON" : "OFF";
      button.style.backgroundColor = "rgba(255, 255, 255, 0.14)";
      button.style.borderColor = "rgba(255, 255, 255, 0.25)";
      button.style.color = enabled ? "#4ade80" : "#ddd";
      button.setAttribute("aria-pressed", enabled ? "true" : "false");
    };

    const resolveCurrentSettingsVideoId = () => {
      if (window.currentVideoId) return window.currentVideoId;
      if (subtitleTimingItem?.dataset?.videoId) return subtitleTimingItem.dataset.videoId;
      if (window.ycUtils?.extractVideoId) {
        return window.ycUtils.extractVideoId(location.href);
      }
      const match = location.href.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?\s]+)/
      );
      return match ? match[1] : null;
    };

    const updateThresholdEditIndicator = async () => {
      const manager = window.chordEditsManager;
      if (!manager?.getThresholdEditedInfo) {
        thresholdEditedBadge.style.display = "none";
        return;
      }

      const videoId = resolveCurrentSettingsVideoId();
      if (!videoId) {
        thresholdEditedBadge.style.display = "none";
        return;
      }

      const requestId = ++thresholdIndicatorRequestId;
      const mode = manager.normalizeMode
        ? manager.normalizeMode(window.chordsMode || "regular")
        : (window.chordsMode || "regular");
      const threshold = window.hideQuickChordsThreshold;

      try {
        const info = await manager.getThresholdEditedInfo({
          videoId,
          mode,
          threshold,
        });
        if (requestId !== thresholdIndicatorRequestId) return;

        if (!info?.hasAnyEdits) {
          thresholdEditedBadge.style.display = "none";
          return;
        }

        thresholdEditedBadge.style.display = "inline-block";
        thresholdEditedBadge.style.color = info.hasCurrentThreshold
          ? "#4ade80"
          : "#f59e0b";
        thresholdEditedBadge.title = info.hasCurrentThreshold
          ? `This threshold (${info.currentThreshold.toFixed(1)}s) has chord edits`
          : `Chord edits exist for another threshold (${(info.thresholds || []).join(", ")})`;
      } catch (error) {
        console.warn("[Settings] Failed to load threshold edits indicator:", error);
        thresholdEditedBadge.style.display = "none";
      }
    };

    const updateModeEditIndicators = async () => {
      const manager = window.chordEditsManager;
      const hideAllModeBadges = () => {
        modeEditedBadges.forEach((badge) => {
          badge.style.display = "none";
        });
      };

      if (!manager?.getThresholdEditedInfo) {
        hideAllModeBadges();
        return;
      }

      const videoId = resolveCurrentSettingsVideoId();
      if (!videoId) {
        hideAllModeBadges();
        return;
      }

      const requestId = ++modeIndicatorRequestId;
      const threshold = window.hideQuickChordsThreshold;
      const modeKeys = ["regular", "regularPlus", "harmonic", "harmonicPlus"];

      try {
        const results = await Promise.all(
          modeKeys.map(async (modeKey) => {
            try {
              const info = await manager.getThresholdEditedInfo({
                videoId,
                mode: modeKey,
                threshold,
              });
              return {
                modeKey,
                hasAnyEdits: Boolean(info?.hasAnyEdits),
              };
            } catch (error) {
              console.warn("[Settings] Failed loading mode edits indicator:", modeKey, error);
              return {
                modeKey,
                hasAnyEdits: false,
              };
            }
          })
        );

        if (requestId !== modeIndicatorRequestId) return;

        results.forEach(({ modeKey, hasAnyEdits }) => {
          const badge = modeEditedBadges.get(modeKey);
          if (!badge) return;
          badge.style.display = hasAnyEdits ? "inline-block" : "none";
          badge.style.color = "#4ade80";
          badge.title = hasAnyEdits
            ? "This mode has chord edits for this song"
            : "";
        });
      } catch (error) {
        console.warn("[Settings] Failed to refresh mode edit indicators:", error);
        hideAllModeBadges();
      }
    };

    const updateChordEditIndicators = async () => {
      await Promise.allSettled([
        updateThresholdEditIndicator(),
        updateModeEditIndicators(),
      ]);
    };

    const applyChordEditUiState = (showEdit, showRemove, showModeSwitch) => {
      showEditChordEnabled = showEdit !== false;
      showRemoveChordEnabled = showRemove !== false;
      showQuickModeSwitchEnabled = showModeSwitch !== false;
      applyShowToggleButtonState(
        showActionsToggle,
        showEditChordEnabled && showRemoveChordEnabled
      );
      applyShowToggleButtonState(showModeSwitchToggle, showQuickModeSwitchEnabled);
    };

    const emitChordEditUiState = () => {
      const manager = window.chordEditsManager;
      if (manager?.setUiSettings) {
        const updated = manager.setUiSettings({
          showEdit: showEditChordEnabled,
          showRemove: showRemoveChordEnabled,
          showModeSwitch: showQuickModeSwitchEnabled,
        });
        applyChordEditUiState(updated.showEdit, updated.showRemove, updated.showModeSwitch);
        return;
      }

      localStorage.setItem(SHOW_EDIT_CHORD_KEY, String(showEditChordEnabled));
      localStorage.setItem(SHOW_REMOVE_CHORD_KEY, String(showRemoveChordEnabled));
      localStorage.setItem(SHOW_QUICK_MODE_SWITCH_KEY, String(showQuickModeSwitchEnabled));
      window.dispatchEvent(
        new CustomEvent("yc:chordEditsUiChanged", {
          detail: {
            showEdit: showEditChordEnabled,
            showRemove: showRemoveChordEnabled,
            showModeSwitch: showQuickModeSwitchEnabled,
          },
        })
      );
    };

    applyChordEditUiState(
      localStorage.getItem(SHOW_EDIT_CHORD_KEY) !== "false",
      localStorage.getItem(SHOW_REMOVE_CHORD_KEY) !== "false",
      localStorage.getItem(SHOW_QUICK_MODE_SWITCH_KEY) !== "false"
    );

    const applyQuickThresholdInteractivity = (enabled) => {
      const isEnabled = enabled === true;
      [quickThresholdDropdown, fretNumbersDropdown].forEach((dropdown) => {
        dropdown.setDisabled(!isEnabled);
        dropdown.root.style.opacity = isEnabled ? "1" : "0.5";
        dropdown.root.style.cursor = isEnabled ? "default" : "not-allowed";
        if (!isEnabled) dropdown.closeMenu();
      });
    };

    const applyQuickChordsToggleState = (enabled) => {
      quickChordsEnabled = enabled !== false;
      quickToggle.textContent = quickChordsEnabled ? "ON" : "OFF";
      quickToggle.style.color = quickChordsEnabled ? "#4ade80" : "#ddd";
      quickToggle.setAttribute("aria-pressed", quickChordsEnabled ? "true" : "false");
      updateQuickToggleHighlightState();
      applyQuickThresholdInteractivity(quickChordsEnabled);
      window.hideQuickChordsEnabled = quickChordsEnabled;
    };

    const emitQuickChordsChanged = () => {
      const thresholdRaw = parseFloat(localStorage.getItem(QUICK_CHORDS_THRESHOLD_KEY) || "0.5");
      const threshold = Number.isFinite(thresholdRaw)
        ? Math.max(0.1, Math.min(1.2, Math.round(thresholdRaw * 10) / 10))
        : 0.5;
      window.hideQuickChordsThreshold = threshold;
      window.dispatchEvent(
        new CustomEvent("yc:hideQuickChordsChanged", {
          detail: {
            enabled: quickChordsEnabled,
            threshold,
            source: "settingsQuickDropdown",
          },
        })
      );
      updateChordEditIndicators();
    };

    const toggleQuickChords = () => {
      const nextEnabled = !quickChordsEnabled;
      localStorage.setItem(QUICK_CHORDS_ENABLED_KEY, String(nextEnabled));
      applyQuickChordsToggleState(nextEnabled);
      emitQuickChordsChanged();
    };

    const closeQuickChordMenus = () => {
      quickThresholdDropdown.closeMenu();
      fretNumbersDropdown.closeMenu();
    };
    closeQuickChordMenusRef = closeQuickChordMenus;
    settingsMenu.addEventListener("click", () => {
      closeQuickChordMenus();
    });

    quickToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      closeQuickChordMenus();
      toggleQuickChords();
    });

    quickToggle.addEventListener("mouseenter", () => {
      quickToggleHovered = true;
      updateQuickToggleHighlightState();
    });

    quickToggle.addEventListener("mouseleave", () => {
      quickToggleHovered = false;
      updateQuickToggleHighlightState();
    });

    quickToggleLabel.addEventListener("mouseenter", () => {
      quickToggleHovered = true;
      updateQuickToggleHighlightState();
    });

    quickToggleLabel.addEventListener("mouseleave", () => {
      quickToggleHovered = false;
      updateQuickToggleHighlightState();
    });

    showActionsToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const nextActionsEnabled = !(showEditChordEnabled && showRemoveChordEnabled);
      showEditChordEnabled = nextActionsEnabled;
      showRemoveChordEnabled = nextActionsEnabled;
      applyChordEditUiState(
        showEditChordEnabled,
        showRemoveChordEnabled,
        showQuickModeSwitchEnabled
      );
      emitChordEditUiState();
    });

    showModeSwitchToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      showQuickModeSwitchEnabled = !showQuickModeSwitchEnabled;
      applyChordEditUiState(showEditChordEnabled, showRemoveChordEnabled, showQuickModeSwitchEnabled);
      emitChordEditUiState();
    });

    refreshQuickChordAndFretControl = async () => {
      const storedEnabled = localStorage.getItem(QUICK_CHORDS_ENABLED_KEY) !== "false";
      const storedThresholdRaw = parseFloat(localStorage.getItem(QUICK_CHORDS_THRESHOLD_KEY) || "0.5");
      const storedThreshold = Number.isFinite(storedThresholdRaw)
        ? Math.max(0.1, Math.min(1.2, Math.round(storedThresholdRaw * 10) / 10))
        : 0.5;

      applyQuickChordsToggleState(storedEnabled);
      quickThresholdDropdown.setValue(storedThreshold.toFixed(1));
      window.hideQuickChordsThreshold = storedThreshold;

      try {
        const result = await chrome.storage.sync.get([ADDITIONAL_FRET_NUMBERS_KEY]);
        const currentValue = result?.[ADDITIONAL_FRET_NUMBERS_KEY] || "none";
        const validValue = fretOptions.some((opt) => opt.value === currentValue)
          ? currentValue
          : "none";
        fretNumbersDropdown.setValue(validValue);
        window.additionalFretNumbers = validValue;
      } catch (error) {
        console.warn("[Settings] Failed loading fret numbers mode:", error);
        fretNumbersDropdown.setValue("none");
        window.additionalFretNumbers = "none";
      }

      const manager = window.chordEditsManager;
      if (manager?.getUiSettings) {
        const uiSettings = manager.getUiSettings();
        applyChordEditUiState(uiSettings.showEdit, uiSettings.showRemove, uiSettings.showModeSwitch);
      } else {
        applyChordEditUiState(
          localStorage.getItem(SHOW_EDIT_CHORD_KEY) !== "false",
          localStorage.getItem(SHOW_REMOVE_CHORD_KEY) !== "false",
          localStorage.getItem(SHOW_QUICK_MODE_SWITCH_KEY) !== "false"
        );
      }

      try {
        const modeResult = await chrome.storage.sync.get(["chordsMode"]);
        const syncedMode = normalizeInlineChordsMode(
          modeResult?.chordsMode || window.chordsMode || "regular"
        );
        window.chordsMode = syncedMode;
        updateInlineChordsModeState(syncedMode);
      } catch (modeError) {
        const fallbackMode = normalizeInlineChordsMode(window.chordsMode || "regular");
        window.chordsMode = fallbackMode;
        updateInlineChordsModeState(fallbackMode);
      }

      await updateChordEditIndicators();
    };

    if (quickChordsInlineSyncHandler) {
      window.removeEventListener("yc:hideQuickChordsChanged", quickChordsInlineSyncHandler);
    }
    quickChordsInlineSyncHandler = (event) => {
      if (event?.detail?.source === "settingsQuickDropdown") return;
      if (typeof refreshQuickChordAndFretControl === "function") {
        refreshQuickChordAndFretControl();
      }
    };
    window.addEventListener("yc:hideQuickChordsChanged", quickChordsInlineSyncHandler);

    if (fretNumbersInlineSyncHandler) {
      window.removeEventListener("yc:fretNumbersChanged", fretNumbersInlineSyncHandler);
    }
    fretNumbersInlineSyncHandler = (event) => {
      if (event?.detail?.source === "settingsQuickDropdown") return;
      if (typeof refreshQuickChordAndFretControl === "function") {
        refreshQuickChordAndFretControl();
      }
    };
    window.addEventListener("yc:fretNumbersChanged", fretNumbersInlineSyncHandler);

    // Chords Processing state (inline inside settings menu)
    let chordsProcessingEnabled = true;
    let chordsProcessingStatus = null;
    let chordsProcessingToggle = null;
    let chordsProcessingToggleCircle = null;
    let chordsProcessingInlineContent = null;
    let chordsProcessingExpanded = false;
    let chordsProcessingArrow = null;

    const applyChordsProcessingToggleState = (enabled) => {
      chordsProcessingEnabled = enabled !== false;
      if (chordsProcessingStatus) {
        chordsProcessingStatus.textContent = chordsProcessingEnabled ? "ON" : "OFF";
        chordsProcessingStatus.style.color = chordsProcessingEnabled ? "#3ea6ff" : "#aaa";
      }
      if (chordsProcessingToggle) {
        chordsProcessingToggle.style.backgroundColor = chordsProcessingEnabled ? "#3ea6ff" : "#666";
      }
      if (chordsProcessingToggleCircle) {
        chordsProcessingToggleCircle.style.transform = chordsProcessingEnabled
          ? "translateX(18px)"
          : "translateX(0px)";
      }
      window.chordsProcessingEnabled = chordsProcessingEnabled;
    };

    const persistChordsProcessingState = async (enabled, showWarning = false) => {
      applyChordsProcessingToggleState(enabled);
      try {
        await chrome.storage.sync.set({
          [CHORDS_PROCESSING_STORAGE_KEY]: chordsProcessingEnabled,
        });
      } catch (error) {
        console.warn("[Settings] Failed to persist chords processing state:", error);
      }

      if (!chordsProcessingEnabled && showWarning) {
        if (window.ycUtils?.showToast) {
          window.ycUtils.showToast(
            "Chords processing is OFF. Carousel is disabled. Subtitles & panel still work.",
            "⚠️",
            3500
          );
        }
      }
    };

    const confirmDisableChordsProcessing = async () => {
      const warningText = "Are you sure? While OFF, you won't be able to generate chords.";
      if (window.ycUtils?.showLongVideoConfirmModal) {
        return window.ycUtils.showLongVideoConfirmModal({
          title: "Disable Chords Processing?",
          message: warningText,
          icon: "⚠️",
          iconSize: "44px",
          continueText: "Turn OFF",
          cancelText: "Keep ON",
        });
      }

      return window.confirm(warningText);
    };

    const ensureChordsProcessingInlineContent = () => {
      if (chordsProcessingInlineContent) return chordsProcessingInlineContent;

      chordsProcessingInlineContent = document.createElement("div");
      chordsProcessingInlineContent.style.cssText = `
            display: none;
            background: rgba(0, 0, 0, 0.2);
        `;

      const toggleItem = document.createElement("div");
      toggleItem.className = "settings-item";
      toggleItem.style.cssText = `
            padding: 12px 24px 12px 36px;
            font-size: 13px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            cursor: pointer;
            user-select: none;
            -webkit-user-select: none;
        `;

      const title = document.createElement("span");
      title.textContent = "Chords Processing";
      title.style.color = "#ddd";

      const right = document.createElement("div");
      right.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 8px;
        `;

      chordsProcessingStatus = document.createElement("span");
      chordsProcessingStatus.style.cssText = `
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.3px;
            min-width: 24px;
            text-align: right;
        `;

      chordsProcessingToggle = document.createElement("button");
      chordsProcessingToggle.type = "button";
      chordsProcessingToggle.className = "chords-processing-toggle";
      chordsProcessingToggle.style.cssText = `
            position: relative;
            width: 40px;
            height: 22px;
            border: none;
            border-radius: 999px;
            background: #3ea6ff;
            cursor: pointer;
            transition: background-color 0.2s ease;
            padding: 0;
        `;

      chordsProcessingToggleCircle = document.createElement("div");
      chordsProcessingToggleCircle.style.cssText = `
            position: absolute;
            top: 2px;
            left: 2px;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #fff;
            transition: transform 0.2s ease;
            transform: translateX(18px);
        `;
      chordsProcessingToggle.appendChild(chordsProcessingToggleCircle);

      right.appendChild(chordsProcessingStatus);
      right.appendChild(chordsProcessingToggle);
      toggleItem.appendChild(title);
      toggleItem.appendChild(right);

      const toggleFromUi = async (event) => {
        event.stopPropagation();
        const nextState = !chordsProcessingEnabled;
        if (!nextState) {
          const confirmed = await confirmDisableChordsProcessing();
          if (!confirmed) return;
        }
        await persistChordsProcessingState(nextState, !nextState);
      };

      chordsProcessingToggle.addEventListener("click", toggleFromUi);
      toggleItem.addEventListener("click", toggleFromUi);
      toggleItem.addEventListener("mouseover", () => {
        toggleItem.style.backgroundColor = "rgba(255,255,255,0.1)";
      });
      toggleItem.addEventListener("mouseout", () => {
        toggleItem.style.backgroundColor = "transparent";
      });

      chordsProcessingInlineContent.appendChild(toggleItem);
      applyChordsProcessingToggleState(chordsProcessingEnabled);
      return chordsProcessingInlineContent;
    };

    const closeChordsProcessingInline = () => {
      chordsProcessingExpanded = false;
      if (chordsProcessingArrow) {
        chordsProcessingArrow.textContent = "►";
      }
      if (chordsProcessingInlineContent) {
        chordsProcessingInlineContent.style.display = "none";
      }
    };

    const toggleChordsProcessingInline = async () => {
      const content = ensureChordsProcessingInlineContent();
      chordsProcessingExpanded = !chordsProcessingExpanded;
      content.style.display = chordsProcessingExpanded ? "block" : "none";
      if (chordsProcessingArrow) {
        chordsProcessingArrow.textContent = chordsProcessingExpanded ? "▼" : "►";
      }
      if (chordsProcessingExpanded && typeof refreshChordsProcessingControl === "function") {
        await refreshChordsProcessingControl();
      }
    };

    closeChordsProcessingInlineRef = closeChordsProcessingInline;

    refreshChordsProcessingControl = async () => {
      try {
        const result = await chrome.storage.sync.get([CHORDS_PROCESSING_STORAGE_KEY]);
        applyChordsProcessingToggleState(result?.[CHORDS_PROCESSING_STORAGE_KEY] !== false);
      } catch (error) {
        console.warn("[Settings] Failed loading chords processing state:", error);
        applyChordsProcessingToggleState(true);
      }
    };

    window.updateChordsProcessingToggleState = (enabled) => {
      applyChordsProcessingToggleState(enabled !== false);
    };

    let activeTimingSourceKey = "youtube_default";
    let timingOffsetEventRafId = null;
    let pendingTimingOffsetEvent = null;

    const flushTimingOffsetEvent = () => {
      timingOffsetEventRafId = null;
      if (!pendingTimingOffsetEvent) return;

      window.dispatchEvent(
        new CustomEvent("yc:subtitleTimingOffsetChanged", {
          detail: pendingTimingOffsetEvent,
        })
      );
      pendingTimingOffsetEvent = null;
    };

    const queueTimingOffsetEvent = (offsetValue) => {
      pendingTimingOffsetEvent = {
        videoId: subtitleTimingItem.dataset.videoId || null,
        sourceKey: activeTimingSourceKey,
        offset: offsetValue,
      };

      if (timingOffsetEventRafId !== null) return;
      timingOffsetEventRafId = requestAnimationFrame(flushTimingOffsetEvent);
    };

    const applyTimingOffsetLive = (value, emitEvent = true) => {
      const nextValue = clampTimingValue(value);
      slider.value = String(nextValue);
      timingValueLabel.textContent = formatTimingValue(nextValue);
      subtitleTimingItem.dataset.offset = String(nextValue);

      if (window.subtitleState) {
        window.subtitleState.timing_offset = nextValue;
        window.subtitleState.timingSourceKey = activeTimingSourceKey;
      }

      if (emitEvent) queueTimingOffsetEvent(nextValue);
    };

    const captureTimingOffsetPersist = (value = slider.value) => {
      const videoId = subtitleTimingItem.dataset.videoId;
      if (!videoId || !window.databaseManager?.setSubtitleOffset) return null;

      return {
        videoId,
        sourceKey: activeTimingSourceKey,
        value: clampTimingValue(value),
      };
    };

    const saveTimingOffsetSnapshot = async (snapshot) => {
      if (!snapshot) return;
      try {
        const result = await window.databaseManager.setSubtitleOffset(
          snapshot.videoId,
          snapshot.sourceKey,
          snapshot.value
        );

        const stillCurrentSource =
          subtitleTimingItem.dataset.videoId === snapshot.videoId &&
          activeTimingSourceKey === snapshot.sourceKey &&
          clampTimingValue(slider.value) === snapshot.value;

        if (stillCurrentSource && result?.success && Number.isFinite(result.value)) {
          applyTimingOffsetLive(result.value, false);
        }
      } catch (error) {
        console.warn("[Settings] Failed to persist subtitle timing offset:", error);
      }
    };

    let queuedTimingOffsetPersist = null;
    let timingOffsetPersistPromise = null;

    const drainTimingOffsetPersistQueue = () => {
      if (timingOffsetPersistPromise) return timingOffsetPersistPromise;

      timingOffsetPersistPromise = (async () => {
        try {
          while (queuedTimingOffsetPersist) {
            const snapshot = queuedTimingOffsetPersist;
            queuedTimingOffsetPersist = null;
            await saveTimingOffsetSnapshot(snapshot);
          }
        } finally {
          timingOffsetPersistPromise = null;
          if (queuedTimingOffsetPersist) {
            drainTimingOffsetPersistQueue();
          }
        }
      })();

      return timingOffsetPersistPromise;
    };

    const persistTimingOffset = (value = slider.value) => {
      const snapshot = captureTimingOffsetPersist(value);
      if (!snapshot) return Promise.resolve();

      queuedTimingOffsetPersist = snapshot;
      return drainTimingOffsetPersistQueue();
    };

    slider.addEventListener("input", () => {
      applyTimingOffsetLive(slider.value);
      persistTimingOffset(slider.value);
    });
    slider.addEventListener("change", () => {
      persistTimingOffset(slider.value);
    });

    minusButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      applyTimingOffsetLive(Number(slider.value) - TIMING_STEP);
      await persistTimingOffset();
    });

    plusButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      applyTimingOffsetLive(Number(slider.value) + TIMING_STEP);
      await persistTimingOffset();
    });

    resetButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      applyTimingOffsetLive(0);
      await persistTimingOffset();
    });

    subtitleTimingItem.addEventListener("mouseover", () => {
      subtitleTimingItem.style.backgroundColor = "rgba(255,255,255,0.1)";
    });
    subtitleTimingItem.addEventListener("mouseout", () => {
      subtitleTimingItem.style.backgroundColor = "transparent";
    });

    refreshSubtitleTimingControl = async () => {
      const videoId = getCurrentVideoId();
      subtitleTimingItem.dataset.videoId = videoId || "";

      if (!videoId) {
        activeTimingSourceKey = "youtube_default";
        applyTimingOffsetLive(0, false);
        thresholdEditedBadge.style.display = "none";
        modeEditedBadges.forEach((badge) => {
          badge.style.display = "none";
        });
        return;
      }

      let aiMode = "off";
      let useTranslation = false;
      try {
        const selection = await chrome.storage.local.get([
          "aiTranscriptionMode",
          "showTranslation",
        ]);
        const rawAiMode =
          typeof selection.aiTranscriptionMode === "string"
            ? selection.aiTranscriptionMode.toLowerCase()
            : "off";
        aiMode = ["off", "auto", "always"].includes(rawAiMode)
          ? rawAiMode
          : "off";
        useTranslation = aiMode === "off" ? false : selection.showTranslation === true;
      } catch (error) {
        console.warn("[Settings] Failed reading subtitle selection for timing control:", error);
      }

      let subtitlesData = null;
      try {
        subtitlesData = await window.databaseManager?.loadSubtitlesFromIndexedDB?.(videoId);
        if (subtitlesData && window.databaseManager?.normalizeSubtitlesForActiveMode) {
          subtitlesData = await window.databaseManager.normalizeSubtitlesForActiveMode(
            subtitlesData,
            aiMode
          );
        }
      } catch (error) {
        console.warn("[Settings] Failed loading subtitles for timing control:", error);
      }

      if (window.databaseManager?.getSubtitleOffsetForActiveSource) {
        try {
          const offsetResult = await window.databaseManager.getSubtitleOffsetForActiveSource(
            videoId,
            {
              useTranslation,
              aiMode,
              subtitlesData,
            }
          );
          activeTimingSourceKey = offsetResult?.sourceKey || "youtube_default";
          applyTimingOffsetLive(offsetResult?.offset || 0, false);
          await updateChordEditIndicators();
          return;
        } catch (error) {
          console.warn("[Settings] Failed resolving active subtitle timing source:", error);
        }
      }

      activeTimingSourceKey = "youtube_default";
      applyTimingOffsetLive(0, false);
      await updateChordEditIndicators();
    };

    if (!subtitleTimingStorageChangeHandler) {
      subtitleTimingStorageChangeHandler = (changes, areaName) => {
        if (
          areaName !== "local" ||
          !(
            changes.aiTranscriptionMode ||
            changes.showTranslation ||
            changes.alwaysAllowYoutubeFallback
          ) ||
          typeof refreshSubtitleTimingControl !== "function"
        ) {
          return;
        }

        refreshSubtitleTimingControl();
      };
      chrome.storage.onChanged.addListener(subtitleTimingStorageChangeHandler);
    }

    // Add Reset to Default first
    const resetOption = document.createElement("div");
    resetOption.className = "settings-item";
    resetOption.style.cssText = `
            padding: 12px 24px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            user-select: none;
            -webkit-user-select: none;
        `;

    const resetText = document.createElement("span");
    resetText.textContent = "Reset All to Default";
    resetText.style.color = "#ff3860";

    resetOption.appendChild(resetText);

    resetOption.addEventListener("mouseover", () => {
      resetOption.style.backgroundColor = "rgba(255,255,255,0.1)";
    });

    resetOption.addEventListener("mouseout", () => {
      resetOption.style.backgroundColor = "transparent";
    });

    resetOption.addEventListener("click", () => {
      window.showResetConfirmation();
    });

    optionsContainer.appendChild(resetOption);

    // Add Advanced Maintenance collapsible section
    const maintenanceSection = document.createElement("div");
    maintenanceSection.style.cssText = `
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            margin-bottom: 8px;
        `;

    // Maintenance header (collapsible)
    const maintenanceHeader = document.createElement("div");
    maintenanceHeader.className = "settings-item";
    maintenanceHeader.style.cssText = `
            padding: 12px 24px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            user-select: none;
            -webkit-user-select: none;
        `;

    const maintenanceText = document.createElement("span");
    maintenanceText.textContent = "Advanced Maintenance";
    maintenanceText.style.color = "#aaa";

    const maintenanceArrow = document.createElement("span");
    maintenanceArrow.textContent = "►";
    maintenanceArrow.style.color = "#aaa";

    maintenanceHeader.appendChild(maintenanceText);
    maintenanceHeader.appendChild(maintenanceArrow);

    maintenanceHeader.addEventListener("mouseover", () => {
      maintenanceHeader.style.backgroundColor = "rgba(255,255,255,0.1)";
    });

    maintenanceHeader.addEventListener("mouseout", () => {
      maintenanceHeader.style.backgroundColor = "transparent";
    });

    // Maintenance content (collapsed by default)
    const maintenanceContent = document.createElement("div");
    maintenanceContent.style.cssText = `
            display: none;
            background: rgba(0, 0, 0, 0.2);
        `;

    // Toggle collapse/expand
    let isMaintenanceExpanded = false;
    maintenanceHeader.addEventListener("click", () => {
      isMaintenanceExpanded = !isMaintenanceExpanded;
      maintenanceContent.style.display = isMaintenanceExpanded ? "block" : "none";
      maintenanceArrow.textContent = isMaintenanceExpanded ? "▼" : "►";
    });

    // Add Clear Global Positions button
    const clearGlobalOption = document.createElement("div");
    clearGlobalOption.className = "settings-item";
    clearGlobalOption.style.cssText = `
            padding: 12px 24px 12px 36px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            user-select: none;
            -webkit-user-select: none;
        `;

    const clearGlobalText = document.createElement("span");
    clearGlobalText.textContent = "Clear Global Positions";
    clearGlobalText.style.color = "#4A90E2";

    clearGlobalOption.appendChild(clearGlobalText);

    clearGlobalOption.addEventListener("mouseover", () => {
      clearGlobalOption.style.backgroundColor = "rgba(255,255,255,0.1)";
    });

    clearGlobalOption.addEventListener("mouseout", () => {
      clearGlobalOption.style.backgroundColor = "transparent";
    });

    clearGlobalOption.addEventListener("click", () => {
      if (window.showClearGlobalPositionsConfirmation) {
        window.showClearGlobalPositionsConfirmation();
      } else {
        console.warn('[Settings] clearChordPositions.js not loaded');
      }
    });

    maintenanceContent.appendChild(clearGlobalOption);

    // Add Clear Local Positions button
    const clearLocalOption = document.createElement("div");
    clearLocalOption.className = "settings-item";
    clearLocalOption.style.cssText = `
            padding: 12px 24px 12px 36px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            user-select: none;
            -webkit-user-select: none;
        `;

    const clearLocalText = document.createElement("span");
    clearLocalText.textContent = "Clear Local Positions";
    clearLocalText.style.color = "#ff9800";

    clearLocalOption.appendChild(clearLocalText);

    clearLocalOption.addEventListener("mouseover", () => {
      clearLocalOption.style.backgroundColor = "rgba(255,255,255,0.1)";
    });

    clearLocalOption.addEventListener("mouseout", () => {
      clearLocalOption.style.backgroundColor = "transparent";
    });

    clearLocalOption.addEventListener("click", () => {
      if (window.showClearLocalPositionsConfirmation) {
        window.showClearLocalPositionsConfirmation();
      } else {
        console.warn('[Settings] clearChordPositions.js not loaded');
      }
    });

    maintenanceContent.appendChild(clearLocalOption);

    // Add Wipe All Cached Data button
    const wipeDataOption = document.createElement("div");
    wipeDataOption.className = "settings-item";
    wipeDataOption.style.cssText = `
            padding: 12px 24px 12px 36px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            user-select: none;
            -webkit-user-select: none;
        `;

    const wipeDataText = document.createElement("span");
    wipeDataText.textContent = "Wipe All Cached Data";
    wipeDataText.style.color = "#9C27B0";

    wipeDataOption.appendChild(wipeDataText);

    wipeDataOption.addEventListener("mouseover", () => {
      wipeDataOption.style.backgroundColor = "rgba(255,255,255,0.1)";
    });

    wipeDataOption.addEventListener("mouseout", () => {
      wipeDataOption.style.backgroundColor = "transparent";
    });

    wipeDataOption.addEventListener("click", () => {
      if (window.showWipeAllDataConfirmation) {
        window.showWipeAllDataConfirmation();
      } else {
        console.warn('[Settings] wipeAllData.js not loaded');
      }
    });

    maintenanceContent.appendChild(wipeDataOption);

    // Add Clear Video Cache button (with submenu)
    const clearVideoCacheOption = document.createElement("div");
    clearVideoCacheOption.className = "settings-item";
    clearVideoCacheOption.style.cssText = `
            padding: 12px 24px 12px 36px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            user-select: none;
            -webkit-user-select: none;
        `;

    const clearVideoCacheText = document.createElement("span");
    clearVideoCacheText.textContent = "Clear Cache (This Video)";
    clearVideoCacheText.style.color = "#00BCD4";

    const clearVideoCacheArrow = document.createElement("span");
    clearVideoCacheArrow.textContent = "►";
    clearVideoCacheArrow.style.color = "#aaa";

    clearVideoCacheOption.appendChild(clearVideoCacheText);
    clearVideoCacheOption.appendChild(clearVideoCacheArrow);

    clearVideoCacheOption.addEventListener("mouseover", () => {
      clearVideoCacheOption.style.backgroundColor = "rgba(255,255,255,0.1)";
    });

    clearVideoCacheOption.addEventListener("mouseout", () => {
      clearVideoCacheOption.style.backgroundColor = "transparent";
    });

    clearVideoCacheOption.addEventListener("click", () => {
      if (window.createClearVideoCacheSubmenu) {
        let clearVideoCacheSubmenu = document.querySelector('.clear-video-cache-submenu');
        if (!clearVideoCacheSubmenu) {
          clearVideoCacheSubmenu = window.createClearVideoCacheSubmenu(settingsMenu);
          const player = document.querySelector(".html5-video-player");
          if (player && !player.contains(clearVideoCacheSubmenu)) {
            player.appendChild(clearVideoCacheSubmenu);
          }
        }
        
        settingsMenu.style.display = 'none';
        clearVideoCacheSubmenu.style.display = 'block';
      } else {
        console.warn('[Settings] clearVideoCache.js not loaded');
      }
    });

    maintenanceContent.appendChild(clearVideoCacheOption);

    // Assemble maintenance section
    maintenanceSection.appendChild(maintenanceHeader);
    maintenanceSection.appendChild(maintenanceContent);
    optionsContainer.appendChild(maintenanceSection);

    const CHORDS_TOOLS_COLLAPSED_KEY = "youchords_chords_tools_collapsed";
    const CHORD_EDITS_COLLAPSED_KEY = "youchords_chord_edits_collapsed";
    const CHORDS_TOOLS_ARROW_EXPANDED = "\u25BC";
    const CHORDS_TOOLS_ARROW_COLLAPSED = "\u25B6";

    const chordsModeItem = document.createElement("div");
    chordsModeItem.className = "settings-item";
    chordsModeItem.style.cssText = `
            padding: 6px 10px;
            font-size: 13px;
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 4px;
            user-select: none;
            -webkit-user-select: none;
        `;

    const chordsModeHeader = document.createElement("div");
    chordsModeHeader.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            cursor: pointer;
            user-select: none;
            -webkit-user-select: none;
            width: 100%;
            border-radius: 6px;
            padding: 2px 4px;
        `;

    const chordsModeText = document.createElement("span");
    chordsModeText.textContent = "Chords Mode";
    chordsModeText.style.cssText = `
            font-size: 12px;
            color: #fff;
            font-weight: 600;
        `;

    const chordsModeArrow = document.createElement("span");
    chordsModeArrow.textContent = CHORDS_TOOLS_ARROW_EXPANDED;
    chordsModeArrow.style.cssText = `
            color: #aaa;
            font-size: 12px;
            line-height: 1;
            flex: 0 0 auto;
        `;

    chordsModeHeader.appendChild(chordsModeText);
    chordsModeHeader.appendChild(chordsModeArrow);
    chordsModeItem.appendChild(chordsModeHeader);

    const chordsModeBody = document.createElement("div");
    chordsModeBody.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 4px;
        `;

    const chordsModeInlineRow = document.createElement("div");
    chordsModeInlineRow.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 2px;
        `;
    const chordsModeLevelRow = document.createElement("div");
    chordsModeLevelRow.style.cssText = `
            display: flex;
            align-items: flex-end;
            justify-content: flex-start;
            gap: 2px;
            margin-bottom: 1px;
        `;

    const inlineModes = [
      {
        value: "regular",
        label: "R",
        levelLabel: "PRIMARY",
        hover: "Primary regular chord mode",
      },
      {
        value: "regularPlus",
        label: "R+",
        levelLabel: "CLASSIC",
        hover: "Classic regular chord mode for comparison",
      },
      {
        value: "harmonic",
        label: "H",
        levelLabel: "HARMONIC",
        hover: "Best for intermediate level",
      },
      {
        value: "harmonicPlus",
        label: "H+",
        levelLabel: "ADVANCED",
        hover: "Best for advanced level",
      },
    ];
    const inlineModeButtons = new Map();

    const updateInlineChordsModeState = (selectedMode) => {
      inlineModeButtons.forEach((btn, modeValue) => {
        const isSelected = modeValue === selectedMode;
        btn.dataset.selected = isSelected ? "1" : "0";
        btn.style.background = isSelected
          ? "rgba(255, 255, 255, 0.16)"
          : "rgba(255, 255, 255, 0.08)";
        btn.style.borderColor = isSelected
          ? "rgba(255, 255, 255, 0.42)"
          : "rgba(255, 255, 255, 0.22)";
        btn.style.color = isSelected ? "#4ade80" : "#fff";
        btn.style.fontWeight = isSelected ? "700" : "600";
      });
    };

    const normalizeInlineChordsMode = (modeValue) => {
      const value = String(modeValue || "regular").trim();
      if (value === "regular" || value === "regularPlus" || value === "harmonic" || value === "harmonicPlus") {
        return value;
      }
      return "regular";
    };

    inlineModes.forEach((mode) => {
      const modeFlex = "1 1 0";

      const levelLabel = document.createElement("div");
      levelLabel.textContent = mode.levelLabel;
      levelLabel.style.cssText = `
              color: rgba(255, 255, 255, 0.72);
              font-size: 8px;
              line-height: 1;
              text-align: center;
              letter-spacing: 0.15px;
              white-space: nowrap;
              flex: ${modeFlex};
              min-width: 0;
          `;
      const modeEditedBadge = document.createElement("span");
      modeEditedBadge.textContent = "●";
      modeEditedBadge.style.cssText = `
              margin-left: 3px;
              font-size: 9px;
              color: #4ade80;
              display: none;
              vertical-align: middle;
          `;
      levelLabel.appendChild(modeEditedBadge);
      modeEditedBadges.set(mode.value, modeEditedBadge);
      chordsModeLevelRow.appendChild(levelLabel);

      const modeButton = document.createElement("button");
      modeButton.type = "button";
      modeButton.textContent = mode.label;
      modeButton.title = mode.hover;
      modeButton.style.cssText = `
              border: 1px solid rgba(255, 255, 255, 0.22);
              border-radius: 7px;
              background: rgba(255, 255, 255, 0.08);
              color: #fff;
              font-size: 11px;
              line-height: 1.2;
              padding: 6px 6px;
              min-height: 30px;
              cursor: pointer;
              transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
              flex: ${modeFlex};
              min-width: 0;
              white-space: nowrap;
              text-align: center;
          `;

      modeButton.addEventListener("mouseover", () => {
        if (modeButton.dataset.selected !== "1") {
          modeButton.style.background = "rgba(255, 255, 255, 0.16)";
          modeButton.style.borderColor = "rgba(255, 255, 255, 0.38)";
        }
      });

      modeButton.addEventListener("mouseout", () => {
        if (modeButton.dataset.selected !== "1") {
          modeButton.style.background = "rgba(255, 255, 255, 0.08)";
          modeButton.style.borderColor = "rgba(255, 255, 255, 0.22)";
        }
      });

      modeButton.addEventListener("click", (event) => {
        event.stopPropagation();
        closeQuickChordMenus();
        updateInlineChordsModeState(mode.value);

        if (typeof window.updateChordsMode === "function") {
          window.updateChordsMode(mode.value);
          updateChordEditIndicators();
          return;
        }

        window.chordsMode = mode.value;
        chrome.storage.sync.set({ chordsMode: mode.value });
        updateChordEditIndicators();
      });

      inlineModeButtons.set(mode.value, modeButton);
      chordsModeInlineRow.appendChild(modeButton);

    });

    chrome.storage.sync.get(["chordsMode"], (result) => {
      const selectedMode = normalizeInlineChordsMode(result.chordsMode || "regular");
      window.chordsMode = selectedMode;
      updateInlineChordsModeState(selectedMode);
      updateChordEditIndicators();
    });

    if (chordsModeInlineSyncHandler) {
      window.removeEventListener("yc:modeChanged", chordsModeInlineSyncHandler);
    }
    chordsModeInlineSyncHandler = (event) => {
      const syncedMode = normalizeInlineChordsMode(
        event?.detail?.newMode || window.chordsMode || "regular"
      );
      window.chordsMode = syncedMode;
      updateInlineChordsModeState(syncedMode);
    };
    window.addEventListener("yc:modeChanged", chordsModeInlineSyncHandler);

    chordsModeBody.appendChild(chordsModeLevelRow);
    chordsModeBody.appendChild(chordsModeInlineRow);
    chordsModeBody.appendChild(quickChordAndFretItem);
    chordsModeItem.appendChild(chordsModeBody);

    let chordsToolsCollapsed = true;
    const applyChordsToolsCollapsedState = (collapsed) => {
      chordsToolsCollapsed = collapsed === true;
      chordsModeBody.style.display = chordsToolsCollapsed ? "none" : "flex";
      chordsModeText.textContent = chordsToolsCollapsed ? "Chords Tools" : "Chords Mode";
      chordsModeArrow.textContent = chordsToolsCollapsed
        ? CHORDS_TOOLS_ARROW_COLLAPSED
        : CHORDS_TOOLS_ARROW_EXPANDED;
      if (chordsToolsCollapsed) {
        chordsModeItem.style.padding = "12px 24px";
        chordsModeItem.style.gap = "0";
        chordsModeHeader.style.padding = "0";
        chordsModeHeader.style.borderRadius = "0";
        chordsModeText.style.fontSize = "13px";
        chordsModeText.style.fontWeight = "400";
        chordsModeText.style.color = "inherit";
        chordsModeText.style.letterSpacing = "normal";
      } else {
        chordsModeItem.style.padding = "6px 10px";
        chordsModeItem.style.gap = "4px";
        // Keep compact layout, but align the open-state arrow with regular menu rows.
        chordsModeHeader.style.padding = "2px 14px 2px 4px";
        chordsModeHeader.style.borderRadius = "6px";
        chordsModeText.style.fontSize = "12px";
        chordsModeText.style.fontWeight = "600";
        chordsModeText.style.color = "#fff";
      }
    };

    const toggleChordsToolsCollapsed = () => {
      const nextCollapsed = !chordsToolsCollapsed;
      localStorage.setItem(CHORDS_TOOLS_COLLAPSED_KEY, String(nextCollapsed));
      applyChordsToolsCollapsedState(nextCollapsed);
    };

    chordsModeHeader.addEventListener("click", (event) => {
      event.stopPropagation();
      closeQuickChordMenus();
      toggleChordsToolsCollapsed();
    });

    chordsModeItem.addEventListener("mouseover", () => {
      if (chordsToolsCollapsed) {
        chordsModeItem.style.backgroundColor = "rgba(255,255,255,0.1)";
      } else {
        chordsModeHeader.style.backgroundColor = "rgba(255,255,255,0.1)";
      }
    });

    chordsModeItem.addEventListener("mouseout", () => {
      chordsModeItem.style.backgroundColor = "transparent";
      chordsModeHeader.style.backgroundColor = "transparent";
    });

    refreshSubtitleAndChordsGroupControl = () => {
      const collapsedRaw = localStorage.getItem(CHORDS_TOOLS_COLLAPSED_KEY);
      // Default: collapsed/closed
      applyChordsToolsCollapsedState(collapsedRaw !== "false");
    };

    window.updateSubtitleAndChordsGroupCollapsedState = (collapsed) => {
      const nextCollapsed = collapsed === true;
      localStorage.setItem(CHORDS_TOOLS_COLLAPSED_KEY, String(nextCollapsed));
      applyChordsToolsCollapsedState(nextCollapsed);
    };

    applyChordsToolsCollapsedState(true);
    optionsContainer.appendChild(chordsModeItem);

    const chordEditsMenuItem = document.createElement("div");
    chordEditsMenuItem.style.cssText = `
            display: flex;
            flex-direction: column;
        `;

    const chordEditsTopDivider = document.createElement("div");
    chordEditsTopDivider.style.cssText = `
            border-top: 1px solid rgba(255, 255, 255, 0.09);
            margin: 2px 10px 0 10px;
        `;
    chordEditsMenuItem.appendChild(chordEditsTopDivider);

    const chordEditsMenuRow = document.createElement("div");
    chordEditsMenuRow.className = "settings-item";
    chordEditsMenuRow.style.cssText = `
            padding: 12px 24px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            user-select: none;
            -webkit-user-select: none;
        `;

    const chordEditsMenuTitle = document.createElement("span");
    chordEditsMenuTitle.textContent = "Chord Edits";
    chordEditsMenuTitle.style.cssText = `
            color: inherit;
        `;

    const chordEditsArrow = document.createElement("span");
    chordEditsArrow.textContent = "►";
    chordEditsArrow.style.color = "#aaa";

    chordEditsMenuRow.appendChild(chordEditsMenuTitle);
    chordEditsMenuRow.appendChild(chordEditsArrow);
    chordEditsMenuItem.appendChild(chordEditsMenuRow);

    const chordEditsInlineContent = document.createElement("div");
    chordEditsInlineContent.style.cssText = `
            display: none;
            background: rgba(0, 0, 0, 0.2);
            padding: 8px 12px 10px 12px;
        `;
    chordEditsInlineContent.appendChild(chordEditsControlsItem);
    chordEditsMenuItem.appendChild(chordEditsInlineContent);

    chordEditsMenuRow.addEventListener("mouseover", () => {
      chordEditsMenuRow.style.backgroundColor = "rgba(255,255,255,0.1)";
    });

    chordEditsMenuRow.addEventListener("mouseout", () => {
      chordEditsMenuRow.style.backgroundColor = "transparent";
    });

    let chordEditsExpanded = false;
    const applyChordEditsCollapsedState = (collapsed) => {
      chordEditsExpanded = collapsed !== true;
      chordEditsInlineContent.style.display = chordEditsExpanded ? "block" : "none";
      chordEditsArrow.textContent = chordEditsExpanded ? "▼" : "►";
    };

    const updateChordEditsGroupCollapsedState = (collapsed) => {
      const nextCollapsed = collapsed === true;
      localStorage.setItem(CHORD_EDITS_COLLAPSED_KEY, String(nextCollapsed));
      applyChordEditsCollapsedState(nextCollapsed);
    };

    const closeChordEditsInline = () => {
      updateChordEditsGroupCollapsedState(true);
    };
    closeChordEditsInlineRef = closeChordEditsInline;
    updateChordEditsGroupCollapsedStateRef = updateChordEditsGroupCollapsedState;
    window.updateChordEditsGroupCollapsedState = updateChordEditsGroupCollapsedState;

    const toggleChordEditsInline = () => {
      updateChordEditsGroupCollapsedState(chordEditsExpanded);
    };

    chordEditsMenuRow.addEventListener("click", (event) => {
      event.stopPropagation();
      closeQuickChordMenus();
      toggleChordEditsInline();
    });

    const chordEditsCollapsedRaw = localStorage.getItem(CHORD_EDITS_COLLAPSED_KEY);
    // Default: collapsed/closed
    applyChordEditsCollapsedState(chordEditsCollapsedRaw !== "false");

    optionsContainer.appendChild(chordEditsMenuItem);

    const chordsToQuickDivider = document.createElement("div");
    chordsToQuickDivider.style.cssText = `
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            margin: 5px 0;
        `;
    optionsContainer.appendChild(chordsToQuickDivider);

    // Add other menu items
    const menuItems = [
      { text: "Buttons Display", type: "buttons" },
      { text: "Tuning", type: "tuning" },
      { text: "Chords Processing", type: "chordsProcessing" },
      { text: "Random Cube", type: "chordDisplay" },
      { text: "AI Transcription", type: "aiTranscription" },
      { text: "Capo", type: "capo" }, // 🎸 Capo settings submenu
      { text: "Subtitles & Chords", type: "lyricsAndChords" },
      { text: "Chords", type: "chords" },
      { text: "Subtitle/CC", type: "subtitle" },
      { text: "Global Chords Position", type: "primaryChordsPosition" }, // Moved from Chords submenu - affects both panel and carousel
    ];

    const openAiTranscriptionSubmenu = async () => {
      settingsMenu.style.display = "none";

      if (!window.createAITranscriptionSubmenu) {
        try {
          const menuUrl = chrome.runtime.getURL(
            "buttons/settings/AI_Transcription/aiTranscriptionMenu.js"
          );
          await import(menuUrl);
        } catch (error) {
          console.error("[Settings] Failed to load AI Transcription menu:", error);
          return false;
        }
      }

      if (!aiTranscriptionSubmenu) {
        aiTranscriptionSubmenu = window.createAITranscriptionSubmenu(settingsMenu);
        aiTranscriptionSubmenu.setAttribute("data-yc-menu", "ai-transcription");
        aiTranscriptionSubmenu.classList.add("yc");
        const player = document.querySelector(".html5-video-player");
        if (player && !player.contains(aiTranscriptionSubmenu)) {
          player.appendChild(aiTranscriptionSubmenu);
        }
      }

      aiTranscriptionSubmenu.refreshState?.();
      aiTranscriptionSubmenu.style.display = "block";
      return true;
    };

    menuItems.forEach((item) => {
      const menuItem = document.createElement("div");
      menuItem.className = "settings-item";
      menuItem.style.cssText = `
              padding: 12px 24px;
              font-size: 13px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              user-select: none;
              -webkit-user-select: none;
          `;

      const itemText = document.createElement("span");
      itemText.textContent = item.text;

      const arrow = document.createElement("span");
      arrow.textContent = "►";
      arrow.style.color = "#aaa";

      menuItem.appendChild(itemText);
      menuItem.appendChild(arrow);

      menuItem.addEventListener("mouseover", () => {
        menuItem.style.backgroundColor = "rgba(255,255,255,0.1)";
      });

      menuItem.addEventListener("mouseout", () => {
        menuItem.style.backgroundColor = "transparent";
      });

      if (item.type === "subtitle") {
        menuItem.addEventListener("click", () => {
          settingsMenu.style.display = "none";
          subtitleMenu.style.display = "block";
        });
      } else if (item.type === "chordsProcessing") {
        chordsProcessingArrow = arrow;
        menuItem.addEventListener("click", async () => {
          await toggleChordsProcessingInline();
        });
      } else if (item.type === "buttons") {
        menuItem.addEventListener("click", () => {
          settingsMenu.style.display = "none";

          if (!buttonsDisplaySubmenu) {
            buttonsDisplaySubmenu =
              window.createButtonsDisplaySubmenu(settingsMenu);
            buttonsDisplaySubmenu.setAttribute(
              "data-yc-menu",
              "buttons-display"
            );
            buttonsDisplaySubmenu.classList.add("yc");
            const player = document.querySelector(".html5-video-player");
            if (player && !player.contains(buttonsDisplaySubmenu)) {
              player.appendChild(buttonsDisplaySubmenu);
            }
          }

          buttonsDisplaySubmenu.style.display = "block";
        });
      } else if (item.type === "chordsMode") {
        menuItem.addEventListener("click", () => {
          settingsMenu.style.display = "none";

          if (!chordsModeSubmenu) {
            chordsModeSubmenu = window.createChordsModeSubmenu(settingsMenu);
            chordsModeSubmenu.setAttribute("data-yc-menu", "chords-mode");
            chordsModeSubmenu.classList.add("yc");
            const player = document.querySelector(".html5-video-player");
            if (player && !player.contains(chordsModeSubmenu)) {
              player.appendChild(chordsModeSubmenu);
            }
          }

          chordsModeSubmenu.style.display = "block";
        });
      } else if (item.type === "chordDisplay") {
        menuItem.addEventListener("click", () => {
          settingsMenu.style.display = "none";

          if (!chordDisplaySubmenu) {
            chordDisplaySubmenu = window.createChordDisplaySubmenu(settingsMenu);
            chordDisplaySubmenu.setAttribute("data-yc-menu", "chord-display");
            chordDisplaySubmenu.classList.add("yc");
            const player = document.querySelector(".html5-video-player");
            if (player && !player.contains(chordDisplaySubmenu)) {
              player.appendChild(chordDisplaySubmenu);
            }
          }

          chordDisplaySubmenu.style.display = "block";
        });
      } else if (item.type === "aiTranscription") {
        menuItem.addEventListener("click", openAiTranscriptionSubmenu);
      } else if (item.type === "tuning") {
        menuItem.addEventListener("click", async () => {
          settingsMenu.style.display = "none";

          // טעינת המודול אם לא נטען
          if (!window.createTuningSubmenu) {
            try {
              const tuningMenuUrl = chrome.runtime.getURL("buttons/settings/Tuning/tuningMenu.js");
              await import(tuningMenuUrl);
            } catch (e) {
              console.error("[Settings] Failed to load tuningMenu.js:", e);
              return;
            }
          }

          if (!tuningSubmenu) {
            tuningSubmenu = window.createTuningSubmenu(settingsMenu);
            tuningSubmenu.setAttribute("data-yc-menu", "tuning");
            tuningSubmenu.classList.add("yc");
            const player = document.querySelector(".html5-video-player");
            if (player && !player.contains(tuningSubmenu)) {
              player.appendChild(tuningSubmenu);
            }
          }

          tuningSubmenu.style.display = "block";
        });
      } else if (item.type === "capo") {
        menuItem.addEventListener("click", async () => {
          settingsMenu.style.display = "none";

          // טעינת המודול אם לא נטען
          if (!window.createCapoSubmenu) {
            try {
              const capoMenuUrl = chrome.runtime.getURL("buttons/settings/Capo/capoMenu.js");
              await import(capoMenuUrl);
            } catch (e) {
              console.error("[Settings] Failed to load capoMenu.js:", e);
              return;
            }
          }

          if (!capoSubmenu) {
            capoSubmenu = window.createCapoSubmenu(settingsMenu);
            capoSubmenu.setAttribute("data-yc-menu", "capo");
            capoSubmenu.classList.add("yc");
            const player = document.querySelector(".html5-video-player");
            if (player && !player.contains(capoSubmenu)) {
              player.appendChild(capoSubmenu);
            }
          }

          // עדכון ה-toggle לפי המצב הנוכחי
          if (window.refreshCapoToggleUI) {
            window.refreshCapoToggleUI();
          }

          capoSubmenu.style.display = "block";
        });
      } else if (item.type === "subtitleMode") {
        menuItem.addEventListener("click", () => {
          settingsMenu.style.display = "none";

          if (!subtitleModeSubmenu) {
            subtitleModeSubmenu =
              window.createMainSubtitleModeSubmenu(settingsMenu);
            subtitleModeSubmenu.setAttribute("data-yc-menu", "subtitle-mode");
            subtitleModeSubmenu.classList.add("yc");
            const player = document.querySelector(".html5-video-player");
            if (player && !player.contains(subtitleModeSubmenu)) {
              player.appendChild(subtitleModeSubmenu);
            }
          }

          subtitleModeSubmenu.style.display = "block";
        });
      } else if (item.type === "lyricsAndChords") {
        menuItem.addEventListener("click", () => {
          settingsMenu.style.display = "none";

          const readNormalizedDirection = (key, getterName, options) => {
            const normalize = (value) => {
              const normalized = String(value || "").trim().toLowerCase();
              return options.includes(normalized) ? normalized : "auto";
            };

            try {
              if (typeof window[getterName] === "function") {
                return normalize(window[getterName]());
              }
              return normalize(localStorage.getItem(key));
            } catch (error) {
              return "auto";
            }
          };

          const refreshLyricsAndChordsDirectionLabels = () => {
            if (!lyricsAndChordsSubmenu) return;

            const previewValueElement = lyricsAndChordsSubmenu.querySelector(
              '[data-yc-setting-value="preview-direction"]'
            );
            if (previewValueElement) {
              const previewDirection = readNormalizedDirection(
                PREVIEW_ACTIVE_CHORD_DIRECTION_STORAGE_KEY,
                "getPreviewActiveChordDirection",
                ["auto", "rtl", "ltr"]
              );
              previewValueElement.textContent = previewDirection.toUpperCase();
            }

            const panelsValueElement = lyricsAndChordsSubmenu.querySelector(
              '[data-yc-setting-value="panels-direction"]'
            );
            if (panelsValueElement) {
              const panelsDirection = readNormalizedDirection(
                PANELS_DIRECTION_STORAGE_KEY,
                "getPanelsDirectionMode",
                ["auto", "rtl", "ltr"]
              );
              panelsValueElement.textContent = panelsDirection.toUpperCase();
            }
          };

          // בדיקה אם התפריט כבר קיים ומחובר ל-DOM
          if (lyricsAndChordsSubmenu && lyricsAndChordsSubmenu.isConnected) {
            refreshLyricsAndChordsDirectionLabels();
            lyricsAndChordsSubmenu.style.display = "block";
            return;
          }

          // ניקוי התפריט הישן אם קיים
          if (lyricsAndChordsSubmenu) {
            if (lyricsAndChordsSubmenu.observer) {
              lyricsAndChordsSubmenu.observer.disconnect();
              delete lyricsAndChordsSubmenu.observer;
            }
            if (lyricsAndChordsSubmenu.parentNode) {
              lyricsAndChordsSubmenu.parentNode.removeChild(
                lyricsAndChordsSubmenu
              );
            }
          }

          // יצירת תפריט חדש
          if (true) {
            // Create a simple submenu for Lyrics & Chords options
            lyricsAndChordsSubmenu = document.createElement("div");
            lyricsAndChordsSubmenu.className =
              "settings-menu lyrics-chords-submenu yc";
            lyricsAndChordsSubmenu.setAttribute(
              "data-yc-menu",
              "lyrics-chords"
            );
            lyricsAndChordsSubmenu.style.cssText = `
                          position: absolute;
                          background: rgba(28, 28, 28, 0.9);
                          right: 12px;
                          border-radius: 8px;
                          padding: 0;
                          z-index: 2001;
                          width: 300px;
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

            backButton.addEventListener("click", (event) => {
              event.stopPropagation(); // מניעת התפשטות האירוע למאזין הגלובלי
              lyricsAndChordsSubmenu.style.display = "none";
              settingsMenu.style.display = "block";
            });

            const headerText = document.createElement("span");
            headerText.textContent = "Subtitles & Chords";
            headerText.style.fontWeight = "500";

            header.appendChild(backButton);
            header.appendChild(headerText);
            lyricsAndChordsSubmenu.appendChild(header);

            // Create options container
            const optionsContainer = document.createElement("div");
            optionsContainer.style.padding = "8px 0";

            // Chords Direction option (Preview active chord direction)
            const previewDirectionOptions = ["auto", "rtl", "ltr"];
            const normalizePreviewDirection = (value) => {
              const normalized = String(value || "").trim().toLowerCase();
              return previewDirectionOptions.includes(normalized)
                ? normalized
                : "auto";
            };
            const getPreviewDirection = () => {
              if (typeof window.getPreviewActiveChordDirection === "function") {
                return normalizePreviewDirection(
                  window.getPreviewActiveChordDirection()
                );
              }
              try {
                return normalizePreviewDirection(
                  localStorage.getItem(
                    PREVIEW_ACTIVE_CHORD_DIRECTION_STORAGE_KEY
                  )
                );
              } catch (error) {
                return "auto";
              }
            };
            const setPreviewDirection = (direction) => {
              const normalized = normalizePreviewDirection(direction);
              if (typeof window.setPreviewActiveChordDirection === "function") {
                return normalizePreviewDirection(
                  window.setPreviewActiveChordDirection(normalized)
                );
              }
              try {
                localStorage.setItem(
                  PREVIEW_ACTIVE_CHORD_DIRECTION_STORAGE_KEY,
                  normalized
                );
              } catch (error) {
                console.warn(
                  "[Settings] Failed to persist preview active chord direction:",
                  error
                );
              }
              window.previewActiveChordDirection = normalized;
              window.dispatchEvent(
                new CustomEvent("yc:previewActiveChordDirectionChanged", {
                  detail: { direction: normalized },
                })
              );
              return normalized;
            };

            const previewDirectionItem = document.createElement("div");
            previewDirectionItem.className = "settings-item";
            previewDirectionItem.style.cssText = `
                          padding: 12px 24px;
                          font-size: 13px;
                          cursor: pointer;
                          display: flex;
                          align-items: center;
                          justify-content: space-between;
                          user-select: none;
                          -webkit-user-select: none;
                      `;

            const previewDirectionText = document.createElement("span");
            previewDirectionText.textContent = "Chords Direction";
            previewDirectionText.style.color = "#ffffff";

            const previewDirectionValue = document.createElement("span");
            previewDirectionValue.setAttribute(
              "data-yc-setting-value",
              "preview-direction"
            );
            previewDirectionValue.style.color = "#aaa";
            previewDirectionValue.style.fontSize = "12px";
            previewDirectionValue.style.fontWeight = "600";
            previewDirectionValue.style.letterSpacing = "0.2px";

            const refreshPreviewDirectionLabel = () => {
              previewDirectionValue.textContent =
                getPreviewDirection().toUpperCase();
            };
            refreshPreviewDirectionLabel();

            previewDirectionItem.appendChild(previewDirectionText);
            previewDirectionItem.appendChild(previewDirectionValue);

            previewDirectionItem.addEventListener("mouseover", () => {
              previewDirectionItem.style.backgroundColor =
                "rgba(255,255,255,0.1)";
            });

            previewDirectionItem.addEventListener("mouseout", () => {
              previewDirectionItem.style.backgroundColor = "transparent";
            });

            previewDirectionItem.addEventListener("click", () => {
              const currentDirection = getPreviewDirection();
              const currentIndex = previewDirectionOptions.indexOf(currentDirection);
              const nextDirection =
                previewDirectionOptions[
                  (currentIndex + 1) % previewDirectionOptions.length
                ];
              setPreviewDirection(nextDirection);
              refreshPreviewDirectionLabel();
            });

            optionsContainer.appendChild(previewDirectionItem);

            // Panels Direction option (Main panel + Preview panel direction)
            const panelsDirectionOptions = ["auto", "rtl", "ltr"];
            const normalizePanelsDirection = (value) => {
              const normalized = String(value || "").trim().toLowerCase();
              return panelsDirectionOptions.includes(normalized)
                ? normalized
                : "auto";
            };
            const getPanelsDirection = () => {
              if (typeof window.getPanelsDirectionMode === "function") {
                return normalizePanelsDirection(window.getPanelsDirectionMode());
              }
              try {
                return normalizePanelsDirection(
                  localStorage.getItem(PANELS_DIRECTION_STORAGE_KEY)
                );
              } catch (error) {
                return "auto";
              }
            };
            const setPanelsDirection = (direction) => {
              const normalized = normalizePanelsDirection(direction);
              if (typeof window.setPanelsDirectionMode === "function") {
                return normalizePanelsDirection(
                  window.setPanelsDirectionMode(normalized)
                );
              }
              try {
                localStorage.setItem(PANELS_DIRECTION_STORAGE_KEY, normalized);
              } catch (error) {
                console.warn(
                  "[Settings] Failed to persist panels direction:",
                  error
                );
              }
              window.panelsDirectionMode = normalized;
              window.dispatchEvent(
                new CustomEvent("yc:panelsDirectionChanged", {
                  detail: { direction: normalized },
                })
              );
              return normalized;
            };

            const panelsDirectionItem = document.createElement("div");
            panelsDirectionItem.className = "settings-item";
            panelsDirectionItem.style.cssText = `
                          padding: 12px 24px;
                          font-size: 13px;
                          cursor: pointer;
                          display: flex;
                          align-items: center;
                          justify-content: space-between;
                          user-select: none;
                          -webkit-user-select: none;
                      `;

            const panelsDirectionText = document.createElement("span");
            panelsDirectionText.textContent = "Panels Direction";
            panelsDirectionText.style.color = "#ffffff";

            const panelsDirectionValue = document.createElement("span");
            panelsDirectionValue.setAttribute(
              "data-yc-setting-value",
              "panels-direction"
            );
            panelsDirectionValue.style.color = "#aaa";
            panelsDirectionValue.style.fontSize = "12px";
            panelsDirectionValue.style.fontWeight = "600";
            panelsDirectionValue.style.letterSpacing = "0.2px";

            const refreshPanelsDirectionLabel = () => {
              panelsDirectionValue.textContent =
                getPanelsDirection().toUpperCase();
            };
            refreshPanelsDirectionLabel();

            panelsDirectionItem.appendChild(panelsDirectionText);
            panelsDirectionItem.appendChild(panelsDirectionValue);

            panelsDirectionItem.addEventListener("mouseover", () => {
              panelsDirectionItem.style.backgroundColor =
                "rgba(255,255,255,0.1)";
            });

            panelsDirectionItem.addEventListener("mouseout", () => {
              panelsDirectionItem.style.backgroundColor = "transparent";
            });

            panelsDirectionItem.addEventListener("click", () => {
              const currentDirection = getPanelsDirection();
              const currentIndex = panelsDirectionOptions.indexOf(currentDirection);
              const nextDirection =
                panelsDirectionOptions[
                  (currentIndex + 1) % panelsDirectionOptions.length
                ];
              setPanelsDirection(nextDirection);
              refreshPanelsDirectionLabel();
            });

            optionsContainer.appendChild(panelsDirectionItem);

            // Create sub-menu items
            const subMenuItems = [
              { text: "Verse/Chorus Colors", type: "verseChorusColors" },
              { text: "Word Colors", type: "pastWords" },
              { text: "Font", type: "font" },
              { text: "Spacing", type: "spacing" },
            ];

            subMenuItems.forEach((subItem) => {
              const subMenuItem = document.createElement("div");
              subMenuItem.className = "settings-item";
              subMenuItem.style.cssText = `
                              padding: 12px 24px;
                              font-size: 13px;
                              cursor: pointer;
                              display: flex;
                              align-items: center;
                              justify-content: space-between;
                              user-select: none;
                              -webkit-user-select: none;
                          `;

              const subItemText = document.createElement("span");
              subItemText.textContent = subItem.text;
              subItemText.style.color = "#ffffff";

              const subItemArrow = document.createElement("span");
              subItemArrow.textContent = "►";
              subItemArrow.style.color = "#aaa";

              subMenuItem.appendChild(subItemText);
              subMenuItem.appendChild(subItemArrow);

              subMenuItem.addEventListener("mouseover", () => {
                subMenuItem.style.backgroundColor = "rgba(255,255,255,0.1)";
              });

              subMenuItem.addEventListener("mouseout", () => {
                subMenuItem.style.backgroundColor = "transparent";
              });

              // Add click handlers for each sub-menu item
              subMenuItem.addEventListener("click", () => {
                lyricsAndChordsSubmenu.style.display = "none";

                // Handle each sub-menu type
                if (subItem.type === "pastWords") {
                  // בדיקה אם התפריט כבר קיים ומחובר ל-DOM
                  if (
                    lyricsAndChordsPastWordsSubmenu &&
                    lyricsAndChordsPastWordsSubmenu.isConnected
                  ) {
                    lyricsAndChordsPastWordsSubmenu.style.display = "block";
                    return;
                  }

                  // ניקוי התפריט הישן אם קיים
                  if (lyricsAndChordsPastWordsSubmenu) {
                    window.disposeLyricsAndChordsPastWordsSubmenu(
                      lyricsAndChordsPastWordsSubmenu,
                      true
                    );
                  }

                  // יצירת תפריט חדש
                  lyricsAndChordsPastWordsSubmenu =
                    window.createLyricsAndChordsPastWordsSubmenu(
                      lyricsAndChordsSubmenu
                    );
                  const player = document.querySelector(".html5-video-player");
                  if (
                    player &&
                    !player.contains(lyricsAndChordsPastWordsSubmenu)
                  ) {
                    player.appendChild(lyricsAndChordsPastWordsSubmenu);
                  }

                  lyricsAndChordsPastWordsSubmenu.style.display = "block";
                } else if (subItem.type === "verseChorusColors") {
                  // בדיקה אם התפריט כבר קיים ומחובר ל-DOM
                  if (
                    verseChorusColorsSubmenu &&
                    verseChorusColorsSubmenu.isConnected
                  ) {
                    verseChorusColorsSubmenu.style.display = "block";
                    return;
                  }

                  // ניקוי התפריט הישן אם קיים
                  if (verseChorusColorsSubmenu) {
                    window.disposeVerseChorusColorsSubmenu(
                      verseChorusColorsSubmenu,
                      true
                    );
                  }

                  // יצירת תפריט חדש
                  verseChorusColorsSubmenu =
                    window.createVerseChorusColorsSubmenu(
                      lyricsAndChordsSubmenu
                    );
                  const player = document.querySelector(".html5-video-player");
                  if (
                    player &&
                    !player.contains(verseChorusColorsSubmenu)
                  ) {
                    player.appendChild(verseChorusColorsSubmenu);
                  }

                  verseChorusColorsSubmenu.style.display = "block";
                } else if (subItem.type === "spacing") {
                  // בדיקה אם התפריט כבר קיים ומחובר ל-DOM
                  if (
                    spacingSubmenu &&
                    spacingSubmenu.isConnected
                  ) {
                    spacingSubmenu.style.display = "block";
                    return;
                  }

                  // ניקוי התפריט הישן אם קיים
                  if (spacingSubmenu) {
                    window.disposeSpacingSubmenu(spacingSubmenu, true);
                  }

                  // יצירת תפריט חדש
                  spacingSubmenu = window.createSpacingSubmenu(
                    lyricsAndChordsSubmenu
                  );
                  const player = document.querySelector(".html5-video-player");
                  if (player && !player.contains(spacingSubmenu)) {
                    player.appendChild(spacingSubmenu);
                  }

                  spacingSubmenu.style.display = "block";
                } else if (subItem.type === "font") {
                  // בדיקה אם התפריט כבר קיים ומחובר ל-DOM
                  if (
                    lyricsAndChordsFontSubmenu &&
                    lyricsAndChordsFontSubmenu.isConnected
                  ) {
                    lyricsAndChordsFontSubmenu.style.display = "block";
                    return;
                  }

                  // ניקוי התפריט הישן אם קיים
                  if (lyricsAndChordsFontSubmenu) {
                    window.disposeLyricsAndChordsFontSubmenu(
                      lyricsAndChordsFontSubmenu,
                      true
                    );
                  }

                  // בדיקה שהפונקציה נטענה
                  if (!window.createLyricsAndChordsFontSubmenu) {
                    console.error("[Font] createLyricsAndChordsFontSubmenu not loaded!");
                    return;
                  }

                  // יצירת תפריט חדש
                  lyricsAndChordsFontSubmenu =
                    window.createLyricsAndChordsFontSubmenu(
                      lyricsAndChordsSubmenu
                    );
                  const player = document.querySelector(".html5-video-player");
                  if (player && !player.contains(lyricsAndChordsFontSubmenu)) {
                    player.appendChild(lyricsAndChordsFontSubmenu);
                  }

                  lyricsAndChordsFontSubmenu.style.display = "block";
                }
              });

              optionsContainer.appendChild(subMenuItem);
            });

            lyricsAndChordsSubmenu.appendChild(optionsContainer);

            const player = document.querySelector(".html5-video-player");
            if (player && !player.contains(lyricsAndChordsSubmenu)) {
              player.appendChild(lyricsAndChordsSubmenu);
            }
          }

          lyricsAndChordsSubmenu.style.display = "block";
        });
      } else if (item.type === "chords") {
        menuItem.addEventListener("click", () => {
          settingsMenu.style.display = "none";

          if (!chordsSubmenu) {
            // Create a simple submenu for Chords options
            chordsSubmenu = document.createElement("div");
            chordsSubmenu.className = "settings-menu chords-submenu yc";
            chordsSubmenu.setAttribute("data-yc-menu", "chords");
            chordsSubmenu.style.cssText = `
                          position: absolute;
                          background: rgba(28, 28, 28, 0.9);
                          right: 12px;
                          border-radius: 8px;
                          padding: 0;
                          z-index: 2001;
                          width: 300px;
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

            backButton.addEventListener("click", () => {
              chordsSubmenu.style.display = "none";
              settingsMenu.style.display = "block";
            });

            const headerText = document.createElement("span");
            headerText.textContent = "Chords";
            headerText.style.fontWeight = "500";

            header.appendChild(backButton);
            header.appendChild(headerText);
            chordsSubmenu.appendChild(header);

            // Create options container
            const optionsContainer = document.createElement("div");
            optionsContainer.style.padding = "8px 0";

            // Subtitles Font option
            const subtitlesFontItem = document.createElement("div");
            subtitlesFontItem.className = "settings-item";
            subtitlesFontItem.style.cssText = `
                          padding: 12px 24px;
                          font-size: 13px;
                          cursor: pointer;
                          display: flex;
                          align-items: center;
                          justify-content: space-between;
                          user-select: none;
                          -webkit-user-select: none;
                      `;

            const subtitlesFontText = document.createElement("span");
            subtitlesFontText.textContent = "Subtitles Font";
            subtitlesFontText.style.color = "#ffffff";

            const subtitlesFontArrow = document.createElement("span");
            subtitlesFontArrow.textContent = "►";
            subtitlesFontArrow.style.color = "#aaa";

            subtitlesFontItem.appendChild(subtitlesFontText);
            subtitlesFontItem.appendChild(subtitlesFontArrow);

            subtitlesFontItem.addEventListener("mouseover", () => {
              subtitlesFontItem.style.backgroundColor = "rgba(255,255,255,0.1)";
            });

            subtitlesFontItem.addEventListener("mouseout", () => {
              subtitlesFontItem.style.backgroundColor = "transparent";
            });

            subtitlesFontItem.addEventListener("click", () => {
              chordsSubmenu.style.display = "none";

              // בדיקה אם התפריט כבר קיים ומחובר ל-DOM
              if (window.carouselSubtitlesFontSubmenu && window.carouselSubtitlesFontSubmenu.isConnected) {
                window.carouselSubtitlesFontSubmenu.style.display = "block";
                return;
              }

              // ניקוי התפריט הישן אם קיים
              if (window.carouselSubtitlesFontSubmenu) {
                window.disposeCarouselSubtitlesFontSubmenu(window.carouselSubtitlesFontSubmenu, true);
              }

              // יצירת תפריט חדש
              window.carouselSubtitlesFontSubmenu = window.createCarouselSubtitlesFontSubmenu(chordsSubmenu);
              window.carouselSubtitlesFontSubmenu.setAttribute("data-yc-menu", "carousel-subtitles-font");
              window.carouselSubtitlesFontSubmenu.classList.add("yc");
              const player = document.querySelector(".html5-video-player");
              if (player && !player.contains(window.carouselSubtitlesFontSubmenu)) {
                player.appendChild(window.carouselSubtitlesFontSubmenu);
              }

              window.carouselSubtitlesFontSubmenu.style.display = "block";
            });

            // Progress Bars option
            const progressBarsItem = document.createElement("div");
            progressBarsItem.className = "settings-item";
            progressBarsItem.style.cssText = `
                          padding: 12px 24px;
                          font-size: 13px;
                          cursor: pointer;
                          display: flex;
                          align-items: center;
                          justify-content: space-between;
                          user-select: none;
                          -webkit-user-select: none;
                      `;

            const progressBarsText = document.createElement("span");
            progressBarsText.textContent = "Beat Grid Bar";
            progressBarsText.style.color = "#ffffff";

            const progressBarsArrow = document.createElement("span");
            progressBarsArrow.textContent = "►";
            progressBarsArrow.style.color = "#aaa";

            progressBarsItem.appendChild(progressBarsText);
            progressBarsItem.appendChild(progressBarsArrow);

            progressBarsItem.addEventListener("mouseover", () => {
              progressBarsItem.style.backgroundColor = "rgba(255,255,255,0.1)";
            });

            progressBarsItem.addEventListener("mouseout", () => {
              progressBarsItem.style.backgroundColor = "transparent";
            });

            progressBarsItem.addEventListener("click", () => {
              chordsSubmenu.style.display = "none";

              // בדיקה אם התפריט כבר קיים ומחובר ל-DOM
              if (progressBarsSubmenu && progressBarsSubmenu.isConnected) {
                progressBarsSubmenu.style.display = "block";
                return;
              }

              // ניקוי התפריט הישן אם קיים
              if (progressBarsSubmenu) {
                window.disposeProgressBarsSubmenu(progressBarsSubmenu, true);
              }

              // יצירת תפריט חדש
              progressBarsSubmenu =
                window.createProgressBarsSubmenu(chordsSubmenu);
              progressBarsSubmenu.setAttribute("data-yc-menu", "progress-bars");
              progressBarsSubmenu.classList.add("yc");
              const player = document.querySelector(".html5-video-player");
              if (player && !player.contains(progressBarsSubmenu)) {
                player.appendChild(progressBarsSubmenu);
              }

              progressBarsSubmenu.style.display = "block";
            });

            // Subtitles In Chords option
            const subtitlesInChordsItem = document.createElement("div");
            subtitlesInChordsItem.className = "settings-item";
            subtitlesInChordsItem.style.cssText = `
                          padding: 12px 24px;
                          font-size: 13px;
                          cursor: pointer;
                          display: flex;
                          align-items: center;
                          justify-content: space-between;
                          user-select: none;
                          -webkit-user-select: none;
                      `;

            const subtitlesInChordsText = document.createElement("span");
            subtitlesInChordsText.textContent = "Subtitles In Chords";
            subtitlesInChordsText.style.color = "#ffffff";

            const subtitlesInChordsArrow = document.createElement("span");
            subtitlesInChordsArrow.textContent = "►";
            subtitlesInChordsArrow.style.color = "#aaa";

            subtitlesInChordsItem.appendChild(subtitlesInChordsText);
            subtitlesInChordsItem.appendChild(subtitlesInChordsArrow);

            subtitlesInChordsItem.addEventListener("mouseover", () => {
              subtitlesInChordsItem.style.backgroundColor =
                "rgba(255,255,255,0.1)";
            });

            subtitlesInChordsItem.addEventListener("mouseout", () => {
              subtitlesInChordsItem.style.backgroundColor = "transparent";
            });

            subtitlesInChordsItem.addEventListener("click", () => {
              chordsSubmenu.style.display = "none";

              // בדיקה אם התפריט כבר קיים ומחובר ל-DOM
              if (
                window.subtitlesInChordsSubmenu &&
                window.subtitlesInChordsSubmenu.isConnected
              ) {
                window.subtitlesInChordsSubmenu.style.display = "block";
                return;
              }

              // ניקוי התפריט הישן אם קיים
              if (window.subtitlesInChordsSubmenu) {
                window.disposeSubtitlesInChordsSubmenu(
                  window.subtitlesInChordsSubmenu,
                  true
                );
              }

              // יצירת תפריט חדש
              window.subtitlesInChordsSubmenu =
                window.createSubtitlesInChordsSubmenu(chordsSubmenu);
              window.subtitlesInChordsSubmenu.setAttribute(
                "data-yc-menu",
                "subtitles-in-chords"
              );
              window.subtitlesInChordsSubmenu.classList.add("yc");
              const player = document.querySelector(".html5-video-player");
              if (player && !player.contains(window.subtitlesInChordsSubmenu)) {
                player.appendChild(window.subtitlesInChordsSubmenu);
              }

              window.subtitlesInChordsSubmenu.style.display = "block";
            });

            // Active Chord Position option
            const activeChordPositionItem = document.createElement("div");
            activeChordPositionItem.className = "settings-item";
            activeChordPositionItem.style.cssText = `
                          padding: 12px 24px;
                          font-size: 13px;
                          cursor: pointer;
                          display: flex;
                          align-items: center;
                          justify-content: space-between;
                          user-select: none;
                          -webkit-user-select: none;
                      `;

            const activeChordPositionText = document.createElement("span");
            activeChordPositionText.textContent = "Active Chord Position";
            activeChordPositionText.style.color = "#ffffff";

            const activeChordPositionArrow = document.createElement("span");
            activeChordPositionArrow.textContent = "►";
            activeChordPositionArrow.style.color = "#aaa";

            activeChordPositionItem.appendChild(activeChordPositionText);
            activeChordPositionItem.appendChild(activeChordPositionArrow);

            activeChordPositionItem.addEventListener("mouseover", () => {
              activeChordPositionItem.style.backgroundColor =
                "rgba(255,255,255,0.1)";
            });

            activeChordPositionItem.addEventListener("mouseout", () => {
              activeChordPositionItem.style.backgroundColor = "transparent";
            });

            activeChordPositionItem.addEventListener("click", () => {
              chordsSubmenu.style.display = "none";

              // בדיקה אם התפריט כבר קיים ומחובר ל-DOM
              if (activeChordPositionSubmenu && activeChordPositionSubmenu.isConnected) {
                activeChordPositionSubmenu.style.display = "block";
                return;
              }

              // ניקוי התפריט הישן אם קיים
              if (activeChordPositionSubmenu) {
                window.disposeActiveChordPositionSubmenu(
                  activeChordPositionSubmenu,
                  true
                );
              }

              // יצירת תפריט חדש
              activeChordPositionSubmenu =
                window.createActiveChordPositionSubmenu(chordsSubmenu);
              activeChordPositionSubmenu.setAttribute(
                "data-yc-menu",
                "active-chord-position"
              );
              activeChordPositionSubmenu.classList.add("yc");
              const player = document.querySelector(".html5-video-player");
              if (player && !player.contains(activeChordPositionSubmenu)) {
                player.appendChild(activeChordPositionSubmenu);
              }

              activeChordPositionSubmenu.style.display = "block";
            });

            // Carousel Direction option
            const chordsLocationItem = document.createElement("div");
            chordsLocationItem.className = "settings-item";
            chordsLocationItem.style.cssText = `
                          padding: 12px 24px;
                          font-size: 13px;
                          cursor: pointer;
                          display: flex;
                          align-items: center;
                          justify-content: space-between;
                          user-select: none;
                          -webkit-user-select: none;
                      `;

            const chordsLocationText = document.createElement("span");
            chordsLocationText.textContent = "Carousel Direction";
            chordsLocationText.style.color = "#ffffff";

            const chordsLocationArrow = document.createElement("span");
            chordsLocationArrow.textContent = "►";
            chordsLocationArrow.style.color = "#aaa";

            chordsLocationItem.appendChild(chordsLocationText);
            chordsLocationItem.appendChild(chordsLocationArrow);

            chordsLocationItem.addEventListener("mouseover", () => {
              chordsLocationItem.style.backgroundColor =
                "rgba(255,255,255,0.1)";
            });

            chordsLocationItem.addEventListener("mouseout", () => {
              chordsLocationItem.style.backgroundColor = "transparent";
            });

            chordsLocationItem.addEventListener("click", () => {
              chordsSubmenu.style.display = "none";

              // בדיקה אם התפריט כבר קיים ומחובר ל-DOM
              if (chordsLocationSubmenu && chordsLocationSubmenu.isConnected) {
                chordsLocationSubmenu.style.display = "block";
                return;
              }

              // ניקוי התפריט הישן אם קיים
              if (chordsLocationSubmenu) {
                window.disposeChordsLocationSubmenu(
                  chordsLocationSubmenu,
                  true
                );
              }

              // יצירת תפריט חדש
              chordsLocationSubmenu =
                window.createChordsLocationSubmenu(chordsSubmenu);
              chordsLocationSubmenu.setAttribute(
                "data-yc-menu",
                "chords-location"
              );
              chordsLocationSubmenu.classList.add("yc");
              const player = document.querySelector(".html5-video-player");
              if (player && !player.contains(chordsLocationSubmenu)) {
                player.appendChild(chordsLocationSubmenu);
              }

              chordsLocationSubmenu.style.display = "block";
            });

            // Subtitle Location option
            const subtitleLocationItem = document.createElement("div");
            subtitleLocationItem.className = "settings-item";
            subtitleLocationItem.style.cssText = `
                          padding: 12px 24px;
                          font-size: 13px;
                          cursor: pointer;
                          display: flex;
                          align-items: center;
                          justify-content: space-between;
                          user-select: none;
                          -webkit-user-select: none;
                      `;

            const subtitleLocationText = document.createElement("span");
            subtitleLocationText.textContent = "Carousel Colors";
            subtitleLocationText.style.color = "#ffffff";

            const subtitleLocationArrow = document.createElement("span");
            subtitleLocationArrow.textContent = "►";
            subtitleLocationArrow.style.color = "#aaa";

            subtitleLocationItem.appendChild(subtitleLocationText);
            subtitleLocationItem.appendChild(subtitleLocationArrow);

            subtitleLocationItem.addEventListener("mouseover", () => {
              subtitleLocationItem.style.backgroundColor =
                "rgba(255,255,255,0.1)";
            });

            subtitleLocationItem.addEventListener("mouseout", () => {
              subtitleLocationItem.style.backgroundColor = "transparent";
            });

            subtitleLocationItem.addEventListener("click", () => {
              chordsSubmenu.style.display = "none";

              // בדיקה אם התפריט כבר קיים ומחובר ל-DOM
              if (
                subtitleLocationSubmenu &&
                subtitleLocationSubmenu.isConnected
              ) {
                subtitleLocationSubmenu.style.display = "block";
                return;
              }

              // ניקוי התפריט הישן אם קיים
              if (subtitleLocationSubmenu) {
                window.disposeCarouselColorsSubmenu(
                  subtitleLocationSubmenu,
                  true
                );
              }

              // יצירת תפריט חדש
              subtitleLocationSubmenu =
                window.createCarouselColorsSubmenu(chordsSubmenu);
              subtitleLocationSubmenu.setAttribute(
                "data-yc-menu",
                "subtitle-location"
              );
              subtitleLocationSubmenu.classList.add("yc");
              const player = document.querySelector(".html5-video-player");
              if (player && !player.contains(subtitleLocationSubmenu)) {
                player.appendChild(subtitleLocationSubmenu);
              }

              subtitleLocationSubmenu.style.display = "block";
            });

            // Visual Indicators option
            const visualIndicatorsItem = document.createElement("div");
            visualIndicatorsItem.className = "settings-item";
            visualIndicatorsItem.style.cssText = `
                          padding: 12px 24px;
                          font-size: 13px;
                          cursor: pointer;
                          display: flex;
                          align-items: center;
                          justify-content: space-between;
                          user-select: none;
                          -webkit-user-select: none;
                      `;

            const visualIndicatorsText = document.createElement("span");
            visualIndicatorsText.textContent = "Visual Indicators";
            visualIndicatorsText.style.color = "#ffffff";

            const visualIndicatorsArrow = document.createElement("span");
            visualIndicatorsArrow.textContent = "►";
            visualIndicatorsArrow.style.color = "#aaa";

            visualIndicatorsItem.appendChild(visualIndicatorsText);
            visualIndicatorsItem.appendChild(visualIndicatorsArrow);

            visualIndicatorsItem.addEventListener("mouseover", () => {
              visualIndicatorsItem.style.backgroundColor =
                "rgba(255,255,255,0.1)";
            });

            visualIndicatorsItem.addEventListener("mouseout", () => {
              visualIndicatorsItem.style.backgroundColor = "transparent";
            });

            visualIndicatorsItem.addEventListener("click", () => {
              chordsSubmenu.style.display = "none";

              // Check if submenu exists and is connected to DOM
              if (
                window.visualIndicatorsSubmenu &&
                window.visualIndicatorsSubmenu.isConnected
              ) {
                window.visualIndicatorsSubmenu.style.display = "block";
                return;
              }

              // Clean up old submenu if it exists but is not connected
              if (window.visualIndicatorsSubmenu) {
                window.disposeVisualIndicatorsSubmenu(
                  window.visualIndicatorsSubmenu,
                  true
                );
              }

              // Create new submenu
              window.visualIndicatorsSubmenu =
                window.createVisualIndicatorsSubmenu(chordsSubmenu);
              window.visualIndicatorsSubmenu.setAttribute(
                "data-yc-menu",
                "visual-indicators"
              );
              window.visualIndicatorsSubmenu.classList.add("yc");
              const player = document.querySelector(".html5-video-player");
              if (player && !player.contains(window.visualIndicatorsSubmenu)) {
                player.appendChild(window.visualIndicatorsSubmenu);
              }

              window.visualIndicatorsSubmenu.style.display = "block";
            });

            optionsContainer.appendChild(activeChordPositionItem);
            optionsContainer.appendChild(subtitlesInChordsItem);
            optionsContainer.appendChild(chordsLocationItem);
            optionsContainer.appendChild(visualIndicatorsItem);
            optionsContainer.appendChild(subtitleLocationItem);
            optionsContainer.appendChild(subtitlesFontItem);
            optionsContainer.appendChild(progressBarsItem);

            // Sizes option
            const sizesItem = document.createElement("div");
            sizesItem.className = "settings-item";
            sizesItem.style.cssText = `
                          padding: 12px 24px;
                          font-size: 13px;
                          cursor: pointer;
                          display: flex;
                          align-items: center;
                          justify-content: space-between;
                          user-select: none;
                          -webkit-user-select: none;
                      `;

            const sizesText = document.createElement("span");
            sizesText.textContent = "Layout";
            sizesText.style.color = "#ffffff";

            const sizesArrow = document.createElement("span");
            sizesArrow.textContent = "►";
            sizesArrow.style.color = "#aaa";

            sizesItem.appendChild(sizesText);
            sizesItem.appendChild(sizesArrow);

            sizesItem.addEventListener("mouseover", () => {
              sizesItem.style.backgroundColor = "rgba(255,255,255,0.1)";
            });

            sizesItem.addEventListener("mouseout", () => {
              sizesItem.style.backgroundColor = "transparent";
            });

            sizesItem.addEventListener("click", () => {
              chordsSubmenu.style.display = "none";

              // בדיקה אם התפריט כבר קיים ומחובר ל-DOM
              if (sizesSubmenu && sizesSubmenu.isConnected) {
                sizesSubmenu.style.display = "block";
                return;
              }

              // ניקוי התפריט הישן אם קיים
              if (sizesSubmenu) {
                window.disposeSizesSubmenu(sizesSubmenu, true);
              }

              // יצירת תפריט חדש
              sizesSubmenu = window.createSizesSubmenu(chordsSubmenu);
              sizesSubmenu.setAttribute("data-yc-menu", "sizes");
              sizesSubmenu.classList.add("yc");
              const player = document.querySelector(".html5-video-player");
              if (player && !player.contains(sizesSubmenu)) {
                player.appendChild(sizesSubmenu);
              }

              sizesSubmenu.style.display = "block";
            });

            optionsContainer.appendChild(sizesItem);

            chordsSubmenu.appendChild(optionsContainer);

            // Observe visibility to adjust position
            const observer = new MutationObserver((mutations) => {
              mutations.forEach((m) => {
                if (
                  m.type === "style" &&
                  m.target === chordsSubmenu &&
                  chordsSubmenu.style.display === "block"
                ) {
                  const controls = document.querySelector(".ytp-chrome-bottom");
                  if (controls) {
                    const rect = controls.getBoundingClientRect();
                    chordsSubmenu.style.bottom = `${rect.height}px`;
                    chordsSubmenu.style.right = "12px";
                  }
                }
              });
            });

            observer.observe(chordsSubmenu, {
              attributes: true,
              attributeFilter: ["style"],
            });
            chordsSubmenu.observer = observer;

            const player = document.querySelector(".html5-video-player");
            if (player && !player.contains(chordsSubmenu)) {
              player.appendChild(chordsSubmenu);
            }
          }
          chordsSubmenu.style.display = "block";
        });
      } else if (item.type === "timelineAlwaysVisible") {
        menuItem.addEventListener("click", () => {
          settingsMenu.style.display = "none";

          // בדיקה אם התפריט כבר קיים ומחובר ל-DOM
          if (
            timelineAlwaysVisibleSubmenu &&
            timelineAlwaysVisibleSubmenu.isConnected
          ) {
            timelineAlwaysVisibleSubmenu.style.display = "block";
            return;
          }

          // ניקוי התפריט הישן אם קיים
          if (timelineAlwaysVisibleSubmenu) {
            window.disposeTimelineAlwaysVisibleSubmenu(
              timelineAlwaysVisibleSubmenu,
              true
            );
          }

          // יצירת תפריט חדש
          timelineAlwaysVisibleSubmenu =
            window.createTimelineAlwaysVisibleSubmenu(settingsMenu);
          timelineAlwaysVisibleSubmenu.setAttribute(
            "data-yc-menu",
            "timeline-always-visible"
          );
          timelineAlwaysVisibleSubmenu.classList.add("yc");
          const player = document.querySelector(".html5-video-player");
          if (player && !player.contains(timelineAlwaysVisibleSubmenu)) {
            player.appendChild(timelineAlwaysVisibleSubmenu);
          }

          timelineAlwaysVisibleSubmenu.style.display = "block";
        });
      } else if (item.type === "primaryChordsPosition") {
        menuItem.addEventListener("click", () => {
          settingsMenu.style.display = "none";

          // בדיקה אם התפריט כבר קיים ומחובר ל-DOM
          if (
            window.primaryChordsPositionSubmenu &&
            window.primaryChordsPositionSubmenu.isConnected
          ) {
            window.primaryChordsPositionSubmenu.style.display = "block";
            return;
          }

          // ניקוי התפריט הישן אם קיים
          if (window.primaryChordsPositionSubmenu) {
            window.disposePrimaryChordsPositionSubmenu(
              window.primaryChordsPositionSubmenu,
              true
            );
          }

          // יצירת תפריט חדש - parent הוא settingsMenu (התפריט הראשי)
          window.primaryChordsPositionSubmenu =
            window.createPrimaryChordsPositionSubmenu(settingsMenu);
          window.primaryChordsPositionSubmenu.setAttribute(
            "data-yc-menu",
            "primary-chords-position"
          );
          window.primaryChordsPositionSubmenu.classList.add("yc");
          const player = document.querySelector(".html5-video-player");
          if (
            player &&
            !player.contains(window.primaryChordsPositionSubmenu)
          ) {
            player.appendChild(window.primaryChordsPositionSubmenu);
          }

          window.primaryChordsPositionSubmenu.style.display = "block";
        });
      }

      optionsContainer.appendChild(menuItem);
      if (item.type === "chordsProcessing") {
        optionsContainer.appendChild(ensureChordsProcessingInlineContent());
      }
    });
    settingsMenu.appendChild(optionsContainer);

    // Initialize submenus
    subtitleMenu = window.createSubtitleMenu(() => {
      subtitleMenu.style.display = "none";
      settingsMenu.style.display = "block";
    });

    fontSizeSubmenu = document.querySelector(".font-size-submenu");

    const player = document.querySelector(".html5-video-player");
    if (player) {
      player.appendChild(settingsMenu);
      player.appendChild(subtitleMenu);
      if (fontSizeSubmenu) {
        player.appendChild(fontSizeSubmenu);
      }
    }

    return settingsMenu;
  }

  async function toggleSettingsMenu() {
    // ודא שכל קבצי-ה-settings (subtitleMenu + sub-menus) כבר בזיכרון
    await window.dynamicLoader.loadGroup("settings");

    // בדיקה אם האלמנט קיים אך נותק מה-DOM ע"י fullCleanup
    if (settingsMenu && !settingsMenu.isConnected) {
      settingsMenu = null;
      isSettingsVisible = false;
    }

    if (!settingsMenu) {
      settingsMenu = createSettingsMenu();
    }

    if (!isSettingsVisible) {
      closeAllMenus();
      isSettingsVisible = true;
      button.classList.add("active");
      forceControlsVisible();

      if (typeof refreshSubtitleTimingControl === "function") {
        refreshSubtitleTimingControl();
      }
      if (typeof refreshQuickChordAndFretControl === "function") {
        refreshQuickChordAndFretControl();
      }
      if (typeof refreshSubtitleAndChordsGroupControl === "function") {
        refreshSubtitleAndChordsGroupControl();
      }
      if (typeof refreshChordsProcessingControl === "function") {
        refreshChordsProcessingControl();
      }

      const player = document.querySelector(".html5-video-player");
      if (player) {
        const playerRect = player.getBoundingClientRect();
        const controlsBar = document.querySelector(".ytp-chrome-bottom");
        const controlsHeight = controlsBar ? controlsBar.offsetHeight : 48;
        const menuGap = 12;
        const availableMenuHeight = Math.max(
          140,
          playerRect.height - controlsHeight - menuGap * 3
        );

        settingsMenu.style.right = `${menuGap}px`;
        settingsMenu.style.top = "auto";
        settingsMenu.style.bottom = `${controlsHeight + menuGap}px`;
        settingsMenu.style.maxHeight = `${Math.min(360, availableMenuHeight)}px`;
        settingsMenu.style.display = "block";
      }
    } else {
      closeAllMenus();
    }
  }

  button.addEventListener("click", toggleSettingsMenu);

  window.openAiTranscriptionSettings = async () => {
    try {
      await window.dynamicLoader.loadGroup("settings");

      if (!settingsMenu || !settingsMenu.isConnected) {
        settingsMenu = createSettingsMenu();
      }

      if (!isSettingsVisible) {
        await toggleSettingsMenu();
      } else if (settingsMenu.style.display !== "block") {
        closeAllMenus();
        isSettingsVisible = true;
        button.classList.add("active");
        settingsMenu.style.display = "block";
      }

      const aiItem = Array.from(settingsMenu.querySelectorAll(".settings-item"))
        .find((el) => el.textContent && el.textContent.includes("AI Transcription"));
      if (!aiItem) {
        console.warn("[Settings] AI Transcription menu item not found");
        return false;
      }

      aiItem.click();
      return true;
    } catch (error) {
      console.error("[Settings] Failed to open AI Transcription settings:", error);
      return false;
    }
  };

  // Add document click listener for clicks inside YouTube using addL for proper cleanup
  if (window.addL) {
    window.addL(
      document,
      "click",
      (event) => {
        if (
          isSettingsVisible &&
          !button.contains(event.target) &&
          !settingsMenu.contains(event.target) &&
          (!subtitleMenu || !subtitleMenu.contains(event.target)) &&
          (!fontSizeSubmenu || !fontSizeSubmenu.contains(event.target)) &&
          (!buttonsDisplaySubmenu ||
            !buttonsDisplaySubmenu.contains(event.target)) &&
          (!adjustmentsSubmenu || !adjustmentsSubmenu.contains(event.target)) &&
          (!subtitleModeSubmenu ||
            !subtitleModeSubmenu.contains(event.target)) &&
          (!chordsModeSubmenu || !chordsModeSubmenu.contains(event.target)) &&
          (!chordsSubmenu || !chordsSubmenu.contains(event.target)) &&
          (!progressBarsSubmenu ||
            !progressBarsSubmenu.contains(event.target)) &&
          (!activeChordPositionSubmenu ||
            !activeChordPositionSubmenu.contains(event.target)) &&
          (!chordsLocationSubmenu ||
            !chordsLocationSubmenu.contains(event.target)) &&
          (!timelineAlwaysVisibleSubmenu ||
            !timelineAlwaysVisibleSubmenu.contains(event.target)) &&
          (!lyricsAndChordsSubmenu ||
            !lyricsAndChordsSubmenu.contains(event.target)) &&
          (!lyricsAndChordsPastWordsSubmenu ||
            !lyricsAndChordsPastWordsSubmenu.contains(event.target)) &&
          (!verseChorusColorsSubmenu ||
            !verseChorusColorsSubmenu.contains(event.target)) &&
          (!window.primaryChordsPositionSubmenu ||
            !window.primaryChordsPositionSubmenu.contains(event.target))
        ) {
          closeAllMenus();
        }
      },
      { scope: "ui" }
    );
  } else {
    document.addEventListener("click", (event) => {
      if (
        isSettingsVisible &&
        !button.contains(event.target) &&
        !settingsMenu.contains(event.target) &&
        (!subtitleMenu || !subtitleMenu.contains(event.target)) &&
        (!fontSizeSubmenu || !fontSizeSubmenu.contains(event.target)) &&
        (!buttonsDisplaySubmenu ||
          !buttonsDisplaySubmenu.contains(event.target)) &&
        (!adjustmentsSubmenu || !adjustmentsSubmenu.contains(event.target)) &&
        (!subtitleModeSubmenu || !subtitleModeSubmenu.contains(event.target)) &&
        (!chordsModeSubmenu || !chordsModeSubmenu.contains(event.target)) &&
        (!chordsSubmenu || !chordsSubmenu.contains(event.target)) &&
        (!progressBarsSubmenu || !progressBarsSubmenu.contains(event.target)) &&
        (!activeChordPositionSubmenu ||
          !activeChordPositionSubmenu.contains(event.target)) &&
        (!chordsLocationSubmenu ||
          !chordsLocationSubmenu.contains(event.target)) &&
        (!timelineAlwaysVisibleSubmenu ||
          !timelineAlwaysVisibleSubmenu.contains(event.target)) &&
        (!lyricsAndChordsSubmenu ||
          !lyricsAndChordsSubmenu.contains(event.target)) &&
        (!lyricsAndChordsPastWordsSubmenu ||
          !lyricsAndChordsPastWordsSubmenu.contains(event.target)) &&
        (!verseChorusColorsSubmenu ||
          !verseChorusColorsSubmenu.contains(event.target)) &&
        (!window.primaryChordsPositionSubmenu ||
          !window.primaryChordsPositionSubmenu.contains(event.target))
      ) {
        closeAllMenus();
      }
    });
  }

  // Add window blur listener for clicks outside YouTube
  if (window.addL) {
    window.addL(
      window,
      "blur",
      () => {
        if (isSettingsVisible) {
          closeAllMenus();
        }
      },
      { scope: "ui" }
    );
  } else {
    window.addEventListener("blur", () => {
      if (isSettingsVisible) {
        closeAllMenus();
      }
    });
  }

  container.appendChild(button);
  return container;
};
