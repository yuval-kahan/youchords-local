// Beat Grid Menu - Simple ON/OFF toggle for chord beat indicators
// Controls the visibility and rendering of beat grid squares above chords in the carousel

// ───────────────────────────────────────────────
// 0. BOOTSTRAP - Cleanup previous functions
// ───────────────────────────────────────────────

delete window.updateBeatGridState;
delete window.updateBeatGrid;

// Ensure global menu map exists
window.YC_MENUS = window.YC_MENUS || {};

// ───────────────────────────────────────────────
// 1. Update Functions
// ───────────────────────────────────────────────

// Helper to update the toggle state in the UI
function updateBeatGridState(isEnabled) {
    const toggle = document.querySelector('.beat-grid-toggle');
    
    if (toggle) {
        toggle.style.backgroundColor = isEnabled ? '#3ea6ff' : '#666';
        const toggleButton = toggle.querySelector('div');
        if (toggleButton) {
            toggleButton.style.transform = `translateX(${isEnabled ? '20px' : '0'})`;
        }

        // Update status text
        const status = toggle.parentElement?.querySelector('span:last-child');
        if (status) {
            status.textContent = isEnabled ? 'ON' : 'OFF';
            status.style.color = isEnabled ? '#3ea6ff' : '#666';
        }
    }
}

// Expose globally
window.updateBeatGridState = updateBeatGridState;

// Global updater when user toggles the feature
window.updateBeatGrid = async function(isEnabled) {
    window.beatGridEnabled = isEnabled;
    
    // Save to storage
    try {
        await chrome.storage.sync.set({ beatGridEnabled: isEnabled });
        console.log('[BeatGrid] Saved to storage:', isEnabled);
    } catch (e) {
        console.warn('[BeatGrid] Failed to store state', e);
    }
    
    // Update UI
    updateBeatGridState(isEnabled);
    
    // Update carousel if visible
    if (window.ycChordCarousel?.isVisible) {
        // Hide/show all beat grids immediately
        const allBeatGrids = document.querySelectorAll('.yc-beat-grid');
        allBeatGrids.forEach(grid => {
            if (isEnabled) {
                grid.style.display = '';
            } else {
                grid.style.display = 'none';
            }
        });
        
        console.log('[BeatGrid] Updated', allBeatGrids.length, 'beat grids:', isEnabled ? 'visible' : 'hidden');
    }
};

// ───────────────────────────────────────────────
// 2. Create Toggle Switch Component
// ───────────────────────────────────────────────

function createToggleSwitch(initialState, onChange) {
    const toggleContainer = document.createElement('div');
    toggleContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const toggle = document.createElement('div');
    toggle.style.cssText = `
        width: 40px;
        height: 20px;
        background-color: ${initialState ? '#3ea6ff' : '#666'};
        border-radius: 10px;
        position: relative;
        cursor: pointer;
        transition: background-color 0.3s ease;
    `;

    const toggleButton = document.createElement('div');
    toggleButton.style.cssText = `
        width: 16px;
        height: 16px;
        background-color: white;
        border-radius: 50%;
        position: absolute;
        top: 2px;
        left: 2px;
        transition: transform 0.3s ease;
        transform: translateX(${initialState ? '20px' : '0'});
    `;

    const status = document.createElement('span');
    status.textContent = initialState ? 'ON' : 'OFF';
    status.style.cssText = `
        color: ${initialState ? '#3ea6ff' : '#666'};
        font-size: 12px;
        font-weight: 500;
    `;

    toggle.appendChild(toggleButton);
    toggleContainer.appendChild(toggle);
    toggleContainer.appendChild(status);

    const clickHandler = () => {
        const newState = !initialState;
        initialState = newState;
        
        toggle.style.backgroundColor = newState ? '#3ea6ff' : '#666';
        toggleButton.style.transform = `translateX(${newState ? '20px' : '0'})`;
        status.textContent = newState ? 'ON' : 'OFF';
        status.style.color = newState ? '#3ea6ff' : '#666';
        
        if (onChange) onChange(newState);
    };
    
    toggle.addEventListener('click', clickHandler);
    
    // Cleanup function to remove event listener
    const cleanup = () => {
        toggle.removeEventListener('click', clickHandler);
    };

    return { toggleContainer, toggle, status, cleanup };
}

// ───────────────────────────────────────────────
// 3. Create Beat Grid Submenu
// ───────────────────────────────────────────────

