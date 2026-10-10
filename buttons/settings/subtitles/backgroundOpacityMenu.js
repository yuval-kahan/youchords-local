// Make updateBackgroundOpacity globally accessible
window.updateBackgroundOpacity = function(selectedOpacityValue, options = {}) {
    const shouldPersist = options.persist !== false;
    const shouldRefreshSubtitles = options.refreshSubtitles !== false;

    // Update menu UI
    const menuButtons = document.querySelectorAll('.background-opacity-button');
    menuButtons.forEach(button => {
        const buttonValue = button.dataset.opacityValue;
        const checkmark = button.querySelector('.background-opacity-checkmark');
        const label = button.querySelector('.background-opacity-text');
        
        if (buttonValue === selectedOpacityValue) {
            checkmark.style.opacity = '1';
            label.style.color = '#3ea6ff';
        } else {
            checkmark.style.opacity = '0';
            label.style.color = '#fff';
        }
    });

    // Store the opacity value globally
    window.currentBackgroundOpacity = selectedOpacityValue;
    
    // שמירה ב-storage בכל קריאה לפונקציה
    try {
        if (chrome?.storage?.sync) {
            if (shouldPersist) {
                chrome.storage.sync.set({ subtitleBackgroundOpacity: selectedOpacityValue });
            }
        }
    } catch (e) {
        if (DEBUG) console.warn('[updateBackgroundOpacity] Error saving to storage:', e);
    }

    // המרה למספר לשימוש עתידי
    const bgOpacity = Number(selectedOpacityValue);

    if (shouldRefreshSubtitles) {
        window.applyCurrentSubtitlePreferences?.();

        // Force subtitle update to apply new opacity
        if (window.updateSubtitles) {
            window.updateSubtitles();
        }
    }
};

// מפת תפריטים גלובלית לשימוש בכל תתי-התפריטים
window.YC_MENUS = window.YC_MENUS || {};

// פונקציית עזר משודרגת לקבלת או יצירת תפריט
function getOrCreateMenu(id, buildFn, parentMenu) {
  let menu = window.YC_MENUS[id];

  // אם יש מופע "יתום" – ננקה אותו לגמרי
  if (menu && !menu.isConnected) {
    window.disposeMenu?.(id);
    menu = null;
  }

  // קיים ומחובר – נחזיר אותו
  if (menu) {
    parentMenu?.style && (parentMenu.style.display = 'none');
    menu.style.display = 'block';
    window.placeNearControls(menu);
    return menu;
  }

  // יצירת תפריט חדש
  menu = buildFn(parentMenu);
  menu.dataset.ycMenu = id;  // סימון לניקוי מאוחר ב-fullCleanup
  window.YC_MENUS[id] = menu;
  window.placeNearControls(menu);
  return menu;
}

// Function to create background opacity submenu
window.createBackgroundOpacitySubmenu = function(parentMenu) {
    return getOrCreateMenu('bg-opacity', (parentMenu) => {
        // יצירת תת-תפריט חדש
        const submenu = document.createElement('div');
        submenu.className = 'settings-menu background-opacity-submenu';
        submenu.style.cssText = `
          position: absolute;
          background: rgba(28, 28, 28, 0.9);
          right: 12px;
          /* לא קובעים גובה קבוע כי הוא נקבע דינמית בקובץ subtitleMenu.js */
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

    // Create header with back button
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
        if (submenu.observer) {
            submenu.observer.disconnect();
            delete submenu.observer;
        }
        submenu.style.display = 'none';
        if (parentMenu) {
            parentMenu.style.display = 'block';
        }
    });

    const headerText = document.createElement('span');
    headerText.textContent = 'Background Opacity';
    headerText.style.fontWeight = '500';

    header.appendChild(backButton);
    header.appendChild(headerText);
    submenu.appendChild(header);

    // Create opacity options container
    const opacityContainer = document.createElement('div');
    opacityContainer.style.padding = '8px 0';

    const defaultBgOpacity = String(window.DEFAULT_BG_OPACITY || '85');
    const opacities = [
        { value: '100', label: '100%' },
        { value: defaultBgOpacity, label: defaultBgOpacity + '%' },
        { value: '75', label: '75%' },
        { value: '50', label: '50%' },
        { value: '25', label: '25%' },
        { value: '0', label: '0%' }
    ].filter((option, index, list) =>
        list.findIndex((entry) => entry.value === option.value) === index
    );

    opacities.forEach(opacity => {
        const button = document.createElement('div');
        button.className = 'settings-item background-opacity-button';
        button.dataset.opacityValue = opacity.value;
        button.style.cssText = `
            padding: 12px 24px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            user-select: none;
            -webkit-user-select: none;
        `;

        // Create checkmark
        const checkmark = document.createElement('span');
        checkmark.className = 'background-opacity-checkmark';
        checkmark.innerHTML = '✓';
        checkmark.style.cssText = `
            opacity: 0;
            color: #3ea6ff;
            font-weight: bold;
            width: 15px;
            margin-right: 8px;
            display: inline-block;
        `;

        // Create label
        const label = document.createElement('span');
        label.className = 'background-opacity-text';
        label.textContent = opacity.label;

        button.appendChild(checkmark);
        button.appendChild(label);

        // Click handler
        button.addEventListener('click', () => {
            const newOpacity = opacity.value;
            
            // Save preference and update UI
            chrome.storage.sync.set({ 'subtitleBackgroundOpacity': newOpacity }, () => {
                window.updateBackgroundOpacity(newOpacity);
            });
        });

        // Hover effects
        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = 'rgba(255,255,255,0.1)';
        });
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = 'transparent';
        });

        opacityContainer.appendChild(button);
    });

    submenu.appendChild(opacityContainer);

    // Initialize state when menu is created
    chrome.storage.sync.get(['subtitleBackgroundOpacity'], (result) => {
        const savedOpacity = result.subtitleBackgroundOpacity || window.DEFAULT_BG_OPACITY || '85';
        window.updateBackgroundOpacity(savedOpacity, { persist: false, refreshSubtitles: false });
    });

    // Add visibility observer for position updates
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'style' && 
                mutation.target === submenu && 
                submenu.style.display === 'block') {
                // Refresh state when menu becomes visible
                chrome.storage.sync.get(['subtitleBackgroundOpacity'], (result) => {
                    const savedOpacity = result.subtitleBackgroundOpacity || window.DEFAULT_BG_OPACITY || '85';
                    window.updateBackgroundOpacity(savedOpacity, { persist: false, refreshSubtitles: false });
                });

                // Update position relative to controls
                const controls = document.querySelector('.ytp-chrome-bottom');
                if (controls) {
                    const controlsRect = controls.getBoundingClientRect();
                    submenu.style.bottom = `${controlsRect.height}px`;
                    submenu.style.right = '12px';
                }
            }
        });
    });

    observer.observe(submenu, {
        attributes: true,
        attributeFilter: ['style']
    });

    // Store observer reference for cleanup
    submenu.observer = observer;

    // Prevent closing when clicking inside menu
    submenu.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // רענון מצב התפריט בעת יצירתו
    chrome.storage.sync.get(['subtitleBackgroundOpacity'], (result) => {
        const savedOpacity = result.subtitleBackgroundOpacity || window.DEFAULT_BG_OPACITY || '85';
        window.updateBackgroundOpacity(savedOpacity, { persist: false, refreshSubtitles: false });
    });
    
    // אנחנו לא מוסיפים את התפריט ל-DOM כאן כי זה נעשה בקובץ subtitleMenu.js
    // הסרת השורה הזו מונעת כפילות בהוספת התפריט ל-DOM

    return submenu;
  }, parentMenu);
};
