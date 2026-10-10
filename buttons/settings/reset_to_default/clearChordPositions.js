// clearChordPositions.js - Clear chord positions from IndexedDB
// Memory-safe implementation with proper cleanup

/**
 * Clear all global chord positions from IndexedDB
 * Global positions are stored by chord name only (not video-specific)
 * After clearing: fall back to local (if exists), otherwise position 0
 */
window.clearGlobalChordPositions = async function () {
  try {
    if (!window.databaseManager) {
      console.warn("[ClearPositions] databaseManager not available");
      return false;
    }

    // Get current video ID for checking local positions
    const videoId = new URLSearchParams(window.location.search).get("v");

    // Clear global positions from IndexedDB
    if (
      typeof window.databaseManager.clearGlobalChordPositions === "function"
    ) {
      await window.databaseManager.clearGlobalChordPositions();
      console.log("[ClearPositions] ✅ Global chord positions cleared");
    } else {
      console.warn(
        "[ClearPositions] clearGlobalChordPositions not available in databaseManager"
      );
      return false;
    }

    // Update in-memory positions: fall back to local or reset to 0
    if (window.currentChordPositions && videoId) {
      const chordsToUpdate = [...window.currentChordPositions.keys()];

      for (const chordName of chordsToUpdate) {
        // Try to get local position for this chord
        let localPosition = null;
        if (
          typeof window.databaseManager.getLocalChordPosition === "function"
        ) {
          localPosition = await window.databaseManager.getLocalChordPosition(
            videoId,
            chordName
          );
        }

        if (localPosition !== null && localPosition !== undefined) {
          // Fall back to local position (stay on same position)
          window.currentChordPositions.set(chordName, localPosition);
          console.log(
            `[ClearPositions] ${chordName} -> local position ${
              localPosition + 1
            }`
          );
        } else {
          // No local position, reset to 0
          window.currentChordPositions.set(chordName, 0);
          console.log(`[ClearPositions] ${chordName} -> position 1 (no local)`);
        }
      }
    } else if (window.currentChordPositions) {
      // No video ID, reset all to 0
      for (const [chordName] of window.currentChordPositions) {
        window.currentChordPositions.set(chordName, 0);
      }
      console.log(
        "[ClearPositions] ✅ Reset all in-memory positions to 0 (no video)"
      );
    }

    // Refresh carousel display immediately if visible
    if (window.ycChordCarousel?.isVisible) {
      // Clear all tiles and re-render with new positions
      if (typeof window.ycChordCarousel._clearAllTiles === "function") {
        window.ycChordCarousel._clearAllTiles();
      }
      if (typeof window.ycChordCarousel._renderChords === "function") {
        window.ycChordCarousel._renderChords();
      }
      console.log("[ClearPositions] ✅ Carousel refreshed");
    }

    // Refresh Preview Panel if visible
    if (window.ycChordsPreviewPanel?.isVisible) {
      if (typeof window.ycChordsPreviewPanel._refreshChords === "function") {
        await window.ycChordsPreviewPanel._refreshChords();
        console.log("[ClearPositions] ✅ Preview Panel refreshed");
      }
    }

    return true;
  } catch (error) {
    console.error(
      "[ClearPositions] ❌ Failed to clear global positions:",
      error
    );
    return false;
  }
};

/**
 * Clear local chord positions for the current video from IndexedDB
 * Local positions are stored by videoId + chord name
 * After clearing: positions fall back to global (if exists), otherwise position 0
 */
window.clearLocalChordPositions = async function () {
  try {
    if (!window.databaseManager) {
      console.warn("[ClearPositions] databaseManager not available");
      return false;
    }

    // Get current video ID
    const videoId = new URLSearchParams(window.location.search).get("v");
    if (!videoId) {
      console.warn("[ClearPositions] No video ID found");
      return false;
    }

    // Clear local positions for this video from IndexedDB
    if (typeof window.databaseManager.clearLocalChordPositions === "function") {
      await window.databaseManager.clearLocalChordPositions(videoId);
      console.log(
        `[ClearPositions] ✅ Local chord positions cleared for video: ${videoId}`
      );
    } else {
      console.warn(
        "[ClearPositions] clearLocalChordPositions not available in databaseManager"
      );
      return false;
    }

    // Update in-memory positions: fall back to global or reset to 0
    if (window.currentChordPositions) {
      const chordsToUpdate = [...window.currentChordPositions.keys()];

      for (const chordName of chordsToUpdate) {
        // Try to get global position for this chord
        let globalPosition = null;
        if (
          typeof window.databaseManager.getGlobalChordPosition === "function"
        ) {
          globalPosition = await window.databaseManager.getGlobalChordPosition(
            chordName
          );
        }

        if (globalPosition !== null && globalPosition !== undefined) {
          // Fall back to global position
          window.currentChordPositions.set(chordName, globalPosition);
          console.log(
            `[ClearPositions] ${chordName} -> global position ${
              globalPosition + 1
            }`
          );
        } else {
          // No global position, reset to 0
          window.currentChordPositions.set(chordName, 0);
          console.log(
            `[ClearPositions] ${chordName} -> position 1 (no global)`
          );
        }
      }
    }

    // Refresh carousel display immediately if visible
    if (window.ycChordCarousel?.isVisible) {
      // Clear all tiles and re-render with new positions
      if (typeof window.ycChordCarousel._clearAllTiles === "function") {
        window.ycChordCarousel._clearAllTiles();
      }
      if (typeof window.ycChordCarousel._renderChords === "function") {
        window.ycChordCarousel._renderChords();
      }
      console.log("[ClearPositions] ✅ Carousel refreshed");
    }

    // Refresh Preview Panel if visible
    if (window.ycChordsPreviewPanel?.isVisible) {
      if (typeof window.ycChordsPreviewPanel._refreshChords === "function") {
        await window.ycChordsPreviewPanel._refreshChords();
        console.log("[ClearPositions] ✅ Preview Panel refreshed");
      }
    }

    return true;
  } catch (error) {
    console.error(
      "[ClearPositions] ❌ Failed to clear local positions:",
      error
    );
    return false;
  }
};

