/*==============================================================
  YouChords – utils/countdownManager.js
  --------------------------------------------------------------
  • מנהל ספירה לאחור לפני קטעי INTRO ו-INSTRUMENTAL
  • תומך Chrome 112+ (Manifest v3, ES Modules)
  • מודולרי ונפרד מהקוד הראשי
  • עדכון כל 100ms לספירה חלקה
==============================================================*/

/**
 * CountdownManager - מנהל ראשי של הספירה לאחור
 */
class CountdownManager {
  constructor() {
    this.sections = []; // רשימת קטעי INTRO/INSTRUMENTAL
    this.currentCountdown = null; // הספירה הנוכחית
    this.updateInterval = null; // interval לעדכון הספירה
    this.initTimeout = null; // timeout לאתחול - למניעת race condition
    this.isActive = false; // האם המנהל פעיל
    this.panelElement = null; // אלמנט הפאנל
    this.videoElement = null; // אלמנט הווידאו
    
    console.log('[CountdownManager] אתחול מנהל ספירה');
  }

  /**
   * אתחול המנהל
   * @param {HTMLElement} panelElement - אלמנט הפאנל
   * @param {HTMLVideoElement} videoElement - אלמנט הווידאו
   */
  initialize(panelElement, videoElement) {
    console.log('[CountdownManager] התחלת אתחול');
    
    if (!panelElement || !videoElement) {
      console.error('[CountdownManager] חסרים אלמנטים נדרשים');
      return false;
    }

    this.panelElement = panelElement;
    this.videoElement = videoElement;
    
    // המתנה קצרה לטעינת התוכן ואז זיהוי קטעים
    // שמירת ה-timeout למניעת race condition עם cleanup
    this.initTimeout = setTimeout(() => {
      // בדיקה שהמנהל עדיין פעיל (לא עבר cleanup)
      if (!this.isActive || !this.panelElement) {
        console.log('[CountdownManager] ⚠️ המנהל נוקה לפני סיום האתחול - מדלג');
        return;
      }
      
      this.detectSections();
      
      // התחלת לולאת עדכון רק אם נמצאו קטעים
      if (this.sections.length > 0) {
        this.startUpdateLoop();
        console.log('[CountdownManager] ✅ אתחול הושלם - נמצאו קטעים');
      } else {
        console.log('[CountdownManager] ⚠️ לא נמצאו קטעי INTRO/INSTRUMENTAL');
      }
    }, 500); // המתנה של 500ms לטעינת התוכן
    
    this.isActive = true;
    return true;
  }

  /**
   * זיהוי קטעי INTRO ו-INSTRUMENTAL בפאנל
   */
  detectSections() {
    console.log('[CountdownManager] מתחיל זיהוי קטעים');
    
    if (!this.panelElement) {
      console.warn('[CountdownManager] אין אלמנט פאנל לזיהוי');
      return;
    }

    this.sections = [];
    
    // חיפוש כל אלמנטי .instrumental-label
    const instrumentalLabels = this.panelElement.querySelectorAll('.instrumental-label');
    console.log(`[CountdownManager] נמצאו ${instrumentalLabels.length} אלמנטי .instrumental-label`);
    
    instrumentalLabels.forEach((element, index) => {
      const text = element.textContent.trim();
      
      // זיהוי INTRO
      if (text.match(/\[intro\]/i)) {
        const section = this.createSection('INTRO', element);
        if (section) {
          this.sections.push(section);
          console.log('[CountdownManager] ✅ נמצא INTRO:', section);
        }
      }
      
      // זיהוי INSTRUMENTAL
      else if (text.match(/\[instrumental\]/i)) {
        const section = this.createSection('INSTRUMENTAL', element);
        if (section) {
          this.sections.push(section);
          console.log('[CountdownManager] ✅ נמצא INSTRUMENTAL:', section);
        }
      }
    });
    
    console.log(`[CountdownManager] סה"כ נמצאו ${this.sections.length} קטעים מתאימים`);
  }

