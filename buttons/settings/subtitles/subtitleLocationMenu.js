// subtitleLocationMenu.js - Subtitle Location Menu for customizing subtitle vertical position

// Global state for subtitle location
if (!window.subtitleLocationState) {
  window.subtitleLocationState = {
    userSelectedValue: 10, // User's chosen value (default 10%)
    currentValue: 10, // Currently applied value (in percentage)
    horizontalOffset: 0, // Drag offset from the horizontal center (percentage)
    isLocked: false, // Whether locked by Timeline Always Visible
  };
} else if (window.subtitleLocationState.horizontalOffset === undefined) {
  window.subtitleLocationState.horizontalOffset = 0;
}

// Global handlers object for external access
if (!window.subtitleLocationHandlers) {
  window.subtitleLocationHandlers = {};
}

/**
 * Initializes subtitle location preferences from storage
 */
export async function initializeSubtitleLocationPreferences() {
  console.log('[SubtitleLocation] 🔍 DEBUG: initializeSubtitleLocationPreferences() started');
  console.log('[SubtitleLocation] 🔍 State BEFORE loading:', window.subtitleLocationState);
  
  try {
    const storageArea = chrome.storage?.sync;
    if (!storageArea) {
      console.warn(
        "[SubtitleLocation] chrome.storage.sync not available. Using default value."
      );
      return;
    }

    const result = await storageArea.get(["subtitleLocation", "subtitleHorizontalOffset"]);
    console.log('[SubtitleLocation] 🔍 Storage result:', result);

    const savedHorizontalOffset = Number(result.subtitleHorizontalOffset);
    const horizontalOffset = Number.isFinite(savedHorizontalOffset)
      ? Math.max(-45, Math.min(45, savedHorizontalOffset))
      : 0;
    window.subtitleLocationState.horizontalOffset = horizontalOffset;

    if (result.subtitleLocation !== undefined) {
      window.subtitleLocationState.userSelectedValue = result.subtitleLocation;
      window.subtitleLocationState.currentValue = result.subtitleLocation;
      console.log(
        `[SubtitleLocation] ✅ Loaded saved value: ${result.subtitleLocation}%`
      );
      console.log('[SubtitleLocation] 🔍 State AFTER loading:', window.subtitleLocationState);
      
      // Apply the loaded value to the subtitles
      applySubtitleLocation(result.subtitleLocation, true);
      applySubtitleHorizontalOffset(horizontalOffset, true);
      console.log(`[SubtitleLocation] 🔍 Applied loaded value to CSS: ${result.subtitleLocation}%`);
    } else {
      // Set default value
      window.subtitleLocationState.userSelectedValue = 10;
      window.subtitleLocationState.currentValue = 10;
      console.log("[SubtitleLocation] ⚠️ No saved value - using default: 10%");
      console.log('[SubtitleLocation] 🔍 State AFTER default:', window.subtitleLocationState);
      
      // Apply the default value to the subtitles
      applySubtitleLocation(10, true);
      applySubtitleHorizontalOffset(horizontalOffset, true);
      console.log('[SubtitleLocation] 🔍 Applied default value to CSS: 10%');
    }
  } catch (error) {
    console.error("[SubtitleLocation] ❌ Error initializing preferences:", error);
    // Use default values on error
    window.subtitleLocationState.userSelectedValue = 10;
    window.subtitleLocationState.currentValue = 10;
  }
  
  console.log('[SubtitleLocation] 🔍 DEBUG: initializeSubtitleLocationPreferences() completed');
}

/**
 * Creates the "Subtitle Location" menu item in the Subtitle Options menu
 * @param {HTMLElement} parentMenu - The parent menu element
 * @param {number} currentValue - The current subtitle location value
 * @param {boolean} isLocked - Whether the location is locked by Timeline Always Visible
 * @returns {HTMLElement} The menu item element
 */
