/*==============================================================
  YouChords – buttons/pitch-shifter.js
  --------------------------------------------------------------
  • Real-time pitch shifting using Web Audio API
  • Phase Vocoder algorithm for high-quality pitch shifting
  • Separate speed control with preservesPitch
==============================================================*/

class PitchShifter {
  constructor() {
    this.audioContext = null;
    this.sourceNode = null;
    this.scriptNode = null;
    this.gainNode = null;
    this.isConnected = false;
    this.videoElement = null;

    // Pitch settings
    this.transposeSemitones = 0;
    this.pitchCents = 0;
    this.speed = 1.0;
    this.pitchRatio = 1.0;

    // Phase Vocoder settings
    this.fftSize = 2048;
    this.hopSize = this.fftSize / 4; // 75% overlap
    this.windowFunction = null;

    // Circular buffers
    this.inputBuffer = null;
    this.outputBuffer = null;
    this.inputWritePos = 0;
    this.outputWritePos = 0;
    this.outputReadPos = 0;

    // Phase vocoder state
    this.lastInputPhase = null;
    this.lastOutputPhase = null;
    this.accumulatedPhase = null;

    // FFT arrays
    this.fftReal = null;
    this.fftImag = null;
    this.prevMagnitude = null;
    
    // Pre-computed lookup tables for optimization
    this.twiddleReal = null;
    this.twiddleImag = null;
    this.bitReversalTable = null;
    this.bufferMask = 0; // For fast modulo with bitwise AND
  }

  async connect(videoElement) {
    if (this.isConnected) {
      this.disconnect();
    }

    try {
      this.videoElement = videoElement;

      // Create audio context
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      // Create source from video
      this.sourceNode =
        this.audioContext.createMediaElementSource(videoElement);

      // Initialize phase vocoder
      this._initPhaseVocoder();

      // Create script processor
      const bufferSize = 4096;
      this.scriptNode = this.audioContext.createScriptProcessor(
        bufferSize,
        2,
        2
      );
      this.scriptNode.onaudioprocess = (e) => this._processAudio(e);

      // Create gain node
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;

      // Connect: source -> scriptProcessor -> gain -> destination
      this.sourceNode.connect(this.scriptNode);
      this.scriptNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      this.isConnected = true;
      console.log("[PitchShifter] ✅ Connected with Phase Vocoder");
      return true;
    } catch (err) {
      console.error("[PitchShifter] ❌ Failed to connect:", err);
      this._connectDirect();
      return false;
    }
  }

  _initPhaseVocoder() {
    const bufferLength = this.fftSize * 8;

    // Circular buffers for each channel
    this.inputBuffer = [
      new Float32Array(bufferLength),
      new Float32Array(bufferLength),
    ];
    this.outputBuffer = [
      new Float32Array(bufferLength),
      new Float32Array(bufferLength),
    ];

    this.inputWritePos = 0;
    this.outputWritePos = 0;
    this.outputReadPos = 0;

    // Phase arrays for each channel
    this.lastInputPhase = [
      new Float32Array(this.fftSize),
      new Float32Array(this.fftSize),
    ];
    this.lastOutputPhase = [
      new Float32Array(this.fftSize),
      new Float32Array(this.fftSize),
    ];
    this.accumulatedPhase = [
      new Float32Array(this.fftSize),
      new Float32Array(this.fftSize),
    ];

    // FFT working arrays
    this.fftReal = new Float32Array(this.fftSize);
    this.fftImag = new Float32Array(this.fftSize);

    // Reusable frame buffer (avoid GC pressure)
    this.frameBuffer = new Float32Array(this.fftSize);

    // Reusable IFFT temp arrays
    this.ifftTempReal = new Float32Array(this.fftSize);
    this.ifftTempImag = new Float32Array(this.fftSize);
    
    // Create Hann window
    this.windowFunction = new Float32Array(this.fftSize);
    for (let i = 0; i < this.fftSize; i++) {
      this.windowFunction[i] =
        0.5 * (1 - Math.cos((2 * Math.PI * i) / this.fftSize));
    }
    
    // Pre-compute twiddle factors for FFT optimization
    this._initTwiddleFactors();
    
    // Pre-compute bit-reversal table
    this._initBitReversalTable();
    
    // Buffer mask for fast modulo (bufferLength must be power of 2)
    this.bufferMask = this.inputBuffer[0].length - 1;
  }
  
  _initTwiddleFactors() {
    const n = this.fftSize;
    this.twiddleReal = new Float32Array(n / 2);
    this.twiddleImag = new Float32Array(n / 2);
    
    for (let i = 0; i < n / 2; i++) {
      const angle = (-2 * Math.PI * i) / n;
      this.twiddleReal[i] = Math.cos(angle);
      this.twiddleImag[i] = Math.sin(angle);
    }
  }
  
  _initBitReversalTable() {
    const n = this.fftSize;
    const levels = Math.log2(n);
    this.bitReversalTable = new Uint16Array(n);
    
    for (let i = 0; i < n; i++) {
      let j = 0;
      for (let k = 0; k < levels; k++) {
        j = (j << 1) | ((i >> k) & 1);
      }
      this.bitReversalTable[i] = j;
    }
  }

