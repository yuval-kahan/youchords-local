// primaryChordsPositionMenu.js - Primary Chords Position Menu

// Global state for primary chords position
window.primaryChordPositionEnabled = window.primaryChordPositionEnabled ?? true;
window.globeIconEnabled = window.globeIconEnabled ?? true;
window.blackArrowsEnabled = window.blackArrowsEnabled ?? true;
window.blackPositionNumberEnabled = window.blackPositionNumberEnabled ?? true;

/**
 * Updates the black arrows state
 * @param {boolean} isEnabled - true = enabled, false = disabled
 * @param {boolean} keepSubmenuOpen - whether to keep the submenu open after update
 */
window.updateBlackArrows = function (isEnabled, keepSubmenuOpen = false) {
  // Don't allow enabling if primary chord position is OFF
  if (!window.primaryChordPositionEnabled) {
    return;
  }

  // Update global state
  window.blackArrowsEnabled = isEnabled;

  // Save to storage
  chrome.storage.sync
    .set({ blackArrowsEnabled: isEnabled })
    .then(() => {
      console.log(`[PrimaryChordsPosition] Black Arrows saved: ${isEnabled}`);
    })
    .catch((err) => {
      console.warn("[PrimaryChordsPosition] Failed to save:", err);
    });

  // Update body class for CSS (הצגה/הסתרה אוטומטית של חצים שחורים)
  if (isEnabled) {
    document.body.classList.add("yc-black-arrows-enabled");
  } else {
    document.body.classList.remove("yc-black-arrows-enabled");
  }

  // Update UI
  updateBlackArrowsState(isEnabled);

  // Refresh all tooltips to update arrow colors
  console.log(
    `[PrimaryChordsPosition] Black Arrows ${
      isEnabled ? "enabled" : "disabled"
    } - arrows will update instantly`
  );

  // Close submenu after delay if not keeping open
  if (!keepSubmenuOpen) {
    const submenu = document.querySelector(".primary-chords-position-submenu");
    const timeoutId = setTimeout(() => {
      const parent = document.querySelector(".yc-settings-menu");
      const self = document.querySelector(".primary-chords-position-submenu");
      if (self) self.style.display = "none";
      if (parent) parent.style.display = "block";
      submenu?.pendingTimeouts?.delete(timeoutId);
    }, 100);

    if (submenu) {
      if (!submenu.pendingTimeouts) {
        submenu.pendingTimeouts = new Set();
      }
      submenu.pendingTimeouts.add(timeoutId);
    }
  }
};

/**
 * Updates the black position number state
 * @param {boolean} isEnabled - true = enabled, false = disabled
 * @param {boolean} keepSubmenuOpen - whether to keep the submenu open after update
 */
window.updateBlackPositionNumber = function (isEnabled, keepSubmenuOpen = false) {
  // Don't allow enabling if primary chord position is OFF
  if (!window.primaryChordPositionEnabled) {
    return;
  }

  window.blackPositionNumberEnabled = isEnabled;

  chrome.storage.sync
    .set({ blackPositionNumberEnabled: isEnabled })
    .then(() => {
      console.log(
        `[PrimaryChordsPosition] Black Position Number saved: ${isEnabled}`
      );
    })
    .catch((err) => {
      console.warn("[PrimaryChordsPosition] Failed to save:", err);
    });

  if (isEnabled) {
    document.body.classList.add("yc-black-position-number-enabled");
  } else {
    document.body.classList.remove("yc-black-position-number-enabled");
  }

  updateBlackPositionNumberState(isEnabled);

  if (!keepSubmenuOpen) {
    const submenu = document.querySelector(".primary-chords-position-submenu");
    const timeoutId = setTimeout(() => {
      const parent = document.querySelector(".yc-settings-menu");
      const self = document.querySelector(".primary-chords-position-submenu");
      if (self) self.style.display = "none";
      if (parent) parent.style.display = "block";
      submenu?.pendingTimeouts?.delete(timeoutId);
    }, 100);

    if (submenu) {
      if (!submenu.pendingTimeouts) {
        submenu.pendingTimeouts = new Set();
      }
      submenu.pendingTimeouts.add(timeoutId);
    }
  }
};

/**
 * Updates the primary chord position state
 * @param {boolean} isEnabled - true = enabled, false = disabled
 * @param {boolean} keepSubmenuOpen - whether to keep the submenu open after update
 */
