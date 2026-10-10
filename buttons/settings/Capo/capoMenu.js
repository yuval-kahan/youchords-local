// Capo submenu for capo settings

// Storage keys
const CAPO_FEATURE_ENABLED_KEY = "youchords_capo_feature_enabled"; // שליטה על הפיצ'ר
const CAPO_SHOW_RELATIVE_CHANGE_KEY = "youchords_capo_show_relative_change";
const CAPO_SHOW_BASE_CHANGE_KEY = "youchords_capo_show_base_change";

// 🔄 Global function to refresh toggle UI from localStorage
window.refreshCapoToggleUI = function () {
  const toggle = document.querySelector(".capo-toggle");
  if (!toggle) return;

  const toggleKnob = toggle.querySelector("div");
  if (!toggleKnob) return;

  // 🆕 משתמש ב-CAPO_FEATURE_ENABLED_KEY - ברירת מחדל ON
  const isEnabled = localStorage.getItem(CAPO_FEATURE_ENABLED_KEY) !== "false";
  toggle.style.background = isEnabled ? "#4ade80" : "#555";
  toggleKnob.style.left = isEnabled ? "22px" : "2px";
};

// Create capo submenu element
window.createCapoSubmenu = function (parentMenu) {
  const submenu = document.createElement("div");
  submenu.className = "settings-menu capo-submenu yc";
  submenu.setAttribute("data-yc-menu", "capo");
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
  headerText.textContent = "Capo";
  headerText.style.fontWeight = "500";

  header.appendChild(backButton);
  header.appendChild(headerText);
  submenu.appendChild(header);

  // ═══════════════════════════════════════════════════════════
  // Toggle Section - Capo Feature ON/OFF (לא הקאפו עצמו!)
  // ═══════════════════════════════════════════════════════════
  const toggleSection = document.createElement("div");
  toggleSection.style.cssText = `
    padding: 12px 24px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  `;

  // 🆕 Load saved state - ברירת מחדל ON
  const capoEnabled = localStorage.getItem(CAPO_FEATURE_ENABLED_KEY) !== "false";

  const toggleRow = document.createElement("div");
  toggleRow.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;

  const toggleLabel = document.createElement("span");
  toggleLabel.textContent = "Capo";
  toggleLabel.style.cssText = "font-size: 13px; color: #fff;";

  const toggle = document.createElement("div");
  toggle.className = "capo-toggle";
  toggle.style.cssText = `
    width: 44px;
    height: 24px;
    background: ${capoEnabled ? "#4ade80" : "#555"};
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
    left: ${capoEnabled ? "22px" : "2px"};
    transition: left 0.2s;
  `;
  toggle.appendChild(toggleKnob);

  toggleRow.appendChild(toggleLabel);
  toggleRow.appendChild(toggle);
  toggleSection.appendChild(toggleRow);
  submenu.appendChild(toggleSection);

  // ═══════════════════════════════════════════════════════════
  // Sync Toggle Section - מתחת ל-Capo Toggle
  // ═══════════════════════════════════════════════════════════
  const syncSection = document.createElement("div");
  syncSection.style.cssText = `
    padding: 12px 24px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  `;

  // Load saved sync state - ברירת מחדל ON
  const syncEnabled = localStorage.getItem("youchords_capo_sync_enabled") !== "false";

  const syncRow = document.createElement("div");
  syncRow.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;

  const syncLabel = document.createElement("span");
  syncLabel.textContent = "Sync Panel & Carousel";
  syncLabel.style.cssText = "font-size: 13px; color: #fff;";

  const syncToggle = document.createElement("div");
  syncToggle.className = "capo-sync-toggle";
  syncToggle.style.cssText = `
    width: 44px;
    height: 24px;
    background: ${syncEnabled ? "#4ade80" : "#555"};
    border-radius: 12px;
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
  `;

  const syncKnob = document.createElement("div");
  syncKnob.style.cssText = `
    position: absolute;
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    top: 2px;
    left: ${syncEnabled ? "22px" : "2px"};
    transition: left 0.2s;
  `;
  syncToggle.appendChild(syncKnob);

  // Event listener will be added by updateDependentToggles

  syncRow.appendChild(syncLabel);
  syncRow.appendChild(syncToggle);
  syncSection.appendChild(syncRow);
  submenu.appendChild(syncSection);

  // ═══════════════════════════════════════════════════════════
  // Auto Hide Toggle - הסתרת קאפו בקרוסלה
  // ═══════════════════════════════════════════════════════════
  const hideSection = document.createElement("div");
  hideSection.style.cssText = "padding: 12px 24px; border-bottom: 1px solid rgba(255,255,255,0.1);";
  const hideEnabled = localStorage.getItem("youchords_capo_auto_hide") !== "false";
  const hideRow = document.createElement("div");
  hideRow.style.cssText = "display: flex; align-items: center; justify-content: space-between;";
  const hideLabel = document.createElement("span");
  hideLabel.textContent = "Auto Hide in Carousel";
  hideLabel.style.cssText = "font-size: 13px; color: #fff;";
  const hideToggle = document.createElement("div");
  hideToggle.className = "capo-hide-toggle";
  hideToggle.style.cssText = "width: 44px; height: 24px; background: " + (hideEnabled ? "#4ade80" : "#555") + "; border-radius: 12px; position: relative; cursor: pointer; transition: background 0.2s;";
  const hideKnob = document.createElement("div");
  hideKnob.style.cssText = "position: absolute; width: 20px; height: 20px; background: white; border-radius: 50%; top: 2px; left: " + (hideEnabled ? "22px" : "2px") + "; transition: left 0.2s;";
  hideToggle.appendChild(hideKnob);
  // Event listener will be added by updateDependentToggles
  hideRow.appendChild(hideLabel);
  hideRow.appendChild(hideToggle);
  hideSection.appendChild(hideRow);
  submenu.appendChild(hideSection);

  const relativeSection = document.createElement("div");
  relativeSection.style.cssText = "padding: 12px 24px; border-bottom: 1px solid rgba(255,255,255,0.1);";
  const relativeEnabled = localStorage.getItem(CAPO_SHOW_RELATIVE_CHANGE_KEY) === "true";
  const relativeRow = document.createElement("div");
  relativeRow.style.cssText = "display: flex; align-items: center; justify-content: space-between;";
  const relativeLabel = document.createElement("span");
  relativeLabel.textContent = "Show Relative Change";
  relativeLabel.style.cssText = "font-size: 13px; color: #fff;";
  const relativeToggle = document.createElement("div");
  relativeToggle.className = "capo-relative-toggle";
  relativeToggle.style.cssText = `
    width: 44px;
    height: 24px;
    background: ${relativeEnabled ? "#4ade80" : "#555"};
    border-radius: 12px;
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
  `;
  const relativeKnob = document.createElement("div");
  relativeKnob.style.cssText = `
    position: absolute;
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    top: 2px;
    left: ${relativeEnabled ? "22px" : "2px"};
    transition: left 0.2s;
  `;
  relativeToggle.appendChild(relativeKnob);
  relativeRow.appendChild(relativeLabel);
  relativeRow.appendChild(relativeToggle);
  relativeSection.appendChild(relativeRow);
  submenu.appendChild(relativeSection);

  const baseSection = document.createElement("div");
  baseSection.style.cssText = "padding: 12px 24px; border-bottom: 1px solid rgba(255,255,255,0.1);";
  const baseEnabled = localStorage.getItem(CAPO_SHOW_BASE_CHANGE_KEY) === "true";
  const baseRow = document.createElement("div");
  baseRow.style.cssText = "display: flex; align-items: center; justify-content: space-between;";
  const baseLabel = document.createElement("span");
  baseLabel.textContent = "Show Change From Base";
  baseLabel.style.cssText = "font-size: 13px; color: #fff;";
  const baseToggle = document.createElement("div");
  baseToggle.className = "capo-base-toggle";
  baseToggle.style.cssText = `
    width: 44px;
    height: 24px;
    background: ${baseEnabled ? "#4ade80" : "#555"};
    border-radius: 12px;
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
  `;
  const baseKnob = document.createElement("div");
  baseKnob.style.cssText = `
    position: absolute;
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    top: 2px;
    left: ${baseEnabled ? "22px" : "2px"};
    transition: left 0.2s;
  `;
  baseToggle.appendChild(baseKnob);
  baseRow.appendChild(baseLabel);
  baseRow.appendChild(baseToggle);
  baseSection.appendChild(baseRow);
  submenu.appendChild(baseSection);

  // ═══════════════════════════════════════════════════════════
  // Toggle click handler - שולט על הפיצ'ר
  // ═══════════════════════════════════════════════════════════
  
  // Function to update dependent toggles (Sync & Auto Hide) based on Capo state
  function updateDependentToggles(isCapoEnabled) {
    const disabledTextColor = "#888";
    
    // Get current toggle elements
    const currentSyncToggle = syncRow.querySelector(".capo-sync-toggle");
    const currentHideToggle = hideRow.querySelector(".capo-hide-toggle");
    const currentRelativeToggle = relativeRow.querySelector(".capo-relative-toggle");
    const currentBaseToggle = baseRow.querySelector(".capo-base-toggle");
    
    if (isCapoEnabled) {
      // Enable Sync toggle
      syncRow.style.cursor = "default";
      syncLabel.style.color = "#fff";
      if (currentSyncToggle) {
        currentSyncToggle.style.cursor = "pointer";
        currentSyncToggle.style.opacity = "1";
        currentSyncToggle.style.pointerEvents = "auto";
      }
      
      // Enable Hide toggle
      hideRow.style.cursor = "default";
      hideLabel.style.color = "#fff";
      if (currentHideToggle) {
        currentHideToggle.style.cursor = "pointer";
        currentHideToggle.style.opacity = "1";
        currentHideToggle.style.pointerEvents = "auto";
      }

      relativeRow.style.cursor = "default";
      relativeLabel.style.color = "#fff";
      if (currentRelativeToggle) {
        currentRelativeToggle.style.cursor = "pointer";
        currentRelativeToggle.style.opacity = "1";
        currentRelativeToggle.style.pointerEvents = "auto";
      }

      baseRow.style.cursor = "default";
      baseLabel.style.color = "#fff";
      if (currentBaseToggle) {
        currentBaseToggle.style.cursor = "pointer";
        currentBaseToggle.style.opacity = "1";
        currentBaseToggle.style.pointerEvents = "auto";
      }
    } else {
      // Disable Sync toggle
      syncRow.style.cursor = "not-allowed";
      syncLabel.style.color = disabledTextColor;
      if (currentSyncToggle) {
        currentSyncToggle.style.cursor = "not-allowed";
        currentSyncToggle.style.opacity = "0.5";
        currentSyncToggle.style.pointerEvents = "none";
      }
      
      // Disable Hide toggle
      hideRow.style.cursor = "not-allowed";
      hideLabel.style.color = disabledTextColor;
      if (currentHideToggle) {
        currentHideToggle.style.cursor = "not-allowed";
        currentHideToggle.style.opacity = "0.5";
        currentHideToggle.style.pointerEvents = "none";
      }

      relativeRow.style.cursor = "not-allowed";
      relativeLabel.style.color = disabledTextColor;
      if (currentRelativeToggle) {
        currentRelativeToggle.style.cursor = "not-allowed";
        currentRelativeToggle.style.opacity = "0.5";
        currentRelativeToggle.style.pointerEvents = "none";
      }

      baseRow.style.cursor = "not-allowed";
      baseLabel.style.color = disabledTextColor;
      if (currentBaseToggle) {
        currentBaseToggle.style.cursor = "not-allowed";
        currentBaseToggle.style.opacity = "0.5";
        currentBaseToggle.style.pointerEvents = "none";
      }
    }
  }
  
  // Click handlers for toggles
  syncToggle.addEventListener("click", () => {
    const currentSync = localStorage.getItem("youchords_capo_sync_enabled") !== "false";
    const newSync = !currentSync;
    
    if (window.CapoIcon && window.CapoIcon.setSyncEnabled) {
      window.CapoIcon.setSyncEnabled(newSync);
    } else {
      localStorage.setItem("youchords_capo_sync_enabled", newSync.toString());
    }
    
    const st = syncRow.querySelector(".capo-sync-toggle");
    const sk = st?.querySelector("div");
    if (st && sk) {
      st.style.background = newSync ? "#4ade80" : "#555";
      sk.style.left = newSync ? "22px" : "2px";
    }
    console.log("[CapoMenu] Sync toggled:", newSync);
  });
  
  hideToggle.addEventListener("click", function() {
    const currentHide = localStorage.getItem("youchords_capo_auto_hide") !== "false";
    const newHide = !currentHide;
    localStorage.setItem("youchords_capo_auto_hide", newHide.toString());
    const carouselCapo = document.querySelector(".yc-capo-carousel");
    if (carouselCapo) {
      if (newHide) {
        carouselCapo.style.removeProperty("opacity");
        carouselCapo.style.removeProperty("visibility");
      } else {
        carouselCapo.style.setProperty("opacity", "1", "important");
        carouselCapo.style.setProperty("visibility", "visible", "important");
      }
    }
    if (window.CapoIcon && window.CapoIcon.updateCarouselLayout) {
      window.CapoIcon.updateCarouselLayout();
    }
    const ht = hideRow.querySelector(".capo-hide-toggle");
    const hk = ht?.querySelector("div");
    if (ht && hk) {
      ht.style.background = newHide ? "#4ade80" : "#555";
      hk.style.left = newHide ? "22px" : "2px";
    }
    console.log("[CapoMenu] Auto Hide toggled:", newHide);
  });

  relativeToggle.addEventListener("click", () => {
    const currentRelative = localStorage.getItem(CAPO_SHOW_RELATIVE_CHANGE_KEY) === "true";
    const newRelative = !currentRelative;

    if (window.CapoIcon && window.CapoIcon.setDropdownShowRelativeChange) {
      window.CapoIcon.setDropdownShowRelativeChange(newRelative);
    } else {
      localStorage.setItem(CAPO_SHOW_RELATIVE_CHANGE_KEY, newRelative.toString());
    }

    const rt = relativeRow.querySelector(".capo-relative-toggle");
    const rk = rt?.querySelector("div");
    if (rt && rk) {
      rt.style.background = newRelative ? "#4ade80" : "#555";
      rk.style.left = newRelative ? "22px" : "2px";
    }
    console.log("[CapoMenu] Relative change toggled:", newRelative);
  });

  baseToggle.addEventListener("click", () => {
    const currentBase = localStorage.getItem(CAPO_SHOW_BASE_CHANGE_KEY) === "true";
    const newBase = !currentBase;

    if (window.CapoIcon && window.CapoIcon.setDropdownShowBaseChange) {
      window.CapoIcon.setDropdownShowBaseChange(newBase);
    } else {
      localStorage.setItem(CAPO_SHOW_BASE_CHANGE_KEY, newBase.toString());
    }

    const bt = baseRow.querySelector(".capo-base-toggle");
    const bk = bt?.querySelector("div");
    if (bt && bk) {
      bt.style.background = newBase ? "#4ade80" : "#555";
      bk.style.left = newBase ? "22px" : "2px";
    }
    console.log("[CapoMenu] Base change toggled:", newBase);
  });
  
  // Initial state
  updateDependentToggles(capoEnabled);
  
  toggle.addEventListener("click", () => {
    // 🆕 Toggle the FEATURE, not the capo itself
    const currentEnabled = localStorage.getItem(CAPO_FEATURE_ENABLED_KEY) !== "false";
    const newEnabled = !currentEnabled;
    
    // Use CapoIcon.setFeatureEnabled if available
    if (window.CapoIcon && window.CapoIcon.setFeatureEnabled) {
      window.CapoIcon.setFeatureEnabled(newEnabled);
    } else {
      // Fallback if CapoIcon not loaded
      localStorage.setItem(CAPO_FEATURE_ENABLED_KEY, newEnabled.toString());
    }
    
    // Update UI
    toggle.style.background = newEnabled ? "#4ade80" : "#555";
    toggleKnob.style.left = newEnabled ? "22px" : "2px";
    
    // Update dependent toggles
    updateDependentToggles(newEnabled);

    console.log("[CapoMenu] Capo FEATURE toggled:", newEnabled);
  });

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
window.disposeCapoSubmenu = function (submenu, remove = false) {
  if (!submenu) {
    submenu = document.querySelector(".capo-submenu");
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
  window.disposeCapoSubmenu(null, true);
});
