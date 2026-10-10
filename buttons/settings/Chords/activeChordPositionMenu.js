// Active Chord Position submenu for selecting which chord should be active (highlighted)
// This submenu allows users to choose the position (1-7) where the active chord appears
// activeChordPositionMenu.js

// ───────────────────────────────────────────────
// 0. BOOTSTRAP  –  DEBUG FLAG + סימון טעינה
// ───────────────────────────────────────────────

/* ── DEBUG MODE (כיבוי מלא) ──────────────────────────── */
const DBG_ENABLED = false;        // כיבוי לוגים לפרודקשן

// נעביר property-getter שמחזיר תמיד false (לכל קוד חיצוני)
Object.defineProperty(window, 'DEBUG', {
    get () { return false; },
    set () {}                              // התעלמות מבקשות שינוי
});

/* ל-prod אין צורך בטביעת "loaded" – לכן נמחק לגמרי את ה-console.log */

// ניקוי פונקציות קודמות למניעת הגדרה מחדש של מאזינים
delete window.updateActiveChordPosition;
delete window.updateActiveChordPositionState;

// ודא שה-map הגלובלי קיים
window.YC_MENUS = window.YC_MENUS || {};

// ------------------------------------------------------------
// 1.  TOOLING  –  לוגר בסיסי + מלכוד שגיאות גלובלי
// ------------------------------------------------------------
/* פונקציית DBG נשארת, אך לעולם לא תדפיס */
const DBG = () => {};

window.addEventListener('error', e => {
  DBG('💥 window.error', e.message, e.filename+':'+e.lineno);
});

window.addEventListener('unhandledrejection', e => {
  DBG('💥 unhandled-rejection', e.reason);
});

// ------------------------------------------------------------
// 2. updateNumberOfChordsState / updateNumberOfChords
// ------------------------------------------------------------

// Helper to update menu UI based on selected active chord position
function updateActiveChordPositionState(selectedPosition) {
    DBG('updateActiveChordPositionState ⇢', selectedPosition);
    const buttons = document.querySelectorAll('.active-chord-position-button');
    buttons.forEach(btn => {
        const position = btn.dataset.positionValue;
        if (position === selectedPosition.toString()) {
            // Selected state - blue border and text with checkmark
            btn.style.color = '#3ea6ff';
            btn.style.borderColor = '#3ea6ff';
            btn.style.background = 'transparent';
            btn.textContent = position + ' ✓';
        } else {
            // Unselected state - gray border and white text
            btn.style.color = '#fff';
            btn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            btn.style.background = 'transparent';
            btn.textContent = position;
        }
    });
}

// Expose update functions globally so reset/default can reuse
window.updateActiveChordPositionState = updateActiveChordPositionState;

// Global updater when user selects active chord position
window.updateActiveChordPosition = function(selectedPosition) {
    // Set global state
    window.activeChordPosition = selectedPosition;
    
    // Save to Chrome Storage
    chrome.storage.sync.set({ activeChordPosition: selectedPosition }).then(() => {
        DBG('💾 Saved active chord position to storage:', { activeChordPosition: selectedPosition });
        
        // Update carousel if it exists and is visible
        if (window.ycChordCarousel && window.ycChordCarousel.isVisible) {
            // Convert position (1-7) to index (0-6)
            const index = selectedPosition - 1;
            window.ycChordCarousel.setActiveChordPosition(index);
            DBG('🎯 Updated carousel active position to index:', index);
        }
    }).catch(err => {
        console.warn('[activeChordPositionMenu] Failed to save active chord position:', err);
    });
    
    // Update UI
    updateActiveChordPositionState(selectedPosition);
};

// פונקציית עזר לקבלת או יצירת תפריט
function getOrCreateMenu(id, buildFn, parentMenu) {
  let menu = window.YC_MENUS[id];

  // אם יש מופע "יתום" – ננקה אותו לגמרי
  if (menu && !menu.isConnected) {
    window.disposeMenu?.(id);
    menu = null;
  }

  // קיים ומחובר – נחזיר אותו
  if (menu) {
    DBG('getOrCreateMenu – existing instance found');
    parentMenu?.style && (parentMenu.style.display = 'none');
    menu.style.display = 'block';
    window.placeNearControls?.(menu);
    /* sync UI with last known state in case of mismatch */
    window.updateActiveChordPositionState?.(
        window.activeChordPosition ?? 4
    );
    return menu;
  }

  // יצירת תפריט חדש
  menu = buildFn(parentMenu);
  menu.dataset.ycMenu = id;  // סימון לניקוי מאוחר ב-fullCleanup
  window.YC_MENUS[id] = menu;
  window.placeNearControls?.(menu);
  return menu;
}

// ------------------------------------------------------------
// 3. יצירת / שליפת התפריט via getOrCreateMenu
// ------------------------------------------------------------

