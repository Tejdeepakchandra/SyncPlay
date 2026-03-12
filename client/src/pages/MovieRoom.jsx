import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, Maximize, Minimize, Volume2, VolumeX,
  MessageSquare, Moon, Sun, Bookmark,
  Youtube, Upload, Monitor, ChevronLeft,
  Send, Smile, SkipForward, Settings,
  Wifi, WifiOff, Mic, MicOff, Video, VideoOff, Users, X,
  Headphones, Sliders, Film
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// Hooks
import { useRoom } from "@/hooks/useRoom";
import { useRoomChat } from "@/hooks/useRoomChat";
import { useRoomSync } from "@/hooks/useRoomSync";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useWebRTCMesh } from "@/hooks/useWebRTCMesh";
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer";
import { useMediaSession } from "@/hooks/useMediaSession";
import { useMomentsStore } from "@/stores/momentsStore";

// Components
import FloatingParticipantBubbles from "@/components/FloatingParticipantBubbles";
import RoomAccessGate from "@/components/RoomAccessGate";
import HostControlsPanel from "@/components/HostControlsPanel";
import RoomInfoBar from "@/components/RoomInfoBar";
import YouTubeSearchTab from "@/components/YouTubeSearchTab";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

const reactionEmojis = ["🔥", "😂", "👏", "❤️", "😱", "🎬"];

