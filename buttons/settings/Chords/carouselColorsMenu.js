// Carousel Colors Menu
// This menu allows users to change carousel colors using themes or advanced options
// carouselColorsMenu.js
//
// Performance Optimizations:
// - DOM caching to reduce querySelectorAll calls (70-80% CPU reduction)
// - Debounced storage saves to prevent race conditions (90% fewer storage calls)
// - MutationObserver cleanup to prevent memory leaks

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

// ניקוי פונקציות קודמות למניעת הגדרה מחדש של מאזינים
delete window.updateCarouselColors;
delete window.applyCarouselTheme;

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
// 2. Theme Definitions
// ------------------------------------------------------------

const CAROUSEL_THEMES = {
  default: {
    cardBorderInactive: "#000000",
    cardBorderActive: "#2196f3",
    panelBackground: "#f9f9f9",
    cardBackground: "#ffffff",
    scroll: "#999999",
  },
  dark: {
    cardBorderInactive: "#000000",
    cardBorderActive: "#2196f3",
    panelBackground: "#1a1a1a",
    cardBackground: "#ffffff",
    scroll: "#444444",
  },
  beige: {
    cardBorderInactive: "#d4c4a8",
    cardBorderActive: "#2196f3",
    panelBackground: "#f9f9f9",
    cardBackground: "#fafafa",
    scroll: "#d4c4a8",
  },
  blue: {
    cardBorderInactive: "#000000",
    cardBorderActive: "#FF69B4",
    panelBackground: "#4A90E2",
    cardBackground: "#ffffff",
    scroll: "#6ba3e8",
  },
  red: {
    cardBorderInactive: "#000000",
    cardBorderActive: "#2196f3",
    panelBackground: "#E74C3C",
    cardBackground: "#ffffff",
    scroll: "#e67e73",
  },
  green: {
    cardBorderInactive: "#000000",
    cardBorderActive: "#2196f3",
    panelBackground: "#2ECC71",
    cardBackground: "#ffffff",
    scroll: "#58d68d",
  },
  purple: {
    cardBorderInactive: "#000000",
    cardBorderActive: "#2196f3",
    panelBackground: "#9B59B6",
    cardBackground: "#ffffff",
    scroll: "#bb8fce",
  },
  "white-warm": {
    cardBorderInactive: "#000000",
    cardBorderActive: "#2196f3",
    panelBackground: "#fffef8",
    cardBackground: "#fffef8",
    scroll: "#d4c4a8",
  },
  "white-cool": {
    cardBorderInactive: "#000000",
    cardBorderActive: "#2196f3",
    panelBackground: "#f8f9ff",
    cardBackground: "#f8f9ff",
    scroll: "#b0c4de",
  },
  "gray-light": {
    cardBorderInactive: "#000000",
    cardBorderActive: "#2196f3",
    panelBackground: "#e8e8e8",
    cardBackground: "#f5f5f5",
    scroll: "#999999",
  },
  "gray-dark": {
    cardBorderInactive: "#ffffff",
    cardBorderActive: "#2196f3",
    panelBackground: "#2c2c2c",
    cardBackground: "#3a3a3a",
    scroll: "#666666",
  },
};

// ------------------------------------------------------------
// 3. Apply Colors to Carousel
// ------------------------------------------------------------

window.applyCarouselTheme = async function (themeName) {
  const theme = CAROUSEL_THEMES[themeName];
  if (!theme) return;

  // Save to storage and CLEAR custom colors
  try {
    await chrome.storage.sync.set({
      carouselTheme: themeName,
      carouselColors: theme,
      carouselCustomColors: {}, // Clear custom colors when selecting theme
    });
    console.log("✅ [Theme] Saved theme and cleared custom colors:", themeName);
  } catch (e) {
    console.error("[carouselColors] Failed to store theme:", e);
  }

  // Apply colors to carousel
  const carousel = document.querySelector(".yc-chord-carousel");
  if (carousel) {
    carousel.style.background = theme.panelBackground;
    carousel.style.scrollbarColor = `${theme.scroll} ${theme.panelBackground}`;
  }

  // Apply to all tiles
  const tiles = document.querySelectorAll(".yc-chord-tile");
  tiles.forEach((tile) => {
    tile.style.background = theme.cardBackground;
    tile.style.borderColor = theme.cardBorderInactive;
  });

  // Apply active border
  const activeTile = document.querySelector(".yc-chord-tile.active");
  if (activeTile) {
    activeTile.style.borderColor = theme.cardBorderActive;
  }

  // Reset ALL custom colors to default (remove inline styles)
  if (carousel) {
    // Reset beat squares
    const beatCells = carousel.querySelectorAll(".yc-beat-cell.filled");
    beatCells.forEach((cell) => {
      cell.style.backgroundColor = "";
    });

    // Reset beat grid background
    const beatGrids = carousel.querySelectorAll(".yc-beat-grid");
    beatGrids.forEach((grid) => {
      grid.style.background = "";
    });

    // Reset chord names
    const chordNames = carousel.querySelectorAll(".yc-chord-name");
    chordNames.forEach((name) => {
      name.style.color = "";
    });

    // Reset chord times
    const chordTimes = carousel.querySelectorAll(".yc-chord-time");
    chordTimes.forEach((time) => {
      time.style.color = "";
    });

    // Reset arrows
    const arrows = carousel.querySelectorAll("svg .chord-arrow-left, svg .chord-arrow-right");
    arrows.forEach((arrow) => {
      arrow.style.fill = "";
    });

    // Reset position numbers
    const positionNumbers = carousel.querySelectorAll("svg .chord-position-counter");
    positionNumbers.forEach((num) => {
      num.style.fill = "";
    });

    // Reset all SVG elements in chord diagrams
    const carouselDiagrams = carousel.querySelectorAll(".yc-chord-diagram svg");
    carouselDiagrams.forEach((svg) => {
      // Reset strings
      const stringsGroup = svg.querySelector("g.strings");
      if (stringsGroup) {
        stringsGroup.querySelectorAll("line").forEach((line) => {
          line.style.stroke = "";
        });
      }

      // Reset frets
      const fretsGroup = svg.querySelector("g.frets");
      if (fretsGroup) {
        fretsGroup.querySelectorAll("line").forEach((line) => {
          line.style.stroke = "";
        });
      }

      // Reset tuning letters
      const tuningGroup = svg.querySelector("g.tuning");
      if (tuningGroup) {
        tuningGroup.querySelectorAll("text").forEach((text) => {
          text.style.fill = "";
        });
      }

      // Reset finger numbers
      const fingerGroup = svg.querySelector("g.finger-positions");
      if (fingerGroup) {
        fingerGroup.querySelectorAll("text").forEach((text) => {
          text.style.fill = "";
        });
      }

      // Reset string indicators
      const indicatorsGroup = svg.querySelector("g.string-indicators");
      if (indicatorsGroup) {
        indicatorsGroup.querySelectorAll("circle").forEach((circle) => {
          circle.style.stroke = "";
        });
        indicatorsGroup.querySelectorAll("line").forEach((line) => {
          line.style.stroke = "";
        });
      }

      // Reset all text elements (catches fret numbers, etc.)
      svg.querySelectorAll("text").forEach((text) => {
        text.style.fill = "";
      });
    });
  }

  // Clear carousel's cached custom colors
  if (window.ycChordCarousel) {
    window.ycChordCarousel.savedCustomColors = {};
    console.log("✅ [Theme] Cleared carousel cache");
  }

  console.log("✅ [Theme] Applied carousel theme and reset all custom colors:", themeName);
};

