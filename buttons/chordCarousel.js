/*==============================================================================
  YouChords – chordCarousel.js
  ------------------------------------------------------------------------------
  ▸ Horizontal Chord Carousel for displaying chords above video
  ▸ Single self-contained module with inline CSS
  ▸ Synchronizes with video playback
  ▸ Resizes Video Container (without forcing video re-rendering)
  ▸ GPU-accelerated animations
  ▸ FIXED: Scaling anchored to bottom
  ▸ FIXED: Removed object-fit manipulation to prevent memory issues
==============================================================================*/

(function () {
  "use strict";

  const DEBUG = false;
  const POSITION_CONTROLS_TIME_ROW_CLASS = "yc-position-controls-time-row";
  const pendingPositionControlTiles = new WeakSet();
  const QUICK_CHORDS_ENABLED_KEY = "youchords_hide_quick_enabled";
  const QUICK_CHORDS_THRESHOLD_KEY = "youchords_hide_quick_threshold";
  const ADDITIONAL_FRET_NUMBERS_KEY = "additionalFretNumbers";
  const QUICK_THRESHOLD_OPTIONS = Array.from({ length: 12 }, (_, idx) => {
    const value = ((idx + 1) / 10).toFixed(1);
    return { value, label: value };
  });
  const FRET_NUMBER_OPTIONS = [
    { value: "none", label: "None" },
    { value: "one", label: "+1" },
    { value: "all", label: "2nd" },
  ];
  const CAROUSEL_SIZE_POPUP_SCALE_KEY = "youchords_carousel_size_popup_scale";
  const CAROUSEL_DISPLAY_POPUP_SCALE_KEY = "youchords_carousel_display_popup_scale";
  const POPUP_UI_SCALE_MIN = 80;
  const POPUP_UI_SCALE_MAX = 140;
  const POPUP_UI_SCALE_STEP = 5;
  const POPUP_UI_SCALE_LEGACY_DEFAULT = 80;
  const POPUP_UI_SCALE_MIGRATION_SUFFIX = "__default100_migrated_v1";

  function getViewportBounds() {
    const visualViewport = window.visualViewport;
    const left = Number.isFinite(visualViewport?.offsetLeft)
      ? visualViewport.offsetLeft
      : 0;
    const top = Number.isFinite(visualViewport?.offsetTop)
      ? visualViewport.offsetTop
      : 0;
    const widthCandidates = [
      visualViewport?.width,
      document.documentElement?.clientWidth,
      window.innerWidth,
    ].filter((value) => Number.isFinite(value) && value > 0);
    const heightCandidates = [
      visualViewport?.height,
      document.documentElement?.clientHeight,
      window.innerHeight,
    ].filter((value) => Number.isFinite(value) && value > 0);
    const width = widthCandidates.length ? Math.min(...widthCandidates) : 0;
    const height = heightCandidates.length ? Math.min(...heightCandidates) : 0;

    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
    };
  }

  function clampCarouselPopupPosition(anchorEl, panel, margin = 8) {
    const rect = anchorEl.getBoundingClientRect();
    const viewport = getViewportBounds();
    const safeWidth = viewport.width || window.innerWidth || 0;
    const safeHeight = viewport.height || window.innerHeight || 0;
    panel.style.maxWidth = `calc(${safeWidth}px - ${margin * 2}px)`;
    panel.style.maxHeight = `${Math.max(120, safeHeight - margin * 2)}px`;
    panel.style.overflowY = "auto";

    const panelRect = panel.getBoundingClientRect();
    const preferredLeft = rect.right - panelRect.width;
    const minLeft = viewport.left + margin;
    const maxLeft = Math.max(minLeft, viewport.right - panelRect.width - margin);
    const left = Math.max(minLeft, Math.min(preferredLeft, maxLeft));
    const belowTop = rect.bottom + margin;
    const canOpenBelow = belowTop + panelRect.height <= viewport.bottom - margin;
    const aboveTop = rect.top - panelRect.height - margin;
    const maxTop = Math.max(viewport.top + margin, viewport.bottom - panelRect.height - margin);
    const top = canOpenBelow
      ? belowTop
      : Math.max(viewport.top + margin, Math.min(aboveTop, maxTop));

    return { rect, left, top, canOpenBelow };
  }

  function clampPopupUiScalePercent(value, fallback = 100) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const stepped = Math.round(parsed / POPUP_UI_SCALE_STEP) * POPUP_UI_SCALE_STEP;
    return Math.max(POPUP_UI_SCALE_MIN, Math.min(POPUP_UI_SCALE_MAX, stepped));
  }

  function loadCarouselPopupScaleSetting(storageKey, fallback = 100) {
    try {
      const key = String(storageKey || "");
      const raw = localStorage.getItem(key);
      const migrationKey = `${key}${POPUP_UI_SCALE_MIGRATION_SUFFIX}`;
      if (
        String(raw ?? "").trim() === String(POPUP_UI_SCALE_LEGACY_DEFAULT) &&
        localStorage.getItem(migrationKey) !== "true"
      ) {
        const migrated = clampPopupUiScalePercent(fallback, 100);
        localStorage.setItem(key, String(migrated));
        localStorage.setItem(migrationKey, "true");
        return migrated;
      }
      return clampPopupUiScalePercent(raw, fallback);
    } catch (error) {
      console.warn("[ChordCarousel] Failed reading popup scale setting:", error);
      return clampPopupUiScalePercent(fallback, 100);
    }
  }

  function saveCarouselPopupScaleSetting(storageKey, value) {
    try {
      const safeValue = clampPopupUiScalePercent(value, 100);
      localStorage.setItem(String(storageKey || ""), String(safeValue));
      return safeValue;
    } catch (error) {
      console.warn("[ChordCarousel] Failed storing popup scale setting:", error);
      return clampPopupUiScalePercent(value, 100);
    }
  }

  function createCarouselPopupScaleControl({
    initialPercent = 100,
    onChange = null,
  } = {}) {
    let current = clampPopupUiScalePercent(initialPercent, 100);

    const wrap = document.createElement("div");
    wrap.title = "Menu zoom";
    wrap.style.cssText = `
      display: inline-flex;
      flex-direction: row;
      align-items: center;
      gap: 4px;
      padding: 2px 4px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.06);
      direction: ltr !important;
      unicode-bidi: isolate !important;
      user-select: none;
      -webkit-user-select: none;
    `;

    const createButton = (label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.style.cssText = `
        width: 18px;
        height: 18px;
        border: 1px solid rgba(255, 255, 255, 0.28);
        border-radius: 5px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.92);
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        padding: 0;
        cursor: pointer;
        direction: ltr !important;
        unicode-bidi: isolate !important;
        transition: background 0.12s ease, border-color 0.12s ease, opacity 0.12s ease;
      `;
      button.addEventListener("mouseenter", () => {
        if (button.disabled) return;
        button.style.background = "rgba(255, 255, 255, 0.16)";
        button.style.borderColor = "rgba(255, 255, 255, 0.42)";
      });
      button.addEventListener("mouseleave", () => {
        button.style.background = "rgba(255, 255, 255, 0.08)";
        button.style.borderColor = "rgba(255, 255, 255, 0.28)";
      });
      return button;
    };

    const minusButton = createButton("-");
    minusButton.setAttribute("aria-label", "Decrease menu zoom");

    const value = document.createElement("span");
    value.style.cssText = `
      min-width: 30px;
      text-align: center;
      font-size: 11px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.9);
      letter-spacing: 0.1px;
      line-height: 1;
      direction: ltr !important;
      unicode-bidi: isolate !important;
    `;

    const plusButton = createButton("+");
    plusButton.setAttribute("aria-label", "Increase menu zoom");

    const refresh = (shouldNotify = false) => {
      value.textContent = String(current);
      minusButton.disabled = current <= POPUP_UI_SCALE_MIN;
      plusButton.disabled = current >= POPUP_UI_SCALE_MAX;
      minusButton.style.opacity = minusButton.disabled ? "0.45" : "1";
      plusButton.style.opacity = plusButton.disabled ? "0.45" : "1";
      minusButton.style.cursor = minusButton.disabled ? "default" : "pointer";
      plusButton.style.cursor = plusButton.disabled ? "default" : "pointer";
      if (shouldNotify && typeof onChange === "function") {
        onChange(current);
      }
    };

    const setValue = (nextPercent, shouldNotify = true) => {
      current = clampPopupUiScalePercent(nextPercent, current);
      refresh(shouldNotify);
    };

    minusButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setValue(current - POPUP_UI_SCALE_STEP);
    });

    plusButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setValue(current + POPUP_UI_SCALE_STEP);
    });

    wrap.appendChild(minusButton);
    wrap.appendChild(value);
    wrap.appendChild(plusButton);
    refresh(false);

    return {
      element: wrap,
      setValue,
      getValue: () => current,
    };
  }

  function normalizeQuickThreshold(value) {
    const parsed = parseFloat(value);
    if (!Number.isFinite(parsed)) return 0.5;
    return Math.max(0.1, Math.min(1.2, Math.round(parsed * 10) / 10));
  }

  function normalizeFretNumbersMode(value) {
    const normalized = String(value || "none");
    return FRET_NUMBER_OPTIONS.some((option) => option.value === normalized)
      ? normalized
      : "none";
  }

  function createSlidersIconSvg() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    [
      { x: 6, knobY: 8 },
      { x: 12, knobY: 15 },
      { x: 18, knobY: 11 },
    ].forEach(({ x, knobY }) => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
      line.setAttribute("d", `M${x} 4v16`);
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("stroke-width", "2");
      line.setAttribute("stroke-linecap", "round");
      svg.appendChild(line);

      const knob = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      knob.setAttribute("cx", String(x));
      knob.setAttribute("cy", String(knobY));
      knob.setAttribute("r", "2.4");
      knob.setAttribute("fill", "currentColor");
      knob.setAttribute("stroke", "currentColor");
      svg.appendChild(knob);
    });

    return svg;
  }

  /*============================================================================
    HIDE QUICK CHORDS - Filter short duration chords
  ============================================================================*/
  // Initialize from localStorage
  window.hideQuickChordsEnabled = localStorage.getItem(QUICK_CHORDS_ENABLED_KEY) !== "false";
  window.hideQuickChordsThreshold = normalizeQuickThreshold(
    localStorage.getItem(QUICK_CHORDS_THRESHOLD_KEY) || "0.5"
  );

  /**
   * Filter out quick chords based on user settings
   * @param {Array} chords - Array of chord objects with time property
   * @returns {Array} - Filtered array of chords
   */
  window.filterQuickChords = function (chords) {
    if (!window.hideQuickChordsEnabled || !chords || chords.length === 0) {
      return chords;
    }

    const threshold = window.hideQuickChordsThreshold || 0.5;
    const filtered = [];

    // Step 1: Filter out quick chords
    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      const nextChord = chords[i + 1];
      const duration = nextChord ? nextChord.time - chord.time : 3.0; // Default 3s for last chord

      if (duration >= threshold || chord.__forceKeep === true) {
        filtered.push(chord);
      }
    }

    // Step 2: Merge consecutive identical chords
    const merged = [];
    for (let i = 0; i < filtered.length; i++) {
      const chord = filtered[i];
      const chordName = chord.chord || chord.name;
      const prevChord = merged[merged.length - 1];
      const prevName = prevChord ? (prevChord.chord || prevChord.name) : null;

      // Only add if different from previous chord. Forced split chords must remain visible.
      if (
        chordName !== prevName ||
        prevChord?.__forceKeep === true ||
        chord.__forceKeep === true
      ) {
        merged.push(chord);
      }
    }

    if (DEBUG && (filtered.length !== chords.length || merged.length !== filtered.length)) {
      console.log(`[filterQuickChords] Filtered ${chords.length - filtered.length} quick chords, merged ${filtered.length - merged.length} duplicates (threshold: ${threshold}s)`);
    }

    return merged;
  };

  /*============================================================================
    CONFIGURATION
  ============================================================================*/
  const CONFIG = {
    PIXELS_PER_SECOND: 20,
    MIN_RECT_WIDTH: 40,
    FIXED_FRAME_INDEX: 3,
    BASE_HEIGHT: 245, // Height increased to fit rectangles
    MIN_SCALE: 0.5,
    MAX_SCALE: 1.5,
    SCALE_STEP: 0.05,
    BEAT_DURATION: 0.5, // Each beat cell = 0.5 seconds
    MAX_BEATS_PER_ROW: 10, // Maximum 10 cells per row
    TILE_MIN_HEIGHT: 228,
    TILE_BOTTOM_OFFSET: 4,
    BEAT_CELL_HEIGHT: 16,
    BEAT_ROW_GAP: 2,
    BEAT_GRID_VERTICAL_PADDING: 6,
    BEAT_GRID_MARGIN_BOTTOM: 6,
    BEAT_GRID_TOP_GUARD: 12,

    // Virtual Scrolling Configuration
    VISIBLE_TILES: 12, // Number of tiles visible at once (estimated)
    BUFFER_TILES: 6, // Extra tiles to render before/after visible area
  };

  /*============================================================================
    CSS INJECTION
  ============================================================================*/
  function injectCSS() {
    if (document.getElementById("yc-carousel-styles")) return;

    const style = document.createElement("style");
    style.id = "yc-carousel-styles";
    style.textContent = `
      /* WRAPPER: Holds Carousel absolutely at top of player */
      .yc-root-wrapper {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        z-index: 60;
        background: #f9f9f9ff;
      }

      .yc-carousel-info-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 22px;
        height: 22px;
        border: 1px solid rgba(0, 0, 0, 0.28);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.9);
        color: rgba(0, 0, 0, 0.72);
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 65;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease, background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
      }

      .yc-carousel-edits-btn {
        position: absolute;
        top: 8px;
        right: 34px;
        width: 22px;
        height: 22px;
        border: 1px solid rgba(0, 0, 0, 0.28);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.9);
        color: rgba(0, 0, 0, 0.72);
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 65;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease, background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
      }

      .yc-carousel-size-btn {
        position: absolute;
        top: 8px;
        right: 60px;
        width: 22px;
        height: 22px;
        border: 1px solid rgba(0, 0, 0, 0.28);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.9);
        color: rgba(0, 0, 0, 0.72);
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 65;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease, background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
      }

      .yc-carousel-options-btn {
        position: absolute;
        top: 8px;
        right: 86px;
        width: 22px;
        height: 22px;
        border: 1px solid rgba(0, 0, 0, 0.28);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.9);
        color: rgba(0, 0, 0, 0.72);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 65;
        opacity: 0;
        pointer-events: none;
        padding: 0;
        transition: opacity 0.2s ease, background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
      }

      .yc-carousel-options-btn svg {
        width: 15px;
        height: 15px;
        display: block;
      }

      .yc-carousel-instrument-btn {
        position: absolute;
        top: 8px;
        right: 112px;
        width: 22px;
        height: 22px;
        border: 1px solid rgba(0, 0, 0, 0.28);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.9);
        color: rgba(0, 0, 0, 0.72);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 65;
        opacity: 0;
        pointer-events: none;
        padding: 0;
        font-size: 11px;
        font-weight: 800;
        line-height: 1;
        transition: opacity 0.2s ease, background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
      }

      .yc-carousel-key-mode-group {
        position: absolute;
        top: 8px;
        right: 138px;
        height: 22px;
        display: inline-flex;
        flex-direction: row;
        align-items: stretch;
        gap: 4px;
        direction: ltr !important;
        unicode-bidi: isolate !important;
        z-index: 65;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }

      .yc-carousel-mode-switch {
        position: absolute;
        top: 8px;
        right: 112px;
        height: 22px;
        border: 1px solid rgba(0, 0, 0, 0.28);
        border-radius: 6px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.9);
        display: inline-flex;
        flex-direction: row;
        align-items: stretch;
        direction: ltr !important;
        unicode-bidi: isolate !important;
        z-index: 65;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease, background 0.14s ease, border-color 0.14s ease;
      }

      .yc-carousel-key-mode-group .yc-carousel-mode-switch {
        position: relative;
        top: auto;
        right: auto;
        opacity: 1;
        pointer-events: auto;
      }

      .yc-carousel-key-badge {
        position: absolute;
        top: 8px;
        right: 238px;
        height: 22px;
        min-width: 78px;
        padding: 0 3px;
        border: 1px solid rgba(0, 0, 0, 0.24);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.92);
        color: rgba(0, 0, 0, 0.76);
        font-size: 10px;
        font-weight: 800;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 2px;
        white-space: nowrap;
        direction: ltr !important;
        unicode-bidi: isolate !important;
        z-index: 65;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease, background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
      }

      .yc-carousel-key-mode-group .yc-carousel-key-badge {
        position: relative;
        top: auto;
        right: auto;
        opacity: 1;
        pointer-events: auto;
      }

      .yc-carousel-key-badge[data-yc-empty="true"] {
        display: none;
      }

      .yc-carousel-key-badge[data-yc-transposed="true"] {
        background: rgba(245, 158, 11, 0.2);
        border-color: rgba(245, 158, 11, 0.68);
        color: #92400e;
      }

      .yc-key-transpose-btn {
        width: 17px;
        height: 18px;
        border: 0;
        border-radius: 4px;
        padding: 0;
        background: transparent;
        color: inherit;
        font-size: 10px;
        font-weight: 900;
        line-height: 1;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 0.14s ease, color 0.14s ease, transform 0.08s ease;
      }

      .yc-key-transpose-btn:hover {
        background: rgba(33, 150, 243, 0.16);
        color: #0b6cb8;
      }

      .yc-key-transpose-btn:active {
        transform: scale(0.94);
      }

      .yc-key-label {
        min-width: 42px;
        text-align: center;
        pointer-events: none;
      }

      .yc-carousel-mode-btn {
        min-width: 20px;
        padding: 0 5px;
        border: 0;
        border-right: 1px solid rgba(0, 0, 0, 0.2);
        background: transparent;
        color: rgba(0, 0, 0, 0.74);
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        direction: ltr !important;
        unicode-bidi: isolate !important;
        transition: background 0.14s ease, color 0.14s ease;
      }

      .yc-carousel-mode-btn:last-child {
        border-right: none;
      }

      .yc-carousel-mode-btn.yc-easy-key-btn.yc-easy-key-active {
        background: rgba(245, 158, 11, 0.34);
        color: #7c2d12;
        box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.55);
      }

      .html5-video-player:hover .yc-carousel-info-btn,
      .yc-root-wrapper:hover .yc-carousel-info-btn,
      .html5-video-player:hover .yc-carousel-edits-btn,
      .yc-root-wrapper:hover .yc-carousel-edits-btn,
      .html5-video-player:hover .yc-carousel-size-btn,
      .yc-root-wrapper:hover .yc-carousel-size-btn,
      .html5-video-player:hover .yc-carousel-options-btn,
      .yc-root-wrapper:hover .yc-carousel-options-btn,
      .html5-video-player:hover .yc-carousel-instrument-btn,
      .yc-root-wrapper:hover .yc-carousel-instrument-btn,
      .html5-video-player:hover .yc-carousel-key-mode-group,
      .yc-root-wrapper:hover .yc-carousel-key-mode-group,
      .html5-video-player:hover .yc-carousel-mode-switch,
      .yc-root-wrapper:hover .yc-carousel-mode-switch,
      .html5-video-player:hover .yc-carousel-key-badge,
      .yc-root-wrapper:hover .yc-carousel-key-badge {
        opacity: 1;
        pointer-events: auto;
      }

      .yc-carousel-info-btn:hover {
        background: rgba(33, 150, 243, 0.12);
        border-color: rgba(33, 150, 243, 0.45);
        color: #0b6cb8;
      }

      .yc-carousel-edits-btn:hover {
        background: rgba(33, 150, 243, 0.12);
        border-color: rgba(33, 150, 243, 0.45);
        color: #0b6cb8;
      }

      .yc-carousel-edits-btn.yc-edits-none:hover {
        background: rgba(33, 150, 243, 0.12);
        border-color: rgba(33, 150, 243, 0.45);
        color: #0b6cb8;
      }

      .yc-carousel-edits-btn.yc-edits-active:hover,
      .yc-carousel-edits-btn.yc-edits-threshold-mismatch:hover {
        background: rgba(245, 158, 11, 0.18);
        border-color: rgba(245, 158, 11, 0.58);
        color: #b45309;
      }

      .yc-carousel-size-btn:hover {
        background: rgba(33, 150, 243, 0.12);
        border-color: rgba(33, 150, 243, 0.45);
        color: #0b6cb8;
      }

      .yc-carousel-options-btn:hover {
        background: rgba(33, 150, 243, 0.12);
        border-color: rgba(33, 150, 243, 0.45);
        color: #0b6cb8;
      }

      .yc-carousel-instrument-btn:hover {
        background: rgba(33, 150, 243, 0.12);
        border-color: rgba(33, 150, 243, 0.45);
        color: #0b6cb8;
      }

      .yc-carousel-mode-switch:hover {
        background: rgba(33, 150, 243, 0.12);
        border-color: rgba(33, 150, 243, 0.45);
      }

      .yc-carousel-mode-btn:hover {
        background: rgba(33, 150, 243, 0.12);
        color: #0b6cb8;
      }

      .yc-carousel-mode-btn.yc-mode-selected {
        background: rgba(33, 150, 243, 0.2);
        color: #0b6cb8;
      }

      .yc-carousel-info-btn.yc-info-open {
        background: rgba(33, 150, 243, 0.2);
        border-color: rgba(52, 149, 233, 0.85);
        color: #0b6cb8;
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      .yc-carousel-edits-btn.yc-edits-open {
        background: rgba(33, 150, 243, 0.2) !important;
        border-color: rgba(52, 149, 233, 0.85) !important;
        color: #0b6cb8 !important;
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      .yc-carousel-size-btn.yc-size-open {
        background: rgba(33, 150, 243, 0.2);
        border-color: rgba(52, 149, 233, 0.85);
        color: #0b6cb8;
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      .yc-carousel-options-btn.yc-options-open {
        background: rgba(33, 150, 243, 0.2);
        border-color: rgba(52, 149, 233, 0.85);
        color: #0b6cb8;
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      .yc-carousel-instrument-btn.yc-instrument-open {
        background: rgba(33, 150, 243, 0.2);
        border-color: rgba(52, 149, 233, 0.85);
        color: #0b6cb8;
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      .html5-video-player:not(:hover) .yc-carousel-info-btn.yc-info-open,
      .html5-video-player.ytp-autohide .yc-carousel-info-btn.yc-info-open,
      .html5-video-player:not(:hover) .yc-carousel-edits-btn.yc-edits-open,
      .html5-video-player.ytp-autohide .yc-carousel-edits-btn.yc-edits-open,
      .html5-video-player:not(:hover) .yc-carousel-size-btn.yc-size-open,
      .html5-video-player.ytp-autohide .yc-carousel-size-btn.yc-size-open,
      .html5-video-player:not(:hover) .yc-carousel-options-btn.yc-options-open,
      .html5-video-player.ytp-autohide .yc-carousel-options-btn.yc-options-open,
      .html5-video-player:not(:hover) .yc-carousel-instrument-btn.yc-instrument-open,
      .html5-video-player.ytp-autohide .yc-carousel-instrument-btn.yc-instrument-open {
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
      }

      .html5-video-player.ytp-autohide .yc-carousel-edits-btn:not(.yc-edits-open) {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      .html5-video-player.ytp-autohide .yc-carousel-size-btn:not(.yc-size-open) {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      .html5-video-player.ytp-autohide .yc-carousel-options-btn:not(.yc-options-open) {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      .html5-video-player.ytp-autohide .yc-carousel-key-mode-group {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      .html5-video-player.ytp-autohide .yc-carousel-mode-switch {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      .html5-video-player.ytp-autohide .yc-carousel-key-badge {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      .html5-video-player.yc-carousel-controls-locked .yc-carousel-info-btn,
      .html5-video-player.yc-carousel-controls-locked .yc-carousel-edits-btn,
      .html5-video-player.yc-carousel-controls-locked .yc-carousel-size-btn,
      .html5-video-player.yc-carousel-controls-locked .yc-carousel-options-btn,
      .html5-video-player.yc-carousel-controls-locked .yc-carousel-instrument-btn,
      .html5-video-player.yc-carousel-controls-locked .yc-carousel-key-mode-group,
      .html5-video-player.yc-carousel-controls-locked .yc-carousel-mode-switch,
      .html5-video-player.yc-carousel-controls-locked .yc-carousel-key-badge,
      .html5-video-player.ytp-autohide.yc-carousel-controls-locked .yc-carousel-info-btn,
      .html5-video-player.ytp-autohide.yc-carousel-controls-locked .yc-carousel-edits-btn,
      .html5-video-player.ytp-autohide.yc-carousel-controls-locked .yc-carousel-size-btn,
      .html5-video-player.ytp-autohide.yc-carousel-controls-locked .yc-carousel-options-btn,
      .html5-video-player.ytp-autohide.yc-carousel-controls-locked .yc-carousel-instrument-btn,
      .html5-video-player.ytp-autohide.yc-carousel-controls-locked .yc-carousel-key-mode-group,
      .html5-video-player.ytp-autohide.yc-carousel-controls-locked .yc-carousel-mode-switch,
      .html5-video-player.ytp-autohide.yc-carousel-controls-locked .yc-carousel-key-badge {
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
      }

      .yc-carousel-edits-btn.yc-edits-none {
        color: rgba(90, 90, 90, 0.82);
        border-color: rgba(90, 90, 90, 0.32);
        background: rgba(255, 255, 255, 0.82);
      }

      .yc-carousel-edits-btn.yc-edits-threshold-mismatch {
        color: #b45309;
        border-color: rgba(245, 158, 11, 0.5);
        background: rgba(245, 158, 11, 0.14);
      }

      .yc-chord-carousel {
        width: 100%;
        background: #f9f9f9ff;
        border-bottom: 1px solid #000000;
        padding: 0;
        overflow-x: auto;
        overflow-y: hidden;
        display: flex;
        align-items: flex-end;
        position: relative;
        clip-path: inset(0);
        scrollbar-width: thin;
        scrollbar-color: #999999 #f9f9f9;
        
        box-sizing: border-box;
      }
      .yc-chord-carousel::-webkit-scrollbar { height: 8px; }
      .yc-chord-carousel::-webkit-scrollbar-track { background: #ffffff; border-radius: 3px; }
      .yc-chord-carousel::-webkit-scrollbar-thumb { background: #999999; border-radius: 3px; }
      .yc-chord-carousel::-webkit-scrollbar-thumb:hover { background: #777777; }
      
      .yc-chord-carousel-inner {
        display: flex;
        gap: 10px;
        padding: 77px 20px 0 20px;
        height: 100%;
        min-width: min-content;
        align-items: flex-end;
        position: relative;
        box-sizing: border-box;
        padding-right: 50vw;
        
        /* Origin set to BOTTOM for correct scaling */
        transform-origin: left bottom;
        backface-visibility: hidden;
      }

      .yc-chord-carousel.is-rtl { direction: rtl; }
      
      .yc-chord-carousel.is-rtl .yc-chord-carousel-inner {
        padding-right: 20px;
        padding-left: 50vw;
        flex-direction: row;
        
        /* Origin set to BOTTOM for correct scaling */
        transform-origin: right bottom;
      }

      /* --- REMOVED BLUE DASHED FRAME CSS HERE --- */
      
      .yc-chord-tile {
        flex: 0 0 134px;
        width: 134px;
        min-width: 134px;
        max-width: 134px;
        min-height: 228px;
        background: #ffffff;
        border: 1px solid #000000;
        border-radius: 10px;
        padding: 10px;
        margin-bottom: 2px;
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        box-sizing: border-box;
        position: relative;
        overflow: visible !important;
        direction: ltr;
        transform-style: flat;
      }
      .yc-chord-tile:hover {
        background: #e8e8e8;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      }
      .yc-chord-tile.active {
        border-color: #2196f3 !important;
        border-style: solid !important;
        position: relative;
        z-index: 10;
      }

      .yc-chord-tile.yc-edit-preview {
        box-shadow: none;
        border: 4px solid #f59e0b !important;
      }

      .yc-chord-tile.yc-remove-preview {
        box-shadow: none;
        border: 4px solid #ef4444 !important;
      }

      .yc-chord-tile.yc-timing-preview {
        box-shadow: none;
        border-width: 4px !important;
        border-style: solid !important;
      }

      .yc-chord-tile.yc-timing-preview-before {
        border-color: #f59e0b !important;
      }

      .yc-chord-tile.yc-timing-preview-current {
        border-color: #38bdf8 !important;
      }

      .yc-chord-tile.yc-timing-preview-after {
        border-color: #22c55e !important;
      }

      .yc-chord-tile.yc-timing-preview::after {
        content: attr(data-yc-timing-role-label);
        position: absolute;
        top: 24px;
        left: 2px;
        transform: none;
        z-index: 28;
        height: 13px;
        line-height: 13px;
        padding: 0 4px;
        border-radius: 999px;
        color: #ffffff;
        font-size: 7.5px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0;
        pointer-events: none;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
      }

      .yc-chord-tile.yc-timing-preview-before::after {
        background: #f59e0b;
      }

      .yc-chord-tile.yc-timing-preview-current::after {
        background: #0284c7;
      }

      .yc-chord-tile.yc-timing-preview-after::after {
        background: #16a34a;
      }

      .yc-chord-tile.yc-split-added {
        border-color: #38bdf8 !important;
        box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.8);
      }

      .yc-chord-tile.yc-split-added[data-yc-split-side="before"] {
        background-image:
          linear-gradient(135deg, #f97316 0 9px, transparent 9px),
          linear-gradient(225deg, #f97316 0 9px, transparent 9px),
          linear-gradient(45deg, #f97316 0 9px, transparent 9px),
          linear-gradient(315deg, #f97316 0 9px, transparent 9px);
        background-position: top left, top right, bottom left, bottom right;
        background-size: 18px 18px;
        background-repeat: no-repeat;
      }

      .yc-chord-tile.yc-split-added[data-yc-split-side="after"] {
        background-image:
          linear-gradient(135deg, #22c55e 0 9px, transparent 9px),
          linear-gradient(225deg, #22c55e 0 9px, transparent 9px),
          linear-gradient(45deg, #22c55e 0 9px, transparent 9px),
          linear-gradient(315deg, #22c55e 0 9px, transparent 9px);
        background-position: top left, top right, bottom left, bottom right;
        background-size: 18px 18px;
        background-repeat: no-repeat;
      }

      .yc-chord-actions {
        position: absolute;
        left: 2px;
        right: 2px;
        bottom: 1px;
        height: 20px;
        display: block;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.12s ease;
        z-index: 30;
      }

      .yc-chord-tile:hover .yc-chord-actions,
      .yc-chord-actions:hover,
      .yc-chord-actions:focus-within {
        opacity: 1;
        pointer-events: auto;
      }

      .yc-chord-action-btn {
        border: 1px solid rgba(0, 0, 0, 0.24);
        border-radius: 6px;
        height: 20px;
        min-width: 24px;
        padding: 0 4px;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        position: absolute;
        bottom: 0;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.9);
        color: #111;
        transition: background-color 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
      }

      .yc-chord-action-btn:hover {
        background: #ffffff;
        border-color: #8a8f98;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.14);
      }

      .yc-chord-action-edit {
        color: #0ea5e9;
        left: 0;
      }

      .yc-chord-action-edit:hover {
        border-color: #7dd3fc;
        background: #eef8ff;
      }

      .yc-chord-action-time {
        color: #16a34a;
        left: 50%;
        transform: translateX(-50%);
      }

      .yc-chord-action-time:hover {
        border-color: #86efac;
        background: #f0fdf4;
      }

      .yc-chord-action-remove {
        color: #ef4444;
        right: 0;
        min-width: 20px;
        padding: 0;
      }

      .yc-chord-action-remove:hover {
        border-color: #fda4af;
        background: #fff1f2;
      }

      .yc-chord-actions.hide-edit .yc-chord-action-edit,
      .yc-chord-actions.hide-edit .yc-chord-action-time {
        display: none;
      }

      .yc-chord-actions.hide-remove .yc-chord-action-remove {
        display: none;
      }
      
      /* Singing Start Indicator - Green Dot */
      .yc-singing-start-dot {
        width: 8px;
        height: 8px;
        background: #4CAF50;
        border-radius: 50%;
        display: inline-block;
        margin-right: 4px;
        vertical-align: middle;
        box-shadow: 0 0 4px rgba(76, 175, 80, 0.6);
        flex-shrink: 0;
        transform: translateY(-4px);
      }
      
      /* Hide singing start dots when disabled */
      .yc-singing-dot-hidden .yc-singing-start-dot,
      .yc-singing-dot-hidden .yc-ellipse-singing-dot {
        display: none !important;
      }
      
      .yc-chord-name-container {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      /* Beat Grid - Clean & Sharp (All Blue) */
      .yc-beat-grid {
        position: absolute;
        bottom: 100%;
        margin-bottom: 6px;
        left: 50%;
        transform: translateX(-50%);
        display: grid;
        grid-template-columns: repeat(10, 1fr);
        gap: 2px;
        background: #e0e0e0;
        padding: 3px;
        border-radius: 3px;
        pointer-events: none;
        z-index: 15;
      }
      
      .yc-beat-cell {
        width: 8px;
        height: 16px;
        background-color: #bdbdbd;
        border-radius: 0;
        transition: background-color 0.1s ease;
        image-rendering: crisp-edges;
        image-rendering: -moz-crisp-edges;
        image-rendering: pixelated;
      }
      
      .yc-beat-cell.filled {
        background-color: #2196f3;
      }
      
      .yc-chord-tile.active .yc-beat-cell.filled {
        background-color: #2196f3;
      }
      
      /* RTL Support - Beat Grid fills from right to left */
      .yc-chord-carousel.is-rtl .yc-beat-grid {
        direction: rtl;
      }
      .yc-chord-name {
        font-size: 15px;
        font-weight: 700;
        color: #2c2c2c;
        text-align: center;
        white-space: nowrap;
        overflow: visible;
        text-overflow: ellipsis;
        max-width: 100%;
        flex-shrink: 0;
        margin-bottom: 2px;
        margin-top: -8px;
      }
      .yc-chord-time {
        font-size: 12px;
        color: #6b6b6b;
        font-family: sans-serif;
        flex-shrink: 0;
        text-align: center;
        margin-bottom: 4px;
        margin-top: -10px;
      }
      .yc-chord-diagram {
        width: 85px;
        min-width: 85px;
        max-width: 85px;
        height: 95px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        flex: 0 0 85px;
        margin-top: 7px;
      }
      .yc-chord-diagram svg {
        width: 100%;
        height: 100%;
        transform: scale(1.7);
      }

      /* Default position: aligned with short chord names. Long names opt into time-row controls. */
      .yc-chord-tile svg .chord-arrow-left {
        font-size: 8px !important;
        cursor: pointer;
        transform: translate(-3px, 0px);
      }
      
      .yc-chord-tile svg .chord-arrow-right {
        font-size: 8px !important;
        cursor: pointer;
        transform: translate(-2px, 0px);
      }
      
              /* גלובוס - הגדלה והזזה */
      .yc-chord-tile svg .global-position-globe {
        font-size: 8px !important;
        transform: translate(-2px, 0px);
      }

      .yc-chord-tile svg .chord-position-counter {
        font-size: 8px !important;
        font-weight: 400;
        transform: translate(0px, 0px);
      }

      .yc-chord-tile.yc-position-controls-time-row svg .chord-arrow-left {
        transform: translate(-3px, 10px);
      }

      .yc-chord-tile.yc-position-controls-time-row svg .chord-arrow-right {
        transform: translate(-2px, 10px);
      }

      .yc-chord-tile.yc-position-controls-time-row svg .global-position-globe {
        transform: translate(-2px, 10px);
      }

      .yc-chord-tile.yc-position-controls-time-row svg .chord-position-counter {
        transform: translate(0px, 10px);
      }

      
      .html5-video-container {
        /* No transition for instant layout changes */
      }
      
      .yc-active .html5-main-video {
        width: 100% !important;
        height: 100% !important;
        left: 0 !important;
        top: 0 !important;
        object-fit: fill !important;
      }

      .html5-video-player.yc-active .ytp-bezel {
        top: var(--yc-carousel-visible-video-center-y, 50%) !important;
      }
    `;
    document.head.appendChild(style);
    DEBUG && console.log("[ChordCarousel] CSS injected");
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  class ChordCarousel {
    constructor() {
      // 🎯 STEP 1: Singleton Pattern - Prevent Memory Leaks in SPA
      if (ChordCarousel.instance) {
        DEBUG &&
          console.log(
            "[ChordCarousel] 🔄 Destroying old instance before creating new one"
          );
        ChordCarousel.instance.destroy();
      }
      ChordCarousel.instance = this;

      this.wrapperElement = null;
      this.carouselElement = null;
      this.innerElement = null;
      this.infoButtonElement = null;
      this.editsSummaryButtonElement = null;
      this.sizeButtonElement = null;
      this.sizePopupClose = null;
      this.sizePopupAnchor = null;
      this.diagramOptionsButtonElement = null;
      this.diagramOptionsPopupClose = null;
      this.diagramOptionsPopupAnchor = null;
      this.diagramOptionsPopupStateUpdaters = new Set();
      this.quickModeSwitchElement = null;
      this.quickModeButtons = new Map();
      this.easyKeyButtonElement = null;
      this.estimatedKeyElement = null;
      this.estimatedKeyLabelElement = null;
      this.chords = [];
      this.currentChordIndex = -1;
      this.isVisible = false;
      this.currentScale = 0.75;
      this.baseHeight = CONFIG.BASE_HEIGHT; // Allow dynamic height changes
      this.currentDirection = "LTR";
      this.activeChordPosition = 3; // Default INDEX 3 (position 4 for user)
      this.rtlScrollType = "default";
      this.isMouseDown = false;
      this.resumeScrollTimeout = null; // Timer for resuming auto-scroll
      this.videoElement = null;
      this.videoTimeUpdateHandler = null;
      this.pendingTimeouts = new Set();
      this.pendingRAFs = new Set();
      this.showRequestId = 0;
      this.currentVideoId = null; // Track current video ID
      this.navigationFallbackIntervalId = null; // Fallback only (event-first navigation detection)
      this.lastNavigationUrl = location.href;
      this.overlayResizeObserver = null;
      this.overlayLayoutRAF = null;
      this.playerScaleX = 1;
      this.playerScaleCompensationX = 1;

      // Virtual Scrolling
      this.tilePool = []; // Pool of reusable tile elements
      this.renderedTiles = new Map(); // Map of index -> tile element
      this.firstRenderedIndex = 0;
      this.lastRenderedIndex = 0;
      this.tileWidth = 144; // 134px + 10px gap (width stays same, layout changed via CSS)
      this.scrollRAF = null;

      // Subtitles module instance
      this.carouselSubtitles = null;

      // � STEeP 2: AbortController - Master Switch for Event Listeners
      this.controller = new AbortController();

      // 🎯 Performance Optimization: Cache for AUTO direction detection
      this.resolvedDirections = new Map(); // videoId -> "RTL"/"LTR" (prevents re-detection)
      // Note: This cache persists across videos to avoid re-detection when returning to a video

      // 🎨 Saved colors cache for persistence
      this.savedTheme = null;
      this.savedColors = null;
      this.savedCustomColors = null;

      // 🎤 Singing start indicators - chord indices where singing starts after Intro/Instrumental
      this.singingStartIndices = new Set();
      this._timingPreviewActive = false;

      this._init();
      this._loadSavedScale();
    }

    _init() {
      injectCSS();
      this._detectRtlScrollType();
      this._loadActiveChordPosition();
      this._setupCapoListeners();
      DEBUG && console.log("[ChordCarousel] ✅ Initialized");
    }

    /**
     * 🎸 האזנה לאירועי קאפו - רענון תצוגה כשמשנים קאפו
     */
    _setupCapoListeners() {
      // 🎸 שמירת references ל-handlers לצורך cleanup
      // משתמשים ב-bind כדי לשמור על ה-this הנכון
      this._capoToggledHandler = (e) => {
        const type = e.detail?.type;
        // רענון רק אם השינוי רלוונטי לקרוסלה
        if (type === "carousel" || type === "both") {
          DEBUG && console.log("[ChordCarousel] 🎸 Capo toggled - refreshing display");
          this._refreshAllTilesForCapo();
        }
      };

      this._capoChangedHandler = (e) => {
        const type = e.detail?.type;
        // רענון רק אם השינוי רלוונטי לקרוסלה
        if (type === "carousel" || type === "both") {
          DEBUG && console.log("[ChordCarousel] 🎸 Capo fret changed - refreshing display");
          this._refreshAllTilesForCapo();
        }
      };

      // האזנה להפעלה/כיבוי קאפו
      window.addEventListener("yc:capoToggled", this._capoToggledHandler);

      // האזנה לשינוי מספר סריג
      window.addEventListener("yc:capoChanged", this._capoChangedHandler);

      // 🆕 האזנה להפעלה/כיבוי פיצ'ר הקאפו
      this._capoFeatureToggledHandler = () => {
        DEBUG && console.log("[ChordCarousel] 🎸 Capo FEATURE toggled - refreshing");
        this._refreshAllTilesForCapo();
      };
      window.addEventListener("yc:capoFeatureToggled", this._capoFeatureToggledHandler);

      // 🆕 האזנה לשינוי מצב סנכרון
      this._capoSyncToggledHandler = () => {
        DEBUG && console.log("[ChordCarousel] 🎸 Capo SYNC toggled - refreshing");
        this._refreshAllTilesForCapo();
      };
      window.addEventListener("yc:capoSyncToggled", this._capoSyncToggledHandler);

      DEBUG && console.log("[ChordCarousel] 🎸 Capo listeners registered");
    }

    /**
     * 🎸 הסרת listeners של קאפו - מניעת memory leak
     */
    _cleanupCapoListeners() {
      if (this._capoToggledHandler) {
        window.removeEventListener("yc:capoToggled", this._capoToggledHandler);
        this._capoToggledHandler = null;
      }
      if (this._capoChangedHandler) {
        window.removeEventListener("yc:capoChanged", this._capoChangedHandler);
        this._capoChangedHandler = null;
      }
      // 🆕 הסרת listener של פיצ'ר הקאפו
      if (this._capoFeatureToggledHandler) {
        window.removeEventListener("yc:capoFeatureToggled", this._capoFeatureToggledHandler);
        this._capoFeatureToggledHandler = null;
      }
      // 🆕 הסרת listener של סנכרון
      if (this._capoSyncToggledHandler) {
        window.removeEventListener("yc:capoSyncToggled", this._capoSyncToggledHandler);
        this._capoSyncToggledHandler = null;
      }
      DEBUG && console.log("[ChordCarousel] 🎸 Capo listeners removed");
    }

    /**
     * 🎸 רענון כל הטיילים המוצגים לפי קאפו
     */
    _refreshAllTilesForCapo() {
      if (!this.isVisible || !this.renderedTiles.size) return;

      for (const [index, tile] of this.renderedTiles.entries()) {
        const chord = this.chords[index];
        if (chord) {
          this._updateTileContent(tile, chord, index);
        }
      }
      DEBUG && console.log(`[ChordCarousel] 🎸 Refreshed ${this.renderedTiles.size} tiles for capo`);
    }

    _syncCarouselControlsLock() {
      const lockClass = "yc-carousel-controls-locked";
      const openSelector =
        ".yc-carousel-info-btn.yc-info-open, .yc-carousel-edits-btn.yc-edits-open, .yc-carousel-size-btn.yc-size-open, .yc-carousel-options-btn.yc-options-open, .yc-carousel-instrument-btn.yc-instrument-open";

      const playersToSync = new Set();
      const currentPlayer = this.wrapperElement?.closest?.(".html5-video-player");
      if (currentPlayer) {
        playersToSync.add(currentPlayer);
      }
      document
        .querySelectorAll(`.html5-video-player.${lockClass}`)
        .forEach((player) => playersToSync.add(player));

      playersToSync.forEach((player) => {
        if (!player?.classList) return;
        const keepVisible = Boolean(player.querySelector(openSelector));
        player.classList.toggle(lockClass, keepVisible);
      });
    }

    _setSizeButtonOpenState(isOpen) {
      const button = this.sizeButtonElement;
      if (!button?.classList) return;
      const open = Boolean(isOpen);
      button.classList.toggle("yc-size-open", open);
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.setAttribute("aria-pressed", open ? "true" : "false");
      this._syncCarouselControlsLock();
    }

    _setDiagramOptionsOpenState(isOpen) {
      const button = this.diagramOptionsButtonElement;
      if (!button?.classList) return;
      const open = Boolean(isOpen);
      button.classList.toggle("yc-options-open", open);
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.setAttribute("aria-pressed", open ? "true" : "false");
      this._syncCarouselControlsLock();
    }

    _normalizeScaleValue(value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return this.currentScale || 0.75;
      const step = CONFIG.SCALE_STEP || 0.05;
      const snapped = Math.round(parsed / step) * step;
      return Math.max(CONFIG.MIN_SCALE, Math.min(CONFIG.MAX_SCALE, snapped));
    }

    _getCarouselScaleValue() {
      return this._normalizeScaleValue(this.currentScale || 0.75);
    }

    _setCarouselScaleValue(nextScale) {
      const safeValue = this._normalizeScaleValue(nextScale);
      try {
        if (typeof window.updateCarouselSize === "function") {
          window.updateCarouselSize(safeValue);
        } else {
          this.currentScale = safeValue;
          this._updateScale();
          localStorage.setItem("youchords_carousel_size", safeValue.toString());
          if (window.CarouselSubtitles?.activeInstance) {
            window.CarouselSubtitles.activeInstance.updateScale(safeValue);
          }
        }
      } catch (error) {
        console.warn("[ChordCarousel] Failed updating carousel scale from quick popup:", error);
      }

      this.currentScale = safeValue;
      return safeValue;
    }

    _normalizeSubtitleFontSize(value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return 20;
      const snapped = Math.round(parsed * 2) / 2;
      return Math.max(12, Math.min(30, snapped));
    }

    _getSubtitleFontSizeValue() {
      const raw = parseFloat(localStorage.getItem("yc_carousel_subtitle_font_size"));
      if (!Number.isFinite(raw)) return 20;
      return this._normalizeSubtitleFontSize(raw);
    }

    _setSubtitleFontSizeValue(nextSize) {
      const safeValue = this._normalizeSubtitleFontSize(nextSize);
      try {
        if (window.CarouselSubtitles?.activeInstance) {
          window.CarouselSubtitles.activeInstance.updateFontSize(safeValue);
        } else {
          localStorage.setItem("yc_carousel_subtitle_font_size", safeValue.toString());
        }
      } catch (error) {
        console.warn("[ChordCarousel] Failed updating subtitle font size from quick popup:", error);
      }
      return safeValue;
    }

    _closeCarouselSizePopup() {
      if (typeof this.sizePopupClose === "function") {
        this.sizePopupClose();
      } else {
        this._setSizeButtonOpenState(false);
        this.sizePopupClose = null;
        this.sizePopupAnchor = null;
      }
    }

    _getQuickThresholdValue() {
      return normalizeQuickThreshold(window.hideQuickChordsThreshold);
    }

    _setQuickThresholdValue(value, source = "carouselDiagramOptions") {
      const threshold = normalizeQuickThreshold(value);
      localStorage.setItem(QUICK_CHORDS_THRESHOLD_KEY, threshold.toFixed(1));
      window.hideQuickChordsThreshold = threshold;
      window.dispatchEvent(
        new CustomEvent("yc:hideQuickChordsChanged", {
          detail: {
            enabled: window.hideQuickChordsEnabled !== false,
            threshold,
            source,
          },
        })
      );
      return threshold;
    }

    _getFretNumbersMode() {
      return normalizeFretNumbersMode(window.additionalFretNumbers);
    }

    async _setFretNumbersMode(value, source = "carouselDiagramOptions") {
      const nextValue = normalizeFretNumbersMode(value);
      window.additionalFretNumbers = nextValue;
      try {
        await chrome.storage.sync.set({ [ADDITIONAL_FRET_NUMBERS_KEY]: nextValue });
      } catch (error) {
        console.warn("[ChordCarousel] Failed to persist fret numbers mode:", error);
      }

      if (window.chordRenderer?.clearCache) {
        window.chordRenderer.clearCache();
      }

      window.dispatchEvent(
        new CustomEvent("yc:fretNumbersChanged", {
          detail: { value: nextValue, source },
        })
      );
      return nextValue;
    }

    _updateDiagramOptionsPopupState() {
      this.diagramOptionsPopupStateUpdaters?.forEach((updateFn) => {
        try {
          updateFn();
        } catch (error) {
          console.warn("[ChordCarousel] Failed updating diagram options state:", error);
        }
      });
    }

    _closeDiagramOptionsPopup() {
      if (typeof this.diagramOptionsPopupClose === "function") {
        this.diagramOptionsPopupClose();
      } else {
        this._setDiagramOptionsOpenState(false);
        this.diagramOptionsPopupClose = null;
        this.diagramOptionsPopupAnchor = null;
        this.diagramOptionsPopupStateUpdaters?.clear();
      }
    }

    _openDiagramOptionsPopup(anchorEl) {
      if (!anchorEl || !document?.body) return;

      if (this.diagramOptionsPopupClose && this.diagramOptionsPopupAnchor === anchorEl) {
        this._closeDiagramOptionsPopup();
        return;
      }

      this._closeDiagramOptionsPopup();
      this._closeCarouselSizePopup();

      const panel = document.createElement("div");
      panel.style.cssText = `
        position: fixed;
        width: 238px;
        max-width: calc(100vw - 12px);
        background: rgba(23, 23, 27, 0.96);
        border: 2.5px solid rgba(52, 149, 233, 0.85);
        border-radius: 10px;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.48);
        backdrop-filter: blur(10px);
        color: #fff;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 2147483647;
        direction: ltr !important;
        unicode-bidi: isolate !important;
        text-align: left !important;
      `;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Chord diagram display options");
      panel.setAttribute("dir", "ltr");
      panel.setAttribute("data-yc-owned", "true");
      const anchorConnector = document.createElement("div");
      anchorConnector.style.cssText = `
        position: fixed;
        width: 2px;
        height: 0;
        background: rgba(52, 149, 233, 0.85);
        border-radius: 999px;
        pointer-events: none;
        opacity: 0;
        z-index: 2147483647;
      `;
      let reposition = () => {};

      const applyPanelScale = (nextPercent) => {
        const safePercent = clampPopupUiScalePercent(nextPercent, 100);
        const scale = safePercent / 100;
        panel.style.transformOrigin = "top center";
        panel.style.transform = scale === 1 ? "none" : `scale(${scale})`;
        reposition();
      };

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.textContent = "X";
      closeButton.title = "Close";
      closeButton.style.cssText = `
        position: absolute;
        top: 4px;
        right: 4px;
        width: 18px;
        height: 18px;
        min-width: 18px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 5px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.92);
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        padding: 0;
        cursor: pointer;
      `;
      closeButton.addEventListener("mouseenter", () => {
        closeButton.style.background = "rgba(239, 68, 68, 0.22)";
        closeButton.style.borderColor = "rgba(248, 113, 113, 0.85)";
      });
      closeButton.addEventListener("mouseleave", () => {
        closeButton.style.background = "rgba(255, 255, 255, 0.08)";
        closeButton.style.borderColor = "rgba(255, 255, 255, 0.3)";
      });

      const headerRow = document.createElement("div");
      headerRow.style.cssText = `
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding-right: 20px;
        direction: ltr !important;
        unicode-bidi: isolate !important;
      `;

      const title = document.createElement("div");
      title.textContent = "Display";
      title.style.cssText = `
        font-size: 12px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.92);
        min-width: 0;
        flex: 1 1 auto;
        text-align: left;
        direction: ltr !important;
        unicode-bidi: isolate !important;
      `;

      const resetAllButton = document.createElement("button");
      resetAllButton.type = "button";
      resetAllButton.textContent = "Reset All";
      resetAllButton.title = "Reset all display options";
      resetAllButton.style.cssText = `
        height: 21px;
        min-width: 68px;
        border-radius: 6px;
        border: 1px solid rgba(248, 113, 113, 0.35);
        background: rgba(255, 255, 255, 0.08);
        color: rgba(252, 165, 165, 0.95);
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        padding: 0 7px;
        direction: ltr !important;
        unicode-bidi: isolate !important;
        text-align: center;
      `;
      resetAllButton.addEventListener("mouseenter", () => {
        resetAllButton.style.background = "rgba(255, 255, 255, 0.16)";
        resetAllButton.style.borderColor = "rgba(248, 113, 113, 0.55)";
      });
      resetAllButton.addEventListener("mouseleave", () => {
        resetAllButton.style.background = "rgba(255, 255, 255, 0.08)";
        resetAllButton.style.borderColor = "rgba(248, 113, 113, 0.35)";
      });

      const initialPanelScale = loadCarouselPopupScaleSetting(
        CAROUSEL_DISPLAY_POPUP_SCALE_KEY,
        100
      );
      const popupScaleControl = createCarouselPopupScaleControl({
        initialPercent: initialPanelScale,
        onChange: (nextPercent) => {
          saveCarouselPopupScaleSetting(CAROUSEL_DISPLAY_POPUP_SCALE_KEY, nextPercent);
          applyPanelScale(nextPercent);
        },
      });
      const headerControls = document.createElement("div");
      headerControls.style.cssText = `
        display: inline-flex;
        flex-direction: row;
        align-items: center;
        gap: 6px;
        flex: 0 0 auto;
        direction: ltr !important;
        unicode-bidi: isolate !important;
      `;
      headerControls.appendChild(popupScaleControl.element);
      headerControls.appendChild(resetAllButton);
      headerRow.appendChild(title);
      headerRow.appendChild(headerControls);

      const createGroup = (labelText, options, getValue, onSelect, columns, resetValue) => {
        const group = document.createElement("div");
        group.style.cssText = `
          display: flex;
          flex-direction: column;
          gap: 5px;
          direction: ltr !important;
          unicode-bidi: isolate !important;
          text-align: left !important;
        `;

        const labelRow = document.createElement("div");
        labelRow.style.cssText = `
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          direction: ltr !important;
          unicode-bidi: isolate !important;
        `;

        const label = document.createElement("div");
        label.textContent = labelText;
        label.style.cssText = `
          font-size: 11px;
          color: rgba(255, 255, 255, 0.82);
          font-weight: 600;
          text-align: left;
          direction: ltr !important;
          unicode-bidi: isolate !important;
        `;

        const resetButton = document.createElement("button");
        resetButton.type = "button";
        resetButton.textContent = "\u21BA";
        resetButton.title = `Reset ${labelText}`;
        resetButton.style.cssText = `
          width: 18px;
          height: 18px;
          border: none;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
          cursor: pointer;
          line-height: 1;
          font-size: 11px;
          padding: 0;
          flex: 0 0 auto;
          direction: ltr !important;
          unicode-bidi: isolate !important;
          text-align: center;
        `;
        resetButton.addEventListener("mouseenter", () => {
          resetButton.style.background = "rgba(255, 255, 255, 0.22)";
        });
        resetButton.addEventListener("mouseleave", () => {
          resetButton.style.background = "rgba(255, 255, 255, 0.14)";
        });
        resetButton.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await onSelect(resetValue);
          refresh();
        });
        labelRow.appendChild(label);
        labelRow.appendChild(resetButton);

        const grid = document.createElement("div");
        grid.style.cssText = `
          display: grid;
          grid-template-columns: repeat(${columns}, minmax(0, 1fr));
          gap: 4px;
          direction: ltr !important;
          unicode-bidi: isolate !important;
        `;

        const buttons = new Map();
        const refresh = () => {
          const currentValue = String(getValue());
          buttons.forEach((btn, value) => {
            const selected = value === currentValue;
            btn.style.background = selected
              ? "rgba(33, 150, 243, 0.28)"
              : "rgba(255, 255, 255, 0.08)";
            btn.style.borderColor = selected
              ? "rgba(52, 149, 233, 0.85)"
              : "rgba(255, 255, 255, 0.24)";
            btn.style.color = selected ? "#7dd3fc" : "rgba(255, 255, 255, 0.92)";
            btn.setAttribute("aria-pressed", selected ? "true" : "false");
          });
        };

        options.forEach((option) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = option.label;
          btn.title = option.title || option.label;
          btn.style.cssText = `
            height: 24px;
            min-width: 0;
            border: 1px solid rgba(255, 255, 255, 0.24);
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.08);
            color: rgba(255, 255, 255, 0.92);
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            padding: 0 4px;
            direction: ltr !important;
            unicode-bidi: isolate !important;
            text-align: center;
          `;
          btn.addEventListener("mouseenter", () => {
            if (btn.getAttribute("aria-pressed") === "true") return;
            btn.style.background = "rgba(255, 255, 255, 0.16)";
            btn.style.borderColor = "rgba(255, 255, 255, 0.4)";
          });
          btn.addEventListener("mouseleave", refresh);
          btn.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await onSelect(option.value);
            refresh();
          });
          buttons.set(String(option.value), btn);
          grid.appendChild(btn);
        });

        group.appendChild(labelRow);
        group.appendChild(grid);
        this.diagramOptionsPopupStateUpdaters.add(refresh);
        refresh();
        return group;
      };

      const thresholdGroup = createGroup(
        "Threshold",
        QUICK_THRESHOLD_OPTIONS,
        () => this._getQuickThresholdValue().toFixed(1),
        (value) => this._setQuickThresholdValue(value),
        4,
        "0.5"
      );
      const fretGroup = createGroup(
        "Fret Number",
        FRET_NUMBER_OPTIONS,
        () => this._getFretNumbersMode(),
        (value) => this._setFretNumbersMode(value),
        3,
        "none"
      );
      const subtitleOffsetControl = window.ycSubtitleOffsetControls?.createControl?.({
        ownerName: "ChordCarousel",
        source: "carouselDiagramOptions",
      });
      resetAllButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this._setQuickThresholdValue("0.5");
        await this._setFretNumbersMode("none");
        await subtitleOffsetControl?.setValue?.(0);
        this._updateDiagramOptionsPopupState();
      });

      panel.appendChild(closeButton);
      panel.appendChild(headerRow);
      panel.appendChild(thresholdGroup);
      panel.appendChild(fretGroup);
      if (subtitleOffsetControl?.element) {
        subtitleOffsetControl.element.setAttribute("dir", "ltr");
        subtitleOffsetControl.element.setAttribute("data-yc-owned", "true");
        subtitleOffsetControl.element.style.setProperty("direction", "ltr", "important");
        subtitleOffsetControl.element.style.setProperty("unicode-bidi", "isolate", "important");
        subtitleOffsetControl.element.style.setProperty("text-align", "left", "important");
        panel.appendChild(subtitleOffsetControl.element);
      }
      document.body.appendChild(anchorConnector);
      document.body.appendChild(panel);

      reposition = () => {
        const { rect, left, top, canOpenBelow } = clampCarouselPopupPosition(
          anchorEl,
          panel
        );
        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(top)}px`;

        if (canOpenBelow) {
          const gap = Math.max(0, top - rect.bottom);
          if (gap >= 2) {
            const centerX = rect.left + rect.width / 2;
            anchorConnector.style.left = `${Math.round(centerX - 1)}px`;
            anchorConnector.style.top = `${Math.round(rect.bottom)}px`;
            anchorConnector.style.height = `${Math.round(gap)}px`;
            anchorConnector.style.opacity = "1";
          } else {
            anchorConnector.style.opacity = "0";
            anchorConnector.style.height = "0";
          }
        } else {
          anchorConnector.style.opacity = "0";
          anchorConnector.style.height = "0";
        }
      };

      applyPanelScale(initialPanelScale);

      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        document.removeEventListener("pointerdown", onPointerDown, true);
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("resize", onReposition, true);
        window.removeEventListener("scroll", onReposition, true);
        subtitleOffsetControl?.dispose?.();
        anchorConnector.remove();
        panel.remove();
        this.diagramOptionsPopupStateUpdaters.clear();
        this._setDiagramOptionsOpenState(false);
        if (this.diagramOptionsPopupClose === cleanup) {
          this.diagramOptionsPopupClose = null;
          this.diagramOptionsPopupAnchor = null;
        }
      };

      const onPointerDown = (event) => {
        if (panel.contains(event.target) || anchorEl.contains(event.target)) return;
        cleanup();
      };
      const onKeyDown = (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        cleanup();
      };
      const onReposition = () => reposition();

      document.addEventListener("pointerdown", onPointerDown, true);
      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("resize", onReposition, true);
      window.addEventListener("scroll", onReposition, true);
      closeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        cleanup();
      });

      this.diagramOptionsPopupClose = cleanup;
      this.diagramOptionsPopupAnchor = anchorEl;
      this._setDiagramOptionsOpenState(true);
    }

    _openCarouselSizePopup(anchorEl) {
      if (!anchorEl || !document?.body) return;

      if (this.sizePopupClose && this.sizePopupAnchor === anchorEl) {
        this._closeCarouselSizePopup();
        return;
      }

      this._closeCarouselSizePopup();
      this._closeDiagramOptionsPopup();

      const panel = document.createElement("div");
      panel.style.cssText = `
        position: fixed;
        width: 224px;
        max-width: calc(100vw - 12px);
        background: rgba(23, 23, 27, 0.96);
        border: 2.5px solid rgba(52, 149, 233, 0.85);
        border-radius: 10px;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.48);
        backdrop-filter: blur(10px);
        color: #fff;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 7px;
        z-index: 2147483647;
        direction: ltr !important;
        unicode-bidi: isolate !important;
        text-align: left !important;
      `;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Quick size controls");
      panel.setAttribute("dir", "ltr");
      panel.setAttribute("data-yc-owned", "true");
      const anchorConnector = document.createElement("div");
      anchorConnector.style.cssText = `
        position: fixed;
        width: 2px;
        height: 0;
        background: rgba(52, 149, 233, 0.85);
        border-radius: 999px;
        pointer-events: none;
        opacity: 0;
        z-index: 2147483647;
      `;
      let reposition = () => {};

      const applyPanelScale = (nextPercent) => {
        const safePercent = clampPopupUiScalePercent(nextPercent, 100);
        const scale = safePercent / 100;
        panel.style.transformOrigin = "top center";
        panel.style.transform = scale === 1 ? "none" : `scale(${scale})`;
        reposition();
      };

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.textContent = "X";
      closeButton.title = "Close";
      closeButton.style.cssText = `
        position: absolute;
        top: 4px;
        right: 4px;
        width: 18px;
        height: 18px;
        min-width: 18px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 5px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.92);
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        padding: 0;
        cursor: pointer;
        transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
      `;
      closeButton.addEventListener("mouseenter", () => {
        closeButton.style.background = "rgba(239, 68, 68, 0.22)";
        closeButton.style.borderColor = "rgba(248, 113, 113, 0.85)";
      });
      closeButton.addEventListener("mouseleave", () => {
        closeButton.style.background = "rgba(255, 255, 255, 0.08)";
        closeButton.style.borderColor = "rgba(255, 255, 255, 0.3)";
      });

      const title = document.createElement("div");
      title.textContent = "Size";
      title.style.cssText = `
        font-size: 12px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.92);
        min-width: 0;
        flex: 1 1 auto;
        text-align: left;
        direction: ltr !important;
        unicode-bidi: isolate !important;
      `;

      const initialPanelScale = loadCarouselPopupScaleSetting(
        CAROUSEL_SIZE_POPUP_SCALE_KEY,
        100
      );
      const popupScaleControl = createCarouselPopupScaleControl({
        initialPercent: initialPanelScale,
        onChange: (nextPercent) => {
          saveCarouselPopupScaleSetting(CAROUSEL_SIZE_POPUP_SCALE_KEY, nextPercent);
          applyPanelScale(nextPercent);
        },
      });
      const headerRow = document.createElement("div");
      headerRow.style.cssText = `
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding-right: 20px;
        direction: ltr !important;
        unicode-bidi: isolate !important;
      `;
      headerRow.appendChild(title);
      headerRow.appendChild(popupScaleControl.element);

      const makeValueText = (value, suffix) => {
        const num = Number(value);
        const text =
          Number.isFinite(num) && Math.abs(num % 1) < 0.001
            ? num.toFixed(0)
            : num.toFixed(2).replace(/0$/, "");
        return `${text}${suffix}`;
      };

      const createStepButton = (label) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = label;
        btn.style.cssText = `
          width: 22px;
          height: 22px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          border-radius: 5px;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.94);
          font-size: 13px;
          font-weight: 700;
          line-height: 1;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          direction: ltr !important;
          unicode-bidi: isolate !important;
          transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        `;
        btn.addEventListener("mouseenter", () => {
          if (btn.disabled) return;
          btn.style.background = "rgba(255, 255, 255, 0.16)";
          btn.style.borderColor = "rgba(255, 255, 255, 0.42)";
        });
        btn.addEventListener("mouseleave", () => {
          btn.style.background = "rgba(255, 255, 255, 0.08)";
          btn.style.borderColor = "rgba(255, 255, 255, 0.28)";
        });
        return btn;
      };

      const createRow = (labelText) => {
        const row = document.createElement("div");
        row.style.cssText = `
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          column-gap: 8px;
          direction: ltr !important;
          unicode-bidi: isolate !important;
        `;

        const label = document.createElement("div");
        label.textContent = labelText;
        label.style.cssText = `
          font-size: 11px;
          color: rgba(255, 255, 255, 0.82);
          font-weight: 600;
          text-align: left;
          direction: ltr !important;
          unicode-bidi: isolate !important;
        `;

        const controls = document.createElement("div");
        controls.style.cssText = `
          display: inline-flex;
          flex-direction: row;
          align-items: center;
          gap: 4px;
          direction: ltr !important;
          unicode-bidi: isolate !important;
        `;

        const minusButton = createStepButton("-");
        const valueBox = document.createElement("span");
        valueBox.style.cssText = `
          min-width: 48px;
          text-align: center;
          font-size: 11px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.94);
          direction: ltr !important;
          unicode-bidi: isolate !important;
        `;
        const plusButton = createStepButton("+");

        controls.appendChild(minusButton);
        controls.appendChild(valueBox);
        controls.appendChild(plusButton);
        row.appendChild(label);
        row.appendChild(controls);

        return { row, minusButton, plusButton, valueBox };
      };

      const carouselRow = createRow("Chords");
      const subtitleRow = createRow("Subtitles");

      let carouselValue = this._getCarouselScaleValue();
      let subtitleValue = this._getSubtitleFontSizeValue();

      const refreshCarouselValue = () => {
        carouselRow.valueBox.textContent = makeValueText(carouselValue, "x");
        carouselRow.minusButton.disabled = carouselValue <= CONFIG.MIN_SCALE + 0.0001;
        carouselRow.plusButton.disabled = carouselValue >= CONFIG.MAX_SCALE - 0.0001;
        carouselRow.minusButton.style.opacity = carouselRow.minusButton.disabled ? "0.45" : "1";
        carouselRow.plusButton.style.opacity = carouselRow.plusButton.disabled ? "0.45" : "1";
      };

      const refreshSubtitleValue = () => {
        subtitleRow.valueBox.textContent = makeValueText(subtitleValue, "px");
        subtitleRow.minusButton.disabled = subtitleValue <= 12.0001;
        subtitleRow.plusButton.disabled = subtitleValue >= 29.9999;
        subtitleRow.minusButton.style.opacity = subtitleRow.minusButton.disabled ? "0.45" : "1";
        subtitleRow.plusButton.style.opacity = subtitleRow.plusButton.disabled ? "0.45" : "1";
      };

      carouselRow.minusButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        carouselValue = this._setCarouselScaleValue(carouselValue - CONFIG.SCALE_STEP);
        refreshCarouselValue();
      });
      carouselRow.plusButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        carouselValue = this._setCarouselScaleValue(carouselValue + CONFIG.SCALE_STEP);
        refreshCarouselValue();
      });

      subtitleRow.minusButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        subtitleValue = this._setSubtitleFontSizeValue(subtitleValue - 0.5);
        refreshSubtitleValue();
      });
      subtitleRow.plusButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        subtitleValue = this._setSubtitleFontSizeValue(subtitleValue + 0.5);
        refreshSubtitleValue();
      });

      panel.appendChild(closeButton);
      panel.appendChild(headerRow);
      panel.appendChild(carouselRow.row);
      panel.appendChild(subtitleRow.row);
      document.body.appendChild(anchorConnector);
      document.body.appendChild(panel);

      reposition = () => {
        const { rect, left, top, canOpenBelow } = clampCarouselPopupPosition(
          anchorEl,
          panel
        );

        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(top)}px`;

        if (canOpenBelow) {
          const gap = Math.max(0, top - rect.bottom);
          if (gap >= 2) {
            const centerX = rect.left + rect.width / 2;
            anchorConnector.style.left = `${Math.round(centerX - 1)}px`;
            anchorConnector.style.top = `${Math.round(rect.bottom)}px`;
            anchorConnector.style.height = `${Math.round(gap)}px`;
            anchorConnector.style.opacity = "1";
          } else {
            anchorConnector.style.opacity = "0";
            anchorConnector.style.height = "0";
          }
        } else {
          anchorConnector.style.opacity = "0";
          anchorConnector.style.height = "0";
        }
      };

      refreshCarouselValue();
      refreshSubtitleValue();
      applyPanelScale(initialPanelScale);

      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        document.removeEventListener("pointerdown", onPointerDown, true);
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("resize", onReposition, true);
        window.removeEventListener("scroll", onReposition, true);
        if (anchorConnector.parentNode) {
          anchorConnector.parentNode.removeChild(anchorConnector);
        }
        if (panel.parentNode) {
          panel.parentNode.removeChild(panel);
        }
        this._setSizeButtonOpenState(false);
        if (this.sizePopupClose === cleanup) {
          this.sizePopupClose = null;
          this.sizePopupAnchor = null;
        }
      };

      const onPointerDown = (event) => {
        if (panel.contains(event.target) || anchorEl.contains(event.target)) {
          return;
        }
        cleanup();
      };
      const onKeyDown = (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        cleanup();
      };
      const onReposition = () => reposition();

      document.addEventListener("pointerdown", onPointerDown, true);
      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("resize", onReposition, true);
      window.addEventListener("scroll", onReposition, true);
      closeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        cleanup();
      });

      this.sizePopupClose = cleanup;
      this.sizePopupAnchor = anchorEl;
      this._setSizeButtonOpenState(true);
    }

    _extractCurrentVideoId() {
      if (this.currentVideoId) return this.currentVideoId;
      return this._extractVideoId(location.href);
    }

    _normalizePreviewChordName(chord) {
      if (!chord) return "";
      const name =
        typeof chord.name === "string" && chord.name.trim()
          ? chord.name.trim()
          : (typeof chord.chord === "string" ? chord.chord.trim() : "");
      return name.toLowerCase();
    }

    _buildPreviewSourceKey(chord, fallbackIndex) {
      const sourceIndices =
        Array.isArray(chord?.__sourceIndices) && chord.__sourceIndices.length
          ? chord.__sourceIndices
          : [fallbackIndex];
      return sourceIndices.join("|");
    }

    _clearEditPreviewHighlights() {
      if (!this.renderedTiles) return;
      for (const tile of this.renderedTiles.values()) {
        tile.classList.remove("yc-edit-preview");
        tile.classList.remove("yc-remove-preview");
      }
    }

    _clearTimingPreviewHighlights() {
      if (!this.renderedTiles) return;
      for (const [index, tile] of this.renderedTiles.entries()) {
        tile.classList.remove(
          "yc-timing-preview",
          "yc-timing-preview-before",
          "yc-timing-preview-current",
          "yc-timing-preview-after"
        );
        tile.removeAttribute("data-yc-timing-role-label");
        this._applySplitCornerMarkers(tile, this.chords?.[index] || null);
      }
    }

    _applySplitCornerMarkers(tile, chord, options = {}) {
      if (!tile) return;
      tile.querySelectorAll(".yc-split-corner-marker").forEach((entry) => entry.remove());
      const force = options?.force === true;
      const showCorners =
        chord?.__splitAdded === true &&
        (chord?.__splitEditingActive === true || force);
      if (!showCorners) return;
      const side = String(chord.__splitSide || "").toLowerCase();
      const color = side === "before" ? "#f97316" : "#22c55e";
      const positions = [
        ["top", "left"],
        ["top", "right"],
        ["bottom", "left"],
        ["bottom", "right"],
      ];
      positions.forEach(([vertical, horizontal]) => {
        const marker = document.createElement("span");
        marker.className = "yc-split-corner-marker";
        marker.style.cssText = `
          position: absolute;
          ${vertical}: -4px;
          ${horizontal}: -4px;
          width: 28px;
          height: 28px;
          border-${vertical === "top" ? "top" : "bottom"}: 7px solid ${color};
          border-${horizontal === "left" ? "left" : "right"}: 7px solid ${color};
          border-radius: ${vertical === "top" && horizontal === "left" ? "10px 0 0 0" :
            vertical === "top" && horizontal === "right" ? "0 10px 0 0" :
              vertical === "bottom" && horizontal === "left" ? "0 0 0 10px" : "0 0 10px 0"};
          box-sizing: border-box;
          pointer-events: none;
          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.65));
          z-index: 26;
        `;
        tile.appendChild(marker);
      });
    }

    _getTimingPreviewRoleForChord(chord, fallbackIndex, detail) {
      const roleBySourceIndex = detail?.roleBySourceIndex || {};
      if (!roleBySourceIndex || typeof roleBySourceIndex !== "object") return "";

      const sourceIndices =
        Array.isArray(chord?.__sourceIndices) && chord.__sourceIndices.length
          ? chord.__sourceIndices
          : [fallbackIndex];
      const rolesByPriority = ["current", "before", "after"];
      for (const expectedRole of rolesByPriority) {
        const found = sourceIndices.some((sourceIndex) => {
          const role = String(roleBySourceIndex[String(sourceIndex)] || "").toLowerCase();
          return role === expectedRole;
        });
        if (found) return expectedRole;
      }
      return "";
    }

    _applyTimingPreviewHighlights(detail = null) {
      if (!this.renderedTiles || !this.chords) return;
      if (!detail?.active) {
        if (this._timingPreviewActive) {
          this._clearTimingPreviewHighlights();
        }
        return;
      }

      this._timingPreviewActive = true;
      this._clearTimingPreviewHighlights();

      const labelByRole = {
        before: "Before",
        current: "Current",
        after: "After",
      };

      for (const [index, tile] of this.renderedTiles.entries()) {
        const chord = this.chords[index];
        if (!tile || !chord) continue;

        const role = this._getTimingPreviewRoleForChord(chord, index, detail);
        if (!role) continue;

        tile.classList.add("yc-timing-preview", `yc-timing-preview-${role}`);
        const splitSide = String(chord.__splitSide || "").toLowerCase();
        const roleLabel = chord.__splitAdded === true
          ? (splitSide === "before"
            ? "+ Before"
            : splitSide === "after"
              ? "+ After"
              : `+ ${labelByRole[role] || role}`)
          : (labelByRole[role] || role);
        tile.setAttribute("data-yc-timing-role-label", roleLabel);
        if (chord.__splitAdded === true) {
          this._applySplitCornerMarkers(tile, chord, { force: true });
        }
      }
    }

    _applyEditPreviewHighlightForTile(tile, chord, index, previewState = null) {
      if (!tile || !chord) return;

      const manager = window.chordEditsManager;
      const preview = previewState || manager?.getEditPreviewState?.();
      if (!preview?.active) {
        tile.classList.remove("yc-edit-preview");
        tile.classList.remove("yc-remove-preview");
        return;
      }

      const currentVideoId = this._extractCurrentVideoId();
      if (preview.videoId && currentVideoId && preview.videoId !== currentVideoId) {
        tile.classList.remove("yc-edit-preview");
        tile.classList.remove("yc-remove-preview");
        return;
      }

      const activeMode = manager?.normalizeMode
        ? manager.normalizeMode(window.chordsMode || "regular")
        : (window.chordsMode || "regular");
      const previewMode = manager?.normalizeMode
        ? manager.normalizeMode(preview.mode || "regular")
        : (preview.mode || "regular");
      if (previewMode !== activeMode) {
        tile.classList.remove("yc-edit-preview");
        tile.classList.remove("yc-remove-preview");
        return;
      }

      const previewName = String(preview.chordName || "").trim().toLowerCase();
      const previewSourceKey = Array.isArray(preview.sourceIndices)
        ? preview.sourceIndices.join("|")
        : "";
      const chordName = this._normalizePreviewChordName(chord);
      const chordSourceKey = this._buildPreviewSourceKey(chord, index);
      const previewSplitSegmentId = String(preview.splitSegmentId || "").trim();
      const chordSplitSegmentId = String(chord.__splitSegmentId || "").trim();

      const shouldHighlight = preview.applyToAll
        ? (previewName && chordName === previewName)
        : previewSplitSegmentId
          ? (chordSplitSegmentId && chordSplitSegmentId === previewSplitSegmentId)
          : (previewSourceKey && chordSourceKey === previewSourceKey);

      const previewAction = preview.action === "remove" ? "remove" : "edit";
      tile.classList.toggle("yc-edit-preview", shouldHighlight && previewAction !== "remove");
      tile.classList.toggle("yc-remove-preview", shouldHighlight && previewAction === "remove");
    }

    _applyEditPreviewHighlights(previewState = null) {
      if (!this.renderedTiles || !this.chords) return;
      const preview = previewState || window.chordEditsManager?.getEditPreviewState?.();
      for (const [index, tile] of this.renderedTiles.entries()) {
        const chord = this.chords[index];
        if (!chord || !tile) continue;
        this._applyEditPreviewHighlightForTile(tile, chord, index, preview);
      }
    }

    _refreshChordActionControls() {
      if (!this.renderedTiles || !this.chords) return;
      for (const [index, tile] of this.renderedTiles.entries()) {
        const chord = this.chords[index];
        if (!chord) continue;
        this._bindChordTileActions(tile, chord, index);
      }
      this._applyEditPreviewHighlights();
      this._applyTimingPreviewHighlights(window.chordEditsManager?.getTimingPreviewState?.() || null);
      this._applyQuickModeSwitchVisibility();
    }

    _normalizeModeValue(modeValue) {
      const value = String(modeValue || "regular").trim();
      if (value === "harmonic" || value === "harmonicPlus" || value === "regularPlus" || value === "regular") {
        return value;
      }
      return "regular";
    }

    _isQuickModeSwitchVisible() {
      const manager = window.chordEditsManager;
      if (manager?.getUiSettings) {
        const uiSettings = manager.getUiSettings();
        return uiSettings.showModeSwitch !== false;
      }
      return localStorage.getItem("youchords_show_quick_mode_switch") !== "false";
    }

    _applyQuickModeSwitchVisibility(forceVisible = null) {
      if (!this.quickModeSwitchElement) return;
      const visible = forceVisible === null
        ? this._isQuickModeSwitchVisible()
        : forceVisible !== false;
      this.quickModeSwitchElement.style.display = visible ? "inline-flex" : "none";
      this.quickModeSwitchElement.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    _updateQuickModeSwitchState(modeValue = null) {
      const safeMode = this._normalizeModeValue(modeValue || window.chordsMode || "regular");
      if (this.quickModeButtons && this.quickModeButtons.size > 0) {
        this.quickModeButtons.forEach((button, modeKey) => {
          const isSelected = modeKey === safeMode;
          button.classList.toggle("yc-mode-selected", isSelected);
          button.setAttribute("aria-pressed", isSelected ? "true" : "false");
        });
      }
      this._updateEasyKeyButtonState();
    }

    _updateEasyKeyButtonState() {
      const button = this.easyKeyButtonElement;
      if (!button) return;
      const state = window.ycKeyEstimator?.getEasyKeyState?.() || {};
      const active = state.active === true;
      const capoFret = Math.max(0, Math.round(Number(state.capoFret) || 0));
      button.classList.toggle("yc-easy-key-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.title = active
        ? capoFret > 0
          ? `Easy Capo is on (capo ${capoFret})`
          : "Easy Capo is on - no capo needed"
        : "Easy Capo - choose the easiest capo position";
    }

    async _toggleEasyKeyMode() {
      try {
        const wasActive = window.ycKeyEstimator?.getEasyKeyState?.()?.active === true;
        const mode = this._normalizeModeValue(window.chordsMode || "regular");
        const state = await window.ycKeyEstimator?.toggleEasyKeyForCurrentMode?.(mode);
        this._updateEasyKeyButtonState();
        if (!wasActive && state?.noCapoNeeded === true) {
          window.ycUtils?.showToast?.(
            "No capo needed - this is already the easiest shape",
            "",
            2600,
            { centerOnVideo: true }
          );
        }
      } catch (error) {
        console.warn("[ChordCarousel] Failed toggling Easy Key:", error);
      }
    }

    _ensureEstimatedKeyControl() {
      const badge = this.estimatedKeyElement;
      if (!badge) return null;
      if (badge.dataset.ycControlReady === "true") {
        return this.estimatedKeyLabelElement || badge.querySelector(".yc-key-label");
      }

      badge.textContent = "";

      const createButton = (label, delta, title) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "yc-key-transpose-btn";
        button.textContent = label;
        button.title = title;
        button.setAttribute("aria-label", title);
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          try {
            await window.ycKeyEstimator?.stepCurrentTranspose?.(delta);
          } catch (error) {
            console.warn("[ChordCarousel] Failed changing transpose:", error);
          }
        });
        return button;
      };

      const label = document.createElement("span");
      label.className = "yc-key-label";
      label.textContent = "Key -";

      badge.append(
        createButton("▼", -1, "Transpose down"),
        label,
        createButton("▲", 1, "Transpose up")
      );
      badge.dataset.ycControlReady = "true";
      this.estimatedKeyLabelElement = label;
      return label;
    }

    _updateEstimatedKeyBadge(result = window.ycEstimatedKey) {
      const badge = this.estimatedKeyElement;
      if (!badge) return;

      const estimator = window.ycKeyEstimator;
      const label = this._ensureEstimatedKeyControl();
      const hasKey = !!(result?.key && result?.mode && estimator?.formatKeyBadge);
      badge.setAttribute("data-yc-empty", hasKey ? "false" : "true");
      badge.setAttribute("data-yc-transposed", "false");
      if (!hasKey) {
        if (label) label.textContent = "Key -";
        badge.title = "Estimated key is not available yet";
        return;
      }

      if (label) label.textContent = estimator.formatKeyBadge(result);
      const offset = Number(estimator.getCurrentTransposeOffset?.() || 0);
      badge.setAttribute("data-yc-transposed", offset !== 0 ? "true" : "false");
      badge.title = estimator.formatKeyTitle
        ? estimator.formatKeyTitle(result)
        : `Estimated key: ${result.label || label?.textContent || "Key -"}`;
    }

    async _applyQuickModeSwitch(modeValue) {
      const nextMode = this._normalizeModeValue(modeValue);
      const previousMode = this._normalizeModeValue(window.chordsMode || "regular");
      this._updateQuickModeSwitchState(nextMode);

      if (nextMode === previousMode) {
        return;
      }

      try {
        if (typeof window.updateChordsMode === "function") {
          const maybePromise = window.updateChordsMode(nextMode);
          if (maybePromise && typeof maybePromise.then === "function") {
            await maybePromise;
          }
          this._updateQuickModeSwitchState(window.chordsMode || nextMode);
          return;
        }

        window.chordsMode = nextMode;
        await chrome.storage.sync.set({ chordsMode: nextMode });

        window.dispatchEvent(
          new CustomEvent("yc:modeChanged", {
            detail: {
              newMode: nextMode,
              previousMode,
              source: "carouselQuickModeSwitch",
            },
          })
        );

        if (typeof window.refreshLyricsChordsPanel === "function") {
          try {
            await window.refreshLyricsChordsPanel();
          } catch (refreshError) {
            console.warn("[ChordCarousel] Failed refreshing main panel after mode switch:", refreshError);
          }
        }
      } catch (error) {
        console.warn("[ChordCarousel] Quick mode switch failed:", error);
        this._updateQuickModeSwitchState(window.chordsMode || previousMode);
      }
    }

    async _updateEditsSummaryButtonState() {
      const button = this.editsSummaryButtonElement;
      if (!button) return;

      button.classList.remove("yc-edits-none", "yc-edits-active", "yc-edits-threshold-mismatch");

      const applyState = ({ state = "none", title = "No chord edits" } = {}) => {
        if (!this.editsSummaryButtonElement || this.editsSummaryButtonElement !== button) return;

        button.classList.remove("yc-edits-none", "yc-edits-active", "yc-edits-threshold-mismatch");
        if (state === "none") {
          button.classList.add("yc-edits-none");
        } else if (state === "active") {
          button.classList.add("yc-edits-active");
        } else if (state === "threshold-mismatch") {
          button.classList.add("yc-edits-threshold-mismatch");
        }

        button.title = title;
      };

      const manager = window.chordEditsManager;
      const videoId = this._extractCurrentVideoId() || window.currentVideoId || null;
      if (!manager?.getChordEditsSummary || !videoId) {
        applyState({ state: "none", title: "No chord edits" });
        return;
      }

      try {
        const summary = await manager.getChordEditsSummary({
          videoId,
          mode: window.chordsMode || "regular",
          threshold: window.hideQuickChordsThreshold,
          fallbackSongChords: Array.isArray(this._originalChords)
            ? this._originalChords
            : (Array.isArray(this.chords) ? this.chords : []),
        });

        if (!summary?.hasAnyEdits) {
          applyState({ state: "none", title: "No chord edits" });
          return;
        }

        if (summary.state === "active") {
          applyState({
            state: "active",
            title: `${summary.currentTotal} edits at ${summary.currentThreshold.toFixed(1)}s`,
          });
          return;
        }

        applyState({
          state: "threshold-mismatch",
          title: `Edits exist at other thresholds (${(summary.thresholds || [])
            .map((entry) => `${Number(entry).toFixed(1)}s`)
            .join(", ")})`,
        });
      } catch (error) {
        console.warn("[ChordCarousel] Failed loading edits summary:", error);
        applyState({ state: "none", title: "No chord edits" });
      }
    }

    _bindChordTileActions(tile, chord, index) {
      if (!tile || !chord) return;
      const actions = tile.querySelector(".yc-chord-actions");
      if (!actions) return;

      const editButton = actions.querySelector(".yc-chord-action-edit");
      const timeButton = actions.querySelector(".yc-chord-action-time");
      const removeButton = actions.querySelector(".yc-chord-action-remove");
      if (!editButton || !removeButton) return;

      const manager = window.chordEditsManager;
      if (!manager) {
        actions.style.display = "none";
        tile.classList.remove("yc-actions-bottom-hover");
        if (tile.__ycBottomHoverMoveHandler) {
          tile.removeEventListener("mousemove", tile.__ycBottomHoverMoveHandler);
          tile.__ycBottomHoverMoveHandler = null;
        }
        if (tile.__ycBottomHoverLeaveHandler) {
          tile.removeEventListener("mouseleave", tile.__ycBottomHoverLeaveHandler);
          tile.__ycBottomHoverLeaveHandler = null;
        }
        if (actions.__ycBottomHoverEnterHandler) {
          actions.removeEventListener("mouseenter", actions.__ycBottomHoverEnterHandler);
          actions.__ycBottomHoverEnterHandler = null;
        }
        if (actions.__ycBottomHoverLeaveHandler) {
          actions.removeEventListener("mouseleave", actions.__ycBottomHoverLeaveHandler);
          actions.__ycBottomHoverLeaveHandler = null;
        }
        return;
      }

      const uiSettings = manager.getUiSettings
        ? manager.getUiSettings()
        : { showEdit: true, showRemove: true };

      const isSplitAdded = chord.__splitAdded === true;
      const showEdit = !isSplitAdded && uiSettings.showEdit !== false;
      const showRemove = uiSettings.showRemove !== false;
      actions.classList.toggle("hide-edit", !showEdit);
      actions.classList.toggle("hide-remove", !showRemove);
      actions.style.display = showEdit || showRemove ? "flex" : "none";

      if (tile.__ycBottomHoverMoveHandler) {
        tile.removeEventListener("mousemove", tile.__ycBottomHoverMoveHandler);
        tile.__ycBottomHoverMoveHandler = null;
      }
      if (tile.__ycBottomHoverLeaveHandler) {
        tile.removeEventListener("mouseleave", tile.__ycBottomHoverLeaveHandler);
        tile.__ycBottomHoverLeaveHandler = null;
      }
      if (actions.__ycBottomHoverEnterHandler) {
        actions.removeEventListener("mouseenter", actions.__ycBottomHoverEnterHandler);
        actions.__ycBottomHoverEnterHandler = null;
      }
      if (actions.__ycBottomHoverLeaveHandler) {
        actions.removeEventListener("mouseleave", actions.__ycBottomHoverLeaveHandler);
        actions.__ycBottomHoverLeaveHandler = null;
      }

      tile.classList.remove("yc-actions-bottom-hover");

      const sourceIndices =
        Array.isArray(chord.__sourceIndices) && chord.__sourceIndices.length
          ? chord.__sourceIndices
          : [index];

      const currentChordName =
        typeof chord.name === "string" && chord.name.trim()
          ? chord.name.trim()
          : (typeof chord.chord === "string" ? chord.chord.trim() : "");

      const stopEvent = (event) => {
        event.preventDefault();
        event.stopPropagation();
      };

      editButton.onmousedown = stopEvent;
      if (timeButton) timeButton.onmousedown = stopEvent;
      removeButton.onmousedown = stopEvent;

      editButton.onclick = (event) => {
        stopEvent(event);
        if (!showEdit) return;

        const videoId = this._extractCurrentVideoId();
        if (!videoId || !manager.openChordReplacePicker) return;
        const activeMode = window.chordsMode || "regular";

        const songChords = manager.buildSongChordList
          ? manager.buildSongChordList(this._originalChords || this.chords)
          : [];

        manager.openChordReplacePicker({
          anchorEl: editButton,
          currentValue: currentChordName,
          songChords,
          videoId,
          mode: activeMode,
          sourceIndices,
          capoContext: "carousel",
          onSplit: async () => {
            if (!manager.splitChordGroup) {
              return { success: false, error: "Split unavailable" };
            }
            return manager.splitChordGroup({
              videoId,
              mode: activeMode,
              sourceIndices,
            });
          },
          onSelect: async (nextChordName, options = {}) => {
            const applyToAll = options?.applyToAll === true;
            const sourceChordPool = this._originalChords || this.chords || [];
            const previousChordNamesByIndex = {};
            sourceIndices.forEach((idx) => {
              const sourceChord = sourceChordPool[idx];
              const sourceName =
                typeof sourceChord?.name === "string" && sourceChord.name.trim()
                  ? sourceChord.name.trim()
                  : (typeof sourceChord?.chord === "string" ? sourceChord.chord.trim() : "");
              if (sourceName) {
                previousChordNamesByIndex[idx] = sourceName;
              }
            });

            if (
              applyToAll &&
              manager.collectSourceGroupsByChordName &&
              manager.replaceChordGroups
            ) {
              const groups = await manager.collectSourceGroupsByChordName({
                videoId,
                mode: activeMode,
                chords: this._originalChords || this.chords,
                quickEnabled: window.hideQuickChordsEnabled !== false,
                threshold: window.hideQuickChordsThreshold,
                chordName: currentChordName,
              });

              if (groups.length > 0) {
                await manager.replaceChordGroups({
                  videoId,
                  mode: activeMode,
                  sourceGroups: groups,
                  nextChordName,
                  previousChordName: currentChordName,
                  threshold: window.hideQuickChordsThreshold,
                  capoContext: "carousel",
                });
                return;
              }
            }

            await manager.replaceChordGroup({
              videoId,
              mode: activeMode,
              sourceIndices,
              nextChordName,
              previousChordName: currentChordName,
              previousChordNamesByIndex,
              threshold: window.hideQuickChordsThreshold,
              capoContext: "carousel",
            });
          },
        });
      };

      if (timeButton) {
        timeButton.onclick = (event) => {
          stopEvent(event);
          if (!showEdit || !manager.openChordTimingEditor) return;

          const videoId = this._extractCurrentVideoId();
          if (!videoId) return;
          const activeMode = window.chordsMode || "regular";

          manager.openChordTimingEditor({
            anchorEl: timeButton,
            videoId,
            mode: activeMode,
            sourceIndices,
            sourceChords: this._originalChords || this.chords,
            displayChords: this.chords,
            displayIndex: index,
            capoContext: "carousel",
          });
        };
      }

      removeButton.onclick = async (event) => {
        stopEvent(event);
        if (!showRemove || !manager.removeChordGroup) return;

        const videoId = this._extractCurrentVideoId();
        if (!videoId) return;
        const activeMode = window.chordsMode || "regular";
        const visibleChordName =
          String(tile.querySelector(".yc-chord-name")?.textContent || "").trim() ||
          (window.getCapoChord ? window.getCapoChord(currentChordName, "carousel") : currentChordName);
        if (isSplitAdded && manager.removeChordSplitSegment) {
          const removeScope = manager.openChordRemoveScopePicker
            ? await manager.openChordRemoveScopePicker({
              anchorEl: removeButton,
              chordName: visibleChordName,
              sourceCount: 1,
              previewChordName: currentChordName,
              videoId,
              mode: activeMode,
              sourceIndices: [],
              splitSegmentId: chord.__splitSegmentId,
            })
            : "single";
          if (!removeScope) return;
          await manager.removeChordSplitSegment({
            videoId,
            mode: activeMode,
            parentSourceIndex: chord.__splitParentSourceIndex,
            segmentId: chord.__splitSegmentId,
            chordName: currentChordName,
            applyToAll: removeScope === "all",
          });
          return;
        }
        const removeScope = manager.openChordRemoveScopePicker
          ? await manager.openChordRemoveScopePicker({
            anchorEl: removeButton,
            chordName: visibleChordName,
            sourceCount: sourceIndices.length,
            previewChordName: currentChordName,
            videoId,
            mode: activeMode,
            sourceIndices,
          })
          : "single";
        if (!removeScope) return;

        if (
          removeScope === "all" &&
          manager.collectSourceGroupsByChordName &&
          (manager.removeChordGroups || manager.removeChordGroup)
        ) {
          const groups = await manager.collectSourceGroupsByChordName({
            videoId,
            mode: activeMode,
            chords: this._originalChords || this.chords,
            quickEnabled: window.hideQuickChordsEnabled !== false,
            threshold: window.hideQuickChordsThreshold,
            chordName: currentChordName,
          });

          if (groups.length > 0) {
            if (manager.removeChordGroups) {
              await manager.removeChordGroups({
                videoId,
                mode: activeMode,
                sourceGroups: groups,
                threshold: window.hideQuickChordsThreshold,
                removedChordName: currentChordName,
                capoContext: "carousel",
              });
            } else {
              for (const group of groups) {
                await manager.removeChordGroup({
                  videoId,
                  mode: activeMode,
                  sourceIndices: group,
                  threshold: window.hideQuickChordsThreshold,
                  removedChordName: currentChordName,
                  capoContext: "carousel",
                });
              }
            }
            return;
          }
        }

        await manager.removeChordGroup({
          videoId,
          mode: activeMode,
          sourceIndices,
          threshold: window.hideQuickChordsThreshold,
          removedChordName: currentChordName,
          capoContext: "carousel",
        });
      };

      this._applyEditPreviewHighlightForTile(tile, chord, index);
    }

    _loadActiveChordPosition() {
      // Load saved active chord position from storage
      chrome.storage.sync.get(["activeChordPosition"], (result) => {
        if (result.activeChordPosition !== undefined) {
          // Convert position (1-7) to index (0-6)
          this.activeChordPosition = result.activeChordPosition - 1;
          window.activeChordPosition = result.activeChordPosition;
          DEBUG &&
            console.log(
              "[ChordCarousel] Loaded active position:",
              result.activeChordPosition,
              "(INDEX:",
              this.activeChordPosition,
              ")"
            );
        } else {
          // Default: position 4 (INDEX 3)
          this.activeChordPosition = 3;
          window.activeChordPosition = 4;
        }
      });
    }

    /**
     * 🎤 Detect chord indices where singing starts after Intro/Instrumental
     * These chords will show a green dot indicator
     */
    _detectSingingStartChords() {
      this.singingStartIndices.clear();

      if (!this.chords || this.chords.length === 0) return;

      const words = window.subtitleState?.words;
      const sentences = window.subtitleState?.sentences;
      const chords = this.chords;

      // 🎯 אם יש word-level - זהה לפי פערים בין מילים
      if (words && words.length > 0) {
        this._detectSingingStartFromWords(words, chords);
        return;
      }

      // 🎯 אם אין word-level - זהה לפי sentences
      if (!sentences || sentences.length === 0) return;

      // 1. Find first chord after Intro (first sentence start time)
      const firstSentenceStart = sentences[0].startTime;
      if (firstSentenceStart > 0.5) {
        // מצא את האקורד שהמשפט הראשון מתחיל בתוכו
        const chordIndex = this._findChordAtTime(chords, firstSentenceStart);
        if (chordIndex !== -1) {
          this.singingStartIndices.add(chordIndex);
          DEBUG && console.log(`[ChordCarousel] 🎤 Singing start after Intro: chord ${chordIndex} (${chords[chordIndex].name}) at ${chords[chordIndex].time}s`);
        }
      }

      // 2. Find first chord after each Instrumental (gap > 5s between sentences)
      for (let i = 0; i < sentences.length - 1; i++) {
        const gap = sentences[i + 1].startTime - sentences[i].endTime;
        if (gap > 5) {
          // מצא את האקורד שהמשפט הבא מתחיל בתוכו
          const nextSentenceStart = sentences[i + 1].startTime;
          const chordIndex = this._findChordAtTime(chords, nextSentenceStart);
          if (chordIndex !== -1) {
            this.singingStartIndices.add(chordIndex);
            DEBUG && console.log(`[ChordCarousel] 🎤 Singing start after Instrumental: chord ${chordIndex} (${chords[chordIndex].name}) at ${chords[chordIndex].time}s`);
          }
        }
      }

      DEBUG &&
        console.log(
          `[ChordCarousel] 🎤 Total singing start chords: ${this.singingStartIndices.size}`
        );
    }

    /**
     * 🎤 Detect singing start chords from word-level timing
     */
    _detectSingingStartFromWords(words, chords) {
      const GAP_FOR_INSTRUMENTAL = 5; // שניות

      // 1. Intro - אם המילה הראשונה מתחילה אחרי 0.5 שניות
      const firstWordStart = words[0].startTime;
      if (firstWordStart > 0.5) {
        // מצא את האקורד שהמילה הראשונה מתחילה בתוכו
        const chordIndex = this._findChordAtTime(chords, firstWordStart);
        if (chordIndex !== -1) {
          this.singingStartIndices.add(chordIndex);
          DEBUG && console.log(`[ChordCarousel] 🎤 Singing start after Intro: chord ${chordIndex} (${chords[chordIndex].name}) at ${chords[chordIndex].time}s`);
        }
      }

      // 2. Instrumental - פער של 5+ שניות בין מילים
      for (let i = 0; i < words.length - 1; i++) {
        const gap = words[i + 1].startTime - words[i].endTime;
        if (gap >= GAP_FOR_INSTRUMENTAL) {
          // מצא את האקורד שהמילה הבאה מתחילה בתוכו
          const nextWordStart = words[i + 1].startTime;
          const chordIndex = this._findChordAtTime(chords, nextWordStart);
          if (chordIndex !== -1) {
            this.singingStartIndices.add(chordIndex);
            DEBUG && console.log(`[ChordCarousel] 🎤 Singing start after Instrumental: chord ${chordIndex} (${chords[chordIndex].name}) at ${chords[chordIndex].time}s`);
          }
        }
      }

      DEBUG && console.log(`[ChordCarousel] 🎤 Total singing start chords (word-level): ${this.singingStartIndices.size}`);
    }

    /**
     * 🎯 מצא את האקורד שהזמן נמצא בתוכו
     * אם יש אקורדים צמודים (אותו זמן) - בחר את האחרון
     */
    _findChordAtTime(chords, time) {
      let foundIndex = -1;

      for (let i = 0; i < chords.length; i++) {
        const chordStart = chords[i].time;
        const chordEnd = i < chords.length - 1 ? chords[i + 1].time : chordStart + 10;

        if (time >= chordStart && time < chordEnd) {
          foundIndex = i;
          // המשך לחפש אם יש אקורדים צמודים (אותו זמן)
          while (i + 1 < chords.length && chords[i + 1].time === chordStart) {
            i++;
            foundIndex = i;
          }
          break;
        }
      }
      return foundIndex;
    }

    setActiveChordPosition(index) {
      // Update the active chord position (index 0-6)
      this.activeChordPosition = index;
      DEBUG &&
        console.log("[ChordCarousel] Set active position to INDEX:", index);

      // Sync with subtitles
      if (this.carouselSubtitles) {
        this.carouselSubtitles.setActivePosition(index);
      }

      // Re-highlight current chord with new position
      if (this.isVisible && this.currentChordIndex >= 0) {
        this._highlightChord(this.currentChordIndex, false);
      }
    }

    _setupNavigationListener() {
      if (!this.isVisible) {
        return;
      }

      // Guard: prevent duplicate setup
      if (this.navigationFallbackIntervalId) {
        DEBUG && console.log("[ChordCarousel] 🛡️ Navigation listener already active, skipping");
        return;
      }

      this.lastNavigationUrl = location.href;

      const handleNavigationCheck = (source = "event") => {
        const currentUrl = location.href;
        const previousUrl = this.lastNavigationUrl || currentUrl;

        if (currentUrl === previousUrl && source !== "force") {
          return;
        }

        const previousVideoId =
          this._extractVideoId(previousUrl) || this.currentVideoId;
        const currentVideoId = this._extractVideoId(currentUrl);
        this.lastNavigationUrl = currentUrl;

        if (previousVideoId === currentVideoId) {
          return;
        }

        DEBUG &&
          console.log(
            `[ChordCarousel] 🔄 Video changed (${source}): ${previousVideoId} → ${currentVideoId}`
          );

        // Close carousel when navigating to a new video
        if (this.isVisible) {
          this.hide();
          DEBUG && console.log("[ChordCarousel] ✅ Closed carousel on navigation");
        }

        this.currentVideoId = currentVideoId;
      };

      // Event-driven navigation detection (primary path)
      window.addEventListener("yt-navigate-start", () => handleNavigationCheck("yt-navigate-start"), {
        signal: this.controller.signal,
      });
      window.addEventListener("yt-navigate-finish", () => handleNavigationCheck("yt-navigate-finish"), {
        signal: this.controller.signal,
      });
      window.addEventListener("yt-page-data-updated", () => handleNavigationCheck("yt-page-data-updated"), {
        signal: this.controller.signal,
      });
      window.addEventListener("popstate", () => handleNavigationCheck("popstate"), {
        signal: this.controller.signal,
      });
      window.addEventListener("hashchange", () => handleNavigationCheck("hashchange"), {
        signal: this.controller.signal,
      });
      document.addEventListener(
        "visibilitychange",
        () => {
          if (!document.hidden) {
            handleNavigationCheck("visibilitychange");
          }
        },
        { signal: this.controller.signal }
      );

      // Fallback poll (slow, low overhead) for rare YouTube edge cases
      this.navigationFallbackIntervalId = setInterval(() => {
        if (!this.isVisible || document.hidden) {
          return;
        }
        handleNavigationCheck("fallback");
      }, 3000);

      DEBUG && console.log("[ChordCarousel] 🎯 Navigation listener setup (event-first + slow fallback)");
    }

    /**
     * 🔄 Handle translation refresh event from popup
     * Triggers new API call and updates display immediately
     */
    async _handleTranslationRefresh(event) {
      const videoId = event.detail?.videoId;
      
      if (!this.isVisible) {
        DEBUG && console.log("[ChordCarousel] 🔄 Translation refreshed but carousel not visible, ignoring");
        return;
      }

      if (videoId !== this.currentVideoId) {
        DEBUG && console.log("[ChordCarousel] 🔄 Translation refreshed for different video, ignoring");
        return;
      }

      console.log("[ChordCarousel] 🔄 Translation refreshed, clearing old subtitles and fetching new translation...");

      // Clear old subtitles from display
      if (this.carouselSubtitles) {
        this._clearSubtitles();
        console.log("[ChordCarousel] 🧹 Cleared old subtitles");
      }

      // Show progress bar
      if (window.extractorModule?.createSubtitlesProgressBar) {
        window.extractorModule.createSubtitlesProgressBar();
        console.log("[ChordCarousel] 📊 Progress bar shown");
      }

      // Trigger new API call with ignoreCustom flag
      if (window.youtubeSubtitles?.fetchAndSaveYouTubeSubtitles) {
        try {
          await window.youtubeSubtitles.fetchAndSaveYouTubeSubtitles(videoId, null, null, { ignoreCustom: true });
          console.log("[ChordCarousel] ✅ New translation fetched");
          
          // Reload subtitles in carousel
          if (this.carouselSubtitles) {
            await this.carouselSubtitles.loadSubtitles();
            console.log("[ChordCarousel] ✅ Subtitles reloaded and displayed");
          }
        } catch (error) {
          console.error("[ChordCarousel] ❌ Error fetching new translation:", error);
          
          // Remove progress bar on error
          if (window.extractorModule?.removeSubtitlesProgressBar) {
            window.extractorModule.removeSubtitlesProgressBar();
          }
        }
      }
    }

    _extractVideoId(url) {
      const match = url.match(/[?&]v=([^&]+)/);
      return match ? match[1] : null;
    }

    /**
     * 🧹 Clear carousel subtitles (used when CUSTOM only is selected)
     */
    _clearSubtitles() {
      console.log('[ChordCarousel] 🧹 Clearing subtitles...');

      // Clear global parsed sentences
      window.ycCarouselParsedSentences = [];

      // Clear and hide carousel subtitles if exists
      if (this.carouselSubtitles) {
        this.carouselSubtitles.processedSubtitles = [];

        // Clear the container HTML
        if (this.carouselSubtitles.container) {
          this.carouselSubtitles.container.innerHTML = '';
          console.log('[ChordCarousel] 🧹 Cleared subtitles container HTML');
        }

        // Hide the subtitles container completely
        if (this.carouselSubtitles.isVisible) {
          this.carouselSubtitles.hide();
          console.log('[ChordCarousel] 🚪 Closed subtitles container');
        }
      }

      console.log('[ChordCarousel] ✅ Subtitles cleared and hidden');
    }

    _loadSavedScale() {
      try {
        const saved = localStorage.getItem("youchords_carousel_size");
        if (saved !== null) {
          const value = parseFloat(saved);
          if (
            !isNaN(value) &&
            value >= CONFIG.MIN_SCALE &&
            value <= CONFIG.MAX_SCALE
          ) {
            this.currentScale = value;
            DEBUG &&
              console.log("[ChordCarousel] 📥 Loaded saved scale:", value);
          }
        }

        // Load saved direction
        const savedDirection = localStorage.getItem(
          "youchords_carousel_direction"
        );
        if (savedDirection && ["LTR", "RTL", "AUTO"].includes(savedDirection)) {
          this.currentDirection = savedDirection;
          DEBUG &&
            console.log(
              "[ChordCarousel] 📥 Loaded saved direction:",
              savedDirection
            );
        }
      } catch (error) {
        DEBUG &&
          console.log(
            "[ChordCarousel] ❌ Error loading saved settings:",
            error
          );
      }
    }

    async _loadAndApplyColors() {
      try {
        // Load from storage
        const result = await chrome.storage.sync.get([
          "carouselTheme",
          "carouselColors",
          "carouselCustomColors",
        ]);

        console.log("[ChordCarousel] 📦 Loaded from storage:", result);

        // Cache for later use
        this.savedTheme = result.carouselTheme || null;
        this.savedColors = result.carouselColors || null;
        this.savedCustomColors = result.carouselCustomColors || null;

        // Wait for DOM to be ready
        await this._waitForDOM();

        // Apply theme colors first
        if (this.savedColors) {
          console.log(
            "[ChordCarousel] 🎨 Applying theme colors:",
            this.savedTheme
          );
          this._applyThemeColors(this.savedColors);
        }

        // Apply custom colors on top
        if (
          this.savedCustomColors &&
          Object.keys(this.savedCustomColors).length > 0
        ) {
          console.log(
            "[ChordCarousel] 🎨 Applying custom colors:",
            this.savedCustomColors
          );
          this._applyCustomColors(this.savedCustomColors);
        }

        console.log("[ChordCarousel] ✅ Colors applied successfully");
      } catch (error) {
        console.error("[ChordCarousel] ❌ Error loading colors:", error);
      }
    }

    async _waitForDOM() {
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 50);
        });
      });
    }

    _scheduleTrackedAnimationFrame(callback) {
      if (typeof requestAnimationFrame !== "function") {
        callback();
        return null;
      }

      const rafId = requestAnimationFrame(() => {
        this.pendingRAFs?.delete(rafId);
        callback();
      });
      this.pendingRAFs?.add(rafId);
      return rafId;
    }

    _findChordIndexForTime(time) {
      if (!Array.isArray(this.chords) || !this.chords.length) return -1;
      const currentTime = Number.isFinite(Number(time)) ? Number(time) : 0;
      let activeIndex = -1;

      for (let i = 0; i < this.chords.length; i += 1) {
        if (currentTime >= this.chords[i].time) {
          activeIndex = i;
        } else {
          break;
        }
      }

      return activeIndex;
    }

    _syncCarouselToCurrentVideoTime(instant = true) {
      if (!this.carouselElement || !Array.isArray(this.chords) || !this.chords.length) {
        return;
      }

      const currentTime = Number.isFinite(this.videoElement?.currentTime)
        ? this.videoElement.currentTime
        : 0;
      const activeIndex = this._findChordIndexForTime(currentTime);

      if (activeIndex >= 0) {
        this._highlightChord(activeIndex, instant);
        this._updateVisibleTiles();
        this._updateAllBeatGrids(currentTime, activeIndex);
        return;
      }

      this.currentChordIndex = -1;
      this.carouselElement.scrollLeft = 0;
      this._updateVisibleTiles();
    }

    _applyThemeColors(colors) {
      // Apply to carousel panel
      const carousel = document.querySelector(".yc-chord-carousel");
      if (carousel) {
        carousel.style.background = colors.panelBackground;
        carousel.style.scrollbarColor = `${colors.scroll} ${colors.panelBackground}`;
      }

      // Apply to all tiles
      const tiles = document.querySelectorAll(".yc-chord-tile");
      tiles.forEach((tile) => {
        tile.style.background = colors.cardBackground;
        tile.style.borderColor = colors.cardBorderInactive;
      });

      // Apply to active tile
      const activeTile = document.querySelector(".yc-chord-tile.active");
      if (activeTile) {
        activeTile.style.borderColor = colors.cardBorderActive;
      }
    }

    _applyCustomColors(customColors) {
      const carousel = document.querySelector(".yc-chord-carousel");
      const tiles = document.querySelectorAll(".yc-chord-tile");
      const activeTile = document.querySelector(".yc-chord-tile.active");
      const carouselDiagrams = document.querySelectorAll(
        ".yc-chord-carousel .yc-chord-diagram svg"
      );

      // Apply each custom color
      for (const [target, color] of Object.entries(customColors)) {
        this._applyCustomColor(
          target,
          color,
          carousel,
          tiles,
          activeTile,
          carouselDiagrams
        );
      }
    }

    _applyCustomColor(
      target,
      color,
      carousel,
      tiles,
      activeTile,
      carouselDiagrams
    ) {
      switch (target) {
        // Carousel Panel
        case "card-border":
          if (activeTile) {
            activeTile.style.setProperty(
              "border",
              `3.5px solid ${color}`,
              "important"
            );
          }
          break;
        case "card-border-inactive":
          tiles.forEach((tile) => {
            if (!tile.classList.contains("active")) {
              tile.style.borderColor = color;
            }
          });
          break;
        case "panel-bg":
          if (carousel) {
            carousel.style.background = color;
          }
          break;
        case "card-bg":
          tiles.forEach((tile) => {
            tile.style.background = color;
          });
          break;
        case "scroll":
          if (carousel) {
            const panelBg = carousel.style.background || "#f9f9f9";
            carousel.style.scrollbarColor = `${color} ${panelBg}`;
          }
          break;

        // Beat Grid
        case "beat-squares":
          if (carousel) {
            const beatCells = carousel.querySelectorAll(".yc-beat-cell.filled");
            beatCells.forEach((cell) => {
              cell.style.backgroundColor = color;
            });
          }
          break;
        case "beat-squares-bg":
          if (carousel) {
            const beatGrids = carousel.querySelectorAll(".yc-beat-grid");
            beatGrids.forEach((grid) => {
              grid.style.background = color;
            });
          }
          break;

        // Chord Info
        case "chord-name":
          if (carousel) {
            const chordNames = carousel.querySelectorAll(".yc-chord-name");
            chordNames.forEach((name) => {
              name.style.color = color;
            });
          }
          break;
        case "chord-time":
          if (carousel) {
            const chordTimes = carousel.querySelectorAll(".yc-chord-time");
            chordTimes.forEach((time) => {
              time.style.color = color;
            });
          }
          break;

        // Position Controls
        case "gray-arrows":
          if (carousel) {
            const arrows = carousel.querySelectorAll(
              "svg .chord-arrow-left, svg .chord-arrow-right"
            );
            arrows.forEach((arrow) => {
              arrow.style.fill = color;
            });
          }
          break;
        case "position-number":
          if (carousel) {
            const positionNumbers = carousel.querySelectorAll(
              "svg .chord-position-counter"
            );
            positionNumbers.forEach((num) => {
              num.style.fill = color;
            });
          }
          break;

        // Chord Diagram - Strings
        case "string-e-high":
        case "string-b":
        case "string-g":
        case "string-d":
        case "string-a":
        case "string-e-low":
          const stringIndex = {
            "string-e-high": 5,
            "string-b": 4,
            "string-g": 3,
            "string-d": 2,
            "string-a": 1,
            "string-e-low": 0,
          }[target];
          carouselDiagrams.forEach((svg) => {
            const stringsGroup = svg.querySelector("g.strings");
            if (stringsGroup) {
              const stringLine =
                stringsGroup.querySelectorAll("line")[stringIndex];
              if (stringLine) stringLine.style.stroke = color;
            }
            const tuningGroup = svg.querySelector("g.tuning");
            if (tuningGroup) {
              const stringLabel =
                tuningGroup.querySelectorAll("text")[stringIndex];
              if (stringLabel) stringLabel.style.fill = color;
            }
          });
          break;

        // Chord Diagram - Frets
        case "fret-1":
        case "fret-2":
        case "fret-3":
        case "fret-4":
        case "fret-5":
        case "fret-6":
          const fretNum = parseInt(target.split("-")[1]) - 1;
          carouselDiagrams.forEach((svg) => {
            const fretsGroup = svg.querySelector("g.frets");
            if (fretsGroup) {
              const fretLine = fretsGroup.querySelectorAll("line")[fretNum];
              if (fretLine) fretLine.style.stroke = color;
            }
          });
          break;

        // Chord Diagram - String Letters
        case "letter-e-high":
        case "letter-b":
        case "letter-g":
        case "letter-d":
        case "letter-a":
        case "letter-e-low":
          const letterIndex = {
            "letter-e-high": 5,
            "letter-b": 4,
            "letter-g": 3,
            "letter-d": 2,
            "letter-a": 1,
            "letter-e-low": 0,
          }[target];
          carouselDiagrams.forEach((svg) => {
            const tuningGroup = svg.querySelector("g.tuning");
            if (tuningGroup) {
              const stringLabel =
                tuningGroup.querySelectorAll("text")[letterIndex];
              if (stringLabel) stringLabel.style.fill = color;
            }
          });
          break;

        // Chord Diagram - Other Elements
        case "fret-number-left":
          // Fret number on the left (6, 3, 5, etc.)
          carouselDiagrams.forEach((svg) => {
            const allTexts = svg.querySelectorAll("text");
            allTexts.forEach((text) => {
              const fontSize = text.getAttribute("font-size");
              const textContent = text.textContent.trim();
              const parentGroup = text.parentElement;
              const isFingerNumber =
                parentGroup &&
                parentGroup.classList.contains("finger-positions");
              const isTuningLetter =
                parentGroup && parentGroup.classList.contains("tuning");

              if (
                fontSize === "8px" &&
                !isFingerNumber &&
                !isTuningLetter &&
                /^\d+$/.test(textContent)
              ) {
                text.style.fill = color;
              }
            });
          });
          break;
        case "open-string":
          // Open string circles (o)
          carouselDiagrams.forEach((svg) => {
            const indicatorsGroup = svg.querySelector("g.string-indicators");
            if (indicatorsGroup) {
              const openCircles = indicatorsGroup.querySelectorAll("circle");
              openCircles.forEach((circle) => {
                circle.style.stroke = color;
              });
            }
          });
          break;
        case "muted-string":
          // Muted string X's
          carouselDiagrams.forEach((svg) => {
            const indicatorsGroup = svg.querySelector("g.string-indicators");
            if (indicatorsGroup) {
              const mutedLines = indicatorsGroup.querySelectorAll("line");
              mutedLines.forEach((line) => {
                line.style.stroke = color;
              });
            }
          });
          break;

        // Finger Numbers
        case "finger-numbers-all":
          // All finger numbers together
          carouselDiagrams.forEach((svg) => {
            const fingerGroup = svg.querySelector("g.finger-positions");
            if (fingerGroup) {
              const texts = fingerGroup.querySelectorAll("text");
              texts.forEach((text) => {
                text.style.fill = color;
              });
            }
          });
          break;
        case "finger-1":
        case "finger-2":
        case "finger-3":
        case "finger-4":
          // Individual finger number
          const fingerNum = target.split("-")[1];
          carouselDiagrams.forEach((svg) => {
            const fingerGroup = svg.querySelector("g.finger-positions");
            if (fingerGroup) {
              const fingerTexts = fingerGroup.querySelectorAll("text");
              fingerTexts.forEach((text) => {
                if (text.textContent === fingerNum) {
                  text.style.fill = color;
                }
              });
            }
          });
          break;
      }
    }

    _applyColorsToTile(tile) {
      // Apply theme colors to a single tile
      if (this.savedColors) {
        tile.style.background = this.savedColors.cardBackground;
        if (!tile.classList.contains("active")) {
          tile.style.borderColor = this.savedColors.cardBorderInactive;
        } else {
          tile.style.borderColor = this.savedColors.cardBorderActive;
        }
      }

      // Apply custom colors on top (if they exist)
      if (this.savedCustomColors) {
        if (this.savedCustomColors["card-bg"]) {
          tile.style.background = this.savedCustomColors["card-bg"];
        }
        if (
          this.savedCustomColors["card-border-inactive"] &&
          !tile.classList.contains("active")
        ) {
          tile.style.borderColor =
            this.savedCustomColors["card-border-inactive"];
        }
        if (
          this.savedCustomColors["card-border"] &&
          tile.classList.contains("active")
        ) {
          tile.style.borderColor = this.savedCustomColors["card-border"];
        }
      }
    }

    _detectRtlScrollType() {
      const tempDiv = document.createElement("div");
      tempDiv.dir = "rtl";
      tempDiv.style.cssText =
        "font-size:14px;width:4px;height:1px;position:absolute;top:-1000px;overflow:scroll";
      tempDiv.innerHTML = '<div style="width:20px;height:1px;"></div>';
      document.body.appendChild(tempDiv);
      if (tempDiv.scrollLeft > 0) {
        this.rtlScrollType = "default";
      } else {
        tempDiv.scrollLeft = 1;
        if (tempDiv.scrollLeft === 0) {
          tempDiv.scrollLeft = -1;
          this.rtlScrollType = tempDiv.scrollLeft < 0 ? "negative" : "reverse";
        }
      }
      document.body.removeChild(tempDiv);
    }

    async show(chords, videoElement) {
      const showRequestId = ++this.showRequestId;
      const isStaleShow = () => showRequestId !== this.showRequestId;

      // 🎯 FIX: Re-initialize data structures if they were cleaned up
      // This is critical for SPA navigation where the instance persists
      if (!this.renderedTiles) {
        this.renderedTiles = new Map();
      }
      if (!this.tilePool) {
        this.tilePool = [];
      }
      if (!this.resolvedDirections) {
        this.resolvedDirections = new Map();
      }

      // 🎸 FIX: Re-register capo listeners if they were cleaned up
      // This happens when carousel is closed and reopened
      if (!this._capoToggledHandler) {
        this._setupCapoListeners();
      }

      // Update current video ID
      this.currentVideoId = this._extractVideoId(location.href);
      this._updateQuickModeSwitchState(window.chordsMode || "regular");
      this._applyQuickModeSwitchVisibility();
      if (!window.ycEstimatedKey && window.ycKeyEstimator?.setCurrentFromData && window.PANEL_SUBSET?.chordText) {
        try {
          window.ycKeyEstimator.setCurrentFromData(window.PANEL_SUBSET);
        } catch (keyError) {
          console.warn("[ChordCarousel] Failed estimating key from panel subset:", keyError);
        }
      }
      this._updateEstimatedKeyBadge();

      // 🚀 Store original chords for re-filtering when settings change
      this._originalChords = chords;

      // Apply user chord edits first, then threshold filtering with source-index mapping.
      let filteredChords = Array.isArray(chords) ? chords : [];
      try {
        const manager = window.chordEditsManager;
        const videoId = this._extractCurrentVideoId();
        if (manager?.applyToChords && videoId) {
          const prepared = await manager.applyToChords({
            videoId,
            mode: window.chordsMode || "regular",
            chords: filteredChords,
            quickEnabled: window.hideQuickChordsEnabled !== false,
            threshold: window.hideQuickChordsThreshold,
          });
          if (isStaleShow()) return;
          filteredChords = Array.isArray(prepared?.chords)
            ? prepared.chords
            : [];
        } else {
          filteredChords = window.filterQuickChords
            ? window.filterQuickChords(filteredChords)
            : filteredChords;
        }
      } catch (error) {
        if (isStaleShow()) return;
        console.warn("[ChordCarousel] Failed applying chord edits, fallback to quick filter:", error);
        filteredChords = window.filterQuickChords
          ? window.filterQuickChords(filteredChords)
          : filteredChords;
      }

      if (this.isVisible) {
        // Update chords and re-render
        this.chords = filteredChords || [];
        this.videoElement = videoElement;
        if (this.chords.length === 0) {
          console.warn("[ChordCarousel] No chords");
          return;
        }

        // Clear existing tiles and reset virtual scrolling state
        this._clearAllTiles();

        this._renderChords();
        this._syncCarouselToCurrentVideoTime(true);
        this._updateEditsSummaryButtonState();
        this._refreshSingingStartForCurrentMode();

        // Load positions in background and update when ready
        this._loadChordPositionsAndUpdate();

        // 🎨 Re-apply saved colors after re-render
        this._scheduleTrackedAnimationFrame(async () => {
          if (isStaleShow()) return;
          await this._loadAndApplyColors();
          if (isStaleShow()) return;
          this._syncCarouselToCurrentVideoTime(true);
        });

        DEBUG &&
          console.log(
            "[ChordCarousel] Re-rendered with",
            this.chords.length,
            "chords"
          );
        return;
      }

      // Reset AbortController for this show session (already created in constructor)
      if (this.controller) {
        this.controller.abort();
      }
      this.controller = new AbortController();

      this.chords = filteredChords || [];
      this.videoElement = videoElement;
      if (this.chords.length === 0) {
        console.warn("[ChordCarousel] ⚠️ No chords");
        return;
      }

      // 🚀 Show carousel immediately (await for direction detection if AUTO)
      await this._createCarousel();
      if (isStaleShow()) return;
      this._updateEditsSummaryButtonState();

      // 🎤 Detect singing start chords (after Intro/Instrumental)
      this._detectSingingStartChords();

      this._renderChords();
      this._setupEventListeners();
      this._setupVideoEventListeners();

      // 🔄 Load positions in background and update when ready
      this._loadChordPositionsAndUpdate();

      // Scroll to current chord position based on video time
      this._scheduleTrackedAnimationFrame(async () => {
        if (isStaleShow()) return;
        this._updateVideoLayout();

        // 🎨 Load and apply saved colors AFTER tiles are rendered
        await this._loadAndApplyColors();
        if (isStaleShow()) return;

        // Find and highlight current chord based on video time
        const activeIndex = this._findChordIndexForTime(this.videoElement?.currentTime);
        this._syncCarouselToCurrentVideoTime(true);
        if (activeIndex >= 0 && this.videoElement) {
          const currentTime = this.videoElement.currentTime;
          DEBUG &&
            console.log(
              `[ChordCarousel] Scrolled to chord ${activeIndex} at ${currentTime.toFixed(
                2
              )}s`
            );
        }
      });

      this.isVisible = true;
      this._setupNavigationListener();

      // Initialize subtitles module - load subtitles from DB first
      if (window.CarouselSubtitles) {
        this._loadAndShowSubtitles();
      }

      DEBUG &&
        console.log("[ChordCarousel] Shown with", this.chords.length, "chords");
    }

    /**
     * 🔄 Refresh carousel when prompt changes in popup
     */
    async refreshWithNewPrompt(showTranslation, showDefault) {
      console.log('[ChordCarousel] 🔄 Refreshing with new prompt:', {
        showTranslation,
        showDefault,
        mode: showTranslation ? 'TRANSLATION' : (showDefault ? 'DEFAULT' : 'CUSTOM_ONLY')
      });

      // 🎯 If CUSTOM only (no DEFAULT, no TRANSLATION) → clear subtitles
      if (!showTranslation && !showDefault) {
        console.log('[ChordCarousel] ℹ️ CUSTOM only selected - clearing subtitles');
        this._clearSubtitles();
        return;
      }

      // Get current video ID
      const videoId = this._extractVideoId(location.href);
      if (!videoId) {
        console.warn('[ChordCarousel] No video ID - cannot refresh');
        return;
      }

      // Check IndexedDB for required data
      try {
        const aiModeSettings = await chrome.storage.local.get(['aiTranscriptionMode']);
        const aiMode = aiModeSettings.aiTranscriptionMode || 'off';

        let subtitlesData = await window.databaseManager.loadFromDatabase('subtitles', videoId);
        if (subtitlesData && window.databaseManager?.normalizeSubtitlesForActiveMode) {
          subtitlesData = await window.databaseManager.normalizeSubtitlesForActiveMode(subtitlesData, aiMode);
        }

        if (!subtitlesData) {
          console.log('[ChordCarousel] 🚀 No data in IndexedDB - triggering API call');
          
          // Show progress bar
          if (window.extractorModule?.createSubtitlesProgressBar) {
            window.extractorModule.createSubtitlesProgressBar();
          }
          
          // Trigger API call - ignore CUSTOM prompts (carousel doesn't use them)
          if (window.youtubeSubtitles?.fetchAndSaveYouTubeSubtitles) {
            window.youtubeSubtitles.fetchAndSaveYouTubeSubtitles(videoId, null, null, { ignoreCustom: true });
          }
          
          return;
        }

        if (aiMode === 'off' && showTranslation) {
          console.log('[ChordCarousel] AI mode OFF - ignoring TRANSLATION refresh request');
          showTranslation = false;
          showDefault = true;
        }

        // Check if we have the required data
        const hasTranslation = !!(subtitlesData.translationSRT?.trim() && subtitlesData.translationOriginalSentences?.length > 0);
        const hasDefault = !!(
          subtitlesData.hasActiveDefault ||
          (subtitlesData.sentenceSRT?.trim() && subtitlesData.originalSentences?.length > 0)
        );

        console.log('[ChordCarousel] 🔍 Data check:', {
          showTranslation,
          hasTranslation,
          hasDefault
        });

        if (showTranslation && !hasTranslation) {
          console.log('[ChordCarousel] 🚀 Translation selected but not in cache - triggering API call');
          
          // Show progress bar
          if (window.extractorModule?.createSubtitlesProgressBar) {
            window.extractorModule.createSubtitlesProgressBar();
          }
          
          // Trigger API call - ignore CUSTOM prompts (carousel doesn't use them)
          if (window.youtubeSubtitles?.fetchAndSaveYouTubeSubtitles) {
            window.youtubeSubtitles.fetchAndSaveYouTubeSubtitles(videoId, null, null, { ignoreCustom: true });
          }
          
          return;
        }

        if (!showTranslation && !hasDefault) {
          console.log('[ChordCarousel] 🚀 Default selected but not in cache - triggering API call');
          
          // Show progress bar
          if (window.extractorModule?.createSubtitlesProgressBar) {
            window.extractorModule.createSubtitlesProgressBar();
          }
          
          // Trigger API call - ignore CUSTOM prompts (carousel doesn't use them)
          if (window.youtubeSubtitles?.fetchAndSaveYouTubeSubtitles) {
            window.youtubeSubtitles.fetchAndSaveYouTubeSubtitles(videoId, null, null, { ignoreCustom: true });
          }
          
          return;
        }

        // Data exists - refresh subtitles display
        console.log('[ChordCarousel] ✅ Data exists - refreshing subtitles');
        if (this.carouselSubtitles) {
          // Load the correct sentences based on showTranslation
          const sentencesToUse = (showTranslation && hasTranslation)
            ? subtitlesData.translationOriginalSentences
            : subtitlesData.originalSentences;

          console.log('[ChordCarousel] 📝 Loading sentences:', {
            type: showTranslation ? 'translation' : 'default',
            count: sentencesToUse?.length || 0
          });

          const activeSentences = this._syncSubtitleStateForSingingStart(
            subtitlesData,
            { useTranslation: showTranslation && hasTranslation }
          );
          if (this.carouselSubtitles?._syncTimingOffset) {
            await this.carouselSubtitles._syncTimingOffset(videoId, {
              aiMode,
              useTranslation: showTranslation && hasTranslation,
              subtitlesData,
            });
          }

          const hasWordLevel = (window.subtitleState?.words?.length || 0) > 0;
          const parsedSentences =
            activeSentences.length > 0
              ? this._syncParsedCarouselSentences(activeSentences)
              : this._syncParsedCarouselSentences(sentencesToUse);
          if (!parsedSentences.length && !hasWordLevel) {
            return;
          }

          // If subtitles are closed, open them
          if (!this.carouselSubtitles.isVisible) {
            console.log('[ChordCarousel] 📺 Opening subtitles (were closed)');
            await this.carouselSubtitles.show();
          }

          // Force re-render with current video time
          if (this.videoElement && this.carouselSubtitles.isVisible) {
            this._refreshSingingStartForCurrentMode();
            console.log('[ChordCarousel] ✅ Subtitles display updated');
          }
        }
      } catch (error) {
        console.error('[ChordCarousel] Error refreshing with new prompt:', error);
      }
    }

    async _loadChordPositionsAndUpdate() {
      console.log(
        "[ChordCarousel] 🔄 Loading chord positions in background..."
      );

      // Wait for databaseManager to be available (with timeout)
      const maxWaitTime = 5000; // 5 seconds max
      const startTime = Date.now();

      while (!window.databaseManager && Date.now() - startTime < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!window.databaseManager) {
        console.warn(
          "[ChordCarousel] ⚠️ databaseManager not available after waiting"
        );
        return;
      }

      console.log(
        "[ChordCarousel] ✅ databaseManager is ready, loading positions..."
      );

      const videoId = this._extractVideoId(location.href);
      if (!videoId) {
        console.warn("[ChordCarousel] ⚠️ No video ID");
        return;
      }

      // Get unique chord names
      const uniqueChords = [...new Set(this.chords.map((c) => c.name))];

      // Load positions for all chords
      const promises = uniqueChords.map(async (chordName) => {
        try {
          // 1. Try Local Position (videoId + chordName)
          const localPos = await window.databaseManager.getLocalChordPosition(
            videoId,
            chordName
          );
          if (localPos !== null && localPos >= 0) {
            window.currentChordPositions.set(chordName, localPos);
            console.log(
              `[ChordCarousel] ✅ Loaded Local: ${chordName} -> ${localPos}`
            );
            return;
          }

          // 2. Try Global Position (chordName only)
          const globalPos = await window.databaseManager.getGlobalChordPosition(
            chordName
          );
          if (globalPos !== null && globalPos >= 0) {
            window.currentChordPositions.set(chordName, globalPos);
            console.log(
              `[ChordCarousel] 🌐 Loaded Global: ${chordName} -> ${globalPos}`
            );
            return;
          }

          // 3. Default to 0
          window.currentChordPositions.set(chordName, 0);
          console.log(`[ChordCarousel] 📌 Default: ${chordName} -> 0`);
        } catch (error) {
          console.error(
            `[ChordCarousel] ❌ Error loading position for ${chordName}:`,
            error
          );
          window.currentChordPositions.set(chordName, 0);
        }
      });

      await Promise.all(promises);
      console.log("[ChordCarousel] ✅ All positions loaded");

      // 🔄 Now refresh all global indicators (globes and arrows)
      this._refreshGlobalIndicators();
    }

    async _refreshGlobalIndicators() {
      console.log(
        "[ChordCarousel] 🔄 Refreshing global indicators (globes & arrows)..."
      );

      // Check if the function is available
      if (typeof window.refreshAllGlobalIndicators === "function") {
        await window.refreshAllGlobalIndicators();
        console.log(
          "[ChordCarousel] ✅ Global indicators refreshed via global function"
        );
        return;
      }

      // Function not available - need to load settings group first
      console.log(
        "[ChordCarousel] 📦 Loading settings group to get refreshAllGlobalIndicators..."
      );

      if (
        window.dynamicLoader &&
        typeof window.dynamicLoader.loadGroup === "function"
      ) {
        try {
          await window.dynamicLoader.loadGroup("settings");
          console.log("[ChordCarousel] ✅ Settings group loaded");

          // Try again after loading
          if (typeof window.refreshAllGlobalIndicators === "function") {
            await window.refreshAllGlobalIndicators();
            console.log(
              "[ChordCarousel] ✅ Global indicators refreshed after loading settings"
            );
          } else {
            console.warn(
              "[ChordCarousel] ⚠️ refreshAllGlobalIndicators still not available after loading settings"
            );
          }
        } catch (error) {
          console.error(
            "[ChordCarousel] ❌ Error loading settings group:",
            error
          );
        }
      } else {
        console.warn("[ChordCarousel] ⚠️ dynamicLoader not available");
      }
    }

    async _loadAndShowSubtitles() {
      console.log("[ChordCarousel] 📺 Checking for subtitles...");

      // 🤖 Log AI Transcription settings
      try {
        const aiSettings = await new Promise((resolve) => {
          chrome.storage.local.get(['aiTranscriptionMode', 'geminiApiKey'], (result) => {
            resolve(result);
          });
        });
        console.log("[ChordCarousel] 🤖 AI Settings:", {
          mode: aiSettings.aiTranscriptionMode || 'off',
          hasApiKey: !!aiSettings.geminiApiKey
        });
      } catch (e) {
        console.warn("[ChordCarousel] Could not read AI settings:", e);
      }

      // Step 1: Always reload from IndexedDB for the active AI mode.
      // This prevents stale in-memory Gemini subtitles from showing after switching to OFF.
      console.log("[ChordCarousel] Trying to load from IndexedDB...");

      // Ensure subtitleButton is loaded
      if (!window.loadSubtitles || typeof window.loadSubtitles !== "function") {
        if (window.dynamicLoader) {
          try {
            await window.dynamicLoader.loadGroup("subtitles");
            DEBUG && console.log("[ChordCarousel] ✅ subtitles module loaded");
          } catch (error) {
            console.error(
              "[ChordCarousel] Error loading subtitles module:",
              error
            );
            return;
          }
        } else {
          DEBUG &&
            console.log("[ChordCarousel] ⚠️ dynamicLoader not available");
          return;
        }
      }

      // Try loading from DB
      try {
        console.log("[ChordCarousel] 🔍 Calling loadSubtitles()...");
        const success = await window.loadSubtitles();
        console.log("[ChordCarousel] 🔍 loadSubtitles() returned:", success);

        if (
          success &&
          (
            (window.subtitleState?.sentences?.length || 0) > 0 ||
            (window.subtitleState?.words?.length || 0) > 0
          )
        ) {
          console.log("[ChordCarousel] ✅ Loaded from IndexedDB");
          this._showSubtitlesPanel();
          return;
        } else {
          console.log("[ChordCarousel] ⚠️ loadSubtitles() returned false or no sentences");
          if (this.carouselSubtitles?.isVisible) {
            this.carouselSubtitles.hide();
          }
        }
      } catch (error) {
        console.error("[ChordCarousel] Error loading from DB:", error);
      }

      // Step 2: Wait for extraction to complete (if started in content.js) and load
      console.log("[ChordCarousel] Waiting for subtitles to be ready...");

      try {
        // Wait for parallel extraction to complete (if it's running)
        if (window.ycSubtitlesExtractionPromise) {
          console.log("[ChordCarousel] Waiting for parallel extraction...");
          await window.ycSubtitlesExtractionPromise;
          console.log("[ChordCarousel] Parallel extraction finished");

          // 🧹 Clean up promise after use to prevent memory leak
          window.ycSubtitlesExtractionPromise = null;
        }

        // Try loading from DB
        const loadSuccess = await window.loadSubtitles();

        if (
          loadSuccess &&
          (
            (window.subtitleState?.sentences?.length || 0) > 0 ||
            (window.subtitleState?.words?.length || 0) > 0
          )
        ) {
          console.log("[ChordCarousel] ✅ Subtitles loaded successfully");

          // Complete progress bar if it exists
          if (window.extractorModule?.completeSubtitlesProgressBar) {
            window.extractorModule.completeSubtitlesProgressBar();
          }

          this._showSubtitlesPanel();
        } else {
          console.log("[ChordCarousel] ⚠️ No subtitles available yet");
          if (this.carouselSubtitles?.isVisible) {
            this.carouselSubtitles.hide();
          }

          // Remove progress bar if subtitles failed to load
          if (window.extractorModule?.removeSubtitlesProgressBar) {
            window.extractorModule.removeSubtitlesProgressBar();
          }
        }
      } catch (error) {
        console.error("[ChordCarousel] Error loading subtitles:", error);

        // 🧹 Clean up on error
        window.ycSubtitlesExtractionPromise = null;
        if (window.extractorModule?.removeSubtitlesProgressBar) {
          window.extractorModule.removeSubtitlesProgressBar();
        }
      }
    }

    _showSubtitlesPanel() {
      // 🎯 Skip carousel subtitles for custom prompts - they are displayed in the main panel only
      if (window.subtitleState?.isCustomPrompt) {
        console.log("[ChordCarousel] 🎯 Skipping carousel subtitles - custom prompt is active");
        return;
      }

      // Add chords for INTRO/OUTRO detection
      if (window.subtitleState) {
        window.subtitleState.chords = this.chords || [];
      }

      // 🎤 Re-detect singing start chords now that subtitles are loaded
      this._detectSingingStartChords();

      // 🎤 Refresh tiles to show green dots
      if (this.singingStartIndices.size > 0) {
        this._refreshSingingStartDots();
      }

      // Create and show subtitles
      if (!this.carouselSubtitles) {
        DEBUG &&
          console.log("[ChordCarousel] Creating CarouselSubtitles instance...");
        this.carouselSubtitles = new window.CarouselSubtitles({
          containerElement: this.wrapperElement,
          videoElement: this.videoElement,
          activeChordPosition: this.activeChordPosition,
        });
      }

      // Check if subtitles should be shown based on user preference
      const storedEnabled = localStorage.getItem(
        "yc_carousel_subtitles_enabled"
      );
      const shouldShow =
        storedEnabled !== null ? storedEnabled === "true" : true;

      if (shouldShow) {
        Promise.resolve(this.carouselSubtitles.show()).finally(() => {
          this._scheduleVideoLayoutUpdate();
        });
        DEBUG && console.log("[ChordCarousel] CarouselSubtitles shown");
      } else {
        if (this.carouselSubtitles?.isVisible) {
          this.carouselSubtitles.hide();
        }
        this._scheduleVideoLayoutUpdate();
        DEBUG &&
          console.log(
            "[ChordCarousel] CarouselSubtitles disabled by user preference"
          );
      }
    }

    /**
     * Refresh singing-start indicators after mode/chords changes.
     * Keeps both dots in chord tiles and green dots in subtitle bubbles in sync.
     */
    _refreshSingingStartForCurrentMode() {
      if (window.subtitleState) {
        window.subtitleState.chords = this.chords || [];
      }

      this._detectSingingStartChords();
      this._refreshSingingStartDots();

      if (!this.carouselSubtitles || !window.subtitleState) {
        return;
      }

      try {
        this.carouselSubtitles.processedSubtitles =
          this.carouselSubtitles._preprocessSubtitles();
        this.carouselSubtitles.currentSubtitleIndex = -1;

        if (this.carouselSubtitles.isVisible && this.videoElement) {
          this.carouselSubtitles._renderSubtitles(this.videoElement.currentTime);
        }
      } catch (error) {
        console.warn(
          "[ChordCarousel] Failed to refresh subtitle singing-start indicators:",
          error
        );
      }
    }

    _selectSubtitleSentencesForSingingStart(subtitlesData, useTranslation) {
      if (!subtitlesData) {
        return { sentences: [], useTranslation: false };
      }

      const useActiveTranslation =
        useTranslation === true &&
        Array.isArray(subtitlesData.translationOriginalSentences) &&
        subtitlesData.translationOriginalSentences.length > 0;

      if (useActiveTranslation) {
        return {
          sentences: subtitlesData.translationOriginalSentences,
          useTranslation: true,
        };
      }

      let defaultSentences = Array.isArray(subtitlesData.originalSentences)
        ? subtitlesData.originalSentences
        : [];

      if (
        defaultSentences.length === 0 &&
        subtitlesData.sentenceSRT?.trim() &&
        typeof this.carouselSubtitles?._parseSentenceSRT === "function"
      ) {
        defaultSentences = this.carouselSubtitles._parseSentenceSRT(
          subtitlesData.sentenceSRT
        );
      }

      return { sentences: defaultSentences, useTranslation: false };
    }

    _syncSubtitleStateForSingingStart(subtitlesData, { useTranslation = false } = {}) {
      if (!window.subtitleState || !subtitlesData) {
        return [];
      }

      const selection = this._selectSubtitleSentencesForSingingStart(
        subtitlesData,
        useTranslation
      );

      let words = [];
      if (
        !selection.useTranslation &&
        subtitlesData.wordSRT?.trim() &&
        typeof this.carouselSubtitles?._parseWordSRT === "function"
      ) {
        words = this.carouselSubtitles._parseWordSRT(subtitlesData.wordSRT);
      }

      window.subtitleState.useTranslation = selection.useTranslation;
      window.subtitleState.isCustomPrompt = false;
      window.subtitleState.sentences = selection.sentences;
      window.subtitleState.words = words;
      window.subtitleState.chords = this.chords || [];

      if (subtitlesData.activeDefaultSource) {
        window.subtitleState.activeDefaultSource = subtitlesData.activeDefaultSource;
      }

      return selection.sentences;
    }

    _syncParsedCarouselSentences(sentences) {
      const sourceSentences = Array.isArray(sentences) ? sentences : [];
      const parseForCarousel = this.carouselSubtitles?._parseSentencesForCarousel;

      if (typeof parseForCarousel === "function") {
        const parsedSentences = parseForCarousel.call(
          this.carouselSubtitles,
          sourceSentences
        );
        window.ycCarouselParsedSentences =
          parsedSentences.length > 0 ? parsedSentences : null;
        return parsedSentences;
      }

      const parsedSentences = sourceSentences
        .map((sentence) => {
          const cleanText = String(sentence?.text || "")
            .replace(/[^\w\s\u0590-\u05FF\u0600-\u06FF]/g, "")
            .toLowerCase()
            .trim();
          const wordsArray = cleanText.split(/\s+/).filter((w) => w.length > 0);
          return {
            text: sentence?.text || "",
            cleanText,
            words: wordsArray,
            startTime: sentence?.startTime,
            endTime: sentence?.endTime,
          };
        })
        .filter((sentence) => sentence.words.length > 0);

      window.ycCarouselParsedSentences =
        parsedSentences.length > 0 ? parsedSentences : null;
      return parsedSentences;
    }

    /**
     * 🎤 Refresh singing start dots on already rendered tiles
     */
    _refreshSingingStartDots() {
      for (const [index, tile] of this.renderedTiles.entries()) {
        const nameContainer = tile.querySelector(".yc-chord-name-container");
        if (!nameContainer) continue;

        // Remove existing dot if any
        const existingDot = nameContainer.querySelector(
          ".yc-singing-start-dot"
        );
        if (existingDot) existingDot.remove();

        // Add dot if this is a singing start chord
        if (this.singingStartIndices.has(index)) {
          const dot = document.createElement("span");
          dot.className = "yc-singing-start-dot";
          dot.title = "Singing starts here";
          nameContainer.insertBefore(dot, nameContainer.firstChild);
          DEBUG &&
            console.log(`[ChordCarousel] 🎤 Added green dot to tile ${index}`);
        }
      }
    }

    _addGlobalIndicatorsToTile(chordName, svg) {
      // Only add if primary chord position is enabled
      if (!window.primaryChordPositionEnabled) {
        return;
      }

      // Check if addGlobalPositionIndicator is available
      if (
        !window.addGlobalPositionIndicator ||
        typeof window.addGlobalPositionIndicator !== "function"
      ) {
        return;
      }

      // Find the left arrow in the SVG (this is what addGlobalPositionIndicator expects)
      const arrow = svg.querySelector(".chord-arrow-left");
      if (!arrow) {
        return;
      }

      // Get current position for this chord
      const currentPos = window.currentChordPositions?.get(chordName) ?? 0;

      // Add the global position indicator (globe and black arrows)
      try {
        const indicatorResult = window.addGlobalPositionIndicator(
          chordName,
          currentPos,
          arrow
        );
        if (indicatorResult && typeof indicatorResult.finally === "function") {
          indicatorResult.finally(() => {
            this._schedulePositionControlsPlacement(svg.closest(".yc-chord-tile"));
          });
        }
      } catch (error) {
        // Silent fail - don't break the carousel if this fails
        DEBUG &&
          console.warn(
            `[ChordCarousel] Failed to add global indicator for ${chordName}:`,
            error
          );
      }
    }

    _schedulePositionControlsPlacement(tile) {
      if (!tile || pendingPositionControlTiles.has(tile)) return;

      pendingPositionControlTiles.add(tile);
      const run = () => {
        pendingPositionControlTiles.delete(tile);
        this._syncPositionControlsPlacement(tile);
      };
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(run);
      } else {
        setTimeout(run, 0);
      }
    }

    _syncPositionControlsPlacement(tile) {
      if (!tile.isConnected) return;

      const nameEl = tile.querySelector(".yc-chord-name");
      const svg = tile.querySelector(".yc-chord-diagram svg");
      if (!nameEl || !svg) return;

      tile.classList.remove(POSITION_CONTROLS_TIME_ROW_CLASS);

      const nameRect = nameEl.getBoundingClientRect();
      if (!nameRect.width || !nameRect.height) return;

      const controls = svg.querySelectorAll(
        ".chord-arrow-left, .chord-arrow-right, .chord-position-counter, .global-position-globe"
      );
      const hasOverlap = Array.from(controls).some((control) => {
        const rect = control.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;

        const horizontalOverlap =
          nameRect.left < rect.right + 2 && nameRect.right > rect.left - 2;
        const verticalOverlap = nameRect.bottom > rect.top - 4;

        return horizontalOverlap && verticalOverlap;
      });

      tile.classList.toggle(POSITION_CONTROLS_TIME_ROW_CLASS, hasOverlap);
    }

    _renderTileDiagramSvg(originalChord, displayName) {
      if (!window.chordRenderer?.renderChord) {
        return null;
      }

      const renderChordName = displayName || originalChord;
      const positionsMap = window.currentChordPositions;
      const shouldMirrorPosition =
        positionsMap instanceof Map &&
        renderChordName &&
        originalChord &&
        renderChordName !== originalChord;

      let hadRenderChordPosition = false;
      let previousRenderChordPosition;

      if (shouldMirrorPosition) {
        hadRenderChordPosition = positionsMap.has(renderChordName);
        previousRenderChordPosition = positionsMap.get(renderChordName);
        const sourcePos = positionsMap.get(originalChord) ?? 0;
        positionsMap.set(renderChordName, sourcePos);
      }

      try {
        const chordElement = window.chordRenderer.renderChord(
          renderChordName,
          "",
          false
        );
        if (!chordElement) {
          return null;
        }

        const svg = chordElement.querySelector("svg");
        if (!svg) {
          return null;
        }

        // Keep navigation/state writes on original chord key even when capo display is active.
        if (renderChordName !== originalChord) {
          svg
            .querySelectorAll(".chord-arrow-left, .chord-arrow-right")
            .forEach((arrow) => {
              arrow.setAttribute("data-chord-name", originalChord);
            });
        }

        return svg;
      } finally {
        if (shouldMirrorPosition) {
          if (hadRenderChordPosition) {
            positionsMap.set(renderChordName, previousRenderChordPosition);
          } else {
            positionsMap.delete(renderChordName);
          }
        }
      }
    }

    hide() {
      if (!this.isVisible) return;
      window.chordRenderer?.closeInstrumentMenu?.();

      // Hide subtitles
      if (this.carouselSubtitles) {
        this.carouselSubtitles.hide();
      }

      // 🧹 Clean up parallel extraction promise
      if (window.ycSubtitlesExtractionPromise) {
        window.ycSubtitlesExtractionPromise = null;
        DEBUG && console.log("[ChordCarousel] Cleaned up subtitles extraction promise");
      }

      // 🎯 Remove Gemini Progress Bar if carousel is closed during loading
      if (window.extractorModule?.removeSubtitlesProgressBar) {
        window.extractorModule.removeSubtitlesProgressBar();
        console.log("[ChordCarousel] 🧹 Removed GEMINI progress bar on carousel close");
      } else {
        console.log("[ChordCarousel] ⚠️ extractorModule.removeSubtitlesProgressBar not found");
      }

      // 🎯 STEP 2: Abort all event listeners via AbortController (Master Switch)
      if (this.controller) {
        this.controller.abort();
        this.controller = null;
      }

      this._removeVideoEventListeners();
      this._resetVideoLayout();
      this._cleanup();

      if (this.wrapperElement) {
        this.wrapperElement.remove();
        this.wrapperElement = null;
        this.carouselElement = null;
        this.controlsElement = null;
      }
      this.isVisible = false;
      DEBUG && console.log("[ChordCarousel] Hidden");
    }

    async _createCarousel() {
      const videoPlayer = document.querySelector(".html5-video-player");
      if (!videoPlayer) {
        console.error("[ChordCarousel] Video player not found");
        return;
      }

      this.wrapperElement = document.createElement("div");
      this.wrapperElement.className = "yc-root-wrapper";

      this.carouselElement = document.createElement("div");
      this.carouselElement.className = "yc-chord-carousel";
      this.carouselElement.style.height = `${this.baseHeight}px`;

      this.innerElement = document.createElement("div");
      this.innerElement.className = "yc-chord-carousel-inner";
      this.carouselElement.appendChild(this.innerElement);

      this.wrapperElement.appendChild(this.carouselElement);

      const infoButton = document.createElement("button");
      infoButton.type = "button";
      infoButton.className = "yc-carousel-info-btn";
      infoButton.setAttribute("aria-label", "Song chord info");
      infoButton.setAttribute("aria-expanded", "false");
      infoButton.setAttribute("aria-pressed", "false");
      infoButton.title = "Chord Info";
      infoButton.textContent = "i";
      infoButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._closeCarouselSizePopup();
        this._closeDiagramOptionsPopup();
        const manager = window.chordEditsManager;
        if (!manager?.openChordInfoPopup) return;

        const videoId = this._extractCurrentVideoId() || window.currentVideoId || null;
        manager.openChordInfoPopup({
          anchorEl: infoButton,
          videoId,
          capoContext: "carousel",
          fallbackSongChords: Array.isArray(this._originalChords)
            ? this._originalChords
            : (Array.isArray(this.chords) ? this.chords : []),
        });
      });
      this.infoButtonElement = infoButton;
      this.wrapperElement.appendChild(infoButton);

      const editsButton = document.createElement("button");
      editsButton.type = "button";
      editsButton.className = "yc-carousel-edits-btn yc-edits-none";
      editsButton.setAttribute("aria-label", "Chord edits summary");
      editsButton.setAttribute("aria-expanded", "false");
      editsButton.setAttribute("aria-pressed", "false");
      editsButton.title = "No chord edits";
      editsButton.textContent = "✎";

      editsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._closeCarouselSizePopup();
        this._closeDiagramOptionsPopup();
        const manager = window.chordEditsManager;
        if (!manager?.openChordEditsSummaryPopup) return;

        const videoId = this._extractCurrentVideoId() || window.currentVideoId || null;
        manager.openChordEditsSummaryPopup({
          anchorEl: editsButton,
          videoId,
          mode: window.chordsMode || "regular",
          threshold: window.hideQuickChordsThreshold,
          capoContext: "carousel",
          fallbackSongChords: Array.isArray(this._originalChords)
            ? this._originalChords
            : (Array.isArray(this.chords) ? this.chords : []),
        });
      });
      this.editsSummaryButtonElement = editsButton;
      this.wrapperElement.appendChild(editsButton);
      this._updateEditsSummaryButtonState();

      const sizeButton = document.createElement("button");
      sizeButton.type = "button";
      sizeButton.className = "yc-carousel-size-btn";
      sizeButton.setAttribute("aria-label", "Quick size controls");
      sizeButton.setAttribute("aria-expanded", "false");
      sizeButton.setAttribute("aria-pressed", "false");
      sizeButton.title = "Size";
      sizeButton.textContent = "A";
      sizeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (window.chordEditsManager?.closeChordInfoPopup) {
          window.chordEditsManager.closeChordInfoPopup();
        }
        if (window.chordEditsManager?.closeChordEditsSummaryPopup) {
          window.chordEditsManager.closeChordEditsSummaryPopup();
        }
        if (window.chordEditsManager?.closeChordTimingEditor) {
          window.chordEditsManager.closeChordTimingEditor();
        }
        this._openCarouselSizePopup(sizeButton);
      });
      this.sizeButtonElement = sizeButton;
      this.wrapperElement.appendChild(sizeButton);

      const optionsButton = document.createElement("button");
      optionsButton.type = "button";
      optionsButton.className = "yc-carousel-options-btn";
      optionsButton.setAttribute("aria-label", "Chord diagram display options");
      optionsButton.setAttribute("aria-expanded", "false");
      optionsButton.setAttribute("aria-pressed", "false");
      optionsButton.title = "Display options";
      optionsButton.appendChild(createSlidersIconSvg());
      optionsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (window.chordEditsManager?.closeChordInfoPopup) {
          window.chordEditsManager.closeChordInfoPopup();
        }
        if (window.chordEditsManager?.closeChordEditsSummaryPopup) {
          window.chordEditsManager.closeChordEditsSummaryPopup();
        }
        if (window.chordEditsManager?.closeChordTimingEditor) {
          window.chordEditsManager.closeChordTimingEditor();
        }
        this._openDiagramOptionsPopup(optionsButton);
      });
      this.diagramOptionsButtonElement = optionsButton;
      this.wrapperElement.appendChild(optionsButton);

      if (window.chordRenderer?.createInstrumentSelectorButton) {
        const instrumentButton = window.chordRenderer.createInstrumentSelectorButton({
          className: "yc-carousel-instrument-btn",
        });
        this.instrumentButtonElement = instrumentButton;
        this.wrapperElement.appendChild(instrumentButton);
      }

      const keyModeGroup = document.createElement("div");
      keyModeGroup.className = "yc-carousel-key-mode-group";
      keyModeGroup.setAttribute("dir", "ltr");

      const modeSwitch = document.createElement("div");
      modeSwitch.className = "yc-carousel-mode-switch";
      modeSwitch.setAttribute("role", "group");
      modeSwitch.setAttribute("aria-label", "Quick chords mode switch");
      modeSwitch.setAttribute("dir", "ltr");
      modeSwitch.setAttribute("data-yc-owned", "true");

      const modeOptions = [
        { value: "regular", label: "R", title: "R - Beginner" },
        { value: "regularPlus", label: "R+", title: "R+ - Beginner+" },
        { value: "harmonic", label: "H", title: "H - Intermediate" },
        { value: "harmonicPlus", label: "H+", title: "H+ - Advanced" },
      ];

      this.quickModeButtons.clear();
      const easyKeyButton = document.createElement("button");
      easyKeyButton.type = "button";
      easyKeyButton.className = "yc-carousel-mode-btn yc-easy-key-btn";
      easyKeyButton.textContent = "e";
      easyKeyButton.title = "Easy Capo - choose the easiest capo position";
      easyKeyButton.setAttribute("aria-label", easyKeyButton.title);
      easyKeyButton.setAttribute("aria-pressed", "false");
      easyKeyButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this._toggleEasyKeyMode();
      });
      this.easyKeyButtonElement = easyKeyButton;
      modeSwitch.appendChild(easyKeyButton);

      modeOptions.forEach((option) => {
        const modeButton = document.createElement("button");
        modeButton.type = "button";
        modeButton.className = "yc-carousel-mode-btn";
        modeButton.textContent = option.label;
        modeButton.title = option.title;
        modeButton.setAttribute("aria-label", option.title);
        modeButton.setAttribute("aria-pressed", "false");
        modeButton.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await this._applyQuickModeSwitch(option.value);
        });
        this.quickModeButtons.set(option.value, modeButton);
        modeSwitch.appendChild(modeButton);
      });

      this.quickModeSwitchElement = modeSwitch;
      this._updateQuickModeSwitchState(window.chordsMode || "regular");
      this._applyQuickModeSwitchVisibility();

      const keyBadge = document.createElement("div");
      keyBadge.className = "yc-carousel-key-badge";
      keyBadge.setAttribute("dir", "ltr");
      keyBadge.setAttribute("data-yc-empty", "true");
      this.estimatedKeyElement = keyBadge;
      keyModeGroup.appendChild(modeSwitch);
      keyModeGroup.appendChild(keyBadge);
      this.wrapperElement.appendChild(keyModeGroup);
      this._updateEstimatedKeyBadge();

      videoPlayer.insertBefore(this.wrapperElement, videoPlayer.firstChild);
      this._setupOverlayResizeObserver();

      // Apply saved direction (async to support AUTO detection)
      await this._applyDirection(this.currentDirection);

      // 🎲 הוספת אייקון קוביות לקרוסלה
      setTimeout(() => {
        if (window.DiceIcon && window.DiceIcon.initCarousel) {
          window.DiceIcon.initCarousel();
          console.log("[ChordCarousel] 🎲 Dice icon added to carousel");
        }
        // 🎸 הוספת אייקון קאפו לקרוסלה
        if (window.CapoIcon && window.CapoIcon.initCarousel) {
          window.CapoIcon.initCarousel();
          console.log("[ChordCarousel] 🎸 Capo icon added to carousel");
        }
        // 🌐 הוספת כפתור שפה לקרוסלה
        if (window.LanguageSelector && window.LanguageSelector.initCarousel) {
          window.LanguageSelector.initCarousel();
          console.log("[ChordCarousel] 🌐 Language selector added to carousel");
        }
      }, 300);
    }

    _clearAllTiles() {
      // Remove all rendered tiles from DOM
      for (const tile of this.renderedTiles.values()) {
        if (tile.parentNode) {
          tile.parentNode.removeChild(tile);
        }
        // Return to pool for reuse
        this.tilePool.push(tile);
      }

      // Clear the map
      this.renderedTiles.clear();
      this.firstRenderedIndex = 0;
      this.lastRenderedIndex = 0;
    }

    _parseScaleXFromTransform(transformValue) {
      const transform = String(transformValue || "");
      if (!transform || transform === "none") return 1;

      const scaleXMatch = transform.match(/scaleX\((-?\d+(?:\.\d+)?)\)/);
      if (scaleXMatch) {
        const scale = Number.parseFloat(scaleXMatch[1]);
        return Number.isFinite(scale) && scale > 0 ? scale : 1;
      }

      const scaleMatch = transform.match(/scale\((-?\d+(?:\.\d+)?)(?:,\s*(-?\d+(?:\.\d+)?))?\)/);
      if (scaleMatch) {
        const scale = Number.parseFloat(scaleMatch[1]);
        return Number.isFinite(scale) && scale > 0 ? scale : 1;
      }

      const matrixMatch = transform.match(/matrix\(([^)]+)\)/);
      if (!matrixMatch) return 1;

      const values = matrixMatch[1]
        .split(",")
        .map((value) => Number.parseFloat(value.trim()));
      const scale = values[0];
      return Number.isFinite(scale) && scale > 0 ? scale : 1;
    }

    _readPlayerScaleX() {
      const player =
        this.wrapperElement?.closest?.(".html5-video-player") ||
        document.querySelector("#movie_player") ||
        document.querySelector(".html5-video-player");
      if (!player) return 1;
      const transform = player.style.transform || window.getComputedStyle(player).transform;
      return this._parseScaleXFromTransform(transform);
    }

    _refreshPlayerScaleCompensation(scaleX = null) {
      const parsedScale = Number(scaleX);
      const nextScale =
        Number.isFinite(parsedScale) && parsedScale > 0
          ? parsedScale
          : this._readPlayerScaleX();
      const safeScale = Math.max(0.1, Math.min(1, nextScale));
      const compensation = safeScale < 0.999 ? 1 / safeScale : 1;
      const changed =
        Math.abs(this.playerScaleX - safeScale) > 0.001 ||
        Math.abs(this.playerScaleCompensationX - compensation) > 0.001;

      this.playerScaleX = safeScale;
      this.playerScaleCompensationX = compensation;
      return changed;
    }

    _getHorizontalContentScale() {
      return this.currentScale * (this.playerScaleCompensationX || 1);
    }

    _getInnerLayoutWidth() {
      const totalWidth = this.chords.length * this.tileWidth;
      return Math.ceil(totalWidth * Math.max(1, this._getHorizontalContentScale()));
    }

    _applyInnerTransform() {
      if (!this.innerElement || !this.carouselElement) return;

      const isRTL = this.carouselElement.classList.contains("is-rtl");
      const originX = isRTL ? "right" : "left";
      const compensation = this.playerScaleCompensationX || 1;

      this.innerElement.style.transformOrigin = `${originX} bottom`;
      this.innerElement.style.transform =
        Math.abs(compensation - 1) > 0.001
          ? `scaleX(${compensation}) scale(${this.currentScale})`
          : `scale(${this.currentScale})`;
      this.innerElement.style.minWidth = `${this._getInnerLayoutWidth()}px`;
    }

    _handleVideoScaleChanged(event) {
      if (!this.isVisible) return;
      const changed = this._refreshPlayerScaleCompensation(event?.detail?.scaleX);
      if (!changed) return;

      this._applyInnerTransform();
      this.carouselSubtitles?.handlePlayerScaleChanged?.();
      this._updateVisibleTiles();
      this._scheduleTrackedAnimationFrame(() => {
        this._updateCarouselHeightForVisibleTiles();
        this._highlightChord(this.currentChordIndex);
      });
    }

    _renderChords() {
      if (!this.innerElement) return;

      this._refreshPlayerScaleCompensation();
      this._applyInnerTransform();

      // Calculate which tiles should be visible
      this._updateVisibleTiles();

      // The first render can happen while YouTube/player scaling is still
      // settling. Re-measure once after layout so beat bars do not open clipped.
      this._scheduleTrackedAnimationFrame(() => {
        this._updateCarouselHeightForVisibleTiles();
      });
    }

    _updateCarouselHeightForVisibleTiles() {
      if (!this.carouselElement) return;

      // Calculate ACTUAL visible range (without buffer)
      const scrollLeft = Math.abs(this.carouselElement.scrollLeft);
      const viewportWidth = this.carouselElement.offsetWidth;
      const effectiveTileWidth = this.tileWidth * this._getHorizontalContentScale();

      const visibleStartIndex = Math.floor(scrollLeft / effectiveTileWidth);
      const visibleEndIndex = Math.ceil(
        (scrollLeft + viewportWidth) / effectiveTileWidth
      );

      const getBeatRowsForIndex = (index) => {
        if (index < 0 || index >= this.chords.length) return 1;
        const nextChord = this.chords[index + 1];
        const duration = nextChord
          ? nextChord.time - this.chords[index].time
          : 3.0;
        const totalBeats = Math.max(0, Math.floor(duration / CONFIG.BEAT_DURATION));
        return Math.max(1, Math.ceil(totalBeats / CONFIG.MAX_BEATS_PER_ROW));
      };

      const fallbackBeatGridHeightForRows = (rows) =>
        rows * CONFIG.BEAT_CELL_HEIGHT +
        Math.max(0, rows - 1) * CONFIG.BEAT_ROW_GAP +
        CONFIG.BEAT_GRID_VERTICAL_PADDING;

      // Measure the rendered tiles when possible. This keeps the beat grid visible
      // even when chord text, scale, or browser layout makes a tile taller than
      // the nominal minimum height.
      let maxRows = 1;
      let maxTileHeight = CONFIG.TILE_MIN_HEIGHT;
      let maxBeatGridHeight = fallbackBeatGridHeightForRows(1);

      const includeIndex = (index, tile = null) => {
        if (index < 0 || index >= this.chords.length) return;
        const rows = getBeatRowsForIndex(index);
        maxRows = Math.max(maxRows, rows);

        if (tile) {
          const tileHeight = Math.ceil(tile.offsetHeight || 0);
          maxTileHeight = Math.max(maxTileHeight, tileHeight);

          const beatGrid = tile.querySelector?.(".yc-beat-grid");
          if (beatGrid && beatGrid.style.display !== "none") {
            const measuredGridHeight = Math.ceil(beatGrid.offsetHeight || 0);
            maxBeatGridHeight = Math.max(
              maxBeatGridHeight,
              measuredGridHeight || fallbackBeatGridHeightForRows(rows)
            );
          } else {
            maxBeatGridHeight = Math.max(
              maxBeatGridHeight,
              fallbackBeatGridHeightForRows(rows)
            );
          }
        } else {
          maxBeatGridHeight = Math.max(
            maxBeatGridHeight,
            fallbackBeatGridHeightForRows(rows)
          );
        }
      };

      if (this.renderedTiles?.size) {
        for (const [index, tile] of this.renderedTiles.entries()) {
          includeIndex(index, tile);
        }
      } else {
        for (let i = visibleStartIndex; i <= visibleEndIndex; i++) {
          includeIndex(i);
        }
      }

      const minimumHeightForBeatGrid =
        maxTileHeight +
        CONFIG.TILE_BOTTOM_OFFSET +
        maxBeatGridHeight +
        CONFIG.BEAT_GRID_MARGIN_BOTTOM +
        CONFIG.BEAT_GRID_TOP_GUARD;

      // Calculate additional padding needed for extra rows
      // Each row is ~20px (16px height + 2px gap + 3px padding)
      const extraPadding = (maxRows - 1) * 20;
      const newPaddingTop = Math.max(
        77 + extraPadding,
        maxBeatGridHeight + CONFIG.BEAT_GRID_MARGIN_BOTTOM + CONFIG.BEAT_GRID_TOP_GUARD
      );

      this.innerElement.style.paddingTop = `${newPaddingTop}px`;

      // Update carousel height to accommodate the extra padding and scale
      const baseHeight = Math.max(this.baseHeight + extraPadding, minimumHeightForBeatGrid);
      this.innerElement.style.height = `${baseHeight}px`;
      this.innerElement.style.minHeight = `${baseHeight}px`;
      const newHeight = baseHeight * this.currentScale;
      this.carouselElement.style.height = `${newHeight}px`;

      for (const tile of this.renderedTiles.values()) {
        if (!tile) continue;
        tile.style.top = "auto";
        tile.style.bottom = `${CONFIG.TILE_BOTTOM_OFFSET}px`;
      }

      // Update video layout when height changes
      this._updateVideoLayout();

      DEBUG &&
        console.log(
          `[ChordCarousel] Actually visible: ${visibleStartIndex}-${visibleEndIndex}, Max rows: ${maxRows}, Scaled height: ${newHeight}px`
        );
    }

    _updateVisibleTiles() {
      if (!this.carouselElement || !this.innerElement) return;

      // Calculate visible range based on scroll position
      const scrollLeft = Math.abs(this.carouselElement.scrollLeft);
      const viewportWidth = this.carouselElement.offsetWidth;
      const effectiveTileWidth = this.tileWidth * this._getHorizontalContentScale();

      // Calculate indices with buffer
      const startIndex = Math.max(
        0,
        Math.floor(scrollLeft / effectiveTileWidth) - CONFIG.BUFFER_TILES
      );
      const endIndex = Math.min(
        this.chords.length - 1,
        Math.ceil((scrollLeft + viewportWidth) / effectiveTileWidth) +
        CONFIG.BUFFER_TILES
      );

      // Remove tiles that are out of range
      for (const [index, tile] of this.renderedTiles.entries()) {
        if (index < startIndex || index > endIndex) {
          this.innerElement.removeChild(tile);
          this.tilePool.push(tile); // Return to pool
          this.renderedTiles.delete(index);
        }
      }

      // Add tiles that are in range but not rendered
      for (let i = startIndex; i <= endIndex; i++) {
        if (!this.renderedTiles.has(i)) {
          const tile = this._getOrCreateTile(this.chords[i], i);
          this.renderedTiles.set(i, tile);

          // Position the tile absolutely - WITHOUT scale (CSS transform will handle scaling)
          const isRTL = this.currentDirection === "RTL";
          const position = i * this.tileWidth; // Use original tileWidth, not scaled
          tile.style.position = "absolute";
          tile.style.left = "";
          tile.style.right = "";
          tile.style.top = "auto";
          tile.style.bottom = `${CONFIG.TILE_BOTTOM_OFFSET}px`;
          tile.style[isRTL ? "right" : "left"] = `${position}px`;

          this.innerElement.appendChild(tile);
        }
      }

      this.firstRenderedIndex = startIndex;
      this.lastRenderedIndex = endIndex;

      // Update carousel height based on visible tiles
      this._updateCarouselHeightForVisibleTiles();

      // Restore active class to current chord (even during manual scrolling)
      if (this.currentChordIndex >= 0) {
        const currentTile = this.renderedTiles.get(this.currentChordIndex);
        if (currentTile && !currentTile.classList.contains("active")) {
          currentTile.classList.add("active");
        }
      }

      // Always update beat grids for all rendered tiles
      if (this.currentChordIndex >= 0 && this.videoElement) {
        const currentTime = this.videoElement.currentTime;
        this._updateAllBeatGrids(currentTime, this.currentChordIndex);
      }

      // Tile colors are already applied on creation/reuse in _getOrCreateTile().
      // Avoid full-DOM recolor work on every scroll tick.
      this._applyTimingPreviewHighlights(window.chordEditsManager?.getTimingPreviewState?.() || null);
    }

    _getOrCreateTile(chord, index) {
      // Try to reuse a tile from the pool
      let tile = this.tilePool.pop();

      if (tile) {
        // Update existing tile
        this._updateTileContent(tile, chord, index);
      } else {
        // Create new tile
        tile = this._createChordTile(chord, index);
      }

      // 🎨 Apply saved colors to the tile
      this._applyColorsToTile(tile);
      this._schedulePositionControlsPlacement(tile);

      return tile;
    }

    _updateTileContent(tile, chord, index) {
      // Clean up state from previous use (Object Pooling cleanup)
      tile.classList.remove("active");
      tile.classList.remove(POSITION_CONTROLS_TIME_ROW_CLASS);
      tile.classList.remove(
        "yc-timing-preview",
        "yc-timing-preview-before",
        "yc-timing-preview-current",
        "yc-timing-preview-after"
      );
      tile.removeAttribute("data-yc-timing-role-label");
      tile.classList.toggle("yc-split-added", chord.__splitAdded === true && chord.__splitEditingActive === true);
      if (chord.__splitAdded === true && chord.__splitEditingActive === true) {
        tile.setAttribute("data-yc-split-id", String(chord.__splitSegmentId || ""));
        tile.setAttribute("data-yc-split-side", String(chord.__splitSide || ""));
      } else {
        tile.removeAttribute("data-yc-split-id");
        tile.removeAttribute("data-yc-split-side");
      }
      this._applySplitCornerMarkers(tile, chord);

      // Update tile data attributes
      tile.setAttribute("data-index", index);

      // Update chord name and singing start dot
      const nameContainer = tile.querySelector(".yc-chord-name-container");
      if (nameContainer) {
        // Remove existing dot if any
        const existingDot = nameContainer.querySelector(
          ".yc-singing-start-dot"
        );
        if (existingDot) existingDot.remove();

        // Add dot if this is a singing start chord
        if (this.singingStartIndices.has(index)) {
          const dot = document.createElement("span");
          dot.className = "yc-singing-start-dot";
          dot.title = "Singing starts here";
          nameContainer.insertBefore(dot, nameContainer.firstChild);
        }

        // Update chord name - 🎸 עם תמיכה בקאפו
        const nameEl = nameContainer.querySelector(".yc-chord-name");
        if (nameEl) {
          const displayName = window.getCapoChord ? window.getCapoChord(chord.name, "carousel") : chord.name;
          nameEl.textContent = window.chordRenderer?.getDisplayChordName
            ? window.chordRenderer.getDisplayChordName(displayName)
            : displayName;
        }
      } else {
        // Fallback for old tile structure - 🎸 עם תמיכה בקאפו
        const nameEl = tile.querySelector(".yc-chord-name");
        if (nameEl) {
          const displayName = window.getCapoChord ? window.getCapoChord(chord.name, "carousel") : chord.name;
          nameEl.textContent = window.chordRenderer?.getDisplayChordName
            ? window.chordRenderer.getDisplayChordName(displayName)
            : displayName;
        }
      }

      // Update time
      const timeEl = tile.querySelector(".yc-chord-time");
      if (timeEl) timeEl.textContent = formatTime(chord.time);

      // Update beat grid (only if enabled)
      const beatGrid = tile.querySelector(".yc-beat-grid");
      if (beatGrid) {
        // 🎯 Check if Beat Grid is enabled
        if (window.beatGridEnabled !== false) {
          const nextChord = this.chords[index + 1];
          const duration = nextChord ? nextChord.time - chord.time : 3.0;
          const totalBeats = Math.floor(duration / CONFIG.BEAT_DURATION);

          // Set grid columns dynamically - max 10 per row
          if (totalBeats <= 10) {
            beatGrid.style.gridTemplateColumns = `repeat(${totalBeats}, 1fr)`;
          } else {
            beatGrid.style.gridTemplateColumns = `repeat(10, 1fr)`;
          }

          // Clear and rebuild beat cells
          beatGrid.innerHTML = "";
          for (let i = 0; i < totalBeats; i++) {
            const cell = document.createElement("div");
            cell.className = "yc-beat-cell";
            cell.setAttribute("data-beat-index", i);
            beatGrid.appendChild(cell);
          }

          // Show beat grid
          beatGrid.style.display = "";
        } else {
          // Hide beat grid when disabled
          beatGrid.style.display = "none";
          beatGrid.innerHTML = ""; // Clear cells to save memory
        }
      }

      // Update diagram (if chordRenderer available)
      if (window.chordRenderer?.renderChord) {
        const diagramEl = tile.querySelector(".yc-chord-diagram");
        if (diagramEl) {
          // Keep original chord key for position state/random sync.
          // Capo translation is for display text, not for currentChordPositions map keys.
          const originalChord = chord.name;
          const displayName = window.getCapoChord
            ? window.getCapoChord(originalChord, "carousel")
            : originalChord;

          diagramEl.setAttribute("data-chord-name", originalChord);
          diagramEl.setAttribute("data-original-chord", originalChord);
          diagramEl.setAttribute("data-display-chord", displayName);

          diagramEl.innerHTML = ""; // Clear old diagram
          const svg = this._renderTileDiagramSvg(originalChord, displayName);
          if (svg) {
            diagramEl.appendChild(svg);

            // 🌐 Add global position indicators after SVG is added
            this._addGlobalIndicatorsToTile(originalChord, svg);
            this._schedulePositionControlsPlacement(tile);
          }
        }
      }

      // Update click handler
      tile.onclick = () => {
        this._highlightChord(index);
        if (this.videoElement) {
          this.videoElement.currentTime = chord.time;
        }
      };

      this._bindChordTileActions(tile, chord, index);
    }

    _createChordTile(chord, index) {
      const tile = document.createElement("div");
      tile.className = "yc-chord-tile";
      tile.classList.toggle("yc-split-added", chord.__splitAdded === true && chord.__splitEditingActive === true);
      if (chord.__splitAdded === true && chord.__splitEditingActive === true) {
        tile.setAttribute("data-yc-split-id", String(chord.__splitSegmentId || ""));
        tile.setAttribute("data-yc-split-side", String(chord.__splitSide || ""));
      }
      this._applySplitCornerMarkers(tile, chord);
      tile.setAttribute("data-index", index);
      tile.onclick = () => {
        this._highlightChord(index);
        if (this.videoElement) {
          this.videoElement.currentTime = chord.time;
        }
      };
      const nextChord = this.chords[index + 1];
      const duration = nextChord ? nextChord.time - chord.time : 3.0;

      // Create beat grid instead of duration rect (only if enabled)
      const beatGrid = document.createElement("div");
      beatGrid.className = "yc-beat-grid";

      // 🎯 Only create beat cells if Beat Grid is enabled
      if (window.beatGridEnabled !== false) {
        const totalBeats = Math.floor(duration / CONFIG.BEAT_DURATION);

        // Set grid columns dynamically - max 10 per row
        if (totalBeats <= 10) {
          beatGrid.style.gridTemplateColumns = `repeat(${totalBeats}, 1fr)`;
        } else {
          beatGrid.style.gridTemplateColumns = `repeat(10, 1fr)`;
        }

        // Create beat cells
        for (let i = 0; i < totalBeats; i++) {
          const cell = document.createElement("div");
          cell.className = "yc-beat-cell";
          cell.setAttribute("data-beat-index", i);
          beatGrid.appendChild(cell);
        }
      } else {
        // Hide beat grid when disabled
        beatGrid.style.display = "none";
      }

      // ✅ סדר נכון: שם → זמן → דיאגרמה → beat grid

      // 1. שם האקורד (למעלה) - with optional singing start dot
      const nameContainer = document.createElement("div");
      nameContainer.className = "yc-chord-name-container";

      // 🎤 Add green dot if this is a singing start chord
      if (this.singingStartIndices.has(index)) {
        const dot = document.createElement("span");
        dot.className = "yc-singing-start-dot";
        dot.title = "Singing starts here";
        nameContainer.appendChild(dot);
      }

      const nameEl = document.createElement("span");
      nameEl.className = "yc-chord-name";
      // 🎸 תמיכה בקאפו - הצגת האקורד המתורגם
      const displayName = window.getCapoChord ? window.getCapoChord(chord.name, "carousel") : chord.name;
      nameEl.textContent = window.chordRenderer?.getDisplayChordName
        ? window.chordRenderer.getDisplayChordName(displayName)
        : displayName;
      nameContainer.appendChild(nameEl);
      tile.appendChild(nameContainer);

      // 2. זמן (מתחת לשם)
      const timeEl = document.createElement("div");
      timeEl.className = "yc-chord-time";
      timeEl.textContent = formatTime(chord.time);
      tile.appendChild(timeEl);

      // 3. דיאגרמה (באמצע) - החצים והמונה בתוך ה-SVG, CSS מזיז אותם למעלה
      if (window.chordRenderer?.renderChord) {
        const svg = this._renderTileDiagramSvg(chord.name, displayName);
        if (svg) {
          const diagramEl = document.createElement("div");
          diagramEl.className = "yc-chord-diagram";

          // Keep both original and display chord names.
          diagramEl.setAttribute("data-chord-name", chord.name);
          diagramEl.setAttribute("data-original-chord", chord.name);
          diagramEl.setAttribute("data-display-chord", displayName);

          diagramEl.appendChild(svg);
          tile.appendChild(diagramEl);

          // 🌐 Add global position indicators after SVG is added
          this._addGlobalIndicatorsToTile(chord.name, svg);
          this._schedulePositionControlsPlacement(tile);
        }
      }

      // 4. Beat grid (למעלה מהכרטיס - absolute position)
      tile.appendChild(beatGrid);

      const actions = document.createElement("div");
      actions.className = "yc-chord-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "yc-chord-action-btn yc-chord-action-edit";
      editButton.textContent = "Edit";
      editButton.title = "Change chord";

      const timeButton = document.createElement("button");
      timeButton.type = "button";
      timeButton.className = "yc-chord-action-btn yc-chord-action-time";
      timeButton.textContent = "Time";
      timeButton.title = "Adjust chord timing";

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "yc-chord-action-btn yc-chord-action-remove";
      removeButton.textContent = "X";
      removeButton.title = "Remove chord";

      actions.appendChild(editButton);
      actions.appendChild(timeButton);
      actions.appendChild(removeButton);
      tile.appendChild(actions);

      this._bindChordTileActions(tile, chord, index);

      return tile;
    }

    _highlightChord(index, instant = false) {
      if (!this.carouselElement || index < 0) return;

      // Clear resume timer when system moves automatically
      if (this.resumeScrollTimeout) {
        clearTimeout(this.resumeScrollTimeout);
        this.resumeScrollTimeout = null;
      }

      // Remove active class from all rendered tiles and reset their borders
      for (const tile of this.renderedTiles.values()) {
        tile.classList.remove("active");

        // Reset border to inactive color
        const inactiveColor =
          this.savedCustomColors?.["card-border-inactive"] ||
          this.savedColors?.cardBorderInactive ||
          "#000000";
        tile.style.borderColor = inactiveColor;
      }

      // Add active class to the target tile (if rendered)
      const targetTile = this.renderedTiles.get(index);
      if (targetTile) {
        targetTile.classList.add("active");

        // Apply active border color
        const activeColor =
          this.savedCustomColors?.["card-border"] ||
          this.savedColors?.cardBorderActive ||
          "#2196f3";
        targetTile.style.borderColor = activeColor;
      }

      this.currentChordIndex = index;
      this._scrollToIndex(index, instant);

      // Note: Class 'show-fixed-frame' added but no longer has visual effect
      if (index >= this.activeChordPosition) {
        this.carouselElement.classList.add("show-fixed-frame");
      } else {
        this.carouselElement.classList.remove("show-fixed-frame");
      }
    }

    _scrollToIndex(index, instant = false) {
      if (!this.carouselElement || this.isMouseDown) return;

      // Use the effective tile width (including gap and scale)
      const effectiveStride = this.tileWidth * this._getHorizontalContentScale();

      let scrollAmount;
      if (index <= this.activeChordPosition) {
        scrollAmount = 0;
      } else {
        scrollAmount = (index - this.activeChordPosition) * effectiveStride;
      }

      const isRTL = this.currentDirection === "RTL";
      let targetScroll = scrollAmount;
      if (isRTL) {
        if (this.rtlScrollType === "negative") {
          targetScroll = -scrollAmount;
        } else if (this.rtlScrollType === "reverse") {
          targetScroll = scrollAmount;
        }
      }

      const currentScroll = this.carouselElement.scrollLeft;
      const scrollDelta = Math.abs(currentScroll - targetScroll);

      // When instant scrolling (scrubbing), use direct scrollLeft for immediate response
      if (instant) {
        this.carouselElement.scrollLeft = targetScroll;
      } else if (scrollDelta > 10) {
        this.carouselElement.scrollTo({
          left: targetScroll,
          behavior: "smooth",
        });
      }
    }

    _setupVideoEventListeners() {
      if (!this.videoElement) return;

      // Update chord on video time change (no progress bar animation)
      this.videoTimeUpdateHandler = () => {
        if (!this.isVisible) return;
        this._updateCurrentChord();
      };

      // Handle play event - immediately jump to current chord
      this.videoPlayHandler = () => {
        if (!this.isVisible) return;
        DEBUG &&
          console.log(
            "[ChordCarousel] Video started playing - jumping to current chord"
          );
        this._highlightChord(this.currentChordIndex);
      };

      // Handle pause event - clear resume timer
      this.videoPauseHandler = () => {
        if (this.resumeScrollTimeout) {
          clearTimeout(this.resumeScrollTimeout);
          this.resumeScrollTimeout = null;
          DEBUG &&
            console.log("[ChordCarousel] Video paused - cleared resume timer");
        }
      };

      // Attach event listeners
      this.videoElement.addEventListener(
        "timeupdate",
        this.videoTimeUpdateHandler,
        { signal: this.controller.signal }
      );
      this.videoElement.addEventListener(
        "seeking",
        this.videoTimeUpdateHandler,
        { signal: this.controller.signal }
      );
      this.videoElement.addEventListener("play", this.videoPlayHandler, {
        signal: this.controller.signal,
      });
      this.videoElement.addEventListener("pause", this.videoPauseHandler, {
        signal: this.controller.signal,
      });

      // Listen to global time update events (from main panel or YouTube timeline)
      this.globalTimeUpdateHandler = (e) => {
        if (!this.isVisible) return;
        const { time, isScrubbing } = e.detail || {};
        // Ignore regular global ticks (e.g. panel/preview loop).
        // Local video listeners handle normal playback updates.
        if (!isScrubbing) return;
        DEBUG &&
          console.log(`[ChordCarousel] 🎯 timeUpdate: ${time.toFixed(2)}s`);
        this._updateChordForTime(time);
      };

      window.addEventListener("yc:timeUpdate", this.globalTimeUpdateHandler, {
        signal: this.controller.signal,
      });

      // Setup YouTube timeline scrubbing
      this._setupTimelineScrubbing();

      DEBUG && console.log("[ChordCarousel] Video event listeners attached");
    }

    _updateCurrentChord() {
      const currentTime = this.videoElement.currentTime;
      let newActiveIndex = -1;

      // Find active chord with buffer to handle keyframe seeking inaccuracy
      // Add 0.25s buffer to account for video seeking to nearest keyframe
      const bufferedTime = currentTime + 0.25;

      // 🎯 STEP 3: Smart Search (CPU Optimization)
      // Start from current index instead of 0 (video moves forward)
      // Only search backwards if we seeked backwards
      const startIndex =
        this.currentChordIndex >= 0 ? this.currentChordIndex : 0;

      // Check if we need to search backwards (user seeked back)
      if (startIndex > 0 && bufferedTime < this.chords[startIndex].time) {
        // Search backwards from current position
        for (let i = startIndex - 1; i >= 0; i--) {
          if (bufferedTime >= this.chords[i].time) {
            newActiveIndex = i;
            break;
          }
        }
      } else {
        // Search forward from current position (normal playback)
        for (let i = startIndex; i < this.chords.length; i++) {
          if (bufferedTime >= this.chords[i].time) {
            newActiveIndex = i;
          } else {
            break;
          }
        }
      }

      // Only update if chord changed
      if (newActiveIndex !== this.currentChordIndex && newActiveIndex >= 0) {
        this._highlightChord(newActiveIndex);
      }

      // Update ALL beat grids based on current time
      if (newActiveIndex >= 0) {
        this._updateAllBeatGrids(currentTime, newActiveIndex);
      }
    }

    _updateBeatGrid(chordIndex, currentTime) {
      if (!this.carouselElement) return;

      // Get tile from rendered tiles map
      const tile = this.renderedTiles.get(chordIndex);
      if (!tile) return; // Tile not currently rendered

      const currentChord = this.chords[chordIndex];
      const nextChord = this.chords[chordIndex + 1];
      const duration = nextChord ? nextChord.time - currentChord.time : 3.0;

      // Calculate how far we are in the current chord
      const timeInChord = currentTime - currentChord.time;
      const currentBeatIndex = Math.floor(timeInChord / CONFIG.BEAT_DURATION);

      // Update beat cells
      const cells = tile.querySelectorAll(".yc-beat-cell");

      // If we're close to the end (within 90% of duration), fill all cells
      const progressPercent = timeInChord / duration;
      const shouldFillAll = progressPercent >= 0.9;

      cells.forEach((cell, idx) => {
        // Use toggle for efficiency
        const shouldFill = shouldFillAll ? true : idx <= currentBeatIndex;
        cell.classList.toggle("filled", shouldFill);
      });
    }

    _updateAllBeatGrids(currentTime, activeChordIndex) {
      // 🎯 Skip if Beat Grid is disabled
      if (window.beatGridEnabled === false) {
        return;
      }

      // Update ALL rendered tiles based on current time
      for (const [index, tile] of this.renderedTiles.entries()) {
        const chord = this.chords[index];
        const nextChord = this.chords[index + 1];
        const cells = tile.querySelectorAll(".yc-beat-cell");

        if (index < activeChordIndex) {
          // Past chords - fill all beats
          cells.forEach((cell) => {
            cell.classList.add("filled");
            // Apply custom color if exists
            if (
              this.savedCustomColors &&
              this.savedCustomColors["beat-squares"]
            ) {
              cell.style.backgroundColor =
                this.savedCustomColors["beat-squares"];
            }
          });
        } else if (index === activeChordIndex) {
          // Current chord - partial fill based on progress
          const duration = nextChord ? nextChord.time - chord.time : 3.0;
          const timeInChord = currentTime - chord.time;
          const currentBeatIndex = Math.floor(
            timeInChord / CONFIG.BEAT_DURATION
          );
          const progressPercent = timeInChord / duration;
          const shouldFillAll = progressPercent >= 0.9;

          cells.forEach((cell, idx) => {
            const shouldFill = shouldFillAll ? true : idx <= currentBeatIndex;
            cell.classList.toggle("filled", shouldFill);
            // Apply custom color if exists and cell is filled
            if (
              shouldFill &&
              this.savedCustomColors &&
              this.savedCustomColors["beat-squares"]
            ) {
              cell.style.backgroundColor =
                this.savedCustomColors["beat-squares"];
            }
          });
        } else {
          // Future chords - clear all beats (gray)
          cells.forEach((cell) => cell.classList.remove("filled"));
        }
      }
    }

    _rebuildBeatGridForTile(tile, index) {
      const beatGrid = tile?.querySelector?.(".yc-beat-grid");
      if (!beatGrid) return;

      if (window.beatGridEnabled === false) {
        beatGrid.style.display = "none";
        beatGrid.innerHTML = "";
        return;
      }

      const chord = this.chords?.[index];
      if (!chord) return;
      const nextChord = this.chords[index + 1];
      const duration = nextChord ? nextChord.time - chord.time : 3.0;
      const totalBeats = Math.max(0, Math.floor(duration / CONFIG.BEAT_DURATION));

      if (totalBeats <= 0) {
        beatGrid.style.display = "none";
        beatGrid.innerHTML = "";
        return;
      }

      beatGrid.style.display = "";
      beatGrid.style.gridTemplateColumns =
        totalBeats <= CONFIG.MAX_BEATS_PER_ROW
          ? `repeat(${totalBeats}, 1fr)`
          : `repeat(${CONFIG.MAX_BEATS_PER_ROW}, 1fr)`;
      beatGrid.innerHTML = "";
      for (let i = 0; i < totalBeats; i += 1) {
        const cell = document.createElement("div");
        cell.className = "yc-beat-cell";
        cell.setAttribute("data-beat-index", i);
        beatGrid.appendChild(cell);
      }
    }

    _refreshRenderedTimingOnly() {
      if (!this.renderedTiles || !this.chords) return;

      for (const [index, tile] of this.renderedTiles.entries()) {
        const chord = this.chords[index];
        if (!chord || !tile) continue;

        tile.setAttribute("data-index", String(index));
        const timeEl = tile.querySelector(".yc-chord-time");
        if (timeEl) timeEl.textContent = formatTime(chord.time);
        this._rebuildBeatGridForTile(tile, index);
      }

      this._updateCarouselHeightForVisibleTiles();
      if (this.videoElement) {
        const currentTime = this.videoElement.currentTime;
        let activeIndex = -1;
        for (let i = 0; i < this.chords.length; i += 1) {
          if (currentTime >= this.chords[i].time) {
            activeIndex = i;
          } else {
            break;
          }
        }
        this.currentChordIndex = activeIndex >= 0 ? activeIndex : this.currentChordIndex;
        this._updateAllBeatGrids(currentTime, activeIndex >= 0 ? activeIndex : this.currentChordIndex);
      }
    }

    _handleChordTimingPreviewChanged(detail = null) {
      if (!this.isVisible || !this._originalChords) return;

      if (!detail?.active) {
        this._clearTimingPreviewHighlights();
        if (this._timingPreviewActive) {
          this._timingPreviewActive = false;
          this.show(this._originalChords, this.videoElement);
        }
        return;
      }

      const detailVideoId = detail.videoId || null;
      const currentVideoId = this._extractCurrentVideoId();
      if (detailVideoId && currentVideoId && detailVideoId !== currentVideoId) {
        this._clearTimingPreviewHighlights();
        return;
      }
      const detailMode = detail.mode || "regular";
      if (detailMode !== (window.chordsMode || "regular")) {
        this._clearTimingPreviewHighlights();
        return;
      }

      const splitPreview = detail.splitByParentSourceIndex || {};
      const deletedSplitParentSourceIndices = Array.isArray(detail.deletedSplitParentSourceIndices)
        ? detail.deletedSplitParentSourceIndices
        : [];
      if (
        detail.splitPreviewTouched === true ||
        (splitPreview && typeof splitPreview === "object" && Object.keys(splitPreview).length > 0) ||
        deletedSplitParentSourceIndices.length > 0
      ) {
        this._timingPreviewActive = true;
        if (!this._splitTimingPreviewRefreshRAF) {
          this._splitTimingPreviewRefreshRAF = requestAnimationFrame(() => {
            this._splitTimingPreviewRefreshRAF = null;
            if (this.isVisible && this._originalChords) {
              this.show(this._originalChords, this.videoElement);
            }
          });
        }
        return;
      }

      const timingMap = detail.timingBySourceIndex || {};
      if (!timingMap || typeof timingMap !== "object") return;

      let changed = false;
      for (const chord of this.chords || []) {
        const sourceIndex =
          Array.isArray(chord?.__sourceIndices) && chord.__sourceIndices.length
            ? chord.__sourceIndices[0]
            : null;
        if (!Number.isInteger(sourceIndex)) continue;
        if (!Object.prototype.hasOwnProperty.call(timingMap, String(sourceIndex))) continue;
        const nextTime = Number(timingMap[String(sourceIndex)]);
        if (!Number.isFinite(nextTime) || nextTime < 0) continue;
        if (Math.abs(Number(chord.time) - nextTime) <= 0.0001) continue;
        chord.time = nextTime;
        changed = true;
      }

      this._timingPreviewActive = true;
      if (changed) {
        this._refreshRenderedTimingOnly();
      }
      this._applyTimingPreviewHighlights(detail);
    }

    _removeVideoEventListeners() {
      if (!this.videoElement) return;

      if (this.videoTimeUpdateHandler) {
        this.videoElement.removeEventListener(
          "timeupdate",
          this.videoTimeUpdateHandler
        );
        this.videoElement.removeEventListener(
          "seeking",
          this.videoTimeUpdateHandler
        );
      }

      if (this.videoPlayHandler) {
        this.videoElement.removeEventListener("play", this.videoPlayHandler);
      }

      if (this.videoPauseHandler) {
        this.videoElement.removeEventListener("pause", this.videoPauseHandler);
      }

      // Remove global time update listener
      if (this.globalTimeUpdateHandler) {
        window.removeEventListener(
          "yc:timeUpdate",
          this.globalTimeUpdateHandler
        );
        this.globalTimeUpdateHandler = null;
      }

      // Remove timeline scrubbing
      this._removeTimelineScrubbing();

      DEBUG && console.log("[ChordCarousel] Video event listeners removed");
    }

    _updateScale() {
      if (!this.innerElement || !this.carouselElement) return;

      this._refreshPlayerScaleCompensation();
      this._applyInnerTransform();

      // Update position of all existing tiles - WITHOUT scale
      const isRTL = this.carouselElement.classList.contains("is-rtl");
      for (const [index, tile] of this.renderedTiles.entries()) {
        const position = index * this.tileWidth; // Original width, not scaled
        tile.style.left = "";
        tile.style.right = "";
        tile.style.top = "auto";
        tile.style.bottom = `${CONFIG.TILE_BOTTOM_OFFSET}px`;
        tile.style[isRTL ? "right" : "left"] = `${position}px`;
      }

      // Recalculate height based on visible tiles
      this._updateCarouselHeightForVisibleTiles();

      this._updateVideoLayout();

      // Update visible tiles
      this._updateVisibleTiles();

      requestAnimationFrame(() => {
        this._highlightChord(this.currentChordIndex);
      });

      DEBUG &&
        console.log("[ChordCarousel] Scale updated to:", this.currentScale);
    }

    _updateVideoLayout() {
      const videoContainer = document.querySelector(".html5-video-container");
      const videoPlayer = document.querySelector(".html5-video-player");

      if (!videoContainer || !videoPlayer || !this.wrapperElement) return;

      videoPlayer.classList.add("yc-active");
      const overlayHeight = Math.round(this.wrapperElement.getBoundingClientRect().height);
      const playerHeight = Math.round(videoPlayer.getBoundingClientRect().height || videoPlayer.offsetHeight || 0);
      const visibleVideoHeight = Math.max(0, playerHeight - overlayHeight);
      const visibleVideoCenterY = Math.round(overlayHeight + visibleVideoHeight / 2);
      const topValue = `${overlayHeight}px`;
      const heightValue = `calc(100% - ${overlayHeight}px)`;
      const centerYValue = `${visibleVideoCenterY}px`;

      if (videoContainer.style.top !== topValue) {
        videoContainer.style.top = topValue;
      }
      if (videoContainer.style.height !== heightValue) {
        videoContainer.style.height = heightValue;
      }
      if (videoPlayer.style.getPropertyValue("--yc-carousel-visible-video-center-y") !== centerYValue) {
        videoPlayer.style.setProperty("--yc-carousel-visible-video-center-y", centerYValue);
      }
    }

    _resetVideoLayout() {
      const videoContainer = document.querySelector(".html5-video-container");
      const videoPlayer = document.querySelector(".html5-video-player");

      if (videoPlayer) {
        videoPlayer.classList.remove("yc-active");
        videoPlayer.style.removeProperty("--yc-carousel-visible-video-center-y");
      }
      if (videoContainer) {
        videoContainer.style.height = "";
        videoContainer.style.top = "";
      }
    }

    _scheduleVideoLayoutUpdate() {
      if (this.overlayLayoutRAF) return;
      this.overlayLayoutRAF = requestAnimationFrame(() => {
        this.overlayLayoutRAF = null;
        this._updateVideoLayout();
      });
    }

    _setupOverlayResizeObserver() {
      this._cleanupOverlayResizeObserver();
      if (!this.wrapperElement || typeof ResizeObserver !== "function") return;

      this.overlayResizeObserver = new ResizeObserver(() => {
        this._scheduleVideoLayoutUpdate();
      });
      this.overlayResizeObserver.observe(this.wrapperElement);
    }

    _cleanupOverlayResizeObserver() {
      if (this.overlayResizeObserver) {
        this.overlayResizeObserver.disconnect();
        this.overlayResizeObserver = null;
      }
      if (this.overlayLayoutRAF) {
        cancelAnimationFrame(this.overlayLayoutRAF);
        this.overlayLayoutRAF = null;
      }
    }

    // Detect text direction from subtitles using Regex
    _detectTextDirection(subtitlesText) {
      if (!subtitlesText) {
        return "LTR"; // Default
      }

      // Hebrew: \u0590-\u05FF
      // Arabic: \u0600-\u06FF
      const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF]/;
      const isRTL = rtlRegex.test(subtitlesText);

      DEBUG &&
        console.log(
          "[ChordCarousel] Detected direction from subtitles:",
          isRTL ? "RTL" : "LTR"
        );

      return isRTL ? "RTL" : "LTR";
    }

    // Resolve AUTO direction by loading subtitles from database
    async _resolveAutoDirection() {
      try {
        if (!this.currentVideoId) {
          DEBUG &&
            console.log(
              "[ChordCarousel] No videoId for AUTO detection, defaulting to LTR"
            );
          return "LTR";
        }

        // 🎯 Check cache first - avoid re-detection
        if (this.resolvedDirections.has(this.currentVideoId)) {
          const cachedDirection = this.resolvedDirections.get(
            this.currentVideoId
          );
          DEBUG &&
            console.log(
              "[ChordCarousel] ✅ Using cached direction:",
              cachedDirection,
              "for",
              this.currentVideoId
            );
          return cachedDirection;
        }

        const aiModeSettings = await chrome.storage.local.get(['aiTranscriptionMode']);
        const aiMode = aiModeSettings.aiTranscriptionMode || 'off';

        // Load subtitles from IndexedDB
        let subtitlesData = await window.databaseManager.loadFromDatabase(
          "subtitles",
          this.currentVideoId
        );
        if (subtitlesData && window.databaseManager?.normalizeSubtitlesForActiveMode) {
          subtitlesData = await window.databaseManager.normalizeSubtitlesForActiveMode(subtitlesData, aiMode);
        }

        console.log("[ChordCarousel] 🔍 Loaded subtitles data:", {
          hasData: !!subtitlesData,
          hasSentenceSRT: !!subtitlesData?.sentenceSRT,
          hasTranslationSRT: !!subtitlesData?.translationSRT,
          keys: subtitlesData ? Object.keys(subtitlesData) : []
        });

        // 🆕 בדיקה אם יש sentenceSRT או translationSRT
        let hasSentenceSRT = subtitlesData?.sentenceSRT?.trim();
        let hasTranslationSRT = subtitlesData?.translationSRT?.trim();

        if (!subtitlesData || (!hasSentenceSRT && !hasTranslationSRT)) {
          DEBUG &&
            console.log(
              "[ChordCarousel] No subtitles in IndexedDB, trying to load from server..."
            );

          // 🔄 Fallback to Server - try to download subtitles
          if (
            window.extractorModule &&
            typeof window.extractorModule.extractSubtitlesFromTarGz ===
            "function"
          ) {
            try {
              DEBUG &&
                console.log(
                  "[ChordCarousel] Downloading subtitles from server..."
                );

              const extractResult =
                await window.extractorModule.extractSubtitlesFromTarGz(
                  this.currentVideoId
                );

              if (extractResult) {
                DEBUG &&
                  console.log(
                    "[ChordCarousel] ✅ Subtitles downloaded, reloading from IndexedDB..."
                  );

                // Reload from IndexedDB after download (extractSubtitlesFromTarGz saves automatically)
                subtitlesData = await window.databaseManager.loadFromDatabase(
                  "subtitles",
                  this.currentVideoId
                );
                if (subtitlesData && window.databaseManager?.normalizeSubtitlesForActiveMode) {
                  subtitlesData = await window.databaseManager.normalizeSubtitlesForActiveMode(subtitlesData, aiMode);
                }
                hasSentenceSRT = subtitlesData?.sentenceSRT?.trim();
                hasTranslationSRT = subtitlesData?.translationSRT?.trim();
              } else {
                DEBUG &&
                  console.log(
                    "[ChordCarousel] ⚠️ Download failed - no subtitles found on server"
                  );
              }
            } catch (serverError) {
              DEBUG &&
                console.log(
                  "[ChordCarousel] ⚠️ Failed to download from server:",
                  serverError
                );
            }
          } else {
            DEBUG &&
              console.log(
                "[ChordCarousel] extractorModule not available for server fallback"
              );
          }

          // Final check after server attempt
          if (!subtitlesData || (!hasSentenceSRT && !hasTranslationSRT)) {
            DEBUG &&
              console.log(
                "[ChordCarousel] No subtitles found after server attempt, defaulting to LTR"
              );
            // 🎯 Cache the default direction
            this.resolvedDirections.set(this.currentVideoId, "LTR");
            return "LTR";
          }
        }

        // 🆕 בחירת ה-SRT המתאים לפי בחירת המשתמש
        let useTranslation = false;
        try {
          const selectionResult = await chrome.storage.local.get(['showTranslation']);
          useTranslation = selectionResult.showTranslation || false;
        } catch (e) {
          console.warn("[ChordCarousel] Failed to check translation mode:", e);
        }

        const useSRT = (useTranslation && hasTranslationSRT)
          ? subtitlesData.translationSRT
          : subtitlesData.sentenceSRT;

        // Detect direction from subtitles text
        const detectedDirection = this._detectTextDirection(useSRT);

        // 🎯 Cache the detected direction for future use
        this.resolvedDirections.set(this.currentVideoId, detectedDirection);

        DEBUG &&
          console.log(
            "[ChordCarousel] AUTO resolved to:",
            detectedDirection,
            "(cached for future)"
          );

        // 🎯 Help GC by clearing the large subtitles object
        subtitlesData = null;

        return detectedDirection;
      } catch (error) {
        DEBUG &&
          console.log(
            "[ChordCarousel] Error resolving AUTO direction, defaulting to LTR:",
            error
          );
        // 🎯 Cache error result too
        this.resolvedDirections.set(this.currentVideoId, "LTR");
        return "LTR";
      }
    }

    async _applyDirection(direction) {
      if (!this.carouselElement) return;

      // If direction is AUTO, resolve it from subtitles
      if (direction === "AUTO") {
        direction = await this._resolveAutoDirection();
        DEBUG &&
          console.log("[ChordCarousel] AUTO mode resolved to:", direction);
      }

      this.currentDirection = direction;

      if (direction === "RTL") {
        this.carouselElement.classList.add("is-rtl");
        this.carouselElement.setAttribute("dir", "rtl");
      } else {
        this.carouselElement.classList.remove("is-rtl");
        this.carouselElement.setAttribute("dir", "ltr");
      }

      // Re-apply scale to ensure correct transform origin (left/right bottom)
      this._updateScale();
      this._highlightChord(this.currentChordIndex);

      DEBUG && console.log("[ChordCarousel] Direction applied:", direction);
    }

    _setupEventListeners() {
      if (!this.carouselElement) return;

      // Scroll listener for virtual scrolling (throttled with RAF)
      this.carouselElement.addEventListener(
        "scroll",
        () => {
          if (this.scrollRAF) return; // Already scheduled

          this.scrollRAF = requestAnimationFrame(() => {
            this._updateVisibleTiles();
            this.scrollRAF = null;
          });
        },
        { passive: true, signal: this.controller.signal }
      );

      this.carouselElement.addEventListener(
        "mousedown",
        () => {
          this.isMouseDown = true;
          // Clear resume timer when user starts dragging
          if (this.resumeScrollTimeout) {
            clearTimeout(this.resumeScrollTimeout);
            this.resumeScrollTimeout = null;
          }
        },
        { passive: true, signal: this.controller.signal }
      );
      window.addEventListener(
        "mouseup",
        () => {
          if (this.isMouseDown) {
            this.isMouseDown = false;

            // Always restore active class and beat grids
            if (this.currentChordIndex >= 0 && this.videoElement) {
              // Restore active class to current chord
              const currentTile = this.renderedTiles.get(
                this.currentChordIndex
              );
              if (currentTile) {
                currentTile.classList.add("active");
              }

              // Update all beat grids based on current time
              const currentTime = this.videoElement.currentTime;
              this._updateAllBeatGrids(currentTime, this.currentChordIndex);
            }

            // Check if video is playing
            if (this.videoElement && !this.videoElement.paused) {
              // Video is playing - resume auto-scroll immediately
              this._highlightChord(this.currentChordIndex);
              DEBUG &&
                console.log(
                  "[ChordCarousel] Auto-scroll resumed immediately after mouseup"
                );
            }
          }
        },
        { passive: true, signal: this.controller.signal }
      );
      this.carouselElement.addEventListener(
        "touchstart",
        () => {
          this.isMouseDown = true;
          // Clear resume timer when user starts dragging
          if (this.resumeScrollTimeout) {
            clearTimeout(this.resumeScrollTimeout);
            this.resumeScrollTimeout = null;
          }
        },
        { passive: true, signal: this.controller.signal }
      );
      this.carouselElement.addEventListener(
        "touchend",
        () => {
          if (this.isMouseDown) {
            this.isMouseDown = false;

            // Always restore active class and beat grids
            if (this.currentChordIndex >= 0 && this.videoElement) {
              // Restore active class to current chord
              const currentTile = this.renderedTiles.get(
                this.currentChordIndex
              );
              if (currentTile) {
                currentTile.classList.add("active");
              }

              // Update all beat grids based on current time
              const currentTime = this.videoElement.currentTime;
              this._updateAllBeatGrids(currentTime, this.currentChordIndex);
            }

            // Check if video is playing
            if (this.videoElement && !this.videoElement.paused) {
              // Video is playing - resume auto-scroll immediately
              this._highlightChord(this.currentChordIndex);
            }
          }
        },
        { passive: true, signal: this.controller.signal }
      );

      // 🚀 Listen for Hide Quick Chords changes
      this._hideQuickChordsHandler = (e) => {
        window.hideQuickChordsEnabled = e.detail.enabled;
        window.hideQuickChordsThreshold = e.detail.threshold;
        DEBUG && console.log("[ChordCarousel] Hide Quick Chords changed:", e.detail);
        this._updateEditsSummaryButtonState();
        this._updateDiagramOptionsPopupState();

        // Re-render carousel with new filter settings
        if (this.isVisible && this._originalChords) {
          this.show(this._originalChords, this.videoElement);
        }
      };
      window.addEventListener("yc:hideQuickChordsChanged", this._hideQuickChordsHandler, { signal: this.controller.signal });

      this._fretNumbersChangedHandler = (event) => {
        window.additionalFretNumbers = normalizeFretNumbersMode(event?.detail?.value);
        this._updateDiagramOptionsPopupState();
        if (event?.detail?.source === "settingsQuickDropdown") return;
        if (this.isVisible && typeof this.refreshAllDiagrams === "function") {
          this.refreshAllDiagrams();
        }
      };
      window.addEventListener("yc:fretNumbersChanged", this._fretNumbersChangedHandler, {
        signal: this.controller.signal,
      });

      this._chordEditsChangedHandler = (event) => {
        const detailVideoId = event?.detail?.videoId;
        const currentVideoId = this._extractCurrentVideoId();
        if (detailVideoId && currentVideoId && detailVideoId !== currentVideoId) {
          return;
        }
        this._updateEditsSummaryButtonState();
        if (this.isVisible && this._originalChords) {
          this.show(this._originalChords, this.videoElement);
        }
      };
      window.addEventListener("yc:chordEditsChanged", this._chordEditsChangedHandler, {
        signal: this.controller.signal,
      });

      this._chordEditsUiChangedHandler = (event) => {
        this._applyQuickModeSwitchVisibility(event?.detail?.showModeSwitch);
        if (!this.isVisible) return;
        this._refreshChordActionControls();
      };
      window.addEventListener("yc:chordEditsUiChanged", this._chordEditsUiChangedHandler, {
        signal: this.controller.signal,
      });

      this._chordEditPreviewChangedHandler = (event) => {
        if (!this.isVisible) return;
        this._applyEditPreviewHighlights(event?.detail || null);
      };
      window.addEventListener("yc:chordEditPreviewChanged", this._chordEditPreviewChangedHandler, {
        signal: this.controller.signal,
      });

      this._chordTimingPreviewChangedHandler = (event) => {
        this._handleChordTimingPreviewChanged(event?.detail || null);
      };
      window.addEventListener("yc:chordTimingPreviewChanged", this._chordTimingPreviewChangedHandler, {
        signal: this.controller.signal,
      });

      this._modeChangedHandler = (event) => {
        this._updateQuickModeSwitchState(window.chordsMode || "regular");
        if (window.ycKeyEstimator?.isEasyKeyActive?.()) {
          void window.ycKeyEstimator.applyEasyKeyForCurrentMode?.(
            window.chordsMode || "regular"
          );
        }
        this._updateEditsSummaryButtonState();
        if (event?.detail?.skipCarouselRefresh) {
          return;
        }
        if (this.isVisible && this._originalChords) {
          this.show(this._originalChords, this.videoElement);
        }
      };
      window.addEventListener("yc:modeChanged", this._modeChangedHandler, {
        signal: this.controller.signal,
      });

      window.addEventListener(
        "yc:estimatedKeyChanged",
        (event) => {
          this._updateEstimatedKeyBadge(event?.detail || window.ycEstimatedKey);
        },
        { signal: this.controller.signal }
      );

      window.addEventListener(
        "yc:keyTransposeChanged",
        (event) => {
          this._updateEstimatedKeyBadge(event?.detail?.estimatedKey || window.ycEstimatedKey);
          if (this.isVisible && typeof this.refreshAllDiagrams === "function") {
            this.refreshAllDiagrams();
          }
        },
        { signal: this.controller.signal }
      );

      const refreshInstrumentDiagrams = () => {
        if (this.isVisible && typeof this.refreshAllDiagrams === "function") {
          this._applyInnerTransform();
          this._updateVisibleTiles();
          this.refreshAllDiagrams();
          this._updateCarouselHeightForVisibleTiles();
          this._highlightChord(this.currentChordIndex);
        }
      };
      window.addEventListener("yc:instrumentChanged", refreshInstrumentDiagrams, {
        signal: this.controller.signal,
      });
      window.addEventListener("yc:instrumentPositionsLoaded", refreshInstrumentDiagrams, {
        signal: this.controller.signal,
      });

      window.addEventListener(
        "yc:easyKeyChanged",
        () => {
          this._updateEasyKeyButtonState();
          this._updateEstimatedKeyBadge(window.ycEstimatedKey);
        },
        { signal: this.controller.signal }
      );

      window.addEventListener(
        "yc:videoScaleChanged",
        (event) => this._handleVideoScaleChanged(event),
        { signal: this.controller.signal }
      );
    }

    destroy() {
      DEBUG && console.log("[ChordCarousel] 🔥 Destroying instance");
      this._cleanup();

      // Clear singleton reference
      if (ChordCarousel.instance === this) {
        ChordCarousel.instance = null;
      }
    }

    _cleanup() {
      this.showRequestId += 1;
      window.chordRenderer?.closeInstrumentMenu?.();

      // 🚪 Dispatch event לפני סגירה
      window.dispatchEvent(
        new CustomEvent("yc:carouselClosing", {
          detail: { timestamp: Date.now() },
        })
      );

      // 🎸 Cleanup capo listeners - מניעת memory leak
      this._cleanupCapoListeners();

      if (window.chordEditsManager?.closeChordReplacePicker) {
        window.chordEditsManager.closeChordReplacePicker();
      }
      if (window.chordEditsManager?.closeChordRemoveScopePicker) {
        window.chordEditsManager.closeChordRemoveScopePicker();
      }
      if (window.chordEditsManager?.closeChordInfoPopup) {
        window.chordEditsManager.closeChordInfoPopup();
      }
      if (window.chordEditsManager?.closeChordEditsSummaryPopup) {
        window.chordEditsManager.closeChordEditsSummaryPopup();
      }
      if (window.chordEditsManager?.closeChordTimingEditor) {
        window.chordEditsManager.closeChordTimingEditor();
      }
      this._closeCarouselSizePopup();
      this._closeDiagramOptionsPopup();
      document
        .querySelectorAll(".html5-video-player.yc-carousel-controls-locked")
        .forEach((player) => player.classList.remove("yc-carousel-controls-locked"));

      // Destroy subtitles
      if (this.carouselSubtitles) {
        this.carouselSubtitles.destroy();
        this.carouselSubtitles = null;
      }
      window.chordRenderer?.stopAutoCleanup?.();

      this.pendingTimeouts.forEach((id) => clearTimeout(id));
      this.pendingTimeouts.clear();
      this.pendingRAFs.forEach((id) => cancelAnimationFrame(id));
      this.pendingRAFs.clear();

      // Cancel any pending scroll RAF
      if (this.scrollRAF) {
        cancelAnimationFrame(this.scrollRAF);
        this.scrollRAF = null;
      }
      if (this._splitTimingPreviewRefreshRAF) {
        cancelAnimationFrame(this._splitTimingPreviewRefreshRAF);
        this._splitTimingPreviewRefreshRAF = null;
      }

      // Clear resume scroll timeout
      if (this.resumeScrollTimeout) {
        clearTimeout(this.resumeScrollTimeout);
        this.resumeScrollTimeout = null;
      }

      // Clear navigation fallback interval (listeners are removed by AbortController)
      if (this.navigationFallbackIntervalId) {
        clearInterval(this.navigationFallbackIntervalId);
        this.navigationFallbackIntervalId = null;
        DEBUG && console.log('[ChordCarousel] 🧹 Cleared navigation fallback interval');
      }

      this._cleanupOverlayResizeObserver();
      if (this.wrapperElement) {
        this.wrapperElement.remove();
        this.wrapperElement = null;
        this.carouselElement = null;
        this.infoButtonElement = null;
        this.editsSummaryButtonElement = null;
        this.sizeButtonElement = null;
        this.sizePopupClose = null;
        this.sizePopupAnchor = null;
        this.diagramOptionsButtonElement = null;
        this.diagramOptionsPopupClose = null;
        this.diagramOptionsPopupAnchor = null;
        this.diagramOptionsPopupStateUpdaters?.clear();
        this.quickModeSwitchElement = null;
        this.easyKeyButtonElement = null;
        this.estimatedKeyElement = null;
        this.estimatedKeyLabelElement = null;
        if (this.quickModeButtons) {
          this.quickModeButtons.clear();
        }
      }

      // 🎯 STEP 4: Aggressive Nullify (Force Garbage Collection)
      // Clear virtual scrolling data
      this.renderedTiles.clear();
      this.renderedTiles = null;

      // Empty arrays before nullifying
      if (this.tilePool) {
        this.tilePool.length = 0;
        this.tilePool = null;
      }

      if (this.chords) {
        this.chords.length = 0;
        this.chords = null;
      }

      // Clear cache maps
      if (this.resolvedDirections) {
        this.resolvedDirections.clear();
        this.resolvedDirections = null;
      }

      this.currentChordIndex = -1;
      this.videoElement = null;
      this.innerElement = null;
    }

    _calculateTimeFromMousePosition(event, progressBar) {
      if (!this.videoElement) return null;

      const rect = progressBar.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const barWidth = rect.width;

      const percentage = Math.max(0, Math.min(1, clickX / barWidth));
      const calculatedTime = percentage * this.videoElement.duration;

      return calculatedTime;
    }

    _updateChordForTime(time) {
      let newActiveIndex = -1;

      for (let i = 0; i < this.chords.length; i++) {
        if (time >= this.chords[i].time) {
          newActiveIndex = i;
        } else {
          break;
        }
      }

      // 🎯 FIX: Only update if the difference is significant (more than 1 chord)
      // This prevents "jumping" when two update methods disagree slightly
      const indexDiff = Math.abs(newActiveIndex - this.currentChordIndex);
      if (newActiveIndex !== this.currentChordIndex && newActiveIndex >= 0 && indexDiff > 1) {
        // Use instant scroll (no animation) when scrubbing timeline
        this._highlightChord(newActiveIndex, true);
      }

      // Update ALL chord beat grids based on current time
      this._updateAllBeatGrids(time, newActiveIndex >= 0 ? newActiveIndex : this.currentChordIndex);
    }

    _setupTimelineScrubbing() {
      const selectors = [
        ".ytp-progress-bar-container",
        ".ytp-progress-bar",
        ".ytp-scrubber-container",
      ];

      for (const selector of selectors) {
        this.youtubeProgressBar = document.querySelector(selector);
        if (this.youtubeProgressBar) {
          DEBUG &&
            console.log(
              `[ChordCarousel] ✅ Found YouTube timeline: ${selector}`
            );
          break;
        }
      }

      if (!this.youtubeProgressBar) {
        DEBUG && console.warn("[ChordCarousel] ❌ YouTube timeline not found");
        return;
      }

      const mouseDownHandler = (e) => {
        this.isScrubbingTimeline = true;
        const time = this._calculateTimeFromMousePosition(
          e,
          this.youtubeProgressBar
        );
        if (time !== null) {
          // Dispatch global event for all listeners (Preview, Carousel, etc.)
          window.dispatchEvent(
            new CustomEvent("yc:timeUpdate", {
              detail: { time, isScrubbing: true },
            })
          );
        }
      };

      const mouseMoveHandler = (e) => {
        if (!this.isScrubbingTimeline) return;
        const time = this._calculateTimeFromMousePosition(
          e,
          this.youtubeProgressBar
        );
        if (time !== null) {
          // Dispatch global event
          window.dispatchEvent(
            new CustomEvent("yc:timeUpdate", {
              detail: { time, isScrubbing: true },
            })
          );
        }
      };

      const mouseUpHandler = () => {
        if (this.isScrubbingTimeline) {
          this.isScrubbingTimeline = false;
          DEBUG &&
            console.log(
              "[ChordCarousel] ✅ Stopped YouTube timeline scrubbing"
            );
        }
      };

      this.timelineMouseDownHandler = mouseDownHandler;
      this.timelineMouseMoveHandler = mouseMoveHandler;
      this.timelineMouseUpHandler = mouseUpHandler;

      this.youtubeProgressBar.addEventListener("mousedown", mouseDownHandler, {
        passive: true,
        signal: this.controller.signal,
      });
      document.addEventListener("mousemove", mouseMoveHandler, {
        passive: true,
        signal: this.controller.signal,
      });
      document.addEventListener("mouseup", mouseUpHandler, {
        passive: true,
        signal: this.controller.signal,
      });

      DEBUG &&
        console.log("[ChordCarousel] ✅ YouTube timeline scrubbing ready");
    }

    _removeTimelineScrubbing() {
      if (!this.youtubeProgressBar) return;

      if (this.timelineMouseDownHandler) {
        this.youtubeProgressBar.removeEventListener(
          "mousedown",
          this.timelineMouseDownHandler
        );
      }

      if (this.timelineMouseMoveHandler) {
        document.removeEventListener(
          "mousemove",
          this.timelineMouseMoveHandler
        );
      }

      if (this.timelineMouseUpHandler) {
        document.removeEventListener("mouseup", this.timelineMouseUpHandler);
      }

      this.isScrubbingTimeline = false;
      this.youtubeProgressBar = null;
    }

    /**
     * Refresh all chord diagrams in the carousel
     * Used when visual settings change (e.g., Additional Fret Numbers)
     */
    refreshAllDiagrams() {
      if (!this.isVisible || !this.renderedTiles) {
        DEBUG &&
          console.log(
            "[ChordCarousel] Not visible or no tiles, skipping refresh"
          );
        return;
      }

      DEBUG &&
        console.log("[ChordCarousel] 🔄 Refreshing all chord diagrams...");

      // Re-render all currently displayed tiles
      for (const [index, tile] of this.renderedTiles.entries()) {
        const chord = this.chords[index];
        if (!chord) continue;
        // Update diagram
        if (window.chordRenderer?.renderChord) {
          const diagramEl = tile.querySelector(".yc-chord-diagram");
          if (diagramEl) {
            const originalChord = diagramEl.getAttribute("data-original-chord") || chord.name;
            const displayName = window.getCapoChord
              ? window.getCapoChord(originalChord, "carousel")
              : originalChord;

            const nameEl = tile.querySelector(".yc-chord-name");
            if (nameEl) {
              nameEl.textContent = window.chordRenderer?.getDisplayChordName
                ? window.chordRenderer.getDisplayChordName(displayName)
                : displayName;
            }

            diagramEl.setAttribute("data-original-chord", originalChord);
            diagramEl.setAttribute("data-chord-name", originalChord);
            diagramEl.setAttribute("data-display-chord", displayName);
            diagramEl.innerHTML = ""; // Clear old diagram
            const svg = this._renderTileDiagramSvg(originalChord, displayName);
            if (svg) {
              diagramEl.appendChild(svg);
              // Re-add global position indicators
              this._addGlobalIndicatorsToTile(originalChord, svg);
              this._schedulePositionControlsPlacement(tile);
            }
          }
        }
      }

      // Apply custom colors to refreshed tiles
      if (
        this.savedCustomColors &&
        Object.keys(this.savedCustomColors).length > 0
      ) {
        this._applyCustomColors(this.savedCustomColors);
      }

      DEBUG && console.log("[ChordCarousel] ✅ All diagrams refreshed");
    }
  }

  if (!window.ycChordCarousel) {
    window.ycChordCarousel = new ChordCarousel();
    DEBUG && console.log("[ChordCarousel] Global instance created");
  }

  // 🎯 Listen for subtitles updates (after API calls complete)
  if (!window.__ycChordCarouselSubtitlesUpdatedBound) {
    window.__ycChordCarouselSubtitlesUpdatedBound = true;
    window.addEventListener('yc:subtitlesUpdated', async (e) => {
    console.log('[ChordCarousel] 📢 Received subtitlesUpdated event:', e.detail);

    try {
      // If carousel is open, reload subtitles
      if (!window.ycChordCarousel?.isVisible || !window.ycChordCarousel?.carouselSubtitles) return;

      console.log('[ChordCarousel] 🔄 Reloading subtitles after update...');

      // Reload from IndexedDB
      const videoId = e.detail?.videoId;
      if (!videoId || !window.databaseManager) return;

      const settings = await chrome.storage.local.get(['showTranslation', 'showDefault', 'aiTranscriptionMode']);
      const rawAiMode = typeof settings.aiTranscriptionMode === "string"
        ? settings.aiTranscriptionMode.toLowerCase()
        : "off";
      const aiMode = ["off", "auto", "always"].includes(rawAiMode) ? rawAiMode : "off";

      let subtitlesData = await window.databaseManager.loadFromDatabase('subtitles', videoId);
      if (subtitlesData && window.databaseManager?.normalizeSubtitlesForActiveMode) {
        subtitlesData = await window.databaseManager.normalizeSubtitlesForActiveMode(subtitlesData, aiMode);
      }

      // 🛡️ Re-check after await - carousel may have been closed
      if (!window.ycChordCarousel?.isVisible || !window.ycChordCarousel?.carouselSubtitles) return;

      if (!subtitlesData) return;

      // Check which mode we're in (OFF always forces DEFAULT)
      const useTranslation = aiMode === "off" ? false : (settings.showTranslation || false);
      const useDefault = aiMode === "off" ? true : settings.showDefault !== false;
      if (!useDefault && !useTranslation) return;

      const activeSentences =
        window.ycChordCarousel._syncSubtitleStateForSingingStart?.(
          subtitlesData,
          { useTranslation }
        ) || [];

      if (window.ycChordCarousel.carouselSubtitles?._syncTimingOffset) {
        await window.ycChordCarousel.carouselSubtitles._syncTimingOffset(videoId, {
          aiMode,
          useTranslation,
          subtitlesData,
        });
      }

      const hasWordLevel = (window.subtitleState?.words?.length || 0) > 0;
      if (!activeSentences.length && !hasWordLevel) return;

      const parsedSentences =
        activeSentences.length > 0
          ? window.ycChordCarousel._syncParsedCarouselSentences?.(activeSentences) || []
          : [];
      if (!parsedSentences.length && !hasWordLevel) return;

      // 🛡️ Re-check after processing - carousel may have been closed
      if (!window.ycChordCarousel?.carouselSubtitles) return;

      // Open subtitles if closed
      if (!window.ycChordCarousel.carouselSubtitles.isVisible) {
        await window.ycChordCarousel.carouselSubtitles.show();
      }

      // 🛡️ Final re-check after await
      if (!window.ycChordCarousel?.carouselSubtitles || !window.ycChordCarousel?.videoElement) return;

      // Render with current time
      if (typeof window.ycChordCarousel._refreshSingingStartForCurrentMode === "function") {
        window.ycChordCarousel._refreshSingingStartForCurrentMode();
      } else {
        window.ycChordCarousel.carouselSubtitles._renderSubtitles(
          window.ycChordCarousel.videoElement.currentTime
        );
      }

      console.log('[ChordCarousel] ✅ Subtitles reloaded and displayed');
    } catch (error) {
      console.error('[ChordCarousel] ❌ Error handling subtitlesUpdated event:', error);
    } finally {
      // 🛡️ Ensure progress bar is always removed, even on error
      if (window.extractorModule?.completeSubtitlesProgressBar) {
        window.extractorModule.completeSubtitlesProgressBar();
      }
    }
    });
  }
})();
