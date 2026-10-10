/**
 * Chord Renderer Module – YouChords (2025-05-full)
 * ------------------------------------------------
 * • יוצר דיאגרמות SVG לשמות אקורדים מתוך window.PANEL_SUBSET
 * • Memo-cache ברמת האקורד  →  ציור SVG מתבצע פעם אחת בלבד
 */

// הגנה מפני טעינה כפולה
if (window.chordRenderer && window.chordRenderer.renderChord) {
  console.warn("[ChordRenderer] already loaded");
  // לא מבצעים כלום - הקובץ כבר נטען בעבר
  // אין להשתמש ב-return ברמת המודול
} else {
  // טעינת הגדרת additionalFretNumbers מה-storage מיד בטעינת הקובץ
  // כדי שהקרוסלה תציג את המספרים הנוספים גם לפני פתיחת תפריט ההגדרות
  window.additionalFretNumbers = window.additionalFretNumbers ?? 'none';
  chrome.storage.sync.get(['additionalFretNumbers'], (result) => {
    if (result.additionalFretNumbers !== undefined) {
      window.additionalFretNumbers = result.additionalFretNumbers;
      console.log('[ChordRenderer] Loaded additionalFretNumbers from storage:', result.additionalFretNumbers);
    }
  });
  /* API:
   * • API:  chordRenderer.renderChord(name , timeLabel = '', isActive = false)
   *         chordRenderer.clearCache()
   */

  /* ------------------------------------------------------------------ */
  /* 1.  Class – low-level SVG drawing                                  */
  /* ------------------------------------------------------------------ */
  class ChordRenderer {
    constructor(options = {}) {
      this.config = {
        width: 55,
        height: 95,
        showFretNumbers: true,
        showFingers: true,
        showTuning: true,
        numStrings: 6,
        numFrets: 5,
        stringNames: ["E", "A", "D", "G", "B", "e"],
        ...options,
      };
      this.svgNS = "http://www.w3.org/2000/svg";
    }

    /*---------- tiny helper ----------*/
    createSVGElement(type, attrs = {}) {
      const el = document.createElementNS(this.svgNS, type);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    }

    /*---------- svg shell ----------*/
    createBaseSVG() {
      const svg = this.createSVGElement("svg", {
        width: this.config.width,
        height: this.config.height,
        viewBox: `0 0 ${this.config.width} ${this.config.height}`,
        xmlns: this.svgNS,
      });
      // הוספת style ל-SVG לאופטימיזציה
      svg.style.display = "block";
      svg.style.shapeRendering = "geometricPrecision"; // איכות טובה יותר עם פחות עיבוד
      svg.style.overflow = "visible"; // מניעת חיתוך של חצים ומונה
      return svg;
    }

    /*---------- background grid (optimized with groups) ----------*/
    drawGrid(svg) {
      const { width, height, numStrings, numFrets } = this.config;

      const topOffset = 20;
      const bottomOffset = this.config.showTuning ? 10 : 6;
      const gridWidth = width * 0.8;
      const gridHeight = height - topOffset - bottomOffset;
      const leftOffset = (width - gridWidth) / 2 + 3;
      const stringSpacing = gridWidth / (numStrings - 1);
      const fretSpacing = gridHeight / numFrets;

      // יצירת groups לקיבוץ elements
      const stringsGroup = this.createSVGElement("g", { class: "strings" });
      const fretsGroup = this.createSVGElement("g", { class: "frets" });
      const tuningGroup = this.createSVGElement("g", { class: "tuning" });

      /* vertical strings */
      const stringThicknesses = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4];
      for (let s = 0; s < numStrings; s++) {
        const x = leftOffset + s * stringSpacing;
        const thickness = stringThicknesses[s];

        stringsGroup.appendChild(
          this.createSVGElement("line", {
            x1: x,
            y1: topOffset,
            x2: x,
            y2: topOffset + gridHeight,
            stroke: "#000",
            "stroke-width": thickness,
          })
        );

        if (this.config.showTuning) {
          tuningGroup.appendChild(
            this.createSVGElement("text", {
              x,
              y: height - 4,
              "text-anchor": "middle",
              "font-family": "Arial",
              "font-size": "5.5px",
            })
          ).textContent = this.config.stringNames[s];
        }
      }

      /* horizontal frets */
      for (let f = 0; f <= numFrets; f++) {
        const y = topOffset + f * fretSpacing;
        fretsGroup.appendChild(
          this.createSVGElement("line", {
            x1: leftOffset,
            y1: y,
            x2: leftOffset + (numStrings - 1) * stringSpacing,
            y2: y,
            stroke: "#000",
            "stroke-width": f === 0 ? 1.5 : 0.6,
          })
        );
      }

      // הוספת כל הgroups ל-SVG
      svg.appendChild(stringsGroup);
      svg.appendChild(fretsGroup);
      if (this.config.showTuning) {
        svg.appendChild(tuningGroup);
      }

      return { topOffset, leftOffset, stringSpacing, fretSpacing };
    }

    /*---------- בדיקת חוקיות לציור barre ----------*/
    shouldDrawBarreLine(fromString, toString, fret, fingerPositions) {
      console.log("[DEBUG] shouldDrawBarreLine:", {
        fromString,
        toString,
        fret,
        fingerPositions,
      });
      // יצירת מפה של מיתרים לפי סריג ואצבע
      const stringMap = {};
      fingerPositions.forEach(([stringNum, fretNum, finger]) => {
        if (fretNum !== "x" && fretNum !== "0") {
          const fretInt = parseInt(fretNum);
          if (fretInt === fret) {
            stringMap[stringNum] = finger || "0";
          }
        }
      });
      console.log("[DEBUG] stringMap for fret", fret, ":", stringMap);

      // איסוף מידע על מיתרים פתוחים וX
      const allStringInfo = {};
      fingerPositions.forEach(([stringNum, fretNum, finger]) => {
        allStringInfo[stringNum] = {
          fret:
            fretNum === "x" ? "x" : fretNum === "0" ? "0" : parseInt(fretNum),
          finger: finger || "0",
        };
      });
      console.log("[DEBUG] allStringInfo:", allStringInfo);

      // המרת מיתרים למערך מסודר (מיתר 6 עד מיתר 1)
      const startString = Math.max(fromString, toString);
      const endString = Math.min(fromString, toString);
      const highestString = this.config.numStrings;
      const stringsInRange = [];
      for (let s = startString; s >= endString; s--) {
        stringsInRange.push(s);
      }

      // חוק 1: אצבעות שונות רציפות מהמיתר הראשון
      if (startString === highestString) {
        // מתחיל מהמיתר הראשון
        let expectedFinger = null;
        let isSequential = true;

        // עבור ממיתר 6 למיתר 1 (כך האצבעות עולות 2,3,4)
        for (const stringNum of stringsInRange) {
          const info = allStringInfo[stringNum];
          if (!info || info.fret !== fret) {
            isSequential = false;
            break;
          }

          const currentFinger = parseInt(info.finger) || 0;
          if (expectedFinger === null) {
            expectedFinger = currentFinger; // האצבע הראשונה
          } else {
            expectedFinger++; // האצבע הבאה ברצף
            if (currentFinger !== expectedFinger) {
              isSequential = false;
              break;
            }
          }
        }

        if (isSequential && expectedFinger > 0 && stringsInRange.length > 1) {
          console.log("[DEBUG] Rule 1 matched - sequential different fingers");
          return true; // חוק 1: אצבעות שונות רציפות
        }
      }

      // חוק 2: אותו מספר אצבע רציף מהמיתר הראשון
      if (startString === highestString) {
        // מתחיל מהמיתר הראשון
        const firstStringInfo = allStringInfo[highestString];
        if (firstStringInfo && firstStringInfo.fret === fret) {
          const targetFinger = firstStringInfo.finger;
          let isConsistent = true;

          for (const stringNum of stringsInRange) {
            const info = allStringInfo[stringNum];
            if (!info || info.fret !== fret || info.finger !== targetFinger) {
              isConsistent = false;
              break;
            }
          }

          if (isConsistent && targetFinger !== "0") {
            console.log("[DEBUG] Rule 2 matched - same finger continuous");
            return true; // חוק 2: אותו מספר אצבע רציף
          }
        }
      }

      // חוק 3: Barre מיוחד עם אצבע 1
      const firstFingerInRange = stringMap[startString];
      const lastFingerInRange = stringMap[endString];
      console.log("[DEBUG] Rule 3 check:", {
        firstFingerInRange,
        lastFingerInRange,
        endString,
        condition: endString >= 4,
      });

      if (firstFingerInRange === "1" && lastFingerInRange === "1") {
        // אם מתחיל מהמיתר הראשון - תמיד מחברים
        if (startString === highestString) {
          console.log(
            "[DEBUG] Rule 3a matched - special barre from first string"
          );
          return true; // חוק 3: Barre מיוחד מהתחלה
        }

        // אם לא מתחיל מהמיתר הראשון - בדיקה שלפניו יש אצבע
        let hasFingerBefore = false;
        for (let s = this.config.numStrings; s > startString; s--) {
          const info = allStringInfo[s];
          if (info && info.fret === fret) {
            // יש אצבע באותו סריג - בדיקה שזה לא פתוח או X
            if (info.finger !== "0" && info.finger !== "x") {
              hasFingerBefore = true;
              break;
            }
          }
        }

        if (hasFingerBefore) {
          console.log(
            "[DEBUG] Rule 3b matched - special barre with finger before"
          );
          return true; // חוק 3: Barre מיוחד עם אצבע לפניו
        }
      }

      console.log("[DEBUG] No rule matched - not drawing barre line");
      return false; // לא עומד באף חוק - לא מחברים קו
    }

    /*---------- barre indicator ----------*/
    drawBarres(svg, grid, barres, startFret = 1, fingerPositions = []) {
      if (!barres?.length) return;
      const { topOffset, leftOffset, stringSpacing, fretSpacing } = grid;

      barres.forEach(({ fromString, toString, fret }) => {
        // עבור סריג 2 - הצג את הקו והמספר בשורה השנייה
        let adj;
        if (startFret === 2) {
          adj = fret - startFret + 2; // עבור סריג 2 - הוסף 1 נוסף
        } else {
          adj = fret - startFret + 1; // כל השאר כרגיל
        }
        if (adj < 1 || adj > this.config.numFrets) return;

        const y = topOffset + (adj - 0.5) * fretSpacing;
        const fromX = leftOffset + (fromString - 1) * stringSpacing;
        const toX = leftOffset + (toString - 1) * stringSpacing;

        // בדיקה אם לחבר קו לפי החוקיות החדשה
        const shouldDrawBarre = this.shouldDrawBarreLine(
          fromString,
          toString,
          fret,
          fingerPositions
        );

        // ציור קו barre רק אם יש יותר ממיתר אחד ועומד בחוקיות
        if (fromString !== toString && shouldDrawBarre) {
          svg.appendChild(
            this.createSVGElement("path", {
              d: `M ${Math.min(fromX, toX)} ${y - 1.8}
              H ${Math.max(fromX, toX)}
              a 1.8 1.8 0 0 1 0 3.6
              H ${Math.min(fromX, toX)}
              a 1.8 1.8 0 0 1 0 -3.6`,
              fill: "#000",
            })
          );
        }

        // הצגת מספר השריג תמיד - גם למיתר יחיד וגם לbarre מלא
        const leftMostStringX = leftOffset;
        
        // Get additional fret numbers setting
        const additionalFrets = window.additionalFretNumbers || 'none';
        
        // Calculate which fret numbers to show based on setting
        const fretsToShow = [{ fret, adjY: y }];
        
        if (additionalFrets === 'one') {
          // Add one more fret (+2)
          const nextFret = fret + 2;
          const nextAdj = adj + 2;
          if (nextAdj <= this.config.numFrets) {
            const nextY = topOffset + (nextAdj - 0.5) * fretSpacing;
            fretsToShow.push({ fret: nextFret, adjY: nextY });
          }
        } else if (additionalFrets === 'all') {
          // Add every 2nd fret (+2, +4) - but only +2 if base is 2 (6 doesn't fit)
          const maxExtra = (fret === 2) ? 1 : 2;
          for (let i = 1; i <= maxExtra; i++) {
            const nextFret = fret + (i * 2);
            const nextAdj = adj + (i * 2);
            if (nextAdj <= this.config.numFrets) {
              const nextY = topOffset + (nextAdj - 0.5) * fretSpacing;
              fretsToShow.push({ fret: nextFret, adjY: nextY });
            }
          }
        }
        
        // Draw each fret number
        fretsToShow.forEach(({ fret: fretNum, adjY }) => {
          svg.appendChild(
            this.createSVGElement("text", {
              x: leftMostStringX - 7,
              y: adjY + 2,
              "text-anchor": "middle",
              "font-family": "Arial",
              "font-size": "8px",
              "font-weight": "normal",
              fill: "#000",
              class: "fret-number",
            })
          ).textContent = fretNum;
        });
      });
    }

    /*---------- open / mute indicators (optimized with group) ----------*/
    drawStringIndicators(svg, grid, positions) {
      const { topOffset, leftOffset, stringSpacing } = grid;
      const yPos = topOffset - 6;
      const map = Object.fromEntries(positions.map(([s, f]) => [s, f]));

      // יצירת group אחד לכל האינדיקטורים
      const indicatorsGroup = this.createSVGElement("g", {
        class: "string-indicators",
      });
      let hasIndicators = false;

      for (let s = 1; s <= this.config.numStrings; s++) {
        const x = leftOffset + (s - 1) * stringSpacing;
        const f = map[s] ?? "";
        if (f === "x") {
          [
            ["-2", "-2", "2", "2"],
            ["-2", "2", "2", "-2"],
          ].forEach(([x1, y1, x2, y2]) =>
            indicatorsGroup.appendChild(
              this.createSVGElement("line", {
                x1: +x + +x1,
                y1: yPos + +y1,
                x2: +x + +x2,
                y2: yPos + +y2,
                stroke: "#000",
                "stroke-width": 0.7,
              })
            )
          );
          hasIndicators = true;
        } else if (f === "0") {
          indicatorsGroup.appendChild(
            this.createSVGElement("circle", {
              cx: x,
              cy: yPos,
              r: 2.0,
              stroke: "#000",
              "stroke-width": 0.6,
              fill: "none",
            })
          );
          hasIndicators = true;
        }
      }

      // הוספת הgroup רק אם יש אינדיקטורים
      if (hasIndicators) {
        svg.appendChild(indicatorsGroup);
      }
    }

    /*---------- finger dots (optimized with single group) ----------*/
    drawFingerPositions(svg, grid, positions, startFret = 1) {
      const { topOffset, leftOffset, stringSpacing, fretSpacing } = grid;

      // יצירת group אחד לכל האצבעות במקום elements נפרדים
      const fingerGroup = this.createSVGElement("g", {
        class: "finger-positions",
      });
      let hasFingers = false;

      positions.forEach(([stringNum, fretNum, finger]) => {
        if (fretNum === 0 || fretNum === "x") return;
        // עבור סריג 2 - הצג את האצבעות בשורה השנייה
        let fret;
        if (startFret === 2) {
          fret = parseInt(fretNum) - startFret + 2; // עבור סריג 2 - הוסף 1 נוסף
        } else {
          fret = parseInt(fretNum) - startFret + 1; // כל השאר כרגיל
        }
        if (fret < 1 || fret > this.config.numFrets) return;

        const x = leftOffset + (stringNum - 1) * stringSpacing;
        const y = topOffset + (fret - 0.5) * fretSpacing;

        // הוספת עיגול לgroup
        fingerGroup.appendChild(
          this.createSVGElement("circle", {
            cx: x,
            cy: y,
            r: 3,
            fill: "#000",
          })
        );

        // הוספת טקסט לgroup אם יש
        if (this.config.showFingers && finger && finger !== "0") {
          fingerGroup.appendChild(
            this.createSVGElement("text", {
              x,
              y: y + 2,
              "text-anchor": "middle",
              "font-family": "Arial",
              "font-size": "6px",
              "font-weight": "bold",
              fill: "#fff",
            })
          ).textContent = finger;
        }
        hasFingers = true;
      });

      // הוספת הgroup רק אם יש אצבעות
      if (hasFingers) {
        svg.appendChild(fingerGroup);
      }
    }

    /*---------- header (arrows + counter) ----------*/
    drawHeader(svg, index = 1, total = 1, chordName = "") {
      const { width } = this.config;

      /* ◀ ▶ */
      const leftArrow = this.createSVGElement("text", {
        x: 0,
        y: -2,
        "font-family": "Arial",
        "font-size": "8px",
        "text-anchor": "start",
        class: "chord-arrows-counter chord-arrow-left",
        "data-chord-name": chordName,
        "data-direction": "prev",
      });
      leftArrow.textContent = "◀";
      svg.appendChild(leftArrow);

      const rightArrow = this.createSVGElement("text", {
        x: 8,
        y: -2,
        "font-family": "Arial",
        "font-size": "8px",
        "text-anchor": "start",
        class: "chord-arrows-counter chord-arrow-right",
        "data-chord-name": chordName,
        "data-direction": "next",
      });
      rightArrow.textContent = "▶";
      svg.appendChild(rightArrow);

      /* מונה (לדוגמה 1/21) */
      const counter = this.createSVGElement("text", {
        x: width - 1,
        y: -2,
        "font-family": "Arial",
        "font-size": "9px",
        "text-anchor": "end",
        class: "chord-arrows-counter chord-position-counter",
      });
      counter.textContent = `${index}/${total}`;
      svg.appendChild(counter);
    }

    /*---------- title ----------*/
    drawChordName(svg, name) {
      // ביטול הצגת שם האקורד בתוך ה-SVG למניעת כפילות
      // השם יוצג רק באלמנט ה-HTML שמעל הדיאגרמה
      // svg.appendChild(this.createSVGElement('text', {
      //   x: this.config.width / 2, y: 15,
      //   'text-anchor': 'middle',
      //   'font-family': 'Arial',
      //   'font-size': '12px',
      //   'font-weight': 'bold'
      // })).textContent = name;
    }

    /*---------- format JSON from COMPLETE_CHORDS ----------*/
    formatChordData(obj) {
      if (obj.positions || obj.fingerPositions) return obj; // already parsed

      if (obj.frets) {
        const positions = [];
        obj.frets.split("").forEach((fret, i) => {
          const s = i + 1;
          const num =
            fret === "x"
              ? "x"
              : fret >= "a" && fret <= "z"
              ? (fret.charCodeAt(0) - 87).toString()
              : fret;
          const finger = obj.fingers ? obj.fingers[i] : null;
          positions.push([s, num, finger]);
        });

        /* starting fret */
        const numeric = positions
          .map((p) => +p[1])
          .filter((n) => n && !isNaN(n));
        let startFret = numeric.length ? Math.max(1, Math.min(...numeric)) : 1;

        /* barre conversion */
        const barres = [];
        if (obj.barres) {
          const list = Array.isArray(obj.barres)
            ? obj.barres // כבר מערך – השאר כמו שהוא
            : String(obj.barres)
                .match(/\d+|[a-z]/gi) // תופס גם "17" וגם "h"
                .map((b) => (isNaN(b) ? b.charCodeAt(0) - 87 : +b));
          list.forEach((fret) => {
            const strings = positions
              .filter((p) => +p[1] === fret)
              .map((p) => p[0]);
            if (strings.length >= 1) {
              // שונה מ-2 ל-1 כדי להציג מספר שריג גם למיתר יחיד
              barres.push({
                fromString: Math.max(...strings),
                toString: Math.min(...strings),
                fret,
              });
            }
          });
        }

        return { fingerPositions: positions, startFret, barres };
      }

      return { fingerPositions: [], startFret: 1, barres: [] };
    }

    /*---------- master render ----------*/
    render(name, data, index = 1, total = 1) {
      const d = this.formatChordData(data);
      const svg = this.createBaseSVG();

      /* ⬅ ➡ ומונה למעלה */
      this.drawHeader(svg, index, total, name);

      this.drawChordName(svg, name);
      const grid = this.drawGrid(svg);
      this.drawStringIndicators(svg, grid, d.fingerPositions);
      this.drawBarres(svg, grid, d.barres, d.startFret, d.fingerPositions);
      this.drawFingerPositions(svg, grid, d.fingerPositions, d.startFret);

      return svg;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 2.  High-level helper – cache + HTML container                      */
  /* ------------------------------------------------------------------ */
  const INSTRUMENT_STORAGE_KEY = "yc_selected_instrument";
  const INSTRUMENTS = {
    guitar: {
      id: "guitar",
      name: "Guitar",
      shortLabel: "G",
      numStrings: 6,
      stringNames: ["E", "A", "D", "G", "B", "e"],
      bundled: false,
    },
    ukulele: {
      id: "ukulele",
      name: "Ukulele",
      shortLabel: "U",
      numStrings: 4,
      stringNames: ["G", "C", "E", "A"],
      bundled: true,
      resourcePath: "data/instruments/ukulele.positions.json",
    },
    mandolin: {
      id: "mandolin",
      name: "Mandolin",
      shortLabel: "M",
      numStrings: 4,
      stringNames: ["G", "D", "A", "E"],
      bundled: true,
      resourcePath: "data/instruments/mandolin.positions.json",
    },
  };

  function getInitialInstrumentId() {
    try {
      const stored = localStorage.getItem(INSTRUMENT_STORAGE_KEY);
      if (stored && INSTRUMENTS[stored]) return stored;
    } catch {
      // Keep guitar as the safe default.
    }
    return "guitar";
  }

  let selectedInstrumentId = getInitialInstrumentId();
  const lowLevelRenderers = new Map();
  const instrumentPositionData = new Map();
  const instrumentLoadPromises = new Map();
  const instrumentLoadRefreshScheduled = new Set();
  const missingInstrumentChordWarnings = new Set();
  let instrumentMenuClose = null;

  function getSelectedInstrument() {
    return INSTRUMENTS[selectedInstrumentId] || INSTRUMENTS.guitar;
  }

  function getLowLevelRenderer() {
    const instrument = getSelectedInstrument();
    if (!lowLevelRenderers.has(instrument.id)) {
      lowLevelRenderers.set(
        instrument.id,
        new ChordRenderer({
          numStrings: instrument.numStrings,
          stringNames: instrument.stringNames,
          numFrets: 5,
        })
      );
    }
    return lowLevelRenderers.get(instrument.id);
  }

  const lowLevel = getLowLevelRenderer();
  const diagramCache = new Map(); // chordName -> complete DOM structure
  const svgFinalizationRegistry = new FinalizationRegistry((chordName) => {
    diagramCache.delete(chordName);
    svgTemplateCache.delete(chordName);
    if (self.DEBUG === true) {
      console.log(
        `%c[FinalizationRegistry] 🗑️ Cleaned up caches for garbage-collected chord: ${chordName}`,
        "color: #e67e22;"
      );
    }
  });
  const elementPool = {
    // Pool of reusable DOM elements
    containers: [],
    diagWraps: [],
    // הסרנו timeEls ו-nameEls כי הם נוצרים דרך innerHTML ולא דרך getPooledElement
  };

  function decodeCompactFret(char) {
    if (char === "x") return "x";
    if (char >= "a" && char <= "z") return char.charCodeAt(0) - 87;
    const parsed = Number.parseInt(char, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function compactInstrumentPositionToChordData(compact) {
    const [frets = "", fingers = "", barres = ""] = String(compact || "").split("|");
    return {
      frets,
      fingers,
      barres: barres.split("").filter(Boolean).map(decodeCompactFret),
    };
  }

  const NOTE_TO_PITCH_CLASS = {
    C: 0,
    "C#": 1,
    Db: 1,
    D: 2,
    "D#": 3,
    Eb: 3,
    E: 4,
    Fb: 4,
    "E#": 5,
    F: 5,
    "F#": 6,
    Gb: 6,
    G: 7,
    "G#": 8,
    Ab: 8,
    A: 9,
    "A#": 10,
    Bb: 10,
    B: 11,
    Cb: 11,
    H: 11,
  };

  function normalizeNoteToken(note) {
    const value = String(note || "")
      .trim()
      .replace(/♯/g, "#")
      .replace(/♭/g, "b");
    const match = value.match(/^([A-Ha-h])([#b]?)/);
    if (!match) return "";
    const letter = match[1].toUpperCase();
    return `${letter}${match[2] || ""}`;
  }

  function uniqueIntervals(intervals) {
    const seen = new Set();
    return intervals.filter((interval) => {
      const pitchClass = ((interval % 12) + 12) % 12;
      if (seen.has(pitchClass)) return false;
      seen.add(pitchClass);
      return true;
    });
  }

  function parseChordSymbol(chordName) {
    const cleanName = String(chordName || "")
      .trim()
      .replace(/♯/g, "#")
      .replace(/♭/g, "b");
    if (!cleanName || /^N(?:\.?C\.?)?$/i.test(cleanName)) return null;

    const [mainPart, bassPart] = cleanName.split("/");
    const match = mainPart.match(/^([A-Ha-h](?:#|b)?)(.*)$/);
    if (!match) return null;

    const root = normalizeNoteToken(match[1]);
    const rootPc = NOTE_TO_PITCH_CLASS[root];
    if (!Number.isFinite(rootPc)) return null;

    const rawQuality = (match[2] || "").replace(/^:/, "");
    const quality = rawQuality.replace(/\s+/g, "");
    const lower = quality.toLowerCase();
    const bass = normalizeNoteToken(bassPart || "");
    const bassPc = NOTE_TO_PITCH_CLASS[bass];

    return {
      root,
      rootPc,
      quality,
      lower,
      bassPc: Number.isFinite(bassPc) ? bassPc : null,
    };
  }

  function getRuntimeResourceUrl(path) {
    try {
      if (chrome?.runtime?.getURL) return chrome.runtime.getURL(path);
    } catch {
      // Fall through to a relative URL for local file/dev demos.
    }
    return path;
  }

  async function ensureInstrumentLoaded(instrumentId = selectedInstrumentId) {
    const instrument = INSTRUMENTS[instrumentId] || INSTRUMENTS.guitar;
    if (!instrument.bundled) return null;
    if (instrumentPositionData.has(instrument.id)) {
      return instrumentPositionData.get(instrument.id);
    }
    if (instrumentLoadPromises.has(instrument.id)) {
      return instrumentLoadPromises.get(instrument.id);
    }

    const promise = fetch(getRuntimeResourceUrl(instrument.resourcePath))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        const chords = data?.chords && typeof data.chords === "object" ? data.chords : {};
        instrumentPositionData.set(instrument.id, chords);
        instrumentLoadPromises.delete(instrument.id);
        return chords;
      })
      .catch((error) => {
        instrumentLoadPromises.delete(instrument.id);
        console.warn(`[ChordRenderer] Failed loading ${instrument.name} positions:`, error);
        return null;
      });

    instrumentLoadPromises.set(instrument.id, promise);
    return promise;
  }

  function scheduleInstrumentLoadedRefresh(instrumentId) {
    const instrument = INSTRUMENTS[instrumentId] || INSTRUMENTS.guitar;
    if (!instrument.bundled || instrumentLoadRefreshScheduled.has(instrument.id)) {
      return;
    }

    instrumentLoadRefreshScheduled.add(instrument.id);
    ensureInstrumentLoaded(instrument.id)
      .then((data) => {
        if (!data) return;
        clearCache();
        refreshInstrumentButtons();
        window.dispatchEvent(
          new CustomEvent("yc:instrumentPositionsLoaded", {
            detail: { instrument: instrument.id },
          })
        );
      })
      .finally(() => {
        instrumentLoadRefreshScheduled.delete(instrument.id);
      });
  }

  function normalizeInstrumentChordName(chordName) {
    const name = String(chordName || "").trim();
    if (!name) return "";
    const instrument = getSelectedInstrument();
    if (instrument.id === "guitar") return name;
    return name.split("/")[0].trim() || name;
  }

  function getDisplayChordNameForInstrument(chordName) {
    return normalizeInstrumentChordName(chordName);
  }

  function refreshInstrumentButtons() {
    const instrument = getSelectedInstrument();
    document.querySelectorAll(".yc-instrument-selector-btn").forEach((button) => {
      button.textContent = instrument.shortLabel;
      button.title = `Instrument: ${instrument.name}`;
      button.setAttribute("aria-label", `Instrument: ${instrument.name}`);
      button.setAttribute("data-instrument", instrument.id);
    });
  }

  function getInstrumentVariant() {
    return "";
  }

  function dispatchInstrumentChanged() {
    window.dispatchEvent(
      new CustomEvent("yc:instrumentChanged", {
        detail: {
          instrument: selectedInstrumentId,
        },
      })
    );
  }

  function closeInstrumentMenu() {
    if (typeof instrumentMenuClose === "function") {
      instrumentMenuClose();
    }
  }

  function createInstrumentSelectorButton({ className = "", onChange = null } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${className} yc-instrument-selector-btn`.trim();
    refreshInstrumentButtons();
    const instrument = getSelectedInstrument();
    button.textContent = instrument.shortLabel;
    button.title = `Instrument: ${instrument.name}`;
    button.setAttribute("aria-label", `Instrument: ${instrument.name}`);
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("data-instrument", instrument.id);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (instrumentMenuClose) {
        closeInstrumentMenu();
        return;
      }

      const panel = document.createElement("div");
      panel.setAttribute("role", "menu");
      panel.style.cssText = `
        position: fixed;
        min-width: 150px;
        padding: 5px;
        border: 1px solid rgba(0, 0, 0, 0.28);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.26);
        z-index: 2147483647;
        direction: ltr !important;
        unicode-bidi: isolate !important;
        font-family: Arial, sans-serif;
      `;

      const placePanel = () => {
        const rect = button.getBoundingClientRect();
        const top = Math.min(window.innerHeight - 12, rect.bottom + 6);
        const left = Math.max(6, Math.min(rect.left, window.innerWidth - 156));
        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
      };

      Object.values(INSTRUMENTS).forEach((instrumentOption) => {
        const item = document.createElement("button");
        item.type = "button";
        item.setAttribute("role", "menuitemradio");
        item.setAttribute(
          "aria-checked",
          instrumentOption.id === selectedInstrumentId ? "true" : "false"
        );
        item.textContent = `${instrumentOption.id === selectedInstrumentId ? "✓ " : "  "}${instrumentOption.name}`;
        item.style.cssText = `
          width: 100%;
          height: 30px;
          border: 0;
          border-radius: 6px;
          padding: 0 9px;
          background: ${instrumentOption.id === selectedInstrumentId ? "rgba(33, 150, 243, 0.14)" : "transparent"};
          color: #172033;
          font-size: 13px;
          font-weight: 700;
          text-align: left;
          cursor: pointer;
        `;
        item.addEventListener("mouseenter", () => {
          item.style.background = "rgba(33, 150, 243, 0.14)";
        });
        item.addEventListener("mouseleave", () => {
          item.style.background =
            instrumentOption.id === selectedInstrumentId
              ? "rgba(33, 150, 243, 0.14)"
              : "transparent";
        });
        item.addEventListener("click", async (clickEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
          await setSelectedInstrument(instrumentOption.id);
          closeInstrumentMenu();
          if (typeof onChange === "function") {
            onChange(instrumentOption.id);
          }
        });
        panel.appendChild(item);
      });

      const cleanup = () => {
        panel.remove();
        button.classList.remove("yc-instrument-open");
        button.setAttribute("aria-expanded", "false");
        document.removeEventListener("pointerdown", onPointerDown, true);
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("resize", placePanel, true);
        window.removeEventListener("scroll", placePanel, true);
        instrumentMenuClose = null;
      };
      const onPointerDown = (pointerEvent) => {
        if (panel.contains(pointerEvent.target) || button.contains(pointerEvent.target)) return;
        cleanup();
      };
      const onKeyDown = (keyboardEvent) => {
        if (keyboardEvent.key !== "Escape") return;
        keyboardEvent.preventDefault();
        cleanup();
      };

      document.body.appendChild(panel);
      placePanel();
      button.classList.add("yc-instrument-open");
      button.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", onPointerDown, true);
      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("resize", placePanel, true);
      window.addEventListener("scroll", placePanel, true);
      instrumentMenuClose = cleanup;
    });

    return button;
  }

  async function setSelectedInstrument(instrumentId) {
    const nextId = INSTRUMENTS[instrumentId] ? instrumentId : "guitar";
    if (nextId === selectedInstrumentId) {
      await ensureInstrumentLoaded(nextId);
      return nextId;
    }

    selectedInstrumentId = nextId;
    try {
      localStorage.setItem(INSTRUMENT_STORAGE_KEY, nextId);
    } catch {
      // Non-critical preference persistence.
    }

    await ensureInstrumentLoaded(nextId);
    clearCache();
    refreshInstrumentButtons();
    dispatchInstrumentChanged();
    return nextId;
  }

  // Keep enough diagrams cached for smooth scrolling without holding a full song in memory.
  const MAX_CACHE_SIZE = 160;
  const MAX_TEMPLATE_CACHE_SIZE = 160;
  const MAX_POOL_SIZE = 120;
  const HARD_POOL_LIMIT = 120; // 🔥 MEMORY FIX: גבול קשיח למניעת דליפת RAM - ~7MB מקסימום

  // זמן אחרון שבו נוקה הקאש באופן יזום (בשניות)
  let lastCacheCleanTime = Date.now() / 1000;
  let lastMemoryCleanTime = Date.now() / 1000;

  // תדירות ניקוי הקאש בשניות (כל 15 שניות לניקוי אגרסיבי)
  const CACHE_CLEANUP_INTERVAL = 15; // ניקוי כל 15 שניות
  const MEMORY_CLEANUP_INTERVAL = 5; // ניקוי זיכרון כל 5 שניות

  // משתנה שליטה לניקוי מטמון
  let cacheCleanupEnabled = true; // מופעל כברירת מחדל
  let aggressiveCleanupEnabled = true; // ניקוי אגרסיבי

  // מעקב אחרי מעבר בין סרטונים לניקוי מיידי
  let currentVideoId = null;
  let autoVideoCleanupEnabled = true;

  /* Element Pool Management */
  function getPooledElement(type, className) {
    const pool = elementPool[type];
    if (pool && pool.length > 0) {
      const element = pool.pop();
      element.className = className;
      // 🔥 MEMORY CHURN FIX: ניקוי יעיל יותר של אלמנטים מהpool
      while (element.firstChild) {
        element.removeChild(element.firstChild);
      }
      element.textContent = "";
      return element;
    }
    const element = document.createElement("div");
    element.className = className;
    return element;
  }

  function returnToPool(element, type) {
    if (!element || !elementPool[type]) return;
    const pool = elementPool[type];
    // 🔥 MEMORY FIX: השתמש בגבול הקשיח למניעת דליפת זיכרון
    if (pool.length >= HARD_POOL_LIMIT) return; // אל תוסיף יותר מ-120 אלמנטים

    // נקה את האלמנט לפני החזרה ל-pool
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
    element.className = "";
    element.textContent = "";
    pool.push(element);
  }

  /* SVG Template Cache for ultra-fast rendering */
  const svgTemplateCache = new Map(); // chordName -> SVG string template
  // הסרנו containerCache - אסטרטגיה עצלה ללא cache של DOM elements

  /* Convert SVG element to optimized string template */
  function svgToTemplate(svgElement) {
    return svgElement.outerHTML;
  }

  function createChordContainer(chordName, timeLabel, isActive, svgElement) {
    const container = getPooledElement(
      "containers",
      `chord-container ${isActive ? "active-chord" : ""}`.trim()
    );
    const diagWrap = getPooledElement(
      "diagWraps",
      "chord-diagram"
    );

    // תוויות זמן ושם
    if (timeLabel) {
      const timeEl = document.createElement("div");
      timeEl.className = "chord-time-inner";
      timeEl.textContent = timeLabel;
      diagWrap.appendChild(timeEl);
    }
    const nameEl = document.createElement("div");
    nameEl.className = "chord-name-inner";
    nameEl.textContent = chordName;
    diagWrap.appendChild(nameEl);

    // הוספת ה-SVG עצמו
    if (svgElement) {
      diagWrap.appendChild(svgElement);
    }

    container.appendChild(diagWrap);
    return container;
  }

  // הוספת event listeners לחצי הניווט
  function addChordNavigationListeners(container) {
    const arrows = container.querySelectorAll(
      ".chord-arrow-left, .chord-arrow-right"
    );

    arrows.forEach((arrow) => {
      arrow.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const chordName = arrow.getAttribute("data-chord-name");
        const direction = arrow.getAttribute("data-direction");

        if (!chordName || !direction) {
          console.warn("[ChordRenderer] חסרים נתונים בחץ:", {
            chordName,
            direction,
          });
          return;
        }

        // ניווט לפוזיציה חדשה (async)
        const newPos = await navigateChordPosition(chordName, direction);

        // רענון כל האקורדים הזהים בדף (סנכרון)
        refreshAllMatchingChords(chordName);
      });
    });
  }

  // רענון תצוגת אקורד עם פוזיציה חדשה (אקורד בודד)
  async function refreshChordDisplay(chordName, container) {
    try {
      // For capo-aware containers:
      // - sourceChord controls shared/random position state
      // - displayChord controls which diagram we render
      const sourceChord =
        container?.getAttribute("data-original-chord") || chordName;
      const displayChord =
        container?.getAttribute("data-display-chord") || chordName;

      const rawArr = getChordPositionsArray(displayChord); // 🆕 שימוש במטמון
      const currentPos = getSafeChordPosition(sourceChord, rawArr); // גרסה סינכרונית
      const data = rawArr[currentPos] || rawArr[0];
      const posIdx = currentPos + 1;
      const posTot = rawArr.length || 1;
      const renderChordName = normalizeInstrumentChordName(displayChord);

      if (!data) {
        console.warn(
          `[ChordRenderer] לא נמצא מידע עבור אקורד display=${displayChord} source=${sourceChord}`
        );
        return;
      }

      // יצירת SVG חדש עם הפוזיציה החדשה
      const newSvg = getLowLevelRenderer().render(renderChordName, data, posIdx, posTot);

      // Keep navigation/state writes tied to the original chord key.
      if (newSvg) {
        newSvg
          .querySelectorAll(".chord-arrow-left, .chord-arrow-right")
          .forEach((arrow) => {
            arrow.setAttribute("data-chord-name", sourceChord);
          });
      }

      // מציאת ה-SVG הקיים והחלפתו
      const oldSvg = container.querySelector("svg");
      if (oldSvg && newSvg) {
        oldSvg.parentNode.replaceChild(newSvg, oldSvg);

        // הוספת listeners ל-SVG החדש
        addChordNavigationListeners(container);

        // בדיקה אם הפוזיציה הנוכחית היא גלובלית והוספת גלובוס וחצים שחורים
        if (window.addGlobalPositionIndicator && window.databaseManager) {
          const leftArrow = newSvg.querySelector(".chord-arrow-left");
          if (leftArrow) {
            await window.addGlobalPositionIndicator(
              sourceChord,
              currentPos,
              leftArrow
            );
          }
        }

        console.log(
          `[ChordRenderer] רענון אקורד source=${sourceChord} display=${displayChord} לפוזיציה ${posIdx}/${posTot}`
        );
      }
    } catch (error) {
      console.error("[ChordRenderer] שגיאה ברענון אקורד:", error);
    }
  }

  // רענון כל האקורדים הזהים בדף (סנכרון פוזיציות)
  function refreshAllMatchingChords(chordName) {
    try {
      // 🎸 קאפו: מחפש גם לפי data-chord-name וגם לפי data-original-chord
      // כשקאפו פעיל, data-chord-name מכיל את האקורד המתורגם, אבל data-original-chord מכיל את המקורי
      const allChordContainers = document.querySelectorAll(
        `[data-chord-name="${chordName}"], [data-original-chord="${chordName}"]`
      );

      if (allChordContainers.length === 0) {
        // לא מדפיס כלום - זה מצב תקין
        return;
      }

      console.log(
        `[ChordRenderer] מרענן ${allChordContainers.length} אקורדים זהים: ${chordName}`
      );

      // רענון כל האקורדים הזהים
      allChordContainers.forEach((container, index) => {
        refreshChordDisplay(chordName, container);
      });

      const currentPos = getCurrentChordPosition(chordName);
      console.log(
        `[ChordRenderer] סיים סנכרון כל האקורדים ${chordName} לפוזיציה ${
          currentPos + 1
        }`
      );
    } catch (error) {
      console.error("[ChordRenderer] שגיאה בסנכרון אקורדים זהים:", error);
    }
  }

  /* זיהוי מזהה הסרטון הנוכחי מתוך URL */
  function getCurrentVideoId() {
    try {
      const url = window.location.href;
      // זיהוי YouTube video ID (11 תווים אחרי v= או /watch?v=)
      const match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      return match ? match[1] : null;
    } catch (e) {
      return null;
    }
  }

  /* בדיקה אם עברנו לסרטון חדש וביצוע ניקוי מיידי */
  function checkVideoChange() {
    if (!autoVideoCleanupEnabled) return false;

    const newVideoId = getCurrentVideoId();
    if (newVideoId && currentVideoId && newVideoId !== currentVideoId) {
      // עברנו לסרטון חדש - ניקוי מיידי!
      const oldCacheSize = diagramCache.size;
      const oldTemplateSize = svgTemplateCache.size;

      clearCache(); // ניקוי מלא של כל המטמונים

      if (self.DEBUG === true) {
        console.log(
          `[ChordRenderer] זוהה מעבר סרטון: ${currentVideoId} → ${newVideoId}`
        );
        console.log(
          `[ChordRenderer] ניקוי מיידי: ${oldCacheSize} אקורדים + ${oldTemplateSize} templates`
        );
      }

      currentVideoId = newVideoId;
      return true;
    }

    // 🔥 MEMORY FIX: Fallback לניקוי במעברים מהירים - מונע Pool כפול
    if (!currentVideoId || (newVideoId && newVideoId !== currentVideoId)) {
      // גם אם currentVideoId עוד לא עודכן - בכל מקרה נקה את ה-cache
      if (newVideoId) {
        clearCache();
        currentVideoId = newVideoId;
        if (self.DEBUG === true) {
          console.log(
            `[ChordRenderer] 🔥 Fallback cleanup: ניקוי מיידי לסרטון ${newVideoId}`
          );
        }
        return true;
      }
    }

    // עדכון מזהה הסרטון הנוכחי
    if (newVideoId) {
      currentVideoId = newVideoId;
    }

    return false;
  }

  /* Aggressive memory cleanup function */
  function performMemoryCleanup() {
    const currentTime = Date.now() / 1000;

    // ניקוי template cache אם הוא גדול מדי (סינכרון עם diagram cache)
    if (svgTemplateCache.size > MAX_TEMPLATE_CACHE_SIZE) {
      const keysToRemove = Math.floor(svgTemplateCache.size * 0.5);
      const keysIterator = svgTemplateCache.keys();
      for (let i = 0; i < keysToRemove; i++) {
        const key = keysIterator.next().value;
        if (key) {
          svgTemplateCache.delete(key);
          diagramCache.delete(key); // סינכרון מחיקה
        }
      }
      if (self.DEBUG === true)
        console.log(
          `[ChordRenderer] ניקוי template cache: נמחקו ${keysToRemove} templates`
        );
    }

    // ניקוי pools אם הם גדולים מדי
    Object.keys(elementPool).forEach((poolName) => {
      const pool = elementPool[poolName];
      if (pool.length > MAX_POOL_SIZE) {
        const excess = pool.length - Math.floor(MAX_POOL_SIZE / 2);
        pool.splice(0, excess); // מחק מהתחילה
      }
    });

    lastMemoryCleanTime = currentTime;
  }

  /* ================================================================ */
  /* Chord Position Management - ניהול פוזיציות אקורדים                  */
  /* ================================================================ */

  // 🆕 מטמון משותף לפוזיציות נוכחיות - משותף עם הפאנל!
  if (!window.currentChordPositions) {
    window.currentChordPositions = new Map(); // chordName -> currentPosition (0-based)
  }
  const currentChordPositions = window.currentChordPositions; // רפרנס מקומי לנוחות

  // 🆕 מטמון למערכי פוזיציות - מונע גישה חוזרת ל-COMPLETE_CHORDS/PANEL_SUBSET
  const chordPositionData = new Map(); // instrument:chordName -> array of all positions

  // שמירת פוזיציה ב-IndexedDB (רק אם שונה מברירת מחדל)
  async function saveChordPosition(chordName, position) {
    try {
      const videoId = getCurrentVideoId();
      if (videoId && window.databaseManager) {
        await window.databaseManager.saveLocalChordPosition(
          videoId,
          chordName,
          position
        );
        console.log(
          `[ChordRenderer] נשמר ${chordName} בפוזיציה ${position + 1}`
        );
      }
    } catch (error) {
      console.warn("[ChordRenderer] שגיאה בשמירת פוזיציה:", error);
    }
  }

  // שמירת כל הפוזיציות הנוכחיות (לתאימות אחורה)
  async function saveChordPositions() {
    try {
      const videoId = getCurrentVideoId();
      if (videoId && window.databaseManager) {
        for (const [chordName, position] of currentChordPositions) {
          await window.databaseManager.saveLocalChordPosition(
            videoId,
            chordName,
            position
          );
        }
        console.log(
          `[ChordRenderer] נשמרו ${currentChordPositions.size} פוזיציות ב-IndexedDB`
        );
      }
    } catch (error) {
      console.warn("[ChordRenderer] שגיאה בשמירת פוזיציות:", error);
    }
  }

  // קבלת הפוזיציה הנוכחית של אקורד (ממטמון או IndexedDB)
  async function getCurrentChordPosition(chordName) {
    // בדיקה במטמון הזמני קודם
    if (currentChordPositions.has(chordName)) {
      return currentChordPositions.get(chordName);
    }

    // טעינה מ-IndexedDB אם לא במטמון
    try {
      const videoId = getCurrentVideoId();
      if (videoId && window.databaseManager) {
        const position = await window.databaseManager.getLocalChordPosition(
          videoId,
          chordName
        );
        if (position !== null) {
          currentChordPositions.set(chordName, position); // שמירה במטמון
          return position;
        }
      }

      // אם אין Local, בדוק Global
      if (window.databaseManager) {
        const globalPosition =
          await window.databaseManager.getGlobalChordPosition(chordName);
        if (globalPosition !== null) {
          currentChordPositions.set(chordName, globalPosition); // שמירה במטמון
          console.log(
            `[ChordRenderer] נטען מ-Global: ${chordName} -> פוזיציה ${
              globalPosition + 1
            }`
          );

          // הוספת גלובוס וחצים שחורים לכל האקורדים הזהים
          if (window.addGlobalPositionIndicator) {
            const allArrows = document.querySelectorAll(
              `.chord-arrow-left[data-chord-name="${chordName}"]`
            );
            allArrows.forEach((arrow) => {
              window.addGlobalPositionIndicator(
                chordName,
                globalPosition,
                arrow
              );
            });
            console.log(
              `[ChordRenderer] הוסף גלובוס ל-${allArrows.length} אקורדים זהים (sync)`
            );
          }

          return globalPosition;
        }
      }
    } catch (error) {
      console.warn("[ChordRenderer] שגיאה בטעינת פוזיציה:", error);
    }

    return 0; // ברירת מחדל
  }

  // גרסה סינכרונית לתאימות אחורה
  function getCurrentChordPositionSync(chordName) {
    return currentChordPositions.get(chordName) || 0;
  }

  function getSafeChordPosition(chordName, rawArr) {
    const totalPositions = Array.isArray(rawArr) ? rawArr.length : 0;
    if (totalPositions <= 0) return 0;
    const rawPosition = getCurrentChordPositionSync(chordName);
    const safePosition =
      Number.isFinite(rawPosition) && rawPosition >= 0 && rawPosition < totalPositions
        ? rawPosition
        : 0;
    if (safePosition !== rawPosition) {
      currentChordPositions.set(chordName, safePosition);
    }
    return safePosition;
  }

  // 🆕 פונקציה לטעינת מערך פוזיציות עם מטמון
  function getChordPositionsArray(chordName) {
    const instrument = getSelectedInstrument();
    const renderChordName = normalizeInstrumentChordName(chordName);
    const variant = getInstrumentVariant();
    const cacheKey = `${instrument.id}:${variant}:${renderChordName}`;

    // בדיקה במטמון קודם
    if (chordPositionData.has(cacheKey)) {
      return chordPositionData.get(cacheKey);
    }

    let rawArr = [];
    if (instrument.id === "guitar") {
      // טעינה מ-PANEL_SUBSET בלבד (COMPLETE_CHORDS כבר נמחק!)
      // שימוש ב-chordName עם רווחים כי ב-PANEL_SUBSET השמירה כך
      rawArr = window.PANEL_SUBSET?.chords?.[chordName] || [];
    } else {
      const instrumentChords = instrumentPositionData.get(instrument.id);
      if (!instrumentChords) {
        scheduleInstrumentLoadedRefresh(instrument.id);
        return [];
      }

      const compactArr = instrumentChords?.[renderChordName] || [];
      rawArr = Array.isArray(compactArr)
        ? compactArr.map(compactInstrumentPositionToChordData)
        : [];
    }

    // שמירה במטמון
    if (rawArr && rawArr.length > 0) {
      chordPositionData.set(cacheKey, rawArr);
      console.log(
        `[ChordRenderer] 💾 Cached ${instrument.id}:${renderChordName}: ${rawArr.length} positions`
      );
    } else if (rawArr.length === 0) {
      const missingKey = `${instrument.id}:${renderChordName}`;
      if (missingInstrumentChordWarnings.has(missingKey)) {
        return rawArr;
      }
      if (missingInstrumentChordWarnings.size > 256) {
        missingInstrumentChordWarnings.clear();
      }
      missingInstrumentChordWarnings.add(missingKey);
      console.warn(
        `[ChordRenderer] ⚠️ Chord not found for ${instrument.id}: ${renderChordName}`
      );
    }

    return rawArr;
  }

  // ניווט לפוזיציה הבאה/קודמת (עם IndexedDB)
  async function navigateChordPosition(chordName, direction) {
    const rawArr = getChordPositionsArray(chordName); // 🆕 שימוש במטמון
    const totalPositions = rawArr.length;

    if (totalPositions <= 1) {
      console.log(`[ChordRenderer] אקורד ${chordName} יש רק פוזיציה אחת`);
      return 0;
    }

    const loadedPos = await getCurrentChordPosition(chordName);
    const currentPos =
      Number.isFinite(loadedPos) && loadedPos >= 0 && loadedPos < totalPositions
        ? loadedPos
        : 0;
    let newPos;

    if (direction === "next") {
      // מעבר מעגלי: אחרי האחרון חוזר לראשון
      newPos = (currentPos + 1) % totalPositions;
    } else {
      // 'prev'
      // מעבר מעגלי: לפני הראשון קופץ לאחרון
      newPos = (currentPos - 1 + totalPositions) % totalPositions;
    }

    // עדכון הפוזיציה ושמירה ב-IndexedDB
    currentChordPositions.set(chordName, newPos);
    await saveChordPosition(chordName, newPos); // שמירה מיידית

    console.log(
      `[ChordRenderer] ${chordName}: ${currentPos + 1}/${totalPositions} -> ${
        newPos + 1
      }/${totalPositions}`
    );

    // שידור event לסנכרון עם פאנל
    window.dispatchEvent(
      new CustomEvent("chordPositionChanged", {
        detail: { chordName, position: newPos },
      })
    );
    console.log(`[ChordRenderer] 📡 שודר event לסנכרון`);

    return newPos;
  }

  // ניקוי פוזיציות אקורדים (לשימוש במעבר סרטונים)
  async function clearChordPositions() {
    const positionsCount = currentChordPositions.size;
    const arraysCount = chordPositionData.size;

    currentChordPositions.clear();
    chordPositionData.clear(); // 🆕 ניקוי גם מטמון המערכים

    // ניקוי IndexedDB רק אם מבוקש מפרשות
    // (לא רוצים למחוק פוזיציות גלובליות במעבר סרטונים)
    console.log(
      `[ChordRenderer] נוקו ${positionsCount} פוזיציות + ${arraysCount} מערכים מהמטמון`
    );
  }

  /* Public – render chord block */
  function renderChord(chordName, timeLabel = "", isActive = false) {
    startAutoCleanup();
    const currentTime = Date.now() / 1000;

    /* -------------------------------------------------
     *  1. בדיקות מעבר סרטון וניקוי זיכרון תקופתי
     * ------------------------------------------------- */
    const videoChanged = checkVideoChange();
    if (videoChanged) {
      lastMemoryCleanTime = currentTime;
      lastCacheCleanTime = currentTime;
    }

    // ניקוי אגרסיבי כל -MEMORY_CLEANUP_INTERVAL- שניות
    if (
      aggressiveCleanupEnabled &&
      currentTime - lastMemoryCleanTime > MEMORY_CLEANUP_INTERVAL
    ) {
      performMemoryCleanup();
      lastMemoryCleanTime = currentTime;
    }

    const rawArr = getChordPositionsArray(chordName);
    const currentPos = getSafeChordPosition(chordName, rawArr);
    const renderChordName = normalizeInstrumentChordName(chordName);
    const instrument = getSelectedInstrument();
    const variant = getInstrumentVariant();
    const cacheKey = `${instrument.id}_${variant}_${chordName}_${renderChordName}_${currentPos}`; // מפתח כולל כלי + פוזיציה

    // ניקוי מטמון מחזורי (30 %) כל -CACHE_CLEANUP_INTERVAL- שניות
    if (
      cacheCleanupEnabled &&
      diagramCache.size > 0 &&
      currentTime - lastCacheCleanTime > CACHE_CLEANUP_INTERVAL
    ) {
      const keysToRemove = Math.floor(diagramCache.size * 0.3);
      if (keysToRemove > 10) {
        // מינימום 10 כדי לצמצם רעש
        const it = diagramCache.keys();
        for (let i = 0; i < keysToRemove; i++) {
          const key = it.next().value;
          if (key && key !== cacheKey) {
            diagramCache.delete(key);
            svgTemplateCache.delete(key);
          }
        }
        if (self.DEBUG)
          console.log(
            `[ChordRenderer] ניקוי מטמון תקופתי: נמחקו ${keysToRemove} פריטים, נותרו ${diagramCache.size}`
          );
      }
      lastCacheCleanTime = currentTime;
    }

    /* -------------------------------------------------
     *  2. לוגיקת WeakRef-Cache חדשה
     *  🔧 FIX: מפתח הקאש כולל גם את הפוזיציה כדי לתמוך בשינויי פוזיציה
     * ------------------------------------------------- */
    // ניקוי אגרסיבי יותר כשהמטמון מתקרב למקסימום
    if (diagramCache.size > MAX_CACHE_SIZE * 0.8) {
      const keysToRemove = Math.floor(diagramCache.size * 0.4);
      const it = diagramCache.keys();
      for (let i = 0; i < keysToRemove; i++) {
        const key = it.next().value;
        if (key && key !== cacheKey) {
          diagramCache.delete(key);
          svgTemplateCache.delete(key);
        }
      }
      if (self.DEBUG)
        console.log(
          `[ChordRenderer] אגרסיבי: נמחקו ${keysToRemove} פריטים, נותרו ${diagramCache.size}`
        );
    }

    const cachedRef = diagramCache.get(cacheKey);
    let cachedElement = cachedRef ? cachedRef.deref() : undefined;

    // אם האלמנט לא קיים (או שה-GC כבר ניקה אותו)
    if (!cachedElement) {
      if (cachedRef) {
        // ניקוי כניסה "זומבי"
        diagramCache.delete(cacheKey);
        svgTemplateCache.delete(cacheKey);
      }

      // טעינת פוזיציה מ-IndexedDB אם לא במטמון
      const videoId = getCurrentVideoId();
      if (
        !currentChordPositions.has(chordName) &&
        videoId &&
        window.databaseManager
      ) {
        // טעינה אסינכרונית מ-IndexedDB
        window.databaseManager
          .getLocalChordPosition(videoId, chordName)
          .then(async (position) => {
            if (position !== null) {
              currentChordPositions.set(chordName, position);
              // רענון אם הפוזיציה שונה מ-0
              if (position > 0) {
                refreshAllMatchingChords(chordName);
              }
            } else {
              // אם אין Local, בדוק Global
              const globalPosition =
                await window.databaseManager.getGlobalChordPosition(chordName);
              if (globalPosition !== null) {
                currentChordPositions.set(chordName, globalPosition);
                console.log(
                  `[ChordRenderer] נטען מ-Global (async): ${chordName} -> פוזיציה ${
                    globalPosition + 1
                  }`
                );
                // רענון אם הפוזיציה שונה מ-0
                if (globalPosition > 0) {
                  refreshAllMatchingChords(chordName);
                }

                // הוספת גלובוס וחצים שחורים לכל האקורדים הזהים
                if (window.addGlobalPositionIndicator) {
                  const allArrows = document.querySelectorAll(
                    `.chord-arrow-left[data-chord-name="${chordName}"]`
                  );
                  allArrows.forEach((arrow) => {
                    window.addGlobalPositionIndicator(
                      chordName,
                      globalPosition,
                      arrow
                    );
                  });
                  console.log(
                    `[ChordRenderer] הוסף גלובוס ל-${allArrows.length} אקורדים זהים`
                  );
                }
              }
            }
          })
          .catch((error) => {
            console.warn("[ChordRenderer] שגיאה בטעינת פוזיציה:", error);
          });
      }

      // currentPos כבר מוגדר למעלה לפני יצירת cacheKey
      const data = rawArr[currentPos] || rawArr[0]; // ניסיון פוזיציה נוכחית, או ראשונה כגיבוי
      const posIdx = currentPos + 1; // הצגה 1-based למשתמש
      const posTot = rawArr.length || 1;

      if (!data) {
        // אקורד לא נמצא – מחזירים Placeholder פשוט
        const wrap = document.createElement("div");
        wrap.className = `chord-container ${isActive ? "active-chord" : ""}`;
        wrap.innerHTML = `
        <span class="chord-name">${renderChordName}</span>
        <span class="chord-time">${timeLabel}</span>
        <span class="chord-diagram-placeholder">?</span>`;
        return wrap;
      }

      // רינדור SVG פעם אחת
      console.log(
        `🔍 [ChordRenderer DEBUG] Rendering NEW chord "${chordName}":`,
        {
          chordName,
          currentPos,
          posIdx,
          posTot,
          hasData: !!data,
          timeLabel,
          isActive,
        }
      );

      const svg = getLowLevelRenderer().render(renderChordName, data, posIdx, posTot);

      if (renderChordName !== chordName) {
        svg
          .querySelectorAll(".chord-arrow-left, .chord-arrow-right")
          .forEach((arrow) => {
            arrow.setAttribute("data-chord-name", chordName);
          });
      }

      // 🔍 DEBUG: בדיקת מה שנוצר ב-SVG
      const counter = svg.querySelector(".chord-position-counter");
      const arrows = svg.querySelectorAll(
        ".chord-arrow-left, .chord-arrow-right"
      );
      console.log(`🔍 [ChordRenderer DEBUG] SVG created for "${chordName}":`, {
        hasSvg: !!svg,
        hasCounter: !!counter,
        counterText: counter?.textContent,
        arrowsCount: arrows.length,
      });

      const newElement = createChordContainer(
        renderChordName,
        timeLabel,
        isActive,
        svg
      );

      // שמירת תבנית SVG כ-string (לחיסכון בזיכרון)
      svgTemplateCache.set(cacheKey, svgToTemplate(svg));

      // שמירת WeakRef במטמון (עם מפתח שכולל פוזיציה)
      diagramCache.set(cacheKey, new WeakRef(newElement));

      // רישום ל-FinalizationRegistry כדי לפנות קבילות ישנות
      svgFinalizationRegistry.register(newElement, cacheKey, newElement);

      if (self.DEBUG)
        console.log(
          `%c[ChordRenderer] ✨ NEW WEAKREF CACHE: ${cacheKey}`,
          "background:#2ecc71; color:white; padding:1px 4px; border-radius:2px"
        );

      cachedElement = newElement;
    }

    /* -------------------------------------------------
     *  3. שליפת Container טרי מה-Pool והחזרת התוצאה
     * ------------------------------------------------- */
    console.log(
      `🔍 [ChordRenderer DEBUG] Returning chord "${chordName}" (from cache: ${!!cachedRef}):`,
      {
        chordName,
        fromCache: !!cachedRef,
        hasElement: !!cachedElement,
        timeLabel,
        isActive,
      }
    );

    const container = getPooledElement(
      "containers",
      `chord-container ${isActive ? "active-chord" : ""}`
    );

    // שכפול Children בצורה בטוחה ומהירה
    for (let node = cachedElement.firstChild; node; node = node.nextSibling) {
      container.appendChild(node.cloneNode(true));
    }

    // 🔍 DEBUG: בדיקת מה שהועתק
    const svg = container.querySelector("svg");
    const counter = svg?.querySelector(".chord-position-counter");
    const arrows = svg?.querySelectorAll(
      ".chord-arrow-left, .chord-arrow-right"
    );
    console.log(
      `🔍 [ChordRenderer DEBUG] Container ready for "${chordName}":`,
      {
        hasContainer: !!container,
        hasSvg: !!svg,
        hasCounter: !!counter,
        counterText: counter?.textContent,
        arrowsCount: arrows?.length,
      }
    );

    // הוספת event listeners לחצי הניווט
    addChordNavigationListeners(container);

    // 🌐 הוספת גלובוס וחצים שחורים (אם יש פוזיציה גלובלית)
    // זה נעשה אחרי כל שכפול מהקאש כדי לוודא שהגלובוס תמיד מופיע
    const svgForGlobe = container.querySelector("svg");
    const arrowForGlobe = svgForGlobe?.querySelector(".chord-arrow-left");
    if (
      arrowForGlobe &&
      typeof window.addGlobalPositionIndicator === "function"
    ) {
      const currentPos = getCurrentChordPositionSync(chordName);
      window.addGlobalPositionIndicator(chordName, currentPos, arrowForGlobe);
    }

    return container;
  }

  /* Clear cache - AGGRESSIVE cleanup for video transitions */
  function clearCache() {
    const size = diagramCache.size;
    const templateSize = svgTemplateCache.size;

    if (self.DEBUG === true)
      console.log(
        `%c[ChordRenderer] 🧹 AGGRESSIVE CLEANUP START - ${size} diagrams + ${templateSize} templates`,
        "background:#e74c3c; color:white; padding:2px 6px; border-radius:3px;"
      );

    // ניקוי מטמון האקורדים והtemplates
    diagramCache.clear();
    svgTemplateCache.clear();

    // 🔥 FIX: לא מנקים את currentChordPositions כאן!
    // הפוזיציות הנוכחיות צריכות להישאר גם אחרי ניקוי cache
    // clearChordPositions(); // ❌ מושבת - גורם לאיפוס פוזיציות

    // רק מנקים את מטמון המערכים (chordPositionData)
    chordPositionData.clear();
    missingInstrumentChordWarnings.clear();

    // ניקוי יסודי של כל האלמנט pools עם הסרת DOM references
    let totalPooledElements = 0;
    Object.keys(elementPool).forEach((poolName) => {
      const pool = elementPool[poolName];
      totalPooledElements += pool.length;

      // ניקוי יסודי של כל אלמנט לפני מחיקה
      pool.forEach((element) => {
        if (element) {
          // הסרה מה-DOM אם עדיין מחובר
          if (element.parentNode) {
            element.parentNode.removeChild(element);
          }
          // ניקוי תוכן פנימי כדי לשחרר SVG DOM objects
          while (element.firstChild) {
            element.removeChild(element.firstChild);
          }
        }
      });

      elementPool[poolName].length = 0; // מחיקה מהירה של כל האלמנטים
    });

    // איפוס זמן הניקוי האחרון
    lastCacheCleanTime = Date.now() / 1000;

    if (self.DEBUG === true)
      console.log(
        `%c[ChordRenderer] ✅ CLEANUP COMPLETE - freed ${size} diagrams + ${templateSize} templates + ${totalPooledElements} pooled elements`,
        "background:#27ae60; color:white; padding:2px 6px; border-radius:3px;"
      );

    // אילוץ garbage collection אם זמין
    if (typeof window !== "undefined" && window.gc) {
      try {
        window.gc();
        if (self.DEBUG === true)
          console.log(
            "%c[ChordRenderer] 🗑️ Manual garbage collection triggered",
            "background:#9b59b6; color:white; padding:2px 6px; border-radius:3px;"
          );
      } catch (e) {
        /* ignore */
      }
    }
  }

  /**
   * מנקה אקורדים שלא היו בשימוש לאחרונה
   * @param {number} maxAge - גיל מקסימלי בשניות (ברירת מחדל: 5 דקות)
   */
  function clearUnusedCache(maxAge = 300) {
    if (diagramCache.size === 0) return;

    // כרגע נמחק 50% מהמטמון הישן ביותר
    // בעתיד אפשר להוסיף מעקב אחרי זמן שימוש אחרון
    const keysToRemove = Math.floor(diagramCache.size * 0.5);
    const keysIterator = diagramCache.keys();
    let removed = 0;

    for (let i = 0; i < keysToRemove; i++) {
      const key = keysIterator.next().value;
      if (key) {
        diagramCache.delete(key);
        removed++;
      }
    }

    if (self.DEBUG && removed > 0) {
      console.log(
        `[ChordRenderer] clearUnusedCache: נמחקו ${removed} אקורדים ישנים`
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /* 4.  Expose to window                                               */
  /* ------------------------------------------------------------------ */
  /* פונקציה לחזרת אלמנטים ישנים ל-pool - עם ניקוי יסודי של SVG */
  function recycleChordElement(element) {
    if (!element?.classList.contains("chord-container")) return;

    // ⚠️ חשוב: הוצא מה-DOM לפני החזרה ל-pool כדי לשחרר מהRender Tree
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }

    // מצא ונקה את כל האלמנטים הפנימיים - ניקוי יסודי של SVG DOM objects
    const diagWrap = element.querySelector(".chord-diagram");
    if (diagWrap) {
      // ניקוי יסודי של כל התוכן כדי לשחרר SVG DOM objects
      while (diagWrap.firstChild) {
        diagWrap.removeChild(diagWrap.firstChild);
      }

      // החזר רק את diagWrap ו-container לpool
      element.removeChild(diagWrap);
      returnToPool(diagWrap, "diagWraps");
    }

    returnToPool(element, "containers");
  }

  window.chordRenderer = {
    renderChord,
    clearCache,
    clearUnusedCache,
    recycleChordElement,

    // פונקציות להפעלה/כיבוי של ניקוי המטמון
    enableCacheCleanup: function () {
      cacheCleanupEnabled = true;
      if (self.DEBUG === true)
        console.log("[ChordRenderer] Cache cleanup enabled");
    },

    disableCacheCleanup: function () {
      cacheCleanupEnabled = false;
      lastCacheCleanTime = Date.now() / 1000; // איפוס הטיימר
      if (self.DEBUG === true)
        console.log("[ChordRenderer] Cache cleanup disabled and timer reset");
    },

    // פונקציה לבדיקת מצב הזיכרון
    getMemoryInfo: function () {
      const poolSizes = {};
      Object.keys(elementPool).forEach((key) => {
        poolSizes[key] = elementPool[key].length;
      });
      return {
        cacheSize: diagramCache.size,
        maxCacheSize: MAX_CACHE_SIZE,
        templateCacheSize: svgTemplateCache.size,
        maxTemplateCacheSize: MAX_TEMPLATE_CACHE_SIZE,
        poolSizes: poolSizes,
        selectedInstrument: selectedInstrumentId,
        loadedInstrumentData: Array.from(instrumentPositionData.keys()),
        maxPoolSize: MAX_POOL_SIZE,
        cleanupEnabled: cacheCleanupEnabled,
        aggressiveCleanupEnabled: aggressiveCleanupEnabled,
      };
    },

    // פונקציות נוספות לשליטה במטמון
    enableAggressiveCleanup: function () {
      aggressiveCleanupEnabled = true;
      if (self.DEBUG === true)
        console.log("[ChordRenderer] Aggressive cleanup enabled");
    },

    disableAggressiveCleanup: function () {
      aggressiveCleanupEnabled = false;
      if (self.DEBUG === true)
        console.log("[ChordRenderer] Aggressive cleanup disabled");
    },

    forceMemoryCleanup: function () {
      performMemoryCleanup();
      if (self.DEBUG === true)
        console.log("[ChordRenderer] Manual memory cleanup performed");
    },

    // פונקציה לבדיקת זיכרון לפי המלצות הביקורת
    checkMemoryUsage: function () {
      const info = {
        timestamp: new Date().toISOString(),
        cacheSize: diagramCache.size,
        templateCacheSize: svgTemplateCache.size,
        currentVideoId: currentVideoId,
        poolSizes: {},
      };

      Object.keys(elementPool).forEach((key) => {
        info.poolSizes[key] = elementPool[key].length;
      });

      // אם זמין - נתוני זיכרון מהדפדפן
      if (performance.memory) {
        info.jsHeapUsed =
          Math.round((performance.memory.usedJSHeapSize / 1024 / 1024) * 100) /
            100 +
          "MB";
        info.jsHeapTotal =
          Math.round((performance.memory.totalJSHeapSize / 1024 / 1024) * 100) /
            100 +
          "MB";
      }

      return info;
    },

    // פונקציות לשליטה בניקוי אוטומטי בעת מעבר סרטונים
    enableVideoCleanup: function () {
      autoVideoCleanupEnabled = true;
      if (self.DEBUG === true)
        console.log("[ChordRenderer] Auto video cleanup enabled");
    },

    disableVideoCleanup: function () {
      autoVideoCleanupEnabled = false;
      if (self.DEBUG === true)
        console.log("[ChordRenderer] Auto video cleanup disabled");
    },

    // פונקציה לניקוי ידני בעת מעבר סרטון
    onVideoChange: function () {
      const oldCacheSize = diagramCache.size;
      const oldTemplateSize = svgTemplateCache.size;

      clearCache();
      currentVideoId = getCurrentVideoId();

      if (self.DEBUG === true) {
        console.log(
          `[ChordRenderer] Manual video change cleanup: ${oldCacheSize} אקורדים + ${oldTemplateSize} templates`
        );
      }

      return {
        cleared: oldCacheSize + oldTemplateSize,
        newVideoId: currentVideoId,
      };
    },

    _lowLevel: lowLevel, // לזיהוי דיבאג בלבד
    _getLowLevelRenderer: getLowLevelRenderer,
    _cache: diagramCache,
    _templateCache: svgTemplateCache,
    _pools: elementPool,
    
    // 🔍 פונקציה לרינדור SVG בודד (ל-Chord Explorer)
    renderChordSVG: function(chordName, positionData, posIndex, totalPositions) {
      const renderer = getLowLevelRenderer();
      if (!positionData) return null;
      const formattedData = renderer.formatChordData(positionData);
      return renderer.render(normalizeInstrumentChordName(chordName), formattedData, posIndex, totalPositions);
    },

    getInstrument: function () {
      return getSelectedInstrument();
    },

    listInstruments: function () {
      return Object.values(INSTRUMENTS).map(({ id, name, shortLabel }) => ({
        id,
        name,
        shortLabel,
      }));
    },

    setInstrument: setSelectedInstrument,
    ensureInstrumentLoaded,
    closeInstrumentMenu,
    getDisplayChordName: getDisplayChordNameForInstrument,
    createInstrumentSelectorButton,

    // פונקציות ניהול פוזיציות אקורדים (IndexedDB)
    getCurrentChordPosition,
    getCurrentChordPositionSync,
    navigateChordPosition,
    saveChordPosition,
    saveChordPositions,
    clearChordPositions,
    refreshAllMatchingChords,

    // פונקציה לרענון אקורד עם פוזיציה ספציפית (עם סנכרון)
    renderChordAtPosition: function (chordName, position = 0) {
      const rawArr = getChordPositionsArray(chordName); // 🆕 שימוש במטמון
      if (position >= 0 && position < rawArr.length) {
        // עדכון הפוזיציה הנוכחית
        currentChordPositions.set(chordName, position);
        saveChordPositions();

        // סנכרון כל האקורדים הזהים בדף
        refreshAllMatchingChords(chordName);

        console.log(
          `[ChordRenderer] עדכון וסנכרון ${chordName} לפוזיציה ${
            position + 1
          }/${rawArr.length}`
        );
        return true;
      } else {
        console.warn(
          `[ChordRenderer] פוזיציה לא חוקית: ${position} (טווח: 0-${
            rawArr.length - 1
          })`
        );
        return false;
      }
    },

    // פונקציה לקבלת מידע על פוזיציות אקורד (IndexedDB)
    getChordPositionsInfo: async function () {
      const cachePositions = Object.fromEntries(currentChordPositions);
      let dbPositions = {};

      try {
        const videoId = getCurrentVideoId();
        if (videoId && window.databaseManager) {
          const chordsData = await window.databaseManager.loadFromDatabase(
            "chords",
            videoId
          );
          if (chordsData && chordsData.localChordPositions) {
            dbPositions = chordsData.localChordPositions;
          }
        }
      } catch (error) {
        console.warn("[ChordRenderer] שגיאה בקריאת IndexedDB:", error);
      }

      return {
        cachePositions: cachePositions,
        dbPositions: dbPositions,
        totalCached: currentChordPositions.size,
        totalInDB: Object.keys(dbPositions).length,
        storageType: "IndexedDB",
      };
    },

    // פונקציה לבדיקת כמות אקורדים זהים בדף
    countMatchingChords: function (chordName) {
      const allChordContainers = document.querySelectorAll(
        `[data-chord-name="${chordName}"]`
      );
      return {
        chordName: chordName,
        count: allChordContainers.length,
        currentPosition: getCurrentChordPosition(chordName) + 1,
        containers: Array.from(allChordContainers),
      };
    },
  };

  // ניקוי אוטומטי עם interval כדי למנוע הצטברות זיכרון
  let autoCleanupInterval = null;

  function startAutoCleanup() {
    if (autoCleanupInterval) return; // כבר פועל

    autoCleanupInterval = setInterval(() => {
      const currentTime = Date.now() / 1000;

      // בדיקה אם עברנו לסרטון חדש (גיבוי למקרה שלא נתפס ב-renderChord)
      checkVideoChange();

      // ניקוי אגרסיבי אם המטמון מתמלא (סינכרון בין שני המטמונים)
      if (diagramCache.size > MAX_CACHE_SIZE * 0.75) {
        const keysToRemove = Math.floor(diagramCache.size * 0.4);
        const keysIterator = diagramCache.keys();
        for (let i = 0; i < keysToRemove; i++) {
          const key = keysIterator.next().value;
          if (key) {
            diagramCache.delete(key);
            svgTemplateCache.delete(key); // סינכרון מחיקה
          }
        }
        if (self.DEBUG === true)
          console.log(
            `[ChordRenderer] Auto cleanup: removed ${keysToRemove} cached items + templates`
          );
      }

      // ניקוי template cache נוסף אם נותר גדול מדי
      if (svgTemplateCache.size > MAX_TEMPLATE_CACHE_SIZE * 0.75) {
        const keysToRemove = Math.floor(svgTemplateCache.size * 0.4);
        const keysIterator = svgTemplateCache.keys();
        for (let i = 0; i < keysToRemove; i++) {
          const key = keysIterator.next().value;
          if (key) {
            svgTemplateCache.delete(key);
            diagramCache.delete(key); // סינכרון מחיקה
          }
        }
        if (self.DEBUG === true)
          console.log(
            `[ChordRenderer] Auto cleanup: removed ${keysToRemove} extra templates`
          );
      }

      // גרביג' קולקשן אם זמין
      if (self.gc && Math.random() < 0.1) {
        // 10% סיכוי בכל ניקוי
        try {
          self.gc();
        } catch (e) {
          /* ignore */
        }
      }
    }, MEMORY_CLEANUP_INTERVAL * 1000); // המרה לmilliseconds

    if (self.DEBUG === true)
      console.log(
        "[ChordRenderer] Auto cleanup started - interval:",
        MEMORY_CLEANUP_INTERVAL + "s"
      );
  }

  function stopAutoCleanup() {
    if (autoCleanupInterval) {
      clearInterval(autoCleanupInterval);
      autoCleanupInterval = null;
      if (self.DEBUG === true)
        console.log("[ChordRenderer] Auto cleanup stopped");
    }
  }

  // הוספה לwindow.chordRenderer
  window.chordRenderer.startAutoCleanup = startAutoCleanup;
  window.chordRenderer.stopAutoCleanup = stopAutoCleanup;

  if (selectedInstrumentId !== "guitar") {
    scheduleInstrumentLoadedRefresh(selectedInstrumentId);
  }

  // לא מפעילים interval בטעינת המודול. הוא יתחיל רק ברינדור אקורד ראשון
  // וייעצר ב-fullCleanup / סגירת קרוסלה כדי שלא ירוץ סתם אחרי פתיחת Settings.

  // פונקציה גלובלית לניקוי IndexedDB (לדיבאג)
  window.clearChordPositionsStorage = async function () {
    try {
      currentChordPositions.clear();

      const videoId = getCurrentVideoId();
      if (videoId && window.databaseManager) {
        await window.databaseManager.clearLocalChordPositions(videoId);
      }

      console.log("[ChordRenderer] נוקו כל פוזיציות האקורדים מ-IndexedDB");
      return true;
    } catch (error) {
      console.error("[ChordRenderer] שגיאה בניקוי IndexedDB:", error);
      return false;
    }
  };

  // אתחול מזהה הסרטון הנוכחי
  currentVideoId = getCurrentVideoId();

  // הוספת listener גלובלי לסנכרון פוזיציות עם פאנל
  window.addEventListener("chordPositionChanged", (e) => {
    const { chordName, position } = e.detail;
    console.log(
      `[ChordRenderer] 📡 קיבל event: ${chordName} -> פוזיציה ${position + 1}`
    );

    // עדכון הפוזיציה ב-Map
    currentChordPositions.set(chordName, position);

    // רענון כל האקורדים הזהים בדף
    refreshAllMatchingChords(chordName);
    console.log(`[ChordRenderer] 🔄 רענן את כל האקורדים ${chordName} בקרוסלה`);
  });

  console.log(
    "[ChordRenderer] ready – cache size",
    diagramCache.size,
    "video ID:",
    currentVideoId
  );

  // סגירת ה-else שנפתח בתחילת הקובץ
}