window.updatePrimaryChordPosition = function (
  isEnabled,
  keepSubmenuOpen = false
) {
  // Update global state
  window.primaryChordPositionEnabled = isEnabled;

  // If turning OFF, turn OFF globe icon and black arrows UI but DON'T change storage
  if (!isEnabled) {
    // Save current states before turning off
    const currentGlobeState = window.globeIconEnabled;
    const currentBlackArrowsState = window.blackArrowsEnabled;
    const currentBlackPositionNumberState = window.blackPositionNumberEnabled;

    // Turn off UI only
    window.globeIconEnabled = false;
    window.blackArrowsEnabled = false;
    window.blackPositionNumberEnabled = false;
    document.body.classList.remove(
      "yc-globe-icon-enabled",
      "yc-black-arrows-enabled",
      "yc-black-position-number-enabled"
    );
    updateGlobeIconState(false);
    updateGlobeIconDisabledState(true);
    updateBlackArrowsState(false);
    updateBlackArrowsDisabledState(true);
    updateBlackPositionNumberState(false);
    updateBlackPositionNumberDisabledState(true);

    // 🧹 ניקוי כל הגלובוסים והחצים השחורים מה-DOM
    console.log(
      "[PrimaryChordsPosition] 🧹 Cleaning up globe icons and black arrows from DOM"
    );

    // הגבלת הניקוי לאזורים רלוונטיים בלבד
    const relevantContainers = [
      document.querySelector(".yc-chord-carousel"),
      document.querySelector(".yt-lyrics-chords-panel"),
      document.querySelector(".yc-preview-panel"),
    ].filter(Boolean);

    let globesRemoved = 0;
    let arrowsReset = 0;

    for (const container of relevantContainers) {
      // הסרת כל הגלובוסים
      const globes = container.querySelectorAll(".global-position-globe");
      globes.forEach((globe) => {
        if (globe.parentNode) {
          globe.parentNode.removeChild(globe);
          globesRemoved++;
        }
      });

      // הסרת class מכל החצים השחורים
      const arrows = container.querySelectorAll(".global-position-arrow");
      arrows.forEach((arrow) => {
        arrow.classList.remove("global-position-arrow");
        arrowsReset++;
      });

      container
        .querySelectorAll(".global-position-counter")
        .forEach((counter) => counter.classList.remove("global-position-counter"));
    }

    console.log(
      `[PrimaryChordsPosition] 🌐 Removed ${globesRemoved} globes, reset ${arrowsReset} arrows`
    );

    console.log("[PrimaryChordsPosition] ✅ Cleanup complete");

    // Restore the original values to global (so they're remembered)
    window.globeIconEnabled = currentGlobeState;
    window.blackArrowsEnabled = currentBlackArrowsState;
    window.blackPositionNumberEnabled = currentBlackPositionNumberState;
  } else {
    // If turning ON, restore globe icon and black arrows from storage
    chrome.storage.sync.get(
      ["globeIconEnabled", "blackArrowsEnabled", "blackPositionNumberEnabled"],
      (result) => {
        const savedGlobeState = result.globeIconEnabled ?? true;
        const savedBlackArrowsState = result.blackArrowsEnabled ?? true;
        const savedBlackPositionNumberState =
          result.blackPositionNumberEnabled ?? true;

        window.globeIconEnabled = savedGlobeState;
        window.blackArrowsEnabled = savedBlackArrowsState;
        window.blackPositionNumberEnabled = savedBlackPositionNumberState;
        document.body.classList.toggle(
          "yc-globe-icon-enabled",
          Boolean(savedGlobeState)
        );
        document.body.classList.toggle(
          "yc-black-arrows-enabled",
          Boolean(savedBlackArrowsState)
        );
        document.body.classList.toggle(
          "yc-black-position-number-enabled",
          Boolean(savedBlackPositionNumberState)
        );

        updateGlobeIconState(savedGlobeState);
        updateGlobeIconDisabledState(false);
        updateBlackArrowsState(savedBlackArrowsState);
        updateBlackArrowsDisabledState(false);
        updateBlackPositionNumberState(savedBlackPositionNumberState);
        updateBlackPositionNumberDisabledState(false);

        console.log(
          `[PrimaryChordsPosition] Restored Globe Icon to: ${savedGlobeState}`
        );
        console.log(
          `[PrimaryChordsPosition] Restored Black Arrows to: ${savedBlackArrowsState}`
        );
        console.log(
          `[PrimaryChordsPosition] Restored Black Position Number to: ${savedBlackPositionNumberState}`
        );

        // 🔄 הוספה מחדש של גלובוסים, חצים ומספרי פוזיציה לכל האקורדים
        if (
          savedGlobeState ||
          savedBlackArrowsState ||
          savedBlackPositionNumberState
        ) {
          console.log(
            "[PrimaryChordsPosition] 🔄 Re-adding global indicators to all chords"
          );
          refreshAllGlobalIndicators();
        }
      }
    );
  }

  // Save to storage
  chrome.storage.sync
    .set({ primaryChordPositionEnabled: isEnabled })
    .then(() => {
      console.log(
        `[PrimaryChordsPosition] Primary Chord Position saved: ${isEnabled}`
      );
    })
    .catch((err) => {
      console.warn("[PrimaryChordsPosition] Failed to save:", err);
    });

  // Update body class for CSS
  if (isEnabled) {
    document.body.classList.add("yc-primary-chord-position-enabled");
  } else {
    document.body.classList.remove("yc-primary-chord-position-enabled");
  }

  // Update UI
  updatePrimaryChordPositionState(isEnabled);

  // Setup or remove click listeners
  setupPositionCounterListeners(isEnabled);

  // Close submenu after delay if not keeping open
  if (!keepSubmenuOpen) {
    const submenu = document.querySelector(".primary-chords-position-submenu");
    const timeoutId = setTimeout(() => {
      const parent = document.querySelector(".yc-settings-menu");
      const self = document.querySelector(".primary-chords-position-submenu");
      if (self) self.style.display = "none";
      if (parent) parent.style.display = "block";
      submenu?.pendingTimeouts?.delete(timeoutId);
    }, 100);

    // Store timeout ID for cleanup
    if (submenu) {
      if (!submenu.pendingTimeouts) {
        submenu.pendingTimeouts = new Set();
      }
      submenu.pendingTimeouts.add(timeoutId);
    }
  }
};

/**
 * Updates the globe icon state
 * @param {boolean} isEnabled - true = enabled, false = disabled
 * @param {boolean} keepSubmenuOpen - whether to keep the submenu open after update
 */
window.updateGlobeIcon = function (isEnabled, keepSubmenuOpen = false) {
  // Don't allow enabling if primary chord position is OFF
  if (!window.primaryChordPositionEnabled) {
    return;
  }

  // Update global state
  window.globeIconEnabled = isEnabled;

  // Save to storage
  chrome.storage.sync
    .set({ globeIconEnabled: isEnabled })
    .then(() => {
      console.log(`[PrimaryChordsPosition] Globe Icon saved: ${isEnabled}`);
    })
    .catch((err) => {
      console.warn("[PrimaryChordsPosition] Failed to save:", err);
    });

  // Update body class for CSS (הסתרה/הצגה אוטומטית של גלובוסים)
  if (isEnabled) {
    document.body.classList.add("yc-globe-icon-enabled");
  } else {
    document.body.classList.remove("yc-globe-icon-enabled");
  }

  // Update UI
  updateGlobeIconState(isEnabled);

  // Close submenu after delay if not keeping open
  if (!keepSubmenuOpen) {
    const submenu = document.querySelector(".primary-chords-position-submenu");
    const timeoutId = setTimeout(() => {
      const parent = document.querySelector(".yc-settings-menu");
      const self = document.querySelector(".primary-chords-position-submenu");
      if (self) self.style.display = "none";
      if (parent) parent.style.display = "block";
      submenu?.pendingTimeouts?.delete(timeoutId);
    }, 100);

    // Store timeout ID for cleanup
    if (submenu) {
      if (!submenu.pendingTimeouts) {
        submenu.pendingTimeouts = new Set();
      }
      submenu.pendingTimeouts.add(timeoutId);
    }
  }
};

