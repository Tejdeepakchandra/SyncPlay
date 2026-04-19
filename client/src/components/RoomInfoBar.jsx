import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Share2, Link2, Camera, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import api from "@/services/api";
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

const RoomInfoBar = ({ roomId, roomType, roomName, host, participantCount = 1, isHost = false }) => {
  const [showPanel, setShowPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creatingStory, setCreatingStory] = useState(false);
  const [deletingStory, setDeletingStory] = useState(false);
  const [latestRoomStoryId, setLatestRoomStoryId] = useState(null);
  const [deleteStoryConfirmOpen, setDeleteStoryConfirmOpen] = useState(false);

  const { isAuthenticated, clerkUser, clerkLoaded, sessionLoaded } = useAuth();

  const normalizedRoomId = String(roomId || "").trim();
  const roomCode = normalizedRoomId.replace(/^(room-|music-)/, "").toUpperCase();
  const roomPathCode = roomCode || normalizedRoomId;
  const roomLink = `${window.location.origin}${roomType === "music" ? "/music/room/" : "/room/"}${roomPathCode}`;
  // displayHost is already formatted in the parent (MovieRoom) - just use it as is
  const displayHost = host || "Host";

  const handleCopy = () => {
    navigator.clipboard.writeText(roomLink);
    setCopied(true);
    toast.success("Room link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = () => {
    if (!roomCode) {
      toast.error("Room code unavailable");
      return;
    }
    navigator.clipboard.writeText(roomCode);
    toast.success("Room code copied!");
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join my ${roomType} room`,
          text: `Join my ${roomType === "music" ? "music session" : "movie night"}! Room code: ${roomCode}`,
          url: roomLink,
        });
      } catch { /* share cancelled or unsupported */ }
    } else {
      handleCopy();
    }
  };

  const resolveLatestRoomStoryId = useCallback(async () => {
    if (!isAuthenticated || !clerkLoaded || !sessionLoaded || !clerkUser?.id) {
      setLatestRoomStoryId(null);
      return null;
    }

    try {
      const response = await api.get("/stories?limit=200");
      const stories = response?.data?.data?.stories || [];
      const latestOwnRoomStory = stories
        .filter((story) => story?.user_id === clerkUser.id && story?.room?.room_code === roomCode)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

      const foundId = latestOwnRoomStory?.id || null;
      setLatestRoomStoryId(foundId);
      return foundId;
    } catch {
      setLatestRoomStoryId(null);
      return null;
    }
  }, [isAuthenticated, clerkLoaded, sessionLoaded, clerkUser?.id, roomCode]);

  useEffect(() => {
    if (!showPanel) return;
    resolveLatestRoomStoryId();
  }, [showPanel, resolveLatestRoomStoryId]);

  useEffect(() => {
    if (!isAuthenticated || !clerkLoaded || !sessionLoaded || !clerkUser?.id) {
      setLatestRoomStoryId(null);
      return;
    }
    resolveLatestRoomStoryId();
  }, [isAuthenticated, clerkLoaded, sessionLoaded, clerkUser?.id, roomCode, resolveLatestRoomStoryId]);

  const handleCreateRoomStory = async () => {
    if (!isAuthenticated) {
      toast.error("Sign in to create stories");
      return;
    }

    if (latestRoomStoryId) {
      setShowPanel(true);
      toast("Room story already active", { description: "You can delete it from details before posting a new one." });
      return;
    }

    try {
      setCreatingStory(true);
      const formData = new FormData();
      formData.append("textContent", `Join ${roomName || "my room"} on SyncPlay`);
      formData.append("backgroundColor", roomType === "music" ? "#0f766e" : "#7f1d1d");
      formData.append("roomCode", roomCode);
      formData.append("roomName", roomName || `${roomType === "music" ? "Music" : "Movie"} Room`);
      formData.append("roomType", roomType);
      formData.append("ctaPath", roomType === "music" ? `/music/room/${roomCode}` : `/room/${roomCode}`);
      formData.append("ctaLabel", "Join Now");

      const response = await api.post("/stories", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const storyId = response?.data?.data?.story?.id || null;
      setLatestRoomStoryId(storyId);
      setShowPanel(true);
      toast.success("Room story posted");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to create room story");
    } finally {
      setCreatingStory(false);
    }
  };

  const handleDeleteLatestRoomStory = async () => {
    if (deletingStory) return;

    try {
      setDeletingStory(true);
      const storyId = latestRoomStoryId || await resolveLatestRoomStoryId();
      if (!storyId) {
        toast.error("No room story found to delete");
        return;
      }

      await api.delete(`/stories/${storyId}`);
      setLatestRoomStoryId(null);
      setDeleteStoryConfirmOpen(false);
      setShowPanel(false);
      toast.success("Room story deleted");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete room story");
    } finally {
      setDeletingStory(false);
    }
  };

  return (
    <div className="relative">
      <Button
        size="icon"
        variant="ghost"
        onClick={() => {
          if (latestRoomStoryId) {
            setShowPanel((prev) => !prev);
          } else {
            handleCreateRoomStory();
          }
        }}
        disabled={creatingStory}
        className={creatingStory || latestRoomStoryId ? "text-primary" : "text-muted-foreground"}
        title={
          creatingStory
            ? "Posting room story..."
            : latestRoomStoryId
              ? "Room story details"
              : "Create Room Story"
        }
      >
        {latestRoomStoryId ? <Sparkles className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
      </Button>

      <Button
        size="icon"
        variant="ghost"
        onClick={() => setShowPanel(!showPanel)}
        className={showPanel ? "text-primary" : "text-muted-foreground"}
        title="Room Info"
      >
        <Link2 className="w-4 h-4" />
      </Button>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute top-full right-0 mt-2 z-50 w-72 sm:w-80"
          >
            <div className="glass-panel p-4 space-y-3 shadow-xl">
              <AlertDialog open={deleteStoryConfirmOpen} onOpenChange={setDeleteStoryConfirmOpen}>
                <AlertDialogContent className="max-w-sm rounded-2xl border-border/70 bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--muted)/0.1))]">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Room Story?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes your latest room story for everyone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deletingStory}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={deletingStory}
                      onClick={(e) => {
                        e.preventDefault();
                        handleDeleteLatestRoomStory();
                      }}
                      className="bg-red-600 text-white hover:bg-red-500"
                    >
                      {deletingStory ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Room Info</h3>
                <button onClick={() => setShowPanel(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {latestRoomStoryId && (
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-primary/90 font-semibold">Room Story</p>
                    <p className="text-xs text-foreground font-medium">Active and visible to friends</p>
                  </div>
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
              )}

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 border border-glass-border">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Room Code</p>
                  <p className="text-lg font-mono font-bold text-foreground tracking-widest">{roomCode}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={handleCopyCode} className="ml-auto h-7 text-xs gap-1">
                  <Copy className="w-3 h-3" /> Copy
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-muted/30">
                  <p className="text-muted-foreground">Host</p>
                  <p className="font-medium text-foreground truncate">{displayHost}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/30">
                  <p className="text-muted-foreground">Participants</p>
                  <p className="font-medium text-foreground flex items-center gap-1">
                    {participantCount}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Shareable Link</p>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-glass-border">
                  <p className="text-xs text-muted-foreground truncate flex-1 font-mono">{roomLink}</p>
                  <button onClick={handleCopy} className="flex-shrink-0 text-muted-foreground hover:text-foreground">
                    {copied ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={handleCopy} className={`flex-1 text-xs h-8 gap-1.5 ${
                  roomType === "music" ? "gradient-music" : "gradient-movie"
                } text-primary-foreground`}>
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied!" : "Copy Link"}
                </Button>
                <Button size="sm" variant="outline" onClick={handleShare} className="flex-1 text-xs h-8 gap-1.5 border-glass-border">
                  <Share2 className="w-3 h-3" /> Share
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  onClick={handleCreateRoomStory}
                  disabled={creatingStory || !!latestRoomStoryId}
                  className={`text-xs h-8 gap-1.5 ${roomType === "music" ? "gradient-music" : "gradient-movie"} text-primary-foreground`}
                >
                  <Camera className="w-3 h-3" />
                  {creatingStory ? "Posting..." : latestRoomStoryId ? "Story Active" : "Story"}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDeleteStoryConfirmOpen(true)}
                  disabled={deletingStory || !isAuthenticated}
                  className="text-xs h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RoomInfoBar;