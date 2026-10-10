// adjustments.js
window.createAdjustmentsSubmenu = function(parentMenu) {
    const submenu = document.createElement('div');
    submenu.className = 'settings-menu adjustments-submenu';
    submenu.style.cssText = `
        position: absolute;
        background: rgba(28, 28, 28, 0.9);
        right: 12px;
        bottom: 48px;
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
        margin-bottom: 0;
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
    headerText.textContent = 'Timing Adjustments';
    headerText.style.fontWeight = '500';

    header.appendChild(backButton);
    header.appendChild(headerText);
    submenu.appendChild(header);

    // Create options container
    const optionsContainer = document.createElement('div');
    optionsContainer.style.padding = '0';

    // הוספת כפתור RESET ALL TO DEFAULT בחלק העליון
    if (window.createResetToDefaultButton) {
        const resetContainer = document.createElement('div');
        resetContainer.style.cssText = `
            padding: 0;
            display: flex;
            justify-content: flex-start;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            margin-bottom: 5px;
            margin-top: 0;
            padding-left: 16px;
        `;
        
        const resetButton = window.createResetToDefaultButton();
        resetContainer.appendChild(resetButton);
        optionsContainer.appendChild(resetContainer);
    }

    const adjustmentOptions = [
        // הסרנו את Audio Adjustment
        { text: 'Chords Adjustment', type: 'chords', createSlider: window.createChordsAdjustmentSlider },
        { text: 'Subtitle Adjustment', type: 'subtitle', createSlider: window.createSubtitleAdjustmentSlider }
    ];

    adjustmentOptions.forEach(option => {
        const menuItem = document.createElement('div');
        menuItem.className = 'settings-item';
        menuItem.style.cssText = `
            padding: 12px 24px;
            font-size: 13px;
            display: flex;
            align-items: center;
            user-select: none;
            -webkit-user-select: none;
        `;

        // Add individual reset button
        if (window.createResetButton) {
            const resetBtn = window.createResetButton(option.type);
            menuItem.appendChild(resetBtn);
        }

        const itemText = document.createElement('span');
        itemText.textContent = option.text;
        itemText.style.cssText = `
            min-width: 110px;
            text-align: center;
            flex: 0.5;
        `;
        menuItem.appendChild(itemText);

        // יצירת הסליידר מיד בעת יצירת התפריט, בלי צורך ללחוץ
        const createSliderForItem = async () => {
            // Extract video ID
            const videoId = window.extractVideoId ? window.extractVideoId(location.href) : null;
            if (!videoId) {
                console.error(`Cannot check for ${option.type} content: Video ID not found`);
                return;
            }

            let contentExists = false;
            
            // Check if content exists based on type
            if (option.type === 'subtitle') {
                contentExists = await window.videoValidator.checkSubtitlesInIndexedDB(videoId);
            } else if (option.type === 'chords') {
                contentExists = await window.videoValidator.checkChordsInIndexedDB(videoId);
            }
            
            // תמיד נציג את הסליידר, אבל נשמור את המידע אם יש תוכן או לא
            if (option.createSlider) {
                // Clear existing slider if any
                const existingSlider = menuItem.querySelector('.timing-slider-container');
                if (existingSlider) {
                    existingSlider.remove();
                }
                
                const slider = option.createSlider(contentExists);
                menuItem.appendChild(slider);
                
                // אם אין תוכן, נציג הודעה קטנה שהשינויים לא יישמרו
                const existingWarning = menuItem.querySelector('.no-content-warning');
                if (existingWarning) {
                    existingWarning.remove();
                }
                
                if (!contentExists) {
                    const warningMsg = document.createElement('div');
                    warningMsg.className = 'no-content-warning';
                    warningMsg.textContent = `No ${option.type === 'subtitle' ? 'subtitles' : 'chords'} available (changes won't be saved)`;
                    warningMsg.style.cssText = `
                        position: absolute;
                        bottom: -15px;
                        left: 50%;
                        transform: translateX(-50%);
                        font-size: 10px;
                        color: #ff9800;
                        white-space: nowrap;
                    `;
                    menuItem.appendChild(warningMsg);
                }
            }
        };

        menuItem.addEventListener('mouseover', () => {
            menuItem.style.backgroundColor = 'rgba(255,255,255,0.1)';
        });

        menuItem.addEventListener('mouseout', () => {
            menuItem.style.backgroundColor = 'transparent';
        });

        // הוספת מאזין לאירוע refreshSlider
        menuItem.addEventListener('refreshSlider', () => {
            createSliderForItem();
        });

        optionsContainer.appendChild(menuItem);
        
        // יצירת הסליידר באופן אוטומטי כשהתפריט נפתח
        createSliderForItem();
    });

    submenu.appendChild(optionsContainer);

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                if (submenu.style.display === 'block') {
                    // רענון הסליידרים כשהתפריט מוצג
                    document.querySelectorAll('.settings-item').forEach(item => {
                        const sliderCreationEvent = new Event('refreshSlider');
                        item.dispatchEvent(sliderCreationEvent);
                    });
                }
            }
        }
    });
    
    observer.observe(submenu, { attributes: true });
    // Store observer reference for cleanup
    submenu.observer = observer;

    return submenu;
};
