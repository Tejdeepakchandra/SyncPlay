import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { resolveMediaUrl } from "@/utils/mediaUrl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const IMAGE_TEXT_DURATION = 5000;
const QUICK_REACTIONS = ["❤️", "🔥", "😂", "😮", "👏"];

export function StoryViewer({ storiesByUser, startGroupIndex, currentUserId, onClose, onViewStory, onReactStory, onReplyStory, onDeleteStory }) {
  const navigate = useNavigate();
  const [groupIndex, setGroupIndex] = useState(startGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [reactingEmoji, setReactingEmoji] = useState(null);
  const [deletingStory, setDeletingStory] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [progressFraction, setProgressFraction] = useState(0);
  const [videoDurationMs, setVideoDurationMs] = useState(IMAGE_TEXT_DURATION);

  const timerRef = useRef(null);
  const videoRef = useRef(null);
  const viewedInSessionRef = useRef(new Set());

  const group = storiesByUser[groupIndex] || null;
  const currentStory = group?.stories?.[storyIndex] || null;

  const currentDurationMs = useMemo(() => {
    if (!currentStory) return IMAGE_TEXT_DURATION;
    if (currentStory.type === "video") {
      if (Number(currentStory.duration) > 0) {
        return Math.min(Math.max(Number(currentStory.duration) * 1000, 3000), 30000);
      }
      return videoDurationMs;
    }
    return IMAGE_TEXT_DURATION;
  }, [currentStory, videoDurationMs]);

  function nextStory() {
    if (!group) return;
    const hasNextInGroup = storyIndex < group.stories.length - 1;
    if (hasNextInGroup) {
      setStoryIndex((s) => s + 1);
      return;
    }

    const hasNextGroup = groupIndex < storiesByUser.length - 1;
    if (hasNextGroup) {
      setGroupIndex((g) => g + 1);
      setStoryIndex(0);
      return;
    }

    onClose();
  }

  function prevStory() {
    if (!group) return;
    if (storyIndex > 0) {
      setStoryIndex((s) => s - 1);
      return;
    }

    if (groupIndex > 0) {
      const prevGroup = storiesByUser[groupIndex - 1];
      setGroupIndex((g) => g - 1);
      setStoryIndex(Math.max((prevGroup?.stories?.length || 1) - 1, 0));
    }
  }

  useEffect(() => {
    const storyId = currentStory?.id;
    if (!storyId || viewedInSessionRef.current.has(storyId)) return;
    viewedInSessionRef.current.add(storyId);
    onViewStory?.(storyId);
  }, [currentStory?.id, onViewStory]);

  useEffect(() => {
    setProgressFraction(0);
    if (timerRef.current) clearInterval(timerRef.current);

    if (!currentStory || paused) return undefined;

    timerRef.current = setInterval(() => {
      setProgressFraction((prev) => {
        const next = prev + 100 / currentDurationMs;
        if (next >= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setTimeout(() => nextStory(), 0);
          return 1;
        }
        return next;
      });
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentStory, paused, currentDurationMs, groupIndex, storyIndex]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (paused) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => null);
    }
  }, [paused, currentStory?.id]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prevStory();
      if (e.key === "ArrowRight") nextStory();
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, groupIndex, storyIndex, storiesByUser]);

  if (!group || !currentStory) return null;

  const recentReactions = (currentStory.reactions || []).slice(-3).map((r) => r.reaction);
  const repliesCount = currentStory.replies?.length || 0;
  const isOwnStory = (currentStory?.user_id && currentStory.user_id === currentUserId) || group?.user?.id === currentUserId;

  const handleReply = async () => {
    const text = replyText.trim();
    if (!text || !onReplyStory || sendingReply) return;
    try {
      setSendingReply(true);
      await onReplyStory(currentStory.id, text);
      setReplyText("");
    } finally {
      setSendingReply(false);
    }
  };

  const handleReact = async (emoji) => {
    if (!onReactStory || reactingEmoji) return;
    try {
      setReactingEmoji(emoji);
      await onReactStory(currentStory.id, emoji);
    } finally {
      setReactingEmoji(null);
    }
  };

  const handleDeleteCurrentStory = async () => {
    if (!onDeleteStory || !isOwnStory || deletingStory) return;
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteCurrentStory = async () => {
    if (!onDeleteStory || !isOwnStory || deletingStory) return;
    const deleteId = currentStory.id;
    const isDeletingLastInMultiStoryGroup = group.stories.length > 1 && storyIndex === group.stories.length - 1;

    // Keep the viewer on a valid story index to avoid a visual flicker when deleting the last item in a group.
    if (isDeletingLastInMultiStoryGroup) {
      setStoryIndex((idx) => Math.max(0, idx - 1));
    }

    try {
      setDeletingStory(true);
      await onDeleteStory(deleteId);
      setDeleteConfirmOpen(false);
    } finally {
      setDeletingStory(false);
    }
  };

  const viewerOverlay = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99999] bg-black/95"
      >
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent className="z-[100000] max-w-md p-0 overflow-hidden rounded-3xl border-border/60 bg-card backdrop-blur-xl data-[state=open]:duration-500 data-[state=closed]:duration-300 data-[state=open]:zoom-in-90 data-[state=closed]:zoom-out-90 data-[state=open]:slide-in-from-top-[44%] data-[state=closed]:slide-out-to-top-[54%]">
            <AlertDialogHeader className="px-6 py-5 border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.14),hsl(var(--secondary)/0.12),hsl(var(--accent)/0.08))] text-left space-y-1">
              <AlertDialogTitle className="text-xl tracking-tight">Delete Story?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground/90 text-sm">
                This story will be removed for everyone and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="px-6 py-5 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.18))] border-t border-border/60 gap-2 sm:gap-2">
              <AlertDialogCancel
                disabled={deletingStory}
                className="rounded-xl border-border/70 bg-background/70 hover:bg-muted/70"
              >
                Keep Story
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  confirmDeleteCurrentStory();
                }}
                disabled={deletingStory}
                className="rounded-xl bg-[linear-gradient(90deg,#b91c1c,#ef4444)] text-white hover:brightness-110"
              >
                {deletingStory ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="absolute inset-0 max-w-[500px] mx-auto">
          <div className="absolute top-5 left-4 right-4 z-40 flex gap-1">
            {group.stories.map((story, idx) => {
              let width = 0;
              if (idx < storyIndex) width = 100;
              if (idx === storyIndex) width = progressFraction * 100;

              return (
                <div key={story.id} className="h-1 flex-1 bg-white/25 rounded-full overflow-hidden">
                  <div className="h-full bg-white transition-all duration-100" style={{ width: `${width}%` }} />
                </div>
              );
            })}
          </div>

          <div className="absolute top-9 left-5 right-5 z-40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 overflow-hidden flex items-center justify-center text-white text-sm">
                {group.user.avatar_url ? (
                  <img src={group.user.avatar_url} alt={group.user.display_name} className="w-full h-full object-cover" />
                ) : (
                  group.user.display_name?.slice(0, 1)?.toUpperCase() || "U"
                )}
              </div>
              <div>
                <p className="text-white text-sm font-medium leading-tight">{group.user.display_name}</p>
                <p className="text-white/70 text-xs leading-tight">@{group.user.username}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {currentStory.type === "video" && (
                <button
                  className="w-9 h-9 rounded-full bg-black/45 text-white grid place-items-center hover:bg-black/70"
                  onClick={() => setMuted((m) => !m)}
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              )}
              {isOwnStory && (
                <button
                  className="w-9 h-9 rounded-full bg-red-500/70 text-white grid place-items-center hover:bg-red-500 disabled:opacity-60"
                  onClick={handleDeleteCurrentStory}
                  disabled={deletingStory}
                  aria-label="Delete story"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                className="w-9 h-9 rounded-full bg-black/45 text-white grid place-items-center hover:bg-black/70"
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
              <button className="w-9 h-9 rounded-full bg-black/45 text-white grid place-items-center hover:bg-black/70" onClick={onClose}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="absolute inset-0 z-10">
            {currentStory.type === "video" && currentStory.media_url ? (
              <video
                ref={videoRef}
                key={currentStory.id}
                src={resolveMediaUrl(currentStory.media_url)}
                className="w-full h-full object-cover"
                autoPlay={!paused}
                muted={muted}
                playsInline
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  if (Number.isFinite(d) && d > 0) {
                    setVideoDurationMs(Math.min(Math.max(d * 1000, 3000), 30000));
                  }
                }}
                onEnded={nextStory}
              />
            ) : currentStory.type === "photo" && currentStory.media_url ? (
              <img src={resolveMediaUrl(currentStory.media_url)} alt="story" className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center px-6 text-center relative overflow-hidden"
                style={{ backgroundColor: currentStory.background_color || "#1f2937" }}
              >
                {currentStory.room?.path && (
                  <>
                    <motion.div
                      className="absolute -top-16 -left-12 h-44 w-44 rounded-full bg-white/10 blur-2xl"
                      animate={{ scale: [1, 1.12, 1], opacity: [0.45, 0.8, 0.45] }}
                      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                      className="absolute -bottom-14 -right-10 h-52 w-52 rounded-full bg-black/20 blur-2xl"
                      animate={{ scale: [1.1, 1, 1.1], opacity: [0.35, 0.55, 0.35] }}
                      transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
                    />

                    <div className="relative z-20 w-full max-w-[320px] rounded-3xl border border-white/25 bg-black/25 backdrop-blur-md px-5 py-6 text-left shadow-2xl">
                      <p className="text-[10px] tracking-[0.14em] uppercase text-white/80 font-semibold mb-2">Room Story</p>
                      <p className="text-white text-2xl font-bold leading-tight mb-2">
                        {currentStory.room.room_name || "Join Room on SyncPlay"}
                      </p>
                      <p className="text-white/80 text-xs mb-5">Posted by {group.user.display_name}</p>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center px-4 h-10 rounded-full bg-white text-black text-sm font-semibold"
                        onClick={() => {
                          onClose();
                          navigate(currentStory.room.path);
                        }}
                      >
                        {currentStory.room.label || "Join Now"}
                      </button>
                    </div>
                  </>
                )}

                {!currentStory.room?.path && (
                  <p className="text-white text-3xl font-bold leading-tight relative z-20">{currentStory.text_content}</p>
                )}
              </div>
            )}

            {!currentStory.room?.path && currentStory.caption && (
              <div className="absolute bottom-32 left-4 right-4 z-40 text-center">
                <p className="inline-block px-3 py-1.5 rounded-xl bg-black/45 text-white text-sm">
                  {currentStory.caption}
                </p>
              </div>
            )}

            <div className="absolute left-4 right-4 bottom-6 z-50 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="w-9 h-9 rounded-full bg-black/45 text-sm text-white hover:bg-black/70 disabled:opacity-60"
                      onClick={() => handleReact(emoji)}
                      disabled={!!reactingEmoji}
                    >
                      {reactingEmoji === emoji ? "..." : emoji}
                    </button>
                  ))}
                </div>

                <div className="text-[11px] text-white/90 bg-black/50 rounded-full px-2.5 py-1">
                  {recentReactions.length > 0 ? `${recentReactions.join(" ")} · ${currentStory.view_count || 0} views` : `${currentStory.view_count || 0} views`}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value.slice(0, 250))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleReply();
                    }
                  }}
                  placeholder="Reply to story..."
                  className="flex-1 h-11 rounded-full bg-black/45 text-white placeholder:text-white/60 px-4 text-sm outline-none border border-white/20"
                />
                <button
                  type="button"
                  className="h-11 px-5 rounded-full bg-white text-black text-sm font-semibold disabled:opacity-60"
                  onClick={handleReply}
                  disabled={!replyText.trim() || sendingReply}
                >
                  {sendingReply ? "..." : "Send"}
                </button>
              </div>

              {repliesCount > 0 && (
                <p className="text-xs text-white/80 pl-2">{repliesCount} repl{repliesCount === 1 ? "y" : "ies"}</p>
              )}
            </div>
          </div>

          <button className="absolute top-20 left-0 bottom-24 w-1/3 z-30" onClick={prevStory} aria-label="Previous story">
            <ChevronLeft className="w-6 h-6 text-white/0" />
          </button>
          <button className="absolute top-20 right-0 bottom-24 w-1/3 z-30" onClick={nextStory} aria-label="Next story">
            <ChevronRight className="w-6 h-6 text-white/0" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(viewerOverlay, document.body);
}
