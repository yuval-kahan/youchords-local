/*==============================================================
  YouChords – buttons/audioManager.js
  --------------------------------------------------------------
  • Audio Manager - מנהל אודיו גלובלי
  • נטען תמיד (לא Lazy Load) כדי לאפשר שינוי pitch מיידי
  • מפריד את "המנוע" מה-UI של הטיונר
==============================================================*/

(function () {
  "use strict";

  // Prevent duplicate loading
  if (window.ycAudioManagerInit) {
    console.log("[AudioManager] Already loaded - skipping");
    return;
  }
  window.ycAudioManagerInit = true;

  // State
  let pitchShifter = null;
  let pitchShifterInitialized = false;

  // Pitch settings (shared with Tuner UI)
  const PITCH_RANGE_SIZE = 100; // cents per range
  const PITCH_MIN_OFFSET = -1200; // -12 semitones
  const PITCH_MAX_OFFSET = 1200; // +12 semitones

  let currentTranspose = 0;
  let currentPitch = 0; // cents within current range
  let pitchRangeOffset = 0; // offset in cents
  let currentSpeed = 100;
  let basePitchHz = 440;

  /**
   * 🎵 Load pitch-shifter.js if not loaded
   */
  async function loadPitchShifterScript() {
    if (window.PitchShifter) return true;

    // Check if script already exists in DOM
    const existingScript = document.querySelector(
      'script[src*="pitch-shifter.js"]'
    );
    if (existingScript) {
      // Wait for it to load
      await new Promise((resolve) => setTimeout(resolve, 200));
      return !!window.PitchShifter;
    }

    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("buttons/pitch-shifter.js");
      script.onload = () => {
        console.log("[AudioManager] ✅ pitch-shifter.js loaded");
        resolve(true);
      };
      script.onerror = () => {
        console.error("[AudioManager] ❌ Failed to load pitch-shifter.js");
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  /**
   * 🎵 Initialize pitch shifter for video
   */
  async function initPitchShifterForVideo() {
    const video = document.querySelector("video.html5-main-video");
    if (!video) {
      console.warn("[AudioManager] Video element not found");
      return false;
    }

    // Load script if needed
    await loadPitchShifterScript();

    if (window.PitchShifter && !pitchShifter) {
      pitchShifter = new window.PitchShifter();
      const success = await pitchShifter.connect(video);
      if (success) {
        console.log("[AudioManager] ✅ Pitch shifter connected");
        return true;
      } else {
        console.warn("[AudioManager] ⚠️ Pitch shifter failed to connect");
        pitchShifter = null;
        return false;
      }
    }

    return !!pitchShifter;
  }

  /**
   * 🎵 Ensure pitch shifter is initialized
   */
  async function ensurePitchShifter() {
    if (!pitchShifterInitialized) {
      pitchShifterInitialized = true;
      await initPitchShifterForVideo();
    }
    return pitchShifter;
  }

  /**
   * 🎵 Get total pitch in cents
   */
  function getTotalPitch() {
    return pitchRangeOffset + currentPitch;
  }

  /**
   * 🎵 Update playback with current settings
   */
  function updatePlayback() {
    const video = document.querySelector("video.html5-main-video");
    if (!video) return;

    const totalPitchCents = getTotalPitch();
    const totalSemitones = currentTranspose + totalPitchCents / 100;

    if (pitchShifter && pitchShifter.isConnected) {
      // Use real pitch shifting
      pitchShifter.setTranspose(currentTranspose);
      pitchShifter.setPitchFine(totalPitchCents);
      pitchShifter.setSpeed(currentSpeed / 100);
    } else {
      // Fallback: pitch and speed are linked
      const pitchRate = Math.pow(2, totalSemitones / 12);
      const speedRate = currentSpeed / 100;
      video.playbackRate = pitchRate * speedRate;
      video.preservesPitch = false;
    }
  }

  /**
   * 🎵 Set pitch for Pitch Change mode
   * Called from tuningAlert.js when panel/carousel opens
   */
  window.setPitchForPitchChange = async function (targetHz) {
    console.log(`[AudioManager] 🎵 setPitchForPitchChange: ${targetHz}Hz`);

    // Calculate cents from 440 Hz
    const totalCents = Math.round(1200 * Math.log2(targetHz / 440));
    pitchRangeOffset =
      Math.floor(totalCents / PITCH_RANGE_SIZE) * PITCH_RANGE_SIZE;
    pitchRangeOffset = Math.max(
      PITCH_MIN_OFFSET,
      Math.min(PITCH_MAX_OFFSET, pitchRangeOffset)
    );
    const sliderValue = totalCents - pitchRangeOffset;
    currentPitch = Math.max(-50, Math.min(50, sliderValue));

    // Initialize and apply
    await ensurePitchShifter();
    updatePlayback();

    window.pitchChangeModeActive = true;
    console.log(
      `[AudioManager] 🎵 Applied: ${totalCents} cents (UI shows 440 Hz)`
    );
  };

  /**
   * 🎵 Reset pitch from Pitch Change mode
   */
  window.resetPitchFromPitchChange = function () {
    pitchRangeOffset = 0;
    currentPitch = 0;
    updatePlayback();
    window.pitchChangeModeActive = false;
    console.log("[AudioManager] 🎵 Pitch reset to 0");
  };

  /**
   * 🎵 Reset video playback to normal
   */
  window.resetVideoPlayback = function () {
    const video = document.querySelector("video.html5-main-video");
    if (video) {
      video.playbackRate = 1.0;
      video.preservesPitch = true;
    }
    currentTranspose = 0;
    currentPitch = 0;
    pitchRangeOffset = 0;
    currentSpeed = 100;
    if (pitchShifter) {
      pitchShifter.setTranspose(0);
      pitchShifter.setPitchFine(0);
      pitchShifter.setSpeed(1.0);
    }
  };

  // Expose internal functions for Tuner UI to use
  window.ycAudioManager = {
    ensurePitchShifter,
    updatePlayback,
    getTotalPitch,
    getState: () => ({
      currentTranspose,
      currentPitch,
      pitchRangeOffset,
      currentSpeed,
      basePitchHz,
      pitchShifterConnected: pitchShifter?.isConnected || false,
    }),
    setState: (state) => {
      if (state.currentTranspose !== undefined)
        currentTranspose = state.currentTranspose;
      if (state.currentPitch !== undefined) currentPitch = state.currentPitch;
      if (state.pitchRangeOffset !== undefined)
        pitchRangeOffset = state.pitchRangeOffset;
      if (state.currentSpeed !== undefined) currentSpeed = state.currentSpeed;
      if (state.basePitchHz !== undefined) basePitchHz = state.basePitchHz;
    },
    getPitchShifter: () => pitchShifter,
  };

  /**
   * 🧹 Cleanup when navigating to a new video
   */
  function cleanup() {
    if (pitchShifter) {
      pitchShifter.disconnect();
      pitchShifter = null;
    }
    pitchShifterInitialized = false;
    currentTranspose = 0;
    currentPitch = 0;
    pitchRangeOffset = 0;
    currentSpeed = 100;
    window.pitchChangeModeActive = false;
    console.log("[AudioManager] 🧹 Cleaned up for new video");
  }

  // Listen for video navigation
  window.addEventListener("yt-navigate-finish", cleanup);

  console.log("[AudioManager] ✅ Module loaded");
})();
