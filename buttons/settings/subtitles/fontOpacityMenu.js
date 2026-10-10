// Make updateFontOpacity globally accessible
window.updateFontOpacity = function(selectedOpacityValue) {
    // Update menu UI
    const menuButtons = document.querySelectorAll('.opacity-button');
    menuButtons.forEach(button => {
        const buttonValue = button.dataset.opacityValue;
        const checkmark = button.querySelector('.opacity-checkmark');
        const label = button.querySelector('.opacity-text');
        
        if (buttonValue === selectedOpacityValue) {
            checkmark.style.opacity = '1';
            label.style.color = '#3ea6ff';
        } else {
            checkmark.style.opacity = '0';
            label.style.color = '#fff';
        }
    });

    // Update all subtitle elements with new opacity
    const opacityValue = parseInt(selectedOpacityValue) / 100;
    document.querySelectorAll('.regular-subtitle-word, .regular-subtitle-punctuation').forEach(element => {
        element.style.opacity = opacityValue;
    });
    window.applyCurrentSubtitlePreferences?.();
    window.updateSubtitles?.();
};

// Function to create font opacity submenu
window.createFontOpacitySubmenu = function(parentMenu) {
    const submenu = document.createElement('div');
    submenu.className = 'settings-menu font-opacity-submenu';
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
    headerText.textContent = 'Font Opacity';
    headerText.style.fontWeight = '500';

    header.appendChild(backButton);
    header.appendChild(headerText);
    submenu.appendChild(header);

    // Create opacity options container
    const opacityContainer = document.createElement('div');
    opacityContainer.style.padding = '8px 0';

    const opacities = [
        { value: '100', label: '100%' },
        { value: '75', label: '75%' },
        { value: '50', label: '50%' },
        { value: '25', label: '25%' }
    ];

    opacities.forEach(opacity => {
        const button = document.createElement('div');
        button.className = 'settings-item opacity-button';
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
        checkmark.className = 'opacity-checkmark';
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
        label.className = 'opacity-text';
        label.textContent = opacity.label;

        button.appendChild(checkmark);
        button.appendChild(label);

        // Click handler
        button.addEventListener('click', () => {
            const newOpacity = opacity.value;
            window.currentFontOpacity = newOpacity;
            
            // Save preference and update UI
            chrome.storage.sync.set({ 'subtitleFontOpacity': newOpacity }, () => {
                window.updateFontOpacity(newOpacity);
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
    chrome.storage.sync.get(['subtitleFontOpacity'], (result) => {
        const savedOpacity = result.subtitleFontOpacity || '100';
        window.currentFontOpacity = savedOpacity;
        window.updateFontOpacity(savedOpacity);
    });

    // Add visibility observer for position updates
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