/**
 * Updates the primary chord position toggle UI
 * @param {boolean} isEnabled - current state
 */
function updatePrimaryChordPositionState(isEnabled) {
  // Use cached toggle if available
  const submenu = document.querySelector(".primary-chords-position-submenu");
  const toggle =
    submenu?.cachedPrimaryToggle ||
    document.querySelector(".primary-chord-position-toggle");
  if (!toggle) return;

  toggle.style.backgroundColor = isEnabled ? "#3ea6ff" : "#666";

  const toggleButton = toggle.querySelector("div");
  if (toggleButton) {
    toggleButton.style.transform = `translateX(${isEnabled ? "20px" : "0"})`;
  }

  const status = toggle.parentElement?.querySelector("span:last-child");
  if (status) {
    status.textContent = isEnabled ? "ON" : "OFF";
    status.style.color = isEnabled ? "#3ea6ff" : "#666";
  }
}

/**
 * Updates the globe icon toggle UI
 * @param {boolean} isEnabled - current state
 */
function updateGlobeIconState(isEnabled) {
  // Use cached toggle if available
  const submenu = document.querySelector(".primary-chords-position-submenu");
  const toggle =
    submenu?.cachedGlobeToggle || document.querySelector(".globe-icon-toggle");
  if (!toggle) return;

  toggle.style.backgroundColor = isEnabled ? "#3ea6ff" : "#666";

  const toggleButton = toggle.querySelector("div");
  if (toggleButton) {
    toggleButton.style.transform = `translateX(${isEnabled ? "20px" : "0"})`;
  }

  const status = toggle.parentElement?.querySelector("span:last-child");
  if (status) {
    status.textContent = isEnabled ? "ON" : "OFF";
    status.style.color = isEnabled ? "#3ea6ff" : "#666";
  }
}

/**
 * Updates the black arrows toggle UI
 * @param {boolean} isEnabled - current state
 */
function updateBlackArrowsState(isEnabled) {
  // Use cached toggle if available
  const submenu = document.querySelector(".primary-chords-position-submenu");
  const toggle =
    submenu?.cachedBlackArrowsToggle ||
    document.querySelector(".black-arrows-toggle");
  if (!toggle) return;

  toggle.style.backgroundColor = isEnabled ? "#3ea6ff" : "#666";

  const toggleButton = toggle.querySelector("div");
  if (toggleButton) {
    toggleButton.style.transform = `translateX(${isEnabled ? "20px" : "0"})`;
  }

  const status = toggle.parentElement?.querySelector("span:last-child");
  if (status) {
    status.textContent = isEnabled ? "ON" : "OFF";
    status.style.color = isEnabled ? "#3ea6ff" : "#666";
  }
}

/**
 * Updates the black position number toggle UI
 * @param {boolean} isEnabled - current state
 */
function updateBlackPositionNumberState(isEnabled) {
  const submenu = document.querySelector(".primary-chords-position-submenu");
  const toggle =
    submenu?.cachedBlackPositionNumberToggle ||
    document.querySelector(".black-position-number-toggle");
  if (!toggle) return;

  toggle.style.backgroundColor = isEnabled ? "#3ea6ff" : "#666";

  const toggleButton = toggle.querySelector("div");
  if (toggleButton) {
    toggleButton.style.transform = `translateX(${isEnabled ? "20px" : "0"})`;
  }

  const status = toggle.parentElement?.querySelector("span:last-child");
  if (status) {
    status.textContent = isEnabled ? "ON" : "OFF";
    status.style.color = isEnabled ? "#3ea6ff" : "#666";
  }
}

/**
 * Updates the black arrows disabled state
 * @param {boolean} isDisabled - true = disabled, false = enabled
 */
function updateBlackArrowsDisabledState(isDisabled) {
  const blackArrowsOption = document.querySelector(".black-arrows-option");
  const blackArrowsText = blackArrowsOption?.querySelector("span");
  const toggle = document.querySelector(".black-arrows-toggle");
  const toggleContainer = toggle?.parentElement;

  if (!blackArrowsOption || !toggle) return;

  if (isDisabled) {
    // Disabled state - gray and not clickable
    blackArrowsOption.style.cursor = "not-allowed";
    blackArrowsOption.style.opacity = "0.5";

    if (blackArrowsText) {
      blackArrowsText.style.color = "#666";
    }

    toggle.style.cursor = "not-allowed";
    toggle.style.backgroundColor = "#444";

    const status = toggleContainer?.querySelector("span:last-child");
    if (status) {
      status.style.color = "#666";
    }
  } else {
    // Enabled state - normal colors and clickable
    blackArrowsOption.style.cursor = "default";
    blackArrowsOption.style.opacity = "1";

    if (blackArrowsText) {
      blackArrowsText.style.color = "#ffffff";
    }

    toggle.style.cursor = "pointer";
    toggle.style.backgroundColor = window.blackArrowsEnabled
      ? "#3ea6ff"
      : "#666";

    const status = toggleContainer?.querySelector("span:last-child");
    if (status) {
      status.style.color = window.blackArrowsEnabled ? "#3ea6ff" : "#666";
    }
  }
}

/**
 * Updates the black position number disabled state
 * @param {boolean} isDisabled - true = disabled, false = enabled
 */
