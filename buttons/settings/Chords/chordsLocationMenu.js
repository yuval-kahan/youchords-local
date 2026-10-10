// Carousel Direction submenu with RTL/LTR/AUTO options
// This submenu allows users to set the carousel text direction
// chordsLocationMenu.js (repurposed for carousel direction)

// ───────────────────────────────────────────────
// 0. BOOTSTRAP  –  DEBUG FLAG + סימון טעינה
// ───────────────────────────────────────────────

/* ── DEBUG MODE (כיבוי מלא) ──────────────────────────── */
const DBG_ENABLED = false; // כיבוי לוגים לפרודקשן

// נעביר property-getter שמחזיר תמיד false (לכל קוד חיצוני)
Object.defineProperty(window, "DEBUG", {
  get() {
    return false;
  },
  set() {}, // התעלמות מבקשות שינוי
});

/* ל-prod אין צורך בטביעת "loaded" – לכן נמחק לגמרי את ה-console.log */

// ניקוי פונקציות קודמות למניעת הגדרה מחדש של מאזינים
delete window.updateCarouselDirectionState;
delete window.updateCarouselDirection;

// ודא שה-map הגלובלי קיים
window.YC_MENUS = window.YC_MENUS || {};

// ------------------------------------------------------------
// 1.  TOOLING  –  לוגר בסיסי + מלכוד שגיאות גלובלי
// ------------------------------------------------------------
/* פונקציית DBG נשארת, אך לעולם לא תדפיס */
const DBG = () => {};

window.addEventListener("error", (e) => {
  DBG("💥 window.error", e.message, e.filename + ":" + e.lineno);
});

window.addEventListener("unhandledrejection", (e) => {
  DBG("💥 unhandled-rejection", e.reason);
});

// ------------------------------------------------------------
// 2. updateCarouselDirectionState / updateCarouselDirection
// ------------------------------------------------------------

// Helper to update the selected direction in the UI
function updateCarouselDirectionState(direction) {
  const options = document.querySelectorAll(".carousel-direction-option");
  options.forEach((option) => {
    const isSelected = option.dataset.direction === direction;
    option.classList.toggle("selected", isSelected);
    const checkmark = option.querySelector(".checkmark");
    if (checkmark) {
      checkmark.style.visibility = isSelected ? "visible" : "hidden";
    }
    // Update text color to blue when selected
    const label = option.querySelector("span:first-child");
    if (label) {
      label.style.color = isSelected ? "#3ea6ff" : "#fff";
    }
  });
}

// Expose update functions globally so reset/default can reuse
window.updateCarouselDirectionState = updateCarouselDirectionState;

// Global updater when user changes direction
window.updateCarouselDirection = async function (direction) {
  window.carouselDirection = direction;

  // Save to localStorage
  try {
    localStorage.setItem("youchords_carousel_direction", direction);
    DBG("💾 Saved carousel direction to storage:", direction);
  } catch (e) {
    console.warn("[chordsLocationMenu] Failed to store direction", e);
  }

  // Update UI
  updateCarouselDirectionState(direction);

  // Update carousel if it exists
  if (window.ycChordCarousel) {
    // 1. Always update the memory, even if carousel is hidden
    window.ycChordCarousel.currentDirection = direction;
    
    // 2. Apply visual changes only if carousel is visible
    if (window.ycChordCarousel.isVisible) {
      window.ycChordCarousel._applyDirection(direction);
    }
  }

  DBG("[chordsLocationMenu] Carousel direction changed:", direction);
};

// פונקציית עזר לקבלת או יצירת תפריט
function getOrCreateMenu(id, buildFn, parentMenu) {
  let menu = window.YC_MENUS[id];

  // אם יש מופע "יתום" – ננקה אותו לגמרי
  if (menu && !menu.isConnected) {
    window.disposeMenu?.(id);
    menu = null;
  }

  // קיים ומחובר – נחזיר אותו
  if (menu) {
    DBG("getOrCreateMenu – existing instance found");
    parentMenu?.style && (parentMenu.style.display = "none");
    menu.style.display = "block";
    window.placeNearControls?.(menu);
    /* sync UI with last known state in case of mismatch */
    window.updateCarouselDirectionState?.(window.carouselDirection || "LTR");
    return menu;
  }

  // יצירת תפריט חדש
  menu = buildFn(parentMenu);
  menu.dataset.ycMenu = id; // סימון לניקוי מאוחר ב-fullCleanup
  window.YC_MENUS[id] = menu;
  window.placeNearControls?.(menu);
  return menu;
}

