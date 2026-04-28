import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Clock, Users, Film, Trash2, ExternalLink, Calendar } from 'lucide-react';
import api from '@/services/api';

/**
 * ProfileMoments — Instagram-style archive of session highlights.
 * Displayed in the user profile under a "Moments" tab.
 * 
 * Shows merged session highlight videos from past watch parties —
 * each card represents a session, with clip count, room name, date, and duration.
 */
const ProfileMoments = ({ userId }) => {
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const [selectedHighlight, setSelectedHighlight] = useState(null);

  useEffect(() => {
    fetchHighlights();
  }, [userId]);

  const fetchHighlights = async () => {
    try {
      setLoading(true);
      const response = await api.get('/moments/profile/moments');
      if (response.data?.success) {
        const d = response.data.data;
        // Support both old flat array and new { clips, highlights } shape
        if (Array.isArray(d)) {
          setHighlights(d);
        } else {
          // Combine clips + highlights into one flat list for this component
          const all = [...(d.clips || []), ...(d.highlights || [])];
          setHighlights(all);
        }
      }
    } catch (error) {
      console.error('Fetch moments error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000) return 'Today';
    if (diff < 172800000) return 'Yesterday';
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="aspect-video bg-white/5 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (highlights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <Film className="w-8 h-8 text-gray-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-300">No Moments Yet</h3>
        <p className="text-sm text-gray-500 mt-1 text-center max-w-xs">
          Watch parties with moments captured will appear here as highlight reels.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Grid of session highlight cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {highlights.map((highlight, index) => (
          <motion.div
            key={highlight.activityId || index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="group cursor-pointer"
            onClick={() => setSelectedHighlight(highlight)}
          >
            {/* Thumbnail card */}
            <div className="relative aspect-video bg-gray-800 rounded-xl overflow-hidden border border-white/5 group-hover:border-white/20 transition-all shadow-lg">
              {/* Thumbnail or gradient */}
              {highlight.thumbnailUrl ? (
                <img 
                  src={highlight.thumbnailUrl} 
                  alt={highlight.label}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-purple-900/40 to-blue-900/40 flex items-center justify-center">
                  <Film className="w-8 h-8 text-gray-600" />
                </div>
              )}

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <motion.div
                  initial={{ scale: 0 }}
                  whileHover={{ scale: 1 }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <Play className="w-5 h-5 text-white ml-0.5" />
                  </div>
                </motion.div>
              </div>

              {/* Duration badge */}
              {highlight.duration && (
                <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded text-[10px] text-white font-mono">
                  {formatDuration(highlight.duration)}
                </div>
              )}

              {/* Clip count badge */}
              {highlight.clipCount && (
                <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-purple-500/80 backdrop-blur-sm rounded text-[10px] text-white font-medium">
                  {highlight.clipCount} clips
                </div>
              )}
            </div>

            {/* Card info */}
            <div className="mt-1.5 px-0.5">
              <h4 className="text-xs font-medium text-gray-300 truncate">
                {highlight.label || 'Session Highlights'}
              </h4>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
                {highlight.addedAt && (
                  <span className="flex items-center gap-0.5">
                    <Calendar className="w-2.5 h-2.5" />
                    {formatDate(highlight.addedAt)}
                  </span>
                )}
                {highlight.roomCode && (
                  <span className="text-purple-400/60">#{highlight.roomCode}</span>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Full-screen player modal */}
      <AnimatePresence>
        {selectedHighlight && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-md flex items-center justify-center"
            onClick={() => setSelectedHighlight(null)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="w-[90vw] max-w-4xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gray-900/95 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {selectedHighlight.label || 'Session Highlights'}
                    </h3>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {selectedHighlight.clipCount || 0} captured moments
                      {selectedHighlight.roomCode && ` • Room #${selectedHighlight.roomCode}`}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedHighlight(null)}
                    className="p-2 rounded-lg hover:bg-white/10 text-gray-400"
                  >
                    ✕
                  </button>
                </div>

                {/* Video */}
                <div className="aspect-video bg-black">
                  <video
                    src={selectedHighlight.videoUrl}
                    className="w-full h-full object-contain"
                    controls
                    autoPlay
                    playsInline
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProfileMoments;
