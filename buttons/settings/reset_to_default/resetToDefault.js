// Default settings remain unchanged but reorganized for clarity
/* בדיקה ש-DEFAULT_BG_OPACITY מוגדר לפני השימוש בו */
if (typeof window.DEFAULT_BG_OPACITY === 'undefined') {
    console.warn('[YouChords] DEFAULT_BG_OPACITY not defined – using fallback 85');
    window.DEFAULT_BG_OPACITY = '85';
}

window.DEFAULT_SETTINGS = {
    // Subtitle mode settings
    subtitleLyricsMode: true,                            
    subtitleSubtitleMode: false,                         
    subtitleLastMode: 'lyrics',
    
    // Basic subtitle settings
    subtitleSize: '250',                                  
    subtitleColor: '#FFFFFF',                            
    subtitleFontOpacity: '100',                          
    
    // Word highlight settings
    subtitleHighlightColor: 'rgba(255, 255, 0, 0.5)',    
    subtitleHighlightBackgroundEnabled: false,
    subtitleWordHighlightTextColor: '#FFFFFF',           
    subtitleHighlightOpacity: '50',                      
    
    // Background settings
    subtitleBackgroundColor: 'rgba(0, 0, 0, 0.8)',       
    subtitleBackgroundOpacity: window.DEFAULT_BG_OPACITY || '85',
    
    // Font settings
    fontFamily: 'YouTube Noto, Roboto, Arial, sans-serif', 
    fontWeight: 'normal',                              
    fontStyle: 'normal',                               
    textShadow: 'none',                               
    textDecoration: 'none',
    letterSpacing: 'normal',
    lineHeight: '1.4',

    // Chords mode
    chordsMode: 'regular',
    chordsProcessingEnabled: true,      // ON by default
    
    // Animation settings
    transitionSpeed: '0.2s',
    animationEnabled: true,
    
    // Progress bars settings
    progressBarsEnabled: true,
    rectangleProgressBarsEnabled: true,
    progressBarLocation: 'top',            // RED   → TOP
    rectangleProgressBarLocation: 'top',   // RECT  → TOP
    
    // Subtitles In Chords settings
    subtitlesInChordsEnabled: true,       // ON by default
    sentenceHighlightEnabled: true,       // ON by default
    wordHighlightEnabled: true,           // ON by default
    passedWordsEnabled: true,             // ON by default
    
    // Subtitle Location settings (percentage-based system)
    subtitleLocation: 10,                 // 10% by default
    
    // Timeline Always Visible settings
    timelineAlwaysVisibleEnabled: true,   // ON by default
    
    // Carousel Position Number settings
    carouselPositionNumberEnabled: true,  // ON by default
    
    // Beat Grid settings
    beatGridEnabled: true,                // ON by default
    
    // Countdown Timer settings
    countdownTimerEnabled: true,          // ON by default
    
    // Singing Start Dot settings
    singingStartDotEnabled: true,         // ON by default
    
    // Additional Fret Numbers settings
    additionalFretNumbers: 'none',        // 'none' by default (options: 'none', 'one', 'all')
    
    // Singing Dot Size and Color settings
    singingDotSizeSubtitles: 7,           // 7px by default
    singingDotSizeChords: 7.75,           // 7.75px by default
    singingDotColor: '#4CAF50',           // Green by default
    
    // Primary Chords Position settings
    primaryChordPositionEnabled: true,    // ON by default
    globeIconEnabled: true,               // ON by default
    blackArrowsEnabled: true,             // ON by default
    
    // Active Chord Position settings
    activeChordPosition: 4,               // Default to position 4 (INDEX 3)
    
    // Chords Location settings
    chordsLocation: 'outside',
    previewActiveChordDirection: 'auto',
    panelsDirection: 'auto',
    
    // Lyrics & Chords Panel settings
    lyricsChordsPanelWidth: 350,         // Default panel width (15 in display = 350px)
    chordDiagramsActive: true,           // Chord Diagrams ON by default
    countdownActive: true,               // Countdown ON by default
    chordsPreviewActive: true,           // Chords Preview ON by default
    
    // Button visibility settings
    'button_chords_enabled': true,
    'button_subtitle_enabled': true,
    'button_customSubtitle_enabled': true,
    'button_settings_enabled': true,
    'button_tuner_enabled': true,
    'button_lyricsChords_enabled': true,
    'button_chordExplorer_enabled': true,
    
    // Chord Explorer settings
    explorerFretNumbers: 'none',          // 'none' by default (options: 'none', 'one', 'all')
    explorerSizePercent: 100,             // 100% by default
    
    // Hide Quick Chords settings
    hideQuickChordsEnabled: true,         // ON by default
    hideQuickChordsThreshold: 0.5         // 0.5 seconds by default
};

// Reset components with complete implementation
window.resetComponents = async function() {
    // Store current states
    const subtitleState = {
        isVisible: false,
        overlay: null
    };

    // Check if subtitles are currently visible
    const subtitleButton = document.querySelector('.ytp-subtitle-button');
    if (subtitleButton && subtitleButton.classList.contains('active')) {
        subtitleState.isVisible = true;
    }
    subtitleState.overlay = document.querySelector('.yt-subtitle-overlay');

    // Reset subtitle state
    window.subtitleModeState = {
        isLyricsMode: true, // Default to lyrics mode
        isSubtitleMode: false,
        lastMode: 'lyrics'
    };
    
    // ניקוי מערכי SPANs אם קיימים
    if (window.subtitleState) {
      if (window.subtitleState.line1WordSpans) {
        window.subtitleState.line1WordSpans = [];
      }
      if (window.subtitleState.line2WordSpans) {
        window.subtitleState.line2WordSpans = [];
      }
    }

    // Reset UI elements
    document.querySelectorAll('.custom-button-container').forEach(container => {
        if (!container.classList.contains('settings-button')) { // Preserve settings button
            container.classList.remove('active');
            const button = container.querySelector('button');
            if (button) button.classList.remove('active');
        }
    });

    // Reset subtitle element styles if they exist
    const subtitleContainer = document.querySelector('.yt-subtitle-container');
    if (subtitleContainer) {
        Object.assign(subtitleContainer.style, {
            fontSize: `${window.DEFAULT_SETTINGS.subtitleSize}%`,
            color: window.DEFAULT_SETTINGS.subtitleColor,
            opacity: window.DEFAULT_SETTINGS.subtitleFontOpacity / 100,
            backgroundColor: window.DEFAULT_SETTINGS.subtitleBackgroundColor,
            fontFamily: window.DEFAULT_SETTINGS.fontFamily,
            fontWeight: window.DEFAULT_SETTINGS.fontWeight,
            fontStyle: window.DEFAULT_SETTINGS.fontStyle,
            textShadow: window.DEFAULT_SETTINGS.textShadow,
            textDecoration: window.DEFAULT_SETTINGS.textDecoration,
            letterSpacing: window.DEFAULT_SETTINGS.letterSpacing,
            lineHeight: window.DEFAULT_SETTINGS.lineHeight
        });
    }

    // Update UI with default settings
    if (subtitleState.isVisible && window.updateSubtitles) {
        window.updateSubtitles();
    }

    console.log('Components reset successfully');
};

