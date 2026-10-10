// Define button order mapping with room for future buttons
// Export for use in other modules
window.BUTTON_ORDER = {
    settingsButton: 30,
    subflowButton: 25,
    customSubtitleButton: 22,
    subtitleButton: 20,
    chordsButton: 10,
    audioVocalsButton: 11,
    audioMusicButton: 12,
    audioInstrumentsButton: 13,
    lyricsAndChordsButton: 5,
    chordExplorerButton: 3,
    tunerButton: 2
};

// Map button IDs to their respective classes and creation functions
const BUTTON_CONFIG = {
    chords: {
        class: '.ytp-chords-button',
        createFn: 'createChordsButton',
        order: BUTTON_ORDER.chordsButton
    },
    subtitle: {
        class: '.ytp-subtitle-button',
        createFn: 'createSubtitleButton',
        order: BUTTON_ORDER.subtitleButton
    },
    customSubtitle: {
        class: '.ytp-custom-subtitle-button',
        createFn: 'createCustomSubtitleButton',
        order: BUTTON_ORDER.customSubtitleButton
    },
    subflow: {
        class: '.ytp-subflow-button',
        createFn: 'createSubflowButton',
        order: BUTTON_ORDER.subflowButton
    },
    settings: {
        class: '.settings-button',
        createFn: 'createSettingsButton',
        order: BUTTON_ORDER.settingsButton
    },
    lyricsChords: {
        class: '.ytp-lyrics-chords-button',
        createFn: 'createLyricsAndChordsButton',
        order: BUTTON_ORDER.lyricsAndChordsButton
    },
    chordExplorer: {
        class: '.ytp-chord-explorer-button',
        createFn: 'createChordExplorerButton',
        order: BUTTON_ORDER.chordExplorerButton
    },
    tuner: {
        class: '.ytp-tuner-button',
        createFn: 'createTunerButton',
        order: BUTTON_ORDER.tunerButton
    }
};

// Helper function to find insertion point
// Export for use in other modules
window.findInsertionPoint = function(controls, newButtonOrder) {
    const buttons = Array.from(controls.children);
    
    // First try to find a custom button with higher order
    for (let i = 0; i < buttons.length; i++) {
        const container = buttons[i];
        if (container.classList.contains('custom-button-container')) {
            // Check each button configuration
            for (const [id, config] of Object.entries(BUTTON_CONFIG)) {
                if (container.querySelector(config.class) && config.order > newButtonOrder) {
                    return container;
                }
            }
        }
    }
    
    // If no custom button found, find first native button
    const firstNativeButton = Array.from(controls.children).find(child => 
        !child.classList.contains('custom-button-container')
    );
    
    return firstNativeButton || null;
}

// Updated updateButtonVisibility function with dynamic loading support
window.buttonsEnabled = window.buttonsEnabled || { chords: true, subtitle: true, customSubtitle: true, lyricsChords: true, tuner: true, chordExplorer: true };

