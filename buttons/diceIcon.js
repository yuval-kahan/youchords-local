/*==============================================================
  YouChords – buttons/diceIcon.js
  --------------------------------------------------------------
  • אייקון קוביות בפינה השמאלית העליונה של הפאנל והקרוסלה
  • מופיע רק ב-hover
  • משתנה לפי theme ומצב פעיל/לא פעיל
  • לחיצה מגרילה פוזיציות רנדומליות לאקורדים
==============================================================*/

// 🎲 משתנים גלובליים לניהול מצב הקוביה
const DICE_STORAGE_KEY = "youchords_dice_active";
const DICE_PERCENTAGE_KEY = "youchords_dice_percentage";
let diceIsActive = localStorage.getItem(DICE_STORAGE_KEY) === "true"; // טעינה מ-localStorage
let dicePercentage = parseInt(localStorage.getItem(DICE_PERCENTAGE_KEY) || "50", 10); // טעינה מ-localStorage, ברירת מחדל 50%
let savedPositionsBeforeDice = new Map(); // שמירת פוזיציות לפני הרנדום
let randomizedPositions = new Map(); // 🎲 שמירת הפוזיציות המוגרלות לשחזור

// 🧹 שמירת references ל-listeners לצורך cleanup
let globalListenersAttached = false;
const hoverListenersMap = new WeakMap(); // container -> {enter, leave}
const GLOBAL_LISTENER_GUARD_KEY = "__YC_DICE_GLOBAL_LISTENERS_ATTACHED__";
let pendingApplyTimer = null;
let rerollOnNextOpen = false;

// ⏱️ Debounce למניעת לחיצות מהירות
let lastDiceClickTime = 0;
const DICE_DEBOUNCE_MS = 300;

/**
 * 💾 שמירת מצב הקוביה ב-localStorage
 */
function saveDiceState() {
  localStorage.setItem(DICE_STORAGE_KEY, diceIsActive.toString());
}

function clearPendingApplyTimer() {
  if (pendingApplyTimer) {
    clearTimeout(pendingApplyTimer);
    pendingApplyTimer = null;
  }
}

function scheduleApplyRandomizedPositionsIfActive(reason = "open") {
  clearPendingApplyTimer();
  pendingApplyTimer = setTimeout(() => {
    pendingApplyTimer = null;
    applyRandomizedPositionsIfActive(reason);
  }, 200);
}

/**
 * SVG של קוביות - 4 גרסאות
 */
