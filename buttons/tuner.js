/*==============================================================
  YouChords – buttons/tuner.js
  --------------------------------------------------------------
  • כפתור טיונר - Guitar Tuner
  • מאפשר כיוון גיטרה עם מיקרופון או השמעת צלילים
  • Lazy Loading - נטען רק בלחיצה על הכפתור
  • ניקוי זיכרון בסגירה - מניעת דליפות RAM/CPU
==============================================================*/

// מניעת הזרקות כפולות
if (window.ycTunerInit) {
  console.log("[Tuner] סקריפט כבר נטען - מדלג");
} else {
  window.ycTunerInit = true;
  console.log("[Tuner] ✅ מודול נטען");

  // 🎯 מצב גלובלי
  let tunerOverlay = null;
  let currentTuning = null;
  let currentHz = 440;
  let isListening = false;
  let selectedString = null;
  let soundEnabled = true;

  // Audio context for tuner
  let audioContext = null;
  let analyser = null;
  let mediaStream = null;
  let rafId = null;
  let listeningStartInProgress = false;
  let listeningLifecycleToken = 0;
  const MIC_PERMISSION_REMINDER_DISMISSED_KEY = "yc_tuner_mic_permission_reminder_dismissed";
  let micPermissionReminderDismissed = false;

  // Tone playback
  let toneContext = null;
  let pluckIntervals = [];
  let pluckCount = 0;

  // Pitch Shifter
  let pitchShifter = null;

  // Smoothing
  const freqHistory = [];
  const SMOOTHING_SIZE = 5;
  
  // Cached DOM elements for performance (avoid repeated querySelector)
  let cachedElements = null;
  
  // Document event handlers (stored for cleanup)
  let documentHandlers = {
    mouseup: null,
    mousemove: null,
    thumbMouseup: null,
    thumbMousemove: null
  };

  // Hold-to-repeat timers for pitch +/- controls (must be cleaned on close)
  let pitchHoldInterval = null;
  let pitchHoldTimeout = null;

  function loadMicPermissionReminderPreference() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.get([MIC_PERMISSION_REMINDER_DISMISSED_KEY], (result = {}) => {
          if (chrome.runtime?.lastError) return;
          micPermissionReminderDismissed = result[MIC_PERMISSION_REMINDER_DISMISSED_KEY] === true;
          if (micPermissionReminderDismissed) hideMicPermissionNotice();
        });
        return;
      }
    } catch (err) {
      console.warn("[Tuner] Failed to load microphone reminder preference:", err);
    }

    try {
      micPermissionReminderDismissed =
        localStorage.getItem(MIC_PERMISSION_REMINDER_DISMISSED_KEY) === "true";
    } catch (err) {
      console.warn("[Tuner] Failed to load local microphone reminder preference:", err);
    }
  }

  function saveMicPermissionReminderPreference(dismissed) {
    micPermissionReminderDismissed = dismissed === true;

    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({
          [MIC_PERMISSION_REMINDER_DISMISSED_KEY]: micPermissionReminderDismissed,
        });
      }
    } catch (err) {
      console.warn("[Tuner] Failed to save microphone reminder preference:", err);
    }

    try {
      localStorage.setItem(
        MIC_PERMISSION_REMINDER_DISMISSED_KEY,
        micPermissionReminderDismissed ? "true" : "false"
      );
    } catch (err) {
      console.warn("[Tuner] Failed to save local microphone reminder preference:", err);
    }

    if (micPermissionReminderDismissed) {
      hideMicPermissionNotice();
    }
  }

  function getMicPermissionElements() {
    if (!tunerOverlay) return {};
    return {
      notice: tunerOverlay.querySelector("#tunerMicPermissionNotice"),
      message: tunerOverlay.querySelector("#tunerMicPermissionMessage"),
      manual: tunerOverlay.querySelector("#tunerMicPermissionManual"),
      manualBtn: tunerOverlay.querySelector(".tuner-mic-manual-btn"),
    };
  }

  function getMicPermissionMessage(error) {
    const name = error?.name || "";
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No microphone was found. Connect a microphone, then try again.";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return "Your microphone is already in use by another app. Close that app, then try again.";
    }
    if (name === "SecurityError") {
      return "Microphone access is blocked by browser security settings. Check the site permissions.";
    }
    return "Microphone access was not allowed. You can try again or enable it from the site permissions.";
  }

  function showMicPermissionNotice(error) {
    if (micPermissionReminderDismissed) return;
    const { notice, message } = getMicPermissionElements();
    if (!notice) return;

    if (message) {
      message.textContent = getMicPermissionMessage(error);
    }
    notice.hidden = false;
    notice.classList.add("visible");

    const statusDisplay = tunerOverlay?.querySelector("#statusDisplay");
    if (statusDisplay) {
      statusDisplay.textContent = "Microphone needed";
      statusDisplay.setAttribute("fill", "#ffb74d");
    }
  }

  function hideMicPermissionNotice() {
    const { notice, manual, manualBtn } = getMicPermissionElements();
    if (notice) {
      notice.hidden = true;
      notice.classList.remove("visible");
    }
    if (manual) manual.hidden = true;
    if (manualBtn) manualBtn.textContent = "How to enable manually";
    const statusDisplay = tunerOverlay?.querySelector("#statusDisplay");
    if (statusDisplay && !isListening) {
      statusDisplay.textContent = "Ready";
      statusDisplay.setAttribute("fill", "#4CAF50");
    }
  }

  loadMicPermissionReminderPreference();

  function clearPitchHoldTimers() {
    if (pitchHoldTimeout) {
      clearTimeout(pitchHoldTimeout);
      pitchHoldTimeout = null;
    }
    if (pitchHoldInterval) {
      clearInterval(pitchHoldInterval);
      pitchHoldInterval = null;
    }
  }

  // 🔄 Re-attach document event handlers after closeTuner removed them
  function reattachDocumentHandlers() {
    if (documentHandlers.mouseup) {
      document.addEventListener("mouseup", documentHandlers.mouseup);
    }
    if (documentHandlers.mousemove) {
      document.addEventListener("mousemove", documentHandlers.mousemove);
    }
    if (documentHandlers.thumbMouseup) {
      document.addEventListener("mouseup", documentHandlers.thumbMouseup);
    }
    if (documentHandlers.thumbMousemove) {
      document.addEventListener("mousemove", documentHandlers.thumbMousemove);
    }
  }

  // Tunings data - comprehensive list
  const tunings = [
    // Standard & Common
    {
      name: "Standard",
      notes: ["E2", "A2", "D3", "G3", "B3", "E4"],
      frequencies: [82.41, 110.0, 146.83, 196.0, 246.94, 329.63],
    },
    {
      name: "Half Step Down",
      notes: ["Eb2", "Ab2", "Db3", "Gb3", "Bb3", "Eb4"],
      frequencies: [77.78, 103.83, 138.59, 185.0, 233.08, 311.13],
    },
    {
      name: "Full Step Down",
      notes: ["D2", "G2", "C3", "F3", "A3", "D4"],
      frequencies: [73.42, 98.0, 130.81, 174.61, 220.0, 293.66],
    },

    // Drop Tunings
    {
      name: "Drop D",
      notes: ["D2", "A2", "D3", "G3", "B3", "E4"],
      frequencies: [73.42, 110.0, 146.83, 196.0, 246.94, 329.63],
    },
    {
      name: "Double Drop D",
      notes: ["D2", "A2", "D3", "G3", "B3", "D4"],
      frequencies: [73.42, 110.0, 146.83, 196.0, 246.94, 293.66],
    },
    {
      name: "Drop C",
      notes: ["C2", "G2", "C3", "F3", "A3", "D4"],
      frequencies: [65.41, 98.0, 130.81, 174.61, 220.0, 293.66],
    },
    {
      name: "Drop C#",
      notes: ["C#2", "G#2", "C#3", "F#3", "A#3", "D#4"],
      frequencies: [69.3, 103.83, 138.59, 185.0, 233.08, 311.13],
    },
    {
      name: "Drop B",
      notes: ["B1", "F#2", "B2", "E3", "G#3", "C#4"],
      frequencies: [61.74, 92.5, 123.47, 164.81, 207.65, 277.18],
    },
    {
      name: "Drop A",
      notes: ["A1", "E2", "A2", "D3", "F#3", "B3"],
      frequencies: [55.0, 82.41, 110.0, 146.83, 185.0, 246.94],
    },

    // Open Tunings
    {
      name: "Open A",
      notes: ["E2", "A2", "E3", "A3", "C#4", "E4"],
      frequencies: [82.41, 110.0, 164.81, 220.0, 277.18, 329.63],
    },
    {
      name: "Open C",
      notes: ["C2", "G2", "C3", "G3", "C4", "E4"],
      frequencies: [65.41, 98.0, 130.81, 196.0, 261.63, 329.63],
    },
    {
      name: "Open D",
      notes: ["D2", "A2", "D3", "F#3", "A3", "D4"],
      frequencies: [73.42, 110.0, 146.83, 185.0, 220.0, 293.66],
    },
    {
      name: "Open E",
      notes: ["E2", "B2", "E3", "G#3", "B3", "E4"],
      frequencies: [82.41, 123.47, 164.81, 207.65, 246.94, 329.63],
    },
    {
      name: "Open G",
      notes: ["D2", "G2", "D3", "G3", "B3", "D4"],
      frequencies: [73.42, 98.0, 146.83, 196.0, 246.94, 293.66],
    },
    {
      name: "Open G Minor",
      notes: ["D2", "G2", "D3", "G3", "Bb3", "D4"],
      frequencies: [73.42, 98.0, 146.83, 196.0, 233.08, 293.66],
    },

    // Modal Tunings
    {
      name: "DADGAD",
      notes: ["D2", "A2", "D3", "G3", "A3", "D4"],
      frequencies: [73.42, 110.0, 146.83, 196.0, 220.0, 293.66],
    },
    {
      name: "D Modal",
      notes: ["D2", "A2", "D3", "D3", "A3", "D4"],
      frequencies: [73.42, 110.0, 146.83, 146.83, 220.0, 293.66],
    },
    {
      name: "Modal G",
      notes: ["D2", "G2", "D3", "G3", "C4", "D4"],
      frequencies: [73.42, 98.0, 146.83, 196.0, 261.63, 293.66],
    },
    {
      name: "D Minor",
      notes: ["D2", "A2", "D3", "F3", "A3", "D4"],
      frequencies: [73.42, 110.0, 146.83, 174.61, 220.0, 293.66],
    },
    {
      name: "G Minor",
      notes: ["D2", "G2", "D3", "G3", "Bb3", "D4"],
      frequencies: [73.42, 98.0, 146.83, 196.0, 233.08, 293.66],
    },

    // Interval Tunings
    {
      name: "All Fourths",
      notes: ["E2", "A2", "D3", "G3", "C4", "F4"],
      frequencies: [82.41, 110.0, 146.83, 196.0, 261.63, 349.23],
    },
    {
      name: "Major Third",
      notes: ["C2", "E2", "G#2", "C3", "E3", "G#3"],
      frequencies: [65.41, 82.41, 103.83, 130.81, 164.81, 207.65],
    },
    {
      name: "Minor Third",
      notes: ["C2", "Eb2", "Gb2", "A2", "C3", "Eb3"],
      frequencies: [65.41, 77.78, 92.5, 110.0, 130.81, 155.56],
    },
    {
      name: "Minor Sixth",
      notes: ["C2", "Ab2", "C3", "Ab3", "C4", "Ab4"],
      frequencies: [65.41, 103.83, 130.81, 207.65, 261.63, 415.3],
    },
    {
      name: "Aug Fourths",
      notes: ["C2", "F#2", "C3", "F#3", "C4", "F#4"],
      frequencies: [65.41, 92.5, 130.81, 185.0, 261.63, 369.99],
    },

    // Special/Named Tunings
    {
      name: "Baritone",
      notes: ["B1", "E2", "A2", "D3", "F#3", "B3"],
      frequencies: [61.74, 82.41, 110.0, 146.83, 185.0, 246.94],
    },
    {
      name: "C6",
      notes: ["C2", "A2", "C3", "G3", "C4", "E4"],
      frequencies: [65.41, 110.0, 130.81, 196.0, 261.63, 329.63],
    },
    {
      name: "G6",
      notes: ["D2", "G2", "D3", "G3", "B3", "E4"],
      frequencies: [73.42, 98.0, 146.83, 196.0, 246.94, 329.63],
    },
    {
      name: "Dobro",
      notes: ["G2", "B2", "D3", "G3", "B3", "D4"],
      frequencies: [98.0, 123.47, 146.83, 196.0, 246.94, 293.66],
    },
    {
      name: "Hendrix",
      notes: ["Eb2", "Ab2", "Db3", "Gb3", "Bb3", "Eb4"],
      frequencies: [77.78, 103.83, 138.59, 185.0, 233.08, 311.13],
    },
    {
      name: "Cooder",
      notes: ["D2", "G2", "D3", "G3", "B3", "E4"],
      frequencies: [73.42, 98.0, 146.83, 196.0, 246.94, 329.63],
    },
    {
      name: "Mayfield",
      notes: ["F#2", "A2", "C#3", "F#3", "A3", "E4"],
      frequencies: [92.5, 110.0, 138.59, 185.0, 220.0, 329.63],
    },

    // Exotic/Alternative
    {
      name: "Balalaika",
      notes: ["E2", "E2", "A2", "E3", "E3", "A3"],
      frequencies: [82.41, 82.41, 110.0, 164.81, 164.81, 220.0],
    },
    {
      name: "Cittern",
      notes: ["C2", "F2", "C3", "G3", "C4", "D4"],
      frequencies: [65.41, 87.31, 130.81, 196.0, 261.63, 293.66],
    },
    {
      name: "Lute",
      notes: ["E2", "A2", "D3", "F#3", "B3", "E4"],
      frequencies: [82.41, 110.0, 146.83, 185.0, 246.94, 329.63],
    },
    {
      name: "Mandoguitar",
      notes: ["C2", "G2", "D3", "A3", "E4", "B4"],
      frequencies: [65.41, 98.0, 146.83, 220.0, 329.63, 493.88],
    },
    {
      name: "Pentatonic",
      notes: ["A2", "C3", "D3", "E3", "G3", "A3"],
      frequencies: [110.0, 130.81, 146.83, 164.81, 196.0, 220.0],
    },
    {
      name: "Overtone",
      notes: ["C2", "E2", "G2", "Bb2", "C3", "D3"],
      frequencies: [65.41, 82.41, 98.0, 116.54, 130.81, 146.83],
    },

    // Artist/Style Specific
    {
      name: "Admiral",
      notes: ["C2", "G2", "D3", "G3", "B3", "C4"],
      frequencies: [65.41, 98.0, 146.83, 196.0, 246.94, 261.63],
    },
    {
      name: "Buzzard",
      notes: ["C2", "F2", "C3", "G3", "Bb3", "F4"],
      frequencies: [65.41, 87.31, 130.81, 196.0, 233.08, 349.23],
    },
    {
      name: "Face",
      notes: ["C2", "G2", "D3", "G3", "A3", "D4"],
      frequencies: [65.41, 98.0, 146.83, 196.0, 220.0, 293.66],
    },
    {
      name: "Hot Type",
      notes: ["A2", "B2", "E3", "F#3", "A3", "D4"],
      frequencies: [110.0, 123.47, 164.81, 185.0, 220.0, 293.66],
    },
    {
      name: "Kottke",
      notes: ["C2", "G2", "D3", "G3", "A3", "D4"],
      frequencies: [65.41, 98.0, 146.83, 196.0, 220.0, 293.66],
    },
    {
      name: "Layover",
      notes: ["D2", "A2", "C3", "G3", "C4", "E4"],
      frequencies: [73.42, 110.0, 130.81, 196.0, 261.63, 329.63],
    },
    {
      name: "Magic Farmer",
      notes: ["C2", "F2", "C3", "G3", "A3", "E4"],
      frequencies: [65.41, 87.31, 130.81, 196.0, 220.0, 329.63],
    },
    {
      name: "Pelican",
      notes: ["D2", "A2", "D3", "E3", "A3", "D4"],
      frequencies: [73.42, 110.0, 146.83, 164.81, 220.0, 293.66],
    },
    {
      name: "Processional",
      notes: ["D2", "G2", "D3", "F3", "A3", "Bb3"],
      frequencies: [73.42, 98.0, 146.83, 174.61, 220.0, 233.08],
    },
    {
      name: "Slow Motion",
      notes: ["D2", "G2", "D3", "F3", "C4", "D4"],
      frequencies: [73.42, 98.0, 146.83, 174.61, 261.63, 293.66],
    },
    {
      name: "Spirit",
      notes: ["C#2", "A2", "C#3", "G#3", "A3", "E4"],
      frequencies: [69.3, 110.0, 138.59, 207.65, 220.0, 329.63],
    },
    {
      name: "Tarboulton",
      notes: ["C2", "G2", "D3", "G3", "C4", "D4"],
      frequencies: [65.41, 98.0, 146.83, 196.0, 261.63, 293.66],
    },
    {
      name: "Toulouse",
      notes: ["D2", "G2", "D3", "F#3", "B3", "E4"],
      frequencies: [73.42, 98.0, 146.83, 185.0, 246.94, 329.63],
    },
    {
      name: "Triqueen",
      notes: ["D2", "G2", "D3", "G3", "B3", "E4"],
      frequencies: [73.42, 98.0, 146.83, 196.0, 246.94, 329.63],
    },
  ];

  currentTuning = tunings[0];

  // 🎬 האזנה לשינוי סרטון - סגירת Tuner במעבר ואיפוס UI
  window.addEventListener("yt-navigate-finish", () => {
    if (tunerOverlay) {
      closeTuner();
    }
    // איפוס נתוני השיר הקודם
    window.songTuningHz = null;
    window.PANEL_SUBSET = null;
    // איפוס tunerOverlay כדי שייווצר מחדש עם ערכים חדשים
    if (tunerOverlay) {
      tunerOverlay.remove();
      tunerOverlay = null;
    }
  });

  /**
   * 📂 פתיחת Tuner - פונקציה גלובלית
   */
  window.openTuner = async function () {
    console.log("[Tuner] פותח...");

    const tunerButton = document.querySelector(".ytp-tuner-button");
    if (tunerButton) {
      tunerButton.style.color = "#ff0000";
    }

    // 🎸 טעינת tuningValue - בדיוק כמו פאנל וקרוסלה
    // סדר: Cache → IndexedDB → Validate → Server
    if (!window.songTuningHz) {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const videoId = urlParams.get("v");
        
        if (videoId) {
          // 1. נסה לטעון מ-PANEL_SUBSET cache
          if (window.PANEL_SUBSET?.tuningValue) {
            const tuningHz = parseFloat(window.PANEL_SUBSET.tuningValue.toString().replace(/[^\d.]/g, ""));
            if (!isNaN(tuningHz) && tuningHz !== 440) {
              window.songTuningHz = Math.round(tuningHz);
              console.log(`[Tuner] 🎸 Loaded from cache: ${window.songTuningHz} Hz`);
            }
          }
          
          // 2. אם אין cache, נסה IndexedDB
          if (!window.songTuningHz && window.databaseManager?.loadChordsFromIndexedDB) {
            const dbData = await window.databaseManager.loadChordsFromIndexedDB(videoId);
            if (dbData?.tuningValue) {
              const tuningHz = parseFloat(dbData.tuningValue.toString().replace(/[^\d.]/g, ""));
              if (!isNaN(tuningHz) && tuningHz !== 440) {
                window.songTuningHz = Math.round(tuningHz);
                if (!window.PANEL_SUBSET) window.PANEL_SUBSET = {};
                window.PANEL_SUBSET.tuningValue = dbData.tuningValue;
                console.log(`[Tuner] 🎸 Loaded from IndexedDB: ${window.songTuningHz} Hz`);
              }
            }
          }
          
          // 🚫 לא מורידים מהשרת מה-Tuner - רק מ-Carousel/Panel
          // אם אין נתונים מקומיים, ה-Tuner יעבוד בלי Song Tuning
        }
      } catch (err) {
        console.warn("[Tuner] Failed to load song tuning:", err);
      }
    }
    
    // 🎸 Guitar Tuning mode - עדכון Hz wheel
    const mode = localStorage.getItem("youchords_tuning_mode") || "songTuning";

    if (tunerOverlay) {
      tunerOverlay.style.display = "flex";
      // 🔄 Re-attach document event handlers (removed in closeTuner)
      reattachDocumentHandlers();
      // עדכון Hz wheel לפי mode
      if (window.setTunerHz) {
        if (mode === "guitarTuning" && window.songTuningHz) {
          window.setTunerHz(window.songTuningHz); // Guitar Tuning - songHz
        } else {
          window.setTunerHz(440); // Pitch Change / None - תמיד 440
        }
      }
      // הצגת/הסתרת הודעת Pitch Change לפי מצב
      const pitchChangeNotice = tunerOverlay.querySelector("#pitchChangeNotice");
      if (pitchChangeNotice) {
        const isPitchChangeActive = mode === "songTuning" && (window.chordsActive || window.lyricsChordsPanelActive);
        pitchChangeNotice.style.display = isPitchChangeActive ? "block" : "none";
      }
      // 🎸 עדכון תצוגת Song Tuning (יכול להשתנות אחרי פתיחת קרוסלה/פאנל)
      loadSongTuning();
      return;
    }

    createTunerOverlay();
  };

  /**
   * ❌ סגירת Tuner - פונקציה גלובלית
   */
  window.closeTuner = closeTuner;

  function closeTuner() {
    console.log("[Tuner] סוגר...");
    clearPitchHoldTimers();
    stopListening();
    stopTone();
    selectedString = null;
    isPermanentLock = false;
    freqHistory.length = 0;
    cachedElements = null; // Clear cached DOM elements
    
    // 🎤 Reset microphone button UI
    if (tunerOverlay) {
      const startBtn = tunerOverlay.querySelector(".tuner-start-btn");
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.classList.remove("listening");
        startBtn.textContent = "Turn Tuner On";
      }
    }

    // Clean up window event listeners
    window.removeEventListener("resize", applyDynamicSizing);
    window.removeEventListener("keydown", handleBrowserZoom);
    
    // Clean up document event listeners (will be re-attached on reopen)
    if (documentHandlers.mouseup) {
      document.removeEventListener("mouseup", documentHandlers.mouseup);
    }
    if (documentHandlers.mousemove) {
      document.removeEventListener("mousemove", documentHandlers.mousemove);
    }
    if (documentHandlers.thumbMouseup) {
      document.removeEventListener("mouseup", documentHandlers.thumbMouseup);
    }
    if (documentHandlers.thumbMousemove) {
      document.removeEventListener("mousemove", documentHandlers.thumbMousemove);
    }
    
    // Clean up pitch shifter
    if (pitchShifter) {
      pitchShifter.disconnect?.();
      pitchShifter = null;
    }

    if (tunerOverlay) {
      tunerOverlay.style.display = "none";
    }

    const tunerButton = document.querySelector(".ytp-tuner-button");
    if (tunerButton) {
      tunerButton.style.color = "";
    }
  }

  function isTunerOpen() {
    return (
      !!tunerOverlay &&
      tunerOverlay.style.display !== "none" &&
      document.documentElement.contains(tunerOverlay)
    );
  }

  /**
   * 🎨 יצירת Overlay של הטיונר
   */
  function createTunerOverlay() {
    const player =
      document.querySelector("#movie_player") ||
      document.querySelector(".html5-video-player");
    if (!player) return;

    tunerOverlay = document.createElement("div");
    tunerOverlay.className = "tuner-overlay";
    tunerOverlay.innerHTML = getTunerHTML();

    addTunerStyles();
    player.appendChild(tunerOverlay);

    initTunerEvents();
    initHzWheel();
    initTuningList();
    initPitchSlider();
    updateGuitarLabels();
    loadSongTuning(); // טעינת tuning של השיר מה-DB

    // Apply dynamic sizing based on video dimensions
    applyDynamicSizing();
    window.addEventListener("resize", applyDynamicSizing);
    window.addEventListener("keydown", handleBrowserZoom);
  }
  
  // Browser zoom handler (stored as named function for cleanup)
  function handleBrowserZoom(e) {
    if (e.ctrlKey && (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")) {
      setTimeout(applyDynamicSizing, 100);
    }
  }

  /**
   * 🎸 טעינת tuning של השיר מ-PANEL_SUBSET cache
   */
  async function loadSongTuning() {
    const display = tunerOverlay?.querySelector("#songTuningDisplay");
    if (!display) return;

    let tuningValue = null;

    // 1. בדיקה אם יש PANEL_SUBSET cache
    if (window.PANEL_SUBSET?.tuningValue) {
      tuningValue = window.PANEL_SUBSET.tuningValue;
      console.log('[Tuner] 🎸 Got tuningValue from PANEL_SUBSET cache:', tuningValue);
    }
    // 2. אם אין cache, נסה IndexedDB (בלי להוריד מהשרת)
    else if (window.databaseManager?.loadChordsFromIndexedDB) {
      try {
        const videoId = window.ycUtils?.extractVideoId?.(location.href);
        if (videoId) {
          const dbData = await window.databaseManager.loadChordsFromIndexedDB(videoId);
          if (dbData?.tuningValue) {
            tuningValue = dbData.tuningValue;
            console.log('[Tuner] 🎸 Got tuningValue from IndexedDB:', tuningValue);
          }
        }
      } catch (e) {
        console.warn('[Tuner] Failed to load from IndexedDB:', e);
      }
    }
    // 🚫 לא מורידים מהשרת - רק Carousel/Panel מורידים

    // 3. הצגה רק אם יש ערך
    if (tuningValue && tuningValue.trim()) {
      display.textContent = `Song tuning: ${tuningValue.trim()}`;
      display.style.display = 'inline';
    } else {
      display.style.display = 'none';
    }
  }

  /**
   * 📐 התאמת גודל דינמי לפי גודל הווידאו
   */
  function applyDynamicSizing() {
    if (!tunerOverlay) return;
    const player =
      document.querySelector("#movie_player") ||
      document.querySelector(".html5-video-player");
    if (!player) return;

    const container = tunerOverlay.querySelector(".tuner-container");
    if (!container) return;

    // Reset scale to measure actual size
    container.style.transform = "scale(1)";

    const playerRect = player.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Calculate scale to fit within video bounds with minimal padding
    const padding = 10;
    const scaleX = (playerRect.width - padding) / containerRect.width;
    const scaleY = (playerRect.height - padding) / containerRect.height;
    const scale = Math.min(scaleX, scaleY); // No cap - fill as much as possible

    container.style.setProperty("--tuner-scale", scale);
    container.style.transform = `scale(${scale})`;
    container.style.transformOrigin = "center center";
  }

  /**
   * 🎯 אתחול אירועים
   */
  function initTunerEvents() {
    const closeBtn = tunerOverlay.querySelector(".tuner-close-btn");
    if (closeBtn) closeBtn.addEventListener("click", closeTuner);

    // Zoom controls
    let currentZoom = 1.0;
    const container = tunerOverlay.querySelector(".tuner-unified-container");
    const zoomIn = tunerOverlay.querySelector("#zoomIn");
    const zoomOut = tunerOverlay.querySelector("#zoomOut");
    const zoomReset = tunerOverlay.querySelector("#zoomReset");

    function checkZoomLimits() {
      if (!container || !zoomIn || !zoomOut) return;
      const player =
        document.querySelector("#movie_player") ||
        document.querySelector(".html5-video-player");
      if (!player) return;

      const playerRect = player.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Check if container would exceed video bounds on next zoom in
      const nextZoom = currentZoom + 0.05;
      const wouldExceed =
        (containerRect.width / currentZoom) * nextZoom > playerRect.width ||
        (containerRect.height / currentZoom) * nextZoom > playerRect.height;

      if (wouldExceed || currentZoom >= 1.3) {
        zoomIn.disabled = true;
        zoomIn.style.opacity = "0.4";
        zoomIn.style.cursor = "not-allowed";
      } else {
        zoomIn.disabled = false;
        zoomIn.style.opacity = "1";
        zoomIn.style.cursor = "pointer";
      }

      // Check zoom out limit
      if (currentZoom <= 0.7) {
        zoomOut.disabled = true;
        zoomOut.style.opacity = "0.4";
        zoomOut.style.cursor = "not-allowed";
      } else {
        zoomOut.disabled = false;
        zoomOut.style.opacity = "1";
        zoomOut.style.cursor = "pointer";
      }
    }

    function applyZoom() {
      if (container) container.style.transform = `scale(${currentZoom})`;
      checkZoomLimits();
    }

    if (zoomIn)
      zoomIn.addEventListener("click", () => {
        if (zoomIn.disabled) return;
        currentZoom = Math.min(1.3, currentZoom + 0.05);
        applyZoom();
      });
    if (zoomOut)
      zoomOut.addEventListener("click", () => {
        if (zoomOut.disabled) return;
        currentZoom = Math.max(0.7, currentZoom - 0.05);
        applyZoom();
      });
    if (zoomReset)
      zoomReset.addEventListener("click", () => {
        currentZoom = 1.0;
        applyZoom();
      });

    // Initial check
    setTimeout(checkZoomLimits, 100);

    // סגירה בלחיצה על הרקע
    tunerOverlay.addEventListener("click", (e) => {
      if (e.target === tunerOverlay) closeTuner();
    });

    // סגירה ב-ESC
    tunerOverlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeTuner();
      e.stopPropagation();
    });

    const startBtn = tunerOverlay.querySelector(".tuner-start-btn");
    if (startBtn) {
      startBtn.addEventListener("click", async function () {
        if (!isListening) {
          if (listeningStartInProgress) return;
          hideMicPermissionNotice();
          this.disabled = true;
          this.textContent = "Starting...";
          const success = await startListening();
          if (!tunerOverlay || !isTunerOpen()) return;
          this.disabled = false;
          if (success && isListening) {
            hideMicPermissionNotice();
            this.classList.add("listening");
            this.textContent = "Turn Tuner Off";
          } else {
            this.classList.remove("listening");
            this.textContent = "Turn Tuner On";
          }
        } else {
          stopListening();
          this.disabled = false;
          this.classList.remove("listening");
          this.textContent = "Turn Tuner On";
        }
      });
    }

    const micTryAgainBtn = tunerOverlay.querySelector(".tuner-mic-try-again-btn");
    if (micTryAgainBtn && startBtn) {
      micTryAgainBtn.addEventListener("click", () => {
        startBtn.click();
      });
    }

    const micManualBtn = tunerOverlay.querySelector(".tuner-mic-manual-btn");
    const micManual = tunerOverlay.querySelector("#tunerMicPermissionManual");
    if (micManualBtn && micManual) {
      micManualBtn.addEventListener("click", () => {
        const nextHiddenState = !micManual.hidden;
        micManual.hidden = nextHiddenState;
        micManualBtn.textContent = nextHiddenState
          ? "How to enable manually"
          : "Hide instructions";
      });
    }

    const micDismissBtn = tunerOverlay.querySelector(".tuner-mic-dismiss-btn");
    if (micDismissBtn) {
      micDismissBtn.addEventListener("click", () => {
        saveMicPermissionReminderPreference(true);
      });
    }

    const soundBtn = tunerOverlay.querySelector(".sound-toggle-btn");
    if (soundBtn) {
      soundBtn.addEventListener("click", function () {
        soundEnabled = !soundEnabled;
        const icon = this.querySelector(".sound-icon");
        if (icon) icon.textContent = soundEnabled ? "🔊" : "🔇";
        this.classList.toggle("muted", !soundEnabled);
        if (!soundEnabled) stopTone();
      });
    }

    // לחיצה על כפתורי המיתרים (מפתחות) - lock קבוע
    tunerOverlay.querySelectorAll(".string-button").forEach((btn) => {
      btn.addEventListener("click", () =>
        selectString(parseInt(btn.dataset.string), true)
      );
    });
    // לחיצה על המיתרים עצמם - lock זמני
    tunerOverlay.querySelectorAll(".guitar-string-hit").forEach((str) => {
      str.addEventListener("click", () =>
        selectString(parseInt(str.dataset.string), false)
      );
    });
  }

  // Track if current lock is permanent
  let isPermanentLock = false;

  /**
   * 🎸 בחירת מיתר
   * @param {number} stringNum - מספר המיתר
   * @param {boolean} permanent - האם lock קבוע (מהמפתח) או זמני (מהמיתר)
   */
  function selectString(stringNum, permanent = false) {
    // Toggle off if clicking the same string
    if (selectedString === stringNum) {
      selectedString = null;
      isPermanentLock = false;
      stopTone();
      tunerOverlay
        .querySelectorAll(".string-button")
        .forEach((btn) => btn.classList.remove("active", "out-of-tune"));
      tunerOverlay
        .querySelectorAll(".guitar-string")
        .forEach((str) => str.classList.remove("active", "out-of-tune"));
      return;
    }

    selectedString = stringNum;
    isPermanentLock = permanent;
    if (soundEnabled) playStringTone(stringNum);

    tunerOverlay
      .querySelectorAll(".string-button")
      .forEach((btn) =>
        btn.classList.toggle(
          "active",
          parseInt(btn.dataset.string) === stringNum
        )
      );
    tunerOverlay
      .querySelectorAll(".guitar-string")
      .forEach((str) =>
        str.classList.toggle(
          "active",
          parseInt(str.dataset.string) === stringNum
        )
      );

    const noteIndex = 6 - stringNum;
    const note = currentTuning.notes[noteIndex];
    const freq = currentTuning.frequencies[noteIndex];

    const noteCenter = tunerOverlay.querySelector("#noteCenter");
    const freqDisplay = tunerOverlay.querySelector("#freqDisplay");
    if (noteCenter) noteCenter.textContent = note;
    if (freqDisplay) freqDisplay.textContent = freq.toFixed(1) + " Hz";
  }

  /**
   * 🔊 השמעת צליל מיתר (7 פריטות)
   */
  function playPluck(adjustedFreq) {
    if (!toneContext) return;
    const masterGain = toneContext.createGain();
    masterGain.connect(toneContext.destination);
    masterGain.gain.value = 0.25;

    const harmonics = [
      { mult: 1, gain: 1.0 },
      { mult: 2, gain: 0.5 },
      { mult: 3, gain: 0.25 },
      { mult: 4, gain: 0.1 },
    ];

    const oscillators = [];
    harmonics.forEach((h) => {
      const osc = toneContext.createOscillator();
      const oscGain = toneContext.createGain();
      osc.frequency.value = adjustedFreq * h.mult;
      osc.type = "sine";
      oscGain.gain.value = h.gain;
      osc.connect(oscGain);
      oscGain.connect(masterGain);
      osc.start();
      oscillators.push(osc);
    });

    masterGain.gain.exponentialRampToValueAtTime(
      0.001,
      toneContext.currentTime + 2.5
    );
    setTimeout(() => {
      oscillators.forEach((osc) => {
        try {
          osc.stop();
        } catch (e) {}
      });
    }, 2600);
  }

  function playStringTone(stringNum) {
    const noteIndex = 6 - stringNum;
    const baseFreq = currentTuning.frequencies[noteIndex];
    const adjustedFreq = baseFreq * (currentHz / 440);
    stopTone();

    if (!toneContext) {
      toneContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    pluckCount = 0;
    playPluck(adjustedFreq);
    pluckCount++;

    const interval = setInterval(() => {
      if (pluckCount >= 7) {
        clearInterval(interval);
        // Only clear lock if it's not permanent (clicked on string, not peg)
        if (!isPermanentLock) {
          setTimeout(() => {
            selectedString = null;
            tunerOverlay
              .querySelectorAll(".string-button")
              .forEach((btn) => btn.classList.remove("active", "out-of-tune"));
            tunerOverlay
              .querySelectorAll(".guitar-string")
              .forEach((str) => str.classList.remove("active", "out-of-tune"));
          }, 2600);
        }
        return;
      }
      playPluck(adjustedFreq);
      pluckCount++;
    }, 2500);

    pluckIntervals.push(interval);
  }

  function stopTone() {
    pluckIntervals.forEach((interval) => clearInterval(interval));
    pluckIntervals = [];
    pluckCount = 0;
    
    // Close tone audio context to free resources
    if (toneContext && toneContext.state !== "closed") {
      toneContext.close().catch(() => {});
      toneContext = null;
    }
  }

  /**
   * 🎤 התחלת האזנה למיקרופון
   */
  async function startListening() {
    if (isListening || listeningStartInProgress) return false;
    listeningStartInProgress = true;
    const requestToken = ++listeningLifecycleToken;
    let pendingStream = null;
    let pendingContext = null;

    try {
      pendingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (requestToken !== listeningLifecycleToken || !isTunerOpen()) {
        pendingStream.getTracks().forEach((t) => t.stop());
        return false;
      }

      pendingContext = new (window.AudioContext || window.webkitAudioContext)();

      const lowPassFilter = pendingContext.createBiquadFilter();
      lowPassFilter.type = "lowpass";
      lowPassFilter.frequency.value = 1000;

      const nextAnalyser = pendingContext.createAnalyser();
      nextAnalyser.fftSize = 4096;

      const source = pendingContext.createMediaStreamSource(pendingStream);
      source.connect(lowPassFilter);
      lowPassFilter.connect(nextAnalyser);

      if (requestToken !== listeningLifecycleToken || !isTunerOpen()) {
        source.disconnect();
        lowPassFilter.disconnect();
        nextAnalyser.disconnect();
        pendingStream.getTracks().forEach((t) => t.stop());
        pendingContext.close().catch(() => {});
        return false;
      }

      mediaStream = pendingStream;
      audioContext = pendingContext;
      analyser = nextAnalyser;
      pendingStream = null;
      pendingContext = null;

      isListening = true;
      analyzeAudio();
      return true;
    } catch (err) {
      if (requestToken !== listeningLifecycleToken) return false;
      console.error("[Tuner] Microphone access denied:", err);
      showMicPermissionNotice(err);
      return false;
    } finally {
      listeningStartInProgress = false;
      if (pendingStream) pendingStream.getTracks().forEach((t) => t.stop());
      if (pendingContext && pendingContext.state !== "closed") {
        pendingContext.close().catch(() => {});
      }
    }
  }

  function stopListening() {
    listeningLifecycleToken++;
    listeningStartInProgress = false;
    isListening = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    if (audioContext && audioContext.state !== "closed") {
      audioContext.close().catch(() => {});
    }
    audioContext = null;
    analyser = null;
  }

  // Reusable buffer for audio analysis (avoid GC pressure)
  let analyzeBuffer = null;
  let sortBuffer = new Array(SMOOTHING_SIZE);
  
  function analyzeAudio() {
    if (!isListening || !analyser) return;
    
    // Reuse buffer instead of creating new one each frame
    if (!analyzeBuffer || analyzeBuffer.length !== analyser.fftSize) {
      analyzeBuffer = new Float32Array(analyser.fftSize);
    }
    analyser.getFloatTimeDomainData(analyzeBuffer);

    const freq = autoCorrelate(analyzeBuffer, audioContext.sampleRate);
    if (freq > 0) {
      if (freqHistory.length > 0) {
        const lastFreq = freqHistory[freqHistory.length - 1];
        const ratio = freq / lastFreq;
        if (ratio > 1.3 || ratio < 0.7) freqHistory.length = 0;
      }
      freqHistory.push(freq);
      if (freqHistory.length > SMOOTHING_SIZE) freqHistory.shift();

      // Reuse sort buffer instead of creating new array
      for (let i = 0; i < freqHistory.length; i++) sortBuffer[i] = freqHistory[i];
      sortBuffer.length = freqHistory.length;
      sortBuffer.sort((a, b) => a - b);
      const smoothedFreq = sortBuffer[Math.floor(sortBuffer.length / 2)];
      updateTunerDisplay(smoothedFreq);
    }
    rafId = requestAnimationFrame(analyzeAudio);
  }

  // Reusable correlation buffer (avoid GC pressure)
  let correlationBuffer = null;
  
  function autoCorrelate(buffer, sampleRate) {
    const SIZE = buffer.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

    let r1 = 0,
      r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buffer[i]) < thres) {
        r1 = i;
        break;
      }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buffer[SIZE - i]) < thres) {
        r2 = SIZE - i;
        break;
      }
    }

    const len = r2 - r1;
    if (len <= 0) return -1;
    
    // Reuse correlation buffer instead of creating new array
    if (!correlationBuffer || correlationBuffer.length < len) {
      correlationBuffer = new Float32Array(SIZE);
    }
    
    // Zero out only the part we need
    for (let i = 0; i < len; i++) correlationBuffer[i] = 0;
    
    // Compute autocorrelation directly on buffer without slice
    for (let i = 0; i < len; i++) {
      for (let j = 0; j < len - i; j++) {
        correlationBuffer[i] += buffer[r1 + j] * buffer[r1 + j + i];
      }
    }

    let d = 0;
    while (d < len - 1 && correlationBuffer[d] > correlationBuffer[d + 1]) d++;
    let maxval = -1,
      maxpos = -1;
    for (let i = d; i < len; i++) {
      if (correlationBuffer[i] > maxval) {
        maxval = correlationBuffer[i];
        maxpos = i;
      }
    }

    if (maxpos <= 0 || maxpos >= len - 1) return -1;
    
    let T0 = maxpos;
    const x1 = correlationBuffer[T0 - 1],
      x2 = correlationBuffer[T0],
      x3 = correlationBuffer[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);
    return sampleRate / T0;
  }

  function getClosestNote(freq) {
    const hzRatio = currentHz / 440;
    const adjustedFreqs = currentTuning.frequencies.map((f) => f * hzRatio);
    let closestIdx = 0,
      minDiff = Infinity;
    for (let i = 0; i < adjustedFreqs.length; i++) {
      const diff = Math.abs(freq - adjustedFreqs[i]);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    const targetFreq = adjustedFreqs[closestIdx];
    const note = currentTuning.notes[closestIdx];
    const cents = 1200 * Math.log2(freq / targetFreq);
    return { note, targetFreq, cents, stringIndex: closestIdx };
  }

  // Cache frequently accessed DOM elements for performance
  function initCachedElements() {
    if (!tunerOverlay) return;
    cachedElements = {
      noteCenter: tunerOverlay.querySelector("#noteCenter"),
      freqDisplay: tunerOverlay.querySelector("#freqDisplay"),
      needle: tunerOverlay.querySelector("#needle"),
      statusDisplay: tunerOverlay.querySelector("#statusDisplay"),
      noteLeft: tunerOverlay.querySelector("#noteLeft"),
      noteRight: tunerOverlay.querySelector("#noteRight"),
      stringButtons: tunerOverlay.querySelectorAll(".string-button"),
      guitarStrings: tunerOverlay.querySelectorAll(".guitar-string"),
    };
  }
  
  // Note names constant (avoid recreating array each call)
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  function updateTunerDisplay(freq) {
    if (freq < 60 || freq > 400) return;
    if (!cachedElements) initCachedElements();
    
    const { note, cents, stringIndex } = getClosestNote(freq);
    const isInTune = Math.abs(cents) < 5;

    // Auto-highlight detected string when no string is manually selected
    if (selectedString === null) {
      const detectedStringNum = 6 - stringIndex;
      cachedElements.stringButtons.forEach((btn) => {
        const isMatch = parseInt(btn.dataset.string) === detectedStringNum;
        btn.classList.toggle("active", isMatch);
        btn.classList.toggle("out-of-tune", isMatch && !isInTune);
      });
      cachedElements.guitarStrings.forEach((str) => {
        const isMatch = parseInt(str.dataset.string) === detectedStringNum;
        str.classList.toggle("active", isMatch);
        str.classList.toggle("out-of-tune", isMatch && !isInTune);
      });
    }

    if (cachedElements.noteCenter) cachedElements.noteCenter.textContent = note;
    if (cachedElements.freqDisplay) cachedElements.freqDisplay.textContent = freq.toFixed(1) + " Hz";

    const angle = Math.max(-35, Math.min(35, cents * 0.7));
    if (cachedElements.needle) cachedElements.needle.setAttribute("transform", `rotate(${angle}, 0, 0)`);

    if (cachedElements.statusDisplay) {
      if (isInTune) {
        cachedElements.statusDisplay.textContent = "✓ In Tune";
        cachedElements.statusDisplay.setAttribute("fill", "#4CAF50");
      } else if (cents < 0) {
        cachedElements.statusDisplay.textContent = "↓ Flat (" + Math.abs(cents).toFixed(0) + "¢)";
        cachedElements.statusDisplay.setAttribute("fill", "#FF9800");
      } else {
        cachedElements.statusDisplay.textContent = "↑ Sharp (+" + cents.toFixed(0) + "¢)";
        cachedElements.statusDisplay.setAttribute("fill", "#F44336");
      }
    }

    const baseNote = note.replace(/[0-9]/g, "");
    const octave = note.match(/[0-9]/)?.[0] || "2";
    const noteIdx = NOTE_NAMES.indexOf(baseNote);
    if (cachedElements.noteLeft)
      cachedElements.noteLeft.textContent = NOTE_NAMES[(noteIdx - 1 + 12) % 12] + octave;
    if (cachedElements.noteRight)
      cachedElements.noteRight.textContent = NOTE_NAMES[(noteIdx + 1) % 12] + octave;
  }

  function initHzWheel() {
    const wheel = tunerOverlay.querySelector("#hzWheel");
    const wheelContainer = tunerOverlay.querySelector(".hz-wheel");
    const input = tunerOverlay.querySelector("#hzInput");
    const thumb = tunerOverlay.querySelector("#hzScrollThumb");
    const scrollbar = tunerOverlay.querySelector("#hzScrollbar");
    const resetBtn = tunerOverlay.querySelector("#hzResetBtn");
    if (!wheel) return;

    const HZ_MIN = 400,
      HZ_MAX = 480;
    const hzValues = [];
    for (let hz = HZ_MIN; hz <= HZ_MAX; hz++) hzValues.push(hz);
    wheel.innerHTML = hzValues
      .map(
        (hz) =>
          `<div class="hz-value ${
            hz === 440 ? "active" : ""
          }" data-hz="${hz}">${hz}</div>`
      )
      .join("");

    function setHz(hz, updateInput = true) {
      currentHz = hz;
      wheel
        .querySelectorAll(".hz-value")
        .forEach((el) =>
          el.classList.toggle("active", parseInt(el.dataset.hz) === hz)
        );
      // מיקום הגלגל כך שהמספר הנבחר יהיה במרכז ה-indicator
      const offset = 105 - 18; // מרכז ה-wheel (210/2) פחות חצי גובה ערך
      wheel.style.transform = `translateY(${(HZ_MIN - hz) * 36 + offset}px)`;
      if (updateInput && input) input.value = hz;
      if (thumb && scrollbar) {
        const percent = (hz - HZ_MIN) / (HZ_MAX - HZ_MIN);
        thumb.style.top = percent * (scrollbar.offsetHeight - 30) + "px";
      }
      
      // עדכון הודעת Guitar Tuning
      const guitarTuneNotice = tunerOverlay?.querySelector("#guitarTuneNotice");
      if (guitarTuneNotice) {
        const mode = localStorage.getItem("youchords_tuning_mode") || "songTuning";
        if (mode === "guitarTuning" && hz !== 440) {
          guitarTuneNotice.textContent = `Guitar tuned to: ${hz} Hz`;
          guitarTuneNotice.style.display = "block";
        } else {
          guitarTuneNotice.style.display = "none";
        }
      }
    }
    
    // חשיפה ל-window לשימוש חיצוני
    window.setTunerHz = setHz;
    
    // בדיקה אם יש songTuningHz - לפי mode
    const tuningModeForHz = localStorage.getItem("youchords_tuning_mode") || "songTuning";
    let initialHz = 440;
    if (tuningModeForHz === "guitarTuning" && window.songTuningHz) {
      initialHz = window.songTuningHz;
      console.log(`[Tuner] 🎸 Guitar Tuning mode: Hz wheel = ${initialHz}`);
    } else {
      console.log(`[Tuner] 🎵 ${tuningModeForHz} mode: Hz wheel = 440`);
    }
    setHz(initialHz);

    // Reset button
    if (resetBtn) resetBtn.addEventListener("click", () => setHz(440));

    // Arrow buttons
    const arrowUp = tunerOverlay.querySelector("#hzArrowUp");
    const arrowDown = tunerOverlay.querySelector("#hzArrowDown");
    if (arrowUp)
      arrowUp.addEventListener("click", () =>
        setHz(Math.max(HZ_MIN, currentHz - 1))
      );
    if (arrowDown)
      arrowDown.addEventListener("click", () =>
        setHz(Math.min(HZ_MAX, currentHz + 1))
      );

    // Click on value
    wheel.addEventListener("click", (e) => {
      if (e.target.classList.contains("hz-value"))
        setHz(parseInt(e.target.dataset.hz));
    });

    // Mouse wheel scroll
    wheelContainer.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1 : -1;
      setHz(Math.max(HZ_MIN, Math.min(HZ_MAX, currentHz + delta)));
    });

    // Drag scrolling (like touch on phone)
    let isDragging = false;
    let dragStartY = 0;
    let dragStartHz = 0;

    wheelContainer.style.cursor = "grab";
    wheelContainer.addEventListener("mousedown", (e) => {
      isDragging = true;
      dragStartY = e.clientY;
      dragStartHz = currentHz;
      wheelContainer.style.cursor = "grabbing";
      e.preventDefault();
    });
    
    // Named handlers for cleanup
    documentHandlers.mouseup = () => {
      if (isDragging) {
        isDragging = false;
        wheelContainer.style.cursor = "grab";
      }
    };
    documentHandlers.mousemove = (e) => {
      if (!isDragging) return;
      const deltaY = e.clientY - dragStartY;
      const deltaHz = Math.round(deltaY / 20); // 20px per Hz
      // הפוך את הכיוון - גורר למעלה = מספר גדול יותר
      const newHz = Math.max(HZ_MIN, Math.min(HZ_MAX, dragStartHz - deltaHz));
      setHz(newHz);
    };
    document.addEventListener("mouseup", documentHandlers.mouseup);
    document.addEventListener("mousemove", documentHandlers.mousemove);

    // Scrollbar thumb drag
    if (thumb && scrollbar) {
      let thumbDragging = false;
      thumb.addEventListener("mousedown", (e) => {
        thumbDragging = true;
        e.preventDefault();
        e.stopPropagation();
      });
      
      // Named handlers for cleanup
      documentHandlers.thumbMouseup = () => (thumbDragging = false);
      documentHandlers.thumbMousemove = (e) => {
        if (!thumbDragging) return;
        const rect = scrollbar.getBoundingClientRect();
        const y = Math.max(
          0,
          Math.min(rect.height - 30, e.clientY - rect.top - 15)
        );
        const percent = y / (rect.height - 30);
        const hz = Math.round(HZ_MIN + percent * (HZ_MAX - HZ_MIN));
        setHz(hz);
      };
      document.addEventListener("mouseup", documentHandlers.thumbMouseup);
      document.addEventListener("mousemove", documentHandlers.thumbMousemove);

      // Click on scrollbar track
      scrollbar.addEventListener("click", (e) => {
        if (e.target === thumb) return;
        const rect = scrollbar.getBoundingClientRect();
        const y = Math.max(
          0,
          Math.min(rect.height - 30, e.clientY - rect.top - 15)
        );
        const percent = y / (rect.height - 30);
        const hz = Math.round(HZ_MIN + percent * (HZ_MAX - HZ_MIN));
        setHz(hz);
      });
    }

    // Input field
    if (input) {
      input.addEventListener("change", (e) => {
        let val = parseInt(e.target.value) || 440;
        val = Math.max(HZ_MIN, Math.min(HZ_MAX, val));
        setHz(val);
      });
    }
  }

  function initTuningList() {
    const container = tunerOverlay.querySelector("#tuningItems");
    const searchInput = tunerOverlay.querySelector("#tuningSearch");
    if (!container) return;

    let currentTuningIndex = 0;

    function renderTunings(filter = "") {
      const filterLower = filter.toLowerCase();
      container.innerHTML = tunings
        .map((tuning, index) => {
          // חיפוש רק בשם
          const matchesName = tuning.name.toLowerCase().includes(filterLower);
          if (filter && !matchesName) return "";

          return `
          <div class="tuning-item ${
            index === currentTuningIndex ? "active" : ""
          }" data-index="${index}">
            <div class="tuning-name">${tuning.name}</div>
            <div class="tuning-notes">${tuning.notes.join(" ")}</div>
          </div>
        `;
        })
        .join("");
    }

    renderTunings();

    // חיפוש
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        renderTunings(e.target.value);
      });
      // מניעת YouTube מלתפוס את ה-keyboard events
      searchInput.addEventListener("keydown", (e) => e.stopPropagation());
      searchInput.addEventListener("keyup", (e) => e.stopPropagation());
      searchInput.addEventListener("keypress", (e) => e.stopPropagation());
    }

    // בחירת tuning
    container.addEventListener("click", (e) => {
      const item = e.target.closest(".tuning-item");
      if (item) {
        const index = parseInt(item.dataset.index);
        currentTuningIndex = index;
        currentTuning = tunings[index];
        container
          .querySelectorAll(".tuning-item")
          .forEach((el) =>
            el.classList.toggle("active", parseInt(el.dataset.index) === index)
          );
        updateGuitarLabels();
      }
    });

    // Reset button
    const resetBtn = tunerOverlay.querySelector("#tuningResetBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        currentTuningIndex = 0;
        currentTuning = tunings[0];
        if (searchInput) searchInput.value = "";
        renderTunings();
        updateGuitarLabels();
      });
    }
  }

  function initPitchSlider() {
    // Transpose elements
    const transposeSlider = tunerOverlay.querySelector("#transposeSlider");
    const transposeValue = tunerOverlay.querySelector("#transposeValue");
    const transposeResetBtn = tunerOverlay.querySelector("#transposeResetBtn");
    const transposeMinusBtn = tunerOverlay.querySelector("#transposeMinus");
    const transposePlusBtn = tunerOverlay.querySelector("#transposePlus");

    // Pitch (fine-tuning) elements
    const pitchSlider = tunerOverlay.querySelector("#pitchSlider");
    const pitchValue = tunerOverlay.querySelector("#pitchValue");
    const pitchHz = tunerOverlay.querySelector("#pitchHz");
    const pitchResetBtn = tunerOverlay.querySelector("#pitchResetBtn");
    const pitchMinusBtn = tunerOverlay.querySelector("#pitchMinus");
    const pitchPlusBtn = tunerOverlay.querySelector("#pitchPlus");

    // Speed elements
    const speedSlider = tunerOverlay.querySelector("#speedSlider");
    const speedPercent = tunerOverlay.querySelector("#speedPercent");
    const speedBpm = tunerOverlay.querySelector("#speedBpm");
    const speedResetBtn = tunerOverlay.querySelector("#speedResetBtn");
    const speedMinusBtn = tunerOverlay.querySelector("#speedMinus");
    const speedPlusBtn = tunerOverlay.querySelector("#speedPlus");

    // Video Playback Reset All button
    const videoPlaybackResetBtn = tunerOverlay.querySelector("#videoPlaybackResetBtn");

    let currentTranspose = 0; // semitones (-12 to +12)
    let currentPitch = 0; // cents (-50 to +50)
    let currentSpeed = 100; // percent (50 to 200)
    
    // 🎸 Base pitch Hz for UI display (song tuning)
    let basePitchHz = 440;
    if (window.songTuningHz && window.songTuningHz !== 440) {
      basePitchHz = window.songTuningHz;
      console.log(`[Tuner] 🎸 Using song tuning as base pitch: ${basePitchHz} Hz`);
    }

    // Initialize pitch shifter
    async function initPitchShifterForVideo() {
      const video = document.querySelector("video");
      if (!video) return;

      // Load pitch shifter script if not loaded
      if (!window.PitchShifter) {
        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("buttons/pitch-shifter.js");
        document.head.appendChild(script);
        // Wait for script to load
        await new Promise((resolve) => {
          script.onload = resolve;
          setTimeout(resolve, 1000); // fallback timeout
        });
      }

      if (window.PitchShifter && !pitchShifter) {
        pitchShifter = new window.PitchShifter();
        const success = await pitchShifter.connect(video);
        if (success) {
          console.log("[Tuner] ✅ Pitch shifter connected");
        } else {
          console.warn("[Tuner] ⚠️ Pitch shifter failed, using fallback");
          pitchShifter = null;
        }
      }
    }

    function updatePlayback() {
      const video = document.querySelector("video");
      if (!video) return;

      // Total pitch in semitones (including range offset)
      const totalPitchCents = getTotalPitch();
      const totalSemitones = currentTranspose + totalPitchCents / 100;

      if (pitchShifter && pitchShifter.isConnected) {
        // Use real pitch shifting (pitch independent of speed)
        pitchShifter.setTranspose(currentTranspose);
        pitchShifter.setPitchFine(totalPitchCents);
        pitchShifter.setSpeed(currentSpeed / 100);
      } else {
        // Fallback: pitch and speed are linked
        const pitchRate = Math.pow(2, totalSemitones / 12);
        const speedRate = currentSpeed / 100;
        video.playbackRate = pitchRate * speedRate;
        video.preservesPitch = false;
      }
    }

    // Initialize pitch shifter when user interacts with controls
    let pitchShifterInitialized = false;
    function ensurePitchShifter() {
      if (!pitchShifterInitialized) {
        pitchShifterInitialized = true;
        initPitchShifterForVideo();
      }
    }

    function setTranspose(value) {
      value = Math.max(-12, Math.min(12, value));
      currentTranspose = value;
      if (transposeSlider) transposeSlider.value = value;
      if (transposeValue)
        transposeValue.textContent = value > 0 ? "+" + value : value;
      ensurePitchShifter();
      updatePlayback();
    }

    // Pitch range system - each range is 100 cents (-50 to +50)
    let pitchRangeOffset = 0; // Offset in cents (multiples of 100)
    const PITCH_RANGE_SIZE = 100;
    const PITCH_MIN_OFFSET = -300; // Allows down to ~380Hz
    const PITCH_MAX_OFFSET = 300;  // Allows up to ~520Hz
    
    function getTotalPitch() {
      return pitchRangeOffset + currentPitch;
    }
    
    function updatePitchDisplay() {
      const totalCents = getTotalPitch();
      // 🎸 UI shows Hz relative to basePitchHz (song tuning)
      const hz = basePitchHz * Math.pow(2, totalCents / 1200);
      if (pitchValue) pitchValue.textContent = (totalCents / 100).toFixed(2);
      const pitchHzInput = tunerOverlay.querySelector("#pitchHzInput");
      if (pitchHzInput) pitchHzInput.value = hz.toFixed(1);
      
      // Update range label
      const rangeLabel = tunerOverlay.querySelector("#pitchRangeLabel");
      if (rangeLabel) {
        const rangeMinCents = pitchRangeOffset - 50;
        const rangeMaxCents = pitchRangeOffset + 50;
        const rangeMinHz = basePitchHz * Math.pow(2, rangeMinCents / 1200);
        const rangeMaxHz = basePitchHz * Math.pow(2, rangeMaxCents / 1200);
        rangeLabel.textContent = `Range: ${rangeMinHz.toFixed(0)}-${rangeMaxHz.toFixed(0)} Hz`;
      }
      
      // Update range buttons state
      const prevBtn = tunerOverlay.querySelector("#pitchRangePrev");
      const nextBtn = tunerOverlay.querySelector("#pitchRangeNext");
      if (prevBtn) {
        prevBtn.disabled = pitchRangeOffset <= PITCH_MIN_OFFSET;
        prevBtn.style.opacity = prevBtn.disabled ? "0.4" : "1";
      }
      if (nextBtn) {
        nextBtn.disabled = pitchRangeOffset >= PITCH_MAX_OFFSET;
        nextBtn.style.opacity = nextBtn.disabled ? "0.4" : "1";
      }
    }
    
    function setPitch(value, autoShiftRange = true) {
      // Auto-shift to next/prev range if at boundaries
      if (autoShiftRange) {
        if (value > 50 && pitchRangeOffset < PITCH_MAX_OFFSET) {
          pitchRangeOffset += PITCH_RANGE_SIZE;
          value = -50 + (value - 50);
        } else if (value < -50 && pitchRangeOffset > PITCH_MIN_OFFSET) {
          pitchRangeOffset -= PITCH_RANGE_SIZE;
          value = 50 + (value + 50);
        }
      }
      
      value = Math.max(-50, Math.min(50, value));
      currentPitch = value;
      if (pitchSlider) pitchSlider.value = value;
      updatePitchDisplay();
      ensurePitchShifter();
      updatePlayback();
    }
    
    function setPitchFromHz(hz) {
      hz = Math.max(400, Math.min(480, hz));
      // 🎸 Calculate cents relative to basePitchHz (song tuning)
      const totalCents = Math.round(1200 * Math.log2(hz / basePitchHz));
      pitchRangeOffset = Math.floor(totalCents / PITCH_RANGE_SIZE) * PITCH_RANGE_SIZE;
      pitchRangeOffset = Math.max(PITCH_MIN_OFFSET, Math.min(PITCH_MAX_OFFSET, pitchRangeOffset));
      const sliderValue = totalCents - pitchRangeOffset;
      setPitch(sliderValue, false);
    }
    
    // 🎵 Pitch Change mode - fallback handlers (used only if no global audio manager handler exists)
    function fallbackSetPitchForPitchChange(targetHz) {
      // חישוב cents מ-440 (לא מ-basePitchHz)
      const totalCents = Math.round(1200 * Math.log2(targetHz / 440));
      pitchRangeOffset = Math.floor(totalCents / PITCH_RANGE_SIZE) * PITCH_RANGE_SIZE;
      pitchRangeOffset = Math.max(PITCH_MIN_OFFSET, Math.min(PITCH_MAX_OFFSET, pitchRangeOffset));
      const sliderValue = totalCents - pitchRangeOffset;
      currentPitch = Math.max(-50, Math.min(50, sliderValue));
      if (pitchSlider) pitchSlider.value = currentPitch;
      
      // עדכון UI להראות 440 Hz (לא basePitchHz)
      const pitchHzInput = tunerOverlay?.querySelector("#pitchHzInput");
      if (pitchHzInput) pitchHzInput.value = "440.0";
      if (pitchValue) pitchValue.textContent = "0.00";
      const pitchRangeEl = tunerOverlay?.querySelector("#pitchRangeDisplay");
      if (pitchRangeEl) {
        pitchRangeEl.textContent = `Range: 427-453 Hz`;
      }
      
      ensurePitchShifter();
      updatePlayback();
      window.pitchChangeModeActive = true;
      
      // הצגת הודעת Pitch Change
      const pitchChangeNotice = tunerOverlay?.querySelector("#pitchChangeNotice");
      if (pitchChangeNotice) pitchChangeNotice.style.display = "block";
      
      console.log(`[Tuner] 🎵 setPitchForPitchChange: ${targetHz}Hz (UI shows 440 Hz)`);
    }
    
    // 🎵 Reset pitch מ-Pitch Change mode - חזרה ל-songHz ב-UI, 440 בפועל
    function fallbackResetPitchFromPitchChange() {
      pitchRangeOffset = 0;
      currentPitch = 0;
      if (pitchSlider) pitchSlider.value = 0;
      updatePitchDisplay(); // יחזיר את ה-UI ל-basePitchHz (songHz)
      ensurePitchShifter();
      updatePlayback();
      window.pitchChangeModeActive = false;
      
      // הסתרת הודעת Pitch Change
      const pitchChangeNotice = tunerOverlay?.querySelector("#pitchChangeNotice");
      if (pitchChangeNotice) pitchChangeNotice.style.display = "none";
      
      console.log(`[Tuner] 🎵 resetPitchFromPitchChange: UI shows ${basePitchHz} Hz, actual 440 Hz`);
    }

    // Preserve global handlers from audioManager.js when available.
    // This avoids handler overrides that can cause inconsistent pitch behavior.
    if (typeof window.setPitchForPitchChange !== "function") {
      window.setPitchForPitchChange = fallbackSetPitchForPitchChange;
    } else {
      console.log("[Tuner] Using existing global setPitchForPitchChange handler");
    }

    if (typeof window.resetPitchFromPitchChange !== "function") {
      window.resetPitchFromPitchChange = fallbackResetPitchFromPitchChange;
    } else {
      console.log("[Tuner] Using existing global resetPitchFromPitchChange handler");
    }
    
    function shiftPitchRange(delta) {
      const newOffset = pitchRangeOffset + (delta * PITCH_RANGE_SIZE);
      if (newOffset >= PITCH_MIN_OFFSET && newOffset <= PITCH_MAX_OFFSET) {
        pitchRangeOffset = newOffset;
        updatePitchDisplay();
        ensurePitchShifter();
        updatePlayback();
      }
    }

    function setSpeed(value) {
      value = Math.max(50, Math.min(200, value));
      currentSpeed = value;
      if (speedSlider) speedSlider.value = value;
      if (speedPercent) speedPercent.textContent = value + "%";
      if (speedBpm) speedBpm.textContent = "Tempo";
      ensurePitchShifter();
      updatePlayback();
    }

    // Transpose events
    if (transposeSlider) {
      transposeSlider.addEventListener("input", (e) =>
        setTranspose(parseInt(e.target.value))
      );
      if (transposeResetBtn)
        transposeResetBtn.addEventListener("click", () => setTranspose(0));
      if (transposeMinusBtn)
        transposeMinusBtn.addEventListener("click", () =>
          setTranspose(currentTranspose - 1)
        );
      if (transposePlusBtn)
        transposePlusBtn.addEventListener("click", () =>
          setTranspose(currentTranspose + 1)
        );
    }

    // Video Playback Reset All button - resets Transpose, Pitch, and Speed
    if (videoPlaybackResetBtn) {
      videoPlaybackResetBtn.addEventListener("click", () => {
        showVideoPlaybackResetConfirmation();
      });
    }

    // Function to show reset confirmation dialog
    function showVideoPlaybackResetConfirmation() {
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
      `;

      const dialog = document.createElement("div");
      dialog.style.cssText = `
        background: #282828;
        border-radius: 8px;
        padding: 24px;
        max-width: 360px;
        text-align: center;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      `;

      dialog.innerHTML = `
        <h3 style="margin: 0 0 16px; font-size: 16px; color: white;">Reset Tuner Settings?</h3>
        <p style="margin: 0 0 20px; font-size: 13px; color: #aaa;">
          This will reset Hz, Tuning, Transpose, Pitch and Speed to their default values.
        </p>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button id="yc-cancel-vp-reset" style="
            padding: 8px 20px;
            background: #444;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
          ">Cancel</button>
          <button id="yc-confirm-vp-reset" style="
            padding: 8px 20px;
            background: #ff3860;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
          ">Reset All</button>
        </div>
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      const cancelBtn = dialog.querySelector("#yc-cancel-vp-reset");
      const confirmBtn = dialog.querySelector("#yc-confirm-vp-reset");

      const cleanup = () => {
        cancelBtn.removeEventListener("click", handleCancel);
        confirmBtn.removeEventListener("click", handleConfirm);
        overlay.removeEventListener("click", handleOverlayClick);
        overlay.remove();
      };

      const handleCancel = () => cleanup();
      const handleOverlayClick = (e) => {
        if (e.target === overlay) cleanup();
      };
      const handleConfirm = () => {
        confirmBtn.textContent = "Resetting...";
        confirmBtn.disabled = true;

        // Reset all tuner settings
        if (window.resetAllTunerSettings) {
          window.resetAllTunerSettings();
        }

        // Show success message
        dialog.innerHTML = `
          <p style="margin: 0; font-size: 14px; color: #4CAF50;">✓ Tuner Settings reset successfully</p>
        `;
        setTimeout(cleanup, 1500);
      };

      cancelBtn.addEventListener("click", handleCancel);
      overlay.addEventListener("click", handleOverlayClick);
      confirmBtn.addEventListener("click", handleConfirm);
    }

    // Export reset function for global reset
    window.resetVideoPlayback = function() {
      setTranspose(0);
      pitchRangeOffset = 0;
      setPitch(0, false);
      setSpeed(100);
      console.log('[Tuner] Video Playback reset to defaults');
    };

    // Export full tuner reset function (includes Hz, Tuning, and Video Playback)
    window.resetAllTunerSettings = function() {
      // Reset Video Playback
      setTranspose(0);
      pitchRangeOffset = 0;
      setPitch(0, false);
      setSpeed(100);
      
      // Reset Hz (trigger the Hz reset button click)
      const hzResetBtn = tunerOverlay.querySelector("#hzResetBtn");
      if (hzResetBtn) hzResetBtn.click();
      
      // Reset Tuning (trigger the tuning reset button click)
      const tuningResetBtn = tunerOverlay.querySelector("#tuningResetBtn");
      if (tuningResetBtn) tuningResetBtn.click();
      
      console.log('[Tuner] All Tuner Settings reset to defaults');
    };

    // Pitch events
    if (pitchSlider) {
      pitchSlider.addEventListener("input", (e) =>
        setPitch(parseInt(e.target.value), false)
      );
      if (pitchResetBtn)
        pitchResetBtn.addEventListener("click", () => {
          pitchRangeOffset = 0;
          setPitch(0, false);
        });
      // Hold-to-repeat functionality for pitch buttons
      
      function startPitchHold(delta) {
        clearPitchHoldTimers();
        setPitch(currentPitch + delta, true);
        pitchHoldTimeout = setTimeout(() => {
          pitchHoldInterval = setInterval(() => {
            setPitch(currentPitch + delta, true);
          }, 50);
        }, 300);
      }
      
      function stopPitchHold() {
        clearPitchHoldTimers();
      }
      
      if (pitchMinusBtn) {
        pitchMinusBtn.addEventListener("mousedown", () => startPitchHold(-1));
        pitchMinusBtn.addEventListener("mouseup", stopPitchHold);
        pitchMinusBtn.addEventListener("mouseleave", stopPitchHold);
      }
      if (pitchPlusBtn) {
        pitchPlusBtn.addEventListener("mousedown", () => startPitchHold(1));
        pitchPlusBtn.addEventListener("mouseup", stopPitchHold);
        pitchPlusBtn.addEventListener("mouseleave", stopPitchHold);
      }
      
      // Range navigation buttons
      const pitchRangePrev = tunerOverlay.querySelector("#pitchRangePrev");
      const pitchRangeNext = tunerOverlay.querySelector("#pitchRangeNext");
      if (pitchRangePrev)
        pitchRangePrev.addEventListener("click", () => shiftPitchRange(-1));
      if (pitchRangeNext)
        pitchRangeNext.addEventListener("click", () => shiftPitchRange(1));
      
      // Hz input field
      const pitchHzInput = tunerOverlay.querySelector("#pitchHzInput");
      if (pitchHzInput) {
        pitchHzInput.addEventListener("change", (e) => {
          setPitchFromHz(parseFloat(e.target.value) || 440);
        });
        pitchHzInput.addEventListener("keydown", (e) => e.stopPropagation());
      }
      
      // Initial display update
      updatePitchDisplay();
    }

    // Speed events
    if (speedSlider) {
      speedSlider.addEventListener("input", (e) =>
        setSpeed(parseInt(e.target.value))
      );
      if (speedResetBtn)
        speedResetBtn.addEventListener("click", () => setSpeed(100));
      if (speedMinusBtn)
        speedMinusBtn.addEventListener("click", () =>
          setSpeed(currentSpeed - 5)
        );
      if (speedPlusBtn)
        speedPlusBtn.addEventListener("click", () =>
          setSpeed(currentSpeed + 5)
        );
    }
  }

  function updateGuitarLabels() {
    const labels = tunerOverlay.querySelectorAll(".string-label");
    const stringOrder = [2, 1, 0, 3, 4, 5];
    labels.forEach((label, i) => {
      if (currentTuning.notes[stringOrder[i]]) {
        let note = currentTuning.notes[stringOrder[i]].replace(/[0-9]/g, "");
        // מיתר 1 (index 5 במערך) - אות קטנה להבדיל מהמיתר הגס
        if (stringOrder[i] === 5) {
          note = note.toLowerCase();
        }
        label.textContent = note;
      }
    });
  }

  function getTunerHTML() {
    return `
      <div class="tuner-container">
        <div class="tuner-main">
          <div class="tuner-unified-container">
            <div class="tuner-zoom-controls">
              <button class="tuner-zoom-btn video-playback-reset-btn" id="videoPlaybackResetBtn" title="Reset All Video Playback">↺</button>
              <button class="tuner-zoom-btn" id="zoomOut" title="Zoom Out">−</button>
              <button class="tuner-zoom-btn" id="zoomReset" title="Reset Zoom">↺</button>
              <button class="tuner-zoom-btn" id="zoomIn" title="Zoom In">+</button>
              <span class="song-tuning-display" id="songTuningDisplay"></span>
            </div>
            <button class="tuner-close-btn">✕</button>
            <div class="tuner-top-row">
              <div class="settings-panel-wrapper">
                <div class="section-title tuner-section-title">Tuner Settings</div>
                <div class="settings-panel">
                  <div class="hz-picker">
                    <div class="hz-header"><span class="hz-label">Hz</span><span class="control-help" data-tooltip="Reference frequency for tuning. Standard is 440Hz, but some songs use 432Hz or other frequencies. Adjust if the tuner shows 'in tune' but sounds off.">?</span><button class="hz-reset-btn" id="hzResetBtn" title="Reset to 440 Hz">↺</button></div>
                    <div class="guitar-tune-notice" id="guitarTuneNotice" style="display: none; color: #3ea6ff; font-size: 11px; text-align: center; margin: 4px 0;">Guitar tuned to: 440 Hz</div>
                    <input type="number" class="hz-input" id="hzInput" value="440" min="400" max="480"/>
                    <div class="hz-wheel-container">
                      <div class="hz-wheel"><div class="hz-indicator"></div><div class="hz-wheel-inner" id="hzWheel"></div></div>
                      <div class="hz-scrollbar-wrapper"><div class="hz-scrollbar-arrow" id="hzArrowUp">▲</div><div class="hz-scrollbar" id="hzScrollbar"><div class="hz-scrollbar-thumb" id="hzScrollThumb"></div></div><div class="hz-scrollbar-arrow" id="hzArrowDown">▼</div></div>
                    </div>
                  </div>
                  <div class="tuning-list">
                    <div class="tuning-list-header"><span>Tunings</span><span class="control-help" data-tooltip="Select a guitar tuning. Standard (EADGBE) is most common. Drop D is popular for rock/metal. Open tunings are used for slide guitar and fingerpicking.">?</span><button class="tuning-reset-btn" id="tuningResetBtn" title="Reset to Standard">↺</button></div>
                    <input type="text" class="tuning-search" id="tuningSearch" placeholder="Search..." />
                    <div class="tuning-items" id="tuningItems"></div>
                  </div>
                </div>
                <div class="section-title video-section-title">Video Playback</div>
                <div class="transpose-control">
                  <div class="control-header"><span>Transpose</span><span class="control-help" data-tooltip="Shift the song up or down by semitones (half steps). Use this to match your vocal range or play along in a different key. +1 = one fret higher.">?</span><span class="control-value" id="transposeValue">0</span><button class="control-reset-btn" id="transposeResetBtn" title="Reset">↺</button></div>
                  <div class="control-slider-row">
                    <button class="control-btn" id="transposeMinus">−</button>
                    <input type="range" class="control-slider" id="transposeSlider" min="-12" max="12" value="0" />
                    <button class="control-btn" id="transposePlus">+</button>
                  </div>
                </div>
                <div class="pitch-control">
                  <div class="control-header"><span>Pitch</span><span class="control-help" data-tooltip="Fine-tune the pitch in cents (1/100 of a semitone). Use this for micro-adjustments when the song is slightly out of tune with standard 440Hz tuning.">?</span><input type="number" class="pitch-hz-input" id="pitchHzInput" value="440.0" step="0.1" min="400" max="480" title="Enter Hz value directly" /><span class="pitch-hz-label">Hz</span><span class="control-value" id="pitchValue">0.00</span><button class="control-reset-btn" id="pitchResetBtn" title="Reset">↺</button></div>
                  <div class="pitch-change-notice" id="pitchChangeNotice" style="display: none; color: #3ea6ff; font-size: 11px; text-align: center; margin: 4px 0;">Pitch adjusted to 440 Hz</div>
                  <div class="pitch-range-row">
                    <button class="control-btn pitch-range-btn" id="pitchRangePrev" title="Previous range">◀</button>
                    <span class="pitch-range-label" id="pitchRangeLabel">Range: 427-453 Hz</span>
                    <button class="control-btn pitch-range-btn" id="pitchRangeNext" title="Next range">▶</button>
                  </div>
                  <div class="control-slider-row">
                    <button class="control-btn" id="pitchMinus">−</button>
                    <input type="range" class="control-slider" id="pitchSlider" min="-50" max="50" value="0" />
                    <button class="control-btn" id="pitchPlus">+</button>
                  </div>
                </div>
                <div class="speed-control">
                  <div class="control-header"><span>Speed</span><span class="control-help" data-tooltip="Change playback speed without affecting pitch. Slow down to learn difficult parts, or speed up for practice. The pitch stays the same!">?</span><span class="control-info" id="speedPercent">100%</span><span class="control-value" id="speedBpm">Tempo</span><button class="control-reset-btn" id="speedResetBtn" title="Reset">↺</button></div>
                  <div class="control-slider-row">
                    <button class="control-btn" id="speedMinus">−</button>
                    <input type="range" class="control-slider" id="speedSlider" min="50" max="200" value="100" />
                    <button class="control-btn" id="speedPlus">+</button>
                  </div>
                </div>
              </div>
              <div class="meter-container">
                <svg class="tuner-meter" viewBox="40 0 270 250" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif">
                <g transform="translate(175, 140)">
                  <path d="M -63 -90 A 110 110 0 0 1 -13.4 -109.2" fill="none" stroke="#ffa500" stroke-width="18"/>
                  <path d="M -13.4 -109.2 A 110 110 0 0 1 13.4 -109.2" fill="none" stroke="#108544" stroke-width="18"/>
                  <path d="M 13.4 -109.2 A 110 110 0 0 1 63 -90" fill="none" stroke="#ffa500" stroke-width="18"/>
                  <path d="M -100 -46 A 110 110 0 0 1 100 -46" fill="none" stroke="white" stroke-width="2"/>
                  <line x1="0" y1="-110" x2="0" y2="-120" stroke="white" stroke-width="2"/>
                  <text id="noteCenter" x="0" y="-85" text-anchor="middle" font-size="20" font-weight="bold" fill="white">A2</text>
                  <text id="noteLeft" x="-115" y="-30" text-anchor="middle" font-size="20" fill="#888">G#2</text>
                  <text id="noteRight" x="115" y="-30" text-anchor="middle" font-size="20" fill="#888">A#2</text>
                  <g id="needle" style="transition: transform 0.08s ease-out"><path d="M -3 0 L 0 -115 L 3 0 Z" fill="#0b1e15"/></g>
                  <circle cx="0" cy="0" r="12" fill="#108544"/>
                  <line x1="0" y1="12" x2="0" y2="22" stroke="white" stroke-width="2"/>
                </g>
                <text id="freqDisplay" x="175" y="180" text-anchor="middle" font-size="18" fill="#888">110.0 Hz</text>
                <text id="statusDisplay" x="175" y="205" text-anchor="middle" font-size="14" fill="#4CAF50">Ready</text>
              </svg>
                <button class="tuner-start-btn">Turn Tuner On</button>
                <div class="tuner-mic-permission" id="tunerMicPermissionNotice" hidden>
                  <div class="tuner-mic-permission-title">Microphone access needed</div>
                  <div class="tuner-mic-permission-text" id="tunerMicPermissionMessage">
                    Microphone access is required to tune your guitar.
                  </div>
                  <div class="tuner-mic-permission-actions">
                    <button class="tuner-mic-action tuner-mic-try-again-btn" type="button">Try again</button>
                    <button class="tuner-mic-action tuner-mic-manual-btn" type="button">How to enable manually</button>
                    <button class="tuner-mic-action tuner-mic-dismiss-btn" type="button">Don't remind me again</button>
                  </div>
                  <div class="tuner-mic-permission-manual" id="tunerMicPermissionManual" hidden>
                    Click the lock or settings icon next to the address bar, set Microphone to Allow, then press Try again.
                  </div>
                </div>
                <div class="guitar-section">
                  <div class="guitar-with-sound">
                    ${getGuitarSVG()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function getGuitarSVG() {
    return `
      <div class="guitar-svg-container">
        <svg class="guitar-svg" viewBox="-25 0 350 530" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="woodGradient" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color: #4e342e"/><stop offset="50%" style="stop-color: #795548"/><stop offset="100%" style="stop-color: #4e342e"/></linearGradient>
            <linearGradient id="chromeGradient" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color: #90a4ae"/><stop offset="30%" style="stop-color: #ffffff"/><stop offset="70%" style="stop-color: #cfd8dc"/><stop offset="100%" style="stop-color: #607d8b"/></linearGradient>
            <linearGradient id="shaftGradient" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color: #455a64"/><stop offset="50%" style="stop-color: #b0bec5"/><stop offset="100%" style="stop-color: #455a64"/></linearGradient>
          </defs>
          <rect x="100" y="348" width="100" height="180" fill="#3E2723"/>
          <line x1="100" y1="380" x2="200" y2="380" stroke="#B0BEC5" stroke-width="2"/>
          <line x1="100" y1="420" x2="200" y2="420" stroke="#B0BEC5" stroke-width="2"/>
          <line x1="100" y1="460" x2="200" y2="460" stroke="#B0BEC5" stroke-width="2"/>
          <line x1="100" y1="500" x2="200" y2="500" stroke="#B0BEC5" stroke-width="2"/>
          <path d="M 100 350 Q 100 310 70 290 L 70 90 Q 70 50 110 50 L 190 50 Q 230 50 230 90 L 230 290 Q 200 310 200 350 Z" fill="url(#woodGradient)" stroke="#F5F5F5" stroke-width="3"/>
          <g class="sound-toggle-btn" style="cursor: pointer; pointer-events: all">
            <circle cx="150" cy="75" r="22" fill="transparent"/>
            <text class="sound-icon" x="150" y="88" text-anchor="middle" font-size="38" fill="#f5deb3" style="pointer-events: none">🔊</text>
          </g>
          <path d="M 130 335 L 170 335 L 160 280 Q 150 265 140 280 Z" fill="#181818" stroke="#F5F5F5" stroke-width="1"/>
          <rect x="100" y="350" width="100" height="6" fill="#FFF3E0"/>
          <g class="string-button" data-string="4"><rect x="40" y="102" width="45" height="16" fill="url(#shaftGradient)"/><path d="M 10 90 Q 50 90 55 110 Q 50 130 10 130 Q 0 110 10 90 Z" fill="url(#chromeGradient)" stroke="#546E7A" stroke-width="1"/><circle cx="85" cy="110" r="10" fill="#CFD8DC" stroke="#90A4AE" stroke-width="1"/><text class="string-label" x="27" y="118" fill="#333" font-size="28" font-weight="bold" text-anchor="middle">D</text><text class="string-number" x="-10" y="118" fill="#ccc" font-size="26" text-anchor="middle">4</text></g>
          <g class="string-button" data-string="5"><rect x="37" y="182" width="45" height="16" fill="url(#shaftGradient)"/><path d="M 10 170 Q 50 170 55 190 Q 50 210 10 210 Q 0 190 10 170 Z" fill="url(#chromeGradient)" stroke="#546E7A" stroke-width="1"/><circle cx="82" cy="190" r="10" fill="#CFD8DC" stroke="#90A4AE" stroke-width="1"/><text class="string-label" x="27" y="199" fill="#333" font-size="28" font-weight="bold" text-anchor="middle">A</text><text class="string-number" x="-10" y="199" fill="#ccc" font-size="26" text-anchor="middle">5</text></g>
          <g class="string-button" data-string="6"><rect x="40" y="262" width="45" height="16" fill="url(#shaftGradient)"/><path d="M 10 250 Q 50 250 55 270 Q 50 290 10 290 Q 0 270 10 250 Z" fill="url(#chromeGradient)" stroke="#546E7A" stroke-width="1"/><circle cx="85" cy="270" r="10" fill="#CFD8DC" stroke="#90A4AE" stroke-width="1"/><text class="string-label" x="27" y="279" fill="#333" font-size="28" font-weight="bold" text-anchor="middle">E</text><text class="string-number" x="-10" y="279" fill="#ccc" font-size="26" text-anchor="middle">6</text></g>
          <g class="string-button" data-string="3"><rect x="215" y="102" width="45" height="16" fill="url(#shaftGradient)"/><path d="M 290 90 Q 250 90 245 110 Q 250 130 290 130 Q 300 110 290 90 Z" fill="url(#chromeGradient)" stroke="#546E7A" stroke-width="1"/><circle cx="215" cy="110" r="10" fill="#CFD8DC" stroke="#90A4AE" stroke-width="1"/><text class="string-label" x="270" y="119" fill="#333" font-size="28" font-weight="bold" text-anchor="middle">G</text><text class="string-number" x="310" y="119" fill="#ccc" font-size="26" text-anchor="middle">3</text></g>
          <g class="string-button" data-string="2"><rect x="218" y="182" width="45" height="16" fill="url(#shaftGradient)"/><path d="M 290 170 Q 250 170 245 190 Q 250 210 290 210 Q 300 190 290 170 Z" fill="url(#chromeGradient)" stroke="#546E7A" stroke-width="1"/><circle cx="218" cy="190" r="10" fill="#CFD8DC" stroke="#90A4AE" stroke-width="1"/><text class="string-label" x="270" y="199" fill="#333" font-size="28" font-weight="bold" text-anchor="middle">B</text><text class="string-number" x="310" y="199" fill="#ccc" font-size="26" text-anchor="middle">2</text></g>
          <g class="string-button" data-string="1"><rect x="215" y="262" width="45" height="16" fill="url(#shaftGradient)"/><path d="M 290 250 Q 250 250 245 270 Q 250 290 290 290 Q 300 270 290 250 Z" fill="url(#chromeGradient)" stroke="#546E7A" stroke-width="1"/><circle cx="215" cy="270" r="10" fill="#CFD8DC" stroke="#90A4AE" stroke-width="1"/><text class="string-label" x="270" y="279" fill="#333" font-size="28" font-weight="bold" text-anchor="middle">e</text><text class="string-number" x="310" y="279" fill="#ccc" font-size="26" text-anchor="middle">1</text></g>
          <g fill="none" stroke-linecap="round">
            <path class="guitar-string-hit" data-string="6" d="M 85 270 L 105 350 L 105 530" stroke="transparent" stroke-width="15" style="cursor: pointer"/>
            <path class="guitar-string-hit" data-string="5" d="M 82 190 L 123 350 L 123 530" stroke="transparent" stroke-width="15" style="cursor: pointer"/>
            <path class="guitar-string-hit" data-string="4" d="M 85 110 L 141 350 L 141 530" stroke="transparent" stroke-width="15" style="cursor: pointer"/>
            <path class="guitar-string-hit" data-string="3" d="M 215 110 L 159 350 L 159 530" stroke="transparent" stroke-width="15" style="cursor: pointer"/>
            <path class="guitar-string-hit" data-string="2" d="M 218 190 L 177 350 L 177 530" stroke="transparent" stroke-width="15" style="cursor: pointer"/>
            <path class="guitar-string-hit" data-string="1" d="M 215 270 L 195 350 L 195 530" stroke="transparent" stroke-width="15" style="cursor: pointer"/>
            <path class="guitar-string" data-string="6" d="M 85 270 L 105 350 L 105 530" stroke="#CFD8DC" stroke-width="3.0" style="pointer-events: none"/>
            <path class="guitar-string" data-string="5" d="M 82 190 L 123 350 L 123 530" stroke="#CFD8DC" stroke-width="2.4" style="pointer-events: none"/>
            <path class="guitar-string" data-string="4" d="M 85 110 L 141 350 L 141 530" stroke="#CFD8DC" stroke-width="1.8" style="pointer-events: none"/>
            <path class="guitar-string" data-string="3" d="M 215 110 L 159 350 L 159 530" stroke="#CFD8DC" stroke-width="1.5" style="pointer-events: none"/>
            <path class="guitar-string" data-string="2" d="M 218 190 L 177 350 L 177 530" stroke="#CFD8DC" stroke-width="1.2" style="pointer-events: none"/>
            <path class="guitar-string" data-string="1" d="M 215 270 L 195 350 L 195 530" stroke="#CFD8DC" stroke-width="0.9" style="pointer-events: none"/>
          </g>
        </svg>
      </div>
    `;
  }

  function addTunerStyles() {
    if (document.getElementById("tuner-styles")) return;
    const style = document.createElement("style");
    style.id = "tuner-styles";
    style.textContent = `
      .tuner-overlay {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }
      .tuner-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 15px;
        position: relative;
        transform: scale(var(--tuner-scale, 1));
        transform-origin: center center;
      }
      .tuner-zoom-controls {
        position: absolute;
        top: 5px; left: 5px;
        display: flex;
        gap: 3px;
        z-index: 10;
      }
      .tuner-zoom-btn {
        background: rgba(255,255,255,0.1);
        border: none;
        color: white;
        font-size: 14px;
        width: 24px; height: 24px;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.2s;
      }
      .tuner-zoom-btn:hover { background: rgba(255,255,255,0.2); }
      .tuner-zoom-btn.video-playback-reset-btn { color: #ff3860; border: 1px solid #ff3860; }
      .tuner-zoom-btn.video-playback-reset-btn:hover { background: rgba(255,56,96,0.2); }
      .song-tuning-display {
        display: none;
        color: #4CAF50;
        font-size: 12px;
        font-weight: 500;
        margin-left: 8px;
        padding: 4px 8px;
        background: rgba(76, 175, 80, 0.15);
        border-radius: 4px;
        white-space: nowrap;
      }
      .tuner-close-btn {
        position: absolute;
        top: 5px; right: 5px;
        background: rgba(255,255,255,0.1);
        border: none;
        color: white;
        font-size: 20px;
        width: 32px; height: 32px;
        border-radius: 50%;
        cursor: pointer;
        transition: background 0.2s;
        z-index: 10;
      }
      .tuner-close-btn:hover { background: rgba(255,255,255,0.2); }
      .tuner-header { display: flex; justify-content: center; margin-bottom: 10px; }
      .tuner-main {
        display: flex;
        justify-content: center;
        width: 100%;
      }
      .tuner-unified-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        background: rgba(255,255,255,0.03);
        border-radius: 12px;
        padding: 15px;
        position: relative;
      }
      .tuner-top-row {
        display: flex;
        gap: 20px;
        align-items: flex-start;
        margin-top: 20px;
      }
      .settings-panel-wrapper {
        display: flex;
        flex-direction: column;
        background: rgba(255,255,255,0.05);
        border-radius: 8px;
        padding: 10px;
      }
      .settings-panel {
        display: flex;
        gap: 10px;
      }
      .tuning-list {
        padding: 8px;
        width: 160px;
        max-height: 280px;
        display: flex;
        flex-direction: column;
        background: rgba(0,0,0,0.2);
        border: 1px solid #444;
        border-radius: 6px;
      }
      .tuning-items {
        flex: 1;
        overflow-y: auto;
        max-height: 210px;
      }
      .tuning-list-header { display: flex; align-items: center; justify-content: center; gap: 6px; color: #3ea6ff; font-weight: bold; margin-bottom: 6px; font-size: 13px; }
      .tuning-reset-btn {
        background: none; border: 1px solid #555; color: #aaa;
        width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 12px;
      }
      .tuning-reset-btn:hover { background: rgba(255,255,255,0.1); color: white; }
      .tuning-search {
        width: 100%; padding: 5px 8px; margin-bottom: 6px;
        background: rgba(0,0,0,0.3); border: 1px solid #555;
        border-radius: 4px; color: white; font-size: 11px;
        outline: none; box-sizing: border-box;
      }
      .tuning-search::placeholder { color: #666; }
      .tuning-search:focus { border-color: #3ea6ff; }
      .tuning-item { padding: 6px 8px; border-radius: 5px; cursor: pointer; transition: background 0.2s; margin-bottom: 3px; }
      .tuning-item:hover { background: rgba(255,255,255,0.1); }
      .tuning-item.active { background: #3ea6ff; }
      .tuning-name { color: white; font-weight: bold; font-size: 12px; }
      .tuning-notes { color: #aaa; font-size: 10px; margin-top: 1px; }
      .tuning-item.active .tuning-notes { color: rgba(255,255,255,0.8); }
      .meter-container { display: flex; flex-direction: column; align-items: center; margin-top: -30px; }
      .tuner-meter { width: 500px; height: 400px; }
      .hz-picker {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 80px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #444;
        border-radius: 6px;
        padding: 8px;
      }
      .hz-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
      .hz-label { color: #3ea6ff; font-weight: bold; font-size: 14px; }
      .hz-reset-btn {
        background: none; border: 1px solid #555; color: #aaa;
        width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 12px;
      }
      .hz-reset-btn:hover { background: rgba(255,255,255,0.1); color: white; }
      .hz-input {
        width: 50px; padding: 4px; text-align: center;
        background: rgba(0,0,0,0.3); border: 1px solid #555;
        border-radius: 4px; color: white; font-size: 14px; margin-bottom: 8px;
      }
      .hz-wheel-container { display: flex; gap: 6px; height: 210px; }
      .hz-wheel {
        width: 50px; height: 210px; overflow: hidden; position: relative;
        background: rgba(0,0,0,0.3); border-radius: 5px;
      }
      .hz-wheel-inner { transition: transform 0.15s ease-out; }
      .hz-value {
        height: 36px; display: flex; align-items: center; justify-content: center;
        color: #666; font-size: 13px; cursor: pointer; transition: all 0.15s;
      }
      .hz-value:hover { color: #aaa; }
      .hz-value.active { color: #3ea6ff; font-weight: bold; font-size: 16px; }
      .hz-indicator {
        position: absolute; top: 50%; left: 0; right: 0; height: 36px;
        transform: translateY(-50%);
        border-top: 2px solid #3ea6ff; border-bottom: 2px solid #3ea6ff;
        pointer-events: none; z-index: 1; box-sizing: border-box;
      }
      .hz-scrollbar-wrapper { display: flex; flex-direction: column; align-items: center; height: 210px; }
      .hz-scrollbar { width: 10px; height: 180px; background: rgba(0,0,0,0.2); border-radius: 5px; position: relative; }
      .hz-scrollbar-thumb { width: 10px; height: 16px; background: rgba(255,255,255,0.2); border-radius: 5px; position: absolute; top: 0; }
      .hz-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
      .hz-scrollbar-arrow { width: 10px; height: 12px; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.3); font-size: 8px; user-select: none; }
      .hz-scrollbar-arrow:hover { color: rgba(255,255,255,0.6); }
      .guitar-section { display: flex; align-items: center; justify-content: center; gap: 30px; margin-top: -20px; }
      .transpose-control, .pitch-control, .speed-control { display: flex; flex-direction: column; gap: 8px; padding: 10px; background: rgba(0,0,0,0.2); border: 1px solid #444; border-radius: 6px; box-sizing: border-box; }
      .control-header { display: flex; align-items: center; gap: 8px; }
      .control-header span:first-child { color: #3ea6ff; font-weight: bold; font-size: 14px; }
      .control-info { color: #888; font-size: 12px; }
      .control-value { color: white; font-weight: bold; font-size: 14px; margin-left: auto; }
      .control-reset-btn { background: none; border: 1px solid #555; color: #aaa; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 12px; }
      .control-reset-btn:hover { background: rgba(255,255,255,0.1); color: white; }
      .control-slider-row { display: flex; align-items: center; gap: 8px; }
      .control-btn { background: rgba(255,255,255,0.1); border: 1px solid #555; color: white; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; }
      .control-btn:hover { background: rgba(255,255,255,0.2); }
      .control-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .pitch-range-btn { font-size: 12px; width: 24px; height: 24px; }
      .pitch-hz-input { width: 60px; background: rgba(255,255,255,0.1); border: 1px solid #555; border-radius: 4px; color: white; font-size: 12px; padding: 2px 4px; text-align: center; }
      .pitch-hz-input:focus { outline: none; border-color: #3ea6ff; }
      .pitch-hz-label { color: #888; font-size: 12px; margin-left: -2px; }
      .pitch-range-row { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 4px; }
      .pitch-range-label { color: #888; font-size: 11px; min-width: 100px; text-align: center; }
      .control-slider { flex: 1; height: 8px; -webkit-appearance: none; background: rgba(255,255,255,0.2); border-radius: 4px; outline: none; cursor: pointer; }
      .control-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; background: #3ea6ff; border-radius: 50%; cursor: pointer; }
      .control-slider::-moz-range-thumb { width: 20px; height: 20px; background: #3ea6ff; border-radius: 50%; cursor: pointer; border: none; }
      .pitch-header { display: flex; align-items: center; gap: 6px; }
      .pitch-header span { color: #3ea6ff; font-weight: bold; font-size: 14px; }
      .pitch-reset-btn { background: none; border: 1px solid #555; color: #aaa; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 12px; }
      .pitch-reset-btn:hover { background: rgba(255,255,255,0.1); color: white; }
      .pitch-value { color: white; font-size: 24px; font-weight: bold; min-width: 50px; text-align: center; }
      .pitch-hz { color: #888; font-size: 12px; margin-top: -4px; }
      .pitch-slider-row { display: flex; align-items: center; gap: 8px; }
      .pitch-btn { background: rgba(255,255,255,0.1); border: 1px solid #555; color: white; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; }
      .pitch-btn:hover { background: rgba(255,255,255,0.2); }
      .pitch-slider { width: 150px; height: 8px; -webkit-appearance: none; background: rgba(255,255,255,0.2); border-radius: 4px; outline: none; cursor: pointer; }
      .pitch-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; background: #3ea6ff; border-radius: 50%; cursor: pointer; }
      .pitch-slider::-moz-range-thumb { width: 20px; height: 20px; background: #3ea6ff; border-radius: 50%; cursor: pointer; border: none; }
      .pitch-labels, .speed-labels { display: flex; justify-content: space-between; width: 150px; font-size: 10px; color: #666; margin-left: 36px; }
      .speed-header { display: flex; align-items: center; gap: 6px; }
      .speed-header span { color: #3ea6ff; font-weight: bold; font-size: 14px; }
      .speed-reset-btn { background: none; border: 1px solid #555; color: #aaa; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 12px; }
      .speed-reset-btn:hover { background: rgba(255,255,255,0.1); color: white; }
      .speed-value { color: white; font-size: 24px; font-weight: bold; min-width: 70px; text-align: center; }
      .speed-slider-row { display: flex; align-items: center; gap: 8px; }
      .speed-btn { background: rgba(255,255,255,0.1); border: 1px solid #555; color: white; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; }
      .speed-btn:hover { background: rgba(255,255,255,0.2); }
      .speed-slider { width: 150px; height: 8px; -webkit-appearance: none; background: rgba(255,255,255,0.2); border-radius: 4px; outline: none; cursor: pointer; }
      .speed-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; background: #3ea6ff; border-radius: 50%; cursor: pointer; }
      .speed-slider::-moz-range-thumb { width: 20px; height: 20px; background: #3ea6ff; border-radius: 50%; cursor: pointer; border: none; }
      .guitar-svg-container { position: relative; }
      .guitar-svg { width: 210px; height: 315px; }
      .guitar-with-sound { position: relative; }
      .tuner-sound-toggle {
        position: absolute; top: 28px; left: 50%; transform: translateX(-50%);
        background: linear-gradient(145deg, #8B4513, #5D3A1A);
        border: 2px solid #3d2512; box-shadow: inset 0 1px 2px rgba(255,255,255,0.2), 0 2px 4px rgba(0,0,0,0.3);
        color: #f5deb3; font-size: 16px; width: 32px; height: 32px;
        border-radius: 50%; cursor: pointer; transition: all 0.2s;
        z-index: 10;
      }
      .tuner-sound-toggle:hover { background: linear-gradient(145deg, #9B5523, #6D4A2A); }
      .tuner-sound-toggle.muted { opacity: 0.6; color: #888; }
      .tuner-start-btn {
        padding: 6px 16px; font-size: 13px;
        background: #3ea6ff; border: none; border-radius: 15px;
        color: white; cursor: pointer; transition: all 0.2s;
        margin-top: -65px;
        width: 155px;
        text-align: center;
        box-sizing: border-box;
        position: relative;
        z-index: 20;
      }
      .tuner-start-btn:hover { background: #2196f3; transform: scale(1.05); }
      .tuner-start-btn.listening { background: #f44336; }
      .tuner-start-btn.listening:hover { background: #d32f2f; }
      .tuner-mic-permission[hidden],
      .tuner-mic-permission-manual[hidden] {
        display: none !important;
      }
      .tuner-mic-permission {
        width: 280px;
        margin: 8px auto 0;
        padding: 10px 12px;
        border: 1px solid rgba(255, 183, 77, 0.5);
        border-radius: 12px;
        background: rgba(18, 18, 18, 0.92);
        color: #f5f5f5;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
        text-align: left;
        position: relative;
        z-index: 25;
      }
      .tuner-mic-permission-title {
        color: #ffcc80;
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 4px;
      }
      .tuner-mic-permission-text,
      .tuner-mic-permission-manual {
        color: rgba(255, 255, 255, 0.82);
        font-size: 11px;
        line-height: 1.4;
      }
      .tuner-mic-permission-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
      }
      .tuner-mic-action {
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
        cursor: pointer;
        font-size: 11px;
        padding: 5px 8px;
        transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
      }
      .tuner-mic-action:hover {
        background: rgba(62, 166, 255, 0.18);
        border-color: rgba(62, 166, 255, 0.7);
        box-shadow: 0 0 0 2px rgba(62, 166, 255, 0.16);
        transform: translateY(-1px);
      }
      .tuner-mic-dismiss-btn:hover {
        background: rgba(255, 183, 77, 0.16);
        border-color: rgba(255, 183, 77, 0.65);
        box-shadow: 0 0 0 2px rgba(255, 183, 77, 0.14);
      }
      .tuner-mic-permission-manual {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.12);
      }
      .string-button { cursor: pointer; transition: opacity 0.2s; pointer-events: auto; }
      .string-button:hover { opacity: 0.8; }
      .guitar-string-hit { cursor: pointer; pointer-events: stroke; }
      .string-button.active text { fill: #3ea6ff !important; }
      .string-button.out-of-tune text { fill: #ff9800 !important; }
      .guitar-string { transition: stroke 0.2s, filter 0.2s; }
      .guitar-string.active { stroke: #3ea6ff !important; filter: drop-shadow(0 0 4px #3ea6ff); }
      .guitar-string.out-of-tune { stroke: #ff9800 !important; filter: drop-shadow(0 0 4px #ff9800); }
      .tuning-list::-webkit-scrollbar { width: 5px; }
      .tuning-list::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
      .tuning-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
      
      /* Section titles */
      .section-title {
        font-size: 12px;
        font-weight: bold;
        padding: 4px 0;
        margin-bottom: 6px;
        text-align: center;
        color: #3ea6ff;
        background: none;
        border: none;
      }
      .video-section-title {
        margin-top: 10px;
      }
      
      /* Help tooltips */
      .control-help {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        background: rgba(255,255,255,0.1);
        border: 1px solid #555;
        border-radius: 50%;
        color: #888;
        font-size: 11px;
        cursor: help;
        position: relative;
        margin-left: 4px;
        transition: all 0.2s;
      }
      .control-help:hover {
        background: rgba(62, 166, 255, 0.2);
        border-color: #3ea6ff;
        color: #3ea6ff;
      }
      .control-help::after {
        content: attr(data-tooltip);
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.95);
        border: 1px solid #3ea6ff;
        border-radius: 8px;
        padding: 10px 12px;
        color: white;
        font-size: 12px;
        font-weight: normal;
        line-height: 1.4;
        width: 220px;
        text-align: left;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s, visibility 0.2s;
        z-index: 1000;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      }
      .control-help::before {
        content: '';
        position: absolute;
        bottom: calc(100% + 2px);
        left: 50%;
        transform: translateX(-50%);
        border: 6px solid transparent;
        border-top-color: #3ea6ff;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s, visibility 0.2s;
        z-index: 1001;
      }
      .control-help:hover::after,
      .control-help:hover::before {
        opacity: 1;
        visibility: visible;
      }
    `;
    document.head.appendChild(style);
  }
} // סוף ה-else של מניעת הזרקות כפולות