export function createSubtitleLocationMenuItem(
  parentMenu,
  currentValue,
  isLocked
) {
  const menuItem = document.createElement("button");
  menuItem.className = "subtitle-location-menu-item";
  menuItem.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    color: #fff;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.2s;
    font-family: "YouTube Noto", Roboto, Arial, sans-serif;
  `;

  // Add text
  const textSpan = document.createElement("span");
  textSpan.textContent = "Subtitle Location";
  menuItem.appendChild(textSpan);

  // Add arrow
  const arrowSpan = document.createElement("span");
  arrowSpan.textContent = "▶";
  arrowSpan.style.cssText = "margin-left: auto; font-size: 10px;";
  menuItem.appendChild(arrowSpan);

  // Apply disabled state if locked
  if (isLocked) {
    menuItem.classList.add("disabled");
    menuItem.style.opacity = "0.5";
    menuItem.style.cursor = "not-allowed";
    menuItem.style.pointerEvents = "none";
  } else {
    // Add hover effect
    menuItem.addEventListener("mouseenter", () => {
      menuItem.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
    });
    menuItem.addEventListener("mouseleave", () => {
      menuItem.style.backgroundColor = "transparent";
    });

    // Add click handler
    menuItem.addEventListener("click", () => {
      openSubtitleLocationSubmenu(parentMenu, currentValue);
    });
  }

  return menuItem;
}

/**
 * Creates the subtitle location grid submenu
 * @param {HTMLElement} parentMenu - The parent menu element
 * @param {number} currentValue - The current subtitle location value
 * @returns {HTMLElement} The submenu element
 */
export function createSubtitleLocationSubmenu(parentMenu, currentValue) {
  // Create submenu container
  const submenu = document.createElement("div");
  submenu.className = "settings-menu subtitle-location-submenu";
  submenu.style.cssText = `
    position: absolute;
    background: rgba(28, 28, 28, 0.9);
    right: 12px;
    border-radius: 8px;
    padding: 0;
    z-index: 2000;
    display: none;
    width: 300px;
    font-family: Roboto, Arial, sans-serif;
    color: #fff;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
  `;

  // Add header with back button (matching other submenus)
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
  backButton.addEventListener("click", () => {
    submenu.style.display = "none";
    parentMenu.style.display = "block";
  });

  const title = document.createElement("span");
  title.textContent = "Subtitle Location";
  title.style.cssText = `
    color: #fff;
  `;

  header.appendChild(backButton);
  header.appendChild(title);
  submenu.appendChild(header);

  // Create grid container
  const gridContainer = document.createElement("div");
  gridContainer.style.cssText = `
    padding: 12px;
  `;

  const grid = document.createElement("div");
  grid.className = "subtitle-location-grid";
  grid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    max-height: 400px;
    overflow-y: auto;
    overflow-x: hidden;
  `;

  // Generate percentage values: 0%, 5%, 6%, 7%, 8%, 9%, 10%, 15%, 20%, 25%, 30%, 35%
  const values = [0, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 35];
  
  values.forEach((value) => {
    const valueButton = document.createElement("button");
    valueButton.className = "subtitle-location-value";
    valueButton.textContent = value + "%";
    valueButton.style.cssText = `
      padding: 8px 12px;
      text-align: center;
      cursor: pointer;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      background: transparent;
      color: #fff;
      font-size: 12px;
      transition: all 0.2s;
    `;

    // Mark current value
    if (value === currentValue) {
      valueButton.classList.add("selected");
      valueButton.textContent = value + "% ✓";
      valueButton.style.color = "#3ea6ff";
      valueButton.style.borderColor = "#3ea6ff";
      valueButton.style.background = "transparent";
    }

    // Add hover effect
    valueButton.addEventListener("mouseenter", () => {
      if (value !== currentValue) {
        valueButton.style.background = "rgba(255, 255, 255, 0.1)";
      }
    });
    valueButton.addEventListener("mouseleave", () => {
      if (value !== currentValue) {
        valueButton.style.background = "transparent";
      }
    });

    // Add click handler
    valueButton.addEventListener("click", () => {
      // Apply the new value
      applySubtitleLocation(value);

      // Update the UI to reflect the new selection
      // Remove 'selected' class from all buttons
      const allButtons = grid.querySelectorAll(".subtitle-location-value");
      allButtons.forEach((btn) => {
        btn.classList.remove("selected");
        btn.style.color = "#fff";
        btn.style.borderColor = "rgba(255, 255, 255, 0.2)";
        btn.style.background = "transparent";
        // Remove the checkmark
        const text = btn.textContent.replace(" ✓", "");
        btn.textContent = text;
      });

      // Add 'selected' class to clicked button
      valueButton.classList.add("selected");
      valueButton.textContent = value + "% ✓";
      valueButton.style.color = "#3ea6ff";
      valueButton.style.borderColor = "#3ea6ff";
      valueButton.style.background = "transparent";

      // Keep the menu open - don't close it
      // Note: state is updated in applySubtitleLocation()
    });

    grid.appendChild(valueButton);
  });

  gridContainer.appendChild(grid);
  submenu.appendChild(gridContainer);

  // Prevent menu closing when clicking inside
  submenu.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  return submenu;
}

