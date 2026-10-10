function applyHighlightBackgroundToggleUi(isEnabled) {
    const enabled = isEnabled !== false;
    document.querySelectorAll('.highlight-background-toggle').forEach(toggle => {
        toggle.style.backgroundColor = enabled ? '#3ea6ff' : '#666';
        toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        const knob = toggle.querySelector('div');
        if (knob) {
            knob.style.transform = `translateX(${enabled ? '20px' : '0'})`;
        }
    });

    document.querySelectorAll('.highlight-background-status').forEach(status => {
        status.textContent = enabled ? 'ON' : 'OFF';
        status.style.color = enabled ? '#3ea6ff' : '#aaa';
    });

    document.querySelectorAll('.highlight-color-options').forEach(container => {
        container.style.opacity = enabled ? '1' : '0.62';
    });
}

function applyHighlightColorSelectionUi(selectedColorValue) {
    const menuButtons = document.querySelectorAll('.highlight-color-button');
    menuButtons.forEach(button => {
        const buttonValue = button.dataset.colorValue;
        const checkmark = button.querySelector('.highlight-checkmark');
        const label = button.querySelector('.highlight-text');

        if (buttonValue === selectedColorValue) {
            checkmark.style.opacity = '1';
            label.style.color = '#3ea6ff';
        } else {
            checkmark.style.opacity = '0';
            label.style.color = '#fff';
        }
    });
}

window.updateHighlightBackgroundEnabled = function(isEnabled) {
    const enabled = isEnabled !== false;
    window.currentHighlightBackgroundEnabled = enabled;
    applyHighlightBackgroundToggleUi(enabled);

    document.querySelectorAll('.regular-subtitle-word.highlighted, .regular-subtitle-line-full.highlighted').forEach(element => {
        element.style.backgroundColor = enabled ? (window.currentHighlightColor || 'rgba(255, 255, 0, 0.5)') : 'transparent';
        element.style.borderRadius = enabled ? '2px' : '0';
    });

    window.applyCurrentSubtitlePreferences?.();
    window.updateSubtitles?.();
};

// Make updateHighlightColor globally accessible
window.updateHighlightColor = function(selectedColorValue, options = {}) {
    const shouldRefreshSubtitles = options.refreshSubtitles !== false;
    window.currentHighlightColor = selectedColorValue;

    applyHighlightColorSelectionUi(selectedColorValue);

    // Update all currently highlighted words
    document.querySelectorAll('.regular-subtitle-word.highlighted, .regular-subtitle-line-full.highlighted').forEach(element => {
        element.style.backgroundColor =
            window.currentHighlightBackgroundEnabled === false ? 'transparent' : selectedColorValue;
    });
    if (shouldRefreshSubtitles) {
        window.applyCurrentSubtitlePreferences?.();
        window.updateSubtitles?.();
    }
};