window.createProgressBarsSubmenu = function(parentMenu) {
    const submenu = document.createElement('div');
    submenu.className = 'settings-menu progress-bars-submenu yc';
    submenu.setAttribute('data-yc-menu', 'progress-bars');
    submenu.style.cssText = `
        position: absolute;
        background: rgba(28, 28, 28, 0.9);
        right: 12px;
        border-radius: 8px;
        padding: 0;
        z-index: 2001;
        width: 250px;
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
    headerText.textContent = 'Beat Grid';
    headerText.style.fontWeight = '500';

    header.appendChild(backButton);
    header.appendChild(headerText);
    submenu.appendChild(header);

    // Create options container
    const optionsContainer = document.createElement('div');
    optionsContainer.style.padding = '8px 0';

    // Store toggle cleanup function
    const toggleCleanups = [];
    submenu.toggleCleanups = toggleCleanups;

    // Beat Grid toggle option
    const beatGridOption = document.createElement('div');
    beatGridOption.className = 'settings-item';
    beatGridOption.style.cssText = `
        padding: 12px 24px;
        font-size: 13px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        user-select: none;
        -webkit-user-select: none;
        cursor: pointer;
    `;
    beatGridOption.addEventListener("click", (e) => e.stopPropagation());
    beatGridOption.addEventListener("mouseover", () => {
        beatGridOption.style.backgroundColor = "rgba(255,255,255,0.1)";
    });
    beatGridOption.addEventListener("mouseout", () => {
        beatGridOption.style.backgroundColor = "transparent";
    });

    const beatGridText = document.createElement('span');
    beatGridText.textContent = 'Beat Grid';
    beatGridText.style.color = '#ffffff';

    beatGridOption.appendChild(beatGridText);

    // Get initial state from storage
    chrome.storage.sync.get(['beatGridEnabled'], (result) => {
        // Default to ON
        const beatGridEnabled = result.beatGridEnabled !== undefined ? result.beatGridEnabled : true;
        window.beatGridEnabled = beatGridEnabled;

        // Create toggle switch
        const toggleResult = createToggleSwitch(beatGridEnabled, (isEnabled) => {
            window.updateBeatGrid(isEnabled);
        });
        
        toggleResult.toggle.className = 'beat-grid-toggle';
        beatGridOption.appendChild(toggleResult.toggleContainer);
        toggleCleanups.push(toggleResult.cleanup);

        // Append to container
        optionsContainer.appendChild(beatGridOption);
    });

    submenu.appendChild(optionsContainer);

    // Observe visibility to adjust position
    const observer = new MutationObserver((mList, obs) => {
        if (submenu.style.display === 'block') {
            const controls = document.querySelector('.ytp-chrome-bottom');
            if (controls) {
                const rect = controls.getBoundingClientRect();
                submenu.style.bottom = `${rect.height + 12}px`;
                submenu.style.right = '12px';
            }
            obs.disconnect(); // Auto-disconnect after menu opens
        }
    });

    observer.observe(submenu, { attributes: true, attributeFilter: ['style'] });
    submenu.observer = observer;

    return submenu;
};

// ───────────────────────────────────────────────
// 4. Dispose Function
// ───────────────────────────────────────────────

window.disposeProgressBarsSubmenu = function(submenu, remove = false) {
    if (!submenu) {
        submenu = document.querySelector('.progress-bars-submenu');
    }
    
    if (submenu) {
        // Disconnect observer
        if (submenu.observer) {
            submenu.observer.disconnect();
            delete submenu.observer;
        }
        
        // Clean up toggles
        if (submenu.toggleCleanups) {
            submenu.toggleCleanups.forEach(cleanup => cleanup());
            delete submenu.toggleCleanups;
        }
        
        // Remove from DOM if requested
        if (remove && submenu.parentNode) {
            submenu.parentNode.removeChild(submenu);
            delete window.YC_MENUS['progress-bars'];
        }
    }
};

// ───────────────────────────────────────────────
// 5. Reset to Default Function
// ───────────────────────────────────────────────

const DEFAULT_BEAT_GRID_ENABLED = true;

window.resetBeatGridToDefault = function() {
    try {
        console.log('[BeatGrid] 🔄 Resetting to default...');
        
        // Remove from storage
        chrome.storage.sync.remove('beatGridEnabled');
        
        // Update to default
        window.updateBeatGrid(DEFAULT_BEAT_GRID_ENABLED);
        
        console.log('[BeatGrid] ✅ Reset completed successfully');
        console.log('[BeatGrid] 📊 New state:', DEFAULT_BEAT_GRID_ENABLED);
        
        return true;
    } catch (error) {
        console.error('[BeatGrid] ❌ Reset failed:', error);
        return false;
    }
};
