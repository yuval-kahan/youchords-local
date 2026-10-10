/*==============================================================================
  YouChords – chordsDisplay.js (Minimal version for Carousel)
  ------------------------------------------------------------------------------
  ▸ Minimal implementation to support chord carousel
  ▸ Loads chord data and provides it to the carousel
==============================================================================*/

(function () {
  "use strict";

  const DEBUG = true;

  class ChordsDisplay {
    constructor() {
      this.currentSongData = null;
      this.isActive = false;
      this.abortController = null;
    }

    async activate(videoId, controller, options = {}) {
      DEBUG && console.log("[ChordsDisplay] Activating for videoId:", videoId);
      
      this.abortController = controller;
      this.isActive = true;
      let subsetEnsured = false;
      const allowPaidResultRecovery = !!options.allowPaidResultRecovery;

      const ensurePanelSubsetReady = async () => {
        if (subsetEnsured || controller?.signal?.aborted) return;

        if (!window.ensurePanelSubset && window.dynamicLoader?.loadGroup) {
          console.log("[ChordsDisplay] Loading lyricsChords group for ensurePanelSubset...");
          try {
            await window.dynamicLoader.loadGroup('lyricsChords');
          } catch (e) {
            console.warn("[ChordsDisplay] Failed to load lyricsChords group:", e.message);
          }
        }

        if (window.ensurePanelSubset && !controller?.signal?.aborted) {
          // Blocking here is required so carousel chord diagrams are ready immediately.
          await window.ensurePanelSubset(videoId);
          subsetEnsured = true;
        }
      };
      
      // בדיקה אם במצב cache-only (מנוי פעיל שסיים לימיט)
      const cacheOnlyMode = window.ycCacheOnlyMode || false;

      try {
        // Load chord data from database
        let chordData = await window.databaseManager?.loadFromDatabase('chords', videoId);
        
        // If no data in DB, try to download from server (unless in cache-only mode)
        if (!chordData || !chordData.chordText) {
          if (cacheOnlyMode) {
            // מצב cache-only - לא מורידים מהשרת, מציגים הודעה
            console.log("[ChordsDisplay] Cache-only mode - no data in IndexedDB for this video");
            if (window.ycUtils?.showErrorOverlay) {
              window.ycUtils.showErrorOverlay('🎵 This song is not in your library.\n\nYou\'ve reached your monthly limit. Your quota resets next month.', 5000);
            }
            return false;
          }
          
          console.log("[ChordsDisplay] No chord data in DB, downloading from server...");
          
          // 🎯 מיד מציגים progress bar - לא מחכים לתשובה מהשרת
          if (window.extractorModule?.createProgressBar) {
            const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
            const durationMinutes = video?.duration ? video.duration / 60 : null;
            window.extractorModule.createProgressBar(false, false, null, { durationMinutes }); // מתחילים במצב R2 (מהיר)
          }
          
          if (window.databaseManager?.copyLocalChordsToIndexedDB) {
            const downloaded = await window.databaseManager.copyLocalChordsToIndexedDB(
              videoId, 
              { signal: controller?.signal, allowPaidResultRecovery }
            );
            
            // Check if this was the last FREE credit - need to delete IndexedDB after displaying
            const shouldDeleteAfter = downloaded?.shouldDeleteChordsDBAfter;
            if (shouldDeleteAfter) {
              console.log("[ChordsDisplay] 🚨 Last FREE credit used - will delete IndexedDB after displaying");
              this._shouldDeleteChordsDBAfter = true;
            }
            
            if (downloaded) {
              console.log("[ChordsDisplay] Downloaded from server, processing chord data...");

              // Try loading again after download
              chordData = await window.databaseManager.loadFromDatabase('chords', videoId);

              // Ensure PANEL_SUBSET is ready for immediate carousel chord diagrams.
              await ensurePanelSubsetReady();
              chordData = await window.databaseManager.loadFromDatabase('chords', videoId);

              // 🎸 Apply tuning correction after download
              if (window.checkNonStandardTuning) {
                console.log("[ChordsDisplay] 🎸 Checking tuning:", chordData?.tuningValue, chordData?.hasNonStandardTuning);
                window.checkNonStandardTuning(chordData?.tuningValue, chordData?.hasNonStandardTuning);
              }
            } else {
              console.warn("[ChordsDisplay] Failed to download from server");
              return false;
            }
          } else {
            console.error("[ChordsDisplay] copyLocalChordsToIndexedDB not available");
            return false;
          }
        }
        
        // Check again after potential download
        if (!chordData || !chordData.chordText) {
          console.warn("[ChordsDisplay] No chord data found after download attempt");
          return false;
        }
        
        // All Pro users now get complete data from server - no need for separate fetch
        console.log("[ChordsDisplay] ✅ Chords loaded from IndexedDB");
        
        // Ensure subset is present in memory for carousel rendering.
        if (!subsetEnsured) {
          await ensurePanelSubsetReady();
        }

        // If chordModes or chordPositions are still missing, try one more blocking rebuild.
        if ((!chordData.chordModes || !chordData.chordPositions) && !subsetEnsured) {
          await ensurePanelSubsetReady();
          chordData = await window.databaseManager.loadFromDatabase('chords', videoId);
        }

        if (window.ycKeyEstimator?.setCurrentFromData) {
          try {
            window.ycKeyEstimator.setCurrentFromData({ ...chordData, videoId });
          } catch (keyError) {
            console.warn("[ChordsDisplay] Failed estimating song key:", keyError);
          }
        }

        // Parse chord text based on current mode
        const currentMode = window.chordsMode || 'regular';
        let chordTextToUse;
        
        if (chordData.chordText?.regular) {
          // New format with separate texts per mode
          switch (currentMode) {
            case 'regularPlus':
              chordTextToUse = chordData.chordText.regularPlus || chordData.chordText.regular;
              break;
            case 'harmonic':
              chordTextToUse = chordData.chordText.harmonic || chordData.chordText.regular;
              break;
            case 'harmonicPlus':
              chordTextToUse = chordData.chordText.harmonicPlus || chordData.chordText.regular;
              break;
            default:
              chordTextToUse = chordData.chordText.regular;
          }
        } else {
          // Old format - use chordTextHarmonic/chordTextHarmonicPlus fields
          switch (currentMode) {
            case 'regularPlus':
              chordTextToUse = chordData.chordTextRegularPlus || chordData.chordText;
              break;
            case 'harmonic':
              chordTextToUse = chordData.chordTextHarmonic || chordData.chordText;
              break;
            case 'harmonicPlus':
              chordTextToUse = chordData.chordTextHarmonicPlus || chordData.chordText;
              break;
            default:
              chordTextToUse = chordData.chordText;
          }
        }
        
        DEBUG && console.log("[ChordsDisplay] Using mode:", currentMode);
        const chords = this._parseChordText(chordTextToUse);
        
        if (chords.length === 0) {
          console.warn("[ChordsDisplay] No chords parsed");
          return false;
        }

        this.currentSongData = {
          chords: chords,
          videoId: videoId
        };

        DEBUG && console.log("[ChordsDisplay] Loaded", chords.length, "chords");
        
        // 🚨 Delete IndexedDB AFTER displaying chords if this was the last FREE credit
        if (this._shouldDeleteChordsDBAfter) {
          console.log("[ChordsDisplay] 🗑️ Deleting Chords DB after displaying last FREE credit");
          try {
            if (window.databaseManager?.deleteChordsDatabase) {
              await window.databaseManager.deleteChordsDatabase();
            } else {
              console.warn("[ChordsDisplay] databaseManager.deleteChordsDatabase not available - skipping DB deletion");
            }
            console.log("[ChordsDisplay] ✅ Chords DB deleted successfully");
          } catch (e) {
            console.error("[ChordsDisplay] Failed to delete Chords DB:", e);
          }
          this._shouldDeleteChordsDBAfter = false;
        }
        
        return true;

      } catch (error) {
        console.error("[ChordsDisplay] Error activating:", error);

        // Handle specific errors with user-friendly messages
        if (error?.code === 'PROCESSING_FAILED' || error?.message === 'PROCESSING_FAILED') {
          if (window.ycUtils?.showErrorOverlay) {
            const rawMessage = String(error?.message || '').trim();
            const userMessage = rawMessage && rawMessage !== 'PROCESSING_FAILED'
              ? rawMessage
              : 'Processing failed. Please try again later.';
            window.ycUtils.showErrorOverlay(userMessage, 5000);
          }
        }

        return false;
      }
    }

    _parseChordText(chordText) {
      if (!chordText) return [];
      
      const chords = [];
      const parts = chordText.split(',');
      
      for (const part of parts) {
        const [timeStr, name] = part.split(':');
        if (timeStr && name) {
          chords.push({
            time: parseFloat(timeStr),
            name: name.trim()
          });
        }
      }
      
      return chords.sort((a, b) => a.time - b.time);
    }

    partialCleanup() {
      DEBUG && console.log("[ChordsDisplay] Partial cleanup");
      this.currentSongData = null;
      this.isActive = false;
    }

    stopChordMonitoring() {
      // Placeholder for compatibility
    }

    clearAllTimers() {
      // Placeholder for compatibility
    }

    pauseRendering() {
      // Placeholder for compatibility
    }

    resumeRendering() {
      // Placeholder for compatibility
    }

    updateDisplay(time) {
      // Placeholder for compatibility
    }

    forceMemoryCleanup() {
      // Placeholder for compatibility
    }
  }

  // Create global instance
  if (!window.chordsDisplay) {
    window.chordsDisplay = new ChordsDisplay();
    DEBUG && console.log("[ChordsDisplay] Global instance created");
  }

})();
