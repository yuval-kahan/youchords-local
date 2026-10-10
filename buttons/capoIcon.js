/*==============================================================
  YouChords – buttons/capoIcon.js
  --------------------------------------------------------------
  • אייקון קאפו + מספר סריג בפאנל ובקרוסלה
  • לחיצה על האייקון מפעילה/מכבה את הקאפו (ירוק = פעיל)
  • לחיצה על המספר פותחת dropdown לבחירת סריג (1-12)
  • סנכרון בין פאנל לקרוסלה
==============================================================*/

// 🎸 מצב גלובלי - Storage Keys
const CAPO_FEATURE_ENABLED_KEY = "youchords_capo_feature_enabled";
const CAPO_SYNC_ENABLED_KEY = "youchords_capo_sync_enabled";
const CAPO_SHOW_RELATIVE_CHANGE_KEY = "youchords_capo_show_relative_change";
const CAPO_SHOW_BASE_CHANGE_KEY = "youchords_capo_show_base_change";
// מצב משותף (כש-Sync ON)
const CAPO_SHARED_ACTIVE_KEY = "youchords_capo_active";
const CAPO_SHARED_FRET_KEY = "youchords_capo_fret";
// מצב נפרד לפאנל (כש-Sync OFF)
const CAPO_PANEL_ACTIVE_KEY = "youchords_capo_panel_active";
const CAPO_PANEL_FRET_KEY = "youchords_capo_panel_fret";
// מצב נפרד לקרוסלה (כש-Sync OFF)
const CAPO_CAROUSEL_ACTIVE_KEY = "youchords_capo_carousel_active";
const CAPO_CAROUSEL_FRET_KEY = "youchords_capo_carousel_fret";

// 🎸 מצב גלובלי - Variables
let isCapoFeatureEnabled = localStorage.getItem(CAPO_FEATURE_ENABLED_KEY) !== "false";
let isSyncEnabled = localStorage.getItem(CAPO_SYNC_ENABLED_KEY) !== "false"; // ברירת מחדל: ON

// מצב משותף
let sharedCapoActive = localStorage.getItem(CAPO_SHARED_ACTIVE_KEY) === "true";
let sharedCapoFret = parseInt(localStorage.getItem(CAPO_SHARED_FRET_KEY) || "1", 10);

// מצב נפרד לפאנל
let panelCapoActive = localStorage.getItem(CAPO_PANEL_ACTIVE_KEY) === "true";
let panelCapoFret = parseInt(localStorage.getItem(CAPO_PANEL_FRET_KEY) || "1", 10);

// מצב נפרד לקרוסלה
let carouselCapoActive = localStorage.getItem(CAPO_CAROUSEL_ACTIVE_KEY) === "true";
let carouselCapoFret = parseInt(localStorage.getItem(CAPO_CAROUSEL_FRET_KEY) || "1", 10);

let activeDropdown = null;
let activeDropdownType = null;
let activeDropdownAnchor = null;

// 🧹 שמירת references ל-listeners לצורך cleanup
let globalListenersAttached = false;

/**
 * 🎸 Helper functions לקבלת מצב לפי סוג (panel/carousel)
 */
function getCapoActiveForType(type) {
  if (isSyncEnabled) return sharedCapoActive;
  return type === "panel" ? panelCapoActive : carouselCapoActive;
}

function getCapoFretForType(type) {
  if (isSyncEnabled) return sharedCapoFret;
  return type === "panel" ? panelCapoFret : carouselCapoFret;
}

function shouldShowRelativeChange() {
  return localStorage.getItem(CAPO_SHOW_RELATIVE_CHANGE_KEY) === "true";
}

function shouldShowBaseChange() {
  return localStorage.getItem(CAPO_SHOW_BASE_CHANGE_KEY) === "true";
}

function formatCapoToneDelta(fretDelta) {
  const sign = fretDelta >= 0 ? "+" : "-";
  const toneValue = Math.abs(fretDelta) / 2;
  const normalized = Number.isInteger(toneValue)
    ? String(toneValue)
    : toneValue.toFixed(1).replace(/\.0$/, "");
  return `${sign}${normalized}T`;
}

function refreshActiveDropdown() {
  if (!activeDropdown || !activeDropdownAnchor || !activeDropdownType) return;
  if (!activeDropdownAnchor.isConnected) {
    closeDropdown();
    return;
  }

  const anchor = activeDropdownAnchor;
  const type = activeDropdownType;
  closeDropdown();
  createFretDropdown(anchor, type);
}

function setCapoDropdownOption(storageKey, enabled) {
  localStorage.setItem(storageKey, enabled.toString());
  refreshActiveDropdown();
}

