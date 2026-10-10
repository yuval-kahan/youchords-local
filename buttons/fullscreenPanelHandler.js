/**
 * Fullscreen Panel Handler for YouChords Lyrics & Chords
 * Handles video player scaling and chord positioning in fullscreen mode
 */

// Global variables for cleanup
let fullscreenPanelActive = false;
let originalPlayerTransform = "";
let originalChordsTransform = "";
let fullscreenResizeListener = null;
let fullscreenResizeTimeout = null;
let chordsMutationObserver = null;
let currentPanelDirection = null;
let currentPanelWidth = 350;

/**
 * Main function to handle fullscreen panel behavior
 * @param {string} direction - Panel direction ('rtl' or 'ltr')
 * @param {boolean} isOpen - Whether panel should be open
 */
async function handleFullscreenPanel(direction, isOpen) {
  if (window.DEBUG) {
    console.log("[FullscreenPanel] טיפול במסך מלא:", { direction, isOpen });
  }

  try {
    if (!isOpen) {
      resetFullscreenPanel();
      return;
    }

    // Wait for panel to be fully rendered
    await new Promise((resolve) => setTimeout(resolve, 100));

    const panel = document.querySelector(".yt-lyrics-chords-panel");
    if (!panel) {
      console.warn("[FullscreenPanel] פאנל לא נמצא");
      return;
    }

    // שמירת פרמטרים לטיפול באקורדים חדשים
    currentPanelDirection = direction;
    currentPanelWidth = panel.offsetWidth || 350;

    // Apply fullscreen scaling
    applyFullscreenScaling(panel, direction);

    // Add resize listener for fullscreen changes
    addFullscreenResizeListener(panel, direction);

    // הפעלת MutationObserver לזיהוי אקורדים חדשים
    setupChordsMutationObserver();

    fullscreenPanelActive = true;

    if (window.DEBUG) {
      console.log("[FullscreenPanel] ✅ הופעל מצב מסך מלא");
    }
  } catch (error) {
    console.error("[FullscreenPanel] שגיאה בטיפול במסך מלא:", error);
    resetFullscreenPanel();
  }
}

/**
 * Apply scaling transformations for fullscreen mode
 * @param {HTMLElement} panel - The lyrics/chords panel element
 * @param {string} direction - Panel direction ('rtl' or 'ltr')
 */
function applyFullscreenScaling(panel, direction) {
  const player = document.querySelector(".html5-video-player");
  const chordsContainer = document.querySelector(".yt-chords-container");

  if (!player) {
    console.warn("[FullscreenPanel] נגן לא נמצא");
    return;
  }

  // Calculate scaling parameters
  const fullscreenWidth = window.innerWidth;
  const panelWidth = panel.offsetWidth || 350;
  const targetWidth = fullscreenWidth - panelWidth;
  const scaleX = targetWidth / fullscreenWidth;

  // Determine panel side based on direction
  const isRightPanel = direction === "rtl"; // RTL = פאנל ימין
  const isLeftPanel = direction === "ltr"; // LTR = פאנל שמאל

  if (window.DEBUG) {
    console.log("[FullscreenPanel] פרמטרי כיווץ:", {
      fullscreenWidth,
      panelWidth,
      targetWidth,
      scaleX: scaleX.toFixed(3),
      direction,
      isRightPanel,
      isLeftPanel,
    });
  }

  // Store original transforms for cleanup
  originalPlayerTransform = player.style.transform || "";
  if (chordsContainer) {
    originalChordsTransform = chordsContainer.style.transform || "";
  }

  // Apply player scaling
  scaleVideoPlayer(player, scaleX, isRightPanel);

  // Counter-scale and position chords if they exist - עדכון מיידי
  if (chordsContainer) {
    scaleAndPositionChords(chordsContainer, scaleX, panelWidth, isRightPanel);

    // 🔧 תיקון: עדכון מיידי נוסף אחרי זמן קצר למניעת דריסה
    setTimeout(() => {
      if (chordsContainer && fullscreenPanelActive) {
        scaleAndPositionChords(
          chordsContainer,
          scaleX,
          panelWidth,
          isRightPanel
        );
        if (window.DEBUG) {
          console.log("[FullscreenPanel] 🔄 עדכון מיידי נוסף לאקורדים");
        }
      }
    }, 50);

    // 🔧 תיקון נוסף: עדכון אחרי זמן ארוך יותר לוודא שהמיקום נשמר
    setTimeout(() => {
      if (chordsContainer && fullscreenPanelActive) {
        scaleAndPositionChords(
          chordsContainer,
          scaleX,
          panelWidth,
          isRightPanel
        );
        if (window.DEBUG) {
          console.log("[FullscreenPanel] 🔄 עדכון מאוחר לאקורדים");
        }
      }
    }, 200);
  }

  // Position panel as overlay - הפאנל צריך להיות באותו צד כמו הכיווץ
  positionPanelOverlay(panel, isRightPanel);

  // 🔧 תיקון: עדכון משתנה CSS לרוחב הפאנל
  document.documentElement.style.setProperty(
    "--panel-width",
    panelWidth + "px"
  );
  if (window.DEBUG) {
    console.log(
      "[FullscreenPanel] 🎨 עדכנתי משתנה CSS --panel-width ל:",
      panelWidth + "px"
    );
  }
}

