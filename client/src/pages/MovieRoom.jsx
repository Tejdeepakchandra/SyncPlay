import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, Maximize, Minimize, Volume2, VolumeX,
  MessageSquare, Moon, Sun, Bookmark,
  Youtube, Upload, Monitor, ChevronLeft,
  Send, Smile, SkipForward, Settings,
  Wifi, WifiOff, Mic, MicOff, Video, VideoOff, Users, X,
  Headphones, Sliders, Film, UserMinus, Check
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { socket } from "@/services/socket";

// Hooks
import { useRoom } from "@/hooks/useRoom";
import { useRoomChat } from "@/hooks/useRoomChat";
import { useRoomSync } from "@/hooks/useRoomSync";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useWebRTCMesh } from "@/hooks/useWebRTCMesh";
import { useWebRTCSignaling } from "@/hooks/useWebRTCSignaling";
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer";
import { useMediaSession } from "@/hooks/useMediaSession";
import { useMomentsStore } from "@/stores/momentsStore";

// Components
import FloatingParticipantBubbles from "@/components/FloatingParticipantBubbles";
import RoomAccessGate from "@/components/RoomAccessGate";
import HostControlsPanel from "@/components/HostControlsPanel";
import UserSettingsModal from "@/components/UserSettingsModal";
import RoomInfoBar from "@/components/RoomInfoBar";
import YouTubeSearchTab from "@/components/YouTubeSearchTab";
import GuestNameDialog from "@/components/GuestNameDialog";
import WaitingAreaDialog from "@/components/WaitingAreaDialog";
import JoinRequestNotification from "@/components/JoinRequestNotification";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const reactionEmojis = ["🔥", "😂", "👏", "❤️", "😱", "🎬"];