// Enhanced reset function with immediate effect and memory management
window.resetToDefault = async function() {
    try {
        console.log('[ResetToDefault] Starting reset process...');
        
        // 1. Store video state
        const video = document.querySelector('video');
        const currentTime = video ? video.currentTime : 0;
        const wasPlaying = video ? !video.paused : false;
        if (wasPlaying && video) video.pause();
        let pastWordsSettingsReset = false;

        // 2. Check if subtitle button was active before reset
        const subtitleButton = document.querySelector('.ytp-subtitle-button');
        const wasSubtitleActive = subtitleButton && (subtitleButton.classList.contains('subtitle-button-active') || 
                                                    subtitleButton.classList.contains('active'));
        console.log(`[ResetToDefault] Subtitle button was ${wasSubtitleActive ? 'active' : 'inactive'} before reset`);
        
        // 2.1 Check if chords button was active before reset
        const chordsButton = document.querySelector('.ytp-chords-button');
        const wasChordsActive = (chordsButton && chordsButton.classList.contains('chords-active')) || window.chordsActive;
        console.log(`[ResetToDefault] Chords button was ${wasChordsActive ? 'active' : 'inactive'} before reset`);
        
        // 2.2 Check if Lyrics & Chords panel was active before reset
        const lyricsChordsButton = document.querySelector('.ytp-lyrics-chords-button');
        const wasLyricsChordsActive = (lyricsChordsButton && lyricsChordsButton.classList.contains('lyrics-chords-active')) || window.lyricsChordsPanelActive;
        console.log(`[ResetToDefault] Lyrics & Chords panel was ${wasLyricsChordsActive ? 'active' : 'inactive'} before reset`);

        // 3. Clean up existing resources to prevent memory leaks
        console.log('[ResetToDefault] Cleaning up existing resources...');
        
        // 3.1 Clean up subtitle resources if active
        if (window.cleanupSubtitles && typeof window.cleanupSubtitles === 'function') {
            window.cleanupSubtitles();
        } else {
            // Manual cleanup if cleanupSubtitles is not available
            if (window.subtitleState) {
                window.subtitleState.isVisible = false;
                
                // ניקוי מערכי SPANs באופן מלא
                if (window.subtitleState.line1WordSpans) {
                    window.subtitleState.line1WordSpans.forEach(span => {
                        if (span) {
                            span.onclick = null;
                            span.onmouseenter = null;
                            span.onmouseleave = null;
                            if (span.parentNode) span.remove();
                        }
                    });
                    window.subtitleState.line1WordSpans = [];
                }
                
                if (window.subtitleState.line2WordSpans) {
                    window.subtitleState.line2WordSpans.forEach(span => {
                        if (span) {
                            span.onclick = null;
                            span.onmouseenter = null;
                            span.onmouseleave = null;
                            if (span.parentNode) span.remove();
                        }
                    });
                    window.subtitleState.line2WordSpans = [];
                }
                
                // Clean up observers
                if (Array.isArray(window.subtitleObservers)) {
                    window.subtitleObservers.forEach(observer => {
                        if (observer && typeof observer.disconnect === 'function') {
                            observer.disconnect();
                        }
                    });
                    window.subtitleObservers.length = 0;
                }
                
                // Clean up timers and animation frames
                if (window.rafSubs && window.rafSubs.length) {
                    window.rafSubs.forEach(id => window.cancelAnimationFrame(id));
                    window.rafSubs.length = 0;
                }
                
                if (window.timersSubs && window.timersSubs.length) {
                    window.timersSubs.forEach(id => {
                        window.clearInterval(id);
                        window.clearTimeout(id);
                        window.bin?.timers?.delete(id);
                    });
                    window.timersSubs.length = 0;
                }
                
                // ניקוי רפרנס לווידאו
                if (window.subtitleVideoElement) {
                    window.subtitleVideoElement = null;
                }
                
                // Hide overlay
                if (window.subtitleState.overlay) {
                    window.subtitleState.overlay.style.display = 'none';
                }
            }
        }
        
        // 3.2 Clean up chords resources if active
        if (window.chordsActive) {
            if (window.chordsDisplay?.partialCleanup) window.chordsDisplay.partialCleanup();
            if (window.stopChordLoops) window.stopChordLoops();
            
            if (window.overlayCtlChords) {
                window.overlayCtlChords.abort();
                window.overlayCtlChords = null;
            }
            
            window.chordsActive = false;
            // אנחנו לא מאפסים את wasChordsActive כי אנחנו רוצים לזכור את המצב הקודם
            
            // ניקוי נתוני אקורדים גלובליים
            if (window.COMPLETE_CHORDS) {
                window.COMPLETE_CHORDS = null;
                console.log('[ResetToDefault] Cleared COMPLETE_CHORDS from memory');
            }
        }

        // 4. Clear settings and set defaults in storage
        console.log('[ResetToDefault] Updating storage with default settings...');
        await chrome.storage.sync.clear();
        await chrome.storage.sync.set(window.DEFAULT_SETTINGS);
        
        // 4.1 איפוס גודל פונט של פאנל Lyrics & Chords
        localStorage.removeItem('ycLyricsFontSize');
        window.currentFontSize = 15;
        if (typeof applyFontSize === 'function') applyFontSize();
        
        // 4.2 איפוס רוחב פאנל Lyrics & Chords
        localStorage.removeItem('youchords_panel_width'); // תיקון שם המפתח
        window.currentLyricsChordsPanelWidth = window.DEFAULT_SETTINGS.lyricsChordsPanelWidth;
        
        // 4.3 ניקוי פוזיציות האקורדים מ-IndexedDB
        if (window.clearChordPositionsStorage && typeof window.clearChordPositionsStorage === 'function') {
            try {
                await window.clearChordPositionsStorage();
                console.log('[ResetToDefault] Cleared chord positions from IndexedDB');
            } catch (error) {
                console.warn('[ResetToDefault] Failed to clear chord positions from IndexedDB:', error);
            }
        }
        
        // עדכון התצוגה בפאנל אם הוא פתוח
        const panelWidthDisplay = document.getElementById('panel-width-display');
        if (panelWidthDisplay) {
            // המרה מpx לתצוגה: (px - 200) / 10
            const displayValue = (window.DEFAULT_SETTINGS.lyricsChordsPanelWidth - 200) / 10;
            panelWidthDisplay.textContent = displayValue;
        }
        
        // עדכון רוחב הפאנל בפועל אם הוא פתוח
        if (window.lyricsChordsPanelElement) {
            window.lyricsChordsPanelElement.style.width = window.DEFAULT_SETTINGS.lyricsChordsPanelWidth + 'px';
        }
        
        console.log('[ResetToDefault] Panel width reset to:', window.DEFAULT_SETTINGS.lyricsChordsPanelWidth);

        /*───────────────────────────────────────────────────────────
          4.2.5  איפוס כפתורי Chord Diagrams ו-Countdown
        ───────────────────────────────────────────────────────────*/
        // מחיקת הערכים הישנים אם קיימים
        localStorage.removeItem('youchords_dynamic_feature_active'); // ערך ישן - למחיקה
        localStorage.removeItem('youchords_chord_diagrams_active');
        localStorage.removeItem('youchords_countdown_active');
        localStorage.removeItem('youchords_countdown_duration');
        localStorage.removeItem('youchords_chords_preview_active');
        localStorage.removeItem('youchords_chords_toggle'); // legacy key (before MINI rename)
        localStorage.removeItem('youchords_mini_mode_active');
        localStorage.removeItem('youchords_chord_info_show_counts');
        localStorage.removeItem('youchords_chord_info_sort_by_count');
        localStorage.removeItem('youchords_time_split_expanded');
        
        // שמירה של ברירות מחדל: שניהם ON, chords preview = ON
        try {
            localStorage.setItem('youchords_chord_diagrams_active', 'true');
            localStorage.setItem('youchords_countdown_active', 'true');
            localStorage.setItem('youchords_chords_preview_active', 'true');
            localStorage.setItem('youchords_mini_mode_active', 'true'); // MINI default = ON
            localStorage.setItem('youchords_chord_info_show_counts', 'false'); // Chord Info count default = OFF
            localStorage.setItem('youchords_chord_info_sort_by_count', 'false'); // Chord Info sort-by-count default = OFF
            console.log('[ResetToDefault] ✅ Chord Diagrams, Countdown, Chords Preview & MINI reset to ON');
        } catch (error) {
            console.warn('[ResetToDefault] ❌ Failed to save dynamic feature states:', error);
        }
        
        /*───────────────────────────────────────────────────────────
          4.2.6  איפוס SENTENCE MODE לברירת מחדל (ON)
        ───────────────────────────────────────────────────────────*/
        localStorage.setItem('yc_sentence_mode', 'true');
        window.ycSentenceModeEnabled = true; // Default: ON
        
        // עדכון ה-UI אם הפאנל פתוח
        if (window.lyricsChordsPanelElement) {
            const sentenceModeToggle = window.lyricsChordsPanelElement.querySelector('#sentence-mode-toggle');
            if (sentenceModeToggle) {
                sentenceModeToggle.classList.add('active');
                console.log('[ResetToDefault] ✅ Sentence Mode toggle UI updated to ON');
            }
        }
        console.log('[ResetToDefault] ✅ Sentence Mode reset to ON (default)');
        
        /*───────────────────────────────────────────────────────────
          4.2.7  איפוס הגדרות Font ו-Bold Mode
        ───────────────────────────────────────────────────────────*/
        if (window.resetLyricsChordsFontSettings) {
            window.resetLyricsChordsFontSettings();
            console.log('[ResetToDefault] ✅ Font settings reset to default (Roboto, Bold: Off)');
        }
        
        /*───────────────────────────────────────────────────────────
          4.2.7.1  איפוס הגדרות Font של כתוביות הקרוסלה
        ───────────────────────────────────────────────────────────*/
        if (window.resetCarouselSubtitlesFontSettings) {
            window.resetCarouselSubtitlesFontSettings();
            console.log('[ResetToDefault] ✅ Carousel Subtitles Font settings reset to default (Roboto, Bold: Off)');
        }
        
        /*───────────────────────────────────────────────────────────
          4.2.8  איפוס הגדרות Past Words ו-Highlight Color
        ───────────────────────────────────────────────────────────*/
        if (window.resetLyricsChordsPastWordsSettings) {
            window.resetLyricsChordsPastWordsSettings();
            pastWordsSettingsReset = true;
            console.log('[ResetToDefault] ✅ Past Words and Highlight Color settings reset to default');
        }
        
        /*───────────────────────────────────────────────────────────
          4.2.9  איפוס AI Transcription Mode לברירת מחדל (OFF)
        ───────────────────────────────────────────────────────────*/
        try {
            await chrome.storage.local.set({
                aiTranscriptionMode: 'off',
                alwaysAllowYoutubeFallback: true,
                whisperSubtitleLanguage: 'auto'
            });
            console.log('[ResetToDefault] ✅ AI Transcription Mode reset to OFF and ALWAYS fallback reset to ON (default)');
            
            // עדכון ה-UI אם תפריט ה-AI Transcription פתוח
            if (window.updateAiTranscriptionMenuState && typeof window.updateAiTranscriptionMenuState === 'function') {
                window.updateAiTranscriptionMenuState();
                console.log('[ResetToDefault] ✅ AI Transcription menu UI updated');
            }
        } catch (error) {
            console.warn('[ResetToDefault] ❌ Failed to reset AI Transcription Mode:', error);
        }
        
        // עדכון משתנים גלובליים
        if (typeof window.chordDiagramsActive !== 'undefined') {
            window.chordDiagramsActive = true;
        }
        if (typeof window.countdownActive !== 'undefined') {
            window.countdownActive = true;
        }
        
        // עדכון ה-UI אם הפאנל פתוח
        if (window.lyricsChordsPanelElement) {
            const dynamicFeatureToggle = window.lyricsChordsPanelElement.querySelector('#dynamic-feature-toggle');
            if (dynamicFeatureToggle) {
                // הוספת class active (שניהם ON)
                if (!dynamicFeatureToggle.classList.contains('active')) {
                    dynamicFeatureToggle.classList.add('active');
                }
                console.log('[ResetToDefault] ✅ Dynamic feature toggle UI updated to ON');
            }
            
            // עדכון הטקסט והאייקון בהתאם למצב Chords
            if (typeof window.updateDynamicFeatureButton === 'function') {
                window.updateDynamicFeatureButton();
                console.log('[ResetToDefault] ✅ Dynamic feature button text/icon updated');
            }
        }

        /*───────────────────────────────────────────────────────────
          4.3  איפוס מהירות AUTO SCROLL וסנכרון SYNC WITH YOUTUBE
        ───────────────────────────────────────────────────────────*/
        // מחיקת הערכים הישנים
        localStorage.removeItem('youchords_auto_scroll_speed');
        localStorage.removeItem('youchords_sync_with_youtube');
        
        // שמירה ישירה של ערכי ברירת מחדל ב-localStorage
        try {
            localStorage.setItem('youchords_auto_scroll_speed', '0.4');
            localStorage.setItem('youchords_sync_with_youtube', 'true');
            console.log('[ResetToDefault] ✅ localStorage updated: speed=0.4, sync=true');
        } catch (error) {
            console.warn('[ResetToDefault] ❌ Failed to update localStorage:', error);
        }
        
        // עדכון משתנים גלובליים אם קיימים
        if (typeof window.autoScrollSpeed !== 'undefined') {
            window.autoScrollSpeed = 0.4;
            console.log('[ResetToDefault] ✅ Global autoScrollSpeed set to 0.4');
        } else {
            console.log('[ResetToDefault] ℹ️ autoScrollSpeed not defined (panel not loaded)');
        }
        
        if (typeof window.syncWithYouTubeActive !== 'undefined') {
            window.syncWithYouTubeActive = true;
            console.log('[ResetToDefault] ✅ Global syncWithYouTubeActive set to true');
        } else {
            console.log('[ResetToDefault] ℹ️ syncWithYouTubeActive not defined (panel not loaded)');
        }
        
        // רענון ה-UI אם הפונקציות קיימות
        if (typeof window.updateSpeedDisplay === 'function') {
            window.updateSpeedDisplay();
            console.log('[ResetToDefault] ✅ Speed display updated');
        }
        if (typeof window.updateSpeedControlsState === 'function') {
            window.updateSpeedControlsState();
            console.log('[ResetToDefault] ✅ Speed controls updated');
        }
        if (typeof window.updateToggleStates === 'function') {
            window.updateToggleStates();
            console.log('[ResetToDefault] ✅ Toggle states updated');
        }
        
        console.log('[ResetToDefault] 🎯 AUTO SCROLL & SYNC WITH YOUTUBE reset completed');

        /*───────────────────────────────────────────────────────────
          4.4  איפוס הגדרות TUNING MENU (Mode + Alert)
        ───────────────────────────────────────────────────────────*/
        // מחיקת הערכים הישנים
        localStorage.removeItem('youchords_tuning_mode');
        localStorage.removeItem('youchords_tuning_alert_enabled');
        
        // שמירה של ברירות מחדל: Guitar Tuning mode + Both Alerts ON
        try {
            localStorage.setItem('youchords_tuning_mode', 'guitarTuning');
            localStorage.setItem('youchords_tuning_alert_enabled', 'true');
            console.log('[ResetToDefault] ✅ Tuning Menu reset: mode=guitarTuning, alert=ON');
        } catch (error) {
            console.warn('[ResetToDefault] ❌ Failed to reset Tuning Menu settings:', error);
        }
        
        // עדכון ה-UI אם תפריט ה-Tuning פתוח
        if (typeof window.updateTuningModeMenuState === 'function') {
            window.updateTuningModeMenuState('guitarTuning');
            console.log('[ResetToDefault] ✅ Tuning mode menu UI updated');
        }
        if (typeof window.refreshTuningToggleUI === 'function') {
            window.refreshTuningToggleUI();
            console.log('[ResetToDefault] ✅ Tuning alert toggle UI updated');
        }
        
        console.log('[ResetToDefault] 🎯 TUNING MENU reset completed');

        /*───────────────────────────────────────────────────────────
          4.5  Progress-bar LOCATION → הצמדה מחודשת ל-TOP
                (לפני שמעדכנים משתנים גלובליים / UI)
        ───────────────────────────────────────────────────────────*/
        if (typeof updateProgressBarLocation === 'function') {
            updateProgressBarLocation('top');
        } else {   // fallback – מחלקת BODY
            document.body.classList.remove('yc-pb-bottom');
            document.body.classList.add   ('yc-pb-top');
            window.progressBarLocation = 'top';
        }

        if (typeof updateRectangleProgressBarLocation === 'function') {
            updateRectangleProgressBarLocation('top');
        } else {   // fallback – מחלקת BODY
            document.body.classList.remove('yc-rect-bottom');
            document.body.classList.add   ('yc-rect-top');
            window.rectangleProgressBarLocation = 'top';
        }

        /*───────────────────────────────────────────────────────────
          4.6  איפוס גדלי SIZES MENU לברירות מחדל
        ───────────────────────────────────────────────────────────*/
        if (window.resetSizesToDefault && typeof window.resetSizesToDefault === 'function') {
            try {
                const resetSuccess = window.resetSizesToDefault();
                if (resetSuccess) {
                    console.log('[ResetToDefault] ✅ SIZES MENU reset completed successfully');
                } else {
                    console.warn('[ResetToDefault] ⚠️ SIZES MENU reset returned false');
                }
            } catch (error) {
                console.error('[ResetToDefault] ❌ Failed to reset SIZES MENU:', error);
            }
        } else {
            console.log('[ResetToDefault] ℹ️ resetSizesToDefault function not available (sizes menu not loaded)');
        }

        /*───────────────────────────────────────────────────────────
          4.6.1  איפוס גודל PREVIEW PANEL לברירת מחדל
        ───────────────────────────────────────────────────────────*/
        if (window.resetPreviewPanelSizeToDefault && typeof window.resetPreviewPanelSizeToDefault === 'function') {
            try {
                const resetSuccess = window.resetPreviewPanelSizeToDefault();
                if (resetSuccess) {
                    console.log('[ResetToDefault] ✅ PREVIEW PANEL SIZE reset completed successfully');
                } else {
                    console.warn('[ResetToDefault] ⚠️ PREVIEW PANEL SIZE reset returned false');
                }
            } catch (error) {
                console.error('[ResetToDefault] ❌ Failed to reset PREVIEW PANEL SIZE:', error);
            }
        } else {
            console.log('[ResetToDefault] ℹ️ resetPreviewPanelSizeToDefault function not available (preview panel not loaded)');
        }

        /*───────────────────────────────────────────────────────────
          4.6.1.1  איפוס BEAT GRID של PREVIEW PANEL לברירת מחדל (ON)
        ───────────────────────────────────────────────────────────*/
        try {
            // Reset beat grid to ON (default)
            localStorage.setItem('yc_preview_beatgrid_enabled', 'true');
            
            // Update preview panel if it exists
            if (window.ycChordsPreviewPanel && window.ycChordsPreviewPanel._previewBeatGridEnabled !== undefined) {
                window.ycChordsPreviewPanel._previewBeatGridEnabled = true;
                
                // Update toggle button state
                if (window.ycChordsPreviewPanel._updateBeatGridToggleState) {
                    window.ycChordsPreviewPanel._updateBeatGridToggleState();
                }
                
                // Apply visibility
                if (window.ycChordsPreviewPanel._applyBeatGridVisibility) {
                    window.ycChordsPreviewPanel._applyBeatGridVisibility();
                }
                
                console.log('[ResetToDefault] ✅ Preview Panel Beat Grid reset to ON (default)');
            } else {
                console.log('[ResetToDefault] ℹ️ Preview Panel not loaded - Beat Grid will reset on next load');
            }
        } catch (error) {
            console.error('[ResetToDefault] ❌ Failed to reset Preview Panel Beat Grid:', error);
        }

        /*───────────────────────────────────────────────────────────
          4.6.2  איפוס THEME לברירת מחדל (SEPIA)
        ───────────────────────────────────────────────────────────*/
        try {
            // איפוס ל-SEPIA (themeState = 1)
            localStorage.setItem('youchords_theme_state', '1');
            console.log('[ResetToDefault] ✅ Theme reset to SEPIA (default)');
        } catch (error) {
            console.error('[ResetToDefault] ❌ Failed to reset theme:', error);
        }

        /*───────────────────────────────────────────────────────────
          4.6.3  איפוס צבעי CAROUSEL לברירת מחדל (DEFAULT THEME)
        ───────────────────────────────────────────────────────────*/
        try {
            // Reset carousel colors to default theme
            await chrome.storage.sync.set({
                carouselTheme: 'default',
                carouselColors: {
                    cardBorderInactive: '#000000',
                    cardBorderActive: '#2196f3',
                    panelBackground: '#f9f9f9',
                    cardBackground: '#ffffff',
                    scroll: '#999999'
                },
                carouselCustomColors: {},
                carouselSelectedColors: {}
            });
            
            // Apply the default theme to carousel if it exists
            if (window.applyCarouselTheme && typeof window.applyCarouselTheme === 'function') {
                await window.applyCarouselTheme('default');
                console.log('[ResetToDefault] ✅ Carousel colors reset to DEFAULT theme');
            } else {
                console.log('[ResetToDefault] ℹ️ applyCarouselTheme not available (carousel not loaded)');
            }
        } catch (error) {
            console.error('[ResetToDefault] ❌ Failed to reset carousel colors:', error);
        }

        /*───────────────────────────────────────────────────────────
          4.6.4  איפוס VISUAL INDICATORS לברירת מחדל
        ───────────────────────────────────────────────────────────*/
        try {
            // Reset Countdown Timer and Singing Start Dot to ON
            await chrome.storage.sync.set({
                countdownTimerEnabled: true,
                singingStartDotEnabled: true
            });
            
            // Update global variables
            window.countdownTimerEnabled = true;
            window.singingStartDotEnabled = true;
            
            // Update CSS class for singing dot
            document.body.classList.remove('yc-singing-dot-hidden');
            
            // Update subtitles display if visible
            if (window.CarouselSubtitles?.activeInstance?.isVisible) {
                const video = document.querySelector('video');
                if (video) {
                    window.CarouselSubtitles.activeInstance._renderSubtitles(video.currentTime);
                }
            }
            
            // Update toggle UI if Visual Indicators menu is open
            const countdownToggle = document.querySelector('.countdown-timer-toggle');
            if (countdownToggle) {
                countdownToggle.style.backgroundColor = '#3ea6ff';
                const toggleBtn = countdownToggle.querySelector('div');
                if (toggleBtn) toggleBtn.style.transform = 'translateX(20px)';
                const status = countdownToggle.parentElement?.querySelector('span:last-child');
                if (status) {
                    status.textContent = 'ON';
                    status.style.color = '#3ea6ff';
                }
            }
            
            const singingDotToggle = document.querySelector('.singing-start-dot-toggle');
            if (singingDotToggle) {
                singingDotToggle.style.backgroundColor = '#3ea6ff';
                const toggleBtn = singingDotToggle.querySelector('div');
                if (toggleBtn) toggleBtn.style.transform = 'translateX(20px)';
                const status = singingDotToggle.parentElement?.querySelector('span:last-child');
                if (status) {
                    status.textContent = 'ON';
                    status.style.color = '#3ea6ff';
                }
            }
            
            // Reset Additional Fret Numbers to 'none' (default)
            await chrome.storage.sync.set({
                additionalFretNumbers: 'none',
                singingDotSizeSubtitles: 7,
                singingDotSizeChords: 7.75,
                singingDotColor: '#4CAF50'
            });
            window.additionalFretNumbers = 'none';
            window.singingDotSizeSubtitles = 7;
            window.singingDotSizeChords = 7.75;
            window.singingDotColor = '#4CAF50';
            
            // Update dropdown UI if Visual Indicators menu is open
            const fretNumbersSelect = document.querySelector('.visual-indicators-submenu select');
            if (fretNumbersSelect) {
                fretNumbersSelect.value = 'none';
            }
            
            // Apply default dot styles via CSS
            let dotSizeSubtitlesStyle = document.getElementById('yc-dot-size-subtitles-style');
            if (!dotSizeSubtitlesStyle) {
                dotSizeSubtitlesStyle = document.createElement('style');
                dotSizeSubtitlesStyle.id = 'yc-dot-size-subtitles-style';
                document.head.appendChild(dotSizeSubtitlesStyle);
            }
            dotSizeSubtitlesStyle.textContent = `.yc-ellipse-singing-dot { width: 7px !important; height: 7px !important; }`;
            
            let dotSizeChordsStyle = document.getElementById('yc-dot-size-chords-style');
            if (!dotSizeChordsStyle) {
                dotSizeChordsStyle = document.createElement('style');
                dotSizeChordsStyle.id = 'yc-dot-size-chords-style';
                document.head.appendChild(dotSizeChordsStyle);
            }
            dotSizeChordsStyle.textContent = `.yc-singing-start-dot { width: 7.75px !important; height: 7.75px !important; }`;
            
            let dotColorStyle = document.getElementById('yc-dot-color-style');
            if (!dotColorStyle) {
                dotColorStyle = document.createElement('style');
                dotColorStyle.id = 'yc-dot-color-style';
                document.head.appendChild(dotColorStyle);
            }
            dotColorStyle.textContent = `
                .yc-singing-start-dot { background: #4CAF50 !important; box-shadow: 0 0 4px #4CAF5080 !important; }
                .yc-ellipse-singing-dot { background: #4CAF50 !important; box-shadow: 0 0 4px #4CAF5080 !important; }
            `;
            
            // Clear chord cache to apply the change
            if (window.chordRenderer?.clearCache) {
                window.chordRenderer.clearCache();
            }
            
            console.log('[ResetToDefault] ✅ Visual Indicators reset: Countdown Timer = ON, Singing Start Dot = ON, Additional Fret Numbers = none, Dot sizes and color = default');
        } catch (error) {
            console.error('[ResetToDefault] ❌ Failed to reset Visual Indicators:', error);
        }

        /*───────────────────────────────────────────────────────────
          4.6.4.1  איפוס CHORD EXPLORER לברירת מחדל
        ───────────────────────────────────────────────────────────*/
        try {
            // שמירת ברירות מחדל ב-storage
            await chrome.storage.sync.set({
                explorerFretNumbers: 'none',
                explorerSizePercent: 100
            });
            
            // קריאה לפונקציית האיפוס של Chord Explorer אם קיימת
            if (window.resetChordExplorerSettings && typeof window.resetChordExplorerSettings === 'function') {
                window.resetChordExplorerSettings();
                console.log('[ResetToDefault] ✅ Chord Explorer reset via resetChordExplorerSettings()');
            } else {
                console.log('[ResetToDefault] ℹ️ resetChordExplorerSettings not available (Chord Explorer not loaded)');
            }
            
            console.log('[ResetToDefault] ✅ Chord Explorer reset: Fret Numbers = none, Size = 100%');
        } catch (error) {
            console.error('[ResetToDefault] ❌ Failed to reset Chord Explorer:', error);
        }

        /*───────────────────────────────────────────────────────────
          4.6.4.2  איפוס HIDE QUICK CHORDS לברירת מחדל
        ───────────────────────────────────────────────────────────*/
        try {
            // שמירת ברירות מחדל ב-localStorage
            localStorage.setItem('youchords_hide_quick_enabled', 'true');
            localStorage.setItem('youchords_hide_quick_threshold', '0.5');
            // Force the main settings quick-chords block to default collapsed state after full reset
            localStorage.setItem('youchords_quick_chords_panel_collapsed', 'true');
            
            // עדכון משתנים גלובליים
            window.hideQuickChordsEnabled = true;
            window.hideQuickChordsThreshold = 0.5;
            
            // Dispatch event לעדכון התצוגות
            window.dispatchEvent(new CustomEvent('yc:hideQuickChordsChanged', {
                detail: { enabled: true, threshold: 0.5 }
            }));

            // Chord edits UI controls default: ON / ON
            localStorage.setItem('youchords_show_chord_edit', 'true');
            localStorage.setItem('youchords_show_chord_remove', 'true');
            localStorage.setItem('youchords_show_quick_mode_switch', 'true');
            localStorage.setItem('youchords_edit_include_letter_match', 'true');
            localStorage.setItem('youchords_info_popup_scale', '100');
            localStorage.setItem('youchords_chord_edits_popup_scale', '100');
            localStorage.setItem('youchords_chord_edits_content_scale', '100');
            localStorage.setItem('youchords_carousel_size_popup_scale', '100');
            localStorage.setItem('youchords_carousel_display_popup_scale', '100');
            localStorage.setItem('youchords_preview_display_popup_scale', '100');
            localStorage.setItem('youchords_chord_edits_collapsed', 'true');
            window.dispatchEvent(new CustomEvent('yc:chordEditsUiChanged', {
                detail: { showEdit: true, showRemove: true, showModeSwitch: true }
            }));
            if (typeof window.updateChordEditsGroupCollapsedState === 'function') {
                window.updateChordEditsGroupCollapsedState(true);
            }
            
            console.log('[ResetToDefault] ✅ Hide Quick Chords reset: Enabled = ON, Threshold = 0.5s, Panel = collapsed');
        } catch (error) {
            console.error('[ResetToDefault] ❌ Failed to reset Hide Quick Chords:', error);
        }

        /*───────────────────────────────────────────────────────────
          4.6.5  איפוס VERSE/CHORUS COLORS לברירת מחדל
        ───────────────────────────────────────────────────────────*/
        try {
            // Default verse/chorus colors settings
            const defaultVerseChorusSettings = {
                enabled: false,
                verseEnabled: true,
                verseColor: '#0064ff',
                chorusEnabled: true,
                chorusColor: '#ff0000',
                introEnabled: true,
                introColor: '#0064ff'
            };
            
            // Save to storage
            await chrome.storage.sync.set({ verseChorusColors: defaultVerseChorusSettings });
            
            // Apply default verse/chorus colors (disabled by default)
            if (window.applyVerseChorusColors && typeof window.applyVerseChorusColors === 'function') {
                window.applyVerseChorusColors(defaultVerseChorusSettings);
            }
            
            // Dispose the submenu so it rebuilds with fresh values on next open
            if (window.disposeVerseChorusColorsSubmenu) {
                const existingSubmenu = document.querySelector('.verse-chorus-colors-submenu');
                if (existingSubmenu) {
                    window.disposeVerseChorusColorsSubmenu(existingSubmenu, true);
                }
            }
            
            console.log('[ResetToDefault] ✅ Verse/Chorus Colors reset to defaults (disabled)');
        } catch (error) {
            console.error('[ResetToDefault] ❌ Failed to reset Verse/Chorus Colors:', error);
        }

        /*───────────────────────────────────────────────────────────
          4.6.6  איפוס SPACING לברירת מחדל
        ───────────────────────────────────────────────────────────*/
        try {
            // Remove spacing settings from localStorage
            localStorage.removeItem(window.SPACING_STORAGE_KEY || 'youchords_lyrics_spacing');
            
            // Reset spacing settings using the function if available
            if (window.resetSpacingSettings && typeof window.resetSpacingSettings === 'function') {
                window.resetSpacingSettings();
            } else {
                // Fallback: apply default spacing via CSS
                const defaultSpacing = window.DEFAULT_SPACING_SETTINGS || {
                    wordSpacing: 1,
                    lineSpacing: 0,
                    sectionSpacing: 0,
                    instrumentalSpacing: 0
                };
                
                // Save defaults to localStorage
                localStorage.setItem('youchords_lyrics_spacing', JSON.stringify(defaultSpacing));
                
                // Apply via CSS if applySpacingSettings is available
                if (window.applySpacingSettings && typeof window.applySpacingSettings === 'function') {
                    window.applySpacingSettings();
                }
            }
            
            // Dispose the submenu so it rebuilds with fresh values on next open
            if (window.disposeSpacingSubmenu) {
                const existingSubmenu = document.querySelector('.spacing-submenu');
                if (existingSubmenu) {
                    window.disposeSpacingSubmenu(existingSubmenu, true);
                }
            }
            
            console.log('[ResetToDefault] ✅ Spacing reset to defaults');
        } catch (error) {
            console.error('[ResetToDefault] ❌ Failed to reset Spacing:', error);
        }

        /*───────────────────────────────────────────────────────────
          4.6.7  איפוס RANDOM POSITIONS (DICE) לברירת מחדל
        ───────────────────────────────────────────────────────────*/
        try {
            // מחיקת הגדרות הקוביה מ-localStorage
            localStorage.removeItem('youchords_dice_enabled');
            localStorage.removeItem('youchords_dice_percentage');
            localStorage.removeItem('youchords_dice_active');
            localStorage.removeItem('youchords_dice_position_range'); // 🎯 Position Range
            localStorage.removeItem('youchords_dice_custom_ranges'); // 🎯 Custom Position Ranges
            
            // עדכון המשתנים הגלובליים אם DiceIcon קיים
            if (window.DiceIcon) {
                // איפוס ל-50% (ברירת מחדל)
                if (window.DiceIcon.setPercentage) {
                    window.DiceIcon.setPercentage(50);
                }
                
                // אם הקוביה פעילה - כבה אותה והחזר פוזיציות מקוריות
                if (window.DiceIcon.isActive && window.DiceIcon.isActive()) {
                    window.DiceIcon.toggle(); // יכבה את הקוביה ויחזיר פוזיציות
                }
            }
            
            // עדכון ה-UI של התפריט אם פתוח
            const diceToggle = document.querySelector('.dice-toggle');
            if (diceToggle) {
                // ברירת מחדל: enabled = true
                diceToggle.style.background = '#4ade80';
                const toggleKnob = diceToggle.querySelector('div');
                if (toggleKnob) toggleKnob.style.left = '22px';
            }
            
            const diceDropdown = document.querySelector('.dice-percentage-dropdown');
            if (diceDropdown) {
                diceDropdown.value = '50';
            }
            
            // עדכון ה-dropdown row
            const dropdownRow = diceDropdown?.parentElement;
            if (dropdownRow) {
                dropdownRow.style.opacity = '1';
                dropdownRow.style.cursor = 'default';
            }
            
            // עדכון ה-dropdown עצמו
            if (diceDropdown) {
                diceDropdown.style.pointerEvents = 'auto';
                diceDropdown.style.cursor = 'pointer';
            }
            
            console.log('[ResetToDefault] ✅ Random Positions (Dice) reset: enabled = true, percentage = 50%, active = false');
        } catch (error) {
            console.error('[ResetToDefault] ❌ Failed to reset Random Positions (Dice):', error);
        }

        /*───────────────────────────────────────────────────────────
          4.6.8  איפוס CAPO לברירת מחדל
        ───────────────────────────────────────────────────────────*/
        try {
            // מחיקת הגדרות הקאפו מ-localStorage
            localStorage.removeItem('youchords_capo_feature_enabled');
            localStorage.removeItem('youchords_capo_sync_enabled');
            localStorage.removeItem('youchords_capo_auto_hide');
            localStorage.removeItem('youchords_capo_active');
            localStorage.removeItem('youchords_capo_fret');
            localStorage.removeItem('youchords_capo_panel_active');
            localStorage.removeItem('youchords_capo_panel_fret');
            localStorage.removeItem('youchords_capo_carousel_active');
            localStorage.removeItem('youchords_capo_carousel_fret');
            localStorage.removeItem('youchords_capo_show_relative_change');
            localStorage.removeItem('youchords_capo_show_base_change');
            
            // עדכון CapoIcon אם קיים
            if (window.CapoIcon) {
                // כיבוי הקאפו אם פעיל
                if (window.CapoIcon.setFeatureEnabled) {
                    window.CapoIcon.setFeatureEnabled(true); // הפיצ'ר מופעל
                }
                // איפוס הסריג ל-1 (עם skipProCheck=true כדי לא להציג modal)
                if (window.CapoIcon.setFret) {
                    window.CapoIcon.setFret('panel', 1, true);
                    window.CapoIcon.setFret('carousel', 1, true);
                }
            }
            
            // עדכון ה-UI של התפריט אם פתוח
            const capoToggle = document.querySelector('.capo-toggle');
            if (capoToggle) {
                capoToggle.style.background = '#4ade80';
                const toggleKnob = capoToggle.querySelector('div');
                if (toggleKnob) toggleKnob.style.left = '22px';
            }
            
            const syncToggle = document.querySelector('.capo-sync-toggle');
            if (syncToggle) {
                syncToggle.style.background = '#4ade80';
                const syncKnob = syncToggle.querySelector('div');
                if (syncKnob) syncKnob.style.left = '22px';
            }
            
            const hideToggle = document.querySelector('.capo-hide-toggle');
            if (hideToggle) {
                hideToggle.style.background = '#4ade80';
                const hideKnob = hideToggle.querySelector('div');
                if (hideKnob) hideKnob.style.left = '22px';
            }
            
            console.log('[ResetToDefault] ✅ Capo reset: feature = ON, sync = ON, auto hide = ON, fret = 1');
        } catch (error) {
            console.error('[ResetToDefault] ❌ Failed to reset Capo:', error);
        }

        // 5. Update global variables with default settings
        console.log('[ResetToDefault] Updating global variables...');
        
        // 5.1 Update subtitle state variables
        window.subtitleState = window.subtitleState || {};
        window.subtitleState.isVisible = false;
        window.subtitleState.sizePercentage = window.DEFAULT_SETTINGS.subtitleSize;
        
        window.subtitleModeState = {
            isLyricsMode: window.DEFAULT_SETTINGS.subtitleLyricsMode,
            isSubtitleMode: window.DEFAULT_SETTINGS.subtitleSubtitleMode,
            lastMode: window.DEFAULT_SETTINGS.subtitleLastMode,
            isLyricsHighlightEnabled: true,
            isChordsHighlightEnabled: true
        };
        
        // שמירת הגדרות Word Highlight ב-storage
        chrome.storage.sync.set({ 
            subtitleLyricsHighlightEnabled: true,
            subtitleChordsHighlightEnabled: true
        }).catch(() => console.warn('[ResetToDefault] persist highlight settings failed'));
        
        // 5.2 Update color and style variables
        window.currentSubtitleColor = window.DEFAULT_SETTINGS.subtitleColor;
        window.currentHighlightColor = window.DEFAULT_SETTINGS.subtitleHighlightColor;
        window.currentHighlightBackgroundEnabled = window.DEFAULT_SETTINGS.subtitleHighlightBackgroundEnabled;
        window.currentFontOpacity = window.DEFAULT_SETTINGS.subtitleFontOpacity;
        window.currentBackgroundColor = window.DEFAULT_SETTINGS.subtitleBackgroundColor;
        window.currentBackgroundOpacity = window.DEFAULT_SETTINGS.subtitleBackgroundOpacity;
        window.currentWordHighlightTextColor = window.DEFAULT_SETTINGS.subtitleWordHighlightTextColor;

        // 5.3 Update chords mode
        window.chordsMode = window.DEFAULT_SETTINGS.chordsMode;

        // 5.3.1 Update progress bars setting
        if (typeof window.updateProgressBars === 'function') {
            window.updateProgressBars(window.DEFAULT_SETTINGS.progressBarsEnabled);
        } else {
            window.progressBarsEnabled = window.DEFAULT_SETTINGS.progressBarsEnabled;
        }
        
        /*─────────────────────────────────────────────────────────┐
        │ 5.3.2  Rectangle Progress Bar – תמיד ON לאחר Reset     │
        └─────────────────────────────────────────────────────────*/
        if (typeof window.updateRectangleProgressBars === 'function') {
            window.updateRectangleProgressBars(false);      // ניקוי יסודי
            window.updateRectangleProgressBars(true);       // הפעלה + שמירה
        } else {
            window.rectangleProgressBarsEnabled = true;     // גיבוי
            chrome.storage.sync.set({ rectangleProgressBarsEnabled: true })
                .catch(() => console.warn('[ResetToDefault] persist failed'));
        }
        
        /*─────────────────────────────────────────────────────────┐
        │ 5.3.3  Subtitles In Chords – איפוס להגדרת ברירת מחדל   │
        └─────────────────────────────────────────────────────────*/
        if (typeof window.updateSubtitlesInChords === 'function') {
            // לא לפתוח את התפריט תוך כדי reset
            window.updateSubtitlesInChords(
                window.DEFAULT_SETTINGS.subtitlesInChordsEnabled,
                /* keepSubmenuOpen = */ true
            );
        } else {
            window.subtitlesInChordsEnabled = window.DEFAULT_SETTINGS.subtitlesInChordsEnabled;
            chrome.storage.sync.set({ subtitlesInChordsEnabled: window.DEFAULT_SETTINGS.subtitlesInChordsEnabled })
                .catch(() => console.warn('[ResetToDefault] persist subtitlesInChordsEnabled failed'));
        }
        
        /*─────────────────────────────────────────────────────────┐
        │ 5.3.3.1  Carousel Subtitles Settings – איפוס לברירות מחדל │
        └─────────────────────────────────────────────────────────*/
        // Clear all carousel subtitle settings from localStorage
        localStorage.removeItem('yc_carousel_subtitle_font_size');
        localStorage.removeItem('yc_carousel_word_spacing');
        localStorage.removeItem('yc_carousel_split_lines');
        localStorage.removeItem('yc_carousel_subtitle_panel_bg');
        localStorage.removeItem('yc_carousel_subtitle_ellipse_bg');
        localStorage.removeItem('yc_carousel_subtitle_highlight');
        localStorage.removeItem('yc_carousel_subtitle_highlight_text');
        localStorage.removeItem('yc_carousel_subtitle_word_color');
        localStorage.removeItem('yc_carousel_subtitles_enabled');
        localStorage.removeItem('yc_carousel_word_highlight');
        
        // Set defaults in localStorage
        localStorage.setItem('yc_carousel_subtitle_font_size', '20');
        localStorage.setItem('yc_carousel_word_highlight', 'true');
        localStorage.setItem('yc_carousel_passed_words', 'true');
        localStorage.setItem('yc_carousel_word_spacing', '-3.6');
        localStorage.setItem('yc_carousel_split_lines', 'true');
        localStorage.setItem('yc_carousel_subtitle_panel_bg', '#f9f9f9');
        localStorage.setItem('yc_carousel_subtitle_ellipse_bg', '#ffffff');
        localStorage.setItem('yc_carousel_subtitle_highlight', '#ffff00');
        localStorage.setItem('yc_carousel_subtitle_highlight_text', '#000000');
        localStorage.setItem('yc_carousel_subtitle_word_color', '#000000');
        localStorage.setItem('yc_carousel_subtitle_passed_color', '#e91e63');
        localStorage.setItem('yc_carousel_subtitles_enabled', 'true');
        
        // Update active CarouselSubtitles instance if exists
        if (window.CarouselSubtitles?.activeInstance) {
            const instance = window.CarouselSubtitles.activeInstance;
            instance.fontSize = 20;
            instance.wordSpacing = -3.6;
            instance.shouldSplitLines = true;
            instance.panelBackground = '#f9f9f9';
            instance.ellipseBackground = '#ffffff';
            instance.highlightColor = '#ffff00';
            instance.highlightTextColor = '#000000';
            instance.wordColor = '#000000';
            instance.passedWordColor = '#e91e63';
            window.wordHighlightEnabled = true;
            window.passedWordsEnabled = true;
            instance._injectCSS();
            
            // Reload subtitle data before rendering to fix word highlighting
            if (instance.isVisible && instance.videoElement) {
                if (window.loadSubtitles && typeof window.loadSubtitles === 'function') {
                    window.loadSubtitles().then(() => {
                        // Force re-process subtitles with fresh data
                        instance.processedSubtitles = null;
                        instance._renderSubtitles(instance.videoElement.currentTime);
                    }).catch(() => {
                        // Fallback: render anyway
                        instance._renderSubtitles(instance.videoElement.currentTime);
                    });
                } else {
                    instance._renderSubtitles(instance.videoElement.currentTime);
                }
            }
        }
        
        // Update toggle UI state
        if (typeof window.updateSubtitlesInChordsState === 'function') {
            window.updateSubtitlesInChordsState(true);
        }
        
        // Update Word Highlight toggle UI
        const wordHighlightToggle = document.querySelector('.word-highlight-toggle');
        if (wordHighlightToggle) {
            wordHighlightToggle.style.backgroundColor = '#3ea6ff';
            const toggleBtn = wordHighlightToggle.querySelector('div');
            if (toggleBtn) toggleBtn.style.transform = 'translateX(20px)';
            const status = wordHighlightToggle.parentElement?.querySelector('span:last-child');
            if (status) {
                status.textContent = 'ON';
                status.style.color = '#3ea6ff';
            }
        }
        
        // Update Passed Words toggle UI
        const passedWordsToggle = document.querySelector('.passed-words-toggle');
        if (passedWordsToggle) {
            passedWordsToggle.style.backgroundColor = '#3ea6ff';
            const toggleBtn = passedWordsToggle.querySelector('div');
            if (toggleBtn) toggleBtn.style.transform = 'translateX(20px)';
            const status = passedWordsToggle.parentElement?.querySelector('span:last-child');
            if (status) {
                status.textContent = 'ON';
                status.style.color = '#3ea6ff';
            }
        }
        
        // Dispose Subtitles In Chords menu so it rebuilds with fresh values on next open
        if (window.disposeSubtitlesInChordsSubmenu && window.subtitlesInChordsSubmenu) {
            window.disposeSubtitlesInChordsSubmenu(window.subtitlesInChordsSubmenu, true);
            window.subtitlesInChordsSubmenu = null;
        }
        
        console.log('[ResetToDefault] ✅ Carousel Subtitles settings reset to defaults');
        
        /*─────────────────────────────────────────────────────────┐
        │ 5.3.4  Timeline Always Visible – איפוס לברירת מחדל     │
        └─────────────────────────────────────────────────────────*/
        if (typeof window.updateTimelineAlwaysVisible === 'function') {
            // לא לפתוח את התפריט תוך כדי reset
            window.updateTimelineAlwaysVisible(
                window.DEFAULT_SETTINGS.timelineAlwaysVisibleEnabled,
                /* keepSubmenuOpen = */ true
            );
        } else {
            window.timelineAlwaysVisibleEnabled = window.DEFAULT_SETTINGS.timelineAlwaysVisibleEnabled;
            chrome.storage.sync.set({ timelineAlwaysVisibleEnabled: window.DEFAULT_SETTINGS.timelineAlwaysVisibleEnabled })
                .catch(() => console.warn('[ResetToDefault] persist timelineAlwaysVisibleEnabled failed'));
        }
        
        /*─────────────────────────────────────────────────────────┐
        │ 5.3.4.1  Carousel Position Number – איפוס ל-ON         │
        └─────────────────────────────────────────────────────────*/
        if (typeof window.updateCarouselPositionNumber === 'function') {
            window.updateCarouselPositionNumber(true, /* keepSubmenuOpen = */ true);
        } else {
            window.carouselPositionNumberEnabled = true;
            document.body.classList.add('yc-carousel-position-always-visible');
            chrome.storage.sync.set({ carouselPositionNumberEnabled: true })
                .catch(() => console.warn('[ResetToDefault] persist carouselPositionNumberEnabled failed'));
        }
        
        /*─────────────────────────────────────────────────────────┐
        │ 5.3.4.2  Primary Chords Position – איפוס ל-ON          │
        └─────────────────────────────────────────────────────────*/
        if (typeof window.updatePrimaryChordPosition === 'function') {
            window.updatePrimaryChordPosition(true, /* keepSubmenuOpen = */ true);
        } else {
            window.primaryChordPositionEnabled = true;
            chrome.storage.sync.set({ primaryChordPositionEnabled: true })
                .catch(() => console.warn('[ResetToDefault] persist primaryChordPositionEnabled failed'));
        }
        
        if (typeof window.updateGlobeIcon === 'function') {
            window.updateGlobeIcon(true, /* keepSubmenuOpen = */ true);
        } else {
            window.globeIconEnabled = true;
            chrome.storage.sync.set({ globeIconEnabled: true })
                .catch(() => console.warn('[ResetToDefault] persist globeIconEnabled failed'));
        }
        
        if (typeof window.updateBlackArrows === 'function') {
            window.updateBlackArrows(true, /* keepSubmenuOpen = */ true);
        } else {
            window.blackArrowsEnabled = true;
            chrome.storage.sync.set({ blackArrowsEnabled: true })
                .catch(() => console.warn('[ResetToDefault] persist blackArrowsEnabled failed'));
        }
        
        // Update UI states if menu is open
        if (typeof window.updatePrimaryChordPositionState === 'function') {
            window.updatePrimaryChordPositionState(true);
        }
        if (typeof window.updateGlobeIconState === 'function') {
            window.updateGlobeIconState(true);
        }
        if (typeof window.updateGlobeIconDisabledState === 'function') {
            window.updateGlobeIconDisabledState(false); // Enable globe icon since primary is ON
        }
        if (typeof window.updateBlackArrowsState === 'function') {
            window.updateBlackArrowsState(true);
        }
        if (typeof window.updateBlackArrowsDisabledState === 'function') {
            window.updateBlackArrowsDisabledState(false); // Enable black arrows since primary is ON
        }
        
        /*─────────────────────────────────────────────────────────┐
        │ 5.3.5  Active Chord Position – איפוס למיקום ברירת מחדל │
        └─────────────────────────────────────────────────────────*/
        if (typeof window.updateActiveChordPosition === 'function') {
            window.updateActiveChordPosition(window.DEFAULT_SETTINGS.activeChordPosition);
        } else {
            window.activeChordPosition = window.DEFAULT_SETTINGS.activeChordPosition;
            chrome.storage.sync.set({ activeChordPosition: window.DEFAULT_SETTINGS.activeChordPosition })
                .catch(() => console.warn('[ResetToDefault] persist activeChordPosition failed'));
        }
        
        /*─────────────────────────────────────────────────────────┐
        │ 5.3.5.1  Chords Processing – reset to default (ON)      │
        └─────────────────────────────────────────────────────────*/
        // Always force ON after full reset.
        window.chordsProcessingEnabled = true;
        chrome.storage.sync.set({ chordsProcessingEnabled: true })
            .catch(() => console.warn('[ResetToDefault] persist chordsProcessingEnabled failed'));

        if (typeof window.updateChordsProcessingToggleState === 'function') {
            window.updateChordsProcessingToggleState(true);
        }

        // Keep Chords Tools block collapsed/closed by default after full reset.
        localStorage.setItem('youchords_chords_tools_collapsed', 'true');
        localStorage.removeItem('youchords_subtitle_chords_group_collapsed');
        if (typeof window.updateSubtitleAndChordsGroupCollapsedState === 'function') {
            window.updateSubtitleAndChordsGroupCollapsedState(true);
        }
        
        /*─────────────────────────────────────────────────────────┐
        │ 5.3.6  Chords Location – איפוס למיקום ברירת מחדל        │
        └─────────────────────────────────────────────────────────*/
        if (typeof window.updateChordsLocation === 'function') {
            window.updateChordsLocation(window.DEFAULT_SETTINGS.chordsLocation === 'inside');
        } else {
            window.chordsLocation = window.DEFAULT_SETTINGS.chordsLocation;
            chrome.storage.sync.set({ chordsLocation: window.DEFAULT_SETTINGS.chordsLocation })
                .catch(() => console.warn('[ResetToDefault] persist chordsLocation failed'));
        }
        
        /*─────────────────────────────────────────────────────────┐
        │ 5.3.7  Subtitle Location – איפוס למיקום ברירת מחדל      │
        └─────────────────────────────────────────────────────────*/
        // איפוס Subtitle Location ל-10% (ברירת מחדל)
        const DEFAULT_SUBTITLE_LOCATION = 10;
        
        // עדכון המשתנה הגלובלי
        if (window.subtitleLocationState) {
            window.subtitleLocationState.userSelectedValue = DEFAULT_SUBTITLE_LOCATION;
            window.subtitleLocationState.currentValue = DEFAULT_SUBTITLE_LOCATION;
            window.subtitleLocationState.horizontalOffset = 0;
            window.subtitleLocationState.isLocked = false;
            console.log('[ResetToDefault] ✅ Subtitle Location state reset to 10%');
        }
        
        // שמירה ב-storage
        chrome.storage.sync.set({
            subtitleLocation: DEFAULT_SUBTITLE_LOCATION,
            subtitleHorizontalOffset: 0
        })
            .then(() => console.log('[ResetToDefault] ✅ Subtitle Location saved to storage: 10%'))
            .catch(() => console.warn('[ResetToDefault] ⚠️ Failed to persist subtitleLocation'));
        
        // החלת הערך על הכתוביות באמצעות הפונקציה המתאימה
        if (typeof window.applySubtitlePosition === 'function') {
            window.applySubtitlePosition({
                bottom: DEFAULT_SUBTITLE_LOCATION,
                horizontalOffset: 0
            }, false);
            console.log('[ResetToDefault] ✅ Applied subtitle position: bottom=10%, horizontal=0%');
        } else if (typeof applySubtitleLocation === 'function') {
            // קריאה לפונקציה שמחילה את הערך בצורה מלאה
            // false = לא system change, כי זה reset ידני של המשתמש
            applySubtitleLocation(DEFAULT_SUBTITLE_LOCATION, false);
            console.log('[ResetToDefault] ✅ Applied subtitle location via applySubtitleLocation(): 9%');
        } else {
            // fallback - החלה ישירה אם הפונקציה לא זמינה
            const subtitleOverlay = document.querySelector('.yt-subtitle-overlay');
            if (subtitleOverlay) {
                subtitleOverlay.style.bottom = `${DEFAULT_SUBTITLE_LOCATION}%`;
                const subtitleContainer = subtitleOverlay.querySelector('.yt-subtitle-container');
                if (subtitleContainer) {
                    subtitleContainer.style.position = 'relative';
                    subtitleContainer.style.left = '0%';
                }
                console.log('[ResetToDefault] ✅ Applied subtitle location CSS (fallback): bottom=9%');
            }
        }
        
        // עדכון ה-UI של התפריט אם הוא פתוח
        const locationSubmenu = document.querySelector('.subtitle-location-submenu');
        if (locationSubmenu) {
            const allButtons = locationSubmenu.querySelectorAll('.subtitle-location-value');
            allButtons.forEach((btn) => {
                const value = parseInt(btn.textContent.replace('%', '').replace(' ✓', '').trim());
                btn.classList.remove('selected');
                btn.style.color = '#fff';
                btn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                btn.style.background = 'transparent';
                btn.textContent = value + '%';
                
                // סמן את הכפתור של 10%
                if (value === DEFAULT_SUBTITLE_LOCATION) {
                    btn.classList.add('selected');
                    btn.textContent = value + '% ✓';
                    btn.style.color = '#3ea6ff';
                    btn.style.borderColor = '#3ea6ff';
                }
            });
            console.log('[ResetToDefault] ✅ Updated subtitle location menu UI');
        }
        
        /*─────────────────────────────────────────────────────────────────┐
        │ 5.3.8  Sizes – איפוס כל הגדלים לברירות מחדל                        │
        └─────────────────────────────────────────────────────────────────*/
        if (typeof window.resetSizesToDefault === 'function') {
            const resetSuccess = window.resetSizesToDefault();
            if (resetSuccess) {
                console.log('[ResetToDefault] ✅ Sizes reset completed successfully');
            } else {
                console.warn('[ResetToDefault] ⚠️ Sizes reset failed');
            }
        } else {
            console.warn('[ResetToDefault] ⚠️ resetSizesToDefault function not available');
        }

        /*─────────────────────────────────────────────────────────────────┐
        │ 5.3.9  Carousel Direction – איפוס כיוון קרוסלה לברירת מחדל        │
        └─────────────────────────────────────────────────────────────────*/
        if (typeof window.resetCarouselDirectionToDefault === 'function') {
            const resetSuccess = window.resetCarouselDirectionToDefault();
            if (resetSuccess) {
                console.log('[ResetToDefault] ✅ Carousel Direction reset completed successfully');
            } else {
                console.warn('[ResetToDefault] ⚠️ Carousel Direction reset failed');
            }
        } else {
            console.warn('[ResetToDefault] ⚠️ resetCarouselDirectionToDefault function not available');
        }

        /*─────────────────────────────────────────────────────────────────┐
        │ 5.3.9.1  Preview Chords Direction – reset to default (AUTO)    │
        └─────────────────────────────────────────────────────────────────*/
        if (typeof window.resetPreviewActiveChordDirectionToDefault === 'function') {
            window.resetPreviewActiveChordDirectionToDefault();
            console.log('[ResetToDefault] ✅ Preview Chords Direction reset to AUTO');
        } else {
            try {
                localStorage.setItem('youchords_preview_active_chord_direction', 'auto');
                window.previewActiveChordDirection = 'auto';
                window.dispatchEvent(new CustomEvent('yc:previewActiveChordDirectionChanged', {
                    detail: { direction: 'auto' }
                }));
                console.log('[ResetToDefault] ✅ Preview Chords Direction reset to AUTO (fallback)');
            } catch (error) {
                console.warn('[ResetToDefault] ⚠️ Failed to reset Preview Chords Direction:', error);
            }
        }

        /*─────────────────────────────────────────────────────────────────┐
        │ 5.3.9.2  Panels Direction – reset to default (AUTO)            │
        └─────────────────────────────────────────────────────────────────*/
        if (typeof window.resetPanelsDirectionToDefault === 'function') {
            window.resetPanelsDirectionToDefault();
            console.log('[ResetToDefault] ✅ Panels Direction reset to AUTO');
        } else {
            try {
                localStorage.setItem('youchords_panels_direction', 'auto');
                window.panelsDirectionMode = 'auto';
                window.dispatchEvent(new CustomEvent('yc:panelsDirectionChanged', {
                    detail: { direction: 'auto' }
                }));
                console.log('[ResetToDefault] ✅ Panels Direction reset to AUTO (fallback)');
            } catch (error) {
                console.warn('[ResetToDefault] ⚠️ Failed to reset Panels Direction:', error);
            }
        }

        /*─────────────────────────────────────────────────────────────────┐
        │ 5.3.10  Beat Grid – איפוס Beat Grid לברירת מחדל (ON)            │
        └─────────────────────────────────────────────────────────────────*/
        if (typeof window.resetBeatGridToDefault === 'function') {
            const resetSuccess = window.resetBeatGridToDefault();
            if (resetSuccess) {
                console.log('[ResetToDefault] ✅ Beat Grid reset completed successfully');
            } else {
                console.warn('[ResetToDefault] ⚠️ Beat Grid reset failed');
            }
        } else {
            console.warn('[ResetToDefault] ⚠️ resetBeatGridToDefault function not available');
        }

        // 5.5 Reset Sentence Highlight
        if (typeof window.updateSentenceHighlight === 'function') {
            window.updateSentenceHighlight(window.DEFAULT_SETTINGS.sentenceHighlightEnabled);
        } else {
            window.sentenceHighlightEnabled = window.DEFAULT_SETTINGS.sentenceHighlightEnabled;
            chrome.storage.sync.set({ sentenceHighlightEnabled: window.DEFAULT_SETTINGS.sentenceHighlightEnabled })
                .catch(() => console.warn('[ResetToDefault] persist sentenceHighlightEnabled failed'));
        }

        // 5.4 Update button visibility settings
        window.buttonsEnabled = {
            chords: window.DEFAULT_SETTINGS.button_chords_enabled,
            subtitle: window.DEFAULT_SETTINGS.button_subtitle_enabled,
            customSubtitle: window.DEFAULT_SETTINGS.button_customSubtitle_enabled,
            lyricsChords: window.DEFAULT_SETTINGS.button_lyricsChords_enabled,
            tuner: window.DEFAULT_SETTINGS.button_tuner_enabled,
            chordExplorer: window.DEFAULT_SETTINGS.button_chordExplorer_enabled,
            settings: true // Always keep settings button enabled
        };

        // 6. Recreate UI elements with default settings
        console.log('[ResetToDefault] Recreating UI elements...');
        
        // 6.1 Handle buttons - IMPORTANT: Keep settings button intact
        const controls = document.querySelector('.ytp-right-controls');
        if (controls) {
            // Get all custom buttons except settings
            const customButtons = Array.from(controls.querySelectorAll('.custom-button-container'))
                .filter(button => button.getAttribute('data-btn') !== 'settings');
            
            // Remove non-settings buttons
            customButtons.forEach(button => button.remove());
            
            // חשוב: קריאה ל-injectButtons כדי ליצור כפתורים ולהוסיף מאזינים
            console.log('[DEBUG-RESET] Calling injectButtons to recreate buttons with event listeners');
            if (typeof window.injectButtons === 'function') {
                window.injectButtons();
                console.log('[DEBUG-RESET] injectButtons called successfully');
                
                // וידוא שהכפתורים מתחילים במצב כבוי (לבנים)
                setTimeout(() => {
                    const chordsBtn = document.querySelector('.ytp-chords-button');
                    const subtitleBtn = document.querySelector('.ytp-subtitle-button');
                    
                    if (chordsBtn) {
                        chordsBtn.classList.remove('chords-active');
                        console.log('[DEBUG-RESET] Chords button reset to inactive state');
                    }
                    if (subtitleBtn) {
                        subtitleBtn.classList.remove('subtitle-button-active', 'active');
                        console.log('[DEBUG-RESET] Subtitle button reset to inactive state');
                    }
                    
                    // עדכון משתנים גלובליים ומקומיים
                    window.chordsActive = false;
                    window.subtitleActive = false;
                    
                    // חשוב: איפוס גם המשתנים המקומיים ב-content.js
                    if (typeof window.resetLocalVariables === 'function') {
                        window.resetLocalVariables();
                    } else {
                        console.error('[DEBUG-RESET] resetLocalVariables function not available!');
                    }
                    
                    console.log('[DEBUG-RESET] Global AND local variables reset to inactive');
                }, 100);
            } else {
                console.error('[DEBUG-RESET] injectButtons function not available!');
            }
        }
        
        // 6.2 Ensure subtitle DOM is recreated if needed
        if (typeof window.ensureSubtitleDOM === 'function') {
            window.ensureSubtitleDOM();
        }
        
        // 6.3 Update UI for subtitle modes
        if (window.updateModeUI) {
            window.updateModeUI('lyrics', window.DEFAULT_SETTINGS.subtitleLyricsMode);
            window.updateModeUI('subtitle', window.DEFAULT_SETTINGS.subtitleSubtitleMode);
        }
        
        // 6.4 DEBUG - בדיקה מפורטת למה האקורדים לא חוזרים אוטומטית
        console.log('[DEBUG-RESET] Previous state was:', {
            'subtitle was active': wasSubtitleActive,
            'chords was active': wasChordsActive
        });
        
        if (wasChordsActive) {
            console.log('[DEBUG-RESET] Chords were active before reset - attempting to reactivate');
            
            // בדיקה מפורטת של מצב הכפתור אחרי יצירתו
            setTimeout(() => {
                const chordsBtn = document.querySelector('.ytp-chords-button');
                console.log('[DEBUG-RESET] Chords button state after creation:', {
                    'button exists': !!chordsBtn,
                    'has dataset.bound': chordsBtn?.dataset?.bound,
                    'has _lastHandler': !!chordsBtn?._lastHandler,
                    'handler type': typeof chordsBtn?._lastHandler,
                    'button classes': chordsBtn ? [...chordsBtn.classList] : 'none',
                    'chordsActive global': window.chordsActive
                });
                
                if (chordsBtn) {
                    console.log('[DEBUG-RESET] Attempting to click chords button...');
                    
                    // ניסיון לחיצה
                    try {
                        chordsBtn.click();
                        console.log('[DEBUG-RESET] Click executed successfully');
                        
                        // בדיקה אחרי הלחיצה
                        setTimeout(() => {
                            console.log('[DEBUG-RESET] State after click:', {
                                'has chords-active class': chordsBtn.classList.contains('chords-active'),
                                'chordsActive global': window.chordsActive,
                                'overlayCtlChords exists': !!window.overlayCtlChords
                            });
                            
                            if (!chordsBtn.classList.contains('chords-active')) {
                                console.error('[DEBUG-RESET] ❌ Click did not activate chords - investigating...');
                                
                                // בדיקה מעמיקה
                                console.log('[DEBUG-RESET] Deep investigation:', {
                                    'toggleChords function exists': typeof window.toggleChords,
                                    'createChordsButton exists': typeof window.createChordsButton,
                                    'dynamicLoader exists': typeof window.dynamicLoader,
                                    'chordsDisplay exists': typeof window.chordsDisplay
                                });
                            } else {
                                console.log('[DEBUG-RESET] ✅ Chords activated successfully!');
                            }
                        }, 200);
                        
                    } catch (error) {
                        console.error('[DEBUG-RESET] ❌ Error clicking chords button:', error);
                    }
                } else {
                    console.error('[DEBUG-RESET] ❌ Chords button not found!');
                }
            }, 600); // זמן נוסף לוודא שהכפתור מוכן לחלוטין
        } else {
            console.log('[DEBUG-RESET] Chords were not active before reset - staying inactive');
        }
        
        // הפעלה מחדש של כתוביות אם היו פעילות לפני RESET
        if (wasSubtitleActive) {
            console.log('[DEBUG-RESET] Subtitles were active before reset - attempting to reactivate');
            
            // בדיקה מפורטת של מצב כפתור הכתוביות אחרי יצירתו
            setTimeout(() => {
                const subtitleBtn = document.querySelector('.ytp-subtitle-button');
                console.log('[DEBUG-RESET] Subtitle button state after creation:', {
                    'button exists': !!subtitleBtn,
                    'has dataset.bound': subtitleBtn?.dataset?.bound,
                    'has _lastHandler': !!subtitleBtn?._lastHandler,
                    'handler type': typeof subtitleBtn?._lastHandler,
                    'button classes': subtitleBtn ? [...subtitleBtn.classList] : 'none',
                    'subtitleActive global': window.subtitleActive
                });
                
                if (subtitleBtn) {
                    console.log('[DEBUG-RESET] Attempting to click subtitle button...');
                    
                    // ניסיון לחיצה
                    try {
                        subtitleBtn.click();
                        console.log('[DEBUG-RESET] Subtitle click executed successfully');
                        
                        // בדיקה אחרי הלחיצה
                        setTimeout(() => {
                            console.log('[DEBUG-RESET] Subtitle state after click:', {
                                'has subtitle-button-active class': subtitleBtn.classList.contains('subtitle-button-active'),
                                'has active class': subtitleBtn.classList.contains('active'),
                                'subtitleActive global': window.subtitleActive
                            });
                            
                            if (!subtitleBtn.classList.contains('subtitle-button-active') && !subtitleBtn.classList.contains('active')) {
                                console.error('[DEBUG-RESET] ❌ Subtitle click did not activate - investigating...');
                                
                                // בדיקה מעמיקה
                                console.log('[DEBUG-RESET] Subtitle deep investigation:', {
                                    'toggleSubs function exists': typeof window.toggleSubs,
                                    'createSubtitleButton exists': typeof window.createSubtitleButton,
                                    'subtitleDisplay exists': typeof window.subtitleDisplay
                                });
                            } else {
                                console.log('[DEBUG-RESET] ✅ Subtitles activated successfully!');
                            }
                        }, 200);
                        
                    } catch (error) {
                        console.error('[DEBUG-RESET] ❌ Error clicking subtitle button:', error);
                    }
                } else {
                    console.error('[DEBUG-RESET] ❌ Subtitle button not found!');
                }
            }, 650); // זמן קצת יותר מהאקורדים
        } else {
            console.log('[DEBUG-RESET] Subtitles were not active before reset - staying inactive');
        }
        
        // הפעלה מחדש של פאנל Lyrics & Chords אם היה פעיל לפני RESET
        if (wasLyricsChordsActive) {
            console.log('[DEBUG-RESET] Lyrics & Chords panel was active before reset - attempting to reactivate');
            
            setTimeout(() => {
                const lyricsChordsBtn = document.querySelector('.ytp-lyrics-chords-button');
                console.log('[DEBUG-RESET] Lyrics & Chords button state after creation:', {
                    'button exists': !!lyricsChordsBtn,
                    'button classes': lyricsChordsBtn ? [...lyricsChordsBtn.classList] : 'none',
                    'lyricsChordsPanelActive global': window.lyricsChordsPanelActive
                });
                
                if (lyricsChordsBtn) {
                    console.log('[DEBUG-RESET] Attempting to click Lyrics & Chords button...');
                    
                    try {
                        lyricsChordsBtn.click();
                        console.log('[DEBUG-RESET] Lyrics & Chords click executed successfully');
                        
                        // בדיקה אחרי הלחיצה
                        setTimeout(() => {
                            console.log('[DEBUG-RESET] Lyrics & Chords state after click:', {
                                'has lyrics-chords-active class': lyricsChordsBtn.classList.contains('lyrics-chords-active'),
                                'lyricsChordsPanelActive global': window.lyricsChordsPanelActive,
                                'panel element exists': !!document.querySelector('#lyrics-chords-panel')
                            });
                            
                            if (!lyricsChordsBtn.classList.contains('lyrics-chords-active')) {
                                console.error('[DEBUG-RESET] ❌ Lyrics & Chords click did not activate - investigating...');
                                
                                console.log('[DEBUG-RESET] Lyrics & Chords deep investigation:', {
                                    'toggleLyricsAndChords function exists': typeof window.toggleLyricsAndChords,
                                    'createLyricsAndChordsButton exists': typeof window.createLyricsAndChordsButton,
                                    'openLyricsChordsPanel exists': typeof window.openLyricsChordsPanel
                                });
                            } else {
                                console.log('[DEBUG-RESET] ✅ Lyrics & Chords panel activated successfully!');
                            }
                        }, 200);
                        
                    } catch (error) {
                        console.error('[DEBUG-RESET] ❌ Error clicking Lyrics & Chords button:', error);
                    }
                } else {
                    console.error('[DEBUG-RESET] ❌ Lyrics & Chords button not found!');
                }
            }, 700); // זמן נוסף אחרי הכתוביות
        } else {
            console.log('[DEBUG-RESET] Lyrics & Chords panel was not active before reset - staying inactive');
        }

        // 7. Update all UI components with default settings
        console.log('[ResetToDefault] Updating UI components...');
        const updatePromises = [
            window.changeSubtitleSize?.(window.DEFAULT_SETTINGS.subtitleSize),
            window.updateSelectedColor?.(window.DEFAULT_SETTINGS.subtitleColor),
            window.updateFontOpacity?.(window.DEFAULT_SETTINGS.subtitleFontOpacity),
            window.updateHighlightBackgroundEnabled?.(window.DEFAULT_SETTINGS.subtitleHighlightBackgroundEnabled),
            window.updateHighlightColor?.(window.DEFAULT_SETTINGS.subtitleHighlightColor),
            window.updateWordHighlightTextColor?.(window.DEFAULT_SETTINGS.subtitleWordHighlightTextColor),
            window.updateHighlightOpacity?.(window.DEFAULT_SETTINGS.subtitleHighlightOpacity),
            window.updateBackgroundColor?.(window.DEFAULT_SETTINGS.subtitleBackgroundColor),
            window.updateBackgroundOpacity?.(window.DEFAULT_SETTINGS.subtitleBackgroundOpacity)
        ];

        await Promise.all(updatePromises.filter(Boolean));

        // 7. Update subtitle mode UI buttons
        const menuButtons = document.querySelectorAll('.subtitle-mode-lyrics-button, .subtitle-mode-subtitle-button');
        menuButtons.forEach(button => {
            const isLyrics = button.classList.contains('subtitle-mode-lyrics-button');
            const isEnabled = isLyrics ? window.DEFAULT_SETTINGS.subtitleLyricsMode : window.DEFAULT_SETTINGS.subtitleSubtitleMode;
            const toggle = button.querySelector('.subtitle-mode-toggle');
            const status = button.querySelector('.subtitle-mode-status');
            const toggleButton = toggle?.querySelector('div');
            
            if (toggle) {
                toggle.style.backgroundColor = isEnabled ? '#3ea6ff' : '#666';
            }
            if (toggleButton) {
                toggleButton.style.transform = `translateX(${isEnabled ? '20px' : '0'})`;
            }
            if (status) {
                status.textContent = isEnabled ? 'ON' : 'OFF';
                status.style.color = isEnabled ? '#3ea6ff' : '#666';
            }
        });

        // 7.5. Update Word Highlight UI buttons
        const highlightButtons = document.querySelectorAll('.lyrics-highlight-toggle, .chords-highlight-toggle, .sentence-highlight-toggle');
        highlightButtons.forEach(toggleButton => {
            const isLyrics = toggleButton.classList.contains('lyrics-highlight-toggle');
            const isEnabled = true; // שניהם ON אחרי reset
            const toggle = toggleButton.closest('.settings-item')?.querySelector('div[style*="width: 40px"]');
            const status = toggleButton.closest('.settings-item')?.querySelector('.lyrics-highlight-status, .chords-highlight-status, .sentence-highlight-status');
            const button = toggle?.querySelector('div[style*="width: 16px"]');
            
            if (toggle) {
                toggle.style.backgroundColor = '#3ea6ff';
            }
            if (button) {
                button.style.transform = 'translateX(20px)';
            }
            if (status) {
                status.textContent = 'ON';
                status.style.color = '#3ea6ff';
            }
        });

        // 7.6. Reset Past Words settings
        if (!pastWordsSettingsReset && typeof window.resetLyricsChordsPastWordsSettings === 'function') {
            window.resetLyricsChordsPastWordsSettings();
            console.log('[ResetToDefault] Past Words settings reset');
        }
        
        // 7.7. Update Past Words UI if submenu is visible
        const pastWordsToggle = document.querySelector('.past-words-toggle');
        if (pastWordsToggle) {
            localStorage.setItem('yc_lyrics_chords_past_words_enabled', 'true');
            window.lyricsChordsPastWordsEnabled = true;
            pastWordsToggle.style.backgroundColor = '#3ea6ff';

            const toggleBtn = pastWordsToggle.querySelector('div');
            if (toggleBtn) toggleBtn.style.transform = 'translateX(20px)';

            const status = pastWordsToggle.parentElement?.querySelector('span');
            if (status) {
                status.textContent = 'ON';
                status.style.color = '#3ea6ff';
            }

            const colorRow = document.querySelector('.past-words-color-row');
            if (colorRow) {
                colorRow.style.cursor = 'default';
                colorRow.style.opacity = '1';
                colorRow.querySelectorAll('*').forEach((child) => {
                    child.style.cursor = '';
                });
            }

            const colorInput = document.querySelector('.past-words-color-row input[type="color"]');
            if (colorInput) {
                colorInput.disabled = false;
                colorInput.style.cursor = 'pointer';
                colorInput.style.opacity = '1';
            }

            const colorResetBtn = document.querySelector('.past-words-color-row [title="Reset to Default"]');
            if (colorResetBtn) {
                colorResetBtn.style.cursor = 'pointer';
                colorResetBtn.style.opacity = '1';
                colorResetBtn.style.pointerEvents = 'auto';
            }

            console.log('[ResetToDefault] Past Words toggle UI updated to ON');
        }
        
        // 7.8. Reset Color Picker value to default pink
        const pastWordsColorInput = document.querySelector('.past-words-color-row input[type="color"]');
        if (pastWordsColorInput) {
            pastWordsColorInput.value = '#e91e63'; // ורוד - ברירת מחדל
            console.log('[ResetToDefault] Past Words color reset to default');
        }

        // 8. Force subtitle refresh if needed
        if (window.updateSubtitles) {
            window.updateSubtitles();
        }

        // 9. Restore video state
        if (video) {
            video.currentTime = currentTime;
            if (wasPlaying) video.play();
        }

        /*──────────────────────────────────────
          9.5  Update Buttons Display submenu UI if open
        ──────────────────────────────────────*/
        const buttonsDisplaySubmenu = document.querySelector('.buttons-display-submenu');
        if (buttonsDisplaySubmenu) {
            console.log('[ResetToDefault] Buttons Display submenu is open - updating toggles to ON');
            // עדכון כל ה-toggles בתפריט ל-ON
            const toggles = buttonsDisplaySubmenu.querySelectorAll('[data-enabled]');
            toggles.forEach(toggle => {
                toggle.setAttribute('data-enabled', 'true');
                toggle.style.backgroundColor = '#3ea6ff';
                const toggleButton = toggle.querySelector('div');
                if (toggleButton) {
                    toggleButton.style.transform = 'translateX(20px)';
                }
                const status = toggle.parentElement?.querySelector('span');
                if (status) {
                    status.textContent = 'ON';
                    status.style.color = '#3ea6ff';
                }
            });
            console.log('[ResetToDefault] ✅ Buttons Display toggles updated to ON');
        }

        /*──────────────────────────────────────
          9.6  FORCE-CLOSE all YouChords menus & sub-menus
        ──────────────────────────────────────*/
        if (typeof window.closeAllMenus === 'function') {
            window.closeAllMenus();        // הדרך הנקייה – משתמשת בלוגיקה קיימת
        } else if (typeof window.disposeMenu === 'function') {
            /* פול-בק: ננסה לחסל תפריט-שורש אם נשאר */
            window.disposeMenu('settings');
            document.querySelectorAll('.yc[data-yc-menu]')
                    .forEach(el => el.style.display = 'none');
        }

        // 10. Show success message to user
        const successMessage = document.createElement('div');
        successMessage.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            z-index: 9999;
            font-family: 'YouTube Noto', Roboto, Arial, sans-serif;
            font-size: 14px;
            transition: opacity 0.3s ease;
        `;
        successMessage.textContent = 'Settings reset successfully';
        document.body.appendChild(successMessage);
        
        // Remove message after 3 seconds
        setTimeout(() => {
            successMessage.style.opacity = '0';
            setTimeout(() => {
                if (document.body.contains(successMessage)) {
                    document.body.removeChild(successMessage);
                }
            }, 300);
        }, 3000);
        
        // אילוץ garbage collection אם זמין
        if (window.gc) {
            try {
                window.gc();
                console.log('[ResetToDefault] Manual garbage collection triggered');
            } catch(e) { /* ignore */ }
        }
        
        // בדיקת זיכרון אחרי איפוס
        if (performance.memory) {
            const memUsed = Math.round(performance.memory.usedJSHeapSize / 1e6);
            console.log(`[ResetToDefault] Memory usage after reset: ${memUsed} MB`);
        }

        /*───────────────────────────────────────────────────────────
          איפוס Tuner Settings (Hz, Tuning, Transpose, Pitch, Speed)
        ───────────────────────────────────────────────────────────*/
        if (window.resetAllTunerSettings && typeof window.resetAllTunerSettings === 'function') {
            try {
                window.resetAllTunerSettings();
                console.log('[ResetToDefault] ✅ Tuner Settings reset completed successfully');
            } catch (error) {
                console.warn('[ResetToDefault] ⚠️ Tuner Settings reset failed:', error);
            }
        } else if (window.resetVideoPlayback && typeof window.resetVideoPlayback === 'function') {
            // Fallback to video playback only if full reset not available
            try {
                window.resetVideoPlayback();
                console.log('[ResetToDefault] ✅ Video Playback reset completed successfully');
            } catch (error) {
                console.warn('[ResetToDefault] ⚠️ Video Playback reset failed:', error);
            }
        } else {
            console.log('[ResetToDefault] ℹ️ resetAllTunerSettings not available (tuner not loaded)');
        }

        console.log('[ResetToDefault] Reset completed successfully');
    } catch (error) {
        console.error('[ResetToDefault] Reset failed:', error);

        /* ודאו שגם במקרה כשלון – לא נשארים תפריטים פתוחים */
        if (window.closeAllMenus) window.closeAllMenus();
        
        // Show error message to user
        const errorMessage = document.createElement('div');
        errorMessage.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(255, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            z-index: 9999;
            font-family: 'YouTube Noto', Roboto, Arial, sans-serif;
            font-size: 14px;
            transition: opacity 0.3s ease;
        `;
        errorMessage.textContent = 'Reset failed: ' + (error.message || 'Unknown error');
        document.body.appendChild(errorMessage);
        
        // Remove message after 5 seconds
        setTimeout(() => {
            errorMessage.style.opacity = '0';
            setTimeout(() => {
                if (document.body.contains(errorMessage)) {
                    document.body.removeChild(errorMessage);
                }
            }, 300);
        }, 5000);
    }
};


