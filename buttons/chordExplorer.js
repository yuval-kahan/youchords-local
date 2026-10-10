/*==============================================================
  YouChords – buttons/chordExplorer.js
  --------------------------------------------------------------
  • כפתור חיפוש אקורדים - Chord Explorer
  • מאפשר חיפוש אקורד וצפייה בכל הפוזיציות שלו
  • Lazy Loading - טוען COMPLETE_CHORDS רק בפתיחה
  • ניקוי זיכרון בסגירה
==============================================================*/

// מניעת הזרקות כפולות
if (window.ycChordExplorerInit) {
  console.log("[ChordExplorer] סקריפט כבר נטען - מדלג");
} else {
  window.ycChordExplorerInit = true;

  // 🔧 קונפיגורציה
  const POSITIONS_PER_PAGE = 10;

  // 🎯 מצב גלובלי
  let explorerOverlay = null;
  let chordNamesList = []; // רשימת שמות האקורדים (קטן בזיכרון)
  let currentSelectedChord = null;
  let currentPage = 1;
  let isLoading = false;
  let currentSizePercent = 100; // גודל נוכחי באחוזים
  let explorerFretNumbers = 'none'; // 🎸 הגדרת Fret Numbers מקומית ל-Explorer בלבד
  let lastVideoId = null; // 🎬 מעקב אחרי videoId לאיפוס במעבר סרטון
  let searchDebounceTimer = null; // ⚡ טיימר לdebounce חיפוש
  let settingsLoaded = false; // 💾 האם ההגדרות נטענו מה-storage
  let completeChordsCache = null; // ♻️ cache יציב למניעת טעינות מודול חוזרות
  let completeChordsLoadPromise = null; // 🧵 הבטחת טעינה אחת במקביל
  
  // 🎯 References ל-event listeners (למניעת הצטברות)
  let boundResizeHandler = null;
  let boundZoomHandler = null;
  
  // 🔄 Infinite Scroll state
  const SUGGESTIONS_PER_BATCH = 15; // כמה תוצאות להציג בכל פעם
  let currentFilteredChords = []; // כל התוצאות המסוננות
  let displayedSuggestionsCount = 0; // כמה תוצאות כבר מוצגות
  let suggestionsObserver = null; // IntersectionObserver לזיהוי גלילה לתחתית
  let isLoadingMore = false; // האם כרגע טוען עוד תוצאות

  // 💾 טעינת הגדרות מ-storage בטעינת הקובץ
  chrome.storage.sync.get(['explorerFretNumbers', 'explorerSizePercent'], (result) => {
    if (result.explorerFretNumbers !== undefined) {
      explorerFretNumbers = result.explorerFretNumbers;
    }
    if (result.explorerSizePercent !== undefined) {
      currentSizePercent = normalizeExplorerSizePercent(result.explorerSizePercent);
    }
    settingsLoaded = true;
    console.log('[ChordExplorer] 💾 Loaded settings:', { explorerFretNumbers, currentSizePercent });
    // עדכון UI אם ה-overlay כבר קיים
    updateUIFromSettings();
  });

  // 🎬 האזנה גלובלית לשינוי סרטון - סגירת Explorer במעבר
  window.addEventListener('yt-navigate-finish', () => {
    console.log('[ChordExplorer] 🎬 yt-navigate-finish detected');
    if (explorerOverlay) {
      closeChordExplorer();
    }
    // 🔄 איפוס מצב החיפוש במעבר סרטון
    currentSelectedChord = null;
    currentPage = 1;
  });

  /**
   * 💾 עדכון UI מהגדרות שמורות
   */
  function updateUIFromSettings() {
    if (!explorerOverlay) return;
    const fretSelect = explorerOverlay.querySelector(".ce-fret-select");
    const sizeValue = explorerOverlay.querySelector(".ce-size-value");
    if (fretSelect) fretSelect.value = explorerFretNumbers;
    if (sizeValue) sizeValue.textContent = currentSizePercent + "%";
    const wasClamped = clampExplorerSizeToFit();
    updateSizeButtons();
    if (wasClamped && explorerOverlay.querySelector(".ce-chord-grid")?.children.length) {
      renderChordGrid();
    }
  }

  /**
   * 🎬 חילוץ videoId מה-URL
   */
  function getCurrentVideoId() {
    const match = window.location.href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  // 📐 גדלים בסיסיים
  const BASE_CARD_WIDTH = 95;
  const BASE_CARD_HEIGHT = 155;
  const BASE_SVG_SIZE = 150;
  const GRID_GAP_H = 30;
  const GRID_GAP_V = 35;
  const CARD_EXTRA_WIDTH = 16; // horizontal padding + border from .ce-chord-card
  const CARD_EXTRA_HEIGHT = 25; // vertical padding + border from .ce-chord-card
  const INNER_WRAPPER_EXTRA_WIDTH = 50; // left/right padding from .ce-inner-wrapper
  const INNER_WRAPPER_EXTRA_HEIGHT = 165; // controls, title/search spacing, and wrapper padding
  const CONTAINER_MIN_WIDTH = 550;
  const PLAYER_SCALE_BASE_WIDTH = 1200;
  const PLAYER_FIT_MARGIN = 12;
  const EXPLORER_MIN_SIZE_PERCENT = 60;
  const EXPLORER_MAX_SIZE_PERCENT = 300;

  function normalizeExplorerSizePercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 100;
    const rounded = Math.round(numeric / 10) * 10;
    return Math.min(
      EXPLORER_MAX_SIZE_PERCENT,
      Math.max(EXPLORER_MIN_SIZE_PERCENT, rounded)
    );
  }

  /**
   * 🔍 SVG של זכוכית מגדלת
   */
  const SEARCH_ICON_SVG = `
    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
    </svg>
  `;

  /**
   * 🎸 יצירת כפתור Chord Explorer
   */
  window.createChordExplorerButton = function () {
    console.log("[ChordExplorer] יצירת כפתור");

    // בדיקה אם כבר קיים
    const existing = document.querySelector(".ytp-chord-explorer-button");
    if (existing) {
      console.log("[ChordExplorer] כפתור כבר קיים");
      return existing.parentElement;
    }

    // יצירת container
    const container = document.createElement("div");
    container.className = "custom-button-container chord-explorer-container";

    // יצירת הכפתור
    const button = document.createElement("button");
    button.className = "ytp-button ytp-chord-explorer-button";
    button.title = "Chord Explorer";
    button.innerHTML = SEARCH_ICON_SVG;

    button.addEventListener("mouseenter", () => {
      button.style.opacity = "1";
    });
    button.addEventListener("mouseleave", () => {
      button.style.opacity = "0.9";
    });

    button.addEventListener("click", openChordExplorer);

    container.appendChild(button);

    // הוספה ליד כפתור Lyrics & Chords
    const rightControls = document.querySelector(".ytp-right-controls");
    const lyricsButton = document.querySelector(".ytp-lyrics-chords-button");

    if (lyricsButton && lyricsButton.parentElement) {
      lyricsButton.parentElement.insertAdjacentElement("afterend", container);
    } else if (rightControls) {
      rightControls.insertBefore(container, rightControls.firstChild);
    }

    console.log("[ChordExplorer] ✅ כפתור נוצר");
    return container;
  };

  /**
   * 📂 פתיחת Chord Explorer
   */
  async function openChordExplorer() {
    console.log("[ChordExplorer] פותח...");

    // 🔴 שינוי צבע הכפתור לאדום (פעיל)
    const explorerButton = document.querySelector(".ytp-chord-explorer-button");
    if (explorerButton) {
      explorerButton.style.color = "#ff0000";
    }

    // 🎬 בדיקה אם עברנו סרטון - אם כן, איפוס המצב
    const currentVideoId = getCurrentVideoId();
    if (lastVideoId && currentVideoId && lastVideoId !== currentVideoId) {
      console.log("[ChordExplorer] 🎬 זוהה מעבר סרטון - מאפס מצב");
      resetExplorerState();
    }
    lastVideoId = currentVideoId;

    if (explorerOverlay) {
      explorerOverlay.style.display = "flex";
      // 💾 עדכון UI עם הערכים השמורים
      updateUIFromSettings();
      // 🔄 אם הנתונים נמחקו (null) - טען מחדש מה-cache
      if (!window.COMPLETE_CHORDS || chordNamesList.length === 0) {
        console.log("[ChordExplorer] נתונים חסרים - טוען מחדש מה-cache");
        await loadCompleteChords();
      }
      return;
    }

    // יצירת ה-overlay
    createOverlay();

    // טעינת COMPLETE_CHORDS (Lazy Loading)
    await loadCompleteChords();

    // 🔄 שחזור האקורד האחרון אם קיים (באותו סרטון)
    if (currentSelectedChord && window.COMPLETE_CHORDS) {
      console.log('[ChordExplorer] 🔄 משחזר אקורד אחרון:', currentSelectedChord);
      selectChord(currentSelectedChord);
    }
  }

  /**
   * 🔄 איפוס מצב ה-Explorer (במעבר סרטון)
   */
  function resetExplorerState() {
    currentSelectedChord = null;
    currentPage = 1;
    
    // איפוס ה-UI אם ה-overlay קיים
    if (explorerOverlay) {
      const searchInput = explorerOverlay.querySelector(".ce-search-input");
      const suggestionsList = explorerOverlay.querySelector(".ce-suggestions-list");
      const chordDisplay = explorerOverlay.querySelector(".ce-chord-display");
      const instructions = explorerOverlay.querySelector(".ce-instructions");
      
      if (searchInput) searchInput.value = "";
      if (suggestionsList) {
        suggestionsList.classList.remove("active");
        suggestionsList.innerHTML = "";
      }
      if (chordDisplay) chordDisplay.style.display = "none";
      if (instructions) instructions.style.display = "block";
    }
  }

  /**
   * 🎨 יצירת ה-Overlay
   */
  function createOverlay() {
    const player = document.querySelector("#movie_player");
    if (!player) return;

    explorerOverlay = document.createElement("div");
    explorerOverlay.className = "chord-explorer-overlay";
    explorerOverlay.innerHTML = `
      <div class="ce-outer-wrapper">
        <div class="ce-container">
          <div class="ce-search-container">
            <input type="text" class="ce-search-input" placeholder="Search chord... (e.g. Am, G7)" />
            <button class="ce-close-btn">×</button>
            <div class="ce-suggestions-list"></div>
          </div>
          
          <div class="ce-loading" style="display: none;">
            <div class="ce-spinner"></div>
            <span>Loading chords...</span>
          </div>
          
          <div class="ce-chord-display" style="display: none;">
            <div class="ce-selected-title"></div>
            
            <div class="ce-inner-wrapper">
              <div class="ce-controls-row">
                <div class="ce-size-controls">
                  <button class="ce-size-btn ce-size-minus">−</button>
                  <span class="ce-size-value">100%</span>
                  <button class="ce-size-btn ce-size-plus">+</button>
                </div>
                <div class="ce-navigation">
                  <button class="ce-nav-btn ce-prev-btn">◀</button>
                  <span class="ce-page-indicator">1 / 1</span>
                  <button class="ce-nav-btn ce-next-btn">▶</button>
                </div>
                <div class="ce-fret-controls">
                  <span class="ce-fret-label">Frets:</span>
                  <select class="ce-fret-select">
                    <option value="none">None</option>
                    <option value="one">+1</option>
                    <option value="all">All</option>
                  </select>
                </div>
              </div>
              
              <div class="ce-chord-grid"></div>
            </div>
          </div>
          
          <p class="ce-instructions">Type a chord name to see all its positions</p>
        </div>
      </div>
    `;

    // הוספת סגנונות
    addStyles();

    // Event listeners
    const closeBtn = explorerOverlay.querySelector(".ce-close-btn");
    closeBtn.addEventListener("click", closeChordExplorer);

    const searchInput = explorerOverlay.querySelector(".ce-search-input");
    // ⚡ Debounce לחיפוש - מונע עיבוד מיותר בהקלדה מהירה
    searchInput.addEventListener("input", (e) => {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => handleSearch(e.target.value), 150);
    });

    // ⚡ Event Delegation לרשימת ההצעות - listener אחד במקום עשרות
    const suggestionsList = explorerOverlay.querySelector(".ce-suggestions-list");
    suggestionsList.addEventListener("click", (e) => {
      const item = e.target.closest(".ce-suggestion-item");
      if (item && item.dataset.chord) {
        selectChord(item.dataset.chord);
      }
    });

    // 🛑 מניעת YouTube מלתפוס את ה-keyboard events
    searchInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") closeChordExplorer();
    });
    searchInput.addEventListener("keyup", (e) => e.stopPropagation());
    searchInput.addEventListener("keypress", (e) => e.stopPropagation());

    const prevBtn = explorerOverlay.querySelector(".ce-prev-btn");
    const nextBtn = explorerOverlay.querySelector(".ce-next-btn");
    prevBtn.addEventListener("click", () => changePage(-1));
    nextBtn.addEventListener("click", () => changePage(1));

    // Size controls
    const sizeMinusBtn = explorerOverlay.querySelector(".ce-size-minus");
    const sizePlusBtn = explorerOverlay.querySelector(".ce-size-plus");
    sizeMinusBtn.addEventListener("click", () => changeSize(-10));
    sizePlusBtn.addEventListener("click", () => changeSize(10));

    // Fret Numbers control (מקומי ל-Explorer בלבד)
    const fretSelect = explorerOverlay.querySelector(".ce-fret-select");
    fretSelect.value = explorerFretNumbers;
    fretSelect.addEventListener("change", (e) => {
      e.stopPropagation();
      explorerFretNumbers = e.target.value;
      // 💾 שמירה ב-storage
      chrome.storage.sync.set({ explorerFretNumbers });
      renderChordGrid(); // רענון הדיאגרמות עם ההגדרה החדשה
    });

    // סגירה ב-ESC (על כל ה-overlay)
    explorerOverlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeChordExplorer();
      e.stopPropagation();
    });

    // סגירה בלחיצה על הרקע
    explorerOverlay.addEventListener("click", (e) => {
      if (e.target === explorerOverlay) {
        const container = explorerOverlay.querySelector(".ce-container");
        
        // אם אין אקורד נבחר - סגירה בכל לחיצה על הרקע
        if (!currentSelectedChord) {
          closeChordExplorer();
          return;
        }
        
        // אם יש אקורד נבחר - סגירה רק בלחיצה על הצדדים
        if (container) {
          const rect = container.getBoundingClientRect();
          const clickX = e.clientX;
          // סגירה רק אם הלחיצה הייתה משמאל או מימין לתוכן
          if (clickX < rect.left || clickX > rect.right) {
            closeChordExplorer();
          }
        } else {
          closeChordExplorer();
        }
      }
    });

    player.appendChild(explorerOverlay);

    // 💾 עדכון UI עם הערכים השמורים
    updateUIFromSettings();

    // 📐 התאמת גודל דינמי לפי גודל הווידאו (כמו Tuner)
    applyDynamicSizing();
    
    // 🎯 שמירת references ל-listeners למניעת הצטברות
    boundResizeHandler = applyDynamicSizing;
    boundZoomHandler = handleBrowserZoom;
    window.addEventListener("resize", boundResizeHandler);
    window.addEventListener("keydown", boundZoomHandler);

    // פוקוס על שדה החיפוש
    setTimeout(() => searchInput.focus(), 100);
  }

  /**
   * 📐 התאמת גודל דינמי לפי גודל הווידאו
   * מפעיל scale על כל ה-.ce-container (כולל SearchBar והאקורדים)
   */
  function applyDynamicSizing() {
    if (!explorerOverlay) return;
    const player = document.querySelector("#movie_player");
    if (!player) return;

    // חישוב יחס לפי רוחב הנגן (בסיס 1200px - כדי שיהיה קטן יותר)
    const playerWidth = player.getBoundingClientRect().width;
    const scale = playerWidth / PLAYER_SCALE_BASE_WIDTH;

    // עדכון משתנה CSS על ה-overlay
    explorerOverlay.style.setProperty('--player-scale', scale);
    const wasClamped = clampExplorerSizeToFit();
    updateSizeButtons();
    if (wasClamped && explorerOverlay.querySelector(".ce-chord-grid")?.children.length) {
      renderChordGrid();
    }
  }

  /**
   * 🔧 Browser zoom handler
   */
  function handleBrowserZoom(e) {
    if (e.ctrlKey && (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")) {
      setTimeout(applyDynamicSizing, 100);
    }
  }

  /**
   * 🎨 הוספת סגנונות CSS
   */
  function addStyles() {
    if (document.getElementById("chord-explorer-styles")) return;

    const style = document.createElement("style");
    style.id = "chord-explorer-styles";
    style.textContent = `
      .chord-explorer-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }
      
      .ce-outer-wrapper {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
      }
      
      .ce-container {
        width: fit-content;
        min-width: 550px;
        display: flex;
        flex-direction: column;
        align-items: center;
        position: relative;
        transform: scale(var(--player-scale, 1));
        transform-origin: center center;
        background: transparent;
        box-shadow: none;
        padding: 0;
      }
      
      .ce-search-container {
        width: 100%;
        max-width: 450px;
        margin: 0 auto 15px auto;
        position: relative;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      /* איזון לכפתור הסגירה כדי שהטקסט בחיפוש יהיה במרכז */
      .ce-search-container::before {
        content: "";
        width: 36px;
        flex-shrink: 0;
        visibility: hidden;
      }
      
      .ce-search-input {
        flex: 1;
        padding: 12px 20px;
        font-size: 18px;
        border: 2px solid #3ea6ff;
        border-radius: 25px;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        outline: none;
        text-align: center;
        box-sizing: border-box;
      }
      
      .ce-close-btn {
        flex-shrink: 0;
        background: rgba(255, 255, 255, 0.15);
        border: none;
        border-radius: 50%;
        width: 36px;
        height: 36px;
        color: #fff;
        font-size: 22px;
        line-height: 34px;
        text-align: center;
        cursor: pointer;
        opacity: 0.7;
        transition: all 0.2s;
      }
      .ce-close-btn:hover { 
        opacity: 1; 
        background: rgba(255, 255, 255, 0.3);
      }
      .ce-search-input::placeholder { color: #888; }
      
      .ce-suggestions-list {
        width: 100%;
        max-width: 400px;
        background: rgba(40, 40, 40, 0.98);
        border-radius: 8px;
        max-height: 240px;
        overflow-y: auto;
        display: none;
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        z-index: 100;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      }
      .ce-suggestions-list.active { display: block; }
      
      .ce-suggestion-item {
        padding: 10px 20px;
        color: #fff;
        cursor: pointer;
        border-bottom: 1px solid #444;
        transition: background 0.2s;
      }
      .ce-suggestion-item:hover { background: #3ea6ff; }
      .ce-suggestion-item:last-child { border-bottom: none; }
      
      /* 🔄 Infinite Scroll - Loading indicator */
      .ce-scroll-sentinel {
        padding: 8px 20px;
        text-align: center;
      }
      .ce-loading-more {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 5px;
      }
      .ce-mini-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid #555;
        border-top-color: #3ea6ff;
        border-radius: 50%;
        animation: ce-spin 0.8s linear infinite;
      }
      
      .ce-loading {
        color: #fff;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }
      
      .ce-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid #333;
        border-top-color: #3ea6ff;
        border-radius: 50%;
        animation: ce-spin 1s linear infinite;
      }
      @keyframes ce-spin { to { transform: rotate(360deg); } }
      
      .ce-chord-display {
        width: 100%;
        text-align: center;
      }
      
      .ce-selected-title {
        color: #3ea6ff;
        font-size: 28px;
        font-weight: bold;
        margin-bottom: 15px;
      }
      
      .ce-inner-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: fit-content;
        margin: 0 auto;
        position: relative;
        background-color: rgba(60, 60, 60, 0.9);
        border-radius: 12px;
        padding: 15px 30px 35px 20px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      }
      
      .ce-controls-row {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 10px;
        position: relative;
        width: 100%;
        min-width: 450px;
      }
      
      .ce-navigation {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }
      
      .ce-nav-btn {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid #555;
        color: #fff;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 16px;
        transition: all 0.2s;
      }
      .ce-nav-btn:hover:not(:disabled) {
        background: #3ea6ff;
        border-color: #3ea6ff;
      }
      .ce-nav-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      
      .ce-page-indicator {
        color: #fff;
        font-size: 16px;
        min-width: 60px;
      }
      
      .ce-size-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        position: absolute;
        left: 0;
      }
      
      .ce-size-btn {
        width: 28px;
        height: 28px;
        border: 1px solid #555;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        border-radius: 4px;
        cursor: pointer;
        font-size: 18px;
        font-weight: bold;
        transition: all 0.2s;
      }
      .ce-size-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.25);
      }
      .ce-size-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
        background: rgba(100, 100, 100, 0.3);
      }
      
      .ce-size-value {
        min-width: 45px;
        text-align: center;
        font-size: 13px;
        color: #fff;
      }
      
      .ce-fret-controls {
        display: flex;
        align-items: center;
        gap: 6px;
        position: absolute;
        right: 0;
      }
      
      .ce-fret-label {
        font-size: 12px;
        color: #aaa;
      }
      
      .ce-fret-select {
        padding: 4px 8px;
        font-size: 12px;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        border: 1px solid #555;
        border-radius: 4px;
        cursor: pointer;
        outline: none;
      }
      .ce-fret-select:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      .ce-fret-select option {
        background: #222;
        color: #fff;
      }
      
      .ce-chord-grid {
        display: grid;
        grid-template-columns: repeat(5, 95px);
        grid-template-rows: repeat(2, 155px);
        gap: 35px 30px;
        justify-content: center;
        align-content: start;
      }
      
      .ce-chord-grid.ce-single-row {
        grid-template-columns: repeat(auto-fit, 95px);
        justify-content: center;
      }
      
      .ce-chord-card {
        background: #ffffffff;
        border-radius: 8px;
        padding: 6px 6px 15px 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 95px;
        height: 155px;
        overflow: hidden;
        border: 2px solid #000;
      }
      
      .ce-chord-card-title {
        font-size: 16px;
        font-weight: bold;
        color: #000000ff;
        margin-bottom: 2px;
      }
      
      .ce-position-number {
        font-size: 14px;
        color: #000000ff;
        margin-bottom: 5px;
      }
      
      .ce-instructions {
        color: #888;
        font-size: 14px;
        margin-top: 20px;
      }
      
      /* 🔍 הסתרת החצים והמספור מתוך הדיאגרמות - יש ניווט חיצוני */
      .ce-chord-card .chord-arrows-counter,
      .ce-chord-card .chord-position-counter,
      .ce-chord-card .chord-arrow-left,
      .ce-chord-card .chord-arrow-right {
        display: none !important;
      }
      
      .ce-diagram-container {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        flex: 1;
        margin-top: -25px;
      }
      
      .ce-diagram-container svg {
        display: block;
        width: 150px;
        height: 150px;
      }
      
      .ce-chord-card .fret-number {
        font-size: 8.5px !important;
      }

      /* Match Preview Panel/Carousel finger dots on chord diagrams */
      .ce-chord-card svg circle[fill="#000"] {
        r: 3.3 !important;
      }

      .ce-chord-card svg text[fill="#fff"][font-weight="bold"] {
        font-size: 6px !important;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 📦 טעינת COMPLETE_CHORDS (Lazy Loading)
   */
  async function loadCompleteChords() {
    if (isLoading) return;
    isLoading = true;

    const loading = explorerOverlay.querySelector(".ce-loading");
    const instructions = explorerOverlay.querySelector(".ce-instructions");
    loading.style.display = "flex";
    instructions.style.display = "none";

    try {
      // ♻️ שחזור מה-cache המקומי אם window.COMPLETE_CHORDS נוקה בסגירה
      if (!window.COMPLETE_CHORDS && completeChordsCache) {
        window.COMPLETE_CHORDS = completeChordsCache;
      }

      // טעינה ראשונית (פעם אחת) בלי cache-busting כדי למנוע הצטברות מודולים
      if (!window.COMPLETE_CHORDS) {
        console.log("[ChordExplorer] טוען COMPLETE_CHORDS...");

        if (!completeChordsLoadPromise) {
          const chordsUrl = chrome.runtime.getURL("data/chords.complete.js");
          completeChordsLoadPromise = import(chordsUrl)
            .then(() => {
              if (!window.COMPLETE_CHORDS) {
                throw new Error("COMPLETE_CHORDS not defined after import");
              }
              completeChordsCache = window.COMPLETE_CHORDS;
              if (window.COMPLETE_CHORDS_COMPACT) {
                window.COMPLETE_CHORDS_COMPACT = null;
              }
            })
            .finally(() => {
              completeChordsLoadPromise = null;
            });
        }

        await completeChordsLoadPromise;
      } else if (!completeChordsCache) {
        completeChordsCache = window.COMPLETE_CHORDS;
        if (window.COMPLETE_CHORDS_COMPACT) {
          window.COMPLETE_CHORDS_COMPACT = null;
        }
      }

      if (!window.COMPLETE_CHORDS) {
        throw new Error("COMPLETE_CHORDS not defined after import");
      }

      // שמירת רשימת שמות האקורדים (קטן בזיכרון)
      chordNamesList = Object.keys(window.COMPLETE_CHORDS).sort();
      console.log(`[ChordExplorer] ✅ נטענו ${chordNamesList.length} אקורדים`);

      loading.style.display = "none";
      instructions.style.display = "block";
    } catch (error) {
      console.error("[ChordExplorer] ❌ שגיאה בטעינה:", error);
      loading.innerHTML = `<span style="color: #ff6b6b;">Error loading chords</span>`;
    }

    isLoading = false;
  }

  /**
   * 🔍 טיפול בחיפוש
   */
  function handleSearch(value) {
    const suggestionsList = explorerOverlay.querySelector(
      ".ce-suggestions-list"
    );
    const chordDisplay = explorerOverlay.querySelector(".ce-chord-display");
    const instructions = explorerOverlay.querySelector(".ce-instructions");

    if (!value.trim()) {
      if (suggestionsObserver) {
        suggestionsObserver.disconnect();
        suggestionsObserver = null;
      }
      suggestionsList.classList.remove("active");
      suggestionsList.innerHTML = "";
      currentFilteredChords = [];
      displayedSuggestionsCount = 0;
      return;
    }

    const searchTerm = value.trim();
    
    // 🔄 סינון ומיון חכם של התוצאות
    currentFilteredChords = chordNamesList
      .filter((chord) =>
        chord.toLowerCase().startsWith(searchTerm.toLowerCase())
      )
      .sort((a, b) => sortChordsByRelevance(a, b, searchTerm));
    
    // איפוס מונה התצוגה
    displayedSuggestionsCount = 0;

    if (currentFilteredChords.length > 0) {
      suggestionsList.classList.add("active");
      suggestionsList.innerHTML = "";
      
      // הצגת הקבוצה הראשונה
      appendMoreSuggestions();
      
      // הגדרת IntersectionObserver לטעינה אוטומטית
      setupInfiniteScroll();
    } else {
      if (suggestionsObserver) {
        suggestionsObserver.disconnect();
        suggestionsObserver = null;
      }
      suggestionsList.classList.remove("active");
      suggestionsList.innerHTML = "";
    }
  }
  
  /**
   * 📊 מיון אקורדים לפי רלוונטיות
   * אקורדים בסיסיים (G, Gm, G7) יופיעו ראשונים
   */
  function sortChordsByRelevance(a, b, searchTerm) {
    const searchLower = searchTerm.toLowerCase();
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    
    // 1. התאמה מדויקת ראשונה
    if (aLower === searchLower && bLower !== searchLower) return -1;
    if (bLower === searchLower && aLower !== searchLower) return 1;
    
    // 2. אקורדים עם סלאש (/) בסוף - פחות רלוונטיים
    const aHasSlash = a.includes('/');
    const bHasSlash = b.includes('/');
    if (!aHasSlash && bHasSlash) return -1;
    if (aHasSlash && !bHasSlash) return 1;
    
    // 3. אקורדים קצרים יותר קודם (G לפני Gmaj7)
    if (a.length !== b.length) return a.length - b.length;
    
    // 4. מיון אלפביתי
    return a.localeCompare(b);
  }
  
  /**
   * ➕ הוספת עוד תוצאות לרשימה
   */
  function appendMoreSuggestions() {
    if (isLoadingMore) return;
    if (displayedSuggestionsCount >= currentFilteredChords.length) return;
    
    isLoadingMore = true;
    
    const suggestionsList = explorerOverlay.querySelector(".ce-suggestions-list");
    if (!suggestionsList) {
      isLoadingMore = false;
      return;
    }
    
    // הסרת ה-sentinel הקודם אם קיים
    const oldSentinel = suggestionsList.querySelector(".ce-scroll-sentinel");
    if (oldSentinel) {
      if (suggestionsObserver) {
        suggestionsObserver.unobserve(oldSentinel);
      }
      oldSentinel.remove();
    }
    
    // חישוב הטווח להצגה
    const startIndex = displayedSuggestionsCount;
    const endIndex = Math.min(startIndex + SUGGESTIONS_PER_BATCH, currentFilteredChords.length);
    
    // יצירת האלמנטים החדשים
    const fragment = document.createDocumentFragment();
    
    for (let i = startIndex; i < endIndex; i++) {
      const chord = currentFilteredChords[i];
      const positions = window.COMPLETE_CHORDS[chord]?.length || 0;
      
      const item = document.createElement("div");
      item.className = "ce-suggestion-item";
      item.dataset.chord = chord;
      item.innerHTML = `${chord} <span style="color:#888">(${positions} positions)</span>`;
      
      fragment.appendChild(item);
    }
    
    // הוספת sentinel לזיהוי הגעה לתחתית (אם יש עוד תוצאות)
    if (endIndex < currentFilteredChords.length) {
      const sentinel = document.createElement("div");
      sentinel.className = "ce-scroll-sentinel";
      sentinel.innerHTML = `<div class="ce-loading-more"><div class="ce-mini-spinner"></div></div>`;
      fragment.appendChild(sentinel);
    }
    
    suggestionsList.appendChild(fragment);
    displayedSuggestionsCount = endIndex;
    
    isLoadingMore = false;
    
    // עדכון ה-observer לצפות ב-sentinel החדש
    if (suggestionsObserver) {
      const newSentinel = suggestionsList.querySelector(".ce-scroll-sentinel");
      if (newSentinel) {
        suggestionsObserver.observe(newSentinel);
      }
    }
  }
  
  /**
   * 🔄 הגדרת Infinite Scroll עם IntersectionObserver
   */
  function setupInfiniteScroll() {
    // ניקוי observer קודם
    if (suggestionsObserver) {
      suggestionsObserver.disconnect();
      suggestionsObserver = null;
    }
    
    const suggestionsList = explorerOverlay.querySelector(".ce-suggestions-list");
    if (!suggestionsList) return;
    
    // יצירת observer חדש
    suggestionsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !isLoadingMore) {
          // הגענו לתחתית - טוען עוד
          appendMoreSuggestions();
        }
      });
    }, {
      root: suggestionsList,
      rootMargin: "50px", // מתחיל לטעון קצת לפני שמגיעים לסוף
      threshold: 0.1
    });
    
    // צפייה ב-sentinel
    const sentinel = suggestionsList.querySelector(".ce-scroll-sentinel");
    if (sentinel) {
      suggestionsObserver.observe(sentinel);
    }
  }

  /**
   * 🎸 בחירת אקורד
   */
  function selectChord(chordName) {
    currentSelectedChord = chordName;
    currentPage = 1;

    const suggestionsList = explorerOverlay.querySelector(
      ".ce-suggestions-list"
    );
    const searchInput = explorerOverlay.querySelector(".ce-search-input");
    const instructions = explorerOverlay.querySelector(".ce-instructions");
    const chordDisplay = explorerOverlay.querySelector(".ce-chord-display");
    const selectedTitle = explorerOverlay.querySelector(".ce-selected-title");

    if (suggestionsObserver) {
      suggestionsObserver.disconnect();
      suggestionsObserver = null;
    }
    suggestionsList.classList.remove("active");
    searchInput.value = chordName;
    instructions.style.display = "none";
    chordDisplay.style.display = "block";
    selectedTitle.textContent = chordName;

    renderChordGrid();
  }

  /**
   * 🎨 רינדור Grid של פוזיציות
   */
  function renderChordGrid() {
    if (!currentSelectedChord || !window.COMPLETE_CHORDS) return;

    const positions = window.COMPLETE_CHORDS[currentSelectedChord] || [];
    const totalPositions = positions.length;
    const totalPages = Math.ceil(totalPositions / POSITIONS_PER_PAGE) || 1;
    const startIndex = (currentPage - 1) * POSITIONS_PER_PAGE;
    const endIndex = Math.min(startIndex + POSITIONS_PER_PAGE, totalPositions);

    // עדכון מספור עמודים
    const pageIndicator = explorerOverlay.querySelector(".ce-page-indicator");
    pageIndicator.textContent = `${currentPage} / ${totalPages}`;

    // עדכון כפתורי ניווט
    const prevBtn = explorerOverlay.querySelector(".ce-prev-btn");
    const nextBtn = explorerOverlay.querySelector(".ce-next-btn");
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;

    // רינדור הדיאגרמות
    const grid = explorerOverlay.querySelector(".ce-chord-grid");
    grid.innerHTML = "";

    // בדיקה אם יש שורה אחת עם פחות מ-5 אקורדים - למרכז
    const itemsInPage = endIndex - startIndex;
    if (itemsInPage <= 5) {
      grid.classList.add("ce-single-row");
    } else {
      grid.classList.remove("ce-single-row");
    }

    // 📐 חישוב scale אוטומטי לפי גודל הנגן
    // שימוש בגודל שנבחר על ידי המשתמש
    const scale = currentSizePercent / 100;
    const cardWidth = Math.round(BASE_CARD_WIDTH * scale);
    const cardHeight = Math.round(BASE_CARD_HEIGHT * scale);
    const svgSize = Math.round(BASE_SVG_SIZE * scale);
    
    // עדכון כפתורי Size
    updateSizeButtons();

    // עדכון גדלי ה-grid
    if (itemsInPage <= 5) {
      // שורה אחת - מירכוז עם מספר עמודות מדויק
      grid.style.gridTemplateColumns = `repeat(${itemsInPage}, ${cardWidth}px)`;
    } else {
      grid.style.gridTemplateColumns = `repeat(5, ${cardWidth}px)`;
    }
    grid.style.gridTemplateRows = `repeat(2, ${cardHeight}px)`;
     
    for (let i = startIndex; i < endIndex; i++) {
      const positionData = positions[i];
      const card = document.createElement("div");
      card.className = "ce-chord-card";
      card.style.width = `${cardWidth}px`;
      card.style.height = `${cardHeight}px`;

      // יצירת דיאגרמה
      const diagramContainer = document.createElement("div");
      diagramContainer.className = "ce-diagram-container";

      try {
        // שימוש ב-chordRenderer אם קיים
        if (window.chordRenderer && window.chordRenderer.renderChordSVG) {
          // 🎸 שמירת הערך הגלובלי והחלפה זמנית בערך המקומי של Explorer
          const savedGlobalFretNumbers = window.additionalFretNumbers;
          window.additionalFretNumbers = explorerFretNumbers;
          
          const svg = window.chordRenderer.renderChordSVG(
            currentSelectedChord,
            positionData,
            i + 1,
            totalPositions
          );
          
          // 🎸 החזרת הערך הגלובלי למצבו המקורי
          window.additionalFretNumbers = savedGlobalFretNumbers;
          
          if (svg) {
            svg.style.width = `${svgSize}px`;
            svg.style.height = `${svgSize}px`;
            diagramContainer.appendChild(svg);
          } else {
            throw new Error("SVG not created");
          }
        } else {
          // Fallback - יצירת SVG פשוט בעצמנו
          const svg = createSimpleChordSVG(
            currentSelectedChord,
            positionData,
            i + 1
          );
          diagramContainer.appendChild(svg);
        }
      } catch (e) {
        // Fallback אם נכשל
        diagramContainer.innerHTML = `<div style="width:80px;height:100px;background:#fff;border:1px solid #ccc;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#666;">[Position ${
          i + 1
        }]</div>`;
      }

      // שם האקורד
      const title = document.createElement("div");
      title.className = "ce-chord-card-title";
      title.textContent = currentSelectedChord;
      card.appendChild(title);

      // מספר פוזיציה (מתחת לשם)
      const posNum = document.createElement("div");
      posNum.className = "ce-position-number";
      posNum.textContent = `${i + 1}/${totalPositions}`;
      card.appendChild(posNum);

      // הדיאגרמה
      card.appendChild(diagramContainer);

      grid.appendChild(card);
    }
  }

  /**
   * 🎸 יצירת SVG פשוט לדיאגרמת אקורד (fallback)
   */
  function createSimpleChordSVG(chordName, data, posIndex) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "80");
    svg.setAttribute("height", "100");
    svg.setAttribute("viewBox", "0 0 55 95");
    svg.style.background = "#fff";
    svg.style.borderRadius = "4px";

    // רקע
    const bg = document.createElementNS(svgNS, "rect");
    bg.setAttribute("width", "55");
    bg.setAttribute("height", "95");
    bg.setAttribute("fill", "#f5f5dc");
    svg.appendChild(bg);

    // Grid פשוט
    const gridGroup = document.createElementNS(svgNS, "g");

    // מיתרים אנכיים
    for (let s = 0; s < 6; s++) {
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", 10 + s * 7);
      line.setAttribute("y1", 20);
      line.setAttribute("x2", 10 + s * 7);
      line.setAttribute("y2", 80);
      line.setAttribute("stroke", "#000");
      line.setAttribute("stroke-width", "0.5");
      gridGroup.appendChild(line);
    }

    // פרטים אופקיים
    for (let f = 0; f <= 5; f++) {
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", 10);
      line.setAttribute("y1", 20 + f * 12);
      line.setAttribute("x2", 45);
      line.setAttribute("y2", 20 + f * 12);
      line.setAttribute("stroke", "#000");
      line.setAttribute("stroke-width", f === 0 ? "2" : "0.5");
      gridGroup.appendChild(line);
    }

    svg.appendChild(gridGroup);

    // מספר פוזיציה
    const text = document.createElementNS(svgNS, "text");
    text.setAttribute("x", "27.5");
    text.setAttribute("y", "92");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "8");
    text.setAttribute("fill", "#666");
    text.textContent = `#${posIndex}`;
    svg.appendChild(text);

    return svg;
  }

  /**
   * 📏 שינוי גודל הכרטיסים
   */
  function changeSize(delta) {
    const newPercent = normalizeExplorerSizePercent(currentSizePercent + delta);
    
    // בדיקת מינימום
    if (newPercent === currentSizePercent) {
      updateSizeButtons();
      return;
    }
    
    // בדיקת מקסימום - האם יחרוג מגבולות נגן הווידאו המקורי
    if (!canExplorerFitPercent(newPercent)) {
      updateSizeButtons();
      return;
    }
    
    // עדכון הגודל
    currentSizePercent = newPercent;
    // 💾 שמירה ב-storage
    chrome.storage.sync.set({ explorerSizePercent: currentSizePercent });
    
    // עדכון התצוגה
    const sizeValue = explorerOverlay?.querySelector(".ce-size-value");
    if (sizeValue) sizeValue.textContent = currentSizePercent + "%";
    
    updateSizeButtons();
    renderChordGrid();
  }
  
  /**
   * 🔄 עדכון מצב כפתורי Size
   */
  function updateSizeButtons() {
    const minusBtn = explorerOverlay?.querySelector(".ce-size-minus");
    const plusBtn = explorerOverlay?.querySelector(".ce-size-plus");
    
    // בדיקת מינימום
    if (minusBtn) {
      minusBtn.disabled = currentSizePercent <= EXPLORER_MIN_SIZE_PERCENT;
    }
    
    // בדיקת מקסימום
    if (plusBtn) {
      plusBtn.disabled = !canExplorerFitPercent(currentSizePercent + 10);
    }
  }

  function clampExplorerSizeToFit() {
    let wasClamped = false;

    const normalizedPercent = normalizeExplorerSizePercent(currentSizePercent);
    if (normalizedPercent !== currentSizePercent) {
      currentSizePercent = normalizedPercent;
      wasClamped = true;
    }

    while (currentSizePercent > EXPLORER_MIN_SIZE_PERCENT && !canExplorerFitPercent(currentSizePercent)) {
      currentSizePercent -= 10;
      wasClamped = true;
    }

    if (wasClamped) {
      chrome.storage.sync.set({ explorerSizePercent: currentSizePercent });
      const sizeValue = explorerOverlay?.querySelector(".ce-size-value");
      if (sizeValue) sizeValue.textContent = currentSizePercent + "%";
    }

    return wasClamped;
  }

  function getExplorerPlayerRect() {
    const player = document.querySelector("#movie_player");
    const rect = player?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return rect;
  }

  function getExplorerDisplayedSizeForPercent(percent) {
    const playerRect = getExplorerPlayerRect();
    if (!playerRect) return null;

    const userScale = normalizeExplorerSizePercent(percent) / 100;
    const playerScale = playerRect.width / PLAYER_SCALE_BASE_WIDTH;
    const columns = 5;
    const rows = 2;
    const cardWidth = (BASE_CARD_WIDTH * userScale) + CARD_EXTRA_WIDTH;
    const cardHeight = (BASE_CARD_HEIGHT * userScale) + CARD_EXTRA_HEIGHT;
    const gridWidth = (cardWidth * columns) + (GRID_GAP_H * (columns - 1));
    const gridHeight = (cardHeight * rows) + (GRID_GAP_V * (rows - 1));
    const unscaledWidth = Math.max(
      CONTAINER_MIN_WIDTH,
      gridWidth + INNER_WRAPPER_EXTRA_WIDTH
    );
    const unscaledHeight = gridHeight + INNER_WRAPPER_EXTRA_HEIGHT;

    return {
      width: unscaledWidth * playerScale,
      height: unscaledHeight * playerScale,
      playerWidth: playerRect.width,
      playerHeight: playerRect.height
    };
  }

  function canExplorerFitPercent(percent) {
    const size = getExplorerDisplayedSizeForPercent(percent);
    if (!size) return false;
    return (
      size.width <= Math.max(0, size.playerWidth - PLAYER_FIT_MARGIN) &&
      size.height <= Math.max(0, size.playerHeight - PLAYER_FIT_MARGIN)
    );
  }

  /**
   * 📄 החלפת עמוד
   */
  function changePage(delta) {
    if (!currentSelectedChord || !window.COMPLETE_CHORDS) return;

    const positions = window.COMPLETE_CHORDS[currentSelectedChord] || [];
    const totalPages = Math.ceil(positions.length / POSITIONS_PER_PAGE) || 1;

    currentPage += delta;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    renderChordGrid();
  }

  /**
   * ❌ סגירת Chord Explorer
   */
  function closeChordExplorer() {
    console.log("[ChordExplorer] סוגר...");

    // 🎯 הסרת event listeners גלובליים למניעת הצטברות
    if (boundResizeHandler) {
      window.removeEventListener("resize", boundResizeHandler);
      boundResizeHandler = null;
    }
    if (boundZoomHandler) {
      window.removeEventListener("keydown", boundZoomHandler);
      boundZoomHandler = null;
    }

    // ⚡ Clear pending debounced search callback
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }

    // 🔄 ניקוי IntersectionObserver למניעת דליפות זיכרון
    if (suggestionsObserver) {
      suggestionsObserver.disconnect();
      suggestionsObserver = null;
    }
    
    // 🔄 איפוס מצב Infinite Scroll
    currentFilteredChords = [];
    displayedSuggestionsCount = 0;
    isLoadingMore = false;

    // ⚪ שינוי צבע הכפתור ללבן (לא פעיל)
    const explorerButton = document.querySelector(".ytp-chord-explorer-button");
    if (explorerButton) {
      explorerButton.style.color = "#ffffff";
    }

    // 🗑️ הסרת ה-overlay לגמרי מה-DOM (לא רק הסתרה)
    // זה מבטיח שבפתיחה הבאה הוא ייווצר מחדש בצורה נקייה
    if (explorerOverlay) {
      explorerOverlay.remove();
      explorerOverlay = null;
    }

    // ניקוי COMPLETE_CHORDS מהזיכרון
    // בדיקה אם פאנל או קרוסלה פתוחים - אם כן, לא למחוק
    const panelOpen = !!document.querySelector(".yt-lyrics-chords-panel");
    const carouselOpen = !!document.querySelector(".yc-chord-carousel");

    if (!panelOpen && !carouselOpen) {
      console.log("[ChordExplorer] 🧹 מנקה COMPLETE_CHORDS מהזיכרון");
      window.COMPLETE_CHORDS = null;
      window.COMPLETE_CHORDS_COMPACT = null;
      chordNamesList = [];
    } else {
      console.log("[ChordExplorer] פאנל/קרוסלה פתוחים - שומר COMPLETE_CHORDS");
    }

    // 🔄 לא מאפסים currentSelectedChord ו-currentPage
    // כדי שכשפותחים שוב באותו סרטון, המצב נשמר
    // האיפוס קורה רק ב-yt-navigate-finish כשעוברים סרטון
  }

  /**
   * 🧹 ניקוי מלא
   */
  window.cleanupChordExplorer = function () {
    console.log("[ChordExplorer] ניקוי מלא");

    // 🎯 הסרת event listeners גלובליים
    if (boundResizeHandler) {
      window.removeEventListener("resize", boundResizeHandler);
      boundResizeHandler = null;
    }
    if (boundZoomHandler) {
      window.removeEventListener("keydown", boundZoomHandler);
      boundZoomHandler = null;
    }

    // ⚡ ניקוי debounce timer
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    
    // 🔄 ניקוי IntersectionObserver
    if (suggestionsObserver) {
      suggestionsObserver.disconnect();
      suggestionsObserver = null;
    }

    if (explorerOverlay) {
      explorerOverlay.remove();
      explorerOverlay = null;
    }

    // 🧹 ניקוי ה-style element
    const styleEl = document.getElementById("chord-explorer-styles");
    if (styleEl) {
      styleEl.remove();
    }

    // ניקוי COMPLETE_CHORDS
    const panelOpen = !!document.querySelector(".yt-lyrics-chords-panel");
    const carouselOpen = !!document.querySelector(".yc-chord-carousel");

    if (!panelOpen && !carouselOpen) {
      window.COMPLETE_CHORDS = null;
      window.COMPLETE_CHORDS_COMPACT = null;
    }

    chordNamesList = [];
    currentFilteredChords = []; // 🔄 ניקוי Infinite Scroll
    displayedSuggestionsCount = 0;
    isLoadingMore = false;
    lastVideoId = null; // 🎬 איפוס videoId
    currentSelectedChord = null;
    currentPage = 1;
    isLoading = false;
  };

  /**
   * 🔄 איפוס הגדרות Chord Explorer לברירת מחדל
   * נקרא מ-Reset All to Default
   */
  window.resetChordExplorerSettings = function() {
    console.log('[ChordExplorer] 🔄 Resetting settings to default...');
    
    // איפוס המשתנים הפנימיים
    explorerFretNumbers = 'none';
    currentSizePercent = 100;
    
    // עדכון ה-UI אם ה-overlay קיים
    updateUIFromSettings();
    
    // אם יש אקורד נבחר, רענון הדיאגרמות
    if (currentSelectedChord && explorerOverlay) {
      renderChordGrid();
    }
    
    console.log('[ChordExplorer] ✅ Settings reset: explorerFretNumbers=none, currentSizePercent=100');
  };

  // חשיפה גלובלית
  window.ChordExplorer = {
    create: window.createChordExplorerButton,
    open: openChordExplorer,
    close: closeChordExplorer,
    cleanup: window.cleanupChordExplorer,
    resetSettings: window.resetChordExplorerSettings,
  };

  console.log("[ChordExplorer] ✅ Module loaded");
}