window.updateButtonVisibility = async function(buttonId, isEnabled) {
    if (!['chords', 'subtitle', 'customSubtitle', 'lyricsChords', 'tuner', 'chordExplorer'].includes(buttonId)) return;

    window.buttonsEnabled[buttonId] = isEnabled;

    const controls = document.querySelector('.ytp-right-controls');
    const config = BUTTON_CONFIG[buttonId];
    if (!config) return;

    if (!controls) return;

    let container = controls.querySelector(`[data-btn="${buttonId}"]`);

    if (isEnabled) {
        if (!container) {
            try {
                await window.dynamicLoader?.ensureButtonLoaded?.(buttonId);
            } catch (e) {
                console.error('[ButtonsDisplay] Failed to load button', buttonId, e);
                return;
            }

            const factory = window[config.createFn];
            let handler;
            
            // הגדרת handler לפי סוג הכפתור
            if (buttonId === 'chords') {
                handler = window.toggleChords;
            } else if (buttonId === 'lyricsChords') {
                handler = window.toggleLyricsAndChords;
            } else if (buttonId === 'customSubtitle') {
                handler = () => {};
            } else {
                handler = window.toggleSubs;
            }

            if (typeof factory !== 'function' || typeof handler !== 'function') return;

            container = factory();
            if (!container) return;
            container.setAttribute('data-btn', buttonId);

            const insertionPoint = findInsertionPoint(controls, config.order);
            if (insertionPoint) controls.insertBefore(container, insertionPoint);
            else controls.appendChild(container);
            window.normalizeYouChordsButtonOrder?.(controls);

            const btn = container.querySelector('button');
            if (btn && !btn.dataset.bound) {
                window.applyYcButtonTooltip?.(buttonId, container, btn);

                // כל הכפתורים מקבלים event listener חוץ מ-chords (שיש לו טיפול מיוחד)
                if (buttonId !== 'chords') {
                    btn.addEventListener('click', handler, { capture: true });
                    // שמירת ה-handler להסרה עתידית
                    btn._clickHandler = handler;
                }
                btn.dataset.bound = '1';
            }
        }
    } else {
        // כאשר הכפתור מוסתר
        if (container) {
            // קודם כל מכבים את הפונקציונליות לפני הסרת הכפתור
            try {
                if (buttonId === 'chords') {
                    // יש לנו שני מצבים - אם הכפתור פעיל (מראה אקורדים) או לא
                    const chordsBtn = container.querySelector('.ytp-chords-button');
                    const isActive = chordsBtn?.classList.contains('chords-active') || window.chordsActive;
                    
                    if (isActive) {
                        // אם האקורדים מוצגים, כבה אותם
                        console.log('[ButtonsDisplay] Auto-disabling active chords when hiding button');
                        
                        // קוד ישיר לכיבוי האקורדים - מועתק מהפונקציה toggleChords
                        if (window.chordsDisplay?.partialCleanup) window.chordsDisplay.partialCleanup();
                        if (window.stopChordLoops) window.stopChordLoops();
                        
                        if (window.overlayCtlChords) {
                            window.overlayCtlChords.abort();
                            window.overlayCtlChords = null;
                        }
                        
                        window.chordsActive = false;
                        
                        // נקה את סגנון הכפתור (אם הוא עדיין נגיש)
                        if (chordsBtn) chordsBtn.classList.remove('chords-active');
                    }
                } else if (buttonId === 'subtitle' || buttonId === 'customSubtitle') {
                    // נסה להשתמש בפונקציה הקיימת, ואם היא לא זמינה, נקה באופן ישיר
                    console.log('[ButtonsDisplay] Auto-disabling subtitles when hiding button');
                    
                    // בדוק אם הכתוביות פעילות כרגע
                    if (window.subtitleState && window.subtitleState.isVisible) {
                        console.log('[ButtonsDisplay] Subtitles are currently visible, turning them off');
                        
                        // אם cleanupSubtitles זמין, השתמש בו - זה הפתרון המועדף
                        if (typeof window.cleanupSubtitles === 'function') {
                            window.cleanupSubtitles();
                        } else {
                            // קוד ישיר לכיבוי הכתוביות אם הפונקציה המלאה לא זמינה
                            if (window.overlayCtlSubs) {
                                window.overlayCtlSubs.abort();
                                window.overlayCtlSubs = null;
                            }
                            
                            // נקה את כל הטיימרים והאנימציות
                            if (window.rafSubs && window.rafSubs.length) {
                                window.rafSubs.forEach(id => window.cancelAnimationFrame(id));
                                window.rafSubs.length = 0;
                            }
                            
                            if (window.timersSubs && window.timersSubs.length) {
                                window.timersSubs.forEach(id => {
                                    window.clearInterval(id);
                                    window.bin?.timers?.delete(id);
                                });
                                window.timersSubs.length = 0;
                            }
                            
                            // עדכן את מצב הכתוביות ל-false
                            window.subtitleState.isVisible = false;
                            
                            // הסתר את ה-overlay אם הוא קיים
                            if (window.subtitleState.overlay) {
                                window.subtitleState.overlay.style.display = 'none';
                            }
                            
                            // נקה את הטקסט מאלמנטי הכתוביות
                            if (window.subtitleState.line1Element) {
                                window.subtitleState.line1Element.innerHTML = '';
                            }
                            if (window.subtitleState.line2Element) {
                                window.subtitleState.line2Element.innerHTML = '';
                            }
                            
                            // הסר את הסגנון הפעיל מהכפתור אם הוא עדיין נגיש
                            const subtitleBtn = document.querySelector('.ytp-button.ytp-subtitle-button');
                            if (subtitleBtn) {
                                subtitleBtn.classList.remove('subtitle-button-active');
                            }
                        }
                    } else {
                        // גם אם הכתוביות לא פעילות, נוודא שהמצב מוגדר כבוי
                        if (window.subtitleState) {
                            window.subtitleState.isVisible = false;
                        }
                        
                        // קוד ישיר לניקוי משאבים
                        if (window.overlayCtlSubs) {
                            window.overlayCtlSubs.abort();
                            window.overlayCtlSubs = null;
                        }
                        
                        // נקה את כל הטיימרים והאנימציות
                        if (window.rafSubs && window.rafSubs.length) {
                            window.rafSubs.forEach(id => window.cancelAnimationFrame(id));
                            window.rafSubs.length = 0;
                        }
                        
                        if (window.timersSubs && window.timersSubs.length) {
                            window.timersSubs.forEach(id => {
                                window.clearInterval(id);
                                window.bin?.timers?.delete(id);
                            });
                            window.timersSubs.length = 0;
                        }
                    }
                } else if (buttonId === 'lyricsChords') {
                    // טיפול בכפתור Lyrics & Chords
                    console.log('[ButtonsDisplay] Auto-disabling lyrics & chords when hiding button');
                    
                    // קריאה לפונקציית הניקוי של הפאנל
                    if (typeof window.cleanupLyricsChordsPanel === 'function') {
                        window.cleanupLyricsChordsPanel();
                    }
                    
                    // קריאה לפונקציית dispose של הכפתור אם קיימת
                    const lyricsBtn = container.querySelector('.ytp-lyrics-chords-button');
                    if (lyricsBtn && typeof lyricsBtn.dispose === 'function') {
                        lyricsBtn.dispose();
                    }
                } else if (buttonId === 'tuner') {
                    // טיפול בכפתור Tuner
                    console.log('[ButtonsDisplay] Auto-disabling tuner when hiding button');
                    
                    // ביצוע הניקוי בתוך setTimeout כדי למנוע סגירת התפריט
                    // (סגירת AudioContext גורמת ל-window blur שסוגר תפריטים)
                    window.setTimeout(function() {
                        // סגירת ה-Tuner overlay אם פתוח
                        if (typeof window.closeTuner === 'function') {
                            window.closeTuner();
                        }
                        
                        // איפוס כל הגדרות ה-Tuner לברירת מחדל
                        if (typeof window.resetAllTunerSettings === 'function') {
                            window.resetAllTunerSettings();
                        } else if (typeof window.resetVideoPlayback === 'function') {
                            window.resetVideoPlayback();
                        }
                        
                        // ניתוק ה-PitchShifter אם פעיל
                        if (window.pitchShifter && window.pitchShifter.isConnected) {
                            window.pitchShifter.disconnect();
                            window.pitchShifter = null;
                        }
                    }, 500);
                }
            } catch (err) {
                console.error(`[ButtonsDisplay] Error disabling ${buttonId}:`, err);
            }
            
            // הסרת event listener לפני הסרת הכפתור
            const btn = container.querySelector('button');
            if (btn && btn._clickHandler) {
                btn.removeEventListener('click', btn._clickHandler, { capture: true });
                delete btn._clickHandler;
                delete btn.dataset.bound;
            }
            
            // הסרת הכפתור מה-DOM
            container.remove();
            window.normalizeYouChordsButtonOrder?.(controls);
        }
    }
};