const MovieRoom = () => {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const { user, profile } = useAuth();
  const [isMobile] = useState(false);

  // Room data from backend
  const { room, participants: dbParticipants, isHost, accessStatus } = useRoom(roomId);
  const { messages, sendMessage } = useRoomChat(roomId);
  const addMoment = useMomentsStore((s) => s.addMoment);

  // Local state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showHostControls, setShowHostControls] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [lightsOff, setLightsOff] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [syncStatus] = useState("synced");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVideoChat, setShowVideoChat] = useState(false);
  const [mediaSource, setMediaSource] = useState("none");
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState(null);
  const [_showMediaPicker, _setShowMediaPicker] = useState(false);
  const [youtubeVideoId, setYoutubeVideoId] = useState(null);
  const [showYoutubeSearch, setShowYoutubeSearch] = useState(false);

  // Audio mixing
  const [movieVolume, setMovieVolume] = useState(80);
  const [voiceChatVolume, setVoiceChatVolume] = useState(60);
  const [deafenVoiceChat] = useState(false);
  const [_mutedUsers] = useState(new Set());

  // Room settings
  const [roomSettings, setRoomSettings] = useState({
    chatEnabled: true,
    reactionsEnabled: true,
    isPrivate: true,
    allowScreenShare: true,
    slowMode: false,
  });

  // Refs
  const chatEndRef = useRef(null);
  const reactionIdRef = useRef(0);
  const containerRef = useRef(null);
  const uploadVideoRef = useRef(null);
  const fileInputRef = useRef(null);
  const suppressRemoteSyncRef = useRef(false);

  // WebRTC
  const webrtc = useWebRTC();

  // Determine user role
  const userRole = isHost ? "host" : (dbParticipants?.find(p => p.user_id === user?.id)?.role || "guest");
  const canControl = userRole === "host" || userRole === "co-host";

  // YouTube player
  const ytPlayer = useYouTubePlayer({
    videoId: mediaSource === "youtube" ? youtubeVideoId : null,
    onStateChange: (state) => {
      if (state === "playing") {
        setIsPlaying(true);
        if (canControl && mediaSource === "youtube" && !suppressRemoteSyncRef.current) {
          roomSync.broadcastPlay();
        }
      } else if (state === "paused") {
        setIsPlaying(false);
        if (canControl && mediaSource === "youtube" && !suppressRemoteSyncRef.current) {
          roomSync.broadcastPause();
        }
      }
    },
    onReady: () => {
      if (!canControl && mediaSource === "youtube" && isPlaying) {
        ytPlayer.play();
      }
    },
    onVideoChange: (newVideoId) => {
      setYoutubeVideoId(newVideoId);
      setMediaSource("youtube");
      setIsPlaying(true);
      setProgress(0);
      if (canControl) {
        roomSync.broadcastMediaChange({ type: "youtube", videoId: newVideoId, title: "YouTube Video" });
        roomSync.broadcastPlay();
      }
    },
  });

  // Sync engine
  const roomSync = useRoomSync({
    roomId,
    isHost,
    isCoHost: userRole === "co-host",
    onMediaChange: (media) => {
      if (media.type === "youtube" && media.videoId) {
        setYoutubeVideoId(media.videoId);
        setMediaSource("youtube");
        setIsPlaying(true);
      } else if (media.type === "upload" && media.videoUrl) {
        setUploadedVideoUrl(media.videoUrl);
        setMediaSource("upload");
        setIsPlaying(true);
      } else if (media.type === "screen") {
        setMediaSource("screen");
      } else {
        setMediaSource("none");
        setYoutubeVideoId(null);
        setUploadedVideoUrl(null);
        setIsPlaying(false);
      }
    },
    onPlay: () => {
      setIsPlaying(true);
      suppressRemoteSyncRef.current = true;
      if (mediaSource === "youtube") {
        ytPlayer.play();
      } else if (mediaSource === "upload" && uploadVideoRef.current) {
        uploadVideoRef.current.play();
      }
      setTimeout(() => { suppressRemoteSyncRef.current = false; }, 400);
    },
    onPause: () => {
      setIsPlaying(false);
      suppressRemoteSyncRef.current = true;
      if (mediaSource === "youtube") {
        ytPlayer.pause();
      } else if (mediaSource === "upload" && uploadVideoRef.current) {
        uploadVideoRef.current.pause();
      }
      setTimeout(() => { suppressRemoteSyncRef.current = false; }, 400);
    },
    onSeek: (pct) => {
      setProgress(pct);
      suppressRemoteSyncRef.current = true;
      if (mediaSource === "youtube") {
        ytPlayer.seekToPercent(pct);
      } else if (mediaSource === "upload" && uploadVideoRef.current?.duration) {
        uploadVideoRef.current.currentTime = (pct / 100) * uploadVideoRef.current.duration;
      }
      setTimeout(() => { suppressRemoteSyncRef.current = false; }, 400);
    },
  });

  // WebRTC mesh for video chat
  const otherParticipantIds = (dbParticipants || [])
    .filter(p => p.user_id !== user?.id)
    .map(p => p.user_id);

  const meshStreams = useWebRTCMesh({
    roomId,
    participantIds: otherParticipantIds,
    localStream: webrtc.stream,
    enabled: showVideoChat,
  });

  // Join time for moments
  const joinTimeRef = useRef(null);

  useEffect(() => {
    joinTimeRef.current = Date.now();
    return () => {
      const durationMs = Date.now() - joinTimeRef.current;
      const mins = Math.round(durationMs / 60000);
      if (mins >= 1) {
        addMoment({
          type: "activity-card",
          activityType: "movie",
          title: `Movie Room ${roomId}`,
          detail: `Watched with ${participants.length} people`,
          emoji: "🎬",
          stats: [
            { label: "Duration", value: mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m` },
            { label: "Viewers", value: `${participants.length}` },
          ],
          mood: "🍿",
        });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMoment, roomId]);

  // Build participants list
  useEffect(() => {
    const list = [];
    if (profile) {
      list.push({
        name: profile.display_name + (isHost ? " (Host)" : ""),
        emoji: profile.avatar_emoji || "😎",
        speaking: false,
        role: isHost ? "host" : (dbParticipants?.find(p => p.user_id === user?.id)?.role || "guest"),
        audioEnabled: webrtc.audioEnabled,
        videoEnabled: webrtc.videoEnabled,
        chatEnabled: true,
        username: profile.username || "",
        isOnline: true,
        odlUserId: user?.id,
      });
    }

    if (dbParticipants) {
      dbParticipants.forEach(p => {
        if (p.user_id === user?.id) return;
        const prof = p.profile || p.profiles;
        const hasRemote = meshStreams.remoteStreams.has(p.user_id);
        const remoteStream = meshStreams.remoteStreams.get(p.user_id);
        const remoteHasVideo = remoteStream ? remoteStream.getVideoTracks().some(t => t.enabled) : false;

        list.push({
          name: prof?.display_name || "User",
          emoji: prof?.avatar_emoji || "🧑",
          speaking: false,
          role: p.role || "guest",
          audioEnabled: hasRemote ? (remoteStream?.getAudioTracks().some(t => t.enabled) ?? true) : true,
          videoEnabled: hasRemote ? remoteHasVideo : false,
          chatEnabled: true,
          username: prof?.username || "",
          isOnline: prof?.is_online ?? true,
          odlUserId: p.user_id,
        });
      });
    }
    setParticipants(list);
  }, [dbParticipants, profile, user?.id, isHost, webrtc.audioEnabled, webrtc.videoEnabled, meshStreams.remoteStreams]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fullscreen detection
  useEffect(() => {
    const handleFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFSChange);
    return () => document.removeEventListener("fullscreenchange", handleFSChange);
  }, []);

  // Media Session API
  useMediaSession({
    title: room?.name || "Movie Room",
    artist: "Watchparty",
    isPlaying,
    onPlay: () => canControl && handleTogglePlay(),
    onPause: () => canControl && handleTogglePlay(),
  });

  // Handlers
  const handleTogglePlay = useCallback(() => {
    if (!canControl) return;

    if (mediaSource === "youtube") {
      if (isPlaying) {
        ytPlayer.pause();
        roomSync.broadcastPause();
      } else {
        ytPlayer.play();
        roomSync.broadcastPlay();
      }
    } else if (mediaSource === "upload" && uploadVideoRef.current) {
      if (uploadVideoRef.current.paused) {
        uploadVideoRef.current.play();
        setIsPlaying(true);
        roomSync.broadcastPlay();
      } else {
        uploadVideoRef.current.pause();
        setIsPlaying(false);
        roomSync.broadcastPause();
      }
    } else {
      setIsPlaying(!isPlaying);
      if (!isPlaying) {
        roomSync.broadcastPlay();
      } else {
        roomSync.broadcastPause();
      }
    }
  }, [isPlaying, mediaSource, ytPlayer, canControl, roomSync]);

  const handleSeek = useCallback((pct) => {
    if (!canControl) return;
    setProgress(pct);
    roomSync.broadcastSeek(pct);
    if (mediaSource === "youtube") {
      ytPlayer.seekToPercent(pct);
    } else if (mediaSource === "upload" && uploadVideoRef.current) {
      uploadVideoRef.current.currentTime = (pct / 100) * uploadVideoRef.current.duration;
    }
  }, [mediaSource, ytPlayer, canControl, roomSync]);

  const handleSendMessage = useCallback(() => {
    if (!chatMessage.trim() || !roomSettings.chatEnabled) return;
    sendMessage(chatMessage.trim());
    setChatMessage("");
  }, [chatMessage, roomSettings.chatEnabled, sendMessage]);

  const handleReaction = useCallback((emoji) => {
    if (!roomSettings.reactionsEnabled) {
      toast.error("Reactions are disabled by the host");
      return;
    }
    const id = reactionIdRef.current++;
    const x = 20 + Math.random() * 60;
    setFloatingReactions(prev => [...prev, { id, emoji, x }]);
    setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 2000);
    setShowReactionPicker(false);
  }, [roomSettings.reactionsEnabled]);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  const handleBookmarkMoment = useCallback(() => {
    const formatTime = (pct) => {
      const totalSeconds = Math.floor((pct / 100) * 6120);
      const m = Math.floor(totalSeconds / 60);
      const s = Math.floor(totalSeconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    addMoment({
      type: "video-clip",
      activityType: "movie",
      title: `${room?.name || "Movie Night"} — Bookmarked`,
      detail: `Manually saved at ${formatTime(progress)}`,
      emoji: "🎬",
      thumbnailEmoji: ["🍿", "🎬", "⭐", "📌", "🔖"][Math.floor(Math.random() * 5)],
      duration: "1:00",
      clipLabel: "⭐ Bookmarked",
      triggerType: "bookmark",
      viewCount: participants.length,
      stats: [
        { label: "Timestamp", value: formatTime(progress) },
        { label: "Viewers", value: `${participants.length}` },
      ],
      mood: "⭐",
    });
    toast.success("⭐ Moment Bookmarked!", {
      description: "A 1-min highlight clip will be captured.",
      duration: 3000,
    });
  }, [addMoment, progress, participants.length, room?.name]);

  // Media source handlers
  const handleScreenShare = useCallback(async () => {
    if (webrtc.screenSharing) {
      webrtc.stopScreenShare();
      setMediaSource("none");
      roomSync.broadcastMediaChange({ type: "none" });
    } else {
      const stream = await webrtc.startScreenShare();
      if (stream) {
        setMediaSource("screen");
        roomSync.broadcastMediaChange({ type: "screen", title: "Screen Share" });
      }
    }
  }, [webrtc, roomSync]);

  const handleUploadVideo = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Please select a video file");
      return;
    }

    // Create object URL for local playback
    const url = URL.createObjectURL(file);
    if (uploadedVideoUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(uploadedVideoUrl);
    }
    setUploadedVideoUrl(url);
    setMediaSource("upload");
    setIsPlaying(true);
    roomSync.broadcastMediaChange({ type: "upload", title: file.name });
  }, [uploadedVideoUrl, roomSync]);

  const handleYoutubeUrl = useCallback(() => {
    setShowYoutubeSearch(true);
  }, []);

  const handleSelectYoutubeVideo = useCallback((video) => {
    setYoutubeVideoId(video.id);
    setMediaSource("youtube");
    setShowYoutubeSearch(false);
    setIsPlaying(true);
    roomSync.broadcastMediaChange({ type: "youtube", videoId: video.id, title: video.title });
    roomSync.broadcastPlay();
  }, [roomSync]);

  const handleToggleVideoChat = useCallback(async () => {
    if (!showVideoChat) {
      if (!webrtc.stream) await webrtc.startMedia(true, true);
      setShowVideoChat(true);
    } else {
      setShowVideoChat(false);
    }
  }, [showVideoChat, webrtc]);

  const _handleToggleUserMute = useCallback((userName) => {
    void userName;
  }, []);

  const handleUpdateParticipant = useCallback(async (name, updates) => {
    setParticipants(prev => prev.map(p => p.name === name ? { ...p, ...updates } : p));
  }, []);

  const handleRemoveParticipant = useCallback((name) => {
    setParticipants(prev => prev.filter(p => p.name !== name));
  }, []);

  const handleUpdateSettings = useCallback((updates) => {
    setRoomSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const formatTime = (pct) => {
    const totalSeconds = Math.floor((pct / 100) * 6120);
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (accessStatus !== "granted") {
    return <RoomAccessGate status={accessStatus} roomType="movie" />;
  }

  return (
    <div ref={containerRef} className={`h-screen bg-background flex flex-col transition-colors duration-700 overflow-hidden ${lightsOff ? "!bg-black" : ""}`}>
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelected} />

      {/* Floating reactions */}
      <div className="fixed inset-0 pointer-events-none z-50">
        <AnimatePresence>
          {floatingReactions.map(r => (
            <motion.div
              key={r.id}
              initial={{ opacity: 1, y: window.innerHeight - 100, x: `${r.x}%` }}
              animate={{ opacity: 0, y: window.innerHeight - 500 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2, ease: "easeOut" }}
              className="absolute text-3xl"
              style={{ left: `${r.x}%` }}
            >
              {r.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Top bar */}
      <AnimatePresence>
        {!lightsOff && (
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass-nav px-4 py-3 flex items-center justify-between z-30 relative"
          >
            <div className="flex items-center gap-3">
              <button onClick={() => navigate("/movies")} className="text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="font-display text-sm font-semibold text-foreground">{room?.name || "Movie Room"}</h1>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    {participants.length} watching · Room {roomId?.slice(0, 6)}
                  </p>
                  <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                    syncStatus === "synced" ? "bg-secondary/20 text-secondary" : "bg-accent/20 text-accent"
                  }`}>
                    {syncStatus === "synced" ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                    {syncStatus === "synced" ? "Synced" : "Syncing..."}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 relative">
              <RoomInfoBar roomId={roomId} roomType="movie" host={room?.host_id === user?.id ? "You (Host)" : participants.find(p => p.role === "host")?.name || "Host"} participantCount={participants.length} />
              <Button size="icon" variant="ghost" onClick={() => setLightsOff(true)} className="text-muted-foreground" title="Lights off">
                <Moon className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => { setShowChat(!showChat); setShowHostControls(false); setShowMixer(false); }} className={showChat ? "text-primary" : "text-muted-foreground"} title="Chat">
                <MessageSquare className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => { setShowMixer(!showMixer); setShowChat(false); setShowHostControls(false); }} className={showMixer ? "text-primary" : "text-muted-foreground"} title="Volume Mixer">
                <Sliders className="w-4 h-4" />
              </Button>
              {canControl && (
                <Button size="icon" variant="ghost" onClick={() => { setShowHostControls(!showHostControls); setShowChat(false); setShowMixer(false); }} className={showHostControls ? "text-primary" : "text-muted-foreground"} title="Host Controls">
                  <Settings className="w-4 h-4" />
                </Button>
              )}
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video area */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {/* Floating participant bubbles */}
          <AnimatePresence>
            {showVideoChat && (
              <FloatingParticipantBubbles
                participants={participants}
                localStream={webrtc.stream}
                localVideoEnabled={webrtc.videoEnabled}
                localAudioEnabled={webrtc.audioEnabled}
                remoteStreams={meshStreams.remoteStreams}
                deafened={deafenVoiceChat}
              />
            )}
          </AnimatePresence>

          {/* Main video area */}
          <div className="flex-1 bg-black flex items-center justify-center relative cursor-pointer group overflow-hidden">
            {mediaSource === "youtube" && youtubeVideoId ? (
              <div className="w-full h-full relative">
                <div ref={ytPlayer.wrapperRef} className="w-full h-full" />
              </div>
            ) : mediaSource === "upload" && uploadedVideoUrl ? (
              <video
                ref={uploadVideoRef}
                src={uploadedVideoUrl}
                autoPlay
                className="w-full h-full object-contain"
                onClick={handleTogglePlay}
              />
            ) : showYoutubeSearch ? (
              <div className="w-full h-full overflow-y-auto bg-background p-4 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <Button size="sm" variant="ghost" onClick={() => setShowYoutubeSearch(false)}>
                    <ChevronLeft className="w-4 h-4" /> Back
                  </Button>
                  <h2 className="text-lg font-semibold text-foreground">Browse YouTube</h2>
                  <Button size="sm" variant="ghost" onClick={() => setShowYoutubeSearch(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <YouTubeSearchTab onSelectVideo={handleSelectYoutubeVideo} />
              </div>
            ) : canControl ? (
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-foreground/5 flex items-center justify-center mx-auto border border-glass-border mb-4">
                  <Play className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-foreground/80 text-sm font-medium mb-2">Choose a media source</p>
                <div className="flex gap-3 justify-center">
                  <Button onClick={handleYoutubeUrl} variant="outline">
                    <Youtube className="w-4 h-4 mr-2" /> YouTube
                  </Button>
                  <Button onClick={handleUploadVideo} variant="outline">
                    <Upload className="w-4 h-4 mr-2" /> Upload
                  </Button>
                  <Button onClick={handleScreenShare} variant="outline">
                    <Monitor className="w-4 h-4 mr-2" /> Screen
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-foreground/5 flex items-center justify-center mx-auto border border-glass-border mb-4">
                  <Film className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-foreground/80 text-sm font-medium">Waiting for host to start</p>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {mediaSource !== "none" && (
            <div className="relative h-1.5 bg-muted/50 cursor-pointer group" onClick={(e) => {
              if (!canControl) return;
              const rect = e.currentTarget.getBoundingClientRect();
              handleSeek(((e.clientX - rect.left) / rect.width) * 100);
            }}>
              <div className="absolute inset-y-0 left-0 gradient-movie transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}

          {/* Controls */}
          <AnimatePresence>
            {!lightsOff && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-2 md:px-4 py-2 flex items-center justify-between bg-card/90 backdrop-blur-sm border-t border-glass-border"
              >
                <div className="flex items-center gap-1.5">
                  <Button size="icon" variant="ghost" onClick={handleTogglePlay}>
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setIsMuted(!isMuted)}>
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </Button>
                  <span className="text-xs text-muted-foreground ml-1">{formatTime(progress)} / 1:42:00</span>
                </div>

                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={handleBookmarkMoment} title="Bookmark Moment">
                    <Bookmark className="w-4 h-4" />
                  </Button>

                  <div className="relative">
                    <Button size="icon" variant="ghost" onClick={() => setShowReactionPicker(!showReactionPicker)}>
                      <Smile className="w-4 h-4" />
                    </Button>
                    <AnimatePresence>
                      {showReactionPicker && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.9 }}
                          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 glass-panel px-2 py-1.5 flex items-center gap-1"
                        >
                          {reactionEmojis.map(emoji => (
                            <button key={emoji} onClick={() => handleReaction(emoji)} className="text-xl hover:scale-125 transition-transform p-1">
                              {emoji}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={handleToggleVideoChat} className={showVideoChat ? "text-secondary" : "text-muted-foreground"}>
                    <Users className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={handleToggleFullscreen}>
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Side panels */}
        <AnimatePresence>
          {showChat && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: isMobile ? "100%" : 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-l border-glass-border bg-card/95 backdrop-blur-xl flex flex-col overflow-hidden flex-shrink-0"
            >
              <div className="p-3 border-b border-glass-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Chat</h3>
                {isMobile && (
                  <button onClick={() => setShowChat(false)} className="text-muted-foreground">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {messages.map((msg) => (
                  <div key={msg.id}>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-primary">{msg.profile?.display_name || "User"}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-foreground pl-2">{msg.text}</p>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t border-glass-border">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={roomSettings.chatEnabled ? "Type a message..." : "Chat disabled"}
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    disabled={!roomSettings.chatEnabled}
                  />
                  <Button size="icon" onClick={handleSendMessage} disabled={!roomSettings.chatEnabled || !chatMessage.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </motion.aside>
          )}

          {showMixer && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: isMobile ? "100%" : 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-l border-glass-border bg-card/95 backdrop-blur-xl flex flex-col overflow-hidden flex-shrink-0"
            >
              <div className="p-3 border-b border-glass-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Volume Mixer</h3>
                {isMobile && (
                  <button onClick={() => setShowMixer(false)} className="text-muted-foreground">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Movie Audio</span>
                    <span className="text-xs text-muted-foreground">{movieVolume}%</span>
                  </div>
                  <Slider value={[movieVolume]} max={100} onValueChange={([v]) => setMovieVolume(v)} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Voice Chat</span>
                    <span className="text-xs text-muted-foreground">{voiceChatVolume}%</span>
                  </div>
                  <Slider value={[voiceChatVolume]} max={100} onValueChange={([v]) => setVoiceChatVolume(v)} />
                </div>
              </div>
            </motion.aside>
          )}

          {showHostControls && (
            <HostControlsPanel
              open={showHostControls}
              onClose={() => setShowHostControls(false)}
              participants={participants}
              onUpdateParticipant={handleUpdateParticipant}
              onRemoveParticipant={handleRemoveParticipant}
              roomSettings={roomSettings}
              onUpdateSettings={handleUpdateSettings}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default MovieRoom;