// Debug logging helper
const debugLog = (message, data = null) => {
    const log = data ? `[Menu Debug] ${message}:` : `[Menu Debug] ${message}`;
    console.log(log);
    if (data) console.log(data);
};

// Make updateSelectedColor globally accessible
window.updateSelectedColor = function(selectedColorValue) {
    debugLog('Global color update called:', selectedColorValue);
    
    // Update menu UI
    const menuButtons = document.querySelectorAll('.color-button');
    menuButtons.forEach(button => {
        const buttonValue = button.dataset.colorValue;
        const checkmark = button.querySelector('.color-checkmark');
        const label = button.querySelector('.color-text');
        
        if (buttonValue === selectedColorValue) {
            checkmark.style.opacity = '1';
            label.style.color = '#3ea6ff';
        } else {
            checkmark.style.opacity = '0';
            label.style.color = '#fff';
        }
    });

    // Update all subtitle elements
    document.querySelectorAll('.regular-subtitle-word, .regular-subtitle-punctuation').forEach(element => {
        element.style.color = selectedColorValue;
    });
    window.applyCurrentSubtitlePreferences?.();
    window.updateSubtitles?.();
};

// Function to create font color submenu with color persistence
window.createFontColorSubmenu = function(parentMenu) {
    const submenu = document.createElement('div');
    submenu.className = 'settings-menu font-color-submenu';
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
    headerText.textContent = 'Font color';
    headerText.style.fontWeight = '500';

    header.appendChild(backButton);
    header.appendChild(headerText);
    submenu.appendChild(header);

    // Create color options container
    const colorContainer = document.createElement('div');
    colorContainer.style.padding = '8px 0';

    const colors = [
        { value: '#FFFFFF', label: 'White' },
        { value: '#FFFF00', label: 'Yellow' },
        { value: '#00FF00', label: 'Green' },
        { value: '#00FFFF', label: 'Cyan' },
        { value: '#0000FF', label: 'Blue' },
        { value: '#FF0000', label: 'Red' }
    ];

    colors.forEach(color => {
        const button = document.createElement('div');
        button.className = 'settings-item color-button';
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
        checkmark.className = 'color-checkmark';
        checkmark.innerHTML = '✓';
        checkmark.style.cssText = `
            opacity: 0;
            color: #3ea6ff;
            font-weight: bold;
            width: 15px;
            margin-right: 8px;
            display: inline-block;
        `;

        // Create color circle
        const colorCircle = document.createElement('div');
        colorCircle.style.cssText = `
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background-color: ${color.value};
            margin-right: 12px;
            ${color.value === '#FFFFFF' ? 'border: 1px solid rgba(255,255,255,0.2);' : ''}
        `;

        // Create label
        const label = document.createElement('span');
        label.className = 'color-text';
        label.textContent = color.label;

        button.appendChild(checkmark);
        button.appendChild(colorCircle);
        button.appendChild(label);

        // Hover effects
        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = 'rgba(255,255,255,0.1)';
        });
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = 'transparent';
        });

        // Click handler
        button.addEventListener('click', () => {
            const newColor = color.value;
            window.currentSubtitleColor = newColor;
            
            // Save preference and update UI
            chrome.storage.sync.set({ 'subtitleColor': newColor }, () => {
                window.updateSelectedColor(newColor);
                debugLog('Color saved and updated:', newColor);
            });
        });

        colorContainer.appendChild(button);
    });

    submenu.appendChild(colorContainer);

    // Initialize state
    const initializeState = () => {
        chrome.storage.sync.get(['subtitleColor'], (result) => {
            const savedColor = result.subtitleColor || '#FFFFFF';
            window.currentSubtitleColor = savedColor;
            window.updateSelectedColor(savedColor);
            debugLog('State initialized with color:', savedColor);
        });
    };

    initializeState();

    // Add visibility observer
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'style' && 
                mutation.target === submenu && 
                submenu.style.display === 'block') {
                // Update position relative to controls
                const controls = document.querySelector('.ytp-chrome-bottom');
                if (controls) {
                    const controlsRect = controls.getBoundingClientRect();
                    submenu.style.bottom = `${controlsRect.height}px`;
                    submenu.style.right = '12px';
                }
                // Refresh state when menu becomes visible
                initializeState();
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

    return submenu;
};