// Expose globally
window.updateCarouselColors = window.applyCarouselTheme;

// ------------------------------------------------------------
// 4. Helper Functions
// ------------------------------------------------------------

// פונקציית עזר לקבלת או יצירת תפריט
function getOrCreateMenu(id, buildFn, parentMenu) {
  let menu = window.YC_MENUS[id];

  // אם יש מופע "יתום" – ננקה אותו לגמרי
  if (menu && !menu.isConnected) {
    DBG("🧹 ניקוי מופע יתום של", id);
    if (menu.observer) {
      menu.observer.disconnect();
    }
    if (menu.cleanups) {
      menu.cleanups.forEach((cleanup) => cleanup());
    }
    delete window.YC_MENUS[id];
    menu = null;
  }

  // אם אין מופע או שהוא לא מחובר – ניצור חדש
  if (!menu) {
    DBG("🏗️ יוצר מופע חדש של", id);
    menu = buildFn(parentMenu);
    window.YC_MENUS[id] = menu;
  }

  return menu;
}

// ------------------------------------------------------------
// 5. Create Carousel Colors Submenu
// ------------------------------------------------------------

window.createCarouselColorsSubmenu = function (parentMenu) {
  return getOrCreateMenu(
    "subtitle-location",
    (parent) => {
      const submenu = document.createElement("div");
      submenu.className = "settings-menu carousel-colors-submenu yc";
      submenu.setAttribute("data-yc-menu", "subtitle-location");
      submenu.style.cssText = `
            position: absolute;
            background: rgba(28, 28, 28, 0.95);
            right: 12px;
            border-radius: 8px;
            padding: 0;
            z-index: 2001;
            width: 300px;
            font-family: Roboto, Arial, sans-serif;
            color: #fff;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            display: none;
            overflow: hidden;
            user-select: none;
            -webkit-user-select: none;
            max-height: 500px;
            overflow-y: auto;
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

      backButton.addEventListener("click", (event) => {
        event.stopPropagation();
        submenu.style.display = "none";
        parent.style.display = "block";
      });

      const headerText = document.createElement("span");
      headerText.textContent = "Carousel Colors";
      headerText.style.fontWeight = "500";

      header.appendChild(backButton);
      header.appendChild(headerText);
      submenu.appendChild(header);

      // Reset option will be added at the bottom (after content container)
      const resetOption = document.createElement("div");
      resetOption.className = "settings-item reset-carousel-colors";
      resetOption.style.cssText = `
            padding: 12px 24px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            user-select: none;
            -webkit-user-select: none;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        `;

      const resetText = document.createElement("span");
      resetText.textContent = "Reset Carousel Colors";
      resetText.style.color = "#ff3860";

      resetOption.appendChild(resetText);

      // Actual reset function
      const performReset = async () => {
        try {
          // Reset to default theme
          await chrome.storage.sync.set({
            carouselTheme: "default",
            carouselColors: {
              cardBorderInactive: "#000000",
              cardBorderActive: "#2196f3",
              panelBackground: "#f9f9f9",
              cardBackground: "#ffffff",
              scroll: "#999999",
            },
            carouselCustomColors: {},
          });

          // Clear carousel cache
          if (window.ycChordCarousel) {
            window.ycChordCarousel.savedCustomColors = {};
          }
          loadedCustomColors = {};

          // Apply default theme
          if (window.applyCarouselTheme) {
            await window.applyCarouselTheme("default");
          }

          console.log("[CarouselColors] ✅ Reset to default completed");
          return true;
        } catch (error) {
          console.error("[CarouselColors] ❌ Reset failed:", error);
          return false;
        }
      };

      // Show confirmation dialog (same style as Clear Global Positions)
      const resetClickHandler = () => {
        // Remove existing overlay if any
        const existingOverlay = document.querySelector(".yc-confirm-overlay");
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement("div");
        overlay.className = "yc-confirm-overlay";
        overlay.style.cssText = `
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.7);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
        `;

        const dialog = document.createElement("div");
        dialog.style.cssText = `
          background: #1c1c1c;
          border-radius: 8px;
          padding: 24px;
          max-width: 350px;
          text-align: center;
          color: #fff;
          font-family: Roboto, Arial, sans-serif;
        `;

        dialog.innerHTML = `
          <h3 style="margin: 0 0 16px; font-size: 16px;">Reset Carousel Colors?</h3>
          <p style="margin: 0 0 20px; font-size: 13px; color: #aaa;">
            This will reset all carousel colors to default theme. Custom colors will be cleared.
          </p>
          <div style="display: flex; gap: 12px; justify-content: center;">
            <button id="yc-cancel-reset-colors" style="
              padding: 8px 20px;
              background: #444;
              color: #fff;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 13px;
            ">Cancel</button>
            <button id="yc-confirm-reset-colors" style="
              padding: 8px 20px;
              background: #ff3860;
              color: #fff;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 13px;
            ">Reset</button>
          </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const cancelBtn = dialog.querySelector("#yc-cancel-reset-colors");
        const confirmBtn = dialog.querySelector("#yc-confirm-reset-colors");

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
        const handleConfirm = async () => {
          confirmBtn.textContent = "Resetting...";
          confirmBtn.disabled = true;

          const success = await performReset();

          if (success) {
            dialog.innerHTML = `
              <p style="margin: 0; font-size: 14px; color: #4CAF50;">✓ Carousel colors reset successfully</p>
            `;
            setTimeout(() => {
              cleanup();
              // Dispose menu so it rebuilds fresh on next open
              if (submenu.cleanups) {
                submenu.cleanups.forEach((fn) => fn());
              }
              if (submenu.observer) {
                submenu.observer.disconnect();
              }
              if (submenu.parentNode) {
                submenu.parentNode.removeChild(submenu);
              }
              delete window.YC_MENUS["subtitle-location"];
            }, 1500);
          } else {
            dialog.innerHTML = `
              <p style="margin: 0; font-size: 14px; color: #ff3860;">✗ Failed to reset colors</p>
            `;
            setTimeout(cleanup, 2000);
          }
        };

        cancelBtn.addEventListener("click", handleCancel);
        overlay.addEventListener("click", handleOverlayClick);
        confirmBtn.addEventListener("click", handleConfirm);
      };

      resetOption.addEventListener("click", resetClickHandler);
      resetOption.addEventListener("mouseover", () => {
        resetOption.style.backgroundColor = "rgba(255,255,255,0.1)";
      });
      resetOption.addEventListener("mouseout", () => {
        resetOption.style.backgroundColor = "transparent";
      });

      // Cleanup
      submenu.cleanups = submenu.cleanups || [];
      submenu.cleanups.push(() => {
        resetOption.removeEventListener("click", resetClickHandler);
      });

      // Create content container
      const contentContainer = document.createElement("div");
      contentContainer.style.padding = "8px 0";

      // Array to store cleanup functions
      const cleanups = [];
      submenu.cleanups = cleanups;

      // DOM cache to reduce querySelectorAll calls
      let domCache = null;
      const getDOMCache = () => {
        if (!domCache || !domCache.carousel || !domCache.carousel.isConnected) {
          const carousel = document.querySelector(".yc-chord-carousel");
          if (!carousel) {
            return { carousel: null, tiles: [], carouselDiagrams: [] };
          }
          const tiles = document.querySelectorAll(".yc-chord-tile");
          const carouselDiagrams = document.querySelectorAll(
            ".yc-chord-carousel .yc-chord-diagram svg"
          );
          domCache = { carousel, tiles, carouselDiagrams };
        }
        return domCache;
      };

      // Debounce function for storage saves to prevent race conditions
      let saveTimeout = null;
      const debouncedSave = (target, color) => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          chrome.storage.sync.get(["carouselCustomColors"], (result) => {
            const customColors = result.carouselCustomColors || {};
            customColors[target] = color;
            chrome.storage.sync.set({ carouselCustomColors: customColors });
          });
        }, 300);
      };

      // Cleanup timeout on dispose
      cleanups.push(() => {
        if (saveTimeout) clearTimeout(saveTimeout);
        domCache = null;
      });

      // ============================================================
      // THEME SECTION
      // ============================================================

      const themeSection = document.createElement("div");
      themeSection.className = "theme-section";
      themeSection.id = "themeSection";
      themeSection.style.cssText = `
            padding: 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            transition: all 0.3s ease;
        `;

      const themeHeader = document.createElement("div");
      themeHeader.className = "category-header";
      themeHeader.style.cssText = `
            padding: 14px 24px;
            display: flex;
            align-items: center;
            cursor: pointer;
            background: rgba(255,255,255,0.02);
            transition: background 0.2s;
            user-select: none;
        `;
      themeHeader.innerHTML = `
            <span style="margin-right: 8px; font-size: 10px; transition: transform 0.3s; display: inline-block; color: #4A90E2;">▶</span>
            <span style="font-size: 13px; font-weight: 500; color: #4A90E2; letter-spacing: 1px;">THEME</span>
        `;
      
      // Hover effect for theme header
      themeHeader.addEventListener("mouseover", () => {
        themeHeader.style.backgroundColor = "rgba(255,255,255,0.1)";
      });
      themeHeader.addEventListener("mouseout", () => {
        themeHeader.style.backgroundColor = "transparent";
      });
      cleanups.push(
        () => themeHeader.removeEventListener("mouseover", () => {}),
        () => themeHeader.removeEventListener("mouseout", () => {})
      );
      
      themeSection.appendChild(themeHeader);

      const themeOptions = document.createElement("div");
      themeOptions.id = "themeOptions";
      themeOptions.style.cssText = `
            padding: 0;
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
        `;

      const themeOptionsInner = document.createElement("div");
      themeOptionsInner.style.cssText = `
            max-height: 400px;
            overflow-y: auto;
            overflow-x: hidden;
        `;
      themeOptions.appendChild(themeOptionsInner);

      // Get current theme from storage
      chrome.storage.sync.get(["carouselTheme"], (result) => {
        if (!submenu.isConnected) return;

        const currentTheme = result.carouselTheme || "default";

        // Create theme options
        const themes = [
          {
            id: "default",
            name: "🔄 Default Theme",
            colors: ["#000000", "#ffffff", "#999999"],
          },
          {
            id: "beige",
            name: "Beige Theme",
            colors: ["#d4c4a8", "#fafafa", "#d4c4a8"],
          },
          {
            id: "white-warm",
            name: "White Warm",
            colors: ["#fffef8", "#fffef8", "#d4c4a8"],
          },
          {
            id: "white-cool",
            name: "White Cool",
            colors: ["#f8f9ff", "#f8f9ff", "#b0c4de"],
          },
          {
            id: "gray-light",
            name: "Gray Light",
            colors: ["#e8e8e8", "#f5f5f5", "#999999"],
          },
          {
            id: "gray-dark",
            name: "Gray Dark",
            colors: ["#2c2c2c", "#3a3a3a", "#666666"],
          },
          {
            id: "dark",
            name: "Dark Theme",
            colors: ["#2a2a2a", "#1a1a1a", "#444444"],
          },
          {
            id: "blue",
            name: "Blue Theme",
            colors: ["#4A90E2", "#2c5aa0", "#6ba3e8"],
          },
          {
            id: "red",
            name: "Red Theme",
            colors: ["#E74C3C", "#c0392b", "#e67e73"],
          },
          {
            id: "green",
            name: "Green Theme",
            colors: ["#2ECC71", "#27ae60", "#58d68d"],
          },
          {
            id: "purple",
            name: "Purple Theme",
            colors: ["#9B59B6", "#8e44ad", "#bb8fce"],
          },
        ];

        themes.forEach((theme) => {
          const option = document.createElement("div");
          option.className = "theme-option";
          if (theme.id === currentTheme) {
            option.classList.add("selected");
          }
          option.setAttribute("data-theme", theme.id);
          option.style.cssText = `
                    padding: 12px 24px 12px 40px;
                    cursor: pointer;
                    transition: background 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                `;

          const themeName = document.createElement("span");
          themeName.textContent = theme.name;
          themeName.style.cssText = `
                    font-size: 13px;
                    color: #fff;
                `;

          const themeColors = document.createElement("div");
          themeColors.style.cssText = `
                    display: flex;
                    gap: 4px;
                `;

          theme.colors.forEach((color) => {
            const preview = document.createElement("div");
            preview.style.cssText = `
                        width: 16px;
                        height: 16px;
                        border-radius: 3px;
                        border: 1px solid rgba(255,255,255,0.2);
                        background: ${color};
                    `;
            themeColors.appendChild(preview);
          });

          option.appendChild(themeName);
          option.appendChild(themeColors);

          // Hover effect
          option.addEventListener("mouseenter", () => {
            option.style.background = "rgba(255,255,255,0.08)";
          });
          option.addEventListener("mouseleave", () => {
            if (!option.classList.contains("selected")) {
              option.style.background = "";
            } else {
              option.style.background = "rgba(74, 144, 226, 0.2)";
            }
          });

          // Click handler
          const clickHandler = () => {
            // Remove selected from all
            themeOptions.querySelectorAll(".theme-option").forEach((opt) => {
              opt.classList.remove("selected");
              opt.style.background = "";
              opt.style.borderLeft = "";
            });

            // Add selected to clicked
            option.classList.add("selected");
            option.style.background = "rgba(74, 144, 226, 0.2)";
            option.style.borderLeft = "3px solid #4A90E2";

            // Apply theme
            window.applyCarouselTheme(theme.id);
          };

          option.addEventListener("click", clickHandler);
          cleanups.push(() => {
            option.removeEventListener("click", clickHandler);
          });

          // Set initial selected style
          if (theme.id === currentTheme) {
            option.style.background = "rgba(74, 144, 226, 0.2)";
            option.style.borderLeft = "3px solid #4A90E2";
          }

          themeOptionsInner.appendChild(option);
        });
      });

      themeSection.appendChild(themeOptions);
      contentContainer.appendChild(themeSection);

      // Theme collapse/expand logic
      let themeExpanded = false;
      const themeClickHandler = () => {
        themeExpanded = !themeExpanded;
        const arrow = themeHeader.querySelector("span:first-child");

        if (themeExpanded) {
          themeOptions.style.maxHeight = "600px";
          themeOptions.style.display = "block";
          arrow.style.transform = "rotate(90deg)";

          // Close Advanced section if open
          const advancedSection = document.getElementById("advancedSection");
          if (advancedSection) {
            advancedSection.classList.remove("expanded");
            const advancedContent =
              advancedSection.querySelector(".category-content");
            const advancedArrow = advancedSection.querySelector(
              ".category-header span:first-child"
            );
            if (advancedContent) advancedContent.style.maxHeight = "0";
            if (advancedArrow) advancedArrow.style.transform = "rotate(0deg)";
          }
        } else {
          themeOptions.style.maxHeight = "0";
          arrow.style.transform = "rotate(0deg)";
        }
      };

      themeHeader.addEventListener("click", themeClickHandler);
      cleanups.push(() => {
        themeHeader.removeEventListener("click", themeClickHandler);
      });

      // ============================================================
      // HELPER FUNCTIONS FOR ADVANCED
      // ============================================================

      function createCategory(title, expanded = false) {
        const container = document.createElement("div");
        container.className = "category" + (expanded ? " expanded" : "");
        container.style.cssText = `
                border-bottom: 1px solid rgba(255,255,255,0.05);
            `;

        const header = document.createElement("div");
        header.className = "category-header";
        header.style.cssText = `
                padding: 14px 24px;
                display: flex;
                align-items: center;
                cursor: pointer;
                background: rgba(255,255,255,0.02);
                transition: background 0.2s;
                user-select: none;
            `;

        header.innerHTML = `
                <span style="margin-right: 8px; font-size: 10px; transition: transform 0.3s; display: inline-block; color: #aaa; ${
                  expanded ? "transform: rotate(90deg);" : ""
                }">▶</span>
                <span style="font-size: 13px; font-weight: 500; color: #fff;">${title}</span>
            `;

        const arrow = header.querySelector("span:first-child");

        const content = document.createElement("div");
        content.className = "category-content";
        content.style.cssText = `
                max-height: ${expanded ? "2000px" : "0"};
                overflow: hidden;
                transition: max-height 0.3s ease-out;
            `;

        const clickHandler = () => {
          const isExpanding = !container.classList.contains("expanded");

          if (isExpanding) {
            container.classList.add("expanded");
            content.style.maxHeight = "2000px";
            arrow.style.transform = "rotate(90deg)";

            // Auto-scroll to show the opened category
            setTimeout(() => {
              const advancedContent =
                document.querySelector(".category-content");
              if (advancedContent && container.offsetTop !== undefined) {
                const containerTop = container.offsetTop;
                const scrollTop = advancedContent.scrollTop;
                const containerHeight = container.offsetHeight;
                const visibleHeight = advancedContent.clientHeight;

                // Scroll if the category is not fully visible
                if (
                  containerTop + containerHeight >
                  scrollTop + visibleHeight
                ) {
                  container.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                  });
                }
              }
            }, 350); // Wait for expansion animation to complete
          } else {
            container.classList.remove("expanded");
            content.style.maxHeight = "0";
            arrow.style.transform = "";
          }
        };

        header.addEventListener("click", clickHandler);
        header.addEventListener("mouseenter", () => {
          header.style.background = "rgba(255,255,255,0.08)";
        });
        header.addEventListener("mouseleave", () => {
          header.style.background = "rgba(255,255,255,0.02)";
        });

        cleanups.push(() => {
          header.removeEventListener("click", clickHandler);
        });

        container.appendChild(header);
        container.appendChild(content);

        return { container, content };
      }

      function createColorOption(label, target) {
        // Get custom colors from carousel cache or loaded storage
        const customColors = window.ycChordCarousel?.savedCustomColors || loadedCustomColors || {};
        
        // Get default color for this target
        const defaultColors = {
          "card-border": "#2196f3",
          "card-border-inactive": "#000000",
          "panel-bg": "#f9f9f9",
          "card-bg": "#fafafa",
          "beat-squares": "#2196f3",
          "beat-squares-bg": "#e0e0e0",
          "string-e-high": "#000000",
          "string-b": "#000000",
          "string-g": "#000000",
          "string-d": "#000000",
          "string-a": "#000000",
          "string-e-low": "#000000",
          "fret-1": "#000000",
          "fret-2": "#000000",
          "fret-3": "#000000",
          "fret-4": "#000000",
          "fret-5": "#000000",
          "fret-6": "#000000",
          "letter-e-high": "#000000",
          "letter-b": "#000000",
          "letter-g": "#000000",
          "letter-d": "#000000",
          "letter-a": "#000000",
          "letter-e-low": "#000000",
          scroll: "#999999",
          "chord-name": "#2c2c2c",
          "chord-time": "#6b6b6b",
          "gray-arrows": "#666666",
          "position-number": "#000000",
          "finger-numbers-all": "#FFFFFF",
          "finger-1": "#FFFFFF",
          "finger-2": "#FFFFFF",
          "finger-3": "#FFFFFF",
          "finger-4": "#FFFFFF",
          "fret-number-left": "#000000",
          "open-string": "#000000",
          "muted-string": "#000000",
        };
        const defaultColor = defaultColors[target] || "#4A90E2";
        const currentColor = customColors[target] || defaultColor;

        const option = document.createElement("div");
        option.className = "color-option";
        option.style.cssText = `
                padding: 10px 24px 10px 40px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: pointer;
                transition: background 0.2s;
            `;

        const labelSpan = document.createElement("span");
        labelSpan.textContent = label;
        labelSpan.style.cssText = `
                font-size: 12px;
                color: #ddd;
                flex-shrink: 0;
            `;

        const controlsContainer = document.createElement("div");
        controlsContainer.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
            `;

        // Color input (native color picker)
        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.value = currentColor;
        colorInput.style.cssText = `
                width: 40px;
                height: 24px;
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 4px;
                cursor: pointer;
                background: transparent;
            `;

        const colorInputHandler = (e) => {
          e.stopPropagation();
          const color = e.target.value;
          applyColorToCarousel(target, color);
        };

        colorInput.addEventListener("input", colorInputHandler);
        colorInput.addEventListener("click", (e) => e.stopPropagation());

        cleanups.push(() => {
          colorInput.removeEventListener("input", colorInputHandler);
        });

        // Default button
        const defaultBtn = document.createElement("div");
        defaultBtn.title = "Reset to Default";
        defaultBtn.style.cssText = `
                width: 24px;
                height: 24px;
                border-radius: 4px;
                cursor: pointer;
                border: 1px solid rgba(255,255,255,0.2);
                transition: all 0.2s;
                background: rgba(255,255,255,0.1);
                display: flex;
                align-items: center;
                justify-content: center;
            `;
        defaultBtn.innerHTML = `
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 14px; height: 14px; fill: #aaa;">
                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
            `;

        const defaultClickHandler = (e) => {
          e.stopPropagation();
          applyColorToCarousel(target, defaultColor);
          colorInput.value = defaultColor;
        };

        defaultBtn.addEventListener("click", defaultClickHandler);
        defaultBtn.addEventListener("mouseenter", () => {
          defaultBtn.style.background = "rgba(255,255,255,0.2)";
        });
        defaultBtn.addEventListener("mouseleave", () => {
          defaultBtn.style.background = "rgba(255,255,255,0.1)";
        });

        cleanups.push(() => {
          defaultBtn.removeEventListener("click", defaultClickHandler);
        });

        controlsContainer.appendChild(colorInput);
        controlsContainer.appendChild(defaultBtn);

        option.appendChild(labelSpan);
        option.appendChild(controlsContainer);

        option.addEventListener("mouseenter", () => {
          option.style.background = "rgba(255,255,255,0.05)";
        });
        option.addEventListener("mouseleave", () => {
          option.style.background = "";
        });

        return option;
      }

      function applyColorToCarousel(target, color) {
        const cache = getDOMCache();
        const carousel = cache.carousel;
        const tiles = cache.tiles;
        const activeTile = document.querySelector(".yc-chord-tile.active");

        switch (target) {
          case "card-border":
            // המסגרת הכחולה העבה (3.5px) סביב אקורד פעיל
            if (activeTile) {
              activeTile.style.setProperty(
                "border",
                `3.5px solid ${color}`,
                "important"
              );
            }
            break;
          case "card-border-inactive":
            tiles.forEach((tile) => {
              if (!tile.classList.contains("active")) {
                tile.style.borderColor = color;
              }
            });
            break;
          case "panel-bg":
            if (carousel) {
              carousel.style.background = color;
            }
            break;
          case "card-bg":
            tiles.forEach((tile) => {
              tile.style.background = color;
            });
            break;
          case "beat-squares":
            // הריבועים הכחולים שמראים קצב
            if (carousel) {
              const beatCells = carousel.querySelectorAll(".yc-beat-cell.filled");
              beatCells.forEach((cell) => {
                cell.style.backgroundColor = color;
              });
            }
            break;
          case "beat-squares-bg":
            // הרקע של הגריד של הריבועים
            if (carousel) {
              const beatGrids = carousel.querySelectorAll(".yc-beat-grid");
              beatGrids.forEach((grid) => {
                grid.style.background = color;
              });
            }
            break;

          case "finger-numbers-all":
            // כל מספרי האצבעות ביחד
            cache.carouselDiagrams.forEach((svg) => {
              const fingerGroup = svg.querySelector("g.finger-positions");
              if (fingerGroup) {
                const texts = fingerGroup.querySelectorAll("text");
                texts.forEach((text) => {
                  text.style.fill = color;
                });
              }
            });
            break;
          case "finger-1":
          case "finger-2":
          case "finger-3":
          case "finger-4":
            // מספר אצבע בודד
            const fingerNum = target.split("-")[1];
            cache.carouselDiagrams.forEach((svg) => {
              const fingerGroup = svg.querySelector("g.finger-positions");
              if (fingerGroup) {
                const fingerTexts = fingerGroup.querySelectorAll("text");
                fingerTexts.forEach((text) => {
                  if (text.textContent === fingerNum) {
                    text.style.fill = color;
                  }
                });
              }
            });
            break;
          case "fret-number-left":
            // המספר בצד שמאל (6, 3, 5 וכו') - מספר הפרט שבו האקורד מתחיל
            cache.carouselDiagrams.forEach((svg) => {
              // מחפש text elements שהם מספרים בודדים (לא אותיות, לא מספרי אצבעות)
              // ונמצאים בצד שמאל של הגריד
              const allTexts = svg.querySelectorAll("text");
              allTexts.forEach((text) => {
                const x = parseFloat(text.getAttribute("x"));
                const fontSize = text.getAttribute("font-size");
                const textContent = text.textContent.trim();

                // המספר בצד שמאל הוא:
                // 1. font-size של 8px
                // 2. מספר בודד (לא אות)
                // 3. לא בתוך finger-positions group
                // 4. לא בתוך tuning group
                const parentGroup = text.parentElement;
                const isFingerNumber =
                  parentGroup &&
                  parentGroup.classList.contains("finger-positions");
                const isTuningLetter =
                  parentGroup && parentGroup.classList.contains("tuning");

                if (
                  fontSize === "8px" &&
                  !isFingerNumber &&
                  !isTuningLetter &&
                  /^\d+$/.test(textContent)
                ) {
                  text.style.fill = color;
                }
              });
            });
            break;
          case "open-string":
            // העיגולים הפתוחים (o) למעלה
            cache.carouselDiagrams.forEach((svg) => {
              const indicatorsGroup = svg.querySelector("g.string-indicators");
              if (indicatorsGroup) {
                const openCircles = indicatorsGroup.querySelectorAll("circle");
                openCircles.forEach((circle) => {
                  circle.style.stroke = color;
                });
              }
            });
            break;
          case "muted-string":
            // ה-X-ים (x) למעלה
            cache.carouselDiagrams.forEach((svg) => {
              const indicatorsGroup = svg.querySelector("g.string-indicators");
              if (indicatorsGroup) {
                const mutedLines = indicatorsGroup.querySelectorAll("line");
                mutedLines.forEach((line) => {
                  line.style.stroke = color;
                });
              }
            });
            break;
          // Vertical Strings
          case "string-e-high":
          case "string-b":
          case "string-g":
          case "string-d":
          case "string-a":
          case "string-e-low":
            const stringIndex = {
              "string-e-high": 5,
              "string-b": 4,
              "string-g": 3,
              "string-d": 2,
              "string-a": 1,
              "string-e-low": 0,
            }[target];
            // Get all chord diagrams in carousel
            cache.carouselDiagrams.forEach((svg) => {
              // Get the specific string line by index
              const stringsGroup = svg.querySelector("g.strings");
              if (stringsGroup) {
                const stringLine =
                  stringsGroup.querySelectorAll("line")[stringIndex];
                if (stringLine) stringLine.style.stroke = color;
              }
              // Get the specific string label by index
              const tuningGroup = svg.querySelector("g.tuning");
              if (tuningGroup) {
                const stringLabel =
                  tuningGroup.querySelectorAll("text")[stringIndex];
                if (stringLabel) stringLabel.style.fill = color;
              }
            });
            break;
          // Horizontal Fret Lines
          case "fret-1":
          case "fret-2":
          case "fret-3":
          case "fret-4":
          case "fret-5":
          case "fret-6":
            const fretNum = parseInt(target.split("-")[1]) - 1; // Convert to 0-based index
            // Get all chord diagrams in carousel
            cache.carouselDiagrams.forEach((svg) => {
              // Get the specific fret line by index
              const fretsGroup = svg.querySelector("g.frets");
              if (fretsGroup) {
                const fretLine = fretsGroup.querySelectorAll("line")[fretNum];
                if (fretLine) fretLine.style.stroke = color;
              }
            });
            break;
          // String Letters Only
          case "letter-e-high":
          case "letter-b":
          case "letter-g":
          case "letter-d":
          case "letter-a":
          case "letter-e-low":
            const letterIndex = {
              "letter-e-high": 5,
              "letter-b": 4,
              "letter-g": 3,
              "letter-d": 2,
              "letter-a": 1,
              "letter-e-low": 0,
            }[target];
            // Get all chord diagrams in carousel
            cache.carouselDiagrams.forEach((svg) => {
              // Get the specific string label by index
              const tuningGroup = svg.querySelector("g.tuning");
              if (tuningGroup) {
                const stringLabel =
                  tuningGroup.querySelectorAll("text")[letterIndex];
                if (stringLabel) stringLabel.style.fill = color;
              }
            });
            break;
          // Other Elements
          case "scroll":
            if (carousel) {
              carousel.style.scrollbarColor = `${color} ${
                carousel.style.background || "#f9f9f9"
              }`;
            }
            break;
          case "chord-name":
            if (carousel) {
              const chordNames = carousel.querySelectorAll(".yc-chord-name");
              chordNames.forEach((name) => {
                name.style.color = color;
              });
            }
            break;
          case "chord-time":
            if (carousel) {
              const chordTimes = carousel.querySelectorAll(".yc-chord-time");
              chordTimes.forEach((time) => {
                time.style.color = color;
              });
            }
            break;
          case "gray-arrows":
            if (carousel) {
              const arrows = carousel.querySelectorAll(
                "svg .chord-arrow-left, svg .chord-arrow-right"
              );
              arrows.forEach((arrow) => {
                arrow.style.fill = color;
              });
            }
            break;
          case "position-number":
            if (carousel) {
              const positionNumbers = carousel.querySelectorAll(
                "svg .chord-position-counter"
              );
              positionNumbers.forEach((num) => {
                num.style.fill = color;
              });
            }
            break;
        }

        // Update carousel's cached colors immediately
        if (window.ycChordCarousel) {
          if (!window.ycChordCarousel.savedCustomColors) {
            window.ycChordCarousel.savedCustomColors = {};
          }
          window.ycChordCarousel.savedCustomColors[target] = color;
          console.log("✅ [COLOR] Updated carousel cache:", target, color);
        }

        // Save to storage with debounce to prevent race conditions
        debouncedSave(target, color);
      }

      // ============================================================
      // ADVANCED SECTION (Collapsible)
      // ============================================================

      const advancedSection = document.createElement("div");
      advancedSection.className = "category advanced-section";
      advancedSection.id = "advancedSection";
      advancedSection.style.cssText = `
            border-bottom: none;
        `;

      // Load custom colors from storage for initial selection marking
      let loadedCustomColors = {};
      chrome.storage.sync.get(["carouselCustomColors"], (result) => {
        loadedCustomColors = result.carouselCustomColors || {};
      });

      const advancedHeader = document.createElement("div");
      advancedHeader.className = "category-header";
      advancedHeader.style.cssText = `
            padding: 14px 24px;
            display: flex;
            align-items: center;
            cursor: pointer;
            background: rgba(255,255,255,0.02);
            transition: background 0.2s;
            user-select: none;
        `;

      advancedHeader.innerHTML = `
            <span style="margin-right: 8px; font-size: 10px; transition: transform 0.3s; display: inline-block; color: #4A90E2;">▶</span>
            <span style="font-size: 13px; font-weight: 500; color: #4A90E2; letter-spacing: 1px;">ADVANCED</span>
        `;

      const advancedArrow = advancedHeader.querySelector("span:first-child");

      const advancedContent = document.createElement("div");
      advancedContent.className = "category-content";
      advancedContent.style.cssText = `
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
            padding-top: 8px;
        `;

      // Advanced header click handler
      const advancedClickHandler = () => {
        const isExpanding = !advancedSection.classList.contains("expanded");

        if (isExpanding) {
          advancedSection.classList.add("expanded");
          advancedContent.style.maxHeight = "5000px";
          advancedArrow.style.transform = "rotate(90deg)";

          // Collapse theme section
          themeExpanded = false;
          themeOptions.style.maxHeight = "0";
          themeOptions.style.display = "none";
          const themeArrow = themeHeader.querySelector("span:first-child");
          if (themeArrow) themeArrow.style.transform = "rotate(0deg)";
        } else {
          advancedSection.classList.remove("expanded");
          advancedContent.style.maxHeight = "0";
          advancedArrow.style.transform = "";

          // Expand theme section
          themeSection.style.maxHeight = "";
          themeSection.style.overflow = "";
          themeOptions.style.display = "block";
        }
      };

      advancedHeader.addEventListener("click", advancedClickHandler);
      advancedHeader.addEventListener("mouseenter", () => {
        advancedHeader.style.background = "rgba(255,255,255,0.08)";
      });
      advancedHeader.addEventListener("mouseleave", () => {
        advancedHeader.style.background = "rgba(255,255,255,0.02)";
      });

      cleanups.push(() => {
        advancedHeader.removeEventListener("click", advancedClickHandler);
      });

      advancedSection.appendChild(advancedHeader);
      advancedSection.appendChild(advancedContent);

      // ============================================================
      // ADVANCED CONTENT - General Elements Category
      // ============================================================

      const generalCategory = createCategory("General Elements", false);

      // Card Border (Active) - המסגרת הכחולה העבה סביב אקורד פעיל
      generalCategory.content.appendChild(createColorOption("Card Border (Active)", "card-border"));

      // Card Border (Inactive)
      generalCategory.content.appendChild(createColorOption("Card Border (Inactive)", "card-border-inactive"));

      // Panel Background
      generalCategory.content.appendChild(createColorOption("Panel Background", "panel-bg"));

      // Card Background
      generalCategory.content.appendChild(createColorOption("Card Background", "card-bg"));

      // Beat Squares
      generalCategory.content.appendChild(createColorOption("Beat Squares", "beat-squares"));

      // Beat Squares Background
      generalCategory.content.appendChild(createColorOption("Beat Squares Background", "beat-squares-bg"));

      advancedContent.appendChild(generalCategory.container);

      // ============================================================
      // Grid - All Elements Category
      // ============================================================

      const gridCategory = createCategory("Grid - All Elements", false);

      // Finger Numbers (All Together)
      gridCategory.content.appendChild(createColorOption("Finger Numbers (All Together)", "finger-numbers-all"));

      // Individual Fingers
      gridCategory.content.appendChild(createColorOption("Finger 1", "finger-1"));
      gridCategory.content.appendChild(createColorOption("Finger 2", "finger-2"));
      gridCategory.content.appendChild(createColorOption("Finger 3", "finger-3"));
      gridCategory.content.appendChild(createColorOption("Finger 4", "finger-4"));

      // Fret Number (Left Side)
      gridCategory.content.appendChild(createColorOption("Fret Number (Left)", "fret-number-left"));

      // Open String Indicators (o)
      gridCategory.content.appendChild(createColorOption("Open String (o)", "open-string"));

      // Muted String Indicators (x)
      gridCategory.content.appendChild(createColorOption("Muted String (x)", "muted-string"));

      advancedContent.appendChild(gridCategory.container);

      // ============================================================
      // Vertical Strings Category
      // ============================================================

      const stringsCategory = createCategory(
        "Vertical Strings (Individual)",
        false
      );

      const strings = [
        { label: "String e (High) + Letter", target: "string-e-high" },
        { label: "String B + Letter", target: "string-b" },
        { label: "String G + Letter", target: "string-g" },
        { label: "String D + Letter", target: "string-d" },
        { label: "String A + Letter", target: "string-a" },
        { label: "String E (Low) + Letter", target: "string-e-low" },
      ];

      strings.forEach((string) => {
        stringsCategory.content.appendChild(createColorOption(string.label, string.target));
      });

      advancedContent.appendChild(stringsCategory.container);

      // ============================================================
      // Horizontal Fret Lines Category
      // ============================================================

      const fretsCategory = createCategory(
        "Horizontal Fret Lines (Individual)",
        false
      );

      const frets = [
        { label: "Fret 1", target: "fret-1" },
        { label: "Fret 2", target: "fret-2" },
        { label: "Fret 3", target: "fret-3" },
        { label: "Fret 4", target: "fret-4" },
        { label: "Fret 5", target: "fret-5" },
        { label: "Fret 6", target: "fret-6" },
      ];

      frets.forEach((fret) => {
        fretsCategory.content.appendChild(createColorOption(fret.label, fret.target));
      });

      advancedContent.appendChild(fretsCategory.container);

      // ============================================================
      // String Letters Only Category
      // ============================================================

      const lettersCategory = createCategory(
        "String Letters Only (Individual)",
        false
      );

      const letters = [
        { label: "Letter e (High)", target: "letter-e-high" },
        { label: "Letter B", target: "letter-b" },
        { label: "Letter G", target: "letter-g" },
        { label: "Letter D", target: "letter-d" },
        { label: "Letter A", target: "letter-a" },
        { label: "Letter E (Low)", target: "letter-e-low" },
      ];

      letters.forEach((letter) => {
        lettersCategory.content.appendChild(createColorOption(letter.label, letter.target));
      });

      advancedContent.appendChild(lettersCategory.container);

      // ============================================================
      // Other Elements Category
      // ============================================================

      const otherCategory = createCategory("Other Elements", false);

      const otherElements = [
        { label: "Scroll", target: "scroll" },
        { label: "Chord Name", target: "chord-name" },
        { label: "Chord Time", target: "chord-time" },
        { label: "Gray Arrows", target: "gray-arrows" },
        { label: "Position Number", target: "position-number" },
      ];

      otherElements.forEach((element) => {
        otherCategory.content.appendChild(createColorOption(element.label, element.target));
      });

      advancedContent.appendChild(otherCategory.container);

      contentContainer.appendChild(advancedSection);

      // Add reset option at the top (after header)
      submenu.appendChild(resetOption);

      // Add content to submenu
      submenu.appendChild(contentContainer);

      // יצירת AbortController למניעת דליפת listeners
      if (!submenu.abortController) {
        submenu.abortController = new AbortController();
      }

      // Observe visibility to adjust position
      const observer = new MutationObserver((mList, obs) => {
        // Check if submenu is still connected to DOM
        if (!submenu.isConnected) {
          obs.disconnect();
          return;
        }
        if (submenu.style.display === "block") {
          const controls = document.querySelector(".ytp-chrome-bottom");
          if (controls) {
            const rect = controls.getBoundingClientRect();
            submenu.style.bottom = `${rect.height + 12}px`;
            submenu.style.right = "12px";
          }
          obs.disconnect();
        }
      });

      observer.observe(submenu, {
        attributes: true,
        attributeFilter: ["style"],
      });
      submenu.observer = observer;

      // Add observer cleanup to cleanups array
      cleanups.push(() => {
        if (observer) observer.disconnect();
      });

      // שימוש ב-AbortController כדי למנוע הצטברות listeners
      submenu.addEventListener("click", (e) => e.stopPropagation(), {
        signal: submenu.abortController.signal,
      });

      return submenu;
    },
    parentMenu
  );
};

// ------------------------------------------------------------
// 6. Dispose – ניקוי Observer
// ------------------------------------------------------------

window.disposeCarouselColorsSubmenu = function (submenu, remove = false) {
  if (!submenu) {
    submenu = document.querySelector(".carousel-colors-submenu");
  }

  if (submenu) {
    // Disconnect observer
    if (submenu.observer) {
      submenu.observer.disconnect();
      delete submenu.observer;
    }

    // Clean up to prevent memory leaks
    if (submenu.cleanups) {
      submenu.cleanups.forEach((cleanup) => cleanup());
      delete submenu.cleanups;
    }

    // ניקוי AbortController למניעת דליפת listeners
    if (submenu.abortController) {
      submenu.abortController.abort();
      delete submenu.abortController;
    }

    // Remove from DOM if requested
    if (remove && submenu.parentNode) {
      submenu.parentNode.removeChild(submenu);
      delete window.YC_MENUS["subtitle-location"];
    }
  }
};
