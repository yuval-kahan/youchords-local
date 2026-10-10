// wipeAllData.js - Wipe all cached data from IndexedDB

/**
 * Show confirmation dialog for wiping all cached data
 */
window.showWipeAllDataConfirmation = function() {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Roboto', Arial, sans-serif;
  `;

  // Create dialog
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: #1c1c1c;
    border-radius: 12px;
    padding: 24px;
    max-width: 450px;
    width: 90%;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    color: white;
  `;

  // Title
  const title = document.createElement('h2');
  title.textContent = '🗑️ Wipe All Cached Data';
  title.style.cssText = `
    margin: 0 0 16px 0;
    font-size: 20px;
    font-weight: 500;
    color: #ff3860;
  `;

  // Message
  const message = document.createElement('p');
  message.innerHTML = `
    This will permanently delete <strong>all cached subtitles, translations, and chords</strong> for all songs from your device.
    <br><br>
    Your settings and preferences will <strong>NOT</strong> be affected.
    <br><br>
    <strong style="color: #ff9800;">This action cannot be undone!</strong>
  `;
  message.style.cssText = `
    margin: 0 0 24px 0;
    font-size: 14px;
    line-height: 1.6;
    color: #e0e0e0;
  `;

  // Buttons container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.style.cssText = `
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  `;

  // Cancel button
  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.style.cssText = `
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    background: #424242;
    color: white;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;
  `;
  cancelButton.onmouseover = () => cancelButton.style.background = '#616161';
  cancelButton.onmouseout = () => cancelButton.style.background = '#424242';
  cancelButton.onclick = () => {
    document.body.removeChild(overlay);
  };

  // Wipe button
  const wipeButton = document.createElement('button');
  wipeButton.textContent = 'Wipe All Data';
  wipeButton.style.cssText = `
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    background: #d32f2f;
    color: white;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  `;
  wipeButton.onmouseover = () => wipeButton.style.background = '#b71c1c';
  wipeButton.onmouseout = () => wipeButton.style.background = '#d32f2f';
  wipeButton.onclick = async () => {
    // Disable button during operation
    wipeButton.disabled = true;
    wipeButton.textContent = 'Wiping...';
    wipeButton.style.cursor = 'not-allowed';
    wipeButton.style.opacity = '0.6';

    try {
      await window.wipeAllCachedData();
      
      // Show success message
      message.innerHTML = `
        <strong style="color: #4caf50;">✅ Success!</strong>
        <br><br>
        All cached data has been wiped from your device.
        <br><br>
        Subtitles, translations, and chords will be re-fetched when needed.
      `;
      
      // Hide wipe button, show only close button
      wipeButton.style.display = 'none';
      cancelButton.textContent = 'Close';
      
    } catch (error) {
      console.error('[WipeData] Error:', error);
      
      // Show error message
      message.innerHTML = `
        <strong style="color: #ff3860;">❌ Error!</strong>
        <br><br>
        Failed to wipe data: ${error.message}
        <br><br>
        Please try again or contact support.
      `;
      
      // Re-enable button
      wipeButton.disabled = false;
      wipeButton.textContent = 'Try Again';
      wipeButton.style.cursor = 'pointer';
      wipeButton.style.opacity = '1';
    }
  };

  // Assemble dialog
  buttonsContainer.appendChild(cancelButton);
  buttonsContainer.appendChild(wipeButton);
  
  dialog.appendChild(title);
  dialog.appendChild(message);
  dialog.appendChild(buttonsContainer);
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
};

/**
 * Wipe all cached data from IndexedDB
 */
window.wipeAllCachedData = async function() {
  console.log('[WipeData] 🗑️ Starting to wipe all cached data...');
  
  try {
    // Database configurations (matching databaseManager.js)
    const DB_CONFIG = {
      subtitles: { name: 'ycdb_4c8d1f6a', version: 5, store: 's_m7p4' },
      chords: { name: 'ycdb_7a3f9e2b', version: 7, store: 's_x9k2' },
      guitar: { name: 'ycdb_9b2e5c7d', version: 2, store: 's_g5n8' },
      globalPositions: { name: 'ycdb_1f4a8b3c', version: 2, store: 's_w3q6' }
    };

    let totalCleared = 0;

    // Clear each database's content (but keep the database structure)
    for (const [dbType, config] of Object.entries(DB_CONFIG)) {
      try {
        console.log(`[WipeData] Clearing ${dbType} database...`);
        
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open(config.name, config.version);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        // Clear all records from the store
        const cleared = await new Promise((resolve, reject) => {
          const tx = db.transaction(config.store, 'readwrite');
          const store = tx.objectStore(config.store);
          const clearRequest = store.clear();
          
          let count = 0;
          
          // Count records before clearing (optional)
          const countRequest = store.count();
          countRequest.onsuccess = () => {
            count = countRequest.result;
          };
          
          clearRequest.onsuccess = () => {
            console.log(`[WipeData] ✅ Cleared ${count} records from ${dbType}`);
            resolve(count);
          };
          
          clearRequest.onerror = () => {
            console.error(`[WipeData] ❌ Failed to clear ${dbType}:`, clearRequest.error);
            reject(clearRequest.error);
          };
          
          tx.oncomplete = () => {
            db.close();
          };
          
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        });
        
        totalCleared += cleared;
        
      } catch (error) {
        console.warn(`[WipeData] Error clearing ${dbType}:`, error);
      }
    }

    // Also clear any cache in chrome.storage.local (but NOT settings!)
    try {
      const localData = await chrome.storage.local.get(null);
      const keysToRemove = [];
      
      // Only remove cache-related keys, not settings
      for (const key in localData) {
        if (key.includes('cache') || key.includes('subtitles_') || key.includes('chords_')) {
          keysToRemove.push(key);
        }
      }
      
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        console.log(`[WipeData] ✅ Cleared ${keysToRemove.length} cache entries from chrome.storage.local`);
      }
    } catch (error) {
      console.warn('[WipeData] Failed to clear chrome.storage.local cache:', error);
    }

    console.log(`[WipeData] ✅ All cached data wiped successfully! Total records cleared: ${totalCleared}`);
    
  } catch (error) {
    console.error('[WipeData] ❌ Error wiping data:', error);
    throw error;
  }
};