function createFretCell(fret, currentFret, isBlack, showBase, type) {
  const cell = document.createElement("div");
  cell.className = "yc-capo-fret-cell";
  const isSelected = fret === currentFret;

  Object.assign(cell.style, {
    minWidth: showBase ? "56px" : "32px",
    minHeight: showBase ? "48px" : "32px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: showBase ? "space-between" : "center",
    cursor: "pointer",
    borderRadius: "6px",
    fontWeight: isSelected ? "bold" : "normal",
    color: isSelected ? "#22c55e" : (isBlack ? "#fff" : "#333"),
    background: isSelected ? (isBlack ? "#444" : "#e8f5e9") : "transparent",
    transition: "background 0.15s ease",
    padding: showBase ? "4px 6px 5px" : "0",
    boxSizing: "border-box",
  });

  if (showBase) {
    const baseLabel = document.createElement("div");
    baseLabel.textContent = `Σ ${formatCapoToneDelta(fret)}`;
    Object.assign(baseLabel.style, {
      fontSize: "10px",
      lineHeight: "1",
      opacity: "0.9",
      whiteSpace: "nowrap",
    });
    cell.appendChild(baseLabel);
  }

  const fretLabel = document.createElement("div");
  fretLabel.textContent = fret;
  Object.assign(fretLabel.style, {
    fontSize: "14px",
    lineHeight: "1.1",
    fontWeight: isSelected ? "700" : "600",
  });
  cell.appendChild(fretLabel);

  cell.addEventListener("mouseenter", () => {
    if (!isSelected) cell.style.background = isBlack ? "#444" : "#f0f0f0";
  });
  cell.addEventListener("mouseleave", () => {
    if (!isSelected) cell.style.background = "transparent";
  });
  cell.addEventListener("click", (e) => {
    e.stopPropagation();
    saveCapoFret(type, fret);
    closeDropdown();
  });

  return cell;
}

function createRelativeGapCell(showBase, isBlack) {
  const gapCell = document.createElement("div");
  gapCell.className = "yc-capo-relative-gap";
  gapCell.textContent = `Δ ${formatCapoToneDelta(1)}`;
  Object.assign(gapCell.style, {
    minWidth: "52px",
    minHeight: showBase ? "48px" : "32px",
    display: "flex",
    alignItems: showBase ? "flex-end" : "center",
    justifyContent: "center",
    paddingBottom: showBase ? "7px" : "0",
    boxSizing: "border-box",
    fontSize: "10px",
    fontWeight: "600",
    color: isBlack ? "#cfcfcf" : "#666",
    whiteSpace: "nowrap",
    userSelect: "none",
    pointerEvents: "none",
  });
  return gapCell;
}

/**
 * SVG של קאפו - 3 גרסאות
 */