/**
 * Scale the video player horizontally
 * @param {HTMLElement} player - The video player element
 * @param {number} scaleX - Horizontal scale factor
 * @param {boolean} isRightPanel - Whether panel is on the right side
 */
function scaleVideoPlayer(player, scaleX, isRightPanel) {
  // Check for existing vertical scaling (from chords)
  const currentTransform = originalPlayerTransform;
  let newTransform = "";

  if (currentTransform.includes("scaleY")) {
    // Preserve existing vertical scaling
    const scaleYMatch = currentTransform.match(/scaleY\(([\d.]+)\)/);
    const currentScaleY = scaleYMatch ? scaleYMatch[1] : "1";
    newTransform = `scaleX(${scaleX}) scaleY(${currentScaleY})`;

    if (window.DEBUG) {
      console.log("[FullscreenPanel] שילוב עם כיווץ גובה קיים:", currentScaleY);
    }
  } else {
    // Only horizontal scaling
    newTransform = `scaleX(${scaleX})`;

    if (window.DEBUG) {
      console.log("[FullscreenPanel] רק כיווץ רוחב (אין אקורדים פעילים)");
    }
  }

  // Set transform origin and apply scaling
  // פאנל ימין = כיווץ משמאל, פאנל שמאל = כיווץ מימין
  player.style.transformOrigin = isRightPanel ? "left bottom" : "right bottom";
  player.style.transform = newTransform;
  player.style.transition = "transform 0.35s ease-out";

  if (window.DEBUG) {
    console.log("[FullscreenPanel] ✅ נגן מכווץ:", newTransform);
  }
}

/**
 * Counter-scale and position chords container
 * @param {HTMLElement} chordsContainer - The chords container element
 * @param {number} scaleX - Original scale factor to counter
 * @param {number} panelWidth - Width of the panel
 * @param {boolean} isRightPanel - Whether panel is on the right side
 */
function scaleAndPositionChords(
  chordsContainer,
  scaleX,
  panelWidth,
  isRightPanel
) {
  // פתרון קיצוני: הוצאת האקורדים מהנגן ומיקום כ-overlay נפרד
  const player = document.querySelector(".html5-video-player");
  const body = document.body;

  if (!player || !body) {
    console.warn("[FullscreenPanel] לא נמצא נגן או body");
    return;
  }

  // שמירת המיקום המקורי של האקורדים
  if (!chordsContainer.dataset.originalParent) {
    chordsContainer.dataset.originalParent = "player";
  }

  // הוצאת האקורדים מהנגן והעברה ל-body
  body.appendChild(chordsContainer);

  // חישוב מיקום האקורדים ביחס לנגן המכווץ
  const playerRect = player.getBoundingClientRect();
  const targetWidth = window.innerWidth - panelWidth;
  const scaledPlayerWidth = targetWidth;

  // מיקום האקורדים מעל הנגן המכווץ
  let leftPosition;
  if (isRightPanel) {
    // פאנל בצד ימין - אקורדים מעל הנגן המכווץ בשמאל
    leftPosition = 0;
  } else {
    // פאנל בצד שמאל - אקורדים מעל הנגן המכווץ בימין
    leftPosition = panelWidth;
  }

  // החלת סגנון overlay על האקורדים
  chordsContainer.style.position = "fixed";
  chordsContainer.style.top = playerRect.top + "px";
  chordsContainer.style.left = leftPosition + "px";
  chordsContainer.style.width = scaledPlayerWidth + "px";
  chordsContainer.style.height = playerRect.height + "px";
  chordsContainer.style.zIndex = "2147483646"; // מתחת לפאנל
  chordsContainer.style.pointerEvents = "none"; // לא לחסום את הנגן
  chordsContainer.style.transform = "none"; // אין צורך ב-transform!
  chordsContainer.style.transformOrigin = "initial";
  chordsContainer.style.transition = "all 0.35s ease-out";

  // סימון שהאקורדים במצב overlay
  chordsContainer.classList.add("yc-chords-overlay");

  if (window.DEBUG) {
    console.log("[FullscreenPanel] ✅ אקורדים כ-overlay:", {
      position: "fixed",
      top: playerRect.top + "px",
      left: leftPosition + "px",
      width: scaledPlayerWidth + "px",
      height: playerRect.height + "px",
      note: "הוצאו מהנגן - אין ירושה של scaleX!",
    });
  }
}