// Initialize button states - more robust implementation with improved performance
let _buttonsDisplayInitialized = false;
window.initializeButtonsDisplay = function(force = false) {
    // מניעת קריאות כפולות אלא אם force=true
    if (_buttonsDisplayInitialized && !force) {
        console.log('[ButtonsDisplay] Already initialized, skipping');
        return;
    }
    _buttonsDisplayInitialized = true;
    
    chrome.storage.sync.get(['button_chords_enabled', 'button_subtitle_enabled', 'button_customSubtitle_enabled', 'button_lyricsChords_enabled', 'button_tuner_enabled', 'button_chordExplorer_enabled'], (res) => {
        const chords = res.button_chords_enabled;
        const subtitle = res.button_subtitle_enabled;
        const customSubtitle = res.button_customSubtitle_enabled;
        const lyricsChords = res.button_lyricsChords_enabled;
        const tuner = res.button_tuner_enabled;
        const chordExplorer = res.button_chordExplorer_enabled;
        const chordsEnabled = chords === undefined ? true : chords !== false;
        const subtitleEnabled = subtitle === undefined ? true : subtitle !== false;
        const customSubtitleEnabled = customSubtitle === undefined ? true : customSubtitle !== false;
        const lyricsChordsEnabled = lyricsChords === undefined ? true : lyricsChords !== false;
        const tunerEnabled = tuner === undefined ? true : tuner !== false;
        const chordExplorerEnabled = chordExplorer === undefined ? true : chordExplorer !== false;

        window.updateButtonVisibility('chords', chordsEnabled);
        window.updateButtonVisibility('subtitle', subtitleEnabled);
        window.updateButtonVisibility('customSubtitle', customSubtitleEnabled);
        window.updateButtonVisibility('lyricsChords', lyricsChordsEnabled);
        window.updateButtonVisibility('tuner', tunerEnabled);
        window.updateButtonVisibility('chordExplorer', chordExplorerEnabled);
        window.normalizeYouChordsButtonOrder?.(document.querySelector('.ytp-right-controls'));
    });
};

