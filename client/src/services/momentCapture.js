/**
 * MomentCapture — HOST-ONLY full screen capture with rolling buffer.
 * 
 * Architecture:
 * ┌──────────────────────────────────────────────────────────┐
 * │  Full Screen (getDisplayMedia - entire monitor)          │
 * │  ┌─────────────────┐  ┌──────────┐  ┌────────────────┐  │
 * │  │  Video Player    │  │  Chat UI │  │  WebRTC Bubbles│  │
 * │  │  (content)       │  │          │  │  (participants)│  │
 * │  └─────────────────┘  └──────────┘  └────────────────┘  │
 * └──────────────────────────────────────────────────────────┘
 *           ↓ Screen Video
 *  ┌────────────────────────────────────────┐
 *  │  AudioContext (mixing 3 sources)       │
 *  │  ├── System audio (from displayMedia)  │
 *  │  ├── Microphone (from getUserMedia)    │
 *  │  └── WebRTC remote audio (from peers)  │
 *  └────────────────────────────────────────┘
 *           ↓ Mixed Audio
 *  ┌────────────────────────────────────────┐
 *  │  MediaRecorder (continuous, 1s chunks) │
 *  │  → Rolling buffer (last 30s of chunks) │
 *  └────────────────────────────────────────┘
 *           ↓ On moment trigger
 *  ┌────────────────────────────────────────┐
 *  │  Extract T-5 to T+10 from buffer      │
 *  │  → Blob → Upload to Cloudinary        │
 *  └────────────────────────────────────────┘
 * 
 * The rolling buffer runs CONTINUOUSLY while the host is in the room.
 * When a moment is triggered (bookmark/reaction/chat spike), we extract
 * the relevant time range from the buffer — including the 5 seconds
 * BEFORE the trigger timestamp.
 */

import api from './api';

const CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1';

// ─── Rolling Buffer ───────────────────────────────────────────
class RollingBuffer {
  constructor(maxSeconds = 30) {
    this.chunks = [];
    this.maxDuration = maxSeconds * 1000;
    this.initSegment = null; // First chunk always contains WebM header
  }

  addChunk(blob, timestamp) {
    // Save the very first chunk as init segment (contains WebM header)
    if (!this.initSegment) {
      this.initSegment = blob;
    }
    this.chunks.push({ blob, timestamp, size: blob.size });
    // Prune chunks older than maxDuration
    const cutoff = timestamp - this.maxDuration;
    this.chunks = this.chunks.filter(c => c.timestamp >= cutoff);
  }

  /**
   * Extract chunks that fall within [startTime, endTime] (milliseconds).
   * Returns array of Blobs in chronological order.
   * ALWAYS includes the init segment (WebM header) as the first blob.
   */
  extractRange(startTime, endTime) {
    const dataChunks = this.chunks
      .filter(c => c.timestamp >= startTime && c.timestamp <= endTime)
      .map(c => c.blob);
    
    // Prepend init segment if it's not already the first chunk
    if (this.initSegment && dataChunks.length > 0) {
      // Check if the init segment is the same as the first data chunk
      if (dataChunks[0] !== this.initSegment) {
        return [this.initSegment, ...dataChunks];
      }
    }
    return dataChunks;
  }

  /**
   * Get total buffered duration in seconds.
   */
  getBufferedDuration() {
    if (this.chunks.length < 2) return 0;
    return (this.chunks[this.chunks.length - 1].timestamp - this.chunks[0].timestamp) / 1000;
  }

  /**
   * Get total buffered size in bytes.
   */
  getBufferedSize() {
    return this.chunks.reduce((sum, c) => sum + c.size, 0);
  }

  clear() {
    this.chunks = [];
    this.initSegment = null;
  }
}