// Create active chord position submenu element
window.createActiveChordPositionSubmenu = function(parentMenu) {
    /*  בונים את ה-DOM *רק אם* טרם נבנה (dataset.built)                */
    const submenu = getOrCreateMenu('active-chord-position', (_parent) => {
        const el = document.createElement('div');
        el.className = 'settings-menu active-chord-position-submenu yc';
        return el;
    }, parentMenu);

    if (submenu.dataset.built) {
        // כבר בנוי – רק לוודא שהוא במיקום הנכון
        window.placeNearControls?.(submenu);
        return submenu;
    }
    submenu.dataset.built = '1';        /* מסמן שה-DOM נוצר */

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

    backButton.addEventListener('click', (event) => {
        event.stopPropagation();
        DBG('Back-button ► hide submenu');
        submenu.style.display = 'none';
        if (parentMenu) parentMenu.style.display = 'block';
    }, { signal: submenu.abortController?.signal });

    const headerText = document.createElement('span');
    headerText.textContent = 'Active Chord Position';
    headerText.style.fontWeight = '500';

    header.appendChild(backButton);
    header.appendChild(headerText);
    submenu.appendChild(header);

    // יצירת AbortController למניעת דליפת listeners
    if (!submenu.abortController) {
        submenu.abortController = new AbortController();
    }

    const optionsContainer = document.createElement('div');
    optionsContainer.style.cssText = `
        padding: 12px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        max-height: 400px;
        overflow-y: auto;
        overflow-x: hidden;
    `;

    const positions = [1, 2, 3, 4, 5, 6, 7];

    // Single event listener using event delegation for RAM efficiency
    optionsContainer.addEventListener('click', (event) => {
        const item = event.target.closest('.active-chord-position-button');
        if (item) {
            event.stopPropagation();
            const position = parseInt(item.dataset.positionValue);
            
            // Update active chord position
            window.updateActiveChordPosition(position);
        }
    });

    // Hover effects using event delegation
    optionsContainer.addEventListener('mouseover', (event) => {
        const item = event.target.closest('.active-chord-position-button');
        if (item) {
            const position = item.dataset.positionValue;
            const currentPosition = window.activeChordPosition || 4;
            // Only apply hover effect if not currently selected
            if (position !== currentPosition.toString()) {
                item.style.background = 'rgba(255, 255, 255, 0.1)';
            }
        }
    });

    optionsContainer.addEventListener('mouseout', (event) => {
        const item = event.target.closest('.active-chord-position-button');
        if (item) {
            item.style.background = 'transparent';
        }
    });

    positions.forEach(position => {
        const item = document.createElement('button');
        item.className = 'settings-item active-chord-position-button';
        item.dataset.positionValue = position;
        item.style.cssText = `
            padding: 8px 12px;
            font-size: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            user-select: none;
            -webkit-user-select: none;
            border-radius: 4px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: transparent;
            color: #fff;
            transition: all 0.2s;
            min-height: 32px;
        `;

        // Text will include checkmark when selected
        item.textContent = position.toString();

        optionsContainer.appendChild(item);
    });

    submenu.appendChild(optionsContainer);

    // Initialize state from storage when menu is created
    chrome.storage.sync.get(['activeChordPosition'], (result) => {
        /*  אם בינתיים סגרו את התפריט – אל תמשיך  */
        if (!submenu.isConnected) return;
        
        const position = result.activeChordPosition !== undefined ? result.activeChordPosition : 4; // Default to 4 (INDEX 3)
        window.activeChordPosition = position;
        updateActiveChordPositionState(position);
    });

    // Observe visibility to adjust position - עם התנתקות אוטומטית אחרי שהתפריט נפתח
    const observer = new MutationObserver((_, obs) => {
        if (submenu.style.display === 'block') {
            const controls = document.querySelector('.ytp-chrome-bottom');
            if (controls) {
                const rect = controls.getBoundingClientRect();
                /*  אותו Offset של 12 px כדי ליישר לגובה הראשי  */
                submenu.style.bottom = `${rect.height + 12}px`;
                submenu.style.right  = '12px';
            }
            obs.disconnect();  // התנתקות אוטומטית אחרי שהתפריט נפתח
        }
    });

    // שמירת ה-observer מיד למניעת דליפה ב-SPA
    submenu.observer = observer;
    observer.observe(submenu, { attributes: true, attributeFilter: ['style'] });

    // שימוש ב-AbortController כדי למנוע הצטברות listeners
    submenu.addEventListener('click', e => e.stopPropagation(), {
        signal: submenu.abortController.signal
    });

    return submenu;
};

// ------------------------------------------------------------
// 4. dispose – ניקוי Observer
// ------------------------------------------------------------

// Helper to disconnect observer and optionally remove the submenu
window.disposeActiveChordPositionSubmenu = function(submenu, remove = false) {
    if (!submenu) {
        submenu = document.querySelector('.active-chord-position-submenu');
    }
    
    if (submenu) {
        // Disconnect observer
        if (submenu.observer) {
            submenu.observer.disconnect();
            delete submenu.observer;
        }
        
        // ניקוי AbortController למניעת דליפת listeners
        if (submenu.abortController) {
            submenu.abortController.abort();
            delete submenu.abortController;
        }
        
        // Clean up event listeners from optionsContainer
        const optionsContainer = submenu.querySelector('div[style*="grid"]');
        if (optionsContainer) {
            // Remove all event listeners by replacing with a clone
            const newContainer = optionsContainer.cloneNode(true);
            optionsContainer.parentNode.replaceChild(newContainer, optionsContainer);
        }
        
        // Remove from DOM if requested
        if (remove && submenu.parentNode) {
            submenu.parentNode.removeChild(submenu);
            /*  הסרה גם מהמפה הגלובלית – לא יהיו "יתומים"  */
            delete window.YC_MENUS['active-chord-position'];
        }
    }
}; 