/**
 * Applies the selected subtitle location value
 * @param {number} value - The subtitle location value (0-100 percentage)
 * @param {boolean} isSystemChange - True if this is a system change (lock/unlock), false if user selection
 */
export function applySubtitleLocation(value, isSystemChange = false) {
  applySubtitlePosition({ bottom: value }, isSystemChange);
}

/**
 * Applies and persists a horizontal drag offset for the subtitle container.
 * The value is relative to the player's horizontal center: 0 is centered,
 * negative values move left, and positive values move right.
 */
export function applySubtitleHorizontalOffset(value, isSystemChange = false) {
  applySubtitlePosition({ horizontalOffset: value }, isSystemChange);
}

/**
 * Applies subtitle position as one atomic update. This is used by the drag
 * handler so the vertical and horizontal values are saved together on release.
 */
export function applySubtitlePosition(position = {}, isSystemChange = false) {
  const currentState = window.subtitleLocationState;
  const rawBottom = position.bottom ?? currentState.currentValue ?? 10;
  const rawHorizontal =
    position.horizontalOffset ?? currentState.horizontalOffset ?? 0;
  const bottom = Number.isFinite(Number(rawBottom))
    ? Math.max(0, Math.min(100, Number(rawBottom)))
    : 10;
  const horizontalOffset = Number.isFinite(Number(rawHorizontal))
    ? Math.max(-45, Math.min(45, Number(rawHorizontal)))
    : 0;

  currentState.currentValue = bottom;
  currentState.horizontalOffset = horizontalOffset;

  if (!isSystemChange && !currentState.isLocked) {
    currentState.userSelectedValue = bottom;
    try {
      if (chrome.storage?.sync) {
        chrome.storage.sync.set({
          subtitleLocation: bottom,
          subtitleHorizontalOffset: horizontalOffset,
        });
      }
    } catch (error) {
      console.error("[SubtitleLocation] Error saving position to storage:", error);
    }
  }

  const subtitleOverlay = document.querySelector(".yt-subtitle-overlay");
  if (subtitleOverlay) {
    subtitleOverlay.style.bottom = `${bottom}%`;
  }

  const subtitleContainer = document.querySelector(".yt-subtitle-container");
  if (subtitleContainer) {
    subtitleContainer.style.position = "relative";
    subtitleContainer.style.left = `${horizontalOffset}%`;
  }

  if (window.DEBUG) {
    console.log(
      `[SubtitleLocation] Applied position: bottom=${bottom}%, horizontal=${horizontalOffset}% (system: ${isSystemChange})`
    );
  }
}

/**
 * Handles Timeline Always Visible state changes
 * Should be called when:
 * - Timeline Always Visible toggle changes
 * - Panel opens/closes
 * - Carousel opens/closes
 */
