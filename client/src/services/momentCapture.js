/**
 * Client-side moment capture service
 * Handles screen recording, participant video capture, and upload
 */

class MomentCaptureService {
  constructor() {
    this.recorders = new Map();
    this.streams = new Map();
    this.mediaRecorders = new Map();
    this.isRecording = false;
    this.currentMoment = null;
    this.videoElements = new Map(); // Reusable video elements (now class property)
    this.audioContext = null;
    this.animationFrame = null;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = 1920;
    this.canvas.height = 1080;
    this.screenStream = null; // Store screen stream for reuse
  }

  /**
   * Request screen capture permission once
   */
  async requestScreenCapture() {
    if (this.screenStream) return this.screenStream;
    
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
          displaySurface: "browser",
          logicalSurface: true,
          frameRate: 30
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      
      // Handle stream end (user stops sharing)
      this.screenStream.getVideoTracks()[0].onended = () => {
        this.screenStream = null;
      };
      
      return this.screenStream;
    } catch (error) {
      console.error('Screen capture permission denied:', error);
      throw error;
    }
  }

  /**
   * Start capturing a moment
   */
  async startCapture(momentData) {
    const { momentId, captureJobId, timestamp, duration, participants } = momentData;
    
    try {
      this.isRecording = true;
      this.currentMoment = { momentId, captureJobId, timestamp, duration };
      
      // Initialize audio context if needed
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      // Gather all media sources
      const sources = await this.gatherMediaSources(participants);
      
      // Create video mixer
      const mixedStream = await this.createVideoMixer(sources);
      
      // Start recording
      const recorder = await this.startRecording(mixedStream, momentData);
      
      // Auto-stop after duration
      setTimeout(() => this.stopCapture(momentId), duration * 1000);
      
      return { success: true, recorderId: recorder.id };
      
    } catch (error) {
      console.error('Start capture error:', error);
      this.isRecording = false;
      throw error;
    }
  }

  /**
   * Gather all media sources
   */
  async gatherMediaSources(participants) {
    const sources = {
      screen: null,
      localVideo: null,
      participants: []
    };

    try {
      // Get screen stream (reuse if already have permission)
      sources.screen = await this.requestScreenCapture();

      // Find local video element
      const videoElement = document.querySelector('video');
      if (videoElement && videoElement.srcObject) {
        sources.localVideo = videoElement.srcObject;
      }

      // Get participant streams
      for (const participant of participants) {
        const stream = await this.getParticipantStream(participant.userId);
        if (stream) {
          sources.participants.push({
            userId: participant.userId,
            stream,
            videoTrack: stream.getVideoTracks()[0],
            audioTrack: stream.getAudioTracks()[0]
          });
        }
      }

      return sources;

    } catch (error) {
      console.error('Gather media sources error:', error);
      throw error;
    }
  }

  /**
   * Get or create video element for track
   */
  getVideoElement(track) {
    if (!this.videoElements.has(track.id)) {
      const video = document.createElement('video');
      video.srcObject = new MediaStream([track]);
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      this.videoElements.set(track.id, video);
    }
    return this.videoElements.get(track.id);
  }

  /**
   * Create video mixer combining all sources with audio gain
   */
  async createVideoMixer(sources) {
    const ctx = this.ctx;
    const destination = this.audioContext.createMediaStreamDestination();

    // Add all audio sources with gain control
    const addAudioSource = (track, gainValue = 0.7) => {
      if (!track) return;
      
      const source = this.audioContext.createMediaStreamSource(
        new MediaStream([track])
      );
      const gain = this.audioContext.createGain();
      gain.gain.value = gainValue;
      source.connect(gain).connect(destination);
    };

    // Screen audio at 50% to not overpower participant audio
    if (sources.screen?.getAudioTracks()[0]) {
      addAudioSource(sources.screen.getAudioTracks()[0], 0.5);
    }

    // Local video audio at 50%
    if (sources.localVideo?.getAudioTracks()[0]) {
      addAudioSource(sources.localVideo.getAudioTracks()[0], 0.5);
    }

    // Participant audio at 70%
    sources.participants.forEach(p => {
      if (p.audioTrack) {
        addAudioSource(p.audioTrack, 0.7);
      }
    });

    // Video mixing loop
    const drawFrame = () => {
      if (!this.isRecording) return;

      ctx.clearRect(0, 0, 1920, 1080);
      ctx.fillStyle = '#0B0F1A';
      ctx.fillRect(0, 0, 1920, 1080);

      // Draw main video
      if (sources.screen?.getVideoTracks()[0]) {
        const video = this.getVideoElement(sources.screen.getVideoTracks()[0]);
        if (video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, 1920, 1080);
        }
      } else if (sources.localVideo?.getVideoTracks()[0]) {
        const video = this.getVideoElement(sources.localVideo.getVideoTracks()[0]);
        if (video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, 1920, 1080);
        }
      }

      // Draw participant videos
      const pipWidth = 240;
      const pipHeight = 135;
      const startX = 1920 - pipWidth - 20;
      const startY = 1080 - pipHeight - 20;

      sources.participants.forEach((p, index) => {
        if (p.videoTrack) {
          const video = this.getVideoElement(p.videoTrack);
          if (video.readyState >= 2) {
            const x = startX - (index * (pipWidth + 10));
            const y = startY;
            
            ctx.drawImage(video, x, y, pipWidth, pipHeight);
            
            ctx.strokeStyle = '#3B82F6';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, pipWidth, pipHeight);
            
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px Inter, sans-serif';
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 10;
            ctx.fillText(p.userId.slice(0, 8), x + 5, y + 20);
            ctx.shadowBlur = 0;
          }
        }
      });

      // Draw timestamp
      const now = new Date();
      const timeStr = now.toLocaleTimeString();
      ctx.font = 'bold 24px Inter, sans-serif';
      ctx.fillStyle = 'white';
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 10;
      ctx.fillText(timeStr, 50, 1000);
      
      ctx.font = 'bold 36px Space Grotesk, sans-serif';
      ctx.fillStyle = '#3B82F6';
      ctx.fillText('SyncPlay', 50, 1050);

      this.animationFrame = requestAnimationFrame(drawFrame);
    };

    drawFrame();

    const mixedStream = this.canvas.captureStream(30);
    destination.stream.getAudioTracks().forEach(track => {
      mixedStream.addTrack(track);
    });

    return mixedStream;
  }

  /**
   * Start recording with compression
   */
  async startRecording(stream, momentData) {
    const { momentId: _momentId, captureJobId: _captureJobId } = momentData;
    
    // Check supported MIME types
    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    
    let options = { videoBitsPerSecond: 2000000 }; // 2 Mbps
    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        options.mimeType = mimeType;
        break;
      }
    }

    const recorder = new MediaRecorder(stream, options);
    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      
      // Compress if needed
      const compressedBlob = await this.compressVideo(blob);
      
      await this.uploadMoment(compressedBlob, momentData);
      
      // Stop all tracks but keep screen stream for reuse
      stream.getTracks().forEach(track => {
        if (track.kind === 'video' && track !== this.screenStream?.getVideoTracks()[0]) {
          track.stop();
        }
      });
      
      // Cancel animation frame
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
      }
    };

    recorder.start(1000);
    
    const recorderId = `rec-${Date.now()}`;
    this.mediaRecorders.set(recorderId, recorder);

    return { id: recorderId, recorder };
  }

  /**
   * Compress video blob
   */
  async compressVideo(blob) {
    if (blob.size > 50 * 1024 * 1024) {
      console.warn('Video large, may fail upload');
    }
    return blob;
  }

  /**
   * Stop capture
   */
  async stopCapture() {
    this.isRecording = false;
    
    for (const [id, recorder] of this.mediaRecorders) {
      if (recorder.state === 'recording') {
        recorder.stop();
        this.mediaRecorders.delete(id);
      }
    }
    
    this.currentMoment = null;
  }

  /**
   * Upload captured moment
   */
  async uploadMoment(blob, momentData) {
    const { momentId, captureJobId, timestamp } = momentData;
    
    try {
      const formData = new FormData();
      formData.append('video', blob, `moment-${Date.now()}.webm`);
      formData.append('momentId', momentId);
      formData.append('captureJobId', captureJobId);
      formData.append('metadata', JSON.stringify({
        timestamp,
        userAgent: navigator.userAgent,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height
      }));

      const response = await fetch('/api/moments/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (result.success) {
        return result;
      }

      return result;

    } catch (error) {
      console.error('Upload moment error:', error);
      throw error;
    }
  }

  /**
   * Get participant stream (from WebRTC)
   */
  async getParticipantStream() {
    // This would be connected to your WebRTC service
    return null;
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    
    // Clear video elements
    this.videoElements.clear();
    
    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export default new MomentCaptureService();