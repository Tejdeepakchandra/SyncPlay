import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Film, Calendar, Clock, Hash, ChevronLeft, X, Trash2,
  Loader2, Bookmark, Flame, MessageCircle, Clapperboard, Grid3x3
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/services/api";

/**
 * ProfileMomentsPage — Instagram Archive–style page for session moments.
 *
 * Two tabs:
 * - Clips: Individual captured moments (bookmarks, reactions, chat spikes)
 * - Highlights: Merged session highlight reels
 *
 * Each card shows thumbnail, duration, and metadata.
 * Clicking opens a full-screen player overlay.
 */

const CLIP_ICONS = {
  bookmark: { icon: Bookmark, color: '#FBBF24', label: 'Bookmarked' },
  reaction_spike: { icon: Flame, color: '#F97316', label: 'Reaction' },
  comment_cluster: { icon: MessageCircle, color: '#22D3EE', label: 'Chat Spike' },
};

export default function ProfileMomentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [clips, setClips] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("clips");
  const [selectedItem, setSelectedItem] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const fetchMoments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/moments/profile/moments');
      if (response.data?.success) {
        const data = response.data.data;
        // Support both old flat array and new { clips, highlights } shape
        if (Array.isArray(data)) {
          setHighlights(data);
          setClips([]);
        } else {
          setClips(data.clips || []);
          setHighlights(data.highlights || []);
        }
      }
    } catch (error) {
      console.error('Fetch moments error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMoments(); }, [fetchMoments]);

  const activeItems = tab === "clips" ? clips : highlights;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 172800000) return 'Yesterday';
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleDelete = async (item) => {
    const id = item.activityId || item._id;
    setDeleting(id);
    try {
      if (item.type === 'highlight') {
        await api.delete(`/users/me/favorites/activities/${encodeURIComponent(item.activityId)}`);
        setHighlights(prev => prev.filter(h => h.activityId !== item.activityId));
      } else {
        await api.delete(`/moments/${item._id}`);
        setClips(prev => prev.filter(c => c._id !== item._id));
      }
      if ((selectedItem?.activityId || selectedItem?._id) === id) setSelectedItem(null);
    } catch (error) {
      console.error('Delete moment error:', error);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <main className="pb-24 pt-2 md:pt-3 min-h-screen" style={{ background: 'linear-gradient(180deg, hsl(var(--background)), hsl(var(--background)/0.95))' }}>
      <div className="container mx-auto px-4 lg:px-8 max-w-6xl">

        {/* Header */}
        <div className="mb-5">
          <button
            onClick={() => navigate("/profile", { state: { profileNavDirection: "back" } })}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Profile
          </button>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Play className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Moments</h1>
              <p className="text-sm text-muted-foreground">
                {clips.length + highlights.length > 0
                  ? `${clips.length} clips · ${highlights.length} highlights`
                  : 'Captured highlights from your watch parties'}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 p-1 rounded-xl bg-muted/20 border border-border/50 w-fit">
          {[
            { key: 'clips', label: 'Clips', count: clips.length, icon: Clapperboard },
            { key: 'highlights', label: 'Highlights', count: highlights.length, icon: Film },
          ].map(({ key, label, count, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  tab === key ? 'bg-white/20' : 'bg-muted/40'
                }`}>{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <section className="rounded-3xl border border-border bg-card p-3 md:p-4">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="aspect-video rounded-2xl bg-muted/20 animate-pulse" />
              ))}
            </div>
          ) : activeItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-16 h-16 rounded-full bg-muted/10 border border-border flex items-center justify-center mb-4">
                {tab === 'clips' ? <Clapperboard className="w-8 h-8 text-muted-foreground/40" /> : <Film className="w-8 h-8 text-muted-foreground/40" />}
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {tab === 'clips' ? 'No Clips Yet' : 'No Highlights Yet'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1.5 text-center max-w-sm">
                {tab === 'clips'
                  ? 'When moments are captured during watch parties, individual clips appear here.'
                  : 'After a room ends, all clips merge into a highlight reel and appear here.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {activeItems.map((item, index) => {
                const clipStyle = CLIP_ICONS[item.momentType] || CLIP_ICONS.bookmark;
                const ClipIcon = clipStyle.icon;

                return (
                  <motion.div
                    key={item._id || item.activityId || index}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03, duration: 0.25 }}
                    className="group cursor-pointer"
                    onClick={() => setSelectedItem(item)}
                  >
                    <div className="relative aspect-video rounded-2xl overflow-hidden border border-border/50 group-hover:border-primary/30 shadow-md group-hover:shadow-lg transition-all duration-300">
                      {/* Background */}
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.label}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-purple-900/50 via-indigo-900/40 to-blue-900/50 flex items-center justify-center">
                          {tab === 'clips' ? <ClipIcon className="w-8 h-8" style={{ color: clipStyle.color + '40' }} /> : <Film className="w-8 h-8 text-white/15" />}
                        </div>
                      )}

                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                      {/* Play button on hover */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center">
                          <Play className="w-5 h-5 text-white ml-0.5" />
                        </div>
                      </div>

                      {/* Top badges */}
                      <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
                        {tab === 'clips' && item.momentType && (
                          <span
                            className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-white flex items-center gap-1"
                            style={{ background: clipStyle.color + 'CC' }}
                          >
                            <ClipIcon className="w-2.5 h-2.5" />
                            {clipStyle.label}
                          </span>
                        )}
                        {tab === 'highlights' && item.clipCount && (
                          <span className="px-1.5 py-0.5 bg-purple-500/80 backdrop-blur-sm rounded-full text-[9px] text-white font-semibold">
                            {item.clipCount} clips
                          </span>
                        )}
                        {(item.duration) && (
                          <span className="px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded-full text-[9px] text-white font-mono ml-auto">
                            {formatDuration(item.duration)}
                          </span>
                        )}
                      </div>

                      {/* Bottom info */}
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <h4 className="text-[11px] font-semibold text-white truncate leading-tight">
                          {item.label || 'Session Highlights'}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5 text-[9px] text-white/50">
                          {item.roomCode && (
                            <span className="flex items-center gap-0.5">
                              <Hash className="w-2 h-2" />
                              {item.roomCode}
                            </span>
                          )}
                          <span className="flex items-center gap-0.5">
                            <Calendar className="w-2 h-2" />
                            {formatDate(item.createdAt || item.addedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Full-screen player overlay */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6"
            style={{ touchAction: 'none' }}
            onClick={() => setSelectedItem(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="w-full max-w-4xl max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gray-900/95 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white truncate">
                      {selectedItem.label || 'Captured Moment'}
                    </h3>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                      {selectedItem.roomCode && (
                        <span className="text-purple-400">#{selectedItem.roomCode}</span>
                      )}
                      {selectedItem.clipCount && (
                        <span>{selectedItem.clipCount} moments</span>
                      )}
                      <span>{formatDate(selectedItem.createdAt || selectedItem.addedAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDelete(selectedItem)}
                      disabled={deleting === (selectedItem.activityId || selectedItem._id)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
                    >
                      {deleting === (selectedItem.activityId || selectedItem._id) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setSelectedItem(null)}
                      className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Video — fills remaining space */}
                <div className="flex-1 min-h-0 bg-black flex items-center justify-center">
                  <video
                    key={selectedItem.videoUrl}
                    src={selectedItem.videoUrl}
                    className="w-full h-full object-contain max-h-[calc(90vh-60px)]"
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
    </main>
  );
}