export function handleTimelineAlwaysVisibleChange() {
  // בדיקה אם כתוביות פעילות - אם לא, אין צורך לשנות מיקום
  const subtitleOverlay = document.querySelector('.yt-subtitle-overlay');
  const isSubtitleVisible = window.subtitleState?.isVisible === true;
  
  if (!subtitleOverlay || (subtitleOverlay.style.display === 'none' && !isSubtitleVisible)) {
    // אין כתוביות פעילות או שהן מוסתרות - לא עושים כלום
    return;
  }

  const isLocked = checkIfLocationLocked();
  const wasLocked = window.subtitleLocationState.isLocked;

  // Only update if state changed
  if (isLocked !== wasLocked) {
    window.subtitleLocationState.isLocked = isLocked;

    if (isLocked) {
      // Lock: apply 10% position (system change) when Timeline Always Visible is ON and panel/carousel is open
      console.log("[SubtitleLocation] 🔒 Locking subtitle location at 10%");
      applySubtitleLocation(10, true);
    } else {
      // Unlock: restore user's selected value (system change)
      console.log(
        `[SubtitleLocation] 🔓 Unlocking subtitle location, restoring to ${window.subtitleLocationState.userSelectedValue}%`
      );
      applySubtitleLocation(
        window.subtitleLocationState.userSelectedValue,
        true
      );
    }

    // Update menu item UI if it exists
    updateSubtitleLocationMenuItemState();
  }
}

/**
 * Checks if subtitle location is locked by Timeline Always Visible
 * @returns {boolean} True if locked, false otherwise
 */
export function checkIfLocationLocked() {
  // Check if Timeline Always Visible toggle is ON
  const timelineToggle = window.timelineAlwaysVisibleEnabled;

  if (!timelineToggle) {
    return false;
  }

  // Check if panel is open
  const panelOpen = document.querySelector(".yt-lyrics-chords-panel") !== null;

  // Check if chords (carousel) is active
  const chordsActive = window.chordsActive === true;

  // Locked if toggle is ON AND (panel OR chords is open)
  const isLocked = timelineToggle && (panelOpen || chordsActive);

  console.log(
    `[SubtitleLocation] Lock check: toggle=${timelineToggle}, panel=${panelOpen}, chords=${chordsActive}, locked=${isLocked}`
  );

  return isLocked;
}

/**
 * Updates the grid buttons to reflect the current selected value
 */
export function updateSubtitleLocationGridUI() {
  const submenu = document.querySelector(".subtitle-location-submenu");
  if (!submenu) {
    console.log("[SubtitleLocation] ⚠️ Cannot update grid - submenu not found");
    return; // Submenu not open
  }

  const currentValue = window.subtitleLocationState.currentValue;
  console.log(`[SubtitleLocation] 🎨 Updating grid UI to show ${currentValue}% as selected`);
  
  const allButtons = submenu.querySelectorAll(".subtitle-location-value");
  console.log(`[SubtitleLocation] Found ${allButtons.length} buttons in grid`);
  
  allButtons.forEach((btn) => {
    const value = parseInt(btn.textContent.replace("%", "").replace(" ✓", "").trim());
    
    // Reset all buttons
    btn.classList.remove("selected");
    btn.style.color = "#fff";
    btn.style.borderColor = "rgba(255, 255, 255, 0.2)";
    btn.style.background = "transparent";
    btn.textContent = value + "%";
    
    // Mark current value
    if (value === currentValue) {
      btn.classList.add("selected");
      btn.textContent = value + "% ✓";
      btn.style.color = "#3ea6ff";
      btn.style.borderColor = "#3ea6ff";
      console.log(`[SubtitleLocation] ✅ Marked ${value}% as selected`);
    }
  });
}

/**
 * Updates the Subtitle Location menu item UI based on lock state
 */