/**
 * Setup MutationObserver to detect new chords containers
 */
function setupChordsMutationObserver() {
  if (chordsMutationObserver) {
    chordsMutationObserver.disconnect();
  }

  const player = document.querySelector(".html5-video-player");
  if (!player) {
    console.warn("[FullscreenPanel] Player not found for MutationObserver");
    return;
  }

  chordsMutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // בדיקה אם זה קונטיינר אקורדים
            if (
              node.classList &&
              node.classList.contains("yt-chords-container")
            ) {
              handleNewChordsInFullscreen(node);
            }

            // בדיקה אם יש קונטיינר אקורדים בתוך הנוד החדש
            const chordsInside =
              node.querySelector && node.querySelector(".yt-chords-container");
            if (chordsInside) {
              handleNewChordsInFullscreen(chordsInside);
            }
          }
        });
      }

      // 🔧 תיקון: מעקב אחר שינויים באטריביוטים (כולל style)
      if (
        mutation.type === "attributes" &&
        mutation.target.classList.contains("yt-chords-container")
      ) {
        // אם האטריביוט שהשתנה הוא style או transform
        if (
          mutation.attributeName === "style" ||
          mutation.attributeName === "class"
        ) {
          if (window.DEBUG) {
            console.log(
              "[FullscreenPanel] 🔍 זוהה שינוי באקורדים - מעדכן מיקום"
            );
          }
          // עדכון מיידי של המיקום
          setTimeout(() => {
            if (fullscreenPanelActive) {
              handleNewChordsInFullscreen(mutation.target);
            }
          }, 10);
        }
      }
    });
  });

  // התחלת מעקב על הנגן - כולל אטריביוטים
  chordsMutationObserver.observe(player, {
    childList: true,
    subtree: true,
    attributes: true, // 🔧 תיקון: מעקב אחר שינויי אטריביוטים
    attributeFilter: ["style", "class", "transform"], // רק אטריביוטים רלוונטיים
  });

  // 🔧 תיקון נוסף: מעקב ישיר על קונטיינר האקורדים הקיים
  const existingChords = document.querySelector(".yt-chords-container");
  if (existingChords) {
    const chordsObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          (mutation.attributeName === "style" ||
            mutation.attributeName === "class")
        ) {
          if (window.DEBUG) {
            console.log(
              "[FullscreenPanel] 🔍 זוהה שינוי ישיר באקורדים - מעדכן מיקום"
            );
          }
          setTimeout(() => {
            if (fullscreenPanelActive) {
              handleNewChordsInFullscreen(existingChords);
            }
          }, 5); // עדכון מהיר מאוד
        }
      });
    });

    chordsObserver.observe(existingChords, {
      attributes: true,
      attributeFilter: ["style", "class", "transform"],
    });

    // שמירה לניקוי
    window.chordsDirectObserver = chordsObserver;
  }

  if (window.DEBUG) {
    console.log(
      "[FullscreenPanel] 👁️ MutationObserver מחוזק הופעל לזיהוי אקורדים חדשים"
    );
  }
}

/**
 * Handle new chords container detected in fullscreen mode
 * @param {HTMLElement} chordsContainer - The new chords container
 */