const MovieRoom = () => {
  const navigate = useNavigate();
  const { roomCode } = useParams();
  const effectiveRoomId = roomCode || "default";
  const { user, profile } = useAuth();

  // Room and chat data
  const { room, participants: dbParticipants, isHost, accessStatus, joinStatus, joinAsGuest, joinRequests, acceptJoinRequest, rejectJoinRequest, currentUserId } = useRoom(effectiveRoomId, "movie");
  const { messages, sendMessage: sendChatMessage, userId } = useRoomChat(effectiveRoomId);

  // ═══════════════════════════════════════════════════════════════════════
  // LOCAL UI STATE
  // ═══════════════════════════════════════════════════════════════════════

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
  const [syncStatus, setSyncStatus] = useState("synced");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVideoChat, setShowVideoChat] = useState(false);
  const [mediaSource, setMediaSource] = useState("none");
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState(null);
  const [youtubeVideoId, setYoutubeVideoId] = useState(null);
  const [showYoutubeSearch, setShowYoutubeSearch] = useState(false);
  const [isJoiningAsGuest, setIsJoiningAsGuest] = useState(false);

  // Audio mixing state
  const [movieVolume, setMovieVolume] = useState(80);
  const [voiceChatVolume, setVoiceChatVolume] = useState(60);
  const [deafenVoiceChat, setDeafenVoiceChat] = useState(false);
  const [mutedUsers, setMutedUsers] = useState(new Set());
  const [videoDisbldUsers, setVideoDisabledUsers] = useState(new Set());
  const [selectedUserSettings, setSelectedUserSettings] = useState(null);
  const [showUserSettings, setShowUserSettings] = useState(false);

  const [roomSettings, setRoomSettings] = useState({
    chatEnabled: true,
    reactionsEnabled: true,
    isPrivate: false,
    allowScreenShare: true,
    slowMode: false,
  });

  // Sync room settings from server when room object is available
  useEffect(() => {
    if (room?.settings) {
      setRoomSettings(prev => ({
        chatEnabled: room.settings.chatEnabled !== undefined ? room.settings.chatEnabled : prev.chatEnabled,
        reactionsEnabled: room.settings.reactionsEnabled !== undefined ? room.settings.reactionsEnabled : prev.reactionsEnabled,
        isPrivate: room.settings.isPrivate !== undefined ? room.settings.isPrivate : prev.isPrivate,
        allowScreenShare: room.settings.allowScreenShare !== undefined ? room.settings.allowScreenShare : prev.allowScreenShare,
        slowMode: room.settings.slowMode !== undefined ? room.settings.slowMode : prev.slowMode,
      }));
    }
  }, [room?.settings]);
  const [showCopyLinkToast, setShowCopyLinkToast] = useState(false);

  // Refs
  const chatEndRef = useRef(null);
  const reactionIdRef = useRef(0);
  const containerRef = useRef(null);
  const uploadVideoRef = useRef(null);
  const fileInputRef = useRef(null);
  const suppressRemoteSyncRef = useRef(false);

  // WebRTC hooks
  const webrtc = useWebRTC();

  // Determine participant IDs for mesh
  // Use currentUserId from room (socket userId from socket:identify event)
  // Fallback to socket.userId directly (set by server auth middleware)
  const myUserId = currentUserId || socket.userId || user?.id;
  const otherParticipantIds = (dbParticipants || [])
    .filter((p) => p.userId !== myUserId)
    .map((p) => p.userId);

  // WebRTC signaling (for screen share)
  const rtcSignaling = useWebRTCSignaling({
    roomCode: effectiveRoomId,
    isHost,
    participantIds: otherParticipantIds,
  });

  // WebRTC mesh (for camera/mic)
  const meshStreams = useWebRTCMesh({
    roomCode: effectiveRoomId,
    participantIds: otherParticipantIds,
    localStream: webrtc.stream,
    enabled: showVideoChat,
    userId: myUserId,
  });

  // User role
  const userRole = isHost ? "host" : (dbParticipants?.find(p => p.userId === myUserId)?.role === "co-host" ? "co-host" : "guest");
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
      } else if (state === "ended") {
        setIsPlaying(false);
        if (canControl && mediaSource === "youtube" && !suppressRemoteSyncRef.current) {
          roomSync.broadcastPause();
        }
        toast("🎬 Video finished!", { description: "Pick another video to continue watching." });
      }
    },
    onReady: () => {
      toast.success("▶️ YouTube player ready", { duration: 1500 });
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
        roomSync.broadcastMediaChange({
          type: "youtube",
          videoId: newVideoId,
          title: "YouTube Video",
        });
        roomSync.broadcastPlay();
      }
      toast("▶️ Switched to suggested video", { duration: 2000 });
    },
  });

  // Room sync
  const roomSync = useRoomSync({
    roomId: effectiveRoomId,
    isHost,
    isCoHost: userRole === "co-host",
    onMediaChange: (media) => {
      if (media.type === "youtube" && media.videoId) {
        setYoutubeVideoId(media.videoId);
        setMediaSource("youtube");
        setIsPlaying(true);
        toast(`🎬 Host is playing: ${media.title || "video"}`, { duration: 2000 });
      } else if (media.type === "upload" && media.videoUrl) {
        setUploadedVideoUrl(media.videoUrl);
        setMediaSource("upload");
        setIsPlaying(true);
        toast(`🎬 Host shared a video: ${media.title || "upload"}`, { duration: 2000 });
      } else if (media.type === "screen") {
        setMediaSource("screen");
        toast(`🖥️ Host is sharing their screen`, { duration: 2000 });
      } else if (media.type === "none" || !media.type) {
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
        setTimeout(() => { suppressRemoteSyncRef.current = false; }, 400);
      } else if (mediaSource === "upload" && uploadVideoRef.current) {
        uploadVideoRef.current.play();
        suppressRemoteSyncRef.current = false;
      } else {
        suppressRemoteSyncRef.current = false;
      }
      toast("▶️ Host resumed playback", { duration: 1500 });
    },
    onPause: () => {
      setIsPlaying(false);
      suppressRemoteSyncRef.current = true;
      if (mediaSource === "youtube") {
        ytPlayer.pause();
        setTimeout(() => { suppressRemoteSyncRef.current = false; }, 400);
      } else if (mediaSource === "upload" && uploadVideoRef.current) {
        uploadVideoRef.current.pause();
        suppressRemoteSyncRef.current = false;
      } else {
        suppressRemoteSyncRef.current = false;
      }
      toast("⏸️ Host paused playback", { duration: 1500 });
    },
    onSeek: (pct) => {
      setProgress(pct);
      suppressRemoteSyncRef.current = true;
      if (mediaSource === "youtube") {
        ytPlayer.seekToPercent(pct);
        setTimeout(() => { suppressRemoteSyncRef.current = false; }, 400);
      } else if (mediaSource === "upload" && uploadVideoRef.current && uploadVideoRef.current.duration) {
        uploadVideoRef.current.currentTime = (pct / 100) * uploadVideoRef.current.duration;
        suppressRemoteSyncRef.current = false;
      } else {
        suppressRemoteSyncRef.current = false;
      }
      toast(`⏩ Host seeked to ${Math.round(pct)}%`, { duration: 1500 });
    },
  });

  const addMoment = useMomentsStore((s) => s.addMoment);
  const joinTimeRef = useRef(Date.now());

  // Initialize
  useEffect(() => {
    joinTimeRef.current = Date.now();
    return () => {
      webrtc.stopMedia();
      if (uploadedVideoUrl) URL.revokeObjectURL(uploadedVideoUrl);
      const durationMs = Date.now() - joinTimeRef.current;
      const mins = Math.round(durationMs / 60000);
      if (mins >= 1) {
        addMoment({
          type: "activity-card",
          activityType: "movie",
          title: `Movie Room ${effectiveRoomId}`,
          detail: `Watched with ${participants.length} people`,
          emoji: "🎬",
          stats: [
            {
              label: "Duration",
              value: mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`,
            },
            { label: "Viewers", value: `${participants.length}` },
          ],
          mood: "🍿",
        });
      }
    };
  }, []);

  // Sync participants
  useEffect(() => {
    const list = [];
    // Always include local user (even if profile not loaded yet)
    if (myUserId && (isHost || accessStatus === "granted")) {
      list.push({
        name: (profile?.display_name || "You") + (isHost ? " (Host)" : ""),
        emoji: profile?.avatar_emoji || "😎",
        speaking: false,
        role: isHost ? "host" : (dbParticipants?.find(p => p.userId === myUserId)?.role || "guest"),
        audioEnabled: webrtc.audioEnabled,
        videoEnabled: webrtc.videoEnabled,
        chatEnabled: true,
        username: profile?.username || user?.username || "You",
        isOnline: true,
        odlUserId: myUserId,
        isLocalUser: true,  // Mark as local user explicitly
      });
    }

    // Remote participants - Get actual stream states
    if (dbParticipants && Array.isArray(dbParticipants)) {
      for (const p of dbParticipants) {
        if (p.userId === myUserId) continue;
        const remoteStream = meshStreams.remoteStreams.get(p.userId);
        
        // Check actual track states from remote stream
        const remoteHasVideo = remoteStream ? remoteStream.getVideoTracks().some(t => t.enabled) : false;
        const remoteHasAudio = remoteStream ? remoteStream.getAudioTracks().some(t => t.enabled) : true;

        list.push({
          name: p.displayName || "User",
          emoji: p.avatar_emoji || "🧑",
          speaking: false,
          role: p.role || "guest",
          audioEnabled: remoteHasAudio,  // Use actual remote track state
          videoEnabled: !!remoteStream,  // Show video container if stream exists (even if tracks disabled)
          chatEnabled: true,
          username: p.username || "",
          isOnline: true,
          odlUserId: p.userId,
          isLocalUser: false,  // Mark as remote user
        });
      }
    }
    setParticipants(list);
  }, [user, dbParticipants, profile, isHost, accessStatus, meshStreams.remoteStreams]);

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

  // Progress tracking for non-YouTube sources
  useEffect(() => {
    if (!isPlaying || mediaSource === "upload" || mediaSource === "youtube") return;
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          setIsPlaying(false);
          toast("🎬 Movie finished!", { description: "Start another?" });
          return 100;
        }
        return prev + 0.15;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, mediaSource]);

  // Sync progress from YouTube
  useEffect(() => {
    if (mediaSource !== "youtube") return;
    const interval = setInterval(() => {
      if (ytPlayer.duration > 0) {
        setProgress(ytPlayer.progressPercent);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [mediaSource, ytPlayer.progressPercent, ytPlayer.duration]);

  // Media Session API
  useMediaSession({
    title: room?.name || "Movie Room",
    artist: "Watchparty",
    isPlaying,
    onPlay: () => handleTogglePlay(),
    onPause: () => handleTogglePlay(),
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
      return;
    }
    if (mediaSource === "upload" && uploadVideoRef.current) {
      if (uploadVideoRef.current.paused) {
        uploadVideoRef.current.play();
        setIsPlaying(true);
        roomSync.broadcastPlay();
      } else {
        uploadVideoRef.current.pause();
        setIsPlaying(false);
        roomSync.broadcastPause();
      }
      return;
    }
    const next = !isPlaying;
    setIsPlaying(next);
    if (next) roomSync.broadcastPlay();
    else roomSync.broadcastPause();
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
  }, [canControl, mediaSource, ytPlayer, roomSync]);

  const handleSendMessage = useCallback(() => {
    const text = chatMessage.trim();
    if (!text || !roomSettings.chatEnabled) return;
    sendChatMessage(text);
    setChatMessage("");
  }, [chatMessage, roomSettings.chatEnabled, sendChatMessage]);

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

  const handleSkipForward = useCallback(() => {
    const newProgress = Math.min(progress + 5, 100);
    setProgress(newProgress);
    if (mediaSource === "youtube") {
      ytPlayer.seekToPercent(newProgress);
    } else if (mediaSource === "upload" && uploadVideoRef.current) {
      uploadVideoRef.current.currentTime = (newProgress / 100) * uploadVideoRef.current.duration;
    }
    toast("⏩ Skipped forward 5%", { duration: 1500 });
  }, [progress, mediaSource, ytPlayer]);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  const handleBookmarkMoment = useCallback(() => {
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
      description: "A 1-min highlight clip has been saved to your Moments.",
      duration: 3000,
    });
  }, [addMoment, progress, participants.length, room?.name]);

  // Media source handlers
  const handleScreenShare = useCallback(async () => {
    if (webrtc.screenSharing) {
      webrtc.stopScreenShare();
      rtcSignaling.stopBroadcastStream();
      setMediaSource("none");
      roomSync.broadcastMediaChange({ type: "none" });
      toast.success("🖥️ Screen sharing stopped", { duration: 2000 });
    } else {
      const stream = await webrtc.startScreenShare();
      if (stream) {
        setMediaSource("screen");
        roomSync.broadcastMediaChange({ type: "screen", title: "Screen Share" });
        rtcSignaling.startBroadcastStream(stream);
        toast.success("🖥️ Screen sharing started!", {
          description: "Your screen is being shared with all participants.",
          duration: 3000,
        });
        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          setMediaSource("none");
          rtcSignaling.stopBroadcastStream();
          roomSync.broadcastMediaChange({ type: "none" });
        });
      }
    }
  }, [webrtc, roomSync, rtcSignaling]);

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

    const url = URL.createObjectURL(file);
    if (uploadedVideoUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(uploadedVideoUrl);
    }
    setUploadedVideoUrl(url);
    setMediaSource("upload");
    setIsPlaying(true);
    toast.success("🎬 Video loaded!", { description: file.name, duration: 2000 });
    roomSync.broadcastMediaChange({ type: "upload", videoUrl: url, title: file.name });
  }, [uploadedVideoUrl, roomSync]);

  const handleYoutubeUrl = useCallback(() => {
    setShowYoutubeSearch(true);
  }, []);

  const handleSelectYoutubeVideo = useCallback((video) => {
    setYoutubeVideoId(video.id);
    setMediaSource("youtube");
    setShowYoutubeSearch(false);
    setIsPlaying(true);
    toast(`🎬 Now playing: ${video.title}`, { duration: 3000 });
    roomSync.broadcastMediaChange({
      type: "youtube",
      videoId: video.id,
      title: video.title,
    });
    roomSync.broadcastPlay();
  }, [roomSync]);

  const handleToggleVideoChat = useCallback(async () => {
    if (!showVideoChat) {
      if (!webrtc.stream) await webrtc.startMedia(true, true);
      setShowVideoChat(true);
      toast.success("📹 Video chat enabled", {
        description: "Your camera and mic are now active.",
        duration: 2000,
      });
    } else {
      setShowVideoChat(false);
    }
  }, [showVideoChat, webrtc]);

  const handleToggleDeafen = useCallback(() => {
    const next = !deafenVoiceChat;
    setDeafenVoiceChat(next);
    toast(next ? "🔇 Voice chat deafened" : "🔊 Voice chat undeafened", {
      description: next ? "You won't hear other participants" : "You can hear participants again",
      duration: 2000,
    });
  }, [deafenVoiceChat]);

  const handleToggleUserMute = useCallback((userId, displayName) => {
    setMutedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
        toast(`🔊 Unmuted ${displayName}`, { duration: 1500 });
      } else {
        next.add(userId);
        toast(`🔇 Muted ${displayName}`, { duration: 1500 });
      }
      return next;
    });
  }, []);

  const handleUpdateParticipant = useCallback((nameOrUserId, updates) => {
    // Support both userId and displayName for backward compatibility
    let targetUserId = null;
    
    // First try treating it as a userId directly
    if (dbParticipants) {
      // Check if it's already a userId
      const byUserId = dbParticipants.find(p => p.userId === nameOrUserId);
      if (byUserId) {
        targetUserId = byUserId.userId;
      } else {
        // Fall back to searching by displayName
        const byDisplay = dbParticipants.find(p => p.displayName === nameOrUserId || p.username === nameOrUserId);
        if (byDisplay) targetUserId = byDisplay.userId;
      }
    }
    
    if (!targetUserId) {
      console.error('❌ Participant not found or missing user ID:', nameOrUserId);
      return;
    }

    // Make sure this is NOT the current user (can't change own permissions)
    if (targetUserId === user?.id) {
      console.warn('⚠️ Cannot change own permissions via host controls');
      return;
    }

    // Update local UI state
    setParticipants(prev => prev.map(p => p.odlUserId === targetUserId ? { ...p, ...updates } : p));

    // Send socket events for permission updates
    if (updates.audioEnabled !== undefined && updates.audioEnabled === false) {
      // Mute user
      socket.emit("room:update-participant-permissions", 
        { 
          roomCode: roomCode,
          targetUserId: targetUserId,
          restrictions: { micDisabledByHost: true }
        },
        (response) => {
          if (response?.success) {
            toast(`🔇 Participant has been muted`, { duration: 2000 });
          } else {
            toast.error(`Failed to mute participant`, { duration: 2000 });
          }
        }
      );
    } else if (updates.audioEnabled === true) {
      // Unmute user
      socket.emit("room:update-participant-permissions", 
        { 
          roomCode: roomCode,
          targetUserId: targetUserId,
          restrictions: { micDisabledByHost: false }
        },
        (response) => {
          if (response?.success) {
            toast(`🔊 Participant has been unmuted`, { duration: 2000 });
          } else {
            toast.error(`Failed to unmute participant`, { duration: 2000 });
          }
        }
      );
    }

    if (updates.videoEnabled !== undefined && updates.videoEnabled === false) {
      // Disable video
      socket.emit("room:update-participant-permissions", 
        { 
          roomCode: roomCode,
          targetUserId: targetUserId,
          restrictions: { videoDisabledByHost: true }
        },
        (response) => {
          if (response?.success) {
            toast(`📹 Video has been disabled`, { duration: 2000 });
          } else {
            toast.error(`Failed to disable video`, { duration: 2000 });
          }
        }
      );
    } else if (updates.videoEnabled === true) {
      // Enable video
      socket.emit("room:update-participant-permissions", 
        { 
          roomCode: roomCode,
          targetUserId: targetUserId,
          restrictions: { videoDisabledByHost: false }
        },
        (response) => {
          if (response?.success) {
            toast(`📹 Video has been enabled`, { duration: 2000 });
          } else {
            toast.error(`Failed to enable video`, { duration: 2000 });
          }
        }
      );
    }

    if (updates.chatEnabled !== undefined && updates.chatEnabled === false) {
      // Disable chat
      socket.emit("room:update-participant-permissions", 
        { 
          roomCode: roomCode,
          targetUserId: targetUserId,
          restrictions: { chatDisabledByHost: true }
        },
        (response) => {
          if (response?.success) {
            toast(`💬 Chat has been disabled`, { duration: 2000 });
          } else {
            toast.error(`Failed to disable chat`, { duration: 2000 });
          }
        }
      );
    } else if (updates.chatEnabled === true) {
      // Enable chat
      socket.emit("room:update-participant-permissions", 
        { 
          roomCode: roomCode,
          targetUserId: targetUserId,
          restrictions: { chatDisabledByHost: false }
        },
        (response) => {
          if (response?.success) {
            toast(`💬 Chat has been enabled`, { duration: 2000 });
          } else {
            toast.error(`Failed to enable chat`, { duration: 2000 });
          }
        }
      );
    }

    // Handle role changes
    if (updates.role === "co-host") {
      socket.emit("room:update-role", 
        { 
          roomCode: roomCode,
          targetUserId: targetUserId,
          newRole: "co-host"
        },
        (response) => {
          if (response?.success) {
            toast(`⬆️ Promoted to Co-Host`, { duration: 2000 });
          } else {
            toast.error(`Failed to promote`, { duration: 2000 });
          }
        }
      );
    } else if (updates.role === "guest") {
      socket.emit("room:update-role", 
        { 
          roomCode: roomCode,
          targetUserId: targetUserId,
          newRole: "guest"
        },
        (response) => {
          if (response?.success) {
            toast(`⬇️ ${name} demoted to Guest`, { duration: 2000 });
          } else {
            toast.error(`Failed to demote ${name}`, { duration: 2000 });
          }
        }
      );
    }
  }, [dbParticipants, roomCode]);

  const handleRemoveParticipant = useCallback((name) => {
    setParticipants(prev => prev.filter(p => p.name !== name));
    toast(`${name} has been removed from the room`, { duration: 3000 });
  }, []);

  const handleUpdateSettings = useCallback((updates) => {
    setRoomSettings(prev => ({ ...prev, ...updates }));
    const key = Object.keys(updates)[0];
    const val = Object.values(updates)[0];
    const labels = {
      chatEnabled: "Chat",
      reactionsEnabled: "Reactions",
      isPrivate: "Private Room",
      allowScreenShare: "Screen Share",
      slowMode: "Slow Mode",
    };
    
    // Send to server to persist settings
    socket.emit('room:update-settings', { 
      roomCode: roomCode, 
      settings: updates 
    }, (response) => {
      if (response?.success) {
        toast(`${labels[key] || key} ${val ? "enabled" : "disabled"}`, { duration: 2000 });
      } else {
        // Revert local state if server update failed
        setRoomSettings(prev => ({ ...prev, [key]: !val }));
        toast.error(`Failed to update settings`, { duration: 2000 });
      }
    });
  }, [roomCode]);

  // Upload video tracking
  useEffect(() => {
    const video = uploadVideoRef.current;
    if (!video || mediaSource !== "upload") return;
    const onTime = () => {
      if (video.duration) setProgress((video.currentTime / video.duration) * 100);
    };
    const onEnded = () => {
      setIsPlaying(false);
      toast("🎬 Movie finished!");
    };
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onEnded);
    };
  }, [mediaSource]);

  // Sync upload video volume
  useEffect(() => {
    const video = uploadVideoRef.current;
    if (!video || mediaSource !== "upload") return;
    video.volume = isMuted ? 0 : movieVolume / 100;
    video.muted = isMuted;
  }, [isMuted, movieVolume, mediaSource]);

  // Sync YouTube player volume
  useEffect(() => {
    if (mediaSource !== "youtube") return;
    if (isMuted) ytPlayer.mute();
    else {
      ytPlayer.unmute();
      ytPlayer.setVolume(movieVolume);
    }
  }, [isMuted, movieVolume, mediaSource, ytPlayer]);

  // Listen for room settings updates from server
  useEffect(() => {
    const handleSettingsUpdated = (data) => {
      setRoomSettings(prev => ({
        chatEnabled: data.settings.chatEnabled !== undefined ? data.settings.chatEnabled : prev.chatEnabled,
        reactionsEnabled: data.settings.reactionsEnabled !== undefined ? data.settings.reactionsEnabled : prev.reactionsEnabled,
        isPrivate: data.settings.isPrivate !== undefined ? data.settings.isPrivate : prev.isPrivate,
        allowScreenShare: data.settings.allowScreenShare !== undefined ? data.settings.allowScreenShare : prev.allowScreenShare,
        slowMode: data.settings.slowMode !== undefined ? data.settings.slowMode : prev.slowMode,
      }));
    };
    socket.on('room:settings-updated', handleSettingsUpdated);
    return () => socket.off('room:settings-updated', handleSettingsUpdated);
  }, []);

  // Listen for permission denied events
  useEffect(() => {
    const handleAudioPermissionDenied = (event) => {
      const { error, error_code } = event.detail;
      toast.error("🔇 Microphone Disabled", {
        description: error || "Host has disabled your microphone",
        duration: 3000,
      });
      console.log('[PERMISSION-DENIED] Audio:', { error, error_code });
    };

    const handleVideoPermissionDenied = (event) => {
      const { error, error_code } = event.detail;
      toast.error("📹 Camera Disabled", {
        description: error || "Host has disabled your camera",
        duration: 3000,
      });
      console.log('[PERMISSION-DENIED] Video:', { error, error_code });
    };

    const handleChatPermissionDenied = (event) => {
      const { error, error_code } = event.detail;
      toast.error("💬 Chat Disabled", {
        description: error || "Host has disabled your chat",
        duration: 3000,
      });
      console.log('[PERMISSION-DENIED] Chat:', { error, error_code });
    };

    const handlePermissionUpdated = (event) => {
      const { targetUserId, restrictions, updatedBy } = event.detail;
      console.log('[PERMISSION-UPDATED]:', { targetUserId, restrictions, updatedBy });
      // Optionally show a notification if permissions were updated for other users
      if (targetUserId !== user?.id) {
        toast("🔐 Participant permissions updated", {
          duration: 2000,
        });
      }
    };

    const handleRoleUpdated = (event) => {
      const { targetUserId, newRole } = event.detail;
      if (targetUserId === user?.id) {
        toast.success(`👑 You are now a ${newRole}!`, {
          duration: 2000,
        });
      }
    };

    window.addEventListener('permission:audio-denied', handleAudioPermissionDenied);
    window.addEventListener('permission:video-denied', handleVideoPermissionDenied);
    window.addEventListener('permission:chat-denied', handleChatPermissionDenied);
    window.addEventListener('permission:updated', handlePermissionUpdated);
    window.addEventListener('permission:role-updated', handleRoleUpdated);

    return () => {
      window.removeEventListener('permission:audio-denied', handleAudioPermissionDenied);
      window.removeEventListener('permission:video-denied', handleVideoPermissionDenied);
      window.removeEventListener('permission:chat-denied', handleChatPermissionDenied);
      window.removeEventListener('permission:updated', handlePermissionUpdated);
      window.removeEventListener('permission:role-updated', handleRoleUpdated);
    };
  }, [user?.id]);

  // Utility functions
  const formatTimeSeconds = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      : `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatTime = (pct) => {
    if (mediaSource === "youtube" && ytPlayer.duration > 0) {
      return formatTimeSeconds((pct / 100) * ytPlayer.duration);
    }
    if (mediaSource === "upload" && uploadVideoRef.current?.duration) {
      return formatTimeSeconds((pct / 100) * uploadVideoRef.current.duration);
    }
    const totalSeconds = Math.floor((pct / 100) * 6120);
    return formatTimeSeconds(totalSeconds);
  };

  const totalDuration =
    mediaSource === "youtube" && ytPlayer.duration > 0
      ? formatTimeSeconds(ytPlayer.duration)
      : mediaSource === "upload" && uploadVideoRef.current?.duration
      ? formatTime(100)
      : "1:42:00";

  const closeAllPanels = () => {
    setShowChat(false);
    setShowHostControls(false);
    setShowMixer(false);
  };

  const handleCopyLink = useCallback(() => {
    const roomLink = `${window.location.origin}/movies/${roomCode}`;
    navigator.clipboard.writeText(roomLink);
    setShowCopyLinkToast(true);
    toast.success("📋 Room link copied!", {
      description: "Paste it to invite friends",
      duration: 2000,
    });
    setTimeout(() => setShowCopyLinkToast(false), 2000);
  }, [roomCode]);

  // Handle guest join
  const handleJoinAsGuest = useCallback(async (guestName) => {
    setIsJoiningAsGuest(true);
    try {
      await joinAsGuest(guestName);
    } catch (error) {
      console.error("Failed to join as guest:", error);
      toast.error("Failed to join room. Please try again.");
      setIsJoiningAsGuest(false);
    }
  }, [joinAsGuest]);

  // Handle cancel waiting
  const handleCancelWaiting = useCallback(() => {
    setIsJoiningAsGuest(false);
  }, []);

  // Show guest name dialog if not authenticated and room is accessible
  if (!user && accessStatus === "granted" && !joinStatus) {
    return (
      <GuestNameDialog
        roomName={room?.name || "Movie Room"}
        onJoinAsGuest={handleJoinAsGuest}
        onSignIn={() => navigate("/sign-in")}
        isLoading={isJoiningAsGuest}
      />
    );
  }

  // Show waiting area if guest is waiting for approval
  if (joinStatus === "waiting_for_approval") {
    return (
      <WaitingAreaDialog
        roomName={room?.name || "Movie Room"}
        guestName={isJoiningAsGuest ? "You" : "Guest"}
        onCancel={handleCancelWaiting}
        roomType="movie"
      />
    );
  }

  if (accessStatus !== "granted") {
    return <RoomAccessGate status={accessStatus} roomType="movie" />;
  }

  return (
    <div
      ref={containerRef}
      className={`h-screen bg-background flex flex-col transition-colors duration-700 overflow-hidden ${
        lightsOff ? "!bg-black" : ""
      }`}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileSelected}
      />

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

      {/* Join request notifications for host */}
      {isHost && (
        <JoinRequestNotification
          joinRequests={joinRequests || []}
          onAccept={acceptJoinRequest}
          onReject={rejectJoinRequest}
          isHost={isHost}
        />
      )}

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
              <button
                onClick={() => navigate("/movies")}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="font-display text-sm font-semibold text-foreground">
                  {room?.name || "Movie Room"}
                </h1>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    {room?.participantCount || 0} watching · Room {roomCode?.slice(0, 6)}
                  </p>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                      syncStatus === "synced"
                        ? "bg-secondary/20 text-secondary"
                        : "bg-accent/20 text-accent"
                    }`}
                  >
                    {syncStatus === "synced" ? (
                      <Wifi className="w-2.5 h-2.5" />
                    ) : (
                      <WifiOff className="w-2.5 h-2.5" />
                    )}
                    {syncStatus === "synced" ? "Synced" : "Syncing..."}
                  </span>
                  {mediaSource !== "none" && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                      {mediaSource === "screen" ? (
                        <Monitor className="w-2.5 h-2.5" />
                      ) : (
                        <Upload className="w-2.5 h-2.5" />
                      )}
                      {mediaSource === "screen" ? "Screen Share" : "Local Video"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 relative">
              <RoomInfoBar
                roomId={effectiveRoomId}
                roomType="movie"
                host={
                  isHost
                    ? "You (Host)"
                    : (room?.participants?.find(p => p.userId === room?.hostId)?.displayName || 
                       room?.participants?.find(p => p.userId === room?.hostId)?.username || 
                       "Host")
                }
                participantCount={room?.participantCount || participants.length || 1}
                isHost={isHost}
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setLightsOff(true)}
                className="text-muted-foreground"
                title="Lights off"
              >
                <Moon className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (showChat) {
                    setShowChat(false);
                  } else {
                    closeAllPanels();
                    setShowChat(true);
                  }
                }}
                className={showChat ? "text-primary" : "text-muted-foreground"}
                title="Chat"
              >
                <MessageSquare className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (showMixer) {
                    setShowMixer(false);
                  } else {
                    closeAllPanels();
                    setShowMixer(true);
                  }
                }}
                className={showMixer ? "text-primary" : "text-muted-foreground"}
                title="Volume Mixer"
              >
                <Sliders className="w-4 h-4" />
              </Button>
              {canControl && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (showHostControls) {
                      setShowHostControls(false);
                    } else {
                      closeAllPanels();
                      setShowHostControls(true);
                    }
                  }}
                  className={showHostControls ? "text-primary" : "text-muted-foreground"}
                  title="Host Controls"
                >
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

          {/* Main video display */}
          <div className="flex-1 bg-black flex items-center justify-center relative cursor-pointer group overflow-hidden">
            {mediaSource === "youtube" && youtubeVideoId ? (
              <div className="w-full h-full relative">
                <div ref={ytPlayer.wrapperRef} className="w-full h-full" />
                {ytPlayer.playerState === "ended" && (
                  <div className="absolute inset-0 z-10 cursor-pointer flex items-center justify-center bg-black/60" onClick={() => { ytPlayer.seekTo(0); ytPlayer.play(); }}>
                    <div className="text-center text-white space-y-3">
                      <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto">
                        <Play className="w-7 h-7 text-white ml-1" />
                      </div>
                      <p className="text-sm font-medium">Replay or pick a new video</p>
                    </div>
                  </div>
                )}
              </div>
            ) : mediaSource === "screen" && (webrtc.screenStream || rtcSignaling.remoteStream) ? (
              <video
                src={webrtc.screenStream || rtcSignaling.remoteStream}
                autoPlay
                className="w-full h-full object-contain"
              />
            ) : mediaSource === "upload" && uploadedVideoUrl ? (
              <video
                ref={uploadVideoRef}
                src={uploadedVideoUrl}
                autoPlay
                className="w-full h-full object-contain"
                onClick={() => {
                  handleTogglePlay();
                }}
              />
            ) : showYoutubeSearch ? (
              <div className="w-full h-full overflow-y-auto bg-background p-4 md:p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowYoutubeSearch(false)}
                      className="text-muted-foreground hover:text-foreground -ml-1"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <Youtube className="w-5 h-5 text-destructive" />
                      Browse YouTube
                    </h2>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowYoutubeSearch(false)}
                    className="text-muted-foreground"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <YouTubeSearchTab onSelectVideo={handleSelectYoutubeVideo} />
              </div>
            ) : canControl ? (
              <div className="text-center">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="w-20 h-20 rounded-full bg-foreground/5 flex items-center justify-center mx-auto border border-glass-border">
                    <Play className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-foreground/80 text-sm font-medium mb-1">Choose a media source</p>
                    <p className="text-muted-foreground text-xs">Pick how you want to watch together</p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3 justify-center w-full max-w-sm mx-auto">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleYoutubeUrl}
                      className="flex flex-row sm:flex-col items-center gap-3 sm:gap-2 p-3 sm:p-4 rounded-2xl bg-foreground/5 border border-glass-border hover:border-primary/40 hover:bg-primary/5 transition-all w-full sm:w-28"
                    >
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                        <Youtube className="w-5 h-5 sm:w-6 sm:h-6 text-destructive" />
                      </div>
                      <div className="text-left sm:text-center">
                        <span className="text-xs font-medium text-foreground block">YouTube</span>
                        <span className="text-[10px] text-muted-foreground">Search & Browse</span>
                      </div>
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleUploadVideo}
                      className="flex flex-row sm:flex-col items-center gap-3 sm:gap-2 p-3 sm:p-4 rounded-2xl bg-foreground/5 border border-glass-border hover:border-secondary/40 hover:bg-secondary/5 transition-all w-full sm:w-28"
                    >
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                        <Upload className="w-5 h-5 sm:w-6 sm:h-6 text-secondary" />
                      </div>
                      <div className="text-left sm:text-center">
                        <span className="text-xs font-medium text-foreground block">Upload</span>
                        <span className="text-[10px] text-muted-foreground">Local file</span>
                      </div>
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleScreenShare}
                      className="flex flex-row sm:flex-col items-center gap-3 sm:gap-2 p-3 sm:p-4 rounded-2xl bg-foreground/5 border border-glass-border hover:border-primary/40 hover:bg-primary/5 transition-all w-full sm:w-28"
                    >
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Monitor className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                      </div>
                      <div className="text-left sm:text-center">
                        <span className="text-xs font-medium text-foreground block">Screen</span>
                        <span className="text-[10px] text-muted-foreground">Share screen</span>
                      </div>
                    </motion.button>
                  </div>
                </motion.div>
              </div>
            ) : (
              <div className="text-center">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div className="w-20 h-20 rounded-full bg-foreground/5 flex items-center justify-center mx-auto border border-glass-border">
                    <Film className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-foreground/80 text-sm font-medium">Waiting for host to start the movie</p>
                  <p className="text-muted-foreground text-xs">The host controls what plays in this room</p>
                </motion.div>
              </div>
            )}

            {/* Overlay play/pause */}
            {mediaSource !== "none" && mediaSource !== "youtube" && (
              <div
                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleTogglePlay}
              >
                <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                  {isPlaying ? (
                    <Pause className="w-7 h-7 text-white" />
                  ) : (
                    <Play className="w-7 h-7 text-white ml-1" />
                  )}
                </div>
              </div>
            )}

            {/* Lights on button */}
            {lightsOff && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  setLightsOff(false);
                }}
                className="absolute top-4 right-4 text-foreground/30 hover:text-foreground/60 transition-colors z-30"
              >
                <Sun className="w-5 h-5" />
              </button>
            )}

            {/* Media source switch button */}
            {mediaSource !== "none" && !lightsOff && (
              <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-black/50 backdrop-blur-sm border border-white/10 text-white hover:bg-black/70 h-7 text-xs gap-1.5"
                  onClick={() => {
                    if (mediaSource === "screen") {
                      webrtc.stopScreenShare();
                      setMediaSource("none");
                    } else if (mediaSource === "youtube") {
                      ytPlayer.destroyPlayer();
                      setYoutubeVideoId(null);
                      setMediaSource("none");
                      setShowYoutubeSearch(true);
                    } else if (mediaSource === "upload") {
                      if (uploadedVideoUrl) {
                        URL.revokeObjectURL(uploadedVideoUrl);
                        setUploadedVideoUrl(null);
                      }
                      setMediaSource("none");
                    }
                    setIsPlaying(false);
                  }}
                >
                  <X className="w-3 h-3" />
                  Stop {mediaSource === "screen" ? "sharing" : "video"}
                </Button>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {mediaSource !== "none" && (
            <div
              className="relative h-1.5 bg-muted/50 cursor-pointer group"
              onClick={e => {
                if (!canControl) return;
                const rect = e.currentTarget.getBoundingClientRect();
                handleSeek(((e.clientX - rect.left) / rect.width) * 100);
              }}
            >
              <div className="absolute inset-y-0 left-0 gradient-movie transition-all" style={{ width: `${progress}%` }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-primary shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${progress}%`, transform: `translateX(-50%) translateY(-50%)` }}
              />
            </div>
          )}

          {/* Controls */}
          <AnimatePresence>
            {!lightsOff && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-2 md:px-4 py-2 md:py-2.5 flex items-center justify-between bg-card/90 backdrop-blur-sm border-t border-glass-border gap-1"
              >
                {/* Left controls */}
                <div className="flex items-center gap-1.5">
                  <Button size="icon" variant="ghost" onClick={handleTogglePlay} className="h-8 w-8">
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleSkipForward}
                    title="Skip forward 5%"
                    className="h-8 w-8"
                  >
                    <SkipForward className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsMuted(!isMuted)}
                    className="h-8 w-8"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </Button>
                  <span className="text-xs text-muted-foreground ml-1">
                    {formatTime(progress)} / {totalDuration}
                  </span>
                </div>

                {/* Center controls */}
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleBookmarkMoment}
                    title="Bookmark Moment"
                    className="h-8 w-8 text-muted-foreground hover:text-accent"
                  >
                    <Bookmark className="w-4 h-4" />
                  </Button>

                  {/* Media buttons */}
                  <div className="flex items-center gap-0.5 mx-1 px-1.5 md:px-2 py-1 rounded-full bg-muted/30 border border-glass-border">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleScreenShare}
                      title={webrtc.screenSharing ? "Stop Screen Share" : "Screen Share"}
                      className={`h-7 w-7 rounded-full ${
                        mediaSource === "screen"
                          ? "text-primary bg-primary/10"
                          : "text-muted-foreground"
                      }`}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleUploadVideo}
                      title="Upload Video"
                      className={`h-7 w-7 rounded-full ${
                        mediaSource === "upload"
                          ? "text-secondary bg-secondary/10"
                          : "text-muted-foreground"
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleYoutubeUrl}
                      title="YouTube URL"
                      className="h-7 w-7 rounded-full text-muted-foreground"
                    >
                      <Youtube className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="relative">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setShowReactionPicker(!showReactionPicker)}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
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
                            <button
                              key={emoji}
                              onClick={() => handleReaction(emoji)}
                              className="text-xl hover:scale-125 transition-transform p-1"
                            >
                              {emoji}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleToggleVideoChat}
                    title="Toggle Video Chat"
                    className={`h-8 w-8 ${showVideoChat ? "text-secondary" : "text-muted-foreground"}`}
                  >
                    <Users className="w-4 h-4" />
                  </Button>

                  {/* Voice controls when video chat is on */}
                  {showVideoChat && (
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted/30 border border-glass-border">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          webrtc.toggleAudio();
                          toast(webrtc.audioEnabled ? "🔇 Mic muted" : "🎤 Mic unmuted", {
                            duration: 1500,
                          });
                        }}
                        title={webrtc.audioEnabled ? "Mute" : "Unmute"}
                        className={`h-7 w-7 rounded-full ${
                          webrtc.audioEnabled
                            ? "text-foreground"
                            : "text-destructive bg-destructive/10"
                        }`}
                      >
                        {webrtc.audioEnabled ? (
                          <Mic className="w-3.5 h-3.5" />
                        ) : (
                          <MicOff className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => webrtc.toggleVideo()}
                        title={webrtc.videoEnabled ? "Camera Off" : "Camera On"}
                        className={`h-7 w-7 rounded-full ${
                          webrtc.videoEnabled
                            ? "text-foreground"
                            : "text-destructive bg-destructive/10"
                        }`}
                      >
                        {webrtc.videoEnabled ? (
                          <Video className="w-3.5 h-3.5" />
                        ) : (
                          <VideoOff className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleToggleDeafen}
                        title={deafenVoiceChat ? "Undeafen" : "Deafen"}
                        className={`h-7 w-7 rounded-full ${
                          deafenVoiceChat
                            ? "text-destructive bg-destructive/10"
                            : "text-muted-foreground"
                        }`}
                      >
                        {deafenVoiceChat ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Headphones className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  )}

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleToggleFullscreen}
                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                    className="h-8 w-8"
                  >
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Side panels */}
        <AnimatePresence mode="wait">
          {/* Chat Panel */}
          {showChat && !showMixer && !lightsOff && (
            <motion.aside
              key="chat"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: window.innerWidth < 768 ? "100%" : 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className={`border-l border-glass-border bg-card/95 backdrop-blur-xl flex flex-col overflow-hidden flex-shrink-0 ${
                window.innerWidth < 768
                  ? "absolute inset-0 z-30 border-l-0"
                  : ""
              }`}
            >
              <div className="p-3 border-b border-glass-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Live Chat</h3>
                <div className="flex items-center gap-2">
                  {!roomSettings.chatEnabled && (
                    <span className="text-[10px] text-destructive font-medium">Disabled</span>
                  )}
                  {window.innerWidth < 768 && (
                    <button
                      onClick={() => setShowChat(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div
                className={`flex-1 overflow-y-auto p-3 space-y-3 ${
                  window.innerWidth < 768 ? "w-full" : "w-[300px]"
                }`}
              >
                {messages.map(msg => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-0.5"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm">{msg.profile?.avatar_emoji || "🧑"}</span>
                      <span
                        className={`text-xs font-semibold ${
                          msg.user_id === userId ? "text-secondary" : "text-primary"
                        }`}
                      >
                        {msg.profile?.display_name || "User"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground pl-6">{msg.text}</p>
                  </motion.div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="p-3 border-t border-glass-border">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={roomSettings.chatEnabled ? "Type a message..." : "Chat is disabled"}
                    value={chatMessage}
                    onChange={e => setChatMessage(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSendMessage()}
                    className="bg-muted/50 border-glass-border text-sm"
                    disabled={!roomSettings.chatEnabled}
                  />
                  <Button
                    size="icon"
                    className="flex-shrink-0 gradient-movie"
                    disabled={!roomSettings.chatEnabled || !chatMessage.trim()}
                    onClick={handleSendMessage}
                  >
                    <Send className="w-4 h-4 text-primary-foreground" />
                  </Button>
                </div>
              </div>
            </motion.aside>
          )}

          {/* Volume Mixer Panel */}
          {showMixer && !showChat && !lightsOff && (
            <motion.aside
              key="mixer"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: window.innerWidth < 768 ? "100%" : 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className={`border-l border-glass-border bg-card/95 backdrop-blur-xl flex flex-col overflow-hidden flex-shrink-0 ${
                window.innerWidth < 768
                  ? "absolute inset-0 z-30 border-l-0"
                  : ""
              }`}
            >
              <div className="p-3 border-b border-glass-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Volume Mixer</h3>
                </div>
                {window.innerWidth < 768 && (
                  <button
                    onClick={() => setShowMixer(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div
                className={`flex-1 overflow-y-auto p-4 space-y-6 ${
                  window.innerWidth < 768 ? "w-full" : "w-[320px]"
                }`}
              >
                {/* Movie Volume */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                        <Film className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Movie Audio</p>
                        <p className="text-[10px] text-muted-foreground">Movie/video volume</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                      {isMuted ? 0 : movieVolume}%
                    </span>
                  </div>
                  <Slider
                    value={[isMuted ? 0 : movieVolume]}
                    max={100}
                    step={1}
                    onValueChange={([v]) => {
                      setMovieVolume(v);
                      if (v > 0) setIsMuted(false);
                    }}
                    className="w-full"
                  />
                </div>

                {/* Voice Chat Volume */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          deafenVoiceChat ? "bg-destructive/15" : "bg-secondary/15"
                        }`}
                      >
                        {deafenVoiceChat ? (
                          <VolumeX className="w-4 h-4 text-destructive" />
                        ) : (
                          <Headphones className="w-4 h-4 text-secondary" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Voice Chat</p>
                        <p className="text-[10px] text-muted-foreground">
                          {deafenVoiceChat
                            ? "Deafened — not hearing anyone"
                            : showVideoChat
                            ? "Incoming voice level"
                            : "Enable video chat first"}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                      {deafenVoiceChat ? 0 : voiceChatVolume}%
                    </span>
                  </div>
                  <Slider
                    value={[deafenVoiceChat ? 0 : voiceChatVolume]}
                    max={100}
                    step={1}
                    onValueChange={([v]) => {
                      setVoiceChatVolume(v);
                      if (v > 0) setDeafenVoiceChat(false);
                      if (v === 0) setDeafenVoiceChat(true);
                    }}
                    disabled={!showVideoChat}
                    className="w-full"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={deafenVoiceChat ? "destructive" : "outline"}
                      onClick={handleToggleDeafen}
                      disabled={!showVideoChat}
                      className="text-xs h-7 gap-1.5"
                    >
                      {deafenVoiceChat ? (
                        <VolumeX className="w-3 h-3" />
                      ) : (
                        <Volume2 className="w-3 h-3" />
                      )}
                      {deafenVoiceChat ? "Undeafen" : "Deafen All"}
                    </Button>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-glass-border" />

                {/* Per-user controls */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Individual Users
                  </p>
                  {dbParticipants && dbParticipants.length > 0 ? (
                    dbParticipants
                      .filter(p => p.userId !== user?.id)
                      .map(p => {
                        const displayName = p.displayName || p.username || "User";
                        const userMuted = mutedUsers.has(p.userId) || deafenVoiceChat;
                        const videoDisabled = videoDisbldUsers.has(p.userId);
                        
                        // Check actual remote stream state
                        const remoteStream = meshStreams.remoteStreams.get(p.userId);
                        const remoteAudioEnabled = remoteStream ? remoteStream.getAudioTracks().some(t => t.enabled) : true;
                        const remoteVideoEnabled = remoteStream ? remoteStream.getVideoTracks().some(t => t.enabled) : false;
                        
                        // Show status based on both host control AND remote state
                        const statusParts = [];
                        if (!remoteAudioEnabled) statusParts.push("Audio off");
                        if (!remoteVideoEnabled) statusParts.push("Video off");
                        if (userMuted && remoteAudioEnabled) statusParts.push("Muted by you");
                        if (videoDisabled && remoteVideoEnabled) statusParts.push("Video disabled by you");
                        const status = statusParts.length > 0 ? statusParts.join(" • ") : "Active";
                        
                        return (
                          <div key={p.userId} className="glass-panel p-3 space-y-2">
                            <div className="flex items-center gap-2.5">
                              <div className="relative flex-shrink-0">
                                <div
                                  className={`w-9 h-9 rounded-full bg-muted flex items-center justify-center text-lg ${
                                    userMuted || videoDisabled ? "opacity-50" : ""
                                  }`}
                                >
                                  {p.avatar_emoji || "👤"}
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                                <p className="text-[10px] text-muted-foreground">{status}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className={`h-7 w-7 ${userMuted ? "text-destructive" : "text-foreground"}`}
                                  onClick={() => handleToggleUserMute(p.userId, displayName)}
                                  title={userMuted ? `Unmute ${displayName}` : `Mute ${displayName}`}
                                  disabled={!showVideoChat}
                                >
                                  {userMuted ? (
                                    <VolumeX className="w-3.5 h-3.5" />
                                  ) : (
                                    <Volume2 className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className={`h-7 w-7 ${videoDisabled ? "text-destructive" : "text-foreground"}`}
                                  onClick={() => {
                                    if (videoDisabled) {
                                      setVideoDisabledUsers(prev => new Set([...prev].filter(id => id !== p.userId)));
                                    } else {
                                      setVideoDisabledUsers(prev => new Set([...prev, p.userId]));
                                    }
                                  }}
                                  title={videoDisabled ? "Enable video" : "Disable video"}
                                  disabled={!showVideoChat}
                                >
                                  {videoDisabled ? (
                                    <VideoOff className="w-3.5 h-3.5" />
                                  ) : (
                                    <Video className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    setSelectedUserSettings({
                                      ...p,
                                      name: displayName,
                                      audioEnabled: !userMuted,
                                      videoEnabled: !videoDisabled,
                                      role: p.role || "guest",
                                      userId: p.userId,
                                    });
                                    setShowUserSettings(true);
                                  }}
                                  title="User settings"
                                >
                                  <Settings className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No other participants yet</p>
                  )}
                </div>

                {/* Mic controls */}
                <div className="border-t border-glass-border pt-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Your Microphone
                  </p>
                  <div className="glass-panel p-3 flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        showVideoChat && webrtc.audioEnabled
                          ? "bg-secondary/15"
                          : "bg-muted"
                      }`}
                    >
                      {showVideoChat && webrtc.audioEnabled ? (
                        <Mic className="w-4 h-4 text-secondary" />
                      ) : (
                        <MicOff className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {!showVideoChat
                          ? "Video chat off"
                          : webrtc.audioEnabled
                          ? "Mic active"
                          : "Mic muted"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {!showVideoChat
                          ? "Enable video chat to use mic"
                          : webrtc.audioEnabled
                          ? "Others can hear you"
                          : "Others can't hear you"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={showVideoChat && webrtc.audioEnabled ? "secondary" : "outline"}
                      onClick={() => {
                        if (!showVideoChat) {
                          handleToggleVideoChat();
                        } else {
                          webrtc.toggleAudio();
                          toast(webrtc.audioEnabled ? "🔇 Mic muted" : "🎤 Mic unmuted", {
                            duration: 1500,
                          });
                        }
                      }}
                      className="text-xs h-7 gap-1.5"
                    >
                      {showVideoChat && webrtc.audioEnabled ? (
                        <Mic className="w-3 h-3" />
                      ) : (
                        <MicOff className="w-3 h-3" />
                      )}
                      {!showVideoChat ? "Join Chat" : webrtc.audioEnabled ? "Mute" : "Unmute"}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.aside>
          )}

          {/* Host Controls Panel */}
          {showHostControls && !showMixer && !showChat && !lightsOff && (
            <HostControlsPanel
              key="host-controls"
              open={showHostControls}
              onClose={() => setShowHostControls(false)}
              participants={participants}
              onUpdateParticipant={handleUpdateParticipant}
              onRemoveParticipant={handleRemoveParticipant}
              roomSettings={roomSettings}
              onUpdateSettings={handleUpdateSettings}
              hideVideoControls={false}
            />
          )}

          {/* User Settings Modal */}
          <UserSettingsModal
            user={selectedUserSettings}
            isOpen={showUserSettings}
            onClose={() => {
              setShowUserSettings(false);
              setSelectedUserSettings(null);
            }}
          />
        </AnimatePresence>
      </div>
    </div>
  );
};

export default MovieRoom;