const CAPO_SVGS = {
  // אפור - לא פעיל, SEPIA/LIGHT
  gray: `<svg width="36" height="36" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .capo-outline { fill: none; stroke: #555; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
      .capo-rubber { fill: none; stroke: #555; stroke-width: 2; }
      .capo-detail { fill: none; stroke: #555; stroke-width: 1.5; stroke-linecap: round; }
    </style>
  </defs>
  <path class="capo-outline" d="M95,80 C180,70 280,85 340,100 Q350,102 348,112 L345,120 C280,105 180,95 110,105 Z" />
  <path class="capo-rubber" d="M115,105 C180,98 280,108 340,122 L338,130 C280,115 180,105 118,115 Z" />
  <path class="capo-outline" d="M95,80 C70,85 75,130 80,150 C85,170 85,210 70,250 C60,280 65,330 85,360 Q95,370 100,355 C90,320 95,280 105,250 C115,220 120,180 110,150" />
  <path class="capo-rubber" d="M82,160 C88,180 88,210 78,240 L82,245 C95,210 95,180 88,160 Z" />
  <circle cx="100" cy="115" r="18" fill="white" stroke="#555" stroke-width="3"/>
  <circle cx="100" cy="115" r="8" fill="none" stroke="#555" stroke-width="1.5"/>
  <g transform="translate(-1, 24) rotate(52, 100, 115) scale(1, 1)">
    <path class="capo-outline" d="M115,105 C130,95 160,100 190,90 C230,75 260,30 280,-20 Q285,-35 270,-30 C240,20 210,60 180,70 C150,80 130,70 120,80 L110,100" />
    <path class="capo-detail" d="M190,80 C220,60 240,30 255,0" />
  </g>
  <g transform="translate(6, 84) rotate(-172, 314, 156.5) scale(1, 0.7)">
    <path class="capo-outline" d="M268,48 C310,75 348,125 368,200 C372,220 370,255 358,265Q345,275 348,245C355,180 325,100 272,60Z" />
    <path class="capo-detail" d="M280,65C320,95 345,140 352,200" opacity="0.5" />
  </g>
</svg>`,

  // לבן - לא פעיל, BLACK theme
  white: `<svg width="36" height="36" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .capo-outline-w { fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
      .capo-rubber-w { fill: none; stroke: #fff; stroke-width: 2; }
      .capo-detail-w { fill: none; stroke: #fff; stroke-width: 1.5; stroke-linecap: round; }
    </style>
  </defs>
  <path class="capo-outline-w" d="M95,80 C180,70 280,85 340,100 Q350,102 348,112 L345,120 C280,105 180,95 110,105 Z" />
  <path class="capo-rubber-w" d="M115,105 C180,98 280,108 340,122 L338,130 C280,115 180,105 118,115 Z" />
  <path class="capo-outline-w" d="M95,80 C70,85 75,130 80,150 C85,170 85,210 70,250 C60,280 65,330 85,360 Q95,370 100,355 C90,320 95,280 105,250 C115,220 120,180 110,150" />
  <path class="capo-rubber-w" d="M82,160 C88,180 88,210 78,240 L82,245 C95,210 95,180 88,160 Z" />
  <circle cx="100" cy="115" r="18" fill="#222" stroke="#fff" stroke-width="3"/>
  <circle cx="100" cy="115" r="8" fill="none" stroke="#fff" stroke-width="1.5"/>
  <g transform="translate(-1, 24) rotate(52, 100, 115) scale(1, 1)">
    <path class="capo-outline-w" d="M115,105 C130,95 160,100 190,90 C230,75 260,30 280,-20 Q285,-35 270,-30 C240,20 210,60 180,70 C150,80 130,70 120,80 L110,100" />
    <path class="capo-detail-w" d="M190,80 C220,60 240,30 255,0" />
  </g>
  <g transform="translate(6, 84) rotate(-172, 314, 156.5) scale(1, 0.7)">
    <path class="capo-outline-w" d="M268,48 C310,75 348,125 368,200 C372,220 370,255 358,265Q345,275 348,245C355,180 325,100 272,60Z" />
    <path class="capo-detail-w" d="M280,65C320,95 345,140 352,200" opacity="0.5" />
  </g>
</svg>`,

  // ירוק - פעיל (לכל ה-themes)
  green: `<svg width="36" height="36" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .capo-outline-g { fill: none; stroke: #22c55e; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
      .capo-rubber-g { fill: none; stroke: #22c55e; stroke-width: 2; }
      .capo-detail-g { fill: none; stroke: #22c55e; stroke-width: 1.5; stroke-linecap: round; }
    </style>
  </defs>
  <path class="capo-outline-g" d="M95,80 C180,70 280,85 340,100 Q350,102 348,112 L345,120 C280,105 180,95 110,105 Z" />
  <path class="capo-rubber-g" d="M115,105 C180,98 280,108 340,122 L338,130 C280,115 180,105 118,115 Z" />
  <path class="capo-outline-g" d="M95,80 C70,85 75,130 80,150 C85,170 85,210 70,250 C60,280 65,330 85,360 Q95,370 100,355 C90,320 95,280 105,250 C115,220 120,180 110,150" />
  <path class="capo-rubber-g" d="M82,160 C88,180 88,210 78,240 L82,245 C95,210 95,180 88,160 Z" />
  <circle cx="100" cy="115" r="18" fill="#dcfce7" stroke="#22c55e" stroke-width="3"/>
  <circle cx="100" cy="115" r="8" fill="none" stroke="#22c55e" stroke-width="1.5"/>
  <g transform="translate(-1, 24) rotate(52, 100, 115) scale(1, 1)">
    <path class="capo-outline-g" d="M115,105 C130,95 160,100 190,90 C230,75 260,30 280,-20 Q285,-35 270,-30 C240,20 210,60 180,70 C150,80 130,70 120,80 L110,100" />
    <path class="capo-detail-g" d="M190,80 C220,60 240,30 255,0" />
  </g>
  <g transform="translate(6, 84) rotate(-172, 314, 156.5) scale(1, 0.7)">
    <path class="capo-outline-g" d="M268,48 C310,75 348,125 368,200 C372,220 370,255 358,265Q345,275 348,245C355,180 325,100 272,60Z" />
    <path class="capo-detail-g" d="M280,65C320,95 345,140 352,200" opacity="0.5" />
  </g>
</svg>`,
};

function getCapoSvg(theme, active) {
  if (active) return CAPO_SVGS.green;
  return theme === "black" ? CAPO_SVGS.white : CAPO_SVGS.gray;
}