// Show reset confirmation dialog
window.showResetConfirmation = function() {
    // Remove existing overlay if any
    const existingOverlay = document.querySelector(".yc-confirm-overlay");
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement('div');
    overlay.className = "yc-confirm-overlay";
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.7);
        z-index: 2147483648;
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
        <h3 style="margin: 0 0 16px; font-size: 16px;">Reset All Settings?</h3>
        <p style="margin: 0 0 20px; font-size: 13px; color: #aaa;">
            This will reset all settings to their default values. This action cannot be undone.
        </p>
        <div style="display: flex; gap: 12px; justify-content: center;">
            <button id="yc-cancel-reset-all" style="
                padding: 8px 20px;
                background: #444;
                color: #fff;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
            ">Cancel</button>
            <button id="yc-confirm-reset-all" style="
                padding: 8px 20px;
                background: #ff3860;
                color: #fff;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
            ">Reset All</button>
        </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const cancelBtn = dialog.querySelector("#yc-cancel-reset-all");
    const confirmBtn = dialog.querySelector("#yc-confirm-reset-all");

    const cleanup = () => {
        cancelBtn.removeEventListener("click", handleCancel);
        confirmBtn.removeEventListener("click", handleConfirm);
        overlay.removeEventListener("click", handleOverlayClick);
        overlay.remove();
    };

    const handleCancel = () => cleanup();
    const handleOverlayClick = (e) => {
        if (e.target === overlay) cleanup();
    };
    const handleConfirm = async () => {
        confirmBtn.textContent = "Resetting...";
        confirmBtn.disabled = true;

        try {
            await window.resetToDefault();
            dialog.innerHTML = `
                <p style="margin: 0; font-size: 14px; color: #4CAF50;">✓ All settings reset successfully</p>
            `;
            setTimeout(cleanup, 1500);
        } catch (error) {
            dialog.innerHTML = `
                <p style="margin: 0; font-size: 14px; color: #ff3860;">✗ Failed to reset settings</p>
            `;
            setTimeout(cleanup, 2000);
        }
    };

    cancelBtn.addEventListener("click", handleCancel);
    overlay.addEventListener("click", handleOverlayClick);
    confirmBtn.addEventListener("click", handleConfirm);
};

// Add reset option to settings menu
window.addResetOption = function(settingsMenu) {
    const resetOption = document.createElement('div');
    resetOption.className = 'settings-item';
    resetOption.style.cssText = `
        padding: 12px 24px;
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        user-select: none;
        -webkit-user-select: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        margin-bottom: 8px;
    `;

    const resetText = document.createElement('span');
    resetText.textContent = 'Reset All to Default';
    resetText.style.color = '#ff3860';  // Warning red color

    resetOption.appendChild(resetText);

    resetOption.addEventListener('mouseover', () => {
        resetOption.style.backgroundColor = 'rgba(255,255,255,0.1)';
    });

    resetOption.addEventListener('mouseout', () => {
        resetOption.style.backgroundColor = 'transparent';
    });

    resetOption.addEventListener('click', () => {
        window.showResetConfirmation();
    });

    settingsMenu.appendChild(resetOption);
};
