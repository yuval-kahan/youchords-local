// Sizes submenu with 4 size controls
// sizesMenu.js

// ───────────────────────────────────────────────
// 0. BOOTSTRAP  –  DEBUG FLAG + סימון טעינה
// ───────────────────────────────────────────────

/* ── DEBUG MODE (כיבוי מלא) ──────────────────────────── */
const DBG_ENABLED = false;        // כיבוי לוגים לפרודקשן

// נעביר property-getter שמחזיר תמיד false (לכל קוד חיצוני)
Object.defineProperty(window, 'DEBUG', {
    get () { return false; },
    set () {}                              // התעלמות מבקשות שינוי
});

/* ל-prod אין צורך בטביעת "loaded" – לכן נמחק לגמרי את ה-console.log */

// ודא שה-map הגלובלי קיים
window.YC_MENUS = window.YC_MENUS || {};

// ------------------------------------------------------------
// 1.  TOOLING  –  לוגר בסיסי + מלכוד שגיאות גלובלי
// ------------------------------------------------------------
/* פונקציית DBG נשארת, אך לעולם לא תדפיס */
const DBG = () => {};

window.addEventListener('error', e => {
  DBG('💥 window.error', e.message, e.filename+':'+e.lineno);
});

window.addEventListener('unhandledrejection', e => {
  DBG('💥 unhandled-rejection', e.reason);
});

// ------------------------------------------------------------
// 2. הגדרות גדלים וברירות מחדל - Carousel Size
// ------------------------------------------------------------

// ברירת מחדל לגודל הקרוסלה
const DEFAULT_CAROUSEL_SIZE = 0.75;

// טווח ערכים מותר
const CAROUSEL_SIZE_RANGE = {
    min: 0.5,
    max: 1.5,
    step: 0.05
};

// מפתח localStorage
const CAROUSEL_SIZE_STORAGE_KEY = 'youchords_carousel_size';
const ADVANCED_SETTINGS_STORAGE_KEY = 'youchords_advanced_carousel_settings';
const POSITION_CONTROLS_TIME_ROW_OFFSET = 10;

// משתנה גלובלי לערך הנוכחי
let currentCarouselSize = DEFAULT_CAROUSEL_SIZE;

// ברירות מחדל להגדרות מתקדמות (ערכי בסיס לפני הכפלה ב-scale)
const DEFAULT_ADVANCED_SETTINGS = {
    // GRID
    diagramScale: 2.1,
    diagramTranslateX: -1,
    diagramTranslateY: 10,
    dotSize: 3.6,
    fingerNumberSize: 5,
    fingerNumberTranslateX: 0,
    fingerNumberTranslateY: 0,
    fretNumberSize: 11,
    fretNumberTranslateX: 0,
    fretNumberTranslateY: 0,
    // Grid Lines Width - All Together
    horizontalFretsWidthAll: 0.8,
    verticalStringsWidthAll: 0.8,
    // Individual Horizontal Frets (6 frets)
    fret1Width: 0.8,
    fret2Width: 0.8,
    fret3Width: 0.8,
    fret4Width: 0.8,
    fret5Width: 0.8,
    fret6Width: 0.8,
    // Individual Vertical Strings (6 strings)
    stringEHighWidth: 0.8,
    stringBWidth: 0.8,
    stringGWidth: 0.8,
    stringDWidth: 0.8,
    stringAWidth: 0.8,
    stringELowWidth: 0.8,
    
    // TEXT
    chordNameSize: 22,
    chordNameTranslateX: -1,
    chordNameTranslateY: -9,
    arrowSize: 8,
    arrowLeftTranslateX: -3,
    arrowLeftTranslateY: 0,
    arrowRightTranslateX: -2,
    arrowRightTranslateY: 0,
    positionCounterSize: 8,
    positionCounterTranslateX: 2,
    positionCounterTranslateY: 0,
    timeSize: 16,
    timeTranslateX: 0,
    timeTranslateY: -8,
    
    // OTHER
    beatGridSize: 8,
    beatGridTranslateX: -1,
    beatGridTranslateY: -3,
    globeSize: 8,
    globeTranslateX: -3,
    globeTranslateY: 0,
    panelHeight: 296,
    
    // CARD
    cardWidth: 134,
    cardHeight: 228,
    cardGap: 10,
    activeBorderWidth: 5.2,
    inactiveBorderWidth: 1.5,
    
    // SCROLLBAR (new settings)
    scrollbarHeight: 8,
    scrollbarThumbSize: 3
};

// משתנה גלובלי להגדרות מתקדמות
let currentAdvancedSettings = { ...DEFAULT_ADVANCED_SETTINGS };

function migrateAdvancedSettings(settings, savedSettings = {}) {
    const previousGlobalTimeRowY = 7;
    const controlYKeys = [
        'arrowLeftTranslateY',
        'arrowRightTranslateY',
        'positionCounterTranslateY',
        'globeTranslateY'
    ];
    const hasPreviousGlobalTimeRowDefaults = controlYKeys.every((key) =>
        Number(savedSettings[key]) === previousGlobalTimeRowY
    );

    if (!hasPreviousGlobalTimeRowDefaults) {
        return settings;
    }

    return {
        ...settings,
        arrowLeftTranslateY: DEFAULT_ADVANCED_SETTINGS.arrowLeftTranslateY,
        arrowRightTranslateY: DEFAULT_ADVANCED_SETTINGS.arrowRightTranslateY,
        positionCounterTranslateY: DEFAULT_ADVANCED_SETTINGS.positionCounterTranslateY,
        globeTranslateY: DEFAULT_ADVANCED_SETTINGS.globeTranslateY
    };
}

// ------------------------------------------------------------
// 3. פונקציות עזר לטעינה ושמירה
// ------------------------------------------------------------

// טעינת גודל קרוסלה מ-localStorage
window.loadCarouselSize = function loadCarouselSize() {
    try {
        const saved = localStorage.getItem(CAROUSEL_SIZE_STORAGE_KEY);
        if (saved !== null) {
            const value = parseFloat(saved);
            if (!isNaN(value) && value >= CAROUSEL_SIZE_RANGE.min && value <= CAROUSEL_SIZE_RANGE.max) {
                currentCarouselSize = value;
                DBG('📥 טעינת גודל קרוסלה:', currentCarouselSize);
            }
        }
    } catch (error) {
        DBG('❌ שגיאה בטעינת גודל קרוסלה:', error);
    }
}

// שמירת גודל קרוסלה ב-localStorage
window.saveCarouselSize = function saveCarouselSize(value) {
    try {
        localStorage.setItem(CAROUSEL_SIZE_STORAGE_KEY, value.toString());
        DBG('💾 שמירת גודל קרוסלה:', value);
    } catch (error) {
        DBG('❌ שגיאה בשמירת גודל קרוסלה:', error);
    }
}

// טעינת הגדרות מתקדמות מ-localStorage
window.loadAdvancedSettings = function loadAdvancedSettings() {
    try {
        const saved = localStorage.getItem(ADVANCED_SETTINGS_STORAGE_KEY);
        if (saved !== null) {
            const parsed = JSON.parse(saved);
            currentAdvancedSettings = migrateAdvancedSettings(
                { ...DEFAULT_ADVANCED_SETTINGS, ...parsed },
                parsed
            );
            DBG('📥 טעינת הגדרות מתקדמות:', currentAdvancedSettings);
        }
    } catch (error) {
        DBG('❌ שגיאה בטעינת הגדרות מתקדמות:', error);
        currentAdvancedSettings = { ...DEFAULT_ADVANCED_SETTINGS };
    }
}