// ─── Main Capture Service ─────────────────────────────────────
class MomentCaptureService {
  constructor() {
    // Recording state
    this.isBuffering = false;       // Continuous rolling buffer active
    this.isExtracting = false;      // Currently extracting a clip
    this.currentExtraction = null;  // Active extraction metadata

    // Media
    this.screenStream = null;       // getDisplayMedia stream (full screen + system audio)
    this.micStream = null;          // getUserMedia stream (microphone)
    this.mediaRecorder = null;
    this.mimeType = null;

    // Audio mixing
    this.audioContext = null;
    this.audioDestination = null;
    this.audioSources = new Map();  // trackId → { source, gain }

    // Rolling buffer (30 seconds)
    this.buffer = new RollingBuffer(30);
    this.bufferStartTime = 0;

    // WebRTC remote streams (set externally via setRemoteStreams)
    this.remoteStreams = [];

    // Extraction queue (if a new moment triggers while extracting)
    this.extractionQueue = [];

    // Callbacks
    this._onCaptureComplete = null;
    this._onCaptureError = null;
    this._onCaptureProgress = null;
    this._onBufferReady = null;

    // Config
    this.BACKWARD_OFFSET = 5000;    // 5 seconds before trigger
    this.FORWARD_DURATION = 10000;  // 10 seconds after trigger
    this.CHUNK_INTERVAL = 1000;     // 1 second chunks
    this.MAX_RETRIES = 3;
  }

  // ─── 1. Start Continuous Buffer (called when host joins room) ───

