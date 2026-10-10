// chordsAdjustment.js
window.createChordsAdjustmentSlider = function(contentExists = true) {
    // Get the base slider components
    const { container, slider } = window.createBaseSlider('chords');

    // קבלת הערך הנוכחי מה-DB, אם קיים
    const getCurrentOffset = () => {
        // לעתיד: כשחלק האקורדים יהיה מוכן, נשנה לפנות למצב האקורדים
        return 0; // ברירת מחדל היא 0
    };

    // עדכון הסליידר כשהוא נטען, לפי הערך הקיים
    const initOffset = getCurrentOffset();
    slider.value = initOffset;

    // Add chords-specific behavior
    slider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        
        // הכנה לעתיד: כאשר יש מצב אקורדים, נעדכן אותו
        // if (window.chordsState) {
        //     window.chordsState.timing_offset = value;
        // }
        
        // שמירת הערך ב-IndexedDB רק אם יש אקורדים
        const currentVideoId = window.extractVideoId ? window.extractVideoId(location.href) : null;
        if (currentVideoId && window.databaseManager && contentExists) {
            window.databaseManager.updateTimingOffset('chords', currentVideoId, value);
        } else if (!contentExists) {
            console.log(`[DEBUG] Not saving timing offset: No chords available for this video`);
        }
        
        // הכנה לעתיד: כאשר נצטרך לעדכן תצוגת אקורדים
        // if (window.updateChords) {
        //     window.updateChords();
        // }
    });

    return container;
};