function detectCurrentTheme() {
  const panel = document.querySelector(".yt-lyrics-chords-panel");
  if (panel) {
    if (panel.classList.contains("black-theme")) return "black";
    if (panel.classList.contains("light-theme")) return "light";
  }
  return "sepia";
}

/**
 * 🎸 שמירת מצב קאפו לפי סוג
 */
function saveCapoState(type, active) {
  if (isSyncEnabled) {
    sharedCapoActive = active;
    localStorage.setItem(CAPO_SHARED_ACTIVE_KEY, active.toString());
  } else {
    if (type === "panel") {
      panelCapoActive = active;
      localStorage.setItem(CAPO_PANEL_ACTIVE_KEY, active.toString());
    } else {
      carouselCapoActive = active;
      localStorage.setItem(CAPO_CAROUSEL_ACTIVE_KEY, active.toString());
    }
  }
}

function saveCapoFret(type, fret, skipProCheck = false) {
  if (isSyncEnabled) {
    sharedCapoFret = fret;
    localStorage.setItem(CAPO_SHARED_FRET_KEY, fret.toString());
    updateAllFretNumbers();
    window.dispatchEvent(new CustomEvent("yc:capoChanged", { detail: { fret, type: "both" } }));
  } else {
    if (type === "panel") {
      panelCapoFret = fret;
      localStorage.setItem(CAPO_PANEL_FRET_KEY, fret.toString());
      updateFretNumber("panel");
      window.dispatchEvent(new CustomEvent("yc:capoChanged", { detail: { fret, type: "panel" } }));
    } else {
      carouselCapoFret = fret;
      localStorage.setItem(CAPO_CAROUSEL_FRET_KEY, fret.toString());
      updateFretNumber("carousel");
      window.dispatchEvent(new CustomEvent("yc:capoChanged", { detail: { fret, type: "carousel" } }));
    }
  }
  console.log(`[CapoIcon] Capo fret set to ${fret} for ${isSyncEnabled ? "both" : type}`);
}

function toggleCapo(type) {
  const currentActive = getCapoActiveForType(type);
  const newActive = !currentActive;
  
  saveCapoState(type, newActive);
  
  if (isSyncEnabled) {
    updateAllCapoIcons();
    window.dispatchEvent(new CustomEvent("yc:capoToggled", { detail: { active: newActive, type: "both" } }));
  } else {
    updateCapoIcon(type);
    window.dispatchEvent(new CustomEvent("yc:capoToggled", { detail: { active: newActive, type } }));
  }
  
  console.log(`[CapoIcon] Capo ${newActive ? "ON" : "OFF"} for ${isSyncEnabled ? "both" : type}`);
}

function setCapoActive(type, active) {
  const nextActive = Boolean(active);
  if (getCapoActiveForType(type) === nextActive) return;

  saveCapoState(type, nextActive);

  if (isSyncEnabled) {
    updateAllCapoIcons();
    window.dispatchEvent(new CustomEvent("yc:capoToggled", { detail: { active: nextActive, type: "both" } }));
  } else {
    updateCapoIcon(type);
    window.dispatchEvent(new CustomEvent("yc:capoToggled", { detail: { active: nextActive, type } }));
  }

  console.log(`[CapoIcon] Capo ${nextActive ? "ON" : "OFF"} for ${isSyncEnabled ? "both" : type}`);
}

function normalizeCapoFret(fret) {
  const parsed = Number.parseInt(fret, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(12, parsed));
}

function applyEasyCapo(fret, type = "both") {
  const safeFret = normalizeCapoFret(fret);

  if (safeFret > 0 && !isCapoFeatureEnabled) {
    setCapoFeatureEnabled(true);
  }

  if (!isCapoFeatureEnabled) {
    window.dispatchEvent(
      new CustomEvent("yc:easyCapoApplied", {
        detail: { fret: safeFret, type },
      })
    );
    return;
  }

  const targetTypes =
    type === "both" && !isSyncEnabled
      ? ["panel", "carousel"]
      : [type === "both" ? "panel" : type];
  targetTypes.forEach((targetType) => {
    if (safeFret > 0) {
      saveCapoFret(targetType, safeFret, true);
    }
    setCapoActive(targetType, safeFret > 0);
  });

  window.dispatchEvent(
    new CustomEvent("yc:easyCapoApplied", {
      detail: { fret: safeFret, type },
    })
  );
}

