// Keep track of existing submenu
let existingFontSizeSubmenu = null;

// Function to update menu UI state
function updateFontSizeMenuState(selectedSize) {
    if (!existingFontSizeSubmenu) return;
    
    const sizeButtons = existingFontSizeSubmenu.querySelectorAll('.size-button');
    sizeButtons.forEach(button => {
        const value = button.dataset.sizeValue;
        const checkmark = button.querySelector('span:first-child');
        const contentWrapper = button.querySelector('div');
        
        if (value === selectedSize) {
            checkmark.style.opacity = '1';
            contentWrapper.style.color = '#3ea6ff';
        } else {
            checkmark.style.opacity = '0';
            contentWrapper.style.color = '#fff';
        }
    });
}

// Create font size submenu with size persistence
window.createFontSizeSubmenu = function(parentMenu) {
    // Remove existing submenu if it exists
    if (existingFontSizeSubmenu) {
        existingFontSizeSubmenu.remove();
        if (existingFontSizeSubmenu.observer) {
            existingFontSizeSubmenu.observer.disconnect();
        }
    }

    const submenu = document.createElement('div');
    submenu.className = 'settings-menu font-size-submenu';
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
      -moz-user-select: none;
      -ms-user-select: none;
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
            // Update parent menu position before showing
            const controls = document.querySelector('.ytp-chrome-bottom');
            if (controls) {
                const controlsRect = controls.getBoundingClientRect();
                parentMenu.style.bottom = `${controlsRect.height}px`;
            }
            parentMenu.style.display = 'block';
        }
    });

    const headerText = document.createElement('span');
    headerText.textContent = 'Font size';
    headerText.style.fontWeight = '500';

    header.appendChild(backButton);
    header.appendChild(headerText);
    submenu.appendChild(header);

    // Create size options container
    const sizeContainer = document.createElement('div');
    sizeContainer.style.padding = '8px 0';

    const sizes = [
        { value: '900', label: '500%' },
        { value: '800', label: '450%' },
        { value: '700', label: '400%' },
        { value: '600', label: '350%' },
        { value: '500', label: '300%' },
        { value: '450', label: '250%' },
        { value: '400', label: '200%' },
        { value: '350', label: '150%' },
        { value: '300', label: '125%' },
        { value: '250', label: '100%' },
        { value: '200', label: '75%' },
        { value: '175', label: '50%' }
    ];

    // Create size buttons
    sizes.forEach(size => {
        const button = document.createElement('div');
        button.className = 'settings-item size-button';
        button.dataset.sizeValue = size.value;
        button.style.cssText = `
            padding: 12px 24px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            user-select: none;
            -webkit-user-select: none;
        `;
    
        const contentWrapper = document.createElement('div');
        contentWrapper.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
        `;
    
        const checkmark = document.createElement('span');
        checkmark.textContent = '✓';
        checkmark.style.cssText = `
            color: #3ea6ff;
            opacity: 0;
            font-weight: bold;
            display: inline-block;
        `;
    
        const sizeText = document.createElement('span');
        sizeText.textContent = size.label;
    
        contentWrapper.appendChild(checkmark);
        contentWrapper.appendChild(sizeText);
        button.appendChild(contentWrapper);
    
        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = 'rgba(255,255,255,0.1)';
        });
        
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = 'transparent';
        });
    
        button.addEventListener('click', () => {
            const newSize = size.value;
            updateFontSizeMenuState(newSize);
            if (window.changeSubtitleSize) {
                window.changeSubtitleSize(newSize);
            }
            chrome.storage.sync.set({ 'subtitleSize': newSize });
        });
    
        sizeContainer.appendChild(button);
    });

    submenu.appendChild(sizeContainer);

    // Store submenu reference
    existingFontSizeSubmenu = submenu;

    // Initialize state
    chrome.storage.sync.get(['subtitleSize'], (result) => {
        const savedSize = result.subtitleSize || '250';
        updateFontSizeMenuState(savedSize);
    });

    // Update when menu is shown
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'style' && 
                mutation.target === submenu && 
                submenu.style.display === 'block') {
                // Update size states
                chrome.storage.sync.get(['subtitleSize'], (result) => {
                    const savedSize = result.subtitleSize || '250';
                    updateFontSizeMenuState(savedSize);
                });
                
                // Update position
                const controls = document.querySelector('.ytp-chrome-bottom');
                if (controls) {
                    const controlsRect = controls.getBoundingClientRect();
                    submenu.style.bottom = `${controlsRect.height}px`;
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

    // Make updateFontSizeMenuState globally accessible
    window.updateFontSizeMenuState = updateFontSizeMenuState;

    // Prevent menu closing when clicking inside
    submenu.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    return submenu;
};
