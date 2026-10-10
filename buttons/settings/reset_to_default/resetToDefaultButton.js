/**
 * רכיב כפתור "RESET ALL TO DEFAULT" בהגדרות התזמון
 * מאפשר איפוס הגדרות התזמון של הכתוביות והאקורדים לערכי ברירת המחדל (0)
 */

function createResetToDefaultButton() {
  // קבלת ה-videoId הנוכחי
  const currentVideoId = window.extractVideoId ? window.extractVideoId(location.href) : null;
  
  // יצירת הכפתור
  const resetButton = document.createElement('button');
  resetButton.className = 'reset-to-default-button';
  resetButton.textContent = 'RESET ALL TO DEFAULT';
  resetButton.style.cssText = `
    background-color: #cc0000;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 6px 12px;
    margin-top: 10px;
    cursor: pointer;
    font-weight: bold;
    font-size: 12px;
    text-align: center;
    width: 180px;
    display: block;
  `;
  
  // הוספת אפקט hover
  resetButton.addEventListener('mouseenter', () => {
    resetButton.style.backgroundColor = '#ff0000';
  });
  
  resetButton.addEventListener('mouseleave', () => {
    resetButton.style.backgroundColor = '#cc0000';
  });
  
  // הוספת הפונקציונליות לכפתור האיפוס
  resetButton.addEventListener('click', async () => {
    if (!currentVideoId) {
      console.error('Cannot reset timing settings: Video ID not found');
      return;
    }
    
    // בדיקה אם יש כתוביות או אקורדים לסרטון
    const hasSubtitles = await window.videoValidator.checkSubtitlesInIndexedDB(currentVideoId);
    const hasChords = await window.videoValidator.checkChordsInIndexedDB(currentVideoId);
    
    // מראה אנימציה של טעינה בכפתור
    const originalText = resetButton.textContent;
    resetButton.textContent = 'RESETTING...';
    resetButton.disabled = true;
    resetButton.style.opacity = '0.7';
    
    try {
      // איפוס הסליידרים לערך 0 בכל מקרה
      const updateSlider = (sliderClass) => {
        try {
          // חיפוש הסליידר בדף
          const slider = document.querySelector(`.${sliderClass}`);
          if (slider) {
            // עדכון ערך הסליידר ל-0
            slider.value = 0;
            console.log(`[DEBUG] Updated ${sliderClass} slider value to 0`);
            
            // הפעלת אירוע input כדי לוודא שכל המאזינים לסליידר יקבלו את השינוי
            const inputEvent = new Event('input', { bubbles: true });
            slider.dispatchEvent(inputEvent);
            
            return true;
          } else {
            console.log(`[DEBUG] ${sliderClass} slider not found in the page`);
            return false;
          }
        } catch (error) {
          console.error(`[DEBUG] Error updating ${sliderClass} slider:`, error);
          return false;
        }
      };
      
      // איפוס הסליידרים תמיד, גם אם אין תוכן
      updateSlider('subtitle-timing-slider');
      updateSlider('chords-timing-slider');
      
      // עדכון ערך ה-timing_offset במצב הכתוביות הנוכחי
      if (window.subtitleState) {
        window.subtitleState.timing_offset = 0;
        console.log(`[DEBUG] Reset timing offset to 0 for subtitleState`);
        
        // עדכון תצוגת הכתוביות אם קיימת
        if (window.updateSubtitles) {
          window.updateSubtitles();
          console.log(`[DEBUG] Called updateSubtitles after resetting timing offset`);
        }
      }
      
      // קריאה לפונקציה שמאפסת את הגדרות התזמון ב-DB רק אם יש תוכן
      let success = true;
      if (hasSubtitles || hasChords) {
        success = await window.databaseManager.resetTimingToDefault(currentVideoId);
        console.log(`[DEBUG] Reset timing in DB: ${success ? 'success' : 'failed'}`);
      } else {
        console.log(`[DEBUG] Skipped DB reset: No subtitles or chords available for this video`);
      }
      
      // הצגת הודעת הצלחה
      resetButton.textContent = 'RESET SUCCESSFUL!';
      resetButton.style.backgroundColor = '#4CAF50'; // ירוק
      
      // החזרת הכפתור למצב המקורי אחרי 800 מילישניות
      setTimeout(() => {
        resetButton.textContent = originalText;
        resetButton.disabled = false;
        resetButton.style.opacity = '1';
        resetButton.style.backgroundColor = '#cc0000';
      }, 800);
    } catch (error) {
      console.error('Error resetting timing settings:', error);
      
      // הצגת הודעת כישלון
      resetButton.textContent = 'RESET FAILED';
      resetButton.style.backgroundColor = '#f44336'; // אדום
      
      // החזרת הכפתור למצב המקורי אחרי 2 שניות
      setTimeout(() => {
        resetButton.textContent = originalText;
        resetButton.disabled = false;
        resetButton.style.opacity = '1';
        resetButton.style.backgroundColor = '#cc0000';
      }, 2000);
    }
  });
  
  return resetButton;
}

// ייצוא הפונקציה לשימוש חיצוני
window.createResetToDefaultButton = createResetToDefaultButton;