function updateCapoIcon(type) {
  const theme = detectCurrentTheme();
  const isBlack = theme === "black";
  const isActive = getCapoActiveForType(type);
  
  if (type === "panel") {
    const container = document.querySelector(".yc-capo-panel");
    if (container) {
      const icon = container.querySelector(".yc-capo-icon");
      const fretNum = container.querySelector(".yc-capo-fret-number");
      if (icon) icon.innerHTML = getCapoSvg(theme, isActive);
      if (fretNum) fretNum.style.color = isActive ? "#22c55e" : (isBlack ? "#fff" : "#555");
    }
  } else {
    const container = document.querySelector(".yc-capo-carousel");
    if (container) {
      const icon = container.querySelector(".yc-capo-icon");
      const fretNum = container.querySelector(".yc-capo-fret-number");
      if (icon) icon.innerHTML = getCapoSvg("sepia", isActive);
      if (fretNum) fretNum.style.color = isActive ? "#22c55e" : "#555";
    }
  }
}

function updateAllCapoIcons() {
  updateCapoIcon("panel");
  updateCapoIcon("carousel");
}

function updateFretNumber(type) {
  const fret = getCapoFretForType(type);
  const selector = type === "panel" ? ".yc-capo-panel" : ".yc-capo-carousel";
  const container = document.querySelector(selector);
  if (container) {
    const fretNum = container.querySelector(".yc-capo-fret-number");
    if (fretNum) fretNum.textContent = fret;
  }
}

function updateAllFretNumbers() {
  const panelFret = getCapoFretForType("panel");
  const carouselFret = getCapoFretForType("carousel");
  
  const panelContainer = document.querySelector(".yc-capo-panel");
  if (panelContainer) {
    const fretNum = panelContainer.querySelector(".yc-capo-fret-number");
    if (fretNum) fretNum.textContent = panelFret;
  }
  
  const carouselContainer = document.querySelector(".yc-capo-carousel");
  if (carouselContainer) {
    const fretNum = carouselContainer.querySelector(".yc-capo-fret-number");
    if (fretNum) fretNum.textContent = carouselFret;
  }
}

/**
 * יצירת dropdown - מתווסף ל-container עם position: absolute
 */
function createFretDropdown(anchorEl, type) {
  closeDropdown();

  const isPanel = type === "panel";
  const theme = isPanel ? detectCurrentTheme() : "sepia";
  const isBlack = theme === "black";

  const container = anchorEl.closest(".yc-capo-container");
  if (!container) {
    console.warn("[CapoIcon] Container not found");
    return null;
  }

  const dropdown = document.createElement("div");
  dropdown.className = "yc-capo-dropdown";

  Object.assign(dropdown.style, {
    position: "absolute",
    top: "100%",
    left: "0",
    marginTop: "4px",
    background: isBlack ? "#333" : "#fff",
    border: `1px solid ${isBlack ? "#555" : "#ccc"}`,
    borderRadius: "8px",
    padding: "8px",
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(32px, auto))",
    gap: "4px",
    zIndex: "10000",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  });

  const currentFret = getCapoFretForType(type);

  const showRelative = shouldShowRelativeChange();
  const showBase = shouldShowBaseChange();
  const fretColumnWidth = showBase ? "minmax(56px, auto)" : "minmax(32px, auto)";
  const relativeColumnWidth = "minmax(52px, auto)";

  if (showRelative) {
    dropdown.style.gridTemplateColumns = [
      fretColumnWidth,
      relativeColumnWidth,
      fretColumnWidth,
      relativeColumnWidth,
      fretColumnWidth,
      relativeColumnWidth,
      fretColumnWidth
    ].join(" ");
    dropdown.style.gap = "6px 4px";
  } else {
    dropdown.style.gridTemplateColumns = `repeat(4, ${fretColumnWidth})`;
  }

  for (let rowStart = 1; rowStart <= 12; rowStart += 4) {
    for (let offset = 0; offset < 4; offset += 1) {
      const fret = rowStart + offset;
      dropdown.appendChild(createFretCell(fret, currentFret, isBlack, showBase, type));
      if (showRelative && offset < 3) {
        dropdown.appendChild(createRelativeGapCell(showBase, isBlack));
      }
    }
  }

  container.appendChild(dropdown);
  activeDropdown = dropdown;
  activeDropdownType = type;
  activeDropdownAnchor = anchorEl;

  setTimeout(() => {
    document.addEventListener("click", handleOutsideClick);
  }, 10);

  console.log(`[CapoIcon] Dropdown created for ${type}`);
  return dropdown;
}

function closeDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
    activeDropdownType = null;
    activeDropdownAnchor = null;
    document.removeEventListener("click", handleOutsideClick);
  }
}

function handleOutsideClick(e) {
  if (activeDropdown && !activeDropdown.contains(e.target)) {
    closeDropdown();
  }
}

/**
 * יצירת אייקון קאפו לפאנל
 */
