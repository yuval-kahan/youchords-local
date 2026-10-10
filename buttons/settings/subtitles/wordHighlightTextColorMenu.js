// Make updateWordHighlightTextColor globally accessible
window.updateWordHighlightTextColor = function(selectedColorValue) {
    // Update menu UI
    const menuButtons = document.querySelectorAll('.word-highlight-text-color-button');
    menuButtons.forEach(button => {
        const buttonValue = button.dataset.colorValue;
        const checkmark = button.querySelector('.word-highlight-text-checkmark');
        const label = button.querySelector('.word-highlight-text-label');
        
        if (buttonValue === selectedColorValue) {
            checkmark.style.opacity = '1';
            label.style.color = '#3ea6ff';
        } else {
            checkmark.style.opacity = '0';
            label.style.color = '#fff';
        }
    });

    // Store the selected color globally
    window.currentWordHighlightTextColor = selectedColorValue;
    window.hasCustomWordHighlightTextColor = true;

    // Update all highlighted words with new text color
    document.querySelectorAll('.regular-subtitle-word.highlighted, .regular-subtitle-line-full.highlighted').forEach(element => {
        element.style.color = selectedColorValue;
    });
    window.applyCurrentSubtitlePreferences?.();

    // Force subtitle update to ensure consistency
    if (window.updateSubtitles) {
        window.updateSubtitles();
    }
};

// Function to create word highlight text color submenu
window.createWordHighlightTextColorSubmenu = function(parentMenu) {
    const submenu = document.createElement('div');
    submenu.className = 'settings-menu word-highlight-text-color-submenu';
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
    headerText.textContent = 'Word Highlight Text Color';
    headerText.style.fontWeight = '500';

    header.appendChild(backButton);
    header.appendChild(headerText);
    submenu.appendChild(header);

    // Create color options container
    const colorContainer = document.createElement('div');
    colorContainer.style.padding = '8px 0';

    const colors = [
        { value: '#FFFFFF', label: 'White' },
        { value: '#000000', label: 'Black' },
        { value: '#FFFF00', label: 'Yellow' },
        { value: '#FF0000', label: 'Red' },
        { value: '#00FF00', label: 'Green' },
        { value: '#0000FF', label: 'Blue' }
    ];

    colors.forEach(color => {
        const button = document.createElement('div');
        button.className = 'settings-item word-highlight-text-color-button';
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

        // Create checkmark
        const checkmark = document.createElement('span');
        checkmark.className = 'word-highlight-text-checkmark';
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
            border-radius: 50%;
            background-color: ${color.value};
            margin-right: 12px;
            ${color.value === '#FFFFFF' ? 'border: 1px solid rgba(255,255,255,0.2);' : ''}
        `;

        // Create label
        const label = document.createElement('span');
        label.className = 'word-highlight-text-label';
        label.textContent = color.label;

        button.appendChild(checkmark);
        button.appendChild(colorSample);
        button.appendChild(label);

        // Click handler
        button.addEventListener('click', () => {
            const newColor = color.value;
            
            // Save preference and update UI
            chrome.storage.sync.set({ 'subtitleWordHighlightTextColor': newColor }, () => {
                window.updateWordHighlightTextColor(newColor);
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

    // Initialize state and load saved preferences
    const initializeState = () => {
        chrome.storage.sync.get(['subtitleWordHighlightTextColor'], (result) => {
            const savedColor = result.subtitleWordHighlightTextColor || '#FFFFFF';
            window.currentWordHighlightTextColor = savedColor;
            window.updateWordHighlightTextColor(savedColor);
        });
    };

    // Initialize on creation
    initializeState();

    // Add visibility observer for position updates and state refresh
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'style' && 
                mutation.target === submenu && 
                submenu.style.display === 'block') {
                // Refresh state when menu becomes visible
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

    return submenu;
};

// Set up mutation observer to watch for subtitles and apply highlight text color
const subtitleObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach(node => {
                if (node.classList && node.classList.contains('regular-subtitle-word') && 
                    node.classList.contains('highlighted') && 
                    window.currentWordHighlightTextColor) {
                    node.style.color = window.currentWordHighlightTextColor;
                }
            });
        }
    });
});
window.subtitleObservers.push(subtitleObserver);

// Start observing subtitle container when it's available
const startObserving = () => {
    const subtitleOverlay = document.querySelector('.yt-subtitle-overlay');
    if (subtitleOverlay) {
        subtitleObserver.observe(subtitleOverlay, {
            childList: true,
            subtree: true
        });
    }
};

// Watch for subtitle overlay creation
const overlayObserver = new MutationObserver((mutations) => {
    if (document.querySelector('.yt-subtitle-overlay')) {
        startObserving();
        clearTimeout(overlayObserverTimeout);
        overlayObserver.disconnect();
    }
});
window.subtitleObservers.push(overlayObserver);

const overlayObserverTimeout = setTimeout(() => {
    overlayObserver.disconnect();
}, 120000);
window.subtitleObserverTimeouts = window.subtitleObserverTimeouts || [];
window.subtitleObserverTimeouts.push(overlayObserverTimeout);

overlayObserver.observe(document.body, {
    childList: true,
    subtree: true
});
