// =============================================================
//  YouChords – tuningAlert.js
//  Tuning Alert - הודעה קופצת כשה-tuning שונה מ-440 Hz
// =============================================================

(function () {
  "use strict";

  const TUNING_ALERT_ENABLED_KEY = "youchords_tuning_alert_enabled";
  const TUNING_UPGRADE_ALERT_ENABLED_KEY = "youchords_tuning_upgrade_alert_enabled";
  const TUNING_MODE_KEY = "youchords_tuning_mode";
  let tuningAlertTimeout = null;

  // פונקציית עיגול חכמה - מעגל למספר שלם אלא אם זה בדיוק .5
  function smartRound(num) {
    const decimal = num - Math.floor(num);
    if (decimal === 0.5) {
      return num; // להשאיר 452.5 ככה
    }
    return Math.round(num);
  }

  // פונקציה לבניית כפתורי switch mode
  function buildSwitchButtons(currentMode) {
    const allModes = [
      { value: "none", label: "NONE" },
      { value: "songTuning", label: "PITCH" },
      { value: "guitarTuning", label: "GUITAR TUNER" }
    ];
    
    // סינון - רק modes שונים מהנוכחי
    const otherModes = allModes.filter(m => m.value !== currentMode);
    
    return otherModes.map(m => 
      `<button class="tuning-switch-btn" data-mode="${m.value}">${m.label}</button>`
    ).join("");
  }

  function showTuningAlert(tuningHz, mode = "none") {
    // מציאת ה-video player
    const player =
      document.querySelector("#movie_player") ||
      document.querySelector(".html5-video-player");
    if (!player) {
      console.warn("[TuningAlert] Video player not found");
      return;
    }

    // הסרת הודעה קודמת אם קיימת
    const existingAlert = player.querySelector(".tuning-alert-overlay");
    if (existingAlert) {
      existingAlert.remove();
      if (tuningAlertTimeout) {
        clearTimeout(tuningAlertTimeout);
        tuningAlertTimeout = null;
      }
    }

    // יצירת ה-overlay - טקסט שונה לפי mode
    const isGuitarMode = mode === "guitarTuning";
    const overlay = document.createElement("div");
    overlay.className = "tuning-alert-overlay";
    
    // עיגול חכם של ה-Hz להצגה
    const displayHz = smartRound(parseFloat(tuningHz));
    
    // בניית כפתורי switch
    const switchButtons = buildSwitchButtons(mode);
    
    if (isGuitarMode) {
      // Guitar Tuning mode - כמו הרגיל + שורה על Tuner button
      overlay.innerHTML = `
        <div class="tuning-alert-box">
          <button class="tuning-alert-close" title="Close">×</button>
          <div class="tuning-alert-header">
            <span class="tuning-alert-icon">⚠</span>
            <span class="tuning-alert-title">Non-Standard Tuning Detected</span>
          </div>
          <div class="tuning-alert-value">Tune your guitar to: ${displayHz} Hz</div>
          <div class="tuning-alert-subtitle">This song is not tuned to standard 440 Hz</div>
          <div class="tuning-alert-hint">Use the Tuner button to tune</div>
          <div class="tuning-switch-section">
            <span class="tuning-switch-label">Switch to:</span>
            <div class="tuning-switch-buttons">${switchButtons}</div>
          </div>
          <label class="tuning-alert-checkbox">
            <input type="checkbox" id="tuningDontShowAgain">
            <span>Don't show again for this song</span>
          </label>
        </div>
      `;
    } else if (mode === "songTuning") {
      // Pitch Change mode - הודעה עם מידע על שינוי pitch
      overlay.innerHTML = `
        <div class="tuning-alert-box">
          <button class="tuning-alert-close" title="Close">×</button>
          <div class="tuning-alert-header">
            <span class="tuning-alert-icon">⚠</span>
            <span class="tuning-alert-title">Non-Standard Tuning Detected</span>
          </div>
          <div class="tuning-alert-value">Pitch Audio Changed to 440 Hz</div>
          <div class="tuning-alert-subtitle">Original song tuning: ${displayHz} Hz</div>
          <div class="tuning-switch-section">
            <span class="tuning-switch-label">Switch to:</span>
            <div class="tuning-switch-buttons">${switchButtons}</div>
          </div>
          <label class="tuning-alert-checkbox">
            <input type="checkbox" id="tuningDontShowAgain">
            <span>Don't show again</span>
          </label>
        </div>
      `;
    } else {
      // None mode - הודעה רגילה (מידע בלבד)
      overlay.innerHTML = `
        <div class="tuning-alert-box">
          <button class="tuning-alert-close" title="Close">×</button>
          <div class="tuning-alert-header">
            <span class="tuning-alert-icon">⚠</span>
            <span class="tuning-alert-title">Non-Standard Tuning Detected</span>
          </div>
          <div class="tuning-alert-subtitle">This song is not tuned to standard 440 Hz</div>
          <div class="tuning-alert-value">Song Tuning: ${displayHz} Hz</div>
          <div class="tuning-switch-section">
            <span class="tuning-switch-label">Switch to:</span>
            <div class="tuning-switch-buttons">${switchButtons}</div>
          </div>
          <label class="tuning-alert-checkbox">
            <input type="checkbox" id="tuningDontShowAgain">
            <span>Don't show again</span>
          </label>
        </div>
      `;
    }

    // הזרקת סגנונות (פעם אחת)
    const styleId = "tuning-alert-styles";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .tuning-alert-overlay {
          position: absolute;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 99999;
        }
        .tuning-alert-box {
          background: #1a1a1a;
          border: 2px solid #f5a623;
          border-radius: 8px;
          padding: 24px 32px;
          color: white;
          font-family: 'Segoe UI', Arial, sans-serif;
          text-align: center;
          min-width: 320px;
        }
        .tuning-alert-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-bottom: 12px;
        }
        .tuning-alert-icon {
          color: #f5a623;
          font-size: 24px;
        }
        .tuning-alert-title {
          font-size: 20px;
          font-weight: bold;
          color: #fff;
        }
        .tuning-alert-subtitle {
          font-size: 16px;
          color: #ccc;
          margin-bottom: 16px;
        }
        .tuning-alert-value {
          font-size: 22px;
          font-weight: bold;
          color: #4ade80;
        }
        .tuning-alert-hint {
          font-size: 14px;
          color: #aaa;
          margin-top: 12px;
        }
        .tuning-alert-checkbox {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 16px;
          font-size: 14px;
          color: #aaa;
          cursor: pointer;
        }
        .tuning-alert-checkbox input {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }
        .tuning-alert-checkbox:hover {
          color: #fff;
        }
        .tuning-alert-close {
          position: absolute;
          top: -8px;
          right: -8px;
          background: none;
          border: none;
          color: #888;
          font-size: 32px;
          cursor: pointer;
          padding: 4px 10px;
          line-height: 1;
          transition: color 0.2s;
        }
        .tuning-alert-close:hover {
          color: #fff;
        }
        .tuning-alert-box {
          position: relative;
        }
        .tuning-switch-section {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .tuning-switch-label {
          font-size: 13px;
          color: #aaa;
        }
        .tuning-switch-buttons {
          display: flex;
          gap: 10px;
        }
        .tuning-switch-btn {
          background: #444;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }
        .tuning-switch-btn:hover {
          background: #5a9fd4;
        }
      `;
      document.head.appendChild(style);
    }

    // הוספה לתוך ה-video player
    player.appendChild(overlay);

    // פונקציה לסגירת ההודעה
    function closeAlert() {
      if (tuningAlertTimeout) {
        clearTimeout(tuningAlertTimeout);
        tuningAlertTimeout = null;
      }
      overlay.style.transition = "opacity 0.3s ease-out";
      overlay.style.opacity = "0";
      setTimeout(() => overlay.remove(), 300);
    }

    // Event listener לכפתור X
    const closeBtn = overlay.querySelector(".tuning-alert-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", closeAlert);
    }

    // Event listener ל-checkbox
    const checkbox = overlay.querySelector("#tuningDontShowAgain");
    if (checkbox) {
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          localStorage.setItem(TUNING_ALERT_ENABLED_KEY, "false");
          console.log("[TuningAlert] 🎸 Alert disabled by user");

          // עדכון ה-Toggle ב-Settings Menu אם פתוח
          if (window.refreshTuningToggleUI) {
            window.refreshTuningToggleUI();
          }

          // הסרה מיידית
          closeAlert();
        }
      });
    }

    // Event listeners לכפתורי switch mode
    const switchBtns = overlay.querySelectorAll(".tuning-switch-btn");
    switchBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const newMode = btn.dataset.mode;
        
        // שמירת ה-mode החדש
        localStorage.setItem(TUNING_MODE_KEY, newMode);
        console.log("[TuningAlert] 🔄 Mode switched to:", newMode);
        
        // עדכון ה-UI ב-Settings Menu אם פתוח
        if (window.updateTuningModeMenuState) {
          window.updateTuningModeMenuState(newMode);
        }
        
        // איפוס Tuner לפי mode
        if (newMode === "guitarTuning" && window.songTuningHz) {
          if (window.setTunerHz) {
            window.setTunerHz(window.songTuningHz);
          }
        } else {
          if (window.setTunerHz) {
            window.setTunerHz(440);
          }
        }
        
        // Reset pitch אם יוצאים מ-Pitch Change mode
        if (newMode !== "songTuning" && window.resetPitchFromPitchChange) {
          window.resetPitchFromPitchChange();
        }
        
        // Apply pitch אם נכנסים ל-Pitch Change mode ופאנל/קרוסלה פתוחים
        if (newMode === "songTuning" && (window.chordsActive || window.lyricsChordsPanelActive)) {
          if (window.songTuningHz && window.applyTuningCorrection) {
            window.applyTuningCorrection(window.songTuningHz);
          }
        }
        
        // סגירת ההודעה הנוכחית והצגת הודעה חדשה עם ה-mode החדש
        closeAlert();
        
        // הצגת הודעה חדשה עם ה-mode החדש (אחרי delay קצר)
        setTimeout(() => {
          showTuningAlert(tuningHz, newMode);
        }, 350);
      });
    });

    // סגירה אוטומטית אחרי 8 שניות
    tuningAlertTimeout = setTimeout(() => {
      if (overlay.parentNode) {
        overlay.style.transition = "opacity 0.5s ease-out";
        overlay.style.opacity = "0";
        setTimeout(() => overlay.remove(), 500);
      }
    }, 8000);

    console.log(`[TuningAlert] 🎸 Showing alert: ${tuningHz} Hz`);
  }

  function applyTuningCorrection(tuningValue) {
    if (!tuningValue) return;

    // פרסור הערך (יכול להיות "452.37" או "452.37 Hz")
    const tuningHz = parseFloat(tuningValue.toString().replace(/[^\d.]/g, ""));
    if (isNaN(tuningHz)) return;

    // קריאת ה-mode מ-localStorage
    const mode = localStorage.getItem(TUNING_MODE_KEY) || "guitarTuning";
    
    // שמירת ה-Hz לשימוש ב-Tuner (לכל ה-modes, לא רק Guitar Tuning)
    if (tuningHz !== 440) {
      window.songTuningHz = Math.round(tuningHz);
      console.log(`[TuningAlert] 🎸 Saved songTuningHz = ${window.songTuningHz}`);
    }
    
    // Pitch Change mode - שינוי pitch כשפאנל/קרוסלה פתוחים
    // רק אם ההפרש מ-440 גדול מ-6 Hz (טווח נורמלי: 434-446 Hz)
    const pitchDiff = Math.abs(tuningHz - 440);
    if (mode === "songTuning" && pitchDiff > 6) {
      // הנוסחה: pitch בפועל = 440 - (songHz - 440)
      const targetPitch = 440 - (tuningHz - 440);
      if (window.setPitchForPitchChange) {
        window.setPitchForPitchChange(targetPitch);
        console.log(`[TuningAlert] 🎵 Pitch Change: ${tuningHz} Hz → ${targetPitch.toFixed(1)} Hz (UI shows 440 Hz)`);
      }
    } else if (mode === "songTuning" && pitchDiff <= 6) {
      console.log(`[TuningAlert] 🎵 Tuning ${tuningHz} Hz is within normal range (±6 Hz from 440), no pitch adjustment needed`);
    }
    
    // הודעה מוצגת רק אם ההפרש > 6 Hz וה-Toggle מופעל
    const alertEnabled = localStorage.getItem(TUNING_ALERT_ENABLED_KEY) !== "false";
    const diff = Math.abs(tuningHz - 440);
    if (alertEnabled && diff > 6) {
      showTuningAlert(tuningHz.toFixed(2), mode);
    }
  }

  // הודעת Upgrade to Pro+ עבור Non-Standard Tuning (למשתמשים שאינם Pro+)
  function showNonStandardTuningUpgradeAlert() {
    console.log("[TuningAlert] 🎯 showNonStandardTuningUpgradeAlert called");

    const player =
      document.querySelector("#movie_player") ||
      document.querySelector(".html5-video-player");
    if (!player) {
      console.warn("[TuningAlert] Video player not found");
      return;
    }
    console.log("[TuningAlert] ✅ Player found:", player);

    // הסרת הודעה קודמת אם קיימת
    const existingAlert = player.querySelector(".tuning-alert-overlay");
    if (existingAlert) {
      existingAlert.remove();
      if (tuningAlertTimeout) {
        clearTimeout(tuningAlertTimeout);
        tuningAlertTimeout = null;
      }
    }

    const overlay = document.createElement("div");
    overlay.className = "tuning-alert-overlay";
    overlay.innerHTML = `
      <div class="tuning-alert-box tuning-upgrade-box">
        <button class="tuning-alert-close" title="Close">×</button>
        <div class="tuning-alert-header">
          <span class="tuning-alert-title">Non-Standard Tuning Detected</span>
        </div>
        <div class="tuning-alert-subtitle">This song is not in standard 440 Hz</div>
        <div class="tuning-upgrade-warning">Your guitar might sound out of tune</div>
        <div class="tuning-upgrade-description">Upgrade for automatic pitch fix</div>
        <button class="tuning-upgrade-btn">Upgrade to Pro<span class="pro-plus-gold">+</span></button>
        <label class="tuning-alert-checkbox">
          <input type="checkbox" id="tuningDontShowAgain">
          <span>Don't show again</span>
        </label>
      </div>
    `;

    // הזרקת סגנונות בסיסיים (אם לא קיימים)
    const styleId = "tuning-alert-styles";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .tuning-alert-overlay {
          position: absolute;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 99999;
        }
        .tuning-alert-box {
          background: #1a1a1a;
          border: 2px solid #f5a623;
          border-radius: 8px;
          padding: 24px 32px;
          color: white;
          font-family: 'Segoe UI', Arial, sans-serif;
          text-align: center;
          min-width: 320px;
          position: relative;
        }
        .tuning-alert-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-bottom: 12px;
        }
        .tuning-alert-icon {
          font-size: 24px;
        }
        .tuning-alert-title {
          font-size: 20px;
          font-weight: bold;
          color: #fff;
        }
        .tuning-alert-subtitle {
          font-size: 16px;
          color: #ccc;
          margin-bottom: 16px;
        }
        .tuning-alert-close {
          position: absolute;
          top: -8px;
          right: -8px;
          background: none;
          border: none;
          color: #888;
          font-size: 32px;
          cursor: pointer;
          padding: 4px 10px;
          line-height: 1;
          transition: color 0.2s;
        }
        .tuning-alert-close:hover {
          color: #fff;
        }
      `;
      document.head.appendChild(style);
    }

    // הזרקת סגנונות נוספים להודעת Upgrade
    const upgradeStyleId = "tuning-upgrade-styles";
    if (!document.getElementById(upgradeStyleId)) {
      const style = document.createElement("style");
      style.id = upgradeStyleId;
      style.textContent = `
        .tuning-upgrade-box {
          border-color: #8b5cf6 !important;
        }
        .tuning-upgrade-warning {
          font-size: 15px;
          color: #f5a623;
          margin: 8px 0;
          line-height: 1.4;
        }
        .tuning-upgrade-description {
          font-size: 15px;
          color: #aaa;
          margin: 8px 0 16px 0;
          line-height: 1.4;
        }
        .tuning-upgrade-btn {
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          margin-top: 8px;
          transition: transform 0.2s, box-shadow 0.2s;
          display: block;
          width: fit-content;
          margin-left: auto;
          margin-right: auto;
        }
        .tuning-upgrade-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);
        }
        .pro-plus-gold {
          color: #facc15;
        }
      `;
      document.head.appendChild(style);
    }

    player.appendChild(overlay);

    // פונקציה לסגירת ההודעה
    function closeAlert() {
      if (tuningAlertTimeout) {
        clearTimeout(tuningAlertTimeout);
        tuningAlertTimeout = null;
      }
      overlay.style.transition = "opacity 0.3s ease-out";
      overlay.style.opacity = "0";
      setTimeout(() => overlay.remove(), 300);
    }

    // Event listener לכפתור X
    const closeBtn = overlay.querySelector(".tuning-alert-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", closeAlert);
    }

    // Event listener לכפתור Upgrade
    const upgradeBtn = overlay.querySelector(".tuning-upgrade-btn");
    if (upgradeBtn) {
      upgradeBtn.addEventListener("click", () => {
        if (window.__ycOpenUpgradePage) {
          window.__ycOpenUpgradePage();
        } else {
          window.open("https://www.you-chords.com/upgrade", "_blank");
        }
        closeAlert();
      });
    }

    // Event listener ל-checkbox (Upgrade Alert)
    const checkbox = overlay.querySelector("#tuningDontShowAgain");
    if (checkbox) {
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          localStorage.setItem(TUNING_UPGRADE_ALERT_ENABLED_KEY, "false");
          console.log("[TuningAlert] 🎸 General Alert disabled by user");

          // עדכון ה-Toggle ב-Settings Menu אם פתוח
          if (window.refreshTuningToggleUI) {
            window.refreshTuningToggleUI();
          }

          // הסרה מיידית
          closeAlert();
        }
      });
    }

    // סגירה אוטומטית אחרי 8 שניות
    tuningAlertTimeout = setTimeout(() => {
      if (overlay.parentNode) {
        overlay.style.transition = "opacity 0.5s ease-out";
        overlay.style.opacity = "0";
        setTimeout(() => overlay.remove(), 500);
      }
    }, 8000);

    console.log("[TuningAlert] 🎸 Showing UPGRADE alert for non-Pro+ user");
  }

  // בדיקה והצגת הודעה מתאימה - נקראת עם tuningValue ו-hasNonStandardTuning
  function checkNonStandardTuning(tuningValue, hasNonStandardTuning) {
    console.log("[TuningAlert] 🔍 checkNonStandardTuning:", { tuningValue, hasNonStandardTuning });

    // קריאת ה-mode מ-localStorage
    const mode = localStorage.getItem(TUNING_MODE_KEY) || "guitarTuning";

    // פרסור tuningValue
    const tuningHz = tuningValue ? parseFloat(tuningValue.toString().replace(/[^\d.]/g, "")) : 0;
    const hasValidTuning = !isNaN(tuningHz) && tuningHz > 0 && Math.abs(tuningHz - 440) > 6;

    // אם יש tuningValue תקין (Pro+ user) - הודעה רגילה
    if (hasValidTuning) {
      const alertEnabled = localStorage.getItem(TUNING_ALERT_ENABLED_KEY) !== "false";
      if (!alertEnabled) {
        console.log("[TuningAlert] ⏭️ Tuning Alert disabled by user");
        // עדיין מפעילים את applyTuningCorrection לשינוי pitch, רק בלי הודעה
        applyTuningCorrection(tuningValue);
        return;
      }
      console.log("[TuningAlert] ✅ Pro+ user with tuning value:", tuningHz);
      applyTuningCorrection(tuningValue);
      return;
    }

    // Free/Pro now share the same feature set; skip legacy upgrade alert flow.
    if (hasNonStandardTuning === true) {
      console.log("[TuningAlert] ℹ️ Non-standard tuning flag present but no numeric tuning value");
      return;
    }

    console.log("[TuningAlert] ⏭️ No non-standard tuning detected");
  }

  // חשיפה ל-window
  window.applyTuningCorrection = applyTuningCorrection;
  window.showTuningAlert = showTuningAlert;
  window.checkNonStandardTuning = checkNonStandardTuning;

  console.log("[TuningAlert] ✅ Module loaded");
})();