const DICE_SVGS = {
  // אפור - לא פעיל, SEPIA/LIGHT
  gray: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="36" height="36">
    <defs>
      <linearGradient id="dg1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#444"/>
        <stop offset="100%" stop-color="#000"/>
      </linearGradient>
      <linearGradient id="dg2" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#555"/>
        <stop offset="100%" stop-color="#111"/>
      </linearGradient>
    </defs>
    <g transform="translate(80,60) rotate(35)">
      <rect x="0" y="20" width="55" height="55" fill="url(#dg1)" stroke="#666" stroke-width="1"/>
      <polygon points="0,20 14,6 69,6 55,20" fill="#555" stroke="#777" stroke-width="1"/>
      <polygon points="55,20 69,6 69,61 55,75" fill="#222" stroke="#444" stroke-width="1"/>
      <circle cx="14" cy="34" r="3.5" fill="white"/>
      <circle cx="41" cy="34" r="3.5" fill="white"/>
      <circle cx="27.5" cy="47.5" r="3.5" fill="white"/>
      <circle cx="14" cy="61" r="3.5" fill="white"/>
      <circle cx="41" cy="61" r="3.5" fill="white"/>
    </g>
    <g transform="translate(115,135) rotate(-25)">
      <rect x="0" y="20" width="55" height="55" fill="url(#dg2)" stroke="#666" stroke-width="1"/>
      <polygon points="0,20 14,6 69,6 55,20" fill="#666" stroke="#888" stroke-width="1"/>
      <polygon points="55,20 69,6 69,61 55,75" fill="#333" stroke="#555" stroke-width="1"/>
      <circle cx="14" cy="34" r="3.5" fill="white"/>
      <circle cx="27.5" cy="47.5" r="3.5" fill="white"/>
      <circle cx="41" cy="61" r="3.5" fill="white"/>
    </g>
  </svg>`,

  // ירוק עם נקודות שחורות - פעיל, SEPIA/LIGHT
  greenBlack: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="36" height="36">
    <defs>
      <filter id="dglow1">
        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <g transform="translate(80,60) rotate(35)" filter="url(#dglow1)">
      <rect x="0" y="20" width="55" height="55" fill="#4ade80" stroke="#22c55e" stroke-width="1.5"/>
      <polygon points="0,20 14,6 69,6 55,20" fill="#22c55e" stroke="#16a34a" stroke-width="1.5"/>
      <polygon points="55,20 69,6 69,61 55,75" fill="#16a34a" stroke="#15803d" stroke-width="1.5"/>
      <circle cx="14" cy="34" r="3.5" fill="black"/>
      <circle cx="41" cy="34" r="3.5" fill="black"/>
      <circle cx="27.5" cy="47.5" r="3.5" fill="black"/>
      <circle cx="14" cy="61" r="3.5" fill="black"/>
      <circle cx="41" cy="61" r="3.5" fill="black"/>
    </g>
    <g transform="translate(115,135) rotate(-25)" filter="url(#dglow1)">
      <rect x="0" y="20" width="55" height="55" fill="#4ade80" stroke="#22c55e" stroke-width="1.5"/>
      <polygon points="0,20 14,6 69,6 55,20" fill="#22c55e" stroke="#16a34a" stroke-width="1.5"/>
      <polygon points="55,20 69,6 69,61 55,75" fill="#16a34a" stroke="#15803d" stroke-width="1.5"/>
      <circle cx="14" cy="34" r="3.5" fill="black"/>
      <circle cx="27.5" cy="47.5" r="3.5" fill="black"/>
      <circle cx="41" cy="61" r="3.5" fill="black"/>
    </g>
  </svg>`,

  // לבן - לא פעיל, BLACK
  white: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="36" height="36">
    <defs>
      <linearGradient id="dw1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="100%" stop-color="#e0e0e0"/>
      </linearGradient>
      <linearGradient id="dw2" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="100%" stop-color="#e5e5e5"/>
      </linearGradient>
    </defs>
    <g transform="translate(80,60) rotate(35)">
      <rect x="0" y="20" width="55" height="55" fill="url(#dw1)" stroke="#999" stroke-width="1.5"/>
      <polygon points="0,20 14,6 69,6 55,20" fill="#f5f5f5" stroke="#aaa" stroke-width="1.5"/>
      <polygon points="55,20 69,6 69,61 55,75" fill="#d0d0d0" stroke="#666" stroke-width="1.5"/>
      <circle cx="14" cy="34" r="3.5" fill="#000"/>
      <circle cx="41" cy="34" r="3.5" fill="#000"/>
      <circle cx="27.5" cy="47.5" r="3.5" fill="#000"/>
      <circle cx="14" cy="61" r="3.5" fill="#000"/>
      <circle cx="41" cy="61" r="3.5" fill="#000"/>
    </g>
    <g transform="translate(115,135) rotate(-25)">
      <rect x="0" y="20" width="55" height="55" fill="url(#dw2)" stroke="#999" stroke-width="1.5"/>
      <polygon points="0,20 14,6 69,6 55,20" fill="#f5f5f5" stroke="#bbb" stroke-width="1.5"/>
      <polygon points="55,20 69,6 69,61 55,75" fill="#d0d0d0" stroke="#777" stroke-width="1.5"/>
      <circle cx="14" cy="34" r="3.5" fill="#000"/>
      <circle cx="27.5" cy="47.5" r="3.5" fill="#000"/>
      <circle cx="41" cy="61" r="3.5" fill="#000"/>
    </g>
  </svg>`,

  // ירוק עם נקודות לבנות - פעיל, BLACK
  greenWhite: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="36" height="36">
    <defs>
      <filter id="dglow2">
        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <g transform="translate(80,60) rotate(35)" filter="url(#dglow2)">
      <rect x="0" y="20" width="55" height="55" fill="#4ade80" stroke="#22c55e" stroke-width="1.5"/>
      <polygon points="0,20 14,6 69,6 55,20" fill="#22c55e" stroke="#16a34a" stroke-width="1.5"/>
      <polygon points="55,20 69,6 69,61 55,75" fill="#16a34a" stroke="#15803d" stroke-width="1.5"/>
      <circle cx="14" cy="34" r="3.5" fill="white"/>
      <circle cx="41" cy="34" r="3.5" fill="white"/>
      <circle cx="27.5" cy="47.5" r="3.5" fill="white"/>
      <circle cx="14" cy="61" r="3.5" fill="white"/>
      <circle cx="41" cy="61" r="3.5" fill="white"/>
    </g>
    <g transform="translate(115,135) rotate(-25)" filter="url(#dglow2)">
      <rect x="0" y="20" width="55" height="55" fill="#4ade80" stroke="#22c55e" stroke-width="1.5"/>
      <polygon points="0,20 14,6 69,6 55,20" fill="#22c55e" stroke="#16a34a" stroke-width="1.5"/>
      <polygon points="55,20 69,6 69,61 55,75" fill="#16a34a" stroke="#15803d" stroke-width="1.5"/>
      <circle cx="14" cy="34" r="3.5" fill="white"/>
      <circle cx="27.5" cy="47.5" r="3.5" fill="white"/>
      <circle cx="41" cy="61" r="3.5" fill="white"/>
    </g>
  </svg>`,
};

