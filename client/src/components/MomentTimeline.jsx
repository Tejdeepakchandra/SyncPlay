import React, { useMemo, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, Flame, MessageCircle, Play, Loader2 } from 'lucide-react';

/**
 * MomentTimeline — Hotstar-style premium progress bar with moment markers.
 *
 * Features:
 * - Slim seekable progress bar (4px → 6px on hover)
 * - Precisely positioned, type-colored moment icons at exact timestamps
 * - Hover tooltips with timestamp and type info
 * - Pulse glow on active capture
 * - Click to play captured moment
 * - Smart clustering when moments overlap
 */

const MOMENT_STYLES = {
  bookmark:        { icon: Bookmark,       color: '#FBBF24', bg: '#FBBF24', label: 'Bookmark' },
  reaction_spike:  { icon: Flame,          color: '#F97316', bg: '#F97316', label: 'Reaction' },
  comment_cluster: { icon: MessageCircle,  color: '#22D3EE', bg: '#22D3EE', label: 'Chat Spike' },
};

export const MomentTimeline = ({
  duration = 0,
  currentTime = 0,
  moments = [],
  onMomentClick,
  onSeek,
  isCapturing = false,
  currentMoment = null,
}) => {
  const barRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [hoveredMoment, setHoveredMoment] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Format seconds → M:SS
  const fmt = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Position moments as % of duration, cluster overlapping ones
  const positionedMoments = useMemo(() => {
    if (duration <= 0 || moments.length === 0) return [];

    return moments
      .map(m => ({
        ...m,
        pct: Math.max(0, Math.min(100, (m.timestamp / duration) * 100)),
      }))
      .sort((a, b) => a.pct - b.pct);
  }, [moments, duration]);

  // Handle bar click for seeking
  const handleBarClick = useCallback((e) => {
    if (!barRef.current || duration <= 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek?.(pct * duration);
  }, [duration, onSeek]);

  // Handle moment hover
  const handleMomentHover = useCallback((e, moment) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({ x: e.clientX - rect.left, y: rect.top });
    }
    setHoveredMoment(moment);
  }, []);

  if (duration <= 0) return null;

  return (
    <div
      className="relative w-full select-none"
      style={{ padding: '8px 0 4px 0' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setHoveredMoment(null); }}
    >
      {/* Time labels */}
      <div className="flex items-center justify-between mb-1 px-0.5">
        <span className="text-[10px] font-mono text-white/50 tabular-nums">{fmt(currentTime)}</span>
        <span className="text-[10px] font-mono text-white/50 tabular-nums">{fmt(duration)}</span>
      </div>

      {/* Progress bar container */}
      <div
        ref={barRef}
        className="relative cursor-pointer group"
        style={{ height: hovered ? '10px' : '6px', transition: 'height 0.15s ease' }}
        onClick={handleBarClick}
      >
        {/* Background track */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          {/* Played progress */}
          <div
            className="h-full rounded-full transition-all duration-150"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #6366F1, #8B5CF6, #A855F7)',
            }}
          />
        </div>

        {/* Playhead dot */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full shadow-lg"
          style={{
            left: `${progress}%`,
            width: hovered ? 14 : 10,
            height: hovered ? 14 : 10,
            background: '#fff',
            boxShadow: '0 0 8px rgba(139,92,246,0.6)',
            transition: 'width 0.15s, height 0.15s',
          }}
        />

        {/* Moment markers */}
        {positionedMoments.map((m, i) => {
          const style = MOMENT_STYLES[m.type] || MOMENT_STYLES.bookmark;
          const Icon = style.icon;
          const isActive = currentMoment?.momentId === m.momentId;
          const isReady = m.ready && m.videoUrl;

          return (
            <div
              key={`${m.momentId || 'moment'}-${i}`}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
              style={{ left: `${m.pct}%` }}
              onMouseEnter={(e) => handleMomentHover(e, m)}
              onMouseLeave={() => setHoveredMoment(null)}
              onClick={(e) => {
                e.stopPropagation();
                if (isReady) onMomentClick?.(m);
              }}
            >
              {/* Active capture glow */}
              {isActive && (
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ background: style.color, filter: 'blur(6px)', opacity: 0.5 }}
                  animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0.2, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}

              {/* Marker icon */}
              <motion.div
                className="relative flex items-center justify-center rounded-full border-2 cursor-pointer"
                style={{
                  width: hovered ? 22 : 16,
                  height: hovered ? 22 : 16,
                  background: isReady
                    ? `${style.color}25`
                    : 'rgba(100,100,100,0.3)',
                  borderColor: isReady ? style.color : 'rgba(150,150,150,0.4)',
                  transition: 'all 0.15s ease',
                }}
                whileHover={{ scale: 1.3 }}
              >
                {isActive && !isReady ? (
                  <Loader2
                    className="animate-spin"
                    style={{ width: hovered ? 12 : 8, height: hovered ? 12 : 8, color: style.color }}
                  />
                ) : (
                  <Icon
                    style={{
                      width: hovered ? 12 : 8,
                      height: hovered ? 12 : 8,
                      color: isReady ? style.color : 'rgba(150,150,150,0.6)',
                    }}
                  />
                )}
              </motion.div>
            </div>
          );
        })}
      </div>

      {/* Capture status bar */}
      {isCapturing && (
        <motion.div
          className="mt-1 flex items-center gap-1.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-red-500"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
          <span className="text-[9px] text-red-400/80 font-medium">Capturing moment...</span>
        </motion.div>
      )}

      {/* Hover tooltip */}
      <AnimatePresence>
        {hoveredMoment && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute z-30 pointer-events-none"
            style={{
              left: Math.max(50, Math.min(tooltipPos.x, barRef.current?.offsetWidth - 100 || 200)),
              bottom: '100%',
              marginBottom: '8px',
              transform: 'translateX(-50%)',
            }}
          >
            <div
              className="px-2.5 py-1.5 rounded-lg shadow-xl text-center"
              style={{
                background: 'rgba(10,10,25,0.95)',
                border: `1px solid ${(MOMENT_STYLES[hoveredMoment.type] || MOMENT_STYLES.bookmark).color}30`,
                backdropFilter: 'blur(10px)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-semibold" style={{ color: (MOMENT_STYLES[hoveredMoment.type] || MOMENT_STYLES.bookmark).color }}>
                  {(MOMENT_STYLES[hoveredMoment.type] || MOMENT_STYLES.bookmark).label}
                </span>
                {hoveredMoment.ready && (
                  <Play className="w-2.5 h-2.5 text-green-400" />
                )}
              </div>
              <span className="text-[9px] text-white/60 font-mono">{fmt(hoveredMoment.timestamp)}</span>
              {!hoveredMoment.ready && (
                <span className="text-[8px] text-amber-400/70 block mt-0.5">Processing...</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MomentTimeline;