// Function to create highlight color submenu
window.createHighlightColorSubmenu = function(parentMenu) {
    window.YC_MENUS = window.YC_MENUS || {};
    const menuId = 'highlight-color';
    const existingMenu = window.YC_MENUS[menuId];

    if (existingMenu && !existingMenu.isConnected) {
        delete window.YC_MENUS[menuId];
    } else if (existingMenu) {
        existingMenu.parentMenu = parentMenu;
        if (parentMenu) parentMenu.style.display = 'none';
        existingMenu.refreshState?.();
        window.placeNearControls?.(existingMenu);
        return existingMenu;
    }

    const submenu = document.createElement('div');
    submenu.className = 'settings-menu highlight-color-submenu';
    submenu.dataset.ycMenu = menuId;
    submenu.parentMenu = parentMenu;
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
        if (submenu.parentMenu) {
            submenu.parentMenu.style.display = 'block';
        }
    });

    const headerText = document.createElement('span');
    headerText.textContent = 'Highlight Color';
    headerText.style.fontWeight = '500';

    header.appendChild(backButton);
    header.appendChild(headerText);
    submenu.appendChild(header);

    const toggleRow = document.createElement('div');
    toggleRow.className = 'settings-item highlight-background-toggle-row';
    toggleRow.style.cssText = `
        padding: 12px 24px;
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        user-select: none;
        -webkit-user-select: none;
    `;

    const toggleLabel = document.createElement('span');
    toggleLabel.textContent = 'Highlight Background';
    toggleLabel.style.color = '#fff';

    const toggleRight = document.createElement('div');
    toggleRight.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const toggle = document.createElement('div');
    toggle.className = 'highlight-background-toggle';
    toggle.setAttribute('role', 'switch');
    toggle.style.cssText = `
        width: 42px;
        height: 22px;
        border-radius: 999px;
        background: #3ea6ff;
        position: relative;
        transition: background-color 160ms ease;
    `;

    const toggleKnob = document.createElement('div');
    toggleKnob.style.cssText = `
        position: absolute;
        left: 2px;
        top: 2px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #fff;
        transition: transform 160ms ease;
    `;
    toggle.appendChild(toggleKnob);

    const toggleStatus = document.createElement('span');
    toggleStatus.className = 'highlight-background-status';
    toggleStatus.style.cssText = `
        min-width: 28px;
        text-align: right;
        font-weight: 500;
    `;

    toggleRight.appendChild(toggle);
    toggleRight.appendChild(toggleStatus);
    toggleRow.appendChild(toggleLabel);
    toggleRow.appendChild(toggleRight);

    const toggleHighlightBackground = () => {
        const nextEnabled = window.currentHighlightBackgroundEnabled === false;
        chrome.storage.sync.set({ subtitleHighlightBackgroundEnabled: nextEnabled }, () => {
            window.updateHighlightBackgroundEnabled(nextEnabled);
        });
    };

    toggleRow.addEventListener('click', toggleHighlightBackground);
    toggleRow.addEventListener('mouseover', () => {
        toggleRow.style.backgroundColor = 'rgba(255,255,255,0.1)';
    });
    toggleRow.addEventListener('mouseout', () => {
        toggleRow.style.backgroundColor = 'transparent';
    });

    submenu.appendChild(toggleRow);

    // Create color options container
    const colorContainer = document.createElement('div');
    colorContainer.className = 'highlight-color-options';
    colorContainer.style.padding = '8px 0';

    const colors = [
        { value: 'rgba(255, 255, 0, 0.5)', label: 'Yellow' },
        { value: 'rgba(0, 0, 0, 0.5)', label: 'Black' },
        { value: 'rgba(255, 165, 0, 0.5)', label: 'Orange' },
        { value: 'rgba(255, 0, 0, 0.5)', label: 'Red' },
        { value: 'rgba(0, 255, 0, 0.5)', label: 'Green' },
        { value: 'rgba(0, 255, 255, 0.5)', label: 'Cyan' },
        { value: 'rgba(255, 192, 203, 0.5)', label: 'Pink' }
    ];

    colors.forEach(color => {
        const button = document.createElement('div');
        button.className = 'settings-item highlight-color-button';
        button.dataset.colorValue = color.value;
        button.style.cssText = `
            padding: 12px 24px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            user-select: none;
            -webkit-user-select: none;
        `;

        // Create checkmark first
        const checkmark = document.createElement('span');
        checkmark.className = 'highlight-checkmark';
        checkmark.innerHTML = '✓';
        checkmark.style.cssText = `
            opacity: 0;
            color: #3ea6ff;
            font-weight: bold;
            width: 15px;
            margin-right: 8px;
            display: inline-block;
        `;

        // Create color sample
        const colorSample = document.createElement('div');
        colorSample.style.cssText = `
            width: 16px;
            height: 16px;
            border-radius: 4px;
            background-color: ${color.value};
            border: 1px solid rgba(255,255,255,0.2);
            margin-right: 12px;
        `;

        // Create label
        const label = document.createElement('span');
        label.className = 'highlight-text';
        label.textContent = color.label;

        button.appendChild(checkmark);
        button.appendChild(colorSample);
        button.appendChild(label);

        // Click handler
        button.addEventListener('click', () => {
            const newColor = color.value;
            window.currentHighlightColor = newColor;
            
            // Save preference and update UI
            chrome.storage.sync.set({ 'subtitleHighlightColor': newColor }, () => {
                window.updateHighlightColor(newColor);
            });
        });

        // Hover effects
        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = 'rgba(255,255,255,0.1)';
        });
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = 'transparent';
        });

        colorContainer.appendChild(button);
    });

    submenu.appendChild(colorContainer);

    // Initialize state when menu is created
    const initializeState = () => {
      chrome.storage.sync.get(['subtitleHighlightColor', 'subtitleHighlightBackgroundEnabled'], (result) => {
        const savedColor = result.subtitleHighlightColor || 'rgba(255, 255, 0, 0.5)';
        const isBackgroundEnabled = result.subtitleHighlightBackgroundEnabled === true;
        window.currentHighlightColor = savedColor;
        window.currentHighlightBackgroundEnabled = isBackgroundEnabled;
        applyHighlightBackgroundToggleUi(isBackgroundEnabled);
        window.updateHighlightColor(savedColor, { refreshSubtitles: false });
      });
    };

    submenu.refreshState = initializeState;
    initializeState();

    // Add visibility observer for position updates
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'style' && 
                mutation.target === submenu && 
                submenu.style.display === 'block') {
                initializeState();
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

    window.YC_MENUS[menuId] = submenu;

    return submenu;
};
