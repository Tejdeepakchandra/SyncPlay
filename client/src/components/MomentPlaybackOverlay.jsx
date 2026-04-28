import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, Volume2, VolumeX, Maximize2 } from 'lucide-react';

/**
 * MomentPlaybackOverlay — Floating video player for watching moments
 * independently without desyncing the main room playback.
 * Supports instant blob URL preview with seamless swap to Cloudinary URL.
 */
const MomentPlaybackOverlay = ({ moment, isVisible, onClose }) => {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(null);

  // Track src changes (blob → cloudinary swap)
  useEffect(() => {
    if (!moment?.videoUrl) return;
    if (currentSrc === moment.videoUrl) return;

    const video = videoRef.current;
    if (!video) {
      setCurrentSrc(moment.videoUrl);
      return;
    }

    // If switching from blob to cloudinary, remember playback position
    const currentTime = video.currentTime;
    const wasPlaying = !video.paused;

    setCurrentSrc(moment.videoUrl);

    // Small delay to allow src change to take effect
    requestAnimationFrame(() => {
      if (video.src !== moment.videoUrl) {
        video.src = moment.videoUrl;
        video.load();
      }
      video.currentTime = currentTime;
      if (wasPlaying) video.play().catch(() => {});
    });
  }, [moment?.videoUrl]);

  // Autoplay when shown
  useEffect(() => {
    if (isVisible && videoRef.current && currentSrc) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
    if (!isVisible) {
      setIsPlaying(false);
      setProgress(0);
    }
  }, [isVisible, currentSrc]);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (v && v.duration > 0) {
      setProgress((v.currentTime / v.duration) * 100);
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
  };

  const handleSeek = (e) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * v.duration;
  };

  const fmt = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const MOMENT_STYLES = {
    reaction_spike: { icon: '🔥', color: '#F97316', label: 'Reaction' },
    comment_cluster: { icon: '💬', color: '#22D3EE', label: 'Chat' },
    bookmark: { icon: '⭐', color: '#FBBF24', label: 'Bookmark' },
  };
  const style = MOMENT_STYLES[moment?.type] || { icon: '📌', color: '#94A3B8', label: 'Moment' };

  if (!isVisible || !moment) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="fixed bottom-20 right-4 z-[60] w-[340px] rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: 'rgba(10,10,20,0.95)',
          border: `1px solid ${style.color}25`,
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{style.icon}</span>
            <span className="text-xs font-medium text-white/80">{style.label}</span>
            {moment._localBlobUrl && (
              <span className="text-[9px] text-amber-400/70 ml-1">• local</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-white/60" />
          </button>
        </div>

        {/* Video */}
        <div className="relative aspect-video bg-black">
          <video
            ref={videoRef}
            src={currentSrc || moment.videoUrl}
            className="w-full h-full object-contain"
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => setIsPlaying(false)}
            muted={isMuted}
            playsInline
          />

          {/* Play overlay */}
          {!isPlaying && (
            <button
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center bg-black/20"
            >
              <div className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
                <Play className="w-4 h-4 text-white ml-0.5" />
              </div>
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="px-3 py-1.5" style={{ background: 'rgba(0,0,0,0.3)' }}>
          {/* Mini progress */}
          <div className="h-1 rounded-full bg-white/10 mb-1.5 cursor-pointer" onClick={handleSeek}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, backgroundColor: style.color }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button onClick={togglePlay} className="p-1 hover:bg-white/10 rounded-md">
                {isPlaying
                  ? <Pause className="w-3.5 h-3.5 text-white/80" />
                  : <Play className="w-3.5 h-3.5 text-white/80" />
                }
              </button>
              <button onClick={() => setIsMuted(!isMuted)} className="p-1 hover:bg-white/10 rounded-md">
                {isMuted
                  ? <VolumeX className="w-3.5 h-3.5 text-white/60" />
                  : <Volume2 className="w-3.5 h-3.5 text-white/60" />
                }
              </button>
              <span className="text-[10px] text-white/40 ml-1 font-mono">
                {videoRef.current ? fmt(videoRef.current.currentTime) : '0:00'}
                {' / '}
                {videoRef.current ? fmt(videoRef.current.duration) : '0:00'}
              </span>
            </div>

            <button
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.requestFullscreen?.();
                }
              }}
              className="p-1 hover:bg-white/10 rounded-md"
            >
              <Maximize2 className="w-3 h-3 text-white/40" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default MomentPlaybackOverlay;
