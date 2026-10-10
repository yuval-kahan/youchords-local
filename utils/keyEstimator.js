/*==============================================================================
  YouChords - lightweight client-side key estimation
  ------------------------------------------------------------------------------
  Estimates a song key from the regular/R chord timeline that is already loaded.
  No backend work, no network calls, and cached per chord text.
==============================================================================*/

(function () {
  "use strict";

  if (window.ycKeyEstimator?.__initialized === true) {
    return;
  }

  const DEBUG = false;
  const TRANSPOSE_STORAGE_KEY = "youchords_key_transpose_offsets_v1";
  const TRANSPOSE_MIN = -12;
  const TRANSPOSE_MAX = 12;
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const FLAT_TO_SHARP = {
    Db: "C#",
    Eb: "D#",
    Gb: "F#",
    Ab: "G#",
    Bb: "A#",
    Cb: "B",
    Fb: "E",
    "E#": "F",
    "B#": "C",
  };
  const NOTE_TO_PC = NOTE_NAMES.reduce((map, note, index) => {
    map[note] = index;
    return map;
  }, { ...Object.fromEntries(Object.entries(FLAT_TO_SHARP).map(([flat, sharp]) => [flat, NOTE_NAMES.indexOf(sharp)])) });

  const MAJOR_DEGREES = new Map([
    [0, "major"],
    [2, "minor"],
    [4, "minor"],
    [5, "major"],
    [7, "major"],
    [9, "minor"],
    [11, "dim"],
  ]);

  const MINOR_DEGREES = new Map([
    [0, "minor"],
    [2, "dim"],
    [3, "major"],
    [5, "minor"],
    [7, "major"],
    [8, "major"],
    [10, "major"],
  ]);

  const cache = new Map();
  const MAX_CACHE_SIZE = 12;
  let currentTransposeVideoId = "";
  let currentTransposeOffset = 0;
  let currentChordData = null;
  let easyKeyActive = false;
  let easyKeyMode = "regular";
  let easyKeyOffset = 0;
  let easyCapoFret = 0;
  let easyCapoApplying = false;
  let easyKeyActivatedByCapoMatch = false;
  let manualTransposeBeforeEasy = 0;
  let easyKeySourceToken = "";
  let transposeOffsetsCache = null;
  let transposeOffsetsLoadPromise = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeNoteName(rawRoot) {
    if (!rawRoot) return null;
    const value = String(rawRoot)
      .replace(/♭/g, "b")
      .replace(/♯/g, "#")
      .trim();
    const match = value.match(/^([A-Ga-g])([#b]?)/);
    if (!match) return null;
    const root = `${match[1].toUpperCase()}${match[2] || ""}`;
    return FLAT_TO_SHARP[root] || root;
  }

  function normalizeTransposeOffset(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    const rounded = Math.round(parsed);
    return clamp(rounded, TRANSPOSE_MIN, TRANSPOSE_MAX);
  }

  function normalizeMode(mode) {
    const value = String(mode || "").trim();
    if (value === "regularPlus" || value === "rPlus") return "regularPlus";
    if (value === "harmonic" || value === "h") return "harmonic";
    if (value === "harmonicPlus" || value === "hPlus") return "harmonicPlus";
    return "regular";
  }

  function getVideoIdFromData(data) {
    const source = data || {};
    const currentWindowVideoId = typeof window !== "undefined"
      ? (window.ycCurrentVideoId || window.currentVideoId || "")
      : "";
    let urlVideoId = "";
    try {
      if (typeof location !== "undefined") {
        urlVideoId = new URLSearchParams(location.search).get("v") || "";
      }
    } catch (_) {}
    return String(
      source.videoId ||
      source.id ||
      source.youtubeVideoId ||
      currentWindowVideoId ||
      urlVideoId ||
      ""
    ).trim();
  }

  function transposeNoteName(noteName, semitones) {
    const note = normalizeNoteName(noteName);
    const pc = NOTE_TO_PC[note];
    if (!Number.isInteger(pc)) return null;
    return NOTE_NAMES[(pc + normalizeTransposeOffset(semitones) + 120) % 12];
  }

  function transposeChordName(chordName, semitones) {
    const offset = normalizeTransposeOffset(semitones);
    const raw = String(chordName || "").trim();
    if (!raw || offset === 0 || /^N(?:\/A)?$/i.test(raw) || raw === "-") return raw;

    const slashIndex = raw.indexOf("/");
    if (slashIndex > 0) {
      const base = raw.slice(0, slashIndex);
      const bass = raw.slice(slashIndex + 1);
      const transposedBase = transposeChordName(base, offset);
      const bassMatch = bass.match(/^([A-Ga-g])([#b♭♯]?)(.*)$/);
      if (!bassMatch) return transposedBase ? `${transposedBase}/${bass}` : raw;
      const transposedBass = transposeNoteName(`${bassMatch[1]}${bassMatch[2] || ""}`, offset);
      if (!transposedBase || !transposedBass) return raw;
      return `${transposedBase}/${transposedBass}${bassMatch[3] || ""}`;
    }

    const match = raw.match(/^([A-Ga-g])([#b♭♯]?)(.*)$/);
    if (!match) return raw;
    const transposedRoot = transposeNoteName(`${match[1]}${match[2] || ""}`, offset);
    if (!transposedRoot) return raw;
    return `${transposedRoot}${match[3] || ""}`;
  }

  function applyTransposeToChord(chordName, offset = currentTransposeOffset) {
    return transposeChordName(chordName, offset);
  }

  function getDisplayKey(result = window.ycEstimatedKey, offset = currentTransposeOffset) {
    if (!result?.key || !result?.mode) return null;
    const key = transposeNoteName(result.key, offset);
    if (!key) return null;
    return {
      key,
      mode: result.mode,
      label: `${key}${result.mode === "minor" ? "m" : ""}`,
      offset: normalizeTransposeOffset(offset),
      originalKey: result.key,
      originalMode: result.mode,
      originalLabel: `${result.key}${result.mode === "minor" ? "m" : ""}`,
    };
  }

  async function loadTransposeOffsets() {
    if (transposeOffsetsCache) return transposeOffsetsCache;
    if (transposeOffsetsLoadPromise) return transposeOffsetsLoadPromise;

    transposeOffsetsLoadPromise = (async () => {
      try {
        if (typeof chrome !== "undefined" && chrome?.storage?.local) {
          const result = await chrome.storage.local.get([TRANSPOSE_STORAGE_KEY]);
          const rawMap = result?.[TRANSPOSE_STORAGE_KEY];
          transposeOffsetsCache = rawMap && typeof rawMap === "object" ? rawMap : {};
          return transposeOffsetsCache;
        }
      } catch (error) {
        console.warn("[KeyEstimator] Failed loading transpose offsets from chrome.storage:", error);
      }

      try {
        const raw = localStorage.getItem(TRANSPOSE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        transposeOffsetsCache = parsed && typeof parsed === "object" ? parsed : {};
      } catch (error) {
        console.warn("[KeyEstimator] Failed loading transpose offsets from localStorage:", error);
        transposeOffsetsCache = {};
      }
      return transposeOffsetsCache;
    })().finally(() => {
      transposeOffsetsLoadPromise = null;
    });

    return transposeOffsetsLoadPromise;
  }

  async function saveTransposeOffsets(map) {
    const cleanMap = {};
    const entries = Object.entries(map || {})
      .map(([videoId, offset]) => [String(videoId || "").trim(), normalizeTransposeOffset(offset)])
      .filter(([videoId, offset]) => videoId && offset !== 0)
      .slice(-100);

    for (const [videoId, offset] of entries) cleanMap[videoId] = offset;
    transposeOffsetsCache = cleanMap;

    try {
      if (typeof chrome !== "undefined" && chrome?.storage?.local) {
        await chrome.storage.local.set({ [TRANSPOSE_STORAGE_KEY]: cleanMap });
        return cleanMap;
      }
    } catch (error) {
      console.warn("[KeyEstimator] Failed saving transpose offsets to chrome.storage:", error);
    }

    try {
      localStorage.setItem(TRANSPOSE_STORAGE_KEY, JSON.stringify(cleanMap));
    } catch (error) {
      console.warn("[KeyEstimator] Failed saving transpose offsets to localStorage:", error);
    }
    return cleanMap;
  }

  function dispatchTransposeChanged() {
    const detail = {
      videoId: currentTransposeVideoId || "",
      offset: currentTransposeOffset,
      estimatedKey: window.ycEstimatedKey || null,
      displayKey: getDisplayKey(window.ycEstimatedKey, currentTransposeOffset),
    };
    window.dispatchEvent(new CustomEvent("yc:keyTransposeChanged", { detail }));
    window.dispatchEvent(new CustomEvent("yc:estimatedKeyChanged", { detail: window.ycEstimatedKey || null }));
  }

  function dispatchEasyKeyChanged() {
    window.dispatchEvent(new CustomEvent("yc:easyKeyChanged", { detail: getEasyKeyState() }));
  }

  async function loadTransposeOffsetForVideo(videoId) {
    const safeVideoId = String(videoId || "").trim();
    if (!safeVideoId) {
      currentTransposeOffset = 0;
      return 0;
    }

    const map = await loadTransposeOffsets();
    const offset = normalizeTransposeOffset(map[safeVideoId]);
    if (safeVideoId === currentTransposeVideoId && offset !== currentTransposeOffset) {
      currentTransposeOffset = offset;
      dispatchTransposeChanged();
    }
    return offset;
  }

  function getCapoApi() {
    return typeof window !== "undefined" ? window.CapoIcon : null;
  }

  function applyEasyCapoFret(fret) {
    const capoApi = getCapoApi();
    const safeFret = clamp(Math.round(Number(fret) || 0), 0, 12);
    easyCapoFret = safeFret;
    if (capoApi?.applyEasyCapo) {
      easyCapoApplying = true;
      try {
        capoApi.applyEasyCapo(safeFret, "both");
      } finally {
        easyCapoApplying = false;
      }
    }
  }

  function getCapoTypeMatchesEasy(type) {
    const capoApi = getCapoApi();
    if (!capoApi?.getState) return true;
    const state = capoApi.getState(type);
    const active = state?.active === true;
    const fret = Math.round(Number(state?.fret) || 0);
    return easyCapoFret <= 0 ? !active : active && fret === easyCapoFret;
  }

  function isCurrentCapoStillEasy(type = "both") {
    if (type === "panel") return getCapoTypeMatchesEasy("panel");
    if (type === "carousel") return getCapoTypeMatchesEasy("carousel");
    return getCapoTypeMatchesEasy("panel") && getCapoTypeMatchesEasy("carousel");
  }

  function computeEasyCapoForMode(mode = window.chordsMode || easyKeyMode) {
    const safeMode = normalizeMode(mode);
    const sourceData = getEasyKeySourceData();
    const result = computeEasyCapoFretFromData(sourceData, safeMode);
    if (!result || !Number.isFinite(result.fret) || result.chordCount === 0) {
      return null;
    }
    return {
      mode: safeMode,
      fret: clamp(Math.round(Number(result.fret) || 0), 0, 12),
      sourceToken: getEasyKeySourceToken(sourceData),
      result,
    };
  }

  function capoMatchesFret(fret, type = "both") {
    const previousEasyFret = easyCapoFret;
    easyCapoFret = clamp(Math.round(Number(fret) || 0), 0, 12);
    try {
      return isCurrentCapoStillEasy(type);
    } finally {
      easyCapoFret = previousEasyFret;
    }
  }

  function enableEasyKeyFromMatchingCapo(recommendation) {
    if (!recommendation) return getEasyKeyState();
    const changed =
      !easyKeyActive ||
      easyKeyMode !== recommendation.mode ||
      easyCapoFret !== recommendation.fret ||
      easyKeyActivatedByCapoMatch !== true;

    easyKeyActive = true;
    easyKeyActivatedByCapoMatch = true;
    easyKeyMode = recommendation.mode;
    easyKeyOffset = 0;
    easyCapoFret = recommendation.fret;
    easyKeySourceToken = recommendation.sourceToken;
    manualTransposeBeforeEasy = currentTransposeOffset;

    if (changed) dispatchEasyKeyChanged();
    return getEasyKeyState();
  }

  function syncEasyKeyWithCurrentCapo(mode = window.chordsMode || easyKeyMode, options = {}) {
    if (easyCapoApplying) return getEasyKeyState();

    const type = options.type || "both";
    const recommendation = computeEasyCapoForMode(mode);
    if (!recommendation) return getEasyKeyState();

    const matches = capoMatchesFret(recommendation.fret, type);

    if (easyKeyActive) {
      if (matches) {
        if (easyKeyActivatedByCapoMatch) {
          return enableEasyKeyFromMatchingCapo(recommendation);
        }
        const changed =
          easyKeyMode !== recommendation.mode ||
          easyCapoFret !== recommendation.fret ||
          easyKeySourceToken !== recommendation.sourceToken;
        easyKeyMode = recommendation.mode;
        easyCapoFret = recommendation.fret;
        easyKeySourceToken = recommendation.sourceToken;
        if (changed) dispatchEasyKeyChanged();
        return getEasyKeyState();
      }

      void disableEasyKey({ restoreManual: false, restoreCapo: false });
      return getEasyKeyState();
    }

    if (recommendation.fret > 0 && matches) {
      return enableEasyKeyFromMatchingCapo(recommendation);
    }

    return getEasyKeyState();
  }

  function handleCapoChangedWhileEasy(event) {
    const type = event?.detail?.type || "both";
    syncEasyKeyWithCurrentCapo(window.chordsMode || easyKeyMode, { type });
  }

  function clearCurrentSongEstimate() {
    currentChordData = null;
    easyKeySourceToken = "";
    if (window.ycEstimatedKey) {
      window.ycEstimatedKey = null;
      window.dispatchEvent(new CustomEvent("yc:estimatedKeyChanged", { detail: null }));
    }
  }

  function handleNavigationWhileEasy(event) {
    const nextVideoId = getVideoIdFromData(null);
    const isFinishEvent = event?.type === "yt-navigate-finish";
    if (!isFinishEvent || (nextVideoId && nextVideoId !== currentTransposeVideoId)) {
      clearCurrentSongEstimate();
    }
    if (easyKeyActive) {
      void disableEasyKey({ restoreManual: false, restoreCapo: true });
    }
  }

  function handleModeChangedForEasyKey(event) {
    if (easyKeyActive && !easyKeyActivatedByCapoMatch) return;
    const mode = event?.detail?.newMode || window.chordsMode || easyKeyMode;
    syncEasyKeyWithCurrentCapo(mode);
  }

  async function setCurrentTransposeOffset(offset, options = {}) {
    const source = options?.source || "manual";
    const nextOffset = normalizeTransposeOffset(offset);
    if (source === "manual" && easyKeyActive) {
      await disableEasyKey({ restoreManual: false, restoreCapo: true });
    }
    if (nextOffset === currentTransposeOffset) return currentTransposeOffset;

    currentTransposeOffset = nextOffset;
    if (source !== "easyKey") manualTransposeBeforeEasy = nextOffset;
    if (currentTransposeVideoId) {
      const map = { ...(await loadTransposeOffsets()) };
      if (nextOffset === 0) {
        delete map[currentTransposeVideoId];
      } else {
        map[currentTransposeVideoId] = nextOffset;
      }
      await saveTransposeOffsets(map);
    }
    dispatchTransposeChanged();
    return currentTransposeOffset;
  }

  function stepCurrentTranspose(delta) {
    return setCurrentTransposeOffset(currentTransposeOffset + Number(delta || 0), {
      source: "manual",
    });
  }

  function parseChordName(rawChordName) {
    const raw = String(rawChordName || "")
      .replace(/♭/g, "b")
      .replace(/♯/g, "#")
      .trim();
    if (!raw || /^N(?:\/A)?$/i.test(raw) || raw === "-") return null;

    const primary = raw.split("/")[0].trim();
    const match = primary.match(/^([A-Ga-g])([#b]?)(.*)$/);
    if (!match) return null;

    const note = normalizeNoteName(`${match[1]}${match[2] || ""}`);
    const pc = NOTE_TO_PC[note];
    if (!Number.isInteger(pc)) return null;

    const suffix = String(match[3] || "").trim();
    const lower = suffix.toLowerCase();
    let quality = "major";
    if (/^(m|min)(?!aj)/.test(lower)) quality = "minor";
    if (/^(dim|o|ø)/.test(lower) || lower.includes("dim") || lower.includes("m7b5")) quality = "dim";
    if (/^(sus|add|5)/.test(lower)) quality = "neutral";
    if (/^maj/.test(lower)) quality = "major";

    return { name: raw, root: note, pc, quality };
  }

  function parseChordText(chordText) {
    const text = String(chordText || "").trim();
    if (!text) return [];

    const events = [];
    const parts = text.split(",");
    for (const part of parts) {
      const separatorIndex = part.indexOf(":");
      if (separatorIndex <= 0) continue;

      const time = Number.parseFloat(part.slice(0, separatorIndex).trim());
      if (!Number.isFinite(time)) continue;

      const parsed = parseChordName(part.slice(separatorIndex + 1));
      if (!parsed) continue;

      events.push({ ...parsed, time });
    }

    events.sort((a, b) => a.time - b.time);
    return events;
  }

  function selectChordTextForMode(data, mode = "regular") {
    const source = data || {};
    if (typeof source === "string") return source;
    const safeMode = normalizeMode(mode);
    if (source.chordText && typeof source.chordText === "object") {
      if (safeMode === "regularPlus") {
        return (
          source.chordText.regularPlus ||
          source.chordText.rPlus ||
          source.chordText.regular_plus ||
          source.chordText.regular ||
          source.chordText.r ||
          source.chordText.default ||
          ""
        );
      }
      if (safeMode === "harmonic") {
        return (
          source.chordText.harmonic ||
          source.chordText.h ||
          source.chordText.regular ||
          source.chordText.r ||
          source.chordText.default ||
          ""
        );
      }
      if (safeMode === "harmonicPlus") {
        return (
          source.chordText.harmonicPlus ||
          source.chordText.hPlus ||
          source.chordText.harmonic_plus ||
          source.chordText.harmonic ||
          source.chordText.h ||
          source.chordText.regular ||
          source.chordText.r ||
          source.chordText.default ||
          ""
        );
      }
      return (
        source.chordText.regular ||
        source.chordText.r ||
        source.chordText.default ||
        ""
      );
    }
    if (safeMode === "regularPlus") {
      return (
        source.regularPlus ||
        source.chordTextRegularPlus ||
        source.chordTextRegular ||
        source.regular ||
        source.chordText ||
        ""
      );
    }
    if (safeMode === "harmonic") {
      return (
        source.harmonic ||
        source.chordTextHarmonic ||
        source.chordTextRegular ||
        source.regular ||
        source.chordText ||
        ""
      );
    }
    if (safeMode === "harmonicPlus") {
      return (
        source.harmonicPlus ||
        source.chordTextHarmonicPlus ||
        source.harmonic ||
        source.chordTextHarmonic ||
        source.chordTextRegular ||
        source.regular ||
        source.chordText ||
        ""
      );
    }
    return (
      source.regular ||
      source.chordTextRegular ||
      source.chordText ||
      source.chordTextRegularPlus ||
      ""
    );
  }

  function selectRegularChordText(data) {
    return selectChordTextForMode(data, "regular");
  }

  function createChordTextSnapshot(data, videoId = "") {
    const safeVideoId = String(videoId || getVideoIdFromData(data) || "").trim();
    if (typeof data === "string") {
      return { videoId: safeVideoId, chordText: data };
    }

    const source = data || {};
    const snapshot = { videoId: safeVideoId };
    const copyString = (key, value) => {
      if (typeof value === "string" && value.trim()) {
        snapshot[key] = value;
      }
    };

    if (source.chordText && typeof source.chordText === "object") {
      snapshot.chordText = {};
      [
        "regular",
        "r",
        "default",
        "regularPlus",
        "rPlus",
        "regular_plus",
        "harmonic",
        "h",
        "harmonicPlus",
        "hPlus",
        "harmonic_plus",
      ].forEach((key) => {
        const value = source.chordText[key];
        if (typeof value === "string" && value.trim()) {
          snapshot.chordText[key] = value;
        }
      });
      if (Object.keys(snapshot.chordText).length === 0) {
        delete snapshot.chordText;
      }
    } else {
      copyString("chordText", source.chordText);
    }

    copyString("regular", source.regular);
    copyString("regularPlus", source.regularPlus);
    copyString("harmonic", source.harmonic);
    copyString("harmonicPlus", source.harmonicPlus);
    copyString("chordTextRegular", source.chordTextRegular);
    copyString("chordTextRegularPlus", source.chordTextRegularPlus);
    copyString("chordTextHarmonic", source.chordTextHarmonic);
    copyString("chordTextHarmonicPlus", source.chordTextHarmonicPlus);

    return snapshot;
  }

  function getChordDifficulty(rawChordName) {
    const raw = String(rawChordName || "").trim();
    const parsed = parseChordName(raw);
    if (!parsed) return 4;

    const primary = raw.split("/")[0].trim();
    const hasSlash = raw.includes("/");
    const root = parsed.root;
    const suffix = primary.replace(/^([A-Ga-g])([#b♭♯]?)/, "").toLowerCase();
    const exact = `${root}${parsed.quality === "minor" && !/^(m|min)/.test(suffix) ? "m" : suffix}`;

    const simpleScores = new Map([
      ["C", 0],
      ["G", 0],
      ["Am", 0.05],
      ["Em", 0.05],
      ["D", 0.2],
      ["A", 0.55],
      ["E", 0.65],
      ["Dm", 0.75],
      ["Bm", 1.8],
      ["F", 2.2],
      ["F#m", 2],
      ["B", 2.45],
      ["Bb", 2.55],
      ["C#m", 2.35],
      ["G#m", 2.25],
      ["D#m", 2.65],
      ["A#m", 2.8],
      ["Eb", 2.35],
      ["Ab", 2.45],
      ["Db", 2.6],
      ["Gb", 2.8],
    ]);

    let score = simpleScores.has(exact) ? simpleScores.get(exact) : 1.1;
    if (["C#", "D#", "F#", "G#", "A#"].includes(root)) score += 0.75;
    if (parsed.quality === "minor") score += 0.05;
    if (parsed.quality === "dim") score += 1.25;
    if (/maj7|Δ/.test(suffix)) score += 0.75;
    if (/(^|[^a-z])7/.test(suffix)) score += 0.35;
    if (/sus|add|6|9|11|13/.test(suffix)) score += 0.45;
    if (/aug|\+|#5|b5/.test(suffix)) score += 1;
    if (hasSlash) score += 0.65;
    return score;
  }

  function computeEasyKeyOffsetFromChordText(chordText) {
    const events = parseChordText(chordText);
    if (!events.length) {
      return { offset: 0, score: 0, originalScore: 0, chordCount: 0 };
    }

    const medianDuration = getMedianDuration(events);
    const candidates = [];
    for (let offset = -6; offset <= 6; offset += 1) {
      let score = Math.abs(offset) * 0.045;
      let totalWeight = 0;
      const uniqueChords = new Set();

      for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        const transposedName = transposeChordName(event.name, offset);
        const weight = durationFor(events, index, medianDuration);
        score += getChordDifficulty(transposedName) * weight;
        totalWeight += weight;
        uniqueChords.add(String(transposedName || "").split("/")[0]);
      }

      candidates.push({
        offset,
        score: score / Math.max(1, totalWeight) + uniqueChords.size * 0.015,
        chordCount: events.length,
      });
    }

    candidates.sort((a, b) => {
      const scoreDiff = a.score - b.score;
      if (Math.abs(scoreDiff) > 0.02) return scoreDiff;
      return Math.abs(a.offset) - Math.abs(b.offset);
    });

    return {
      ...candidates[0],
      originalScore: candidates.find((candidate) => candidate.offset === 0)?.score || 0,
    };
  }

  function computeEasyCapoFretFromChordText(chordText) {
    const events = parseChordText(chordText);
    if (!events.length) {
      return { fret: 0, score: 0, originalScore: 0, chordCount: 0 };
    }

    const medianDuration = getMedianDuration(events);
    const candidates = [];

    for (let fret = 0; fret <= 7; fret += 1) {
      let score = fret * 0.06;
      let totalWeight = 0;
      const uniqueChords = new Set();

      for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        const capoShapeName = transposeChordName(event.name, -fret);
        const weight = durationFor(events, index, medianDuration);
        score += getChordDifficulty(capoShapeName) * weight;
        totalWeight += weight;
        uniqueChords.add(String(capoShapeName || "").split("/")[0]);
      }

      candidates.push({
        fret,
        score: score / Math.max(1, totalWeight) + uniqueChords.size * 0.015,
        chordCount: events.length,
      });
    }

    candidates.sort((a, b) => {
      const scoreDiff = a.score - b.score;
      if (Math.abs(scoreDiff) > 0.02) return scoreDiff;
      return a.fret - b.fret;
    });

    return {
      ...candidates[0],
      originalScore: candidates.find((candidate) => candidate.fret === 0)?.score || 0,
    };
  }

  function getEasyKeySourceData() {
    return (
      (typeof window !== "undefined" && window.PANEL_SUBSET) ||
      currentChordData ||
      null
    );
  }

  function getEasyKeySourceToken(data) {
    const videoId = getVideoIdFromData(data);
    if (videoId) return `video:${videoId}`;

    const text =
      selectChordTextForMode(data, normalizeMode(window.chordsMode || easyKeyMode)) ||
      selectRegularChordText(data);
    const safeText = String(text || "");
    return safeText ? `text:${safeText.length}:${safeText.slice(0, 300)}` : "";
  }

  function computeEasyKeyOffsetFromData(data, mode = easyKeyMode) {
    return computeEasyKeyOffsetFromChordText(selectChordTextForMode(data, mode));
  }

  function computeEasyCapoFretFromData(data, mode = easyKeyMode) {
    return computeEasyCapoFretFromChordText(selectChordTextForMode(data, mode));
  }

  function durationFor(events, index, medianDuration) {
    const current = events[index];
    const next = events[index + 1];
    if (next && Number.isFinite(next.time) && next.time > current.time) {
      return clamp(next.time - current.time, 0.2, 10);
    }
    return clamp(medianDuration || 2, 0.5, 4);
  }

  function getMedianDuration(events) {
    const durations = [];
    for (let i = 0; i < events.length - 1; i += 1) {
      const duration = events[i + 1].time - events[i].time;
      if (Number.isFinite(duration) && duration > 0 && duration < 16) {
        durations.push(duration);
      }
    }
    if (!durations.length) return 2;
    durations.sort((a, b) => a - b);
    return durations[Math.floor(durations.length / 2)] || 2;
  }

  function qualityScore(actual, expected, mode, degree) {
    if (actual === "neutral") return 0.25;
    if (actual === expected) return 0.7;
    if (mode === "minor" && degree === 7 && actual === "minor") return 0.45;
    if (expected === "dim" && actual === "minor") return 0.35;
    return -0.15;
  }

  function scoreKey(events, tonicPc, mode) {
    const degrees = mode === "major" ? MAJOR_DEGREES : MINOR_DEGREES;
    const medianDuration = getMedianDuration(events);
    let score = 0;
    let totalWeight = 0;

    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      const weight = durationFor(events, index, medianDuration);
      const degree = (event.pc - tonicPc + 12) % 12;
      const expectedQuality = degrees.get(degree);
      totalWeight += weight;

      if (expectedQuality) {
        let chordScore = 1.15 + qualityScore(event.quality, expectedQuality, mode, degree);
        if (degree === 0) chordScore += 0.95;
        if (degree === 7) chordScore += 0.45;
        if (degree === 5) chordScore += 0.25;
        if (mode === "major" && degree === 9) chordScore += 0.25;
        if (mode === "minor" && degree === 3) chordScore += 0.25;
        score += chordScore * weight;
      } else {
        score -= 0.3 * weight;
      }

      if (index === 0 || index === events.length - 1) {
        if (degree === 0) score += 0.8;
        if (mode === "major" && degree === 9 && event.quality === "minor") score += 0.35;
        if (mode === "minor" && degree === 3 && event.quality === "major") score += 0.35;
      }
    }

    return { score, totalWeight };
  }

  function insertCache(key, value) {
    cache.set(key, value);
    if (cache.size > MAX_CACHE_SIZE) {
      const first = cache.keys().next().value;
      cache.delete(first);
    }
  }

  function estimateKeyFromChordText(chordText) {
    const text = String(chordText || "").trim();
    if (!text) {
      return { label: "Unknown", key: null, mode: null, confidence: 0, chordCount: 0 };
    }
    if (cache.has(text)) return cache.get(text);

    const events = parseChordText(text);
    if (events.length < 3) {
      const result = { label: "Unknown", key: null, mode: null, confidence: 0, chordCount: events.length };
      insertCache(text, result);
      return result;
    }

    const candidates = [];
    for (let tonicPc = 0; tonicPc < 12; tonicPc += 1) {
      for (const mode of ["major", "minor"]) {
        const scored = scoreKey(events, tonicPc, mode);
        candidates.push({
          key: NOTE_NAMES[tonicPc],
          mode,
          label: `${NOTE_NAMES[tonicPc]} ${mode}`,
          score: scored.score,
          totalWeight: scored.totalWeight,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const second = candidates[1] || { score: 0 };
    const confidence = clamp((best.score - second.score) / Math.max(5, best.totalWeight || best.score || 1), 0, 1);
    const result = {
      ...best,
      confidence,
      chordCount: events.length,
      source: "regular",
      isLowConfidence: confidence < 0.08,
    };

    insertCache(text, result);
    DEBUG && console.log("[KeyEstimator] Estimated key:", result);
    return result;
  }

  function estimateKeyFromData(data) {
    return estimateKeyFromChordText(selectRegularChordText(data));
  }

  function getEasyKeyState() {
    return {
      active: easyKeyActive,
      mode: easyKeyMode,
      offset: easyKeyOffset,
      capoFret: easyCapoFret,
      activatedByCapoMatch: easyKeyActivatedByCapoMatch,
      manualOffset: manualTransposeBeforeEasy,
    };
  }

  async function enableEasyKeyForMode(mode = window.chordsMode || "regular") {
    const safeMode = normalizeMode(mode);
    const sourceData = getEasyKeySourceData();
    const result = computeEasyCapoFretFromData(sourceData, safeMode);
    if (!result || !Number.isFinite(result.fret) || result.chordCount === 0) {
      console.warn("[KeyEstimator] Easy Capo is unavailable until chord data is loaded");
      return getEasyKeyState();
    }

    if (!easyKeyActive) {
      manualTransposeBeforeEasy = currentTransposeOffset;
    }

    const safeFret = clamp(Math.round(Number(result.fret) || 0), 0, 12);
    if (safeFret <= 0) {
      const changed = easyKeyActive || easyCapoFret !== 0 || easyKeySourceToken;
      easyKeyActive = false;
      easyKeyActivatedByCapoMatch = false;
      easyKeyMode = safeMode;
      easyKeyOffset = 0;
      easyCapoFret = 0;
      easyKeySourceToken = "";
      applyEasyCapoFret(0);
      if (changed) dispatchEasyKeyChanged();
      return { ...getEasyKeyState(), noCapoNeeded: true };
    }

    easyKeyActive = true;
    easyKeyActivatedByCapoMatch = false;
    easyKeyMode = safeMode;
    easyKeyOffset = 0;
    easyCapoFret = safeFret;
    easyKeySourceToken = getEasyKeySourceToken(sourceData);
    applyEasyCapoFret(easyCapoFret);
    dispatchEasyKeyChanged();
    return getEasyKeyState();
  }

  async function disableEasyKey(options = {}) {
    const restoreManual = options.restoreManual !== false;
    const restoreCapo = options.restoreCapo !== false;
    if (!easyKeyActive) return getEasyKeyState();

    const restoreOffset = normalizeTransposeOffset(manualTransposeBeforeEasy);
    easyKeyActive = false;
    easyKeyActivatedByCapoMatch = false;
    easyKeyOffset = 0;
    easyCapoFret = 0;
    easyKeySourceToken = "";

    if (restoreCapo) {
      applyEasyCapoFret(0);
    }

    if (restoreManual) {
      await setCurrentTransposeOffset(restoreOffset, { source: "easyRestore" });
    }

    dispatchEasyKeyChanged();
    return getEasyKeyState();
  }

  function isEasyKeyActive() {
    return easyKeyActive;
  }

  async function toggleEasyKeyForCurrentMode(mode = window.chordsMode || "regular") {
    if (easyKeyActive) return disableEasyKey();
    return enableEasyKeyForMode(mode);
  }

  async function applyEasyKeyForCurrentMode(mode = window.chordsMode || easyKeyMode) {
    if (!easyKeyActive) return getEasyKeyState();
    if (easyKeyActivatedByCapoMatch) {
      return syncEasyKeyWithCurrentCapo(mode);
    }
    return enableEasyKeyForMode(mode);
  }

  function setCurrentFromData(data) {
    const videoId = getVideoIdFromData(data);
    const snapshot = createChordTextSnapshot(data, videoId);
    currentChordData = snapshot;
    const result = estimateKeyFromData(snapshot);
    const nextEasySourceToken = getEasyKeySourceToken(snapshot);
    if (
      easyKeyActive &&
      nextEasySourceToken &&
      easyKeySourceToken &&
      nextEasySourceToken !== easyKeySourceToken
    ) {
      easyKeyActive = false;
      easyKeyActivatedByCapoMatch = false;
      easyKeyOffset = 0;
      easyCapoFret = 0;
      easyKeySourceToken = "";
      applyEasyCapoFret(0);
      dispatchEasyKeyChanged();
    }
    if (videoId && videoId !== currentTransposeVideoId) {
      if (easyKeyActive) {
        easyKeyActive = false;
        easyKeyActivatedByCapoMatch = false;
        easyKeyOffset = 0;
        easyCapoFret = 0;
        easyKeySourceToken = "";
        applyEasyCapoFret(0);
        dispatchEasyKeyChanged();
      }
      currentTransposeVideoId = videoId;
      currentTransposeOffset = transposeOffsetsCache
        ? normalizeTransposeOffset(transposeOffsetsCache[videoId])
        : 0;
      void loadTransposeOffsetForVideo(videoId);
    }
    window.ycEstimatedKey = result;
    window.dispatchEvent(new CustomEvent("yc:estimatedKeyChanged", { detail: result }));
    syncEasyKeyWithCurrentCapo(window.chordsMode || easyKeyMode);
    return result;
  }

  function formatKeyBadge(result = window.ycEstimatedKey) {
    const displayKey = getDisplayKey(result);
    if (!displayKey) return "Key -";
    return `Key ${displayKey.label}`;
  }

  function formatKeyTitle(result = window.ycEstimatedKey) {
    if (!result?.key || !result?.mode) return "Estimated key is not available yet";
    const confidence = Math.round((Number(result.confidence) || 0) * 100);
    const displayKey = getDisplayKey(result);
    const offset = displayKey?.offset || 0;
    const offsetText = offset > 0 ? `+${offset}` : String(offset);
    if (offset) {
      return `Estimated from R chords: ${result.label} (${confidence}% confidence). Transposed to ${displayKey.label} (${offsetText} semitones).`;
    }
    return `Estimated from R chords: ${result.label} (${confidence}% confidence)`;
  }

  window.addEventListener("yc:capoChanged", handleCapoChangedWhileEasy);
  window.addEventListener("yc:capoToggled", handleCapoChangedWhileEasy);
  window.addEventListener("yc:modeChanged", handleModeChangedForEasyKey);
  window.addEventListener("yt-navigate-start", handleNavigationWhileEasy);
  window.addEventListener("yt-navigate-finish", handleNavigationWhileEasy);
  window.addEventListener("popstate", handleNavigationWhileEasy);

  window.ycKeyEstimator = {
    __initialized: true,
    applyTransposeToChord,
    estimateKeyFromChordText,
    estimateKeyFromData,
    formatKeyBadge,
    formatKeyTitle,
    getCurrentTransposeOffset: () => currentTransposeOffset,
    getDisplayKey,
    getTransposeVideoId: () => currentTransposeVideoId,
    loadTransposeOffsetForVideo,
    applyEasyKeyForCurrentMode,
    computeEasyKeyOffsetFromChordText,
    computeEasyKeyOffsetFromData,
    computeEasyCapoFretFromChordText,
    computeEasyCapoFretFromData,
    disableEasyKey,
    enableEasyKeyForMode,
    getEasyKeyState,
    selectRegularChordText,
    selectChordTextForMode,
    setCurrentFromData,
    setCurrentTransposeOffset,
    isEasyKeyActive,
    stepCurrentTranspose,
    toggleEasyKeyForCurrentMode,
    transposeChordName,
    transposeNoteName,
  };
})();