// Create toggle UI helper
function createToggleElement(isEnabled) {
    const toggleContainer = document.createElement('div');
    toggleContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const toggle = document.createElement('div');
    toggle.style.cssText = `
        width: 40px;
        height: 20px;
        background-color: ${isEnabled ? '#3ea6ff' : '#666'};
        border-radius: 10px;
        position: relative;
        cursor: pointer;
        transition: background-color 0.3s ease;
    `;
    toggle.setAttribute('data-enabled', isEnabled);

    const toggleButton = document.createElement('div');
    toggleButton.style.cssText = `
        width: 16px;
        height: 16px;
        background-color: white;
        border-radius: 50%;
        position: absolute;
        top: 2px;
        left: 2px;
        transition: transform 0.3s ease;
        transform: translateX(${isEnabled ? '20px' : '0'});
    `;

    const status = document.createElement('span');
    status.textContent = isEnabled ? 'ON' : 'OFF';
    status.style.cssText = `
        color: ${isEnabled ? '#3ea6ff' : '#666'};
        font-size: 12px;
        font-weight: 500;
    `;

    toggle.appendChild(toggleButton);
    toggleContainer.appendChild(toggle);
    toggleContainer.appendChild(status);

    return { toggleContainer, toggle, toggleButton, status };
}