function initPanelCapoIcon() {
  // Feature gate: do not render panel capo when disabled
  if (!isCapoFeatureEnabled) {
    console.log("[CapoIcon] Feature disabled, skipping panel icon");
    return null;
  }

  const panel = document.querySelector(".yt-lyrics-chords-panel");
  if (!panel) return null;

  const previewAnchor = document.querySelector(".yc-preview-capo-dice-anchor");
  if (!previewAnchor) return null;

  if (previewAnchor.querySelector(".yc-capo-panel")) return null;

  const theme = detectCurrentTheme();
  const isBlack = theme === "black";
  const isActive = getCapoActiveForType("panel");
  const fret = getCapoFretForType("panel");

  // Container
  const container = document.createElement("div");
  container.className = "yc-capo-container yc-capo-panel";
  Object.assign(container.style, {
    position: "relative",
    top: "0",
    left: "0",
    display: "inline-flex",
    alignItems: "center",
    flexDirection: "row",
    gap: "2px",
    zIndex: "2",
    order: "2",
    direction: "ltr",
    unicodeBidi: "isolate",
  });

  // Icon click toggles capo state
  const icon = document.createElement("div");
  icon.className = "yc-capo-icon";
  icon.innerHTML = getCapoSvg(theme, isActive);
  icon.title = "Toggle Capo";
  Object.assign(icon.style, {
    width: "36px",
    height: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  });

  icon.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCapo("panel");
  });

  // Fret number click opens dropdown
  const fretNum = document.createElement("div");
  fretNum.className = "yc-capo-fret-number";
  fretNum.textContent = fret;
  Object.assign(fretNum.style, {
    fontSize: "16px",
    fontWeight: "bold",
    color: isActive ? "#22c55e" : (isBlack ? "#fff" : "#555"),
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: "4px",
  });

  fretNum.addEventListener("mouseenter", () => {
    fretNum.style.background = isBlack ? "#444" : "#e0e0e0";
  });
  fretNum.addEventListener("mouseleave", () => {
    fretNum.style.background = "transparent";
  });
  fretNum.addEventListener("click", (e) => {
    e.stopPropagation();
    if (activeDropdown) closeDropdown();
    else createFretDropdown(fretNum, "panel");
  });

  container.appendChild(icon);
  container.appendChild(fretNum);
  previewAnchor.appendChild(container);

  attachGlobalListeners();

  // Keep panel capo placement synced with dice state
  updateCapoPositionByDiceState();

  console.log("[CapoIcon] Created for panel");
  return container;
}

/**
 * יצירת אייקון קאפו לקרוסלה
 */
function initCarouselCapoIcon() {
  // 🆕 אם הפיצ'ר כבוי - לא יוצרים אייקון
  if (!isCapoFeatureEnabled) {
    console.log("[CapoIcon] Feature disabled, skipping carousel icon");
    return null;
  }
  
  const wrapper = document.querySelector(".yc-root-wrapper");
  const carousel = document.querySelector(".yc-chord-carousel");
  if (!wrapper || !carousel) return null;

  if (wrapper.querySelector(".yc-capo-container")) return null;

  const isActive = getCapoActiveForType("carousel");
  const fret = getCapoFretForType("carousel");

  // Container - בדיקה אם Auto Hide מופעל
  const autoHide = localStorage.getItem("youchords_capo_auto_hide") !== "false";
  const container = document.createElement("div");
  container.className = "yc-capo-container yc-capo-carousel";
  Object.assign(container.style, {
    position: "absolute",
    left: "38px",
    top: "-2px",
    display: "flex",
    alignItems: "center",
    flexDirection: "row",
    gap: "2px",
    opacity: "0",
    transition: "opacity 0.2s ease",
    zIndex: "100",
    direction: "ltr",
    unicodeBidi: "isolate",
  });
  
  // אם Auto Hide כבוי - הקאפו תמיד נראה
  if (!autoHide) {
    container.style.setProperty("opacity", "1", "important");
    container.style.setProperty("visibility", "visible", "important");
  }

  // אייקון - לחיצה מפעילה/מכבה
  const icon = document.createElement("div");
  icon.className = "yc-capo-icon";
  icon.innerHTML = getCapoSvg("sepia", isActive);
  icon.title = "Toggle Capo";
  Object.assign(icon.style, {
    width: "36px",
    height: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  });

  icon.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCapo("carousel");
  });

  // מספר - לחיצה פותחת dropdown
  const fretNum = document.createElement("div");
  fretNum.className = "yc-capo-fret-number";
  fretNum.textContent = fret;
  Object.assign(fretNum.style, {
    fontSize: "16px",
    fontWeight: "bold",
    color: isActive ? "#22c55e" : "#555",
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: "4px",
  });

  fretNum.addEventListener("mouseenter", () => {
    fretNum.style.background = "#e0e0e0";
  });
  fretNum.addEventListener("mouseleave", () => {
    fretNum.style.background = "transparent";
  });
  fretNum.addEventListener("click", (e) => {
    e.stopPropagation();
    if (activeDropdown) closeDropdown();
    else createFretDropdown(fretNum, "carousel");
  });

  container.appendChild(icon);
  container.appendChild(fretNum);
  wrapper.appendChild(container);

  // 🎲 עדכון מיקום לפי מצב ה-Dice
  updateCapoPositionByDiceState();

  console.log("[CapoIcon] Created for carousel");
  return container;
}

