// Tuning submenu for tuning alert settings

// Storage keys
const TUNING_ALERT_ENABLED_KEY = "youchords_tuning_alert_enabled";
const TUNING_MODE_KEY = "youchords_tuning_mode";

// Helper to update menu UI based on selected mode
function updateTuningModeMenuState(selectedMode) {
  const buttons = document.querySelectorAll(".tuning-mode-button");
  buttons.forEach((btn) => {
    const mode = btn.dataset.modeValue;
    const check = btn.querySelector(".mode-check");
    const label = btn.querySelector(".mode-label");
    if (mode === selectedMode) {
      check.style.opacity = "1";
      label.style.color = "#3ea6ff";
    } else {
      check.style.opacity = "0";
      label.style.color = "#fff";
    }
  });
}

// Expose update function globally
window.updateTuningModeMenuState = updateTuningModeMenuState;

// 🔄 Global function to refresh toggle UI from localStorage
window.refreshTuningToggleUI = function () {
  const toggle = document.querySelector(".tuning-alert-toggle");
  if (toggle) {
    const toggleKnob = toggle.querySelector("div");
    if (toggleKnob) {
      const isEnabled = localStorage.getItem(TUNING_ALERT_ENABLED_KEY) !== "false";
      toggle.style.background = isEnabled ? "#4ade80" : "#555";
      toggleKnob.style.left = isEnabled ? "22px" : "2px";
    }
  }
};