// שמירת הגדרות מתקדמות ב-localStorage
window.saveAdvancedSettings = function saveAdvancedSettings() {
    try {
        localStorage.setItem(ADVANCED_SETTINGS_STORAGE_KEY, JSON.stringify(currentAdvancedSettings));
        DBG('💾 שמירת הגדרות מתקדמות:', currentAdvancedSettings);
    } catch (error) {
        DBG('❌ שגיאה בשמירת הגדרות מתקדמות:', error);
    }
}

// עדכון הגדרה מתקדמת בודדת
window.updateAdvancedSetting = function updateAdvancedSetting(key, value) {
    try {
        currentAdvancedSettings[key] = value;
        window.saveAdvancedSettings();
        window.applyAdvancedSettings();
        DBG('🎨 עדכון הגדרה:', key, '=', value);
    } catch (error) {
        DBG('❌ שגיאה בעדכון הגדרה:', error);
    }
}

// ------------------------------------------------------------
// 4. עדכון גודל הקרוסלה והגדרות מתקדמות
// ------------------------------------------------------------

// עדכון גודל הקרוסלה
window.updateCarouselSize = function updateCarouselSize(newSize) {
    try {
        currentCarouselSize = newSize;
        
        // עדכון הקרוסלה אם היא קיימת
        if (window.ycChordCarousel && window.ycChordCarousel.isVisible) {
            window.ycChordCarousel.currentScale = newSize;
            window.ycChordCarousel._updateScale();
            DBG('🎨 עדכון גודל קרוסלה:', newSize);
        }
        
        // עדכון הכתוביות של הקרוסלה (אם קיימות)
        if (window.CarouselSubtitles?.activeInstance) {
            window.CarouselSubtitles.activeInstance.updateScale(newSize);
        }
        
        // שמירה ב-localStorage
        window.saveCarouselSize(newSize);
        
        // עדכון ההגדרות המתקדמות (כי הן תלויות ב-scale)
        window.applyAdvancedSettings();
    } catch (error) {
        DBG('❌ שגיאה בעדכון גודל קרוסלה:', error);
    }
}

// יישום הגדרות מתקדמות על ה-CSS
window.applyAdvancedSettings = function applyAdvancedSettings() {
    try {
        const scale = 1; // Base values only - global zoom handled by chordCarousel.js
        const settings = currentAdvancedSettings;
        const timeRowArrowLeftY = settings.arrowLeftTranslateY + POSITION_CONTROLS_TIME_ROW_OFFSET;
        const timeRowArrowRightY = settings.arrowRightTranslateY + POSITION_CONTROLS_TIME_ROW_OFFSET;
        const timeRowPositionCounterY = settings.positionCounterTranslateY + POSITION_CONTROLS_TIME_ROW_OFFSET;
        const timeRowGlobeY = settings.globeTranslateY + POSITION_CONTROLS_TIME_ROW_OFFSET;
        
        // מציאת או יצירת style element להגדרות מתקדמות
        let styleEl = document.getElementById('yc-advanced-carousel-styles');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'yc-advanced-carousel-styles';
            document.head.appendChild(styleEl);
        }
        
        // בניית ה-CSS עם הערכים המוכפלים ב-scale
        styleEl.textContent = `
            /* GRID */
            .yc-chord-diagram svg {
                transform: scale(${settings.diagramScale}) translate(${settings.diagramTranslateX}px, ${settings.diagramTranslateY}px) !important;
            }
            
            .yc-chord-diagram svg .finger-positions circle {
                r: ${settings.dotSize * scale} !important;
            }
            
            .yc-chord-tile svg .finger-number {
                font-size: ${settings.fingerNumberSize * scale}px !important;
                transform: translate(${settings.fingerNumberTranslateX}px, ${settings.fingerNumberTranslateY}px) !important;
            }
            
            .yc-chord-tile svg .fret-number {
                font-size: ${settings.fretNumberSize * scale}px !important;
                transform: translate(${settings.fretNumberTranslateX}px, ${settings.fretNumberTranslateY}px) !important;
            }
            
            /* TEXT */
            .yc-chord-name {
                font-size: ${settings.chordNameSize * scale}px !important;
                margin-top: ${settings.chordNameTranslateY * scale}px !important;
                margin-left: ${settings.chordNameTranslateX * scale}px !important;
            }
            
            /* Green dot moves with chord name */
            .yc-singing-start-dot {
                margin-top: ${settings.chordNameTranslateY * scale}px !important;
                margin-left: ${settings.chordNameTranslateX * scale}px !important;
            }
            
            .yc-chord-tile svg .chord-arrow-left {
                font-size: ${settings.arrowSize * scale}px !important;
                transform: translate(${settings.arrowLeftTranslateX * scale}px, ${settings.arrowLeftTranslateY * scale}px) !important;
            }
            
            .yc-chord-tile svg .chord-arrow-right {
                font-size: ${settings.arrowSize * scale}px !important;
                transform: translate(${settings.arrowRightTranslateX * scale}px, ${settings.arrowRightTranslateY * scale}px) !important;
            }
            
            .yc-chord-tile svg .chord-position-counter {
                font-size: ${settings.positionCounterSize * scale}px !important;
                transform: translate(${settings.positionCounterTranslateX * scale}px, ${settings.positionCounterTranslateY * scale}px) !important;
            }

            .yc-chord-tile.yc-position-controls-time-row svg .chord-arrow-left {
                transform: translate(${settings.arrowLeftTranslateX * scale}px, ${timeRowArrowLeftY * scale}px) !important;
            }

            .yc-chord-tile.yc-position-controls-time-row svg .chord-arrow-right {
                transform: translate(${settings.arrowRightTranslateX * scale}px, ${timeRowArrowRightY * scale}px) !important;
            }

            .yc-chord-tile.yc-position-controls-time-row svg .chord-position-counter {
                transform: translate(${settings.positionCounterTranslateX * scale}px, ${timeRowPositionCounterY * scale}px) !important;
            }
            
            .yc-chord-time {
                font-size: ${settings.timeSize * scale}px !important;
                margin-top: ${settings.timeTranslateY * scale}px !important;
                margin-left: ${settings.timeTranslateX * scale}px !important;
            }
            
            /* OTHER */
            .yc-beat-cell {
                width: ${settings.beatGridSize * scale}px !important;
                height: ${settings.beatGridSize * 2 * scale}px !important;
            }
            
            .yc-beat-grid {
                transform: translateX(-50%) translateX(${settings.beatGridTranslateX * scale}px) translateY(${settings.beatGridTranslateY * scale}px) !important;
            }
            
            .yc-chord-tile svg .global-position-globe {
                font-size: ${settings.globeSize * scale}px !important;
                transform: translate(${settings.globeTranslateX * scale}px, ${settings.globeTranslateY * scale}px) !important;
            }

            .yc-chord-tile.yc-position-controls-time-row svg .global-position-globe {
                transform: translate(${settings.globeTranslateX * scale}px, ${timeRowGlobeY * scale}px) !important;
            }
            
            /* CARD */
            .yc-chord-tile {
                width: ${settings.cardWidth * scale}px !important;
                min-height: ${settings.cardHeight * scale}px !important;
            }
            
            .yc-chord-carousel-inner {
                gap: ${settings.cardGap * scale}px !important;
            }
            
            .yc-chord-tile {
                border-width: ${settings.inactiveBorderWidth * scale}px !important;
            }
            
            .yc-chord-tile.active {
                border-width: ${settings.activeBorderWidth * scale}px !important;
            }
        `;
        
        console.log('[SizesMenu] 🎨 Applied border widths - Active:', settings.activeBorderWidth, 'Inactive:', settings.inactiveBorderWidth);
        
        // עדכון גובה הפאנל ו-tileWidth (base values - zoom handled by carousel)
        if (window.ycChordCarousel) {
            window.ycChordCarousel.baseHeight = settings.panelHeight;
            
            // עדכון tileWidth למניעת חפיפה (base values only)
            window.ycChordCarousel.tileWidth = settings.cardWidth + settings.cardGap;
            
            DBG('🎴 עדכון tileWidth:', window.ycChordCarousel.tileWidth);
            if (window.ycChordCarousel.isVisible) {
                window.ycChordCarousel._updateScale();
            }
        }
        
        // Apply grid line widths using JavaScript (CAROUSEL ONLY)
        const carouselDiagrams = document.querySelectorAll('.yc-chord-carousel .yc-chord-diagram svg');
        carouselDiagrams.forEach(svg => {
            // Horizontal Frets (6 frets)
            const fretsGroup = svg.querySelector('g.frets');
            if (fretsGroup) {
                const fretLines = fretsGroup.querySelectorAll('line');
                if (fretLines[0]) fretLines[0].setAttribute('stroke-width', settings.fret1Width);
                if (fretLines[1]) fretLines[1].setAttribute('stroke-width', settings.fret2Width);
                if (fretLines[2]) fretLines[2].setAttribute('stroke-width', settings.fret3Width);
                if (fretLines[3]) fretLines[3].setAttribute('stroke-width', settings.fret4Width);
                if (fretLines[4]) fretLines[4].setAttribute('stroke-width', settings.fret5Width);
                if (fretLines[5]) fretLines[5].setAttribute('stroke-width', settings.fret6Width);
            }
            
            // Vertical Strings (6 strings: E-Low, A, D, G, B, e-High)
            const stringsGroup = svg.querySelector('g.strings');
            if (stringsGroup) {
                const stringLines = stringsGroup.querySelectorAll('line');
                if (stringLines[0]) stringLines[0].setAttribute('stroke-width', settings.stringELowWidth);
                if (stringLines[1]) stringLines[1].setAttribute('stroke-width', settings.stringAWidth);
                if (stringLines[2]) stringLines[2].setAttribute('stroke-width', settings.stringDWidth);
                if (stringLines[3]) stringLines[3].setAttribute('stroke-width', settings.stringGWidth);
                if (stringLines[4]) stringLines[4].setAttribute('stroke-width', settings.stringBWidth);
                if (stringLines[5]) stringLines[5].setAttribute('stroke-width', settings.stringEHighWidth);
            }
        });
        
        DBG('✅ הגדרות מתקדמות יושמו');
    } catch (error) {
        DBG('❌ שגיאה ביישום הגדרות מתקדמות:', error);
    }
}