  _connectDirect() {
    try {
      if (this.sourceNode && this.audioContext) {
        this.sourceNode.connect(this.audioContext.destination);
        console.log("[PitchShifter] Connected directly (no pitch shifting)");
      }
    } catch (err) {
      console.error("[PitchShifter] Direct connect failed:", err);
    }
  }

  _processAudio(e) {
    const inputL = e.inputBuffer.getChannelData(0);
    const inputR = e.inputBuffer.getChannelData(1);
    const outputL = e.outputBuffer.getChannelData(0);
    const outputR = e.outputBuffer.getChannelData(1);

    const len = inputL.length;

    // If no pitch shift needed, pass through
    if (Math.abs(this.pitchRatio - 1.0) < 0.001) {
      outputL.set(inputL);
      outputR.set(inputR);
      return;
    }

    // Write input to circular buffer (using bitwise AND for fast modulo)
    const mask = this.bufferMask;
    for (let i = 0; i < len; i++) {
      this.inputBuffer[0][this.inputWritePos] = inputL[i];
      this.inputBuffer[1][this.inputWritePos] = inputR[i];
      this.inputWritePos = (this.inputWritePos + 1) & mask;
    }

    // Process with phase vocoder
    this._processPhaseVocoder(len);

    // Read from output buffer (using bitwise AND for fast modulo)
    for (let i = 0; i < len; i++) {
      outputL[i] = this.outputBuffer[0][this.outputReadPos];
      outputR[i] = this.outputBuffer[1][this.outputReadPos];

      // Clear after reading
      this.outputBuffer[0][this.outputReadPos] = 0;
      this.outputBuffer[1][this.outputReadPos] = 0;

      this.outputReadPos = (this.outputReadPos + 1) & mask;
    }
  }

  _processPhaseVocoder(samplesNeeded) {
    const analysisHop = this.hopSize;
    const synthesisHop = Math.round(this.hopSize / this.pitchRatio);

    // Process frames
    while (samplesNeeded > 0) {
      // Process each channel
      for (let ch = 0; ch < 2; ch++) {
        this._processFrame(ch, analysisHop, synthesisHop);
      }

      samplesNeeded -= synthesisHop;
    }
  }

  _processFrame(channel, analysisHop, synthesisHop) {
    const mask = this.bufferMask; // Fast modulo using bitwise AND
    const frame = this.frameBuffer; // Reuse buffer instead of creating new one

    // Clear frame buffer
    frame.fill(0);

    // Read frame from input buffer with window (using bitwise AND for fast modulo)
    let readPos = (this.inputWritePos - this.fftSize + this.inputBuffer[0].length) & mask;
    for (let i = 0; i < this.fftSize; i++) {
      frame[i] = this.inputBuffer[channel][readPos] * this.windowFunction[i];
      readPos = (readPos + 1) & mask;
    }

    // FFT
    this._fft(frame, this.fftReal, this.fftImag);

    // Phase vocoder processing
    const halfSize = this.fftSize / 2;
    const freqPerBin = this.audioContext.sampleRate / this.fftSize;
    const expectedPhaseChange = (2 * Math.PI * analysisHop) / this.fftSize;

    for (let k = 0; k <= halfSize; k++) {
      // Get magnitude and phase
      const real = this.fftReal[k];
      const imag = this.fftImag[k];
      const magnitude = Math.sqrt(real * real + imag * imag);
      const phase = Math.atan2(imag, real);

      // Calculate phase difference
      let phaseDiff = phase - this.lastInputPhase[channel][k];
      this.lastInputPhase[channel][k] = phase;

      // Remove expected phase change
      phaseDiff -= k * expectedPhaseChange;

      // Wrap to [-PI, PI]
      phaseDiff = this._wrapPhase(phaseDiff);

      // Calculate true frequency
      const trueFreq =
        k * freqPerBin +
        (phaseDiff * this.audioContext.sampleRate) /
          (2 * Math.PI * analysisHop);

      // Accumulate phase for synthesis
      const synthPhaseChange =
        (2 * Math.PI * trueFreq * synthesisHop) / this.audioContext.sampleRate;
      this.accumulatedPhase[channel][k] += synthPhaseChange;

      // Convert back to rectangular
      this.fftReal[k] = magnitude * Math.cos(this.accumulatedPhase[channel][k]);
      this.fftImag[k] = magnitude * Math.sin(this.accumulatedPhase[channel][k]);

      // Mirror for negative frequencies
      if (k > 0 && k < halfSize) {
        this.fftReal[this.fftSize - k] = this.fftReal[k];
        this.fftImag[this.fftSize - k] = -this.fftImag[k];
      }
    }

    // Inverse FFT
    this._ifft(this.fftReal, this.fftImag, frame);

    // Apply window and overlap-add to output (using bitwise AND for fast modulo)
    let writePos = this.outputWritePos;
    for (let i = 0; i < this.fftSize; i++) {
      this.outputBuffer[channel][writePos] +=
        frame[i] * this.windowFunction[i] * 0.5;
      writePos = (writePos + 1) & mask;
    }

    // Advance output write position
    this.outputWritePos = (this.outputWritePos + synthesisHop) & mask;
  }

