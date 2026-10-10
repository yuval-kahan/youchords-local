/*==============================================================
  YouChords – buttons/chordsButton.js (גרסה ממוטבת)
  --------------------------------------------------------------
  • תומך Chrome 112+ (Manifest v3, ES Modules)
  • Zero-Reflow: צביעת כפתור ע״י מחלקת CSS, לא setAttribute
  • SVG נטען פעם אחת בלבד ונשמר ב-cache גלובלי
  • AbortController → לוחץ פעמיים? הקריאה הישנה מתבטלת
  • early-return בכל תרחיש שגיאה → קוד נקי ו-RAM נמוך
==============================================================*/

// שמירת הפונקציה הזמנית אם קיימת
const tempCreateChordsFunction = window.createChordsButton;

window.createChordsButton = function () {
  // אם יש כפתור זמני קיים, נחליף את התוכן שלו
  const existingButton = document.querySelector(".ytp-chords-button");
  if (existingButton && existingButton.getAttribute('data-temporary') === 'true') {
    console.log("[ChordsBtn] מחליף כפתור זמני בכפתור אמיתי");
    existingButton.removeAttribute('data-temporary');
    setupRealChordsButton(existingButton);
    return existingButton.parentElement;
  }
  
  /*------------------------------------------------------------
    0. יצירת אלמנט הכפתור + מחלקת CSS לצבע אדום
  ------------------------------------------------------------*/
  const container = document.createElement('div');
  container.className = 'custom-button-container';

  const button = document.createElement('button');
  button.className = 'ytp-button ytp-chords-button';        // מחלקה בסיסית
  button.title = 'Chords';
  
  setupRealChordsButton(button);
  container.appendChild(button);
  return container;
};

// סימון שזו הפונקציה האמיתית (לא זמנית)
window.createChordsButton.isTemporaryFunction = false;

function setupRealChordsButton(button) {
  // בדיקת מצב האקורדים הגלובלי כדי לקבוע את צבע הכפתור
  if (window.DEBUG) {
    console.log(`[ChordsBtn] יצירת כפתור חדש, chordsActive=${window.chordsActive}`);
  }

  // ── צבע אדום דרך CSS: נוסיף מחלקה .chords-active ← נכתב ב-styles.css
  //    button.chords-active .ytp-svg-fill { fill:#ff1a1a; }

  // מחלקת CSS לצבע אדום - דרושה לפני קריאות syncButtonWithGlobalState
  const COLOR_CLASS = 'chords-active';

  /*------------------------------------------------------------
    1. טעינת ה-SVG (פעם ראשונה בלבד)
  ------------------------------------------------------------*/
  if (!window.cachedChordsSVG) {                            // עדיין לא נטען
    fetch(chrome.runtime.getURL('images/chords/chords.svg'))
      .then(r => r.ok ? r.text() : Promise.reject(`fetch ${r.status}`))
      .then(svg => window.cachedChordsSVG = svg)
      .catch(err => {
        console.error('[ChordsBtn] SVG load failed:', err);
        window.cachedChordsSVG = '<svg></svg>';             // Fallback ריק
      })
      .finally(() => { 
        button.innerHTML = window.cachedChordsSVG; 
        // בדיקת מצב האקורדים הגלובלי אחרי טעינת ה-SVG
        syncButtonWithGlobalState();
      });
  } else {
    button.innerHTML = window.cachedChordsSVG;              // שימוש במטמון
    // בדיקת מצב האקורדים הגלובלי אחרי טעינת ה-SVG
    syncButtonWithGlobalState();
  }

  /*------------------------------------------------------------
    2. כלי עזר פנימיים
  ------------------------------------------------------------*/
  const overlay = (msg, ms = 5000) =>
    window.videoValidator?.showErrorOverlay(msg, ms);       // עטיפה אחידה
  let  currentCtrl = null;                                  // AbortController חיי-לחיצה
  
  /**
   * סנכרון מצב הכפתור עם המשתנה הגלובלי chordsActive
   * מבטיח שהכפתור יהיה אדום רק אם chordsActive === true
   */
  function syncButtonWithGlobalState() {
    // בדיקה אם המשתנה הגלובלי קיים
    const isGloballyActive = typeof window.chordsActive !== 'undefined' ? window.chordsActive : false;
    const hasActiveClass = button.classList.contains(COLOR_CLASS);
    
    if (window.DEBUG) {
      console.log(`[ChordsBtn] סנכרון כפתור: chordsActive=${isGloballyActive}, יש מחלקת צבע=${hasActiveClass}`);
    }
    
    // אם יש חוסר התאמה - נתקן
    if (isGloballyActive !== hasActiveClass) {
      if (isGloballyActive) {
        button.classList.add(COLOR_CLASS);
      } else {
        button.classList.remove(COLOR_CLASS);
      }
      if (window.DEBUG) {
        console.log(`[ChordsBtn] עדכון מצב כפתור ל-${isGloballyActive ? 'אדום' : 'לבן'}`);
      }
    } else {
      // אם המצב לא פעיל - נוודא שהכפתור לבן
      if (!isGloballyActive && hasActiveClass) {
        button.classList.remove(COLOR_CLASS);
        if (window.DEBUG) {
          console.log(`[ChordsBtn] אילוץ הסרת מצב אדום מהכפתור`);
        }
      }
    }
  }

  /*------------------------------------------------------------
    3. מאזין-לחיצה הוסר - toggleChords ב-content.js מנהל את הכל
       הסרת מאזין כפול למניעת race condition
  ------------------------------------------------------------*/
  /*
  המאזין הוסר כי הוא גורם לקונפליקט עם toggleChords ב-content.js
  עכשיו toggleChords מנהל את הכל - הפעלה, כיבוי, ושינוי צבע הכפתור
  */
}

/*==============================================================
  סוף הקובץ – כל שינוי לוגי מסומן בהערות # בעברית
==============================================================*/
