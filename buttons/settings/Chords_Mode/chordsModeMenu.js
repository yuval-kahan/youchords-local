// Chords Mode submenu for selecting chord display variant

// Helper to update menu UI based on selected mode
function updateChordsModeMenuState(selectedMode) {
    const buttons = document.querySelectorAll('.chords-mode-button');
    buttons.forEach(btn => {
        const mode = btn.dataset.modeValue;
        const check = btn.querySelector('.mode-check');
        const label = btn.querySelector('.mode-label');
        if (mode === selectedMode) {
            check.style.opacity = '1';
            label.style.color = '#3ea6ff';
        } else {
            check.style.opacity = '0';
            label.style.color = '#fff';
        }
    });
}

function normalizeChordsModeValue(modeValue) {
    const value = String(modeValue || 'regular').trim();
    if (value === 'regular' || value === 'regularPlus' || value === 'harmonic' || value === 'harmonicPlus') {
        return value;
    }
    return 'regular';
}

function getChordsModeDisplayName(mode) {
    const safeMode = normalizeChordsModeValue(mode);
    if (safeMode === 'regularPlus') return 'R+ (Beginner+)';
    if (safeMode === 'harmonic') return 'H (Intermediate)';
    if (safeMode === 'harmonicPlus') return 'H+ (Advanced)';
    return 'R (Beginner)';
}

function pickChordTextForMode(data, mode) {
    if (!data) return '';
    const chordTextObject = data.chordText && typeof data.chordText === 'object' ? data.chordText : null;
    const regular = chordTextObject?.regular || (typeof data.chordText === 'string' ? data.chordText : '') || data.regular || '';
    if (mode === 'regularPlus') {
        return data.chordTextRegularPlus || data.regularPlus || chordTextObject?.regularPlus || regular;
    }
    if (mode === 'harmonic') {
        return data.chordTextHarmonic || data.harmonic || chordTextObject?.harmonic || regular;
    }
    if (mode === 'harmonicPlus') {
        return data.chordTextHarmonicPlus || data.harmonicPlus || chordTextObject?.harmonicPlus || regular;
    }
    return regular;
}

function hasDirectChordTextForMode(data, mode) {
    if (!data) return false;
    const chordTextObject = data.chordText && typeof data.chordText === 'object' ? data.chordText : null;
    if (mode === 'regularPlus') {
        return Boolean(data.chordTextRegularPlus || data.regularPlus || chordTextObject?.regularPlus);
    }
    if (mode === 'harmonic') {
        return Boolean(data.chordTextHarmonic || data.harmonic || chordTextObject?.harmonic);
    }
    if (mode === 'harmonicPlus') {
        return Boolean(data.chordTextHarmonicPlus || data.harmonicPlus || chordTextObject?.harmonicPlus);
    }
    return Boolean(chordTextObject?.regular || (typeof data.chordText === 'string' ? data.chordText : '') || data.regular);
}

// Expose update function globally so reset/default can reuse
window.updateChordsModeMenuState = updateChordsModeMenuState;

