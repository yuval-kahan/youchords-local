/*==============================================================================
  YouChords – carouselSubtitles.js (Fixed & Optimized)
  ------------------------------------------------------------------------------
  ▸ FIXED: Data Initialization (Subtitles will now appear)
  ▸ MEMORY: Aggressive cleanup logic maintained
  ▸ PERFORMANCE: Object pooling for smooth animations
==============================================================================*/

(function () {
  "use strict";

  const DEBUG = false;
  const normalizeTranslationWord = (value) => String(value || "")
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}'’_-]/gu, "")
    .trim();
  const TRANSLATION_JOINER_WORDS = new Set([
    // Italian articles, prepositions and common contractions.
    "a", "ad", "al", "allo", "alla", "ai", "agli", "alle", "da", "dal", "dallo", "dalla", "dai", "dagli", "dalle",
    "de", "del", "dello", "della", "dei", "degli", "delle", "di", "in", "nel", "nello", "nella", "nei", "negli", "nelle",
    "su", "sul", "sullo", "sulla", "sui", "sugli", "sulle", "un", "uno", "una", "il", "lo", "la", "i", "gli", "le",
    "l", "d", "e", "ed", "per", "con", "tra", "fra",
    // Frequent function words in other supported lyric languages.
    "to", "of", "the", "a", "an", "in", "on", "at", "for", "with", "and", "or",
    "el", "los", "las", "un", "una", "unos", "unas", "de", "del", "en", "por", "para", "con", "y",
    "le", "les", "des", "du", "au", "aux", "une", "et", "à", "pour", "avec"
  ]);

  // Constants
  const CHORD_WIDTH_TOTAL = 144;
  const CONTAINER_PADDING = 20;
  const CHORD_TILE_WIDTH = 134;
  const BASE_ALIGNMENT_OFFSET = 0; // Changed from -60 to center ellipse under chord
  const MIN_SPLIT_LENGTH = 27;
  const MAX_CHARS_PER_LINE = 53;
  const MAX_LINES = 2;

  class CarouselSubtitles {
    static activeInstance = null;

    constructor(config) {
      // Kill previous instance if exists to prevent memory leaks
      if (CarouselSubtitles.activeInstance) {
        CarouselSubtitles.activeInstance.destroy();
      }
      CarouselSubtitles.activeInstance = this;

      this.containerElement = config.containerElement;
      this.videoElement = config.videoElement;
      this.activeChordPosition = config.activeChordPosition || 3;

      this.subtitlesAreaElement = null;
      this.trackScaleElement = null;
      this.trackElement = null;

      this.ellipsePool = [];
      this.maxEllipses = 25;
      this.maxWordsPerEllipse = 30;
      this.maxBrsPerEllipse = 1;

      // Reusable buffer to avoid Garbage Collection pressure
      this._visibleBubblesBuffer = [];

      this.processedSubtitles = null;
      this.currentSubtitleIndex = -1;
      this.currentDirection = "LTR";
      window.ycWordTranslationEnabled = false;
      this._wordTranslationByWord = new Map();
      this._wordTranslationPromise = null;
      this._wordTranslationSignature = null;

      this.isVisible = false;
      this.abortController = null;
      this._isBootstrapping = false;
      this._showPromise = null;
      this._showToken = 0;
      this._currentAiMode = "off";

      // Load font size from localStorage (default: 20px)
      this.fontSize =
        parseFloat(localStorage.getItem("yc_carousel_subtitle_font_size")) ||
        20;

      // Load word spacing from localStorage (default: -3.6px)
      this.wordSpacing =
        parseFloat(localStorage.getItem("yc_carousel_word_spacing")) || -3.6;

      // Load split lines setting from localStorage (default: true)
      const storedSplitLines = localStorage.getItem("yc_carousel_split_lines");
      this.shouldSplitLines =
        storedSplitLines !== null ? storedSplitLines === "true" : true;

      // Load word highlight setting from localStorage (default: true)
      const storedWordHighlight = localStorage.getItem("yc_carousel_word_highlight");
      window.wordHighlightEnabled =
        storedWordHighlight !== null ? storedWordHighlight === "true" : true;

      // Load passed words setting from localStorage (default: true)
      const storedPassedWords = localStorage.getItem("yc_carousel_passed_words");
      window.passedWordsEnabled =
        storedPassedWords !== null ? storedPassedWords === "true" : true;

      // Load color settings from localStorage
      this.panelBackground =
        localStorage.getItem("yc_carousel_subtitle_panel_bg") || "#f9f9f9";
      this.ellipseBackground =
        localStorage.getItem("yc_carousel_subtitle_ellipse_bg") || "#ffffff";
      this.highlightColor =
        localStorage.getItem("yc_carousel_subtitle_highlight") || "#ffff00";
      this.highlightTextColor =
        localStorage.getItem("yc_carousel_subtitle_highlight_text") || "#000000";
      this.wordColor =
        localStorage.getItem("yc_carousel_subtitle_word_color") || "#000000";
      this.passedWordColor =
        localStorage.getItem("yc_carousel_subtitle_passed_color") || "#e91e63";

      DEBUG && console.log("[CarouselSubtitles] ✅ Initialized");
    }

    /*==========================================================================
      PUBLIC API
    ==========================================================================*/    async show() {
      if (this.isVisible) return;
      if (this._showPromise) return this._showPromise;
      const showToken = ++this._showToken;

      const runShow = async () => {
        this._isBootstrapping = true;

        try {
          const translationSettings = await chrome.storage.local.get([
            "wordTranslationEnabled", "wordTranslationLanguages", "geminiGlobalModel"
          ]);
          window.ycWordTranslationEnabled = translationSettings.wordTranslationEnabled === true;

          // Check if DEFAULT or TRANSLATION is selected.
          // If neither is selected (CUSTOM only), do not show subtitles container.
          try {
            const selectionResult = await chrome.storage.local.get(['showTranslation', 'showDefault', 'aiTranscriptionMode']);
            const rawAiMode = typeof selectionResult.aiTranscriptionMode === "string"
              ? selectionResult.aiTranscriptionMode.toLowerCase()
              : "off";
            const aiMode = ["off", "auto", "always"].includes(rawAiMode) ? rawAiMode : "off";
            this._currentAiMode = aiMode;
            const requestedTranslation = selectionResult.showTranslation || false;
            const requestedDefault = selectionResult.showDefault !== undefined ? selectionResult.showDefault : true;
            const useTranslation = aiMode === "off" ? false : requestedTranslation;
            const useDefault = aiMode === "off" ? true : requestedDefault;
            const videoId = new URLSearchParams(location.search).get("v");

            await this._syncTimingOffset(videoId, { aiMode, useTranslation });

            if (requestedTranslation && aiMode === "off") {
              DEBUG && console.log("[CarouselSubtitles] AI mode OFF - forcing DEFAULT subtitles");
            }

            if (!useDefault && !useTranslation) {
              DEBUG && console.log("[CarouselSubtitles] CUSTOM only selected - not showing subtitles container");
              return;
            }
          } catch (e) {
            this._currentAiMode = "off";
            console.warn("[CarouselSubtitles] Failed to check prompt selection:", e);
          }

          if (showToken !== this._showToken) return;

          this._injectCSS();

          // Load source sentences before creating UI so we can skip opening
          // an empty subtitles container when no active subtitles exist.
          await this._loadOriginalSentencesForHighlight();
          if (showToken !== this._showToken) return;

          // Always preprocess after loading to avoid stale fallback bubbles.
          this.processedSubtitles = this._preprocessSubtitles();
          if (window.ycWordTranslationEnabled) {
            void this._translateBubbleWords();
          }
          if (!Array.isArray(this.processedSubtitles) || this.processedSubtitles.length === 0) {
            this.currentSubtitleIndex = -1;
            DEBUG && console.log("[CarouselSubtitles] No active subtitles for current mode - skipping container");
            return;
          }

          this._createDOMStructure();
          this._createEllipsePool();

          this._setupEventListeners();
          this._setupScrollSync();

          this.isVisible = true;

          // Reset state for clean start
          this.currentSubtitleIndex = -1;

          // Reset scroll position
          if (this.trackElement) {
            this.trackElement.style.transform = "translateX(0)";
          }
          this._applyPlayerScaleCompensation();

          // Show the subtitles area
          if (this.subtitlesAreaElement) {
            this.subtitlesAreaElement.style.display = "block";

            // Sync single-line-mode class based on shouldSplitLines setting
            if (!this.shouldSplitLines) {
              this.subtitlesAreaElement.classList.add("single-line-mode");
            } else {
              this.subtitlesAreaElement.classList.remove("single-line-mode");
            }
          }

          // Force immediate render at current video time
          if (this.videoElement) {
            this._renderSubtitles(this.videoElement.currentTime);
          }

          DEBUG && console.log("[CarouselSubtitles] Shown");
        } finally {
          if (showToken === this._showToken) {
            this._isBootstrapping = false;
            this._showPromise = null;
          }
        }
      };

      this._showPromise = runShow();
      return this._showPromise;
    }

    async _translateBubbleWords() {
      const settings = await chrome.storage.local.get([
        "wordTranslationEnabled", "wordTranslationLanguages", "geminiGlobalModel"
      ]);
      window.ycWordTranslationEnabled = settings.wordTranslationEnabled === true;
      if (!window.ycWordTranslationEnabled) {
        this._wordTranslationByWord.clear();
        this._wordTranslationSignature = null;
        this._renderSubtitles(this.videoElement?.currentTime || 0);
        return;
      }
      const choice = settings.wordTranslationLanguages || "he";
      const languages = choice === "both" ? ["he", "en"] : [choice];
      const selectedModel = settings.geminiGlobalModel || "gemini-3.8-flash";
      const words = (this.processedSubtitles || []).flatMap((subtitle) =>
        subtitle.isSpecial ? [] : (subtitle.lines || []).flat()
      );
      if (!words.length) {
        window.ycUtils?.showToast?.("No word timings are available for translation yet.", "ℹ️", 3000);
        return;
      }
      const signature = `${selectedModel}|${languages.join(",")}|${words.map((word) => `${Math.round(Number(word.startTime) * 1000)}:${word.text}`).join("|")}`;
      if (this._wordTranslationSignature === signature && this._wordTranslationByWord.size) {
        this._renderSubtitles(this.videoElement?.currentTime || 0);
        return;
      }
      if (this._wordTranslationPromise) {
        await this._wordTranslationPromise;
        if (this._wordTranslationSignature !== signature) return this._translateBubbleWords();
        return;
      }
      this._wordTranslationPromise = (async () => {
        try {
          await window.dynamicLoader?.ensureDatabaseManagerLoaded?.();
          await window.dynamicLoader?.loadGroup?.("whisper");
          const videoId = window.ycUtils?.extractVideoId?.(window.location.href)
            || new URLSearchParams(location.search).get("v");
          window.ycUtils?.showToast?.(`Translating ${words.length} words with Gemini…`, "🌐", 2200);
          const translated = await window.ycWordTranslations?.translate(videoId, words, languages);
          if (!translated) throw new Error("Gemini did not return word translations.");
          const byWord = new Map();
          words.forEach((word, index) => {
            const label = languages.map((language) => translated[index]?.[language]).filter(Boolean).join(" · ");
            byWord.set(`${Math.round(Number(word.startTime) * 1000)}|${normalizeTranslationWord(word.text)}`, label);
          });
          this._wordTranslationByWord = byWord;
          this._wordTranslationSignature = signature;
          this._renderSubtitles(this.videoElement?.currentTime || 0);
          window.ycUtils?.showToast?.("Word translations are ready and saved for this video.", "✅", 2200);
        } catch (error) {
          console.warn("[CarouselSubtitles] Word translation failed:", error);
          window.ycUtils?.showToast?.(error?.message || "Word translation failed. Check Gemini API key/model settings.", "⚠️", 4000);
        } finally {
          this._wordTranslationPromise = null;
        }
      })();
      return this._wordTranslationPromise;
    }

    hide() {
      this._showToken++;
      this._isBootstrapping = false;
      this._showPromise = null;

      if (!this.isVisible) {
        if (this.abortController) {
          this.abortController.abort();
          this.abortController = null;
        }
        if (this.subtitlesAreaElement && this.subtitlesAreaElement.parentNode) {
          this.subtitlesAreaElement.remove();
        }
        return;
      }

      // Remove from DOM completely to prevent "hole" in layout
      if (this.subtitlesAreaElement && this.subtitlesAreaElement.parentNode) {
        this.subtitlesAreaElement.remove();
      }

      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }

      // Reset scroll position when hiding
      if (this.trackElement) {
        this.trackElement.style.transform = "translateX(0)";
      }

      // Clear visible bubbles
      if (this._visibleBubblesBuffer) {
        this._visibleBubblesBuffer.length = 0;
      }

      this.isVisible = false;

      DEBUG &&
        console.log("[CarouselSubtitles] 🙈 Hidden and removed from DOM");
    }

    destroy() {
      this.hide();

      if (this.subtitlesAreaElement) {
        this.subtitlesAreaElement.remove();
        this.subtitlesAreaElement = null;
      }
      this.trackScaleElement = null;
      this.trackElement = null;

      // Aggressive Memory Cleanup
      if (this.ellipsePool) {
        this.ellipsePool.length = 0;
        this.ellipsePool = null;
      }

      this.processedSubtitles = null;
      this._visibleBubblesBuffer = null;
      this.containerElement = null;
      this.videoElement = null;

      // 🎯 ניקוי originalSentences מה-window
      window.ycCarouselParsedSentences = null;

      if (CarouselSubtitles.activeInstance === this) {
        CarouselSubtitles.activeInstance = null;
      }

      DEBUG && console.log("[CarouselSubtitles] 💀 Destroyed");
    }

    update(currentTime) {
      if (!this.isVisible) return;
      this._renderSubtitles(currentTime);
    }

    setActivePosition(position) {
      this.activeChordPosition = position;
      if (this.isVisible && this.videoElement) {
        this.currentSubtitleIndex = -1;
        this._renderSubtitles(this.videoElement.currentTime);
      }
    }

    updateFontSize(newSize) {
      this.fontSize = newSize;
      localStorage.setItem("yc_carousel_subtitle_font_size", newSize);

      // Re-inject CSS with new font size
      this._injectCSS();

      // Force re-render if visible
      if (this.isVisible && this.videoElement) {
        this._renderSubtitles(this.videoElement.currentTime);
      }

      DEBUG &&
        console.log(`[CarouselSubtitles] 📏 Font size updated to ${newSize}px`);
    }

    updateWordSpacing(newSpacing) {
      this.wordSpacing = newSpacing;
      localStorage.setItem("yc_carousel_word_spacing", newSpacing);

      // Re-inject CSS with new word spacing
      this._injectCSS();

      // Force re-render if visible
      if (this.isVisible && this.videoElement) {
        this._renderSubtitles(this.videoElement.currentTime);
      }

      DEBUG &&
        console.log(
          `[CarouselSubtitles] 📐 Word spacing updated to ${newSpacing}px`
        );
    }

    updateSplitLines(isEnabled) {
      this.shouldSplitLines = isEnabled;
      localStorage.setItem("yc_carousel_split_lines", isEnabled);

      // CRITICAL: Clear processed subtitles to force re-processing with new setting
      this.processedSubtitles = null;

      // Manage single-line-mode CSS class
      if (this.subtitlesAreaElement) {
        if (!isEnabled) {
          // OFF = single line mode
          this.subtitlesAreaElement.classList.add("single-line-mode");
        } else {
          // ON = split lines mode
          this.subtitlesAreaElement.classList.remove("single-line-mode");
        }
      }

      // Force re-render if visible
      if (this.isVisible && this.videoElement) {
        this._renderSubtitles(this.videoElement.currentTime);
      }
    }

    updateScale(newScale) {
      // Re-inject CSS with new scale
      this._injectCSS();
      this._applyPlayerScaleCompensation();

      // Force re-render if visible
      if (this.isVisible && this.videoElement) {
        this._renderSubtitles(this.videoElement.currentTime);
      }

      DEBUG &&
        console.log(`[CarouselSubtitles] 📐 Scale updated to ${newScale}`);
    }

    handlePlayerScaleChanged() {
      this._applyPlayerScaleCompensation();

      if (this.isVisible && this.videoElement) {
        this._renderSubtitles(this.videoElement.currentTime);
      }
    }

    updatePanelBackground(color) {
      this.panelBackground = color;
      localStorage.setItem("yc_carousel_subtitle_panel_bg", color);
      this._injectCSS();
      DEBUG &&
        console.log(`[CarouselSubtitles] 🎨 Panel background updated to ${color}`);
    }

    updateEllipseBackground(color) {
      this.ellipseBackground = color;
      localStorage.setItem("yc_carousel_subtitle_ellipse_bg", color);
      this._injectCSS();
      DEBUG &&
        console.log(`[CarouselSubtitles] 🎨 Ellipse background updated to ${color}`);
    }

    updateHighlightColor(color) {
      this.highlightColor = color;
      localStorage.setItem("yc_carousel_subtitle_highlight", color);
      this._injectCSS();
      if (this.isVisible && this.videoElement) {
        this._renderSubtitles(this.videoElement.currentTime);
      }
      DEBUG &&
        console.log(`[CarouselSubtitles] 🎨 Highlight color updated to ${color}`);
    }

    updateHighlightTextColor(color) {
      this.highlightTextColor = color;
      localStorage.setItem("yc_carousel_subtitle_highlight_text", color);
      this._injectCSS();
      if (this.isVisible && this.videoElement) {
        this._renderSubtitles(this.videoElement.currentTime);
      }
      DEBUG &&
        console.log(`[CarouselSubtitles] 🎨 Highlight text color updated to ${color}`);
    }

    updateWordColor(color) {
      this.wordColor = color;
      localStorage.setItem("yc_carousel_subtitle_word_color", color);
      this._injectCSS();
      if (this.isVisible && this.videoElement) {
        this._renderSubtitles(this.videoElement.currentTime);
      }
      DEBUG &&
        console.log(`[CarouselSubtitles] 🎨 Word color updated to ${color}`);
    }

    updatePassedWordColor(color) {
      this.passedWordColor = color;
      localStorage.setItem("yc_carousel_subtitle_passed_color", color);
      this._injectCSS();
      if (this.isVisible && this.videoElement) {
        this._renderSubtitles(this.videoElement.currentTime);
      }
      DEBUG &&
        console.log(`[CarouselSubtitles] 🎨 Passed word color updated to ${color}`);
    }

    /*==========================================================================
      CSS & DOM
    ==========================================================================*/

    _injectCSS() {
      const existingStyle = document.getElementById(
        "yc-carousel-subtitles-styles"
      );

      // Get carousel scale (default: 1.0)
      const carouselScale = window.ycChordCarousel?.currentScale || 1.0;

      // Calculate dynamic values based on font size AND carousel scale
      const baseFontSize = this.fontSize * carouselScale;
      const padding = Math.round(baseFontSize * 0.625); // 10px at 16px font
      const paddingH = Math.round(baseFontSize * 1.5625); // 25px at 16px font
      const borderRadius = Math.round(baseFontSize * 3.125); // 50px at 16px font
      const areaHeight = Math.round(baseFontSize * 4.375); // 70px at 16px font
      const wordMargin = this.wordSpacing * carouselScale; // רווח בין מילים - ניתן לשינוי דרך ההגדרות
      const gap = Math.round(20 * carouselScale); // gap between ellipses

      // Get color settings
      const panelBg = this.panelBackground || "#f9f9f9";
      const ellipseBg = this.ellipseBackground || "#ffffff";
      const highlightColor = this.highlightColor || "#ffff00";
      const highlightTextColor = this.highlightTextColor || "#000000";
      const wordColor = this.wordColor || "#000000";
      const passedWordColor = this.passedWordColor || "#e91e63";

      // Get font settings
      const fontFamily = window.ycCarouselSubtitlesFont
        ? `'${window.ycCarouselSubtitlesFont}', sans-serif`
        : "'Roboto', sans-serif";
      const fontWeight = window.ycCarouselSubtitlesBoldMode === "all" ? "700" : "normal";

      const cssContent = `
        .yc-carousel-subtitles-area { --yc-carousel-subtitle-player-scale-comp: 1; background: ${panelBg}; min-height: ${areaHeight}px; height: auto; display: block; position: relative; overflow: visible; border-top: 1px solid #eee; width: 100%; direction: ltr; unicode-bidi: isolate; font-family: ${fontFamily}; }
        .yc-carousel-subtitles-area.is-rtl { direction: rtl; }
        .yc-subtitles-scale { display: flex; align-items: center; position: absolute; top: 0; bottom: 0; left: 0; right: auto; width: max-content; transform-origin: left center; transform: scaleX(var(--yc-carousel-subtitle-player-scale-comp)); direction: ltr; unicode-bidi: normal; }
        .yc-carousel-subtitles-area.is-rtl .yc-subtitles-scale { left: auto; right: 0; transform-origin: right center; direction: rtl; }
        .yc-carousel-subtitles-area.has-word-translations .yc-subtitles-scale { position: relative; inset: auto; min-height: ${areaHeight}px; height: auto; }
        .yc-subtitles-track { display: flex; align-items: center; position: relative; padding-left: 0; padding-right: 0; gap: ${gap}px; width: max-content; direction: inherit; unicode-bidi: normal; transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1); will-change: transform; }
        .yc-subtitle-ellipse { background: ${ellipseBg}; border: 1px solid #000000; border-radius: ${borderRadius}px; padding: ${padding}px ${paddingH}px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: inline-block; text-align: center; flex-shrink: 0; white-space: normal; text-wrap: balance; line-height: 1.4; opacity: 1; direction: inherit; unicode-bidi: plaintext; transition: border-color 0.3s; max-width: 600px; overflow: visible; position: relative; font-family: ${fontFamily}; }
        .yc-subtitle-ellipse.active { border-width: 2px; z-index: 10; }
        .yc-subtitle-word { color: ${wordColor}; font-size: ${baseFontSize}px; font-weight: ${fontWeight}; padding: 2px 4px; border: 1px solid transparent; border-radius: 3px; margin: 0 ${wordMargin}px; direction: inherit; unicode-bidi: normal; transition: none; display: inline-block; font-family: ${fontFamily}; }
        .yc-subtitle-word.yc-word-translation { position: relative; display: inline-block; vertical-align: baseline; padding: ${Math.max(14, Math.round(baseFontSize * 0.9))}px 7px 2px; }
        .yc-subtitle-word.yc-word-translation::before { content: attr(data-yc-word-translation); position: absolute; left: calc(50% - var(--yc-word-translation-center-offset, 0px)); top: 1px; transform: translateX(-50%); color: ${wordColor}; font-family: ${fontFamily}; font-size: ${Math.max(10, Math.round(baseFontSize * 0.72))}px; font-weight: ${fontWeight}; line-height: 1.1; white-space: nowrap; text-shadow: 0 1px 2px rgba(255,255,255,0.8); pointer-events: none; z-index: 1; }
        .yc-subtitle-word.current { background-color: ${highlightColor}; color: ${highlightTextColor}; }
        .yc-subtitle-word.passed { color: ${passedWordColor}; }
        .yc-subtitle-word.countdown-active { color: #3ea6ff; font-weight: bold; }
        .yc-subtitle-word.countdown-inactive { color: rgba(0,0,0,0.4); font-weight: bold; }
        .yc-carousel-subtitles-area.single-line-mode .yc-subtitle-ellipse { white-space: nowrap !important; max-width: 90vw !important; }
        
        /* Clickable words and ellipses */
        .yc-subtitle-word { cursor: pointer; transition: transform 0.1s ease, opacity 0.1s ease; }
        .yc-subtitle-word:hover { transform: scale(1.05); opacity: 0.8; }
        .yc-subtitle-ellipse { cursor: pointer; }
        
        /* Singing Start Indicator - Green Dot inside Ellipse */
        .yc-ellipse-singing-dot { position: absolute; top: 8px; width: 10px; height: 10px; background: #4CAF50; border-radius: 50%; box-shadow: 0 0 4px rgba(76, 175, 80, 0.6); z-index: 20; }
        .yc-carousel-subtitles-area:not(.is-rtl) .yc-ellipse-singing-dot { left: 10px; }
        .yc-carousel-subtitles-area.is-rtl .yc-ellipse-singing-dot { right: 10px; }
      `;

      if (existingStyle) {
        existingStyle.textContent = cssContent;
      } else {
        const style = document.createElement("style");
        style.id = "yc-carousel-subtitles-styles";
        style.textContent = cssContent;
        document.head.appendChild(style);
      }
    }

    _createDOMStructure() {
      if (!this.containerElement) return;

      // Don't create if already exists
      if (this.subtitlesAreaElement && this.subtitlesAreaElement.isConnected) {
        return;
      }

      this.subtitlesAreaElement = document.createElement("div");
      this.subtitlesAreaElement.className = "yc-carousel-subtitles-area";
      this.trackScaleElement = document.createElement("div");
      this.trackScaleElement.className = "yc-subtitles-scale";
      this.trackElement = document.createElement("div");
      this.trackElement.className = "yc-subtitles-track";
      this.trackScaleElement.appendChild(this.trackElement);
      this.subtitlesAreaElement.appendChild(this.trackScaleElement);
      this.containerElement.appendChild(this.subtitlesAreaElement);
      this._applyPlayerScaleCompensation();
    }

    _getPlayerScaleCompensation() {
      const value = Number(window.ycChordCarousel?.playerScaleCompensationX);
      return Number.isFinite(value) && value > 0 ? value : 1;
    }

    _applyPlayerScaleCompensation() {
      if (!this.subtitlesAreaElement) return;
      const compensation = this._getPlayerScaleCompensation();
      this.subtitlesAreaElement.style.setProperty(
        "--yc-carousel-subtitle-player-scale-comp",
        compensation.toFixed(5)
      );
    }

    _createEllipsePool() {
      // ✅ FIX: If pool exists, re-attach orphaned nodes to new track
      if (this.ellipsePool && this.ellipsePool.length > 0) {
        // Pool exists but nodes are orphaned - re-attach them to the new track
        if (this.trackElement) {
          const fragment = document.createDocumentFragment();
          for (let i = 0; i < this.ellipsePool.length; i++) {
            fragment.appendChild(this.ellipsePool[i]);
          }
          this.trackElement.appendChild(fragment);
        }
        return;
      }

      this.ellipsePool = [];
      const fragment = document.createDocumentFragment();

      for (let i = 0; i < this.maxEllipses; i++) {
        const ellipse = document.createElement("div");
        ellipse.className = "yc-subtitle-ellipse";
        ellipse.style.display = "none";

        ellipse.wordSpans = [];
        ellipse.lineBreaks = [];

        for (let j = 0; j < this.maxWordsPerEllipse; j++) {
          const span = document.createElement("span");
          span.className = "yc-subtitle-word";
          ellipse.appendChild(span);
          ellipse.wordSpans.push(span);
          if (j < this.maxWordsPerEllipse - 1) {
            ellipse.appendChild(document.createTextNode(" "));
          }
        }

        for (let j = 0; j < this.maxBrsPerEllipse; j++) {
          const br = document.createElement("br");
          ellipse.appendChild(br);
          ellipse.lineBreaks.push(br);
        }

        fragment.appendChild(ellipse);
        this.ellipsePool.push(ellipse);
      }

      if (this.trackElement) {
        this.trackElement.appendChild(fragment);
      }
    }

    /*==========================================================================
      LOGIC
    ==========================================================================*/

    _syncDirection() {
      if (!this.subtitlesAreaElement) return false;

      // זיהוי אוטומטי של כיוון לפי התוכן של הכתוביות
      let dir = "LTR";

      if (this.processedSubtitles && this.processedSubtitles.length > 0) {
        // 🎯 בדיקת כיוון לפי מספר בועות (לא רק הראשונה)
        // זה מונע בעיות כשיש מילה בודדת בשפה אחרת בהתחלה
        const realSubtitles = this.processedSubtitles.filter(sub => !sub.isSpecial && sub.text);

        if (realSubtitles.length > 0) {
          // בדוק את 5 הבועות הראשונות (או פחות אם אין)
          const samplesToCheck = Math.min(5, realSubtitles.length);
          let rtlCount = 0;
          let ltrCount = 0;

          const rtlRegex = /[\u0590-\u08FF\u200F\u202B\u202E\uFB1D-\uFDFF\uFE70-\uFEFF]/;
          const ltrRegex = /[a-zA-Z]/;

          for (let i = 0; i < samplesToCheck; i++) {
            const text = realSubtitles[i].text;
            if (rtlRegex.test(text)) {
              rtlCount++;
            }
            if (ltrRegex.test(text)) {
              ltrCount++;
            }
          }

          // 🎯 אם יש גם RTL וגם LTR - תמיד LTR (גלילה רגילה)
          if (rtlCount > 0 && ltrCount > 0) {
            dir = "LTR";
          } else if (rtlCount > samplesToCheck / 2) {
            // אם רק RTL - הכיוון הוא RTL
            dir = "RTL";
          } else {
            dir = "LTR";
          }
        }
      }

      const isRTL = dir === "RTL";
      this.currentDirection = dir;
      this.subtitlesAreaElement.classList.toggle("is-rtl", isRTL);
      this.subtitlesAreaElement.setAttribute("dir", isRTL ? "rtl" : "ltr");
      if (this.trackElement) {
        this.trackElement.setAttribute("dir", isRTL ? "rtl" : "ltr");
      }
      return isRTL;
    }

    _calculateTargetLine(isTextRTL) {
      // 1. קביעת כיוון האקורדים האמיתי (Visual Layout)
      const carouselDir =
        (window.ycChordCarousel && window.ycChordCarousel.currentDirection) ||
        window.carouselDirection ||
        "LTR";

      const isCarouselRTL = carouselDir === "RTL";

      // 2. חישוב המרחק הויזואלי של האקורד הפעיל
      const chordVisualPos =
        CONTAINER_PADDING +
        this.activeChordPosition * CHORD_WIDTH_TOTAL +
        CHORD_TILE_WIDTH / 2;

      // 3. חישוב יעד ה-Track בהתאם לעוגן שלו (Anchor)
      if (isCarouselRTL === isTextRTL) {
        // תרחיש תואם: שניהם באותו כיוון
        return chordVisualPos + BASE_ALIGNMENT_OFFSET;
      } else {
        // תרחיש הפוך: כיוונים מנוגדים - צריך היפוך מתמטי
        const containerWidth = this.containerElement.clientWidth;
        return containerWidth - chordVisualPos + BASE_ALIGNMENT_OFFSET;
      }
    }

    _calculateTrackShift(visibleBubbles, activeBubbleIndex, isRTL) {
      if (!visibleBubbles || visibleBubbles.length === 0) return 0;
      // Safety check: ensure index is within bounds
      if (activeBubbleIndex < 0 || activeBubbleIndex >= visibleBubbles.length)
        return 0;

      const targetLine = this._calculateTargetLine(isRTL);
      const gap = 20;

      let distanceToCenter = 0;

      for (let i = 0; i < activeBubbleIndex; i++) {
        distanceToCenter += visibleBubbles[i].offsetWidth + gap;
      }

      const activeBubble = visibleBubbles[activeBubbleIndex];
      distanceToCenter += activeBubble.offsetWidth / 2;

      if (isRTL) {
        return distanceToCenter - targetLine;
      } else {
        return targetLine - distanceToCenter;
      }
    }

    _getVisualTimeFromScroll(scrollLeft, totalScrollWidth, clientWidth) {
      if (!window.ycChordCarousel || !window.subtitleState?.chords) return null;

      const scale = window.ycChordCarousel.currentScale || 1;
      const effectiveTileWidth = CHORD_WIDTH_TOTAL * scale;

      let visualIndex;
      if (this.currentDirection === "RTL") {
        const scrolledFromRight = Math.abs(scrollLeft);
        visualIndex = Math.floor(scrolledFromRight / effectiveTileWidth);
      } else {
        visualIndex = Math.floor(scrollLeft / effectiveTileWidth);
      }

      let targetChordIndex = visualIndex + this.activeChordPosition;
      const chords = window.subtitleState.chords;
      if (targetChordIndex < 0) targetChordIndex = 0;
      if (targetChordIndex >= chords.length)
        targetChordIndex = chords.length - 1;

      return chords[targetChordIndex].time;
    }

    async _syncTimingOffset(videoId, { aiMode = null, useTranslation = false, subtitlesData = null } = {}) {
      if (!window.subtitleState) return;

      const resolvedVideoId = videoId || new URLSearchParams(location.search).get("v");
      if (!resolvedVideoId || !window.databaseManager?.getSubtitleOffsetForActiveSource) {
        window.subtitleState.timing_offset = 0;
        return;
      }

      try {
        const offsetResult = await window.databaseManager.getSubtitleOffsetForActiveSource(
          resolvedVideoId,
          { useTranslation, aiMode, subtitlesData }
        );
        window.subtitleState.timing_offset = Number(offsetResult?.offset) || 0;
        window.subtitleState.timingSourceKey = offsetResult?.sourceKey || null;
      } catch (error) {
        console.warn("[CarouselSubtitles] Failed to sync timing offset:", error);
      }
    }

    _getAdjustedSubtitleTime(currentTime) {
      const offset = Number(window.subtitleState?.timing_offset);
      return currentTime + (Number.isFinite(offset) ? offset : 0);
    }

    /*==========================================================================
      RENDERING
    ==========================================================================*/

    _populateEllipse(ellipse, subtitle, currentWordIndex, currentTime) {
      const sStyle = ellipse.style;
      if (sStyle.display !== "inline-block") sStyle.display = "inline-block";

      const dir = this._detectTextDirection(subtitle.text);
      if (sStyle.direction !== dir) sStyle.direction = dir;
      if (ellipse.getAttribute("dir") !== dir) {
        ellipse.setAttribute("dir", dir);
      }

      // Store ellipse start time for click-to-seek
      ellipse.dataset.startTime = subtitle.startTime;

      // 🎤 Handle singing start dot
      let singingDot = ellipse.querySelector(".yc-ellipse-singing-dot");
      if (subtitle.isSingingStart) {
        if (!singingDot) {
          singingDot = document.createElement("div");
          singingDot.className = "yc-ellipse-singing-dot";
          singingDot.title = "Singing starts here";
          ellipse.insertBefore(singingDot, ellipse.firstChild);
        }
        singingDot.style.display = "block";
      } else if (singingDot) {
        singingDot.style.display = "none";
      }

      // Hide all children first
      const spans = ellipse.wordSpans;
      const len = spans.length;
      for (let i = 0; i < len; i++) {
        if (spans[i].style.display !== "none") spans[i].style.display = "none";
      }

      const brs = ellipse.lineBreaks;
      const brLen = brs.length;
      for (let i = 0; i < brLen; i++) {
        if (brs[i].style.display !== "none") brs[i].style.display = "none";
      }

      if (subtitle.isSpecial) {
        const span = spans[0];
        const timeUntil = subtitle.endTime - currentTime;
        const countdownStart = subtitle.countdownDuration || 0;
        const isCurrent =
          currentTime >= subtitle.startTime && currentTime <= subtitle.endTime;

        let newText = subtitle.text;
        let newClass = "yc-subtitle-word";

        // Check if this is [Outro] - no countdown
        const isOutro = subtitle.text === "[Outro]";

        // Check if countdown is enabled globally
        const countdownEnabled = window.countdownTimerEnabled !== false;

        if (isCurrent && countdownStart !== 0 && !isOutro && countdownEnabled) {
          // For [Intro] and [Instrumental] - show countdown without parentheses
          if (timeUntil > countdownStart) {
            newText = `${subtitle.text} ${countdownStart}`;
            newClass = "yc-subtitle-word countdown-inactive";
          } else {
            newText = `${subtitle.text} ${Math.ceil(timeUntil)}`;
            newClass = "yc-subtitle-word countdown-active";
          }
        }
        // If isOutro or no countdown or countdown disabled, just show the text as is

        if (span.textContent !== newText) span.textContent = newText;
        if (span.className !== newClass) span.className = newClass;
        span.style.display = "inline";
        return;
      }

      let spanIndex = 0;
      let globalWordIndex = 0; // 🎯 אינדקס גלובלי של מילה בבועה
      const lines = subtitle.lines;

      // 🎯 בדיקה אם זו בועה מ-originalSentences
      const isOriginalSentenceBubble = subtitle.isOriginalSentence === true;

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        const lineSpans = [];
        const lineTranslationLabels = [];
        const lineTranslationResolved = [];

        // Add words for this line
        for (let wIdx = 0; wIdx < line.length; wIdx++) {
          if (spanIndex >= len) break;
          const word = line[wIdx];
          const span = spans[spanIndex++];

          if (span.textContent !== word.text) span.textContent = word.text;

          // Store word index for click-to-seek
          span.dataset.wordIndex = word.wordIndex;

          let cls = "yc-subtitle-word";

          // Check if word highlight is enabled (default: true)
          const wordHighlightEnabled = window.wordHighlightEnabled !== false;

          if (wordHighlightEnabled) {
            // 🎯 אם זו בועה מ-originalSentences - הדגש רק את המילים שהזמן הנוכחי בטווח שלהן
            if (isOriginalSentenceBubble && word.isFromOriginalSentence) {
              const wordInTimeRange = currentTime >= word.partStartTime && currentTime <= word.partEndTime;
              if (wordInTimeRange) {
                cls += " current";
              } else if (window.passedWordsEnabled !== false && word.partEndTime < currentTime) {
                cls += " passed";
              }
            }
            // 🎯 אם יש word-level - השתמש בו
            else if (currentWordIndex !== -1 && word.wordIndex === currentWordIndex) {
              cls += " current";
            }
            else if (window.passedWordsEnabled !== false && word.endTime < currentTime) {
              // Word has passed - mark as passed (if enabled)
              cls += " passed";
            }
          } else if (window.passedWordsEnabled !== false && word.endTime < currentTime) {
            cls += " passed";
          }

          const translationKey = `${Math.round(Number(word.startTime) * 1000)}|${normalizeTranslationWord(word.text)}`;
          const translationLabel = window.ycWordTranslationEnabled
            ? this._wordTranslationByWord.get(translationKey)
            : "";
          lineSpans.push(span);
          lineTranslationLabels.push(translationLabel || "");
          lineTranslationResolved.push(window.ycWordTranslationEnabled && this._wordTranslationByWord.has(translationKey));
          if (translationLabel) {
            cls += " yc-word-translation";
            span.dataset.ycWordTranslation = translationLabel;
            span.style.setProperty("--yc-word-translation-center-offset", "0px");
          } else {
            delete span.dataset.ycWordTranslation;
            span.style.removeProperty("--yc-word-translation-center-offset");
          }
          if (span.className !== cls) span.className = cls;

          // Keep source words in normal inline flow; the label is absolutely
          // positioned so it cannot push or wrap the original Italian text.
          span.style.display = translationLabel ? "inline-block" : "inline";
          globalWordIndex++; // 🎯 קידום האינדקס הגלובלי
        }

        // Insert line break after this line (except for the last line)
        if (lineIdx < lines.length - 1 && lineIdx < brLen) {
          const br = brs[lineIdx];
          br.style.display = "block";

          // Move BR to correct position in DOM (after the last word of this line)
          if (spanIndex > 0 && spans[spanIndex - 1].nextSibling !== br) {
            ellipse.insertBefore(br, spans[spanIndex]);
          }
        }

        // If a target word represents a short, untranslated function word plus
        // its neighbor (e.g. Italian "di studiare" -> Hebrew "ללמוד"), center
        // one label over the complete source phrase instead of over one token.
        for (let wordIdx = 0; wordIdx < lineSpans.length; wordIdx++) {
          if (!lineTranslationLabels[wordIdx]) continue;
          let groupStart = wordIdx;
          while (
            groupStart > Math.max(0, wordIdx - 2) &&
            lineTranslationResolved[groupStart - 1] &&
            !lineTranslationLabels[groupStart - 1] &&
            TRANSLATION_JOINER_WORDS.has(normalizeTranslationWord(line[groupStart - 1]?.text))
          ) groupStart--;
          if (groupStart === wordIdx) continue;

          const groupStartRect = lineSpans[groupStart].getBoundingClientRect();
          const groupEndRect = lineSpans[wordIdx].getBoundingClientRect();
          const anchorRect = lineSpans[wordIdx].getBoundingClientRect();
          const groupCenter = (Math.min(groupStartRect.left, groupEndRect.left) + Math.max(groupStartRect.right, groupEndRect.right)) / 2;
          const anchorCenter = (anchorRect.left + anchorRect.right) / 2;
          lineSpans[wordIdx].style.setProperty(
            "--yc-word-translation-center-offset",
            `${anchorCenter - groupCenter}px`
          );
        }
      }
    }

    _renderSubtitles(currentTime) {
      if (this._isBootstrapping && !this.isVisible) return;
      const adjustedTime = this._getAdjustedSubtitleTime(currentTime);
      // 🟢 FIX: Ensure processing happens if it hasn't yet
      if (!this.processedSubtitles) {
        this.processedSubtitles = this._preprocessSubtitles();
      }

      // Safety exit if no data or no pool
      if (
        !this.processedSubtitles ||
        !this.processedSubtitles.length ||
        !this.ellipsePool
      )
        return;

      const isRTL = this._syncDirection();
      const subs = this.processedSubtitles;
      const subsLen = subs.length;

      // Efficient Index Finding
      let index = -1;
      let startIndex = 0;

      // Optimization: Start searching from last known index if time is progressing
      if (
        this.currentSubtitleIndex !== -1 &&
        this.currentSubtitleIndex < subsLen
      ) {
        if (adjustedTime >= subs[this.currentSubtitleIndex].startTime) {
          startIndex = this.currentSubtitleIndex;
        }
      }

      for (let i = startIndex; i < subsLen; i++) {
        const s = subs[i];
        if (adjustedTime >= s.startTime && adjustedTime <= s.endTime) {
          index = i;
          break;
        }
        if (adjustedTime < s.startTime) {
          // We are between subtitles or before
          index = i;
          break;
        }
      }

      // Fallback
      if (index === -1 && subsLen > 0) index = subsLen - 1;

      const currentWordIndex = this._findCurrentWord(adjustedTime);

      const bufferPrev = 5;
      const bufferNext = 4;

      let startRender = Math.max(0, index - bufferPrev);
      let endRender = Math.min(subsLen - 1, index + bufferNext);

      this._visibleBubblesBuffer.length = 0;

      let poolIndex = 0;
      const poolLen = this.ellipsePool.length;

      // Reset Pool visibility
      for (let i = 0; i < poolLen; i++) {
        this.ellipsePool[i].style.display = "none";
      }

      let activeBubbleDomIndex = -1;

      for (let i = startRender; i <= endRender; i++) {
        if (poolIndex >= poolLen) break;

        const sub = subs[i];
        const ellipse = this.ellipsePool[poolIndex++];

        this._populateEllipse(ellipse, sub, currentWordIndex, adjustedTime);

        if (i === index) {
          if (!ellipse.classList.contains("active"))
            ellipse.classList.add("active");
          activeBubbleDomIndex = this._visibleBubblesBuffer.length;
        } else {
          if (ellipse.classList.contains("active"))
            ellipse.classList.remove("active");
        }

        this._visibleBubblesBuffer.push(ellipse);
      }

      const hasWordTranslations = this._visibleBubblesBuffer.some((ellipse) =>
        ellipse.querySelector(".yc-word-translation")
      );
      this.subtitlesAreaElement?.classList.toggle("has-word-translations", Boolean(hasWordTranslations));

      // Only transform if we have an active bubble calculated
      if (activeBubbleDomIndex !== -1 && this.trackElement) {
        const shift = this._calculateTrackShift(
          this._visibleBubblesBuffer,
          activeBubbleDomIndex,
          isRTL
        );
        this.trackElement.style.transform = `translateX(${shift}px)`;
      }

      this.currentSubtitleIndex = index;
    }

    /*==========================================================================
      DATA HELPERS
    ==========================================================================*/
    _detectTextDirection(text) {
      return /[\u0590-\u05FF\u0600-\u06FF]/.test(text) ? "rtl" : "ltr";
    }

    _findCurrentWord(time) {
      if (!window.subtitleState?.words) return -1;
      const words = window.subtitleState.words;
      // Simple loop is fast enough for < 1000 words
      // Return the INDEX of the current word instead of the word object
      for (let i = 0; i < words.length; i++) {
        if (time >= words[i].startTime && time <= words[i].endTime) return i;
      }
      return -1;
    }

    _calculateCountdownDuration(sectionDuration) {
      if (sectionDuration >= 10) return 10;
      if (sectionDuration >= 5) return 5;
      if (sectionDuration >= 3) return 3;
      return 0;
    }

    _preprocessSubtitles() {
      if (!window.subtitleState) return [];

      // 🎯 Skip subtitles for custom prompts - they are shown in main panel only
      if (window.subtitleState.isCustomPrompt) {
        DEBUG && console.log("[CarouselSubtitles] 🎯 Skipping - custom prompt active");
        return [];
      }

      const hasWordLevel = window.subtitleState.words?.length > 0;

      // 🎯 אם יש word-level - בנה בועות ישירות מהמילים
      if (hasWordLevel) {
        DEBUG && console.log("[CarouselSubtitles] 🎯 Building bubbles from word-level timing");
        return this._buildBubblesFromWords();
      }

      // 🎯 אם אין word-level - השתמש ב-originalSentences
      if (window.ycCarouselParsedSentences?.length > 0) {
        DEBUG && console.log("[CarouselSubtitles] 🎯 Using originalSentences for bubbles (no word-level)");
        return this._preprocessFromOriginalSentences();
      }

      // אין נתונים
      return [];
    }

    // 🎯 בניית בועות ישירות מרמת מילים
    _buildBubblesFromWords() {
      const words = window.subtitleState.words;
      const chords = window.subtitleState.chords || [];

      const MAX_CHARS = 80;
      const GAP_FOR_INSTRUMENTAL = 5; // שניות
      const GAP_FOR_PUNCTUATION = 1.5; // שניות

      const bubbles = [];
      const specials = [];

      let currentBubble = null;

      // 🎯 [Intro] - אם המילה הראשונה מתחילה אחרי 0.5 שניות
      if (words.length > 0 && words[0].startTime > 0.5) {
        specials.push({
          text: "[Intro]",
          startTime: 0,
          endTime: words[0].startTime,
          isSpecial: true
        });
      }

      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const wordText = (word.text || '').trim();
        if (!wordText) continue;

        // חשב פער למילה הבאה
        let gapToNext = 0;
        if (i < words.length - 1) {
          gapToNext = words[i + 1].startTime - word.endTime;
        }

        // האם המילה מסתיימת בסימן פיסוק?
        const hasPunctuation = /[.!?]$/.test(wordText);

        // התחל בועה חדשה אם אין
        if (!currentBubble) {
          currentBubble = {
            text: wordText,
            startTime: word.startTime,
            endTime: word.endTime,
            words: [{ text: wordText, wordIndex: i, startTime: word.startTime, endTime: word.endTime }]
          };
        } else {
          // הוסף מילה לבועה הנוכחית
          currentBubble.text += ' ' + wordText;
          currentBubble.endTime = word.endTime;
          currentBubble.words.push({ text: wordText, wordIndex: i, startTime: word.startTime, endTime: word.endTime });
        }

        // בדוק אם צריך לסגור בועה
        let shouldClose = false;
        let addInstrumental = false;

        // 1. פער גדול (5+ שניות) - סגור + Instrumental
        if (gapToNext >= GAP_FOR_INSTRUMENTAL) {
          shouldClose = true;
          addInstrumental = true;
        }
        // 2. סימן פיסוק + פער בינוני (1.5+ שניות)
        else if (hasPunctuation && gapToNext >= GAP_FOR_PUNCTUATION) {
          shouldClose = true;
        }
        // 3. אורך מקסימלי
        else if (currentBubble.text.length >= MAX_CHARS) {
          shouldClose = true;
        }

        if (shouldClose && currentBubble) {
          bubbles.push(currentBubble);
          currentBubble = null;

          // הוסף Instrumental אם צריך
          if (addInstrumental && i < words.length - 1) {
            specials.push({
              text: "[Instrumental]",
              startTime: word.endTime,
              endTime: words[i + 1].startTime,
              isSpecial: true
            });
          }
        }
      }

      // סגור בועה אחרונה אם נשארה
      if (currentBubble) {
        bubbles.push(currentBubble);
      }

      // 🎯 [Outro] - תמיד אחרי המילה האחרונה
      if (words.length > 0) {
        const lastWord = words[words.length - 1];
        const lastChord = chords.length > 0 ? chords[chords.length - 1] : null;
        const outroEnd = lastChord ? lastChord.time + 3 : lastWord.endTime + 5;

        specials.push({
          text: "[Outro]",
          startTime: lastWord.endTime,
          endTime: outroEnd,
          isSpecial: true
        });
      }

      // מיזוג ומיון
      const all = [...bubbles, ...specials].sort((a, b) => a.startTime - b.startTime);

      // סימון singing start
      const singingStartIndices = this._detectSingingStartSubtitles(all);

      // עיבוד סופי - הוספת lines ו-countdown
      return all.map((sub, index) => {
        if (sub.isSpecial) {
          const dur = sub.endTime - sub.startTime;
          const cd = this._calculateCountdownDuration(dur);
          return { ...sub, countdownDuration: cd, lines: [] };
        }
        return {
          ...sub,
          lines: this._segmentBubbleWords(sub),
          isSingingStart: singingStartIndices.has(index)
        };
      });
    }

    // 🎯 חלוקת מילים בבועה לשורות מאוזנות
    _segmentBubbleWords(bubble) {
      const words = bubble.words || [];
      if (words.length === 0) return [[]];

      // 🎯 Helper to detect RTL text
      const isRTL = (text) => /[\u0590-\u05FF\u0600-\u06FF]/.test(text);

      // 🎯 Check if we have dual-language (mixed LTR and RTL)
      const ltrWords = words.filter(w => !isRTL(w.text));
      const rtlWords = words.filter(w => isRTL(w.text));
      const isDualLanguage = ltrWords.length > 0 && rtlWords.length > 0;

      if (isDualLanguage) {
        // Dual-language: separate by language
        // Return RTL first (original - top line), then LTR (translation - bottom line)
        return [rtlWords, ltrWords];
      }

      // Single language: split by length as before
      const totalLength = words.reduce((sum, w) => sum + w.text.length + 1, 0) - 1;

      // אם קצר מדי - שורה אחת
      if (totalLength < 30 || words.length <= 3) {
        return [words];
      }

      // מציאת נקודת החלוקה הקרובה ביותר לאמצע
      const targetLength = totalLength / 2;
      let currentLength = 0;
      let bestSplitIndex = 1;
      let bestDiff = Infinity;

      for (let i = 0; i < words.length - 1; i++) {
        currentLength += words[i].text.length + 1;
        const diff = Math.abs(currentLength - targetLength);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestSplitIndex = i + 1;
        }
      }

      // חלוקה לשתי שורות
      const line1 = words.slice(0, bestSplitIndex);
      const line2 = words.slice(bestSplitIndex);

      return line2.length > 0 ? [line1, line2] : [line1];
    }

    // 🎯 בניית בועות מ-originalSentences (כשאין word-level)
    _preprocessFromOriginalSentences() {
      const originalSentences = window.ycCarouselParsedSentences;
      const chords = window.subtitleState?.chords || [];
      const MAX_CHARS = 80; // אורך מקסימלי לבועה
      const GAP_FOR_INSTRUMENTAL = 5; // שניות - פער שמחייב בועה חדשה

      // 🎯 Helper to detect RTL text (defined once, outside loop)
      const isRTL = (text) => /[\u0590-\u05FF\u0600-\u06FF]/.test(text);

      const bubbles = [];
      let currentBubble = null;
      let prevSentenceEndTime = 0;

      for (const sentence of originalSentences) {
        // 🎯 ניקוי סימני מוזיקה וסוגריים מהטקסט
        const text = sentence.text.trim()
          .replace(/[♪♫]/g, '')
          .replace(/\[.*?\]/g, '')  // הסרת [תוכן]
          .replace(/\(.*?\)/g, '')  // הסרת (תוכן)
          .replace(/\s+/g, ' ')     // ניקוי רווחים כפולים
          .trim();
        if (!text) continue;

        // 🎯 Check if this sentence is dual-language (optimized - single loop)
        const words = text.split(/\s+/);
        let hasLTR = false;
        let hasRTL = false;
        
        for (const word of words) {
          if (isRTL(word)) {
            hasRTL = true;
          } else {
            hasLTR = true;
          }
          // Early exit if we found both
          if (hasLTR && hasRTL) break;
        }
        
        const isDualLanguage = hasLTR && hasRTL;

        // 🎯 בדוק אם יש פער גדול מהמשפט הקודם (Instrumental)
        const gapFromPrev = currentBubble ? (sentence.startTime - currentBubble.endTime) : 0;
        const hasLargeGap = gapFromPrev >= GAP_FOR_INSTRUMENTAL;

        // אם אין בועה נוכחית, או שהבועה תהיה ארוכה מדי, או שיש פער גדול, או שיש דו-לשוני - התחל בועה חדשה
        if (!currentBubble || (currentBubble.text.length + text.length + 1) > MAX_CHARS || hasLargeGap || isDualLanguage) {
          if (currentBubble) {
            bubbles.push(currentBubble);
          }
          currentBubble = {
            text: text,
            startTime: sentence.startTime,
            endTime: sentence.endTime,
            isOriginalSentence: true,
            // 🎯 שמירת המשפטים המקוריים עם הזמנים שלהם
            originalParts: [{
              text: text,
              startTime: sentence.startTime,
              endTime: sentence.endTime
            }]
          };
        } else {
          // חבר לבועה הנוכחית
          currentBubble.text += " " + text;
          currentBubble.endTime = sentence.endTime;
          // 🎯 הוסף את המשפט לרשימת החלקים
          currentBubble.originalParts.push({
            text: text,
            startTime: sentence.startTime,
            endTime: sentence.endTime
          });
        }
      }

      // הוסף את הבועה האחרונה
      if (currentBubble) {
        bubbles.push(currentBubble);
      }

      // 🔥 DEBUG: Show bubbles BEFORE sort
      DEBUG && console.log("[CarouselSubtitles] 🔥🔥🔥 BUBBLES BEFORE SORT 🔥🔥🔥");
      DEBUG && console.log(JSON.stringify(bubbles.map(b => ({ text: b.text.substring(0, 40), start: b.startTime, end: b.endTime })), null, 2));

      // הוסף Intro/Outro/Instrumental
      const special = this._detectIntroOutroInstrumentalFromBubbles(bubbles, chords);
      const all = [...bubbles, ...special].sort((a, b) => a.startTime - b.startTime);

      // 🔥 DEBUG: Show bubbles AFTER sort
      DEBUG && console.log("[CarouselSubtitles] 🔥🔥🔥 ALL BUBBLES AFTER SORT 🔥🔥🔥");
      DEBUG && console.log(JSON.stringify(all.map(b => ({ text: b.text?.substring(0, 40) || b.text, start: b.startTime, end: b.endTime, isSpecial: b.isSpecial || false })), null, 2));
      DEBUG && console.log("[CarouselSubtitles] 🔥🔥🔥 END BUBBLES 🔥🔥🔥");

      // 🎤 Mark singing start subtitles
      const singingStartIndices = this._detectSingingStartSubtitles(all);

      return all.map((sub, index) => {
        if (sub.isSpecial) {
          const dur = sub.endTime - sub.startTime;
          const cd = this._calculateCountdownDuration(dur);
          return { ...sub, countdownDuration: cd, lines: [] };
        }
        return {
          ...sub,
          lines: this._segmentOriginalSentence(sub),
          isSingingStart: singingStartIndices.has(index)
        };
      });
    }

    // 🎯 חלוקת משפט אורגינלי לשורות (עם זמנים לכל מילה לפי החלק שלה)
    _segmentOriginalSentence(sentence) {
      // 🎯 פונקציית ניקוי טקסט מסוגריים וסימנים
      const cleanText = (text) => text
        .replace(/[♪♫]/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const parts = sentence.originalParts || [{ text: cleanText(sentence.text), startTime: sentence.startTime, endTime: sentence.endTime }];

      const wordObjects = [];

      // עבור על כל חלק (משפט מקורי) ויצור מילים עם הזמנים שלו
      for (const part of parts) {
        const words = part.text.split(/\s+/).filter(w => w.length > 0);
        const duration = part.endTime - part.startTime;
        const wordDuration = words.length > 0 ? duration / words.length : 0;

        for (let i = 0; i < words.length; i++) {
          wordObjects.push({
            text: words[i].toLowerCase(), // 🎯 אותיות קטנות
            startTime: part.startTime + (i * wordDuration),
            endTime: part.startTime + ((i + 1) * wordDuration),
            partStartTime: part.startTime, // 🎯 זמן התחלת החלק (המשפט המקורי)
            partEndTime: part.endTime,     // 🎯 זמן סיום החלק
            wordIndex: -1,
            isFromOriginalSentence: true,
          });
        }
      }

      // 🎯 חלוקה מאוזנת לשורות - שתי שורות באורך דומה
      if (wordObjects.length === 0) {
        return [[]];
      }

      // 🎯 Helper to detect RTL text
      const isRTL = (text) => /[\u0590-\u05FF\u0600-\u06FF]/.test(text);

      // 🎯 Check if we have dual-language (mixed LTR and RTL)
      const ltrWords = wordObjects.filter(w => !isRTL(w.text));
      const rtlWords = wordObjects.filter(w => isRTL(w.text));
      const isDualLanguage = ltrWords.length > 0 && rtlWords.length > 0;

      if (isDualLanguage) {
        // Dual-language: separate by language
        // Return RTL first (original - top line), then LTR (translation - bottom line)
        return [rtlWords, ltrWords];
      }

      // Single language: split by length as before
      // חישוב אורך כולל
      const totalLength = wordObjects.reduce((sum, w) => sum + w.text.length + 1, 0) - 1;

      // אם קצר מדי - שורה אחת
      if (totalLength < 30 || wordObjects.length <= 3) {
        return [wordObjects];
      }

      // מציאת נקודת החלוקה הקרובה ביותר לאמצע
      const targetLength = totalLength / 2;
      let currentLength = 0;
      let bestSplitIndex = 1;
      let bestDiff = Infinity;

      for (let i = 0; i < wordObjects.length - 1; i++) {
        currentLength += wordObjects[i].text.length + 1;
        const diff = Math.abs(currentLength - targetLength);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestSplitIndex = i + 1;
        }
      }

      // חלוקה לשתי שורות
      const line1 = wordObjects.slice(0, bestSplitIndex);
      const line2 = wordObjects.slice(bestSplitIndex);

      return line2.length > 0 ? [line1, line2] : [line1];
    }

    // 🎯 זיהוי Intro/Outro/Instrumental מבועות originalSentences
    _detectIntroOutroInstrumentalFromBubbles(bubbles, chords) {
      const specials = [];

      if (bubbles.length && bubbles[0].startTime > 0.5) {
        specials.push({
          text: "[Intro]",
          startTime: 0,
          endTime: bubbles[0].startTime,
          isSpecial: true,
        });
      }

      for (let i = 0; i < bubbles.length - 1; i++) {
        if (bubbles[i + 1].startTime - bubbles[i].endTime > 5) {
          specials.push({
            text: "[Instrumental]",
            startTime: bubbles[i].endTime,
            endTime: bubbles[i + 1].startTime,
            isSpecial: true,
          });
        }
      }

      const lastBubble = bubbles[bubbles.length - 1];
      if (lastBubble && chords.length) {
        const lastChord = chords[chords.length - 1];
        if (lastChord.time > lastBubble.endTime + 2) {
          specials.push({
            text: "[Outro]",
            startTime: lastBubble.endTime,
            endTime: lastChord.time + 3,
            isSpecial: true,
          });
        }
      }

      return specials;
    }

    /**
     * 🎤 Detect subtitle indices where singing starts after Intro/Instrumental
     */
    _detectSingingStartSubtitles(allSubtitles) {
      const singingStartIndices = new Set();

      for (let i = 0; i < allSubtitles.length; i++) {
        const sub = allSubtitles[i];
        // If this is Intro or Instrumental, mark the next non-special subtitle
        if (sub.isSpecial && (sub.text === "[Intro]" || sub.text === "[Instrumental]")) {
          // Find the next non-special subtitle
          for (let j = i + 1; j < allSubtitles.length; j++) {
            if (!allSubtitles[j].isSpecial) {
              singingStartIndices.add(j);
              DEBUG && console.log(`[CarouselSubtitles] 🎤 Singing start after ${sub.text}: subtitle ${j}`);
              break;
            }
          }
        }
      }

      return singingStartIndices;
    }

    _detectIntroOutroInstrumental(sentences, chords) {
      const specials = [];
      if (sentences.length && sentences[0].startTime > 0.5) {
        specials.push({
          text: "[Intro]",
          startTime: 0,
          endTime: sentences[0].startTime,
          isSpecial: true,
        });
      }
      for (let i = 0; i < sentences.length - 1; i++) {
        if (sentences[i + 1].startTime - sentences[i].endTime > 5) {
          specials.push({
            text: "[Instrumental]",
            startTime: sentences[i].endTime,
            endTime: sentences[i + 1].startTime,
            isSpecial: true,
          });
        }
      }

      const lastSent = sentences[sentences.length - 1];
      if (lastSent && chords.length) {
        const lastChord = chords[chords.length - 1];
        if (lastChord.time > lastSent.endTime + 2) {
          specials.push({
            text: "[Outro]",
            startTime: lastSent.endTime,
            endTime: lastChord.time + 3,
            isSpecial: true,
          });
        }
      }
      return specials;
    }

    // 🎯 פיצול sentences ארוכים מדי לבועות קצרות יותר
    _splitLongSentences(sentences) {
      const MAX_WORDS_PER_BUBBLE = 16; // מקסימום מילים לבועה
      const MIN_WORDS_PER_BUBBLE = 3;  // מינימום מילים לבועה - למנוע מילה בודדת
      const allWords = window.subtitleState?.words || [];
      if (allWords.length === 0) return sentences;

      const result = [];

      for (const sentence of sentences) {
        // מצא את כל המילים בטווח הזמן של המשפט
        const wordsInSentence = allWords.filter(
          w => w.startTime >= sentence.startTime - 0.1 && w.startTime < sentence.endTime
        );

        // אם מספר המילים סביר - השאר כמו שזה
        if (wordsInSentence.length <= MAX_WORDS_PER_BUBBLE) {
          result.push(sentence);
          continue;
        }

        // פצל לבועות קטנות יותר
        const chunks = [];
        for (let i = 0; i < wordsInSentence.length; i += MAX_WORDS_PER_BUBBLE) {
          const chunk = wordsInSentence.slice(i, i + MAX_WORDS_PER_BUBBLE);
          if (chunk.length === 0) continue;
          chunks.push(chunk);
        }

        // 🎯 אם הבועה האחרונה קצרה מדי - מזג אותה עם הקודמת
        if (chunks.length > 1 && chunks[chunks.length - 1].length < MIN_WORDS_PER_BUBBLE) {
          const lastChunk = chunks.pop();
          chunks[chunks.length - 1] = [...chunks[chunks.length - 1], ...lastChunk];
        }

        // יצירת הבועות
        for (const chunk of chunks) {
          result.push({
            text: chunk.map(w => w.text).join(' '),
            startTime: chunk[0].startTime,
            endTime: chunk[chunk.length - 1].endTime,
          });
        }
      }

      return result;
    }

    _segmentSentence(sentence) {
      const tolerance = 0.1;
      const allWords = window.subtitleState?.words || [];

      // Filter words for this sentence and add wordIndex
      // Using semi-open interval [start, end) to prevent duplicate words at boundaries
      const words = allWords
        .map((word, index) => ({ ...word, text: word.text.toLowerCase(), wordIndex: index })) // 🎯 אותיות קטנות
        .filter(
          (word) =>
            word.startTime >= sentence.startTime - tolerance &&
            word.startTime < sentence.endTime // Changed from <= to < and removed tolerance
        );

      if (words.length === 0) {
        // 🎯 ניקוי טקסט מסוגריים וסימנים
        const cleanedText = sentence.text
          .replace(/[♪♫]/g, '')
          .replace(/\[.*?\]/g, '')
          .replace(/\(.*?\)/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        return [
          [
            {
              text: cleanedText,
              startTime: sentence.startTime,
              endTime: sentence.endTime,
              wordIndex: -1,
            },
          ],
        ];
      }

      // 🔀 GATE: If split lines is disabled, return all words in one line
      if (!this.shouldSplitLines) {
        return [words];
      }

      // Calculate total text length
      const full = words.map((w) => w.text).join(" ");

      // If text is very short, keep it on one line
      if (full.length < MIN_SPLIT_LENGTH) {
        return [words];
      }

      // Balanced splitting: find the optimal split point closest to the middle
      const totalLength = full.length;
      const targetLength = totalLength / 2; // The ideal midpoint

      let currentLength = 0;
      let bestSplitIndex = 1; // Default to at least one word in first line
      let bestDifference = Infinity;

      // Find the split point closest to the target (middle)
      for (let i = 0; i < words.length - 1; i++) {
        // Add current word length (and space if not first word)
        currentLength += words[i].text.length;
        if (i > 0) currentLength += 1; // Add space

        // Calculate how close we are to the target
        const difference = Math.abs(currentLength - targetLength);

        // If this split is closer to the middle, remember it
        if (difference < bestDifference) {
          bestDifference = difference;
          bestSplitIndex = i + 1;
        }
      }

      // Ensure we don't create empty lines
      if (bestSplitIndex === 0) bestSplitIndex = 1;
      if (bestSplitIndex >= words.length) bestSplitIndex = words.length - 1;

      // Split into 2 balanced lines
      return [
        words.slice(0, bestSplitIndex),
        words.slice(bestSplitIndex),
      ].slice(0, MAX_LINES);
    }

    _computeSegmentLength(wordsArr) {
      return (
        wordsArr.reduce((s, w) => s + w.text.trim().length, 0) +
        (wordsArr.length > 1 ? wordsArr.length - 1 : 0)
      );
    }

    // --- Scroll & Event Listeners ---

    _setupScrollSync() {
      const carousel = document.querySelector(".yc-chord-carousel");
      if (!carousel) return;

      // 🎯 Track mouse dragging state with proper cleanup
      if (!window.ycChordCarousel) window.ycChordCarousel = {};

      const mouseDownHandler = () => {
        window.ycChordCarousel.isMouseDown = true;
      };

      const mouseUpHandler = () => {
        window.ycChordCarousel.isMouseDown = false;
      };

      carousel.addEventListener("mousedown", mouseDownHandler, { passive: true, signal: this.abortController?.signal });
      document.addEventListener("mouseup", mouseUpHandler, { passive: true, signal: this.abortController?.signal });

      carousel.addEventListener(
        "scroll",
        () => {
          if (!this.isVisible) return;

          // ✅ FIX: Only respond to scroll when user is dragging
          // If carousel is auto-scrolling (video playing), ignore this event
          if (!window.ycChordCarousel?.isMouseDown) return;

          const visualTime = this._getVisualTimeFromScroll(
            carousel.scrollLeft,
            carousel.scrollWidth,
            carousel.clientWidth
          );

          if (visualTime !== null) {
            requestAnimationFrame(() => this._renderSubtitles(visualTime));
          }
        },
        { passive: true, signal: this.abortController?.signal }
      );
    }

    _setupEventListeners() {
      if (!this.videoElement) return;

      // Prevent duplicate listeners - abort existing ones first
      if (this.abortController) {
        this.abortController.abort();
      }

      this.abortController = new AbortController();
      const signal = this.abortController.signal;

      const loop = () => {
        if (window.ycChordCarousel?.isMouseDown) return;
        if (!this.isVisible) return;

        requestAnimationFrame(() => {
          if (this.videoElement) {
            this._renderSubtitles(this.videoElement.currentTime);
          }
        });
      };

      this.videoElement.addEventListener("timeupdate", loop, { signal });
      this.videoElement.addEventListener("seeking", loop, { signal });
      this.videoElement.addEventListener("seeked", loop, { signal });

      // Click-to-seek: Event delegation on subtitles area
      if (this.subtitlesAreaElement) {
        this.subtitlesAreaElement.addEventListener("click", (e) => {
          const target = e.target;

          // Always resolve click to the parent bubble and seek to bubble start.
          // This keeps behavior consistent for both bubble clicks and word clicks.
          const ellipse = target.closest(".yc-subtitle-ellipse");
          if (ellipse && ellipse.dataset.startTime) {
            const startTime = parseFloat(ellipse.dataset.startTime);
            this.videoElement.currentTime = startTime;
            DEBUG && console.log(`[CarouselSubtitles] 🎯 Seek to bubble start: ${startTime}s`);
          }
        }, { signal });
      }

      window.addEventListener(
        "yc:timeUpdate",
        (e) => {
          if (!this.isVisible) return;
          const { time, isScrubbing } = e.detail || {};
          // Ignore regular global ticks (e.g. panel/preview updates).
          // Video element events are the primary source for playback sync.
          if (!isScrubbing) return;
          this._renderSubtitles(time);
        },
        { signal }
      );

      window.addEventListener(
        "yc:subtitleTimingOffsetChanged",
        (e) => {
          if (!this.isVisible || !this.videoElement) return;
          const currentVideoId = new URLSearchParams(location.search).get("v");
          const eventVideoId = e?.detail?.videoId;
          if (eventVideoId && currentVideoId && eventVideoId !== currentVideoId) return;
          this._renderSubtitles(this.videoElement.currentTime);
        },
        { signal }
      );

      // 🌐 האזנה לשינוי שפה - רענון כתוביות הקרוסלה
      window.addEventListener(
        "yc:languageChanged",
        async (e) => {
          console.log("[CarouselSubtitles] 🌐 Language changed - refreshing subtitles");

          // טעינת הכתוביות החדשות מה-database
          const videoId = e.detail?.videoId;
          if (videoId && window.databaseManager?.loadFromDatabase) {
            let aiMode = "off";
            try {
              const aiModeResult = await chrome.storage.local.get(["aiTranscriptionMode"]);
              const rawAiMode = typeof aiModeResult.aiTranscriptionMode === "string"
                ? aiModeResult.aiTranscriptionMode.toLowerCase()
                : "off";
              aiMode = ["off", "auto", "always"].includes(rawAiMode) ? rawAiMode : "off";
              this._currentAiMode = aiMode;
            } catch (err) {
              this._currentAiMode = "off";
              console.warn("[CarouselSubtitles] Failed to read aiTranscriptionMode in languageChanged, defaulting to OFF:", err);
            }

            let subtitlesData = await window.databaseManager.loadFromDatabase("subtitles", videoId);
            if (subtitlesData && window.databaseManager?.normalizeSubtitlesForActiveMode) {
              subtitlesData = await window.databaseManager.normalizeSubtitlesForActiveMode(subtitlesData, aiMode);
            }

            await this._syncTimingOffset(videoId, {
              aiMode,
              useTranslation: window.subtitleState?.useTranslation === true,
              subtitlesData,
            });

            if (subtitlesData && window.subtitleState) {
              window.subtitleState.isCustomPrompt = false;

              // עדכון sentences
              if (subtitlesData.sentenceSRT?.trim()) {
                // פרסור פשוט של SRT לקבלת sentences
                const sentences = this._parseSentenceSRT(subtitlesData.sentenceSRT);
                window.subtitleState.sentences = sentences;
                console.log("[CarouselSubtitles] 🌐 Updated sentences:", sentences.length);
              }

              // עדכון words
              if (subtitlesData.wordSRT?.trim()) {
                const words = this._parseWordSRT(subtitlesData.wordSRT);
                window.subtitleState.words = words;
                console.log("[CarouselSubtitles] 🌐 Updated words:", words.length);
              } else {
                // אם אין words - נקה אותם
                window.subtitleState.words = [];
              }

              // 🎯 עדכון originalSentences להדגשת מילים
              if (subtitlesData.originalSentences?.length > 0) {
                const parsedSentences = this._parseSentencesForCarousel(subtitlesData.originalSentences);
                window.ycCarouselParsedSentences = parsedSentences.length > 0 ? parsedSentences : null;
                console.log("[CarouselSubtitles] 🌐 Updated originalSentences:", parsedSentences.length);
              } else {
                window.ycCarouselParsedSentences = null;
              }
            }
          }

          // 🎯 ניקוי הבועות הקיימות
          if (this.ellipsePool) {
            for (let i = 0; i < this.ellipsePool.length; i++) {
              this.ellipsePool[i].style.display = "none";
            }
          }

          const parentCarousel = window.ycChordCarousel;
          if (
            parentCarousel?.isVisible &&
            typeof parentCarousel._refreshSingingStartForCurrentMode === "function"
          ) {
            parentCarousel._refreshSingingStartForCurrentMode();
          } else if (this.videoElement) {
            this.processedSubtitles = this._preprocessSubtitles();
            this.currentSubtitleIndex = -1; // איפוס כדי לרנדר מחדש
            console.log("[CarouselSubtitles] 🌐 Preprocessed subtitles:", this.processedSubtitles?.length || 0);
            this._renderSubtitles(this.videoElement.currentTime);
          }
        },
        { signal }
      );
    }

    // 🌐 פרסור פשוט של sentenceSRT
    _parseSentenceSRT(srtText) {
      if (!srtText) return [];
      const sentences = [];
      const blocks = srtText.trim().split(/\n\s*\n/);

      for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length < 3) continue;

        const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
        if (!timeMatch) continue;

        const startTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
        const endTime = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
        const text = lines.slice(2).join(' ').trim();

        sentences.push({ text, startTime, endTime });
      }

      return sentences;
    }

    // 🌐 פרסור פשוט של wordSRT
    _parseWordSRT(srtText) {
      if (!srtText) return [];
      const words = [];
      const blocks = srtText.trim().split(/\n\s*\n/);

      for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length < 3) continue;

        const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
        if (!timeMatch) continue;

        const startTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
        const endTime = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
        const text = lines.slice(2).join(' ').trim();

        words.push({ text, startTime, endTime });
      }

      return words;
    }

    _parseSentencesForCarousel(sentences) {
      if (!Array.isArray(sentences)) return [];

      return sentences
        .map((sentence) => {
          const text = typeof sentence?.text === "string" ? sentence.text.trim() : "";
          const startTime = Number(sentence?.startTime);
          const endTime = Number(sentence?.endTime);

          if (!text || !Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
            return null;
          }

          const cleanText = text
            .replace(/[^\w\s\u0590-\u05FF\u0600-\u06FF]/g, "")
            .toLowerCase()
            .trim();
          const wordsArray = cleanText.split(/\s+/).filter((w) => w.length > 0);

          if (wordsArray.length === 0) {
            return null;
          }

          return {
            text,
            cleanText,
            words: wordsArray,
            startTime,
            endTime,
          };
        })
        .filter(Boolean);
    }

    // 🎯 טעינת originalSentences להדגשה ברמת משפט (כשאין word-level)
    async _loadOriginalSentencesForHighlight() {
      // Clear stale mapping from previous mode/session before loading fresh source.
      window.ycCarouselParsedSentences = null;

      // אם יש word-level - לא צריך
      if (window.subtitleState?.words?.length > 0) {
        DEBUG && console.log("[CarouselSubtitles] 🎯 Word-level exists, skipping originalSentences");
        return;
      }

      try {
        const videoId = new URLSearchParams(location.search).get('v');
        if (!videoId || !window.databaseManager?.loadFromDatabase) {
          DEBUG && console.log("[CarouselSubtitles] 🎯 No videoId or databaseManager");
          return;
        }

        let aiMode = "off";
        try {
          const aiModeResult = await chrome.storage.local.get(['aiTranscriptionMode']);
          const rawAiMode = typeof aiModeResult.aiTranscriptionMode === "string"
            ? aiModeResult.aiTranscriptionMode.toLowerCase()
            : "off";
          aiMode = ["off", "auto", "always"].includes(rawAiMode) ? rawAiMode : "off";
          this._currentAiMode = aiMode;
        } catch (e) {
          this._currentAiMode = "off";
          console.warn("[CarouselSubtitles] Failed to read aiTranscriptionMode, defaulting to OFF:", e);
        }

        let subtitlesData = await window.databaseManager.loadFromDatabase("subtitles", videoId);
        if (subtitlesData && window.databaseManager?.normalizeSubtitlesForActiveMode) {
          subtitlesData = await window.databaseManager.normalizeSubtitlesForActiveMode(subtitlesData, aiMode);
        }

        // 🎯 אם אין כתוביות ב-IndexedDB - נסה להוריד מיוטיוב
        if (!subtitlesData || (!subtitlesData.originalSentences && !subtitlesData.sentenceSRT && !subtitlesData.translationOriginalSentences)) {
          DEBUG && console.log("[CarouselSubtitles] 🎯 No subtitles in IndexedDB, attempting to download...");

          // בדיקה אם יש דגל שלילי (כבר בדקנו ואין כתוביות)
          if (subtitlesData?.hasSubtitles === false) {
            DEBUG && console.log("[CarouselSubtitles] ⚡ Known video without subtitles - skipping download");
            return;
          }

          // ניסיון הורדה מיוטיוב
          if (window.extractorModule?.extractSubtitlesFromTarGz) {
            try {
              DEBUG && console.log("[CarouselSubtitles] 📥 Downloading subtitles from YouTube...");
              const extractResult = await window.extractorModule.extractSubtitlesFromTarGz(videoId);

              if (extractResult) {
                // טעינה מחדש אחרי הורדה
                let loadedSubtitles = await window.databaseManager.loadFromDatabase("subtitles", videoId);
                if (loadedSubtitles && window.databaseManager?.normalizeSubtitlesForActiveMode) {
                  loadedSubtitles = await window.databaseManager.normalizeSubtitlesForActiveMode(loadedSubtitles, aiMode);
                }
                if (loadedSubtitles?.originalSentences?.length > 0) {
                  DEBUG && console.log("[CarouselSubtitles] ✅ Subtitles downloaded successfully");
                  // המשך עם הכתוביות החדשות
                  subtitlesData = loadedSubtitles;
                } else {
                  DEBUG && console.log("[CarouselSubtitles] ⚠️ Download succeeded but no originalSentences");
                  return;
                }
              } else {
                DEBUG && console.log("[CarouselSubtitles] ❌ Failed to download subtitles");
                return;
              }
            } catch (error) {
              console.error("[CarouselSubtitles] Error downloading subtitles:", error);
              return;
            }
          } else {
            DEBUG && console.log("[CarouselSubtitles] ⚠️ extractorModule not available");
            return;
          }
        }

        if (
          subtitlesData?.originalSentences?.length > 0 ||
          subtitlesData?.translationOriginalSentences?.length > 0 ||
          subtitlesData?.sentenceSRT?.trim()
        ) {
          // 🆕 Check if user selected translation or default mode
          let useTranslation = false;
          let useDefault = true;
          try {
            const selectionResult = await chrome.storage.local.get(['showTranslation', 'showDefault']);
            const requestedTranslation = selectionResult.showTranslation || false;
            const requestedDefault = selectionResult.showDefault !== undefined ? selectionResult.showDefault : true; // Default to true if not set
            useTranslation = aiMode === 'off' ? false : requestedTranslation;
            useDefault = aiMode === 'off' ? true : requestedDefault;

            if (requestedTranslation && aiMode === 'off') {
              DEBUG && console.log("[CarouselSubtitles] AI mode OFF - ignoring translation selection, using DEFAULT");
            }
          } catch (e) {
            console.warn("[CarouselSubtitles] Failed to check translation mode:", e);
          }

          if (window.subtitleState) {
            window.subtitleState.useTranslation = useTranslation;
          }

          // 🎯 If neither DEFAULT nor TRANSLATION is selected (CUSTOM only) → don't show subtitles
          if (!useDefault && !useTranslation) {
            DEBUG && console.log("[CarouselSubtitles] ℹ️ CUSTOM only selected - not showing subtitles");
            return;
          }

          // 🎯 Check if we have the required data
          const hasTranslation = subtitlesData.translationOriginalSentences?.length > 0;
          const defaultSentencesFromSRT = subtitlesData.sentenceSRT?.trim()
            ? this._parseSentenceSRT(subtitlesData.sentenceSRT)
            : [];
          const hasDefault =
            subtitlesData.originalSentences?.length > 0 ||
            defaultSentencesFromSRT.length > 0;

          // If user wants TRANSLATION but we don't have it → return empty
          if (useTranslation && !hasTranslation) {
            if (aiMode === "off" && hasDefault) {
              DEBUG && console.log("[CarouselSubtitles] AI mode OFF - translation unavailable, falling back to DEFAULT");
              useTranslation = false;
              useDefault = true;
            } else {
              DEBUG && console.log("[CarouselSubtitles] ⚠️ Translation selected but not available - returning empty");
              return;
            }
          }

          // If user wants DEFAULT but we don't have it → return empty
          if (!useTranslation && !hasDefault) {
            DEBUG && console.log("[CarouselSubtitles] ⚠️ Default selected but not available - returning empty");
            return;
          }

          await this._syncTimingOffset(videoId, {
            aiMode,
            useTranslation,
            subtitlesData,
          });

          // 🆕 Choose which sentences to use based on user selection + safe fallbacks
          let sentencesToUse;
          if (useTranslation && hasTranslation) {
            sentencesToUse = subtitlesData.translationOriginalSentences;
          } else if (subtitlesData.originalSentences?.length > 0) {
            sentencesToUse = subtitlesData.originalSentences;
          } else if (defaultSentencesFromSRT.length > 0) {
            sentencesToUse = defaultSentencesFromSRT;
          } else {
            sentencesToUse = [];
          }

          if (!sentencesToUse?.length) {
            DEBUG && console.log("[CarouselSubtitles] ⚠️ No sentences available after fallback - returning empty");
            return;
          }

          DEBUG && console.log("[CarouselSubtitles] 🎯 Using sentences:", {
            useTranslation,
            hasTranslation: !!subtitlesData.translationOriginalSentences,
            hasDefault,
            selectedType: useTranslation ? 'translation' : 'default',
            count: sentencesToUse?.length || 0
          });

          // 🔥 DEBUG: Show what we loaded from IndexedDB
          DEBUG && console.log("[CarouselSubtitles] 🔥🔥🔥 LOADED FROM INDEXEDDB 🔥🔥🔥");
          DEBUG && console.log(JSON.stringify(sentencesToUse, null, 2));
          DEBUG && console.log("[CarouselSubtitles] 🔥🔥🔥 END INDEXEDDB DATA 🔥🔥🔥");

          // הכנת המשפטים להדגשה - ניקוי וחילוץ מילים
          const parsedSentences = this._parseSentencesForCarousel(sentencesToUse);
          window.ycCarouselParsedSentences = parsedSentences.length > 0 ? parsedSentences : null;

          DEBUG && console.log("[CarouselSubtitles] 🔥🔥🔥 PARSED SENTENCES FOR CAROUSEL 🔥🔥🔥");
          DEBUG && console.log(JSON.stringify(window.ycCarouselParsedSentences, null, 2));
          DEBUG && console.log("[CarouselSubtitles] 🔥🔥🔥 END PARSED SENTENCES 🔥🔥🔥");
        } else {
          DEBUG && console.log("[CarouselSubtitles] 🎯 No originalSentences found");
        }
      } catch (error) {
        console.error("[CarouselSubtitles] Error loading originalSentences:", error);
      }
    }

    // 🎯 מציאת המשפט האורגינלי הפעיל לפי זמן
    _findActiveSentence(time) {
      if (!window.ycCarouselParsedSentences?.length) return null;

      for (const sentence of window.ycCarouselParsedSentences) {
        if (time >= sentence.startTime && time <= sentence.endTime) {
          DEBUG && console.log(`[CarouselSubtitles] 🎯 Found active sentence: "${sentence.text.substring(0, 30)}..." at ${time.toFixed(2)}s`);
          return sentence;
        }
      }
      return null;
    }

    // 🎯 מציאת מילים בבועה שמתאימות למשפט האורגינלי
    // מחזיר Set של אינדקסים של מילים בבועה שצריך להדגיש
    _findMatchingWordsInBubble(subtitle, activeSentence) {
      const matchedIndices = new Set();

      if (!subtitle.lines || !activeSentence?.words?.length) return matchedIndices;

      // איסוף כל המילים מהבועה לרשימה אחת
      const bubbleWords = [];
      for (const line of subtitle.lines) {
        for (const word of line) {
          const cleanWord = word.text
            .replace(/[^\w\s\u0590-\u05FF\u0600-\u06FF]/g, "")
            .toLowerCase()
            .trim();
          bubbleWords.push({ cleanWord, startTime: word.startTime });
        }
      }

      if (bubbleWords.length === 0) return matchedIndices;

      const sentenceWords = activeSentence.words;
      const tolerance = 3; // סבילות של 3 שניות

      // חיפוש רצף מילים תואם
      for (let startIdx = 0; startIdx < bubbleWords.length; startIdx++) {
        const firstWord = bubbleWords[startIdx];

        // בדיקת זמן - האם המילה הראשונה קרובה לזמן התחלת המשפט?
        if (Math.abs(firstWord.startTime - activeSentence.startTime) > tolerance) continue;

        // בדיקת תוכן - האם יש רצף מילים תואם?
        let matchCount = 0;

        for (let i = 0; i < sentenceWords.length && (startIdx + i) < bubbleWords.length; i++) {
          if (bubbleWords[startIdx + i].cleanWord === sentenceWords[i]) {
            matchCount++;
          } else {
            break; // הרצף נשבר
          }
        }

        // אם מצאנו התאמה של לפחות 50% מהמילים - הדגש את כולן
        if (matchCount >= Math.ceil(sentenceWords.length * 0.5)) {
          for (let i = 0; i < matchCount; i++) {
            matchedIndices.add(startIdx + i);
          }
          DEBUG && console.log(`[CarouselSubtitles] 🎯 Found ${matchCount} matching words in bubble`);
          break; // מצאנו התאמה, לא צריך להמשיך לחפש
        }
      }

      if (matchedIndices.size === 0) {
        DEBUG && console.log(`[CarouselSubtitles] ⚠️ No matching words found. Bubble: "${subtitle.text?.substring(0, 30)}...", Sentence: "${activeSentence.text?.substring(0, 30)}..."`);
      }

      return matchedIndices;
    }

    // Update font family
    updateFontFamily() {
      this._injectCSS();
      if (this.isVisible && this.videoElement) {
        this._renderSubtitles(this.videoElement.currentTime);
      }
      DEBUG && console.log(`[CarouselSubtitles] 🔤 Font family updated to ${window.ycCarouselSubtitlesFont || 'Roboto'}`);
    }
  }

  window.CarouselSubtitles = CarouselSubtitles;
  window.ycStartCarouselWordTranslation = () =>
    CarouselSubtitles.activeInstance?._translateBubbleWords();
  window.ycRefreshCarouselWordTranslationVisibility = () => {
    const instance = CarouselSubtitles.activeInstance;
    if (instance?.isVisible && instance.videoElement) {
      instance._renderSubtitles(instance.videoElement.currentTime);
    }
  };
  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const translationChanged = changes.wordTranslationEnabled || changes.wordTranslationLanguages || changes.geminiGlobalModel;
    if (!translationChanged) return;
    window.ycWordTranslationEnabled = changes.wordTranslationEnabled
      ? changes.wordTranslationEnabled.newValue === true
      : window.ycWordTranslationEnabled;
    if (window.ycWordTranslationEnabled) window.ycStartCarouselWordTranslation?.();
    else window.ycRefreshCarouselWordTranslationVisibility?.();
  });

  // 🎯 Global event listeners with cleanup support
  // Store handlers so they can be removed later
  const fontChangedHandler = () => {
    if (CarouselSubtitles.activeInstance) {
      CarouselSubtitles.activeInstance.updateFontFamily();
    }
  };

  const boldModeChangedHandler = () => {
    if (CarouselSubtitles.activeInstance) {
      CarouselSubtitles.activeInstance.updateFontFamily();
    }
  };

  const fontResetHandler = () => {
    if (CarouselSubtitles.activeInstance) {
      CarouselSubtitles.activeInstance.updateFontFamily();
    }
  };

  // 🎯 Cleanup function for global listeners
  CarouselSubtitles.cleanupGlobalListeners = () => {
    window.removeEventListener("yc:carouselSubtitlesFontChanged", fontChangedHandler);
    window.removeEventListener("yc:carouselSubtitlesBoldModeChanged", boldModeChangedHandler);
    window.removeEventListener("yc:carouselSubtitlesFontReset", fontResetHandler);
    window.__ycCarouselSubtitlesGlobalListenersBound = false;
  };

  if (!window.__ycCarouselSubtitlesGlobalListenersBound) {
    window.__ycCarouselSubtitlesGlobalListenersBound = true;
    window.addEventListener("yc:carouselSubtitlesFontChanged", fontChangedHandler);
    window.addEventListener("yc:carouselSubtitlesBoldModeChanged", boldModeChangedHandler);
    window.addEventListener("yc:carouselSubtitlesFontReset", fontResetHandler);
    window.addEventListener("beforeunload", CarouselSubtitles.cleanupGlobalListeners, { once: true });
  }
})();
