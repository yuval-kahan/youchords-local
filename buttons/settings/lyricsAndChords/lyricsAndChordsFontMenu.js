// Lyrics & Chords Font Menu
// This submenu allows users to select the font for the lyrics panel
// lyricsAndChordsFontMenu.js

(function() {
  "use strict";

  // ───────────────────────────────────────────────
  // 0. CONSTANTS & DEFAULTS
  // ───────────────────────────────────────────────

  const FONT_STORAGE_KEY = "yc_lyrics_chords_font";
  const BOLD_MODE_STORAGE_KEY = "yc_lyrics_chords_bold_mode";
  const DEFAULT_FONT = "Roboto";
  const DEFAULT_BOLD_MODE = "off"; // "off" | "active" | "all"
  const MAX_PANEL_CHECK_ATTEMPTS = 30;

  const BOLD_MODES = [
    { value: "off", label: "Off" },
    { value: "active", label: "Active Word" },
    { value: "all", label: "All Text" },
  ];

  const AVAILABLE_FONTS = [
    { name: "Roboto", family: "'Roboto', sans-serif" },
    { name: "Arial", family: "Arial, sans-serif" },
    { name: "Open Sans", family: "'Open Sans', sans-serif" },
    { name: "Lato", family: "'Lato', sans-serif" },
    { name: "Montserrat", family: "'Montserrat', sans-serif" },
    { name: "Poppins", family: "'Poppins', sans-serif" },
    { name: "Source Sans Pro", family: "'Source Sans Pro', sans-serif" },
    { name: "Nunito", family: "'Nunito', sans-serif" },
  ];

  // ───────────────────────────────────────────────
  // 1. STATE MANAGEMENT
  // ───────────────────────────────────────────────

  let panelObserver = null;
  let checkPanelInterval = null;
  let checkPanelAttempts = 0;

  function initFontState() {
    const storedFont = localStorage.getItem(FONT_STORAGE_KEY);
    const storedBoldMode = localStorage.getItem(BOLD_MODE_STORAGE_KEY);
    
    window.ycLyricsFont = storedFont || DEFAULT_FONT;
    window.ycLyricsBoldMode = storedBoldMode || DEFAULT_BOLD_MODE;
    
    loadLocalFonts();
    applyFontToPanel();
    applyBoldModeCSS();
    startPanelWatcher();
  }

  function loadLocalFonts() {
    if (document.getElementById("yc-local-fonts")) return;

    const link = document.createElement("link");
    link.id = "yc-local-fonts";
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("css/yc-local-fonts.css");
    document.head.appendChild(link);
  }

  function applyFontToPanel(clearStyles = false) {
    const panel = document.querySelector(".yt-lyrics-chords-panel");
    if (!panel) return;

    const textElements = panel.querySelectorAll(
      ".lyrics-word, .chord-above, .word-below, .lyrics-line, .section-label, .verse-line, .chorus-line"
    );

    if (clearStyles) {
      panel.style.fontFamily = "";
      panel.style.fontWeight = "";
      textElements.forEach(el => {
        el.style.fontFamily = "";
        el.style.fontWeight = "";
      });
      document.documentElement.style.removeProperty("--yc-lyrics-font");
      return;
    }

    const font = AVAILABLE_FONTS.find(f => f.name === window.ycLyricsFont);
    if (!font) return;

    // Bold mode "all" - כל הטקסט bold
    const fontWeight = window.ycLyricsBoldMode === "all" ? "700" : "400";

    panel.style.fontFamily = font.family;
    panel.style.fontWeight = fontWeight;
    
    textElements.forEach(el => {
      el.style.fontFamily = font.family;
      // לא משנים font-weight לאלמנטים בודדים - זה יטופל ב-CSS עבור active word
      if (window.ycLyricsBoldMode === "all") {
        el.style.fontWeight = "700";
      } else {
        el.style.fontWeight = "";
      }
    });

    document.documentElement.style.setProperty("--yc-lyrics-font", font.family);
  }

  // CSS class לטיפול ב-bold mode עבור active word
  function applyBoldModeCSS() {
    let styleEl = document.getElementById("yc-bold-mode-style");
    
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "yc-bold-mode-style";
      document.head.appendChild(styleEl);
    }

    if (window.ycLyricsBoldMode === "active") {
      // Bold רק למילה פעילה
      styleEl.textContent = `
        .yt-lyrics-chords-panel .lyrics-word.active,
        .yt-lyrics-chords-panel .word-chord-container.word-active .word-below {
          font-weight: 700 !important;
        }
      `;
    } else if (window.ycLyricsBoldMode === "off") {
      // דורס את ה-font-weight: 500 מה-CSS הקיים
      styleEl.textContent = `
        .yt-lyrics-chords-panel .lyrics-word.active,
        .yt-lyrics-chords-panel .word-chord-container.word-active .word-below {
          font-weight: 400 !important;
        }
      `;
    } else {
      // "all" - הכל bold, מטופל ב-applyFontToPanel
      styleEl.textContent = "";
    }
  }

  function saveFont(fontName) {
    localStorage.setItem(FONT_STORAGE_KEY, fontName);
    window.ycLyricsFont = fontName;
    applyFontToPanel();
  }

  function saveBoldMode(mode) {
    localStorage.setItem(BOLD_MODE_STORAGE_KEY, mode);
    window.ycLyricsBoldMode = mode;
    applyFontToPanel();
    applyBoldModeCSS();
  }

  // ───────────────────────────────────────────────
  // 1.5 PANEL WATCHER (with cleanup)
  // ───────────────────────────────────────────────

  function startPanelWatcher() {
    stopPanelWatcher();
    checkPanelAttempts = 0;
    
    checkPanelInterval = setInterval(() => {
      checkPanelAttempts++;
      
      if (checkPanelAttempts >= MAX_PANEL_CHECK_ATTEMPTS) {
        clearInterval(checkPanelInterval);
        checkPanelInterval = null;
        return;
      }
      
      const panel = document.querySelector(".yt-lyrics-chords-panel");
      if (panel) {
        clearInterval(checkPanelInterval);
        checkPanelInterval = null;
        setupPanelObserver(panel);
        applyFontToPanel();
      }
    }, 1000);
  }

  function setupPanelObserver(panel) {
    if (panelObserver) {
      panelObserver.disconnect();
      panelObserver = null;
    }
    
    const needsObserver = 
      (window.ycLyricsFont && window.ycLyricsFont !== DEFAULT_FONT) ||
      window.ycLyricsBoldMode === "all";
    
    if (!needsObserver) return;

    let debounceTimer = null;
    
    panelObserver = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        applyFontToPanel();
      }, 100);
    });
    
    panelObserver.observe(panel, { childList: true });
  }

  function stopPanelWatcher() {
    if (checkPanelInterval) {
      clearInterval(checkPanelInterval);
      checkPanelInterval = null;
    }
    if (panelObserver) {
      panelObserver.disconnect();
      panelObserver = null;
    }
  }

  initFontState();

  // ───────────────────────────────────────────────
  // 2. MENU CONSTRUCTION
  // ───────────────────────────────────────────────

  window.createLyricsAndChordsFontSubmenu = function(parentMenu) {
    const submenu = document.createElement("div");
    submenu.className = "settings-menu lyrics-chords-font-submenu yc";
    submenu.setAttribute("data-yc-menu", "lyrics-chords-font");
    submenu.style.cssText = `
      position: absolute;
      background: rgba(28, 28, 28, 0.95);
      right: 12px;
      border-radius: 8px;
      padding: 0;
      z-index: 2001;
      width: 280px;
      font-family: Roboto, Arial, sans-serif;
      color: #fff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      display: none;
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
    `;

    submenu.cleanups = [];

    // --- Header ---
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
      font-size: 14px;
    `;

    const backClickHandler = (e) => {
      e.stopPropagation();
      submenu.style.display = "none";
      if (parentMenu) parentMenu.style.display = "block";
    };
    backButton.addEventListener("click", backClickHandler);
    submenu.cleanups.push(() => backButton.removeEventListener("click", backClickHandler));

    const headerText = document.createElement("span");
    headerText.textContent = "Font";
    headerText.style.fontWeight = "500";

    header.appendChild(backButton);
    header.appendChild(headerText);
    submenu.appendChild(header);

    // --- Bold Mode Selector ---
    const boldSection = document.createElement("div");
    boldSection.style.cssText = `
      padding: 12px 24px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    `;

    const boldLabel = document.createElement("div");
    boldLabel.textContent = "Bold";
    boldLabel.style.cssText = `
      font-size: 13px;
      color: #fff;
      margin-bottom: 10px;
    `;

    const boldOptionsRow = document.createElement("div");
    boldOptionsRow.style.cssText = `
      display: flex;
      gap: 8px;
    `;

    const currentBoldMode = window.ycLyricsBoldMode || DEFAULT_BOLD_MODE;

    BOLD_MODES.forEach((mode) => {
      const btn = document.createElement("button");
      btn.textContent = mode.label;
      btn.dataset.mode = mode.value;
      const isSelected = mode.value === currentBoldMode;
      btn.style.cssText = `
        flex: 1;
        padding: 8px 4px;
        font-size: 11px;
        border: 1px solid ${isSelected ? "#3ea6ff" : "rgba(255,255,255,0.2)"};
        border-radius: 4px;
        background: ${isSelected ? "rgba(62,166,255,0.2)" : "transparent"};
        color: ${isSelected ? "#3ea6ff" : "#aaa"};
        cursor: pointer;
        transition: all 0.2s;
      `;

      const clickHandler = (e) => {
        e.stopPropagation();
        
        // עדכון UI
        boldOptionsRow.querySelectorAll("button").forEach(b => {
          b.style.border = "1px solid rgba(255,255,255,0.2)";
          b.style.background = "transparent";
          b.style.color = "#aaa";
        });
        btn.style.border = "1px solid #3ea6ff";
        btn.style.background = "rgba(62,166,255,0.2)";
        btn.style.color = "#3ea6ff";
        
        saveBoldMode(mode.value);
        
        const panel = document.querySelector(".yt-lyrics-chords-panel");
        if (panel) setupPanelObserver(panel);
      };

      btn.addEventListener("click", clickHandler);
      submenu.cleanups.push(() => btn.removeEventListener("click", clickHandler));

      const hoverIn = () => {
        if (btn.dataset.mode !== window.ycLyricsBoldMode) {
          btn.style.background = "rgba(255,255,255,0.1)";
        }
      };
      const hoverOut = () => {
        if (btn.dataset.mode !== window.ycLyricsBoldMode) {
          btn.style.background = "transparent";
        }
      };
      btn.addEventListener("mouseenter", hoverIn);
      btn.addEventListener("mouseleave", hoverOut);
      submenu.cleanups.push(
        () => btn.removeEventListener("mouseenter", hoverIn),
        () => btn.removeEventListener("mouseleave", hoverOut)
      );

      boldOptionsRow.appendChild(btn);
    });

    boldSection.appendChild(boldLabel);
    boldSection.appendChild(boldOptionsRow);
    submenu.appendChild(boldSection);

    // --- Font Options ---
    const optionsContainer = document.createElement("div");
    optionsContainer.style.cssText = `
      padding: 8px 0;
      max-height: 280px;
      overflow-y: auto;
    `;

    const currentFont = window.ycLyricsFont || DEFAULT_FONT;

    AVAILABLE_FONTS.forEach((font) => {
      const option = document.createElement("div");
      option.className = "settings-item font-option";
      option.style.cssText = `
        padding: 12px 24px;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        transition: background-color 0.2s;
        font-family: ${font.family};
      `;

      const fontName = document.createElement("span");
      fontName.textContent = font.name;
      fontName.style.color = "#fff";

      const checkmark = document.createElement("span");
      checkmark.textContent = "✓";
      checkmark.style.cssText = `
        color: #3ea6ff;
        font-weight: bold;
        display: ${font.name === currentFont ? "inline" : "none"};
      `;

      option.appendChild(fontName);
      option.appendChild(checkmark);

      const mouseoverHandler = () => option.style.backgroundColor = "rgba(255,255,255,0.1)";
      const mouseoutHandler = () => option.style.backgroundColor = "transparent";
      option.addEventListener("mouseover", mouseoverHandler);
      option.addEventListener("mouseout", mouseoutHandler);
      submenu.cleanups.push(
        () => option.removeEventListener("mouseover", mouseoverHandler),
        () => option.removeEventListener("mouseout", mouseoutHandler)
      );

      const clickHandler = (e) => {
        e.stopPropagation();
        optionsContainer.querySelectorAll(".font-option span:last-child").forEach(cm => {
          cm.style.display = "none";
        });
        checkmark.style.display = "inline";
        saveFont(font.name);
        
        const panel = document.querySelector(".yt-lyrics-chords-panel");
        if (panel) setupPanelObserver(panel);
      };
      option.addEventListener("click", clickHandler);
      submenu.cleanups.push(() => option.removeEventListener("click", clickHandler));

      optionsContainer.appendChild(option);
    });

    submenu.appendChild(optionsContainer);

    // --- Position Observer ---
    const observer = new MutationObserver(() => {
      if (submenu.style.display === "block") {
        window.placeNearControls?.(submenu);
        observer.disconnect();
      }
    });
    observer.observe(submenu, { attributes: true, attributeFilter: ["style"] });
    submenu.observer = observer;

    return submenu;
  };

  // ───────────────────────────────────────────────
  // 3. CLEANUP
  // ───────────────────────────────────────────────

  window.disposeLyricsAndChordsFontSubmenu = function(submenu, remove = false) {
    if (!submenu) {
      submenu = document.querySelector(".lyrics-chords-font-submenu");
    }

    if (submenu) {
      if (submenu.observer) {
        submenu.observer.disconnect();
        delete submenu.observer;
      }

      if (remove && submenu.cleanups) {
        submenu.cleanups.forEach((fn) => fn());
        delete submenu.cleanups;
      }

      if (remove && submenu.parentNode) {
        submenu.parentNode.removeChild(submenu);
      }
    }
  };

  // ───────────────────────────────────────────────
  // 4. RESET FUNCTION
  // ───────────────────────────────────────────────

  window.resetLyricsChordsFontSettings = function() {
    localStorage.removeItem(FONT_STORAGE_KEY);
    localStorage.removeItem(BOLD_MODE_STORAGE_KEY);
    window.ycLyricsFont = DEFAULT_FONT;
    window.ycLyricsBoldMode = DEFAULT_BOLD_MODE;
    
    stopPanelWatcher();
    
    // קודם מנקים את ה-inline styles
    applyFontToPanel(true);
    
    // אחר כך מחילים את ברירת המחדל (Roboto)
    applyFontToPanel(false);
    
    applyBoldModeCSS();

    const submenu = document.querySelector(".lyrics-chords-font-submenu");
    if (submenu) {
      window.disposeLyricsAndChordsFontSubmenu(submenu, true);
    }

    return true;
  };

  window.applyLyricsPanelFont = applyFontToPanel;
  window.cleanupFontMenuWatchers = stopPanelWatcher;

})();