// Global updater when user selects a mode
window.updateChordsMode = async function(mode) {
    mode = normalizeChordsModeValue(mode);
    const previousMode = normalizeChordsModeValue(window.chordsMode || 'regular');
    if (mode === previousMode) {
        updateChordsModeMenuState(mode);
        return;
    }

    const modeUpdateRequestId = (window.chordsModeUpdateRequestId || 0) + 1;
    window.chordsModeUpdateRequestId = modeUpdateRequestId;
    const isStaleModeUpdate = () => (
        window.chordsModeUpdateRequestId !== modeUpdateRequestId ||
        normalizeChordsModeValue(window.chordsMode || 'regular') !== mode
    );

    window.chordsMode = mode;
    
    // 🆕 Dispatch mode changed event for preview panel.
    // Carousel refresh is handled by smartUpdateChordsMode below to avoid stale double-renders.
    window.dispatchEvent(new CustomEvent('yc:modeChanged', {
        detail: { 
            oldMode: previousMode, 
            newMode: mode,
            source: 'updateChordsMode',
            skipCarouselRefresh: true
        }
    }));
    
    try {
        // שמירת המצב החדש ב-storage
        await chrome.storage.sync.set({ chordsMode: mode });
        if (isStaleModeUpdate()) return;
        
        // עדכון ממשק המשתמש
        updateChordsModeMenuState(mode);

        // בדיקה האם האקורדים מוצגים כרגע
        const overlayVisible = window.chordsDisplay?.isVisible;
        
        // אם האקורדים פעילים או פאנל Lyrics & Chords פתוח, ננסה לעדכן אותם בלי טעינה מחדש
        if ((window.chordsActive || overlayVisible || window.lyricsChordsPanelActive) && window.chordsDisplay?.activate) {
            let videoId = null;
            try {
                // ניסיון לחלץ את מזהה הסרטון בכמה דרכים אפשריות
                // 1. מהמשתנה הגלובלי, אם קיים
                if (window.currentVideoId) {
                    videoId = window.currentVideoId;
                    console.log('[updateChordsMode] Found videoId from window.currentVideoId:', videoId);
                }
                // 2. מהפונקציה של ycUtils, אם קיימת
                else if (window.ycUtils?.extractVideoId) {
                    videoId = window.ycUtils.extractVideoId(location.href);
                    console.log('[updateChordsMode] Found videoId using ycUtils.extractVideoId:', videoId);
                }
                // 3. מהפונקציה הישנה, אם קיימת
                else if (window.extractVideoId) {
                    videoId = window.extractVideoId(location.href);
                    console.log('[updateChordsMode] Found videoId using window.extractVideoId:', videoId);
                }
                // 4. חילוץ ישיר מה-URL עם regex
                else {
                    const urlMatch = location.href.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?\s]+)/);
                    if (urlMatch && urlMatch[1]) {
                        videoId = urlMatch[1];
                        console.log('[updateChordsMode] Extracted videoId from URL:', videoId);
                    }
                }
                
                if (videoId) {
                    // עדכון רגיל עבור אקורדים רגילים
                    if (window.chordsActive || overlayVisible) {
                        const smartUpdated = await window.smartUpdateChordsMode(videoId, previousMode, mode, {
                            requestId: modeUpdateRequestId
                        });
                        if (isStaleModeUpdate()) return;
                        if (smartUpdated === false) {
                            throw new Error('Smart mode update skipped');
                        }
                    }
                    
                    // עדכון מיוחד עבור פאנל Lyrics & Chords
                    if (window.lyricsChordsPanelActive && typeof window.refreshLyricsChordsPanel === 'function') {
                        console.log('[updateChordsMode] מעדכן פאנל Lyrics & Chords למצב:', mode);
                        await window.refreshLyricsChordsPanel();
                        if (isStaleModeUpdate()) return;
                    }
                    
                    updateChordsModeMenuState(mode);
                    return;
                } else {
                    console.warn('[updateChordsMode] Could not determine videoId');
                }
            } catch (e) {
                console.warn('[updateChordsMode] Smart update failed, falling back to reload', e);
            }
            
            // If smart update failed, try a full reload with Progress Bar
            // 🎯 הצגת Progress Bar לפני fetch
            if (window.extractorModule?.createProgressBar) {
                window.extractorModule.createProgressBar(false, true, `Loading ${getChordsModeDisplayName(mode)} chords...`);
            }
            
            if (typeof window.reloadOverlay === 'function') {
                console.log('[updateChordsMode] Falling back to reloadOverlay');
                window.reloadOverlay();
            } else {
                console.warn('[updateChordsMode] reloadOverlay function not found');
                // ניסיון לבצע טעינה מחדש בדרך אחרת
                if (window.chordsDisplay?.fullCleanup && window.chordsDisplay?.activate) {
                    const vid = videoId || window.currentVideoId;
                    if (vid) {
                        console.log('[updateChordsMode] Attempting manual reload with videoId:', vid);
                        window.chordsDisplay.fullCleanup();
                        window.chordsDisplay.activate(vid).catch(err => {
                            console.error('[updateChordsMode] Manual reload failed:', err);
                            // הסרת Progress Bar במקרה של שגיאה
                            if (window.extractorModule?.removeProgressBar) {
                                window.extractorModule.removeProgressBar();
                            }
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.error('[updateChordsMode] Error updating mode', e);
    }
};

// 🔥 FIX #9: LRU Cache for chord texts (keep last 10 videos)
// Cache for chord texts to avoid DB access on every mode change
window.chordTextsCache = window.chordTextsCache || {};
window.chordTextsCacheOrder = window.chordTextsCacheOrder || []; // Track insertion order
const MAX_CHORD_CACHE_SIZE = 10;

// Helper function to add to cache with LRU eviction
function addToChordTextsCache(videoId, data) {
  // If already exists, remove from order array
  const existingIndex = window.chordTextsCacheOrder.indexOf(videoId);
  if (existingIndex > -1) {
    window.chordTextsCacheOrder.splice(existingIndex, 1);
  }
  
  // Add to cache
  window.chordTextsCache[videoId] = data;
  window.chordTextsCacheOrder.push(videoId);
  
  // Evict oldest if over limit
  if (window.chordTextsCacheOrder.length > MAX_CHORD_CACHE_SIZE) {
    const oldestVideoId = window.chordTextsCacheOrder.shift();
    delete window.chordTextsCache[oldestVideoId];
    if (window.DEBUG) console.log(`[chordTextsCache] Evicted oldest entry: ${oldestVideoId}`);
  }
}

/**
 * Smart update function that updates chord data without a full reload
 */
window.smartUpdateChordsMode = async function(videoId, oldMode, newMode, options = {}) {
  newMode = normalizeChordsModeValue(newMode);
  const hasExternalRequestId = Number.isInteger(options?.requestId);
  const requestId = hasExternalRequestId
    ? options.requestId
    : ((window.chordsModeUpdateRequestId || 0) + 1);
  if (!hasExternalRequestId) {
    window.chordsModeUpdateRequestId = requestId;
  }
  const isStaleModeUpdate = () => (
    window.chordsModeUpdateRequestId !== requestId ||
    normalizeChordsModeValue(window.chordsMode || 'regular') !== newMode
  );

  if (!window.databaseManager || !window.chordsDisplay || isStaleModeUpdate()) return false;
  
  const DEBUG = !!window.DEBUG;
  
  try {
    // Save current video time
    const video = document.querySelector('video');
    const currentTime = video ? video.currentTime : 0;
    
    // Check cache first, load from DB only if not cached
    let data = window.chordTextsCache[videoId];
    if (!data) {
      if (DEBUG) console.log('[smartUpdateChordsMode] Loading from DB (not in cache)');
      data = await window.databaseManager.loadChordsFromIndexedDB(videoId);
      if (isStaleModeUpdate()) return false;
      if (!data || !data.chordText) {
        throw new Error('No chords data found');
      }
      // Cache the data for future mode changes using LRU helper
      addToChordTextsCache(videoId, {
        chordText: data.chordText,
        chordTextRegularPlus: data.chordTextRegularPlus,
        chordTextHarmonic: data.chordTextHarmonic,
        chordTextHarmonicPlus: data.chordTextHarmonicPlus
      });
    } else {
      if (DEBUG) console.log('[smartUpdateChordsMode] Using cached data (no DB access)');
    }
    
    // 🔄 בדיקה אם יש נתונים למצב המבוקש - אם לא, עשה fetch מהשרת
    const needsFetch = (newMode === 'harmonic' && !hasDirectChordTextForMode(data, 'harmonic')) ||
                       (newMode === 'harmonicPlus' && !hasDirectChordTextForMode(data, 'harmonicPlus'));
    
    if (needsFetch) {
      console.log(`[smartUpdateChordsMode] Missing ${newMode} data - fetching from server`);
      // נקה cache ועשה fetch מלא
      delete window.chordTextsCache[videoId];
      throw new Error('Missing mode data - need full reload');
    }
    
    // Select appropriate text based on mode
    let newChordText = pickChordTextForMode(data, newMode);
    
    // Parse the new chord data
    const newChordsData = parseChordsData(newChordText);
    newChordsData.forEach((chord, i) => { chord.originalIndex = i; });
    if (isStaleModeUpdate()) return false;
    
    // Calculate unique chord names
    const uniqueNames = [...new Set(newChordsData.map(c => c.chord))];
    
    // 🚀 שימוש ב-PANEL_SUBSET מהשרת (כבר נטען ב-IndexedDB)
    // אין צורך לטעון COMPLETE_CHORDS - חיסכון של ~16MB RAM!
    if (DEBUG) console.log(`[smartUpdateChordsMode] Using PANEL_SUBSET from server (${Object.keys(window.PANEL_SUBSET?.chords || {}).length} chords cached)`);
    
    // ניקוי cache כדי שהרנדר יעבוד על הנתונים החדשים
    if (window.chordRenderer?.clearCache) {
      window.chordRenderer.clearCache();
    }
    
    // Do the quick update - משתמש ב-PANEL_SUBSET.chords במקום newChordSubset
    if (window.chordsDisplay.quickUpdate) {
      await window.chordsDisplay.quickUpdate(newChordsData, window.PANEL_SUBSET?.chords || {}, currentTime);
      if (isStaleModeUpdate()) return false;
    } else {
      // Fallback to old method - clearCache כבר בוצע למעלה
      if (window.chordsDisplay.updateDisplay) {
        window.chordsDisplay.updateDisplay(currentTime);
      }
    }
    
    // 🎸 עדכון הקרוסלה החדשה
    const chords = newChordsData.map(chord => ({
      name: chord.chord,
      time: chord.time
    }));
    window.chordsDisplay.currentSongData = {
      ...(window.chordsDisplay.currentSongData || {}),
      videoId,
      chords
    };

    if (window.ycChordCarousel && window.ycChordCarousel.isVisible) {
      const videoElement = document.querySelector('video.html5-main-video');
      if (chords.length > 0 && videoElement) {
        window.ycChordCarousel.show(chords, videoElement);
        if (DEBUG) console.log(`[smartUpdateChordsMode] Carousel updated with ${chords.length} chords`);
      }
    }
    
    // הערה: לא צריך להחזיר originalText כי show() כבר עדכן את הכל
    
    if (DEBUG) {
      console.log(`[smartUpdateChordsMode] Successfully updated from ${oldMode} to ${newMode}`);
    }
    return true;
    
  } catch (error) {
    if (isStaleModeUpdate()) return false;
    console.error('[smartUpdateChordsMode] Error during smart update:', error);
    
    // במקרה של שגיאה, נחזור לשיטה הישנה
    window.chordsDisplay.fullCleanup?.();
    const activateSuccess = await window.chordsDisplay.activate(videoId);
    if (isStaleModeUpdate()) return false;
    
    // 🔄 אחרי FETCH מוצלח, עדכן את הקרוסלה/פאנל
    if (activateSuccess) {
      console.log('[smartUpdateChordsMode] ✅ Fetch completed, updating display...');
      
      // טען את הנתונים החדשים מ-IndexedDB
      const freshData = await window.databaseManager.loadChordsFromIndexedDB(videoId);
      if (isStaleModeUpdate()) return false;
      if (freshData) {
        // בחר את הטקסט הנכון לפי המצב
        let chordTextToUse = pickChordTextForMode(freshData, newMode);
        
        // Parse the chord data
        const newChordsData = parseChordsData(chordTextToUse);
        const chords = newChordsData.map(chord => ({
          name: chord.chord,
          time: chord.time
        }));
        window.chordsDisplay.currentSongData = {
          ...(window.chordsDisplay.currentSongData || {}),
          videoId,
          chords
        };
        
        // 🎸 עדכון הקרוסלה אם פתוחה
        if (window.ycChordCarousel && window.ycChordCarousel.isVisible) {
          const videoElement = document.querySelector('video.html5-main-video');
          if (chords.length > 0 && videoElement) {
            window.ycChordCarousel.show(chords, videoElement);
            console.log(`[smartUpdateChordsMode] ✅ Carousel updated with ${chords.length} ${newMode} chords`);
          }
        }
        
        // 🎵 עדכון פאנל Lyrics & Chords אם פתוח
        if (window.lyricsChordsPanelActive && typeof window.refreshLyricsChordsPanel === 'function') {
          console.log('[smartUpdateChordsMode] ✅ Refreshing Lyrics & Chords panel...');
          await window.refreshLyricsChordsPanel();
          if (isStaleModeUpdate()) return false;
        }
        
        // עדכן את ה-cache using LRU helper
        addToChordTextsCache(videoId, {
          chordText: freshData.chordText,
          chordTextRegularPlus: freshData.chordTextRegularPlus,
          chordTextHarmonic: freshData.chordTextHarmonic,
          chordTextHarmonicPlus: freshData.chordTextHarmonicPlus
        });
        return true;
      }
    }
    return false;
  }
};

// פונקציית עזר לפיענוח נתוני אקורדים (העתק מ-chordsDisplay.js)
function parseChordsData(chordsText) {
    if (!chordsText) return [];
    return chordsText.split(',')
        .map(entry => {
            const [timeStr, chordName] = entry.split(':');
            if (!timeStr || !chordName) return null;
            return { time: parseFloat(timeStr), chord: chordName };
        })
        .filter(entry => entry !== null)
        .sort((a, b) => a.time - b.time);
}

// Create chords mode submenu element
window.createChordsModeSubmenu = function(parentMenu) {
    const submenu = document.createElement('div');
    submenu.className = 'settings-menu chords-mode-submenu yc';
    submenu.setAttribute('data-yc-menu', 'chords-mode');
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

    // Header with back button
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
        submenu.style.display = 'none';
        if (parentMenu) parentMenu.style.display = 'block';
    });

    const headerText = document.createElement('span');
    headerText.textContent = 'Chords Mode';
    headerText.style.fontWeight = '500';

    header.appendChild(backButton);
    header.appendChild(headerText);
    submenu.appendChild(header);

    const optionsContainer = document.createElement('div');
    optionsContainer.style.padding = '8px 0';

    const modes = [
        { value: 'regular', label: 'R (Beginner)' },
        { value: 'regularPlus', label: 'R+ (Beginner+)' },
        { value: 'harmonic', label: 'H (Intermediate)' },
        { value: 'harmonicPlus', label: 'H+ (Advanced)' }
    ];

    modes.forEach(mode => {
        const item = document.createElement('div');
        item.className = 'settings-item chords-mode-button';
        item.dataset.modeValue = mode.value;
        item.style.cssText = `
            padding: 12px 24px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            user-select: none;
            -webkit-user-select: none;
        `;

        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '8px';

        const check = document.createElement('span');
        check.textContent = '✓';
        check.className = 'mode-check';
        check.style.cssText = `
            color: #3ea6ff;
            opacity: 0;
            font-weight: bold;
            display: inline-block;
        `;

        const label = document.createElement('span');
        label.className = 'mode-label';
        label.textContent = mode.label;

        wrapper.appendChild(check);
        wrapper.appendChild(label);
        item.appendChild(wrapper);

        item.addEventListener('mouseover', () => {
            item.style.backgroundColor = 'rgba(255,255,255,0.1)';
        });
        item.addEventListener('mouseout', () => {
            item.style.backgroundColor = 'transparent';
        });
        item.addEventListener('click', () => {
            window.updateChordsMode(mode.value);
        });

        optionsContainer.appendChild(item);
    });

    submenu.appendChild(optionsContainer);
    const syncModeState = async () => {
        let mode = normalizeChordsModeValue(window.chordsMode || 'regular');
        try {
            const result = await chrome.storage.sync.get(['chordsMode']);
            mode = normalizeChordsModeValue(result?.chordsMode || mode);
        } catch (error) {
            // Fallback to current runtime mode
        }
        window.chordsMode = mode;
        updateChordsModeMenuState(mode);
    };

    // Initialize state from storage when menu is created
    syncModeState();

    const modeChangedHandler = (event) => {
        const mode = normalizeChordsModeValue(event?.detail?.newMode || window.chordsMode || 'regular');
        window.chordsMode = mode;
        updateChordsModeMenuState(mode);
    };
    window.addEventListener('yc:modeChanged', modeChangedHandler);
    submenu.modeChangedHandler = modeChangedHandler;

    // Observe visibility to adjust position
    const observer = new MutationObserver(mutations => {
        mutations.forEach(m => {
            if (m.type === 'style' && m.target === submenu && submenu.style.display === 'block') {
                const controls = document.querySelector('.ytp-chrome-bottom');
                if (controls) {
                    const rect = controls.getBoundingClientRect();
                    submenu.style.bottom = `${rect.height}px`;
                    submenu.style.right = '12px';
                }
            }
        });
    });

    observer.observe(submenu, { attributes: true, attributeFilter: ['style'] });
    submenu.observer = observer;

    submenu.addEventListener('click', e => e.stopPropagation());

    return submenu;
};

// Create chord display submenu element (Random Positions + Hide Quick Chords)
window.createChordDisplaySubmenu = function(parentMenu) {
    const submenu = document.createElement('div');
    submenu.className = 'settings-menu chord-display-submenu yc';
    submenu.setAttribute('data-yc-menu', 'chord-display');
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
        overflow: visible;
        user-select: none;
        -webkit-user-select: none;
    `;

    // Header with back button
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
        submenu.style.display = 'none';
        if (parentMenu) parentMenu.style.display = 'block';
    });

    const headerText = document.createElement('span');
    headerText.textContent = 'Random Cube';
    headerText.style.fontWeight = '500';

    header.appendChild(backButton);
    header.appendChild(headerText);
    submenu.appendChild(header);

    // =========================================
    // RANDOM POSITIONS SECTION
    // =========================================
    const DICE_ENABLED_KEY = "youchords_dice_enabled";
    const DICE_PERCENTAGE_KEY = "youchords_dice_percentage";
    const DICE_RANGE_KEY = "youchords_dice_position_range";
    const DICE_CUSTOM_RANGES_KEY = "youchords_dice_custom_ranges";
    const DEFAULT_DICE_RANGES = [
        '1-5', '1-10', '1-15',
        '5-10', '5-15', '5-20',
        '10-15', '10-20',
        '1-MAX', '5-MAX', '15-MAX', '20-MAX'
    ];

    const normalizeRangeValue = (value) => {
        if (typeof value !== 'string') return null;
        const match = value.trim().toUpperCase().match(/^(\d+)\s*-\s*(\d+|MAX)$/);
        if (!match) return null;
        const min = Math.max(1, parseInt(match[1], 10));
        if (!Number.isFinite(min)) return null;
        if (match[2] === 'MAX') return `${min}-MAX`;
        const max = Math.max(1, parseInt(match[2], 10));
        if (!Number.isFinite(max)) return null;
        const start = Math.min(min, max);
        const end = Math.max(min, max);
        return `${start}-${end}`;
    };

    const normalizeCustomNumericRange = (fromValue, toValue) => {
        const from = parseInt(fromValue, 10);
        const to = parseInt(toValue, 10);
        if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
        const start = Math.max(1, Math.min(from, to));
        const end = Math.max(1, Math.max(from, to));
        return `${start}-${end}`;
    };

    const loadCustomRanges = () => {
        try {
            const raw = localStorage.getItem(DICE_CUSTOM_RANGES_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            const normalized = parsed
                .map((range) => normalizeRangeValue(range))
                .filter((range) => !!range && !DEFAULT_DICE_RANGES.includes(range));
            return [...new Set(normalized)];
        } catch (error) {
            console.warn('[ChordDisplayMenu] Failed to parse custom ranges:', error);
            return [];
        }
    };

    const saveCustomRanges = (ranges) => {
        const unique = [...new Set((ranges || []).filter((range) => !!range && !DEFAULT_DICE_RANGES.includes(range)))];
        localStorage.setItem(DICE_CUSTOM_RANGES_KEY, JSON.stringify(unique));
    };

    const diceEnabled = localStorage.getItem(DICE_ENABLED_KEY) !== "false";
    const dicePercentage = parseInt(localStorage.getItem(DICE_PERCENTAGE_KEY) || "50", 10);
    let customRanges = loadCustomRanges();
    let savedRange = normalizeRangeValue(localStorage.getItem(DICE_RANGE_KEY) || "1-MAX") || "1-MAX";
    if (!DEFAULT_DICE_RANGES.includes(savedRange) && !customRanges.includes(savedRange)) {
        customRanges.push(savedRange);
        saveCustomRanges(customRanges);
    }
    localStorage.setItem(DICE_RANGE_KEY, savedRange);

    const diceSection = document.createElement('div');
    diceSection.className = 'dice-menu-section';
    diceSection.style.cssText = `
        padding: 12px 24px;
        border-top: 1px solid rgba(255,255,255,0.1);
    `;

    const diceTitle = document.createElement('div');
    diceTitle.textContent = 'Random Positions';
    diceTitle.style.cssText = `
        font-size: 11px;
        color: #888;
        margin-bottom: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    `;
    diceSection.appendChild(diceTitle);

    // Toggle row
    const toggleRow = document.createElement('div');
    toggleRow.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
    `;

    const toggleLabel = document.createElement('span');
    toggleLabel.textContent = 'Enable Random';
    toggleLabel.style.cssText = 'font-size: 13px; color: #fff;';

    const toggle = document.createElement('div');
    toggle.className = 'dice-toggle';
    toggle.style.cssText = `
        width: 44px;
        height: 24px;
        background: ${diceEnabled ? "#4ade80" : "#555"};
        border-radius: 12px;
        position: relative;
        cursor: pointer;
        transition: background 0.2s;
    `;

    const toggleKnob = document.createElement('div');
    toggleKnob.style.cssText = `
        position: absolute;
        width: 20px;
        height: 20px;
        background: white;
        border-radius: 50%;
        top: 2px;
        left: ${diceEnabled ? "22px" : "2px"};
        transition: left 0.2s;
    `;
    toggle.appendChild(toggleKnob);

    toggleRow.appendChild(toggleLabel);
    toggleRow.appendChild(toggle);
    diceSection.appendChild(toggleRow);

    // Percentage row
    const dropdownRow = document.createElement('div');
    dropdownRow.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        opacity: ${diceEnabled ? "1" : "0.5"};
        cursor: ${diceEnabled ? "default" : "not-allowed"};
        transition: opacity 0.2s;
    `;

    const dropdownLabel = document.createElement('span');
    dropdownLabel.textContent = 'Percentage';
    dropdownLabel.style.cssText = 'font-size: 13px; color: #fff;';

    const dropdown = document.createElement('select');
    dropdown.className = 'dice-percentage-dropdown';
    dropdown.style.cssText = `
        padding: 6px 10px;
        font-size: 13px;
        background: #3d3d3d;
        color: #fff;
        border: 1px solid #555;
        border-radius: 4px;
        cursor: ${diceEnabled ? "pointer" : "not-allowed"};
        pointer-events: ${diceEnabled ? "auto" : "none"};
        outline: none;
    `;

    for (let i = 5; i <= 100; i += 5) {
        const option = document.createElement('option');
        option.value = i.toString();
        option.textContent = `${i}%`;
        if (i === dicePercentage) option.selected = true;
        dropdown.appendChild(option);
    }

    dropdownRow.appendChild(dropdownLabel);
    dropdownRow.appendChild(dropdown);
    diceSection.appendChild(dropdownRow);

    // Position range row
    const rangeRow = document.createElement('div');
    rangeRow.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 12px;
        opacity: ${diceEnabled ? "1" : "0.5"};
        cursor: ${diceEnabled ? "default" : "not-allowed"};
        transition: opacity 0.2s;
    `;

    const rangeLabel = document.createElement('span');
    rangeLabel.textContent = 'Position Range';
    rangeLabel.style.cssText = 'font-size: 13px; color: #fff;';

    const setDiceRangeValue = (value) => {
        localStorage.setItem(DICE_RANGE_KEY, value);
        savedRange = value;
        if (window.DiceIcon && window.DiceIcon.setPositionRange) {
            window.DiceIcon.setPositionRange(value);
        }
        console.log("[ChordDisplayMenu] Position Range:", value);
    };

    const getAllRanges = () => [...DEFAULT_DICE_RANGES, ...customRanges];

    const rangeControlGroup = document.createElement('div');
    rangeControlGroup.style.cssText = `
        position: relative;
        min-width: 120px;
    `;

    const rangeDropdownButton = document.createElement('button');
    rangeDropdownButton.type = 'button';
    rangeDropdownButton.className = 'dice-range-dropdown';
    rangeDropdownButton.style.cssText = `
        width: 100%;
        padding: 6px 10px;
        font-size: 13px;
        background: #3d3d3d;
        color: #fff;
        border: 1px solid #555;
        border-radius: 4px;
        cursor: ${diceEnabled ? "pointer" : "not-allowed"};
        outline: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    `;

    const rangeDropdownButtonText = document.createElement('span');
    rangeDropdownButtonText.textContent = savedRange;
    rangeDropdownButtonText.style.cssText = `
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `;

    const rangeDropdownCaret = document.createElement('span');
    rangeDropdownCaret.textContent = '▾';
    rangeDropdownCaret.style.cssText = `
        font-size: 12px;
        opacity: 0.8;
    `;

    rangeDropdownButton.appendChild(rangeDropdownButtonText);
    rangeDropdownButton.appendChild(rangeDropdownCaret);

    const rangeDropdownMenu = document.createElement('div');
    rangeDropdownMenu.style.cssText = `
        position: absolute;
        bottom: calc(100% + 4px);
        right: 0;
        min-width: 150px;
        max-height: 320px;
        overflow-y: auto;
        background: #2f2f2f;
        border: 1px solid #555;
        border-radius: 6px;
        box-shadow: 0 6px 14px rgba(0,0,0,0.35);
        z-index: 3005;
        display: none;
        transform-origin: bottom right;
        user-select: none;
        -webkit-user-select: none;
    `;

    const closeRangeMenu = () => {
        rangeDropdownMenu.style.display = 'none';
    };

    const rebuildRangeDropdown = (selectedValue) => {
        const allRanges = getAllRanges();
        const nextValue = allRanges.includes(selectedValue) ? selectedValue : "1-MAX";
        if (nextValue !== selectedValue) {
            setDiceRangeValue(nextValue);
        }
        rangeDropdownButtonText.textContent = nextValue;

        while (rangeDropdownMenu.firstChild) {
            rangeDropdownMenu.removeChild(rangeDropdownMenu.firstChild);
        }

        const appendMenuItem = (label, onClick, isSelected = false, removeHandler = null) => {
            const item = document.createElement('div');
            item.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 7px 6px 7px 10px;
                font-size: 13px;
                color: #fff;
                background: ${isSelected ? '#2f6fd0' : 'transparent'};
                cursor: pointer;
            `;

            item.addEventListener('mouseenter', () => {
                if (!isSelected) item.style.background = 'rgba(255,255,255,0.08)';
            });
            item.addEventListener('mouseleave', () => {
                item.style.background = isSelected ? '#2f6fd0' : 'transparent';
            });
            item.addEventListener('click', onClick);

            const text = document.createElement('span');
            text.textContent = label;
            text.style.cssText = 'white-space: nowrap;';
            item.appendChild(text);

            if (removeHandler) {
                const removeButton = document.createElement('button');
                removeButton.type = 'button';
                removeButton.textContent = 'X';
                removeButton.title = `Remove ${label}`;
                removeButton.style.cssText = `
                    border: none;
                    background: transparent;
                    color: #ff8b8b;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 700;
                    line-height: 1;
                    width: 16px;
                    min-width: 16px;
                    margin-left: auto;
                    padding: 0;
                    text-align: right;
                `;
                removeButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    removeHandler();
                });
                item.appendChild(removeButton);
            }

            rangeDropdownMenu.appendChild(item);
        };

        const currentRange = localStorage.getItem(DICE_RANGE_KEY) || "1-MAX";
        allRanges.forEach((range) => {
            appendMenuItem(
                range,
                () => {
                    setDiceRangeValue(range);
                    rangeDropdownButtonText.textContent = range;
                    closeRangeMenu();
                    rebuildRangeDropdown(range);
                },
                currentRange === range,
                customRanges.includes(range)
                    ? () => {
                        customRanges = customRanges.filter((item) => item !== range);
                        saveCustomRanges(customRanges);

                        const fallback = currentRange === range ? "1-MAX" : currentRange;
                        setDiceRangeValue(fallback);
                        rangeDropdownButtonText.textContent = fallback;
                        rebuildRangeDropdown(fallback);
                    }
                    : null
            );
        });

        const separator = document.createElement('div');
        separator.style.cssText = 'height: 1px; background: rgba(255,255,255,0.12); margin: 4px 0;';
        rangeDropdownMenu.appendChild(separator);

        appendMenuItem('Custom range...', () => {
            customRangeEditorRow.style.display = 'flex';
            customFromInput.focus();
            closeRangeMenu();
        }, false, null);
    };

    const customRangeEditorRow = document.createElement('div');
    customRangeEditorRow.style.cssText = `
        display: none;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
        opacity: ${diceEnabled ? "1" : "0.5"};
        pointer-events: ${diceEnabled ? "auto" : "none"};
    `;

    const customFromInput = document.createElement('input');
    customFromInput.type = 'number';
    customFromInput.min = '1';
    customFromInput.step = '1';
    customFromInput.inputMode = 'numeric';
    customFromInput.pattern = '[0-9]*';
    customFromInput.placeholder = 'From';
    customFromInput.style.cssText = `
        width: 68px;
        padding: 6px 8px;
        font-size: 12px;
        background: #3d3d3d;
        color: #fff;
        border: 1px solid #555;
        border-radius: 4px;
        outline: none;
    `;

    const customToInput = document.createElement('input');
    customToInput.type = 'number';
    customToInput.min = '1';
    customToInput.step = '1';
    customToInput.inputMode = 'numeric';
    customToInput.pattern = '[0-9]*';
    customToInput.placeholder = 'To';
    customToInput.style.cssText = customFromInput.style.cssText;

    const customSaveButton = document.createElement('button');
    customSaveButton.type = 'button';
    customSaveButton.textContent = 'Save';
    customSaveButton.style.cssText = `
        padding: 6px 10px;
        font-size: 12px;
        background: #4ade80;
        color: #111;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
    `;

    rangeDropdownButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (rangeDropdownButton.disabled) return;

        const isOpen = rangeDropdownMenu.style.display === 'block';
        if (isOpen) {
            closeRangeMenu();
        } else {
            rebuildRangeDropdown(localStorage.getItem(DICE_RANGE_KEY) || "1-MAX");
            rangeDropdownMenu.style.display = 'block';
        }
    });

    const rangeMenuOutsideClickHandler = (event) => {
        if (!rangeControlGroup.contains(event.target)) {
            closeRangeMenu();
        }
    };
    document.addEventListener('click', rangeMenuOutsideClickHandler);
    submenu.rangeMenuOutsideClickHandler = rangeMenuOutsideClickHandler;

    rangeControlGroup.appendChild(rangeDropdownButton);
    rangeControlGroup.appendChild(rangeDropdownMenu);
    rangeRow.appendChild(rangeLabel);
    rangeRow.appendChild(rangeControlGroup);
    diceSection.appendChild(rangeRow);

    customRangeEditorRow.appendChild(customFromInput);
    customRangeEditorRow.appendChild(customToInput);
    customRangeEditorRow.appendChild(customSaveButton);
    diceSection.appendChild(customRangeEditorRow);

    const saveCustomRangeFromInputs = () => {
        const normalizedRange = normalizeCustomNumericRange(customFromInput.value, customToInput.value);
        if (!normalizedRange) {
            console.warn('[ChordDisplayMenu] Invalid custom range input');
            customFromInput.focus();
            return;
        }

        if (!DEFAULT_DICE_RANGES.includes(normalizedRange) && !customRanges.includes(normalizedRange)) {
            customRanges.push(normalizedRange);
            customRanges.sort((a, b) => {
                const [aMin] = a.split('-').map((n) => parseInt(n, 10));
                const [bMin] = b.split('-').map((n) => parseInt(n, 10));
                return aMin - bMin;
            });
            saveCustomRanges(customRanges);
        }

        setDiceRangeValue(normalizedRange);
        rebuildRangeDropdown(normalizedRange);
        rangeDropdownButtonText.textContent = normalizedRange;
        customRangeEditorRow.style.display = 'none';
        customFromInput.value = '';
        customToInput.value = '';
    };

    customSaveButton.addEventListener('click', saveCustomRangeFromInputs);

    const shouldAllowNumericInputKey = (event) => {
        const key = event.key;
        const allowedControlKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Home', 'End', 'Enter'];
        if (allowedControlKeys.includes(key)) return true;

        const isShortcut = event.ctrlKey || event.metaKey;
        if (isShortcut) {
            const lowerKey = String(key || '').toLowerCase();
            return ['a', 'c', 'v', 'x', 'z', 'y'].includes(lowerKey);
        }

        return /^[0-9]$/.test(key);
    };

    const sanitizeNumericInput = (input) => {
        const sanitized = String(input.value || '').replace(/[^\d]/g, '');
        if (sanitized !== input.value) {
            input.value = sanitized;
        }
    };

    [customFromInput, customToInput].forEach((input) => {
        input.addEventListener('keydown', (event) => {
            // Prevent YouTube global hotkeys (0-9 timeline jumps) while typing here.
            event.stopPropagation();
            event.stopImmediatePropagation();

            if (!shouldAllowNumericInputKey(event)) {
                event.preventDefault();
                return;
            }

            if (event.key === 'Enter') {
                event.preventDefault();
                saveCustomRangeFromInputs();
            }
        });

        input.addEventListener('keyup', (event) => {
            event.stopPropagation();
            event.stopImmediatePropagation();
        });

        input.addEventListener('keypress', (event) => {
            event.stopPropagation();
            event.stopImmediatePropagation();
            if (!shouldAllowNumericInputKey(event)) {
                event.preventDefault();
            }
        });

        input.addEventListener('input', () => {
            sanitizeNumericInput(input);
        });
    });

    rebuildRangeDropdown(savedRange);
    rangeDropdownButtonText.textContent = savedRange;

    const updateRangeControlsState = (enabled) => {
        rangeRow.style.opacity = enabled ? "1" : "0.5";
        rangeRow.style.cursor = enabled ? "default" : "not-allowed";
        rangeDropdownButton.disabled = !enabled;
        rangeDropdownButton.style.pointerEvents = enabled ? "auto" : "none";
        rangeDropdownButton.style.cursor = enabled ? "pointer" : "not-allowed";
        rangeDropdownButton.style.opacity = enabled ? "1" : "0.6";
        if (!enabled) closeRangeMenu();

        customRangeEditorRow.style.opacity = enabled ? "1" : "0.5";
        customRangeEditorRow.style.pointerEvents = enabled ? "auto" : "none";
        customFromInput.disabled = !enabled;
        customToInput.disabled = !enabled;
        customSaveButton.disabled = !enabled;
        customSaveButton.style.cursor = enabled ? "pointer" : "not-allowed";
        customSaveButton.style.opacity = enabled ? "1" : "0.6";
    };

    updateRangeControlsState(diceEnabled);

    toggle.addEventListener('click', () => {
        const currentEnabled = localStorage.getItem(DICE_ENABLED_KEY) !== "false";
        const newEnabled = !currentEnabled;
        localStorage.setItem(DICE_ENABLED_KEY, newEnabled.toString());

        toggle.style.background = newEnabled ? "#4ade80" : "#555";
        toggleKnob.style.left = newEnabled ? "22px" : "2px";

        dropdownRow.style.opacity = newEnabled ? "1" : "0.5";
        dropdownRow.style.cursor = newEnabled ? "default" : "not-allowed";
        dropdown.style.pointerEvents = newEnabled ? "auto" : "none";
        dropdown.style.cursor = newEnabled ? "pointer" : "not-allowed";

        updateRangeControlsState(newEnabled);

        window.dispatchEvent(new CustomEvent("yc:diceEnabledChanged", {
            detail: { enabled: newEnabled }
        }));
        console.log("[ChordDisplayMenu] Dice enabled:", newEnabled);
    });

    dropdown.addEventListener('change', (e) => {
        const value = parseInt(e.target.value, 10);
        localStorage.setItem(DICE_PERCENTAGE_KEY, value.toString());

        if (window.DiceIcon && window.DiceIcon.setPercentage) {
            window.DiceIcon.setPercentage(value);
        }
        console.log("[ChordDisplayMenu] Percentage:", value);
    });

    submenu.appendChild(diceSection);

    const observer = new MutationObserver(mutations => {
        mutations.forEach(m => {
            if (m.type === 'style' && m.target === submenu && submenu.style.display === 'block') {
                const controls = document.querySelector('.ytp-chrome-bottom');
                if (controls) {
                    const rect = controls.getBoundingClientRect();
                    submenu.style.bottom = `${rect.height}px`;
                    submenu.style.right = '12px';
                }
            }
        });
    });

    observer.observe(submenu, { attributes: true, attributeFilter: ['style'] });
    submenu.observer = observer;
    submenu.addEventListener('click', e => e.stopPropagation());

    return submenu;
};

// Helper to disconnect observer and optionally remove the submenu
window.disposeChordsModeSubmenu = function(submenu, remove = false) {
    if (!submenu) {
        submenu = document.querySelector('.chords-mode-submenu');
    }
    if (submenu) {
        if (submenu.observer) {
            submenu.observer.disconnect();
            delete submenu.observer;
        }
        if (submenu.modeChangedHandler) {
            window.removeEventListener('yc:modeChanged', submenu.modeChangedHandler);
            delete submenu.modeChangedHandler;
        }
        if (remove && submenu.isConnected) {
            submenu.remove();
        }
    }
};

window.disposeChordDisplaySubmenu = function(submenu, remove = false) {
    if (!submenu) {
        submenu = document.querySelector('.chord-display-submenu');
    }
    if (submenu) {
        if (submenu.rangeMenuOutsideClickHandler) {
            document.removeEventListener('click', submenu.rangeMenuOutsideClickHandler);
            delete submenu.rangeMenuOutsideClickHandler;
        }
        if (submenu.observer) {
            submenu.observer.disconnect();
            delete submenu.observer;
        }
        if (remove && submenu.isConnected) {
            submenu.remove();
        }
    }
};
