/**
 * getLocalDuration – ניסיון לשאוב את אורך הסרטון בלי רשת
 * -------------------------------------------------------
 * ➊ מנסה קודם video.duration מהאלמנט <video>.
 * ➋ אם אין (0 / Infinity) – מנסה מה-JSON ש-YouTube עצמו מזריק לדף
 *    window.ytInitialPlayerResponse.videoDetails.lengthSeconds
 * ➌ מחזירה את התוצאה המחושבת בלבד (ללא שימוש בקאש).
 *
 * @param {string} videoId  – מזהה יוטיוב
 * @param {number} [retryMs] – כמה זמן (ב-ms) לחכות שה-<video> יתעדכן לפני ויתור (ברירת-מחדל 500)
 * @returns {Promise<number|null>}  – מספר שניות או null אם אי-אפשר מקומית
 */
export async function getLocalDuration(videoId, retryMs = 500) {
  // 1. ניסיון ראשון – אלמנט הווידאו (הכי זול ומהיר)
  const videoEl = document.querySelector('video');
  if (videoEl && isFinite(videoEl.duration) && videoEl.duration > 0) {
    const seconds = Math.round(videoEl.duration);
    return seconds;
  }

  // 2. לפעמים duration מתעדכן שנייה אחרי  loadstart  ➜ נחכה קצת ונבדוק שוב
  await new Promise(r => setTimeout(r, retryMs));
  if (videoEl && isFinite(videoEl.duration) && videoEl.duration > 0) {
    const seconds = Math.round(videoEl.duration);
    return seconds;
  }

  // 3. ניסיון אחרון – JSON גלובלי ש-YouTube כבר שם (אין רשת, רק parse)
  const secondsFromJson =
    window.ytInitialPlayerResponse?.videoDetails?.lengthSeconds
      ? Number(window.ytInitialPlayerResponse.videoDetails.lengthSeconds)
      : null;

  if (secondsFromJson) {
    return secondsFromJson;
  }

  // 4. שום מקור מקומי לא סיפק תשובה  ➜ נחזיר null (הכפתור יחליט אם לקרוא ל-API)
  return null;
}

/**
 * fetchWithTimeout - מבצע fetch עם הגבלת זמן
 * @param {string} url - הכתובת לשליפה
 * @param {number} timeout - זמן מקסימלי במילישניות
 * @param {Object} options - אפשרויות נוספות ל-fetch
 * @returns {Promise} - תוצאת ה-fetch
 */
export async function fetchWithTimeout(url, timeout = 7000, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}
