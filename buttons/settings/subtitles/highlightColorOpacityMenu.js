// Make updateHighlightOpacity globally accessible
window.updateHighlightOpacity = function(selectedOpacityValue) {
    // Update menu UI
    const menuButtons = document.querySelectorAll('.highlight-opacity-button');
    menuButtons.forEach(button => {
        const buttonValue = button.dataset.opacityValue;
        const checkmark = button.querySelector('.highlight-opacity-checkmark');
        const label = button.querySelector('.highlight-opacity-text');
        
        if (buttonValue === selectedOpacityValue) {
            checkmark.style.opacity = '1';
            label.style.color = '#3ea6ff';
        } else {
            checkmark.style.opacity = '0';
            label.style.color = '#fff';
        }
    });

    // Store the selected opacity value
    window.currentHighlightOpacity = selectedOpacityValue;

    // Update all currently highlighted words
    document.querySelectorAll('.regular-subtitle-word.highlighted, .regular-subtitle-line-full.highlighted').forEach(element => {
        const currentColor = element.style.backgroundColor;
        if (currentColor) {
            // Extract RGB values from current background color
            const match = currentColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
            if (match) {
                const [, r, g, b] = match;
                const opacity = parseInt(selectedOpacityValue) / 100;
                if (window.currentHighlightBackgroundEnabled === false) {
                    element.style.backgroundColor = 'transparent';
                    element.style.borderRadius = '0';
                } else {
                    element.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
                    element.style.borderRadius = '2px';
                }
            }
        }
    });
    window.applyCurrentSubtitlePreferences?.();

    // Force subtitle update to ensure consistency
    if (window.updateSubtitles) {
        window.updateSubtitles();
    }
};

// Function to create highlight opacity submenu
window.createHighlightOpacitySubmenu = function(parentMenu) {
    const submenu = document.createElement('div');
    submenu.className = 'settings-menu highlight-opacity-submenu';
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
    headerText.textContent = 'Highlight Opacity';
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
        { value: '25', label: '25%' },
        { value: '0', label: '0%' }
    ];

    opacities.forEach(opacity => {
        const button = document.createElement('div');
        button.className = 'settings-item highlight-opacity-button';
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
        checkmark.className = 'highlight-opacity-checkmark';
        checkmark.innerHTML = '✓';
        checkmark.style.cssText = `
            opacity: 0;
            color: #3ea6ff;
            font-weight: bold;
            width: 15px;
            margin-right: 8px;
            display: inline-block;
        `;

        // Create opacity preview box
        const previewBox = document.createElement('div');
        const currentHighlightColor = window.currentHighlightColor || 'rgb(255, 255, 0)';
        const match = currentHighlightColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
        let previewColor;
        if (match) {
            const [, r, g, b] = match;
            previewColor = `rgba(${r}, ${g}, ${b}, ${parseInt(opacity.value) / 100})`;
        } else {
            previewColor = `rgba(255, 255, 0, ${parseInt(opacity.value) / 100})`;
        }

        previewBox.style.cssText = `
            width: 16px;
            height: 16px;
            border-radius: 4px;
            background-color: ${previewColor};
            border: 1px solid rgba(255,255,255,0.2);
            margin-right: 12px;
        `;

        // Create label
        const label = document.createElement('span');
        label.className = 'highlight-opacity-text';
        label.textContent = opacity.label;

        button.appendChild(checkmark);
        button.appendChild(previewBox);
        button.appendChild(label);

        // Click handler
        button.addEventListener('click', () => {
            const newOpacity = opacity.value;
            
            // Save preference and update UI
            chrome.storage.sync.set({ 'subtitleHighlightOpacity': newOpacity }, () => {
                window.updateHighlightOpacity(newOpacity);
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

    // Initialize state and load saved preferences
    const initializeState = () => {
        chrome.storage.sync.get(['subtitleHighlightOpacity'], (result) => {
            const savedOpacity = result.subtitleHighlightOpacity || '50';
            window.currentHighlightOpacity = savedOpacity;
            window.updateHighlightOpacity(savedOpacity);
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

// Set up mutation observer to watch for subtitles and apply highlight opacity
const subtitleOpacityObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach(node => {
                if (node.classList && 
                    node.classList.contains('regular-subtitle-word') && 
                    node.classList.contains('highlighted') && 
                    window.currentHighlightOpacity) {
                    const currentColor = node.style.backgroundColor;
                    if (currentColor) {
                        const match = currentColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
                        if (match) {
                            const [, r, g, b] = match;
                            const opacity = parseInt(window.currentHighlightOpacity) / 100;
                            if (window.currentHighlightBackgroundEnabled === false) {
                                node.style.backgroundColor = 'transparent';
                                node.style.borderRadius = '0';
                            } else {
                                node.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
                                node.style.borderRadius = '2px';
                            }
                        }
                    }
                }
            });
        }
    });
});
window.subtitleObservers.push(subtitleOpacityObserver);

// Start observing subtitle container when it's available
const startObservingOpacity = () => {
    const subtitleOverlay = document.querySelector('.yt-subtitle-overlay');
    if (subtitleOverlay) {
        subtitleOpacityObserver.observe(subtitleOverlay, {
            childList: true,
            subtree: true
        });
    }
};

// Watch for subtitle overlay creation
const opacityOverlayObserver = new MutationObserver((mutations) => {
    if (document.querySelector('.yt-subtitle-overlay')) {
        startObservingOpacity();
        clearTimeout(opacityOverlayObserverTimeout);
        opacityOverlayObserver.disconnect();
    }
});
window.subtitleObservers.push(opacityOverlayObserver);

const opacityOverlayObserverTimeout = setTimeout(() => {
    opacityOverlayObserver.disconnect();
}, 120000);
window.subtitleObserverTimeouts = window.subtitleObserverTimeouts || [];
window.subtitleObserverTimeouts.push(opacityOverlayObserverTimeout);

opacityOverlayObserver.observe(document.body, {
    childList: true,
    subtree: true
});