// ------------------------------------------------------------
// 5. פונקציות עזר לתפריט
// ------------------------------------------------------------

function getOrCreateMenu(id, buildFn, parentMenu) {
  let menu = window.YC_MENUS[id];

  // אם יש מופע "יתום" – ננקה אותו לגמרי
  if (menu && !menu.isConnected) {
    DBG('🧹 ניקוי מופע יתום של', id);
    if (menu.observer) {
      menu.observer.disconnect();
    }
    delete window.YC_MENUS[id];
    menu = null;
  }

  // אם אין מופע או שהוא לא מחובר – ניצור חדש
  if (!menu) {
    DBG('🏗️ יוצר מופע חדש של', id);
    menu = buildFn(parentMenu);
    window.YC_MENUS[id] = menu;
  }

  return menu;
}

// יצירת בקרת גודל עם + ו- (Event Delegation - ללא listeners)
function createSizeControl(label, key, currentValue, step = 1) {
    const controlRow = document.createElement('div');
    controlRow.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px;
        background: rgba(255,255,255,0.05);
        border-radius: 4px;
        margin-bottom: 8px;
    `;

    const labelElement = document.createElement('span');
    labelElement.textContent = label;
    labelElement.style.cssText = `
        font-size: 12px;
        color: #fff;
        flex: 1;
    `;

    const controlsContainer = document.createElement('div');
    controlsContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
    `;

    const minusButton = document.createElement('button');
    minusButton.textContent = '−';
    minusButton.className = 'yc-control-btn';
    minusButton.setAttribute('data-action', 'decrease');
    minusButton.setAttribute('data-key', key);
    minusButton.setAttribute('data-step', step);
    minusButton.style.cssText = `
        width: 24px;
        height: 24px;
        border: 1px solid rgba(255,255,255,0.2);
        background: rgba(255,255,255,0.1);
        color: #fff;
        border-radius: 3px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        transition: all 0.15s ease;
    `;

    const decimals = step < 1 ? 1 : 0;
    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = currentValue.toFixed(decimals);
    valueDisplay.id = `val-${key}`;
    valueDisplay.setAttribute('data-decimals', decimals);
    valueDisplay.style.cssText = `
        min-width: 40px;
        text-align: center;
        font-size: 11px;
        color: #fff;
        background: rgba(255,255,255,0.1);
        padding: 3px 6px;
        border-radius: 3px;
        border: 1px solid rgba(255,255,255,0.2);
    `;

    const plusButton = document.createElement('button');
    plusButton.textContent = '+';
    plusButton.className = 'yc-control-btn';
    plusButton.setAttribute('data-action', 'increase');
    plusButton.setAttribute('data-key', key);
    plusButton.setAttribute('data-step', step);
    plusButton.style.cssText = minusButton.style.cssText;

    controlsContainer.appendChild(minusButton);
    controlsContainer.appendChild(valueDisplay);
    controlsContainer.appendChild(plusButton);

    controlRow.appendChild(labelElement);
    controlRow.appendChild(controlsContainer);

    return controlRow;
}