  // Optimized phase wrapping using math formula instead of while loops
  _wrapPhase(phase) {
    return phase - Math.round(phase / (2 * Math.PI)) * 2 * Math.PI;
  }

  // Optimized FFT using pre-computed lookup tables
  _fft(input, outReal, outImag) {
    const n = input.length;

    // Bit-reversal permutation using pre-computed table
    for (let i = 0; i < n; i++) {
      const j = this.bitReversalTable[i];
      outReal[i] = input[j];
      outImag[i] = 0;
    }

    // Cooley-Tukey FFT with pre-computed twiddle factors
    for (let size = 2; size <= n; size *= 2) {
      const halfSize = size / 2;
      const tableStep = n / size;

      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < halfSize; j++) {
          const twiddleIdx = j * tableStep;
          const cos = this.twiddleReal[twiddleIdx];
          const sin = this.twiddleImag[twiddleIdx];

          const idx1 = i + j;
          const idx2 = i + j + halfSize;

          const tReal = outReal[idx2] * cos - outImag[idx2] * sin;
          const tImag = outReal[idx2] * sin + outImag[idx2] * cos;

          outReal[idx2] = outReal[idx1] - tReal;
          outImag[idx2] = outImag[idx1] - tImag;
          outReal[idx1] = outReal[idx1] + tReal;
          outImag[idx1] = outImag[idx1] + tImag;
        }
      }
    }
  }

  _ifft(real, imag, output) {
    const n = real.length;

    // Conjugate
    for (let i = 0; i < n; i++) {
      imag[i] = -imag[i];
    }

    // Forward FFT - use pre-allocated buffers
    const tempReal = this.ifftTempReal;
    const tempImag = this.ifftTempImag;

    // Bit-reversal using pre-computed table
    for (let i = 0; i < n; i++) {
      const j = this.bitReversalTable[i];
      tempReal[i] = real[j];
      tempImag[i] = imag[j];
    }

    // FFT with pre-computed twiddle factors
    for (let size = 2; size <= n; size *= 2) {
      const halfSize = size / 2;
      const tableStep = n / size;

      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < halfSize; j++) {
          const twiddleIdx = j * tableStep;
          const cos = this.twiddleReal[twiddleIdx];
          const sin = this.twiddleImag[twiddleIdx];

          const idx1 = i + j;
          const idx2 = i + j + halfSize;

          const tReal = tempReal[idx2] * cos - tempImag[idx2] * sin;
          const tImag = tempReal[idx2] * sin + tempImag[idx2] * cos;

          tempReal[idx2] = tempReal[idx1] - tReal;
          tempImag[idx2] = tempImag[idx1] - tImag;
          tempReal[idx1] = tempReal[idx1] + tReal;
          tempImag[idx1] = tempImag[idx1] + tImag;
        }
      }
    }

    // Conjugate and scale
    for (let i = 0; i < n; i++) {
      output[i] = tempReal[i] / n;
    }

    // Restore imag
    for (let i = 0; i < n; i++) {
      imag[i] = -imag[i];
    }
  }

  disconnect() {
    if (!this.isConnected) return;

    try {
      if (this.scriptNode) {
        this.scriptNode.onaudioprocess = null;
        this.scriptNode.disconnect();
      }
      if (this.sourceNode) this.sourceNode.disconnect();
      if (this.gainNode) this.gainNode.disconnect();
      if (this.audioContext && this.audioContext.state !== "closed") {
        this.audioContext.close();
      }

      this.audioContext = null;
      this.sourceNode = null;
      this.scriptNode = null;
      this.gainNode = null;
      this.isConnected = false;

      console.log("[PitchShifter] Disconnected");
    } catch (err) {
      console.error("[PitchShifter] Error disconnecting:", err);
    }
  }

  setTranspose(semitones) {
    this.transposeSemitones = Math.max(-12, Math.min(12, semitones));
    this._updatePitchRatio();
  }

  setPitchFine(cents) {
    this.pitchCents = Math.max(-50, Math.min(50, cents));
    this._updatePitchRatio();
  }

  setSpeed(speed) {
    this.speed = Math.max(0.5, Math.min(2.0, speed));
    if (this.videoElement) {
      this.videoElement.playbackRate = this.speed;
      this.videoElement.preservesPitch = true;
    }
  }

  _updatePitchRatio() {
    const totalSemitones = this.transposeSemitones + this.pitchCents / 100;
    this.pitchRatio = Math.pow(2, totalSemitones / 12);
    console.log(
      `[PitchShifter] Pitch: ${this.pitchRatio.toFixed(
        4
      )} (${totalSemitones.toFixed(2)} semitones)`
    );
  }

  getState() {
    return {
      isConnected: this.isConnected,
      transpose: this.transposeSemitones,
      pitchCents: this.pitchCents,
      speed: this.speed,
      pitchRatio: this.pitchRatio,
    };
  }
}

// Export
window.PitchShifter = PitchShifter;
console.log("[PitchShifter] ✅ Phase Vocoder module loaded");
