import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const MomentTimeline = ({ 
  duration, 
  currentTime,
  moments = [],
  onMomentClick,
  className = ''
}) => {
  const [hoveredMoment, setHoveredMoment] = useState(null);
  const timelineRef = useRef(null);

  // SAFE division - prevent NaN
  const progressWidth = duration > 0 ? (currentTime / duration) * 100 : 0;

  const getMomentColor = (type) => {
    switch (type) {
      case 'reaction_spike': return '#3B82F6';
      case 'comment_cluster': return '#10B981';
      case 'bookmark': return '#F59E0B';
      case 'ai_highlight': return '#8B5CF6';
      default: return '#6B7280';
    }
  };

  const getMomentIcon = (type) => {
    switch (type) {
      case 'reaction_spike': return '🔥';
      case 'comment_cluster': return '💬';
      case 'bookmark': return '⭐';
      case 'ai_highlight': return '🎬';
      default: return '📌';
    }
  };

  const getMomentLabel = (type) => {
    switch (type) {
      case 'reaction_spike': return 'Reaction Spike';
      case 'comment_cluster': return 'Hot Discussion';
      case 'bookmark': return 'Bookmark';
      case 'ai_highlight': return 'Highlight';
      default: return 'Moment';
    }
  };

  const handleTimelineClick = (e) => {
    if (!timelineRef.current || duration <= 0) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const timestamp = percentage * duration;
    
    onMomentClick?.({ timestamp, type: 'seek' });
  };

  return (
    <div className={`w-full px-4 py-2 ${className}`}>
      <div 
        ref={timelineRef}
        className="relative h-12 bg-gray-800 rounded-lg cursor-pointer overflow-hidden group"
        onClick={handleTimelineClick}
      >
        {/* Progress bar */}
        <motion.div 
          className="absolute top-0 left-0 h-full bg-blue-600"
          style={{ width: `${progressWidth}%` }}
        />
        
        {/* Progress handle */}
        <div className="absolute top-0 left-0 w-1 h-full bg-white shadow-lg"
             style={{ left: `${progressWidth}%` }} />
        
        {/* Moment markers */}
        {moments.map((moment) => {
          const left = duration > 0 ? (moment.timestamp / duration) * 100 : 0;
          const isHovered = hoveredMoment === moment._id;
          
          return (
            <React.Fragment key={moment._id}>
              <motion.button
                className="absolute top-0 w-3 h-full transform -translate-x-1/2 z-10"
                style={{ 
                  left: `${left}%`,
                  backgroundColor: getMomentColor(moment.type),
                  boxShadow: isHovered ? '0 0 15px rgba(59,130,246,0.5)' : 'none'
                }}
                whileHover={{ scale: 2, zIndex: 20 }}
                onHoverStart={() => setHoveredMoment(moment._id)}
                onHoverEnd={() => setHoveredMoment(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onMomentClick?.(moment);
                }}
              >
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute -top-16 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-3 py-2 rounded-lg shadow-xl whitespace-nowrap z-30"
                      style={{ borderLeft: `3px solid ${getMomentColor(moment.type)}` }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{getMomentIcon(moment.type)}</span>
                        <div>
                          <div className="font-semibold">{getMomentLabel(moment.type)}</div>
                          <div className="text-xs text-gray-400">
                            {Math.floor(moment.timestamp / 60)}:
                            {Math.floor(moment.timestamp % 60).toString().padStart(2, '0')}
                          </div>
                          {moment.intensity && (
                            <div className="text-xs text-blue-400">
                              Intensity: {(moment.intensity * 100).toFixed(0)}%
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            </React.Fragment>
          );
        })}
        
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-transparent via-transparent to-gray-900/20" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-l from-transparent via-transparent to-gray-900/20" />
      </div>

      {/* Timeline markers */}
      <div className="flex justify-between mt-1 text-xs text-gray-500">
        <span>0:00</span>
        <span>
          {duration > 0 
            ? `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}`
            : '0:00'}
        </span>
      </div>

      {/* Moments legend */}
      {moments.length > 0 && (
        <div className="flex gap-4 mt-2 text-xs flex-wrap">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-blue-600" />
            <span className="text-gray-400">Reaction Spike</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-600" />
            <span className="text-gray-400">Discussion</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-yellow-600" />
            <span className="text-gray-400">Bookmark</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-purple-600" />
            <span className="text-gray-400">Highlight</span>
          </div>
        </div>
      )}
    </div>
  );
};