// יצירת בקרת מיקום עם חצים (Event Delegation - ללא listeners)
function createPositionControl(label, keyX, keyY, currentX, currentY) {
    const controlRow = document.createElement('div');
    controlRow.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px;
        background: rgba(255,255,255,0.05);
        border-radius: 4px;
        margin-bottom: 8px;
    `;

    const labelElement = document.createElement('span');
    labelElement.textContent = label;
    labelElement.style.cssText = `
        font-size: 12px;
        color: #fff;
        flex: 1;
    `;

    const arrowsContainer = document.createElement('div');
    arrowsContainer.style.cssText = `
        display: flex;
        gap: 3px;
    `;

    const buttonStyle = `
        width: 24px;
        height: 24px;
        border: 1px solid rgba(255,255,255,0.2);
        background: rgba(255,255,255,0.1);
        color: #fff;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.15s ease;
    `;

    const leftBtn = document.createElement('button');
    leftBtn.textContent = '◀';
    leftBtn.className = 'yc-control-btn';
    leftBtn.setAttribute('data-action', 'decrease');
    leftBtn.setAttribute('data-key', keyX);
    leftBtn.setAttribute('data-step', '1');
    leftBtn.style.cssText = buttonStyle;

    const rightBtn = document.createElement('button');
    rightBtn.textContent = '▶';
    rightBtn.className = 'yc-control-btn';
    rightBtn.setAttribute('data-action', 'increase');
    rightBtn.setAttribute('data-key', keyX);
    rightBtn.setAttribute('data-step', '1');
    rightBtn.style.cssText = buttonStyle;

    const upBtn = document.createElement('button');
    upBtn.textContent = '▲';
    upBtn.className = 'yc-control-btn';
    upBtn.setAttribute('data-action', 'decrease');
    upBtn.setAttribute('data-key', keyY);
    upBtn.setAttribute('data-step', '1');
    upBtn.style.cssText = buttonStyle;

    const downBtn = document.createElement('button');
    downBtn.textContent = '▼';
    downBtn.className = 'yc-control-btn';
    downBtn.setAttribute('data-action', 'increase');
    downBtn.setAttribute('data-key', keyY);
    downBtn.setAttribute('data-step', '1');
    downBtn.style.cssText = buttonStyle;

    // Hidden value displays for tracking (not visible, but used by central listener)
    const valueDisplayX = document.createElement('span');
    valueDisplayX.id = `val-${keyX}`;
    valueDisplayX.setAttribute('data-decimals', '0');
    valueDisplayX.style.display = 'none';
    valueDisplayX.textContent = currentX.toFixed(0);
    
    const valueDisplayY = document.createElement('span');
    valueDisplayY.id = `val-${keyY}`;
    valueDisplayY.setAttribute('data-decimals', '0');
    valueDisplayY.style.display = 'none';
    valueDisplayY.textContent = currentY.toFixed(0);

    arrowsContainer.appendChild(leftBtn);
    arrowsContainer.appendChild(rightBtn);
    arrowsContainer.appendChild(upBtn);
    arrowsContainer.appendChild(downBtn);
    arrowsContainer.appendChild(valueDisplayX);
    arrowsContainer.appendChild(valueDisplayY);

    controlRow.appendChild(labelElement);
    controlRow.appendChild(arrowsContainer);

    return controlRow;
}

// יצירת בקרת גודל קרוסלה
function createCarouselSizeControl(container) {
    const controlRow = document.createElement('div');
    controlRow.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        cursor: pointer;
    `;
    
    // Hover effect
    controlRow.addEventListener('mouseover', () => {
        controlRow.style.backgroundColor = 'rgba(255,255,255,0.1)';
    });
    controlRow.addEventListener('mouseout', () => {
        controlRow.style.backgroundColor = 'transparent';
    });

    // תווית
    const labelElement = document.createElement('span');
    labelElement.textContent = 'Carousel Size';
    labelElement.style.cssText = `
        font-size: 13px;
        color: #fff;
        font-weight: 500;
        flex: 1;
    `;

    // קונטיינר הבקרות
    const controlsContainer = document.createElement('div');
    controlsContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    // כפתור מינוס
    const minusButton = document.createElement('button');
    minusButton.textContent = '−';
    minusButton.className = 'yc-carousel-size-btn';
    minusButton.style.cssText = `
        width: 28px;
        height: 28px;
        border: 1px solid rgba(255,255,255,0.2);
        background: rgba(255,255,255,0.1);
        color: #fff;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
    `;

    // תצוגת הערך
    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = currentCarouselSize.toFixed(2);
    valueDisplay.id = 'carousel-size-display';
    valueDisplay.style.cssText = `
        min-width: 45px;
        text-align: center;
        font-size: 13px;
        font-weight: 500;
        color: #fff;
        background: rgba(255,255,255,0.1);
        padding: 4px 8px;
        border-radius: 4px;
        border: 1px solid rgba(255,255,255,0.2);
    `;

    // כפתור פלוס
    const plusButton = document.createElement('button');
    plusButton.textContent = '+';
    plusButton.className = 'yc-carousel-size-btn';
    plusButton.style.cssText = `
        width: 28px;
        height: 28px;
        border: 1px solid rgba(255,255,255,0.2);
        background: rgba(255,255,255,0.1);
        color: #fff;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
    `;

    // Event listeners עם מניעת דליפות זיכרון
    const abortController = new AbortController();
    
    minusButton.addEventListener('click', () => {
        const newValue = Math.max(CAROUSEL_SIZE_RANGE.min, currentCarouselSize - CAROUSEL_SIZE_RANGE.step);
        const roundedValue = Math.round(newValue * 20) / 20; // עיגול לקפיצות של 0.05
        if (roundedValue !== currentCarouselSize) {
            currentCarouselSize = roundedValue;
            valueDisplay.textContent = roundedValue.toFixed(2);
            window.updateCarouselSize(roundedValue);
        }
    }, { signal: abortController.signal });

    plusButton.addEventListener('click', () => {
        const newValue = Math.min(CAROUSEL_SIZE_RANGE.max, currentCarouselSize + CAROUSEL_SIZE_RANGE.step);
        const roundedValue = Math.round(newValue * 20) / 20; // עיגול לקפיצות של 0.05
        if (roundedValue !== currentCarouselSize) {
            currentCarouselSize = roundedValue;
            valueDisplay.textContent = roundedValue.toFixed(2);
            window.updateCarouselSize(roundedValue);
        }
    }, { signal: abortController.signal });

    // שמירת AbortController לניקוי מאוחר יותר
    controlRow.abortController = abortController;

    controlsContainer.appendChild(minusButton);
    controlsContainer.appendChild(valueDisplay);
    controlsContainer.appendChild(plusButton);

    controlRow.appendChild(labelElement);
    controlRow.appendChild(controlsContainer);

    container.appendChild(controlRow);
    return controlRow;
}

// ------------------------------------------------------------
// 6. יצירת התפריט הראשי
// ------------------------------------------------------------