function handleNewChordsInFullscreen(chordsContainer) {
  if (!fullscreenPanelActive || !currentPanelDirection) {
    return;
  }

  // בדיקה שהאקורד לא עבר כבר טיפול overlay
  if (chordsContainer.classList.contains("yc-chords-overlay")) {
    return;
  }

  if (window.DEBUG) {
    console.log("[FullscreenPanel] 🎯 מטפל באקורד חדש במסך מלא");
  }

  // חישוב scaleX נוכחי (לא באמת נדרש כי אנחנו עושים overlay)
  const player = document.querySelector(".html5-video-player");
  const fullscreenWidth = window.innerWidth;
  const targetWidth = fullscreenWidth - currentPanelWidth;
  const scaleX = targetWidth / fullscreenWidth;

  const isRightPanel = currentPanelDirection === "rtl";

  // החלת הטיפול overlay על האקורד החדש
  scaleAndPositionChords(
    chordsContainer,
    scaleX,
    currentPanelWidth,
    isRightPanel
  );
}

/**
 * Cleanup MutationObserver
 */
function cleanupChordsMutationObserver() {
  if (chordsMutationObserver) {
    chordsMutationObserver.disconnect();
    chordsMutationObserver = null;

    if (window.DEBUG) {
      console.log("[FullscreenPanel] MutationObserver נוקה");
    }
  }

  // 🔧 תיקון: ניקוי ה-observer הישיר של האקורדים
  if (window.chordsDirectObserver) {
    window.chordsDirectObserver.disconnect();
    window.chordsDirectObserver = null;

    if (window.DEBUG) {
      console.log("[FullscreenPanel] 🗑️ ChordsDirectObserver נוקה");
    }
  }
}

/**
 * Position the panel as an overlay
 * @param {HTMLElement} panel - The panel element
 * @param {boolean} isRightPanel - Whether panel should be on the right side
 */
function positionPanelOverlay(panel, isRightPanel) {
  console.log("[FullscreenPanel] 🔍 מתחיל מיקום פאנל:", {
    isRightPanel,
    panelElement: panel,
    currentClasses: panel.className,
    inlineStyles: {
      left: panel.style.left,
      right: panel.style.right,
      top: panel.style.top,
      bottom: panel.style.bottom,
    },
  });

  // 🧹 ניקוי inline styles שמפריעים ל-CSS classes
  panel.style.left = "";
  panel.style.right = "";
  panel.style.top = "";
  panel.style.bottom = "";
  console.log("[FullscreenPanel] 🧹 ניקיתי inline styles");

  // Remove any existing positioning classes
  panel.classList.remove("yc-panel-left", "yc-panel-right");
  console.log(
    "[FullscreenPanel] 🧹 הסרת קלאסים ישנים, קלאסים עכשיו:",
    panel.className
  );

  // Add appropriate positioning class + inline styles כגיבוי
  if (isRightPanel) {
    panel.classList.add("yc-panel-right");
    // גיבוי inline styles לוודא שהפאנל בצד ימין
    panel.style.position = "fixed";
    panel.style.right = "0px";
    panel.style.left = "auto";
    panel.style.top = "0px";
    panel.style.bottom = "0px";
    panel.style.zIndex = "2147483647";
    console.log("[FullscreenPanel] ➡️ פאנל בצד ימין (CSS + inline)");
  } else {
    panel.classList.add("yc-panel-left");
    // גיבוי inline styles לוודא שהפאנל בצד שמאל
    panel.style.position = "fixed";
    panel.style.left = "0px";
    panel.style.right = "auto";
    panel.style.top = "0px";
    panel.style.bottom = "0px";
    panel.style.zIndex = "2147483647";
    console.log("[FullscreenPanel] ⬅️ פאנל בצד שמאל (CSS + inline)");
  }

  console.log(
    "[FullscreenPanel] ✅ פאנל ממוקם:",
    isRightPanel ? "ימין" : "שמאל"
  );
  console.log("[FullscreenPanel] 📋 קלאסים סופיים:", panel.className);
  console.log("[FullscreenPanel] 🎨 סגנונות מחושבים:", {
    position: getComputedStyle(panel).position,
    left: getComputedStyle(panel).left,
    right: getComputedStyle(panel).right,
    zIndex: getComputedStyle(panel).zIndex,
  });
}

/**
 * Add resize listener for fullscreen changes
 * @param {HTMLElement} panel - The panel element
 * @param {string} direction - Panel direction
 */