// Create buttons display submenu
window.createButtonsDisplaySubmenu = function(parentMenu) {
    // בדיקה אם כבר קיים submenu - אם כן, נקה אותו קודם
    const existingSubmenu = document.querySelector('.buttons-display-submenu');
    if (existingSubmenu) {
        window.disposeButtonsDisplaySubmenu(existingSubmenu, true);
    }
    
    const submenu = document.createElement('div');
    submenu.className = 'settings-menu buttons-display-submenu yc';
    submenu.setAttribute('data-yc-menu', 'buttons-display');
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
    
    // מערך לשמירת כל ה-listeners לניקוי עתידי
    submenu._listeners = [];

    // Create header
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
    
    const backHandler = () => {
        if (submenu.observer) {
            submenu.observer.disconnect();
            delete submenu.observer;
        }
        submenu.style.display = 'none';
        if (parentMenu) parentMenu.style.display = 'block';
    };
    backButton.addEventListener('click', backHandler);
    submenu._listeners.push({ el: backButton, type: 'click', fn: backHandler });

    const headerText = document.createElement('span');
    headerText.textContent = 'Buttons Display';
    headerText.style.fontWeight = '500';

    header.appendChild(backButton);
    header.appendChild(headerText);
    submenu.appendChild(header);

    // Create buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.padding = '8px 0';

    // Create button rows in order - only include our desired buttons
    const buttonLabels = {
        chords: 'Chords',
        subtitle: 'Subtitle',
        customSubtitle: 'Translated subtitles (CCT)',
        lyricsChords: 'Subtitles & Chords',
        tuner: 'Tuner',
        chordExplorer: 'Chord Explorer'
        // Settings button is always shown and is not toggleable
    };

    // Load all button states at once to avoid race conditions
    chrome.storage.sync.get(['button_chords_enabled', 'button_subtitle_enabled', 'button_customSubtitle_enabled', 'button_lyricsChords_enabled', 'button_tuner_enabled', 'button_chordExplorer_enabled'], (allButtonStates) => {
        console.log('All button states:', allButtonStates);
        
        Object.entries(buttonLabels)
            .sort((a, b) => BUTTON_CONFIG[a[0]].order - BUTTON_CONFIG[b[0]].order)
            .forEach(([buttonId, label]) => {
                const row = document.createElement('div');
                row.className = 'settings-item';
                row.style.cssText = `
                    padding: 12px 24px;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    user-select: none;
                    -webkit-user-select: none;
                `;

                const labelElement = document.createElement('span');
                labelElement.textContent = label;

                // Use the pre-loaded button states - שינוי ברירת המחדל ל-ON
                const storageKey = `button_${buttonId}_enabled`;
                // שינוי הלוגיקה כך שברירת המחדל תהיה ON
                const isEnabled = allButtonStates[storageKey] === undefined ? true : allButtonStates[storageKey] !== false;
                
                console.log(`Creating toggle for ${buttonId}:`, isEnabled);
                
                const { toggleContainer, toggle, toggleButton, status } = createToggleElement(isEnabled);

                const toggleHandler = () => {
                    const currentState = toggle.getAttribute('data-enabled') === 'true';
                    const newState = !currentState;
                    
                    console.log(`Toggling ${buttonId} from ${currentState} to ${newState}`);
                    
                    // שומר את המצב החדש ב-storage
                    chrome.storage.sync.set({ [`button_${buttonId}_enabled`]: newState });
                    
                    // רק עדכון המראה של הכפתור, ללא פעולות נוספות
                    toggle.setAttribute('data-enabled', newState);
                    toggle.style.backgroundColor = newState ? '#3ea6ff' : '#666';
                    toggleButton.style.transform = `translateX(${newState ? '20px' : '0'})`;
                    status.textContent = newState ? 'ON' : 'OFF';
                    status.style.color = newState ? '#3ea6ff' : '#666';

                    window.updateButtonVisibility(buttonId, newState);
                };
                toggle.addEventListener('click', toggleHandler);
                submenu._listeners.push({ el: toggle, type: 'click', fn: toggleHandler });

                row.appendChild(labelElement);
                row.appendChild(toggleContainer);

                const mouseoverHandler = () => { row.style.backgroundColor = 'rgba(255,255,255,0.1)'; };
                const mouseoutHandler = () => { row.style.backgroundColor = 'transparent'; };
                row.addEventListener('mouseover', mouseoverHandler);
                row.addEventListener('mouseout', mouseoutHandler);
                submenu._listeners.push({ el: row, type: 'mouseover', fn: mouseoverHandler });
                submenu._listeners.push({ el: row, type: 'mouseout', fn: mouseoutHandler });

                buttonsContainer.appendChild(row);
            });
    });

    submenu.appendChild(buttonsContainer);

    // Add position observer
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'style' && 
                mutation.target === submenu && 
                submenu.style.display === 'block') {
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

    submenu.addEventListener('click', (e) => e.stopPropagation());

    return submenu;
};

// Helper to disconnect observer and optionally remove the submenu
window.disposeButtonsDisplaySubmenu = function(submenu, remove = false) {
    if (!submenu) {
        submenu = document.querySelector('.buttons-display-submenu');
    }
    if (submenu) {
        // ניקוי כל ה-listeners
        if (submenu._listeners && submenu._listeners.length) {
            submenu._listeners.forEach(({ el, type, fn }) => {
                el.removeEventListener(type, fn);
            });
            submenu._listeners.length = 0;
        }
        
        // ניתוק ה-observer
        if (submenu.observer) {
            submenu.observer.disconnect();
            delete submenu.observer;
        }
        
        // הסרה מה-DOM
        if (remove && submenu.isConnected) {
            submenu.remove();
        }
    }
};

// Initialize buttons display when the document is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initializeButtonsDisplay, { once: true });
} else {
    window.initializeButtonsDisplay();
}