// Create sizes submenu element
window.createSizesSubmenu = function(parentMenu) {
    return getOrCreateMenu('sizes', (parent) => {
        // טעינת גודל קרוסלה מ-localStorage
        window.loadCarouselSize();
        
        const submenu = document.createElement('div');
        submenu.className = 'settings-menu sizes-submenu yc';
        submenu.setAttribute('data-yc-menu', 'sizes');
        submenu.style.cssText = `
            position: absolute;
            background: rgba(28, 28, 28, 0.9);
            right: 12px;
            border-radius: 8px;
            padding: 0;
            z-index: 2001;
            width: 250px;
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
            padding: 10px 16px;
            font-size: 13px;
            display: flex;
            align-items: center;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        `;

        const backButton = document.createElement('span');
        backButton.innerHTML = '◄';
        backButton.style.cssText = `
            cursor: pointer;
            margin-right: 10px;
            color: #aaa;
        `;

        backButton.addEventListener('click', (event) => {
            event.stopPropagation();
            submenu.style.display = 'none';
            parent.style.display = 'block';
        });

        const headerText = document.createElement('span');
        headerText.textContent = 'Layout';
        headerText.style.fontWeight = '500';

        header.appendChild(backButton);
        header.appendChild(headerText);
        submenu.appendChild(header);

        // --- Reset Option ---
        const resetOption = document.createElement('div');
        resetOption.className = 'settings-item reset-sizes';
        resetOption.style.cssText = `
            padding: 12px 16px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            user-select: none;
            -webkit-user-select: none;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        `;

        const resetText = document.createElement('span');
        resetText.textContent = 'Reset Sizes';
        resetText.style.color = '#ff3860';
        resetOption.appendChild(resetText);

        // Hover effect
        resetOption.addEventListener('mouseover', () => {
            resetOption.style.backgroundColor = 'rgba(255,255,255,0.1)';
        });
        resetOption.addEventListener('mouseout', () => {
            resetOption.style.backgroundColor = 'transparent';
        });

        // Reset function
        const performSizesReset = async () => {
            try {
                // Reset carousel size
                currentCarouselSize = DEFAULT_CAROUSEL_SIZE;
                localStorage.setItem(CAROUSEL_SIZE_STORAGE_KEY, DEFAULT_CAROUSEL_SIZE.toString());
                
                // Reset advanced settings
                currentAdvancedSettings = { ...DEFAULT_ADVANCED_SETTINGS };
                localStorage.setItem(ADVANCED_SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_ADVANCED_SETTINGS));
                
                // Apply changes
                window.updateCarouselSize(DEFAULT_CAROUSEL_SIZE);
                window.applyAdvancedSettings();
                
                console.log('[SizesMenu] ✅ Reset to default completed');
                return true;
            } catch (error) {
                console.error('[SizesMenu] ❌ Reset failed:', error);
                return false;
            }
        };

        // Click handler with confirmation dialog
        const resetClickHandler = () => {
            const existingOverlay = document.querySelector('.yc-confirm-overlay');
            if (existingOverlay) existingOverlay.remove();

            const overlay = document.createElement('div');
            overlay.className = 'yc-confirm-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.7);
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: #1c1c1c;
                border-radius: 8px;
                padding: 24px;
                max-width: 350px;
                text-align: center;
                color: #fff;
                font-family: Roboto, Arial, sans-serif;
            `;

            dialog.innerHTML = `
                <h3 style="margin: 0 0 16px; font-size: 16px;">Reset Sizes?</h3>
                <p style="margin: 0 0 20px; font-size: 13px; color: #aaa;">
                    This will reset carousel size and all advanced settings to defaults.
                </p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="yc-cancel-reset-sizes" style="
                        padding: 8px 20px;
                        background: #444;
                        color: #fff;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                    ">Cancel</button>
                    <button id="yc-confirm-reset-sizes" style="
                        padding: 8px 20px;
                        background: #ff3860;
                        color: #fff;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                    ">Reset</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const cancelBtn = dialog.querySelector('#yc-cancel-reset-sizes');
            const confirmBtn = dialog.querySelector('#yc-confirm-reset-sizes');

            const cleanup = () => {
                cancelBtn.removeEventListener('click', handleCancel);
                confirmBtn.removeEventListener('click', handleConfirm);
                overlay.removeEventListener('click', handleOverlayClick);
                overlay.remove();
            };

            const handleCancel = () => cleanup();
            const handleOverlayClick = (e) => {
                if (e.target === overlay) cleanup();
            };
            const handleConfirm = async () => {
                confirmBtn.textContent = 'Resetting...';
                confirmBtn.disabled = true;

                const success = await performSizesReset();

                if (success) {
                    dialog.innerHTML = `
                        <p style="margin: 0; font-size: 14px; color: #4CAF50;">✓ Sizes reset successfully</p>
                    `;
                    setTimeout(() => {
                        cleanup();
                        // Dispose menu so it rebuilds fresh on next open
                        if (submenu.cleanups) {
                            submenu.cleanups.forEach(fn => fn());
                        }
                        if (submenu.parentNode) {
                            submenu.parentNode.removeChild(submenu);
                        }
                        delete window.YC_MENUS['sizes'];
                    }, 1500);
                } else {
                    dialog.innerHTML = `
                        <p style="margin: 0; font-size: 14px; color: #ff3860;">✗ Failed to reset sizes</p>
                    `;
                    setTimeout(cleanup, 2000);
                }
            };

            cancelBtn.addEventListener('click', handleCancel);
            overlay.addEventListener('click', handleOverlayClick);
            confirmBtn.addEventListener('click', handleConfirm);
        };

        resetOption.addEventListener('click', resetClickHandler);
        
        // Store cleanup
        submenu.cleanups = submenu.cleanups || [];
        submenu.cleanups.push(() => {
            resetOption.removeEventListener('click', resetClickHandler);
        });

        submenu.appendChild(resetOption);

        // Options container
        const optionsContainer = document.createElement('div');
        optionsContainer.style.cssText = `
            padding: 0;
        `;

        submenu.appendChild(optionsContainer);

        // ─────────────────────────────────────────────────────────
        // ADVANCED SECTION
        // ─────────────────────────────────────────────────────────
        
        const advancedSection = document.createElement('div');
        advancedSection.style.cssText = `
            border-top: 1px solid rgba(255,255,255,0.1);
            margin-top: 0;
        `;

        // כותרת ADVANCED עם חץ
        const advancedHeader = document.createElement('div');
        advancedHeader.className = 'yc-advanced-header';
        advancedHeader.style.cssText = `
            padding: 12px 16px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            user-select: none;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: background 0.15s ease;
        `;
        advancedHeader.innerHTML = '<span style="font-size: 10px; color: #4A90E2; transition: transform 0.3s;">▶</span> <span style="color: #4A90E2; letter-spacing: 1px;">ADVANCED</span>';

        // קונטיינר התוכן המתקדם
        const advancedContent = document.createElement('div');
        advancedContent.style.cssText = `
            display: none;
            padding: 0 16px 12px 16px;
            max-height: 400px;
            overflow-y: auto;
        `;

        // Toggle פתיחה/סגירה
        advancedHeader.addEventListener('click', () => {
            const isOpen = advancedContent.style.display === 'block';
            const arrow = advancedHeader.querySelector('span:first-child');
            
            if (isOpen) {
                advancedContent.style.display = 'none';
                arrow.style.transform = 'rotate(0deg)';
            } else {
                advancedContent.style.display = 'block';
                arrow.style.transform = 'rotate(90deg)';
            }
        });

        // טעינת הגדרות מתקדמות
        window.loadAdvancedSettings();

        // ─── GRID Category ───
        const gridCategory = document.createElement('div');
        gridCategory.style.cssText = `
            border-bottom: 1px solid rgba(255,255,255,0.05);
        `;
        
        const gridHeader = document.createElement('div');
        gridHeader.className = 'category-header';
        gridHeader.style.cssText = `
            padding: 10px 16px;
            display: flex;
            align-items: center;
            cursor: pointer;
            background: rgba(255,255,255,0.02);
            transition: background 0.2s;
            user-select: none;
        `;
        gridHeader.innerHTML = `
            <span style="margin-right: 8px; font-size: 10px; transition: transform 0.3s; display: inline-block; color: #aaa;">▶</span>
            <span style="font-size: 12px; font-weight: 500; color: #fff;">GRID</span>
        `;
        
        const gridContent = document.createElement('div');
        gridContent.className = 'category-content';
        gridContent.style.cssText = `
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
            padding: 0 8px;
        `;
        
        const gridInner = document.createElement('div');
        gridInner.style.padding = '8px 0';
        
        gridInner.appendChild(createSizeControl('Diagram Scale', 'diagramScale', currentAdvancedSettings.diagramScale, 0.1));
        
        gridInner.appendChild(createPositionControl('Diagram Position', 
            'diagramTranslateX', 
            'diagramTranslateY',
            currentAdvancedSettings.diagramTranslateX, 
            currentAdvancedSettings.diagramTranslateY
        ));
        
        gridInner.appendChild(createSizeControl('Dot Size (Fingers)', 'dotSize', currentAdvancedSettings.dotSize, 0.1));
        
        gridInner.appendChild(createSizeControl('Finger Numbers Size', 'fingerNumberSize', currentAdvancedSettings.fingerNumberSize, 1));
        
        gridInner.appendChild(createPositionControl('Finger Numbers Position', 
            'fingerNumberTranslateX', 
            'fingerNumberTranslateY',
            currentAdvancedSettings.fingerNumberTranslateX, 
            currentAdvancedSettings.fingerNumberTranslateY
        ));
        
        gridInner.appendChild(createSizeControl('Fret Number Size', 'fretNumberSize', currentAdvancedSettings.fretNumberSize, 1));
        
        gridInner.appendChild(createPositionControl('Fret Number Position', 
            'fretNumberTranslateX', 
            'fretNumberTranslateY',
            currentAdvancedSettings.fretNumberTranslateX, 
            currentAdvancedSettings.fretNumberTranslateY
        ));
        
        // Grid Lines Width - All Together
        gridInner.appendChild(createSizeControl('Horizontal Frets Width (All)', 'horizontalFretsWidthAll', currentAdvancedSettings.horizontalFretsWidthAll, 0.1));
        gridInner.appendChild(createSizeControl('Vertical Strings Width (All)', 'verticalStringsWidthAll', currentAdvancedSettings.verticalStringsWidthAll, 0.1));
        
        // Individual Horizontal Frets (6 frets)
        gridInner.appendChild(createSizeControl('Fret 1 Width', 'fret1Width', currentAdvancedSettings.fret1Width, 0.1));
        gridInner.appendChild(createSizeControl('Fret 2 Width', 'fret2Width', currentAdvancedSettings.fret2Width, 0.1));
        gridInner.appendChild(createSizeControl('Fret 3 Width', 'fret3Width', currentAdvancedSettings.fret3Width, 0.1));
        gridInner.appendChild(createSizeControl('Fret 4 Width', 'fret4Width', currentAdvancedSettings.fret4Width, 0.1));
        gridInner.appendChild(createSizeControl('Fret 5 Width', 'fret5Width', currentAdvancedSettings.fret5Width, 0.1));
        gridInner.appendChild(createSizeControl('Fret 6 Width', 'fret6Width', currentAdvancedSettings.fret6Width, 0.1));
        
        // Individual Vertical Strings
        gridInner.appendChild(createSizeControl('String e (High) Width', 'stringEHighWidth', currentAdvancedSettings.stringEHighWidth, 0.1));
        gridInner.appendChild(createSizeControl('String B Width', 'stringBWidth', currentAdvancedSettings.stringBWidth, 0.1));
        gridInner.appendChild(createSizeControl('String G Width', 'stringGWidth', currentAdvancedSettings.stringGWidth, 0.1));
        gridInner.appendChild(createSizeControl('String D Width', 'stringDWidth', currentAdvancedSettings.stringDWidth, 0.1));
        gridInner.appendChild(createSizeControl('String A Width', 'stringAWidth', currentAdvancedSettings.stringAWidth, 0.1));
        gridInner.appendChild(createSizeControl('String E (Low) Width', 'stringELowWidth', currentAdvancedSettings.stringELowWidth, 0.1));

        gridContent.appendChild(gridInner);
        
        // Grid toggle handler
        gridHeader.addEventListener('click', () => {
            const isExpanded = gridContent.style.maxHeight !== '0px' && gridContent.style.maxHeight !== '';
            const arrow = gridHeader.querySelector('span:first-child');
            
            if (isExpanded) {
                gridContent.style.maxHeight = '0';
                arrow.style.transform = 'rotate(0deg)';
            } else {
                gridContent.style.maxHeight = '2000px';
                arrow.style.transform = 'rotate(90deg)';
            }
        });
        
        gridHeader.addEventListener('mouseenter', () => {
            gridHeader.style.background = 'rgba(255,255,255,0.08)';
        });
        gridHeader.addEventListener('mouseleave', () => {
            gridHeader.style.background = 'rgba(255,255,255,0.02)';
        });
        
        gridCategory.appendChild(gridHeader);
        gridCategory.appendChild(gridContent);
        advancedContent.appendChild(gridCategory);

        // ─── TEXT Category ───
        const textCategory = document.createElement('div');
        textCategory.style.cssText = `
            border-bottom: 1px solid rgba(255,255,255,0.05);
        `;
        
        const textHeader = document.createElement('div');
        textHeader.className = 'category-header';
        textHeader.style.cssText = `
            padding: 10px 16px;
            display: flex;
            align-items: center;
            cursor: pointer;
            background: rgba(255,255,255,0.02);
            transition: background 0.2s;
            user-select: none;
        `;
        textHeader.innerHTML = `
            <span style="margin-right: 8px; font-size: 10px; transition: transform 0.3s; display: inline-block; color: #aaa;">▶</span>
            <span style="font-size: 12px; font-weight: 500; color: #fff;">TEXT</span>
        `;
        
        const textContent = document.createElement('div');
        textContent.className = 'category-content';
        textContent.style.cssText = `
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
            padding: 0 8px;
        `;
        
        const textInner = document.createElement('div');
        textInner.style.padding = '8px 0';
        
        textInner.appendChild(createSizeControl('Chord Name Size', 'chordNameSize', currentAdvancedSettings.chordNameSize, 1));
        
        textInner.appendChild(createPositionControl('Chord Name Position', 
            'chordNameTranslateX', 
            'chordNameTranslateY',
            currentAdvancedSettings.chordNameTranslateX, 
            currentAdvancedSettings.chordNameTranslateY
        ));
        
        textInner.appendChild(createSizeControl('Arrows Size', 'arrowSize', currentAdvancedSettings.arrowSize, 1));
        
        textInner.appendChild(createPositionControl('Arrow Left Position', 
            'arrowLeftTranslateX', 
            'arrowLeftTranslateY',
            currentAdvancedSettings.arrowLeftTranslateX, 
            currentAdvancedSettings.arrowLeftTranslateY
        ));
        
        textInner.appendChild(createPositionControl('Arrow Right Position', 
            'arrowRightTranslateX', 
            'arrowRightTranslateY',
            currentAdvancedSettings.arrowRightTranslateX, 
            currentAdvancedSettings.arrowRightTranslateY
        ));
        
        textInner.appendChild(createSizeControl('Position Counter Size', 'positionCounterSize', currentAdvancedSettings.positionCounterSize, 1));
        
        textInner.appendChild(createPositionControl('Position Counter Position', 
            'positionCounterTranslateX', 
            'positionCounterTranslateY',
            currentAdvancedSettings.positionCounterTranslateX, 
            currentAdvancedSettings.positionCounterTranslateY
        ));
        
        textInner.appendChild(createSizeControl('Time Size', 'timeSize', currentAdvancedSettings.timeSize, 1));
        
        textInner.appendChild(createPositionControl('Time Position', 
            'timeTranslateX', 
            'timeTranslateY',
            currentAdvancedSettings.timeTranslateX, 
            currentAdvancedSettings.timeTranslateY
        ));

        textContent.appendChild(textInner);
        
        // Text toggle handler
        textHeader.addEventListener('click', () => {
            const isExpanded = textContent.style.maxHeight !== '0px' && textContent.style.maxHeight !== '';
            const arrow = textHeader.querySelector('span:first-child');
            
            if (isExpanded) {
                textContent.style.maxHeight = '0';
                arrow.style.transform = 'rotate(0deg)';
            } else {
                textContent.style.maxHeight = '2000px';
                arrow.style.transform = 'rotate(90deg)';
            }
        });
        
        textHeader.addEventListener('mouseenter', () => {
            textHeader.style.background = 'rgba(255,255,255,0.08)';
        });
        textHeader.addEventListener('mouseleave', () => {
            textHeader.style.background = 'rgba(255,255,255,0.02)';
        });
        
        textCategory.appendChild(textHeader);
        textCategory.appendChild(textContent);
        advancedContent.appendChild(textCategory);

        // ─── OTHER Category ───
        const otherCategory = document.createElement('div');
        otherCategory.style.cssText = `
            border-bottom: 1px solid rgba(255,255,255,0.05);
        `;
        
        const otherHeader = document.createElement('div');
        otherHeader.className = 'category-header';
        otherHeader.style.cssText = `
            padding: 10px 16px;
            display: flex;
            align-items: center;
            cursor: pointer;
            background: rgba(255,255,255,0.02);
            transition: background 0.2s;
            user-select: none;
        `;
        otherHeader.innerHTML = `
            <span style="margin-right: 8px; font-size: 10px; transition: transform 0.3s; display: inline-block; color: #aaa;">▶</span>
            <span style="font-size: 12px; font-weight: 500; color: #fff;">OTHER</span>
        `;
        
        const otherContent = document.createElement('div');
        otherContent.className = 'category-content';
        otherContent.style.cssText = `
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
            padding: 0 8px;
        `;
        
        const otherInner = document.createElement('div');
        otherInner.style.padding = '8px 0';
        
        otherInner.appendChild(createSizeControl('Beat Grid Size', 'beatGridSize', currentAdvancedSettings.beatGridSize, 1));
        
        otherInner.appendChild(createPositionControl('Beat Grid Position', 
            'beatGridTranslateX', 
            'beatGridTranslateY',
            currentAdvancedSettings.beatGridTranslateX, 
            currentAdvancedSettings.beatGridTranslateY
        ));
        
        otherInner.appendChild(createSizeControl('Globe Icon Size', 'globeSize', currentAdvancedSettings.globeSize, 1));
        
        otherInner.appendChild(createPositionControl('Globe Icon Position', 
            'globeTranslateX', 
            'globeTranslateY',
            currentAdvancedSettings.globeTranslateX, 
            currentAdvancedSettings.globeTranslateY
        ));
        
        otherInner.appendChild(createSizeControl('Panel Height', 'panelHeight', currentAdvancedSettings.panelHeight, 1));

        otherContent.appendChild(otherInner);
        
        // Other toggle handler
        otherHeader.addEventListener('click', () => {
            const isExpanded = otherContent.style.maxHeight !== '0px' && otherContent.style.maxHeight !== '';
            const arrow = otherHeader.querySelector('span:first-child');
            
            if (isExpanded) {
                otherContent.style.maxHeight = '0';
                arrow.style.transform = 'rotate(0deg)';
            } else {
                otherContent.style.maxHeight = '2000px';
                arrow.style.transform = 'rotate(90deg)';
            }
        });
        
        otherHeader.addEventListener('mouseenter', () => {
            otherHeader.style.background = 'rgba(255,255,255,0.08)';
        });
        otherHeader.addEventListener('mouseleave', () => {
            otherHeader.style.background = 'rgba(255,255,255,0.02)';
        });
        
        otherCategory.appendChild(otherHeader);
        otherCategory.appendChild(otherContent);
        advancedContent.appendChild(otherCategory);

        // ─── CARD Category ───
        const cardCategory = document.createElement('div');
        cardCategory.style.cssText = `
            border-bottom: 1px solid rgba(255,255,255,0.05);
        `;
        
        const cardHeader = document.createElement('div');
        cardHeader.className = 'category-header';
        cardHeader.style.cssText = `
            padding: 10px 16px;
            display: flex;
            align-items: center;
            cursor: pointer;
            background: rgba(255,255,255,0.02);
            transition: background 0.2s;
            user-select: none;
        `;
        cardHeader.innerHTML = `
            <span style="margin-right: 8px; font-size: 10px; transition: transform 0.3s; display: inline-block; color: #aaa;">▶</span>
            <span style="font-size: 12px; font-weight: 500; color: #fff;">CARD</span>
        `;
        
        const cardContent = document.createElement('div');
        cardContent.className = 'category-content';
        cardContent.style.cssText = `
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
            padding: 0 8px;
        `;
        
        const cardInner = document.createElement('div');
        cardInner.style.padding = '8px 0';
        
        cardInner.appendChild(createSizeControl('Card Width', 'cardWidth', currentAdvancedSettings.cardWidth, 1));
        
        cardInner.appendChild(createSizeControl('Card Height', 'cardHeight', currentAdvancedSettings.cardHeight, 1));
        
        cardInner.appendChild(createSizeControl('Card Gap (Spacing)', 'cardGap', currentAdvancedSettings.cardGap, 1));
        
        cardInner.appendChild(createSizeControl('Active Border Width', 'activeBorderWidth', currentAdvancedSettings.activeBorderWidth, 0.1));
        
        cardInner.appendChild(createSizeControl('Inactive Border Width', 'inactiveBorderWidth', currentAdvancedSettings.inactiveBorderWidth, 0.1));

        cardContent.appendChild(cardInner);
        
        // Card toggle handler
        cardHeader.addEventListener('click', () => {
            const isExpanded = cardContent.style.maxHeight !== '0px' && cardContent.style.maxHeight !== '';
            const arrow = cardHeader.querySelector('span:first-child');
            
            if (isExpanded) {
                cardContent.style.maxHeight = '0';
                arrow.style.transform = 'rotate(0deg)';
            } else {
                cardContent.style.maxHeight = '2000px';
                arrow.style.transform = 'rotate(90deg)';
            }
        });
        
        cardHeader.addEventListener('mouseenter', () => {
            cardHeader.style.background = 'rgba(255,255,255,0.08)';
        });
        cardHeader.addEventListener('mouseleave', () => {
            cardHeader.style.background = 'rgba(255,255,255,0.02)';
        });
        
        cardCategory.appendChild(cardHeader);
        cardCategory.appendChild(cardContent);
        advancedContent.appendChild(cardCategory);

        advancedSection.appendChild(advancedHeader);
        advancedSection.appendChild(advancedContent);
        submenu.appendChild(advancedSection);

        // יצירת AbortController למניעת דליפת listeners
        if (!submenu.abortController) {
            submenu.abortController = new AbortController();
        }

        // שמירת רפרנס לבקרה לניקוי מאוחר יותר

        // Observe visibility to adjust position
        const observer = new MutationObserver((mList, obs) => {
            if (submenu.style.display === 'block') {
                const controls = document.querySelector('.ytp-chrome-bottom');
                if (controls) {
                    const rect = controls.getBoundingClientRect();
                    submenu.style.bottom = `${rect.height + 12}px`;
                    submenu.style.right  = '12px';
                }
                
                // עדכון תצוגת הערך בפתיחת התפריט
                const display = document.getElementById('carousel-size-display');
                if (display && window.ycChordCarousel) {
                    currentCarouselSize = window.ycChordCarousel.currentScale || DEFAULT_CAROUSEL_SIZE;
                    display.textContent = currentCarouselSize.toFixed(2);
                }
                
                obs.disconnect();
            }
        });

        observer.observe(submenu, { attributes: true, attributeFilter: ['style'] });
        submenu.observer = observer;

        // ─────────────────────────────────────────────────────────
        // EVENT DELEGATION - מאזין מרכזי אחד לכל הכפתורים
        // ─────────────────────────────────────────────────────────
        
        // הוספת CSS hover effects (במקום JS listeners)
        const hoverStyles = document.createElement('style');
        hoverStyles.id = 'yc-control-hover-styles';
        hoverStyles.textContent = `
            .yc-control-btn:hover {
                background: rgba(255,255,255,0.2) !important;
                transform: scale(1.05);
            }
            .yc-carousel-size-btn:hover {
                background: rgba(255,255,255,0.2) !important;
                transform: scale(1.05);
            }
            .yc-advanced-header:hover {
                background: rgba(255,255,255,0.05) !important;
            }
        `;
        if (!document.getElementById('yc-control-hover-styles')) {
            document.head.appendChild(hoverStyles);
        }
        
        // מאזין מרכזי אחד שמטפל בכל הלחיצות
        submenu.addEventListener('click', (event) => {
            const target = event.target;
            
            // בדיקה אם לחצו על כפתור בקרה
            if (target.classList.contains('yc-control-btn')) {
                const action = target.getAttribute('data-action');
                const key = target.getAttribute('data-key');
                const step = parseFloat(target.getAttribute('data-step'));
                
                if (action && key && !isNaN(step)) {
                    // חישוב הערך החדש
                    const currentValue = currentAdvancedSettings[key];
                    const newValue = action === 'increase' 
                        ? currentValue + step 
                        : currentValue - step;
                    
                    // עדכון המשתנה הגלובלי
                    currentAdvancedSettings[key] = newValue;
                    
                    // שמירה ב-storage
                    window.saveAdvancedSettings();
                    
                    // יישום על ה-CSS
                    window.applyAdvancedSettings();
                    
                    // עדכון התצוגה
                    const valueDisplay = document.getElementById(`val-${key}`);
                    if (valueDisplay) {
                        const decimals = parseInt(valueDisplay.getAttribute('data-decimals')) || 0;
                        valueDisplay.textContent = newValue.toFixed(decimals);
                    }
                    
                    // Special handling for "All Together" controls
                    if (key === 'horizontalFretsWidthAll') {
                        // Update all individual fret widths
                        ['fret1Width', 'fret2Width', 'fret3Width', 'fret4Width', 'fret5Width', 'fret6Width'].forEach(fretKey => {
                            currentAdvancedSettings[fretKey] = newValue;
                            const fretDisplay = document.getElementById(`val-${fretKey}`);
                            if (fretDisplay) {
                                const decimals = parseInt(fretDisplay.getAttribute('data-decimals')) || 0;
                                fretDisplay.textContent = newValue.toFixed(decimals);
                            }
                        });
                    } else if (key === 'verticalStringsWidthAll') {
                        // Update all individual string widths
                        ['stringEHighWidth', 'stringBWidth', 'stringGWidth', 'stringDWidth', 'stringAWidth', 'stringELowWidth'].forEach(stringKey => {
                            currentAdvancedSettings[stringKey] = newValue;
                            const stringDisplay = document.getElementById(`val-${stringKey}`);
                            if (stringDisplay) {
                                const decimals = parseInt(stringDisplay.getAttribute('data-decimals')) || 0;
                                stringDisplay.textContent = newValue.toFixed(decimals);
                            }
                        });
                    }
                    
                    DBG('🎨 עדכון הגדרה:', key, '=', newValue);
                }
            }
            
            // מניעת propagation
            event.stopPropagation();
        }, { signal: submenu.abortController.signal });

        return submenu;
    }, parentMenu);
};