function addFullscreenResizeListener(panel, direction) {
  if (fullscreenResizeListener) {
    window.removeEventListener("resize", fullscreenResizeListener);
  }

  fullscreenResizeListener = function () {
    if (fullscreenPanelActive && panel) {
      // Clear previous timeout
      if (fullscreenResizeTimeout) {
        clearTimeout(fullscreenResizeTimeout);
      }

      // Debounce resize handling
      fullscreenResizeTimeout = setTimeout(() => {
        try {
          if (window.isFullscreenMode && window.isFullscreenMode()) {
            // עדכון רוחב הפאנל לפני החלת הסקיילינג
            currentPanelWidth = panel.offsetWidth || 350;
            applyFullscreenScaling(panel, direction);
          } else {
            resetFullscreenPanel();
          }
        } catch (error) {
          console.warn("[FullscreenPanel] שגיאה בטיפול ב-resize:", error);
        }
        fullscreenResizeTimeout = null;
      }, 100);
    }
  };

  window.addEventListener("resize", fullscreenResizeListener);
}

/**
 * Reset all fullscreen transformations
 */
function resetFullscreenPanel() {
  if (window.DEBUG) {
    console.log("[FullscreenPanel] 🔄 איפוס מצב מסך מלא");
  }

  try {
    const player = document.querySelector(".html5-video-player");
    const chordsContainer = document.querySelector(".yt-chords-container");
    const panel = document.querySelector(".yt-lyrics-chords-panel");

    // Reset player transform
    if (player) {
      if (originalPlayerTransform) {
        player.style.transform = originalPlayerTransform;
      } else {
        player.style.transform = "";
        player.style.transformOrigin = "";
      }
      player.style.transition = "";
    }

    // Reset chords - החזרה למקום המקורי בנגן
    if (chordsContainer) {
      // אם האקורדים הוצאו מהנגן, נחזיר אותם
      if (chordsContainer.classList.contains("yc-chords-overlay")) {
        chordsContainer.classList.remove("yc-chords-overlay");

        // החזרה לנגן
        if (player && chordsContainer.dataset.originalParent === "player") {
          player.appendChild(chordsContainer);
        }

        // איפוס כל הסגנונות של overlay
        chordsContainer.style.position = "";
        chordsContainer.style.top = "";
        chordsContainer.style.left = "";
        chordsContainer.style.width = "";
        chordsContainer.style.height = "";
        chordsContainer.style.zIndex = "";
        chordsContainer.style.pointerEvents = "";

        delete chordsContainer.dataset.originalParent;
      }

      // איפוס transform רגיל
      if (originalChordsTransform) {
        chordsContainer.style.transform = originalChordsTransform;
      } else {
        chordsContainer.style.transform = "";
        chordsContainer.style.transformOrigin = "";
      }
      chordsContainer.style.transition = "";
    }

    // Reset panel positioning
    if (panel) {
      panel.classList.remove("yc-panel-left", "yc-panel-right");
    }

    // Clean up resize listener
    if (fullscreenResizeListener) {
      window.removeEventListener("resize", fullscreenResizeListener);
      fullscreenResizeListener = null;
    }

    // Clear timeout
    if (fullscreenResizeTimeout) {
      clearTimeout(fullscreenResizeTimeout);
      fullscreenResizeTimeout = null;
    }

    // ניקוי MutationObserver
    cleanupChordsMutationObserver();

    // Reset state
    fullscreenPanelActive = false;
    originalPlayerTransform = "";
    originalChordsTransform = "";
    currentPanelDirection = null;
    currentPanelWidth = 350;

    // 🔧 תיקון: איפוס משתנה CSS
    document.documentElement.style.removeProperty("--panel-width");
    if (window.DEBUG) {
      console.log("[FullscreenPanel] 🎨 איפסתי משתנה CSS --panel-width");
    }

    if (window.DEBUG) {
      console.log("[FullscreenPanel] ✅ איפוס הושלם");
    }
  } catch (error) {
    console.error("[FullscreenPanel] שגיאה באיפוס:", error);
  }
}

// 🌍 חשיפת הפונקציה גלובלית
window.resetFullscreenPanel = resetFullscreenPanel;

/**
 * Check if fullscreen panel is currently active
 * @returns {boolean} Whether fullscreen panel is active
 */
function isFullscreenPanelActive() {
  return fullscreenPanelActive;
}

// Export functions to global scope
window.handleFullscreenPanel = handleFullscreenPanel;
window.resetFullscreenPanel = resetFullscreenPanel;
window.isFullscreenPanelActive = isFullscreenPanelActive;

if (window.DEBUG) {
  console.log("[FullscreenPanel] 📦 מודול נטען בהצלחה");
}