  /**
   * יצירת אובייקט קטע
   * @param {string} type - סוג הקטע (INTRO/INSTRUMENTAL)
   * @param {HTMLElement} element - אלמנט הקטע
   * @returns {Object|null} אובייקט הקטע או null
   */
  createSection(type, element) {
    // קבלת זמנים מ-data attributes
    const startTime = parseFloat(element.dataset.start || element.getAttribute('data-start'));
    const endTime = parseFloat(element.dataset.end || element.getAttribute('data-end'));
    
    if (isNaN(startTime) || isNaN(endTime)) {
      console.warn(`[CountdownManager] לא ניתן לקבל זמנים עבור ${type}`);
      return null;
    }
    
    const duration = endTime - startTime;
    
    if (duration < 3) {
      console.warn(`[CountdownManager] ${type} קצר מדי (${duration}s) - מדלג`);
      return null;
    }
    
    return {
      type,
      element,
      startTime,
      endTime,
      duration
    };
  }

  /**
   * התחלת לולאת עדכון (כל 100ms)
   */
  startUpdateLoop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    this.updateInterval = setInterval(() => {
      this.update();
    }, 100); // עדכון כל 100ms
    
    console.log('[CountdownManager] לולאת עדכון התחילה');
  }

  /**
   * עדכון מצב הספירה (נקרא כל 100ms)
   */
  update() {
    if (!this.isActive || !this.videoElement) {
      return;
    }

    // בדיקת תנאי הצגה
    if (!this.shouldShowCountdown()) {
      this.hideCountdown();
      return;
    }

    const currentTime = this.videoElement.currentTime;
    const isPaused = this.videoElement.paused;
    
    // מציאת הקטע הרלוונטי
    const activeSection = this.findActiveSection(currentTime);
    
    if (!activeSection) {
      this.hideCountdown();
      return;
    }

    // חישוב משך הספירה המתאים
    const countdownDuration = this.calculateCountdownDuration(activeSection);
    
    if (countdownDuration === 0) {
      this.hideCountdown();
      return;
    }

    // חישוב הזמן הנותר עד סוף הקטע
    const timeUntilEnd = activeSection.endTime - currentTime;
    
    // קביעת מצב הספירה (אפור או כחול)
    const isInactive = timeUntilEnd > countdownDuration;
    const isActive = timeUntilEnd <= countdownDuration && timeUntilEnd > 0;
    
    if (isInactive) {
      // מצב אפור - המתנה
      this.showInactiveCountdown(activeSection, countdownDuration);
    } else if (isActive && !isPaused) {
      // מצב כחול - ספירה פעילה
      this.showActiveCountdown(activeSection, timeUntilEnd);
    } else if (isActive && isPaused) {
      // מושהה - שומר על הספירה אבל לא ממשיך
      this.pauseCountdown();
    } else {
      // הספירה הסתיימה
      this.hideCountdown();
    }
  }

  /**
   * בדיקה האם צריך להציג ספירה
   * @returns {boolean}
   */
  shouldShowCountdown() {
    // בדיקת משתנים גלובליים
    // אם המשתנה לא מוגדר, ברירת מחדל היא true
    const countdownActive = typeof window.countdownActive !== 'undefined' 
      ? window.countdownActive 
      : true;
    const chordsToggleActive = window.chordsToggleActive === true;
    
    // אם Chords Toggle פעיל, אין ספירה
    if (chordsToggleActive) {
      return false;
    }
    
    // אם Countdown Toggle כבוי, אין ספירה
    if (!countdownActive) {
      return false;
    }
    
    // אם אין קטעים, אין ספירה
    if (this.sections.length === 0) {
      return false;
    }
    
    return true;
  }

  /**
   * מציאת הקטע הפעיל לפי זמן נוכחי
   * @param {number} currentTime - זמן נוכחי בווידאו
   * @returns {Object|null} הקטע הפעיל או null
   */
  findActiveSection(currentTime) {
    for (const section of this.sections) {
      if (currentTime >= section.startTime && currentTime < section.endTime) {
        return section;
      }
    }
    return null;
  }

  /**
   * חישוב משך הספירה המתאים לקטע
   * @param {Object} section - הקטע
   * @returns {number} משך הספירה בשניות (0 אם לא מתאים)
   */
  calculateCountdownDuration(section) {
    // Fixed target: up to 10 seconds (auto-clamped for shorter sections)
    const requestedDuration = 10;
    
    // חישוב חכם - התאמה לזמן הזמין
    const sectionDuration = section.duration;
    
    if (sectionDuration < 3) {
      // קטע קצר מדי
      return 0;
    } else if (sectionDuration >= 3 && sectionDuration < 5) {
      // רק 3 שניות זמינות
      return 3;
    } else if (sectionDuration >= 5 && sectionDuration < 10) {
      // רק 5 שניות זמינות
      return Math.min(requestedDuration, 5);
    } else {
      // יש מספיק זמן - משתמש בבחירה
      return requestedDuration;
    }
  }

  /**
   * הצגת ספירה במצב לא פעיל (אפור)
   * @param {Object} section - הקטע
   * @param {number} duration - משך הספירה
   */
  showInactiveCountdown(section, duration) {
    if (!this.currentCountdown || this.currentCountdown.section !== section) {
      // יצירת ספירה חדשה
      this.currentCountdown = {
        section,
        duration,
        element: this.createCountdownElement(section, duration, false)
      };
    }
    
    // עדכון המספר והצבע
    if (this.currentCountdown.element) {
      this.currentCountdown.element.textContent = duration;
      this.currentCountdown.element.classList.remove('active');
      this.currentCountdown.element.classList.add('inactive');
    }
  }

  /**
   * הצגת ספירה במצב פעיל (כחול)
   * @param {Object} section - הקטע
   * @param {number} timeRemaining - זמן נותר
   */
  showActiveCountdown(section, timeRemaining) {
    const displayNumber = Math.ceil(timeRemaining);
    
    if (!this.currentCountdown || this.currentCountdown.section !== section) {
      // יצירת ספירה חדשה
      const duration = this.calculateCountdownDuration(section);
      this.currentCountdown = {
        section,
        duration,
        element: this.createCountdownElement(section, duration, true)
      };
    }
    
    // עדכון המספר והצבע
    if (this.currentCountdown.element) {
      this.currentCountdown.element.textContent = displayNumber;
      this.currentCountdown.element.classList.remove('inactive');
      this.currentCountdown.element.classList.add('active');
    }
  }

  /**
   * השהיית ספירה (כשהווידאו מושהה)
   */
  pauseCountdown() {
    // הספירה נשארת גלויה אבל לא מתעדכנת
  }

  /**
   * הסתרת ספירה
   */
  hideCountdown() {
    if (this.currentCountdown && this.currentCountdown.element) {
      this.currentCountdown.element.remove();
      this.currentCountdown = null;
    }
  }

  /**
   * יצירת אלמנט ספירה - inline אחרי ה-[Intro]
   * @param {Object} section - הקטע
   * @param {number} duration - משך הספירה
   * @param {boolean} isActive - האם במצב פעיל
   * @returns {HTMLElement} אלמנט הספירה
   */
  createCountdownElement(section, duration, isActive) {
    const countdownEl = document.createElement('span');
    countdownEl.className = 'countdown-number';
    countdownEl.textContent = duration;
    
    if (isActive) {
      countdownEl.classList.add('active');
    } else {
      countdownEl.classList.add('inactive');
    }
    
    // הוספת המספר מיד אחרי ה-[Intro] באותו parent
    if (section.element && section.element.parentNode) {
      console.log('[CountdownManager] מוסיף מספר אחרי [Intro]');
      section.element.parentNode.insertBefore(
        countdownEl,
        section.element.nextSibling
      );
      console.log('[CountdownManager] ✅ מספר נוצר והתווסף');
    } else {
      console.warn('[CountdownManager] חסר section.element או parentNode');
    }
    
    return countdownEl;
  }

  /**
   * עצירת המנהל וניקוי משאבים
   */
  cleanup() {
    console.log('[CountdownManager] מתחיל ניקוי');
    
    // ביטול timeout האתחול - מניעת race condition
    if (this.initTimeout) {
      clearTimeout(this.initTimeout);
      this.initTimeout = null;
    }
    
    // עצירת לולאת עדכון
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    // הסרת ספירה נוכחית
    this.hideCountdown();
    
    // ניקוי משתנים - מניעת דליפות זיכרון
    this.sections = [];
    this.currentCountdown = null;
    this.panelElement = null;
    this.videoElement = null;
    this.isActive = false;
    
    console.log('[CountdownManager] ✅ ניקוי הושלם - אין דליפות זיכרון');
  }
}

// חשיפה גלובלית
window.CountdownManager = CountdownManager;

console.log('[CountdownManager] מודול נטען בהצלחה');