// ------------------------------------------------------------
// 7. dispose – ניקוי Observer ומניעת דליפות זיכרון
// ------------------------------------------------------------

// Helper to disconnect observer and optionally remove the submenu
window.disposeSizesSubmenu = function(submenu, remove = false) {
    if (!submenu) {
        submenu = document.querySelector('.sizes-submenu');
    }
    
    if (submenu) {
        // ניקוי בקרת הגודל
        if (submenu.controlElement) {
            if (submenu.controlElement.abortController) {
                submenu.controlElement.abortController.abort();
                delete submenu.controlElement.abortController;
            }
            delete submenu.controlElement;
        }
        
        // Disconnect observer
        if (submenu.observer) {
            submenu.observer.disconnect();
            delete submenu.observer;
        }
        
        // ניקוי AbortController למניעת דליפת listeners
        if (submenu.abortController) {
            submenu.abortController.abort();
            delete submenu.abortController;
        }
        
        // Remove from DOM if requested
        if (remove && submenu.parentNode) {
            submenu.parentNode.removeChild(submenu);
            delete window.YC_MENUS['sizes'];
        }
    }
};

// ------------------------------------------------------------
// 8. פונקציית איפוס לברירות מחדל
// ------------------------------------------------------------

// איפוס גודל קרוסלה לברירת מחדל (לשימוש ב-resetToDefault)
window.resetCarouselSizeToDefault = function() {
    try {
        console.log('[SizesMenu] 🔄 מאפס גודל קרוסלה לברירת מחדל...');
        
        // איפוס הערך הנוכחי לברירת מחדל
        currentCarouselSize = DEFAULT_CAROUSEL_SIZE;
        
        // מחיקת הערך מ-localStorage
        localStorage.removeItem(CAROUSEL_SIZE_STORAGE_KEY);
        
        // עדכון הקרוסלה
        window.updateCarouselSize(DEFAULT_CAROUSEL_SIZE);
        
        // עדכון התצוגה בתפריט אם הוא פתוח
        const display = document.getElementById('carousel-size-display');
        if (display) {
            display.textContent = DEFAULT_CAROUSEL_SIZE.toFixed(2);
        }
        
        console.log('[SizesMenu] ✅ איפוס גודל קרוסלה הושלם בהצלחה');
        console.log('[SizesMenu] 📊 גודל חדש:', DEFAULT_CAROUSEL_SIZE);
        
        return true;
    } catch (error) {
        console.error('[SizesMenu] ❌ שגיאה באיפוס גודל קרוסלה:', error);
        return false;
    }
};