/**
 * קבלת ה-SVG המתאים לפי theme ומצב
 * @param {string} theme - 'black', 'sepia', או 'light'
 * @param {boolean} isActive - האם במצב פעיל
 * @returns {string} ה-SVG המתאים
 */
function getDiceSvg(theme, isActive) {
  if (theme === "black") {
    return isActive ? DICE_SVGS.greenWhite : DICE_SVGS.white;
  } else {
    // sepia או light
    return isActive ? DICE_SVGS.greenBlack : DICE_SVGS.gray;
  }
}

/**
 * זיהוי ה-theme הנוכחי מהפאנל
 * @returns {string} 'black', 'sepia', או 'light'
 */
function detectCurrentTheme() {
  const panel = document.querySelector(".yt-lyrics-chords-panel");
  if (panel) {
    if (panel.classList.contains("black-theme")) return "black";
    if (panel.classList.contains("light-theme")) return "light";
  }
  return "sepia"; // ברירת מחדל
}

/**
 * יצירת אייקון קוביות
 * @param {HTMLElement} container - האלמנט שבו להוסיף את האייקון
 * @param {string} type - 'panel' או 'carousel'
 * @returns {HTMLElement} אלמנט האייקון
 */
function createDiceIcon(container, type) {
  if (!container) {
    console.warn("[DiceIcon] No container provided");
    return null;
  }

  // בדיקה אם כבר קיים
  const existing = container.querySelector(".yc-dice-icon");
  if (existing) {
    return existing;
  }

  const theme = detectCurrentTheme();
  const isActive = diceIsActive; // סנכרון עם מצב הקוביה הגלובלי

  // יצירת האלמנט
  const diceIcon = document.createElement("div");
  diceIcon.className = `yc-dice-icon yc-dice-${type}`;
  diceIcon.innerHTML = getDiceSvg(theme, isActive);
  diceIcon.dataset.type = type;
  diceIcon.dataset.active = isActive.toString();
  diceIcon.title = "Random Chord";

  // הוספת סגנונות inline
  // בפאנל - תמיד נראית (opacity: 1), בקרוסלה - רק ב-hover (opacity: 0)
  const isPreviewAnchor =
    type === "panel" && container.classList.contains("yc-preview-capo-dice-anchor");

  Object.assign(
    diceIcon.style,
    isPreviewAnchor
      ? {
          position: "relative",
          top: "0",
          left: "0",
          width: "36px",
          height: "36px",
          cursor: "pointer",
          opacity: "1",
          transition: "opacity 0.2s ease",
          zIndex: "2",
          order: "1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }
      : {
          position: "absolute",
          top: type === "panel" ? "-5px" : "5px",
          left: type === "panel" ? "0px" : "5px",
          width: "36px",
          height: "36px",
          cursor: "pointer",
          opacity: type === "panel" ? "1" : "0",
          transition: "opacity 0.2s ease",
          zIndex: "100",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }
  );

  // הוספת event listener ללחיצה
  diceIcon.addEventListener("click", handleDiceClick);

  // הוספה ל-container
  container.style.position = "relative"; // וידוא שה-container הוא relative
  container.appendChild(diceIcon);

  console.log(`[DiceIcon] Created for ${type}`);
  return diceIcon;
}

/**
 * עדכון ה-theme של כל אייקוני הקוביות
 * @param {string} theme - 'black', 'sepia', או 'light'
 */
function updateAllDiceThemes(theme) {
  const diceIcons = document.querySelectorAll(".yc-dice-icon");
  diceIcons.forEach((icon) => {
    const isActive = icon.dataset.active === "true";
    icon.innerHTML = getDiceSvg(theme, isActive);
  });
  console.log(`[DiceIcon] Updated theme to ${theme}`);
}

/**
 * עדכון ה-theme רק של הקוביה בפאנל (לא קרוסלה)
 * @param {string} theme - 'black', 'sepia', או 'light'
 */
function updatePanelDiceTheme(theme) {
  const panelDice = document.querySelector(".yc-dice-panel");
  if (!panelDice) return;
  
  const isActive = panelDice.dataset.active === "true";
  panelDice.innerHTML = getDiceSvg(theme, isActive);
  console.log(`[DiceIcon] Updated panel theme to ${theme}`);
}

/**
 * עדכון מצב פעיל/לא פעיל של אייקון
 * @param {HTMLElement} icon - אלמנט האייקון
 * @param {boolean} isActive - האם פעיל
 */
function setDiceActive(icon, isActive) {
  if (!icon) return;

  icon.dataset.active = isActive.toString();
  
  // קרוסלה תמיד אפורה (sepia), פאנל לפי theme
  const isCarousel = icon.classList.contains("yc-dice-carousel");
  const theme = isCarousel ? "sepia" : detectCurrentTheme();
  icon.innerHTML = getDiceSvg(theme, isActive);
}

/**
 * הוספת hover listeners ל-container
 * @param {HTMLElement} container - האלמנט
 */
function setupDiceHoverListeners(container) {
  if (!container) return;

  const diceIcon = container.querySelector(".yc-dice-icon");
  if (!diceIcon) return;

  // בדיקה אם כבר יש listeners על ה-container
  if (hoverListenersMap.has(container)) return;

  const enterHandler = () => {
    diceIcon.style.opacity = "1";
  };
  const leaveHandler = () => {
    diceIcon.style.opacity = "0";
  };

  container.addEventListener("mouseenter", enterHandler);
  container.addEventListener("mouseleave", leaveHandler);

  // שמירה ב-WeakMap לצורך cleanup
  hoverListenersMap.set(container, {
    enter: enterHandler,
    leave: leaveHandler,
  });
}

/**
 * הסרת hover listeners מ-container
 * @param {HTMLElement} container - האלמנט
 */
function removeDiceHoverListeners(container) {
  if (!container) return;

  const handlers = hoverListenersMap.get(container);
  if (handlers) {
    container.removeEventListener("mouseenter", handlers.enter);
    container.removeEventListener("mouseleave", handlers.leave);
    hoverListenersMap.delete(container);
  }
}

/**
 * בדיקה אם הקוביה מופעלת (מהתפריט)
 */
function isDiceFeatureEnabled() {
  return localStorage.getItem("youchords_dice_enabled") !== "false";
}

/**
 * אתחול אייקון קוביות לפאנל
 */
function initPanelDiceIcon() {
  // Feature gate: do not render panel dice when disabled
  if (!isDiceFeatureEnabled()) {
    console.log("[DiceIcon] Dice feature disabled - skipping panel icon");
    return null;
  }

  const panel = document.querySelector(".yt-lyrics-chords-panel");
  if (!panel) return null;

  const previewAnchor = document.querySelector(".yc-preview-capo-dice-anchor");
  if (!previewAnchor) return null;

  const icon = createDiceIcon(previewAnchor, "panel");
  // Panel dice stays visible, no hover listeners needed

  // Re-apply randomized positions when dice is active
  scheduleApplyRandomizedPositionsIfActive("panel-open");

  return icon;
}

/**
 * אתחול אייקון קוביות לקרוסלה
 */
function initCarouselDiceIcon() {
  // 🎲 בדיקה אם הקוביה מופעלת
  if (!isDiceFeatureEnabled()) {
    console.log("[DiceIcon] 🎲 Dice feature disabled - skipping carousel icon");
    return null;
  }

  const wrapper = document.querySelector(".yc-root-wrapper");
  const carousel = document.querySelector(".yc-chord-carousel");
  if (!wrapper || !carousel) return null;

  // בדיקה אם כבר קיים
  let icon = wrapper.querySelector(".yc-dice-icon");
  if (!icon) {
    // קרוסלה תמיד אפורה (sepia) - לא תלויה ב-theme של הפאנל!
    icon = document.createElement("div");
    icon.className = "yc-dice-icon yc-dice-carousel";
    icon.innerHTML = getDiceSvg("sepia", diceIsActive); // תמיד sepia = אפור
    icon.dataset.type = "carousel";
    icon.dataset.active = diceIsActive.toString();
    icon.title = "Random Chord";

    // position: absolute יחסית ל-wrapper
    Object.assign(icon.style, {
      position: "absolute",
      left: "2px",
      top: "-2px",
      width: "36px",
      height: "36px",
      cursor: "pointer",
      opacity: "0",
      transition: "opacity 0.2s ease",
      zIndex: "100",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    });

    icon.addEventListener("click", handleDiceClick);

    // מוסיפים ל-wrapper (לא לקרוסלה) כדי שלא יזוז עם הגלילה
    wrapper.appendChild(icon);
  }

  // 🎲 אם הקוביה פעילה - החל פוזיציות מוגרלות
  scheduleApplyRandomizedPositionsIfActive("carousel-open");

  // ה-hover מטופל ב-CSS דרך .html5-video-player:hover .yc-dice-carousel
  return icon;
}

/**
 * ניקוי אייקוני קוביות
 * @param {boolean} fullCleanup - האם לנקות גם global listeners (ברירת מחדל: false)
 */
function cleanupDiceIcons(fullCleanup = false) {
  clearPendingApplyTimer();
  const icons = document.querySelectorAll(".yc-dice-icon");

  // הסרת hover listeners מכל ה-containers לפני מחיקת האייקונים
  icons.forEach((icon) => {
    const container = icon.parentElement;
    if (container) {
      removeDiceHoverListeners(container);
    }
    icon.remove();
  });

  // ניקוי מצב הקוביה
  diceIsActive = false;
  saveDiceState(); // 💾 שמירה ב-localStorage
  savedPositionsBeforeDice.clear();
  randomizedPositions.clear();

  // ניקוי מלא - גם global listeners
  rerollOnNextOpen = false;

  if (fullCleanup) {
    detachGlobalListeners();
  }

  console.log("[DiceIcon] Cleaned up", fullCleanup ? "(full)" : "");
}

/**
 * 🎲 הגרלת פוזיציות רנדומליות לאקורדים
 */
function rollRandomPositions() {
  if (!window.currentChordPositions) {
    console.warn("[DiceIcon] Missing currentChordPositions");
    return;
  }
  if (!window.PANEL_SUBSET || !window.PANEL_SUBSET.chords) {
    console.warn("[DiceIcon] Missing PANEL_SUBSET");
    return;
  }

  // שמירת הפוזיציות הנוכחיות (רק בפעם הראשונה)
  if (savedPositionsBeforeDice.size === 0) {
    savedPositionsBeforeDice = new Map(window.currentChordPositions);
    console.log(
      "[DiceIcon] 🎲 Saved",
      savedPositionsBeforeDice.size,
      "positions"
    );
  }

  // קבלת רשימת האקורדים לפי ה-MODE הנוכחי
  const currentMode = window.chordsMode || "regular";
  let chordNames;

  if (window.PANEL_SUBSET && window.PANEL_SUBSET.modes) {
    // שימוש ברשימת האקורדים של ה-MODE הנוכחי
    const modeKey =
      currentMode === "regularPlus"
        ? "Regular+"
        : currentMode === "harmonic"
        ? "Harmonic"
        : currentMode === "harmonicPlus"
        ? "Harmonic+"
        : "Regular";
    chordNames = window.PANEL_SUBSET.modes[modeKey] || [];
    console.log(`[DiceIcon] 🎲 Mode: ${modeKey}, Chords: ${chordNames.length}`);
  } else {
    // fallback - כל האקורדים
    chordNames = Array.from(window.currentChordPositions.keys());
  }

  const totalChords = chordNames.length;
  const chordsToRandomize = Math.ceil((totalChords * dicePercentage) / 100);

  // 🎯 קבלת טווח הפוזיציות מההגדרות
  const DICE_RANGE_KEY = "youchords_dice_position_range";
  const rangeStr = localStorage.getItem(DICE_RANGE_KEY) || "1-MAX";

  console.log(
    `[DiceIcon] 🎲 Rolling ${chordsToRandomize}/${totalChords} (${dicePercentage}%) with range: ${rangeStr}`
  );

  // 🎲 Fisher-Yates Shuffle - ערבוב אחיד מתמטית
  const shuffled = [...chordNames];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selectedChords = shuffled.slice(0, chordsToRandomize);
  const changedChords = []; // 🎯 רק אקורדים שהשתנו

  selectedChords.forEach((chordName) => {
    const currentPos = window.currentChordPositions.get(chordName) || 0;
    const positionsArray = window.PANEL_SUBSET.chords[chordName];

    if (!positionsArray || positionsArray.length <= 1) return;

    // 🎯 קבלת טווח הפוזיציות מההגדרות
    const DICE_RANGE_KEY = "youchords_dice_position_range";
    const rangeStr = localStorage.getItem(DICE_RANGE_KEY) || "1-MAX";
    const [minStr, maxStr] = rangeStr.split('-');
    const minPos = parseInt(minStr) - 1; // המרה ל-0-based index
    const maxPos = maxStr === 'MAX' ? positionsArray.length - 1 : Math.min(parseInt(maxStr) - 1, positionsArray.length - 1);

    // סינון הפוזיציות לפי הטווח
    const availablePositions = [];
    for (let i = minPos; i <= maxPos; i++) {
      if (i >= 0 && i < positionsArray.length) {
        availablePositions.push(i);
      }
    }

    if (availablePositions.length === 0) return; // אין פוזיציות זמינות בטווח

    // הגרלת פוזיציה שונה מהנוכחית (מתוך הטווח)
    let newPos,
      attempts = 0;
    do {
      const randomIndex = Math.floor(Math.random() * availablePositions.length);
      newPos = availablePositions[randomIndex];
      attempts++;
    } while (newPos === currentPos && attempts < 10 && availablePositions.length > 1);

    if (newPos !== currentPos) {
      window.currentChordPositions.set(chordName, newPos);
      changedChords.push(chordName); // 🎯 שמירת שם האקורד שהשתנה
    }
  });

  // 🎲 שמירת הפוזיציות המוגרלות לשחזור בפתיחה מחדש
  randomizedPositions = new Map(window.currentChordPositions);

  console.log(`[DiceIcon] 🎲 Changed ${changedChords.length} positions`);
  
  // 🎯 רענון רק אקורדים שהשתנו (אופטימיזציה)
  refreshChangedChords(changedChords);
}

/**
 * 🔄 החזרת הפוזיציות המקוריות
 */
function restoreOriginalPositions() {
  if (savedPositionsBeforeDice.size === 0) return;

  console.log(
    "[DiceIcon] 🔄 Restoring",
    savedPositionsBeforeDice.size,
    "positions"
  );
  savedPositionsBeforeDice.forEach((pos, name) => {
    window.currentChordPositions.set(name, pos);
  });
  savedPositionsBeforeDice.clear();
  randomizedPositions.clear();
  refreshAllDisplays();
}

/**
 * 🎯 רענון רק אקורדים שהשתנו - אופטימיזציה
 * @param {string[]} changedChords - רשימת שמות האקורדים שהשתנו
 */
function refreshChangedChords(changedChords) {
  if (!window.chordRenderer || !window.chordRenderer.refreshAllMatchingChords) {
    return;
  }
  if (!changedChords || changedChords.length === 0) {
    console.log("[DiceIcon] 🔄 No chords to refresh");
    return;
  }

  // שימוש ב-requestAnimationFrame למניעת עומס על ה-UI
  requestAnimationFrame(() => {
    changedChords.forEach((chordName) => {
      window.chordRenderer.refreshAllMatchingChords(chordName);
    });
    console.log(`[DiceIcon] 🎯 Refreshed ${changedChords.length} changed chords`);
  });
}

/**
 * 🔄 רענון כל התצוגות - אופטימיזציה עם RAF ו-batch
 */
function refreshAllDisplays() {
  if (!window.chordRenderer || !window.chordRenderer.refreshAllMatchingChords) {
    return;
  }

  // שימוש ב-requestAnimationFrame למניעת עומס על ה-UI
  requestAnimationFrame(() => {
    // Query אחד לכל האקורדים במקום query לכל אקורד
    const allChordContainers = document.querySelectorAll("[data-chord-name]");
    const processedChords = new Set();
    let refreshedCount = 0;

    allChordContainers.forEach((container) => {
      const chordName = container.dataset.chordName;
      // רענון כל אקורד רק פעם אחת
      if (chordName && !processedChords.has(chordName)) {
        processedChords.add(chordName);
        window.chordRenderer.refreshAllMatchingChords(chordName);
        refreshedCount++;
      }
    });

    console.log(`[DiceIcon] 🔄 Refreshed ${refreshedCount} unique chords`);
  });
}

/**
 * בדיקה אם פאנל או קרוסלה פתוחים
 */
function isPanelOrCarouselOpen() {
  const panelOpen = !!document.querySelector(".yt-lyrics-chords-panel");
  const carouselOpen = !!document.querySelector(".yc-chord-carousel");
  return panelOpen || carouselOpen;
}

/**
 * 🎲 החלת/הגרלת פוזיציות כשפותחים פאנל/קרוסלה מחדש (אם הקוביה פעילה)
 * - אם האחר פתוח: מחיל את הפוזיציות הקיימות
 * - אם שניהם סגורים: הגרלה חדשה
 * נקרא מ-initPanel ו-initCarousel
 */
function applyRandomizedPositionsIfActive(reason = "open") {
  if (!diceIsActive) return false;

  if (!window.currentChordPositions) {
    console.warn("[DiceIcon] Missing currentChordPositions");
    return false;
  }

  if (rerollOnNextOpen) {
    console.log(
      `[DiceIcon] 🎲 Re-rolling on open (reason=${reason})`
    );
    randomizedPositions.clear();
    rerollOnNextOpen = false;
  }

  // בדיקה אם יש פוזיציות מוגרלות שמורות
  if (randomizedPositions.size > 0) {
    // יש פוזיציות שמורות - מחיל אותן (לא הגרלה חדשה)
    console.log(
      "[DiceIcon] 🎲 Re-applying",
      randomizedPositions.size,
      "saved positions"
    );
    randomizedPositions.forEach((pos, name) => {
      window.currentChordPositions.set(name, pos);
    });
    setTimeout(() => refreshAllDisplays(), 100);
    return true;
  }

  // אין פוזיציות שמורות - הגרלה חדשה
  console.log(
    "[DiceIcon] 🎲 No saved positions - rolling NEW random positions"
  );
  rollRandomPositions();
  return true;
}

/**
 * 🎲 Toggle הקוביה
 */
function toggleDice() {
  diceIsActive = !diceIsActive;
  saveDiceState(); // 💾 שמירה ב-localStorage
  console.log(`[DiceIcon] 🎲 Dice ${diceIsActive ? "ON" : "OFF"}`);

  // עדכון כל הקוביות
  document.querySelectorAll(".yc-dice-icon").forEach((icon) => {
    setDiceActive(icon, diceIsActive);
  });

  if (diceIsActive) {
    clearPendingApplyTimer();
    rerollOnNextOpen = false;
    rollRandomPositions();
  } else {
    clearPendingApplyTimer();
    rerollOnNextOpen = false;
    restoreOriginalPositions();
  }
}

/**
 * 🎲 טיפול בלחיצה - עם debounce
 */
function handleDiceClick(e) {
  e.stopPropagation();
  
  // Debounce - מניעת לחיצות מהירות
  const now = Date.now();
  if (now - lastDiceClickTime < DICE_DEBOUNCE_MS) {
    console.log("[DiceIcon] ⏱️ Debounced click");
    return;
  }
  lastDiceClickTime = now;
  
  toggleDice();
}

// חשיפה גלובלית
window.DiceIcon = {
  create: createDiceIcon,
  initPanel: initPanelDiceIcon,
  initCarousel: initCarouselDiceIcon,
  updateTheme: updateAllDiceThemes,
  updatePanelTheme: updatePanelDiceTheme,
  setActive: setDiceActive,
  cleanup: cleanupDiceIcons,
  detectTheme: detectCurrentTheme,
  toggle: toggleDice,
  isActive: () => diceIsActive,
  setPercentage: (p) => {
    dicePercentage = Math.max(5, Math.min(100, p));
  },
  getPercentage: () => dicePercentage,
  setPositionRange: (range) => {
    // Store the range in localStorage (already done in the menu)
    console.log("[DiceIcon] 🎯 Position range updated:", range);
  },
  applyIfActive: applyRandomizedPositionsIfActive,
  // 🔌 ניהול listeners
  attachListeners: attachGlobalListeners,
  detachListeners: detachGlobalListeners,
  setupHover: setupDiceHoverListeners,
  removeHover: removeDiceHoverListeners,
};

// 🎨 Handler לשינוי theme - מעדכן רק את הפאנל, לא את הקרוסלה!
function handleThemeChanged(e) {
  const theme = e.detail?.theme?.toLowerCase() || detectCurrentTheme();
  console.log("[DiceIcon] 🎨 Theme:", theme);
  updatePanelDiceTheme(theme); // רק פאנל, לא קרוסלה!
}

// 🎵 Handler לשינוי MODE
function handleModeChanged() {
  if (diceIsActive) {
    console.log("[DiceIcon] 🎵 Mode changed - clearing saved and re-rolling");
    savedPositionsBeforeDice.clear();
    setTimeout(rollRandomPositions, 100);
  }
}

// SPA navigation: clear saved positions and force reroll on next open.
function handleNavigateStart() {
  console.log("[DiceIcon] Video changed - clearing positions (dice stays:", diceIsActive, ")");
  clearPendingApplyTimer();
  savedPositionsBeforeDice.clear();
  randomizedPositions.clear();
  rerollOnNextOpen = true;
}

// Panel close: if dice is active, force reroll on next open.
function handlePanelClosing() {
  if (!diceIsActive) return;
  clearPendingApplyTimer();
  rerollOnNextOpen = true;
  randomizedPositions.clear();
  console.log("[DiceIcon] Panel closed - next open will trigger a new roll");
}

// Carousel close: if dice is active, force reroll on next open.
function handleCarouselClosing() {
  if (!diceIsActive) return;
  clearPendingApplyTimer();
  rerollOnNextOpen = true;
  randomizedPositions.clear();
  console.log("[DiceIcon] Carousel closed - next open will trigger a new roll");
}

// 🎲 Handler לשינוי מצב הקוביה מהתפריט
function handleDiceEnabledChanged(e) {
  const enabled = e.detail?.enabled;
  console.log("[DiceIcon] 🎲 Dice enabled changed:", enabled);

  if (!enabled) {
    // כיבוי - החזרת פוזיציות מקוריות אם הקוביה הייתה פעילה
    if (diceIsActive) {
      restoreOriginalPositions();
    }
    // הסרת כל הקוביות
    cleanupDiceIcons();
  } else {
    // הפעלה - יצירת קוביות אם פאנל/קרוסלה פתוחים
    const panelOpen = !!document.querySelector(".yt-lyrics-chords-panel");
    const carouselOpen = !!document.querySelector(".yc-chord-carousel");

    if (panelOpen) {
      initPanelDiceIcon();
      console.log("[DiceIcon] 🎲 Created panel dice icon");
    }
    if (carouselOpen) {
      initCarouselDiceIcon();
      console.log("[DiceIcon] 🎲 Created carousel dice icon");
    }
  }
}

/**
 * 🔌 הוספת global listeners (פעם אחת בלבד)
 */
function attachGlobalListeners() {
  if (globalListenersAttached) return;

  if (window[GLOBAL_LISTENER_GUARD_KEY]) {
    console.log("[DiceIcon] Global listeners already attached (guard)");
    return;
  }

  window.addEventListener("yc:themeChanged", handleThemeChanged);
  window.addEventListener("yc:modeChanged", handleModeChanged);
  window.addEventListener("yt-navigate-start", handleNavigateStart);
  window.addEventListener("yc:panelClosing", handlePanelClosing);
  window.addEventListener("yc:carouselClosing", handleCarouselClosing);
  window.addEventListener("yc:diceEnabledChanged", handleDiceEnabledChanged);

  globalListenersAttached = true;
  window[GLOBAL_LISTENER_GUARD_KEY] = true;
  console.log("[DiceIcon] Global listeners attached");
}

/**
 * 🔌 הסרת global listeners
 */
function detachGlobalListeners() {
  if (!globalListenersAttached) return;

  window.removeEventListener("yc:themeChanged", handleThemeChanged);
  window.removeEventListener("yc:modeChanged", handleModeChanged);
  window.removeEventListener("yt-navigate-start", handleNavigateStart);
  window.removeEventListener("yc:panelClosing", handlePanelClosing);
  window.removeEventListener("yc:carouselClosing", handleCarouselClosing);
  window.removeEventListener("yc:diceEnabledChanged", handleDiceEnabledChanged);

  globalListenersAttached = false;
  window[GLOBAL_LISTENER_GUARD_KEY] = false;
  console.log("[DiceIcon] Global listeners detached");
}

// אתחול - הוספת listeners פעם אחת
attachGlobalListeners();

console.log("[DiceIcon] Module loaded");

