/**
 * Clear Video Cache - Delete cached data for current video
 * Allows user to selectively delete chords and/or subtitles for the current video
 */

// Create Clear Video Cache submenu
window.createClearVideoCacheSubmenu = function(parentMenu) {
    const submenu = document.createElement('div');
    submenu.className = 'settings-menu clear-video-cache-submenu yc';
    submenu.setAttribute('data-yc-menu', 'clear-video-cache');
    submenu.style.cssText = `
        position: absolute;
        background: rgba(28, 28, 28, 0.9);
        right: 12px;
        border-radius: 8px;
        padding: 0;
        z-index: 2001;
        width: 240px;
        font-family: Roboto, Arial, sans-serif;
        color: #fff;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        display: none;
        overflow: hidden;
        user-select: none;
        -webkit-user-select: none;
    `;

    // Header with back button
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 12px 24px;
        font-size: 13px;
        display: flex;
        align-items: center;
        border-bottom: 1px solid rgba(255,255,255,0.1);
    `;

    const backButton = document.createElement('span');
    backButton.innerHTML = '◄';
    backButton.style.cssText = `
        cursor: pointer;
        margin-right: 12px;
        color: #aaa;
    `;

    backButton.addEventListener('click', () => {
        submenu.style.display = 'none';
        if (parentMenu) parentMenu.style.display = 'block';
    });

    const headerText = document.createElement('span');
    headerText.textContent = 'Clear Cache (This Video)';
    headerText.style.fontWeight = '500';

    header.appendChild(backButton);
    header.appendChild(headerText);
    submenu.appendChild(header);

    const optionsContainer = document.createElement('div');
    optionsContainer.style.padding = '8px 0';

    const options = [
        { value: 'chords', label: 'Clear Chords Only', color: '#4A90E2' },
        { value: 'subtitles', label: 'Clear Subtitles Only', color: '#ff9800' },
        { value: 'all', label: 'Clear All', color: '#9C27B0' }
    ];

    options.forEach(option => {
        const item = document.createElement('div');
        item.className = 'settings-item clear-cache-option';
        item.dataset.cacheType = option.value;
        item.style.cssText = `
            padding: 12px 24px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            user-select: none;
            -webkit-user-select: none;
        `;

        const label = document.createElement('span');
        label.textContent = option.label;
        label.style.color = option.color;

        item.appendChild(label);

        item.addEventListener('mouseover', () => {
            item.style.backgroundColor = 'rgba(255,255,255,0.1)';
        });
        item.addEventListener('mouseout', () => {
            item.style.backgroundColor = 'transparent';
        });
        item.addEventListener('click', () => {
            handleClearCache(option.value);
        });

        optionsContainer.appendChild(item);
    });

    submenu.appendChild(optionsContainer);
    submenu.addEventListener('click', e => e.stopPropagation());

    return submenu;
};

/**
 * Handle cache clearing based on user selection
 */
async function handleClearCache(cacheType) {
    console.log(`[ClearVideoCache] Clearing ${cacheType} for current video`);

    // Get current video ID
    const videoId = window.ycUtils?.extractVideoId(location.href) || 
                    window.extractVideoId?.(location.href);
    
    if (!videoId) {
        showNotification('❌ Could not determine video ID', 'error');
        return;
    }

    try {
        // Check what exists in IndexedDB
        const hasChords = await checkChordsExist(videoId);
        const hasSubtitles = await checkSubtitlesExist(videoId);

        // Determine what to delete
        let deleteChords = false;
        let deleteSubtitles = false;

        if (cacheType === 'chords') {
            deleteChords = true;
        } else if (cacheType === 'subtitles') {
            deleteSubtitles = true;
        } else if (cacheType === 'all') {
            deleteChords = true;
            deleteSubtitles = true;
        }

        // Check if there's anything to delete
        if ((deleteChords && !hasChords) && (deleteSubtitles && !hasSubtitles)) {
            showNotification('ℹ️ No cached data found for this video', 'info');
            return;
        }

        if (deleteChords && !hasChords) {
            showNotification('ℹ️ No chords found in cache', 'info');
            return;
        }

        if (deleteSubtitles && !hasSubtitles) {
            showNotification('ℹ️ No subtitles found in cache', 'info');
            return;
        }

        // Show confirmation dialog
        const itemsToDelete = [];
        if (deleteChords && hasChords) itemsToDelete.push('Chords');
        if (deleteSubtitles && hasSubtitles) itemsToDelete.push('Subtitles');

        const confirmed = await showConfirmDialog(
            'Delete cached data?',
            `This will delete: ${itemsToDelete.join(' and ')}\n\nData will be re-fetched on next use.`
        );

        if (!confirmed) {
            return;
        }

        // Perform deletion
        let deletedItems = [];

        if (deleteChords && hasChords) {
            await window.databaseManager.deleteFromDatabase('chords', videoId);
            deletedItems.push('chords');
            console.log(`[ClearVideoCache] Deleted chords for ${videoId}`);
        }

        if (deleteSubtitles && hasSubtitles) {
            await window.databaseManager.deleteFromDatabase('subtitles', videoId);
            deletedItems.push('subtitles');
            console.log(`[ClearVideoCache] Deleted subtitles for ${videoId}`);
        }

        // Show success message
        showNotification(`✅ Deleted ${deletedItems.join(' and ')} successfully!`, 'success');

    } catch (error) {
        console.error('[ClearVideoCache] Error:', error);
        showNotification('❌ Error clearing cache', 'error');
    }
}

/**
 * Check if chords exist in IndexedDB
 */
async function checkChordsExist(videoId) {
    try {
        if (!window.databaseManager) return false;
        const data = await window.databaseManager.loadFromDatabase('chords', videoId);
        return !!data;
    } catch (error) {
        console.error('[ClearVideoCache] Error checking chords:', error);
        return false;
    }
}

/**
 * Check if subtitles exist in IndexedDB
 */
async function checkSubtitlesExist(videoId) {
    try {
        if (!window.databaseManager) return false;
        const data = await window.databaseManager.loadFromDatabase('subtitles', videoId);
        return !!data;
    } catch (error) {
        console.error('[ClearVideoCache] Error checking subtitles:', error);
        return false;
    }
}

/**
 * Show confirmation dialog
 */
function showConfirmDialog(title, message) {
    return new Promise((resolve) => {
        // Remove existing overlay if any
        const existingOverlay = document.querySelector(".yc-clear-cache-overlay");
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement('div');
        overlay.className = "yc-clear-cache-overlay";
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.7);
            z-index: 2147483648;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const dialog = document.createElement('div');
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
            <h3 style="margin: 0 0 16px; font-size: 16px;">${title}</h3>
            <p style="margin: 0 0 20px; font-size: 13px; color: #aaa; white-space: pre-line;">
                ${message}
            </p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="yc-cancel-clear-cache" style="
                    padding: 8px 20px;
                    background: #444;
                    color: #fff;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                ">Cancel</button>
                <button id="yc-confirm-clear-cache" style="
                    padding: 8px 20px;
                    background: #00BCD4;
                    color: #fff;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                ">Delete</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const cancelBtn = dialog.querySelector("#yc-cancel-clear-cache");
        const confirmBtn = dialog.querySelector("#yc-confirm-clear-cache");

        const cleanup = () => {
            cancelBtn.removeEventListener("click", handleCancel);
            confirmBtn.removeEventListener("click", handleConfirm);
            overlay.removeEventListener("click", handleOverlayClick);
            overlay.remove();
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };
        
        const handleOverlayClick = (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve(false);
            }
        };
        
        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };

        cancelBtn.addEventListener("click", handleCancel);
        overlay.addEventListener("click", handleOverlayClick);
        confirmBtn.addEventListener("click", handleConfirm);
    });
}

/**
 * Show notification to user
 */
function showNotification(message, type = 'info') {
    // Remove any existing notification first
    const existingNotification = document.querySelector('.yc-clear-cache-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Add animation style once
    if (!document.getElementById('yc-clear-cache-notification-style')) {
        const style = document.createElement('style');
        style.id = 'yc-clear-cache-notification-style';
        style.textContent = `
            @keyframes ycFadeScale {
                from {
                    opacity: 0;
                    transform: translate(-50%, 0) scale(0.9);
                }
                to {
                    opacity: 1;
                    transform: translate(-50%, 0) scale(1);
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'yc-clear-cache-notification';
    notification.style.cssText = `
        position: absolute;
        bottom: 80px;
        left: 50%;
        transform: translate(-50%, 0);
        background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4CAF50' : '#2196F3'};
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        font-family: Roboto, Arial, sans-serif;
        font-size: 14px;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        pointer-events: none;
        animation: ycFadeScale 0.2s ease-out;
    `;
    notification.textContent = message;

    // Add to video player
    const player = document.querySelector('.html5-video-player');
    if (player) {
        player.appendChild(notification);
    } else {
        document.body.appendChild(notification);
    }

    // Remove after 3 seconds with fade out
    setTimeout(() => {
        notification.style.transition = 'opacity 0.2s ease-out';
        notification.style.opacity = '0';
        setTimeout(() => {
            notification.remove();
        }, 200);
    }, 3000);
}

console.log('[ClearVideoCache] Module loaded');