// איפוס הגדרות מתקדמות לברירת מחדל
window.resetAdvancedSettingsToDefault = function() {
    try {
        console.log('[SizesMenu] 🔄 מאפס הגדרות מתקדמות לברירת מחדל...');
        
        // איפוס הערכים לברירת מחדל
        currentAdvancedSettings = { ...DEFAULT_ADVANCED_SETTINGS };
        
        // מחיקת הערכים מ-localStorage
        localStorage.removeItem(ADVANCED_SETTINGS_STORAGE_KEY);
        
        // יישום ההגדרות
        window.applyAdvancedSettings();
        
        console.log('[SizesMenu] ✅ איפוס הגדרות מתקדמות הושלם בהצלחה');
        
        return true;
    } catch (error) {
        console.error('[SizesMenu] ❌ שגיאה באיפוס הגדרות מתקדמות:', error);
        return false;
    }
};

// פונקציה כללית לאיפוס כל הגדלים (נקראת מ-resetToDefault)
window.resetSizesToDefault = function() {
    try {
        console.log('[SizesMenu] 🔄 מאפס את כל הגדלים לברירות מחדל...');
        
        // איפוס גודל קרוסלה
        const success1 = window.resetCarouselSizeToDefault();
        
        // איפוס הגדרות מתקדמות
        const success2 = window.resetAdvancedSettingsToDefault();
        
        // מחיקת התפריט מהזיכרון כדי שיבנה מחדש עם הערכים המעודכנים בפתיחה הבאה
        if (window.disposeSizesSubmenu) {
            window.disposeSizesSubmenu(null, true);
            console.log('[SizesMenu] 🗑️ תפריט נמחק - ייבנה מחדש בפתיחה הבאה');
        }
        
        if (success1 && success2) {
            console.log('[SizesMenu] ✅ כל הגדלים אופסו בהצלחה');
        }
        
        return success1 && success2;
    } catch (error) {
        console.error('[SizesMenu] ❌ שגיאה באיפוס גדלים:', error);
        return false;
    }
};

// ------------------------------------------------------------
// 9. אתחול ראשוני
// ------------------------------------------------------------

// טעינת גודל קרוסלה והגדרות מתקדמות בעת טעינת הדף
window.loadCarouselSize();
window.loadAdvancedSettings();

// יישום הגדרות מתקדמות מיד - ללא עיכובים!
window.loadCarouselSize();
window.loadAdvancedSettings();
window.applyAdvancedSettings();

// אם הקרוסלה כבר קיימת, נעדכן אותה
if (window.ycChordCarousel) {
    window.ycChordCarousel.currentScale = currentCarouselSize;
}