/**
 * Show confirmation dialog for clearing global positions
 */
window.showClearGlobalPositionsConfirmation = function () {
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
    <h3 style="margin: 0 0 16px; font-size: 16px;">Clear Global Positions?</h3>
    <p style="margin: 0 0 20px; font-size: 13px; color: #aaa;">
      This will delete all saved chord positions across all songs. This action cannot be undone.
    </p>
    <div style="display: flex; gap: 12px; justify-content: center;">
      <button id="yc-cancel-clear" style="
        padding: 8px 20px;
        background: #444;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
      ">Cancel</button>
      <button id="yc-confirm-clear" style="
        padding: 8px 20px;
        background: #ff3860;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
      ">Clear All</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Event handlers with cleanup
  const cancelBtn = dialog.querySelector("#yc-cancel-clear");
  const confirmBtn = dialog.querySelector("#yc-confirm-clear");

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
    confirmBtn.textContent = "Clearing...";
    confirmBtn.disabled = true;

    const success = await window.clearGlobalChordPositions();

    if (success) {
      dialog.innerHTML = `
        <p style="margin: 0; font-size: 14px; color: #4CAF50;">✓ Global positions cleared successfully</p>
      `;
      setTimeout(cleanup, 1500);
    } else {
      dialog.innerHTML = `
        <p style="margin: 0; font-size: 14px; color: #ff3860;">✗ Failed to clear positions</p>
      `;
      setTimeout(cleanup, 2000);
    }
  };

  cancelBtn.addEventListener("click", handleCancel);
  overlay.addEventListener("click", handleOverlayClick);
  confirmBtn.addEventListener("click", handleConfirm);
};

/**
 * Show confirmation dialog for clearing local positions
 */
window.showClearLocalPositionsConfirmation = function () {
  const videoId = new URLSearchParams(window.location.search).get("v");
  if (!videoId) {
    console.warn("[ClearPositions] No video ID found");
    return;
  }

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
    <h3 style="margin: 0 0 16px; font-size: 16px;">Clear Local Positions?</h3>
    <p style="margin: 0 0 20px; font-size: 13px; color: #aaa;">
      This will delete all saved chord positions for this song only. This action cannot be undone.
    </p>
    <div style="display: flex; gap: 12px; justify-content: center;">
      <button id="yc-cancel-clear-local" style="
        padding: 8px 20px;
        background: #444;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
      ">Cancel</button>
      <button id="yc-confirm-clear-local" style="
        padding: 8px 20px;
        background: #ff9800;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
      ">Clear</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Event handlers with cleanup
  const cancelBtn = dialog.querySelector("#yc-cancel-clear-local");
  const confirmBtn = dialog.querySelector("#yc-confirm-clear-local");

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
    confirmBtn.textContent = "Clearing...";
    confirmBtn.disabled = true;

    const success = await window.clearLocalChordPositions();

    if (success) {
      dialog.innerHTML = `
        <p style="margin: 0; font-size: 14px; color: #4CAF50;">✓ Local positions cleared successfully</p>
      `;
      setTimeout(cleanup, 1500);
    } else {
      dialog.innerHTML = `
        <p style="margin: 0; font-size: 14px; color: #ff3860;">✗ Failed to clear positions</p>
      `;
      setTimeout(cleanup, 2000);
    }
  };

  cancelBtn.addEventListener("click", handleCancel);
  overlay.addEventListener("click", handleOverlayClick);
  confirmBtn.addEventListener("click", handleConfirm);
};

console.log("[ClearPositions] clearChordPositions.js loaded");