// ------------------------------------------------------------
// 3. יצירת / שליפת התפריט via getOrCreateMenu
// ------------------------------------------------------------

// Create direction option with cleanup function
function createDirectionOption(direction, isSelected, onChange) {
  const option = document.createElement("div");
  option.className =
    "settings-item carousel-direction-option" + (isSelected ? " selected" : "");
  option.dataset.direction = direction;
  option.style.cssText = `
        padding: 12px 24px;
        cursor: pointer;
        font-size: 13px;
        color: #fff;
        transition: background 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: space-between;
        user-select: none;
        -webkit-user-select: none;
    `;

  const dirLabel = document.createElement("span");
  dirLabel.textContent = direction;
  // Set text color to blue if selected
  if (isSelected) {
    dirLabel.style.color = "#3ea6ff";
  }

  const checkmark = document.createElement("span");
  checkmark.className = "checkmark";
  checkmark.textContent = "✓";
  checkmark.style.cssText = `
        color: #3ea6ff;
        font-weight: bold;
        visibility: ${isSelected ? "visible" : "hidden"};
    `;

  option.appendChild(dirLabel);
  option.appendChild(checkmark);

  const mouseoverHandler = () => {
    option.style.backgroundColor = "rgba(255,255,255,0.1)";
  };

  const mouseoutHandler = () => {
    // Always remove hover background when mouse leaves
    option.style.backgroundColor = "transparent";
  };

  const clickHandler = () => {
    onChange(direction);
  };

  option.addEventListener("mouseover", mouseoverHandler);
  option.addEventListener("mouseout", mouseoutHandler);
  option.addEventListener("click", clickHandler);

  // Return cleanup function to prevent memory leaks
  const cleanup = () => {
    option.removeEventListener("mouseover", mouseoverHandler);
    option.removeEventListener("mouseout", mouseoutHandler);
    option.removeEventListener("click", clickHandler);
  };

  return {
    option,
    cleanup,
  };
}

