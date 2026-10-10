// Make updateBackgroundColor globally accessible
window.updateBackgroundColor = function(selectedColorValue) {
    // Update menu UI
    const menuButtons = document.querySelectorAll('.background-color-button');
    menuButtons.forEach(button => {
        const buttonValue = button.dataset.colorValue;
        const checkmark = button.querySelector('.background-checkmark');
        const label = button.querySelector('.background-text');
        
        if (buttonValue === selectedColorValue) {
            checkmark.style.opacity = '1';
            label.style.color = '#3ea6ff';
        } else {
            checkmark.style.opacity = '0';
            label.style.color = '#fff';
        }
    });

    // Update subtitle container background
    const subtitleContainer = document.querySelector('.yt-subtitle-container');
    if (subtitleContainer) {
        subtitleContainer.style.backgroundColor = selectedColorValue;
    }
};

window.createBackgroundColorSubmenu = function(parentMenu) {
    const submenu = document.createElement('div');
    submenu.className = 'settings-menu background-color-submenu';
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
    headerText.textContent = 'Background Color';
    headerText.style.fontWeight = '500';

    header.appendChild(backButton);
    header.appendChild(headerText);
    submenu.appendChild(header);

    // Create color options container
    const colorContainer = document.createElement('div');
    colorContainer.style.padding = '8px 0';

    const colors = [
        { value: 'rgba(0, 0, 0, 0.8)', label: 'Black' },
        { value: 'rgba(128, 128, 128, 0.8)', label: 'Gray' },
        { value: 'rgba(0, 0, 128, 0.8)', label: 'Navy' },
        { value: 'rgba(139, 69, 19, 0.8)', label: 'Brown' },
        { value: 'rgba(0, 100, 0, 0.8)', label: 'Dark Green' },
        { value: 'rgba(128, 0, 128, 0.8)', label: 'Purple' }
    ];

    colors.forEach(color => {
        const button = document.createElement('div');
        button.className = 'settings-item background-color-button';
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
        checkmark.className = 'background-checkmark';
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
        label.className = 'background-text';
        label.textContent = color.label;

        button.appendChild(checkmark);
        button.appendChild(colorSample);
        button.appendChild(label);

        // Click handler
        button.addEventListener('click', () => {
            const newColor = color.value;
            window.currentBackgroundColor = newColor;
            
            // Save preference and update UI
            chrome.storage.sync.set({ 'subtitleBackgroundColor': newColor }, () => {
                window.updateBackgroundColor(newColor);
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
    chrome.storage.sync.get(['subtitleBackgroundColor'], (result) => {
        const savedColor = result.subtitleBackgroundColor || 'rgba(0, 0, 0, 0.8)';
        window.currentBackgroundColor = savedColor;
        window.updateBackgroundColor(savedColor);
    });

    // Add visibility observer for position updates
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'style' && 
                mutation.target === submenu && 
                submenu.style.display === 'block') {
                // Refresh state when menu becomes visible
                chrome.storage.sync.get(['subtitleBackgroundColor'], (result) => {
                    const savedColor = result.subtitleBackgroundColor || 'rgba(0, 0, 0, 0.8)';
                    window.updateBackgroundColor(savedColor);
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

    return submenu;
};