function updateBlackPositionNumberDisabledState(isDisabled) {
  const option = document.querySelector(".black-position-number-option");
  const text = option?.querySelector("span");
  const toggle = document.querySelector(".black-position-number-toggle");
  const toggleContainer = toggle?.parentElement;

  if (!option || !toggle) return;

  if (isDisabled) {
    option.style.cursor = "not-allowed";
    option.style.opacity = "0.5";
    if (text) text.style.color = "#666";
    toggle.style.cursor = "not-allowed";
    toggle.style.backgroundColor = "#444";

    const status = toggleContainer?.querySelector("span:last-child");
    if (status) {
      status.style.color = "#666";
    }
  } else {
    option.style.cursor = "default";
    option.style.opacity = "1";
    if (text) text.style.color = "#ffffff";
    toggle.style.cursor = "pointer";
    toggle.style.backgroundColor = window.blackPositionNumberEnabled
      ? "#3ea6ff"
      : "#666";

    const status = toggleContainer?.querySelector("span:last-child");
    if (status) {
      status.style.color = window.blackPositionNumberEnabled ? "#3ea6ff" : "#666";
    }
  }
}

/**
 * Updates the globe icon disabled state
 * @param {boolean} isDisabled - true = disabled, false = enabled
 */
function updateGlobeIconDisabledState(isDisabled) {
  const globeIconOption = document.querySelector(".globe-icon-option");
  const globeIconText = globeIconOption?.querySelector("span");
  const toggle = document.querySelector(".globe-icon-toggle");
  const toggleContainer = toggle?.parentElement;

  if (!globeIconOption || !toggle) return;

  if (isDisabled) {
    // Disabled state - gray and not clickable
    globeIconOption.style.cursor = "not-allowed";
    globeIconOption.style.opacity = "0.5";

    if (globeIconText) {
      globeIconText.style.color = "#666";
    }

    toggle.style.cursor = "not-allowed";
    toggle.style.backgroundColor = "#444";

    const status = toggleContainer?.querySelector("span:last-child");
    if (status) {
      status.style.color = "#666";
    }
  } else {
    // Enabled state - normal colors and clickable
    globeIconOption.style.cursor = "default";
    globeIconOption.style.opacity = "1";

    if (globeIconText) {
      globeIconText.style.color = "#ffffff";
    }

    toggle.style.cursor = "pointer";
    toggle.style.backgroundColor = window.globeIconEnabled ? "#3ea6ff" : "#666";

    const status = toggleContainer?.querySelector("span:last-child");
    if (status) {
      status.style.color = window.globeIconEnabled ? "#3ea6ff" : "#666";
    }
  }
}

window.updatePrimaryChordPositionState = updatePrimaryChordPositionState;
window.updateGlobeIconState = updateGlobeIconState;
window.updateGlobeIconDisabledState = updateGlobeIconDisabledState;
window.updateBlackArrowsState = updateBlackArrowsState;
window.updateBlackArrowsDisabledState = updateBlackArrowsDisabledState;
window.updateBlackPositionNumberState = updateBlackPositionNumberState;
window.updateBlackPositionNumberDisabledState = updateBlackPositionNumberDisabledState;

/**
 * Creates a toggle switch component
 */
function createToggleSwitch(className, initialState, onChange) {
  const toggleContainer = document.createElement("div");
  toggleContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  const toggle = document.createElement("div");
  toggle.className = className;
  toggle.style.cssText = `
    width: 40px;
    height: 20px;
    background-color: ${initialState ? "#3ea6ff" : "#666"};
    border-radius: 10px;
    position: relative;
    cursor: pointer;
    transition: background-color 0.3s ease;
  `;

  const toggleButton = document.createElement("div");
  toggleButton.style.cssText = `
    width: 16px;
    height: 16px;
    background-color: white;
    border-radius: 50%;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: transform 0.3s ease;
    transform: translateX(${initialState ? "20px" : "0"});
  `;

  const status = document.createElement("span");
  status.textContent = initialState ? "ON" : "OFF";
  status.style.cssText = `
    color: ${initialState ? "#3ea6ff" : "#666"};
    font-size: 12px;
    font-weight: 500;
  `;

  toggle.appendChild(toggleButton);
  toggleContainer.appendChild(toggle);
  toggleContainer.appendChild(status);

  // Store the listener reference for proper cleanup
  const clickHandler = (event) => {
    event.stopPropagation();
    onChange?.();
  };

  toggle.addEventListener("click", clickHandler);

  const cleanup = () => {
    toggle.removeEventListener("click", clickHandler);
  };

  return { toggleContainer, cleanup };
}

/**
 * Creates the Primary Chords Position submenu
 */