  /**
   * Start the continuous rolling buffer.
   * This runs for the entire session — NOT per moment.
   * 
   * @param {object} options
   * @param {boolean} options.withMic - Include microphone audio
   * @param {MediaStream[]} options.remoteStreams - WebRTC remote streams
   * @param {boolean} options.audioOnly - Music room (audio only, no screen video)
   */
  async startBuffer(options = {}) {
    if (this.isBuffering) {
      return { success: true, alreadyRunning: true };
    }

    const { withMic = true, remoteStreams = [], audioOnly = false } = options;
    this.remoteStreams = remoteStreams;

    try {
      // ── Step 1: Get full screen capture ──
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: audioOnly ? false : {
          displaySurface: 'monitor',   // Entire screen, not just a tab
          logicalSurface: true,
          cursor: 'always',
          frameRate: { ideal: 30, max: 30 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          suppressLocalAudioPlayback: false, // Keep playing audio locally
        },
        // Chrome-specific: request system audio
        systemAudio: 'include',
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
        monitorTypeSurfaces: 'include',
      });

      // Handle user stopping screen share
      this.screenStream.getVideoTracks().forEach(track => {
        track.onended = () => {
          this.stopBuffer();
        };
      });

      // ── Step 2: Get microphone (optional) ──
      if (withMic) {
        try {
          this.micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
        } catch (micErr) {
          this.micStream = null;
        }
      }

      // ── Step 3: Mix all audio sources ──
      const recordingStream = this._createMixedStream(audioOnly);

      // ── Step 4: Start MediaRecorder with rolling buffer ──
      this._startContinuousRecording(recordingStream);

      this.isBuffering = true;
      this.bufferStartTime = Date.now();
      this._onBufferReady?.();

      return { success: true };

    } catch (error) {
      console.error('[CAPTURE] ❌ Failed to start buffer:', error);
      this._cleanupStreams();
      throw error;
    }
  }

  /**
   * Create a single MediaStream with:
   * - Screen video (full monitor capture)
   * - Mixed audio (system + mic + WebRTC remote)
   */
  _createMixedStream(audioOnly = false) {
    // Initialize AudioContext for mixing
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    this.audioDestination = this.audioContext.createMediaStreamDestination();

    // Source 1: System audio (from screen capture)
    const systemAudioTracks = this.screenStream.getAudioTracks();
    if (systemAudioTracks.length > 0) {
      this._addAudioSource(
        'system',
        new MediaStream(systemAudioTracks),
        0.8  // System audio at 80% — primary source
      );
    }

    // Source 2: Microphone
    if (this.micStream) {
      const micTracks = this.micStream.getAudioTracks();
      if (micTracks.length > 0) {
        this._addAudioSource(
          'mic',
          new MediaStream(micTracks),
          0.7  // Mic at 70% to avoid overpowering video audio
        );
      }
    }

    // Source 3: WebRTC remote participant audio
    this.remoteStreams.forEach((stream, i) => {
      const remoteTracks = stream.getAudioTracks?.() || [];
      if (remoteTracks.length > 0) {
        this._addAudioSource(
          `remote-${i}`,
          new MediaStream(remoteTracks),
          0.6  // Remote audio at 60%
        );
      }
    });

    // Build final recording stream
    const recordingStream = new MediaStream();

    // Add screen video tracks (full monitor)
    if (!audioOnly) {
      this.screenStream.getVideoTracks().forEach(track => {
        recordingStream.addTrack(track);
      });
    }

    // Add mixed audio track
    this.audioDestination.stream.getAudioTracks().forEach(track => {
      recordingStream.addTrack(track);
    });

    return recordingStream;
  }

  /**
   * Add an audio source to the mix.
   */
  _addAudioSource(id, stream, gainValue = 1.0) {
    try {
      const source = this.audioContext.createMediaStreamSource(stream);
      const gain = this.audioContext.createGain();
      gain.gain.value = gainValue;
      source.connect(gain).connect(this.audioDestination);
      this.audioSources.set(id, { source, gain, stream });
    } catch (error) {
    }
  }

  /**
   * Update WebRTC remote streams (call when participants join/leave).
   */
  updateRemoteStreams(remoteStreams = []) {
    // Remove old remote audio sources
    for (const [id, entry] of this.audioSources.entries()) {
      if (id.startsWith('remote-')) {
        try { entry.source.disconnect(); } catch (_) {}
        this.audioSources.delete(id);
      }
    }

    // Add new remote audio sources
    this.remoteStreams = remoteStreams;
    remoteStreams.forEach((stream, i) => {
      const remoteTracks = stream.getAudioTracks?.() || [];
      if (remoteTracks.length > 0 && this.audioDestination) {
        this._addAudioSource(
          `remote-${i}`,
          new MediaStream(remoteTracks),
          0.6
        );
      }
    });
  }

  /**
   * Start the continuous MediaRecorder that feeds the rolling buffer.
   * Also saves the init segment for later use in extraction.
   */
  _startContinuousRecording(stream) {
    // Negotiate best MIME type
    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
    ];

    let options = { videoBitsPerSecond: 3_000_000 }; // 3 Mbps for full screen
    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        options.mimeType = mimeType;
        this.mimeType = mimeType;
        break;
      }
    }


    const recorder = new MediaRecorder(stream, options);
    this._chunkCount = 0;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this._chunkCount++;
        this.buffer.addChunk(e.data, Date.now());
        
        // Log first few chunks for debugging
        if (this._chunkCount <= 3) {
        }
      }
    };

    recorder.onerror = (e) => {
      console.error('[CAPTURE] MediaRecorder error:', e);
      this._onCaptureError?.(e.error || new Error('Recording failed'));
    };

    recorder.onstop = () => {
    };

    // Start recording with 1-second chunks
    recorder.start(this.CHUNK_INTERVAL);
    this.mediaRecorder = recorder;
  }

  // ─── 2. Extract Clip (called on moment trigger) ───

  /**
   * Extract a clip using a PARALLEL recorder.
   * The continuous buffer recorder is NEVER stopped — it keeps running.
   * A second MediaRecorder is spawned on the same stream tracks to
   * record the clip independently. This prevents YouTube looping/corruption.
   *
   * Flow:
   * 1. Build a fresh MediaStream from the SAME underlying tracks
   * 2. Create a NEW MediaRecorder (parallel to the buffer recorder)
   * 3. Record for FORWARD_DURATION seconds
   * 4. Stop only the clip recorder → valid WebM blob
   * 5. Buffer recorder continues uninterrupted
   */
  async extractClip(captureData) {
    if (this.isExtracting) {
      this.extractionQueue.push(captureData);
      return { success: true, queued: true };
    }

    if (!this.isBuffering || !this.screenStream) {
      throw new Error('Buffer not running — cannot extract clip');
    }

    this.isExtracting = true;
    this.currentExtraction = captureData;
    this._onCaptureProgress?.({ phase: 'extracting', momentId: captureData.momentId });

    const clipDurationMs = this.FORWARD_DURATION;

    this._onCaptureProgress?.({
      phase: 'recording_forward',
      momentId: captureData.momentId,
      waitSeconds: clipDurationMs / 1000
    });

    try {
      // Record clip WITHOUT touching the continuous buffer recorder
      const clipBlob = await this._recordParallelClip(clipDurationMs);

      if (!clipBlob || clipBlob.size < 1000) {
        throw new Error('Recorded clip too small or empty');
      }


      // Fire instant local preview
      this._onBlobReady?.({
        blob: clipBlob,
        momentId: captureData.momentId,
        captureJobId: captureData.captureJobId,
        size: clipBlob.size,
      });

      this._onCaptureProgress?.({ phase: 'uploading', momentId: captureData.momentId, size: clipBlob.size });

      // Upload to Cloudinary in background
      const result = await this._uploadToCloudinary(clipBlob, captureData);

      this.isExtracting = false;
      this.currentExtraction = null;
      this._onCaptureComplete?.(result);
      this._processQueue();
      return result;

    } catch (error) {
      console.error('[CAPTURE] Extraction failed:', error);
      this.isExtracting = false;
      this.currentExtraction = null;
      this._onCaptureError?.(error);
      this._processQueue();
      throw error;
    }
  }

  /**
   * Record a clip using a PARALLEL MediaRecorder.
   * Does NOT stop or interfere with the main continuous recorder.
   * Creates a new stream wrapper on the same underlying tracks.
   */
  _recordParallelClip(durationMs) {
    return new Promise((resolve, reject) => {
      // Build a new MediaStream using the SAME underlying tracks
      const stream = this._getRecordingStream();
      if (!stream || stream.getTracks().length === 0) {
        reject(new Error('No recording stream available for clip'));
        return;
      }

      const chunks = [];
      const options = { videoBitsPerSecond: 3_000_000 };
      if (this.mimeType) options.mimeType = this.mimeType;

      let recorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch (e) {
        reject(new Error('Failed to create clip recorder: ' + e.message));
        return;
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: this.mimeType || 'video/webm' });
        resolve(blob);
      };

      recorder.onerror = (e) => {
        reject(e.error || new Error('Clip recording error'));
      };

      // Start the parallel recorder with 500ms chunks for finer granularity
      recorder.start(500);

      // Stop after the desired duration (+300ms safety margin)
      setTimeout(() => {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      }, durationMs + 300);
    });
  }

  /**
   * Get a fresh MediaStream using the same underlying screen+audio tracks.
   * Creates a NEW MediaStream wrapper — does not clone or modify original tracks.
   * Multiple MediaRecorders can read from the same tracks simultaneously.
   */
  _getRecordingStream() {
    if (!this.screenStream) return null;

    const videoTracks = this.screenStream.getVideoTracks();
    if (videoTracks.length === 0) return null;

    const tracks = [...videoTracks];

    // Add mixed audio if available
    if (this.audioDestination) {
      const audioTracks = this.audioDestination.stream.getAudioTracks();
      tracks.push(...audioTracks);
    } else {
      // Fallback: use screen stream audio directly
      const audioTracks = this.screenStream.getAudioTracks();
      tracks.push(...audioTracks);
    }

    return new MediaStream(tracks);
  }

  /**
   * Process queued extractions (for overlapping triggers).
   */
  async _processQueue() {
    if (this.extractionQueue.length > 0) {
      const next = this.extractionQueue.shift();
      // Small delay to avoid back-to-back extractions
      setTimeout(() => {
        this.extractClip(next).catch(err => {
          console.error('[CAPTURE] Queued extraction failed:', err);
        });
      }, 500);
    }
  }

  // ─── 3. Upload to Cloudinary ───────────────────────────────

  /**
   * Upload captured video directly to Cloudinary (bypasses server).
   * Retries up to MAX_RETRIES on failure with exponential backoff.
   */
  async _uploadToCloudinary(blob, captureData, attempt = 0) {
    const { roomCode, momentId, captureJobId } = captureData;

    try {
      // Get upload signature from server
      const sigResponse = await api.get(
        `/moments/upload-signature?roomCode=${encodeURIComponent(roomCode)}`
      );
      const sigData = sigResponse.data?.data;
      if (!sigData) throw new Error('Failed to get upload signature');

      const formData = new FormData();
      formData.append('file', blob, `moment-${momentId}-${Date.now()}.webm`);
      formData.append('api_key', sigData.apiKey);
      formData.append('timestamp', String(sigData.timestamp));
      formData.append('signature', sigData.signature);
      formData.append('folder', sigData.folder);
      // NOTE: resource_type goes in the URL path, NOT form data

      const uploadUrl = `${CLOUDINARY_UPLOAD_URL}/${sigData.cloudName}/video/upload`;

      this._onCaptureProgress?.({
        phase: 'uploading',
        momentId,
        size: blob.size,
        attempt: attempt + 1
      });

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        console.error('[CAPTURE] Cloudinary error body:', errBody);
        throw new Error(`Cloudinary upload failed: ${response.status} ${response.statusText} — ${errBody.substring(0, 200)}`);
      }

      const result = await response.json();

      this._onCaptureProgress?.({ phase: 'complete', momentId });

      return {
        success: true,
        momentId,
        captureJobId,
        videoData: {
          url: result.secure_url,
          secure_url: result.secure_url,
          publicId: result.public_id,
          public_id: result.public_id,
          duration: result.duration,
          size: result.bytes,
          bytes: result.bytes,
          format: result.format,
          width: result.width,
          height: result.height,
          thumbnailUrl: result.secure_url.replace(/\.[^.]+$/, '.jpg'),
        }
      };

    } catch (error) {
      if (attempt < this.MAX_RETRIES) {
        const backoff = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        await new Promise(r => setTimeout(r, backoff));
        return this._uploadToCloudinary(blob, captureData, attempt + 1);
      }
      throw error;
    }
  }

  // ─── 4. Stop Buffer (called when host leaves room) ─────────

  /**
   * Stop the continuous rolling buffer.
   * Called when host leaves room or session ends.
   */
  stopBuffer() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    this.isBuffering = false;
    this.isExtracting = false;
    this.currentExtraction = null;
    this.extractionQueue = [];
    this.buffer.clear();
    this._cleanupStreams();
  }

  /**
   * Clean up all media streams and audio context.
   */
  _cleanupStreams() {
    // Stop screen stream
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }

    // Stop mic stream
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }

    // Disconnect audio sources
    for (const [, entry] of this.audioSources) {
      try { entry.source.disconnect(); } catch (_) {}
    }
    this.audioSources.clear();

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.audioDestination = null;
  }

  // ─── 5. Callbacks ──────────────────────────────────────────

  onCaptureComplete(cb) { this._onCaptureComplete = cb; }
  onCaptureError(cb) { this._onCaptureError = cb; }
  onCaptureProgress(cb) { this._onCaptureProgress = cb; }
  onBlobReady(cb) { this._onBlobReady = cb; }
  onBufferReady(cb) { this._onBufferReady = cb; }

  // ─── 6. Status ─────────────────────────────────────────────

  getStatus() {
    return {
      isBuffering: this.isBuffering,
      isExtracting: this.isExtracting,
      bufferDuration: this.buffer.getBufferedDuration(),
      bufferSize: this.buffer.getBufferedSize(),
      chunksCount: this.buffer.chunks.length,
      queueLength: this.extractionQueue.length,
      hasScreenStream: !!this.screenStream,
      hasMicStream: !!this.micStream,
      audioSourceCount: this.audioSources.size,
    };
  }

  static isSupported() {
    return !!(navigator.mediaDevices?.getDisplayMedia);
  }

  /**
   * Full cleanup — call on unmount.
   */
  cleanup() {
    this.stopBuffer();
  }
}

export default new MomentCaptureService();