function updatePanelCapoTheme(theme) {
  const container = document.querySelector(".yc-capo-panel");
  if (!container) return;

  const icon = container.querySelector(".yc-capo-icon");
  const fretNum = container.querySelector(".yc-capo-fret-number");
  const isBlack = theme === "black";
  const isActive = getCapoActiveForType("panel");

  if (icon) icon.innerHTML = getCapoSvg(theme, isActive);
  if (fretNum) fretNum.style.color = isActive ? "#22c55e" : (isBlack ? "#fff" : "#555");

  console.log(`[CapoIcon] Updated panel theme to ${theme}`);
}

function cleanupCapoIcons() {
  closeDropdown();
  document.querySelectorAll(".yc-capo-container").forEach((el) => el.remove());
  detachGlobalListeners();
  console.log("[CapoIcon] Cleaned up");
}

function handleThemeChanged(e) {
  const theme = e.detail?.theme?.toLowerCase() || detectCurrentTheme();
  updatePanelCapoTheme(theme);
}

function attachGlobalListeners() {
  if (globalListenersAttached) return;
  window.addEventListener("yc:themeChanged", handleThemeChanged);
  globalListenersAttached = true;
}

function detachGlobalListeners() {
  if (!globalListenersAttached) return;
  window.removeEventListener("yc:themeChanged", handleThemeChanged);
  globalListenersAttached = false;
}

/**
 * 🎸 פונקציה גלובלית לתרגום אקורד לפי קאפו
 * @param {string} originalChord - שם האקורד המקורי (Am, F, C, etc.)
 * @param {string} type - "panel" או "carousel" (ברירת מחדל: "panel")
 * @returns {string} - האקורד המתורגם אם קאפו פעיל, אחרת האקורד המקורי
 */
function getCapoChord(originalChord, type = "panel") {
  let displayChord = originalChord;

  if (isCapoFeatureEnabled) {
    const isActive = getCapoActiveForType(type);
    const fret = getCapoFretForType(type);

    if (isActive && fret > 0) {
      // capoChords מהשרת משתמש במפתחות string ("1", "2", ...)
      // capoChords מקומי משתמש במפתחות number (1, 2, ...)
      const capoChords = window.PANEL_SUBSET?.capoChords;
      const capoMap = capoChords ? (capoChords[fret] || capoChords[String(fret)]) : null;
      displayChord = capoMap?.[originalChord] || originalChord;
    }
  }

  const transposeOffset = Number(window.ycKeyEstimator?.getCurrentTransposeOffset?.() || 0);
  if (transposeOffset && window.ycKeyEstimator?.applyTransposeToChord) {
    return window.ycKeyEstimator.applyTransposeToChord(displayChord, transposeOffset) || displayChord;
  }

  return displayChord;
}

/**
 * 🆕 הפעלה/כיבוי של פיצ'ר הקאפו
 */
function setCapoFeatureEnabled(enabled) {
  isCapoFeatureEnabled = enabled;
  localStorage.setItem(CAPO_FEATURE_ENABLED_KEY, enabled.toString());
  
  if (enabled) {
    // הפיצ'ר הופעל - יוצרים אייקונים
    initPanelCapoIcon();
    initCarouselCapoIcon();
  } else {
    // הפיצ'ר כבוי - מסירים אייקונים
    cleanupCapoIcons();
  }
  
  // מעדכנים את התצוגה של האקורדים
  window.dispatchEvent(new CustomEvent("yc:capoFeatureToggled", { detail: { enabled } }));
  console.log(`[CapoIcon] Feature ${enabled ? "ENABLED" : "DISABLED"}`);
}

/**
 * 🆕 הפעלה/כיבוי של סנכרון בין פאנל לקרוסלה
 */
function setSyncEnabled(enabled) {
  isSyncEnabled = enabled;
  localStorage.setItem(CAPO_SYNC_ENABLED_KEY, enabled.toString());
  
  // עדכון UI
  updateAllCapoIcons();
  updateAllFretNumbers();
  
  window.dispatchEvent(new CustomEvent("yc:capoSyncToggled", { detail: { enabled } }));
  console.log(`[CapoIcon] Sync ${enabled ? "ENABLED" : "DISABLED"}`);
}