window.createPrimaryChordsPositionSubmenu = function (parentMenu) {
  const submenu = document.createElement("div");
  submenu.className = "settings-menu primary-chords-position-submenu";
  submenu.style.cssText = `
    position: absolute;
    background: rgba(28, 28, 28, 0.9);
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

  // Store back button click handler for cleanup
  const backButtonClickHandler = (event) => {
    event.stopPropagation();
    submenu.style.display = "none";
    if (parentMenu) parentMenu.style.display = "block";
  };

  backButton.addEventListener("click", backButtonClickHandler);

  // Store handler for cleanup
  submenu.backButtonClickHandler = backButtonClickHandler;
  submenu.backButton = backButton;

  const headerText = document.createElement("span");
  headerText.textContent = "Global Chords Position";
  headerText.style.fontWeight = "500";

  header.appendChild(backButton);
  header.appendChild(headerText);
  submenu.appendChild(header);

  // Options container
  const optionsContainer = document.createElement("div");
  optionsContainer.style.padding = "8px 0";

  // Initialize cleanup array
  submenu.toggleCleanups = [];

  // Get initial states from storage
  chrome.storage.sync.get(
    [
      "primaryChordPositionEnabled",
      "globeIconEnabled",
      "blackArrowsEnabled",
      "blackPositionNumberEnabled",
    ],
    (result) => {
      if (!submenu.isConnected) return;

      const primaryChordEnabled = result.primaryChordPositionEnabled ?? true;
      const globeEnabled = result.globeIconEnabled ?? true;
      const blackArrowsEnabled = result.blackArrowsEnabled ?? true;
      const blackPositionNumberEnabled =
        result.blackPositionNumberEnabled ?? true;

      window.primaryChordPositionEnabled = primaryChordEnabled;
      window.globeIconEnabled = globeEnabled;
      window.blackArrowsEnabled = blackArrowsEnabled;
      window.blackPositionNumberEnabled = blackPositionNumberEnabled;

      // Apply body class based on initial state
      if (primaryChordEnabled) {
        document.body.classList.add("yc-primary-chord-position-enabled");
      } else {
        document.body.classList.remove("yc-primary-chord-position-enabled");
      }
      document.body.classList.toggle(
        "yc-globe-icon-enabled",
        Boolean(globeEnabled)
      );
      document.body.classList.toggle(
        "yc-black-arrows-enabled",
        Boolean(blackArrowsEnabled)
      );
      document.body.classList.toggle(
        "yc-black-position-number-enabled",
        Boolean(blackPositionNumberEnabled)
      );

      // Primary Chord Position toggle option
      const primaryChordOption = document.createElement("div");
      primaryChordOption.className = "settings-item";
      primaryChordOption.style.cssText = `
      padding: 12px 24px;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      user-select: none;
      -webkit-user-select: none;
      cursor: pointer;
    `;
      primaryChordOption.addEventListener("click", (e) => e.stopPropagation());
      primaryChordOption.addEventListener("mouseover", () => {
        primaryChordOption.style.backgroundColor = "rgba(255,255,255,0.1)";
      });
      primaryChordOption.addEventListener("mouseout", () => {
        primaryChordOption.style.backgroundColor = "transparent";
      });

      const primaryChordText = document.createElement("span");
      primaryChordText.textContent = "Primary Chord Position";
      primaryChordText.style.color = "#ffffff";

      primaryChordOption.appendChild(primaryChordText);

      const primaryToggleResult = createToggleSwitch(
        "primary-chord-position-toggle",
        primaryChordEnabled,
        () => {
          const newState = !window.primaryChordPositionEnabled;
          window.updatePrimaryChordPosition(newState, true);
        }
      );

      primaryChordOption.appendChild(primaryToggleResult.toggleContainer);
      submenu.toggleCleanups.push(primaryToggleResult.cleanup);

      // Cache toggle element for performance
      submenu.cachedPrimaryToggle =
        primaryToggleResult.toggleContainer.querySelector(
          ".primary-chord-position-toggle"
        );

      optionsContainer.appendChild(primaryChordOption);

      // Globe Icon toggle option
      const globeIconOption = document.createElement("div");
      globeIconOption.className = "settings-item globe-icon-option";
      globeIconOption.style.cssText = `
      padding: 12px 24px;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      user-select: none;
      -webkit-user-select: none;
      cursor: pointer;
    `;
      globeIconOption.addEventListener("click", (e) => e.stopPropagation());
      globeIconOption.addEventListener("mouseover", () => {
        globeIconOption.style.backgroundColor = "rgba(255,255,255,0.1)";
      });
      globeIconOption.addEventListener("mouseout", () => {
        globeIconOption.style.backgroundColor = "transparent";
      });

      const globeIconText = document.createElement("span");
      globeIconText.textContent = "Enable Globe Icon";
      globeIconText.style.color = "#ffffff";

      globeIconOption.appendChild(globeIconText);

      const globeToggleResult = createToggleSwitch(
        "globe-icon-toggle",
        globeEnabled,
        () => {
          // Only allow toggle if primary chord position is enabled
          if (!window.primaryChordPositionEnabled) {
            return;
          }
          const newState = !window.globeIconEnabled;
          window.updateGlobeIcon(newState, true);
        }
      );

      globeIconOption.appendChild(globeToggleResult.toggleContainer);
      submenu.toggleCleanups.push(globeToggleResult.cleanup);

      // Cache toggle element for performance
      submenu.cachedGlobeToggle =
        globeToggleResult.toggleContainer.querySelector(".globe-icon-toggle");

      optionsContainer.appendChild(globeIconOption);

      // Black Arrows toggle option
      const blackArrowsOption = document.createElement("div");
      blackArrowsOption.className = "settings-item black-arrows-option";
      blackArrowsOption.style.cssText = `
      padding: 12px 24px;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      user-select: none;
      -webkit-user-select: none;
      cursor: pointer;
    `;
      blackArrowsOption.addEventListener("click", (e) => e.stopPropagation());
      blackArrowsOption.addEventListener("mouseover", () => {
        blackArrowsOption.style.backgroundColor = "rgba(255,255,255,0.1)";
      });
      blackArrowsOption.addEventListener("mouseout", () => {
        blackArrowsOption.style.backgroundColor = "transparent";
      });

      const blackArrowsText = document.createElement("span");
      blackArrowsText.textContent = "Enable Black Arrows";
      blackArrowsText.style.color = "#ffffff";

      blackArrowsOption.appendChild(blackArrowsText);

      const blackArrowsToggleResult = createToggleSwitch(
        "black-arrows-toggle",
        blackArrowsEnabled,
        () => {
          // Only allow toggle if primary chord position is enabled
          if (!window.primaryChordPositionEnabled) {
            return;
          }
          const newState = !window.blackArrowsEnabled;
          window.updateBlackArrows(newState, true);
        }
      );

      blackArrowsOption.appendChild(blackArrowsToggleResult.toggleContainer);
      submenu.toggleCleanups.push(blackArrowsToggleResult.cleanup);

      // Cache toggle element for performance
      submenu.cachedBlackArrowsToggle =
        blackArrowsToggleResult.toggleContainer.querySelector(
          ".black-arrows-toggle"
        );

      optionsContainer.appendChild(blackArrowsOption);

      // Black Position Number toggle option
      const blackPositionNumberOption = document.createElement("div");
      blackPositionNumberOption.className =
        "settings-item black-position-number-option";
      blackPositionNumberOption.style.cssText = `
      padding: 12px 24px;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      user-select: none;
      -webkit-user-select: none;
      cursor: pointer;
    `;
      blackPositionNumberOption.addEventListener("click", (e) =>
        e.stopPropagation()
      );
      blackPositionNumberOption.addEventListener("mouseover", () => {
        blackPositionNumberOption.style.backgroundColor =
          "rgba(255,255,255,0.1)";
      });
      blackPositionNumberOption.addEventListener("mouseout", () => {
        blackPositionNumberOption.style.backgroundColor = "transparent";
      });

      const blackPositionNumberText = document.createElement("span");
      blackPositionNumberText.textContent = "Enable Black Position Number";
      blackPositionNumberText.style.color = "#ffffff";

      blackPositionNumberOption.appendChild(blackPositionNumberText);

      const blackPositionNumberToggleResult = createToggleSwitch(
        "black-position-number-toggle",
        blackPositionNumberEnabled,
        () => {
          // Only allow toggle if primary chord position is enabled
          if (!window.primaryChordPositionEnabled) {
            return;
          }
          const newState = !window.blackPositionNumberEnabled;
          window.updateBlackPositionNumber(newState, true);
        }
      );

      blackPositionNumberOption.appendChild(
        blackPositionNumberToggleResult.toggleContainer
      );
      submenu.toggleCleanups.push(blackPositionNumberToggleResult.cleanup);

      // Cache toggle element for performance
      submenu.cachedBlackPositionNumberToggle =
        blackPositionNumberToggleResult.toggleContainer.querySelector(
          ".black-position-number-toggle"
        );

      optionsContainer.appendChild(blackPositionNumberOption);

      // Set initial disabled state if primary chord position is OFF
      if (!primaryChordEnabled) {
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
          updateGlobeIconDisabledState(true);
          updateBlackArrowsDisabledState(true);
          updateBlackPositionNumberDisabledState(true);
        }, 0);
      }
    }
  );

  submenu.appendChild(optionsContainer);

  // Position observer
  const observer = new MutationObserver(() => {
    if (submenu.style.display === "block") {
      const controls = document.querySelector(".ytp-chrome-bottom");
      if (controls) {
        const rect = controls.getBoundingClientRect();
        submenu.style.bottom = `${rect.height + 12}px`;
        submenu.style.right = "12px";
      }
    }
  });

  observer.observe(submenu, { attributes: true, attributeFilter: ["style"] });
  submenu.observer = observer;

  return submenu;
};

/**
 * Disposes the Primary Chords Position submenu
 */
window.disposePrimaryChordsPositionSubmenu = function (
  submenu,
  remove = false
) {
  if (!submenu) return;

  // Clear pending timeouts
  if (submenu.pendingTimeouts) {
    submenu.pendingTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    submenu.pendingTimeouts.clear();
    delete submenu.pendingTimeouts;
  }

  // Disconnect observer
  if (submenu.observer) {
    submenu.observer.disconnect();
    delete submenu.observer;
  }

  // Clean up back button listener
  if (submenu.backButton && submenu.backButtonClickHandler) {
    submenu.backButton.removeEventListener(
      "click",
      submenu.backButtonClickHandler
    );
    delete submenu.backButtonClickHandler;
    delete submenu.backButton;
  }

  // Clean up toggles
  if (submenu.toggleCleanups) {
    submenu.toggleCleanups.forEach((cleanup) => cleanup());
    delete submenu.toggleCleanups;
  }

  // Clear cached elements
  delete submenu.cachedPrimaryToggle;
  delete submenu.cachedGlobeToggle;
  delete submenu.cachedBlackArrowsToggle;
  delete submenu.cachedBlackPositionNumberToggle;

  // Remove from DOM if requested
  if (remove && submenu.parentNode) {
    submenu.parentNode.removeChild(submenu);
  }
};

// Track if listeners are already added to prevent duplicates
let listenersAdded = false;

/**
 * Setup or remove click listeners for position counters
 * @param {boolean} enable - true to add listeners, false to remove
 */
function setupPositionCounterListeners(enable) {
  if (enable && !listenersAdded) {
    // Add event delegation for carousel position counters
    document.addEventListener("click", handlePositionCounterClick, true);
    listenersAdded = true;
    console.log("[PrimaryChordsPosition] ✓ Click listeners enabled");
  } else if (!enable && listenersAdded) {
    // Remove event delegation
    document.removeEventListener("click", handlePositionCounterClick, true);
    listenersAdded = false;
    console.log("[PrimaryChordsPosition] ✗ Click listeners disabled");
  }
}

// Expose globally so it can be called from chordsDisplay and lyricsAndChordsButton
window.setupPositionCounterListeners = setupPositionCounterListeners;

/**
 * עדכון גלובוס בכל האקורדים הזהים בקרוסלה
 * @param {string} chordName - שם האקורד
 * @param {number} currentPosition - הפוזיציה הנוכחית (0-based)
 */
async function updateAllCarouselGlobes(chordName, currentPosition) {
  try {
    console.log(
      `[PrimaryChordsPosition] 🔄 מחפש את כל האקורדים ${chordName}...`
    );

    // הגבלת החיפוש לאזורים רלוונטיים בלבד (לא כל הדף!)
    const relevantContainers = [
      document.querySelector(".yc-chord-carousel"),
      document.querySelector(".yt-lyrics-chords-panel"),
      document.querySelector(".yc-preview-panel"),
    ].filter(Boolean); // Remove null values

    if (relevantContainers.length === 0) {
      console.log("[PrimaryChordsPosition] ℹ️ No relevant containers found");
      return;
    }

    let updatedCount = 0;

    // חיפוש רק בתוך הקונטיינרים הרלוונטיים
    for (const container of relevantContainers) {
      const arrows = container.querySelectorAll(
        ".chord-arrow-left, .chord-arrow-right"
      );

      for (const arrow of arrows) {
        let arrowChordName = arrow.getAttribute("data-chord-name");

        if (!arrowChordName) continue;

        // ניקוי שם האקורד מסיומות זמניות (אם יש)
        arrowChordName = arrowChordName.replace(/_pos\d+_\d+$/, "");

        // אם זה אותו אקורד - עדכן את הגלובוס
        if (arrowChordName === chordName) {
          if (window.addGlobalPositionIndicator) {
            await window.addGlobalPositionIndicator(
              chordName,
              currentPosition,
              arrow
            );
            updatedCount++;
          }
        }
      }
    }

    console.log(`[PrimaryChordsPosition] ✅ עודכנו ${updatedCount} אקורדים`);
  } catch (error) {
    console.error(
      "[PrimaryChordsPosition] ❌ שגיאה בעדכון גלובוסים:",
      error
    );
  }
}

/**
 * Handle click on position counter
 * @param {Event} e - Click event
 */
function handlePositionCounterClick(e) {
  const target = e.target;

  // Early exit: Check if click is in relevant area (carousel, panel, or preview)
  const clickedInRelevantArea = target.closest(
    ".yc-chord-carousel, .yt-lyrics-chords-panel, .yc-preview-panel, .lyrics-chords-tooltip"
  );
  if (!clickedInRelevantArea) {
    return; // Ignore clicks outside relevant areas
  }

  // Check if clicked element is a position counter
  if (
    target &&
    target.classList &&
    target.classList.contains("chord-position-counter")
  ) {
    e.stopPropagation();
    e.preventDefault();

    const positionText = target.textContent || ""; // e.g. "3/25"
    console.log(
      `[PrimaryChordsPosition] 🎯 Position counter clicked: ${positionText}`
    );

    // Extract current position from text (e.g. "3/25" -> 3)
    const match = positionText.match(/^(\d+)\/(\d+)$/);
    if (!match) {
      console.warn(
        "[PrimaryChordsPosition] Invalid position format:",
        positionText
      );
      return;
    }

    const currentPosition = parseInt(match[1], 10) - 1; // Convert to 0-based
    const totalPositions = parseInt(match[2], 10);

    // Find chord name from nearby arrows
    const svg = target.closest("svg");
    if (!svg) {
      console.warn("[PrimaryChordsPosition] Could not find parent SVG");
      return;
    }

    const arrow = svg.querySelector(".chord-arrow-left, .chord-arrow-right");
    if (!arrow) {
      console.warn(
        "[PrimaryChordsPosition] Could not find arrow with chord name"
      );
      return;
    }

    let chordName = arrow.getAttribute("data-chord-name");
    if (!chordName) {
      console.warn("[PrimaryChordsPosition] Could not extract chord name");
      return;
    }

    // Clean up temporary unique name (e.g. "Bm_pos3_1762911557408" -> "Bm")
    const originalChordName = chordName;
    chordName = chordName.replace(/_pos\d+_\d+$/, "");

    if (originalChordName !== chordName) {
      console.log(
        `[PrimaryChordsPosition] Cleaned chord name: "${originalChordName}" -> "${chordName}"`
      );
    }

    console.log(
      `[PrimaryChordsPosition] Processing position click: ${chordName} -> ${
        currentPosition + 1
      }/${totalPositions}`
    );

    if (currentPosition <= 0) {
      console.log(
        `[PrimaryChordsPosition] Position 1 cannot be global for ${chordName}`
      );
      if (window.addGlobalPositionIndicator) {
        window.addGlobalPositionIndicator(chordName, currentPosition, arrow);
      }
      return;
    }

    // Toggle logic: Check if this position is already global
    if (
      window.databaseManager &&
      window.databaseManager.getGlobalChordPosition &&
      window.databaseManager.saveGlobalChordPosition
    ) {
      window.databaseManager
        .getGlobalChordPosition(chordName)
        .then(async (existingGlobalPos) => {
          console.log(
            `[PrimaryChordsPosition] 🔍 Existing global position:`,
            existingGlobalPos
          );

          // Toggle: If clicking on the same position that's already global, remove it
          if (existingGlobalPos === currentPosition) {
            console.log(
              `[PrimaryChordsPosition] 🔄 Toggle OFF - removing global position`
            );

            // Remove global position (save as 0 which means "no global position")
            const success =
              await window.databaseManager.saveGlobalChordPosition(
                chordName,
                0
              );

            if (success) {
              console.log(
                `[PrimaryChordsPosition] ✅ Removed global: ${chordName}`
              );

              // 🌐 עדכון גלובוס בכל האקורדים הזהים בקרוסלה (עם delay קטן למניעת race condition)
              const timeoutId = setTimeout(() => {
                updateAllCarouselGlobes(chordName, currentPosition);
              }, 100);

              // Store timeout for potential cleanup
              const submenu = document.querySelector(
                ".primary-chords-position-submenu"
              );
              if (submenu) {
                if (!submenu.pendingTimeouts) {
                  submenu.pendingTimeouts = new Set();
                }
                submenu.pendingTimeouts.add(timeoutId);
              }
            } else {
              console.warn(
                `[PrimaryChordsPosition] ❌ Failed to remove global position`
              );
            }
          } else {
            // Save new global position
            console.log(
              `[PrimaryChordsPosition] 💾 Saving new global position`
            );

            const success =
              await window.databaseManager.saveGlobalChordPosition(
                chordName,
                currentPosition
              );

            if (success) {
              console.log(
                `[PrimaryChordsPosition] ✅ Saved global: ${chordName} = ${
                  currentPosition + 1
                }`
              );

              // 🌐 עדכון גלובוס בכל האקורדים הזהים בקרוסלה (עם delay קטן למניעת race condition)
              const timeoutId = setTimeout(() => {
                updateAllCarouselGlobes(chordName, currentPosition);
              }, 100);

              // Store timeout for potential cleanup
              const submenu = document.querySelector(
                ".primary-chords-position-submenu"
              );
              if (submenu) {
                if (!submenu.pendingTimeouts) {
                  submenu.pendingTimeouts = new Set();
                }
                submenu.pendingTimeouts.add(timeoutId);
              }
            } else {
              console.warn(
                `[PrimaryChordsPosition] ❌ Failed to save global position`
              );
            }
          }
        })
        .catch((error) => {
          console.error(
            "[PrimaryChordsPosition] Error in toggle logic:",
            error
          );
        });
    } else {
      console.warn(
        "[PrimaryChordsPosition] databaseManager methods not available"
      );
    }
  }
}

/**
 * 🔄 מרענן את כל הגלובוסים והחצים השחורים בכל האקורדים
 * אופטימיזציה: קריאה אחת לכל אקורד ייחודי (לא לכל חריץ)
 */
async function refreshAllGlobalIndicators() {
  console.log(
    "[PrimaryChordsPosition] 🔄 Starting refresh of all global indicators"
  );

  // בדיקת תלויות
  if (
    !window.addGlobalPositionIndicator ||
    !window.chordRenderer ||
    !window.databaseManager
  ) {
    console.warn("[PrimaryChordsPosition] ⚠️ Missing dependencies for refresh");
    return;
  }

  // הגבלת החיפוש לאזורים רלוונטיים בלבד (לא כל הדף!)
  const relevantContainers = [
    document.querySelector(".yc-chord-carousel"),
    document.querySelector(".yt-lyrics-chords-panel"),
    document.querySelector(".yc-preview-panel"),
  ].filter(Boolean);

  if (relevantContainers.length === 0) {
    console.log("[PrimaryChordsPosition] ℹ️ No relevant containers found");
    return;
  }

  // שלב 1: קיבוץ לפי שם אקורד (למניעת קריאות כפולות)
  const chordMap = new Map(); // chordName -> array of arrows

  // חיפוש רק בתוך הקונטיינרים הרלוונטיים
  for (const container of relevantContainers) {
    const arrows = container.querySelectorAll(
      ".chord-arrow-left[data-chord-name]"
    );

    arrows.forEach((arrow) => {
      const chordName = arrow.getAttribute("data-chord-name");
      if (!chordName) return;

      if (!chordMap.has(chordName)) {
        chordMap.set(chordName, []);
      }
      chordMap.get(chordName).push(arrow);
    });
  }

  console.log(
    "[PrimaryChordsPosition] 📊 Found",
    chordMap.size,
    "unique chords"
  );

  if (chordMap.size === 0) {
    console.log("[PrimaryChordsPosition] ℹ️ No chords to refresh");
    return;
  }

  // שלב 2: עיבוד כל אקורד ייחודי עם batching (5 בכל פעם)
  let updatedCount = 0;
  const BATCH_SIZE = 5;
  const chordEntries = Array.from(chordMap.entries());

  for (let i = 0; i < chordEntries.length; i += BATCH_SIZE) {
    const batch = chordEntries.slice(i, i + BATCH_SIZE);

    // עיבוד batch במקביל
    await Promise.all(
      batch.map(async ([chordName, arrows]) => {
        try {
          // קריאה אחת לפוזיציה נוכחית
          const currentPos = await window.chordRenderer.getCurrentChordPosition(
            chordName
          );

          // הוספת גלובוס וחץ שחור לכל החצים של אותו אקורד
          for (const arrow of arrows) {
            await window.addGlobalPositionIndicator(
              chordName,
              currentPos,
              arrow
            );
            updatedCount++;
          }

          console.log(
            "[PrimaryChordsPosition] ✅ Updated",
            arrows.length,
            "instances of",
            chordName
          );
        } catch (err) {
          console.error(
            "[PrimaryChordsPosition] ❌ Error refreshing",
            chordName,
            ":",
            err
          );
        }
      })
    );

    // קצת delay בין batches למניעת עומס יתר
    if (i + BATCH_SIZE < chordEntries.length) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  console.log(
    "[PrimaryChordsPosition] ✅ Refresh complete. Updated:",
    updatedCount,
    "arrows"
  );

  // ניקוי המפה
  chordMap.clear();
}

// Export to window for use by carousel
window.refreshAllGlobalIndicators = refreshAllGlobalIndicators;

// Initialize on load
chrome.storage.sync.get(
  [
    "primaryChordPositionEnabled",
    "globeIconEnabled",
    "blackArrowsEnabled",
    "blackPositionNumberEnabled",
  ],
  (result) => {
    const isEnabled = result.primaryChordPositionEnabled ?? true;
    const globeEnabled = result.globeIconEnabled ?? true;
    const blackArrowsEnabled = result.blackArrowsEnabled ?? true;
    const blackPositionNumberEnabled =
      result.blackPositionNumberEnabled ?? true;

    window.primaryChordPositionEnabled = isEnabled;
    window.globeIconEnabled = globeEnabled;
    window.blackArrowsEnabled = blackArrowsEnabled;
    window.blackPositionNumberEnabled = blackPositionNumberEnabled;

    if (isEnabled) {
      document.body.classList.add("yc-primary-chord-position-enabled");
      setupPositionCounterListeners(true);
      console.log(
        "[PrimaryChordsPosition] ✓ Initialized on load with listeners enabled"
      );
    }

    document.body.classList.toggle(
      "yc-globe-icon-enabled",
      Boolean(globeEnabled)
    );
    document.body.classList.toggle(
      "yc-black-arrows-enabled",
      Boolean(blackArrowsEnabled)
    );
    document.body.classList.toggle(
      "yc-black-position-number-enabled",
      Boolean(blackPositionNumberEnabled)
    );
  }
);