// Create tuning submenu element
window.createTuningSubmenu = function (parentMenu) {
  const submenu = document.createElement("div");
  submenu.className = "settings-menu tuning-submenu yc";
  submenu.setAttribute("data-yc-menu", "tuning");
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

  backButton.addEventListener("click", () => {
    submenu.style.display = "none";
    if (parentMenu) parentMenu.style.display = "block";
  });

  const headerText = document.createElement("span");
  headerText.textContent = "Tuning";
  headerText.style.fontWeight = "500";

  header.appendChild(backButton);
  header.appendChild(headerText);
  submenu.appendChild(header);

  // ═══════════════════════════════════════════════════════════
  // Toggle Section - Show Tuning Alert
  // ═══════════════════════════════════════════════════════════
  const toggleSection = document.createElement("div");
  toggleSection.style.cssText = `
    padding: 12px 24px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  `;

  // Load saved state
  const alertEnabled = localStorage.getItem(TUNING_ALERT_ENABLED_KEY) !== "false";

  const toggleRow = document.createElement("div");
  toggleRow.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;

  const toggleLabel = document.createElement("span");
  toggleLabel.textContent = "Show Tuning Alert";
  toggleLabel.style.cssText = "font-size: 13px; color: #fff;";

  const toggle = document.createElement("div");
  toggle.className = "tuning-alert-toggle";
  toggle.style.cssText = `
    width: 44px;
    height: 24px;
    background: ${alertEnabled ? "#4ade80" : "#555"};
    border-radius: 12px;
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
  `;

  const toggleKnob = document.createElement("div");
  toggleKnob.style.cssText = `
    position: absolute;
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    top: 2px;
    left: ${alertEnabled ? "22px" : "2px"};
    transition: left 0.2s;
  `;
  toggle.appendChild(toggleKnob);

  toggleRow.appendChild(toggleLabel);
  toggleRow.appendChild(toggle);
  toggleSection.appendChild(toggleRow);

  // ═══════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════
  submenu.appendChild(toggleSection);

  // ═══════════════════════════════════════════════════════════
  // Mode Options Section
  // ═══════════════════════════════════════════════════════════
  const optionsContainer = document.createElement("div");
  optionsContainer.className = "tuning-mode-options";
  optionsContainer.style.cssText = `
    padding: 8px 0;
  `;

  // Load saved mode
  const savedMode = localStorage.getItem(TUNING_MODE_KEY) || "guitarTuning";

  const modes = [
    { value: "songTuning", label: "Pitch Change" },
    { value: "guitarTuning", label: "Guitar Tuning" },
    { value: "none", label: "None" },
  ];

  modes.forEach((mode) => {
    const item = document.createElement("div");
    item.className = "settings-item tuning-mode-button";
    item.dataset.modeValue = mode.value;
    item.style.cssText = `
      padding: 12px 24px;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      user-select: none;
      -webkit-user-select: none;
    `;

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "8px";

    const check = document.createElement("span");
    check.textContent = "✓";
    check.className = "mode-check";
    check.style.cssText = `
      color: #3ea6ff;
      opacity: ${mode.value === savedMode ? "1" : "0"};
      font-weight: bold;
      display: inline-block;
    `;

    const label = document.createElement("span");
    label.className = "mode-label";
    label.textContent = mode.label;
    label.style.color = mode.value === savedMode ? "#3ea6ff" : "#fff";

    wrapper.appendChild(check);
    wrapper.appendChild(label);
    item.appendChild(wrapper);

    item.addEventListener("mouseover", () => {
      item.style.backgroundColor = "rgba(255,255,255,0.1)";
    });
    item.addEventListener("mouseout", () => {
      item.style.backgroundColor = "transparent";
    });
    item.addEventListener("click", () => {
      localStorage.setItem(TUNING_MODE_KEY, mode.value);
      updateTuningModeMenuState(mode.value);
      
      // איפוס Tuner לפי mode
      if (mode.value === "guitarTuning" && window.songTuningHz) {
        // Guitar Tuning - Hz wheel = songHz
        if (window.setTunerHz) {
          window.setTunerHz(window.songTuningHz);
        }
        console.log("[TuningMenu] Guitar Tuning: Hz wheel = " + window.songTuningHz);
      } else {
        // Pitch Change / None - Hz wheel = 440
        if (window.setTunerHz) {
          window.setTunerHz(440);
        }
        console.log("[TuningMenu] " + mode.value + ": Hz wheel = 440");
      }
      
      // Reset pitch אם יוצאים מ-Pitch Change mode
      if (mode.value !== "songTuning" && window.resetPitchFromPitchChange) {
        window.resetPitchFromPitchChange();
        console.log("[TuningMenu] Reset pitch from Pitch Change mode");
      }
      
      // 🎵 Apply pitch אם נכנסים ל-Pitch Change mode ופאנל/קרוסלה פתוחים
      if (mode.value === "songTuning" && (window.chordsActive || window.lyricsChordsPanelActive)) {
        if (window.songTuningHz && window.applyTuningCorrection) {
          window.applyTuningCorrection(window.songTuningHz);
          console.log("[TuningMenu] Applied pitch change for open panel/carousel");
        }
      }
      
      console.log("[TuningMenu] Mode changed to:", mode.value);
    });

    optionsContainer.appendChild(item);
  });

  submenu.appendChild(optionsContainer);

  // ═══════════════════════════════════════════════════════════
  // Toggle click handler
  // ═══════════════════════════════════════════════════════════
  toggle.addEventListener("click", () => {
    const currentEnabled = localStorage.getItem(TUNING_ALERT_ENABLED_KEY) !== "false";
    const newEnabled = !currentEnabled;
    localStorage.setItem(TUNING_ALERT_ENABLED_KEY, newEnabled.toString());

    toggle.style.background = newEnabled ? "#4ade80" : "#555";
    toggleKnob.style.left = newEnabled ? "22px" : "2px";

    console.log("[TuningMenu] Alert enabled:", newEnabled);
  });

  // ═══════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════
  // Observe visibility to adjust position
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      if (m.type === "attributes" && submenu.style.display === "block") {
        const controls = document.querySelector(".ytp-chrome-bottom");
        if (controls) {
          const rect = controls.getBoundingClientRect();
          submenu.style.bottom = `${rect.height}px`;
          submenu.style.right = "12px";
        }
      }
    });
  });

  observer.observe(submenu, { attributes: true, attributeFilter: ["style"] });
  submenu.observer = observer;

  submenu.addEventListener("click", (e) => e.stopPropagation());

  return submenu;
};

// Helper to disconnect observer and optionally remove the submenu
window.disposeTuningSubmenu = function (submenu, remove = false) {
  if (!submenu) {
    submenu = document.querySelector(".tuning-submenu");
  }
  if (submenu) {
    if (submenu.observer) {
      submenu.observer.disconnect();
      delete submenu.observer;
    }
    if (remove && submenu.isConnected) {
      submenu.remove();
    }
  }
};

// 🧹 Cleanup on video navigation to prevent memory leaks
window.addEventListener("yt-navigate-finish", () => {
  window.disposeTuningSubmenu(null, true);
});