/**
 * 🎲 עדכון מיקום הקאפו לפי מצב ה-Random (Dice)
 * כש-Random OFF - הקאפו תופס את המקום של הקוביה
 * כש-Random ON - הקאפו חוזר למקום שלו
 */
function updateCapoPositionByDiceState() {
  const isDiceEnabled = localStorage.getItem("youchords_dice_enabled") !== "false";
  const autoHideEnabled = localStorage.getItem("youchords_capo_auto_hide") !== "false";
  const shouldSwapWithDice = !autoHideEnabled;
  
  // עדכון מיקום בפאנל
  const panelCapo = document.querySelector(".yc-capo-panel");
  if (panelCapo) {
    const isInPreview = !!panelCapo.closest(".yc-preview-capo-dice-anchor");
    if (isInPreview) {
      panelCapo.style.left = "0px";
      panelCapo.style.order = "2";
    } else {
      panelCapo.style.left = isDiceEnabled ? "36px" : "0px";
      panelCapo.style.order = "";
    }
  }
  
  // עדכון מיקום בקרוסלה (כולל החלפה עם הקוביה כאשר Auto Hide כבוי)
  const carouselCapo = document.querySelector(".yc-capo-carousel");
  const carouselDice = document.querySelector(".yc-dice-carousel");
  let carouselCapoLeft = isDiceEnabled ? "38px" : "2px";
  let carouselDiceLeft = "2px";

  if (isDiceEnabled && shouldSwapWithDice) {
    const capoWidth =
      Math.ceil(
        carouselCapo?.getBoundingClientRect?.().width ||
          carouselCapo?.offsetWidth ||
          66
      ) || 66;
    const swapGapPx = 8;
    carouselCapoLeft = "2px";
    carouselDiceLeft = `${2 + capoWidth + swapGapPx}px`;
  }

  if (carouselCapo) {
    carouselCapo.style.left = carouselCapoLeft;
  }
  if (carouselDice) {
    carouselDice.style.left = carouselDiceLeft;
  }
  
  console.log(
    `[CapoIcon] 🎲 Position updated: Dice ${isDiceEnabled ? "ON" : "OFF"}, AutoHide ${
      autoHideEnabled ? "ON" : "OFF"
    }${isDiceEnabled && shouldSwapWithDice ? " (swapped)" : ""}`
  );
}

// 🎲 האזנה לשינוי מצב ה-Random (Dice)
window.addEventListener("yc:diceEnabledChanged", (e) => {
  updateCapoPositionByDiceState();
});

window.CapoIcon = {
  initPanel: initPanelCapoIcon,
  initCarousel: initCarouselCapoIcon,
  cleanup: cleanupCapoIcons,
  updatePanelTheme: updatePanelCapoTheme,
  detectTheme: detectCurrentTheme,
  // 🎸 פונקציות לפי type
  getFret: (type = "panel") => getCapoFretForType(type),
  setFret: saveCapoFret,
  isActive: (type = "panel") => getCapoActiveForType(type),
  setActive: setCapoActive,
  applyEasyCapo,
  getState: (type = "panel") => ({
    active: getCapoActiveForType(type),
    fret: getCapoFretForType(type),
    syncEnabled: isSyncEnabled,
  }),
  toggle: toggleCapo,
  getCapoChord: getCapoChord,
  setDropdownShowRelativeChange: (enabled) => setCapoDropdownOption(CAPO_SHOW_RELATIVE_CHANGE_KEY, enabled),
  setDropdownShowBaseChange: (enabled) => setCapoDropdownOption(CAPO_SHOW_BASE_CHANGE_KEY, enabled),
  refreshDropdownLayout: refreshActiveDropdown,
  // שליטה על הפיצ'ר
  isFeatureEnabled: () => isCapoFeatureEnabled,
  setFeatureEnabled: setCapoFeatureEnabled,
  FEATURE_KEY: CAPO_FEATURE_ENABLED_KEY,
  // 🆕 שליטה על סנכרון
  isSyncEnabled: () => isSyncEnabled,
  setSyncEnabled: setSyncEnabled,
  SYNC_KEY: CAPO_SYNC_ENABLED_KEY,
  updateCarouselLayout: updateCapoPositionByDiceState,
};

// 🎸 חשיפה גלובלית לנוחות
window.getCapoChord = getCapoChord;

// 🧹 Cleanup on video navigation to prevent memory leaks
window.addEventListener("yt-navigate-start", () => {
  cleanupCapoIcons();
  console.log("[CapoIcon] Cleaned up on navigation");
});

console.log("[CapoIcon] Module loaded");