// Create carousel direction submenu element
window.createChordsLocationSubmenu = function (parentMenu) {
  /*  בונים את ה-DOM *רק אם* טרם נבנה (dataset.built)                */
  const submenu = getOrCreateMenu(
    "chords-location",
    (_parent) => {
      const el = document.createElement("div");
      el.className = "settings-menu chords-location-submenu yc";
      return el;
    },
    parentMenu
  );

  if (submenu.dataset.built) {
    // כבר בנוי – רק לוודא שהוא במיקום הנכון
    window.placeNearControls?.(submenu);
    return submenu;
  }
  submenu.dataset.built = "1"; /* מסמן שה-DOM נוצר */

  submenu.style.cssText = `
        position: absolute;
        background: rgba(28, 28, 28, 0.9);
        right: 12px;
        border-radius: 8px;
        padding: 0;
        z-index: 2001;
        width: 250px;
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

  backButton.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();
      DBG("Back-button ► hide submenu");
      submenu.style.display = "none";
      if (parentMenu) parentMenu.style.display = "block";
    },
    { signal: submenu.abortController?.signal }
  );

  const headerText = document.createElement("span");
  headerText.textContent = "Carousel Direction";
  headerText.style.fontWeight = "500";

  header.appendChild(backButton);
  header.appendChild(headerText);
  submenu.appendChild(header);

  // Create options container
  const optionsContainer = document.createElement("div");
  optionsContainer.style.padding = "8px 0";

  // Store option cleanup functions
  const optionCleanups = [];
  submenu.optionCleanups = optionCleanups;

  // Get initial direction from localStorage
  const savedDirection =
    localStorage.getItem("youchords_carousel_direction") || "LTR";
  window.carouselDirection = savedDirection;

  // Create direction options
  const directions = ["LTR", "RTL", "AUTO"];
  directions.forEach((dir) => {
    const isSelected = dir === savedDirection;
    const optionResult = createDirectionOption(
      dir,
      isSelected,
      (selectedDir) => {
        window.updateCarouselDirection(selectedDir);
      }
    );

    optionsContainer.appendChild(optionResult.option);
    optionCleanups.push(optionResult.cleanup);
  });

  submenu.appendChild(optionsContainer);

  // יצירת AbortController למניעת דליפת listeners
  if (!submenu.abortController) {
    submenu.abortController = new AbortController();
  }

  // Observe visibility to adjust position - עם התנתקות אוטומטית אחרי שהתפריט נפתח
  const observer = new MutationObserver((_, obs) => {
    if (submenu.style.display === "block") {
      const controls = document.querySelector(".ytp-chrome-bottom");
      if (controls) {
        const rect = controls.getBoundingClientRect();
        /*  אותו Offset של 12 px כדי ליישר לגובה הראשי  */
        submenu.style.bottom = `${rect.height + 12}px`;
        submenu.style.right = "12px";
      }
      obs.disconnect(); // התנתקות אוטומטית אחרי שהתפריט נפתח
    }
  });

  // שמירת ה-observer מיד למניעת דליפה ב-SPA
  submenu.observer = observer;
  observer.observe(submenu, { attributes: true, attributeFilter: ["style"] });

  // שימוש ב-AbortController כדי למנוע הצטברות listeners
  submenu.addEventListener("click", (e) => e.stopPropagation(), {
    signal: submenu.abortController.signal,
  });

  return submenu;
};

// ------------------------------------------------------------
// 4. dispose – ניקוי Observer
// ------------------------------------------------------------

// Helper to disconnect observer and optionally remove the submenu
window.disposeChordsLocationSubmenu = function (submenu, remove = false) {
  if (!submenu) {
    submenu = document.querySelector(".chords-location-submenu");
  }

  if (submenu) {
    // Disconnect observer
    if (submenu.observer) {
      submenu.observer.disconnect();
      delete submenu.observer;
    }

    // Clean up options to prevent memory leaks
    if (submenu.optionCleanups) {
      submenu.optionCleanups.forEach((cleanup) => cleanup());
      delete submenu.optionCleanups;
    }

    // ניקוי AbortController למניעת דליפת listeners
    if (submenu.abortController) {
      submenu.abortController.abort();
      delete submenu.abortController;
    }

    // Remove from DOM if requested
    if (remove && submenu.parentNode) {
      submenu.parentNode.removeChild(submenu);
      /*  הסרה גם מהמפה הגלובלית – לא יהיו "יתומים"  */
      delete window.YC_MENUS["chords-location"];
    }
  }
};

// ------------------------------------------------------------
// 5. פונקציית איפוס לברירות מחדל
// ------------------------------------------------------------

// ברירת מחדל לכיוון הקרוסלה
const DEFAULT_CAROUSEL_DIRECTION = "LTR";

// איפוס כיוון קרוסלה לברירת מחדל (לשימוש ב-resetToDefault)
window.resetCarouselDirectionToDefault = function() {
    try {
        console.log('[ChordsLocationMenu] 🔄 מאפס כיוון קרוסלה לברירת מחדל...');
        
        // מחיקת הערך מ-localStorage
        localStorage.removeItem('youchords_carousel_direction');
        
        // עדכון הכיוון לברירת מחדל
        window.updateCarouselDirection(DEFAULT_CAROUSEL_DIRECTION);
        
        console.log('[ChordsLocationMenu] ✅ איפוס כיוון קרוסלה הושלם בהצלחה');
        console.log('[ChordsLocationMenu] 📊 כיוון חדש:', DEFAULT_CAROUSEL_DIRECTION);
        
        return true;
    } catch (error) {
        console.error('[ChordsLocationMenu] ❌ שגיאה באיפוס כיוון קרוסלה:', error);
        return false;
    }
};
