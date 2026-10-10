// subtitleAdjustment.js
window.createSubtitleAdjustmentSlider = function(contentExists = true) {
    // Get the base slider components
    const { container, slider } = window.createBaseSlider('subtitle');

    // קבלת הערך הנוכחי מהמצב, אם קיים
    const getCurrentOffset = () => {
        const offset = window.subtitleState ? window.subtitleState.timing_offset || 0 : 0;
        console.log(`[DEBUG] getCurrentOffset() returning: ${offset}s`);
        return offset;
    };

    // עדכון הסליידר כשהוא נטען, לפי הערך הקיים
    const initOffset = getCurrentOffset();
    console.log(`[DEBUG] Initial slider value set to: ${initOffset}s`);
    slider.value = initOffset;

    // טעינת ערך ה-timing offset מהמסד נתונים מיד בעת יצירת הסליידר
    const currentVideoId = window.extractVideoId ? window.extractVideoId(location.href) : null;
    if (currentVideoId && window.databaseManager && contentExists) {
        console.log(`[DEBUG] Loading timing offset on slider creation for video ${currentVideoId}`);
        window.databaseManager.getTimingOffset('subtitles', currentVideoId)
            .then(offset => {
                console.log(`[DEBUG] Loaded timing offset on slider creation: ${offset}s`);
                slider.value = offset;
                
                // עדכון ערך התזמון במצב הכתוביות
                if (window.subtitleState) {
                    window.subtitleState.timing_offset = offset;
                    console.log(`[DEBUG] Updated subtitleState.timing_offset to: ${offset}s on slider creation`);
                    
                    // עדכון תצוגת הכתוביות
                    if (window.updateSubtitles) {
                        console.log(`[DEBUG] Calling updateSubtitles() after loading from DB on slider creation`);
                        window.updateSubtitles();
                    }
                }
            })
            .catch(error => {
                console.error(`[DEBUG] Error loading timing offset on slider creation:`, error);
            });
    }

    // Add subtitle-specific behavior
    slider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        console.log(`[DEBUG] Slider changed to: ${value}s`);
        
        // עדכון ערך התזמון במצב הכתוביות
        if (window.subtitleState) {
            window.subtitleState.timing_offset = value;
            console.log(`[DEBUG] Updated subtitleState.timing_offset to: ${value}s`);
        } else {
            console.log(`[DEBUG] Cannot update timing_offset: subtitleState is undefined`);
        }
        
        // שמירת הערך ב-IndexedDB רק אם יש כתוביות
        const currentVideoId = window.extractVideoId ? window.extractVideoId(location.href) : null;
        if (currentVideoId && window.databaseManager && contentExists) {
            console.log(`[DEBUG] Saving timing offset ${value}s for video ${currentVideoId} to IndexedDB`);
            window.databaseManager.updateTimingOffset('subtitles', currentVideoId, value);
        } else {
            if (!contentExists) {
                console.log(`[DEBUG] Not saving timing offset: No subtitles available for this video`);
            } else {
                console.log(`[DEBUG] Cannot save timing offset: ${!currentVideoId ? 'videoId missing' : 'databaseManager missing'}`);
            }
        }
        
        // עדכון תצוגת הכתוביות
        if (window.updateSubtitles) {
            console.log(`[DEBUG] Calling updateSubtitles() to refresh subtitle display`);
            window.updateSubtitles();
        } else {
            console.log(`[DEBUG] Cannot update subtitles: updateSubtitles function is undefined`);
        }
    });

    // הוספת אירוע טעינה - לטעינת הערך מחדש בעת הצגת הסליידר
    const loadCurrentOffset = () => {
        const currentVideoId = window.extractVideoId ? window.extractVideoId(location.href) : null;
        if (currentVideoId && window.databaseManager && contentExists) {
            console.log(`[DEBUG] Loading current timing offset for video ${currentVideoId} from IndexedDB`);
            window.databaseManager.getTimingOffset('subtitles', currentVideoId)
                .then(offset => {
                    console.log(`[DEBUG] Loaded timing offset from DB: ${offset}s`);
                    slider.value = offset;
                    
                    // עדכון ערך התזמון במצב הכתוביות
                    if (window.subtitleState) {
                        window.subtitleState.timing_offset = offset;
                        console.log(`[DEBUG] Updated subtitleState.timing_offset to: ${offset}s from DB`);
                        
                        // עדכון תצוגת הכתוביות
                        if (window.updateSubtitles) {
                            console.log(`[DEBUG] Calling updateSubtitles() after loading from DB`);
                            window.updateSubtitles();
                        }
                    }
                })
                .catch(error => {
                    console.error(`[DEBUG] Error loading timing offset:`, error);
                });
        }
    };
    
    // טעינת הערך הנוכחי בעת הצגת הסליידר
    container.addEventListener('mouseenter', loadCurrentOffset);

    return container;
};
