/*==============================================================================
  YouChords – chordsPreviewPanel.js
  ------------------------------------------------------------------------------
  ▸ Preview Panel for displaying all chord diagrams
  ▸ Single self-contained module with inline CSS
  ▸ Synchronizes with main chords panel
  ▸ Supports Regular/Harmonic/Harmonic+ modes
  ▸ Memory-efficient with proper cleanup
==============================================================================*/

(function () {
  "use strict";

  const DEBUG = false;
  const POSITION_CONTROLS_TIME_ROW_CLASS = "yc-position-controls-time-row";
  const PREVIEW_COLUMNS = 2;
  const PREVIEW_TILE_HEIGHT = 128;
  const PREVIEW_ROW_GAP = 14;
  const PREVIEW_COLUMN_GAP = 20;
  const PREVIEW_TILE_WIDTH = 84;
  const PREVIEW_VIRTUAL_BUFFER_ROWS = 5;
  const PREVIEW_VIRTUAL_BOTTOM_PADDING = 400;
  const PREVIEW_BEAT_DURATION = 0.5;
  const PREVIEW_MAX_BEATS_PER_ROW = 10;
  const PREVIEW_BEAT_ROW_HEIGHT = 14;
  const PREVIEW_BEAT_GRID_MARGIN = 10;
  const pendingPositionControlTiles = new WeakSet();
  const PREVIEW_ACTIVE_CHORD_DIRECTION_STORAGE_KEY =
    "youchords_preview_active_chord_direction";
  const PREVIEW_ACTIVE_CHORD_DIRECTION_VALUES = ["auto", "ltr", "rtl"];
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
  const PREVIEW_DISPLAY_POPUP_SCALE_KEY = "youchords_preview_display_popup_scale";
  const POPUP_UI_SCALE_MIN = 80;
  const POPUP_UI_SCALE_MAX = 140;
  const POPUP_UI_SCALE_STEP = 5;
  const POPUP_UI_SCALE_LEGACY_DEFAULT = 80;
  const POPUP_UI_SCALE_MIGRATION_SUFFIX = "__default100_migrated_v1";

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

  function clampPopupUiScalePercent(value, fallback = 100) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const stepped = Math.round(parsed / POPUP_UI_SCALE_STEP) * POPUP_UI_SCALE_STEP;
    return Math.max(POPUP_UI_SCALE_MIN, Math.min(POPUP_UI_SCALE_MAX, stepped));
  }

  function loadPreviewPopupScaleSetting(storageKey, fallback = 100) {
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
      console.warn("[PreviewPanel] Failed reading popup scale setting:", error);
      return clampPopupUiScalePercent(fallback, 100);
    }
  }

  function savePreviewPopupScaleSetting(storageKey, value) {
    try {
      const safeValue = clampPopupUiScalePercent(value, 100);
      localStorage.setItem(String(storageKey || ""), String(safeValue));
      return safeValue;
    } catch (error) {
      console.warn("[PreviewPanel] Failed storing popup scale setting:", error);
      return clampPopupUiScalePercent(value, 100);
    }
  }

  function createPreviewPopupScaleControl({
    initialPercent = 100,
    onChange = null,
  } = {}) {
    let current = clampPopupUiScalePercent(initialPercent, 100);

    const wrap = document.createElement("div");
    wrap.title = "Menu zoom";
    wrap.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 4px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.06);
      user-select: none;
      -webkit-user-select: none;
      direction: ltr !important;
      unicode-bidi: isolate !important;
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
        text-align: center;
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

  function normalizePreviewActiveChordDirection(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return PREVIEW_ACTIVE_CHORD_DIRECTION_VALUES.includes(normalized)
      ? normalized
      : "auto";
  }

  function readPreviewActiveChordDirection() {
    try {
      return normalizePreviewActiveChordDirection(
        localStorage.getItem(PREVIEW_ACTIVE_CHORD_DIRECTION_STORAGE_KEY)
      );
    } catch (error) {
      DEBUG &&
        console.warn(
          "[PreviewPanel] Failed to read preview active chord direction:",
          error
        );
      return "auto";
    }
  }

  window.getPreviewActiveChordDirection = function () {
    return readPreviewActiveChordDirection();
  };

  window.setPreviewActiveChordDirection = function (direction) {
    const normalized = normalizePreviewActiveChordDirection(direction);

    try {
      localStorage.setItem(
        PREVIEW_ACTIVE_CHORD_DIRECTION_STORAGE_KEY,
        normalized
      );
    } catch (error) {
      DEBUG &&
        console.warn(
          "[PreviewPanel] Failed to persist preview active chord direction:",
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

  window.resetPreviewActiveChordDirectionToDefault = function () {
    return window.setPreviewActiveChordDirection("auto");
  };

  /*============================================================================
    CSS INJECTION
  ============================================================================*/
  function injectCSS() {
    if (document.getElementById("yc-preview-panel-styles")) return;

    const style = document.createElement("style");
    style.id = "yc-preview-panel-styles";
    style.textContent = `
      /* Main Panel Container */
      .yc-preview-panel {
        position: absolute;
        width: 240px;
        max-height: 600px;
        background: #ffffff;
        border: 1px solid #dcdcdc;
        border-top: none;
        border-radius: 0 0 12px 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        overflow-y: auto;
        overflow-x: hidden;
        z-index: 9999;
        display: none;
        transition: opacity 0.2s ease, width 0.3s ease;
      }

      .yc-preview-panel.visible {
        display: block;
        opacity: 1;
      }

      /* ========================================
         SIZE CONTROL HEADER (SEPARATE, FIXED ABOVE PANEL)
         ======================================== */
      .yc-preview-size-control {
        position: absolute;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: flex-start;
        gap: 3px;
        min-height: calc(92px * var(--yc-preview-ui-scale, 1));
        padding: 6px 8px 6px;
        box-sizing: border-box; /* Include padding and border in width */
        /* Default: BLACK theme - רקע כהה כמו הפאנל */
        background: rgba(11, 32, 49, 0.98);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-bottom: 2px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px 12px 0 0;
        z-index: 10000;
        display: none;
        transition: opacity 0.2s ease;
      }
      
      .yc-preview-size-control.visible {
        display: flex;
        opacity: 1;
      }

      .yc-preview-top-row {
        position: relative;
        z-index: 1;
        width: 100%;
        box-sizing: border-box;
        min-height: calc(26px * var(--yc-preview-ui-scale, 1));
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .yc-preview-top-controls {
        position: relative;
        width: 186px;
        height: 26px;
        flex: 0 0 auto;
        transform: scale(var(--yc-preview-ui-scale, 1));
        transform-origin: center center;
      }

      .yc-preview-mode-row {
        position: relative;
        z-index: 3;
        width: 100%;
        box-sizing: border-box;
        min-height: calc(23px * var(--yc-preview-ui-scale, 1));
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }

      .yc-preview-mode-controls {
        width: 186px;
        height: 23px;
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 4px;
        transform: scale(var(--yc-preview-ui-scale, 1));
        transform-origin: center center;
      }

      .yc-preview-capo-dice-row {
        position: relative;
        z-index: 4;
        width: 100%;
        box-sizing: border-box;
        overflow: visible;
        min-height: calc(27px * var(--yc-preview-ui-scale, 1));
        padding-right: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .yc-preview-capo-controls {
        width: 186px;
        height: 27px;
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        overflow: visible;
        transform: scale(var(--yc-preview-ui-scale, 1));
        transform-origin: center center;
      }

      .yc-preview-capo-dice-anchor {
        position: relative;
        z-index: 5;
        overflow: visible;
        display: inline-flex;
        align-items: center;
        gap: 0;
        transform: scale(var(--yc-preview-ui-scale, 1));
        transform-origin: left center;
      }

      .yc-preview-capo-controls .yc-preview-capo-dice-anchor {
        transform: none;
      }

      /* Content wrapper - will be scaled as a group */
      .yc-preview-size-content {
        position: absolute;
        top: 50%;
        left: 101px;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0;
        margin-left: 0;
        margin-right: 0;
        transform: translateY(-50%);
        transform-origin: left center;
      }

      .yc-preview-size-label {
        font-size: 13px;
        font-weight: 600;
        /* Default BLACK theme color */
        color: #ffffff;
      }

      .yc-preview-size-btn {
        box-sizing: border-box;
        width: 22px;
        height: 22px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
        user-select: none;
        /* Default BLACK theme colors */
        background: rgba(62, 166, 255, 0.2);
        border: 1px solid rgba(62, 166, 255, 0.3);
        color: #ffffff;
      }

      .yc-preview-size-btn:hover {
        background: rgba(62, 166, 255, 0.4);
        border-color: rgba(62, 166, 255, 0.6);
      }

      .yc-preview-size-btn:active {
        transform: scale(0.95);
      }

      /* 🎯 Close button (X) - same style as main panel, positioned at top-right */
      .yc-preview-close-btn {
        background: none;
        border: none;
        color: #ffffff;
        font-size: 20px;
        cursor: pointer;
        pointer-events: auto;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background-color 0.2s ease;
        position: absolute;
        top: 1px;
        right: 1px;
        transform: none;
        z-index: 50;
      }

      .yc-preview-close-btn:hover {
        background-color: rgba(255, 255, 255, 0.1);
      }

      .yc-preview-close-btn:active {
        transform: scale(0.95);
      }

      .yc-preview-size-value {
        box-sizing: border-box;
        width: 34px;
        min-width: 34px;
        height: 22px;
        padding: 0 5px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        /* Default BLACK theme colors */
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #ffffff;
      }

      /* Info Button (i) - positioned absolutely on LEFT side of SIZE */
      .yc-preview-info-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.22);
        padding: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s ease;
        position: absolute;
        top: 50%;
        left: 5px;
        transform: translateY(-50%);
        transform-origin: left center;
        width: 24px;
        height: 24px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 13px;
        font-weight: 700;
        line-height: 1;
      }

      .yc-preview-edits-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.22);
        padding: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s ease;
        position: absolute;
        top: 50%;
        left: 29px;
        transform: translateY(-50%);
        transform-origin: left center;
        width: 24px;
        height: 24px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 13px;
        font-weight: 700;
        line-height: 1;
      }

      .yc-preview-options-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.22);
        padding: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s ease;
        position: absolute;
        top: 50%;
        left: 53px;
        transform: translateY(-50%);
        transform-origin: left center;
        width: 24px;
        height: 24px;
        color: rgba(255, 255, 255, 0.9);
        line-height: 1;
      }

      .yc-preview-options-btn svg {
        width: 15px;
        height: 15px;
        display: block;
      }

      .yc-preview-instrument-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.22);
        padding: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s ease;
        position: absolute;
        top: 50%;
        left: 77px;
        transform: translateY(-50%);
        transform-origin: left center;
        width: 20px;
        height: 24px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 11px;
        font-weight: 800;
        line-height: 1;
      }

      .yc-preview-mode-switch {
        position: absolute;
        top: 50%;
        left: calc(68px * var(--yc-preview-ui-scale, 1));
        transform: translateY(-50%) scale(var(--yc-preview-ui-scale, 1));
        transform-origin: left center;
        height: 22px;
        display: inline-flex;
        align-items: stretch;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 4px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.08);
      }

      .yc-preview-mode-row .yc-preview-mode-switch {
        position: relative;
        top: auto;
        left: auto;
        transform: scale(var(--yc-preview-ui-scale, 1));
        transform-origin: left center;
      }

      .yc-preview-mode-controls .yc-preview-mode-switch {
        transform: none;
      }

      .yc-preview-key-badge {
        position: relative;
        top: auto;
        right: auto;
        margin-left: auto;
        transform: scale(var(--yc-preview-ui-scale, 1));
        transform-origin: right center;
        box-sizing: border-box;
        flex: 0 0 82px;
        width: 82px;
        height: 22px;
        min-width: 82px;
        padding: 0 3px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.9);
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
      }

      .yc-preview-key-badge[data-yc-empty="true"] {
        display: none;
      }

      .yc-preview-key-badge[data-yc-transposed="true"] {
        background: rgba(245, 158, 11, 0.24);
        border-color: rgba(245, 158, 11, 0.58);
        color: #fcd34d;
      }

      .yc-preview-key-badge .yc-key-transpose-btn {
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

      .yc-preview-key-badge .yc-key-transpose-btn:hover {
        background: rgba(33, 150, 243, 0.16);
        color: #0b6cb8;
      }

      .yc-preview-key-badge .yc-key-transpose-btn:active {
        transform: scale(0.94);
      }

      .yc-preview-key-badge .yc-key-label {
        min-width: 42px;
        text-align: center;
        pointer-events: none;
      }

      .yc-preview-mode-row .yc-preview-key-badge {
        margin-left: 0;
        margin-right: 0;
        transform-origin: left center;
      }

      .yc-preview-mode-controls .yc-preview-key-badge {
        transform: none;
      }

      .yc-preview-mode-btn {
        box-sizing: border-box;
        width: 20px;
        min-width: 20px;
        padding: 0;
        border: 0;
        border-right: 1px solid rgba(255, 255, 255, 0.22);
        background: transparent;
        color: rgba(255, 255, 255, 0.9);
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s ease, color 0.15s ease;
      }

      .yc-preview-mode-btn:last-child {
        border-right: 0;
      }

      .yc-preview-mode-btn.yc-easy-key-btn.yc-easy-key-active {
        background: rgba(245, 158, 11, 0.34);
        color: #fff7c2;
        box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.55);
      }
      
      .yc-preview-info-btn:hover {
        background: rgba(62, 166, 255, 0.24);
        border-color: rgba(62, 166, 255, 0.45);
      }

      .yc-preview-edits-btn:hover {
        background: rgba(62, 166, 255, 0.24);
        border-color: rgba(62, 166, 255, 0.45);
      }

      .yc-preview-options-btn:hover {
        background: rgba(62, 166, 255, 0.24);
        border-color: rgba(62, 166, 255, 0.45);
      }

      .yc-preview-instrument-btn:hover {
        background: rgba(62, 166, 255, 0.24);
        border-color: rgba(62, 166, 255, 0.45);
        color: #4dd0e1;
      }

      .yc-preview-mode-btn:hover {
        background: rgba(62, 166, 255, 0.24);
        color: #4dd0e1;
      }

      .yc-preview-mode-btn.yc-mode-selected {
        background: rgba(62, 166, 255, 0.24);
        color: #4dd0e1;
      }

      .yc-preview-edits-btn.yc-edits-active:hover,
      .yc-preview-edits-btn.yc-edits-threshold-mismatch:hover {
        background: rgba(245, 158, 11, 0.2);
        border-color: rgba(245, 158, 11, 0.58);
        color: #f59e0b;
      }

      .yc-preview-info-btn.yc-info-open {
        background: rgba(62, 166, 255, 0.24);
        border-color: rgba(52, 149, 233, 0.85);
      }

      .yc-preview-edits-btn.yc-edits-open {
        background: rgba(62, 166, 255, 0.24);
        border-color: rgba(52, 149, 233, 0.85);
      }

      .yc-preview-options-btn.yc-options-open {
        background: rgba(62, 166, 255, 0.24);
        border-color: rgba(52, 149, 233, 0.85);
        color: #4dd0e1;
      }

      .yc-preview-instrument-btn.yc-instrument-open {
        background: rgba(62, 166, 255, 0.24);
        border-color: rgba(52, 149, 233, 0.85);
        color: #4dd0e1;
      }

      .yc-preview-edits-btn.yc-edits-none {
        color: rgba(165, 165, 165, 0.88) !important;
        border-color: rgba(150, 150, 150, 0.32) !important;
        background: rgba(255, 255, 255, 0.05) !important;
      }

      .yc-preview-edits-btn.yc-edits-threshold-mismatch {
        color: #f59e0b !important;
        border-color: rgba(245, 158, 11, 0.5) !important;
        background: rgba(245, 158, 11, 0.14) !important;
      }

      /* ========================================
         GRID CONTAINER (SCALABLE)
         ======================================== */
      .yc-preview-grid-container {
        padding: 8px;
        padding-top: 0;
        transition: transform 0.3s ease;
        transform-origin: top center;
      }

      /* Grid Layout */
      .yc-preview-grid {
        display: grid;
        grid-template-columns: repeat(2, 84px);
        gap: 14px 20px;
        padding: 0;
        padding-bottom: 400px; /* Allow scrolling even at the end */
        justify-content: center;
        margin-left: -10px;
      }

      .yc-preview-grid.yc-preview-virtualized {
        display: block;
        position: relative;
        width: 100%;
        margin-left: 0;
        padding-bottom: 0;
        min-height: 0;
      }

      .yc-preview-virtual-row {
        position: absolute;
        left: 50%;
        width: 188px;
        display: grid;
        grid-template-columns: repeat(2, 84px);
        column-gap: 20px;
        align-items: start;
        transform: translateX(-50%);
        overflow: visible;
      }

      /* Chord Tile */
      .yc-preview-chord {
        position: relative;
        overflow: visible;
        width: 84px;
        height: 128px;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        background: #fff;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.2s ease;
        user-select: none;
      }

      /* Default position: aligned with short chord names. Long names opt into time-row controls. */
      .yc-preview-chord svg .chord-arrows-counter {
        transform: translateY(-6px);
        font-size: 12px !important;
      }
      
      /* Larger font for arrows and move them (X=horizontal, Y=vertical) */
      .yc-preview-chord svg .chord-arrow-left {
        font-size: 12px !important;
        transform: translate(-17px, -5px);
      }
      
      .yc-preview-chord svg .chord-arrow-right {
        font-size: 12px !important;
        transform: translate(-12px, -5px);
      }
      
      /* Larger font for position counter and move it (X=horizontal, Y=vertical) */
      .yc-preview-chord svg .chord-position-counter {
        font-size: 12px !important;
        transform: translate(18px, -5px);
      }

      .yc-preview-chord.yc-position-controls-time-row svg .chord-arrows-counter {
        transform: translateY(14px);
      }

      .yc-preview-chord.yc-position-controls-time-row svg .chord-arrow-left {
        transform: translate(-17px, 14px);
      }

      .yc-preview-chord.yc-position-controls-time-row svg .chord-arrow-right {
        transform: translate(-12px, 14px);
      }

      .yc-preview-chord.yc-position-controls-time-row svg .chord-position-counter {
        transform: translate(18px, 14px);
      }

      .yc-preview-chord:hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      }

      .yc-preview-chord:focus {
        outline: 2px solid #2f7bff;
        outline-offset: 2px;
      }

      /* Active Chord Highlight */
      .yc-preview-chord.active {
        border: 1px solid #2196F3 !important;
        box-shadow: inset 0 0 0 2.5px #2196F3;
        position: relative;
        z-index: 1;
      }

      .yc-preview-chord.yc-edit-preview {
        box-shadow: none;
        border: 3px solid #f59e0b !important;
      }

      .yc-preview-chord.yc-remove-preview {
        box-shadow: none;
        border: 3px solid #ef4444 !important;
      }

      .yc-preview-chord.yc-timing-preview {
        box-shadow: none;
        border-width: 3px !important;
        border-style: solid !important;
      }

      .yc-preview-chord.yc-timing-preview-before {
        border-color: #f59e0b !important;
      }

      .yc-preview-chord.yc-timing-preview-current {
        border-color: #38bdf8 !important;
      }

      .yc-preview-chord.yc-timing-preview-after {
        border-color: #22c55e !important;
      }

      .yc-preview-chord.yc-timing-preview::after {
        content: attr(data-yc-timing-role-label);
        position: absolute;
        top: 22px;
        left: 2px;
        transform: none;
        z-index: 16;
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

      .yc-preview-chord.yc-timing-preview-before::after {
        background: #f59e0b;
      }

      .yc-preview-chord.yc-timing-preview-current::after {
        background: #0284c7;
      }

      .yc-preview-chord.yc-timing-preview-after::after {
        background: #16a34a;
      }

      .yc-preview-chord.yc-split-added {
        border-color: #38bdf8 !important;
        box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.75);
      }

      .yc-preview-chord.yc-split-added[data-yc-split-side="before"] {
        background-image:
          linear-gradient(135deg, #f97316 0 7px, transparent 7px),
          linear-gradient(225deg, #f97316 0 7px, transparent 7px),
          linear-gradient(45deg, #f97316 0 7px, transparent 7px),
          linear-gradient(315deg, #f97316 0 7px, transparent 7px);
        background-position: top left, top right, bottom left, bottom right;
        background-size: 14px 14px;
        background-repeat: no-repeat;
      }

      .yc-preview-chord.yc-split-added[data-yc-split-side="after"] {
        background-image:
          linear-gradient(135deg, #22c55e 0 7px, transparent 7px),
          linear-gradient(225deg, #22c55e 0 7px, transparent 7px),
          linear-gradient(45deg, #22c55e 0 7px, transparent 7px),
          linear-gradient(315deg, #22c55e 0 7px, transparent 7px);
        background-position: top left, top right, bottom left, bottom right;
        background-size: 14px 14px;
        background-repeat: no-repeat;
      }

      .yc-preview-chord-actions {
        position: absolute;
        left: 1px;
        right: 1px;
        bottom: 1px;
        height: 15px;
        display: block;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.12s ease;
        z-index: 12;
      }

      .yc-preview-chord:hover .yc-preview-chord-actions,
      .yc-preview-chord-actions:hover,
      .yc-preview-chord-actions:focus-within {
        opacity: 1;
        pointer-events: auto;
      }

      .yc-preview-chord-action-btn {
        border: 1px solid rgba(0, 0, 0, 0.24);
        border-radius: 4px;
        height: 15px;
        min-width: 17px;
        padding: 0 3px;
        font-size: 8px;
        font-weight: 700;
        line-height: 1;
        position: absolute;
        bottom: 0;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.9);
        color: #111;
        transition: background-color 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
      }

      .yc-preview-chord-action-btn:hover {
        background: #ffffff;
        border-color: #8a8f98;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.14);
      }

      .yc-preview-chord-action-edit {
        color: #0ea5e9;
        left: 0;
      }

      .yc-preview-chord-action-edit:hover {
        border-color: #7dd3fc;
        background: #eef8ff;
      }

      .yc-preview-chord-action-time {
        color: #16a34a;
        left: 50%;
        transform: translateX(-50%);
      }

      .yc-preview-chord-action-time:hover {
        border-color: #86efac;
        background: #f0fdf4;
      }

      .yc-preview-chord-action-remove {
        color: #ef4444;
        right: 0;
        min-width: 15px;
        padding: 0;
      }

      .yc-preview-chord-action-remove:hover {
        border-color: #fda4af;
        background: #fff1f2;
      }

      .yc-preview-chord-actions.hide-edit .yc-preview-chord-action-edit,
      .yc-preview-chord-actions.hide-edit .yc-preview-chord-action-time {
        display: none;
      }

      .yc-preview-chord-actions.hide-remove .yc-preview-chord-action-remove {
        display: none;
      }

      /* Chord Name */
      .yc-preview-chord-name {
        font-weight: 700;
        font-size: 14px;
        margin-bottom: 4px;
        color: #111;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      /* Chord Time (under name, no layout shift) */
      .yc-preview-chord-time {
        position: absolute;
        top: 22px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 11px;
        font-weight: 600;
        line-height: 1;
        color: #6b6b6b;
        font-family: sans-serif;
        white-space: nowrap;
        pointer-events: none;
        z-index: 3;
      }

      /* Diagram Container */
      .yc-preview-chord-diagram {
        width: 100%;
        height: 78px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
      }
      
      /* Scale up the entire SVG diagram */
      .yc-preview-chord-diagram svg {
        transform: scaleX(1.5) scaleY(1.3);
        transform-origin: center center;
      }

      /* But keep arrows and counter at original size */
      .yc-preview-chord-diagram svg .chord-arrows-counter {
        transform: scale(0.769) translateY(-6px); /* 0.769 = 1/1.3 to cancel parent scale */
      }
      
      .yc-preview-chord-diagram svg .chord-arrow-left {
        transform: scale(0.769) translate(-3px, 0px);
      }
      
      .yc-preview-chord-diagram svg .chord-arrow-right {
        transform: scale(0.769) translate(2px, 0px);
      }
      
      .yc-preview-chord-diagram svg .chord-position-counter {
        transform: scale(0.769) translate(20px, 0px);
      }
      
      /* Move global position globe left in Preview */
      .yc-preview-chord-diagram svg .global-position-globe {
        transform: translateX(-1px);
      }

      .yc-preview-chord.yc-position-controls-time-row .yc-preview-chord-diagram svg .chord-arrows-counter {
        transform: scale(0.769) translateY(14px);
      }

      .yc-preview-chord.yc-position-controls-time-row .yc-preview-chord-diagram svg .chord-arrow-left {
        transform: scale(0.769) translate(-3px, 14px);
      }

      .yc-preview-chord.yc-position-controls-time-row .yc-preview-chord-diagram svg .chord-arrow-right {
        transform: scale(0.769) translate(2px, 14px);
      }

      .yc-preview-chord.yc-position-controls-time-row .yc-preview-chord-diagram svg .chord-position-counter {
        transform: scale(0.769) translate(20px, 14px);
      }

      .yc-preview-chord.yc-position-controls-time-row .yc-preview-chord-diagram svg .global-position-globe {
        transform: translate(-1px, 14px);
      }

      /* Hide arrows and globe by default */
      .yc-preview-chord svg .chord-arrow-left,
      .yc-preview-chord svg .chord-arrow-right,
      .yc-preview-chord svg .global-position-globe {
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      /* Show arrows and globe on panel hover */
      .yc-preview-panel:hover .chord-arrow-left,
      .yc-preview-panel:hover .chord-arrow-right,
      .yc-preview-panel:hover .global-position-globe {
        opacity: 1;
      }

      /* Larger font for fret number in Preview (black text, normal weight) */
      .yc-preview-chord svg text[fill="#000"][font-weight="normal"] {
        font-size: 11px !important;
      }

      /* Larger circles for finger positions in Preview */
      .yc-preview-chord svg circle[fill="#000"] {
        r: 3.3 !important;
      }

      /* Larger font for finger numbers in Preview (white text, bold) */
      .yc-preview-chord svg text[fill="#fff"][font-weight="bold"] {
        font-size: 6px !important;
      }

      /* Preview Label */
      .yc-preview-chord-label {
        margin-top: 2px;
        font-size: 10px;
        color: #6b7280;
        text-align: center;
      }

      /* Empty State */
      .yc-preview-empty {
        padding: 20px;
        text-align: center;
        color: #6b7280;
        font-size: 14px;
        grid-column: 1 / -1;
      }

      /* Custom Scrollbar */
      .yc-preview-panel::-webkit-scrollbar {
        width: 6px;
      }

      .yc-preview-panel::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 3px;
      }

      .yc-preview-panel::-webkit-scrollbar-thumb {
        background: #c1c1c1;
        border-radius: 3px;
        transition: background 0.2s ease;
      }

      .yc-preview-panel::-webkit-scrollbar-thumb:hover {
        background: #a8a8a8;
      }

      /* ========================================
         THEME SUPPORT - SEPIA & BLACK
         ======================================== */
      
      /* SEPIA Theme */
      .yc-preview-panel.yc-preview-sepia {
        background: #f9f9f9;
        border-color: #d4c4a8;
      }

      /* SEPIA - Size Control (when class is on panel OR on size control itself) */
      .yc-preview-panel.yc-preview-sepia .yc-preview-size-control,
      .yc-preview-size-control.yc-preview-sepia {
        background: #f9f9f9 !important;
        border: 1px solid #d4c4a8 !important;
        border-bottom: 2px solid #d4c4a8 !important;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-size-label,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-size-label {
        color: #2c2c2c !important;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-size-btn,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-size-btn {
        background-color: #d4c4a8 !important;
        color: #2c2c2c !important;
        border: 1px solid #c4b49a !important;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-size-btn:hover,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-size-btn:hover {
        background-color: #c4b49a !important;
        border-color: #c4b49a !important;
      }

      /* Close button sepia theme */
      .yc-preview-panel.yc-preview-sepia .yc-preview-close-btn,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-close-btn {
        color: #2c2c2c !important;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-info-btn,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-info-btn,
      .yc-preview-panel.yc-preview-sepia .yc-preview-edits-btn,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-edits-btn,
      .yc-preview-panel.yc-preview-sepia .yc-preview-options-btn,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-options-btn,
      .yc-preview-panel.yc-preview-sepia .yc-preview-mode-switch,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-mode-switch,
      .yc-preview-panel.yc-preview-sepia .yc-preview-mode-btn,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-mode-btn {
        color: #2c2c2c !important;
        background: #e8e2d5 !important;
        border-color: #d4c4a8 !important;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-close-btn:hover,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-close-btn:hover {
        background-color: #c4b49a !important;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-info-btn:hover,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-info-btn:hover,
      .yc-preview-panel.yc-preview-sepia .yc-preview-edits-btn:hover,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-edits-btn:hover,
      .yc-preview-panel.yc-preview-sepia .yc-preview-options-btn:hover,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-options-btn:hover,
      .yc-preview-panel.yc-preview-sepia .yc-preview-mode-btn:hover,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-mode-btn:hover {
        background-color: #c4b49a !important;
        border-color: #b7a78e !important;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-size-value,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-size-value {
        background-color: #e8e2d5 !important;
        border: 1px solid #d4c4a8 !important;
        color: #2c2c2c !important;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-chord {
        background: #fafafa;
        border-color: #d4c4a8;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-chord:hover {
        background: #e8e8e8;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-chord-name {
        background: #fafafa;
        color: #2c2c2c;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-chord:hover .yc-preview-chord-name {
        background: #e8e8e8;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-chord-diagram {
        background: #fafafa;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-chord:hover .yc-preview-chord-diagram {
        background: #e8e8e8;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-empty {
        color: #6b6b6b;
      }

      .yc-preview-panel.yc-preview-sepia::-webkit-scrollbar-track {
        background: #fafafa;
      }

      .yc-preview-panel.yc-preview-sepia::-webkit-scrollbar-thumb {
        background: #d4c4a8;
      }

      /* BLACK Theme */
      .yc-preview-panel.yc-preview-black {
        background: rgba(11, 32, 49);  /* כחול-שחור כהה - תואם לפאנל הראשי */
        border-color: #000000;
      }

      /* ========================================
         BLACK THEME - SIZE CONTROL
         עיצוב חדש מאפס - זהה לפאנל הראשי
         ======================================== */
      
      /* רקע של SIZE CONTROL - כהה כמו הפאנל */
      .yc-preview-size-control.yc-preview-black {
        background: rgba(11, 32, 49, 0.98) !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        border-bottom: 2px solid rgba(255, 255, 255, 0.1) !important;
      }

      /* טקסט SIZE - לבן */
      .yc-preview-size-control.yc-preview-black .yc-preview-size-label {
        color: #ffffff !important;
      }

      /* כפתורים - + ו- - כחול שקוף */
      .yc-preview-size-control.yc-preview-black .yc-preview-size-btn {
        background: rgba(62, 166, 255, 0.2) !important;
        border: 1px solid rgba(62, 166, 255, 0.3) !important;
        color: #ffffff !important;
      }

      /* כפתורים hover - כחול יותר בהיר */
      .yc-preview-size-control.yc-preview-black .yc-preview-size-btn:hover {
        background: rgba(62, 166, 255, 0.4) !important;
        border-color: rgba(62, 166, 255, 0.6) !important;
      }

      /* תצוגת ערך 1.00 - שחור שקוף */
      .yc-preview-size-control.yc-preview-black .yc-preview-size-value {
        background: rgba(0, 0, 0, 0.2) !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        color: #ffffff !important;
      }

      .yc-preview-size-control.yc-preview-black .yc-preview-info-btn,
      .yc-preview-size-control.yc-preview-black .yc-preview-edits-btn,
      .yc-preview-size-control.yc-preview-black .yc-preview-options-btn,
      .yc-preview-size-control.yc-preview-black .yc-preview-mode-switch,
      .yc-preview-size-control.yc-preview-black .yc-preview-mode-btn {
        color: rgba(255, 255, 255, 0.9) !important;
        background: rgba(255, 255, 255, 0.08) !important;
        border-color: rgba(255, 255, 255, 0.22) !important;
      }

      .yc-preview-size-control.yc-preview-black .yc-preview-info-btn:hover,
      .yc-preview-size-control.yc-preview-black .yc-preview-edits-btn:hover,
      .yc-preview-size-control.yc-preview-black .yc-preview-options-btn:hover,
      .yc-preview-size-control.yc-preview-black .yc-preview-mode-btn:hover {
        background: rgba(62, 166, 255, 0.24) !important;
        border-color: rgba(62, 166, 255, 0.45) !important;
      }

      .yc-preview-panel.yc-preview-black .yc-preview-chord {
        background: #fafafa;
        border-color: #d4c4a8;
      }

      .yc-preview-panel.yc-preview-black .yc-preview-chord:hover {
        background: #e8e8e8;
      }

      .yc-preview-panel.yc-preview-black .yc-preview-chord-name {
        background: #fafafa;
        color: #2c2c2c;
      }

      .yc-preview-panel.yc-preview-black .yc-preview-chord:hover .yc-preview-chord-name {
        background: #e8e8e8;
      }

      .yc-preview-panel.yc-preview-black .yc-preview-chord-diagram {
        background: #fafafa;
      }

      .yc-preview-panel.yc-preview-black .yc-preview-chord:hover .yc-preview-chord-diagram {
        background: #e8e8e8;
      }

      .yc-preview-panel.yc-preview-black .yc-preview-empty {
        color: #6b6b6b;
      }

      .yc-preview-panel.yc-preview-black::-webkit-scrollbar-track {
        background: #3a3a3a;
      }

      .yc-preview-panel.yc-preview-black::-webkit-scrollbar-thumb {
        background: #5a5a5a;
      }

      /* ========================================
         LIGHT THEME - עיצוב בהיר ונקי
         ======================================== */
      
      .yc-preview-panel.yc-preview-light {
        background: #f9f9f9;
        border-color: #000000; /* שחור */
      }

      /* LIGHT - Size Control */
      .yc-preview-panel.yc-preview-light .yc-preview-size-control,
      .yc-preview-size-control.yc-preview-light {
        background: #ffffff !important;
        border: 1px solid #e5e7eb !important;
        border-bottom: 2px solid #e5e7eb !important;
      }

      .yc-preview-panel.yc-preview-light .yc-preview-size-label,
      .yc-preview-size-control.yc-preview-light .yc-preview-size-label {
        color: #333333 !important;
      }

      .yc-preview-panel.yc-preview-light .yc-preview-size-btn,
      .yc-preview-size-control.yc-preview-light .yc-preview-size-btn {
        background-color: #e5e7eb !important;
        color: #333333 !important;
        border: 1px solid #d1d5db !important;
      }

      .yc-preview-panel.yc-preview-light .yc-preview-size-btn:hover,
      .yc-preview-size-control.yc-preview-light .yc-preview-size-btn:hover {
        background-color: #d1d5db !important;
        border-color: #d1d5db !important;
      }

      /* Close button light theme */
      .yc-preview-panel.yc-preview-light .yc-preview-close-btn,
      .yc-preview-size-control.yc-preview-light .yc-preview-close-btn {
        color: #333333 !important;
      }

      .yc-preview-panel.yc-preview-light .yc-preview-info-btn,
      .yc-preview-size-control.yc-preview-light .yc-preview-info-btn,
      .yc-preview-panel.yc-preview-light .yc-preview-edits-btn,
      .yc-preview-size-control.yc-preview-light .yc-preview-edits-btn,
      .yc-preview-panel.yc-preview-light .yc-preview-options-btn,
      .yc-preview-size-control.yc-preview-light .yc-preview-options-btn,
      .yc-preview-panel.yc-preview-light .yc-preview-mode-switch,
      .yc-preview-size-control.yc-preview-light .yc-preview-mode-switch,
      .yc-preview-panel.yc-preview-light .yc-preview-mode-btn,
      .yc-preview-size-control.yc-preview-light .yc-preview-mode-btn {
        color: #333333 !important;
        background: #ffffff !important;
        border-color: #d1d5db !important;
      }

      .yc-preview-panel.yc-preview-light .yc-preview-close-btn:hover,
      .yc-preview-size-control.yc-preview-light .yc-preview-close-btn:hover {
        background-color: #e5e7eb !important;
      }

      .yc-preview-panel.yc-preview-light .yc-preview-info-btn:hover,
      .yc-preview-size-control.yc-preview-light .yc-preview-info-btn:hover,
      .yc-preview-panel.yc-preview-light .yc-preview-edits-btn:hover,
      .yc-preview-size-control.yc-preview-light .yc-preview-edits-btn:hover,
      .yc-preview-panel.yc-preview-light .yc-preview-options-btn:hover,
      .yc-preview-size-control.yc-preview-light .yc-preview-options-btn:hover,
      .yc-preview-panel.yc-preview-light .yc-preview-mode-btn:hover,
      .yc-preview-size-control.yc-preview-light .yc-preview-mode-btn:hover {
        background-color: #e5e7eb !important;
        border-color: #c7cdd6 !important;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-key-badge,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-key-badge {
        color: #2c2c2c !important;
        background: #e8e2d5 !important;
        border-color: #d4c4a8 !important;
      }

      .yc-preview-panel.yc-preview-light .yc-preview-key-badge,
      .yc-preview-size-control.yc-preview-light .yc-preview-key-badge {
        color: #333333 !important;
        background: #ffffff !important;
        border-color: #d1d5db !important;
      }

      .yc-preview-size-control.yc-preview-black .yc-preview-key-badge {
        color: rgba(255, 255, 255, 0.9) !important;
        background: rgba(255, 255, 255, 0.08) !important;
        border-color: rgba(255, 255, 255, 0.22) !important;
      }

      .yc-preview-panel.yc-preview-sepia .yc-key-transpose-btn:hover,
      .yc-preview-size-control.yc-preview-sepia .yc-key-transpose-btn:hover {
        color: #2c2c2c !important;
        background-color: #c4b49a !important;
      }

      .yc-preview-panel.yc-preview-light .yc-key-transpose-btn:hover,
      .yc-preview-size-control.yc-preview-light .yc-key-transpose-btn:hover {
        color: #111827 !important;
        background-color: #e5e7eb !important;
      }

      .yc-preview-size-control.yc-preview-black .yc-key-transpose-btn:hover {
        color: #ffffff !important;
        background: rgba(62, 166, 255, 0.24) !important;
      }

      .yc-preview-size-control .yc-preview-key-badge[data-yc-transposed="true"],
      .yc-preview-panel .yc-preview-key-badge[data-yc-transposed="true"] {
        color: #92400e !important;
        background: rgba(245, 158, 11, 0.22) !important;
        border-color: rgba(245, 158, 11, 0.62) !important;
      }

      .yc-preview-size-control.yc-preview-black .yc-preview-key-badge[data-yc-transposed="true"] {
        color: #fcd34d !important;
        background: rgba(245, 158, 11, 0.24) !important;
        border-color: rgba(245, 158, 11, 0.58) !important;
      }

      /* Keep Info button visually identical to hover while Chord Info popup is open */
      .yc-preview-size-control .yc-preview-info-btn.yc-info-open,
      .yc-preview-panel .yc-preview-info-btn.yc-info-open {
        background: rgba(62, 166, 255, 0.24) !important;
        border-color: rgba(52, 149, 233, 0.85) !important;
      }

      .yc-preview-size-control .yc-preview-edits-btn.yc-edits-open,
      .yc-preview-panel .yc-preview-edits-btn.yc-edits-open {
        background: rgba(62, 166, 255, 0.24) !important;
        border-color: rgba(52, 149, 233, 0.85) !important;
      }

      .yc-preview-size-control .yc-preview-options-btn.yc-options-open,
      .yc-preview-panel .yc-preview-options-btn.yc-options-open {
        background: rgba(62, 166, 255, 0.24) !important;
        border-color: rgba(52, 149, 233, 0.85) !important;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-info-btn.yc-info-open,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-info-btn.yc-info-open {
        background-color: #c4b49a !important;
        border-color: rgba(52, 149, 233, 0.85) !important;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-edits-btn.yc-edits-open,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-edits-btn.yc-edits-open {
        background-color: #c4b49a !important;
        border-color: rgba(52, 149, 233, 0.85) !important;
      }

      .yc-preview-panel.yc-preview-sepia .yc-preview-options-btn.yc-options-open,
      .yc-preview-size-control.yc-preview-sepia .yc-preview-options-btn.yc-options-open {
        background-color: #c4b49a !important;
        border-color: rgba(52, 149, 233, 0.85) !important;
      }

      .yc-preview-size-control.yc-preview-black .yc-preview-info-btn.yc-info-open,
      .yc-preview-size-control.yc-preview-black .yc-preview-edits-btn.yc-edits-open,
      .yc-preview-size-control.yc-preview-black .yc-preview-options-btn.yc-options-open {
        background: rgba(62, 166, 255, 0.24) !important;
        border-color: rgba(52, 149, 233, 0.85) !important;
      }

      .yc-preview-panel.yc-preview-light .yc-preview-info-btn.yc-info-open,
      .yc-preview-size-control.yc-preview-light .yc-preview-info-btn.yc-info-open {
        background-color: #e5e7eb !important;
        border-color: rgba(52, 149, 233, 0.85) !important;
      }

      .yc-preview-panel.yc-preview-light .yc-preview-edits-btn.yc-edits-open,
      .yc-preview-size-control.yc-preview-light .yc-preview-edits-btn.yc-edits-open {
        background-color: #e5e7eb !important;
        border-color: rgba(52, 149, 233, 0.85) !important;
      }

      .yc-preview-panel.yc-preview-light .yc-preview-options-btn.yc-options-open,
      .yc-preview-size-control.yc-preview-light .yc-preview-options-btn.yc-options-open {
        background-color: #e5e7eb !important;
        border-color: rgba(52, 149, 233, 0.85) !important;
      }

      .yc-preview-size-control .yc-preview-edits-btn.yc-edits-threshold-mismatch,
      .yc-preview-panel .yc-preview-edits-btn.yc-edits-threshold-mismatch {
        color: #f59e0b !important;
        border-color: rgba(245, 158, 11, 0.5) !important;
        background: rgba(245, 158, 11, 0.14) !important;
      }

      .yc-preview-size-control .yc-preview-edits-btn.yc-edits-active:hover,
      .yc-preview-panel .yc-preview-edits-btn.yc-edits-active:hover,
      .yc-preview-size-control .yc-preview-edits-btn.yc-edits-threshold-mismatch:hover,
      .yc-preview-panel .yc-preview-edits-btn.yc-edits-threshold-mismatch:hover {
        color: #f59e0b !important;
        border-color: rgba(245, 158, 11, 0.58) !important;
        background: rgba(245, 158, 11, 0.2) !important;
      }

      .yc-preview-size-control .yc-preview-mode-btn.yc-mode-selected,
      .yc-preview-panel .yc-preview-mode-btn.yc-mode-selected {
        color: #4dd0e1 !important;
        border-color: rgba(52, 149, 233, 0.85) !important;
        background: rgba(62, 166, 255, 0.24) !important;
      }

      .yc-preview-size-control .yc-preview-mode-btn.yc-easy-key-btn.yc-easy-key-active,
      .yc-preview-panel .yc-preview-mode-btn.yc-easy-key-btn.yc-easy-key-active {
        color: #7c2d12 !important;
        border-color: rgba(245, 158, 11, 0.68) !important;
        background: rgba(245, 158, 11, 0.34) !important;
        box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.45);
      }

      .yc-preview-panel.yc-preview-light .yc-preview-size-value,
      .yc-preview-size-control.yc-preview-light .yc-preview-size-value {
        background-color: #ffffff !important;
        border: 1px solid #e5e7eb !important;
        color: #333333 !important;
      }

      .yc-preview-panel.yc-preview-light .yc-preview-chord {
        background: #ffffff;
        border-color: #000000; /* שחור - כמו שביקשת */
      }

      .yc-preview-panel.yc-preview-light .yc-preview-chord:hover {
        background: #f3f4f6;
      }

      .yc-preview-panel.yc-preview-light .yc-preview-chord-name {
        background: #ffffff;
        color: #000000; /* שחור - כמו שביקשת */
      }

      .yc-preview-panel.yc-preview-light .yc-preview-chord:hover .yc-preview-chord-name {
        background: #f3f4f6;
      }

      .yc-preview-panel.yc-preview-light .yc-preview-chord-diagram {
        background: #ffffff;
      }

      .yc-preview-panel.yc-preview-light .yc-preview-chord:hover .yc-preview-chord-diagram {
        background: #f3f4f6;
      }

      .yc-preview-panel.yc-preview-light .yc-preview-empty {
        color: #666666;
      }

      .yc-preview-panel.yc-preview-light::-webkit-scrollbar-track {
        background: #f9f9f9;
      }

      .yc-preview-panel.yc-preview-light::-webkit-scrollbar-thumb {
        background: #d1d5db;
      }

      /* ========================================
         BEAT GRID - Progress Bar Squares
         ======================================== */
      
      .yc-preview-beat-grid {
        position: absolute;
        bottom: 100%;
        margin-bottom: 4px;
        left: 50%;
        transform: translateX(-50%);
        display: grid;
        grid-template-columns: repeat(10, 1fr);
        gap: 1px;
        background: #e0e0e0;
        padding: 2px;
        border-radius: 2px;
        pointer-events: none;
        z-index: 15;
      }
      
      .yc-preview-beat-cell {
        width: 6px;
        height: 12px;
        background-color: #bdbdbd;
        border-radius: 0;
        transition: background-color 0.1s ease;
        image-rendering: crisp-edges;
        image-rendering: -moz-crisp-edges;
        image-rendering: pixelated;
      }
      
      .yc-preview-beat-cell.filled {
        background-color: #2196f3;
      }
      
      .yc-preview-chord.active .yc-preview-beat-cell.filled {
        background-color: #2196f3;
      }

      /* Theme Support for Beat Grid */
      /* SEPIA uses default (light) colors - no override needed */

      .yc-preview-panel.yc-preview-black .yc-preview-beat-grid {
        background: rgba(255, 255, 255, 0.1);
      }
      
      .yc-preview-panel.yc-preview-black .yc-preview-beat-cell {
        background-color: rgba(255, 255, 255, 0.2);
      }
      
      .yc-preview-panel.yc-preview-black .yc-preview-beat-cell.filled {
        background-color: #2196f3;
      }

      /* RTL Support - Beat Grid rows start from right in RTL mode */
      .yc-preview-panel.yc-preview-rtl .yc-preview-beat-grid {
        direction: rtl;
      }
    `;
    document.head.appendChild(style);
    DEBUG && console.log("[PreviewPanel] CSS injected");
  }

  /*============================================================================
    UTILITY FUNCTIONS
  ============================================================================*/

  /**
   * Debounce function to limit how often a function can be called
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} Debounced function
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  function formatPreviewTime(seconds) {
    const safe = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0;
    const mins = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  /*============================================================================
    PAGE WIDTH MANAGER CLASS
  ============================================================================*/
  class PageWidthManager {
    constructor() {
      this.SAFE_MARGIN = 0; // No gap - preview stops right at the edge
    }

    /**
     * Expands page width to accommodate main panel in RTL mode
     * @param {number} mainPanelWidth - Current main panel width
     * @param {number} previewWidth - Preview panel width
     */
    expandPageForRTL(mainPanelWidth, previewWidth) {
      const requiredWidth = mainPanelWidth + previewWidth + this.SAFE_MARGIN;
      const viewportWidth = window.innerWidth;

      if (requiredWidth > viewportWidth) {
        const pageContainer = this._findPageContainer();
        if (pageContainer) {
          pageContainer.style.minWidth = `${requiredWidth}px`;
          pageContainer.setAttribute("data-yc-rtl-expanded", "true");

          DEBUG &&
            console.log("[PreviewPanel] 📏 Expanded page width for RTL", {
              requiredWidth,
              viewportWidth,
              mainPanelWidth,
              previewWidth,
            });
        }
      }
    }

    /**
     * Resets page width to original state
     */
    resetPageWidth() {
      const pageContainer = this._findPageContainer();
      if (pageContainer && pageContainer.hasAttribute("data-yc-rtl-expanded")) {
        pageContainer.style.minWidth = "";
        pageContainer.removeAttribute("data-yc-rtl-expanded");

        DEBUG && console.log("[PreviewPanel] ↩️ Reset page width");
      }
    }

    /**
     * Finds the main page container element
     * @returns {HTMLElement|null}
     */
    _findPageContainer() {
      const selectors = [
        "#page-manager",
        "#content",
        "#container",
        "#main",
        "ytd-app",
        "body",
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          DEBUG &&
            console.log(`[PreviewPanel] 🎯 Found page container: ${selector}`);
          return element;
        }
      }

      DEBUG && console.warn("[PreviewPanel] ⚠️ No page container found");
      return null;
    }
  }

  /*============================================================================
    POSITION CALCULATOR CLASS
  ============================================================================*/
  class PositionCalculator {
    constructor() {
      this.SAFE_MARGIN = 0; // No gap - preview stops right at the edge
    }

    /**
     * Calculates if Preview Panel needs anchoring in RTL mode
     * @param {DOMRect} panelRect - Main panel bounding rect
     * @param {number} previewWidth - Preview panel width
     * @param {number} gap - Gap between panels
     * @returns {Object} { needsAnchor: boolean, position: number, mode: string }
     */
    calculateRTLPosition(panelRect, previewWidth, gap) {
      const viewportWidth = window.innerWidth;

      // Calculate where the preview right edge would be if positioned relative to main panel
      const previewRight = panelRect.right + previewWidth + gap;

      // Calculate the distance from the viewport edge
      const distanceFromEdge = viewportWidth - previewRight;

      // Check if preview would exceed viewport (stop right before clipping)
      const needsAnchor = distanceFromEdge <= this.SAFE_MARGIN;

      if (needsAnchor) {
        // Anchor mode: Fixed position right at the edge (no gap)
        DEBUG &&
          console.log("[PreviewPanel] 🔒 RTL Anchor mode activated", {
            previewRight,
            viewportWidth,
            distanceFromEdge,
            margin: this.SAFE_MARGIN,
          });

        return {
          needsAnchor: true,
          position: this.SAFE_MARGIN, // Distance from right edge (0 = no gap)
          mode: "fixed",
        };
      } else {
        // Relative mode: Position next to main panel
        DEBUG &&
          console.log("[PreviewPanel] 📍 RTL Relative mode", {
            previewRight,
            viewportWidth,
            distanceFromEdge,
          });

        return {
          needsAnchor: false,
          position: panelRect.right + gap,
          mode: "absolute",
        };
      }
    }
  }

  /*============================================================================
    CHORD PREVIEW PANEL CLASS
  ============================================================================*/
  class ChordsPreviewPanel {
    constructor() {
      this.panelElement = null;
      this.gridElement = null;
      this.gridContainer = null;
      this.sizeControlElement = null;
      this.infoButtonElement = null;
      this.editsSummaryButtonElement = null;
      this.diagramOptionsButtonElement = null;
      this.diagramOptionsPopupClose = null;
      this.diagramOptionsPopupAnchor = null;
      this.diagramOptionsPopupStateUpdaters = new Set();
      this.modeSwitchElement = null;
      this.modeSwitchButtons = new Map();
      this.easyKeyButtonElement = null;
      this.estimatedKeyElement = null;
      this.estimatedKeyLabelElement = null;
      this.chords = [];
      this.currentChordName = null;
      this.currentChordTime = null;
      this.currentMode = "regular";
      this.isVisible = false;
      this.chordElements = new Map();
      this._rawChordsForEditing = [];
      this.abortController = null;
      this.panelObserver = null;
      this.resizeHandler = null;
      this.panelResizeObserver = null;
      this.videoElement = null;
      this.videoSeekingHandler = null;
      this.videoSeekedHandler = null;
      this.pendingVideoSyncRAF = null;
      this.fallbackCheckInterval = null;
      this.retryTimeoutId = null; // Track setTimeout for cleanup
      this.activeChordDirection = readPreviewActiveChordDirection();
      this._isAnchored = false; // Track if preview is in anchor mode (RTL)
      this._isUserScrolling = false; // Track if user is manually scrolling
      this._isRTL = false; // 📊 Cache RTL state to avoid querySelector in hot loop

      // 🎯 Track last active element to avoid querySelectorAll
      this._lastActiveElement = null;
      this._lastHighlightedChordIndex = -1;

      // 📊 Cache for beat grid tiles - avoid querySelectorAll on every timeUpdate
      // Array of { tile: HTMLElement, cells: HTMLElement[], index: number }
      this._beatGridTiles = [];
      this._beatGridTileByIndex = new Map();
      this._lastBeatGridActiveIndex = -1;
      this._lastBeatGridTime = null;
      this._previewBeatGridEnabled = true;
      this._diagramObserver = null;
      this._lazyDiagramContainers = new Set();
      this._virtualRows = [];
      this._virtualContentHeight = 0;
      this._rowIndexByChordIndex = new Map();
      this._renderedVirtualRows = new Map();
      this._renderedTileByIndex = new Map();
      this._virtualScrollRAF = null;
      this._usingVirtualScrolling = false;
      this._timingPreviewActive = false;

      // 🎨 Size control
      this.currentScale = 1.0;
      this.minScale = 0.5;
      this.maxScale = 1.5;
      this.scaleStep = 0.05;
      this.baseWidth = 240;
      this._appliedPreviewScale = 1.0;

      // 🧹 Track all timeouts and RAF for cleanup
      this.pendingTimeouts = new Set(); // Track all setTimeout IDs
      this.pendingRAFs = new Set(); // Track all requestAnimationFrame IDs
      this.layoutReflowTimeouts = new Set();
      this.layoutReflowRAF = null;
      this._editsSummaryRequestId = 0;
      this._refreshRequestId = 0;

      // Initialize utility classes
      this.positionCalculator = new PositionCalculator();
      this.pageWidthManager = new PageWidthManager();

      this._init();
    }

    _init() {
      injectCSS();
      this._createPanel();
      this._setupEventListeners();
      this._loadState();
      DEBUG && console.log("[PreviewPanel] ✅ Initialized");
    }

    _createPanel() {
      // Create main panel
      this.panelElement = document.createElement("div");
      this.panelElement.className = "yc-preview-panel";
      this.panelElement.setAttribute("dir", "ltr");
      this.panelElement.setAttribute("role", "region");
      this.panelElement.setAttribute("aria-label", "Chord Preview Panel");

      // Create grid container (scalable)
      this.gridContainer = document.createElement("div");
      this.gridContainer.className = "yc-preview-grid-container";

      // Create grid
      this.gridElement = document.createElement("div");
      this.gridElement.className = "yc-preview-grid";

      this.gridContainer.appendChild(this.gridElement);
      this.panelElement.appendChild(this.gridContainer);

      // Create size control header (separate element, outside panel)
      this._createSizeControl();

      // Add both to body (size control first, then panel)
      document.body.appendChild(this.sizeControlElement);
      document.body.appendChild(this.panelElement);
      this._syncAuxiliaryHeaderControls("create");

      // Set up resize listener with debouncing and RAF for smooth updates
      this.resizeHandler = debounce(() => {
        const rafId = requestAnimationFrame(() => {
          this.pendingRAFs.delete(rafId);
          if (!this.isVisible) return; // Safety check
          this._updatePosition();
        });
        this.pendingRAFs.add(rafId);
      }, 100); // 100ms debounce delay

      window.addEventListener("resize", this.resizeHandler, { passive: true });
    }

    _syncAuxiliaryHeaderControls(reason = "preview header") {
      if (!this.sizeControlElement?.isConnected) return;
      if (window.chordsAvailableForPreview === false) return;

      try {
        window.DiceIcon?.initPanel?.();
      } catch (error) {
        console.warn(`[PreviewPanel] Failed syncing Dice icon (${reason}):`, error);
      }

      try {
        window.CapoIcon?.initPanel?.();
      } catch (error) {
        console.warn(`[PreviewPanel] Failed syncing Capo icon (${reason}):`, error);
      }
    }

    _getQuickThresholdValue() {
      return normalizeQuickThreshold(window.hideQuickChordsThreshold);
    }

    _setQuickThresholdValue(value, source = "previewDiagramOptions") {
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

    async _setFretNumbersMode(value, source = "previewDiagramOptions") {
      const nextValue = normalizeFretNumbersMode(value);
      window.additionalFretNumbers = nextValue;
      try {
        await chrome.storage.sync.set({ [ADDITIONAL_FRET_NUMBERS_KEY]: nextValue });
      } catch (error) {
        console.warn("[PreviewPanel] Failed to persist fret numbers mode:", error);
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
          console.warn("[PreviewPanel] Failed updating diagram options state:", error);
        }
      });
    }

    _setDiagramOptionsOpenState(isOpen) {
      const button = this.diagramOptionsButtonElement;
      if (!button?.classList) return;
      const open = Boolean(isOpen);
      button.classList.toggle("yc-options-open", open);
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.setAttribute("aria-pressed", open ? "true" : "false");
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

      const initialPanelScale = loadPreviewPopupScaleSetting(
        PREVIEW_DISPLAY_POPUP_SCALE_KEY,
        100
      );
      const popupScaleControl = createPreviewPopupScaleControl({
        initialPercent: initialPanelScale,
        onChange: (nextPercent) => {
          savePreviewPopupScaleSetting(PREVIEW_DISPLAY_POPUP_SCALE_KEY, nextPercent);
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
        group.style.cssText = "display:flex;flex-direction:column;gap:5px;direction:ltr!important;unicode-bidi:isolate!important;text-align:left!important;";

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
        label.style.cssText = "font-size:11px;color:rgba(255,255,255,0.82);font-weight:600;text-align:left;direction:ltr!important;unicode-bidi:isolate!important;";

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
              ? "rgba(62, 166, 255, 0.26)"
              : "rgba(255, 255, 255, 0.08)";
            btn.style.borderColor = selected
              ? "rgba(62, 166, 255, 0.72)"
              : "rgba(255, 255, 255, 0.24)";
            btn.style.color = selected ? "#4dd0e1" : "rgba(255, 255, 255, 0.92)";
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

      panel.appendChild(closeButton);
      panel.appendChild(headerRow);
      panel.appendChild(createGroup(
        "Threshold",
        QUICK_THRESHOLD_OPTIONS,
        () => this._getQuickThresholdValue().toFixed(1),
        (value) => this._setQuickThresholdValue(value),
        4,
        "0.5"
      ));
      panel.appendChild(createGroup(
        "Fret Number",
        FRET_NUMBER_OPTIONS,
        () => this._getFretNumbersMode(),
        (value) => this._setFretNumbersMode(value),
        3,
        "none"
      ));
      const subtitleOffsetControl = window.ycSubtitleOffsetControls?.createControl?.({
        ownerName: "PreviewPanel",
        source: "previewDiagramOptions",
      });
      resetAllButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this._setQuickThresholdValue("0.5");
        await this._setFretNumbersMode("none");
        await subtitleOffsetControl?.setValue?.(0);
        this._updateDiagramOptionsPopupState();
      });
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
        const rect = anchorEl.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const margin = 8;
        const preferredLeft = rect.left;
        const maxLeft = Math.max(margin, viewportWidth - panelRect.width - margin);
        const left = Math.max(margin, Math.min(preferredLeft, maxLeft));
        const belowTop = rect.bottom + margin;
        const canOpenBelow = belowTop + panelRect.height <= viewportHeight - margin;
        const top = canOpenBelow
          ? belowTop
          : Math.max(margin, rect.top - panelRect.height - margin);
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

    _createSizeControl() {
      this.sizeControlElement = document.createElement("div");
      this.sizeControlElement.className = "yc-preview-size-control";
      this.sizeControlElement.setAttribute("dir", "ltr");

      // Create wrapper for all content (will be scaled together)
      const contentWrapper = document.createElement("div");
      contentWrapper.className = "yc-preview-size-content";
      this.sizeContentWrapper = contentWrapper;

      const infoButton = document.createElement("button");
      infoButton.className = "yc-preview-info-btn";
      infoButton.setAttribute("aria-label", "Song chord info");
      infoButton.setAttribute("aria-expanded", "false");
      infoButton.setAttribute("aria-pressed", "false");
      infoButton.title = "Chord Info";
      infoButton.textContent = "i";
      infoButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._closeDiagramOptionsPopup();
        const manager = window.chordEditsManager;
        if (!manager?.openChordInfoPopup) {
          return;
        }

        const videoId = this._extractVideoId() || window.currentVideoId || null;
        manager.openChordInfoPopup({
          anchorEl: infoButton,
          videoId,
          capoContext: "panel",
          fallbackSongChords: Array.isArray(this.chords) ? this.chords : [],
        });
      });
      this.infoButtonElement = infoButton;

      const editsButton = document.createElement("button");
      editsButton.className = "yc-preview-edits-btn yc-edits-none";
      editsButton.setAttribute("aria-label", "Chord edits summary");
      editsButton.setAttribute("aria-expanded", "false");
      editsButton.setAttribute("aria-pressed", "false");
      editsButton.title = "No chord edits";
      editsButton.textContent = "✎";
      editsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._closeDiagramOptionsPopup();
        const manager = window.chordEditsManager;
        if (!manager?.openChordEditsSummaryPopup) return;

        const videoId = this._extractVideoId() || window.currentVideoId || null;
        manager.openChordEditsSummaryPopup({
          anchorEl: editsButton,
          videoId,
          mode: this.currentMode || window.chordsMode || "regular",
          threshold: window.hideQuickChordsThreshold,
          capoContext: "panel",
          fallbackSongChords: Array.isArray(this._rawChordsForEditing)
            ? this._rawChordsForEditing
            : (Array.isArray(this.chords) ? this.chords : []),
        });
      });
      this.editsSummaryButtonElement = editsButton;

      const optionsButton = document.createElement("button");
      optionsButton.className = "yc-preview-options-btn";
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

      let instrumentButton = null;
      if (window.chordRenderer?.createInstrumentSelectorButton) {
        instrumentButton = window.chordRenderer.createInstrumentSelectorButton({
          className: "yc-preview-instrument-btn",
        });
        this.instrumentButtonElement = instrumentButton;
      }

      const modeSwitch = document.createElement("div");
      modeSwitch.className = "yc-preview-mode-switch";
      modeSwitch.setAttribute("role", "group");
      modeSwitch.setAttribute("aria-label", "Quick chords mode switch");

      const modeOptions = [
        { value: "regular", label: "R", title: "R - Beginner" },
        { value: "regularPlus", label: "R+", title: "R+ - Beginner+" },
        { value: "harmonic", label: "H", title: "H - Intermediate" },
        { value: "harmonicPlus", label: "H+", title: "H+ - Advanced" },
      ];

      this.modeSwitchButtons.clear();
      const easyKeyButton = document.createElement("button");
      easyKeyButton.type = "button";
      easyKeyButton.className = "yc-preview-mode-btn yc-easy-key-btn";
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
        modeButton.className = "yc-preview-mode-btn";
        modeButton.textContent = option.label;
        modeButton.title = option.title;
        modeButton.setAttribute("aria-label", option.title);
        modeButton.setAttribute("aria-pressed", "false");
        modeButton.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await this._applyQuickModeSwitch(option.value);
        });
        this.modeSwitchButtons.set(option.value, modeButton);
        modeSwitch.appendChild(modeButton);
      });
      this.modeSwitchElement = modeSwitch;
      this._updateQuickModeSwitchState(this.currentMode || window.chordsMode || "regular");
      this._applyQuickModeSwitchVisibility();

      const keyBadge = document.createElement("div");
      keyBadge.className = "yc-preview-key-badge";
      keyBadge.setAttribute("dir", "ltr");
      keyBadge.setAttribute("data-yc-empty", "true");
      this.estimatedKeyElement = keyBadge;
      this._updateEstimatedKeyBadge();

      // Decrease button
      const decreaseBtn = document.createElement("button");
      decreaseBtn.className = "yc-preview-size-btn";
      decreaseBtn.textContent = "−";
      decreaseBtn.setAttribute("aria-label", "Decrease size");
      decreaseBtn.addEventListener("click", () => this._decreaseSize());

      // Value display
      const valueDisplay = document.createElement("div");
      valueDisplay.className = "yc-preview-size-value";
      valueDisplay.textContent = this.currentScale.toFixed(2);
      this.sizeValueElement = valueDisplay;

      // Increase button
      const increaseBtn = document.createElement("button");
      increaseBtn.className = "yc-preview-size-btn";
      increaseBtn.textContent = "+";
      increaseBtn.setAttribute("aria-label", "Increase size");
      increaseBtn.addEventListener("click", () => this._increaseSize());

      // Add all elements to wrapper (without toggle - it will be positioned absolutely)
      contentWrapper.appendChild(decreaseBtn);
      contentWrapper.appendChild(valueDisplay);
      contentWrapper.appendChild(increaseBtn);

      const topRow = document.createElement("div");
      topRow.className = "yc-preview-top-row";
      const topControlsGroup = document.createElement("div");
      topControlsGroup.className = "yc-preview-top-controls";

      const modeRow = document.createElement("div");
      modeRow.className = "yc-preview-mode-row";
      const modeControlsGroup = document.createElement("div");
      modeControlsGroup.className = "yc-preview-mode-controls";
      modeControlsGroup.appendChild(keyBadge);
      modeControlsGroup.appendChild(modeSwitch);
      modeRow.appendChild(modeControlsGroup);

      // Keep the bottom toolbar controls centered as one scaled group.
      topControlsGroup.appendChild(contentWrapper);

      // Add info button directly to top row (absolute left side)
      topControlsGroup.appendChild(infoButton);
      // Add edits button directly to top row (absolute, right to info)
      topControlsGroup.appendChild(editsButton);
      topControlsGroup.appendChild(optionsButton);
      if (instrumentButton) {
        topControlsGroup.appendChild(instrumentButton);
      }
      topRow.appendChild(topControlsGroup);
      this._updateEditsSummaryButtonState();

      // Close button (X) - positioned absolutely at top-right
      const closeBtn = document.createElement("button");
      closeBtn.className = "yc-preview-close-btn";
      closeBtn.textContent = "\u00D7";
      closeBtn.setAttribute("aria-label", "Close preview panel");
      closeBtn.addEventListener("click", () => this._closeAndSync());

      // Add close button directly to size control (not part of top row flow)
      this.sizeControlElement.appendChild(closeBtn);

      // Capo + Dice row (cube on the left, capo on the right)
      const capoDiceRow = document.createElement("div");
      capoDiceRow.className = "yc-preview-capo-dice-row";
      const capoControlsGroup = document.createElement("div");
      capoControlsGroup.className = "yc-preview-capo-controls";
      const capoDiceAnchor = document.createElement("div");
      capoDiceAnchor.className = "yc-preview-capo-dice-anchor";
      capoControlsGroup.appendChild(capoDiceAnchor);
      capoDiceRow.appendChild(capoControlsGroup);

      this.sizeControlElement.appendChild(capoDiceRow);
      this.sizeControlElement.appendChild(modeRow);
      this.sizeControlElement.appendChild(topRow);
    }

    _cancelLayoutReflow() {
      if (this.layoutReflowRAF !== null) {
        cancelAnimationFrame(this.layoutReflowRAF);
        this.pendingRAFs.delete(this.layoutReflowRAF);
        this.layoutReflowRAF = null;
      }

      this.layoutReflowTimeouts.forEach((timeoutId) => {
        clearTimeout(timeoutId);
        this.pendingTimeouts.delete(timeoutId);
      });
      this.layoutReflowTimeouts.clear();
    }

    _requestLayoutReflow(reason = "preview layout") {
      if (!this.isVisible) return;
      this._cancelLayoutReflow();

      const run = (phase) => {
        if (!this.isVisible) return;
        const lyricsPanel = document.querySelector(".yt-lyrics-chords-panel");
        const direction = lyricsPanel?.classList.contains("yt-lyrics-chords-rtl")
          ? "rtl"
          : "ltr";

        window.reflowLyricsChordsLayout?.(direction, `${reason} ${phase}`);
        this._updatePosition();
        window.ensureLyricsChordsPanelVideoSeparation?.(direction);
        window.scheduleLyricsChordsVideoFit?.(reason);
      };

      this.layoutReflowRAF = requestAnimationFrame(() => {
        this.pendingRAFs.delete(this.layoutReflowRAF);
        this.layoutReflowRAF = null;
        run("raf");
      });
      this.pendingRAFs.add(this.layoutReflowRAF);

      [90, 260].forEach((delay) => {
        const timeoutId = setTimeout(() => {
          this.pendingTimeouts.delete(timeoutId);
          this.layoutReflowTimeouts.delete(timeoutId);
          run(`${delay}ms`);
        }, delay);
        this.pendingTimeouts.add(timeoutId);
        this.layoutReflowTimeouts.add(timeoutId);
      });
    }

    // 🎯 סגירת הפאנל וסנכרון עם הכפתור בפאנל הראשי
    _closeAndSync() {
      DEBUG && console.log("[PreviewPanel] 🔴 Close button clicked");

      // סגירת הפאנל
      this.hide();

      // סנכרון עם הכפתור בפאנל הראשי - שליחת event
      window.dispatchEvent(new CustomEvent("yc:previewPanelClosed"));
    }

    _getPreviewScale() {
      const scale = Number(this.currentScale);
      return Number.isFinite(scale) && scale > 0 ? scale : 1;
    }

    _updateVirtualGridHeight() {
      if (!this.gridElement || !this._usingVirtualScrolling) return;

      const scale = this._getPreviewScale();
      const contentHeight = Math.max(0, this._virtualContentHeight || 0);
      this.gridElement.style.height = `${Math.ceil(contentHeight)}px`;
    }

    _updateScale() {
      if (!this.gridContainer || !this.panelElement) return;

      const previousScale = this._appliedPreviewScale || 1;
      const nextScale = this._getPreviewScale();
      const previousScrollTop = this.panelElement.scrollTop || 0;

      // Update scale transform on grid
      this.gridContainer.style.transform = `scale(${nextScale})`;

      // Update panel width
      const newWidth = this.baseWidth * nextScale;
      this.panelElement.style.width = `${newWidth}px`;

      // Update SIZE CONTROL width to match panel + borders (NO scale on control itself)
      if (this.sizeControlElement) {
        // Add 2px for panel borders (1px each side)
        this.sizeControlElement.style.width = `${newWidth + 2}px`;
        this.sizeControlElement.style.setProperty(
          "--yc-preview-ui-scale",
          String(nextScale)
        );

        // Scale and position are handled by CSS so toolbar controls keep their relative layout.
        if (this.sizeContentWrapper) {
          this.sizeContentWrapper.style.transform = "";
        }
      }

      // Update display value
      if (this.sizeValueElement) {
        this.sizeValueElement.textContent = nextScale.toFixed(2);
      }

      // Save to localStorage
      try {
        localStorage.setItem("yc_preview_scale", nextScale.toString());
      } catch (e) {
        DEBUG && console.warn("[PreviewPanel] Failed to save scale:", e);
      }

      if (this._usingVirtualScrolling) {
        this._updateVirtualGridHeight();

        if (
          this.isVisible &&
          previousScale > 0 &&
          Math.abs(previousScale - nextScale) > 0.001
        ) {
          this.panelElement.scrollTop = (previousScrollTop / previousScale) * nextScale;
        }

        this._renderVirtualWindow();
      }

      this._appliedPreviewScale = nextScale;

      // Update position and page layout if visible
      if (this.isVisible) {
        this.pageWidthManager.resetPageWidth();
        this._requestLayoutReflow("preview size");
      }

      DEBUG &&
        console.log(
          `[PreviewPanel] 🎨 Scale updated to ${nextScale.toFixed(2)}`
        );
    }

    _increaseSize() {
      if (this.currentScale < this.maxScale) {
        this.currentScale = Math.min(
          this.maxScale,
          this.currentScale + this.scaleStep
        );
        this._updateScale();
      }
    }

    _decreaseSize() {
      if (this.currentScale > this.minScale) {
        this.currentScale = Math.max(
          this.minScale,
          this.currentScale - this.scaleStep
        );
        this._updateScale();
      }
    }

    _updateSizeControlPosition() {
      if (!this.sizeControlElement || !this.panelElement) return;

      const panelRect = this.panelElement.getBoundingClientRect();
      const sizeControlHeight = this.sizeControlElement.offsetHeight || 40;
      const alignedLeft = Math.round(panelRect.left);
      const alignedTop = Math.round(panelRect.top - sizeControlHeight);

      // Position size control directly above panel (width is set in _updateScale)
      this.sizeControlElement.style.left = `${alignedLeft}px`;
      this.sizeControlElement.style.top = `${alignedTop}px`;
      // Width is managed by _updateScale() - don't override it here
    }

    _updatePosition() {
      try {
        const lyricsPanel = document.querySelector(".yt-lyrics-chords-panel");
        if (!lyricsPanel) {
          console.warn("[PreviewPanel] ❌ Lyrics & Chords panel not found");
          return;
        }

        const panelRect = lyricsPanel.getBoundingClientRect();
        const direction = lyricsPanel.classList.contains("yt-lyrics-chords-rtl")
          ? "rtl"
          : "ltr";
        const previewWidth = this.panelElement.offsetWidth;
        const gap = 0; // Smaller gap for tighter spacing

        // Validate dimensions
        if (!previewWidth || previewWidth <= 0) {
          console.warn(
            "[PreviewPanel] ⚠️ Invalid preview width:",
            previewWidth
          );
          return;
        }

        if (!panelRect.width || panelRect.width <= 0) {
          console.warn(
            "[PreviewPanel] ⚠️ Invalid panel dimensions:",
            panelRect
          );
          return;
        }

        // Find the header and controls to align below them
        const header = lyricsPanel.querySelector(".lyrics-chords-header");
        const controls = lyricsPanel.querySelector(".lyrics-chords-controls");
        const content = lyricsPanel.querySelector(".lyrics-chords-content");
        const headerHeight = header ? header.offsetHeight : 0;
        const controlsHeight = controls ? controls.offsetHeight : 0;
        const contentHeight = content ? content.offsetHeight : 600;
        const totalOffset = headerHeight + controlsHeight;

        DEBUG &&
          console.log("[PreviewPanel] 📐 Updating position:", {
            direction,
            previewWidth,
            panelLeft: panelRect.left,
            panelRight: panelRect.right,
            headerHeight,
            controlsHeight,
            contentHeight,
            totalOffset,
          });

        if (direction === "rtl") {
          // RTL: Use intelligent positioning with anchor mode
          const positionData = this.positionCalculator.calculateRTLPosition(
            panelRect,
            previewWidth,
            gap
          );

          if (positionData.needsAnchor) {
            // Anchor mode: Absolute position from right edge (not fixed to avoid scroll issues)
            this.panelElement.style.position = "absolute";
            this.panelElement.style.right = `${positionData.position}px`;
            this.panelElement.style.left = "auto";

            // Expand page width to accommodate main panel
            this.pageWidthManager.expandPageForRTL(
              panelRect.width,
              previewWidth
            );

            this._isAnchored = true;

            DEBUG &&
              console.log("[PreviewPanel] 🔒 RTL Anchor mode applied", {
                right: positionData.position,
                mainPanelWidth: panelRect.width,
              });
          } else {
            // Relative mode: Position next to main panel (always stuck to it)
            this.panelElement.style.position = "absolute";
            const previewLeft = panelRect.right + gap;
            this.panelElement.style.left = `${previewLeft}px`;
            this.panelElement.style.right = "auto";

            // Reset page width if previously expanded
            if (this._isAnchored) {
              this.pageWidthManager.resetPageWidth();
            }

            this._isAnchored = false;

            DEBUG &&
              console.log("[PreviewPanel] 📍 RTL Relative mode applied", {
                left: previewLeft,
                panelRight: panelRect.right,
              });
          }
        } else {
          // LTR: Preview to the left of panel (existing logic)
          this.panelElement.style.position = "absolute";
          const previewLeft = panelRect.left - previewWidth - gap;
          this.panelElement.style.left = `${Math.max(gap, previewLeft)}px`;
          this.panelElement.style.right = "auto";
        }

        // Calculate top position relative to page (absolute positioning)
        // This makes the preview scroll with the main panel
        const absoluteTop = panelRect.top + window.scrollY + headerHeight;
        this.panelElement.style.top = `${absoluteTop}px`;

        // Match height: controls + content (full height to match main panel)
        const previewHeight = controlsHeight + contentHeight;
        this.panelElement.style.height = `${previewHeight}px`;
        this.panelElement.style.maxHeight = "none";

        // Update size control position (above panel)
        this._updateSizeControlPosition();
        window.ensureLyricsChordsPanelVideoSeparation?.(direction);
      } catch (error) {
        console.error("[PreviewPanel] ❌ Position update failed:", error);

        // Fallback: Use safe default position
        try {
          this.panelElement.style.position = "fixed";
          this.panelElement.style.right = "10px";
          this.panelElement.style.top = "100px";
          this.panelElement.style.left = "auto";
          DEBUG &&
            console.log("[PreviewPanel] 🔄 Applied fallback positioning");
        } catch (fallbackError) {
          console.error(
            "[PreviewPanel] ❌ Fallback positioning failed:",
            fallbackError
          );
        }
      }
    }

    _shiftPageForPreview() {
      const lyricsPanel = document.querySelector(".yt-lyrics-chords-panel");
      if (!lyricsPanel) return;

      const direction = lyricsPanel.classList.contains("yt-lyrics-chords-rtl")
        ? "rtl"
        : "ltr";

      if (window.reflowLyricsChordsLayout?.(direction, "preview show")) {
        return;
      }

      // RTL: Page expansion handled in _updatePosition() by PageWidthManager
      if (direction === "rtl") {
        DEBUG &&
          console.log(
            "[PreviewPanel] RTL mode - page expansion handled by PageWidthManager"
          );
        return;
      }

      // LTR: Shift entire page to make room for preview
      const previewWidth = this.panelElement.offsetWidth || 180; // Dynamic width

      // Find page container - try multiple selectors
      const pageSelectors = [
        "#page-manager",
        "#content",
        "#container",
        "#main",
        "ytd-app",
      ];
      let pageContainer = null;

      for (const selector of pageSelectors) {
        pageContainer = document.querySelector(selector);
        if (pageContainer) {
          DEBUG &&
            console.log(`[PreviewPanel] 🎯 Found page container: ${selector}`);
          break;
        }
      }

      if (pageContainer) {
        // Get current transform if any
        const computedStyle = window.getComputedStyle(pageContainer);
        const currentTransform =
          computedStyle.transform || pageContainer.style.transform || "";

        DEBUG &&
          console.log(
            `[PreviewPanel] 📊 Current transform: "${currentTransform}"`
          );

        let existingShift = 0;

        // Parse matrix or translateX
        if (currentTransform && currentTransform !== "none") {
          // Try to parse translateX first
          const translateMatch = currentTransform.match(
            /translateX\((-?\d+(?:\.\d+)?)px\)/
          );
          if (translateMatch) {
            existingShift = parseFloat(translateMatch[1]);
          } else {
            // Try to parse matrix
            const matrixMatch = currentTransform.match(/matrix\(([^)]+)\)/);
            if (matrixMatch) {
              const values = matrixMatch[1]
                .split(",")
                .map((v) => parseFloat(v.trim()));
              // In matrix(a, b, c, d, tx, ty), tx is the X translation (index 4)
              if (values.length >= 6) {
                existingShift = values[4];
              }
            }
          }
        }

        DEBUG &&
          console.log(`[PreviewPanel] 📏 Existing shift: ${existingShift}px`);

        // Add preview width to existing shift
        const totalShift = existingShift + previewWidth;

        pageContainer.style.setProperty(
          "transform",
          `translateX(${totalShift}px)`,
          "important"
        );

        // Mark that we shifted the page
        pageContainer.setAttribute("data-yc-preview-shift", previewWidth);

        DEBUG &&
          console.log(
            `[PreviewPanel] ✅ Shifted page right by ${previewWidth}px (existing: ${existingShift}px, total: ${totalShift}px)`
          );
      }

      // ALSO shift the main panel (it's position: fixed, so it doesn't move with the page)
      if (lyricsPanel) {
        // Get current left position
        const currentLeft = parseInt(lyricsPanel.style.left) || 0;
        const newLeft = currentLeft + previewWidth;

        lyricsPanel.style.left = `${newLeft}px`;
        lyricsPanel.setAttribute("data-yc-preview-panel-shift", previewWidth);

        DEBUG &&
          console.log(
            `[PreviewPanel] ✅ Shifted main panel right by ${previewWidth}px (from ${currentLeft}px to ${newLeft}px)`
          );
      }

      window.ensureLyricsChordsPanelVideoSeparation?.(direction);
    }

    _resetPageShift() {
      DEBUG && console.log("[PreviewPanel] 📐 Resetting page shift");

      const pageSelectors = [
        "#page-manager",
        "#content",
        "#container",
        "#main",
        "ytd-app",
      ];

      for (const selector of pageSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const previewShift = element.getAttribute("data-yc-preview-shift");

          if (previewShift) {
            // We shifted the page, now restore to previous state
            const shiftAmount = parseFloat(previewShift);

            // Get current transform
            const computedStyle = window.getComputedStyle(element);
            const currentTransform =
              computedStyle.transform || element.style.transform || "";

            let existingShift = 0;

            // Parse current shift
            if (currentTransform && currentTransform !== "none") {
              const translateMatch = currentTransform.match(
                /translateX\((-?\d+(?:\.\d+)?)px\)/
              );
              if (translateMatch) {
                existingShift = parseFloat(translateMatch[1]);
              } else {
                const matrixMatch = currentTransform.match(/matrix\(([^)]+)\)/);
                if (matrixMatch) {
                  const values = matrixMatch[1]
                    .split(",")
                    .map((v) => parseFloat(v.trim()));
                  if (values.length >= 6) {
                    existingShift = values[4];
                  }
                }
              }
            }

            // Subtract preview shift from current shift
            const newShift = existingShift - shiftAmount;

            DEBUG &&
              console.log(
                `[PreviewPanel] 📏 Removing ${shiftAmount}px from ${existingShift}px = ${newShift}px`
              );

            if (newShift === 0) {
              // No shift needed, remove transform
              element.style.removeProperty("transform");
            } else {
              // Restore previous shift
              element.style.setProperty(
                "transform",
                `translateX(${newShift}px)`,
                "important"
              );
            }

            // Remove marker
            element.removeAttribute("data-yc-preview-shift");

            DEBUG &&
              console.log(`[PreviewPanel] ✅ Reset ${selector} transform`);
          }
        }
      }

      // ALSO reset the main panel position
      const lyricsPanel = document.querySelector(".yt-lyrics-chords-panel");
      if (lyricsPanel) {
        const panelShift = lyricsPanel.getAttribute(
          "data-yc-preview-panel-shift"
        );

        if (panelShift) {
          const shiftAmount = parseFloat(panelShift);
          const currentLeft = parseInt(lyricsPanel.style.left) || 0;
          const newLeft = currentLeft - shiftAmount;

          lyricsPanel.style.left = `${newLeft}px`;
          lyricsPanel.removeAttribute("data-yc-preview-panel-shift");

          DEBUG &&
            console.log(
              `[PreviewPanel] ✅ Reset main panel position (from ${currentLeft}px to ${newLeft}px)`
            );
        }
      }
    }

    _setupEventListeners() {
      this.abortController = new AbortController();
      const signal = this.abortController.signal;

      // Listen for mode changes
      window.addEventListener(
        "yc:modeChanged",
        (e) => {
          this.currentMode = this._normalizeModeValue(e?.detail?.newMode || window.chordsMode || "regular");
          this._updateQuickModeSwitchState(this.currentMode);
          if (window.ycKeyEstimator?.isEasyKeyActive?.()) {
            void window.ycKeyEstimator.applyEasyKeyForCurrentMode?.(this.currentMode);
          }
          if (this.isVisible) {
            this._refreshChords();
          }
        },
        { signal }
      );

      window.addEventListener(
        "yc:estimatedKeyChanged",
        (event) => {
          this._updateEstimatedKeyBadge(event?.detail || window.ycEstimatedKey);
        },
        { signal }
      );

      window.addEventListener(
        "yc:keyTransposeChanged",
        (event) => {
          this._updateEstimatedKeyBadge(event?.detail?.estimatedKey || window.ycEstimatedKey);
          this._refreshChordsForCapo();
        },
        { signal }
      );

      const refreshInstrumentDiagrams = () => {
        if (this.isVisible) {
          this._refreshChords();
          return;
        }
        this._refreshChordsForCapo();
      };
      window.addEventListener("yc:instrumentChanged", refreshInstrumentDiagrams, {
        signal,
      });
      window.addEventListener("yc:instrumentPositionsLoaded", refreshInstrumentDiagrams, {
        signal,
      });

      window.addEventListener(
        "yc:easyKeyChanged",
        () => {
          this._updateEasyKeyButtonState();
          this._updateEstimatedKeyBadge(window.ycEstimatedKey);
        },
        { signal }
      );

      // Listen for chord changes
      window.addEventListener(
        "yc:chordChanged",
        (e) => {
          DEBUG &&
            console.log(`📡 [DEBUG] Received yc:chordChanged event:`, e.detail);

          this.currentChordName = e.detail.chordName;
          this.currentChordTime = e.detail.time;

          if (this.isVisible) {
            this._highlightChord(e.detail.chordName, e.detail.time);
          }
        },
        { signal }
      );

      // 🎯 Listen for time updates (decoupled from main panel logic)
      window.addEventListener(
        "yc:timeUpdate",
        (e) => {
          if (!this.isVisible) return;

          const { time, isScrubbing } = e.detail;
          DEBUG &&
            console.log(
              `⏱️ [DEBUG] Received timeUpdate: ${time}s (scrubbing: ${isScrubbing})`
            );

          // Find and highlight chord independently
          this._highlightChordByTime(time, isScrubbing);

          // 📊 Update beat grids based on current time
          this._updateAllBeatGrids(time, !!isScrubbing);
        },
        { signal }
      );

      window.addEventListener(
        "yc:previewActiveChordDirectionChanged",
        (e) => {
          const nextDirection = normalizePreviewActiveChordDirection(
            e?.detail?.direction
          );
          this.activeChordDirection = nextDirection;
          window.previewActiveChordDirection = nextDirection;

          if (!this.isVisible) return;

          const video = document.querySelector("video");
          const currentTime = Number.isFinite(video?.currentTime)
            ? video.currentTime
            : null;

          this._refreshChords()
            .then(() => {
              if (!this.isVisible || currentTime === null) return;
              this._highlightChordByTime(currentTime, true);
              this._updateAllBeatGrids(currentTime, true);
            })
            .catch((error) => {
              console.warn(
                "[PreviewPanel] Failed applying active chord direction change:",
                error
              );
            });
        },
        { signal }
      );

      // 🎨 Listen for theme changes
      window.addEventListener(
        "yc:themeChanged",
        (e) => {
          DEBUG && console.log("[PreviewPanel] 🎨 Theme changed:", e.detail);
          this._updateTheme();
        },
        { signal }
      );

      // 🎸 Listen for capo changes
      window.addEventListener(
        "yc:capoToggled",
        (e) => {
          const type = e.detail?.type;
          // רענון רק אם השינוי רלוונטי לפאנל
          if (type === "panel" || type === "both") {
            DEBUG && console.log("[PreviewPanel] 🎸 Capo toggled - refreshing");
            this._refreshChordsForCapo();
          }
        },
        { signal }
      );

      window.addEventListener(
        "yc:capoChanged",
        (e) => {
          const type = e.detail?.type;
          // רענון רק אם השינוי רלוונטי לפאנל
          if (type === "panel" || type === "both") {
            DEBUG && console.log("[PreviewPanel] 🎸 Capo fret changed - refreshing");
            this._refreshChordsForCapo();
          }
        },
        { signal }
      );

      // 🆕 Listen for capo feature toggle
      window.addEventListener(
        "yc:capoFeatureToggled",
        () => {
          DEBUG && console.log("[PreviewPanel] 🎸 Capo FEATURE toggled - refreshing");
          this._refreshChordsForCapo();
        },
        { signal }
      );

      // 🆕 Listen for capo sync toggle
      window.addEventListener(
        "yc:capoSyncToggled",
        () => {
          DEBUG && console.log("[PreviewPanel] 🎸 Capo SYNC toggled - refreshing");
          this._refreshChordsForCapo();
        },
        { signal }
      );

      // 🚀 Listen for Hide Quick Chords changes
      window.addEventListener(
        "yc:hideQuickChordsChanged",
        (e) => {
          window.hideQuickChordsEnabled = e.detail.enabled;
          window.hideQuickChordsThreshold = e.detail.threshold;
          DEBUG && console.log("[PreviewPanel] 🚀 Hide Quick Chords changed:", e.detail);
          this._updateDiagramOptionsPopupState();
          if (this.isVisible) {
            this._refreshChords();
          }
        },
        { signal }
      );

      window.addEventListener(
        "yc:fretNumbersChanged",
        (event) => {
          window.additionalFretNumbers = normalizeFretNumbersMode(event?.detail?.value);
          this._updateDiagramOptionsPopupState();
          if (event?.detail?.source === "settingsQuickDropdown") return;
          if (this.isVisible) {
            this._refreshChords();
          }
        },
        { signal }
      );

      window.addEventListener(
        "yc:chordEditsChanged",
        (e) => {
          const eventVideoId = e?.detail?.videoId || null;
          const currentVideoId = this._extractVideoId();
          if (eventVideoId && currentVideoId && eventVideoId !== currentVideoId) {
            return;
          }
          if (this.isVisible) {
            this._refreshChords();
          }
        },
        { signal }
      );

      window.addEventListener(
        "yc:chordEditsUiChanged",
        (event) => {
          this._applyQuickModeSwitchVisibility(event?.detail?.showModeSwitch);
          if (this.isVisible) {
            this._refreshChords();
          }
        },
        { signal }
      );

      window.addEventListener(
        "yc:chordEditPreviewChanged",
        (event) => {
          if (!this.isVisible) return;
          this._applyEditPreviewHighlights(event?.detail || null);
        },
        { signal }
      );

      window.addEventListener(
        "yc:chordTimingPreviewChanged",
        (event) => {
          this._handleChordTimingPreviewChanged(event?.detail || null);
        },
        { signal }
      );

      // Listen for main panel closing event
      window.addEventListener(
        "yc:panelClosing",
        () => {
          try {
            if (this.isVisible) {
              DEBUG &&
                console.log(
                  "[PreviewPanel] 🔴 Received panelClosing event, hiding preview"
                );
              this.hide();
            }
          } catch (error) {
            console.error(
              "[PreviewPanel] Error handling panelClosing event:",
              error
            );
          }
        },
        { signal }
      );

      const handleVideoNavigation = () => {
        if (!this.isVisible) return;
        const timeoutId = setTimeout(() => {
          this.pendingTimeouts.delete(timeoutId);
          if (!this.isVisible) return;
          this._attachVideoSyncListeners();
          this._syncToVideoCurrentTime(true);
        }, 250);
        this.pendingTimeouts.add(timeoutId);
      };

      window.addEventListener("yt-navigate-finish", handleVideoNavigation, {
        signal,
      });
      window.addEventListener("yt-page-data-updated", handleVideoNavigation, {
        signal,
      });

      // Listen for panel changes (close and width changes)
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          try {
            const lyricsPanel = mutation.target;

            // Handle class changes (panel open/close)
            if (
              mutation.type === "attributes" &&
              mutation.attributeName === "class"
            ) {
              const isOpen = lyricsPanel.classList.contains(
                "yt-lyrics-chords-open"
              );
              // Also check if panel still exists in DOM
              const panelInDOM = document.body.contains(lyricsPanel);

              if ((!isOpen || !panelInDOM) && this.isVisible) {
                DEBUG &&
                  console.log(
                    "[PreviewPanel] 🔴 Main panel closed (class or DOM), hiding preview"
                  );
                this.hide();
              }
            }

            // Handle panel removal from DOM
            if (mutation.type === "childList") {
              // Check if the panel was removed
              const panelStillExists = document.querySelector(
                ".yt-lyrics-chords-panel"
              );
              if (!panelStillExists && this.isVisible) {
                DEBUG &&
                  console.log(
                    "[PreviewPanel] 🔴 Main panel removed from DOM, hiding preview"
                  );
                this.hide();
              }
            }

            // Handle style changes (panel width)
            if (
              mutation.type === "attributes" &&
              mutation.attributeName === "style" &&
              this.isVisible
            ) {
            DEBUG &&
              console.log(
                "[PreviewPanel] 📐 Panel style changed, updating position"
              );
              this._updatePosition();
            }
          } catch (error) {
            console.error("[PreviewPanel] Error in mutation observer:", error);
            // Don't let one error break the entire observer
          }
        });
      });

      // Store observer immediately for cleanup
      this.panelObserver = observer;

      // Start observing the lyrics panel with retry mechanism
      let retryCount = 0;
      const maxRetries = 20; // Max 10 seconds (20 * 500ms)

      const checkPanel = () => {
        // Stop if destroyed
        if (!this.abortController || this.abortController.signal.aborted) {
          DEBUG &&
            console.log("[PreviewPanel] ⚠️ Stopped panel check - destroyed");
          return;
        }

        const lyricsPanel = document.querySelector(".yt-lyrics-chords-panel");
        if (lyricsPanel) {
          // MutationObserver for class changes and DOM removal
          observer.observe(lyricsPanel, {
            attributes: true,
            attributeFilter: ["class", "style"],
            childList: true,
            subtree: false,
          });

          // ResizeObserver for size changes (width changes, zoom, etc.)
          this.panelResizeObserver = new ResizeObserver((entries) => {
            if (this.isVisible) {
              DEBUG &&
                console.log(
                  "[PreviewPanel] 📏 Panel resized, updating position"
                );
              this._requestLayoutReflow("panel resize");
            }
          });
          this.panelResizeObserver.observe(lyricsPanel);

          DEBUG &&
            console.log(
              "[PreviewPanel] 👀 Observing main panel for changes (class, style & resize)"
            );
        } else if (retryCount < maxRetries) {
          retryCount++;
          // Store timeout ID for cleanup
          this.retryTimeoutId = setTimeout(checkPanel, 500);
        } else {
          DEBUG &&
            console.warn("[PreviewPanel] ⚠️ Panel not found after max retries");
        }
      };
      checkPanel();

      // 🎯 Track user scrolling - mousedown/mouseup on panel
      if (this.panelElement) {
        this.panelElement.addEventListener(
          "scroll",
          () => {
            if (this.isVisible && this._usingVirtualScrolling) {
              this._scheduleVirtualRender();
            }
          },
          { passive: true, signal }
        );

        this.panelElement.addEventListener(
          "mousedown",
          () => {
            this._isUserScrolling = true;
            DEBUG && console.log("[PreviewPanel] 🖱️ User started scrolling");
          },
          { signal }
        );

        // Global mouseup to catch release outside panel
        document.addEventListener(
          "mouseup",
          () => {
            if (this._isUserScrolling) {
              const video = document.querySelector("video");
              const isPlaying = video && !video.paused;

              if (isPlaying) {
                // Video is playing - reset flag and immediately jump to correct position
                this._isUserScrolling = false;
                DEBUG && console.log("[PreviewPanel] 🖱️ User released mouse (PLAY) - jumping to correct position");

                // Immediately highlight current chord and scroll to it
                if (video && this.isVisible) {
                  this._highlightChordByTime(video.currentTime, false);
                }
              } else {
                // Video is paused - keep flag true until video plays
                DEBUG && console.log("[PreviewPanel] 🖱️ User released mouse (PAUSE) - staying in manual mode");
              }
            }
          },
          { signal }
        );
      }
    }

    _findVideoElement() {
      return (
        document.querySelector("video.html5-main-video") ||
        document.querySelector("video")
      );
    }

    _attachVideoSyncListeners() {
      const video = this._findVideoElement();
      if (!video || video === this.videoElement) return;

      this._detachVideoSyncListeners();
      this.videoElement = video;

      this.videoSeekingHandler = () => {
        this._scheduleVideoTimeSync(true);
      };
      this.videoSeekedHandler = () => {
        this._scheduleVideoTimeSync(true);
      };

      video.addEventListener("seeking", this.videoSeekingHandler, {
        passive: true,
      });
      video.addEventListener("seeked", this.videoSeekedHandler, {
        passive: true,
      });

      DEBUG && console.log("[PreviewPanel] 🎬 Video seek listeners attached");
    }

    _detachVideoSyncListeners() {
      if (this.videoElement && this.videoSeekingHandler) {
        this.videoElement.removeEventListener(
          "seeking",
          this.videoSeekingHandler
        );
      }
      if (this.videoElement && this.videoSeekedHandler) {
        this.videoElement.removeEventListener(
          "seeked",
          this.videoSeekedHandler
        );
      }

      this.videoElement = null;
      this.videoSeekingHandler = null;
      this.videoSeekedHandler = null;

      if (this.pendingVideoSyncRAF !== null) {
        cancelAnimationFrame(this.pendingVideoSyncRAF);
        this.pendingVideoSyncRAF = null;
      }
    }

    _scheduleVideoTimeSync(isScrubbing = true) {
      if (!this.isVisible || this.pendingVideoSyncRAF !== null) return;

      this.pendingVideoSyncRAF = requestAnimationFrame(() => {
        this.pendingVideoSyncRAF = null;
        this._syncToVideoCurrentTime(isScrubbing);
      });
    }

    _syncToVideoCurrentTime(isScrubbing = true) {
      if (!this.isVisible) return;

      const video = this._findVideoElement();
      if (!video) return;

      if (video !== this.videoElement) {
        this._attachVideoSyncListeners();
      }

      const currentTime = Number.isFinite(video.currentTime)
        ? video.currentTime
        : null;
      if (currentTime === null) return;

      if (isScrubbing) {
        this._isUserScrolling = false;
      }

      this._highlightChordByTime(currentTime, isScrubbing);
      this._updateAllBeatGrids(currentTime, isScrubbing);
    }

    _loadState() {
      // Load saved scale
      try {
        const savedScale = localStorage.getItem("yc_preview_scale");
        if (savedScale) {
          const scale = parseFloat(savedScale);
          if (
            !isNaN(scale) &&
            scale >= this.minScale &&
            scale <= this.maxScale
          ) {
            this.currentScale = scale;
            this._updateScale();
            DEBUG && console.log(`[PreviewPanel] 📏 Loaded scale: ${scale}`);
          }
        }
      } catch (e) {
        DEBUG && console.warn("[PreviewPanel] Failed to load scale:", e);
      }

      this.activeChordDirection = readPreviewActiveChordDirection();
      window.previewActiveChordDirection = this.activeChordDirection;
      DEBUG &&
        console.log(
          `[PreviewPanel] Loaded active chord direction: ${this.activeChordDirection}`
        );

      // Do NOT auto-open on init - let lyricsAndChordsButton handle it
      DEBUG &&
        console.log(
          "[PreviewPanel] State loaded, waiting for main panel to open"
        );
    }

    _saveState() {
      try {
        localStorage.setItem(
          "yc_preview_panel_visible",
          this.isVisible.toString()
        );
      } catch (e) {
        DEBUG && console.warn("[PreviewPanel] Failed to save state:", e);
      }
    }

    async toggle() {
      DEBUG &&
        console.log(
          "[PreviewPanel] 🔄 toggle() called, current isVisible:",
          this.isVisible
        );
      if (this.isVisible) {
        this.hide();
      } else {
        await this.show();
      }
    }

    async show() {
      // Check if main panel is open before showing preview
      const lyricsPanel = document.querySelector(".yt-lyrics-chords-panel");
      const isPanelOpen = lyricsPanel?.classList.contains(
        "yt-lyrics-chords-open"
      );

      if (!isPanelOpen) {
        DEBUG &&
          console.log(
            "[PreviewPanel] ⚠️ Cannot show preview - main panel is closed"
          );
        return;
      }

      this.isVisible = true;
      this._attachVideoSyncListeners();

      // Make panel and size control visible first to get real width
      this.panelElement.classList.add("visible");
      this.sizeControlElement.classList.add("visible");

      // 🎨 Update theme to match main panel
      this._updateTheme();
      this._syncAuxiliaryHeaderControls("show");

      // 🎵 Sync MODE from storage (harmonic/regular/harmonicPlus)
      await this._syncModeFromStorage();
      if (!window.ycEstimatedKey && window.ycKeyEstimator?.setCurrentFromData && window.PANEL_SUBSET?.chordText) {
        try {
          window.ycKeyEstimator.setCurrentFromData(window.PANEL_SUBSET);
        } catch (keyError) {
          console.warn("[PreviewPanel] Failed estimating key from panel subset:", keyError);
        }
      }
      this._updateEstimatedKeyBadge();

      // Start fallback check
      this._startFallbackCheck();

      // Now we can read the actual width and shift the page
      this._shiftPageForPreview();

      // Wait for the page shift to complete before updating position
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 🔧 RTL: Update position BEFORE calling main panel (so main panel knows where Preview is)
      this._updatePosition();
      window.scheduleLyricsChordsVideoFit?.("preview show");

      // Recalculate the main panel after the preview width is known.
      const direction = lyricsPanel?.classList.contains("yt-lyrics-chords-rtl")
        ? "rtl"
        : "ltr";

      if (window.reflowLyricsChordsLayout || window.updateLyricsChordsLayout) {
        // Wait for browser to finish rendering page expansion before updating main panel
        const timeoutId = setTimeout(() => {
          this.pendingTimeouts.delete(timeoutId);
          if (!this.isVisible) return; // Safety check
          if (window.reflowLyricsChordsLayout?.(direction, "preview show settled")) {
            this._updatePosition();
          } else {
            window.updateLyricsChordsLayout?.();
          }
          DEBUG &&
            console.log(
              "[PreviewPanel] 📡 Called layout reflow after position"
            );
        }, 100);
        this.pendingTimeouts.add(timeoutId);
      }

      this._saveState();
      await this._refreshChords();
      this._syncToVideoCurrentTime(true);
      DEBUG && console.log("[PreviewPanel] ✅ Shown");
    }

    hide() {
      this.isVisible = false;
      this._refreshRequestId++;
      window.chordRenderer?.closeInstrumentMenu?.();
      this._detachVideoSyncListeners();
      this.panelElement.classList.remove("visible");
      this.sizeControlElement.classList.remove("visible");
      this._clearRenderedChords({ clearChords: true });

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

      // Stop fallback check
      this._stopFallbackCheck();

      // Reset page shift for LTR
      this._resetPageShift();

      // 🔧 RTL: Reset page width if anchored
      if (this._isAnchored) {
        this.pageWidthManager.resetPageWidth();
        this._isAnchored = false;
        DEBUG && console.log("[PreviewPanel] 🔓 RTL anchor mode deactivated");
      }

      // Recalculate the main panel when the preview closes so it can reclaim space.
      const lyricsPanel = document.querySelector(".yt-lyrics-chords-panel");
      const direction = lyricsPanel?.classList.contains("yt-lyrics-chords-rtl")
        ? "rtl"
        : "ltr";

      if (window.reflowLyricsChordsLayout || window.updateLyricsChordsLayout) {
        // Wait for browser to finish page contraction before updating main panel
        const timeoutId1 = setTimeout(() => {
          this.pendingTimeouts.delete(timeoutId1);
          if (window.reflowLyricsChordsLayout?.(direction, "preview hide")) {
            if (this.isVisible) this._updatePosition();
          } else if (window.updateLyricsChordsLayout) {
            window.updateLyricsChordsLayout();
          }
          if (window.reflowLyricsChordsLayout || window.updateLyricsChordsLayout) {
            DEBUG &&
              console.log(
                "[PreviewPanel] 📡 Called layout reflow after close (first)"
              );
          }
        }, 100);
        this.pendingTimeouts.add(timeoutId1);

        // Second call after additional delay to ensure video position is final
        const timeoutId2 = setTimeout(() => {
          this.pendingTimeouts.delete(timeoutId2);
          if (window.reflowLyricsChordsLayout?.(direction, "preview hide settled")) {
            if (this.isVisible) this._updatePosition();
          } else if (window.updateLyricsChordsLayout) {
            window.updateLyricsChordsLayout();
          }
          if (window.reflowLyricsChordsLayout || window.updateLyricsChordsLayout) {
            DEBUG &&
              console.log(
                "[PreviewPanel] 📡 Called layout reflow after close (second)"
              );
          }
        }, 250);
        this.pendingTimeouts.add(timeoutId2);
      }

      window.scheduleLyricsChordsVideoFit?.("preview hide");

      this._saveState();
      DEBUG && console.log("[PreviewPanel] ✅ Hidden");
    }

    _startFallbackCheck() {
      // Clear any existing interval
      this._stopFallbackCheck();

      // Start polling every 500ms
      this.fallbackCheckInterval = setInterval(() => {
        try {
          if (!this.isVisible) {
            // Preview is closed, stop checking
            this._stopFallbackCheck();
            return;
          }

          const lyricsPanel = document.querySelector(".yt-lyrics-chords-panel");
          const isPanelOpen = lyricsPanel?.classList.contains(
            "yt-lyrics-chords-open"
          );

          if (!lyricsPanel || !isPanelOpen) {
            DEBUG &&
              console.log(
                "[PreviewPanel] 🔴 Fallback check detected closed panel"
              );
            this.hide();
            this._stopFallbackCheck();
          }
        } catch (error) {
          console.error("[PreviewPanel] Error in fallback check:", error);
          // Stop polling on error to prevent spam
          this._stopFallbackCheck();
        }
      }, 500);

      DEBUG && console.log("[PreviewPanel] 🔄 Started fallback check");
    }

    _stopFallbackCheck() {
      if (this.fallbackCheckInterval) {
        clearInterval(this.fallbackCheckInterval);
        this.fallbackCheckInterval = null;
        DEBUG && console.log("[PreviewPanel] ⏹️ Stopped fallback check");
      }
    }

    destroy() {
      this._refreshRequestId++;
      window.chordRenderer?.closeInstrumentMenu?.();
      // Stop fallback check
      this._stopFallbackCheck();
      this._detachVideoSyncListeners();
      this._cancelLayoutReflow();

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

      // Clean up retry timeout
      if (this.retryTimeoutId) {
        clearTimeout(this.retryTimeoutId);
        this.retryTimeoutId = null;
      }

      // 🧹 Clean up all pending timeouts
      if (this.pendingTimeouts && this.pendingTimeouts.size > 0) {
        DEBUG &&
          console.log(
            `[PreviewPanel] 🧹 Clearing ${this.pendingTimeouts.size} pending timeouts`
          );
        this.pendingTimeouts.forEach((id) => clearTimeout(id));
        this.pendingTimeouts.clear();
      }

      // 🧹 Clean up all pending RAF calls
      if (this.pendingRAFs && this.pendingRAFs.size > 0) {
        DEBUG &&
          console.log(
            `[PreviewPanel] 🧹 Canceling ${this.pendingRAFs.size} pending RAF calls`
          );
        this.pendingRAFs.forEach((id) => cancelAnimationFrame(id));
        this.pendingRAFs.clear();
      }
      if (this._splitTimingPreviewRefreshRAF) {
        cancelAnimationFrame(this._splitTimingPreviewRefreshRAF);
        this._splitTimingPreviewRefreshRAF = null;
      }

      // Clean up event listeners
      this.abortController?.abort();
      this.abortController = null;
      this._closeDiagramOptionsPopup();

      // Clean up resize listener
      if (this.resizeHandler) {
        window.removeEventListener("resize", this.resizeHandler);
        this.resizeHandler = null;
      }

      // Clean up observers
      this.panelObserver?.disconnect();
      this.panelObserver = null;

      this.panelResizeObserver?.disconnect();
      this.panelResizeObserver = null;

      // Clean up RTL page width expansion if active
      if (this._isAnchored) {
        this.pageWidthManager?.resetPageWidth();
        this._isAnchored = false;
        DEBUG && console.log("[PreviewPanel] 🔓 Cleaned up RTL anchor mode");
      }

      this._clearRenderedChords({ clearChords: true });

      // Clean up DOM
      this.panelElement?.remove();
      this.sizeControlElement?.remove();
      this.panelElement = null;
      this.gridElement = null;
      this.gridContainer = null;
      this.sizeControlElement = null;
      this.sizeContentWrapper = null;
      this.diagramOptionsButtonElement = null;
      this.diagramOptionsPopupClose = null;
      this.diagramOptionsPopupAnchor = null;
      this.diagramOptionsPopupStateUpdaters?.clear();
      this.modeSwitchElement = null;
      this.easyKeyButtonElement = null;
      this.estimatedKeyElement = null;
      this.estimatedKeyLabelElement = null;
      if (this.modeSwitchButtons) {
        this.modeSwitchButtons.clear();
      }
      this._disconnectDiagramObserver();
      this._lazyDiagramContainers?.clear();

      // Clean up data structures
      this.chordElements.clear();
      this._beatGridTileByIndex?.clear();
      this.chords = [];
      this._rawChordsForEditing = [];
      this.currentChordName = null;
      this.currentChordTime = null;
      this.currentMode = "regular";

      // 🎯 Clean up last active element reference
      this._lastActiveElement = null;
      this._lastHighlightedChordIndex = -1;

      // 📊 Clean up beat grid cache
      this._beatGridTiles = [];
      this._lastBeatGridActiveIndex = -1;
      this._lastBeatGridTime = null;

      DEBUG &&
        console.log(
          "[PreviewPanel] 🧹 Destroyed and cleaned up - No memory leaks"
        );
    }

    async _refreshChords() {
      const requestId = ++this._refreshRequestId;
      try {
        this._updateQuickModeSwitchState(this.currentMode);
        this._applyQuickModeSwitchVisibility();
        // 📊 Cache RTL state to avoid querySelector in hot loop
        const lyricsPanel = document.querySelector(".yt-lyrics-chords-panel");
        this._isRTL = lyricsPanel?.classList.contains("yt-lyrics-chords-rtl") || false;

        const chords = await this._getChordsForMode(this.currentMode);
        if (!this.isVisible || requestId !== this._refreshRequestId) {
          return;
        }

        await this._renderChords(chords);
        if (!this.isVisible || requestId !== this._refreshRequestId) {
          return;
        }

        if (this.currentChordName) {
          this._highlightChord(this.currentChordName, this.currentChordTime);
        }
        await this._updateEditsSummaryButtonState();
      } catch (e) {
        if (!this.isVisible || requestId !== this._refreshRequestId) {
          return;
        }
        console.error("[PreviewPanel] Failed to refresh chords:", e);
        this._renderEmpty("Failed to load chords");
        await this._updateEditsSummaryButtonState();
      }
    }

    _normalizeModeValue(modeValue) {
      const value = String(modeValue || "regular").trim();
      if (value === "harmonic" || value === "harmonicPlus" || value === "regularPlus" || value === "regular") {
        return value;
      }
      return "regular";
    }

    _shouldSwapPairsForActiveChord(panelIsRTL) {
      const directionMode = normalizePreviewActiveChordDirection(
        this.activeChordDirection
      );

      if (directionMode === "rtl") {
        return true;
      }
      if (directionMode === "ltr") {
        return false;
      }
      return !!panelIsRTL;
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
      if (!this.modeSwitchElement) return;
      const visible = forceVisible === null
        ? this._isQuickModeSwitchVisible()
        : forceVisible !== false;
      this.modeSwitchElement.style.display = visible ? "inline-flex" : "none";
      this.modeSwitchElement.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    _updateQuickModeSwitchState(modeValue = null) {
      const safeMode = this._normalizeModeValue(modeValue || this.currentMode || window.chordsMode || "regular");
      if (this.modeSwitchButtons && this.modeSwitchButtons.size > 0) {
        this.modeSwitchButtons.forEach((button, modeKey) => {
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
        const mode = this._normalizeModeValue(this.currentMode || window.chordsMode || "regular");
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
        console.warn("[PreviewPanel] Failed toggling Easy Key:", error);
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
            console.warn("[PreviewPanel] Failed changing transpose:", error);
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
      const previousMode = this._normalizeModeValue(window.chordsMode || this.currentMode || "regular");
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
          this.currentMode = this._normalizeModeValue(window.chordsMode || nextMode);
          this._updateQuickModeSwitchState(this.currentMode);
          return;
        }

        this.currentMode = nextMode;
        window.chordsMode = nextMode;
        await chrome.storage.sync.set({ chordsMode: nextMode });

        window.dispatchEvent(
          new CustomEvent("yc:modeChanged", {
            detail: {
              newMode: nextMode,
              previousMode,
              source: "previewQuickModeSwitch",
            },
          })
        );

        if (typeof window.refreshLyricsChordsPanel === "function") {
          try {
            await window.refreshLyricsChordsPanel();
          } catch (refreshError) {
            console.warn("[PreviewPanel] Failed refreshing main panel after mode switch:", refreshError);
          }
        }
      } catch (error) {
        console.warn("[PreviewPanel] Quick mode switch failed:", error);
        this.currentMode = this._normalizeModeValue(window.chordsMode || previousMode);
        this._updateQuickModeSwitchState(this.currentMode);
      }
    }

    async _updateEditsSummaryButtonState() {
      const button = this.editsSummaryButtonElement;
      if (!button) return;

      const requestId = ++this._editsSummaryRequestId;

      const applyState = ({ state = "none", title = "No chord edits" } = {}) => {
        if (!this.editsSummaryButtonElement || this.editsSummaryButtonElement !== button) return;
        if (requestId !== this._editsSummaryRequestId) return;

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
      const videoId = this._extractVideoId() || window.currentVideoId || null;
      if (!manager?.getChordEditsSummary || !videoId) {
        applyState({ state: "none", title: "No chord edits" });
        return;
      }

      try {
        const summary = await manager.getChordEditsSummary({
          videoId,
          mode: this.currentMode || window.chordsMode || "regular",
          threshold: window.hideQuickChordsThreshold,
          fallbackSongChords: Array.isArray(this._rawChordsForEditing)
            ? this._rawChordsForEditing
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
        console.warn("[PreviewPanel] Failed loading edits summary:", error);
        applyState({ state: "none", title: "No chord edits" });
      }
    }

    async _getChordsForMode(mode) {
      // Get chords from PANEL_SUBSET.chordText (chronological order)
      if (window.PANEL_SUBSET && window.PANEL_SUBSET.chordText) {
        let chordText;
        switch (mode) {
          case "regularPlus":
            chordText = window.PANEL_SUBSET.chordText.regularPlus || window.PANEL_SUBSET.chordText.regular;
            break;
          case "harmonic":
            chordText = window.PANEL_SUBSET.chordText.harmonic;
            break;
          case "harmonicPlus":
            chordText = window.PANEL_SUBSET.chordText.harmonicPlus;
            break;
          default:
            chordText = window.PANEL_SUBSET.chordText.regular;
        }
        if (chordText) {
          const chords = this._parseChordText(chordText);
          DEBUG &&
            console.log(
              `[PreviewPanel] ✅ Using PANEL_SUBSET.chordText with ${chords.length} chords (${mode} mode, chronological order)`
            );
          return chords;
        }
      }

      // Fallback to IndexedDB
      DEBUG &&
        console.log(
          "[PreviewPanel] ⚠️ PANEL_SUBSET.chordText not available, falling back to IndexedDB"
        );
      const videoId = this._extractVideoId();
      if (!videoId) {
        throw new Error("No video ID found");
      }

      const data = await this._getChordData(videoId);
      if (!data) {
        throw new Error("No chord data found");
      }

      let chordText;
      switch (mode) {
        case "regularPlus":
          chordText = data.chordTextRegularPlus || data.chordText;
          break;
        case "harmonic":
          chordText = data.chordTextHarmonic || data.chordText;
          break;
        case "harmonicPlus":
          chordText = data.chordTextHarmonicPlus || data.chordText;
          break;
        default:
          chordText = data.chordText;
      }

      if (!chordText) {
        throw new Error("No chord text for mode: " + mode);
      }

      const chords = this._parseChordText(chordText);
      DEBUG &&
        console.log(
          `[PreviewPanel] Loaded ${chords.length} chords from IndexedDB (${mode} mode)`
        );
      return chords;
    }

    _parseChordText(text) {
      if (!text) return [];

      const chords = text
        .split(",")
        .map((entry) => {
          const [timeStr, chordName] = entry.split(":");
          if (!timeStr || !chordName) return null;

          return {
            name: chordName.trim(),
            time: parseFloat(timeStr),
          };
        })
        .filter((c) => c !== null);

      // Return ALL chords in chronological order (with duplicates)
      // This matches the main panel behavior
      return chords;
    }

    async _getChordData(videoId) {
      // Try using existing database manager
      if (window.ycDatabase?.get) {
        return await window.ycDatabase.get("chords", videoId);
      }

      // Fallback: direct IndexedDB access
      return new Promise((resolve, reject) => {
        const request = indexedDB.open("YouChordsDB", 1);

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
          const db = request.result;

          if (!db.objectStoreNames.contains("chords")) {
            db.close(); // Close connection
            resolve(null);
            return;
          }

          const transaction = db.transaction(["chords"], "readonly");
          const store = transaction.objectStore("chords");
          const getRequest = store.get(videoId);

          getRequest.onsuccess = () => {
            db.close(); // Close connection after success
            resolve(getRequest.result);
          };
          getRequest.onerror = () => {
            db.close(); // Close connection after error
            reject(getRequest.error);
          };
        };
      });
    }

    _extractVideoId() {
      if (window.currentVideoId) return window.currentVideoId;

      if (window.ycUtils?.extractVideoId) {
        return window.ycUtils.extractVideoId(location.href);
      }

      const match = location.href.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?\s]+)/
      );
      return match ? match[1] : null;
    }

    async _prepareDisplayChords(chords) {
      const rawChords = Array.isArray(chords) ? chords : [];
      this._rawChordsForEditing = rawChords;

      const manager = window.chordEditsManager;
      if (!manager?.applyToChords) {
        const fallback = window.filterQuickChords
          ? window.filterQuickChords(rawChords)
          : rawChords;
        return Array.isArray(fallback) ? fallback : [];
      }

      const videoId = this._extractVideoId();
      if (!videoId) {
        const fallback = window.filterQuickChords
          ? window.filterQuickChords(rawChords)
          : rawChords;
        return Array.isArray(fallback) ? fallback : [];
      }

      try {
        const prepared = await manager.applyToChords({
          videoId,
          mode: this.currentMode || window.chordsMode || "regular",
          chords: rawChords,
          quickEnabled: window.hideQuickChordsEnabled !== false,
          threshold: window.hideQuickChordsThreshold,
        });
        return Array.isArray(prepared?.chords) ? prepared.chords : [];
      } catch (error) {
        console.warn("[PreviewPanel] Failed applying chord edits, fallback to quick filter:", error);
        const fallback = window.filterQuickChords
          ? window.filterQuickChords(rawChords)
          : rawChords;
        return Array.isArray(fallback) ? fallback : [];
      }
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

    _applyEditPreviewHighlightForTile(tile, chord, fallbackIndex, previewState = null) {
      if (!tile || !chord) return;

      const manager = window.chordEditsManager;
      const preview = previewState || manager?.getEditPreviewState?.();
      if (!preview?.active) {
        tile.classList.remove("yc-edit-preview");
        tile.classList.remove("yc-remove-preview");
        return;
      }

      const currentVideoId = this._extractVideoId();
      if (preview.videoId && currentVideoId && preview.videoId !== currentVideoId) {
        tile.classList.remove("yc-edit-preview");
        tile.classList.remove("yc-remove-preview");
        return;
      }

      const activeMode = manager?.normalizeMode
        ? manager.normalizeMode(this.currentMode || window.chordsMode || "regular")
        : (this.currentMode || window.chordsMode || "regular");
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
      const chordSourceKey = this._buildPreviewSourceKey(chord, fallbackIndex);
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

    _clearTimingPreviewHighlights() {
      const tiles = this.gridElement?.querySelectorAll(".yc-preview-chord");
      if (!tiles || !tiles.length) return;
      tiles.forEach((tile) => {
        const fallbackIndex = Number.parseInt(tile.getAttribute("data-index") || "-1", 10);
        const chord =
          Number.isInteger(fallbackIndex) && fallbackIndex >= 0 && Array.isArray(this.chords)
            ? this.chords[fallbackIndex]
            : null;
        tile.classList.remove(
          "yc-timing-preview",
          "yc-timing-preview-before",
          "yc-timing-preview-current",
          "yc-timing-preview-after"
        );
        tile.removeAttribute("data-yc-timing-role-label");
        this._applySplitCornerMarkers(tile, chord);
      });
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
          width: 22px;
          height: 22px;
          border-${vertical === "top" ? "top" : "bottom"}: 6px solid ${color};
          border-${horizontal === "left" ? "left" : "right"}: 6px solid ${color};
          border-radius: ${vertical === "top" && horizontal === "left" ? "9px 0 0 0" :
            vertical === "top" && horizontal === "right" ? "0 9px 0 0" :
              vertical === "bottom" && horizontal === "left" ? "0 0 0 9px" : "0 0 9px 0"};
          box-sizing: border-box;
          pointer-events: none;
          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.65));
          z-index: 14;
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

    _applyTimingPreviewHighlightForTile(tile, chord, fallbackIndex, detail = null) {
      if (!tile) return;
      tile.classList.remove(
        "yc-timing-preview",
        "yc-timing-preview-before",
        "yc-timing-preview-current",
        "yc-timing-preview-after"
      );
      tile.removeAttribute("data-yc-timing-role-label");
      this._applySplitCornerMarkers(tile, chord);
      if (!chord) return;
      if (!detail?.active) return;

      const role = this._getTimingPreviewRoleForChord(chord, fallbackIndex, detail);
      if (!role) return;

      const labelByRole = {
        before: "Before",
        current: "Current",
        after: "After",
      };
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

    _applyTimingPreviewHighlights(detail = null) {
      const tiles = this.gridElement?.querySelectorAll(".yc-preview-chord");
      if (!tiles || !tiles.length) return;

      tiles.forEach((tile) => {
        const indexRaw = tile.getAttribute("data-index");
        const fallbackIndex = Number.parseInt(indexRaw || "-1", 10);
        const chord =
          Number.isInteger(fallbackIndex) && fallbackIndex >= 0 && Array.isArray(this.chords)
            ? this.chords[fallbackIndex]
            : null;
        this._applyTimingPreviewHighlightForTile(tile, chord, fallbackIndex, detail);
      });
    }

    _applyEditPreviewHighlights(previewState = null) {
      if (!this.gridElement) return;

      const manager = window.chordEditsManager;
      const preview = previewState || manager?.getEditPreviewState?.();
      const tiles = this.gridElement.querySelectorAll(".yc-preview-chord");
      if (!tiles || !tiles.length) return;

      tiles.forEach((tile) => {
        const indexRaw = tile.getAttribute("data-index");
        const fallbackIndex = Number.parseInt(indexRaw || "-1", 10);
        const chord =
          Number.isInteger(fallbackIndex) && fallbackIndex >= 0 && Array.isArray(this.chords)
            ? this.chords[fallbackIndex]
            : null;
        if (!chord) {
          tile.classList.remove("yc-edit-preview");
          tile.classList.remove("yc-remove-preview");
          return;
        }
        this._applyEditPreviewHighlightForTile(tile, chord, fallbackIndex, preview);
      });
    }

    _bindChordTileActions(tile, chord, displayIndex) {
      if (!tile || !chord) return;
      const actions = tile.querySelector(".yc-preview-chord-actions");
      if (!actions) return;

      const editButton = actions.querySelector(".yc-preview-chord-action-edit");
      const timeButton = actions.querySelector(".yc-preview-chord-action-time");
      const removeButton = actions.querySelector(".yc-preview-chord-action-remove");
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
          : [displayIndex];

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
        if (!showEdit || !manager.openChordReplacePicker) return;

        const initialVideoId = this._extractVideoId() || window.currentVideoId || null;
        const activeMode = this.currentMode || window.chordsMode || "regular";

        const songChords = manager.buildSongChordList
          ? manager.buildSongChordList(this._rawChordsForEditing || this.chords)
          : [];

        manager.openChordReplacePicker({
          anchorEl: editButton,
          currentValue: currentChordName,
          songChords,
          videoId: initialVideoId,
          mode: activeMode,
          sourceIndices,
          capoContext: "panel",
          onSplit: async () => {
            const resolvedVideoId =
              initialVideoId || this._extractVideoId() || window.currentVideoId || null;
            if (!resolvedVideoId || !manager.splitChordGroup) {
              return { success: false, error: "Split unavailable" };
            }
            return manager.splitChordGroup({
              videoId: resolvedVideoId,
              mode: activeMode,
              sourceIndices,
            });
          },
          onSelect: async (nextChordName, options = {}) => {
            const applyToAll = options?.applyToAll === true;
            const sourceChordPool = this._rawChordsForEditing || this.chords || [];
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
            const resolvedVideoId = initialVideoId || this._extractVideoId() || window.currentVideoId || null;
            if (!resolvedVideoId) {
              if (window.ycUtils?.showToast) {
                window.ycUtils.showToast("Could not detect video ID", "!", 2200);
              }
              return;
            }

            if (
              applyToAll &&
              manager.collectSourceGroupsByChordName &&
              manager.replaceChordGroups
            ) {
              const groups = await manager.collectSourceGroupsByChordName({
                videoId: resolvedVideoId,
                mode: activeMode,
                chords: this._rawChordsForEditing || this.chords,
                quickEnabled: window.hideQuickChordsEnabled !== false,
                threshold: window.hideQuickChordsThreshold,
                chordName: currentChordName,
              });

              if (groups.length > 0) {
                await manager.replaceChordGroups({
                  videoId: resolvedVideoId,
                  mode: activeMode,
                  sourceGroups: groups,
                  nextChordName,
                  previousChordName: currentChordName,
                  threshold: window.hideQuickChordsThreshold,
                  capoContext: "panel",
                });
                return;
              }
            }

            await manager.replaceChordGroup({
              videoId: resolvedVideoId,
              mode: activeMode,
              sourceIndices,
              nextChordName,
              previousChordName: currentChordName,
              previousChordNamesByIndex,
              threshold: window.hideQuickChordsThreshold,
              capoContext: "panel",
            });
          },
        });
      };

      if (timeButton) {
        timeButton.onclick = (event) => {
          stopEvent(event);
          if (!showEdit || !manager.openChordTimingEditor) return;

          const videoId = this._extractVideoId() || window.currentVideoId || null;
          if (!videoId) {
            window.ycUtils?.showToast?.("Could not detect video ID", "!", 2200);
            return;
          }
          const activeMode = this.currentMode || window.chordsMode || "regular";
          manager.openChordTimingEditor({
            anchorEl: timeButton,
            videoId,
            mode: activeMode,
            sourceIndices,
            sourceChords: this._rawChordsForEditing || this.chords,
            displayChords: this.chords,
            displayIndex,
            capoContext: "panel",
          });
        };
      }

      removeButton.onclick = async (event) => {
        stopEvent(event);
        if (!showRemove || !manager.removeChordGroup) return;

        const videoId = this._extractVideoId() || window.currentVideoId || null;
        if (!videoId) {
          if (window.ycUtils?.showToast) {
            window.ycUtils.showToast("Could not detect video ID", "!", 2200);
          }
          return;
        }
        const activeMode = this.currentMode || window.chordsMode || "regular";
        const visibleChordName =
          String(tile.getAttribute("data-chord-name") || "").trim() ||
          String(tile.querySelector(".yc-preview-chord-name")?.textContent || "").trim() ||
          (window.getCapoChord ? window.getCapoChord(currentChordName, "panel") : currentChordName);
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
            chords: this._rawChordsForEditing || this.chords,
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
                capoContext: "panel",
              });
            } else {
              for (const group of groups) {
                await manager.removeChordGroup({
                  videoId,
                  mode: activeMode,
                  sourceIndices: group,
                  threshold: window.hideQuickChordsThreshold,
                  removedChordName: currentChordName,
                  capoContext: "panel",
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
          capoContext: "panel",
        });
      };

      this._applyEditPreviewHighlightForTile(tile, chord, displayIndex);
    }

    async _renderChords(chords) {
      this._clearRenderedChords();
      this._createDiagramObserver();

      const filteredChords = await this._prepareDisplayChords(chords);
      this.chords = filteredChords;

      if (!filteredChords || filteredChords.length === 0) {
        this._renderEmpty("No chords available");
        return;
      }

      DEBUG &&
        console.log(
          "🎵 [DEBUG] Original chords order:",
          filteredChords.map((c, i) => `${i}: ${c.name} @ ${c.time}s`)
        );

      // Check if main panel is RTL
      const lyricsPanel = document.querySelector(".yt-lyrics-chords-panel");
      const panelIsRTL = lyricsPanel?.classList.contains("yt-lyrics-chords-rtl");
      const shouldSwapPairs = this._shouldSwapPairsForActiveChord(panelIsRTL);

      // 📊 Apply effective direction class for beat-grid fill direction
      if (shouldSwapPairs) {
        this.panelElement?.classList.add("yc-preview-rtl");
      } else {
        this.panelElement?.classList.remove("yc-preview-rtl");
      }

      // Create display array with original indices for beat grid calculation
      // Each item has: { chord, originalIndex }
      let displayData = filteredChords.map((chord, idx) => ({ chord, originalIndex: idx }));

      if (shouldSwapPairs) {
        // In RTL, reverse pairs (swap within each row, but keep row order)
        const swapped = [];
        for (let i = 0; i < displayData.length; i += 2) {
          if (i + 1 < displayData.length) {
            // Swap the pair: [A, B] becomes [B, A]
            swapped.push(displayData[i + 1]);
            swapped.push(displayData[i]);
          } else {
            // Odd number of chords, keep the last one as is
            swapped.push(displayData[i]);
          }
        }
        displayData = swapped;
      }

      DEBUG &&
        console.log(
          "🎵 [DEBUG] Display chords order:",
          displayData.map((d, i) => `${i}: ${d.chord.name} @ ${d.chord.time}s (orig: ${d.originalIndex})`)
        );

      const { rows, totalHeight } = this._buildVirtualRows(displayData);
      this._virtualRows = rows;
      this._virtualContentHeight = totalHeight;
      this._usingVirtualScrolling = true;
      this.gridElement.classList.add("yc-preview-virtualized");
      this._updateVirtualGridHeight();
      this._renderVirtualWindow(true);

      // 🧹 Clear displayData if it was swapped (help GC)
      if (shouldSwapPairs) {
        displayData.length = 0;
        displayData = null;
      }

      DEBUG &&
        console.log(
          `[PreviewPanel] Virtualized ${chords.length} chords into ${rows.length} rows (panelRTL: ${panelIsRTL}, activeDirection: ${this.activeChordDirection}, swappedPairs: ${shouldSwapPairs})`
        );
    }

    _createChordTile(chord, index) {
      const tile = document.createElement("div");
      tile.className = "yc-preview-chord";
      tile.classList.toggle("yc-split-added", chord.__splitAdded === true && chord.__splitEditingActive === true);
      if (chord.__splitAdded === true && chord.__splitEditingActive === true) {
        tile.setAttribute("data-yc-split-id", String(chord.__splitSegmentId || ""));
        tile.setAttribute("data-yc-split-side", String(chord.__splitSide || ""));
      }
      this._applySplitCornerMarkers(tile, chord);

      // 🎸 FIX: שומר את האקורד המתורגם ב-data-chord-name כדי שהרענון יעבוד נכון
      // גם שומר את האקורד המקורי ב-data-original-chord לצורך תרגום עתידי
      const displayName = window.getCapoChord ? window.getCapoChord(chord.name, "panel") : chord.name;
      tile.setAttribute("data-chord-name", displayName);
      tile.setAttribute("data-original-chord", chord.name);
      tile.setAttribute("data-index", index);

      DEBUG &&
        console.log(
          `🎵 [DEBUG] _createChordTile: ${chord.name} -> ${displayName}, time=${chord.time
          }, has time? ${chord.time !== undefined}`
        );

      // Add data-time attribute if available
      if (chord.time !== undefined) {
        tile.setAttribute("data-time", chord.time);

        // 🎯 Click to seek video to this chord's time and highlight it
        tile.style.cursor = "pointer";
        tile.onclick = () => {
          const video = document.querySelector("video");
          if (video) {
            video.currentTime = chord.time;
            DEBUG && console.log(`[PreviewPanel] Seeking to chord "${chord.name}" at ${chord.time}s`);
          }
          // 🎯 Reset user scrolling flag so highlight scroll works
          this._isUserScrolling = false;
          // 🎯 Highlight clicked chord with blue border and scroll to correct position
          this._highlightChord(chord.name, chord.time);
        };
      }

      // Chord name - 🎸 תמיכה בקאפו (פאנל = panel)
      const nameEl = document.createElement("div");
      nameEl.className = "yc-preview-chord-name";
      nameEl.textContent = window.chordRenderer?.getDisplayChordName
        ? window.chordRenderer.getDisplayChordName(displayName)
        : displayName;
      tile.appendChild(nameEl);

      if (chord.time !== undefined) {
        const timeEl = document.createElement("div");
        timeEl.className = "yc-preview-chord-time";
        timeEl.textContent = formatPreviewTime(chord.time);
        tile.appendChild(timeEl);
      }

      // Diagram - 🎸 תמיכה בקאפו - הדיאגרמה צריכה להציג את האקורד המתורגם
      const diagramEl = document.createElement("div");
      diagramEl.className = "yc-preview-chord-diagram";
      tile.appendChild(diagramEl);

      // 📊 Beat Grid - Progress bar squares (only if enabled)
      if (window.beatGridEnabled !== false) {
        const beatGrid = document.createElement("div");
        beatGrid.className = "yc-preview-beat-grid";

        const { totalBeats, marginTop } = this._getBeatGridMetricsForIndex(index);
        tile.style.marginTop = `${marginTop}px`;

        // Set grid columns dynamically - max 10 per row
        if (totalBeats <= 0) {
          beatGrid.style.display = "none";
        } else if (totalBeats <= PREVIEW_MAX_BEATS_PER_ROW) {
          beatGrid.style.gridTemplateColumns = `repeat(${totalBeats}, 1fr)`;
        } else {
          beatGrid.style.gridTemplateColumns = `repeat(${PREVIEW_MAX_BEATS_PER_ROW}, 1fr)`;
        }

        // Create beat cells
        for (let i = 0; i < totalBeats; i++) {
          const cell = document.createElement("div");
          cell.className = "yc-preview-beat-cell";
          cell.setAttribute("data-beat-index", i);
          beatGrid.appendChild(cell);
        }

        tile.appendChild(beatGrid);
      }

      const actions = document.createElement("div");
      actions.className = "yc-preview-chord-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "yc-preview-chord-action-btn yc-preview-chord-action-edit";
      editButton.textContent = "Edit";
      editButton.title = "Change chord";

      const timeButton = document.createElement("button");
      timeButton.type = "button";
      timeButton.className = "yc-preview-chord-action-btn yc-preview-chord-action-time";
      timeButton.textContent = "Time";
      timeButton.title = "Adjust chord timing";

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "yc-preview-chord-action-btn yc-preview-chord-action-remove";
      removeButton.textContent = "X";
      removeButton.title = "Remove chord";

      actions.appendChild(editButton);
      actions.appendChild(timeButton);
      actions.appendChild(removeButton);
      tile.appendChild(actions);

      this._bindChordTileActions(tile, chord, index);

      return tile;
    }

    _renderChordDiagram(chordName, container) {
      try {
        // 🔍 DEBUG: בדיקת פוזיציה נוכחית
        const currentPos = window.currentChordPositions?.get(chordName);
        DEBUG &&
          console.log(
            `🔍 [PreviewPanel DEBUG] _renderChordDiagram called for "${chordName}":`,
            {
              chordName,
              currentPosition: currentPos,
              hasCurrentChordPositions: !!window.currentChordPositions,
              hasChordRenderer: !!window.chordRenderer,
              hasRenderChordMethod: !!window.chordRenderer?.renderChord,
            }
          );

        // ✅ Use renderChord (the correct method with arrows and counter)
        if (window.chordRenderer?.renderChord) {
          DEBUG &&
            console.log(
              `🔍 [PreviewPanel DEBUG] Calling chordRenderer.renderChord for "${chordName}"`
            );

          // renderChord returns a container with the full diagram
          const chordElement = window.chordRenderer.renderChord(
            chordName,
            "", // No time label in preview
            false // Not active
          );

          if (chordElement) {
            // Extract just the SVG from the container
            const svg = chordElement.querySelector("svg");

            // 🔍 DEBUG: בדיקת מה שנוצר
            const counter = svg?.querySelector(".chord-position-counter");
            const arrows = svg?.querySelectorAll(
              ".chord-arrow-left, .chord-arrow-right"
            );
            DEBUG &&
              console.log(
                `🔍 [PreviewPanel DEBUG] Chord element created for "${chordName}":`,
                {
                  hasElement: !!chordElement,
                  hasSvg: !!svg,
                  hasCounter: !!counter,
                  counterText: counter?.textContent,
                  arrowsCount: arrows?.length,
                }
              );

            if (svg) {
              container.appendChild(svg);
              return;
            }
          }
        }

        // Fallback to PANEL_SUBSET if chordRenderer not available
        if (window.PANEL_SUBSET?.chords?.[chordName]) {
          DEBUG &&
            console.log(
              `🔍 [PreviewPanel DEBUG] Fallback to PANEL_SUBSET for "${chordName}"`
            );
          this._renderSimpleDiagram(
            chordName,
            container,
            window.PANEL_SUBSET.chords[chordName]
          );
          return;
        }

        // Final fallback
        DEBUG &&
          console.log(
            `🔍 [PreviewPanel DEBUG] Using placeholder for "${chordName}"`
          );
        this._renderPlaceholder(container);
      } catch (e) {
        DEBUG && console.warn("[PreviewPanel] Failed to render diagram:", e);
        this._renderPlaceholder(container);
      }
    }

    _disconnectDiagramObserver() {
      if (this._diagramObserver) {
        this._diagramObserver.disconnect();
        this._diagramObserver = null;
      }
    }

    _createDiagramObserver() {
      this._disconnectDiagramObserver();
      this._lazyDiagramContainers?.clear();

      if (!("IntersectionObserver" in window) || !this.panelElement) {
        return null;
      }

      this._diagramObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting && entry.intersectionRatio <= 0) return;
            const container = entry.target;
            this._diagramObserver?.unobserve(container);
            this._lazyDiagramContainers?.delete(container);
            this._renderQueuedDiagram(container);
          });
        },
        {
          root: this.panelElement,
          rootMargin: "360px 0px",
          threshold: 0,
        }
      );

      return this._diagramObserver;
    }

    _queueChordDiagram(tile, container, chordName) {
      if (!container) return;

      container.textContent = "";
      container.dataset.chordName = chordName || "";
      container.dataset.rendered = "false";

      if (!this._diagramObserver) {
        this._renderQueuedDiagram(container);
        return;
      }

      this._lazyDiagramContainers.add(container);
      this._diagramObserver.observe(container);

      if (tile?.classList.contains("active")) {
        this._renderQueuedDiagram(container);
      }
    }

    _renderQueuedDiagram(container, force = false) {
      if (!container || !container.isConnected) return;
      if (!force && container.dataset.rendered === "true") return;

      const chordName = container.dataset.chordName;
      if (!chordName) return;

      this._diagramObserver?.unobserve(container);
      this._lazyDiagramContainers?.delete(container);
      container.innerHTML = "";
      this._renderChordDiagram(chordName, container);
      container.dataset.rendered = "true";

      const tile = container.closest(".yc-preview-chord");
      if (tile) {
        this._schedulePositionControlsPlacement(tile);
      }
    }

    _renderTileDiagramIfNeeded(tile, force = false) {
      const container = tile?.querySelector?.(".yc-preview-chord-diagram");
      if (!container) return;
      this._renderQueuedDiagram(container, force);
    }

    _clearRenderedChords({ clearChords = false } = {}) {
      this._disconnectDiagramObserver();
      this._lazyDiagramContainers?.clear();
      if (this._virtualScrollRAF !== null) {
        cancelAnimationFrame(this._virtualScrollRAF);
        this._virtualScrollRAF = null;
      }

      if (this.gridElement) {
        this.gridElement.innerHTML = "";
        this.gridElement.style.height = "";
        this.gridElement.classList.remove("yc-preview-virtualized");
      }

      this.chordElements?.clear();
      this._beatGridTiles = [];
      this._beatGridTileByIndex?.clear();
      this._virtualRows = [];
      this._virtualContentHeight = 0;
      this._rowIndexByChordIndex?.clear();
      this._renderedVirtualRows?.clear();
      this._renderedTileByIndex?.clear();
      this._usingVirtualScrolling = false;
      this._lastActiveElement = null;
      this._lastHighlightedChordIndex = -1;
      this._lastBeatGridActiveIndex = -1;
      this._lastBeatGridTime = null;

      if (clearChords) {
        this.chords = [];
        this._rawChordsForEditing = [];
        this.currentChordName = null;
        this.currentChordTime = null;
      }
    }

    _getBeatGridMetricsForIndex(index) {
      if (window.beatGridEnabled === false || !this._previewBeatGridEnabled) {
        return { totalBeats: 0, marginTop: 0 };
      }

      const chord = this.chords?.[index];
      if (!chord) return { totalBeats: 0, marginTop: 0 };

      const nextChord = this.chords[index + 1];
      const duration = nextChord ? nextChord.time - chord.time : 3.0;
      const totalBeats = Math.max(0, Math.floor(duration / PREVIEW_BEAT_DURATION));
      const numRows = Math.ceil(totalBeats / PREVIEW_MAX_BEATS_PER_ROW) || 1;
      const marginTop = (numRows * PREVIEW_BEAT_ROW_HEIGHT) + PREVIEW_BEAT_GRID_MARGIN;

      return { totalBeats, marginTop };
    }

    _buildVirtualRows(displayData) {
      const rows = [];
      let top = 0;
      this._rowIndexByChordIndex.clear();
      const columns = PREVIEW_COLUMNS;
      const tileHeight = PREVIEW_TILE_HEIGHT;

      for (let i = 0; i < displayData.length; i += columns) {
        const items = displayData.slice(i, i + columns);
        const marginTop = items.reduce((max, item) => {
          const metrics = this._getBeatGridMetricsForIndex(item.originalIndex);
          return Math.max(max, metrics.marginTop);
        }, 0);
        const height = tileHeight + marginTop + PREVIEW_ROW_GAP;
        const rowIndex = rows.length;

        items.forEach((item) => {
          this._rowIndexByChordIndex.set(item.originalIndex, rowIndex);
        });

        rows.push({
          index: rowIndex,
          top,
          height,
          marginTop,
          items,
        });
        top += height;
      }

      return {
        rows,
        totalHeight: top + PREVIEW_VIRTUAL_BOTTOM_PADDING,
      };
    }

    _findRowIndexForOffset(offset) {
      const rows = this._virtualRows || [];
      if (!rows.length) return -1;

      let left = 0;
      let right = rows.length - 1;
      let answer = rows.length - 1;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const row = rows[mid];
        if (row.top + row.height >= offset) {
          answer = mid;
          right = mid - 1;
        } else {
          left = mid + 1;
        }
      }

      return answer;
    }

    _scheduleVirtualRender() {
      if (this._virtualScrollRAF !== null) return;

      this._virtualScrollRAF = requestAnimationFrame(() => {
        this._virtualScrollRAF = null;
        this._renderVirtualWindow();
      });
    }

    _removeVirtualRow(rowIndex) {
      const rowEl = this._renderedVirtualRows.get(rowIndex);
      if (!rowEl) return;

      if (this._lastActiveElement && rowEl.contains(this._lastActiveElement)) {
        this._lastActiveElement = null;
      }

      rowEl.querySelectorAll(".yc-preview-chord").forEach((tile) => {
        const index = Number.parseInt(tile.getAttribute("data-index") || "-1", 10);
        if (Number.isInteger(index) && index >= 0) {
          this._renderedTileByIndex.delete(index);
          this._beatGridTileByIndex.delete(index);
          this.chordElements.delete(index);
        }

        const diagram = tile.querySelector(".yc-preview-chord-diagram");
        if (diagram) {
          this._diagramObserver?.unobserve(diagram);
          this._lazyDiagramContainers?.delete(diagram);
        }
      });

      this._beatGridTiles = this._beatGridTiles.filter(
        (entry) => entry.rowIndex !== rowIndex
      );
      rowEl.remove();
      this._renderedVirtualRows.delete(rowIndex);
    }

    _renderVirtualRow(row) {
      if (!row || this._renderedVirtualRows.has(row.index)) return;

      const rowEl = document.createElement("div");
      rowEl.className = "yc-preview-virtual-row";
      rowEl.style.top = `${row.top}px`;
      rowEl.style.height = `${row.height}px`;
      rowEl.style.width = `${(PREVIEW_COLUMNS * PREVIEW_TILE_WIDTH) + ((PREVIEW_COLUMNS - 1) * PREVIEW_COLUMN_GAP)}px`;
      rowEl.style.gridTemplateColumns = `repeat(${PREVIEW_COLUMNS}, ${PREVIEW_TILE_WIDTH}px)`;
      rowEl.style.columnGap = `${PREVIEW_COLUMN_GAP}px`;
      rowEl.setAttribute("data-row-index", String(row.index));

      const pendingDiagrams = [];
      const previewState = window.chordEditsManager?.getEditPreviewState?.() || null;
      const timingPreviewState = window.chordEditsManager?.getTimingPreviewState?.() || null;
      const activeIndex = this._lastHighlightedChordIndex;

      row.items.forEach(({ chord, originalIndex }) => {
        const tile = this._createChordTile(chord, originalIndex);
        tile.setAttribute("data-virtual-row-index", String(row.index));

        if (window.beatGridEnabled !== false && this._previewBeatGridEnabled) {
          tile.style.marginTop = `${row.marginTop}px`;
        } else {
          tile.style.marginTop = "0px";
          const beatGrid = tile.querySelector(".yc-preview-beat-grid");
          if (beatGrid) {
            beatGrid.style.display = "none";
          }
        }

        if (originalIndex === activeIndex) {
          tile.classList.add("active");
          this._lastActiveElement = tile;
        }

        this._applyEditPreviewHighlightForTile(tile, chord, originalIndex, previewState);
        if (timingPreviewState?.active) {
          this._applyTimingPreviewHighlightForTile(
            tile,
            chord,
            originalIndex,
            timingPreviewState
          );
        }

        const entry = {
          tile,
          index: originalIndex,
          rowIndex: row.index,
          state: null,
          beatIndex: -1,
        };
        this._beatGridTiles.push(entry);
        this._beatGridTileByIndex.set(originalIndex, entry);
        this._renderedTileByIndex.set(originalIndex, tile);
        this.chordElements.set(originalIndex, tile);

        rowEl.appendChild(tile);
        pendingDiagrams.push({
          tile,
          container: tile.querySelector(".yc-preview-chord-diagram"),
          chordName: tile.getAttribute("data-chord-name") || chord.name,
        });
      });

      this.gridElement.appendChild(rowEl);
      this._renderedVirtualRows.set(row.index, rowEl);

      pendingDiagrams.forEach(({ tile, container, chordName }) => {
        this._queueChordDiagram(tile, container, chordName);
        if (tile.classList.contains("active")) {
          this._renderTileDiagramIfNeeded(tile);
        }
      });

      if (Number.isFinite(this._lastBeatGridTime)) {
        const activeBeatIndex = this._getActiveChordIndexForTime(this._lastBeatGridTime);
        row.items.forEach(({ originalIndex }) => {
          const entry = this._beatGridTileByIndex.get(originalIndex);
          this._applyBeatGridState(entry, this._lastBeatGridTime, activeBeatIndex);
        });
      }
    }

    _renderVirtualWindow() {
      if (!this._usingVirtualScrolling || !this.panelElement || !this.gridElement) {
        return;
      }

      const rows = this._virtualRows || [];
      if (!rows.length) return;

      const scale = this._getPreviewScale();
      const viewportHeight = (this.panelElement.clientHeight || 600) / scale;
      const averageRowHeight = rows.length
        ? Math.max(1, rows[Math.min(rows.length - 1, 0)].height || 1)
        : PREVIEW_TILE_HEIGHT + PREVIEW_ROW_GAP;
      const bufferPx = averageRowHeight * PREVIEW_VIRTUAL_BUFFER_ROWS;
      const contentScrollTop = (this.panelElement.scrollTop || 0) / scale;
      const startOffset = Math.max(0, contentScrollTop - bufferPx);
      const endOffset = contentScrollTop + viewportHeight + bufferPx;

      let startRow = this._findRowIndexForOffset(startOffset);
      let endRow = this._findRowIndexForOffset(endOffset);

      if (startRow < 0) startRow = 0;
      if (endRow < 0) endRow = rows.length - 1;

      startRow = Math.max(0, startRow - 1);
      endRow = Math.min(rows.length - 1, endRow + 1);

      for (const rowIndex of Array.from(this._renderedVirtualRows.keys())) {
        if (rowIndex < startRow || rowIndex > endRow) {
          this._removeVirtualRow(rowIndex);
        }
      }

      for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
        this._renderVirtualRow(rows[rowIndex]);
      }
    }

    _getActiveChordIndexForTime(time) {
      if (!this.chords || this.chords.length === 0 || !Number.isFinite(time)) {
        return -1;
      }

      let activeChordIndex = -1;
      for (let i = this.chords.length - 1; i >= 0; i--) {
        if (this.chords[i].time <= time) {
          activeChordIndex = i;
          break;
        }
      }

      return activeChordIndex;
    }

    _findChordIndex(chordName, chordTime) {
      const normalizedName = String(chordName || "").trim().toLowerCase();
      const hasTime = Number.isFinite(Number(chordTime));
      const targetTime = Number(chordTime);

      if (!this.chords || this.chords.length === 0) return -1;

      if (hasTime) {
        const exactIndex = this.chords.findIndex((chord) => {
          const name = String(chord?.name || chord?.chord || "").trim().toLowerCase();
          const displayName = window.getCapoChord
            ? String(window.getCapoChord(chord?.name || chord?.chord || "", "panel")).trim().toLowerCase()
            : name;
          return (name === normalizedName || displayName === normalizedName) &&
            Math.abs(Number(chord.time) - targetTime) < 0.001;
        });
        if (exactIndex >= 0) return exactIndex;
      }

      return this.chords.findIndex((chord) => {
        const name = String(chord?.name || chord?.chord || "").trim().toLowerCase();
        const displayName = window.getCapoChord
          ? String(window.getCapoChord(chord?.name || chord?.chord || "", "panel")).trim().toLowerCase()
          : name;
        return name === normalizedName || displayName === normalizedName;
      });
    }

    _scrollToChordIndex(index, isScrubbing = false) {
      const rowIndex = this._rowIndexByChordIndex.get(index);
      if (!Number.isInteger(rowIndex)) return;

      const row = this._virtualRows[rowIndex];
      if (!row || !this.panelElement) return;

      const previousRow = this._virtualRows[Math.max(0, rowIndex - 1)];
      const offsetFromTop = previousRow?.height || row.height;
      const targetTop = Math.max(0, row.top - offsetFromTop);

      this.panelElement.scrollTo({
        top: targetTop * this._getPreviewScale(),
        behavior: isScrubbing ? "auto" : "smooth",
      });

      if (isScrubbing) {
        this._renderVirtualWindow(true);
      } else {
        this._scheduleVirtualRender();
      }
    }

    _scrollRenderedTileIntoSecondRow(targetElement, isScrubbing = false) {
      if (!targetElement || !this.panelElement) return;

      const rect = targetElement.getBoundingClientRect();
      const panelRect = this.panelElement.getBoundingClientRect();
      const cardHeight = rect.height;
      const rowHeight = cardHeight + (PREVIEW_ROW_GAP * this._getPreviewScale());
      const targetOffsetFromPanelTop = rowHeight;
      const currentOffsetFromPanelTop = rect.top - panelRect.top;
      const scrollDelta = currentOffsetFromPanelTop - targetOffsetFromPanelTop;

      if (Math.abs(scrollDelta) > 5) {
        this.panelElement.scrollBy({
          top: scrollDelta,
          behavior: isScrubbing ? "auto" : "smooth",
        });
        this._scheduleVirtualRender();
      }
    }

    _highlightChordIndex(activeChordIndex, isScrubbing = false) {
      if (!Number.isInteger(activeChordIndex) || activeChordIndex < 0) return;

      if (
        activeChordIndex === this._lastHighlightedChordIndex &&
        !isScrubbing &&
        this._lastActiveElement?.isConnected
      ) {
        return;
      }

      let targetElement = this._renderedTileByIndex.get(activeChordIndex);
      if (!targetElement && !this._isUserScrolling) {
        if (this._lastActiveElement?.classList?.contains("active")) {
          this._lastActiveElement.classList.remove("active");
        }
        this._lastActiveElement = null;
        this._lastHighlightedChordIndex = activeChordIndex;
        this._scrollToChordIndex(activeChordIndex, isScrubbing);
        this._renderVirtualWindow(true);
        targetElement = this._renderedTileByIndex.get(activeChordIndex);
      }

      if (!targetElement) return;

      if (
        this._lastActiveElement &&
        this._lastActiveElement !== targetElement &&
        this._lastActiveElement.classList.contains("active")
      ) {
        this._lastActiveElement.classList.remove("active");
      }

      this._renderTileDiagramIfNeeded(targetElement);
      targetElement.classList.add("active");
      this._lastActiveElement = targetElement;
      this._lastHighlightedChordIndex = activeChordIndex;

      if (this._isUserScrolling) {
        return;
      }

      const video = document.querySelector("video");
      if (video && !video.paused && this._isUserScrolling) {
        this._isUserScrolling = false;
      }

      this._scrollRenderedTileIntoSecondRow(targetElement, isScrubbing);
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

      const nameEl = tile.querySelector(".yc-preview-chord-name");
      const svg = tile.querySelector(".yc-preview-chord-diagram svg");
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

    _renderSimpleDiagram(chordName, container, positions) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "60");
      svg.setAttribute("height", "78");
      svg.setAttribute("viewBox", "0 0 60 78");

      // Simple fretboard
      const strings = 6;
      const frets = 5;
      const padding = 8;
      const gridWidth = 44;
      const gridHeight = 62;
      const stringSpacing = gridWidth / (strings - 1);
      const fretSpacing = gridHeight / frets;

      // Draw strings
      for (let i = 0; i < strings; i++) {
        const x = padding + i * stringSpacing;
        const line = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line"
        );
        line.setAttribute("x1", x);
        line.setAttribute("y1", padding);
        line.setAttribute("x2", x);
        line.setAttribute("y2", padding + gridHeight);
        line.setAttribute("stroke", "#999");
        line.setAttribute("stroke-width", "0.5");
        svg.appendChild(line);
      }

      // Draw frets
      for (let i = 0; i <= frets; i++) {
        const y = padding + i * fretSpacing;
        const line = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line"
        );
        line.setAttribute("x1", padding);
        line.setAttribute("y1", y);
        line.setAttribute("x2", padding + gridWidth);
        line.setAttribute("y2", y);
        line.setAttribute("stroke", i === 0 ? "#333" : "#999");
        line.setAttribute("stroke-width", i === 0 ? "2" : "0.5");
        svg.appendChild(line);
      }

      // Draw finger positions
      // positions can be either an array of position objects or a single position object
      let posData = null;

      if (Array.isArray(positions)) {
        posData = positions.length > 0 ? positions[0] : null;
      } else if (positions && typeof positions === "object") {
        posData = positions;
      }

      if (posData?.frets && Array.isArray(posData.frets)) {
        posData.frets.forEach((fret, stringIndex) => {
          if (fret > 0 && fret <= frets) {
            const x = padding + stringIndex * stringSpacing;
            const y = padding + (fret - 0.5) * fretSpacing;

            const circle = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "circle"
            );
            circle.setAttribute("cx", x);
            circle.setAttribute("cy", y);
            circle.setAttribute("r", "3");
            circle.setAttribute("fill", "#2f7bff");
            svg.appendChild(circle);
          }
        });
      }

      container.appendChild(svg);
    }

    _renderPlaceholder(container) {
      container.innerHTML = '<div style="font-size: 40px;">🎸</div>';
    }

    _renderEmpty(message) {
      this._clearRenderedChords({ clearChords: true });
      this.gridElement.innerHTML = `
        <div class="yc-preview-empty">${message}</div>
      `;
    }

    _updateTheme() {
      // Get main panel
      const lyricsPanel = document.querySelector(".yt-lyrics-chords-panel");
      if (!lyricsPanel || !this.panelElement) return;

      // Detect which theme is active (3 options: black, sepia, light)
      const isSepiaActive = lyricsPanel.classList.contains("sepia-theme");
      const isLightActive = lyricsPanel.classList.contains("light-theme");

      // Remove all theme classes from BOTH panel and size control
      this.panelElement.classList.remove(
        "yc-preview-sepia",
        "yc-preview-black",
        "yc-preview-light"
      );

      if (this.sizeControlElement) {
        this.sizeControlElement.classList.remove(
          "yc-preview-sepia",
          "yc-preview-black",
          "yc-preview-light"
        );
      }

      // Add appropriate theme class to BOTH panel and size control
      if (isLightActive) {
        this.panelElement.classList.add("yc-preview-light");
        if (this.sizeControlElement) {
          this.sizeControlElement.classList.add("yc-preview-light");
        }
        DEBUG && console.log("[PreviewPanel] 🎨 Applied LIGHT theme");
      } else if (isSepiaActive) {
        this.panelElement.classList.add("yc-preview-sepia");
        if (this.sizeControlElement) {
          this.sizeControlElement.classList.add("yc-preview-sepia");
        }
        DEBUG && console.log("[PreviewPanel] 🎨 Applied SEPIA theme");
      } else {
        this.panelElement.classList.add("yc-preview-black");
        if (this.sizeControlElement) {
          this.sizeControlElement.classList.add("yc-preview-black");
        }
        DEBUG && console.log("[PreviewPanel] 🎨 Applied BLACK theme");
      }
    }

    async _syncModeFromStorage() {
      try {
        const result = await chrome.storage.sync.get(["chordsMode"]);
        const storedMode = result.chordsMode || "regular";

        // Update current mode if different
        if (this.currentMode !== storedMode) {
          this.currentMode = storedMode;
          DEBUG &&
            console.log(
              "[PreviewPanel] 🎵 Synced MODE from storage:",
              storedMode
            );
        }
        this._updateQuickModeSwitchState(this.currentMode);
      } catch (error) {
        console.error(
          "[PreviewPanel] ⚠️ Failed to sync MODE from storage:",
          error
        );
        this.currentMode = "regular"; // Fallback to regular
        this._updateQuickModeSwitchState(this.currentMode);
      }
    }

    /**
     * 🎸 רענון כל האקורדים בפאנל Preview לפי קאפו
     */
    _refreshChordsForCapo() {
      if (!this.isVisible || !this.gridElement) return;

      const chordTiles = this.gridElement.querySelectorAll(".yc-preview-chord");
      chordTiles.forEach((tile) => {
        // 🎸 FIX: משתמש ב-data-original-chord כדי לקבל את האקורד המקורי
        const originalChord = tile.getAttribute("data-original-chord") || tile.getAttribute("data-chord-name");
        if (originalChord) {
          const displayName = window.getCapoChord ? window.getCapoChord(originalChord, "panel") : originalChord;

          // 🎸 עדכון data-chord-name עם האקורד המתורגם החדש
          tile.setAttribute("data-chord-name", displayName);

          // עדכון שם האקורד
          const nameEl = tile.querySelector(".yc-preview-chord-name");
          if (nameEl) {
            nameEl.textContent = window.chordRenderer?.getDisplayChordName
              ? window.chordRenderer.getDisplayChordName(displayName)
              : displayName;
          }

          // 🎸 עדכון הדיאגרמה עם האקורד המתורגם
          const diagramEl = tile.querySelector(".yc-preview-chord-diagram");
          if (diagramEl) {
            const wasRendered = diagramEl.dataset.rendered === "true";
            diagramEl.innerHTML = "";
            diagramEl.dataset.chordName = displayName;
            diagramEl.dataset.rendered = "false";
            if (wasRendered || tile.classList.contains("active")) {
              this._renderQueuedDiagram(diagramEl, true);
            } else {
              this._queueChordDiagram(tile, diagramEl, displayName);
            }
          }
        }
      });
      DEBUG && console.log(`[PreviewPanel] 🎸 Refreshed ${chordTiles.length} tiles for capo (names + diagrams)`);
    }

    _highlightChord(chordName, chordTime) {
      DEBUG &&
        console.log(
          `🎯 [DEBUG] _highlightChord called: name="${chordName}", time=${chordTime}`
        );

      const chordIndex = this._findChordIndex(chordName, chordTime);
      if (chordIndex >= 0) {
        this._highlightChordIndex(chordIndex, false);
      } else {
        DEBUG &&
          console.log(
            `❌ [DEBUG] Chord not found: ${chordName} at ${chordTime}s`
          );
        DEBUG &&
          console.log(
            `[PreviewPanel] ⚠️ Chord not found: ${chordName} at ${chordTime}s`
          );
      }
    }

    _highlightChordByTime(time, isScrubbing = false) {
      const activeChordIndex = this._getActiveChordIndexForTime(time);

      if (activeChordIndex === -1) return; // No chord found

      const activeChord = this.chords[activeChordIndex];
      DEBUG &&
        console.log(
          `🎯 [DEBUG] Found chord by time: ${activeChord.name} @ ${activeChord.time}s`
        );

      this._highlightChordIndex(activeChordIndex, isScrubbing);
    }

    _rebuildBeatGridForTile(tile, index) {
      const beatGrid = tile?.querySelector?.(".yc-preview-beat-grid");
      if (!beatGrid) return;

      if (window.beatGridEnabled === false || !this._previewBeatGridEnabled) {
        beatGrid.style.display = "none";
        beatGrid.innerHTML = "";
        return;
      }

      const chord = this.chords?.[index];
      if (!chord) return;
      const nextChord = this.chords[index + 1];
      const duration = nextChord ? nextChord.time - chord.time : 3.0;
      const totalBeats = Math.max(0, Math.floor(duration / PREVIEW_BEAT_DURATION));

      if (totalBeats <= 0) {
        beatGrid.style.display = "none";
        beatGrid.innerHTML = "";
        return;
      }

      beatGrid.style.display = "grid";
      beatGrid.style.gridTemplateColumns =
        totalBeats <= PREVIEW_MAX_BEATS_PER_ROW
          ? `repeat(${totalBeats}, 1fr)`
          : `repeat(${PREVIEW_MAX_BEATS_PER_ROW}, 1fr)`;
      beatGrid.innerHTML = "";
      for (let i = 0; i < totalBeats; i += 1) {
        const cell = document.createElement("div");
        cell.className = "yc-preview-beat-cell";
        cell.setAttribute("data-beat-index", i);
        beatGrid.appendChild(cell);
      }

      const { marginTop } = this._getBeatGridMetricsForIndex(index);
      tile.style.marginTop = `${marginTop}px`;
    }

    _refreshRenderedTimingOnly() {
      if (!this.chords || !this._renderedTileByIndex) return;

      for (const [index, tile] of this._renderedTileByIndex.entries()) {
        const chord = this.chords[index];
        if (!chord || !tile) continue;
        tile.setAttribute("data-time", String(chord.time));
        const timeEl = tile.querySelector(".yc-preview-chord-time");
        if (timeEl) timeEl.textContent = formatPreviewTime(chord.time);
        this._rebuildBeatGridForTile(tile, index);
      }

      this._lastBeatGridActiveIndex = -1;
      if (this.videoElement) {
        this._updateAllBeatGrids(this.videoElement.currentTime, true);
      }
    }

    _handleChordTimingPreviewChanged(detail = null) {
      if (!this.isVisible || !this._rawChordsForEditing) return;

      if (!detail?.active) {
        this._clearTimingPreviewHighlights();
        if (this._timingPreviewActive) {
          this._timingPreviewActive = false;
          this._refreshChords();
        }
        return;
      }

      const detailVideoId = detail.videoId || null;
      const currentVideoId = this._extractVideoId();
      if (detailVideoId && currentVideoId && detailVideoId !== currentVideoId) {
        this._clearTimingPreviewHighlights();
        return;
      }
      const detailMode = detail.mode || "regular";
      if (detailMode !== (this.currentMode || window.chordsMode || "regular")) {
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
            if (this.isVisible) {
              this._refreshChords();
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

    _applyBeatGridState(entry, currentTime, activeChordIndex) {
      if (!entry?.tile) return;

      const chord = this.chords?.[entry.index];
      if (!chord) return;

      const cells = entry.tile.querySelectorAll(".yc-preview-beat-cell");
      if (!cells.length) return;

      if (entry.index < activeChordIndex) {
        if (entry.state === "past") return;
        cells.forEach((cell) => cell.classList.add("filled"));
        entry.state = "past";
        entry.beatIndex = cells.length - 1;
        return;
      }

      if (entry.index > activeChordIndex) {
        if (entry.state === "future") return;
        cells.forEach((cell) => cell.classList.remove("filled"));
        entry.state = "future";
        entry.beatIndex = -1;
        return;
      }

      const nextChord = this.chords[entry.index + 1];
      const duration = nextChord ? nextChord.time - chord.time : 3.0;
      const timeInChord = currentTime - chord.time;
      const currentBeatIndex = Math.floor(timeInChord / PREVIEW_BEAT_DURATION);
      const progressPercent = duration > 0 ? timeInChord / duration : 1;
      const nextBeatIndex = progressPercent >= 0.9
        ? cells.length - 1
        : Math.max(-1, Math.min(currentBeatIndex, cells.length - 1));

      if (entry.state === "active" && entry.beatIndex === nextBeatIndex) return;

      cells.forEach((cell, idx) => {
        cell.classList.toggle("filled", idx <= nextBeatIndex);
      });
      entry.state = "active";
      entry.beatIndex = nextBeatIndex;
    }

    /**
     * 📊 Update beat grids based on current video time.
     * Normal playback touches only the active tile and the previous active tile.
     */
    _updateAllBeatGrids(currentTime, forceFullSync = false) {
      if (window.beatGridEnabled === false) {
        return;
      }

      if (!this._beatGridTiles || this._beatGridTiles.length === 0 || !this.chords || this.chords.length === 0) return;

      const activeChordIndex = this._getActiveChordIndexForTime(currentTime);

      if (activeChordIndex === -1) return;

      const lastIndex = this._lastBeatGridActiveIndex;
      const lastTime = this._lastBeatGridTime;
      const jumpedAcrossChords = lastIndex >= 0 && Math.abs(activeChordIndex - lastIndex) > 1;
      const jumpedInTime = Number.isFinite(lastTime) && Math.abs(currentTime - lastTime) > 2.0;
      const shouldFullSync =
        forceFullSync ||
        lastIndex === -1 ||
        jumpedAcrossChords ||
        jumpedInTime;

      if (shouldFullSync) {
        for (const entry of this._beatGridTiles) {
          this._applyBeatGridState(entry, currentTime, activeChordIndex);
        }
      } else {
        if (lastIndex !== activeChordIndex) {
          const previousEntry = this._beatGridTileByIndex.get(lastIndex);
          this._applyBeatGridState(previousEntry, currentTime, activeChordIndex);
        }

        const activeEntry = this._beatGridTileByIndex.get(activeChordIndex);
        this._applyBeatGridState(activeEntry, currentTime, activeChordIndex);
      }

      this._lastBeatGridActiveIndex = activeChordIndex;
      this._lastBeatGridTime = currentTime;
    }
  }

  /*============================================================================
    INITIALIZATION
  ============================================================================*/
  let beforeUnloadHandler = null;

  function init() {
    if (window.ycChordsPreviewPanel) {
      DEBUG && console.log("[PreviewPanel] ⚠️ Already initialized");
      return;
    }

    window.ycChordsPreviewPanel = new ChordsPreviewPanel();
    DEBUG && console.log("[PreviewPanel] ✅ Initialized and ready");

    // Setup cleanup on page unload (only once)
    if (!beforeUnloadHandler) {
      beforeUnloadHandler = () => {
        window.ycChordsPreviewPanel?.destroy();
        window.ycChordsPreviewPanel = null;
      };
      window.addEventListener("beforeunload", beforeUnloadHandler);
    }
  }

  // Cleanup function for manual cleanup
  function cleanup() {
    if (beforeUnloadHandler) {
      window.removeEventListener("beforeunload", beforeUnloadHandler);
      beforeUnloadHandler = null;
    }
    window.ycChordsPreviewPanel?.destroy();
    window.ycChordsPreviewPanel = null;
  }

  // Expose cleanup function
  window.ycChordsPreviewPanelCleanup = cleanup;

  /*============================================================================
    REFRESH ALL DIAGRAMS FUNCTION
  ============================================================================*/
  /**
   * Refresh all chord diagrams in the preview panel
   * Used when visual settings change (e.g., Additional Fret Numbers)
   */
  window.refreshPreviewPanelDiagrams = function () {
    if (!window.ycChordsPreviewPanel?.isVisible) {
      DEBUG && console.log("[PreviewPanel] Not visible, skipping refresh");
      return;
    }

    DEBUG && console.log("[PreviewPanel] 🔄 Refreshing all chord diagrams...");

    const panel = window.ycChordsPreviewPanel;

    // Refresh only rendered virtual tiles; offscreen tiles will render fresh when needed.
    if (!panel.chordElements || panel.chordElements.size === 0) {
      DEBUG && console.log("[PreviewPanel] No chord elements, skipping refresh");
      return;
    }

    let refreshedCount = 0;
    panel._createDiagramObserver?.();

    const tiles = panel.gridElement
      ? panel.gridElement.querySelectorAll(".yc-preview-chord")
      : [];

    tiles.forEach((tile) => {
      const diagramEl = tile.querySelector('.yc-preview-chord-diagram');
      if (!diagramEl) return;

      const chordName = tile.getAttribute("data-chord-name") || diagramEl.dataset.chordName;
      if (!chordName) return;

      diagramEl.innerHTML = '';
      diagramEl.dataset.chordName = chordName;
      diagramEl.dataset.rendered = "false";
      panel._queueChordDiagram(tile, diagramEl, chordName);
      refreshedCount++;
    });

    DEBUG && console.log(`[PreviewPanel] ✅ Queued ${refreshedCount} diagrams for refresh`);
  };

  /*============================================================================
    RESET TO DEFAULT FUNCTION
  ============================================================================*/
  window.resetPreviewPanelSizeToDefault = function () {
    try {
      console.log("[PreviewPanel] 🔄 מאפס גודל Preview Panel לברירת מחדל...");

      if (!window.ycChordsPreviewPanel) {
        console.log(
          "[PreviewPanel] ℹ️ Preview Panel לא מאותחל - מוחק רק מ-localStorage"
        );
        localStorage.removeItem("yc_preview_scale");
        return true;
      }

      // איפוס הערך לברירת מחדל (1.0)
      window.ycChordsPreviewPanel.currentScale = 1.0;

      // מחיקת הערך מ-localStorage
      localStorage.removeItem("yc_preview_scale");

      // עדכון התצוגה
      window.ycChordsPreviewPanel._updateScale();

      console.log("[PreviewPanel] ✅ איפוס גודל Preview Panel הושלם בהצלחה");
      console.log("[PreviewPanel] 📊 גודל חדש: 1.00");

      return true;
    } catch (error) {
      console.error(
        "[PreviewPanel] ❌ שגיאה באיפוס גודל Preview Panel:",
        error
      );
      return false;
    }
  };

  // Initialize when module loads
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 100);
  }
})();