export function updateSubtitleLocationMenuItemState() {
  const menuItem = document.querySelector(".subtitle-location-menu-item");
  if (!menuItem) {
    return; // Menu not open
  }

  const isLocked = window.subtitleLocationState.isLocked;

  if (isLocked) {
    // Apply locked state
    menuItem.classList.add("disabled");
    menuItem.style.opacity = "0.5";
    menuItem.style.cursor = "not-allowed";
    menuItem.style.pointerEvents = "none";
    console.log("[SubtitleLocation] 🔒 Menu item locked (disabled)");
  } else {
    // Apply unlocked state
    menuItem.classList.remove("disabled");
    menuItem.style.opacity = "1";
    menuItem.style.cursor = "pointer";
    menuItem.style.pointerEvents = "auto";
    console.log("[SubtitleLocation] 🔓 Menu item unlocked (enabled)");
  }
  
  // Also update the grid UI to reflect current value
  updateSubtitleLocationGridUI();
}

/**
 * Opens the subtitle location submenu
 * @param {HTMLElement} parentMenu - The parent menu element
 * @param {number} currentValue - The current subtitle location value (may be outdated)
 */
export function openSubtitleLocationSubmenu(parentMenu, currentValue) {
  // Check lock state before opening
  const isLocked = checkIfLocationLocked();
  window.subtitleLocationState.isLocked = isLocked;

  if (isLocked) {
    console.log(
      "[SubtitleLocation] 🔒 Cannot open submenu - location is locked at 10%"
    );
    return; // Don't open if locked
  }

  // Always use the current value from state, not the parameter
  const actualCurrentValue = window.subtitleLocationState.currentValue;
  console.log(`[SubtitleLocation] Opening submenu with current value: ${actualCurrentValue}%`);

  // Create or get existing submenu
  let submenu = document.querySelector(".subtitle-location-submenu");
  if (!submenu) {
    submenu = createSubtitleLocationSubmenu(parentMenu, actualCurrentValue);
    document.body.appendChild(submenu);
  } else {
    // Submenu already exists - update the grid to show current value
    console.log(`[SubtitleLocation] Submenu exists - updating grid to show ${actualCurrentValue}%`);
    updateSubtitleLocationGridUI();
  }

  // Hide parent and show submenu
  parentMenu.style.display = "none";
  submenu.style.display = "block";

  // Position near controls
  if (window.placeNearControls) {
    window.placeNearControls(submenu);
  }
}

// Expose handlers globally for external access
window.subtitleLocationHandlers.handleTimelineAlwaysVisibleChange =
  handleTimelineAlwaysVisibleChange;
window.subtitleLocationHandlers.checkIfLocationLocked = checkIfLocationLocked;
window.subtitleLocationHandlers.updateSubtitleLocationMenuItemState =
  updateSubtitleLocationMenuItemState;
window.subtitleLocationHandlers.updateSubtitleLocationGridUI =
  updateSubtitleLocationGridUI;
window.subtitleLocationHandlers.openSubtitleLocationSubmenu =
  openSubtitleLocationSubmenu;

// Expose applySubtitleLocation globally for reset and other external uses
window.applySubtitleLocation = applySubtitleLocation;
window.applySubtitlePosition = applySubtitlePosition;
window.applySubtitleHorizontalOffset = applySubtitleHorizontalOffset;

// Create a wrapper to monitor panel state changes
if (!window.originalPanelStateSetter) {
  // Store original setter if it exists
  const descriptor = Object.getOwnPropertyDescriptor(window, 'lyricsChordsPanelActive');
  window.originalPanelStateSetter = descriptor?.set;
  
  // Create new property with getter/setter that triggers our handler
  let _panelActive = window.lyricsChordsPanelActive || false;
  Object.defineProperty(window, 'lyricsChordsPanelActive', {
    get() {
      return _panelActive;
    },
    set(value) {
      const oldValue = _panelActive;
      _panelActive = value;
      
      // Only trigger if value actually changed
      if (oldValue !== value && window.subtitleLocationHandlers?.handleTimelineAlwaysVisibleChange) {
        console.log(`[SubtitleLocation] Panel state changed: ${oldValue} → ${value}`);
        window.subtitleLocationHandlers.handleTimelineAlwaysVisibleChange();
      }
    },
    configurable: true
  });
}
