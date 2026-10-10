(function () {
  "use strict";

  const DEBUG = false;
  const EDITS_VERSION = 1;
  const UI_SHOW_EDIT_KEY = "youchords_show_chord_edit";
  const UI_SHOW_REMOVE_KEY = "youchords_show_chord_remove";
  const UI_SHOW_MODE_SWITCH_KEY = "youchords_show_quick_mode_switch";
  const UI_INCLUDE_LETTER_MATCH_KEY = "youchords_edit_include_letter_match";
  const UI_TIME_SPLIT_EXPANDED_KEY = "youchords_time_split_expanded";
  const REMOVE_CONFIRM_KEY = "youchords_remove_chord_confirmed_v1";
  const INFO_POPUP_SCALE_KEY = "youchords_info_popup_scale";
  const CHORD_INFO_SHOW_COUNTS_KEY = "youchords_chord_info_show_counts";
  const CHORD_INFO_SORT_BY_COUNT_KEY = "youchords_chord_info_sort_by_count";
  const CHORD_EDITS_POPUP_SCALE_KEY = "youchords_chord_edits_popup_scale";
  const CHORD_EDITS_CONTENT_SCALE_KEY = "youchords_chord_edits_content_scale";
  const FALLBACK_STORAGE_PREFIX = "youchords_chord_edits_";
  const VALID_MODES = new Set(["regular", "regularPlus", "harmonic", "harmonicPlus"]);
  const TIMING_STEP_SECONDS = 0.1;
  const MIN_CHORD_DURATION_SECONDS = 0.1;
  const TIMING_RESET_EPSILON = 0.049;
  const SPLIT_SIDE_VALUES = new Set(["before", "after"]);

  let activePickerCleanup = null;
  let activeReplacePickerAnchor = null;
  let activeEditPreviewState = null;
  let activeRemoveConfirmPromise = null;
  let activeRemoveScopeClose = null;
  let activeRemoveScopeAnchor = null;
  let activeChordInfoClose = null;
  let activeChordInfoAnchor = null;
  let activeChordEditsSummaryClose = null;
  let activeChordEditsSummaryAnchor = null;
  let activeTimingEditorClose = null;
  let activeTimingEditorAnchor = null;
  let activeTimingPreviewState = null;
  let fullChordLibraryNamesCache = null;
  let fullChordLibraryNamesLoadPromise = null;
  const POPUP_UI_SCALE_MIN = 80;
  const POPUP_UI_SCALE_MAX = 140;
  const POPUP_UI_SCALE_STEP = 5;
  const POPUP_UI_SCALE_LEGACY_DEFAULT = 80;
  const POPUP_UI_SCALE_MIGRATION_SUFFIX = "__default100_migrated_v1";

  function clampPopupUiScalePercent(value, fallback = 100) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const stepped = Math.round(parsed / POPUP_UI_SCALE_STEP) * POPUP_UI_SCALE_STEP;
    return Math.max(POPUP_UI_SCALE_MIN, Math.min(POPUP_UI_SCALE_MAX, stepped));
  }

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

  function resolveCurrentVideoDurationSeconds() {
    try {
      const video = document.querySelector("video");
      const duration = roundTimingSeconds(video?.duration);
      return duration !== null && duration > 0 ? duration : null;
    } catch (error) {
      return null;
    }
  }

  function clampFloatingPanelPosition({ anchorEl, panel, fallbackWidth, margin = 8 }) {
    const viewport = getViewportBounds();
    const safeWidth = viewport.width || window.innerWidth || 0;
    const safeHeight = viewport.height || window.innerHeight || 0;

    panel.style.maxWidth = `calc(${safeWidth}px - ${margin * 2}px)`;
    panel.style.maxHeight = `${Math.max(120, safeHeight - margin * 2)}px`;
    panel.style.overflowY = "auto";

    const anchorRect = anchorEl.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const width = panelRect.width || fallbackWidth;
    const height = panelRect.height || 0;
    const minLeft = viewport.left + margin;
    const maxLeft = Math.max(minLeft, viewport.right - width - margin);
    const centeredLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
    const left = Math.min(maxLeft, Math.max(minLeft, centeredLeft));
    const belowTop = anchorRect.bottom + margin;
    const canOpenBelow = belowTop + height <= viewport.bottom - margin;
    const aboveTop = anchorRect.top - height - margin;
    const maxTop = Math.max(viewport.top + margin, viewport.bottom - height - margin);
    const top = canOpenBelow
      ? belowTop
      : Math.max(viewport.top + margin, Math.min(aboveTop, maxTop));

    return { left, top, canOpenBelow, anchorRect };
  }

  function loadPopupScaleSetting(storageKey, fallback = 100) {
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
      log("Failed reading popup scale setting:", error);
      return clampPopupUiScalePercent(fallback, 100);
    }
  }

  function savePopupScaleSetting(storageKey, value) {
    try {
      const safeValue = clampPopupUiScalePercent(value, 100);
      localStorage.setItem(String(storageKey || ""), String(safeValue));
      return safeValue;
    } catch (error) {
      log("Failed storing popup scale setting:", error);
      return clampPopupUiScalePercent(value, 100);
    }
  }

  function createPopupScaleControl({
    initialPercent = 100,
    onChange = null,
  } = {}) {
    let current = clampPopupUiScalePercent(initialPercent, 100);

    const wrap = document.createElement("div");
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
    minusButton.setAttribute("aria-label", "Decrease popup size");

    const value = document.createElement("span");
    value.style.cssText = `
      min-width: 30px;
      text-align: center;
      font-size: 11px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.9);
      letter-spacing: 0.1px;
      line-height: 1;
    `;

    const plusButton = createButton("+");
    plusButton.setAttribute("aria-label", "Increase popup size");

    const emitChange = () => {
      value.textContent = String(current);
      minusButton.disabled = current <= POPUP_UI_SCALE_MIN;
      plusButton.disabled = current >= POPUP_UI_SCALE_MAX;
      minusButton.style.opacity = minusButton.disabled ? "0.45" : "1";
      plusButton.style.opacity = plusButton.disabled ? "0.45" : "1";
      minusButton.style.cursor = minusButton.disabled ? "default" : "pointer";
      plusButton.style.cursor = plusButton.disabled ? "default" : "pointer";
      if (typeof onChange === "function") {
        onChange(current);
      }
    };

    const setValue = (nextPercent) => {
      current = clampPopupUiScalePercent(nextPercent, current);
      emitChange();
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

    emitChange();

    return {
      element: wrap,
      setValue,
      getValue: () => current,
    };
  }

  function setChordInfoAnchorState(anchorEl, isOpen) {
    if (!anchorEl || !anchorEl.classList) return;
    const open = Boolean(isOpen);
    anchorEl.classList.toggle("yc-info-open", open);
    anchorEl.setAttribute("aria-expanded", open ? "true" : "false");
    anchorEl.setAttribute("aria-pressed", open ? "true" : "false");
    syncCarouselControlsLock(anchorEl);
  }

  function loadChordInfoShowCountsSetting() {
    try {
      return localStorage.getItem(CHORD_INFO_SHOW_COUNTS_KEY) === "true";
    } catch (error) {
      log("Failed reading chord info show-counts setting:", error);
      return false;
    }
  }

  function saveChordInfoShowCountsSetting(value) {
    try {
      const enabled = value === true;
      localStorage.setItem(CHORD_INFO_SHOW_COUNTS_KEY, enabled ? "true" : "false");
      return enabled;
    } catch (error) {
      log("Failed storing chord info show-counts setting:", error);
      return value === true;
    }
  }

  function loadChordInfoSortByCountSetting() {
    try {
      return localStorage.getItem(CHORD_INFO_SORT_BY_COUNT_KEY) === "true";
    } catch (error) {
      log("Failed reading chord info sort-by-count setting:", error);
      return false;
    }
  }

  function saveChordInfoSortByCountSetting(value) {
    try {
      const enabled = value === true;
      localStorage.setItem(CHORD_INFO_SORT_BY_COUNT_KEY, enabled ? "true" : "false");
      return enabled;
    } catch (error) {
      log("Failed storing chord info sort-by-count setting:", error);
      return value === true;
    }
  }

  function setChordEditsSummaryAnchorState(anchorEl, isOpen) {
    if (!anchorEl || !anchorEl.classList) return;
    const open = Boolean(isOpen);
    anchorEl.classList.toggle("yc-edits-open", open);
    anchorEl.setAttribute("aria-expanded", open ? "true" : "false");
    anchorEl.setAttribute("aria-pressed", open ? "true" : "false");
    syncCarouselControlsLock(anchorEl);
  }

  function syncCarouselControlsLock(anchorEl) {
    const lockClass = "yc-carousel-controls-locked";
    const openSelector =
      ".yc-carousel-info-btn.yc-info-open, .yc-carousel-edits-btn.yc-edits-open, .yc-carousel-size-btn.yc-size-open";

    const playerEl =
      anchorEl?.closest?.(".html5-video-player") ||
      activeChordInfoAnchor?.closest?.(".html5-video-player") ||
      activeChordEditsSummaryAnchor?.closest?.(".html5-video-player");

    if (playerEl?.classList) {
      const keepVisible = Boolean(playerEl.querySelector(openSelector));
      playerEl.classList.toggle(lockClass, keepVisible);
    }

    const staleLockedPlayers = document.querySelectorAll(
      `.html5-video-player.${lockClass}`
    );
    staleLockedPlayers.forEach((player) => {
      if (!player.querySelector(openSelector)) {
        player.classList.remove(lockClass);
      }
    });
  }

  function log(...args) {
    if (DEBUG) {
      console.log("[ChordEditsManager]", ...args);
    }
  }

  function normalizeMode(mode) {
    const value = String(mode || "").trim();
    return VALID_MODES.has(value) ? value : "regular";
  }

  function clampThreshold(threshold) {
    const parsed = Number(threshold);
    if (!Number.isFinite(parsed)) return 0.5;
    const rounded = Math.round(parsed * 10) / 10;
    return Math.max(0.1, Math.min(1.2, rounded));
  }

  function clampCapo(capoFret) {
    const parsed = Number.parseInt(capoFret, 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(12, parsed));
  }

  function toFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function roundTimingSeconds(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    const rounded = Math.max(0, Math.round(num / TIMING_STEP_SECONDS) * TIMING_STEP_SECONDS);
    return Number(rounded.toFixed(1));
  }

  function formatTimingSeconds(seconds) {
    const rounded = roundTimingSeconds(seconds);
    if (rounded === null) return "0.0s";
    return `${rounded.toFixed(1)}s`;
  }

  function formatTimingClock(seconds) {
    const rounded = roundTimingSeconds(seconds);
    const safe = rounded === null ? 0 : rounded;
    const mins = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    const tenths = Math.round((safe - Math.floor(safe)) * 10);
    return `${mins}:${String(secs).padStart(2, "0")}.${tenths}`;
  }

  function formatTimingSummaryValue(seconds) {
    const rounded = roundTimingSeconds(seconds);
    if (rounded === null) return "";
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function deepClone(value) {
    if (value == null) return value;
    try {
      if (typeof structuredClone === "function") {
        return structuredClone(value);
      }
    } catch (error) {
      log("structuredClone failed, fallback to JSON clone:", error);
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      log("JSON clone failed:", error);
      return value;
    }
  }

  function uniqueSortedNumbers(values) {
    if (!Array.isArray(values)) return [];
    const clean = values
      .map((entry) => Number(entry))
      .filter((entry) => Number.isInteger(entry) && entry >= 0);
    if (!clean.length) return [];
    return [...new Set(clean)].sort((a, b) => a - b);
  }

  function buildSourceKey(sourceIndices) {
    const normalized = uniqueSortedNumbers(sourceIndices);
    return normalized.join("|");
  }

  function getChordName(chord) {
    const directName =
      chord && typeof chord.name === "string" ? chord.name.trim() : "";
    if (directName) return directName;
    const altName =
      chord && typeof chord.chord === "string" ? chord.chord.trim() : "";
    return altName || "";
  }

  function setChordName(chord, chordName) {
    if (!chord) return;
    const value = String(chordName || "").trim();
    if ("name" in chord || !("chord" in chord)) {
      chord.name = value;
    }
    if ("chord" in chord) {
      chord.chord = value;
    }
    if (!("name" in chord)) {
      chord.name = value;
    }
  }

  function areChordNamesEqual(first, second) {
    const a = String(first || "").trim().toLowerCase();
    const b = String(second || "").trim().toLowerCase();
    return Boolean(a && b && a === b);
  }

  function getChordSearchRoot(valueRaw) {
    const clean = String(valueRaw || "").trim();
    if (!clean) return "";
    const match = clean.match(/^[A-Ga-g](?:#|b)?/);
    return match ? match[0].toLowerCase() : "";
  }

  function getChordSearchLetter(valueRaw) {
    const clean = String(valueRaw || "").trim();
    if (!clean) return "";
    const match = clean.match(/^[A-Ga-g]/);
    return match ? match[0].toLowerCase() : "";
  }

  function createEmptyPayload() {
    return {
      version: EDITS_VERSION,
      modes: {},
    };
  }

  function normalizeEntry(rawEntry) {
    const sourceIndices = uniqueSortedNumbers(rawEntry?.sourceIndices);
    if (!sourceIndices.length) return null;

    const threshold = clampThreshold(rawEntry?.threshold);
    const capoFret = clampCapo(rawEntry?.capoFret);
    const updatedAt = toFiniteNumber(rawEntry?.updatedAt) || Date.now();
    const nextEntry = {
      sourceIndices,
      threshold,
      capoFret,
      updatedAt,
    };

    const mergedGroupSize = Number.parseInt(rawEntry?.mergedGroupSize, 10);
    if (Number.isInteger(mergedGroupSize) && mergedGroupSize > 1) {
      nextEntry.mergedGroupSize = mergedGroupSize;
    }
    const mergedGroupKey =
      typeof rawEntry?.mergedGroupKey === "string"
        ? rawEntry.mergedGroupKey.trim()
        : "";
    if (mergedGroupKey) {
      nextEntry.mergedGroupKey = mergedGroupKey;
    }
    const mergedDisplayChordName =
      typeof rawEntry?.mergedDisplayChordName === "string"
        ? rawEntry.mergedDisplayChordName.trim()
        : "";
    if (mergedDisplayChordName) {
      nextEntry.mergedDisplayChordName = mergedDisplayChordName;
    }

    const nextChordName =
      typeof rawEntry?.nextChordName === "string"
        ? rawEntry.nextChordName.trim()
        : "";
    const previousChordName =
      typeof rawEntry?.previousChordName === "string"
        ? rawEntry.previousChordName.trim()
        : "";

    if (nextChordName) nextEntry.nextChordName = nextChordName;
    if (previousChordName) nextEntry.previousChordName = previousChordName;
    return nextEntry;
  }

  function normalizeTimingEntry(rawEntry, fallbackSourceIndex = null) {
    const parsedSourceIndex = Number.parseInt(
      rawEntry?.sourceIndex ?? fallbackSourceIndex,
      10
    );
    if (!Number.isInteger(parsedSourceIndex) || parsedSourceIndex < 0) {
      return null;
    }

    const time = roundTimingSeconds(rawEntry?.time);
    if (time === null) return null;

    const originalTime = roundTimingSeconds(rawEntry?.originalTime);
    const updatedAt = toFiniteNumber(rawEntry?.updatedAt) || Date.now();
    const entry = {
      sourceIndex: parsedSourceIndex,
      time,
      updatedAt,
    };
    if (originalTime !== null) {
      entry.originalTime = originalTime;
    }
    const anchorSourceIndex = Number.parseInt(rawEntry?.anchorSourceIndex, 10);
    if (Number.isInteger(anchorSourceIndex) && anchorSourceIndex >= 0) {
      entry.anchorSourceIndex = anchorSourceIndex;
    }
    const anchorChordName =
      typeof rawEntry?.anchorChordName === "string"
        ? rawEntry.anchorChordName.trim()
        : "";
    if (anchorChordName) {
      entry.anchorChordName = anchorChordName;
    }
    const changedChordName =
      typeof rawEntry?.changedChordName === "string"
        ? rawEntry.changedChordName.trim()
        : "";
    if (changedChordName) {
      entry.changedChordName = changedChordName;
    }
    const rawBoundary = String(rawEntry?.boundary || "").trim().toLowerCase();
    if (rawBoundary === "before" || rawBoundary === "after") {
      entry.boundary = rawBoundary;
    }
    return entry;
  }

  function makeSplitSegmentId() {
    return `split_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeSplitDurationSource(rawSource) {
    const amount = roundTimingSeconds(rawSource?.amount);
    if (amount === null || amount <= 0) return null;

    const type = String(rawSource?.type || rawSource?.source || "current").trim();
    if (type === "segment") {
      const segmentId = String(rawSource?.segmentId || rawSource?.id || "").trim();
      if (!segmentId) return null;
      const nestedSources = normalizeSplitDurationSources(rawSource?.sources, amount);
      return {
        type: "segment",
        segmentId,
        amount,
        sources: nestedSources.length ? nestedSources : [{ type: "current", amount }],
      };
    }

    return {
      type: "current",
      amount,
    };
  }

  function canMergeSplitDurationSources(previousSource, nextSource) {
    if (!previousSource || !nextSource || previousSource.type !== nextSource.type) return false;
    if (previousSource.type === "current") return true;
    return previousSource.type === "segment" && previousSource.segmentId === nextSource.segmentId;
  }

  function compactSplitDurationSources(rawSources = []) {
    const output = [];
    for (const rawSource of Array.isArray(rawSources) ? rawSources : []) {
      const source = normalizeSplitDurationSource(rawSource);
      if (!source) continue;
      const previous = output[output.length - 1];
      if (!canMergeSplitDurationSources(previous, source)) {
        output.push(source);
        continue;
      }

      previous.amount = roundTimingSeconds(previous.amount + source.amount) ?? previous.amount;
      if (previous.type === "segment") {
        previous.sources = compactSplitDurationSources([
          ...(previous.sources || []),
          ...(source.sources || []),
        ]);
      }
    }
    return output;
  }

  function sumSplitDurationSources(sources = []) {
    return (Array.isArray(sources) ? sources : []).reduce((sum, source) => {
      const amount = roundTimingSeconds(source?.amount);
      return sum + (amount && amount > 0 ? amount : 0);
    }, 0);
  }

  function trimSplitDurationSourcesToAmount(sources = [], targetAmount = 0) {
    const target = Math.max(0, roundTimingSeconds(targetAmount) ?? 0);
    if (target <= 0) return [];

    const output = [];
    let remaining = target;
    for (const source of Array.isArray(sources) ? sources : []) {
      if (remaining <= 0) break;
      const normalized = normalizeSplitDurationSource(source);
      if (!normalized) continue;
      const amount = Math.min(normalized.amount, remaining);
      output.push({
        ...normalized,
        amount: roundTimingSeconds(amount) ?? amount,
      });
      remaining = roundTimingSeconds(remaining - amount) ?? 0;
    }
    if (remaining > 0) {
      output.push({
        type: "current",
        amount: roundTimingSeconds(remaining) ?? remaining,
      });
    }
    return output;
  }

  function takeSplitDurationSourcesFromEnd(rawSources, targetAmount = 0) {
    const target = Math.max(0, roundTimingSeconds(targetAmount) ?? 0);
    if (target <= 0) return [];

    const sources = Array.isArray(rawSources)
      ? rawSources.map(normalizeSplitDurationSource).filter(Boolean)
      : [];
    const output = [];
    let remaining = target;
    for (let index = sources.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const source = sources[index];
      const sourceAmount = roundTimingSeconds(source.amount) ?? 0;
      if (sourceAmount <= 0) continue;
      const amount = Math.min(sourceAmount, remaining);
      const nextSource = {
        ...source,
        amount: roundTimingSeconds(amount) ?? amount,
      };
      if (source.type === "segment") {
        nextSource.sources = takeSplitDurationSourcesFromEnd(source.sources, amount);
      }
      output.unshift(nextSource);
      remaining = roundTimingSeconds(remaining - amount) ?? 0;
    }
    if (remaining > 0) {
      output.unshift({
        type: "current",
        amount: roundTimingSeconds(remaining) ?? remaining,
      });
    }
    return output;
  }

  function normalizeSplitDurationSources(rawSources, duration = null) {
    const sources = compactSplitDurationSources(rawSources);
    const safeDuration = roundTimingSeconds(duration);
    if (safeDuration === null) return sources;
    if (safeDuration <= 0) return [];

    const sourceTotal = roundTimingSeconds(sumSplitDurationSources(sources)) ?? 0;
    if (!sources.length || sourceTotal <= 0) {
      return [{ type: "current", amount: safeDuration }];
    }
    if (sourceTotal > safeDuration) {
      return trimSplitDurationSourcesToAmount(sources, safeDuration);
    }
    if (sourceTotal < safeDuration) {
      return [
        ...sources,
        {
          type: "current",
          amount: roundTimingSeconds(safeDuration - sourceTotal) ?? (safeDuration - sourceTotal),
        },
      ];
    }
    return sources;
  }

  function mergeSplitDurationSources(...sourceGroups) {
    const output = [];
    for (const group of sourceGroups) {
      const sources = normalizeSplitDurationSources(group);
      for (const source of sources) {
        output.push({ ...source });
      }
    }
    return compactSplitDurationSources(output);
  }

  function normalizeSplitSegment(rawSegment, fallbackSide = "after") {
    const chordName = String(rawSegment?.chordName ?? rawSegment?.name ?? "").trim();
    if (!chordName) return null;

    const rawSide = String(rawSegment?.side || fallbackSide || "after").trim().toLowerCase();
    const side = SPLIT_SIDE_VALUES.has(rawSide) ? rawSide : "after";
    const duration = roundTimingSeconds(rawSegment?.duration);
    if (duration === null || duration < MIN_CHORD_DURATION_SECONDS) return null;

    const id = String(rawSegment?.id || "").trim() || makeSplitSegmentId();
    return {
      id,
      chordName,
      side,
      duration,
      sources: normalizeSplitDurationSources(rawSegment?.sources, duration),
    };
  }

  function normalizeSplitEntry(rawEntry, fallbackSourceIndex = null) {
    const parsedSourceIndex = Number.parseInt(
      rawEntry?.parentSourceIndex ?? rawEntry?.sourceIndex ?? fallbackSourceIndex,
      10
    );
    if (!Number.isInteger(parsedSourceIndex) || parsedSourceIndex < 0) {
      return null;
    }

    const currentDuration = roundTimingSeconds(rawEntry?.currentDuration);
    const currentChordName = String(rawEntry?.currentChordName || "").trim();
    const updatedAt = toFiniteNumber(rawEntry?.updatedAt) || Date.now();

    const before = Array.isArray(rawEntry?.before)
      ? rawEntry.before.map((entry) => normalizeSplitSegment(entry, "before")).filter(Boolean)
      : [];
    const after = Array.isArray(rawEntry?.after)
      ? rawEntry.after.map((entry) => normalizeSplitSegment(entry, "after")).filter(Boolean)
      : [];

    const legacySegments = Array.isArray(rawEntry?.segments)
      ? rawEntry.segments.map((entry) => normalizeSplitSegment(entry, entry?.side)).filter(Boolean)
      : [];
    for (const segment of legacySegments) {
      if (segment.side === "before") {
        before.push(segment);
      } else {
        after.push(segment);
      }
    }

    if (!before.length && !after.length && currentDuration === null) {
      return null;
    }

    return {
      parentSourceIndex: parsedSourceIndex,
      currentChordName: currentChordName || undefined,
      currentDuration: currentDuration ?? undefined,
      before,
      after,
      updatedAt,
    };
  }

  function addDurationToSplitEntryCurrent(entry, amount) {
    if (!entry) return 0;
    const safeAmount = roundTimingSeconds(amount) ?? 0;
    if (safeAmount <= 0) return 0;
    const current = roundTimingSeconds(entry.currentDuration) ?? 0;
    entry.currentDuration = roundTimingSeconds(current + safeAmount) ?? (current + safeAmount);
    return safeAmount;
  }

  function getSplitEntrySegments(entry) {
    return [
      ...(Array.isArray(entry?.before) ? entry.before : []),
      ...(Array.isArray(entry?.after) ? entry.after : []),
    ];
  }

  function findSplitEntrySegment(entry, segmentId) {
    const id = String(segmentId || "").trim();
    if (!entry || !id) return null;
    return getSplitEntrySegments(entry).find((segment) => segment.id === id) || null;
  }

  function addDurationToSplitEntrySegment(entry, segmentId, amount, sources = []) {
    const target = findSplitEntrySegment(entry, segmentId);
    const safeAmount = roundTimingSeconds(amount) ?? 0;
    if (!target || safeAmount <= 0) return false;
    const duration = roundTimingSeconds(target.duration) ?? MIN_CHORD_DURATION_SECONDS;
    target.duration = roundTimingSeconds(duration + safeAmount) ?? (duration + safeAmount);
    target.sources = normalizeSplitDurationSources(
      mergeSplitDurationSources(target.sources, sources),
      target.duration
    );
    return true;
  }

  function restoreSplitDurationSourceToEntry(entry, source, excludedSegmentIds = new Set()) {
    const normalized = normalizeSplitDurationSource(source);
    if (!entry || !normalized) return 0;
    const amount = roundTimingSeconds(normalized.amount) ?? 0;
    if (amount <= 0) return 0;

    if (
      normalized.type === "segment" &&
      normalized.segmentId &&
      !excludedSegmentIds.has(normalized.segmentId) &&
      addDurationToSplitEntrySegment(entry, normalized.segmentId, amount, normalized.sources)
    ) {
      return amount;
    }

    if (normalized.type === "segment" && normalized.sources?.length) {
      let restored = 0;
      for (const nestedSource of normalized.sources) {
        restored = roundTimingSeconds(
          restored + restoreSplitDurationSourceToEntry(entry, nestedSource, excludedSegmentIds)
        ) ?? restored;
      }
      if (restored > 0) return restored;
    }

    return addDurationToSplitEntryCurrent(entry, amount);
  }

  function restoreSplitSegmentDurationToEntry(entry, segment, excludedSegmentIds = new Set()) {
    if (!entry || !segment) return 0;
    const duration = roundTimingSeconds(segment.duration) ?? 0;
    if (duration <= 0) return 0;
    const sources = normalizeSplitDurationSources(segment.sources, duration);
    let restored = 0;
    for (const source of sources) {
      restored = roundTimingSeconds(
        restored + restoreSplitDurationSourceToEntry(entry, source, excludedSegmentIds)
      ) ?? restored;
    }
    return restored || addDurationToSplitEntryCurrent(entry, duration);
  }

  function setSplitEntrySegmentDuration(entry, segmentId, nextDuration) {
    const normalized = normalizeSplitEntry(entry, entry?.parentSourceIndex);
    const target = findSplitEntrySegment(normalized, segmentId);
    const requested = roundTimingSeconds(nextDuration);
    if (!normalized || !target || requested === null) {
      return { entry: normalized, changed: false, duration: null };
    }

    const currentDuration = roundTimingSeconds(target.duration) ?? MIN_CHORD_DURATION_SECONDS;
    const desiredDuration = Math.max(MIN_CHORD_DURATION_SECONDS, requested);
    const delta = roundTimingSeconds(desiredDuration - currentDuration) ?? 0;
    if (Math.abs(delta) <= TIMING_RESET_EPSILON) {
      return { entry: normalized, changed: false, duration: currentDuration };
    }

    if (delta > 0) {
      const availableCurrent = Math.max(
        0,
        (roundTimingSeconds(normalized.currentDuration) ?? 0) - MIN_CHORD_DURATION_SECONDS
      );
      const taken = Math.min(delta, availableCurrent);
      if (taken <= 0) {
        return { entry: normalized, changed: false, duration: currentDuration };
      }
      normalized.currentDuration = roundTimingSeconds(
        (roundTimingSeconds(normalized.currentDuration) ?? 0) - taken
      );
      target.duration = roundTimingSeconds(currentDuration + taken) ?? currentDuration;
      target.sources = normalizeSplitDurationSources(
        mergeSplitDurationSources(target.sources, [{ type: "current", amount: taken }]),
        target.duration
      );
      return { entry: normalized, changed: true, duration: target.duration };
    }

    const returned = Math.min(-delta, Math.max(0, currentDuration - MIN_CHORD_DURATION_SECONDS));
    if (returned <= 0) {
      return { entry: normalized, changed: false, duration: currentDuration };
    }
    const returnedSources = takeSplitDurationSourcesFromEnd(target.sources, returned);
    target.duration = roundTimingSeconds(currentDuration - returned) ?? currentDuration;
    target.sources = normalizeSplitDurationSources(
      trimSplitDurationSourcesToAmount(target.sources, target.duration),
      target.duration
    );
    const excludedSegmentIds = new Set([target.id].filter(Boolean));
    for (const source of returnedSources) {
      restoreSplitDurationSourceToEntry(normalized, source, excludedSegmentIds);
    }
    return { entry: normalized, changed: true, duration: target.duration };
  }

  function mergeAdjacentSplitSegmentsForEntry(segments = []) {
    if (!Array.isArray(segments) || segments.length < 2) return segments;
    for (let index = segments.length - 1; index > 0; index -= 1) {
      const current = segments[index];
      const previous = segments[index - 1];
      if (!areChordNamesEqual(previous?.chordName, current?.chordName)) continue;
      const previousDuration = roundTimingSeconds(previous.duration) ?? MIN_CHORD_DURATION_SECONDS;
      const currentDuration = roundTimingSeconds(current.duration) ?? MIN_CHORD_DURATION_SECONDS;
      previous.duration = roundTimingSeconds(previousDuration + currentDuration) ?? previousDuration;
      previous.sources = normalizeSplitDurationSources(
        mergeSplitDurationSources(previous.sources, current.sources),
        previous.duration
      );
      segments.splice(index, 1);
    }
    return segments;
  }

  function sanitizeSplitEntryForNames(entry, {
    currentChordName = "",
    previousChordName = "",
    nextChordName = "",
  } = {}) {
    const normalized = normalizeSplitEntry(entry, entry?.parentSourceIndex);
    if (!normalized) return null;

    normalized.before = mergeAdjacentSplitSegmentsForEntry(normalized.before || []);
    normalized.after = mergeAdjacentSplitSegmentsForEntry(normalized.after || []);

    const currentName = String(currentChordName || normalized.currentChordName || "").trim();
    const previousName = String(previousChordName || "").trim();
    const nextName = String(nextChordName || "").trim();

    let changed = true;
    while (changed) {
      changed = false;

      while (
        currentName &&
        normalized.before.length &&
        areChordNamesEqual(normalized.before[normalized.before.length - 1]?.chordName, currentName)
      ) {
        const segment = normalized.before.pop();
        addDurationToSplitEntryCurrent(normalized, segment.duration);
        changed = true;
      }

      while (
        currentName &&
        normalized.after.length &&
        areChordNamesEqual(normalized.after[0]?.chordName, currentName)
      ) {
        const segment = normalized.after.shift();
        addDurationToSplitEntryCurrent(normalized, segment.duration);
        changed = true;
      }

      while (
        previousName &&
        normalized.before.length &&
        areChordNamesEqual(normalized.before[0]?.chordName, previousName)
      ) {
        const segment = normalized.before.shift();
        restoreSplitSegmentDurationToEntry(normalized, segment, new Set([segment.id]));
        changed = true;
      }

      while (
        nextName &&
        normalized.after.length &&
        areChordNamesEqual(normalized.after[normalized.after.length - 1]?.chordName, nextName)
      ) {
        const segment = normalized.after.pop();
        restoreSplitSegmentDurationToEntry(normalized, segment, new Set([segment.id]));
        changed = true;
      }

      if (changed) {
        normalized.before = mergeAdjacentSplitSegmentsForEntry(normalized.before || []);
        normalized.after = mergeAdjacentSplitSegmentsForEntry(normalized.after || []);
      }
    }

    if (!normalized.before.length && !normalized.after.length) {
      return null;
    }
    return normalized;
  }

  function normalizeModeBucket(rawBucket) {
    const bucket = {
      removed: {},
      replaced: {},
      timing: {},
      splits: {},
    };

    if (!rawBucket || typeof rawBucket !== "object") {
      return bucket;
    }

    const removedRaw = rawBucket.removed;
    if (removedRaw && typeof removedRaw === "object") {
      for (const [sourceKey, rawEntry] of Object.entries(removedRaw)) {
        const entry = normalizeEntry(rawEntry);
        if (!entry) continue;
        const safeKey = sourceKey || buildSourceKey(entry.sourceIndices);
        if (!safeKey) continue;
        bucket.removed[safeKey] = entry;
      }
    }

    const replacedRaw = rawBucket.replaced;
    if (replacedRaw && typeof replacedRaw === "object") {
      for (const [sourceKey, rawEntry] of Object.entries(replacedRaw)) {
        const entry = normalizeEntry(rawEntry);
        if (!entry || !entry.nextChordName) continue;
        const safeKey = sourceKey || buildSourceKey(entry.sourceIndices);
        if (!safeKey) continue;
        bucket.replaced[safeKey] = entry;
      }
    }

    const timingRaw = rawBucket.timing;
    if (timingRaw && typeof timingRaw === "object") {
      for (const [sourceKey, rawEntry] of Object.entries(timingRaw)) {
        const entry = normalizeTimingEntry(rawEntry, sourceKey);
        if (!entry) continue;
        bucket.timing[String(entry.sourceIndex)] = entry;
      }
    }

    const splitsRaw = rawBucket.splits;
    if (splitsRaw && typeof splitsRaw === "object") {
      for (const [sourceKey, rawEntry] of Object.entries(splitsRaw)) {
        const entry = normalizeSplitEntry(rawEntry, sourceKey);
        if (!entry) continue;
        bucket.splits[String(entry.parentSourceIndex)] = entry;
      }
    }

    return bucket;
  }

  function normalizePayload(rawPayload) {
    const payload = createEmptyPayload();

    if (!rawPayload || typeof rawPayload !== "object") {
      return payload;
    }

    payload.version = toFiniteNumber(rawPayload.version) || EDITS_VERSION;
    const rawModes = rawPayload.modes;
    if (!rawModes || typeof rawModes !== "object") {
      return payload;
    }

    for (const [mode, rawBucket] of Object.entries(rawModes)) {
      const safeMode = normalizeMode(mode);
      payload.modes[safeMode] = normalizeModeBucket(rawBucket);
    }

    return payload;
  }

  function getModeBucket(payload, mode, createIfMissing = false) {
    if (!payload || typeof payload !== "object") return null;
    if (!payload.modes || typeof payload.modes !== "object") {
      payload.modes = {};
    }

    const safeMode = normalizeMode(mode);
    const existing = payload.modes[safeMode];
    if (existing) {
      const normalized = normalizeModeBucket(existing);
      payload.modes[safeMode] = normalized;
      return normalized;
    }

    if (!createIfMissing) return null;
    payload.modes[safeMode] = normalizeModeBucket(null);
    return payload.modes[safeMode];
  }

  function fallbackStorageKey(videoId) {
    return `${FALLBACK_STORAGE_PREFIX}${videoId}`;
  }

  async function loadEdits(videoId) {
    if (!videoId) return createEmptyPayload();

    try {
      if (window.databaseManager?.getChordEdits) {
        const result = await window.databaseManager.getChordEdits(videoId);
        return normalizePayload(result);
      }
    } catch (error) {
      console.warn("[ChordEditsManager] Failed to load edits via databaseManager.getChordEdits:", error);
    }

    try {
      if (window.databaseManager?.loadChordsFromIndexedDB) {
        const record = await window.databaseManager.loadChordsFromIndexedDB(videoId);
        return normalizePayload(record?.userChordEdits);
      }
    } catch (error) {
      console.warn("[ChordEditsManager] Failed to load edits via loadChordsFromIndexedDB:", error);
    }

    try {
      const raw = localStorage.getItem(fallbackStorageKey(videoId));
      if (!raw) return createEmptyPayload();
      return normalizePayload(JSON.parse(raw));
    } catch (error) {
      console.warn("[ChordEditsManager] Failed reading fallback edits from localStorage:", error);
      return createEmptyPayload();
    }
  }

  async function saveEdits(videoId, payload) {
    if (!videoId) {
      return { success: false, error: "Missing videoId" };
    }

    const normalizedPayload = normalizePayload(payload);

    try {
      if (window.databaseManager?.setChordEdits) {
        return await window.databaseManager.setChordEdits(videoId, normalizedPayload);
      }
    } catch (error) {
      console.warn("[ChordEditsManager] Failed saving edits via databaseManager.setChordEdits:", error);
    }

    try {
      if (window.databaseManager?.loadChordsFromIndexedDB && window.databaseManager?.saveToDatabase) {
        const existing = await window.databaseManager.loadChordsFromIndexedDB(videoId);
        if (existing) {
          existing.userChordEdits = normalizedPayload;
          existing.lastUpdated = Date.now();
          await window.databaseManager.saveToDatabase("chords", videoId, existing);
          return { success: true };
        }
      }
    } catch (error) {
      console.warn("[ChordEditsManager] Failed saving edits through load/save fallback:", error);
    }

    try {
      localStorage.setItem(
        fallbackStorageKey(videoId),
        JSON.stringify(normalizedPayload)
      );
      return { success: true };
    } catch (error) {
      console.warn("[ChordEditsManager] Failed saving fallback edits to localStorage:", error);
      return { success: false, error: String(error?.message || error) };
    }
  }

  function emitEditsChanged(videoId, mode) {
    window.dispatchEvent(
      new CustomEvent("yc:chordEditsChanged", {
        detail: {
          videoId: videoId || null,
          mode: normalizeMode(mode),
          timestamp: Date.now(),
        },
      })
    );
  }

  function emitUiChanged(settings) {
    window.dispatchEvent(
      new CustomEvent("yc:chordEditsUiChanged", {
        detail: {
          showEdit: settings.showEdit,
          showRemove: settings.showRemove,
          showModeSwitch: settings.showModeSwitch !== false,
          timestamp: Date.now(),
        },
      })
    );
  }

  function normalizeEditPreviewState(state) {
    if (!state || state.active !== true) return null;
    const rawAction = String(state.action || "").trim().toLowerCase();
    const action = rawAction === "remove" ? "remove" : "edit";

    return {
      active: true,
      action,
      videoId: state.videoId || null,
      mode: normalizeMode(state.mode),
      chordName: String(state.chordName || "").trim(),
      sourceIndices: uniqueSortedNumbers(state.sourceIndices),
      splitSegmentId: String(state.splitSegmentId || "").trim(),
      applyToAll: state.applyToAll === true,
      timestamp: Date.now(),
    };
  }

  function emitEditPreviewChanged(state) {
    window.dispatchEvent(
      new CustomEvent("yc:chordEditPreviewChanged", {
        detail: state || { active: false, timestamp: Date.now() },
      })
    );
  }

  function setEditPreviewState(state) {
    const normalized = normalizeEditPreviewState(state);
    activeEditPreviewState = normalized;
    if (normalized) {
      emitEditPreviewChanged(normalized);
      return normalized;
    }
    emitEditPreviewChanged(null);
    return null;
  }

  function clearEditPreviewState() {
    if (!activeEditPreviewState) return;
    activeEditPreviewState = null;
    emitEditPreviewChanged(null);
  }

  function emitTimingPreviewChanged(state) {
    window.dispatchEvent(
      new CustomEvent("yc:chordTimingPreviewChanged", {
        detail: state || { active: false, timestamp: Date.now() },
      })
    );
  }

  function setTimingPreviewState(state) {
    if (!state || state.active !== true) {
      activeTimingPreviewState = null;
      emitTimingPreviewChanged(null);
      return null;
    }

    const timingBySourceIndex = {};
    const rawTiming = state.timingBySourceIndex || {};
    for (const [rawIndex, rawTime] of Object.entries(rawTiming)) {
      const index = Number.parseInt(rawIndex, 10);
      const time = roundTimingSeconds(rawTime);
      if (!Number.isInteger(index) || index < 0 || time === null) continue;
      timingBySourceIndex[String(index)] = time;
    }

    const roleBySourceIndex = {};
    const rawRoles = state.roleBySourceIndex || {};
    for (const [rawIndex, rawRole] of Object.entries(rawRoles)) {
      const index = Number.parseInt(rawIndex, 10);
      const role = String(rawRole || "").trim().toLowerCase();
      if (!Number.isInteger(index) || index < 0) continue;
      if (!["before", "current", "after"].includes(role)) continue;
      roleBySourceIndex[String(index)] = role;
    }

    const splitByParentSourceIndex = {};
    const rawSplits = state.splitByParentSourceIndex || {};
    if (rawSplits && typeof rawSplits === "object") {
      for (const [rawIndex, rawEntry] of Object.entries(rawSplits)) {
        const entry = normalizeSplitEntry(rawEntry, rawIndex);
        if (!entry) continue;
        splitByParentSourceIndex[String(entry.parentSourceIndex)] = entry;
      }
    }
    const deletedSplitParentSourceIndices = uniqueSortedNumbers(
      state.deletedSplitParentSourceIndices
    );

    activeTimingPreviewState = {
      active: true,
      videoId: state.videoId || null,
      mode: normalizeMode(state.mode),
      timingBySourceIndex,
      roleBySourceIndex,
      splitByParentSourceIndex,
      deletedSplitParentSourceIndices,
      splitPreviewTouched: state.splitPreviewTouched === true,
      timestamp: Date.now(),
    };
    emitTimingPreviewChanged(activeTimingPreviewState);
    return activeTimingPreviewState;
  }

  function clearTimingPreviewState() {
    if (!activeTimingPreviewState) return;
    activeTimingPreviewState = null;
    emitTimingPreviewChanged(null);
  }

  function getEditPreviewState() {
    if (!activeEditPreviewState) return null;
    return {
      ...activeEditPreviewState,
      sourceIndices: uniqueSortedNumbers(activeEditPreviewState.sourceIndices),
    };
  }

  function getTimingPreviewState() {
    if (!activeTimingPreviewState) return null;
    return {
      ...activeTimingPreviewState,
      timingBySourceIndex: { ...(activeTimingPreviewState.timingBySourceIndex || {}) },
      roleBySourceIndex: { ...(activeTimingPreviewState.roleBySourceIndex || {}) },
      splitByParentSourceIndex: deepClone(activeTimingPreviewState.splitByParentSourceIndex || {}),
      deletedSplitParentSourceIndices: uniqueSortedNumbers(activeTimingPreviewState.deletedSplitParentSourceIndices),
    };
  }

  function getUiSettings() {
    return {
      showEdit: localStorage.getItem(UI_SHOW_EDIT_KEY) !== "false",
      showRemove: localStorage.getItem(UI_SHOW_REMOVE_KEY) !== "false",
      showModeSwitch: localStorage.getItem(UI_SHOW_MODE_SWITCH_KEY) !== "false",
    };
  }

  function setUiSettings(nextSettings) {
    const current = getUiSettings();
    const merged = {
      showEdit:
        nextSettings?.showEdit === undefined
          ? current.showEdit
          : nextSettings.showEdit !== false,
      showRemove:
        nextSettings?.showRemove === undefined
          ? current.showRemove
          : nextSettings.showRemove !== false,
      showModeSwitch:
        nextSettings?.showModeSwitch === undefined
          ? current.showModeSwitch
          : nextSettings.showModeSwitch !== false,
    };

    localStorage.setItem(UI_SHOW_EDIT_KEY, String(merged.showEdit));
    localStorage.setItem(UI_SHOW_REMOVE_KEY, String(merged.showRemove));
    localStorage.setItem(UI_SHOW_MODE_SWITCH_KEY, String(merged.showModeSwitch));
    emitUiChanged(merged);
    return merged;
  }

  function buildSongChordList(chords) {
    const ordered = [];
    const seen = new Set();
    if (Array.isArray(chords)) {
      for (const chord of chords) {
        const name =
          typeof chord === "string"
            ? chord.trim()
            : getChordName(chord);
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        ordered.push(name);
      }
    }
    return ordered;
  }

  function buildChordCountList(chords) {
    const ordered = [];
    const indexByKey = new Map();
    if (!Array.isArray(chords)) return ordered;

    for (const chord of chords) {
      const name =
        typeof chord === "string"
          ? chord.trim()
          : getChordName(chord);
      if (!name) continue;

      const key = name.toLowerCase();
      const existingIndex = indexByKey.get(key);
      if (existingIndex !== undefined) {
        ordered[existingIndex].count += 1;
        continue;
      }

      indexByKey.set(key, ordered.length);
      ordered.push({ name, count: 1 });
    }

    return ordered;
  }

  function extractCompleteChordNames(completeChords) {
    if (!completeChords || typeof completeChords !== "object") return [];
    return Object.keys(completeChords)
      .map((name) => String(name || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  function extractCompleteChordNamesFromSource(sourceText) {
    const names = [];
    const seen = new Set();
    const keyPattern = /^\s*"((?:\\.|[^"\\])+)":\s*\[/gm;
    let match = keyPattern.exec(sourceText);

    while (match) {
      let name = "";
      try {
        name = JSON.parse(`"${match[1]}"`);
      } catch (error) {
        name = match[1];
      }

      const clean = String(name || "").trim();
      const key = clean.toLowerCase();
      if (clean && !seen.has(key)) {
        seen.add(key);
        names.push(clean);
      }

      match = keyPattern.exec(sourceText);
    }

    return names.sort((a, b) => a.localeCompare(b));
  }

  async function loadFullChordLibraryNames() {
    if (Array.isArray(fullChordLibraryNamesCache)) {
      return fullChordLibraryNamesCache;
    }

    const existingNames = extractCompleteChordNames(window.COMPLETE_CHORDS);
    if (existingNames.length) {
      fullChordLibraryNamesCache = existingNames;
      return fullChordLibraryNamesCache;
    }

    if (!fullChordLibraryNamesLoadPromise) {
      fullChordLibraryNamesLoadPromise = (async () => {
        const runtime = globalThis.chrome?.runtime;
        const getURL = typeof runtime?.getURL === "function"
          ? runtime.getURL.bind(runtime)
          : null;
        if (!getURL || typeof fetch !== "function") {
          throw new Error("Full chord library is unavailable in this context");
        }

        const response = await fetch(getURL("data/chords.complete.js"));
        if (!response.ok) {
          throw new Error(`Full chord library request failed: ${response.status}`);
        }

        const sourceText = await response.text();
        fullChordLibraryNamesCache = extractCompleteChordNamesFromSource(sourceText);
        return fullChordLibraryNamesCache;
      })().finally(() => {
        fullChordLibraryNamesLoadPromise = null;
      });
    }

    return fullChordLibraryNamesLoadPromise;
  }

  function mergeChordLists(primary, secondary) {
    const output = [];
    const seen = new Set();
    const all = [...(primary || []), ...(secondary || [])];
    for (const name of all) {
      const clean = String(name || "").trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(clean);
    }
    return output;
  }

  function parseChordText(chordText) {
    if (!chordText || typeof chordText !== "string") return [];
    const chords = [];
    const parts = chordText.split(",");
    for (const part of parts) {
      const [timeStr, name] = part.split(":");
      if (!timeStr || !name) continue;
      const time = Number.parseFloat(timeStr);
      if (!Number.isFinite(time)) continue;
      chords.push({
        time,
        name: name.trim(),
      });
    }
    return chords.sort((a, b) => a.time - b.time);
  }

  function normalizeModeChordTexts(raw) {
    if (!raw || typeof raw !== "object") {
      return {
        regular: "",
        regularPlus: "",
        harmonic: "",
        harmonicPlus: "",
      };
    }

    if (raw.chordText && typeof raw.chordText === "object") {
      const regular = String(raw.chordText.regular || "").trim();
      const regularPlus = String(raw.chordText.regularPlus || regular).trim();
      const harmonic = String(raw.chordText.harmonic || regular).trim();
      const harmonicPlus = String(raw.chordText.harmonicPlus || regular).trim();
      return {
        regular,
        regularPlus,
        harmonic,
        harmonicPlus,
      };
    }

    const regular = String(raw.chordText || raw.regular || "").trim();
    const regularPlus = String(raw.chordTextRegularPlus || raw.regularPlus || regular).trim();
    const harmonic = String(raw.chordTextHarmonic || raw.harmonic || regular).trim();
    const harmonicPlus = String(raw.chordTextHarmonicPlus || raw.harmonicPlus || regular).trim();
    return {
      regular,
      regularPlus,
      harmonic,
      harmonicPlus,
    };
  }

  async function resolveModeChordTexts(videoId) {
    const subsetTexts = normalizeModeChordTexts(window.PANEL_SUBSET || null);
    if (subsetTexts.regular) {
      return subsetTexts;
    }

    const cacheEntry = window.chordTextsCache?.[videoId];
    const cacheTexts = normalizeModeChordTexts(cacheEntry || null);
    if (cacheTexts.regular) {
      return cacheTexts;
    }

    try {
      if (window.databaseManager?.loadChordsFromIndexedDB) {
        const dbEntry = await window.databaseManager.loadChordsFromIndexedDB(videoId);
        const dbTexts = normalizeModeChordTexts(dbEntry || null);
        if (dbTexts.regular) {
          return dbTexts;
        }
      }
    } catch (error) {
      log("resolveModeChordTexts loadChordsFromIndexedDB failed:", error);
    }

    try {
      if (window.databaseManager?.loadFromDatabase) {
        const dbEntry = await window.databaseManager.loadFromDatabase("chords", videoId);
        const dbTexts = normalizeModeChordTexts(dbEntry || null);
        if (dbTexts.regular) {
          return dbTexts;
        }
      }
    } catch (error) {
      log("resolveModeChordTexts loadFromDatabase failed:", error);
    }

    return {
      regular: "",
      regularPlus: "",
      harmonic: "",
      harmonicPlus: "",
    };
  }

  async function getSongChordListAcrossModes({ videoId, fallbackSongChords = [] }) {
    const fallbackList = buildSongChordList(fallbackSongChords);
    if (!videoId) {
      return fallbackList;
    }

    const modeTexts = await resolveModeChordTexts(videoId);
    const regularList = buildSongChordList(parseChordText(modeTexts.regular));
    const regularPlusList = buildSongChordList(parseChordText(modeTexts.regularPlus));
    const harmonicList = buildSongChordList(parseChordText(modeTexts.harmonic));
    const harmonicPlusList = buildSongChordList(parseChordText(modeTexts.harmonicPlus));

    return mergeChordLists(
      mergeChordLists(mergeChordLists(mergeChordLists(fallbackList, regularList), regularPlusList), harmonicList),
      harmonicPlusList
    );
  }

  function resolveTuningText(raw) {
    if (!raw || typeof raw !== "object") return "";
    const tuning = String(
      raw.tuningValue ||
      raw.tuning ||
      raw.songTuning ||
      ""
    ).trim();
    return tuning;
  }

  async function resolveSongTuning(videoId) {
    const subsetTuning = resolveTuningText(window.PANEL_SUBSET || null);
    if (subsetTuning) return subsetTuning;

    const cacheTuning = resolveTuningText(window.chordTextsCache?.[videoId] || null);
    if (cacheTuning) return cacheTuning;

    try {
      if (window.databaseManager?.loadChordsFromIndexedDB) {
        const dbEntry = await window.databaseManager.loadChordsFromIndexedDB(videoId);
        const dbTuning = resolveTuningText(dbEntry || null);
        if (dbTuning) return dbTuning;
      }
    } catch (error) {
      log("resolveSongTuning loadChordsFromIndexedDB failed:", error);
    }

    try {
      if (window.databaseManager?.loadFromDatabase) {
        const dbEntry = await window.databaseManager.loadFromDatabase("chords", videoId);
        const dbTuning = resolveTuningText(dbEntry || null);
        if (dbTuning) return dbTuning;
      }
    } catch (error) {
      log("resolveSongTuning loadFromDatabase failed:", error);
    }

    return "";
  }

  async function getChordInfoSummary({
    videoId = null,
    fallbackSongChords = [],
  } = {}) {
    const fallbackCounts = buildChordCountList(fallbackSongChords);
    const fallbackList = fallbackCounts.map((entry) => entry.name);
    const modeTexts = videoId
      ? await resolveModeChordTexts(videoId)
      : { regular: "", regularPlus: "", harmonic: "", harmonicPlus: "" };

    let regularCounts = buildChordCountList(parseChordText(modeTexts.regular));
    const regularPlusCounts = buildChordCountList(parseChordText(modeTexts.regularPlus));
    const harmonicCounts = buildChordCountList(parseChordText(modeTexts.harmonic));
    const harmonicPlusCounts = buildChordCountList(parseChordText(modeTexts.harmonicPlus));
    if (
      !regularCounts.length &&
      !regularPlusCounts.length &&
      !harmonicCounts.length &&
      !harmonicPlusCounts.length &&
      fallbackCounts.length
    ) {
      regularCounts = fallbackCounts.slice();
    }
    const regular = regularCounts.map((entry) => entry.name);
    const regularPlus = regularPlusCounts.map((entry) => entry.name);
    const harmonic = harmonicCounts.map((entry) => entry.name);
    const harmonicPlus = harmonicPlusCounts.map((entry) => entry.name);

    const uniqueAllModes = mergeChordLists(
      mergeChordLists(mergeChordLists(regular, regularPlus), harmonic),
      harmonicPlus
    );

    const finalAllModes = uniqueAllModes.length
      ? uniqueAllModes
      : fallbackList;

    const tuning = videoId ? await resolveSongTuning(videoId) : "";

    return {
      regular,
      regularPlus,
      harmonic,
      harmonicPlus,
      regularCounts,
      regularPlusCounts,
      harmonicCounts,
      harmonicPlusCounts,
      uniqueAllModes: finalAllModes,
      tuning: tuning || "Unknown",
    };
  }

  function formatModeLabel(mode) {
    const safeMode = normalizeMode(mode);
    if (safeMode === "regularPlus") return "Regular+";
    if (safeMode === "harmonicPlus") return "Harmonic+";
    if (safeMode === "harmonic") return "Harmonic";
    return "Regular";
  }

  function formatModeLabelWithLevel(mode) {
    const safeMode = normalizeMode(mode);
    if (safeMode === "regularPlus") return "R+ (Beginner+)";
    if (safeMode === "harmonicPlus") return "H+ (Advanced)";
    if (safeMode === "harmonic") return "H (Intermediate)";
    return "R (Beginner)";
  }

  async function resolveModeSourceChords(videoId, mode, fallbackSongChords = []) {
    const safeMode = normalizeMode(mode);
    const modeTexts = videoId
      ? await resolveModeChordTexts(videoId)
      : { regular: "", regularPlus: "", harmonic: "", harmonicPlus: "" };
    const parsed = parseChordText(modeTexts[safeMode]);
    if (parsed.length) return parsed;

    if (Array.isArray(fallbackSongChords) && fallbackSongChords.length) {
      return fallbackSongChords.map((chord, index) => ({
        time: Number.isFinite(Number(chord?.time)) ? Number(chord.time) : index,
        name: getChordName(chord),
      }));
    }

    return [];
  }

  function resolveEntryChordName(entry, sourceChords) {
    const indices = uniqueSortedNumbers(entry?.sourceIndices);
    if (!indices.length) return "";
    for (const index of indices) {
      const chord = sourceChords[index];
      const name = getChordName(chord);
      if (name) return name;
    }
    return "";
  }

  function resolveEntryTimeSec(entry, sourceChords) {
    const indices = uniqueSortedNumbers(entry?.sourceIndices);
    if (!indices.length) return null;
    for (const index of indices) {
      const chord = sourceChords[index];
      const time = Number(chord?.time);
      if (Number.isFinite(time) && time >= 0) {
        return time;
      }
    }
    return null;
  }

  function formatSecondsAsClock(seconds) {
    const safe = Number(seconds);
    if (!Number.isFinite(safe) || safe < 0) return "";
    const whole = Math.floor(safe);
    const mins = Math.floor(whole / 60);
    const secs = whole % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  function addCount(map, key, increment = 1, meta = null) {
    if (!map || typeof map.set !== "function") return;
    const safeKey = String(key || "").trim();
    if (!safeKey) return;
    const previous = map.get(safeKey);
    const record =
      previous && typeof previous === "object"
        ? {
            count: Number(previous.count) || 0,
            times: Array.isArray(previous.times) ? [...previous.times] : [],
            details: Array.isArray(previous.details) ? [...previous.details] : [],
            hasMerged: previous.hasMerged === true,
          }
        : { count: Number(previous) || 0, times: [], details: [], hasMerged: false };
    record.count += Math.max(1, Number(increment) || 1);

    const timeSec = Number(meta?.timeSec);
    if (Number.isFinite(timeSec) && timeSec >= 0) {
      const rounded = Math.round(timeSec * 10) / 10;
      if (!record.times.includes(rounded)) {
        record.times.push(rounded);
      }
    }

    if (meta?.isMerged === true) {
      record.hasMerged = true;
    }

    const detail = meta?.detail;
    if (detail && typeof detail === "object") {
      const timeSec = Number(detail.timeSec);
      const ranges = Array.isArray(detail.ranges)
        ? detail.ranges
            .map((range) => {
              const rangeTime = Number(range?.timeSec);
              return {
                name: String(range?.name || "").trim(),
                start: String(range?.start || "").trim(),
                end: String(range?.end || "").trim(),
                timeSec: Number.isFinite(rangeTime) && rangeTime >= 0
                  ? Math.round(rangeTime * 10) / 10
                  : null,
              };
            })
            .filter((range) => range.name && range.start)
        : [];
      const normalizedDetail = {
        timeSec: Number.isFinite(timeSec) && timeSec >= 0
          ? Math.round(timeSec * 10) / 10
          : null,
        from: String(detail.from || "").trim(),
        to: String(detail.to || "").trim(),
        name: String(detail.name || "").trim(),
        anchorName: String(detail.anchorName || "").trim(),
        anchorTime: String(detail.anchorTime || "").trim(),
        changedName: String(detail.changedName || "").trim(),
        boundary: String(detail.boundary || "").trim(),
        ranges,
      };
      const rangesSignature = normalizedDetail.ranges
        .map((range) => `${range.name}:${range.start}->${range.end}:${String(range.timeSec)}`)
        .join("\u241e");
      const signature = `${normalizedDetail.name}\u241f${normalizedDetail.anchorName}\u241f${normalizedDetail.anchorTime}\u241f${normalizedDetail.changedName}\u241f${normalizedDetail.boundary}\u241f${normalizedDetail.from}\u241f${normalizedDetail.to}\u241f${String(normalizedDetail.timeSec)}\u241f${rangesSignature}`;
      const exists = record.details.some((entry) => {
        const entryTime = Number(entry?.timeSec);
        const entryRanges = Array.isArray(entry?.ranges) ? entry.ranges : [];
        const entryRangesSignature = entryRanges
          .map((range) => `${String(range?.name || "").trim()}:${String(range?.start || "").trim()}->${String(range?.end || "").trim()}:${String(range?.timeSec ?? "null")}`)
          .join("\u241e");
        const entrySignature = `${String(entry?.name || "").trim()}\u241f${String(entry?.anchorName || "").trim()}\u241f${String(entry?.anchorTime || "").trim()}\u241f${String(entry?.changedName || "").trim()}\u241f${String(entry?.boundary || "").trim()}\u241f${String(entry?.from || "").trim()}\u241f${String(entry?.to || "").trim()}\u241f${Number.isFinite(entryTime) ? Math.round(entryTime * 10) / 10 : "null"}\u241f${entryRangesSignature}`;
        return entrySignature === signature;
      });
      if (!exists) {
        record.details.push(normalizedDetail);
      }
    }

    map.set(safeKey, record);
  }

  function mapToSortedSummary(map, mapper) {
    const list = [...(map?.entries?.() || [])]
      .map(([key, value]) => {
        const count = Number(value?.count);
        const normalizedCount = Number.isFinite(count) ? count : Number(value) || 0;
        const times = Array.isArray(value?.times)
          ? [...value.times]
              .map((entry) => Number(entry))
              .filter((entry) => Number.isFinite(entry) && entry >= 0)
              .sort((a, b) => a - b)
          : [];
        const details = Array.isArray(value?.details)
          ? [...value.details].sort((a, b) => {
              const at = Number(a?.timeSec);
              const bt = Number(b?.timeSec);
              const safeA = Number.isFinite(at) ? at : Number.POSITIVE_INFINITY;
              const safeB = Number.isFinite(bt) ? bt : Number.POSITIVE_INFINITY;
              if (safeA !== safeB) return safeA - safeB;
              const aLabel = `${String(a?.name || "")}${String(a?.from || "")}${String(a?.to || "")}`;
              const bLabel = `${String(b?.name || "")}${String(b?.from || "")}${String(b?.to || "")}`;
              return aLabel.localeCompare(bLabel);
            })
          : [];
        return mapper(key, normalizedCount, {
          times,
          details,
          hasMerged: value?.hasMerged === true,
        });
      })
      .filter(Boolean)
      .sort((a, b) => {
        if ((b.count || 0) !== (a.count || 0)) {
          return (b.count || 0) - (a.count || 0);
        }
        return String(a.label || "").localeCompare(String(b.label || ""));
      });
    return list;
  }

  async function getChordEditsSummary({
    videoId = null,
    mode = "regular",
    threshold = 0.5,
    currentCapoFret = 0,
    fallbackSongChords = [],
  } = {}) {
    const safeMode = normalizeMode(mode);
    const modeLabel = formatModeLabel(safeMode);
    const safeThreshold = clampThreshold(threshold);
    const safeCurrentCapoFret = clampCapo(currentCapoFret);

    const emptySummary = {
      mode: safeMode,
      modeLabel,
      currentThreshold: safeThreshold,
      currentCapoFret: safeCurrentCapoFret,
      thresholds: [],
      hasAnyEdits: false,
      hasCurrentThresholdEdits: false,
      state: "none",
      currentTotal: 0,
      allTotal: 0,
      removedCurrent: [],
      removedAll: [],
      editedCurrent: [],
      editedAll: [],
      addedCurrent: [],
      addedAll: [],
      timingCurrent: [],
      timingAll: [],
    };

    if (!videoId) {
      return emptySummary;
    }

    const payload = await loadEdits(videoId);
    const bucket = getModeBucket(payload, safeMode, false);
    if (!bucket) {
      return emptySummary;
    }

    const sourceChords = await resolveModeSourceChords(videoId, safeMode, fallbackSongChords);
    const thresholdsSet = new Set();
    const caposSet = new Set();

    const removedAllMap = new Map();
    const removedCurrentMap = new Map();
    const editedAllMap = new Map();
    const editedCurrentMap = new Map();
    const addedAllMap = new Map();
    const addedCurrentMap = new Map();
    const timingAllMap = new Map();
    const timingCurrentMap = new Map();

    const removedEntries = Object.values(bucket.removed || {});
    for (const entry of removedEntries) {
      const entryThreshold = clampThreshold(entry?.threshold);
      const entryCapoFret = clampCapo(entry?.capoFret);
      const entryTimeSec = resolveEntryTimeSec(entry, sourceChords);
      const isMerged =
        Number.parseInt(entry?.mergedGroupSize, 10) > 1 &&
        String(entry?.mergedGroupKey || "").trim().length > 0;
      const mergedGroupKey = String(entry?.mergedGroupKey || "").trim();
      thresholdsSet.add(entryThreshold);
      caposSet.add(entryCapoFret);

      const sourceName = resolveEntryChordName(entry, sourceChords) || "Unknown";
      const mergedDisplayName =
        String(entry?.mergedDisplayChordName || "").trim() || sourceName;
      const mapKey = isMerged
        ? `merged\u241f${mergedGroupKey}\u241f${mergedDisplayName}\u241f${entryThreshold.toFixed(1)}\u241f${entryCapoFret}`
        : `${sourceName}\u241f${entryThreshold.toFixed(1)}\u241f${entryCapoFret}`;
      addCount(removedAllMap, mapKey, 1, {
        timeSec: entryTimeSec,
        isMerged,
        detail: {
          timeSec: entryTimeSec,
          name: sourceName,
        },
      });
      if (entryThreshold === safeThreshold) {
        addCount(removedCurrentMap, mapKey, 1, {
          timeSec: entryTimeSec,
          isMerged,
          detail: {
            timeSec: entryTimeSec,
            name: sourceName,
          },
        });
      }
    }

    const replacedEntries = Object.values(bucket.replaced || {});
    for (const entry of replacedEntries) {
      const entryThreshold = clampThreshold(entry?.threshold);
      const entryCapoFret = clampCapo(entry?.capoFret);
      const entryTimeSec = resolveEntryTimeSec(entry, sourceChords);
      const isMerged =
        Number.parseInt(entry?.mergedGroupSize, 10) > 1 &&
        String(entry?.mergedGroupKey || "").trim().length > 0;
      const mergedGroupKey = String(entry?.mergedGroupKey || "").trim();
      thresholdsSet.add(entryThreshold);
      caposSet.add(entryCapoFret);

      const nextChordName = String(entry?.nextChordName || "").trim();
      if (!nextChordName) continue;

      const previousChordName =
        String(entry?.previousChordName || "").trim() ||
        resolveEntryChordName(entry, sourceChords) ||
        "Unknown";
      const mergedDisplayFrom =
        String(entry?.mergedDisplayChordName || "").trim() || previousChordName;
      const editKey = isMerged
        ? `merged\u241f${mergedGroupKey}\u241f${mergedDisplayFrom}\u241f${nextChordName}\u241f${entryThreshold.toFixed(1)}\u241f${entryCapoFret}`
        : `${previousChordName}\u241f${nextChordName}\u241f${entryThreshold.toFixed(1)}\u241f${entryCapoFret}`;
      addCount(editedAllMap, editKey, 1, {
        timeSec: entryTimeSec,
        isMerged,
        detail: {
          timeSec: entryTimeSec,
          from: previousChordName,
          to: nextChordName,
        },
      });
      if (entryThreshold === safeThreshold) {
        addCount(editedCurrentMap, editKey, 1, {
          timeSec: entryTimeSec,
          isMerged,
          detail: {
            timeSec: entryTimeSec,
            from: previousChordName,
            to: nextChordName,
          },
        });
      }
    }

    const timingEntries = Object.values(bucket.timing || {})
      .map((rawEntry) => normalizeTimingEntry(rawEntry))
      .filter(Boolean);
    const finalStartBySourceIndex = new Map();
    sourceChords.forEach((chord, index) => {
      const start = roundTimingSeconds(chord?.time);
      if (start !== null) {
        finalStartBySourceIndex.set(index, start);
      }
    });
    timingEntries.forEach((entry) => {
      const time = roundTimingSeconds(entry?.time);
      if (time !== null) {
        finalStartBySourceIndex.set(entry.sourceIndex, time);
      }
    });
    const getFinalStart = (sourceIndex) => {
      if (!Number.isInteger(sourceIndex) || sourceIndex < 0) return null;
      const time = finalStartBySourceIndex.get(sourceIndex);
      return roundTimingSeconds(time);
    };
    const buildTimingRange = (sourceIndex, fallbackName = "") => {
      if (!Number.isInteger(sourceIndex) || sourceIndex < 0) return null;
      const chord = sourceChords[sourceIndex];
      const name =
        getChordName(chord) ||
        String(fallbackName || "").trim() ||
        "Unknown";
      const start = getFinalStart(sourceIndex);
      if (start === null) return null;
      const end = getFinalStart(sourceIndex + 1);
      return {
        name,
        start: formatTimingSummaryValue(start),
        end: end !== null ? formatTimingSummaryValue(end) : "",
        timeSec: start,
      };
    };

    for (const entry of timingEntries) {
      thresholdsSet.add(safeThreshold);

      const sourceChord = sourceChords[entry.sourceIndex];
      const chordName = getChordName(sourceChord) || "Unknown";
      const anchorChord = sourceChords[entry.anchorSourceIndex];
      const anchorName =
        String(entry.anchorChordName || "").trim() ||
        getChordName(anchorChord) ||
        chordName;
      const changedName =
        String(entry.changedChordName || "").trim() ||
        chordName;
      const boundary =
        entry.boundary === "before" || entry.boundary === "after"
          ? entry.boundary
          : "";
      const boundaryLabel =
        boundary === "before" ? "Before" : boundary === "after" ? "After" : "";
      const originalTime = roundTimingSeconds(entry.originalTime ?? sourceChord?.time);
      const nextTime = roundTimingSeconds(entry.time);
      if (nextTime === null) continue;
      const anchorTime = roundTimingSeconds(entry.time ?? anchorChord?.time);
      const anchorTimeLabel = anchorTime !== null ? formatTimingClock(anchorTime) : "";
      const anchorSourceIndex = Number.isInteger(entry.anchorSourceIndex)
        ? entry.anchorSourceIndex
        : (boundary === "after" ? entry.sourceIndex - 1 : entry.sourceIndex);
      const ranges = boundary === "before"
        ? [
            buildTimingRange(entry.sourceIndex - 1, changedName),
            buildTimingRange(entry.sourceIndex, anchorName),
          ]
        : boundary === "after"
          ? [
              buildTimingRange(anchorSourceIndex, anchorName),
              buildTimingRange(entry.sourceIndex, changedName),
            ]
          : [buildTimingRange(entry.sourceIndex, chordName)];
      const timingRanges = ranges.filter(Boolean);
      const rangeTimeSec = Number(timingRanges[0]?.timeSec);
      const timingTimeSec = Number.isFinite(rangeTimeSec) && rangeTimeSec >= 0
        ? rangeTimeSec
        : nextTime;
      const rangesKey = timingRanges
        .map((range) => `${range.name}:${range.start}->${range.end}`)
        .join("\u241e");

      const timingKey = `${entry.sourceIndex}\u241f${chordName}\u241f${String(originalTime)}\u241f${String(nextTime)}\u241f${anchorName}\u241f${changedName}\u241f${boundaryLabel}\u241f${anchorTimeLabel}\u241f${rangesKey}`;
      const detail = {
        timeSec: timingTimeSec,
        name: chordName,
        anchorName,
        anchorTime: anchorTimeLabel,
        changedName,
        boundary: boundaryLabel,
        from: originalTime !== null ? formatTimingClock(originalTime) : "",
        to: formatTimingClock(nextTime),
        ranges: timingRanges,
      };
      addCount(timingAllMap, timingKey, 1, {
        timeSec: timingTimeSec,
        detail,
      });
      addCount(timingCurrentMap, timingKey, 1, {
        timeSec: timingTimeSec,
        detail,
      });
    }

    const splitEntries = Object.values(bucket.splits || {})
      .map((rawEntry) => normalizeSplitEntry(rawEntry))
      .filter(Boolean);
    for (const entry of splitEntries) {
      thresholdsSet.add(safeThreshold);
      const sourceChord = sourceChords[entry.parentSourceIndex];
      const parentName =
        String(entry.currentChordName || "").trim() ||
        getChordName(sourceChord) ||
        "Unknown";
      const start = getFinalStart(entry.parentSourceIndex);
      if (start === null) continue;
      const parentEnd = getFinalStart(entry.parentSourceIndex + 1);
      const parentDuration = parentEnd !== null
        ? roundTimingSeconds(parentEnd - start)
        : null;
      const beforeDuration = sumSplitDurations(entry.before || []);
      const afterDuration = sumSplitDurations(entry.after || []);
      const fallbackCurrentDuration = parentDuration !== null
        ? Math.max(
          MIN_CHORD_DURATION_SECONDS,
          roundTimingSeconds(parentDuration - beforeDuration - afterDuration) ?? MIN_CHORD_DURATION_SECONDS
        )
        : null;

      let cursor = start;
      const addSplitSegmentSummary = (segment, side, order) => {
        const duration = roundTimingSeconds(segment?.duration);
        const name = String(segment?.chordName || "").trim();
        if (!name || duration === null) return;

        const sideLabel = side === "before" ? "Before" : "After";
        const timeSec = roundTimingSeconds(cursor) ?? start;
        const key = [
          "added",
          entry.parentSourceIndex,
          parentName,
          sideLabel,
          name,
          String(duration),
          String(order),
          String(timeSec),
        ].join("\u241f");
        const detail = {
          timeSec,
          name,
          parentName,
          side: sideLabel,
          duration,
        };
        addCount(addedAllMap, key, 1, {
          timeSec,
          detail,
        });
        addCount(addedCurrentMap, key, 1, {
          timeSec,
          detail,
        });
        cursor = roundTimingSeconds(cursor + duration) ?? cursor;
      };

      (entry.before || []).forEach((segment, order) => {
        addSplitSegmentSummary(segment, "before", order);
      });
      const currentDuration = roundTimingSeconds(entry.currentDuration) ?? fallbackCurrentDuration;
      if (currentDuration !== null) {
        cursor = roundTimingSeconds(cursor + currentDuration) ?? cursor;
      }
      (entry.after || []).forEach((segment, order) => {
        addSplitSegmentSummary(segment, "after", order);
      });
    }

    const removedAll = mapToSortedSummary(removedAllMap, (key, count, meta) => {
      const parts = String(key || "").split("\u241f");
      const isMerged = parts[0] === "merged";
      const name = isMerged ? parts[2] : parts[0];
      const thresholdRaw = isMerged ? parts[3] : parts[1];
      const capoRaw = isMerged ? parts[4] : parts[2];
      const entryThreshold = clampThreshold(thresholdRaw);
      const entryCapoFret = clampCapo(capoRaw);
      const times = Array.isArray(meta?.times) ? meta.times : [];
      const details = Array.isArray(meta?.details) ? meta.details : [];
      return {
        name: name || "Unknown",
        count,
        threshold: entryThreshold,
        capoFret: entryCapoFret,
        times,
        details,
        isMerged,
        timeSec: count === 1 && times.length === 1 ? times[0] : null,
        mode: safeMode,
        modeLabel,
        label: `${name || "Unknown"} | ${entryThreshold.toFixed(1)}s | capo ${entryCapoFret}`,
      };
    });
    const removedCurrent = mapToSortedSummary(removedCurrentMap, (key, count, meta) => {
      const parts = String(key || "").split("\u241f");
      const isMerged = parts[0] === "merged";
      const name = isMerged ? parts[2] : parts[0];
      const thresholdRaw = isMerged ? parts[3] : parts[1];
      const capoRaw = isMerged ? parts[4] : parts[2];
      const entryThreshold = clampThreshold(thresholdRaw);
      const entryCapoFret = clampCapo(capoRaw);
      const times = Array.isArray(meta?.times) ? meta.times : [];
      const details = Array.isArray(meta?.details) ? meta.details : [];
      return {
        name: name || "Unknown",
        count,
        threshold: entryThreshold,
        capoFret: entryCapoFret,
        times,
        details,
        isMerged,
        timeSec: count === 1 && times.length === 1 ? times[0] : null,
        mode: safeMode,
        modeLabel,
        label: `${name || "Unknown"} | ${entryThreshold.toFixed(1)}s | capo ${entryCapoFret}`,
      };
    });

    const editedAll = mapToSortedSummary(editedAllMap, (key, count, meta) => {
      const parts = String(key || "").split("\u241f");
      const isMerged = parts[0] === "merged";
      const from = isMerged ? parts[2] : parts[0];
      const to = isMerged ? parts[3] : parts[1];
      const thresholdRaw = isMerged ? parts[4] : parts[2];
      const capoRaw = isMerged ? parts[5] : parts[3];
      if (!from || !to) return null;
      const entryThreshold = clampThreshold(thresholdRaw);
      const entryCapoFret = clampCapo(capoRaw);
      const times = Array.isArray(meta?.times) ? meta.times : [];
      const details = Array.isArray(meta?.details) ? meta.details : [];
      return {
        from,
        to,
        count,
        threshold: entryThreshold,
        capoFret: entryCapoFret,
        times,
        details,
        isMerged,
        timeSec: count === 1 && times.length === 1 ? times[0] : null,
        mode: safeMode,
        modeLabel,
        label: `${from} -> ${to} | ${entryThreshold.toFixed(1)}s | capo ${entryCapoFret}`,
      };
    });
    const editedCurrent = mapToSortedSummary(editedCurrentMap, (key, count, meta) => {
      const parts = String(key || "").split("\u241f");
      const isMerged = parts[0] === "merged";
      const from = isMerged ? parts[2] : parts[0];
      const to = isMerged ? parts[3] : parts[1];
      const thresholdRaw = isMerged ? parts[4] : parts[2];
      const capoRaw = isMerged ? parts[5] : parts[3];
      if (!from || !to) return null;
      const entryThreshold = clampThreshold(thresholdRaw);
      const entryCapoFret = clampCapo(capoRaw);
      const times = Array.isArray(meta?.times) ? meta.times : [];
      const details = Array.isArray(meta?.details) ? meta.details : [];
      return {
        from,
        to,
        count,
        threshold: entryThreshold,
        capoFret: entryCapoFret,
        times,
        details,
        isMerged,
        timeSec: count === 1 && times.length === 1 ? times[0] : null,
        mode: safeMode,
        modeLabel,
        label: `${from} -> ${to} | ${entryThreshold.toFixed(1)}s | capo ${entryCapoFret}`,
      };
    });

    const buildAddedSummaryItem = (key, count, meta) => {
      const parts = String(key || "").split("\u241f");
      const parentSourceIndex = Number.parseInt(parts[1], 10);
      const parentName = parts[2] || "Unknown";
      const side = parts[3] || "";
      const name = parts[4] || "Unknown";
      const duration = roundTimingSeconds(parts[5]);
      const times = Array.isArray(meta?.times) ? meta.times : [];
      const details = Array.isArray(meta?.details) ? meta.details : [];
      return {
        parentSourceIndex: Number.isInteger(parentSourceIndex) ? parentSourceIndex : null,
        parentName,
        side,
        name,
        duration,
        count,
        times,
        details,
        timeSec: count === 1 && times.length === 1 ? times[0] : null,
        mode: safeMode,
        modeLabel,
        label: `${name} ${side ? `${side.toLowerCase()} ` : ""}${parentName}`,
      };
    };
    const addedAll = mapToSortedSummary(addedAllMap, buildAddedSummaryItem);
    const addedCurrent = mapToSortedSummary(addedCurrentMap, buildAddedSummaryItem);

    const timingAll = mapToSortedSummary(timingAllMap, (key, count, meta) => {
      const parts = String(key || "").split("\u241f");
      const sourceIndex = Number.parseInt(parts[0], 10);
      const name = parts[1] || "Unknown";
      const from = parts[2] === "null" ? "" : parts[2];
      const to = parts[3] === "null" ? "" : parts[3];
      const anchorName = parts[4] || name;
      const changedName = parts[5] || name;
      const boundary = parts[6] || "";
      const anchorTime = parts[7] || "";
      const times = Array.isArray(meta?.times) ? meta.times : [];
      const details = Array.isArray(meta?.details) ? meta.details : [];
      const ranges = Array.isArray(details[0]?.ranges) ? details[0].ranges : [];
      return {
        sourceIndex: Number.isInteger(sourceIndex) ? sourceIndex : null,
        name,
        anchorName,
        anchorTime,
        changedName,
        boundary,
        from,
        to,
        count,
        times,
        details,
        ranges,
        timeSec: count === 1 && times.length === 1 ? times[0] : null,
        mode: safeMode,
        modeLabel,
        label: ranges.length
          ? ranges.map((range) => `${range.name}: ${range.start} -> ${range.end}`).join(", ")
          : `${anchorName} ${anchorTime} ${changedName} timing ${from} -> ${to}`,
      };
    });
    const timingCurrent = mapToSortedSummary(timingCurrentMap, (key, count, meta) => {
      const parts = String(key || "").split("\u241f");
      const sourceIndex = Number.parseInt(parts[0], 10);
      const name = parts[1] || "Unknown";
      const from = parts[2] === "null" ? "" : parts[2];
      const to = parts[3] === "null" ? "" : parts[3];
      const anchorName = parts[4] || name;
      const changedName = parts[5] || name;
      const boundary = parts[6] || "";
      const anchorTime = parts[7] || "";
      const times = Array.isArray(meta?.times) ? meta.times : [];
      const details = Array.isArray(meta?.details) ? meta.details : [];
      const ranges = Array.isArray(details[0]?.ranges) ? details[0].ranges : [];
      return {
        sourceIndex: Number.isInteger(sourceIndex) ? sourceIndex : null,
        name,
        anchorName,
        anchorTime,
        changedName,
        boundary,
        from,
        to,
        count,
        times,
        details,
        ranges,
        timeSec: count === 1 && times.length === 1 ? times[0] : null,
        mode: safeMode,
        modeLabel,
        label: ranges.length
          ? ranges.map((range) => `${range.name}: ${range.start} -> ${range.end}`).join(", ")
          : `${anchorName} ${anchorTime} ${changedName} timing ${from} -> ${to}`,
      };
    });

    const currentTotal = removedCurrent.reduce((sum, item) => sum + (item.count || 0), 0)
      + editedCurrent.reduce((sum, item) => sum + (item.count || 0), 0)
      + addedCurrent.reduce((sum, item) => sum + (item.count || 0), 0)
      + timingCurrent.reduce((sum, item) => sum + (item.count || 0), 0);
    const allTotal = removedAll.reduce((sum, item) => sum + (item.count || 0), 0)
      + editedAll.reduce((sum, item) => sum + (item.count || 0), 0)
      + addedAll.reduce((sum, item) => sum + (item.count || 0), 0)
      + timingAll.reduce((sum, item) => sum + (item.count || 0), 0);

    const hasAnyEdits = allTotal > 0;
    const hasCurrentThresholdEdits = currentTotal > 0;
    const state = hasCurrentThresholdEdits
      ? "active"
      : hasAnyEdits
        ? "threshold-mismatch"
        : "none";

    return {
      mode: safeMode,
      modeLabel,
      currentThreshold: safeThreshold,
      currentCapoFret: safeCurrentCapoFret,
      thresholds: [...thresholdsSet].sort((a, b) => a - b),
      capos: [...caposSet].sort((a, b) => a - b),
      hasAnyEdits,
      hasCurrentThresholdEdits,
      state,
      currentTotal,
      allTotal,
      removedCurrent,
      removedAll,
      editedCurrent,
      editedAll,
      addedCurrent,
      addedAll,
      timingCurrent,
      timingAll,
    };
  }

  async function confirmChordRemoveOnce() {
    try {
      if (localStorage.getItem(REMOVE_CONFIRM_KEY) === "true") {
        return true;
      }
    } catch (error) {
      log("Failed reading remove confirm key:", error);
    }

    if (activeRemoveConfirmPromise) {
      return activeRemoveConfirmPromise;
    }

    activeRemoveConfirmPromise = (async () => {
      if (window.ycUtils?.showLongVideoConfirmModal) {
        return window.ycUtils.showLongVideoConfirmModal({
          title: "Confirm Removal",
          message: "This action will remove this chord.\nAre you sure you want to continue?",
          details: "",
          icon: "⚠️",
          iconSize: "60px",
          messageFontSize: "13px",
          continueText: "Remove",
          cancelText: "Cancel",
        });
      }

      return window.confirm("Are you sure you want to remove this chord?");
    })();

    let confirmed = false;
    try {
      confirmed = await activeRemoveConfirmPromise;
    } catch (error) {
      log("Remove confirmation modal failed:", error);
      confirmed = false;
    } finally {
      activeRemoveConfirmPromise = null;
    }

    if (confirmed) {
      try {
        localStorage.setItem(REMOVE_CONFIRM_KEY, "true");
      } catch (error) {
        log("Failed storing remove confirm key:", error);
      }
    }
    return confirmed;
  }

  function closeChordRemoveScopePicker() {
    if (typeof activeRemoveScopeClose === "function") {
      const close = activeRemoveScopeClose;
      activeRemoveScopeClose = null;
      activeRemoveScopeAnchor = null;
      close();
      return;
    }
    activeRemoveScopeAnchor = null;
  }

  function closeChordTimingEditor() {
    if (typeof activeTimingEditorClose === "function") {
      const close = activeTimingEditorClose;
      activeTimingEditorClose = null;
      activeTimingEditorAnchor = null;
      close();
      return;
    }
    clearTimingPreviewState();
    activeTimingEditorAnchor = null;
  }

  function closeChordEditsSummaryPopup() {
    if (typeof activeChordEditsSummaryClose === "function") {
      const close = activeChordEditsSummaryClose;
      const anchor = activeChordEditsSummaryAnchor;
      activeChordEditsSummaryClose = null;
      activeChordEditsSummaryAnchor = null;
      setChordEditsSummaryAnchorState(anchor, false);
      close();
      return;
    }
    setChordEditsSummaryAnchorState(activeChordEditsSummaryAnchor, false);
    activeChordEditsSummaryAnchor = null;
  }

  function closeChordInfoPopup() {
    if (typeof activeChordInfoClose === "function") {
      const close = activeChordInfoClose;
      const anchor = activeChordInfoAnchor;
      activeChordInfoClose = null;
      activeChordInfoAnchor = null;
      setChordInfoAnchorState(anchor, false);
      close();
      return;
    }
    setChordInfoAnchorState(activeChordInfoAnchor, false);
    activeChordInfoAnchor = null;
  }

  function openChordInfoPopup({
    anchorEl,
    videoId = null,
    fallbackSongChords = [],
    capoContext = "panel",
  } = {}) {
    if (!anchorEl || !document?.body) {
      return null;
    }

    // Toggle behavior: clicking same "i" closes the currently opened popup.
    if (activeChordInfoClose && activeChordInfoAnchor === anchorEl) {
      closeChordInfoPopup();
      return null;
    }

    closeChordInfoPopup();
    closeChordEditsSummaryPopup();
    closeChordReplacePicker();
    closeChordRemoveScopePicker();
    closeChordTimingEditor();

    const safeCapoState = resolveCapoEditState(capoContext);

    const panel = document.createElement("div");
    panel.style.cssText = `
      position: fixed;
      width: 320px;
      max-width: calc(100vw - 16px);
      max-height: min(420px, calc(100vh - 24px));
      background: rgba(19, 19, 19, 0.98);
      border: 2.5px solid rgba(52, 149, 233, 0.85);
      border-radius: 10px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.48);
      backdrop-filter: blur(10px);
      color: #fff;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px;
      overflow: hidden;
      direction: ltr;
      unicode-bidi: isolate;
      text-align: left;
    `;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Song chord info");
    panel.setAttribute("dir", "ltr");
    panel.setAttribute("data-yc-owned", "true");
    const panelZIndex = resolvePickerZIndex(anchorEl);
    panel.style.zIndex = String(panelZIndex);
    const anchorConnector = document.createElement("div");
    anchorConnector.style.cssText = `
      position: fixed;
      width: 2px;
      height: 0;
      background: rgba(52, 149, 233, 0.85);
      border-radius: 999px;
      pointer-events: none;
      opacity: 0;
    `;
    anchorConnector.style.zIndex = String(panelZIndex);
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
      top: 8px;
      right: 8px;
      width: 22px;
      height: 22px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.92);
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      padding: 0;
      cursor: pointer;
      transition: background 0.12s ease, border-color 0.12s ease;
    `;
    closeButton.addEventListener("mouseenter", () => {
      closeButton.style.background = "rgba(239, 68, 68, 0.22)";
      closeButton.style.borderColor = "rgba(248, 113, 113, 0.85)";
    });
    closeButton.addEventListener("mouseleave", () => {
      closeButton.style.background = "rgba(255, 255, 255, 0.08)";
      closeButton.style.borderColor = "rgba(255, 255, 255, 0.3)";
    });

    const titleRow = document.createElement("div");
    titleRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-right: 28px;
    `;

    const title = document.createElement("div");
    title.textContent = "Chord Info";
    title.style.cssText = `
      font-size: 13px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.92);
      letter-spacing: 0.2px;
      flex: 1 1 auto;
      min-width: 0;
    `;

    const capoPickerWrap = document.createElement("label");
    capoPickerWrap.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
      white-space: nowrap;
    `;

    const capoLabel = document.createElement("span");
    capoLabel.textContent = "Capo:";
    capoLabel.style.cssText = `
      font-size: 11px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.8);
      letter-spacing: 0.1px;
    `;

    const capoSelect = document.createElement("select");
    capoSelect.setAttribute("aria-label", "Choose capo fret for chord info");
    capoSelect.style.cssText = `
      height: 24px;
      min-width: 66px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.26);
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.94);
      font-size: 12px;
      font-weight: 700;
      padding: 0 20px 0 8px;
      outline: none;
      cursor: pointer;
      text-align: center;
      text-align-last: center;
    `;

    for (let fret = 0; fret <= 12; fret += 1) {
      const option = document.createElement("option");
      option.value = String(fret);
      option.textContent = String(fret);
      option.style.color = "#111111";
      option.style.backgroundColor = "#ffffff";
      option.style.fontSize = "12px";
      option.style.fontWeight = "700";
      option.style.textAlign = "center";
      capoSelect.appendChild(option);
    }
    const initialCapoFret = safeCapoState.active ? safeCapoState.fret : 0;
    capoSelect.value = String(Math.max(0, Math.min(12, Number(initialCapoFret) || 0)));

    capoPickerWrap.appendChild(capoLabel);
    capoPickerWrap.appendChild(capoSelect);

    const initialPanelScale = loadPopupScaleSetting(INFO_POPUP_SCALE_KEY, 100);
    const popupScaleControl = createPopupScaleControl({
      initialPercent: initialPanelScale,
      onChange: (nextPercent) => {
        savePopupScaleSetting(INFO_POPUP_SCALE_KEY, nextPercent);
        applyPanelScale(nextPercent);
      },
    });
    titleRow.appendChild(title);
    titleRow.appendChild(popupScaleControl.element);

    const capoRow = document.createElement("div");
    capoRow.style.cssText = `
      display: flex;
      justify-content: flex-start;
      margin-top: -2px;
    `;
    capoRow.appendChild(capoPickerWrap);

    const subtitle = document.createElement("div");
    subtitle.textContent = "Chords in this song";
    subtitle.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.78);
      letter-spacing: 0.15px;
      margin-top: 2px;
      padding-right: 28px;
    `;

    let showChordCounts = loadChordInfoShowCountsSetting();
    let sortByCount = loadChordInfoSortByCountSetting();

    const showCountsRow = document.createElement("label");
    showCountsRow.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.84);
      margin-top: -2px;
      padding-right: 28px;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
    `;

    const showCountsToggle = document.createElement("input");
    showCountsToggle.type = "checkbox";
    showCountsToggle.checked = showChordCounts;
    showCountsToggle.setAttribute("aria-label", "Show chord count in chord info");
    showCountsToggle.style.cssText = `
      width: 14px;
      height: 14px;
      cursor: pointer;
      accent-color: #3b82f6;
      margin: 0;
    `;

    const showCountsText = document.createElement("span");
    const updateShowCountsLabel = () => {
      showCountsText.textContent = `Show count (xN): ${showChordCounts ? "ON" : "OFF"}`;
    };
    updateShowCountsLabel();

    showCountsRow.appendChild(showCountsToggle);
    showCountsRow.appendChild(showCountsText);

    const sortByCountRow = document.createElement("label");
    sortByCountRow.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.84);
      margin-top: -4px;
      padding-right: 28px;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
    `;

    const sortByCountToggle = document.createElement("input");
    sortByCountToggle.type = "checkbox";
    sortByCountToggle.checked = sortByCount;
    sortByCountToggle.setAttribute("aria-label", "Sort chords by count in chord info");
    sortByCountToggle.style.cssText = `
      width: 14px;
      height: 14px;
      cursor: pointer;
      accent-color: #3b82f6;
      margin: 0;
    `;

    const sortByCountText = document.createElement("span");
    const updateSortByCountLabel = () => {
      sortByCountText.textContent = `Sort by frequency: ${sortByCount ? "ON" : "OFF"}`;
    };
    updateSortByCountLabel();

    sortByCountRow.appendChild(sortByCountToggle);
    sortByCountRow.appendChild(sortByCountText);

    const content = document.createElement("div");
    content.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow: auto;
      max-height: calc(min(420px, calc(100vh - 24px)) - 44px);
      padding-right: 2px;
    `;

    const loading = document.createElement("div");
    loading.textContent = "Loading chord info...";
    loading.style.cssText = `
      color: rgba(255, 255, 255, 0.76);
      font-size: 12px;
      padding: 6px 0 2px;
    `;
    content.appendChild(loading);

    const createSection = (label, values, count = null) => {
      const section = document.createElement("div");
      section.style.cssText = `
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.04);
        padding: 8px 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      `;

      const heading = document.createElement("div");
      heading.textContent =
        count == null ? label : `${label} (${count})`;
      heading.style.cssText = `
        font-size: 11px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.92);
      `;

      const body = document.createElement("div");
      body.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      `;

      const chips = Array.isArray(values) ? values : [];
      if (!chips.length) {
        const empty = document.createElement("span");
        empty.textContent = "None";
        empty.style.cssText = `
          font-size: 12px;
          color: rgba(255, 255, 255, 0.66);
        `;
        body.appendChild(empty);
      } else {
        for (const entry of chips) {
          const rawName =
            entry && typeof entry === "object" && !Array.isArray(entry)
              ? entry.name
              : entry;
          const chordName = String(rawName || "").trim();
          if (!chordName) continue;

          let countSuffix = "";
          if (entry && typeof entry === "object" && !Array.isArray(entry)) {
            const count = Number(entry.count);
            if (Number.isFinite(count) && count > 0) {
              countSuffix = ` x${Math.floor(count)}`;
            }
          }

          const chip = document.createElement("span");
          chip.textContent = `${chordName}${countSuffix}`;
          chip.style.cssText = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 24px;
            padding: 0 10px;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.18);
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.94);
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.1px;
            line-height: 1;
            cursor: default;
            user-select: none;
            -webkit-user-select: none;
            transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
          `;
          chip.addEventListener("mouseenter", () => {
            chip.style.background = "rgba(255, 255, 255, 0.2)";
            chip.style.borderColor = "rgba(255, 255, 255, 0.36)";
            chip.style.color = "#ffffff";
          });
          chip.addEventListener("mouseleave", () => {
            chip.style.background = "rgba(255, 255, 255, 0.1)";
            chip.style.borderColor = "rgba(255, 255, 255, 0.18)";
            chip.style.color = "rgba(255, 255, 255, 0.94)";
          });
          body.appendChild(chip);
        }
      }

      section.appendChild(heading);
      section.appendChild(body);
      return section;
    };

    const createTuningSection = (tuning) => {
      const section = document.createElement("div");
      section.style.cssText = `
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.04);
        padding: 7px 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      `;

      const label = document.createElement("div");
      label.textContent = "Tuning";
      label.style.cssText = `
        font-size: 11px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.92);
      `;

      const value = document.createElement("div");
      value.textContent = String(tuning || "Unknown");
      value.style.cssText = `
        font-size: 11px;
        font-weight: 600;
        color: #7dd3fc;
        text-align: right;
        word-break: break-word;
      `;

      section.appendChild(label);
      section.appendChild(value);
      return section;
    };

    const toDisplayChordName = (chordNameRaw, capoFret) => {
      const clean = String(chordNameRaw || "").trim();
      if (!clean) return "";

      const safeFret = Math.max(0, Math.min(12, Number(capoFret) || 0));
      if (safeFret <= 0) return clean;

      if (typeof window.transposeChord === "function") {
        try {
          const transposed = String(
            window.transposeChord(clean, -safeFret) || clean
          ).trim();
          if (transposed) return transposed;
        } catch (error) {
          log("transposeChord (to display) failed in chord info popup:", error);
        }
      }

      return clean;
    };

    const toDisplayChordList = (baseList, capoFret) => {
      const output = [];
      const seen = new Set();
      for (const chordName of Array.isArray(baseList) ? baseList : []) {
        const display = toDisplayChordName(chordName, capoFret);
        if (!display) continue;
        const key = display.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        output.push(display);
      }
      return output;
    };

    const toDisplayChordCountList = (baseCounts, capoFret) => {
      const output = [];
      const indexByKey = new Map();

      for (const entry of Array.isArray(baseCounts) ? baseCounts : []) {
        const rawName =
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? entry.name
            : entry;
        const display = toDisplayChordName(rawName, capoFret);
        if (!display) continue;

        const rawCount =
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? Number(entry.count)
            : 1;
        const count = Number.isFinite(rawCount) && rawCount > 0
          ? Math.floor(rawCount)
          : 1;

        const key = display.toLowerCase();
        const existingIndex = indexByKey.get(key);
        if (existingIndex !== undefined) {
          output[existingIndex].count += count;
          continue;
        }

        indexByKey.set(key, output.length);
        output.push({
          name: display,
          count,
        });
      }

      return output;
    };

    const renderSummarySections = (summary) => {
      if (!summary) return;
      const selectedCapo = Math.max(
        0,
        Math.min(12, Number(capoSelect.value) || 0)
      );
      content.innerHTML = "";
      content.appendChild(createTuningSection(summary.tuning));
      content.appendChild(subtitle);
      content.appendChild(showCountsRow);
      content.appendChild(sortByCountRow);

      const regularDisplay = toDisplayChordCountList(
        summary.regularCounts || summary.regular,
        selectedCapo
      );
      const regularPlusDisplay = toDisplayChordCountList(
        summary.regularPlusCounts || summary.regularPlus,
        selectedCapo
      );
      const harmonicDisplay = toDisplayChordCountList(
        summary.harmonicCounts || summary.harmonic,
        selectedCapo
      );
      const harmonicPlusDisplay = toDisplayChordCountList(
        summary.harmonicPlusCounts || summary.harmonicPlus,
        selectedCapo
      );
      const uniqueAllModesDisplay = toDisplayChordList(summary.uniqueAllModes, selectedCapo);

      const sortByFrequency = (items) => {
        const cloned = Array.isArray(items) ? items.slice() : [];
        if (!sortByCount) return cloned;
        return cloned.sort((a, b) => {
          const countA = Number(a?.count) || 0;
          const countB = Number(b?.count) || 0;
          if (countB !== countA) return countB - countA;

          const nameA = String(a?.name || "").toLowerCase();
          const nameB = String(b?.name || "").toLowerCase();
          return nameA.localeCompare(nameB);
        });
      };

      const regularSorted = sortByFrequency(regularDisplay);
      const regularPlusSorted = sortByFrequency(regularPlusDisplay);
      const harmonicSorted = sortByFrequency(harmonicDisplay);
      const harmonicPlusSorted = sortByFrequency(harmonicPlusDisplay);

      const regularSectionValues = showChordCounts
        ? regularSorted
        : regularSorted.map((entry) => entry.name);
      const regularPlusSectionValues = showChordCounts
        ? regularPlusSorted
        : regularPlusSorted.map((entry) => entry.name);
      const harmonicSectionValues = showChordCounts
        ? harmonicSorted
        : harmonicSorted.map((entry) => entry.name);
      const harmonicPlusSectionValues = showChordCounts
        ? harmonicPlusSorted
        : harmonicPlusSorted.map((entry) => entry.name);

      content.appendChild(
        createSection(
          formatModeLabelWithLevel("regular"),
          regularSectionValues,
          regularDisplay.length
        )
      );
      content.appendChild(
        createSection(
          formatModeLabelWithLevel("regularPlus"),
          regularPlusSectionValues,
          regularPlusDisplay.length
        )
      );
      content.appendChild(
        createSection(
          formatModeLabelWithLevel("harmonic"),
          harmonicSectionValues,
          harmonicDisplay.length
        )
      );
      content.appendChild(
        createSection(
          formatModeLabelWithLevel("harmonicPlus"),
          harmonicPlusSectionValues,
          harmonicPlusDisplay.length
        )
      );
      content.appendChild(
        createSection(
          "All Modes Unique",
          uniqueAllModesDisplay,
          uniqueAllModesDisplay.length
        )
      );
      reposition();
    };

    panel.appendChild(closeButton);
    panel.appendChild(titleRow);
    panel.appendChild(capoRow);
    panel.appendChild(content);
    document.body.appendChild(anchorConnector);
    document.body.appendChild(panel);

    reposition = () => {
      const { left, top, canOpenBelow, anchorRect } = clampFloatingPanelPosition({
        anchorEl,
        panel,
        fallbackWidth: 300,
      });

      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;

      if (canOpenBelow) {
        const gap = Math.max(0, top - anchorRect.bottom);
        if (gap >= 2) {
          const centerX = anchorRect.left + anchorRect.width / 2;
          anchorConnector.style.left = `${Math.round(centerX - 1)}px`;
          anchorConnector.style.top = `${Math.round(anchorRect.bottom)}px`;
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
    applyPanelScale(popupScaleControl.getValue());
    reposition();

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onResize, true);
      window.removeEventListener("scroll", onResize, true);
      if (anchorConnector.parentNode) {
        anchorConnector.parentNode.removeChild(anchorConnector);
      }
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
      setChordInfoAnchorState(anchorEl, false);
      if (activeChordInfoClose === cleanup) {
        activeChordInfoClose = null;
        activeChordInfoAnchor = null;
      }
    };
    activeChordInfoClose = cleanup;
    activeChordInfoAnchor = anchorEl;
    setChordInfoAnchorState(anchorEl, true);

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

    const onResize = () => reposition();

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onResize, true);
    window.addEventListener("scroll", onResize, true);

    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      cleanup();
    });

    let latestSummary = null;
    showCountsToggle.addEventListener("change", () => {
      showChordCounts = saveChordInfoShowCountsSetting(showCountsToggle.checked);
      showCountsToggle.checked = showChordCounts;
      updateShowCountsLabel();
      if (!latestSummary || closed) return;
      renderSummarySections(latestSummary);
    });
    sortByCountToggle.addEventListener("change", () => {
      sortByCount = saveChordInfoSortByCountSetting(sortByCountToggle.checked);
      sortByCountToggle.checked = sortByCount;
      updateSortByCountLabel();
      if (!latestSummary || closed) return;
      renderSummarySections(latestSummary);
    });
    capoSelect.addEventListener("change", () => {
      if (!latestSummary || closed) return;
      renderSummarySections(latestSummary);
    });

    getChordInfoSummary({
      videoId,
      fallbackSongChords,
    })
      .then((summary) => {
        if (closed) return;
        latestSummary = summary;
        renderSummarySections(summary);
      })
      .catch((error) => {
        log("openChordInfoPopup failed:", error);
        if (closed) return;
        content.innerHTML = "";
        const failed = document.createElement("div");
        failed.textContent = "Failed to load chord info.";
        failed.style.cssText = `
          color: rgba(255, 255, 255, 0.78);
          font-size: 12px;
          padding: 6px 0;
        `;
        content.appendChild(failed);
      });

    return cleanup;
  }

  function openChordEditsSummaryPopup({
    anchorEl,
    videoId = null,
    mode = "regular",
    threshold = 0.5,
    capoContext = "panel",
    fallbackSongChords = [],
  } = {}) {
    if (!anchorEl || !document?.body) {
      return null;
    }

    // Toggle behavior: clicking same "✎" closes the currently opened popup.
    if (activeChordEditsSummaryClose && activeChordEditsSummaryAnchor === anchorEl) {
      closeChordEditsSummaryPopup();
      return null;
    }

    closeChordEditsSummaryPopup();
    closeChordInfoPopup();
    closeChordReplacePicker();
    closeChordRemoveScopePicker();
    closeChordTimingEditor();

    const safeCapoState = resolveCapoEditState(capoContext);
    const safeCurrentCapoFret = safeCapoState.active ? safeCapoState.fret : 0;

    const panel = document.createElement("div");
    panel.style.cssText = `
      position: fixed;
      width: 284px;
      max-width: calc(100vw - 16px);
      max-height: calc(100vh - 16px);
      background: rgba(19, 19, 19, 0.98);
      border: 2.5px solid rgba(52, 149, 233, 0.85);
      border-radius: 10px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.48);
      backdrop-filter: blur(10px);
      color: #fff;
      display: flex;
      flex-direction: column;
      gap: 7px;
      padding: 10px;
      overflow: hidden;
      direction: ltr;
      unicode-bidi: isolate;
      text-align: left;
    `;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Chord edits summary");
    panel.setAttribute("dir", "ltr");
    panel.setAttribute("data-yc-owned", "true");
    const panelZIndex = resolvePickerZIndex(anchorEl);
    panel.style.zIndex = String(panelZIndex);
    const anchorConnector = document.createElement("div");
    anchorConnector.style.cssText = `
      position: fixed;
      width: 2px;
      height: 0;
      background: rgba(52, 149, 233, 0.85);
      border-radius: 999px;
      pointer-events: none;
      opacity: 0;
    `;
    anchorConnector.style.zIndex = String(panelZIndex);
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
      top: 8px;
      right: 8px;
      width: 22px;
      height: 22px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.92);
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      padding: 0;
      cursor: pointer;
      transition: background 0.12s ease, border-color 0.12s ease;
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
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-right: 28px;
    `;

    const title = document.createElement("div");
    title.textContent = "Chord Edits";
    title.style.cssText = `
      font-size: 13px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.92);
      letter-spacing: 0.2px;
      flex: 1 1 auto;
      min-width: 0;
    `;

    const initialPanelScale = loadPopupScaleSetting(CHORD_EDITS_POPUP_SCALE_KEY, 100);
    const popupScaleControl = createPopupScaleControl({
      initialPercent: initialPanelScale,
      onChange: (nextPercent) => {
        savePopupScaleSetting(CHORD_EDITS_POPUP_SCALE_KEY, nextPercent);
        applyPanelScale(nextPercent);
      },
    });

    const makeResetButton = (label, tone = "default") => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.style.cssText = `
        width: 120px;
        height: 24px;
        border-radius: 7px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.9);
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.12s ease, border-color 0.12s ease;
      `;

      if (tone === "danger") {
        button.style.color = "rgba(252, 165, 165, 0.95)";
        button.style.borderColor = "rgba(248, 113, 113, 0.35)";
      }

      button.addEventListener("mouseenter", () => {
        if (button.disabled) return;
        button.style.background = "rgba(255, 255, 255, 0.16)";
        button.style.borderColor =
          tone === "danger"
            ? "rgba(248, 113, 113, 0.55)"
            : "rgba(255, 255, 255, 0.35)";
      });
      button.addEventListener("mouseleave", () => {
        if (button.disabled) return;
        button.style.background = "rgba(255, 255, 255, 0.08)";
        button.style.borderColor =
          tone === "danger"
            ? "rgba(248, 113, 113, 0.35)"
            : "rgba(255, 255, 255, 0.22)";
      });
      return button;
    };

    const resetAllButton = makeResetButton("Reset All", "danger");
    const resetRemovedButton = makeResetButton("Reset Removed");
    const resetEditedButton = makeResetButton("Reset Edited");
    const resetAddedButton = makeResetButton("Reset Added");
    const resetTimingButton = makeResetButton("Reset Timing");
    const resetActionButtons = [
      resetAllButton,
      resetRemovedButton,
      resetEditedButton,
      resetAddedButton,
      resetTimingButton,
    ];

    const setResetButtonsBusy = (isBusy) => {
      resetActionButtons.forEach((button) => {
        button.disabled = isBusy;
        button.style.opacity = isBusy ? "0.7" : "1";
        button.style.cursor = isBusy ? "default" : "pointer";
      });
    };

    const runResetAction = async (scope) => {
      const safeVideoId = String(videoId || "").trim();
      if (!safeVideoId) {
        window.ycUtils?.showToast?.("Open a video first to reset chord edits", "!", 2400);
        return;
      }

      setResetButtonsBusy(true);
      try {
        let result = null;
        if (scope === "all") {
          result = await resetChordEditsForVideo(safeVideoId);
        } else if (scope === "removed") {
          result = await resetRemovedChordEditsForVideo(safeVideoId);
        } else if (scope === "edited") {
          result = await resetEditedChordEditsForVideo(safeVideoId);
        } else if (scope === "added") {
          result = await resetAddedChordEditsForVideo(safeVideoId);
        } else {
          result = await resetTimingChordEditsForVideo(safeVideoId);
        }

        if (result?.success) {
          if (scope === "all") {
            window.ycUtils?.showToast?.("Chord edits were reset", "OK", 1900);
          } else if (scope === "removed") {
            window.ycUtils?.showToast?.("Removed chords were reset", "OK", 1900);
          } else if (scope === "edited") {
            window.ycUtils?.showToast?.("Edited chords were reset", "OK", 1900);
          } else if (scope === "added") {
            window.ycUtils?.showToast?.("Added chords were reset", "OK", 1900);
          } else {
            window.ycUtils?.showToast?.("Timing edits were reset", "OK", 1900);
          }
          cleanup();
          return;
        }

        if (scope === "all") {
          window.ycUtils?.showToast?.("Failed to reset chord edits", "!", 2200);
        } else if (scope === "removed") {
          window.ycUtils?.showToast?.("Failed to reset removed chords", "!", 2200);
        } else if (scope === "edited") {
          window.ycUtils?.showToast?.("Failed to reset edited chords", "!", 2200);
        } else if (scope === "added") {
          window.ycUtils?.showToast?.("Failed to reset added chords", "!", 2200);
        } else {
          window.ycUtils?.showToast?.("Failed to reset timing edits", "!", 2200);
        }
      } catch (error) {
        log("runResetAction failed:", error);
        if (scope === "all") {
          window.ycUtils?.showToast?.("Failed to reset chord edits", "!", 2200);
        } else if (scope === "removed") {
          window.ycUtils?.showToast?.("Failed to reset removed chords", "!", 2200);
        } else if (scope === "edited") {
          window.ycUtils?.showToast?.("Failed to reset edited chords", "!", 2200);
        } else if (scope === "added") {
          window.ycUtils?.showToast?.("Failed to reset added chords", "!", 2200);
        } else {
          window.ycUtils?.showToast?.("Failed to reset timing edits", "!", 2200);
        }
      } finally {
        setResetButtonsBusy(false);
      }
    };

    resetAllButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      runResetAction("all");
    });
    resetRemovedButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      runResetAction("removed");
    });
    resetEditedButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      runResetAction("edited");
    });
    resetAddedButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      runResetAction("added");
    });
    resetTimingButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      runResetAction("timing");
    });

    headerRow.appendChild(title);
    headerRow.appendChild(popupScaleControl.element);

    const content = document.createElement("div");
    content.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 7px;
      overflow: auto;
      max-height: min(320px, calc(100vh - 28px));
      padding-right: 2px;
    `;

    const loading = document.createElement("div");
    loading.textContent = "Loading edit summary...";
    loading.style.cssText = `
      color: rgba(255, 255, 255, 0.76);
      font-size: 12px;
      padding: 4px 0 2px;
    `;
    content.appendChild(loading);

    panel.appendChild(closeButton);
    panel.appendChild(headerRow);
    panel.appendChild(content);
    document.body.appendChild(anchorConnector);
    document.body.appendChild(panel);

    let inlineHintEl = null;
    let inlineHintHost = null;
    let inlineHintTimer = null;
    const clearInlineHint = () => {
      if (inlineHintTimer) {
        clearTimeout(inlineHintTimer);
        inlineHintTimer = null;
      }
      if (inlineHintEl?.parentNode) {
        inlineHintEl.parentNode.removeChild(inlineHintEl);
      }
      inlineHintEl = null;
    };
    const showInlineHint = (message) => {
      clearInlineHint();
      if (!message || !inlineHintHost) return;

      const hint = document.createElement("div");
      hint.textContent = String(message);
      hint.style.cssText = `
        width: 100%;
        box-sizing: border-box;
        padding: 7px 9px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.07);
        color: rgba(255, 255, 255, 0.88);
        font-size: 11px;
        font-weight: 600;
        line-height: 1.3;
        pointer-events: none;
        opacity: 0;
        transform: translateY(2px);
        transition: opacity 0.15s ease, transform 0.15s ease;
      `;
      inlineHintHost.appendChild(hint);

      requestAnimationFrame(() => {
        hint.style.opacity = "1";
        hint.style.transform = "translateY(0)";
      });

      inlineHintEl = hint;
      inlineHintTimer = setTimeout(() => {
        if (!inlineHintEl) return;
        inlineHintEl.style.opacity = "0";
        inlineHintEl.style.transform = "translateY(2px)";
        const el = inlineHintEl;
        inlineHintEl = null;
        inlineHintTimer = null;
        setTimeout(() => {
          if (el?.parentNode) {
            el.parentNode.removeChild(el);
          }
        }, 170);
      }, 2200);
    };

    const sumCounts = (items = []) =>
      (Array.isArray(items) ? items : []).reduce((sum, item) => {
        const next = Number(item?.count);
        return sum + (Number.isFinite(next) ? next : 0);
      }, 0);

    let sectionsTextScalePercent = loadPopupScaleSetting(
      CHORD_EDITS_CONTENT_SCALE_KEY,
      100
    );
    const scaledFontPx = (basePx) => {
      const safeBase = Number(basePx) || 12;
      const scaled = (safeBase * sectionsTextScalePercent) / 100;
      return `${Math.max(9, Math.round(scaled * 10) / 10)}px`;
    };

    const getFiniteTimeSec = (value) => {
      const time = Number(value);
      return Number.isFinite(time) && time >= 0 ? time : null;
    };

    const seekToSummaryTime = (value) => {
      const time = getFiniteTimeSec(value);
      if (time === null) return false;

      const video =
        document.querySelector("video.html5-main-video") ||
        document.querySelector(".html5-video-container video") ||
        document.querySelector("video");
      if (!video) {
        window.ycUtils?.showToast?.("Could not find video", "!", 1800);
        return false;
      }

      video.currentTime = time;
      try {
        video.dispatchEvent(new Event("timeupdate", { bubbles: true }));
      } catch (error) {
        log("Could not dispatch video timeupdate:", error);
      }
      try {
        window.dispatchEvent(
          new CustomEvent("yc:timeUpdate", {
            detail: { time, isScrubbing: true },
          })
        );
      } catch (error) {
        log("Could not dispatch yc:timeUpdate:", error);
      }
      return true;
    };

    const makeSeekable = (element, value) => {
      const time = getFiniteTimeSec(value);
      if (!element || time === null) return;
      element.setAttribute("role", "button");
      element.setAttribute("tabindex", "0");
      element.title = `Go to ${formatSecondsAsClock(time) || `${time.toFixed(1)}s`}`;
      element.style.cursor = "pointer";
      element.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        seekToSummaryTime(time);
      });
      element.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        seekToSummaryTime(time);
      });
      element.addEventListener("mouseenter", () => {
        element.style.background = "rgba(255, 255, 255, 0.08)";
      });
      element.addEventListener("mouseleave", () => {
        element.style.background = "";
      });
    };

    const createSection = (label, items, formatter, options = {}) => {
      const singleLine = options?.singleLine === true;
      const detailsFormatter =
        typeof options?.detailsFormatter === "function"
          ? options.detailsFormatter
          : null;
      const timeExtractor =
        typeof options?.timeExtractor === "function"
          ? options.timeExtractor
          : null;
      const rowKeyBuilder =
        typeof options?.rowKeyBuilder === "function"
          ? options.rowKeyBuilder
          : null;
      const expandedRows = options?.expandedRows instanceof Set ? options.expandedRows : null;
      const onToggle = typeof options?.onToggle === "function" ? options.onToggle : null;
      const section = document.createElement("div");
      section.style.cssText = `
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.04);
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      `;

      const heading = document.createElement("div");
      const count = sumCounts(items);
      heading.textContent = `${label} (${count})`;
      heading.style.cssText = `
        font-size: ${scaledFontPx(11)};
        font-weight: 700;
        color: rgba(255, 255, 255, 0.92);
      `;
      section.appendChild(heading);

      const list = Array.isArray(items) ? items : [];
      if (!list.length) {
        const empty = document.createElement("div");
        empty.textContent = "None";
        empty.style.cssText = `
          font-size: ${scaledFontPx(12)};
          color: rgba(255, 255, 255, 0.66);
        `;
        section.appendChild(empty);
        return section;
      }

      const singles = list
        .map((item, index) => ({ item, index }))
        .filter((entry) => Number(entry?.item?.count) <= 1);
      const grouped = list
        .map((item, index) => ({ item, index }))
        .filter((entry) => Number(entry?.item?.count) > 1);
      const orderedEntries = [...grouped, ...singles];

      orderedEntries.forEach(({ item, index }) => {
        const summaryText = formatter(item);
        const rawDetails = detailsFormatter ? detailsFormatter(item) : [];
        const details = Array.isArray(rawDetails)
          ? rawDetails
              .map((detail) => {
                if (typeof detail === "string") {
                  return { text: detail, timeSec: null };
                }
                if (!detail || typeof detail !== "object") return null;
                return {
                  text: String(detail.text || "").trim(),
                  timeSec: getFiniteTimeSec(detail.timeSec),
                };
              })
              .filter((detail) => detail?.text)
          : [];
        const canExpand = details.length > 0;

        if (!canExpand) {
          const row = document.createElement("div");
          row.style.cssText = `
            display: flex;
            align-items: flex-start;
            gap: 6px;
            line-height: 1.35;
            border-radius: 5px;
            padding: 1px 3px;
          `;

          const arrowSpacer = document.createElement("span");
          arrowSpacer.textContent = " ";
          arrowSpacer.style.cssText = `
            width: 10px;
            flex: 0 0 auto;
            font-size: ${scaledFontPx(12)};
          `;

          const rowText = document.createElement("span");
          rowText.textContent = summaryText;
          rowText.style.cssText = `
            font-size: ${scaledFontPx(12)};
            color: rgba(255, 255, 255, 0.9);
            min-width: 0;
          `;
          if (singleLine) {
            rowText.style.whiteSpace = "nowrap";
            rowText.style.overflowX = "auto";
            rowText.style.overflowY = "hidden";
            rowText.style.textOverflow = "clip";
            rowText.style.paddingBottom = "1px";
          }

          row.appendChild(arrowSpacer);
          row.appendChild(rowText);
          if (timeExtractor) {
            makeSeekable(row, timeExtractor(item));
          }
          section.appendChild(row);
          return;
        }

        const key = rowKeyBuilder
          ? rowKeyBuilder(item, index)
          : `${label}:${index}:${summaryText}`;
        const isOpen = expandedRows ? expandedRows.has(key) : false;

        const wrapper = document.createElement("div");
        wrapper.style.cssText = `
          display: flex;
          flex-direction: column;
          gap: 4px;
        `;

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.style.cssText = `
          all: unset;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          color: rgba(255, 255, 255, 0.92);
          line-height: 1.35;
        `;

        const arrow = document.createElement("span");
        arrow.textContent = isOpen ? "▾" : "▸";
        arrow.style.cssText = `
          width: 10px;
          color: rgba(255, 255, 255, 0.72);
          font-size: ${scaledFontPx(12)};
          flex: 0 0 auto;
          transform: translateY(-0.5px);
        `;

        const labelEl = document.createElement("span");
        labelEl.textContent = summaryText;
        labelEl.style.cssText = `
          font-size: ${scaledFontPx(12)};
          color: rgba(255, 255, 255, 0.9);
          min-width: 0;
        `;
        if (singleLine) {
          labelEl.style.whiteSpace = "nowrap";
          labelEl.style.overflowX = "auto";
          labelEl.style.overflowY = "hidden";
          labelEl.style.textOverflow = "clip";
          labelEl.style.paddingBottom = "1px";
        }

        toggle.appendChild(arrow);
        toggle.appendChild(labelEl);
        wrapper.appendChild(toggle);

        const detailsBox = document.createElement("div");
        detailsBox.style.cssText = `
          display: ${isOpen ? "flex" : "none"};
          flex-direction: column;
          gap: 2px;
          margin-left: 16px;
          margin-top: -1px;
        `;
        details.forEach((detail) => {
          const detailRow = document.createElement("div");
          detailRow.textContent = `• ${detail.text}`;
          detailRow.style.cssText = `
            font-size: ${scaledFontPx(11)};
            color: rgba(255, 255, 255, 0.78);
            line-height: 1.3;
            border-radius: 5px;
            padding: 1px 3px;
          `;
          if (singleLine) {
            detailRow.style.whiteSpace = "nowrap";
            detailRow.style.overflowX = "auto";
            detailRow.style.overflowY = "hidden";
            detailRow.style.textOverflow = "clip";
          }
          makeSeekable(detailRow, detail.timeSec);
          detailsBox.appendChild(detailRow);
        });
        wrapper.appendChild(detailsBox);

        toggle.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const nextOpen = detailsBox.style.display === "none";
          detailsBox.style.display = nextOpen ? "flex" : "none";
          arrow.textContent = nextOpen ? "▾" : "▸";
          if (expandedRows) {
            if (nextOpen) {
              expandedRows.add(key);
            } else {
              expandedRows.delete(key);
            }
          }
          if (onToggle) {
            onToggle(nextOpen);
          }
        });

        section.appendChild(wrapper);
      });

      return section;
    };

    const toCapoDisplayChordName = (chordNameRaw) => {
      const clean = String(chordNameRaw || "").trim();
      if (!clean) return "";
      if (safeCurrentCapoFret <= 0) return clean;

      if (typeof window.transposeChord === "function") {
        try {
          const transposed = String(
            window.transposeChord(clean, -safeCurrentCapoFret) || clean
          ).trim();
          if (transposed) return transposed;
        } catch (error) {
          log("transposeChord failed in chord edits summary:", error);
        }
      }
      return clean;
    };

    const buildDisplayWithOptionalBase = (baseChordName, includeBase) => {
      const base = String(baseChordName || "").trim();
      if (!base) return "";
      const display = toCapoDisplayChordName(base) || base;
      if (includeBase && display.toLowerCase() !== base.toLowerCase()) {
        return `${display} (base: ${base})`;
      }
      return display;
    };

    reposition = () => {
      const { left, top, canOpenBelow, anchorRect } = clampFloatingPanelPosition({
        anchorEl,
        panel,
        fallbackWidth: 280,
      });
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;

      if (canOpenBelow) {
        const gap = Math.max(0, top - anchorRect.bottom);
        if (gap >= 2) {
          const centerX = anchorRect.left + anchorRect.width / 2;
          anchorConnector.style.left = `${Math.round(centerX - 1)}px`;
          anchorConnector.style.top = `${Math.round(anchorRect.bottom)}px`;
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
    applyPanelScale(popupScaleControl.getValue());
    reposition();

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onResize, true);
      window.removeEventListener("scroll", onResize, true);
      clearInlineHint();
      if (anchorConnector.parentNode) {
        anchorConnector.parentNode.removeChild(anchorConnector);
      }
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
      setChordEditsSummaryAnchorState(anchorEl, false);
      if (activeChordEditsSummaryClose === cleanup) {
        activeChordEditsSummaryClose = null;
        activeChordEditsSummaryAnchor = null;
      }
    };
    activeChordEditsSummaryClose = cleanup;
    activeChordEditsSummaryAnchor = anchorEl;
    setChordEditsSummaryAnchorState(anchorEl, true);

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

    const onResize = () => reposition();

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onResize, true);
    window.addEventListener("scroll", onResize, true);

    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      cleanup();
    });

    getChordEditsSummary({
      videoId,
      mode,
      threshold,
      currentCapoFret: safeCurrentCapoFret,
      fallbackSongChords,
    })
      .then((summary) => {
        if (closed) return;
        content.innerHTML = "";

        const controlsGrid = document.createElement("div");
        controlsGrid.style.cssText = `
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          column-gap: 10px;
          row-gap: 4px;
          align-items: start;
        `;
        const controlsLeft = document.createElement("div");
        controlsLeft.style.cssText = `
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        `;
        const controlsRight = document.createElement("div");
        controlsRight.style.cssText = `
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        `;
        controlsRight.appendChild(resetAllButton);
        controlsRight.appendChild(resetRemovedButton);
        controlsRight.appendChild(resetEditedButton);
        controlsRight.appendChild(resetAddedButton);
        controlsRight.appendChild(resetTimingButton);
        controlsGrid.appendChild(controlsLeft);
        controlsGrid.appendChild(controlsRight);
        content.appendChild(controlsGrid);

        const context = document.createElement("div");
        context.textContent = `Threshold: ${summary.currentThreshold.toFixed(1)}s`;
        context.style.cssText = `
          font-size: 11px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.78);
        `;
        controlsLeft.appendChild(context);

        if (summary.state === "threshold-mismatch") {
          const note = document.createElement("div");
          const thresholdsText = Array.isArray(summary.thresholds) && summary.thresholds.length
            ? summary.thresholds.map((entry) => `${Number(entry).toFixed(1)}s`).join(", ")
            : "other thresholds";
          note.textContent = `Showing edits from: ${thresholdsText}`;
          note.style.cssText = `
            font-size: 11px;
            color: #f59e0b;
            margin-top: -2px;
          `;
          controlsLeft.appendChild(note);
        }

        const showBaseRow = document.createElement("label");
        showBaseRow.style.cssText = `
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.8);
          user-select: none;
          -webkit-user-select: none;
          cursor: pointer;
          margin-top: -1px;
        `;

        const showBaseCheckbox = document.createElement("input");
        showBaseCheckbox.type = "checkbox";
        showBaseCheckbox.checked = false;
        showBaseCheckbox.style.cssText = `
          width: 12px;
          height: 12px;
          margin: 0;
          accent-color: #4ade80;
          cursor: pointer;
        `;

        const showBaseText = document.createElement("span");
        showBaseText.textContent = "Show base chords";

        const isBaseChordContext = safeCurrentCapoFret <= 0;
        if (isBaseChordContext) {
          showBaseCheckbox.disabled = true;
          showBaseCheckbox.style.cursor = "not-allowed";
          showBaseCheckbox.style.opacity = "0.55";
          showBaseRow.style.cursor = "not-allowed";
          showBaseRow.style.opacity = "0.8";
          showBaseRow.title = "Capo is off - already showing base chords";

          const notifyAlreadyBase = (event) => {
            event.preventDefault();
            event.stopPropagation();
            showInlineHint("⚠️ You are already viewing base chords");
          };
          showBaseRow.addEventListener("click", notifyAlreadyBase);
        }

        showBaseRow.appendChild(showBaseCheckbox);
        showBaseRow.appendChild(showBaseText);
        controlsLeft.appendChild(showBaseRow);

        const showBaseHintHost = document.createElement("div");
        showBaseHintHost.style.cssText = `
          margin-top: -2px;
          min-height: 0;
        `;
        inlineHintHost = showBaseHintHost;
        controlsLeft.appendChild(showBaseHintHost);

        const useCurrent = summary.hasCurrentThresholdEdits;
        const removedList = useCurrent ? summary.removedCurrent : summary.removedAll;
        const editedList = useCurrent ? summary.editedCurrent : summary.editedAll;
        const addedList = (useCurrent ? summary.addedCurrent : summary.addedAll) || [];
        const timingList = (useCurrent ? summary.timingCurrent : summary.timingAll) || [];
        const expandedSummaryRows = new Set();
        let renderEditsSections = () => {};
        const buildSingleEditTimeSuffix = (item) => {
          if (!item || Number(item.count) !== 1) return "";
          const formatted = formatSecondsAsClock(item.timeSec);
          if (!formatted) return "";
          return `\u00A0\u00A0(${formatted})`;
        };
        const getSummaryItemTime = (item) => {
          const direct = getFiniteTimeSec(item?.timeSec);
          if (direct !== null) return direct;
          const times = Array.isArray(item?.times) ? item.times : [];
          return getFiniteTimeSec(times[0]);
        };
        const getTimeRows = (item, textBuilder) => {
          if (!item || Number(item.count) <= 1) return [];
          const times = Array.isArray(item.times) ? item.times : [];
          if (!times.length) return [];
          const baseText = textBuilder(item);
          return times
            .map((entry) => {
              const clock = formatSecondsAsClock(entry);
              return clock
                ? { text: `${baseText} (${clock})`, timeSec: entry }
                : null;
            })
            .filter(Boolean);
        };
        const getRemovedDetailRows = (item, includeBase) => {
          if (!item || Number(item.count) <= 1) return [];
          const details = Array.isArray(item.details) ? item.details : [];
          if (!details.length) {
            return getTimeRows(item, () =>
              buildDisplayWithOptionalBase(item.name, includeBase)
            );
          }
          return details
            .map((detail) => {
              const name = String(detail?.name || "").trim() || String(item.name || "").trim();
              const displayName = buildDisplayWithOptionalBase(name, includeBase);
              const clock = formatSecondsAsClock(detail?.timeSec);
              return {
                text: clock ? `${displayName} (${clock})` : displayName,
                timeSec: detail?.timeSec,
              };
            })
            .filter(Boolean);
        };
        const getEditedDetailRows = (item, includeBase) => {
          if (!item || Number(item.count) <= 1) return [];
          const details = Array.isArray(item.details) ? item.details : [];
          if (!details.length) {
            return getTimeRows(item, () => {
              const fromDisplay = buildDisplayWithOptionalBase(item.from, includeBase);
              const toDisplay = buildDisplayWithOptionalBase(item.to, includeBase);
              return `${fromDisplay} -> ${toDisplay}`;
            });
          }
          return details
            .map((detail) => {
              const from = String(detail?.from || "").trim() || String(item.from || "").trim();
              const to = String(detail?.to || "").trim() || String(item.to || "").trim();
              const fromDisplay = buildDisplayWithOptionalBase(from, includeBase);
              const toDisplay = buildDisplayWithOptionalBase(to, includeBase);
              const clock = formatSecondsAsClock(detail?.timeSec);
              return {
                text: clock
                  ? `${fromDisplay} -> ${toDisplay} (${clock})`
                  : `${fromDisplay} -> ${toDisplay}`,
                timeSec: detail?.timeSec,
              };
            })
            .filter(Boolean);
        };
        const buildAddedDisplayRow = (item, includeBase) => {
          const name = buildDisplayWithOptionalBase(
            String(item?.name || "").trim(),
            includeBase
          );
          const parentName = buildDisplayWithOptionalBase(
            String(item?.parentName || "").trim(),
            includeBase
          );
          const side = String(item?.side || "").trim();
          const duration = roundTimingSeconds(item?.duration);
          const durationText = duration !== null ? ` ${formatTimingSeconds(duration)}` : "";
          const sideText = side ? `${side} ` : "";
          return parentName
            ? `${name} (${sideText}${parentName})${durationText}`
            : `${name}${durationText}`;
        };
        const getAddedDetailRows = (item, includeBase) => {
          if (!item || Number(item.count) <= 1) return [];
          const details = Array.isArray(item.details) ? item.details : [];
          if (!details.length) {
            return getTimeRows(item, (addedItem) => (
              buildAddedDisplayRow(addedItem, includeBase)
            ));
          }
          return details
            .map((detail) => {
              const detailItem = {
                ...item,
                ...detail,
                name: detail?.name || item.name,
                parentName: detail?.parentName || item.parentName,
                side: detail?.side || item.side,
                duration: detail?.duration ?? item.duration,
              };
              const clock = formatSecondsAsClock(detail?.timeSec);
              return {
                text: clock
                  ? `${buildAddedDisplayRow(detailItem, includeBase)} (${clock})`
                  : buildAddedDisplayRow(detailItem, includeBase),
                timeSec: detail?.timeSec,
              };
            })
            .filter((detail) => detail?.text);
        };
        const buildTimingDisplayRow = (timingItem, includeBase) => {
          const separator = ",\u00A0\u00A0\u00A0";
          const ranges = Array.isArray(timingItem?.ranges)
            ? timingItem.ranges
            : [];
          const rangeLabels = ranges
            .map((range) => {
              const name = buildDisplayWithOptionalBase(
                String(range?.name || "").trim(),
                includeBase
              );
              const start = String(range?.start || "").trim();
              const end = String(range?.end || "").trim() || "...";
              if (!name || !start) return "";
              return `${name}: ${start} -> ${end}`;
            })
            .filter(Boolean);
          if (rangeLabels.length) {
            return rangeLabels.join(separator);
          }

          const anchorName = buildDisplayWithOptionalBase(
            String(timingItem?.anchorName || timingItem?.name || "").trim(),
            includeBase
          );
          const changedName = buildDisplayWithOptionalBase(
            String(timingItem?.changedName || timingItem?.name || "").trim(),
            includeBase
          );
          const anchorTime = String(timingItem?.anchorTime || "").trim();
          const from = String(timingItem?.from || "").trim() || "original";
          const to = String(timingItem?.to || "").trim();
          const anchorLabel = to
            ? `${anchorName}: ${from} -> ${to}`
            : (anchorTime ? `${anchorName} ${anchorTime}` : anchorName);
          const changedLabel = to ? `${changedName}: ${from} -> ${to}` : changedName;
          return String(timingItem?.boundary || "").trim() === "Before"
            ? `${changedLabel}${separator}${anchorLabel}`
            : `${anchorLabel}${separator}${changedLabel}`;
        };
        const getTimingDetailRows = (item, includeBase) => {
          if (!item || Number(item.count) <= 1) return [];
          const details = Array.isArray(item.details) ? item.details : [];
          if (!details.length) {
            return getTimeRows(item, (timingItem) => {
              return buildTimingDisplayRow(timingItem, includeBase);
            });
          }
          return details
            .map((detail) => {
              const detailItem = {
                ...item,
                ...detail,
                anchorName: detail?.anchorName || item.anchorName || item.name,
                anchorTime: detail?.anchorTime || item.anchorTime || "",
                changedName: detail?.changedName || item.changedName || item.name,
                boundary: detail?.boundary || item.boundary || "",
                from: detail?.from || item.from || "",
                to: detail?.to || item.to || "",
                ranges: Array.isArray(detail?.ranges) ? detail.ranges : item.ranges,
              };
              return {
                text: buildTimingDisplayRow(
                  detailItem,
                  includeBase
                ),
                timeSec: detail?.timeSec,
              };
            })
            .filter((detail) => detail?.text);
        };
        const mergedTag = (item) => (item?.isMerged ? " [Merged]" : "");
        const buildCountSuffix = (item, hasTime) =>
          hasTime
            ? ` (x${item.count})`
            : `\u00A0\u00A0(x${item.count})`;

        const contentScaleRow = document.createElement("div");
        contentScaleRow.style.cssText = `
          display: flex;
          justify-content: flex-start;
          margin-top: 2px;
        `;
        const contentScaleControl = createPopupScaleControl({
          initialPercent: sectionsTextScalePercent,
          onChange: (nextPercent) => {
            sectionsTextScalePercent = savePopupScaleSetting(
              CHORD_EDITS_CONTENT_SCALE_KEY,
              nextPercent
            );
            renderEditsSections();
          },
        });
        contentScaleRow.appendChild(contentScaleControl.element);
        controlsLeft.appendChild(contentScaleRow);

        const sectionsHost = document.createElement("div");
        sectionsHost.style.cssText = `
          display: flex;
          flex-direction: column;
          gap: 7px;
        `;
        content.appendChild(sectionsHost);

        renderEditsSections = () => {
          const includeBase = showBaseCheckbox.checked === true;
          sectionsHost.innerHTML = "";
          sectionsHost.appendChild(
            createSection(
              "Removed",
              removedList,
              (item) => {
                const displayName = buildDisplayWithOptionalBase(item.name, includeBase);
                const timeSuffix = buildSingleEditTimeSuffix(item);
                return `${displayName}${timeSuffix}${buildCountSuffix(item, Boolean(timeSuffix))}${mergedTag(item)}`;
              },
              {
                singleLine: includeBase,
                expandedRows: expandedSummaryRows,
                rowKeyBuilder: (item) =>
                  `removed|${String(item?.name || "")}|${String(item?.threshold || "")}|${String(item?.capoFret || "")}|${String(item?.count || "")}|${item?.isMerged ? "merged" : "single"}`,
                detailsFormatter: (item) => getRemovedDetailRows(item, includeBase),
                timeExtractor: getSummaryItemTime,
                onToggle: () => reposition(),
              }
            )
          );
          sectionsHost.appendChild(
            createSection(
              "Edited",
              editedList,
              (item) => {
                const fromDisplay = buildDisplayWithOptionalBase(item.from, includeBase);
                const toDisplay = buildDisplayWithOptionalBase(item.to, includeBase);
                const timeSuffix = buildSingleEditTimeSuffix(item);
                return `${fromDisplay} -> ${toDisplay}${timeSuffix}${buildCountSuffix(item, Boolean(timeSuffix))}${mergedTag(item)}`;
              },
              {
                singleLine: includeBase,
                expandedRows: expandedSummaryRows,
                rowKeyBuilder: (item) =>
                  `edited|${String(item?.from || "")}|${String(item?.to || "")}|${String(item?.threshold || "")}|${String(item?.capoFret || "")}|${String(item?.count || "")}|${item?.isMerged ? "merged" : "single"}`,
                detailsFormatter: (item) => getEditedDetailRows(item, includeBase),
                timeExtractor: getSummaryItemTime,
                onToggle: () => reposition(),
              }
            )
          );
          sectionsHost.appendChild(
            createSection(
              "Added",
              addedList,
              (item) => {
                const timeSuffix = buildSingleEditTimeSuffix(item);
                return `${buildAddedDisplayRow(item, includeBase)}${timeSuffix}${buildCountSuffix(item, Boolean(timeSuffix))}`;
              },
              {
                singleLine: includeBase,
                expandedRows: expandedSummaryRows,
                rowKeyBuilder: (item) =>
                  `added|${String(item?.name || "")}|${String(item?.parentName || "")}|${String(item?.side || "")}|${String(item?.duration || "")}|${String(item?.count || "")}`,
                detailsFormatter: (item) => getAddedDetailRows(item, includeBase),
                timeExtractor: getSummaryItemTime,
                onToggle: () => reposition(),
              }
            )
          );
          sectionsHost.appendChild(
            createSection(
              "Timing",
              timingList,
              (item) => {
                const countSuffix = Number(item.count) > 1
                  ? `\u00A0\u00A0(x${item.count})`
                  : "";
                return `${buildTimingDisplayRow(item, includeBase)}${countSuffix}`;
              },
              {
                singleLine: includeBase,
                expandedRows: expandedSummaryRows,
                rowKeyBuilder: (item) => {
                  const rangesKey = Array.isArray(item?.ranges)
                    ? item.ranges.map((range) => `${String(range?.name || "")}:${String(range?.start || "")}->${String(range?.end || "")}`).join("|")
                    : "";
                  return `timing|${String(item?.sourceIndex || "")}|${String(item?.anchorName || "")}|${String(item?.anchorTime || "")}|${String(item?.changedName || "")}|${String(item?.boundary || "")}|${String(item?.from || "")}|${String(item?.to || "")}|${rangesKey}|${String(item?.count || "")}`;
                },
                detailsFormatter: (item) => getTimingDetailRows(item, includeBase),
                timeExtractor: getSummaryItemTime,
                onToggle: () => reposition(),
              }
            )
          );
          reposition();
        };
        showBaseCheckbox.addEventListener("change", renderEditsSections);
        renderEditsSections();

        reposition();
      })
      .catch((error) => {
        log("openChordEditsSummaryPopup failed:", error);
        if (closed) return;
        content.innerHTML = "";
        const failed = document.createElement("div");
        failed.textContent = "Failed to load edits summary.";
        failed.style.cssText = `
          color: rgba(255, 255, 255, 0.78);
          font-size: 12px;
          padding: 6px 0;
        `;
        content.appendChild(failed);
      });

    return cleanup;
  }

  function openChordRemoveScopePicker({
    anchorEl,
    chordName = "",
    sourceCount = 1,
    previewChordName = "",
    videoId = null,
    mode = "regular",
    sourceIndices = [],
    splitSegmentId = "",
  }) {
    if (!anchorEl || !document?.body) {
      return Promise.resolve(null);
    }

    // Toggle behavior: clicking the same remove button closes current picker.
    if (activeRemoveScopeClose && activeRemoveScopeAnchor === anchorEl) {
      closeChordRemoveScopePicker();
      return Promise.resolve(null);
    }

    closeChordReplacePicker();
    closeChordRemoveScopePicker();
    closeChordEditsSummaryPopup();
    closeChordTimingEditor();

    const safeChordName = String(chordName || "").trim();
    const safePreviewChordName =
      String(previewChordName || "").trim() || safeChordName;
    const safeSourceCount = Math.max(1, Number.parseInt(sourceCount, 10) || 1);
    const safeMode = normalizeMode(mode);
    const safeSourceIndices = uniqueSortedNumbers(sourceIndices);
    const safeSplitSegmentId = String(splitSegmentId || "").trim();
    const removeAllText = safeChordName
      ? `Remove all "${safeChordName}" in current mode`
      : "Remove all identical chords in current mode";
    const removeSingleText =
      safeSourceCount > 1
        ? `Remove this merged chord (${safeSourceCount} positions)`
        : "Remove this chord only";

    return new Promise((resolve) => {
      let settled = false;

      const pushRemovePreviewState = (applyToAll) => {
        setEditPreviewState({
          active: true,
          action: "remove",
          videoId,
          mode: safeMode,
          chordName: safePreviewChordName,
          sourceIndices: safeSourceIndices,
          splitSegmentId: applyToAll === true ? "" : safeSplitSegmentId,
          applyToAll: applyToAll === true,
        });
      };

      const panel = document.createElement("div");
      panel.style.cssText = `
        position: absolute;
        width: 256px;
        max-width: calc(100vw - 16px);
        background: rgba(23, 23, 27, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 10px;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.48);
        backdrop-filter: blur(10px);
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        color: #fff;
        overflow: visible;
      `;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Remove chord options");
      panel.setAttribute("dir", "ltr");
      panel.style.direction = "ltr";
      panel.style.textAlign = "left";
      panel.style.unicodeBidi = "isolate";

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
        margin: 0;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 5px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.92);
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        padding: 0;
        cursor: pointer;
        z-index: 2;
        transition: background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, transform 0.12s ease;
      `;
      closeButton.setAttribute("aria-label", "Close");
      const setCloseButtonHoverState = (isHovered) => {
        if (isHovered) {
          closeButton.style.background = "rgba(239, 68, 68, 0.22)";
          closeButton.style.borderColor = "rgba(248, 113, 113, 0.9)";
          closeButton.style.color = "#fff";
          closeButton.style.boxShadow = "0 0 0 1px rgba(239, 68, 68, 0.25), 0 4px 10px rgba(0, 0, 0, 0.28)";
          closeButton.style.transform = "translateY(-1px)";
          return;
        }
        closeButton.style.background = "rgba(255, 255, 255, 0.08)";
        closeButton.style.borderColor = "rgba(255, 255, 255, 0.25)";
        closeButton.style.color = "rgba(255, 255, 255, 0.92)";
        closeButton.style.boxShadow = "none";
        closeButton.style.transform = "none";
      };
      setCloseButtonHoverState(false);
      closeButton.addEventListener("mouseenter", () => setCloseButtonHoverState(true));
      closeButton.addEventListener("mouseleave", () => setCloseButtonHoverState(false));
      closeButton.addEventListener("focus", () => setCloseButtonHoverState(true));
      closeButton.addEventListener("blur", () => setCloseButtonHoverState(false));

      const makeOptionButton = (label) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.style.cssText = `
          margin: 0;
          width: calc(100% - 24px);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.04);
          color: #fff;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.3;
          padding: 8px 24px 8px 10px;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        `;
        button.addEventListener("mouseenter", () => {
          button.style.background = "rgba(255, 255, 255, 0.12)";
          button.style.borderColor = "rgba(255, 255, 255, 0.32)";
        });
        button.addEventListener("mouseleave", () => {
          button.style.background = "rgba(255, 255, 255, 0.04)";
          button.style.borderColor = "rgba(255, 255, 255, 0.14)";
        });
        return button;
      };

      const singleButton = makeOptionButton(removeSingleText);
      const allButton = makeOptionButton(removeAllText);

      if (safeSourceCount > 1) {
        singleButton.style.color = "rgba(251, 191, 36, 0.95)";
        singleButton.style.background = "rgba(251, 191, 36, 0.08)";
        singleButton.style.borderColor = "rgba(251, 191, 36, 0.3)";
        singleButton.addEventListener("mouseenter", () => {
          singleButton.style.background = "rgba(251, 191, 36, 0.14)";
          singleButton.style.borderColor = "rgba(251, 191, 36, 0.42)";
        });
        singleButton.addEventListener("mouseleave", () => {
          singleButton.style.background = "rgba(251, 191, 36, 0.08)";
          singleButton.style.borderColor = "rgba(251, 191, 36, 0.3)";
        });
      }

      panel.appendChild(closeButton);
      panel.appendChild(singleButton);
      panel.appendChild(allButton);
      panel.style.zIndex = String(resolvePickerZIndex(anchorEl));
      document.body.appendChild(panel);

      const reposition = () => {
        const rect = anchorEl.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
        const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

        const margin = 8;
        const preferredLeft = rect.right - panelRect.width;
        const preferredTop = rect.bottom + margin;

        const maxLeft = Math.max(margin, viewportWidth - panelRect.width - margin);
        const left = Math.max(margin, Math.min(preferredLeft, maxLeft));

        let top = preferredTop;
        if (top + panelRect.height + margin > viewportHeight) {
          top = rect.top - panelRect.height - margin;
        }
        if (top < margin) {
          top = Math.max(margin, Math.min(preferredTop, viewportHeight - panelRect.height - margin));
        }

        panel.style.left = `${Math.round(left + scrollLeft)}px`;
        panel.style.top = `${Math.round(top + scrollTop)}px`;
      };
      reposition();

      const cleanup = () => {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("keydown", onKeydown, true);
        window.removeEventListener("resize", onReposition, true);
        clearEditPreviewState();
        if (panel.parentNode) {
          panel.parentNode.removeChild(panel);
        }
      };

      const finish = (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (activeRemoveScopeClose === closeFromOutside) {
          activeRemoveScopeClose = null;
          activeRemoveScopeAnchor = null;
        }
        resolve(result);
      };

      const closeFromOutside = () => finish(null);
      activeRemoveScopeClose = closeFromOutside;
      activeRemoveScopeAnchor = anchorEl;

      const stopEvent = (event) => {
        event.preventDefault();
        event.stopPropagation();
      };

      const onPointerDown = (event) => {
        const target = event.target;
        if (panel.contains(target) || anchorEl.contains(target)) {
          return;
        }
        finish(null);
      };

      const onKeydown = (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        finish(null);
      };

      const onReposition = () => reposition();

      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeydown, true);
      window.addEventListener("resize", onReposition, true);

      closeButton.onmousedown = stopEvent;
      closeButton.onclick = (event) => {
        stopEvent(event);
        finish(null);
      };

      singleButton.onmousedown = stopEvent;
      singleButton.onclick = (event) => {
        stopEvent(event);
        finish("single");
      };
      singleButton.addEventListener("mouseenter", () => pushRemovePreviewState(false));
      singleButton.addEventListener("focus", () => pushRemovePreviewState(false));

      allButton.onmousedown = stopEvent;
      allButton.onclick = (event) => {
        stopEvent(event);
        finish("all");
      };
      allButton.addEventListener("mouseenter", () => pushRemovePreviewState(true));
      allButton.addEventListener("focus", () => pushRemovePreviewState(true));
      allButton.addEventListener("mouseleave", () => pushRemovePreviewState(false));

      pushRemovePreviewState(false);
    });
  }

  function closeChordReplacePicker() {
    if (typeof activePickerCleanup === "function") {
      activePickerCleanup();
      activePickerCleanup = null;
      activeReplacePickerAnchor = null;
      return;
    }
    activeReplacePickerAnchor = null;
  }

  function resolvePickerZIndex(anchorEl) {
    const GLOBAL_OVERLAY_Z_INDEX = 2147483647;
    let maxZIndex = 11000;
    let node = anchorEl;

    while (node && node !== document.documentElement) {
      try {
        const computed = window.getComputedStyle(node);
        const rawZ = computed?.zIndex;
        if (rawZ && rawZ !== "auto") {
          const parsed = Number.parseInt(rawZ, 10);
          if (Number.isFinite(parsed)) {
            maxZIndex = Math.max(maxZIndex, parsed);
          }
        }
      } catch (error) {
        log("Failed reading picker anchor z-index:", error);
      }
      node = node.parentElement;
    }

    return Math.max(GLOBAL_OVERLAY_Z_INDEX, maxZIndex + 20);
  }

  function resolveCapoEditState(context = "panel") {
    const safeContext =
      String(context || "").toLowerCase() === "carousel" ? "carousel" : "panel";
    try {
      const isFeatureEnabled =
        localStorage.getItem("youchords_capo_feature_enabled") !== "false";
      if (!isFeatureEnabled) {
        return { active: false, fret: 0, context: safeContext };
      }

      const isSyncEnabled =
        localStorage.getItem("youchords_capo_sync_enabled") !== "false";
      const activeKey = isSyncEnabled
        ? "youchords_capo_active"
        : safeContext === "carousel"
          ? "youchords_capo_carousel_active"
          : "youchords_capo_panel_active";
      const fretKey = isSyncEnabled
        ? "youchords_capo_fret"
        : safeContext === "carousel"
          ? "youchords_capo_carousel_fret"
          : "youchords_capo_panel_fret";

      const isActive = localStorage.getItem(activeKey) === "true";
      const parsedFret = Number.parseInt(localStorage.getItem(fretKey) || "0", 10);
      const fret = Number.isFinite(parsedFret)
        ? Math.max(0, Math.min(12, parsedFret))
        : 0;

      return {
        active: Boolean(isActive && fret > 0),
        fret,
        context: safeContext,
      };
    } catch (error) {
      log("Failed resolving capo edit state:", error);
      return { active: false, fret: 0, context: safeContext };
    }
  }

  function resolveActiveCapoFret(context = "panel") {
    const state = resolveCapoEditState(context);
    return state.active ? clampCapo(state.fret) : 0;
  }

  function firstSourceIndexFromChord(chord, fallback = null) {
    const indices = uniqueSortedNumbers(chord?.__sourceIndices);
    if (indices.length) return indices[0];
    const parsed = Number.parseInt(fallback, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  function resolveSourceOriginalTime(sourceChords, sourceIndex) {
    if (!Array.isArray(sourceChords)) return null;
    const chord = sourceChords[sourceIndex];
    return roundTimingSeconds(chord?.time);
  }

  function resolveTimingDisplayName(chord, sourceChords, sourceIndex, capoContext) {
    const rawName =
      getChordName(chord) ||
      getChordName(Array.isArray(sourceChords) ? sourceChords[sourceIndex] : null) ||
      "Chord";
    if (window.getCapoChord) {
      try {
        return String(window.getCapoChord(rawName, capoContext) || rawName).trim() || rawName;
      } catch (error) {
        log("getCapoChord failed in timing editor:", error);
      }
    }
    return rawName;
  }

  function clampTimingValue(value, min, max) {
    const rounded = roundTimingSeconds(value);
    if (rounded === null) return roundTimingSeconds(min) || 0;
    const safeMin = roundTimingSeconds(min) ?? 0;
    const safeMax = roundTimingSeconds(max) ?? safeMin;
    return Math.max(safeMin, Math.min(safeMax, rounded));
  }

  async function setChordTimingEdits({
    videoId,
    mode,
    updates = [],
  } = {}) {
    if (!videoId) {
      return { success: false, error: "Missing videoId" };
    }

    const normalizedUpdates = Array.isArray(updates)
      ? updates
        .map((entry) => {
          const sourceIndex = Number.parseInt(entry?.sourceIndex, 10);
          const time = roundTimingSeconds(entry?.time);
          const originalTime = roundTimingSeconds(entry?.originalTime);
          if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || time === null) {
            return null;
          }
          const anchorSourceIndex = Number.parseInt(entry?.anchorSourceIndex, 10);
          const rawBoundary = String(entry?.boundary || "").trim().toLowerCase();
          return {
            sourceIndex,
            time,
            originalTime,
            anchorSourceIndex:
              Number.isInteger(anchorSourceIndex) && anchorSourceIndex >= 0
                ? anchorSourceIndex
                : null,
            anchorChordName: String(entry?.anchorChordName || "").trim(),
            changedChordName: String(entry?.changedChordName || "").trim(),
            boundary:
              rawBoundary === "before" || rawBoundary === "after"
                ? rawBoundary
                : "",
          };
        })
        .filter(Boolean)
      : [];

    if (!normalizedUpdates.length) {
      return { success: false, error: "Missing timing updates" };
    }

    const safeMode = normalizeMode(mode);
    const payload = await loadEdits(videoId);
    const modeBucket = getModeBucket(payload, safeMode, true);
    modeBucket.timing = modeBucket.timing || {};

    const now = Date.now();
    for (const update of normalizedUpdates) {
      const key = String(update.sourceIndex);
      if (
        update.originalTime !== null &&
        Math.abs(update.time - update.originalTime) <= TIMING_RESET_EPSILON
      ) {
        delete modeBucket.timing[key];
        continue;
      }

      modeBucket.timing[key] = {
        sourceIndex: update.sourceIndex,
        time: update.time,
        originalTime: update.originalTime ?? undefined,
        anchorSourceIndex: update.anchorSourceIndex ?? undefined,
        anchorChordName: update.anchorChordName || undefined,
        changedChordName: update.changedChordName || undefined,
        boundary: update.boundary || undefined,
        updatedAt: now,
      };
    }

    const saveResult = await saveEdits(videoId, payload);
    if (saveResult?.success) {
      emitEditsChanged(videoId, safeMode);
    }
    return saveResult;
  }

  async function setChordSplitEdit({
    videoId,
    mode,
    parentSourceIndex,
    split,
  } = {}) {
    if (!videoId) {
      return { success: false, error: "Missing videoId" };
    }
    const sourceIndex = Number.parseInt(parentSourceIndex, 10);
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
      return { success: false, error: "Missing parentSourceIndex" };
    }

    const safeMode = normalizeMode(mode);
    const payload = await loadEdits(videoId);
    const modeBucket = getModeBucket(payload, safeMode, true);
    modeBucket.splits = modeBucket.splits || {};

    const normalized = normalizeSplitEntry(
      {
        ...split,
        parentSourceIndex: sourceIndex,
        updatedAt: Date.now(),
      },
      sourceIndex
    );
    if (!normalized || (!normalized.before.length && !normalized.after.length)) {
      delete modeBucket.splits[String(sourceIndex)];
    } else {
      modeBucket.splits[String(sourceIndex)] = normalized;
    }

    const saveResult = await saveEdits(videoId, payload);
    if (saveResult?.success) {
      emitEditsChanged(videoId, safeMode);
    }
    return saveResult;
  }

  async function setChordSplitSegmentDurationEdit({
    videoId,
    mode,
    parentSourceIndex,
    segmentId,
    duration,
  } = {}) {
    if (!videoId) {
      return { success: false, error: "Missing videoId" };
    }
    const sourceIndex = Number.parseInt(parentSourceIndex, 10);
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
      return { success: false, error: "Missing parentSourceIndex" };
    }

    const safeMode = normalizeMode(mode);
    const payload = await loadEdits(videoId);
    const modeBucket = getModeBucket(payload, safeMode, true);
    const entry = normalizeSplitEntry(modeBucket?.splits?.[String(sourceIndex)], sourceIndex);
    const result = setSplitEntrySegmentDuration(entry, segmentId, duration);
    if (!result.entry || !result.changed) {
      return { success: true, changed: false };
    }

    modeBucket.splits = modeBucket.splits || {};
    modeBucket.splits[String(sourceIndex)] = {
      ...result.entry,
      updatedAt: Date.now(),
    };

    const saveResult = await saveEdits(videoId, payload);
    if (saveResult?.success) {
      emitEditsChanged(videoId, safeMode);
    }
    return {
      ...saveResult,
      changed: true,
      duration: result.duration,
    };
  }

  async function setChordSplitEditsForParents({
    videoId,
    mode,
    parentSourceIndices = [],
    split,
  } = {}) {
    if (!videoId) {
      return { success: false, error: "Missing videoId" };
    }
    const parentIndices = uniqueSortedNumbers(parentSourceIndices);
    if (!parentIndices.length) {
      return { success: false, error: "Missing parentSourceIndices" };
    }

    const safeMode = normalizeMode(mode);
    const payload = await loadEdits(videoId);
    const modeBucket = getModeBucket(payload, safeMode, true);
    modeBucket.splits = modeBucket.splits || {};

    for (const sourceIndex of parentIndices) {
      const normalized = normalizeSplitEntry(
        {
          ...split,
          parentSourceIndex: sourceIndex,
          updatedAt: Date.now(),
        },
        sourceIndex
      );
      if (!normalized || (!normalized.before.length && !normalized.after.length)) {
        delete modeBucket.splits[String(sourceIndex)];
      } else {
        modeBucket.splits[String(sourceIndex)] = normalized;
      }
    }

    const saveResult = await saveEdits(videoId, payload);
    if (saveResult?.success) {
      emitEditsChanged(videoId, safeMode);
    }
    return saveResult;
  }

  async function removeChordSplitSegment({
    videoId,
    mode,
    parentSourceIndex,
    segmentId = "",
    chordName = "",
    applyToAll = false,
  } = {}) {
    if (!videoId) {
      return { success: false, error: "Missing videoId" };
    }
    const sourceIndex = Number.parseInt(parentSourceIndex, 10);
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
      return { success: false, error: "Missing parentSourceIndex" };
    }

    const safeMode = normalizeMode(mode);
    const payload = await loadEdits(videoId);
    const modeBucket = getModeBucket(payload, safeMode, false);
    const name = String(chordName || "").trim().toLowerCase();
    if (applyToAll && name && modeBucket?.splits) {
      modeBucket.splits = modeBucket.splits || {};
      const removedSplitSegments = removeSplitSegmentsByChordName(modeBucket, name);

      if (!removedSplitSegments) return { success: true, changed: false };
      const saveResult = await saveEdits(videoId, payload);
      if (saveResult?.success) {
        emitEditsChanged(videoId, safeMode);
      }
      return {
        ...saveResult,
        changed: true,
        removedSplitSegments,
      };
    }

    const entry = normalizeSplitEntry(modeBucket?.splits?.[String(sourceIndex)], sourceIndex);
    if (!entry) return { success: true, changed: false };

    const id = String(segmentId || "").trim();
    const removedSegments = [
      ...(entry.before || []),
      ...(entry.after || []),
    ].filter((segment) => {
      if (applyToAll && name) {
        return String(segment.chordName || "").trim().toLowerCase() === name;
      }
      return id && segment.id === id;
    });
    const excludedSegmentIds = new Set(removedSegments.map((segment) => segment.id).filter(Boolean));
    removedSegments.forEach((segment) => {
      restoreSplitSegmentDurationToEntry(entry, segment, excludedSegmentIds);
    });
    const filterSegments = (segments) => (segments || []).filter((segment) => {
      if (applyToAll && name) {
        return String(segment.chordName || "").trim().toLowerCase() !== name;
      }
      return !id || segment.id !== id;
    });

    const nextEntry = {
      ...entry,
      before: filterSegments(entry.before),
      after: filterSegments(entry.after),
      updatedAt: Date.now(),
    };
    delete nextEntry.currentDuration;
    const changed =
      nextEntry.before.length !== entry.before.length ||
      nextEntry.after.length !== entry.after.length;
    if (!changed) return { success: true, changed: false };

    modeBucket.splits = modeBucket.splits || {};
    if (!nextEntry.before.length && !nextEntry.after.length) {
      delete modeBucket.splits[String(sourceIndex)];
    } else {
      modeBucket.splits[String(sourceIndex)] = nextEntry;
    }

    const saveResult = await saveEdits(videoId, payload);
    if (saveResult?.success) {
      emitEditsChanged(videoId, safeMode);
    }
    return {
      ...saveResult,
      changed,
    };
  }

  function openChordTimingEditor({
    anchorEl,
    videoId = null,
    mode = "regular",
    sourceIndices = [],
    sourceChords = [],
    displayChords = [],
    displayIndex = null,
    capoContext = "panel",
    onClose,
  } = {}) {
    if (!anchorEl || !document?.body) return null;

    if (activeTimingEditorClose && activeTimingEditorAnchor === anchorEl) {
      closeChordTimingEditor();
      return null;
    }

    closeChordTimingEditor();
    closeChordReplacePicker();
    closeChordRemoveScopePicker();
    closeChordEditsSummaryPopup();

    const safeMode = normalizeMode(mode);
    const safeSourceIndices = uniqueSortedNumbers(sourceIndices);
    const safeDisplayIndex = Number.parseInt(displayIndex, 10);
    const hasDisplayIndex =
      Number.isInteger(safeDisplayIndex) &&
      safeDisplayIndex >= 0 &&
      safeDisplayIndex < (Array.isArray(displayChords) ? displayChords.length : 0);
    const displayList = Array.isArray(displayChords) ? displayChords : [];
    const sourceList = Array.isArray(sourceChords) ? sourceChords : [];
    const currentDisplayChord = hasDisplayIndex
      ? displayList[safeDisplayIndex]
      : null;

    const currentSourceIndex =
      firstSourceIndexFromChord(currentDisplayChord) ??
      (safeSourceIndices.length ? safeSourceIndices[0] : null);
    if (!Number.isInteger(currentSourceIndex) || currentSourceIndex < 0) {
      window.ycUtils?.showToast?.("Cannot adjust timing for this chord", "!", 2200);
      return null;
    }

    const prevDisplayChord = hasDisplayIndex ? displayList[safeDisplayIndex - 1] : null;
    const nextDisplayChord = hasDisplayIndex ? displayList[safeDisplayIndex + 1] : null;
    const afterNextDisplayChord = hasDisplayIndex ? displayList[safeDisplayIndex + 2] : null;
    const prevSourceIndex = firstSourceIndexFromChord(prevDisplayChord);
    const nextSourceIndex = firstSourceIndexFromChord(nextDisplayChord);
    const afterNextSourceIndex = firstSourceIndexFromChord(afterNextDisplayChord);
    const getSplitParentIndexForChord = (chord) => {
      const parsed = Number.parseInt(chord?.__splitParentSourceIndex, 10);
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    };
    const isChordInCurrentSplitGroup = (chord) => {
      if (!chord) return false;
      if (firstSourceIndexFromChord(chord) === currentSourceIndex) return true;
      const splitParentIndex = getSplitParentIndexForChord(chord);
      if (splitParentIndex === currentSourceIndex) return true;
      return chord?.__splitParent === true && firstSourceIndexFromChord(chord) === currentSourceIndex;
    };
    const isCurrentSplitAddedChord = (chord) =>
      chord?.__splitAdded === true &&
      getSplitParentIndexForChord(chord) === currentSourceIndex;
    const findDisplayChordOutsideCurrentSplitGroup = (direction) => {
      if (!hasDisplayIndex || !direction) return null;
      for (
        let index = safeDisplayIndex + direction;
        index >= 0 && index < displayList.length;
        index += direction
      ) {
        const candidate = displayList[index];
        if (!candidate) continue;
        if (isChordInCurrentSplitGroup(candidate)) continue;
        return candidate;
      }
      return null;
    };
    const findFirstCurrentSplitGroupChord = () => {
      if (!hasDisplayIndex) return currentDisplayChord;
      let first = currentDisplayChord;
      for (let index = safeDisplayIndex - 1; index >= 0; index -= 1) {
        const candidate = displayList[index];
        if (!isChordInCurrentSplitGroup(candidate)) break;
        first = candidate;
      }
      return first || currentDisplayChord;
    };
    const prevExternalDisplayChord = findDisplayChordOutsideCurrentSplitGroup(-1);
    const nextExternalDisplayChord = findDisplayChordOutsideCurrentSplitGroup(1);
    const prevExternalSourceIndex = firstSourceIndexFromChord(prevExternalDisplayChord);
    const nextExternalSourceIndex = firstSourceIndexFromChord(nextExternalDisplayChord);
    const prevIsCurrentSplitSegment =
      Number.isInteger(prevSourceIndex) && prevSourceIndex === currentSourceIndex;
    const nextIsCurrentSplitSegment =
      isCurrentSplitAddedChord(nextDisplayChord) ||
      (Number.isInteger(nextSourceIndex) && nextSourceIndex === currentSourceIndex);

    const canMoveStart = Number.isInteger(prevSourceIndex) && prevSourceIndex >= 0;
    const canMoveEnd =
      Number.isInteger(nextSourceIndex) &&
      nextSourceIndex >= 0 &&
      (nextSourceIndex !== currentSourceIndex || nextIsCurrentSplitSegment);

    const originalStartTime = resolveSourceOriginalTime(sourceList, currentSourceIndex);
    const originalEndTime = canMoveEnd && !nextIsCurrentSplitSegment
      ? resolveSourceOriginalTime(sourceList, nextSourceIndex)
      : null;

    const readDisplayTime = (chord, fallback) => {
      const direct = roundTimingSeconds(chord?.time);
      if (direct !== null) return direct;
      return roundTimingSeconds(fallback) ?? 0;
    };

    const prevStartTime = canMoveStart
      ? readDisplayTime(prevDisplayChord, resolveSourceOriginalTime(sourceList, prevSourceIndex))
      : null;
    const afterNextStartTime = Number.isInteger(afterNextSourceIndex)
      ? readDisplayTime(afterNextDisplayChord, resolveSourceOriginalTime(sourceList, afterNextSourceIndex))
      : null;
    const videoDuration = resolveCurrentVideoDurationSeconds();
    const nextDisplayEndTime =
      afterNextStartTime !== null
        ? afterNextStartTime
        : (videoDuration !== null ? videoDuration : null);
    const splitGroupFirstDisplayChord = findFirstCurrentSplitGroupChord();
    const splitGroupStartTime = readDisplayTime(
      splitGroupFirstDisplayChord,
      originalStartTime
    );
    const nextExternalStartTime = Number.isInteger(nextExternalSourceIndex)
      ? readDisplayTime(
        nextExternalDisplayChord,
        resolveSourceOriginalTime(sourceList, nextExternalSourceIndex)
      )
      : null;
    const splitGroupEndTime =
      nextExternalStartTime !== null
        ? nextExternalStartTime
        : (videoDuration !== null ? videoDuration : nextDisplayEndTime);
    const fallbackEndTime =
      videoDuration !== null &&
      originalStartTime !== null &&
      videoDuration > originalStartTime + MIN_CHORD_DURATION_SECONDS
        ? videoDuration
        : readDisplayTime(currentDisplayChord, originalStartTime) + 3;

    const state = {
      startTime: readDisplayTime(currentDisplayChord, originalStartTime),
      endTime: canMoveEnd
        ? readDisplayTime(nextDisplayChord, originalEndTime)
        : fallbackEndTime,
    };
    const openEndedStartMax = state.startTime + 30;
    const openEndedEndMax = state.endTime + 30;

    const currentName = resolveTimingDisplayName(
      currentDisplayChord,
      sourceList,
      currentSourceIndex,
      capoContext
    );
    const prevName = canMoveStart
      ? resolveTimingDisplayName(prevDisplayChord, sourceList, prevSourceIndex, capoContext)
      : "";
    const nextName = canMoveEnd
      ? resolveTimingDisplayName(nextDisplayChord, sourceList, nextSourceIndex, capoContext)
      : "";
    const prevExternalName = Number.isInteger(prevExternalSourceIndex)
      ? resolveTimingDisplayName(prevExternalDisplayChord, sourceList, prevExternalSourceIndex, capoContext)
      : "";
    const nextExternalName = Number.isInteger(nextExternalSourceIndex)
      ? resolveTimingDisplayName(nextExternalDisplayChord, sourceList, nextExternalSourceIndex, capoContext)
      : "";
    const currentBaseName =
      getChordName(currentDisplayChord) ||
      getChordName(sourceList[currentSourceIndex]) ||
      currentName;
    const prevBaseName = canMoveStart
      ? (
        getChordName(prevDisplayChord) ||
        getChordName(sourceList[prevSourceIndex]) ||
        prevName
      )
      : "";
    const nextBaseName = canMoveEnd
      ? (
        getChordName(nextDisplayChord) ||
        getChordName(sourceList[nextSourceIndex]) ||
        nextName
      )
      : "";
    const prevExternalBaseName = Number.isInteger(prevExternalSourceIndex)
      ? (
        getChordName(prevExternalDisplayChord) ||
        getChordName(sourceList[prevExternalSourceIndex]) ||
        prevExternalName
      )
      : "";
    const nextExternalBaseName = Number.isInteger(nextExternalSourceIndex)
      ? (
        getChordName(nextExternalDisplayChord) ||
        getChordName(sourceList[nextExternalSourceIndex]) ||
        nextExternalName
      )
      : "";

    const panel = document.createElement("div");
    panel.style.cssText = `
      position: absolute;
      width: 340px;
      max-width: calc(100vw - 16px);
      background: rgba(20, 20, 22, 0.98);
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 9px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
      color: #fff;
      padding: 9px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow: visible;
    `;
    panel.style.zIndex = String(resolvePickerZIndex(anchorEl));
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Adjust chord timing");
    panel.setAttribute("dir", "ltr");
    panel.style.direction = "ltr";
    panel.style.textAlign = "left";
    panel.style.unicodeBidi = "isolate";

    const header = document.createElement("div");
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-right: 26px;
    `;
    const title = document.createElement("div");
    title.textContent = "Chord Time";
    title.style.cssText = `
      font-size: 13px;
      font-weight: 800;
      color: rgba(255, 255, 255, 0.94);
      line-height: 1.1;
    `;
    const subtitle = document.createElement("div");
    subtitle.textContent = "0.1s steps";
    subtitle.style.cssText = `
      font-size: 10px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.58);
      margin-left: auto;
    `;
    header.appendChild(title);
    header.appendChild(subtitle);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "X";
    closeButton.title = "Close";
    closeButton.style.cssText = `
      position: absolute;
      top: 7px;
      right: 7px;
      width: 20px;
      height: 20px;
      border: 1px solid rgba(255, 255, 255, 0.26);
      border-radius: 5px;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.9);
      font-size: 10px;
      font-weight: 800;
      line-height: 1;
      padding: 0;
      cursor: pointer;
    `;

    const cardsRow = document.createElement("div");
    cardsRow.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      padding-top: 6px;
      padding-bottom: 2px;
      overflow: visible;
    `;

    const controls = document.createElement("div");
    controls.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 7px;
    `;

    const createSliderRow = (labelText) => {
      const row = document.createElement("label");
      row.style.cssText = `
        display: grid;
        grid-template-columns: 58px 1fr 58px;
        align-items: center;
        gap: 7px;
        color: rgba(255, 255, 255, 0.86);
        font-size: 11px;
        font-weight: 700;
      `;
      const label = document.createElement("span");
      const slider = document.createElement("input");
      slider.type = "range";
      slider.step = String(TIMING_STEP_SECONDS);
      slider.style.cssText = `
        width: 100%;
        margin: 0;
        accent-color: #22c55e;
        cursor: pointer;
      `;
      const value = document.createElement("span");
      value.style.cssText = `
        font-variant-numeric: tabular-nums;
        color: rgba(255, 255, 255, 0.74);
        text-align: right;
      `;
      const labelTitle = document.createElement("span");
      labelTitle.textContent = labelText;
      labelTitle.style.cssText = `
        display: block;
        color: rgba(255, 255, 255, 0.9);
        font-size: 11px;
        font-weight: 800;
        line-height: 1.05;
      `;
      const labelDetail = document.createElement("span");
      labelDetail.style.cssText = `
        display: block;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: rgba(255, 255, 255, 0.68);
        font-size: 10px;
        font-weight: 700;
        line-height: 1.05;
      `;
      label.appendChild(labelTitle);
      label.appendChild(labelDetail);
      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(value);
      return { row, label, labelTitle, labelDetail, slider, value };
    };

    const startRow = createSliderRow("Start");
    const endRow = createSliderRow("End");
    controls.appendChild(startRow.row);
    controls.appendChild(endRow.row);

    const splitState = {
      before: [],
      after: [],
      currentDuration: null,
      loaded: false,
    };
    const externalSplitEntries = new Map();
    let draggedSplitSegmentId = "";
    let initialSplitHadEntries = false;
    let splitPreviewTouched = false;
    const splitOptionsState = {
      includeLetterMatches: localStorage.getItem(UI_INCLUDE_LETTER_MATCH_KEY) !== "false",
      includeAllModes: false,
      includeFullLibrary: false,
      allModesLoaded: false,
      fullLibraryLoaded: false,
      allModesLoading: false,
      fullLibraryLoading: false,
      allModesOptions: [],
      fullLibraryOptions: [],
    };
    const currentSongOptions = buildSongChordList(sourceList);
    let splitSectionExpanded = localStorage.getItem(UI_TIME_SPLIT_EXPANDED_KEY) === "true";
    let splitDropdownOpen = false;

    const splitSection = document.createElement("div");
    splitSection.style.cssText = `
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.045);
      padding: 7px;
      display: flex;
      flex-direction: column;
      gap: 7px;
    `;

    const splitHeader = document.createElement("div");
    splitHeader.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      color: rgba(255, 255, 255, 0.9);
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
      user-select: none;
    `;
    const splitTitleWrap = document.createElement("span");
    splitTitleWrap.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    `;
    const splitCaret = document.createElement("span");
    splitCaret.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.78);
      font-size: 11px;
      font-weight: 900;
      line-height: 1;
      flex: 0 0 auto;
    `;
    const splitTitle = document.createElement("span");
    splitTitle.textContent = "Split inside this chord";
    splitTitle.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    const splitBudget = document.createElement("span");
    splitBudget.style.cssText = `
      color: rgba(255, 255, 255, 0.58);
      font-size: 10px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      flex: 0 0 auto;
    `;
    splitTitleWrap.appendChild(splitCaret);
    splitTitleWrap.appendChild(splitTitle);
    splitHeader.appendChild(splitTitleWrap);
    splitHeader.appendChild(splitBudget);

    const splitBody = document.createElement("div");
    splitBody.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 7px;
    `;

    const splitInputRow = document.createElement("div");
    splitInputRow.style.cssText = `
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 5px;
      align-items: center;
    `;
    const splitChordInput = document.createElement("input");
    splitChordInput.type = "text";
    splitChordInput.placeholder = "Search / type chord...";
    splitChordInput.style.cssText = `
      min-width: 0;
      height: 25px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      outline: none;
      padding: 0 7px;
    `;
    const splitDropdown = document.createElement("div");
    splitDropdown.style.cssText = `
      display: none;
      flex-direction: column;
      gap: 5px;
      max-height: 166px;
      overflow-y: auto;
      padding: 6px;
      border: 1px solid rgba(56, 189, 248, 0.58);
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.98);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.42);
    `;

    const makeSmallSplitButton = (label, tone = "default") => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.style.cssText = `
        height: 25px;
        min-width: 42px;
        border-radius: 6px;
        border: 1px solid ${tone === "before" ? "rgba(245, 158, 11, 0.5)" : "rgba(34, 197, 94, 0.5)"};
        background: ${tone === "before" ? "rgba(245, 158, 11, 0.16)" : "rgba(34, 197, 94, 0.16)"};
        color: rgba(255, 255, 255, 0.92);
        font-size: 10px;
        font-weight: 900;
        cursor: pointer;
        padding: 0 7px;
      `;
      return button;
    };
    const addBeforeButton = makeSmallSplitButton("+ Before", "before");
    const addAfterButton = makeSmallSplitButton("+ After", "after");
    splitInputRow.appendChild(splitChordInput);
    splitInputRow.appendChild(addBeforeButton);
    splitInputRow.appendChild(addAfterButton);

    const splitToggles = document.createElement("div");
    splitToggles.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 8px;
    `;
    const createSplitToggle = (labelText, checked = false) => {
      const label = document.createElement("label");
      label.style.cssText = `
        display: flex;
        align-items: center;
        gap: 5px;
        min-width: 0;
        color: rgba(255, 255, 255, 0.72);
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        user-select: none;
      `;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = checked;
      checkbox.style.cssText = "margin:0; width:12px; height:12px; cursor:pointer;";
      const text = document.createElement("span");
      text.textContent = labelText;
      text.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      label.appendChild(checkbox);
      label.appendChild(text);
      return { label, checkbox, text };
    };
    const splitLetterToggle = createSplitToggle("Include letter matches", splitOptionsState.includeLetterMatches);
    const splitAllModesToggle = createSplitToggle("Include all modes", false);
    const splitFullLibraryToggle = createSplitToggle("Include full library", false);
    splitToggles.appendChild(splitLetterToggle.label);
    splitToggles.appendChild(splitAllModesToggle.label);
    splitToggles.appendChild(splitFullLibraryToggle.label);

    const splitStatus = document.createElement("div");
    splitStatus.style.cssText = `
      display: none;
      color: rgba(255, 255, 255, 0.58);
      font-size: 10px;
      font-weight: 700;
    `;

    const splitLanes = document.createElement("div");
    splitLanes.style.cssText = `
      display: grid;
      grid-template-columns: 1fr;
      gap: 5px;
    `;

    splitSection.appendChild(splitHeader);
    splitBody.appendChild(splitInputRow);
    splitBody.appendChild(splitDropdown);
    splitBody.appendChild(splitToggles);
    splitBody.appendChild(splitStatus);
    splitBody.appendChild(splitLanes);
    splitSection.appendChild(splitBody);

    const applySplitSectionExpandedState = () => {
      splitBody.style.display = splitSectionExpanded ? "flex" : "none";
      splitCaret.textContent = splitSectionExpanded ? "-" : "+";
      splitHeader.title = splitSectionExpanded ? "Collapse split controls" : "Expand split controls";
    };
    splitHeader.addEventListener("click", () => {
      splitSectionExpanded = !splitSectionExpanded;
      if (!splitSectionExpanded) {
        setSplitDropdownOpen(false);
      }
      try {
        localStorage.setItem(UI_TIME_SPLIT_EXPANDED_KEY, splitSectionExpanded ? "true" : "false");
      } catch (error) {
        log("Failed saving split section expanded state:", error);
      }
      applySplitSectionExpandedState();
      requestAnimationFrame(() => reposition());
    });
    applySplitSectionExpandedState();

    const footer = document.createElement("div");
    footer.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 7px;
    `;

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Reset";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";

    const styleFooterButton = (button, tone = "default") => {
      button.style.cssText = `
        height: 27px;
        min-width: 72px;
        border-radius: 7px;
        border: 1px solid ${tone === "save" ? "rgba(34, 197, 94, 0.5)" : "rgba(255, 255, 255, 0.22)"};
        background: ${tone === "save" ? "rgba(34, 197, 94, 0.18)" : "rgba(255, 255, 255, 0.07)"};
        color: ${tone === "save" ? "#d8ffe6" : "rgba(255, 255, 255, 0.88)"};
        font-size: 11px;
        font-weight: 800;
        cursor: pointer;
        padding: 0 10px;
      `;
      button.addEventListener("mouseenter", () => {
        if (button.disabled) return;
        button.style.background = tone === "save"
          ? "rgba(34, 197, 94, 0.26)"
          : "rgba(255, 255, 255, 0.13)";
      });
      button.addEventListener("mouseleave", () => {
        if (button.disabled) return;
        button.style.background = tone === "save"
          ? "rgba(34, 197, 94, 0.18)"
          : "rgba(255, 255, 255, 0.07)";
      });
    };
    styleFooterButton(cancelButton);
    styleFooterButton(resetButton);
    styleFooterButton(saveButton, "save");

    const disabledHint = document.createElement("div");
    disabledHint.style.cssText = `
      flex: 1 1 auto;
      min-width: 0;
      color: rgba(255, 255, 255, 0.58);
      font-size: 10px;
      font-weight: 600;
      line-height: 1.25;
    `;

    footer.appendChild(disabledHint);
    footer.appendChild(cancelButton);
    footer.appendChild(resetButton);
    footer.appendChild(saveButton);

    panel.appendChild(closeButton);
    panel.appendChild(header);
    panel.appendChild(cardsRow);
    panel.appendChild(controls);
    panel.appendChild(splitSection);
    panel.appendChild(footer);
    document.body.appendChild(panel);

    const renderBeatGrid = (host, duration, isCurrent) => {
      const totalBeats = Math.max(0, Math.floor(Math.max(0, duration) / 0.5));
      if (totalBeats <= 0) {
        host.style.display = "none";
        host.innerHTML = "";
        return;
      }
      host.style.display = "grid";
      host.style.gridTemplateColumns = `repeat(${Math.min(10, totalBeats)}, 1fr)`;
      host.innerHTML = "";
      for (let i = 0; i < totalBeats; i += 1) {
        const cell = document.createElement("div");
        cell.style.cssText = `
          width: 8px;
          height: 16px;
          background: ${isCurrent ? "#2196f3" : "#bdbdbd"};
          border-radius: 0;
          image-rendering: pixelated;
        `;
        host.appendChild(cell);
      }
    };

    const getParentSplitDuration = () => {
      const parentStart = splitGroupStartTime !== null ? splitGroupStartTime : state.startTime;
      const parentEnd = splitGroupEndTime !== null ? splitGroupEndTime : state.endTime;
      const duration = roundTimingSeconds(parentEnd - parentStart);
      return Math.max(MIN_CHORD_DURATION_SECONDS, duration ?? MIN_CHORD_DURATION_SECONDS);
    };

    const getSplitSegments = () => [
      ...(splitState.before || []),
      ...(splitState.after || []),
    ];

    const mergeAdjacentSplitSegments = (segments = []) => {
      if (!Array.isArray(segments) || segments.length < 2) return segments;
      for (let index = segments.length - 1; index > 0; index -= 1) {
        const current = segments[index];
        const previous = segments[index - 1];
        if (!areChordNamesEqual(previous?.chordName, current?.chordName)) continue;
        const previousDuration = roundTimingSeconds(previous.duration) ?? MIN_CHORD_DURATION_SECONDS;
        const currentDuration = roundTimingSeconds(current.duration) ?? MIN_CHORD_DURATION_SECONDS;
        previous.duration = roundTimingSeconds(previousDuration + currentDuration) ?? previousDuration;
        previous.sources = normalizeSplitDurationSources(
          mergeSplitDurationSources(previous.sources, current.sources),
          previous.duration
        );
        if (!previous.takeSource && current.takeSource) {
          previous.takeSource = current.takeSource;
        }
        segments.splice(index, 1);
      }
      return segments;
    };

    const mergeSplitSegmentsTouchingCurrent = () => {
      const currentChordName = currentBaseName || currentName;
      let changed = false;
      while (
        Array.isArray(splitState.before) &&
        splitState.before.length &&
        areChordNamesEqual(splitState.before[splitState.before.length - 1]?.chordName, currentChordName)
      ) {
        const segment = splitState.before.pop();
        splitState.currentDuration = roundTimingSeconds(
          getSplitCurrentDuration() + (roundTimingSeconds(segment?.duration) ?? 0)
        );
        changed = true;
      }
      while (
        Array.isArray(splitState.after) &&
        splitState.after.length &&
        areChordNamesEqual(splitState.after[0]?.chordName, currentChordName)
      ) {
        const segment = splitState.after.shift();
        splitState.currentDuration = roundTimingSeconds(
          getSplitCurrentDuration() + (roundTimingSeconds(segment?.duration) ?? 0)
        );
        changed = true;
      }
      return changed;
    };

    const getOriginalNeighborConflict = (
      beforeSegments = splitState.before || [],
      afterSegments = splitState.after || [],
      sideFilter = ""
    ) => {
      const filterSide = String(sideFilter || "").toLowerCase();
      const previousChordName = prevExternalBaseName || prevExternalName;
      if (
        (!filterSide || filterSide === "before") &&
        previousChordName &&
        Array.isArray(beforeSegments) &&
        beforeSegments.length &&
        areChordNamesEqual(beforeSegments[0]?.chordName, previousChordName)
      ) {
        return {
          side: "before",
          chordName: beforeSegments[0]?.chordName || previousChordName,
          neighborName: previousChordName,
        };
      }

      const nextChordName = nextExternalBaseName || nextExternalName;
      if (
        (!filterSide || filterSide === "after") &&
        nextChordName &&
        Array.isArray(afterSegments) &&
        afterSegments.length &&
        areChordNamesEqual(afterSegments[afterSegments.length - 1]?.chordName, nextChordName)
      ) {
        return {
          side: "after",
          chordName: afterSegments[afterSegments.length - 1]?.chordName || nextChordName,
          neighborName: nextChordName,
        };
      }
      return null;
    };

    const showOriginalNeighborConflict = (conflict) => {
      if (!conflict) return;
      const side = String(conflict.side || "").toLowerCase();
      const sideText = side === "before"
        ? `at the start of BEFORE because it touches the original "${conflict.neighborName}" before this chord`
        : side === "after"
          ? `at the end of AFTER because it touches the original "${conflict.neighborName}" after this chord`
          : `next to the original "${conflict.neighborName}" outside this chord`;
      window.ycUtils?.showToast?.(
        `Cannot place "${conflict.chordName}" ${sideText}.`,
        "!",
        3600
      );
    };

    const mergeAdjacentSplitState = () => {
      splitState.before = mergeAdjacentSplitSegments(splitState.before || []);
      splitState.after = mergeAdjacentSplitSegments(splitState.after || []);
      const touchedCurrent = mergeSplitSegmentsTouchingCurrent();
      if (touchedCurrent) {
        splitState.before = mergeAdjacentSplitSegments(splitState.before || []);
        splitState.after = mergeAdjacentSplitSegments(splitState.after || []);
      }
    };

    const getSplitAddedDuration = (excludeId = "") => getSplitSegments().reduce((sum, segment) => {
      if (excludeId && segment.id === excludeId) return sum;
      const duration = roundTimingSeconds(segment.duration);
      return sum + (duration ?? 0);
    }, 0);

    const getSplitCurrentDuration = () => {
      const total = getParentSplitDuration();
      const added = getSplitAddedDuration();
      const fallback = roundTimingSeconds(total - added);
      const current = roundTimingSeconds(splitState.currentDuration);
      if (current === null) {
        return Math.max(MIN_CHORD_DURATION_SECONDS, fallback ?? MIN_CHORD_DURATION_SECONDS);
      }
      return Math.max(MIN_CHORD_DURATION_SECONDS, Math.min(current, total));
    };

    const normalizeSplitStateForBudget = () => {
      mergeAdjacentSplitState();
      const total = getParentSplitDuration();
      const minCurrent = MIN_CHORD_DURATION_SECONDS;
      const segments = getSplitSegments();
      let added = getSplitAddedDuration();
      if (added <= total - minCurrent) {
        splitState.currentDuration = roundTimingSeconds(total - added);
        return;
      }

      const available = Math.max(0, total - minCurrent);
      const scale = added > 0 ? available / added : 1;
      for (const segment of segments) {
        segment.duration = Math.max(
          MIN_CHORD_DURATION_SECONDS,
          roundTimingSeconds(segment.duration * scale) ?? MIN_CHORD_DURATION_SECONDS
        );
        segment.sources = normalizeSplitDurationSources(segment.sources, segment.duration);
      }
      added = getSplitAddedDuration();
      splitState.currentDuration = Math.max(
        minCurrent,
        roundTimingSeconds(total - added) ?? minCurrent
      );
    };

    const getSplitSegmentById = (segmentId) => {
      const id = String(segmentId || "").trim();
      if (!id) return null;
      return getSplitSegments().find((segment) => segment.id === id) || null;
    };

    const ensureSegmentDurationSources = (segment) => {
      if (!segment) return [];
      segment.sources = normalizeSplitDurationSources(segment.sources, segment.duration);
      return segment.sources;
    };

    const getTakeSourceSegments = (sourceValue, excludeId = "") => {
      const value = String(sourceValue || "current");
      const excluded = String(excludeId || "");
      if (value === "before-all") {
        return (splitState.before || []).filter((segment) => segment.id !== excluded);
      }
      if (value === "after-all") {
        return (splitState.after || []).filter((segment) => segment.id !== excluded);
      }
      if (value.startsWith("segment:")) {
        const segment = getSplitSegmentById(value.slice("segment:".length));
        return segment && segment.id !== excluded ? [segment] : [];
      }
      return [];
    };

    const getAvailableFromSegments = (segments = []) => segments.reduce((sum, segment) => {
      const duration = roundTimingSeconds(segment?.duration);
      return sum + Math.max(0, (duration ?? 0) - MIN_CHORD_DURATION_SECONDS);
    }, 0);

    const getAvailableFromTakeSource = (sourceValue = "current", excludeId = "") => {
      const value = String(sourceValue || "current");
      if (value === "current") {
        return Math.max(0, getSplitCurrentDuration() - MIN_CHORD_DURATION_SECONDS);
      }
      return getAvailableFromSegments(getTakeSourceSegments(value, excludeId));
    };

    const giveDurationToSourceRecords = (sources, excludeId = "") => {
      const records = normalizeSplitDurationSources(sources);
      let returned = 0;
      for (const record of records) {
        const amount = roundTimingSeconds(record.amount) ?? 0;
        if (amount <= 0) continue;
        if (record.type === "segment") {
          const target = getSplitSegmentById(record.segmentId);
          if (target && target.id !== excludeId) {
            const duration = roundTimingSeconds(target.duration) ?? MIN_CHORD_DURATION_SECONDS;
            target.duration = roundTimingSeconds(duration + amount) ?? duration;
            target.sources = normalizeSplitDurationSources(
              mergeSplitDurationSources(target.sources, record.sources),
              target.duration
            );
            returned = roundTimingSeconds(returned + amount) ?? returned;
            continue;
          }
          if (record.sources?.length) {
            returned = roundTimingSeconds(returned + giveDurationToSourceRecords(record.sources, excludeId)) ?? returned;
            continue;
          }
        }
        const currentDuration = getSplitCurrentDuration();
        splitState.currentDuration = roundTimingSeconds(currentDuration + amount);
        returned = roundTimingSeconds(returned + amount) ?? returned;
      }
      return returned;
    };

    const takeSourceRecordsFromSegment = (segment, amount) => {
      const requested = roundTimingSeconds(amount) ?? 0;
      if (!segment || requested <= 0) return [];
      const availableDuration = roundTimingSeconds(segment.duration) ?? MIN_CHORD_DURATION_SECONDS;
      const available = Math.max(0, availableDuration - MIN_CHORD_DURATION_SECONDS);
      const targetAmount = Math.min(requested, available);
      if (targetAmount <= 0) return [];

      const ledger = ensureSegmentDurationSources(segment);
      const takenSources = [];
      let remaining = targetAmount;
      for (let index = ledger.length - 1; index >= 0 && remaining > 0; index -= 1) {
        const source = ledger[index];
        const sourceAmount = roundTimingSeconds(source.amount) ?? 0;
        if (sourceAmount <= 0) {
          ledger.splice(index, 1);
          continue;
        }
        const taken = Math.min(sourceAmount, remaining);
        const nextSource = {
          ...source,
          amount: roundTimingSeconds(taken) ?? taken,
        };
        if (source.type === "segment") {
          nextSource.sources = takeSplitDurationSourcesFromEnd(source.sources, taken);
        }
        takenSources.unshift(nextSource);

        source.amount = roundTimingSeconds(sourceAmount - taken) ?? 0;
        if (source.amount <= 0) {
          ledger.splice(index, 1);
        }
        remaining = roundTimingSeconds(remaining - taken) ?? 0;
      }

      if (remaining > 0) {
        takenSources.unshift({
          type: "current",
          amount: roundTimingSeconds(remaining) ?? remaining,
        });
      }

      segment.duration = roundTimingSeconds(availableDuration - targetAmount) ?? availableDuration;
      segment.sources = normalizeSplitDurationSources(ledger, segment.duration);
      return takenSources;
    };

    const takeDurationFromSegments = (segments, amount) => {
      let remaining = roundTimingSeconds(amount) ?? 0;
      if (remaining <= 0) return { taken: 0, sources: [] };

      let taken = 0;
      const sources = [];
      for (let index = segments.length - 1; index >= 0 && remaining > 0; index -= 1) {
        const segment = segments[index];
        const duration = roundTimingSeconds(segment.duration) ?? MIN_CHORD_DURATION_SECONDS;
        const available = Math.max(0, duration - MIN_CHORD_DURATION_SECONDS);
        if (available <= 0) continue;
        const nextTake = Math.min(remaining, available);
        const sourceRecords = takeSourceRecordsFromSegment(segment, nextTake);
        const actualTaken = sumSplitDurationSources(sourceRecords);
        if (actualTaken <= 0) continue;
        sources.push({
          type: "segment",
          segmentId: segment.id,
          amount: roundTimingSeconds(actualTaken) ?? actualTaken,
          sources: sourceRecords,
        });
        taken = roundTimingSeconds(taken + actualTaken) ?? taken;
        remaining = roundTimingSeconds(remaining - actualTaken) ?? 0;
      }
      return { taken, sources };
    };

    const takeDurationFromSource = (sourceValue, amount, excludeId = "") => {
      const requested = roundTimingSeconds(amount) ?? 0;
      if (requested <= 0) return { taken: 0, sources: [] };

      const value = String(sourceValue || "current");
      if (value === "current") {
        const currentDuration = getSplitCurrentDuration();
        const available = Math.max(0, currentDuration - MIN_CHORD_DURATION_SECONDS);
        const taken = Math.min(requested, available);
        if (taken <= 0) return { taken: 0, sources: [] };
        splitState.currentDuration = roundTimingSeconds(currentDuration - taken);
        return {
          taken,
          sources: [{ type: "current", amount: roundTimingSeconds(taken) ?? taken }],
        };
      }

      return takeDurationFromSegments(
        getTakeSourceSegments(value, excludeId),
        Math.min(requested, getAvailableFromTakeSource(value, excludeId))
      );
    };

    const returnDurationFromSegmentLedger = (segment, amount = null) => {
      if (!segment) return 0;
      const originalDuration = roundTimingSeconds(segment.duration) ?? 0;
      const requested = amount === null || amount === undefined
        ? originalDuration
        : (roundTimingSeconds(amount) ?? 0);
      if (requested <= 0) return 0;

      const ledger = ensureSegmentDurationSources(segment);
      const sourcesToReturn = [];
      let remaining = requested;
      for (let index = ledger.length - 1; index >= 0 && remaining > 0; index -= 1) {
        const source = ledger[index];
        const sourceAmount = roundTimingSeconds(source.amount) ?? 0;
        if (sourceAmount <= 0) {
          ledger.splice(index, 1);
          continue;
        }
        const returned = Math.min(sourceAmount, remaining);
        const returnedSource = {
          ...source,
          amount: roundTimingSeconds(returned) ?? returned,
        };
        if (source.type === "segment") {
          returnedSource.sources = takeSplitDurationSourcesFromEnd(source.sources, returned);
        }
        sourcesToReturn.unshift(returnedSource);
        source.amount = roundTimingSeconds(sourceAmount - returned) ?? 0;
        if (source.amount <= 0) {
          ledger.splice(index, 1);
        }
        remaining = roundTimingSeconds(remaining - returned) ?? 0;
      }
      if (remaining > 0) {
        sourcesToReturn.unshift({
          type: "current",
          amount: roundTimingSeconds(remaining) ?? remaining,
        });
      }

      const returned = giveDurationToSourceRecords(sourcesToReturn, segment.id);
      const remainingDuration = Math.max(
        0,
        roundTimingSeconds(originalDuration - Math.min(requested, returned || requested)) ?? 0
      );
      segment.sources = normalizeSplitDurationSources(ledger, remainingDuration);
      return returned;
    };

    const takeDurationFromSegmentLedger = (segment, amount = null) => {
      if (!segment) return { taken: 0, sources: [] };
      const originalDuration = roundTimingSeconds(segment.duration) ?? 0;
      const requested = amount === null || amount === undefined
        ? originalDuration
        : (roundTimingSeconds(amount) ?? 0);
      if (requested <= 0) return { taken: 0, sources: [] };

      const ledger = ensureSegmentDurationSources(segment);
      const sources = [];
      let remaining = requested;
      for (let index = ledger.length - 1; index >= 0 && remaining > 0; index -= 1) {
        const source = ledger[index];
        const sourceAmount = roundTimingSeconds(source.amount) ?? 0;
        if (sourceAmount <= 0) {
          ledger.splice(index, 1);
          continue;
        }
        const taken = Math.min(sourceAmount, remaining);
        const takenSource = {
          ...source,
          amount: roundTimingSeconds(taken) ?? taken,
        };
        if (source.type === "segment") {
          takenSource.sources = takeSplitDurationSourcesFromEnd(source.sources, taken);
        }
        sources.unshift(takenSource);

        source.amount = roundTimingSeconds(sourceAmount - taken) ?? 0;
        if (source.amount <= 0) {
          ledger.splice(index, 1);
        }
        remaining = roundTimingSeconds(remaining - taken) ?? 0;
      }

      if (remaining > 0) {
        sources.unshift({
          type: "current",
          amount: roundTimingSeconds(remaining) ?? remaining,
        });
      }

      const taken = roundTimingSeconds(sumSplitDurationSources(sources)) ?? 0;
      const remainingDuration = Math.max(
        0,
        roundTimingSeconds(originalDuration - taken) ?? 0
      );
      segment.sources = normalizeSplitDurationSources(ledger, remainingDuration);
      return { taken, sources };
    };

    const getReturnedSourcesForTargetSegment = (sources, targetSegmentId, amount) => {
      const targetId = String(targetSegmentId || "").trim();
      const output = [];
      for (const source of normalizeSplitDurationSources(sources, amount)) {
        if (source.type === "segment" && source.segmentId === targetId) {
          output.push(...normalizeSplitDurationSources(source.sources, source.amount));
        } else {
          output.push(source);
        }
      }
      return normalizeSplitDurationSources(output, amount);
    };

    const giveDurationToTakeSource = (sourceValue, amount, sources = [], excludeId = "") => {
      const safeAmount = roundTimingSeconds(amount) ?? 0;
      if (safeAmount <= 0) return 0;

      const value = String(sourceValue || "current");
      if (value === "current") {
        const currentDuration = getSplitCurrentDuration();
        splitState.currentDuration = roundTimingSeconds(currentDuration + safeAmount);
        return safeAmount;
      }

      const targets = getTakeSourceSegments(value, excludeId);
      const target = targets[targets.length - 1] || null;
      if (!target) {
        const currentDuration = getSplitCurrentDuration();
        splitState.currentDuration = roundTimingSeconds(currentDuration + safeAmount);
        return safeAmount;
      }

      const duration = roundTimingSeconds(target.duration) ?? MIN_CHORD_DURATION_SECONDS;
      target.duration = roundTimingSeconds(duration + safeAmount) ?? duration;
      target.sources = normalizeSplitDurationSources(
        mergeSplitDurationSources(
          target.sources,
          getReturnedSourcesForTargetSegment(sources, target.id, safeAmount)
        ),
        target.duration
      );
      return safeAmount;
    };

    const setSegmentDurationFromSource = (segment, nextDuration, sourceValue) => {
      if (!segment) return false;
      ensureSegmentDurationSources(segment);
      const currentDuration = roundTimingSeconds(segment.duration) ?? MIN_CHORD_DURATION_SECONDS;
      const desired = Math.max(
        MIN_CHORD_DURATION_SECONDS,
        roundTimingSeconds(nextDuration) ?? currentDuration
      );
      const delta = roundTimingSeconds(desired - currentDuration) ?? 0;
      if (delta <= 0) {
        const returned = roundTimingSeconds(currentDuration - desired) ?? 0;
        if (returned > 0) {
          const returnResult = takeDurationFromSegmentLedger(segment, returned);
          giveDurationToTakeSource(sourceValue, returnResult.taken, returnResult.sources, segment.id);
        }
        segment.duration = desired;
        segment.sources = normalizeSplitDurationSources(segment.sources, desired);
        normalizeSplitStateForBudget();
        return true;
      }

      const takeResult = takeDurationFromSource(sourceValue, delta, segment.id);
      const taken = roundTimingSeconds(takeResult?.taken) ?? 0;
      if (taken <= 0) {
        return false;
      }
      segment.duration = roundTimingSeconds(currentDuration + taken) ?? currentDuration;
      segment.sources = normalizeSplitDurationSources(
        mergeSplitDurationSources(segment.sources, takeResult.sources),
        segment.duration
      );
      normalizeSplitStateForBudget();
      return taken >= delta - 0.0001;
    };

    const getTakeSourceOptions = (excludeId = "") => {
      const options = [
        { value: "current", label: `Current ${currentBaseName || currentName} (${formatTimingSeconds(getSplitCurrentDuration())})` },
      ];
      const beforeSegments = (splitState.before || []).filter((segment) => segment.id !== excludeId);
      const afterSegments = (splitState.after || []).filter((segment) => segment.id !== excludeId);

      if (beforeSegments.length > 0) {
        options.push({
          value: "before-all",
          label: `All Before (${formatTimingSeconds(sumSplitDurations(beforeSegments))})`,
        });
        beforeSegments.forEach((segment, index) => {
          options.push({
            value: `segment:${segment.id}`,
            label: `Before ${index + 1}: ${segment.chordName} (${formatTimingSeconds(segment.duration)})`,
          });
        });
      }
      if (afterSegments.length > 0) {
        options.push({
          value: "after-all",
          label: `All After (${formatTimingSeconds(sumSplitDurations(afterSegments))})`,
        });
        afterSegments.forEach((segment, index) => {
          options.push({
            value: `segment:${segment.id}`,
            label: `After ${index + 1}: ${segment.chordName} (${formatTimingSeconds(segment.duration)})`,
          });
        });
      }
      return options;
    };

    const populateTakeSourceSelect = (select, selectedValue = "current", excludeId = "") => {
      if (!select) return "current";
      const options = getTakeSourceOptions(excludeId);
      const previousValue = String(selectedValue || "current");
      select.innerHTML = "";
      options.forEach((option) => {
        const optionEl = document.createElement("option");
        optionEl.value = option.value;
        optionEl.textContent = option.label;
        optionEl.style.backgroundColor = "rgb(31, 41, 55)";
        optionEl.style.color = "#fff";
        select.appendChild(optionEl);
      });
      select.value = options.some((option) => option.value === previousValue)
        ? previousValue
        : "current";
      return select.value;
    };

    const buildSplitEntryFromState = () => {
      normalizeSplitStateForBudget();
      return {
        parentSourceIndex: currentSourceIndex,
        currentChordName: currentBaseName,
        currentDuration: getSplitCurrentDuration(),
        before: (splitState.before || []).map((segment) => ({
          id: segment.id,
          chordName: segment.chordName,
          duration: roundTimingSeconds(segment.duration) ?? MIN_CHORD_DURATION_SECONDS,
          side: "before",
          sources: normalizeSplitDurationSources(segment.sources, segment.duration),
        })),
        after: (splitState.after || []).map((segment) => ({
          id: segment.id,
          chordName: segment.chordName,
          duration: roundTimingSeconds(segment.duration) ?? MIN_CHORD_DURATION_SECONDS,
          side: "after",
          sources: normalizeSplitDurationSources(segment.sources, segment.duration),
        })),
      };
    };

    const hasSplitSegments = () =>
      (splitState.before && splitState.before.length > 0) ||
      (splitState.after && splitState.after.length > 0);

    const getSplitNeighborInfo = (chord) => {
      if (chord?.__splitAdded !== true) return null;
      const parentSourceIndex = Number.parseInt(chord.__splitParentSourceIndex, 10);
      const segmentId = String(chord.__splitSegmentId || "").trim();
      if (!Number.isInteger(parentSourceIndex) || parentSourceIndex < 0 || !segmentId) {
        return null;
      }
      return {
        parentSourceIndex,
        segmentId,
        side: String(chord.__splitSide || "").trim().toLowerCase(),
      };
    };

    const prevSplitNeighbor = getSplitNeighborInfo(prevDisplayChord);
    const nextSplitNeighbor = getSplitNeighborInfo(nextDisplayChord);
    const startBoundaryUsesCurrentSplit =
      canMoveStart &&
      (
        prevIsCurrentSplitSegment ||
        (
          prevSplitNeighbor &&
          prevSplitNeighbor.parentSourceIndex === currentSourceIndex
        )
      );
    const endBoundaryUsesCurrentSplit =
      canMoveEnd &&
      (
        nextIsCurrentSplitSegment ||
        (
          nextSplitNeighbor &&
          nextSplitNeighbor.parentSourceIndex === currentSourceIndex
        )
      );

    const cacheExternalSplitEntries = (bucket) => {
      const splits = bucket?.splits || {};
      [prevSplitNeighbor, nextSplitNeighbor].forEach((info) => {
        if (!info || info.parentSourceIndex === currentSourceIndex) return;
        const entry = normalizeSplitEntry(
          splits[String(info.parentSourceIndex)],
          info.parentSourceIndex
        );
        if (entry) {
          externalSplitEntries.set(String(info.parentSourceIndex), entry);
        }
      });
    };

    const getSplitBoundaryDurationUpdates = () => {
      const updates = [];
      const resolveCurrentBoundaryInfo = (side) => {
        const segments = side === "before" ? splitState.before : splitState.after;
        if (!Array.isArray(segments) || !segments.length) return null;
        const segment = side === "before" ? segments[segments.length - 1] : segments[0];
        const segmentId = String(segment?.id || "").trim();
        if (!segmentId) return null;
        return {
          parentSourceIndex: currentSourceIndex,
          segmentId,
          side,
        };
      };
      const resolvedPrevSplitNeighbor =
        prevSplitNeighbor ||
        (prevIsCurrentSplitSegment ? resolveCurrentBoundaryInfo("before") : null);
      const resolvedNextSplitNeighbor =
        nextSplitNeighbor ||
        (nextIsCurrentSplitSegment ? resolveCurrentBoundaryInfo("after") : null);

      if (canMoveStart && resolvedPrevSplitNeighbor && prevStartTime !== null) {
        const duration = roundTimingSeconds(state.startTime - prevStartTime);
        if (duration !== null) {
          updates.push({
            ...resolvedPrevSplitNeighbor,
            duration,
            boundary: "before",
          });
        }
      }
      if (canMoveEnd && resolvedNextSplitNeighbor && nextDisplayEndTime !== null) {
        const duration = roundTimingSeconds(nextDisplayEndTime - state.endTime);
        if (duration !== null) {
          updates.push({
            ...resolvedNextSplitNeighbor,
            duration,
            boundary: "after",
          });
        }
      }
      return updates;
    };

    const getSplitBoundaryBaseEntry = (parentSourceIndex, currentSplitEntry = null) => {
      if (parentSourceIndex === currentSourceIndex) {
        return currentSplitEntry || (hasSplitSegments() ? buildSplitEntryFromState() : null);
      }
      return deepClone(externalSplitEntries.get(String(parentSourceIndex)) || null);
    };

    const buildSplitBoundaryPreviewEntries = (durationUpdates = []) => {
      const preview = {};
      for (const update of durationUpdates) {
        const parentIndex = Number.parseInt(update?.parentSourceIndex, 10);
        if (!Number.isInteger(parentIndex) || parentIndex < 0) continue;
        const baseEntry =
          preview[String(parentIndex)] ||
          getSplitBoundaryBaseEntry(parentIndex);
        if (!baseEntry) continue;
        const result = setSplitEntrySegmentDuration(
          baseEntry,
          update.segmentId,
          update.duration
        );
        if (result.entry) {
          preview[String(parentIndex)] = result.entry;
        }
      }
      return preview;
    };

    const resolveSplitOptions = () => {
      let options = splitOptionsState.includeAllModes && splitOptionsState.allModesLoaded
        ? splitOptionsState.allModesOptions
        : currentSongOptions;
      if (splitOptionsState.includeFullLibrary && splitOptionsState.fullLibraryLoaded) {
        options = mergeChordLists(options, splitOptionsState.fullLibraryOptions);
      }
      return options;
    };

    const setSplitDropdownOpen = (open) => {
      splitDropdownOpen = open === true;
      splitDropdown.style.display = splitDropdownOpen ? "flex" : "none";
    };

    const selectSplitChordOption = (option) => {
      splitChordInput.value = String(option || "").trim();
      setSplitDropdownOpen(false);
    };

    const refreshSplitDatalist = () => {
      const queryRaw = String(splitChordInput.value || "").trim();
      const query = queryRaw.toLowerCase();
      const queryRoot = getChordSearchRoot(queryRaw);
      const queryLetter = getChordSearchLetter(queryRaw);
      const seen = new Set();
      const options = [];
      if (queryRaw) {
        seen.add(query);
        options.push(queryRaw);
      }
      const isMatch = (option) => {
        if (!query) return true;
        const lower = option.toLowerCase();
        if (lower.includes(query) || query.includes(lower)) return true;
        if (!splitOptionsState.includeLetterMatches) return false;
        const root = getChordSearchRoot(option);
        if (root && queryRoot && root === queryRoot) return true;
        const letter = getChordSearchLetter(option);
        return Boolean(letter && queryLetter && letter === queryLetter);
      };
      for (const optionRaw of resolveSplitOptions()) {
        const option = String(optionRaw || "").trim();
        if (!option || !isMatch(option)) continue;
        const key = option.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        options.push(option);
        if (options.length >= 80) break;
      }
      splitDropdown.innerHTML = "";
      const visibleOptions = options.slice(0, 40);
      if (!visibleOptions.length) {
        const empty = document.createElement("div");
        empty.textContent = "No matching chords";
        empty.style.cssText = `
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 7px;
          background: rgba(255, 255, 255, 0.045);
          color: rgba(255, 255, 255, 0.58);
          font-size: 11px;
          font-weight: 800;
          padding: 7px 9px;
        `;
        splitDropdown.appendChild(empty);
      } else {
        for (const option of visibleOptions) {
          const optionButton = document.createElement("button");
          optionButton.type = "button";
          optionButton.textContent = option;
          optionButton.style.cssText = `
            width: 100%;
            min-height: 29px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 7px;
            background: rgba(255, 255, 255, 0.075);
            color: rgba(255, 255, 255, 0.94);
            font-size: 12px;
            font-weight: 900;
            text-align: left;
            padding: 6px 9px;
            cursor: pointer;
          `;
          optionButton.addEventListener("mouseenter", () => {
            optionButton.style.borderColor = "rgba(56, 189, 248, 0.68)";
            optionButton.style.background = "rgba(56, 189, 248, 0.18)";
          });
          optionButton.addEventListener("mouseleave", () => {
            optionButton.style.borderColor = "rgba(255, 255, 255, 0.15)";
            optionButton.style.background = "rgba(255, 255, 255, 0.075)";
          });
          optionButton.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
          });
          optionButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            selectSplitChordOption(option);
          });
          splitDropdown.appendChild(optionButton);
        }
      }
      splitDropdown.style.display = splitDropdownOpen ? "flex" : "none";
    };

    const refreshSplitStatus = () => {
      if (splitOptionsState.allModesLoading) {
        splitStatus.style.display = "block";
        splitStatus.textContent = "Loading chords from all modes...";
        return;
      }
      if (splitOptionsState.fullLibraryLoading) {
        splitStatus.style.display = "block";
        splitStatus.textContent = "Loading full chord library...";
        return;
      }
      splitStatus.style.display = "none";
      splitStatus.textContent = "";
    };

    const loadAllModesForSplit = async () => {
      if (splitOptionsState.allModesLoaded || splitOptionsState.allModesLoading) return;
      splitOptionsState.allModesLoading = true;
      refreshSplitStatus();
      try {
        splitOptionsState.allModesOptions = await getSongChordListAcrossModes({
          videoId,
          fallbackSongChords: sourceList,
        });
        splitOptionsState.allModesLoaded = true;
      } catch (error) {
        log("Failed loading split all-mode options:", error);
        splitOptionsState.allModesOptions = currentSongOptions.slice();
      } finally {
        splitOptionsState.allModesLoading = false;
        refreshSplitStatus();
        refreshSplitDatalist();
      }
    };

    const loadFullLibraryForSplit = async () => {
      if (splitOptionsState.fullLibraryLoaded || splitOptionsState.fullLibraryLoading) return;
      splitOptionsState.fullLibraryLoading = true;
      refreshSplitStatus();
      try {
        splitOptionsState.fullLibraryOptions = await loadFullChordLibraryNames();
        splitOptionsState.fullLibraryLoaded = true;
      } catch (error) {
        log("Failed loading split full-library options:", error);
        splitOptionsState.fullLibraryOptions = [];
      } finally {
        splitOptionsState.fullLibraryLoading = false;
        refreshSplitStatus();
        refreshSplitDatalist();
      }
    };

    const addCornerMarkers = (host, side) => {
      if (!host) return;
      host.querySelectorAll?.(".yc-split-corner")?.forEach((entry) => entry.remove());
      const color = side === "before" ? "#f97316" : "#22c55e";
      const positions = [
        ["top", "left"],
        ["top", "right"],
        ["bottom", "left"],
        ["bottom", "right"],
      ];
      positions.forEach(([vertical, horizontal]) => {
        const corner = document.createElement("span");
        corner.className = "yc-split-corner";
        corner.style.cssText = `
          position: absolute;
          ${vertical}: -3px;
          ${horizontal}: -3px;
          width: 23px;
          height: 23px;
          border-${vertical === "top" ? "top" : "bottom"}: 6px solid ${color};
          border-${horizontal === "left" ? "left" : "right"}: 6px solid ${color};
          border-radius: ${vertical === "top" && horizontal === "left" ? "7px 0 0 0" :
            vertical === "top" && horizontal === "right" ? "0 7px 0 0" :
              vertical === "bottom" && horizontal === "left" ? "0 0 0 7px" : "0 0 7px 0"};
          pointer-events: none;
          box-sizing: border-box;
          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55));
          z-index: 5;
        `;
        host.appendChild(corner);
      });
    };

    const getSplitSideList = (side) =>
      side === "before" ? (splitState.before || []) : (splitState.after || []);

    const getSplitDropPlacement = (segmentId, targetSide, targetId, event, targetCard) => {
      const sourceId = String(segmentId || "");
      const destinationId = String(targetId || "");
      const destinationSide = SPLIT_SIDE_VALUES.has(targetSide) ? targetSide : "after";
      const sourceSegment = getSplitSegmentById(sourceId);
      if (sourceSegment && sourceSegment.side === destinationSide) {
        const list = getSplitSideList(destinationSide);
        const sourceIndex = list.findIndex((entry) => entry.id === sourceId);
        const targetIndex = list.findIndex((entry) => entry.id === destinationId);
        if (sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex) {
          return sourceIndex < targetIndex ? "after" : "before";
        }
      }
      const rect = targetCard?.getBoundingClientRect?.();
      return rect && event?.clientY > rect.top + (rect.height / 2) ? "after" : "before";
    };

    const createSplitCard = (segment, side) => {
      const card = document.createElement("div");
      card.draggable = false;
      card.setAttribute("data-split-id", segment.id);
      card.setAttribute("data-split-side", side);
      card.style.cssText = `
        position: relative;
        border: 1px solid rgba(56, 189, 248, 0.9);
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.78);
        padding: 7px 7px 6px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(86px, 120px);
        gap: 4px 7px;
        align-items: center;
      `;
      addCornerMarkers(card, side);
      segment.takeSource = segment.takeSource || "current";

      const name = document.createElement("div");
      const sideLabel = side === "before" ? "+ Before" : "+ After";
      name.textContent = `${sideLabel} ${segment.chordName}`;
      name.draggable = true;
      name.title = "Drag to reorder";
      name.style.cssText = `
        color: rgba(255, 255, 255, 0.94);
        font-size: 12px;
        font-weight: 900;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: grab;
      `;
      name.style.gridColumn = "1 / 3";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "X";
      remove.title = "Remove split chord";
      remove.style.cssText = `
        width: 19px;
        height: 19px;
        border: 1px solid rgba(248, 113, 113, 0.55);
        border-radius: 5px;
        background: rgba(239, 68, 68, 0.16);
        color: #fff;
        font-size: 10px;
        font-weight: 900;
        cursor: pointer;
        padding: 0;
      `;
      remove.style.gridColumn = "3 / 4";
      remove.style.justifySelf = "end";
      const duration = document.createElement("input");
      duration.type = "range";
      duration.setAttribute("data-yc-split-duration-range", segment.id);
      duration.step = String(TIMING_STEP_SECONDS);
      duration.min = String(MIN_CHORD_DURATION_SECONDS);
      const max = Math.max(
        MIN_CHORD_DURATION_SECONDS,
        (roundTimingSeconds(segment.duration) ?? MIN_CHORD_DURATION_SECONDS) +
          getAvailableFromTakeSource(segment.takeSource || "current", segment.id)
      );
      duration.max = String(roundTimingSeconds(max) ?? MIN_CHORD_DURATION_SECONDS);
      duration.value = String(roundTimingSeconds(segment.duration) ?? MIN_CHORD_DURATION_SECONDS);
      duration.style.cssText = `
        grid-column: 1 / 2;
        width: 100%;
        margin: 0;
        accent-color: ${side === "before" ? "#f97316" : "#22c55e"};
        cursor: pointer;
      `;
      const value = document.createElement("div");
      value.setAttribute("data-yc-split-duration-value", segment.id);
      value.textContent = formatTimingSeconds(segment.duration);
      value.style.cssText = `
        grid-column: 2 / 3;
        color: rgba(255, 255, 255, 0.66);
        font-size: 10px;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
      `;
      const sourceSelect = document.createElement("select");
      sourceSelect.setAttribute("data-yc-split-source-select", segment.id);
      sourceSelect.style.cssText = `
        grid-column: 3 / 4;
        min-width: 0;
        width: 100%;
        height: 22px;
        border-radius: 5px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
        font-size: 10px;
        font-weight: 800;
        outline: none;
        padding: 0 5px;
        cursor: pointer;
      `;
      segment.takeSource = populateTakeSourceSelect(sourceSelect, segment.takeSource || "current", segment.id);

      remove.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        returnDurationFromSegmentLedger(segment);
        splitState.before = splitState.before.filter((entry) => entry.id !== segment.id);
        splitState.after = splitState.after.filter((entry) => entry.id !== segment.id);
        renderSplitEditor();
        render();
        emitLivePreview();
      });
      sourceSelect.addEventListener("change", (event) => {
        event.preventDefault();
        event.stopPropagation();
        segment.takeSource = sourceSelect.value || "current";
        refreshSplitEditorLiveValues();
      });
      duration.addEventListener("input", () => {
        setSegmentDurationFromSource(segment, duration.value, segment.takeSource || "current");
        const actualDuration = roundTimingSeconds(segment.duration) ?? MIN_CHORD_DURATION_SECONDS;
        duration.value = String(actualDuration);
        value.textContent = formatTimingSeconds(segment.duration);
        refreshSplitEditorLiveValues();
        render({ refreshSplitEditor: false });
        emitLivePreview();
      });
      duration.addEventListener("change", () => {
        renderSplitEditor();
      });
      const preventSliderDragConflict = (event) => {
        event.stopPropagation();
      };
      duration.addEventListener("pointerdown", preventSliderDragConflict);
      duration.addEventListener("mousedown", preventSliderDragConflict);
      duration.addEventListener("touchstart", preventSliderDragConflict, { passive: true });
      duration.addEventListener("dragstart", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      name.addEventListener("dragstart", (event) => {
        draggedSplitSegmentId = segment.id;
        event.dataTransfer?.setData("text/plain", segment.id);
        event.dataTransfer?.setData("application/x-youchords-split-side", side);
        card.style.opacity = "0.6";
      });
      name.addEventListener("dragend", () => {
        draggedSplitSegmentId = "";
        card.style.opacity = "1";
      });
      card.addEventListener("dragover", (event) => {
        event.preventDefault();
        const activeDragId = draggedSplitSegmentId || event.dataTransfer?.getData("text/plain") || "";
        const placement = getSplitDropPlacement(activeDragId, side, segment.id, event, card);
        const placeAfter = placement === "after";
        card.style.outline = `2px solid ${side === "before" ? "#f97316" : "#22c55e"}`;
        card.style.outlineOffset = "2px";
        card.style.boxShadow = placeAfter
          ? `inset 0 -4px 0 ${side === "before" ? "#f97316" : "#22c55e"}`
          : `inset 0 4px 0 ${side === "before" ? "#f97316" : "#22c55e"}`;
      });
      card.addEventListener("dragleave", () => {
        card.style.outline = "none";
        card.style.boxShadow = "";
      });
      card.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        card.style.outline = "none";
        card.style.boxShadow = "";
        const segmentId = event.dataTransfer?.getData("text/plain") || draggedSplitSegmentId || "";
        if (segmentId && segmentId !== segment.id) {
          const placement = getSplitDropPlacement(segmentId, side, segment.id, event, card);
          moveSegmentToSide(segmentId, side, segment.id, placement);
        }
        draggedSplitSegmentId = "";
      });

      card.appendChild(name);
      card.appendChild(remove);
      card.appendChild(duration);
      card.appendChild(value);
      card.appendChild(sourceSelect);
      return card;
    };

    function getSplitCardById(segmentId) {
      const id = String(segmentId || "");
      if (!id) return null;
      const cards = splitLanes.querySelectorAll?.("[data-split-id]") || [];
      for (const card of cards) {
        if (card.getAttribute("data-split-id") === id) return card;
      }
      return null;
    }

    function refreshSplitEditorLiveValues() {
      const total = getParentSplitDuration();
      const currentDuration = getSplitCurrentDuration();
      splitBudget.textContent = `${formatTimingSeconds(currentDuration)} / ${formatTimingSeconds(total)} current`;
      const currentValue = splitLanes.querySelector?.("[data-yc-current-duration-value]");
      const currentRange = splitLanes.querySelector?.("[data-yc-current-duration-range]");
      if (currentValue) {
        currentValue.textContent = formatTimingSeconds(currentDuration);
      }
      if (currentRange) {
        currentRange.max = String(total);
        currentRange.value = String(currentDuration);
      }

      getSplitSegments().forEach((segment) => {
        const card = getSplitCardById(segment.id);
        if (!card) return;
        const segmentDuration = roundTimingSeconds(segment.duration) ?? MIN_CHORD_DURATION_SECONDS;
        const range = card.querySelector?.(`[data-yc-split-duration-range="${segment.id}"]`);
        const value = card.querySelector?.(`[data-yc-split-duration-value="${segment.id}"]`);
        const sourceSelect = card.querySelector?.(`[data-yc-split-source-select="${segment.id}"]`);
        if (sourceSelect) {
          segment.takeSource = populateTakeSourceSelect(sourceSelect, segment.takeSource || "current", segment.id);
        }
        if (range) {
          const max = Math.max(
            MIN_CHORD_DURATION_SECONDS,
            segmentDuration + getAvailableFromTakeSource(segment.takeSource || "current", segment.id)
          );
          range.max = String(roundTimingSeconds(max) ?? MIN_CHORD_DURATION_SECONDS);
          range.value = String(segmentDuration);
        }
        if (value) {
          value.textContent = formatTimingSeconds(segmentDuration);
        }
      });
    }

    const moveSegmentToSide = (segmentId, targetSide, targetId = "", placement = "end") => {
      const segment = getSplitSegmentById(segmentId);
      if (!segment || !SPLIT_SIDE_VALUES.has(targetSide)) return;
      const nextBefore = (splitState.before || []).filter((entry) => entry.id !== segmentId);
      const nextAfter = (splitState.after || []).filter((entry) => entry.id !== segmentId);
      const movedSegment = {
        ...segment,
        side: targetSide,
      };
      const target = targetSide === "before" ? nextBefore : nextAfter;
      const targetIndex = targetId
        ? target.findIndex((entry) => entry.id === targetId)
        : -1;
      if (targetIndex >= 0) {
        const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
        target.splice(insertIndex, 0, movedSegment);
      } else {
        target.push(movedSegment);
      }
      const originalNeighborConflict = getOriginalNeighborConflict(nextBefore, nextAfter, targetSide);
      if (originalNeighborConflict) {
        showOriginalNeighborConflict(originalNeighborConflict);
        return;
      }
      splitState.before = nextBefore;
      splitState.after = nextAfter;
      renderSplitEditor();
      render();
      emitLivePreview();
    };

    const createSplitLane = (labelText, side, segments) => {
      const lane = document.createElement("div");
      lane.style.cssText = `
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.035);
        padding: 5px;
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-height: 36px;
      `;
      const label = document.createElement("div");
      label.textContent = labelText;
      label.style.cssText = `
        color: rgba(255, 255, 255, 0.56);
        font-size: 9px;
        font-weight: 900;
        text-transform: uppercase;
      `;
      lane.appendChild(label);
      if (!segments.length) {
        const empty = document.createElement("div");
        empty.textContent = "Drop or add chords here";
        empty.style.cssText = `
          color: rgba(255, 255, 255, 0.34);
          font-size: 10px;
          font-weight: 700;
          padding: 3px 0;
        `;
        lane.appendChild(empty);
      } else {
        segments.forEach((segment) => lane.appendChild(createSplitCard(segment, side)));
      }
      lane.addEventListener("dragover", (event) => {
        event.preventDefault();
        lane.style.borderColor = side === "before" ? "rgba(249, 115, 22, 0.85)" : "rgba(34, 197, 94, 0.85)";
      });
      lane.addEventListener("dragleave", () => {
        lane.style.borderColor = "rgba(255, 255, 255, 0.1)";
      });
      lane.addEventListener("drop", (event) => {
        event.preventDefault();
        lane.style.borderColor = "rgba(255, 255, 255, 0.1)";
        const segmentId = event.dataTransfer?.getData("text/plain") || draggedSplitSegmentId || "";
        if (segmentId) moveSegmentToSide(segmentId, side);
        draggedSplitSegmentId = "";
      });
      return lane;
    };

    function renderSplitEditor() {
      normalizeSplitStateForBudget();
      const total = getParentSplitDuration();
      const currentDuration = getSplitCurrentDuration();
      splitBudget.textContent = `${formatTimingSeconds(currentDuration)} / ${formatTimingSeconds(total)} current`;
      splitLanes.innerHTML = "";
      splitLanes.appendChild(createSplitLane("Before", "before", splitState.before || []));

      const currentCard = document.createElement("div");
      currentCard.style.cssText = `
        position: relative;
        border: 1px solid rgba(56, 189, 248, 0.9);
        border-radius: 8px;
        background: rgba(2, 132, 199, 0.16);
        padding: 7px;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 6px 8px;
        align-items: center;
      `;
      const currentLabel = document.createElement("span");
      currentLabel.textContent = `Current ${currentBaseName || currentName}`;
      currentLabel.style.cssText = "font-size:11px;font-weight:900;color:rgba(255,255,255,0.92);";
      const currentValue = document.createElement("span");
      currentValue.setAttribute("data-yc-current-duration-value", "true");
      currentValue.textContent = formatTimingSeconds(currentDuration);
      currentValue.style.cssText = "font-size:10px;font-weight:900;color:rgba(255,255,255,0.68);font-variant-numeric:tabular-nums;";
      const currentRange = document.createElement("input");
      currentRange.type = "range";
      currentRange.disabled = true;
      currentRange.min = String(MIN_CHORD_DURATION_SECONDS);
      currentRange.max = String(total);
      currentRange.step = String(TIMING_STEP_SECONDS);
      currentRange.value = String(currentDuration);
      currentRange.setAttribute("data-yc-current-duration-range", "true");
      currentRange.style.cssText = `
        grid-column: 1 / 3;
        width: 100%;
        margin: 0;
        accent-color: #2196f3;
        opacity: 1;
        pointer-events: none;
      `;
      currentCard.appendChild(currentLabel);
      currentCard.appendChild(currentValue);
      currentCard.appendChild(currentRange);
      splitLanes.appendChild(currentCard);
      splitLanes.appendChild(createSplitLane("After", "after", splitState.after || []));
    }

    const getOriginalNeighborConflictAfterAdd = (side, chordName) => {
      const probe = {
        id: "__probe__",
        chordName,
        side,
        duration: MIN_CHORD_DURATION_SECONDS,
      };
      const before = side === "before"
        ? [...(splitState.before || []), probe]
        : [...(splitState.before || [])];
      const after = side === "after"
        ? [...(splitState.after || []), probe]
        : [...(splitState.after || [])];
      return getOriginalNeighborConflict(before, after, side);
    };

    const addSplitSegment = (side) => {
      const chordName = String(splitChordInput.value || "").trim();
      if (!chordName) {
        window.ycUtils?.showToast?.("Choose a chord to add", "!", 1800);
        return;
      }
      normalizeSplitStateForBudget();
      const wouldTouchCurrent =
        side === "before" ||
        (side === "after" && !(splitState.after || []).length);
      if (wouldTouchCurrent && areChordNamesEqual(chordName, currentBaseName || currentName)) {
        window.ycUtils?.showToast?.(
          "This chord is already next to Current, so it cannot be added beside itself.",
          "!",
          3200
        );
        splitChordInput.value = "";
        return;
      }
      const originalNeighborConflict = getOriginalNeighborConflictAfterAdd(side, chordName);
      if (originalNeighborConflict) {
        showOriginalNeighborConflict(originalNeighborConflict);
        return;
      }
      const takeSource = "current";
      const available = getAvailableFromTakeSource(takeSource);
      if (available < MIN_CHORD_DURATION_SECONDS) {
        window.ycUtils?.showToast?.("No time left in current chord", "!", 2200);
        return;
      }
      const durationToAdd = Math.min(1, roundTimingSeconds(available) ?? available);
      const takeResult = takeDurationFromSource(takeSource, durationToAdd);
      const taken = roundTimingSeconds(takeResult?.taken) ?? 0;
      if (taken < MIN_CHORD_DURATION_SECONDS) {
        window.ycUtils?.showToast?.("No time left in current chord", "!", 2200);
        return;
      }
      const segment = {
        id: makeSplitSegmentId(),
        chordName,
        side,
        duration: roundTimingSeconds(taken) ?? taken,
        takeSource: "current",
        sources: normalizeSplitDurationSources(takeResult.sources, taken),
      };
      if (side === "before") {
        splitState.before.push(segment);
      } else {
        splitState.after.push(segment);
      }
      mergeAdjacentSplitState();
      splitChordInput.value = "";
      setSplitDropdownOpen(false);
      renderSplitEditor();
      render();
      refreshSplitDatalist();
      emitLivePreview();
    };

    addBeforeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      addSplitSegment("before");
    });
    addAfterButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      addSplitSegment("after");
    });
    splitChordInput.addEventListener("focus", () => {
      setSplitDropdownOpen(true);
      refreshSplitDatalist();
    });
    splitChordInput.addEventListener("input", () => {
      setSplitDropdownOpen(true);
      refreshSplitDatalist();
    });
    splitChordInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setSplitDropdownOpen(false);
      }
    });
    panel.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (
        target === splitChordInput ||
        splitDropdown.contains(target) ||
        splitToggles.contains(target)
      ) {
        return;
      }
      setSplitDropdownOpen(false);
    });
    splitLetterToggle.checkbox.addEventListener("change", () => {
      splitOptionsState.includeLetterMatches = splitLetterToggle.checkbox.checked === true;
      localStorage.setItem(UI_INCLUDE_LETTER_MATCH_KEY, String(splitOptionsState.includeLetterMatches));
      setSplitDropdownOpen(true);
      refreshSplitDatalist();
    });
    splitAllModesToggle.checkbox.addEventListener("change", () => {
      splitOptionsState.includeAllModes = splitAllModesToggle.checkbox.checked === true;
      if (splitOptionsState.includeAllModes) {
        loadAllModesForSplit();
      }
      setSplitDropdownOpen(true);
      refreshSplitDatalist();
    });
    splitFullLibraryToggle.checkbox.addEventListener("change", () => {
      splitOptionsState.includeFullLibrary = splitFullLibraryToggle.checkbox.checked === true;
      if (splitOptionsState.includeFullLibrary) {
        loadFullLibraryForSplit();
      }
      setSplitDropdownOpen(true);
      refreshSplitDatalist();
    });
    refreshSplitDatalist();

    const createMiniCard = ({ label, name, start, duration, isCurrent, disabled, splitSide = "" }) => {
      const hasSplitCorner = splitSide === "before" || splitSide === "after";
      const card = document.createElement("div");
      card.style.cssText = `
        position: relative;
        flex: 1 1 74px;
        min-width: 74px;
        max-width: 124px;
        min-height: 64px;
        border: ${hasSplitCorner ? "2px" : "1px"} solid ${isCurrent || hasSplitCorner ? "#2196f3" : "rgba(255, 255, 255, 0.22)"};
        border-radius: 7px;
        background: ${isCurrent ? "rgba(33, 150, 243, 0.14)" : "rgba(255, 255, 255, 0.06)"};
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        opacity: ${disabled ? "0.45" : "1"};
        padding: 8px 4px 6px;
      `;
      if (hasSplitCorner) {
        addCornerMarkers(card, splitSide);
      }
      const beatGrid = document.createElement("div");
      beatGrid.style.cssText = `
        display: grid;
        gap: 2px;
        background: #e0e0e0;
        padding: 3px;
        border-radius: 3px;
        margin-bottom: 2px;
        pointer-events: none;
      `;
      renderBeatGrid(beatGrid, duration, isCurrent);

      const labelEl = document.createElement("div");
      labelEl.textContent = label;
      labelEl.style.cssText = `
        font-size: 9px;
        font-weight: 800;
        color: rgba(255, 255, 255, 0.54);
        line-height: 1;
      `;
      const nameEl = document.createElement("div");
      nameEl.textContent = name || "-";
      nameEl.style.cssText = `
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: rgba(255, 255, 255, 0.94);
        font-size: 14px;
        font-weight: 800;
        line-height: 1;
      `;
      const timeEl = document.createElement("div");
      timeEl.textContent = disabled ? "--" : formatTimingClock(start);
      timeEl.style.cssText = `
        font-variant-numeric: tabular-nums;
        color: rgba(255, 255, 255, 0.68);
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
      `;
      const durationEl = document.createElement("div");
      durationEl.textContent = disabled ? "" : formatTimingSeconds(duration);
      durationEl.style.cssText = `
        color: rgba(255, 255, 255, 0.52);
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
      `;

      card.appendChild(beatGrid);
      card.appendChild(labelEl);
      card.appendChild(nameEl);
      card.appendChild(timeEl);
      card.appendChild(durationEl);
      return card;
    };

    const getNeighborMiniCardMeta = (defaultLabel, chord) => {
      const info = getSplitNeighborInfo(chord);
      if (!info) return { label: defaultLabel, splitSide: "" };
      const splitSide = info.side === "before" || info.side === "after" ? info.side : "";
      const label = splitSide === "before"
        ? "+ Before"
        : splitSide === "after"
          ? "+ After"
          : "+ Split";
      return { label, splitSide };
    };

    const previewTimingMap = () => {
      const map = {};
      if (canMoveStart && !startBoundaryUsesCurrentSplit) {
        map[String(currentSourceIndex)] = state.startTime;
      }
      if (canMoveEnd && !endBoundaryUsesCurrentSplit) map[String(nextSourceIndex)] = state.endTime;
      return map;
    };

    const previewRoleMap = () => {
      const map = {};
      if (canMoveStart && !startBoundaryUsesCurrentSplit) map[String(prevSourceIndex)] = "before";
      map[String(currentSourceIndex)] = "current";
      if (canMoveEnd && !endBoundaryUsesCurrentSplit) map[String(nextSourceIndex)] = "after";
      return map;
    };

    const buildBoundaryDetail = ({ fromName, toName, fallbackName }) => {
      const from = String(fromName || "").trim();
      const to = String(toName || "").trim();
      const fallback = String(fallbackName || "").trim();
      return from && to
        ? `${from} -> ${to}`
        : (fallback || from || to || "");
    };

    const emitLivePreview = () => {
      const currentlyHasSplitSegments = hasSplitSegments();
      const splitDurationUpdates = getSplitBoundaryDurationUpdates();
      const splitBoundaryPreview = buildSplitBoundaryPreviewEntries(splitDurationUpdates);
      splitPreviewTouched =
        splitPreviewTouched ||
        currentlyHasSplitSegments ||
        initialSplitHadEntries ||
        Object.keys(splitBoundaryPreview).length > 0;
      const splitPreview = {
        ...(currentlyHasSplitSegments
          ? { [String(currentSourceIndex)]: buildSplitEntryFromState() }
          : {}),
        ...splitBoundaryPreview,
      };
      setTimingPreviewState({
        active: true,
        videoId,
        mode: safeMode,
        timingBySourceIndex: previewTimingMap(),
        roleBySourceIndex: previewRoleMap(),
        splitByParentSourceIndex: splitPreview,
        deletedSplitParentSourceIndices:
          !currentlyHasSplitSegments && splitPreviewTouched ? [currentSourceIndex] : [],
        splitPreviewTouched,
      });
    };

    const updateSliderRanges = () => {
      const startDetail = buildBoundaryDetail({
        fromName: prevName,
        toName: currentName,
        fallbackName: currentName,
      });
      const endDetail = buildBoundaryDetail({
        fromName: currentName,
        toName: nextName,
        fallbackName: currentName,
      });
      startRow.labelTitle.textContent = "Start";
      startRow.labelDetail.textContent = startDetail;
      startRow.label.title = startDetail ? `Start ${startDetail}` : "Start";
      endRow.labelTitle.textContent = "End";
      endRow.labelDetail.textContent = endDetail;
      endRow.label.title = endDetail ? `End ${endDetail}` : "End";

      const startRightBound = canMoveEnd
        ? state.endTime - MIN_CHORD_DURATION_SECONDS
        : openEndedStartMax;
      const startMin = canMoveStart
        ? (prevStartTime + MIN_CHORD_DURATION_SECONDS)
        : state.startTime;
      const startMax = canMoveStart
        ? startRightBound
        : state.startTime;
      startRow.slider.min = String(roundTimingSeconds(startMin) ?? 0);
      startRow.slider.max = String(Math.max(startMin, roundTimingSeconds(startMax) ?? startMin));
      startRow.slider.value = String(state.startTime);
      startRow.slider.disabled = !canMoveStart || startMax < startMin;
      startRow.value.textContent = formatTimingClock(state.startTime);
      startRow.row.style.opacity = startRow.slider.disabled ? "0.45" : "1";

      const endMin = state.startTime + MIN_CHORD_DURATION_SECONDS;
      const endMax = canMoveEnd
        ? (afterNextStartTime !== null
          ? afterNextStartTime - MIN_CHORD_DURATION_SECONDS
          : Math.max(openEndedEndMax, endMin))
        : state.endTime;
      endRow.slider.min = String(roundTimingSeconds(endMin) ?? 0);
      endRow.slider.max = String(Math.max(endMin, roundTimingSeconds(endMax) ?? endMin));
      endRow.slider.value = String(state.endTime);
      endRow.slider.disabled = !canMoveEnd || endMax < endMin;
      endRow.value.textContent = canMoveEnd ? formatTimingClock(state.endTime) : "--";
      endRow.row.style.opacity = endRow.slider.disabled ? "0.45" : "1";

      if (!canMoveStart && !canMoveEnd) {
        disabledHint.textContent = "No neighbor boundary to adjust";
      } else if (!canMoveStart) {
        disabledHint.textContent = "First chord: end only";
      } else if (!canMoveEnd) {
        disabledHint.textContent = "Last chord: start only";
      } else {
        disabledHint.textContent = "";
      }
    };

    const render = ({ refreshSplitEditor = true } = {}) => {
      cardsRow.innerHTML = "";
      const showPrevNeighborCard = !(hasSplitSegments() && startBoundaryUsesCurrentSplit);
      const showNextNeighborCard = !(hasSplitSegments() && endBoundaryUsesCurrentSplit);
      const prevCardMeta = getNeighborMiniCardMeta("Before", prevDisplayChord);
      const nextCardMeta = getNeighborMiniCardMeta("After", nextDisplayChord);
      const prevDuration = canMoveStart
        ? Math.max(0, state.startTime - prevStartTime)
        : 0;
      const currentDuration = canMoveEnd
        ? Math.max(0, state.endTime - state.startTime)
        : 3;
      const nextDuration = canMoveEnd
        ? Math.max(0, (afterNextStartTime ?? (state.endTime + 3)) - state.endTime)
        : 0;

      if (hasSplitSegments()) {
        if (showPrevNeighborCard) {
          cardsRow.appendChild(createMiniCard({
            label: prevCardMeta.label,
            name: prevName,
            start: prevStartTime,
            duration: prevDuration,
            isCurrent: false,
            disabled: !canMoveStart,
            splitSide: prevCardMeta.splitSide,
          }));
        }

        let cursor =
          startBoundaryUsesCurrentSplit && splitGroupStartTime !== null
            ? splitGroupStartTime
            : state.startTime;
        (splitState.before || []).forEach((segment) => {
          const duration = roundTimingSeconds(segment.duration) ?? MIN_CHORD_DURATION_SECONDS;
          cardsRow.appendChild(createMiniCard({
            label: "+ Before",
            name: segment.chordName,
            start: cursor,
            duration,
            isCurrent: false,
            disabled: false,
            splitSide: "before",
          }));
          cursor = roundTimingSeconds(cursor + duration) ?? cursor;
        });

        const splitCurrentDuration = getSplitCurrentDuration();
        cardsRow.appendChild(createMiniCard({
          label: "Current",
          name: currentName,
          start: cursor,
          duration: splitCurrentDuration,
          isCurrent: true,
          disabled: false,
        }));
        cursor = roundTimingSeconds(cursor + splitCurrentDuration) ?? cursor;

        (splitState.after || []).forEach((segment) => {
          const duration = roundTimingSeconds(segment.duration) ?? MIN_CHORD_DURATION_SECONDS;
          cardsRow.appendChild(createMiniCard({
            label: "+ After",
            name: segment.chordName,
            start: cursor,
            duration,
            isCurrent: false,
            disabled: false,
            splitSide: "after",
          }));
          cursor = roundTimingSeconds(cursor + duration) ?? cursor;
        });

        if (showNextNeighborCard) {
          cardsRow.appendChild(createMiniCard({
            label: nextCardMeta.label,
            name: nextName,
            start: state.endTime,
            duration: nextDuration,
            isCurrent: false,
            disabled: !canMoveEnd,
            splitSide: nextCardMeta.splitSide,
          }));
        }
      } else {
        cardsRow.appendChild(createMiniCard({
          label: prevCardMeta.label,
          name: prevName,
          start: prevStartTime,
          duration: prevDuration,
          isCurrent: false,
          disabled: !canMoveStart,
          splitSide: prevCardMeta.splitSide,
        }));
        cardsRow.appendChild(createMiniCard({
          label: "Current",
          name: currentName,
          start: state.startTime,
          duration: currentDuration,
          isCurrent: true,
          disabled: false,
        }));
        cardsRow.appendChild(createMiniCard({
          label: nextCardMeta.label,
          name: nextName,
          start: state.endTime,
          duration: nextDuration,
          isCurrent: false,
          disabled: !canMoveEnd,
          splitSide: nextCardMeta.splitSide,
        }));
      }
      updateSliderRanges();
      if (refreshSplitEditor) {
        renderSplitEditor();
      }
    };

    const clampStartFromInput = (value) => {
      if (!canMoveStart) return;
      const min = prevStartTime + MIN_CHORD_DURATION_SECONDS;
      const max = (canMoveEnd ? state.endTime : openEndedStartMax) - MIN_CHORD_DURATION_SECONDS;
      state.startTime = clampTimingValue(value, min, Math.max(min, max));
    };
    const clampEndFromInput = (value) => {
      if (!canMoveEnd) return;
      const min = state.startTime + MIN_CHORD_DURATION_SECONDS;
      const max = afterNextStartTime !== null
        ? afterNextStartTime - MIN_CHORD_DURATION_SECONDS
        : Math.max(openEndedEndMax, min);
      state.endTime = clampTimingValue(value, min, Math.max(min, max));
    };

    startRow.slider.addEventListener("input", () => {
      clampStartFromInput(startRow.slider.value);
      render();
      emitLivePreview();
    });
    endRow.slider.addEventListener("input", () => {
      clampEndFromInput(endRow.slider.value);
      render();
      emitLivePreview();
    });

    resetButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (canMoveStart && originalStartTime !== null) {
        state.startTime = originalStartTime;
      }
      if (canMoveEnd && originalEndTime !== null) {
        state.endTime = Math.max(
          state.startTime + MIN_CHORD_DURATION_SECONDS,
          originalEndTime
        );
      }
      render();
      emitLivePreview();
    });

    cancelButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeChordTimingEditor();
    });

    saveButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!videoId) {
        window.ycUtils?.showToast?.("Could not detect video ID", "!", 2200);
        return;
      }

      const updates = [];
      if (canMoveStart && !startBoundaryUsesCurrentSplit) {
        updates.push({
          sourceIndex: currentSourceIndex,
          time: state.startTime,
          originalTime: originalStartTime,
          anchorSourceIndex: currentSourceIndex,
          anchorChordName: currentBaseName,
          changedChordName: prevBaseName || currentBaseName,
          boundary: "before",
        });
      }
      if (canMoveEnd && !endBoundaryUsesCurrentSplit) {
        updates.push({
          sourceIndex: nextSourceIndex,
          time: state.endTime,
          originalTime: originalEndTime,
          anchorSourceIndex: currentSourceIndex,
          anchorChordName: currentBaseName,
          changedChordName: nextBaseName || currentBaseName,
          boundary: "after",
        });
      }
      const splitDurationUpdates = getSplitBoundaryDurationUpdates();
      const shouldSaveSplit = hasSplitSegments() || initialSplitHadEntries;
      if (!updates.length && !shouldSaveSplit && !splitDurationUpdates.length) return;
      const originalNeighborConflict = getOriginalNeighborConflict();
      if (originalNeighborConflict) {
        showOriginalNeighborConflict(originalNeighborConflict);
        return;
      }

      saveButton.disabled = true;
      resetButton.disabled = true;
      cancelButton.disabled = true;
      saveButton.style.opacity = "0.7";
      resetButton.style.opacity = "0.7";
      cancelButton.style.opacity = "0.7";
      try {
        let result = { success: true };
        if (updates.length) {
          result = await setChordTimingEdits({
            videoId,
            mode: safeMode,
            updates,
          });
        }
        let splitPayload = hasSplitSegments() ? buildSplitEntryFromState() : null;
        const externalSplitDurationUpdates = [];
        for (const update of splitDurationUpdates) {
          if (update.parentSourceIndex === currentSourceIndex && splitPayload) {
            const splitResult = setSplitEntrySegmentDuration(
              splitPayload,
              update.segmentId,
              update.duration
            );
            if (splitResult.entry) {
              splitPayload = splitResult.entry;
            }
          } else {
            externalSplitDurationUpdates.push(update);
          }
        }
        if (result?.success) {
          for (const update of externalSplitDurationUpdates) {
            result = await setChordSplitSegmentDurationEdit({
              videoId,
              mode: safeMode,
              parentSourceIndex: update.parentSourceIndex,
              segmentId: update.segmentId,
              duration: update.duration,
            });
            if (!result?.success) break;
          }
        }
        if (result?.success && shouldSaveSplit) {
          result = await setChordSplitEdit({
            videoId,
            mode: safeMode,
            parentSourceIndex: currentSourceIndex,
            split: splitPayload,
          });
        }
        if (result?.success) {
          window.ycUtils?.showToast?.("Chord timing updated", "OK", 1800);
          closeChordTimingEditor();
          return;
        }
        window.ycUtils?.showToast?.("Could not save timing", "!", 2200);
      } catch (error) {
        log("Saving chord timing failed:", error);
        window.ycUtils?.showToast?.("Could not save timing", "!", 2200);
      } finally {
        saveButton.disabled = false;
        resetButton.disabled = false;
        cancelButton.disabled = false;
        saveButton.style.opacity = "1";
        resetButton.style.opacity = "1";
        cancelButton.style.opacity = "1";
      }
    });

    const getTileByDisplayIndex = (root, index) => {
      if (!root || !Number.isInteger(index) || index < 0) return null;
      const tiles = root.querySelectorAll?.(".yc-preview-chord") || [];
      for (const tile of tiles) {
        const tileIndex = Number.parseInt(tile.getAttribute("data-index") || "-1", 10);
        if (tileIndex === index) return tile;
      }
      return null;
    };

    const getRectOverlapArea = (a, b) => {
      if (!a || !b) return 0;
      const left = Math.max(a.left, b.left);
      const right = Math.min(a.right, b.right);
      const top = Math.max(a.top, b.top);
      const bottom = Math.min(a.bottom, b.bottom);
      if (right <= left || bottom <= top) return 0;
      return (right - left) * (bottom - top);
    };

    const getVisibleMainPanelRect = () => {
      const panels = Array.from(document.querySelectorAll(".yt-lyrics-chords-panel, .lyrics-chords-panel"));
      for (const candidate of panels) {
        if (!candidate || candidate.closest?.(".yc-preview-panel")) continue;
        const rect = candidate.getBoundingClientRect?.();
        if (!rect || rect.width < 120 || rect.height < 120) continue;
        const computed = window.getComputedStyle(candidate);
        if (computed.display === "none" || computed.visibility === "hidden" || Number(computed.opacity) === 0) {
          continue;
        }
        return rect;
      }
      return null;
    };

    const reposition = () => {
      if (!anchorEl.isConnected) {
        return;
      }
      const rect = anchorEl.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const margin = 8;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const scrollLeft = window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
      const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      const currentPreviewTile =
        capoContext === "panel"
          ? anchorEl.closest?.(".yc-preview-chord")
          : null;
      const mainPanelRect = currentPreviewTile ? getVisibleMainPanelRect() : null;
      if (mainPanelRect && panelRect.width > 0 && panelRect.height > 0) {
        const left = Math.max(
          margin,
          Math.min(
            mainPanelRect.left + (mainPanelRect.width / 2) - (panelRect.width / 2),
            Math.max(margin, viewportWidth - panelRect.width - margin)
          )
        );
        const top = Math.max(
          margin,
          Math.min(
            mainPanelRect.top + (mainPanelRect.height / 2) - (panelRect.height / 2),
            Math.max(margin, viewportHeight - panelRect.height - margin)
          )
        );
        panel.style.left = `${Math.round(left + scrollLeft)}px`;
        panel.style.top = `${Math.round(top + scrollTop)}px`;
        return;
      }

      if (currentPreviewTile && panelRect.width > 0 && panelRect.height > 0) {
        const tileRect = currentPreviewTile.getBoundingClientRect();
        const previewRoot =
          currentPreviewTile.closest?.(".yc-preview-panel") ||
          currentPreviewTile.closest?.(".yt-lyrics-chords-panel") ||
          document;
        const nextTile = getTileByDisplayIndex(previewRoot, safeDisplayIndex + 1);
        const nextRect = nextTile?.getBoundingClientRect?.() || null;
        const isPreviewRtl =
          Boolean(currentPreviewTile.closest?.(".yc-preview-rtl")) ||
          Boolean(currentPreviewTile.closest?.(".yt-lyrics-chords-rtl"));
        const oppositeOfAfter =
          nextRect && nextRect.left < tileRect.left
            ? "right"
            : nextRect && nextRect.left > tileRect.left
              ? "left"
              : (isPreviewRtl ? "right" : "left");
        const otherSide = oppositeOfAfter === "left" ? "right" : "left";
        const gap = 8;
        const minLeft = margin;
        const maxLeft = Math.max(margin, viewportWidth - panelRect.width - margin);
        const rawTop = tileRect.top + (tileRect.height / 2) - (panelRect.height / 2);
        const top = Math.max(
          margin,
          Math.min(rawTop, Math.max(margin, viewportHeight - panelRect.height - margin))
        );
        const scoreSide = (side, preferenceIndex) => {
          const rawLeft = side === "left"
            ? tileRect.left - panelRect.width - gap
            : tileRect.right + gap;
          const left = Math.max(minLeft, Math.min(rawLeft, maxLeft));
          const candidateRect = {
            left,
            right: left + panelRect.width,
            top,
            bottom: top + panelRect.height,
          };
          const overflow =
            Math.max(0, minLeft - rawLeft) +
            Math.max(0, rawLeft - maxLeft);
          const currentOverlap = getRectOverlapArea(candidateRect, tileRect);
          const nextOverlap = getRectOverlapArea(candidateRect, nextRect);
          const score =
            (overflow * 120) +
            (nextOverlap * 4) +
            (currentOverlap * 2) +
            preferenceIndex;
          return { left, score };
        };
        const first = scoreSide(oppositeOfAfter, 0);
        const second = scoreSide(otherSide, 1);
        const chosen = first.score <= second.score ? first : second;
        panel.style.left = `${Math.round(chosen.left + scrollLeft)}px`;
        panel.style.top = `${Math.round(top + scrollTop)}px`;
        return;
      }

      const preferredLeft = rect.left + (rect.width / 2) - (panelRect.width / 2);
      const left = Math.max(
        margin,
        Math.min(preferredLeft, viewportWidth - panelRect.width - margin)
      );
      let top = rect.bottom + 7;
      if (top + panelRect.height + margin > viewportHeight) {
        top = rect.top - panelRect.height - 7;
      }
      if (top < margin) {
        top = Math.max(margin, viewportHeight - panelRect.height - margin);
      }
      panel.style.left = `${Math.round(left + scrollLeft)}px`;
      panel.style.top = `${Math.round(top + scrollTop)}px`;
    };

    const stopEvent = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const onPointerDown = (event) => {
      const target = event.target;
      if (panel.contains(target) || anchorEl.contains(target)) return;
      closeChordTimingEditor();
    };
    const onKeydown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeChordTimingEditor();
    };
    const onReposition = () => reposition();

    closeButton.onmousedown = stopEvent;
    closeButton.onclick = (event) => {
      stopEvent(event);
      closeChordTimingEditor();
    };
    closeButton.addEventListener("mouseenter", () => {
      closeButton.style.background = "rgba(239, 68, 68, 0.22)";
      closeButton.style.borderColor = "rgba(248, 113, 113, 0.8)";
    });
    closeButton.addEventListener("mouseleave", () => {
      closeButton.style.background = "rgba(255, 255, 255, 0.08)";
      closeButton.style.borderColor = "rgba(255, 255, 255, 0.26)";
    });

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeydown, true);
    window.addEventListener("resize", onReposition, true);

    const cleanup = () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("resize", onReposition, true);
      clearTimingPreviewState();
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
      if (typeof onClose === "function") {
        onClose();
      }
      if (activeTimingEditorClose === cleanup) {
        activeTimingEditorClose = null;
        activeTimingEditorAnchor = null;
      }
    };

    const loadExistingSplit = async () => {
      if (!videoId) return;
      try {
        const payload = await loadEdits(videoId);
        if (!panel.isConnected || activeTimingEditorAnchor !== anchorEl) return;
        const bucket = getModeBucket(payload, safeMode, false);
        cacheExternalSplitEntries(bucket);
        const rawEntry = normalizeSplitEntry(bucket?.splits?.[String(currentSourceIndex)], currentSourceIndex);
        const originalHadEntries = Boolean(rawEntry?.before?.length || rawEntry?.after?.length);
        const entry = sanitizeSplitEntryForNames(rawEntry, {
          currentChordName: currentBaseName || currentName,
          previousChordName: prevExternalBaseName || prevExternalName,
          nextChordName: nextExternalBaseName || nextExternalName,
        });
        if (!entry) {
          splitState.loaded = true;
          initialSplitHadEntries = originalHadEntries;
          renderSplitEditor();
          return;
        }
        initialSplitHadEntries = originalHadEntries;
        splitState.before = (entry.before || []).map((segment) => ({
          id: segment.id || makeSplitSegmentId(),
          chordName: segment.chordName,
          side: "before",
          duration: roundTimingSeconds(segment.duration) ?? MIN_CHORD_DURATION_SECONDS,
          sources: normalizeSplitDurationSources(segment.sources, segment.duration),
        }));
        splitState.after = (entry.after || []).map((segment) => ({
          id: segment.id || makeSplitSegmentId(),
          chordName: segment.chordName,
          side: "after",
          duration: roundTimingSeconds(segment.duration) ?? MIN_CHORD_DURATION_SECONDS,
          sources: normalizeSplitDurationSources(segment.sources, segment.duration),
        }));
        splitState.currentDuration = roundTimingSeconds(entry.currentDuration);
        splitState.loaded = true;
        render();
        emitLivePreview();
      } catch (error) {
        log("Failed loading chord split edit:", error);
      }
    };

    activeTimingEditorClose = cleanup;
    activeTimingEditorAnchor = anchorEl;
    render();
    reposition();
    emitLivePreview();
    loadExistingSplit();
    return cleanup;
  }

  function openChordReplacePicker({
    anchorEl,
    currentValue = "",
    songChords = [],
    videoId = null,
    mode = "regular",
    sourceIndices = [],
    capoContext = "panel",
    onSelect,
    onSplit,
    onClose,
  }) {
    if (!anchorEl || typeof onSelect !== "function") return null;

    // Toggle behavior: clicking same edit button closes current picker.
    if (activePickerCleanup && activeReplacePickerAnchor === anchorEl) {
      closeChordReplacePicker();
      return null;
    }

    closeChordReplacePicker();
    closeChordRemoveScopePicker();
    closeChordEditsSummaryPopup();
    closeChordTimingEditor();

    const safeCapoState = resolveCapoEditState(capoContext);
    const safeCurrentChordName = String(currentValue || "").trim();
    const displayToBaseMap = new Map();

    const toDisplayChordName = (chordNameRaw) => {
      const clean = String(chordNameRaw || "").trim();
      if (!clean) return "";

      if (window.getCapoChord) {
        try {
          const fromCapo = String(
            window.getCapoChord(clean, safeCapoState.context) || clean
          ).trim();
          if (fromCapo) return fromCapo;
        } catch (error) {
          log("getCapoChord failed in edit picker:", error);
        }
      }

      if (safeCapoState.active && typeof window.transposeChord === "function") {
        try {
          const transposed = String(
            window.transposeChord(clean, -safeCapoState.fret) || clean
          ).trim();
          if (transposed) return transposed;
        } catch (error) {
          log("transposeChord (to display) failed in edit picker:", error);
        }
      }

      return clean;
    };

    const registerBaseToDisplay = (baseChordRaw) => {
      const base = String(baseChordRaw || "").trim();
      if (!base) return "";
      const display = toDisplayChordName(base) || base;
      const key = display.toLowerCase();
      if (!displayToBaseMap.has(key)) {
        displayToBaseMap.set(key, base);
      }
      return display;
    };

    const transformBaseOptionsToDisplay = (options) => {
      const transformed = [];
      const seen = new Set();
      for (const raw of options || []) {
        const base = String(raw || "").trim();
        if (!base) continue;
        const display = registerBaseToDisplay(base);
        if (!display) continue;
        const key = display.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        transformed.push(display);
      }
      return transformed;
    };

    const toBaseChordName = (valueRaw) => {
      const clean = String(valueRaw || "").trim();
      if (!clean) return "";

      const mapped = displayToBaseMap.get(clean.toLowerCase());
      if (mapped) return mapped;

      if (safeCapoState.active && typeof window.transposeChord === "function") {
        try {
          const base = String(
            window.transposeChord(clean, safeCapoState.fret) || clean
          ).trim();
          if (base) return base;
        } catch (error) {
          log("transposeChord (to base) failed in edit picker:", error);
        }
      }

      return clean;
    };

    const displayCurrentChordName = registerBaseToDisplay(safeCurrentChordName)
      || safeCurrentChordName;
    const baseSongOptions = buildSongChordList(songChords);
    const currentSongOptions = transformBaseOptionsToDisplay(baseSongOptions);
    let includeAllModesEnabled = false;
    let applyToAllEnabled = false;
    let includeLetterMatchesEnabled = true;
    let includeAllModesLoading = false;
    let includeAllModesLoaded = false;
    let allModesSongOptions = currentSongOptions.slice();
    let includeLoadToken = 0;
    let includeFullLibraryEnabled = false;
    let includeFullLibraryLoading = false;
    let includeFullLibraryLoaded = false;
    let includeFullLibraryFailed = false;
    let fullLibraryOptions = [];
    let fullLibraryLoadToken = 0;
    let pickerOptionsCache = null;
    let pickerClosed = false;
    const safeMode = normalizeMode(mode);
    const safeSourceIndices = uniqueSortedNumbers(sourceIndices);
    try {
      includeLetterMatchesEnabled =
        localStorage.getItem(UI_INCLUDE_LETTER_MATCH_KEY) !== "false";
    } catch (error) {
      log("Failed reading include-letter-match setting:", error);
      includeLetterMatchesEnabled = true;
    }

    const pushEditPreviewState = () => {
      setEditPreviewState({
        active: true,
        videoId,
        mode: safeMode,
        chordName: safeCurrentChordName,
        sourceIndices: safeSourceIndices,
        applyToAll: applyToAllEnabled === true,
      });
    };

    const panel = document.createElement("div");
    panel.style.cssText = `
      position: fixed;
      width: 240px;
      max-width: calc(100vw - 16px);
      max-height: 300px;
      background: rgba(19, 19, 19, 0.98);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      z-index: 3500;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    `;
    panel.style.zIndex = String(resolvePickerZIndex(anchorEl));
    panel.setAttribute("dir", "ltr");
    panel.style.direction = "ltr";
    panel.style.textAlign = "left";
    panel.style.unicodeBidi = "isolate";

    const topRow = document.createElement("div");
    topRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
    `;

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search / type chord...";
    input.value = displayCurrentChordName;
    input.style.cssText = `
      flex: 1 1 auto;
      min-width: 0;
      height: 28px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.24);
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      font-size: 12px;
      padding: 0 8px;
      outline: none;
    `;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "X";
    closeButton.title = "Close";
    closeButton.style.cssText = `
      width: 24px;
      height: 24px;
      min-width: 24px;
      position: absolute;
      top: 8px;
      right: 8px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.92);
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      line-height: 1;
      padding: 0;
      z-index: 2;
      transition: background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, transform 0.12s ease;
    `;
    const setCloseButtonHoverState = (isHovered) => {
      if (isHovered) {
        closeButton.style.background = "rgba(239, 68, 68, 0.22)";
        closeButton.style.borderColor = "rgba(248, 113, 113, 0.9)";
        closeButton.style.color = "#fff";
        closeButton.style.boxShadow = "0 0 0 1px rgba(239, 68, 68, 0.25), 0 4px 10px rgba(0, 0, 0, 0.28)";
        closeButton.style.transform = "translateY(-1px)";
        return;
      }

      closeButton.style.background = "rgba(255, 255, 255, 0.08)";
      closeButton.style.borderColor = "rgba(255, 255, 255, 0.25)";
      closeButton.style.color = "rgba(255, 255, 255, 0.92)";
      closeButton.style.boxShadow = "none";
      closeButton.style.transform = "none";
    };
    setCloseButtonHoverState(false);
    closeButton.addEventListener("mouseenter", () => setCloseButtonHoverState(true));
    closeButton.addEventListener("mouseleave", () => setCloseButtonHoverState(false));
    closeButton.addEventListener("focus", () => setCloseButtonHoverState(true));
    closeButton.addEventListener("blur", () => setCloseButtonHoverState(false));
    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeChordReplacePicker();
    });

    const optionsPanel = document.createElement("div");
    optionsPanel.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-right: 30px;
    `;

    const createToggleRow = (labelText) => {
      const label = document.createElement("label");
      label.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        color: rgba(255, 255, 255, 0.88);
        font-size: 11px;
        cursor: pointer;
        user-select: none;
      `;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.style.cssText = `
        margin: 0;
        cursor: pointer;
      `;

      const text = document.createElement("span");
      text.textContent = labelText;
      text.style.cssText = `
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      `;

      label.appendChild(checkbox);
      label.appendChild(text);
      return { label, checkbox, text };
    };

    const currentName = displayCurrentChordName;
    const applyAllRow = createToggleRow(
      currentName ? `Apply to all "${currentName}"` : "Apply to all"
    );
    applyAllRow.checkbox.checked = false;
    applyAllRow.checkbox.addEventListener("change", () => {
      applyToAllEnabled = applyAllRow.checkbox.checked === true;
      pushEditPreviewState();
    });

    const includeAllModesRow = createToggleRow("Include all modes");
    includeAllModesRow.checkbox.checked = false;

    const includeFullLibraryRow = createToggleRow("Include full library");
    includeFullLibraryRow.checkbox.checked = false;
    includeFullLibraryRow.label.title = "Include chords outside YouChords modes";

    const includeLetterMatchesRow = createToggleRow("Include letter matches");
    includeLetterMatchesRow.checkbox.checked = includeLetterMatchesEnabled;
    includeLetterMatchesRow.checkbox.addEventListener("change", () => {
      includeLetterMatchesEnabled = includeLetterMatchesRow.checkbox.checked === true;
      try {
        localStorage.setItem(
          UI_INCLUDE_LETTER_MATCH_KEY,
          String(includeLetterMatchesEnabled)
        );
      } catch (error) {
        log("Failed storing include-letter-match setting:", error);
      }
      renderList();
      reposition();
    });

    // Row order in picker options:
    // 1) Split (when available), 2) Include letter matches, 3) Apply to all,
    // 4) Include all modes, 5) Include full library.
    const canSplitMergedGroup =
      safeSourceIndices.length > 1 && typeof onSplit === "function";
    if (canSplitMergedGroup) {
      const splitRow = document.createElement("button");
      splitRow.type = "button";
      splitRow.textContent = "Split to original";
      splitRow.title = "Split merged chord back to original source chords";
      splitRow.style.cssText = `
        width: 100%;
        height: 24px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.92);
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        text-align: left;
        padding: 0 8px;
        transition: background 0.12s ease, border-color 0.12s ease;
      `;
      splitRow.addEventListener("mouseenter", () => {
        splitRow.style.background = "rgba(251, 191, 36, 0.18)";
        splitRow.style.borderColor = "rgba(251, 191, 36, 0.55)";
      });
      splitRow.addEventListener("mouseleave", () => {
        splitRow.style.background = "rgba(255, 255, 255, 0.08)";
        splitRow.style.borderColor = "rgba(255, 255, 255, 0.2)";
      });
      splitRow.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!canSplitMergedGroup) return;

        const restoreSplitButton = () => {
          splitRow.disabled = false;
          splitRow.style.opacity = "1";
          splitRow.style.cursor = "pointer";
        };

        splitRow.disabled = true;
        splitRow.style.opacity = "0.7";
        splitRow.style.cursor = "default";
        try {
          const result = await onSplit({ sourceIndices: safeSourceIndices });
          if (result?.success === false) {
            window.ycUtils?.showToast?.("Could not split this chord", "!", 2200);
            restoreSplitButton();
            return;
          }
          if (result?.changed === false) {
            window.ycUtils?.showToast?.("This chord is already in original split state", "i", 2400);
            restoreSplitButton();
            return;
          }
          closeChordReplacePicker();
        } catch (error) {
          log("Split chord action failed:", error);
          window.ycUtils?.showToast?.("Could not split this chord", "!", 2200);
          restoreSplitButton();
        }
      });
      optionsPanel.appendChild(splitRow);
    }
    optionsPanel.appendChild(includeLetterMatchesRow.label);
    optionsPanel.appendChild(applyAllRow.label);
    optionsPanel.appendChild(includeAllModesRow.label);
    optionsPanel.appendChild(includeFullLibraryRow.label);

    const includeAllModesStatus = document.createElement("div");
    includeAllModesStatus.style.cssText = `
      display: none;
      color: rgba(255, 255, 255, 0.66);
      font-size: 10px;
      padding-left: 18px;
    `;
    optionsPanel.appendChild(includeAllModesStatus);
    panel.appendChild(optionsPanel);
    panel.appendChild(closeButton);

    topRow.appendChild(input);
    panel.appendChild(topRow);

    const list = document.createElement("div");
    list.style.cssText = `
      overflow: auto;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      align-content: start;
      max-height: 200px;
      padding-right: 2px;
    `;
    panel.appendChild(list);

    const normalizedCurrent = displayCurrentChordName.toLowerCase();
    let filtered = [];

    const resolveSongOptions = () => (
      includeAllModesEnabled ? allModesSongOptions : currentSongOptions
    );

    const invalidatePickerOptionsCache = () => {
      pickerOptionsCache = null;
    };

    const resolvePickerOptions = () => {
      if (!includeFullLibraryEnabled) {
        return resolveSongOptions();
      }
      if (!pickerOptionsCache) {
        pickerOptionsCache = mergeChordLists(resolveSongOptions(), fullLibraryOptions);
      }
      return pickerOptionsCache;
    };

    const refreshIncludeStatus = () => {
      if (includeAllModesLoading) {
        includeAllModesStatus.style.display = "block";
        includeAllModesStatus.style.color = "rgba(255, 255, 255, 0.66)";
        includeAllModesStatus.textContent = "Loading chords from all modes...";
        return;
      }

      if (includeFullLibraryLoading) {
        includeAllModesStatus.style.display = "block";
        includeAllModesStatus.style.color = "rgba(255, 255, 255, 0.66)";
        includeAllModesStatus.textContent = "Loading full chord library...";
        return;
      }

      if (includeFullLibraryFailed) {
        includeAllModesStatus.style.display = "block";
        includeAllModesStatus.style.color = "rgba(248, 113, 113, 0.95)";
        includeAllModesStatus.textContent = "Could not load full library";
        return;
      }

      includeAllModesStatus.style.display = "none";
      includeAllModesStatus.style.color = "rgba(255, 255, 255, 0.66)";
      includeAllModesStatus.textContent = "";
    };

    const ensureAllModesLoaded = async () => {
      if (includeAllModesLoaded || includeAllModesLoading) {
        return;
      }

      includeAllModesLoading = true;
      refreshIncludeStatus();
      const token = ++includeLoadToken;
      try {
        const loadedOptions = await getSongChordListAcrossModes({
          videoId,
          fallbackSongChords: baseSongOptions,
        });
        if (pickerClosed || token !== includeLoadToken) return;
        allModesSongOptions = transformBaseOptionsToDisplay(loadedOptions);
        includeAllModesLoaded = true;
        invalidatePickerOptionsCache();
      } catch (error) {
        if (pickerClosed || token !== includeLoadToken) return;
        console.warn("[ChordEditsManager] Failed loading all-modes chord options:", error);
        allModesSongOptions = currentSongOptions.slice();
      } finally {
        if (pickerClosed || token !== includeLoadToken) return;
        includeAllModesLoading = false;
        invalidatePickerOptionsCache();
        refreshIncludeStatus();
        renderList();
        reposition();
      }
    };

    includeAllModesRow.checkbox.addEventListener("change", () => {
      includeAllModesEnabled = includeAllModesRow.checkbox.checked === true;
      invalidatePickerOptionsCache();
      if (includeAllModesEnabled) {
        ensureAllModesLoaded();
      }
      renderList();
      reposition();
    });

    const ensureFullLibraryLoaded = async () => {
      if (includeFullLibraryLoaded || includeFullLibraryLoading) {
        return;
      }

      includeFullLibraryLoading = true;
      includeFullLibraryFailed = false;
      refreshIncludeStatus();
      const token = ++fullLibraryLoadToken;
      try {
        const names = await loadFullChordLibraryNames();
        if (pickerClosed || token !== fullLibraryLoadToken) return;
        fullLibraryOptions = transformBaseOptionsToDisplay(names);
        includeFullLibraryLoaded = true;
      } catch (error) {
        if (pickerClosed || token !== fullLibraryLoadToken) return;
        console.warn("[ChordEditsManager] Failed loading full chord library:", error);
        fullLibraryOptions = [];
        includeFullLibraryFailed = true;
      } finally {
        if (pickerClosed || token !== fullLibraryLoadToken) return;
        includeFullLibraryLoading = false;
        invalidatePickerOptionsCache();
        refreshIncludeStatus();
        renderList();
        reposition();
      }
    };

    includeFullLibraryRow.checkbox.addEventListener("change", () => {
      includeFullLibraryEnabled = includeFullLibraryRow.checkbox.checked === true;
      includeFullLibraryFailed = false;
      invalidatePickerOptionsCache();
      if (includeFullLibraryEnabled) {
        ensureFullLibraryLoaded();
      }
      renderList();
      reposition();
    });

    const renderList = () => {
      const queryRaw = String(input.value || "").trim();
      const query = queryRaw.toLowerCase();
      const queryRoot = getChordSearchRoot(queryRaw);
      const queryLetter = getChordSearchLetter(queryRaw);
      const allOptions = resolvePickerOptions();
      const deduped = [];
      const seen = new Set();

      if (queryRaw && !seen.has(query) && query !== normalizedCurrent) {
        deduped.push(queryRaw);
        seen.add(query);
      }

      const isMatch = (option) => {
        if (!query) return true;

        const optionLower = option.toLowerCase();
        if (optionLower.includes(query)) {
          return true;
        }
        if (!includeLetterMatchesEnabled) {
          return false;
        }
        if (query.includes(optionLower)) {
          return true;
        }
        const optionRoot = getChordSearchRoot(option);
        if (queryRoot && optionRoot && queryRoot === optionRoot) {
          return true;
        }
        const optionLetter = getChordSearchLetter(option);
        return Boolean(
          queryLetter && optionLetter && queryLetter === optionLetter
        );
      };

      for (const option of allOptions) {
        if (!isMatch(option)) continue;
        const key = option.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(option);
        if (deduped.length >= 80) break;
      }

      filtered = deduped;
      list.innerHTML = "";

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.textContent = "No matches";
        empty.style.cssText = `
          grid-column: 1 / -1;
          color: rgba(255, 255, 255, 0.72);
          font-size: 12px;
          text-align: center;
          padding: 8px 0;
        `;
        list.appendChild(empty);
        return;
      }

      for (const option of filtered) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = option;
        button.style.cssText = `
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          height: 28px;
          font-size: 12px;
          cursor: pointer;
          padding: 0 6px;
          white-space: nowrap;
          text-overflow: ellipsis;
          overflow: hidden;
        `;
        button.addEventListener("mouseover", () => {
          button.style.background = "rgba(255, 255, 255, 0.16)";
          button.style.borderColor = "rgba(255, 255, 255, 0.3)";
        });
        button.addEventListener("mouseout", () => {
          button.style.background = "rgba(255, 255, 255, 0.06)";
          button.style.borderColor = "rgba(255, 255, 255, 0.16)";
        });
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const value = toBaseChordName(option);
          if (!value) return;
          onSelect(value, { applyToAll: applyToAllEnabled });
          closeChordReplacePicker();
        });
        list.appendChild(button);
      }
    };

    const reposition = () => {
      const anchorRect = anchorEl.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const width = panelRect.width || 220;
      const maxLeft = Math.max(8, window.innerWidth - width - 8);
      const centeredLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
      const left = Math.min(maxLeft, Math.max(8, centeredLeft));
      const belowTop = anchorRect.bottom + 6;
      const canOpenBelow = belowTop + panelRect.height <= window.innerHeight - 8;
      const top = canOpenBelow
        ? belowTop
        : Math.max(8, anchorRect.top - panelRect.height - 6);

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };

    const handleDocMouseDown = (event) => {
      if (panel.contains(event.target) || anchorEl.contains(event.target)) {
        return;
      }
      closeChordReplacePicker();
    };

    const handleWindowKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeChordReplacePicker();
        return;
      }
      if (event.key === "Enter") {
        const first = filtered[0];
        if (!first) return;
        event.preventDefault();
        onSelect(toBaseChordName(first), { applyToAll: applyToAllEnabled });
        closeChordReplacePicker();
      }
    };

    document.body.appendChild(panel);
    renderList();
    reposition();
    input.focus();
    input.select();
    pushEditPreviewState();

    input.addEventListener("input", renderList);
    window.addEventListener("resize", reposition, { passive: true });
    window.addEventListener("scroll", reposition, { passive: true, capture: true });
    document.addEventListener("mousedown", handleDocMouseDown, { capture: true });
    window.addEventListener("keydown", handleWindowKeyDown, { capture: true });

    const cleanup = () => {
      pickerClosed = true;
      includeLoadToken += 1;
      fullLibraryLoadToken += 1;
      pickerOptionsCache = null;
      fullLibraryOptions = [];
      filtered = [];
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, { capture: true });
      document.removeEventListener("mousedown", handleDocMouseDown, { capture: true });
      window.removeEventListener("keydown", handleWindowKeyDown, { capture: true });
      clearEditPreviewState();
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
      if (typeof onClose === "function") {
        onClose();
      }
      if (activePickerCleanup === cleanup) {
        activePickerCleanup = null;
        activeReplacePickerAnchor = null;
      }
    };
    activePickerCleanup = cleanup;
    activeReplacePickerAnchor = anchorEl;

    return activePickerCleanup;
  }

  function sumSplitDurations(segments) {
    return (Array.isArray(segments) ? segments : []).reduce((total, segment) => {
      const duration = roundTimingSeconds(segment?.duration);
      return total + (duration !== null ? duration : 0);
    }, 0);
  }

  function buildSplitDisplayChords(parentChord, splitEntry, parentStart, parentEnd, editingActive = false) {
    const safeParentStart = roundTimingSeconds(parentStart);
    const safeParentEnd = roundTimingSeconds(parentEnd);
    if (safeParentStart === null || safeParentEnd === null || safeParentEnd <= safeParentStart) {
      return [parentChord];
    }

    const totalDuration = roundTimingSeconds(safeParentEnd - safeParentStart);
    if (totalDuration === null || totalDuration < MIN_CHORD_DURATION_SECONDS) {
      return [parentChord];
    }

    const normalized = normalizeSplitEntry(splitEntry, parentChord?.__sourceIndices?.[0]);
    if (!normalized) return [parentChord];

    const before = (normalized.before || []).map((segment) => ({
      ...segment,
      side: "before",
      duration: Math.max(MIN_CHORD_DURATION_SECONDS, roundTimingSeconds(segment.duration) ?? MIN_CHORD_DURATION_SECONDS),
    }));
    const after = (normalized.after || []).map((segment) => ({
      ...segment,
      side: "after",
      duration: Math.max(MIN_CHORD_DURATION_SECONDS, roundTimingSeconds(segment.duration) ?? MIN_CHORD_DURATION_SECONDS),
    }));

    const addedDuration = sumSplitDurations(before) + sumSplitDurations(after);
    let currentDuration = roundTimingSeconds(normalized.currentDuration);
    if (currentDuration === null) {
      currentDuration = Math.max(MIN_CHORD_DURATION_SECONDS, totalDuration - addedDuration);
    }

    let totalRequested = addedDuration + currentDuration;
    if (totalRequested > totalDuration) {
      const scale = totalDuration / totalRequested;
      for (const segment of before) {
        segment.duration = Math.max(
          MIN_CHORD_DURATION_SECONDS,
          roundTimingSeconds(segment.duration * scale) ?? MIN_CHORD_DURATION_SECONDS
        );
      }
      for (const segment of after) {
        segment.duration = Math.max(
          MIN_CHORD_DURATION_SECONDS,
          roundTimingSeconds(segment.duration * scale) ?? MIN_CHORD_DURATION_SECONDS
        );
      }
      currentDuration = Math.max(
        MIN_CHORD_DURATION_SECONDS,
        roundTimingSeconds(currentDuration * scale) ?? MIN_CHORD_DURATION_SECONDS
      );
      totalRequested = sumSplitDurations(before) + sumSplitDurations(after) + currentDuration;
    }

    const overflow = roundTimingSeconds(totalRequested - totalDuration);
    if (overflow !== null && overflow > 0) {
      currentDuration = Math.max(MIN_CHORD_DURATION_SECONDS, roundTimingSeconds(currentDuration - overflow) ?? currentDuration);
    }

    const parentSourceIndex = normalized.parentSourceIndex;
    const createAddedChord = (segment, time, order) => {
      const chord = {
        ...parentChord,
        name: segment.chordName,
        chord: segment.chordName,
        time,
        __sourceIndices: [parentSourceIndex],
        __sourceKey: buildSourceKey([parentSourceIndex]),
        __splitAdded: true,
        __splitParentSourceIndex: parentSourceIndex,
        __splitSegmentId: segment.id,
        __splitSide: segment.side,
        __splitOrder: order,
        __splitEditingActive: editingActive === true,
        __forceKeep: true,
      };
      delete chord.__splitParent;
      delete chord.__splitCurrentDuration;
      delete chord.__edited;
      delete chord.__previousName;
      delete chord.__timingEdited;
      delete chord.__originalName;
      delete chord.__originalTime;
      return chord;
    };

    const output = [];
    let cursor = safeParentStart;

    before.forEach((segment, order) => {
      output.push(createAddedChord(segment, cursor, order));
      cursor = roundTimingSeconds(cursor + segment.duration) ?? cursor;
    });

    const currentChord = {
      ...parentChord,
      time: cursor,
      __splitParent: true,
      __splitParentSourceIndex: parentSourceIndex,
      __splitCurrentDuration: currentDuration,
      __splitEditingActive: editingActive === true,
      __forceKeep: true,
    };
    output.push(currentChord);
    cursor = roundTimingSeconds(cursor + currentDuration) ?? cursor;

    after.forEach((segment, order) => {
      output.push(createAddedChord(segment, cursor, order));
      cursor = roundTimingSeconds(cursor + segment.duration) ?? cursor;
    });

    return output;
  }

  function applyModeEditsToSourceChords(sourceChords, modeBucket) {
    if (!Array.isArray(sourceChords) || !sourceChords.length) return [];

    const output = [];
    const removed = modeBucket?.removed || {};
    const replaced = modeBucket?.replaced || {};
    const timing = modeBucket?.timing || {};
    const splits = modeBucket?.splits || {};
    const startBySourceIndex = new Map();
    const effectiveNameBySourceIndex = new Map();
    const visibleSourceIndices = [];
    const visiblePositionBySourceIndex = new Map();
    const videoDuration = resolveCurrentVideoDurationSeconds();

    for (const sourceChord of sourceChords) {
      const sourceIndices = uniqueSortedNumbers(sourceChord.__sourceIndices);
      const sourceIndex = sourceIndices.length === 1 ? sourceIndices[0] : null;
      const timingEntry =
        Number.isInteger(sourceIndex) ? timing[String(sourceIndex)] : null;
      const timingValue = roundTimingSeconds(timingEntry?.time ?? timingEntry);
      const startTime = timingValue !== null
        ? timingValue
        : roundTimingSeconds(sourceChord?.time);
      if (Number.isInteger(sourceIndex) && startTime !== null) {
        startBySourceIndex.set(sourceIndex, startTime);
      }
    }

    for (const sourceChord of sourceChords) {
      const sourceIndices = uniqueSortedNumbers(sourceChord.__sourceIndices);
      const sourceIndex = sourceIndices.length === 1 ? sourceIndices[0] : null;
      if (!Number.isInteger(sourceIndex) || sourceIndex < 0) continue;
      const sourceKey = buildSourceKey(sourceIndices);
      if (sourceKey && removed[sourceKey]) continue;
      const chord = {
        ...sourceChord,
        __sourceIndices: sourceIndices,
      };
      const replacement = sourceKey ? replaced[sourceKey] : null;
      if (replacement?.nextChordName) {
        setChordName(chord, replacement.nextChordName);
      }
      effectiveNameBySourceIndex.set(sourceIndex, getChordName(chord));
      visiblePositionBySourceIndex.set(sourceIndex, visibleSourceIndices.length);
      visibleSourceIndices.push(sourceIndex);
    }

    for (const sourceChord of sourceChords) {
      const chord = {
        ...sourceChord,
        __sourceIndices: uniqueSortedNumbers(sourceChord.__sourceIndices),
      };
      const sourceIndex = chord.__sourceIndices.length === 1
        ? chord.__sourceIndices[0]
        : null;
      const timingEntry =
        Number.isInteger(sourceIndex) ? timing[String(sourceIndex)] : null;
      const timingValue = roundTimingSeconds(timingEntry?.time ?? timingEntry);
      if (timingValue !== null) {
        chord.time = timingValue;
        chord.__timingEdited = true;
      }

      const sourceKey = buildSourceKey(chord.__sourceIndices);
      chord.__sourceKey = sourceKey;
      chord.__originalName = getChordName(sourceChord);
      chord.__originalTime = roundTimingSeconds(sourceChord?.time);

      if (!sourceKey) {
        output.push(chord);
        continue;
      }

      if (removed[sourceKey]) {
        continue;
      }

      const replacement = replaced[sourceKey];
      if (replacement?.nextChordName) {
        chord.__edited = true;
        chord.__previousName = getChordName(chord);
        setChordName(chord, replacement.nextChordName);
      }

      const splitEntry =
        Number.isInteger(sourceIndex) ? splits[String(sourceIndex)] : null;
      if (splitEntry) {
        const visiblePosition = visiblePositionBySourceIndex.get(sourceIndex);
        const previousVisibleSourceIndex = Number.isInteger(visiblePosition) && visiblePosition > 0
          ? visibleSourceIndices[visiblePosition - 1]
          : null;
        const nextVisibleSourceIndex =
          Number.isInteger(visiblePosition) && visiblePosition < visibleSourceIndices.length - 1
            ? visibleSourceIndices[visiblePosition + 1]
            : null;
        const sanitizedSplitEntry = sanitizeSplitEntryForNames(splitEntry, {
          currentChordName: getChordName(chord),
          previousChordName: Number.isInteger(previousVisibleSourceIndex)
            ? effectiveNameBySourceIndex.get(previousVisibleSourceIndex)
            : "",
          nextChordName: Number.isInteger(nextVisibleSourceIndex)
            ? effectiveNameBySourceIndex.get(nextVisibleSourceIndex)
            : "",
        });
        if (!sanitizedSplitEntry) {
          output.push(chord);
          continue;
        }
        const splitEditingActive =
          activeTimingPreviewState?.active === true &&
          activeTimingPreviewState.splitByParentSourceIndex &&
          Object.prototype.hasOwnProperty.call(
            activeTimingPreviewState.splitByParentSourceIndex,
            String(sourceIndex)
          );
        const parentStart = roundTimingSeconds(chord.time);
        const nextStart = Number.isInteger(sourceIndex)
          ? startBySourceIndex.get(sourceIndex + 1)
          : null;
        const fallbackEnd =
          videoDuration !== null && parentStart !== null && videoDuration > parentStart + MIN_CHORD_DURATION_SECONDS
            ? videoDuration
            : roundTimingSeconds((parentStart ?? 0) + 3);
        const parentEnd = nextStart ?? fallbackEnd;
        output.push(...buildSplitDisplayChords(chord, sanitizedSplitEntry, parentStart, parentEnd, splitEditingActive));
      } else {
        output.push(chord);
      }
    }

    return output.sort((a, b) => {
      const aTime = Number(a?.time);
      const bTime = Number(b?.time);
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
        return aTime - bTime;
      }
      const aIndex = uniqueSortedNumbers(a?.__sourceIndices)[0] ?? 0;
      const bIndex = uniqueSortedNumbers(b?.__sourceIndices)[0] ?? 0;
      if (aIndex !== bIndex) return aIndex - bIndex;
      const aOrder = Number(a?.__splitOrder);
      const bOrder = Number(b?.__splitOrder);
      if (Number.isFinite(aOrder) || Number.isFinite(bOrder)) {
        return (Number.isFinite(aOrder) ? aOrder : 999) - (Number.isFinite(bOrder) ? bOrder : 999);
      }
      return aIndex - bIndex;
    });
  }

  function applyQuickFilterWithSourceMap(chords, enabled, threshold) {
    if (!Array.isArray(chords) || !chords.length) return [];

    if (!enabled) {
      return chords.map((chord) => {
        const copy = { ...chord };
        copy.__sourceIndices = uniqueSortedNumbers(chord.__sourceIndices);
        copy.__sourceKey = buildSourceKey(copy.__sourceIndices);
        return copy;
      });
    }

    const safeThreshold = clampThreshold(threshold);
    const filtered = [];

    for (let i = 0; i < chords.length; i += 1) {
      const chord = chords[i];
      const nextChord = chords[i + 1];
      const duration = nextChord ? nextChord.time - chord.time : 3;
      if (duration >= safeThreshold || chord.__forceKeep === true) {
        filtered.push({
          ...chord,
          __sourceIndices: uniqueSortedNumbers(chord.__sourceIndices),
        });
      }
    }

    const merged = [];
    for (const chord of filtered) {
      const chordName = getChordName(chord);
      const previous = merged[merged.length - 1];
      const previousName = previous ? getChordName(previous) : "";

      if (
        previous &&
        previousName === chordName &&
        previous.__forceKeep !== true &&
        chord.__forceKeep !== true
      ) {
        previous.__sourceIndices = uniqueSortedNumbers([
          ...(previous.__sourceIndices || []),
          ...(chord.__sourceIndices || []),
        ]);
        previous.__sourceKey = buildSourceKey(previous.__sourceIndices);
        continue;
      }

      chord.__sourceKey = buildSourceKey(chord.__sourceIndices);
      merged.push(chord);
    }

    return merged;
  }

  async function applyToChords({
    videoId,
    mode,
    chords,
    quickEnabled,
    threshold,
  }) {
    const safeMode = normalizeMode(mode);
    const sourceChords = Array.isArray(chords) ? chords : [];
    const safeThreshold = clampThreshold(threshold);
    const safeQuickEnabled = quickEnabled !== false;

    const sourceWithIndex = sourceChords.map((chord, index) => ({
      ...chord,
      __sourceIndices: [index],
    }));

    const payload = await loadEdits(videoId);
    const modeBucket = getModeBucket(payload, safeMode, true);
    let effectiveModeBucket = modeBucket;
    if (
      activeTimingPreviewState?.active === true &&
      (!activeTimingPreviewState.videoId || activeTimingPreviewState.videoId === videoId) &&
      activeTimingPreviewState.mode === safeMode
    ) {
      const mergedSplits = {
        ...(modeBucket.splits || {}),
        ...(activeTimingPreviewState.splitByParentSourceIndex || {}),
      };
      for (const sourceIndex of uniqueSortedNumbers(activeTimingPreviewState.deletedSplitParentSourceIndices)) {
        delete mergedSplits[String(sourceIndex)];
      }
      effectiveModeBucket = {
        ...modeBucket,
        timing: {
          ...(modeBucket.timing || {}),
          ...(activeTimingPreviewState.timingBySourceIndex || {}),
        },
        splits: mergedSplits,
      };
    }
    const editedSource = applyModeEditsToSourceChords(sourceWithIndex, effectiveModeBucket);
    const prepared = applyQuickFilterWithSourceMap(
      editedSource,
      safeQuickEnabled,
      safeThreshold
    );

    return {
      chords: prepared,
      threshold: safeThreshold,
      mode: safeMode,
      editPayload: payload,
    };
  }

  async function removeChordGroup({
    videoId,
    mode,
    sourceIndices,
    threshold,
    removedChordName = "",
    capoContext = "panel",
  }) {
    const safeSourceIndices = uniqueSortedNumbers(sourceIndices);
    if (!videoId || !safeSourceIndices.length) {
      return { success: false, error: "Missing sourceIndices/videoId" };
    }

    const safeMode = normalizeMode(mode);
    const safeThreshold = clampThreshold(threshold);
    const safeCapoFret = resolveActiveCapoFret(capoContext);
    const safeRemovedChordName = String(removedChordName || "").trim();
    const mergedGroupKey = buildSourceKey(safeSourceIndices);
    const mergedGroupSize = safeSourceIndices.length;
    const isMergedGroup = mergedGroupSize > 1 && Boolean(mergedGroupKey);
    const payload = await loadEdits(videoId);
    const modeBucket = getModeBucket(payload, safeMode, true);

    const normalizedGroups = safeSourceIndices.map((index) => [index]);
    for (const group of normalizedGroups) {
      const sourceKey = buildSourceKey(group);
      if (!sourceKey) continue;
      modeBucket.removed[sourceKey] = {
        sourceIndices: group,
        threshold: safeThreshold,
        capoFret: safeCapoFret,
        mergedGroupKey: isMergedGroup ? mergedGroupKey : undefined,
        mergedGroupSize: isMergedGroup ? mergedGroupSize : undefined,
        mergedDisplayChordName: isMergedGroup ? safeRemovedChordName : undefined,
        updatedAt: Date.now(),
      };
      delete modeBucket.replaced[sourceKey];
    }

    const saveResult = await saveEdits(videoId, payload);
    if (saveResult?.success) {
      emitEditsChanged(videoId, safeMode);
    }
    return saveResult;
  }

  async function removeChordGroups({
    videoId,
    mode,
    sourceGroups,
    threshold,
    removedChordName = "",
    capoContext = "panel",
  }) {
    if (!videoId) {
      return { success: false, error: "Missing videoId" };
    }

    const normalizedGroups = Array.isArray(sourceGroups)
      ? sourceGroups
        .map((group) => uniqueSortedNumbers(group))
        .filter((group) => group.length > 0)
      : [];
    if (!normalizedGroups.length) {
      return { success: false, error: "Missing source groups" };
    }

    const safeMode = normalizeMode(mode);
    const safeThreshold = clampThreshold(threshold);
    const safeCapoFret = resolveActiveCapoFret(capoContext);
    const safeRemovedChordName = String(removedChordName || "").trim();

    const payload = await loadEdits(videoId);
    const modeBucket = getModeBucket(payload, safeMode, true);

    const uniqueSingleIndexKeys = new Set();
    const indexMeta = new Map();
    for (const group of normalizedGroups) {
      const mergedGroupKey = buildSourceKey(group);
      const mergedGroupSize = group.length;
      const isMergedGroup = mergedGroupSize > 1 && Boolean(mergedGroupKey);
      for (const index of group) {
        const indexKey = String(index);
        uniqueSingleIndexKeys.add(indexKey);
        if (isMergedGroup && !indexMeta.has(indexKey)) {
          indexMeta.set(indexKey, {
            mergedGroupKey,
            mergedGroupSize,
            mergedDisplayChordName: safeRemovedChordName,
          });
        }
      }
    }

    for (const indexKey of uniqueSingleIndexKeys) {
      const index = Number.parseInt(indexKey, 10);
      if (!Number.isInteger(index) || index < 0) continue;
      const group = [index];
      const sourceKey = buildSourceKey(group);
      if (!sourceKey) continue;
      modeBucket.removed[sourceKey] = {
        sourceIndices: group,
        threshold: safeThreshold,
        capoFret: safeCapoFret,
        mergedGroupKey: indexMeta.get(indexKey)?.mergedGroupKey,
        mergedGroupSize: indexMeta.get(indexKey)?.mergedGroupSize,
        mergedDisplayChordName: indexMeta.get(indexKey)?.mergedDisplayChordName,
        updatedAt: Date.now(),
      };
      delete modeBucket.replaced[sourceKey];
    }

    const removedSplitSegments = removeSplitSegmentsByChordName(
      modeBucket,
      safeRemovedChordName
    );

    const saveResult = await saveEdits(videoId, payload);
    if (saveResult?.success) {
      emitEditsChanged(videoId, safeMode);
    }
    return {
      ...saveResult,
      updatedGroups: normalizedGroups.length,
      removedSplitSegments,
    };
  }

  async function replaceChordGroup({
    videoId,
    mode,
    sourceIndices,
    nextChordName,
    previousChordName,
    previousChordNamesByIndex = null,
    threshold,
    capoContext = "panel",
  }) {
    const safeSourceIndices = uniqueSortedNumbers(sourceIndices);
    const safeNextName = String(nextChordName || "").trim();
    if (!videoId || !safeSourceIndices.length || !safeNextName) {
      return { success: false, error: "Missing replacement payload" };
    }

    const safeMode = normalizeMode(mode);
    const safeThreshold = clampThreshold(threshold);
    const safeCapoFret = resolveActiveCapoFret(capoContext);
    const safePreviousName = String(previousChordName || "").trim();
    const safePreviousNamesByIndex =
      previousChordNamesByIndex && typeof previousChordNamesByIndex === "object"
        ? previousChordNamesByIndex
        : null;
    const mergedGroupKey = buildSourceKey(safeSourceIndices);
    const mergedGroupSize = safeSourceIndices.length;
    const isMergedGroup = mergedGroupSize > 1 && Boolean(mergedGroupKey);

    const payload = await loadEdits(videoId);
    const modeBucket = getModeBucket(payload, safeMode, true);

    for (const index of safeSourceIndices) {
      const sourceIndicesGroup = [index];
      const sourceKey = buildSourceKey(sourceIndicesGroup);
      if (!sourceKey) continue;

      const perIndexPreviousName = safePreviousNamesByIndex
        ? String(safePreviousNamesByIndex[index] || "").trim()
        : "";

      modeBucket.replaced[sourceKey] = {
        sourceIndices: sourceIndicesGroup,
        nextChordName: safeNextName,
        previousChordName:
          perIndexPreviousName || safePreviousName || undefined,
        threshold: safeThreshold,
        capoFret: safeCapoFret,
        mergedGroupKey: isMergedGroup ? mergedGroupKey : undefined,
        mergedGroupSize: isMergedGroup ? mergedGroupSize : undefined,
        mergedDisplayChordName: isMergedGroup ? safePreviousName : undefined,
        updatedAt: Date.now(),
      };
      delete modeBucket.removed[sourceKey];
    }

    const saveResult = await saveEdits(videoId, payload);
    if (saveResult?.success) {
      emitEditsChanged(videoId, safeMode);
    }
    return saveResult;
  }

  function replaceSplitSegmentsByChordName(modeBucket, previousChordName, nextChordName) {
    const previousName = String(previousChordName || "").trim();
    const replacementName = String(nextChordName || "").trim();
    if (!previousName || !replacementName || !modeBucket?.splits) {
      return 0;
    }

    const previousKey = previousName.toLowerCase();
    if (previousKey === replacementName.toLowerCase()) {
      return 0;
    }

    let updatedSegments = 0;

    for (const [entryKey, rawEntry] of Object.entries(modeBucket.splits)) {
      const entry = normalizeSplitEntry(rawEntry, entryKey);
      if (!entry) continue;

      let entryChanged = false;
      const replaceSegments = (segments = []) => segments.map((segment) => {
        if (String(segment?.chordName || "").trim().toLowerCase() !== previousKey) {
          return segment;
        }
        entryChanged = true;
        updatedSegments += 1;
        return {
          ...segment,
          chordName: replacementName,
        };
      });

      const before = replaceSegments(entry.before);
      const after = replaceSegments(entry.after);
      if (!entryChanged) continue;

      modeBucket.splits[String(entry.parentSourceIndex)] = {
        ...entry,
        before,
        after,
        updatedAt: Date.now(),
      };
    }

    return updatedSegments;
  }

  function removeSplitSegmentsByChordName(modeBucket, chordName) {
    const removalName = String(chordName || "").trim();
    if (!removalName || !modeBucket?.splits) {
      return 0;
    }

    const removalKey = removalName.toLowerCase();
    let removedSegmentsCount = 0;

    for (const [entryKey, rawEntry] of Object.entries(modeBucket.splits)) {
      const entry = normalizeSplitEntry(rawEntry, entryKey);
      if (!entry) continue;

      const removedSegments = [
        ...(entry.before || []),
        ...(entry.after || []),
      ].filter(
        (segment) => String(segment?.chordName || "").trim().toLowerCase() === removalKey
      );
      if (!removedSegments.length) continue;

      const excludedSegmentIds = new Set(removedSegments.map((segment) => segment.id).filter(Boolean));
      removedSegments.forEach((segment) => {
        restoreSplitSegmentDurationToEntry(entry, segment, excludedSegmentIds);
      });

      const before = (entry.before || []).filter(
        (segment) => String(segment?.chordName || "").trim().toLowerCase() !== removalKey
      );
      const after = (entry.after || []).filter(
        (segment) => String(segment?.chordName || "").trim().toLowerCase() !== removalKey
      );

      removedSegmentsCount += removedSegments.length;
      if (!before.length && !after.length) {
        delete modeBucket.splits[String(entry.parentSourceIndex)];
      } else {
        const nextEntry = {
          ...entry,
          before,
          after,
          updatedAt: Date.now(),
        };
        delete nextEntry.currentDuration;
        modeBucket.splits[String(entry.parentSourceIndex)] = nextEntry;
      }
    }

    return removedSegmentsCount;
  }

  async function replaceChordGroups({
    videoId,
    mode,
    sourceGroups,
    nextChordName,
    previousChordName,
    threshold,
    capoContext = "panel",
  }) {
    const safeNextName = String(nextChordName || "").trim();
    if (!videoId || !safeNextName) {
      return { success: false, error: "Missing replacement payload" };
    }

    const normalizedGroups = Array.isArray(sourceGroups)
      ? sourceGroups.map((group) => uniqueSortedNumbers(group)).filter((group) => group.length > 0)
      : [];
    if (!normalizedGroups.length) {
      return { success: false, error: "Missing source groups" };
    }

    const safeMode = normalizeMode(mode);
    const safeThreshold = clampThreshold(threshold);
    const safeCapoFret = resolveActiveCapoFret(capoContext);
    const safePreviousName = String(previousChordName || "").trim();

    const payload = await loadEdits(videoId);
    const modeBucket = getModeBucket(payload, safeMode, true);
    const updatedIndexKeys = new Set();

    for (const group of normalizedGroups) {
      const mergedGroupKey = buildSourceKey(group);
      const mergedGroupSize = group.length;
      const isMergedGroup = mergedGroupSize > 1 && Boolean(mergedGroupKey);
      for (const index of group) {
        const sourceIndicesGroup = [index];
        const sourceKey = buildSourceKey(sourceIndicesGroup);
        if (!sourceKey) continue;
        updatedIndexKeys.add(String(index));
        modeBucket.replaced[sourceKey] = {
          sourceIndices: sourceIndicesGroup,
          nextChordName: safeNextName,
          previousChordName: safePreviousName || undefined,
          threshold: safeThreshold,
          capoFret: safeCapoFret,
          mergedGroupKey: isMergedGroup ? mergedGroupKey : undefined,
          mergedGroupSize: isMergedGroup ? mergedGroupSize : undefined,
          mergedDisplayChordName: isMergedGroup ? safePreviousName : undefined,
          updatedAt: Date.now(),
        };
        delete modeBucket.removed[sourceKey];
      }
    }

    const updatedSplitSegments = replaceSplitSegmentsByChordName(
      modeBucket,
      safePreviousName,
      safeNextName
    );

    const saveResult = await saveEdits(videoId, payload);
    if (saveResult?.success) {
      emitEditsChanged(videoId, safeMode);
    }
    return {
      ...saveResult,
      updatedGroups: updatedIndexKeys.size,
      updatedSplitSegments,
    };
  }

  async function splitChordGroup({
    videoId,
    mode,
    sourceIndices,
  }) {
    const safeSourceIndices = uniqueSortedNumbers(sourceIndices);
    if (!videoId || safeSourceIndices.length < 2) {
      return { success: false, error: "Missing split payload" };
    }

    const safeMode = normalizeMode(mode);
    const payload = await loadEdits(videoId);
    const modeBucket = getModeBucket(payload, safeMode, false);
    if (!modeBucket) {
      return { success: true, changed: false };
    }

    const sourceSet = new Set(safeSourceIndices);
    const isSubsetOfTarget = (indices) => {
      if (!Array.isArray(indices) || indices.length === 0) return false;
      return indices.every((index) => sourceSet.has(index));
    };

    let changed = false;
    const clearSubsetEntries = (entryMap) => {
      if (!entryMap || typeof entryMap !== "object") return;
      for (const [sourceKey, entry] of Object.entries(entryMap)) {
        const indices = uniqueSortedNumbers(entry?.sourceIndices);
        if (!isSubsetOfTarget(indices)) continue;
        delete entryMap[sourceKey];
        changed = true;
      }
    };

    clearSubsetEntries(modeBucket.removed);
    clearSubsetEntries(modeBucket.replaced);

    if (!changed) {
      return { success: true, changed: false };
    }

    const saveResult = await saveEdits(videoId, payload);
    if (saveResult?.success) {
      emitEditsChanged(videoId, safeMode);
    }
    return {
      ...saveResult,
      changed,
    };
  }

  async function collectSourceGroupsByChordName({
    videoId,
    mode,
    chords,
    quickEnabled,
    threshold,
    chordName,
  }) {
    const targetName = String(chordName || "").trim().toLowerCase();
    if (!targetName) return [];

    const prepared = await applyToChords({
      videoId,
      mode,
      chords,
      quickEnabled,
      threshold,
    });

    const groups = [];
    const seen = new Set();
    for (const chord of prepared?.chords || []) {
      if (chord?.__splitAdded === true) continue;
      const name = getChordName(chord).toLowerCase();
      if (name !== targetName) continue;
      const indices = uniqueSortedNumbers(chord.__sourceIndices);
      const key = buildSourceKey(indices);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      groups.push(indices);
    }
    return groups;
  }

  async function resetChordEditsForVideo(videoId, mode = null) {
    if (!videoId) return { success: false, error: "Missing videoId" };

    const payload = await loadEdits(videoId);

    if (mode) {
      const safeMode = normalizeMode(mode);
      delete payload.modes?.[safeMode];
      const saveResult = await saveEdits(videoId, payload);
      if (saveResult?.success) {
        emitEditsChanged(videoId, safeMode);
      }
      return saveResult;
    }

    const empty = createEmptyPayload();
    const saveResult = await saveEdits(videoId, empty);
    if (saveResult?.success) {
      emitEditsChanged(videoId, "regular");
      emitEditsChanged(videoId, "harmonic");
      emitEditsChanged(videoId, "harmonicPlus");
    }
    return saveResult;
  }

  async function resetRemovedChordEditsForVideo(videoId, mode = null) {
    if (!videoId) return { success: false, error: "Missing videoId" };

    const payload = await loadEdits(videoId);

    if (mode) {
      const safeMode = normalizeMode(mode);
      const bucket = getModeBucket(payload, safeMode, false);
      if (!bucket) return { success: true, changed: false };
      const hadEntries = Object.keys(bucket.removed || {}).length > 0;
      bucket.removed = {};
      const saveResult = await saveEdits(videoId, payload);
      if (saveResult?.success && hadEntries) {
        emitEditsChanged(videoId, safeMode);
      }
      return {
        ...saveResult,
        changed: hadEntries,
      };
    }

    let changed = false;
    const modes = payload?.modes && typeof payload.modes === "object"
      ? Object.keys(payload.modes)
      : [];
    modes.forEach((modeKey) => {
      const safeMode = normalizeMode(modeKey);
      const bucket = getModeBucket(payload, safeMode, false);
      if (!bucket) return;
      if (Object.keys(bucket.removed || {}).length > 0) {
        changed = true;
      }
      bucket.removed = {};
    });
    const saveResult = await saveEdits(videoId, payload);
    if (saveResult?.success && changed) {
      emitEditsChanged(videoId, "regular");
      emitEditsChanged(videoId, "harmonic");
      emitEditsChanged(videoId, "harmonicPlus");
    }
    return {
      ...saveResult,
      changed,
    };
  }

  async function resetEditedChordEditsForVideo(videoId, mode = null) {
    if (!videoId) return { success: false, error: "Missing videoId" };

    const payload = await loadEdits(videoId);

    if (mode) {
      const safeMode = normalizeMode(mode);
      const bucket = getModeBucket(payload, safeMode, false);
      if (!bucket) return { success: true, changed: false };
      const hadEntries = Object.keys(bucket.replaced || {}).length > 0;
      bucket.replaced = {};
      const saveResult = await saveEdits(videoId, payload);
      if (saveResult?.success && hadEntries) {
        emitEditsChanged(videoId, safeMode);
      }
      return {
        ...saveResult,
        changed: hadEntries,
      };
    }

    let changed = false;
    const modes = payload?.modes && typeof payload.modes === "object"
      ? Object.keys(payload.modes)
      : [];
    modes.forEach((modeKey) => {
      const safeMode = normalizeMode(modeKey);
      const bucket = getModeBucket(payload, safeMode, false);
      if (!bucket) return;
      if (Object.keys(bucket.replaced || {}).length > 0) {
        changed = true;
      }
      bucket.replaced = {};
    });
    const saveResult = await saveEdits(videoId, payload);
    if (saveResult?.success && changed) {
      emitEditsChanged(videoId, "regular");
      emitEditsChanged(videoId, "harmonic");
      emitEditsChanged(videoId, "harmonicPlus");
    }
    return {
      ...saveResult,
      changed,
    };
  }

  async function resetAddedChordEditsForVideo(videoId, mode = null) {
    if (!videoId) return { success: false, error: "Missing videoId" };

    const payload = await loadEdits(videoId);

    if (mode) {
      const safeMode = normalizeMode(mode);
      const bucket = getModeBucket(payload, safeMode, false);
      if (!bucket) return { success: true, changed: false };
      const hadEntries = Object.keys(bucket.splits || {}).length > 0;
      bucket.splits = {};
      const saveResult = await saveEdits(videoId, payload);
      if (saveResult?.success && hadEntries) {
        emitEditsChanged(videoId, safeMode);
      }
      return {
        ...saveResult,
        changed: hadEntries,
      };
    }

    let changed = false;
    const modes = payload?.modes && typeof payload.modes === "object"
      ? Object.keys(payload.modes)
      : [];
    modes.forEach((modeKey) => {
      const safeMode = normalizeMode(modeKey);
      const bucket = getModeBucket(payload, safeMode, false);
      if (!bucket) return;
      if (Object.keys(bucket.splits || {}).length > 0) {
        changed = true;
      }
      bucket.splits = {};
    });
    const saveResult = await saveEdits(videoId, payload);
    if (saveResult?.success && changed) {
      emitEditsChanged(videoId, "regular");
      emitEditsChanged(videoId, "harmonic");
      emitEditsChanged(videoId, "harmonicPlus");
    }
    return {
      ...saveResult,
      changed,
    };
  }

  async function resetTimingChordEditsForVideo(videoId, mode = null) {
    if (!videoId) return { success: false, error: "Missing videoId" };

    const payload = await loadEdits(videoId);

    if (mode) {
      const safeMode = normalizeMode(mode);
      const bucket = getModeBucket(payload, safeMode, false);
      if (!bucket) return { success: true, changed: false };
      const hadEntries = Object.keys(bucket.timing || {}).length > 0;
      bucket.timing = {};
      const saveResult = await saveEdits(videoId, payload);
      if (saveResult?.success && hadEntries) {
        emitEditsChanged(videoId, safeMode);
      }
      return {
        ...saveResult,
        changed: hadEntries,
      };
    }

    let changed = false;
    const modes = payload?.modes && typeof payload.modes === "object"
      ? Object.keys(payload.modes)
      : [];
    modes.forEach((modeKey) => {
      const safeMode = normalizeMode(modeKey);
      const bucket = getModeBucket(payload, safeMode, false);
      if (!bucket) return;
      if (Object.keys(bucket.timing || {}).length > 0) {
        changed = true;
      }
      bucket.timing = {};
    });
    const saveResult = await saveEdits(videoId, payload);
    if (saveResult?.success && changed) {
      emitEditsChanged(videoId, "regular");
      emitEditsChanged(videoId, "harmonic");
      emitEditsChanged(videoId, "harmonicPlus");
    }
    return {
      ...saveResult,
      changed,
    };
  }

  async function getThresholdEditedInfo({ videoId, mode, threshold }) {
    if (!videoId) {
      return {
        hasAnyEdits: false,
        hasCurrentThreshold: false,
        currentThreshold: clampThreshold(threshold),
        thresholds: [],
      };
    }

    const safeMode = normalizeMode(mode);
    const safeThreshold = clampThreshold(threshold);
    const payload = await loadEdits(videoId);
    const bucket = getModeBucket(payload, safeMode, false);

    if (!bucket) {
      return {
        hasAnyEdits: false,
        hasCurrentThreshold: false,
        currentThreshold: safeThreshold,
        thresholds: [],
      };
    }

    const thresholdSet = new Set();
    const collect = (entryMap) => {
      if (!entryMap || typeof entryMap !== "object") return;
      for (const entry of Object.values(entryMap)) {
        thresholdSet.add(clampThreshold(entry?.threshold));
      }
    };

    collect(bucket.removed);
    collect(bucket.replaced);
    if (bucket.timing && Object.keys(bucket.timing).length > 0) {
      thresholdSet.add(safeThreshold);
    }
    if (bucket.splits && Object.keys(bucket.splits).length > 0) {
      thresholdSet.add(safeThreshold);
    }

    const thresholds = [...thresholdSet].sort((a, b) => a - b);
    const hasCurrentThreshold = thresholdSet.has(safeThreshold);

    return {
      hasAnyEdits: thresholds.length > 0,
      hasCurrentThreshold,
      currentThreshold: safeThreshold,
      thresholds,
    };
  }

  window.chordEditsManager = {
    normalizeMode,
    clampThreshold,
    getUiSettings,
    setUiSettings,
    buildSongChordList,
    getSongChordListAcrossModes,
    getChordInfoSummary,
    getChordEditsSummary,
    confirmChordRemoveOnce,
    openChordInfoPopup,
    closeChordInfoPopup,
    openChordEditsSummaryPopup,
    closeChordEditsSummaryPopup,
    openChordRemoveScopePicker,
    closeChordRemoveScopePicker,
    openChordTimingEditor,
    closeChordTimingEditor,
    getEditPreviewState,
    getTimingPreviewState,
    openChordReplacePicker,
    closeChordReplacePicker,
    applyToChords,
    setChordTimingEdits,
    removeChordGroup,
    removeChordGroups,
    replaceChordGroup,
    replaceChordGroups,
    splitChordGroup,
    setChordSplitEdit,
    setChordSplitEditsForParents,
    removeChordSplitSegment,
    collectSourceGroupsByChordName,
    resetChordEditsForVideo,
    resetRemovedChordEditsForVideo,
    resetEditedChordEditsForVideo,
    resetAddedChordEditsForVideo,
    resetTimingChordEditsForVideo,
    getThresholdEditedInfo,
  };
})();

