import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat,
  MessageSquare, Music, ListMusic, Sliders, Settings,
  Heart, Bookmark, Smile, Headphones, VolumeX,
  ChevronLeft, ChevronUp, Send, Volume2, Wifi, WifiOff, X,
  Mic, MicOff, UserX, Youtube, Upload, UserPlus, Users,
  MoreVertical
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { socket } from "@/services/socket";
import { toast } from "sonner";
import api from "@/services/api";

// Hooks
import { useRoom } from "@/hooks/useRoom";
import { useRoomChat } from "@/hooks/useRoomChat";
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer";
import { useRoomSync } from "@/hooks/useRoomSync";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useWebRTCMesh } from "@/hooks/useWebRTCMesh";
import { useMediaSession } from "@/hooks/useMediaSession";

// Components
import RoomAccessGate from "@/components/RoomAccessGate";
import HostControlsPanel from "@/components/HostControlsPanel";
import RoomInfoBar from "@/components/RoomInfoBar";
import GuestNameDialog from "@/components/GuestNameDialog";
import WaitingAreaDialog from "@/components/WaitingAreaDialog";
import JoinRequestNotification from "@/components/JoinRequestNotification";
import UpNextQueue from "@/components/UpNextQueue";
import TrackEndedOverlay from "@/components/TrackEndedOverlay";
import MusicSourcePicker from "@/components/MusicSourcePicker";
import InviteFriendsModal from "@/components/InviteFriendsModal";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

const reactionEmojis = ["🔥", "🎵", "💜", "👏", "🎧", "🤩"];

const audioBubblePositions = [
  { bottom: "24px", right: "24px" },
  { top: "24px", left: "24px" },
  { top: "24px", right: "24px" },
  { bottom: "24px", left: "24px" },
  { top: "50%", left: "12px" },
  { top: "50%", right: "12px" },
];

function OverlayAudioBubble({
  participant,
  index,
  isLocal,
  localAudioEnabled,
  isMutedByYou,
  onToggleMute,
}) {
  const [showMenu, setShowMenu] = useState(false);
  const hasAudio = isLocal ? localAudioEnabled : (participant.audioEnabled && !isMutedByYou);
  const pos = audioBubblePositions[index % audioBubblePositions.length];
  const isSpeaking = participant.speaking && hasAudio;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0 }}
      transition={{ delay: index * 0.1, type: "spring", stiffness: 260, damping: 20 }}
      className="absolute z-20 group cursor-pointer"
      style={pos}
      title={`${participant.name}${isSpeaking ? " (speaking)" : ""}${isMutedByYou ? " (muted by you)" : ""}`}
      onClick={() => !isLocal && setShowMenu(!showMenu)}
    >
      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="absolute -inset-1.5 rounded-full border-2 border-secondary pointer-events-none"
          />
        )}
      </AnimatePresence>

      <div
        className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center relative transition-shadow duration-300 ${
          isLocal ? "ring-2 ring-primary/60" : ""
        } ${isMutedByYou ? "opacity-50" : ""}`}
        style={{
          background: "hsl(var(--muted) / 0.85)",
          backdropFilter: "blur(8px)",
          boxShadow: isSpeaking
            ? "0 0 0 2px hsl(var(--secondary)), 0 0 16px hsl(var(--secondary) / 0.35)"
            : "0 0 0 1.5px hsl(var(--border)), 0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        <span className="text-xl md:text-2xl select-none">{participant.emoji}</span>
        {!isSpeaking && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-card/90 backdrop-blur flex items-center justify-center border border-border">
            {isMutedByYou ? <UserX className="w-2.5 h-2.5 text-destructive" /> : hasAudio ? <Mic className="w-2.5 h-2.5 text-secondary" /> : <MicOff className="w-2.5 h-2.5 text-destructive" />}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showMenu && !isLocal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 5 }}
            className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-xl border border-border rounded-xl shadow-xl z-50 overflow-hidden min-w-[140px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => { onToggleMute(); setShowMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors">
              {isMutedByYou ? (
                <><Volume2 className="w-3.5 h-3.5 text-secondary" /><span className="text-foreground">Unmute {participant.name.split(" ")[0]}</span></>
              ) : (
                <><VolumeX className="w-3.5 h-3.5 text-destructive" /><span className="text-foreground">Mute {participant.name.split(" ")[0]}</span></>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const MusicRoom = () => {
  const navigate = useNavigate();
  const { roomCode } = useParams();
  const { user, clerkUser } = useAuth();

  useEffect(() => {
    const normalized = String(roomCode || "").trim().toUpperCase();
    if (normalized) {
      localStorage.setItem("syncplay:last-room-code", normalized);
    }
  }, [roomCode]);

  // Room data from backend
  const {
    room,
    participants: dbParticipants,
    isHost,
    accessStatus,
    joinStatus,
    guestName,
    joinRequests,
    currentUserId,
    leaveRoom,
    endRoom,
    joinAsGuest,
    acceptJoinRequest,
    rejectJoinRequest
  } = useRoom(roomCode);
  const { messages, sendMessage } = useRoomChat(roomCode);
  
  // Local state
  const [isJoiningAsGuest, setIsJoiningAsGuest] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showHostControls, setShowHostControls] = useState(false);
  const [showInviteFriends, setShowInviteFriends] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [participants, setParticipants] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showUpNext, setShowUpNext] = useState(false);
  const [_trackProgress, _setTrackProgress] = useState(0);
  const [_trackDuration, _setTrackDuration] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isLandscape, setIsLandscape] = useState(() => window.innerWidth > window.innerHeight);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [musicVolume, setMusicVolume] = useState(80);
  const [voiceChatVolume, setVoiceChatVolume] = useState(60);
  const [deafenVoiceChat, setDeafenVoiceChat] = useState(false);
  const [mutedUserIds, setMutedUserIds] = useState(new Set());
  const [audioActive, setAudioActive] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("off"); // off, one, all
  const [showSourcePicker, setShowSourcePicker] = useState(true);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [_searchResults, _setSearchResults] = useState([]);
  const [_isSearching, _setIsSearching] = useState(false);
  const [_showYoutubeSearch, _setShowYoutubeSearch] = useState(false);
  const [trackEnded, setTrackEnded] = useState(false);
  const [_showAudioBubbles, _setShowAudioBubbles] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [mobileNeedsGesture, setMobileNeedsGesture] = useState(false);
  const uniqueParticipantCount = useMemo(() => {
    if (!Array.isArray(participants) || participants.length === 0) {
      return Math.max(Number(room?.participantCount || 0), 1);
    }

    const seen = new Set();
    participants.forEach((p, index) => {
      const key = String(p?.userId || p?.id || p?.username || p?.name || `idx:${index}`);
      seen.add(key);
    });

    return Math.max(seen.size, 1);
  }, [participants, room?.participantCount]);
  const [isUploadingTrack, setIsUploadingTrack] = useState(false);
  const [uploadTrackProgress, setUploadTrackProgress] = useState(0);
  const [uploadTrackStatus, setUploadTrackStatus] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [syncStatus, _setSyncStatus] = useState("synced");
  const [localDuration, setLocalDuration] = useState(0);
  const [localCurrentTime, setLocalCurrentTime] = useState(0);
  const [roomSettings, setRoomSettings] = useState({
    chatEnabled: true,
    reactionsEnabled: true,
    allowScreenShare: false,
    slowMode: false,
  });

  // Audio refs
  const chatEndRef = useRef(null);
  const reactionIdRef = useRef(0);
  const containerRef = useRef(null);
  const localAudioRef = useRef(null);
  const pendingLocalControlRef = useRef(null);
  const pendingSyncActionRef = useRef(null);
  const youtubeErrorFallbackRef = useRef({ mediaKey: null, at: 0 });
  const remoteAudioRefs = useRef(new Map());
  const lastWatchHeartbeatAtRef = useRef(Date.now());
  const autoBackgroundDeafenRef = useRef(false);
  const previousDeafenStateRef = useRef(false);
  const lastBackgroundYoutubeToastAtRef = useRef(0);
  const uploadAbortRef = useRef(null);

  const webrtc = useWebRTC();
  const myUserId = currentUserId || socket.userId || user?.id;
  const myParticipant = (dbParticipants || []).find((p) => p.userId === myUserId);
  const myRestrictions = myParticipant?.restrictions || {};
  const micBlockedByHost = !!myRestrictions.micDisabledByHost;
  const otherParticipantIds = (dbParticipants || [])
    .filter((p) => p.userId !== myUserId)
    .map((p) => p.userId);

  const meshStreams = useWebRTCMesh({
    roomCode,
    participantIds: otherParticipantIds,
    localStream: webrtc.stream,
    enabled: audioActive,
    userId: myUserId,
    isHost,
  });

  // Determine user role and media-control permissions
  const myRole = myParticipant?.role;
  const isCurrentUserHost = Boolean(myUserId && room?.hostId === myUserId);
  const userRole = isCurrentUserHost
    ? "host"
    : ((myRole === "co-host" || myRole === "cohost") ? "co-host" : "guest");
  const canOpenHostControls = userRole === "host" || userRole === "co-host";
  const canControl = isCurrentUserHost
    ? true
    : (!myRestrictions.mediaControlDisabledByHost && myParticipant?.permissions?.canControl !== false);

  const resolveYoutubeVideoId = useCallback((media) => {
    const direct = String(media?.videoId || media?.id || "").trim();
    if (direct) return direct;

    const rawUrl = String(media?.videoUrl || media?.url || "").trim();
    if (!rawUrl) return "";

    const watchMatch = rawUrl.match(/[?&]v=([^&]+)/);
    const shortMatch = rawUrl.match(/youtu\.be\/([^?&/]+)/);
    const embedMatch = rawUrl.match(/\/embed\/([^?&/]+)/);
    return watchMatch?.[1] || shortMatch?.[1] || embedMatch?.[1] || "";
  }, []);

  const shouldFallbackOnYoutubeError = useCallback((errorCode) => {
    if (!(isCurrentUserHost || userRole === "co-host")) return false;
    if (!canControl || currentTrack?.sourceType !== "youtube") return false;

    const unrecoverable = new Set([2, 5, 100, 101, 150]);
    if (errorCode !== null && !unrecoverable.has(Number(errorCode))) return false;

    const mediaKey = currentTrack?.videoId ? `youtube:${currentTrack.videoId}` : null;
    const previous = youtubeErrorFallbackRef.current;
    const now = Date.now();
    if (mediaKey && previous.mediaKey === mediaKey && now - previous.at < 10000) {
      return false;
    }

    youtubeErrorFallbackRef.current = { mediaKey, at: now };
    return true;
  }, [isCurrentUserHost, userRole, canControl, currentTrack]);

  // YouTube player for music (hidden)
  const ytPlayer = useYouTubePlayer({
    videoId: currentTrack?.videoId,
    controlsEnabled: canControl,
    onStateChange: (state, meta) => {
      setIsPlaying(state === "playing");
      if (state === "ended") {
        // Track ended - show overlay
        setTrackEnded(true);
      }
      if (state === "error") {
        toast.error("Unable to play this YouTube track", {
          description: meta?.errorCode
            ? `Playback error (${meta.errorCode}). This track may be restricted.`
            : "This track may be restricted. Try another result.",
          duration: 3000,
        });
      }
    },
    onError: (errorCode) => {
      if (!shouldFallbackOnYoutubeError(errorCode)) return;
      roomSync.broadcastPause(ytPlayer.currentTime || 0, ytPlayer.duration || 0);
      roomSync.broadcastMediaChange({ type: "none" });
      toast("This YouTube track was cleared for the room", {
        description: "Playback restriction detected. Pick another track.",
        duration: 2800,
      });
    },
    onReady: () => {
      if (isPlaying && currentTrack) {
        ytPlayer.play();
      }
    },
    onVideoChange: (newVideoId) => {
      if (currentTrack) {
        setCurrentTrack({ ...currentTrack, videoId: newVideoId });
        setIsPlaying(true);
      }
    },
  });

  const roomSync = useRoomSync({
    roomCode,
    mode: "advanced",
    isHost,
    isCoHost: userRole === "co-host" || userRole === "cohost",
    canControlOverride: canControl,
    timeUnit: "seconds",
    enableDriftCorrection: true,
    driftIntervalMs: 5000,
    onMediaChange: (media) => {
      const resolvedYoutubeId = resolveYoutubeVideoId(media);
      const resolvedLocalUrl = media?.audioUrl || media?.videoUrl || media?.url || null;
      const pendingSync = pendingSyncActionRef.current;
      const pendingFresh = pendingSync && Date.now() - (pendingSync.at || 0) <= 7000;
      if (media?.type === "youtube" && resolvedYoutubeId) {
        setCurrentTrack({
          videoId: resolvedYoutubeId,
          title: media.title || "YouTube Track",
          artist: media.artist || "Unknown",
          thumbnail: media.thumbnail || null,
          sourceType: "youtube",
        });
        setShowSourcePicker(false);
        setTrackEnded(false);
        pendingLocalControlRef.current = null;
        if (localAudioRef.current) {
          localAudioRef.current.pause();
          localAudioRef.current = null;
          setLocalCurrentTime(0);
          setLocalDuration(0);
        }
        ytPlayer.pause();

        if (pendingFresh) {
          const t = Number.isFinite(pendingSync.time) ? pendingSync.time : 0;
          if (pendingSync.type === "play") {
            ytPlayer.seekTo(t, true);
            ytPlayer.play();
            setIsPlaying(true);
          } else if (pendingSync.type === "pause") {
            ytPlayer.seekTo(t, true);
            ytPlayer.pause();
            setIsPlaying(false);
          } else if (pendingSync.type === "seek") {
            ytPlayer.seekTo(t, true);
          }
          pendingSyncActionRef.current = null;
        }
      }
      if ((media?.type === "local" || media?.type === "upload") && resolvedLocalUrl) {
        ytPlayer.pause();
        setCurrentTrack({
          title: media.title || "Local Audio",
          artist: media.artist || "Uploaded",
          thumbnail: null,
          sourceType: "local",
          audioUrl: resolvedLocalUrl,
        });
        setShowSourcePicker(false);
        setTrackEnded(false);
        setIsPlaying(false);

        if (pendingFresh) {
          const nextType = pendingSync.type === "seek"
            ? (isPlaying ? "play" : "pause")
            : pendingSync.type;
          pendingLocalControlRef.current = {
            type: nextType,
            time: Number.isFinite(pendingSync.time) ? pendingSync.time : 0,
            at: Date.now(),
          };
          pendingSyncActionRef.current = null;
        }
      } else if ((media?.type === "local" || media?.type === "upload") && !resolvedLocalUrl) {
        toast("Host selected a local file", {
          description: "Local uploads are currently host-only in this version.",
        });
      }
      if (!media || media.type === "none") {
        pendingLocalControlRef.current = null;
        if (localAudioRef.current) {
          localAudioRef.current.pause();
          localAudioRef.current = null;
        }
        ytPlayer.pause();
        setLocalCurrentTime(0);
        setLocalDuration(0);
        setIsPlaying(false);
        setCurrentTrack(null);
        setShowSourcePicker(true);
      }
    },
    onPlay: (timeSec = 0) => {
      if (!currentTrack) {
        pendingSyncActionRef.current = {
          type: "play",
          time: Number.isFinite(timeSec) ? timeSec : 0,
          at: Date.now(),
        };
        setIsPlaying(true);
        return;
      }
      setIsPlaying(true);
      if (currentTrack?.sourceType === "local" && localAudioRef.current) {
        if (Number.isFinite(timeSec) && localDuration > 0) {
          localAudioRef.current.currentTime = Math.max(0, Math.min(localDuration, timeSec));
          setLocalCurrentTime(localAudioRef.current.currentTime);
        }
        localAudioRef.current.play().catch(() => {});
      } else if (currentTrack?.sourceType === "local") {
        pendingLocalControlRef.current = {
          type: "play",
          time: Number.isFinite(timeSec) ? timeSec : 0,
          at: Date.now(),
        };
      } else {
        if (Number.isFinite(timeSec) && Math.abs((ytPlayer.currentTime || 0) - timeSec) > 0.15) {
          ytPlayer.seekTo(timeSec, true);
        }
        ytPlayer.play();
      }
    },
    onPause: (timeSec = 0) => {
      if (!currentTrack) {
        pendingSyncActionRef.current = {
          type: "pause",
          time: Number.isFinite(timeSec) ? timeSec : 0,
          at: Date.now(),
        };
        setIsPlaying(false);
        return;
      }
      setIsPlaying(false);
      if (currentTrack?.sourceType === "local" && localAudioRef.current) {
        if (Number.isFinite(timeSec) && localDuration > 0) {
          localAudioRef.current.currentTime = Math.max(0, Math.min(localDuration, timeSec));
          setLocalCurrentTime(localAudioRef.current.currentTime);
        }
        localAudioRef.current.pause();
      } else if (currentTrack?.sourceType === "local") {
        pendingLocalControlRef.current = {
          type: "pause",
          time: Number.isFinite(timeSec) ? timeSec : 0,
          at: Date.now(),
        };
      } else {
        if (Number.isFinite(timeSec) && Math.abs((ytPlayer.currentTime || 0) - timeSec) > 0.15) {
          ytPlayer.seekTo(timeSec, true);
        }
        ytPlayer.pause();
      }
    },
    onSeek: (timeSec) => {
      if (!currentTrack) {
        pendingSyncActionRef.current = {
          type: "seek",
          time: Number.isFinite(timeSec) ? timeSec : 0,
          at: Date.now(),
        };
        return;
      }
      if (typeof timeSec === "number") {
        if (currentTrack?.sourceType === "local" && localAudioRef.current && localDuration > 0) {
          localAudioRef.current.currentTime = Math.max(0, Math.min(localDuration, timeSec));
          setLocalCurrentTime(localAudioRef.current.currentTime);
        } else if (currentTrack?.sourceType === "local") {
          pendingLocalControlRef.current = {
            type: isPlaying ? "play" : "pause",
            time: Number.isFinite(timeSec) ? timeSec : 0,
            at: Date.now(),
          };
        } else {
          if (Math.abs((ytPlayer.currentTime || 0) - timeSec) > 0.15) {
            ytPlayer.seekTo(timeSec, true);
          }
        }
      }
    },
    onSyncUpdate: () => {
      _setSyncStatus("synced");
    },
    onSyncConflict: ({ event, error }) => {
      _setSyncStatus("syncing");
      toast("Sync conflict resolved", {
        description: error
          ? `Your ${event} action was rejected (${error}). Room state was reapplied.`
          : `Your ${event} action was stale and room state was reapplied.`,
        duration: 2200,
      });
    },
    onRateAdjust: (rate, correction) => {
      if (!Number.isFinite(rate)) return;
      if (currentTrack?.sourceType === "local" && localAudioRef.current) {
        localAudioRef.current.playbackRate = rate;
      } else {
        if (typeof ytPlayer.setPlaybackRate === "function") {
          ytPlayer.setPlaybackRate(rate);
        }
      }

      if (window.musicRateResetTimer) clearTimeout(window.musicRateResetTimer);
      window.musicRateResetTimer = setTimeout(() => {
        if (currentTrack?.sourceType === "local" && localAudioRef.current) {
          localAudioRef.current.playbackRate = 1;
        } else if (typeof ytPlayer.setPlaybackRate === "function") {
          ytPlayer.setPlaybackRate(1);
        }
      }, 1200);
    },
  });

  const getCurrentMediaTime = useCallback(() => {
    if (currentTrack?.sourceType === "local" && localAudioRef.current) {
      return localAudioRef.current.currentTime || 0;
    }
    return ytPlayer.currentTime || 0;
  }, [currentTrack?.sourceType, ytPlayer.currentTime]);

  const getCurrentMediaDuration = useCallback(() => {
    if (currentTrack?.sourceType === "local") return localDuration || 0;
    return ytPlayer.duration || 0;
  }, [currentTrack?.sourceType, localDuration, ytPlayer.duration]);

  useEffect(() => {
    if (roomSync.controlPending) {
      _setSyncStatus("syncing");
      return;
    }

    _setSyncStatus("synced");
  }, [roomSync.controlPending]);

  // Build participants list
  useEffect(() => {
    const list = [];
    const seen = new Set();

    if (dbParticipants && dbParticipants.length > 0) {
      dbParticipants.forEach((p) => {
        if (!p?.userId || seen.has(p.userId)) return;
        seen.add(p.userId);

        const isLocal = p.userId === myUserId;
        const remoteStream = !isLocal ? meshStreams.remoteStreams.get(p.userId) : null;
        const remoteHasAudio = !!remoteStream?.getAudioTracks()?.some((t) => t.enabled);
        const remoteAudioEnabled = typeof p.audioEnabled === "boolean" ? p.audioEnabled : remoteHasAudio;

        list.push({
          name: isLocal
            ? (clerkUser?.firstName || clerkUser?.username || p.displayName || "You")
            : (p.displayName || "User"),
          emoji: p.avatar_emoji || "🎧",
          speaking: false,
          role: p.role || (isLocal && isHost ? "host" : "guest"),
          audioEnabled: isLocal
            ? (webrtc.audioEnabled && !micBlockedByHost)
            : (remoteAudioEnabled && !p?.restrictions?.micDisabledByHost),
          username: p.username || "",
          isOnline: true,
          userId: p.userId,
          restrictions: p.restrictions || {},
        });
      });
    }

    if (list.length === 0 && myUserId) {
      list.push({
        name: clerkUser?.firstName || clerkUser?.username || "You",
        emoji: "🎧",
        speaking: false,
        role: isHost ? "host" : userRole,
        audioEnabled: webrtc.audioEnabled && !micBlockedByHost,
        username: clerkUser?.username || "",
        isOnline: true,
        userId: myUserId,
      });
    }

    setParticipants(list);
  }, [dbParticipants, clerkUser, userRole, myUserId, isHost, webrtc.audioEnabled, micBlockedByHost, meshStreams.remoteStreams]);

  useEffect(() => {
    if (!roomCode || !myUserId) return;

    const audioEnabled = audioActive && webrtc.audioEnabled && !micBlockedByHost;
    socket.emit("audio:state-change", {
      roomCode,
      userId: myUserId,
      audioEnabled,
      isMuted: !audioEnabled,
      isSpeaking: false,
    });
  }, [roomCode, myUserId, audioActive, webrtc.audioEnabled, micBlockedByHost]);

  useEffect(() => {
    if (micBlockedByHost && webrtc.audioEnabled) {
      webrtc.toggleAudio();
    }
  }, [micBlockedByHost, webrtc]);

  useEffect(() => {
    (meshStreams.remoteStreams || new Map()).forEach((stream, peerId) => {
      const audioEl = remoteAudioRefs.current.get(peerId);
      if (!audioEl) return;
      if (audioEl.srcObject !== stream) {
        audioEl.srcObject = stream;
      }
      audioEl.volume = Math.max(0, Math.min(1, voiceChatVolume / 100));
      audioEl.muted = deafenVoiceChat || mutedUserIds.has(peerId);
      audioEl.play?.().catch(() => {});
    });
  }, [meshStreams.remoteStreams, voiceChatVolume, mutedUserIds, deafenVoiceChat]);

  useEffect(() => {
    if (currentTrack?.sourceType !== "local" || !currentTrack?.audioUrl) return;

    let audio = localAudioRef.current;
    const needsNewAudio = !audio || audio.src !== currentTrack.audioUrl;

    if (needsNewAudio) {
      if (audio) {
        audio.pause();
      }
      audio = new Audio(currentTrack.audioUrl);
      localAudioRef.current = audio;
      setLocalCurrentTime(0);
      setLocalDuration(0);
    }

    audio.volume = isMuted ? 0 : musicVolume / 100;

    const onTimeUpdate = () => setLocalCurrentTime(audio.currentTime || 0);
    const onDurationChange = () => setLocalDuration(audio.duration || 0);
    const onEnded = () => {
      setTrackEnded(true);
      setIsPlaying(false);
    };

    // Ensure listeners are attached exactly once per active source.
    audio.removeEventListener("timeupdate", onTimeUpdate);
    audio.removeEventListener("durationchange", onDurationChange);
    audio.removeEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);

    const pending = pendingLocalControlRef.current;
    const pendingFresh = pending && Date.now() - (pending.at || 0) <= 7000;
    if (pendingFresh && Number.isFinite(pending.time) && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Math.max(0, Math.min(audio.duration, pending.time));
    }

    if (pendingFresh && pending.type === "pause") {
      audio.pause();
      setIsPlaying(false);
    } else if (pendingFresh && pending.type === "play") {
      audio.play().catch(() => {
        setIsPlaying(false);
        // On mobile, autoplay is blocked — show tap-to-play overlay
        const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
          || (navigator.maxTouchPoints > 0 && /Macintosh/.test(navigator.userAgent));
        if (isMobileDevice) {
          setMobileNeedsGesture(true);
        }
      });
    }

    pendingLocalControlRef.current = null;

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
    };
  }, [currentTrack?.audioUrl, currentTrack?.sourceType, isMuted, musicVolume]);

  useEffect(() => {
    if (currentTrack?.sourceType === "local" && localAudioRef.current) {
      localAudioRef.current.volume = isMuted ? 0 : musicVolume / 100;
    }
  }, [isMuted, musicVolume, currentTrack?.sourceType]);

  useEffect(() => {
    const nextVolume = isMuted ? 0 : musicVolume;
    ytPlayer.setVolume(nextVolume);
    if (isMuted) {
      ytPlayer.mute();
    } else {
      ytPlayer.unmute();
    }

    if (currentTrack?.sourceType === "local" && localAudioRef.current) {
      localAudioRef.current.volume = nextVolume / 100;
    }
  }, [isMuted, musicVolume, ytPlayer, currentTrack?.sourceType]);

  useEffect(() => {
    return () => {
      if (localAudioRef.current) {
        const src = localAudioRef.current.src;
        localAudioRef.current.pause();
        localAudioRef.current = null;
        if (src && src.startsWith("blob:")) {
          URL.revokeObjectURL(src);
        }
      }
    };
  }, []);

  useEffect(() => {
    setRoomSettings((prev) => ({
      chatEnabled: room?.settings?.chatEnabled ?? prev.chatEnabled,
      reactionsEnabled: room?.settings?.reactionsEnabled ?? prev.reactionsEnabled,
      allowScreenShare: room?.settings?.allowScreenShare ?? prev.allowScreenShare,
      slowMode: room?.settings?.slowMode ?? prev.slowMode,
    }));
  }, [room?.settings]);

  useEffect(() => {
    const handleConnected = () => {
      _setSyncStatus("synced");
      roomSync.requestSync?.();
    };
    const handleDisconnected = () => {
      _setSyncStatus("syncing");
    };
    const handleHostChanged = () => {
      roomSync.requestSync?.();
    };

    socket.on("connect", handleConnected);
    socket.on("disconnect", handleDisconnected);
    socket.on("room:new-host", handleHostChanged);

    return () => {
      socket.off("connect", handleConnected);
      socket.off("disconnect", handleDisconnected);
      socket.off("room:new-host", handleHostChanged);
    };
  }, [roomSync]);

  useEffect(() => {
    const handleRoomReaction = (data) => {
      const emoji = String(data?.emoji || "").trim();
      if (!emoji) return;

      const id = reactionIdRef.current++;
      const randomX = 20 + Math.random() * 60;
      setFloatingReactions((prev) => [...prev, { id, emoji, x: randomX }]);
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
      }, 2000);
    };

    socket.on("room:reaction", handleRoomReaction);
    return () => socket.off("room:reaction", handleRoomReaction);
  }, []);

  useEffect(() => {
    if (!roomCode) return undefined;

    const onVisibilityChange = () => {
      if (document.hidden) {
        lastWatchHeartbeatAtRef.current = Date.now();
      }
    };

    lastWatchHeartbeatAtRef.current = Date.now();

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const canTrack =
        !document.hidden &&
        isPlaying &&
        !!currentTrack &&
        (accessStatus === "granted" || joinStatus === "joined");

      if (!canTrack) {
        lastWatchHeartbeatAtRef.current = now;
        return;
      }

      const watchedSeconds = Math.max(
        0,
        Math.min(120, (now - lastWatchHeartbeatAtRef.current) / 1000)
      );
      lastWatchHeartbeatAtRef.current = now;

      if (watchedSeconds < 5) return;

      socket.emit("room:watch-heartbeat", {
        roomCode,
        watchedSeconds,
        isPlaying: true,
      });
    }, 15000);

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [roomCode, isPlaying, currentTrack, accessStatus, joinStatus]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle mobile detection
  useEffect(() => {
    const updateViewport = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
      setIsLandscape(width > height);
    };

    updateViewport();

    const handleResize = () => updateViewport();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  useEffect(() => {
    if (!(isMobile || isTablet)) return undefined;

    const handleVisibility = () => {
      const hidden = document.hidden;

      if (hidden) {
        if (currentTrack?.sourceType === "youtube" && isPlaying) {
          // YouTube may pause in background on mobile — no toast needed
        }

        if (audioActive && !deafenVoiceChat) {
          previousDeafenStateRef.current = deafenVoiceChat;
          autoBackgroundDeafenRef.current = true;
          setDeafenVoiceChat(true);
        }
        return;
      }

      if (autoBackgroundDeafenRef.current) {
        setDeafenVoiceChat(previousDeafenStateRef.current);
        autoBackgroundDeafenRef.current = false;
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isMobile, isTablet, currentTrack?.sourceType, isPlaying, audioActive, deafenVoiceChat]);

  const useTouchSizedControls = isMobile || isTablet;
  const roomTopButtonClass = useTouchSizedControls ? "h-10 w-10" : "h-9 w-9";
  const isPortraitPhone = isMobile && !isLandscape;

  // Playback controls
  const togglePlayPause = useCallback(() => {
    if (roomSync.controlPending) return;
    if (currentTrack?.sourceType === "local") {
      const audio = localAudioRef.current;
      const targetTime = Number.isFinite(localCurrentTime) ? localCurrentTime : 0;
      if (isPlaying) {
        if (audio) {
          audio.pause();
        } else {
          pendingLocalControlRef.current = { type: "pause", time: targetTime, at: Date.now() };
        }
        setIsPlaying(false);
        if (canControl) roomSync.broadcastPause(getCurrentMediaTime(), getCurrentMediaDuration());
      } else {
        if (audio) {
          audio.play().catch(() => {});
        } else {
          pendingLocalControlRef.current = { type: "play", time: targetTime, at: Date.now() };
        }
        setIsPlaying(true);
        if (canControl) roomSync.broadcastPlay(getCurrentMediaTime(), getCurrentMediaDuration());
      }
      return;
    }

    if (isPlaying) {
      ytPlayer.pause();
      if (canControl) roomSync.broadcastPause(getCurrentMediaTime(), getCurrentMediaDuration());
    } else {
      ytPlayer.play();
      if (canControl) roomSync.broadcastPlay(getCurrentMediaTime(), getCurrentMediaDuration());
    }
  }, [isPlaying, ytPlayer, canControl, roomSync, currentTrack?.sourceType, getCurrentMediaTime, getCurrentMediaDuration, localCurrentTime]);

  const playNext = useCallback(() => {
    if (queue.length === 0) return;

    // Find next track that isn't the current one
    const currentId = currentTrack?.videoId || currentTrack?.audioUrl;
    let nextIdx = queue.findIndex((t) => {
      const trackId = t.videoId || t.audioUrl;
      return trackId !== currentId;
    });
    if (nextIdx === -1) nextIdx = 0; // fallback to first

    const nextTrack = queue[nextIdx];
    setCurrentTrack(nextTrack);
    setShowUpNext(false);
    setTrackEnded(false);
    setIsPlaying(false);

    if (canControl) {
      if (nextTrack.sourceType === "local" && nextTrack.audioUrl) {
        roomSync.broadcastMediaChange({
          type: "upload",
          title: nextTrack.title,
          artist: nextTrack.artist,
          audioUrl: nextTrack.audioUrl,
          videoUrl: nextTrack.audioUrl,
          url: nextTrack.audioUrl,
        });
      } else {
        roomSync.broadcastMediaChange({
          type: "youtube",
          videoId: nextTrack.videoId,
          title: nextTrack.title,
          artist: nextTrack.artist,
          thumbnail: nextTrack.thumbnail,
        });
      }
    }
  }, [queue, currentTrack, canControl, roomSync]);

  const playPrevious = useCallback(() => {
    if (currentTrack?.sourceType === "local" && localAudioRef.current) {
      localAudioRef.current.currentTime = 0;
      setLocalCurrentTime(0);
      return;
    }
    ytPlayer.seekToStart();
    setIsPlaying(true);
  }, [ytPlayer, currentTrack?.sourceType]);

  const toggleShuffle = useCallback(() => {
    setShuffle(!shuffle);
  }, [shuffle]);

  const cycleRepeat = useCallback(() => {
    const nextRepeat = repeat === "off" ? "all" : repeat === "all" ? "one" : "off";
    setRepeat(nextRepeat);
  }, [repeat]);

  const handleAddReaction = useCallback((emoji) => {
    if (!roomSettings.reactionsEnabled) {
      toast.error("Reactions are disabled by the host");
      return;
    }

    const id = reactionIdRef.current++;
    const randomX = 20 + Math.random() * 60;
    setFloatingReactions(prev => [...prev, { id, emoji, x: randomX }]);
    socket.emit("room:reaction", { roomCode, emoji }, (response) => {
      if (response && response.success === false) {
        toast.error(response.error || "Failed to send reaction");
      }
    });
    setTimeout(() => {
      setFloatingReactions(prev => prev.filter(r => r.id !== id));
    }, 2000);
  }, [roomCode, roomSettings.reactionsEnabled]);

  const handleToggleAudio = useCallback(async () => {
    if (!audioActive && micBlockedByHost) {
      toast.error("Your mic is disabled by host");
      return;
    }

    if (!audioActive) {
      const stream = await webrtc.startMedia(false, true);
      if (stream) {
        setAudioActive(true);
        toast.success("Voice chat enabled");
      }
      return;
    }

    webrtc.stopMedia();
    setAudioActive(false);
    toast("Voice chat disabled");
  }, [audioActive, webrtc, micBlockedByHost]);

  const handleToggleUserMute = useCallback((targetUserId) => {
    setMutedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(targetUserId)) next.delete(targetUserId);
      else next.add(targetUserId);
      return next;
    });
  }, []);

  const handleToggleDeafen = useCallback(() => {
    setDeafenVoiceChat((prev) => !prev);
  }, []);

  const handleRequestLeave = useCallback(() => {
    setShowLeaveConfirm(true);
  }, []);

  const handleConfirmLeave = useCallback(async () => {
    if (isLeavingRoom) return;
    setIsLeavingRoom(true);
    try {
      await leaveRoom();
      navigate("/music");
    } finally {
      setIsLeavingRoom(false);
      setShowLeaveConfirm(false);
    }
  }, [isLeavingRoom, leaveRoom, navigate]);

  const handleConfirmEndRoom = useCallback(async () => {
    if (isLeavingRoom) return;
    setIsLeavingRoom(true);
    try {
      await endRoom();
      navigate("/music");
    } finally {
      setIsLeavingRoom(false);
      setShowLeaveConfirm(false);
    }
  }, [isLeavingRoom, endRoom, navigate]);

  const handleMediaPlay = useCallback(() => {
    if (!isPlaying) {
      togglePlayPause();
    }
  }, [isPlaying, togglePlayPause]);

  const handleMediaPause = useCallback(() => {
    if (isPlaying) {
      togglePlayPause();
    }
  }, [isPlaying, togglePlayPause]);

  useMediaSession({
    title: currentTrack?.title || room?.name || "SyncPlay Music Room",
    artist: currentTrack?.artist || "SyncPlay",
    artwork: currentTrack?.thumbnail || undefined,
    isPlaying,
    mediaElement: currentTrack?.sourceType === "local" ? localAudioRef.current : null,
    onPlay: handleMediaPlay,
    onPause: handleMediaPause,
    onNextTrack: playNext,
    onPreviousTrack: playPrevious,
  });

  const handleSelectTrack = useCallback((track) => {
    const nextTrack = {
      videoId: track.videoId || track.id,
      title: track.title,
      artist: track.artist || track.channel || "Unknown",
      thumbnail: track.thumbnail || null,
      sourceType: "youtube",
    };

    if (localAudioRef.current) {
      localAudioRef.current.pause();
      localAudioRef.current = null;
      setLocalCurrentTime(0);
      setLocalDuration(0);
    }

    setCurrentTrack(nextTrack);
    // Add to queue history so user can replay from queue
    setQueue((prev) => {
      const exists = prev.some((t) => t.videoId === nextTrack.videoId);
      return exists ? prev : [...prev, nextTrack];
    });
    pendingLocalControlRef.current = null;
    setShowSourcePicker(false);
    setTrackEnded(false);
    setIsPlaying(false);
    if (canControl) {
      roomSync.broadcastMediaChange({
        type: "youtube",
        videoId: nextTrack.videoId,
        title: nextTrack.title,
        artist: nextTrack.artist,
        thumbnail: nextTrack.thumbnail,
      });
    }
  }, [canControl, roomSync]);

  const handleSelectLocalTrack = useCallback(async (file, audioUrl) => {
    if (!file) return;
    if (!canControl) {
      toast.error("You don't have media control permission");
      if (audioUrl?.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
      return;
    }

    let usedLocalFallback = false;

    try {
      setIsUploadingTrack(true);
      setUploadTrackProgress(0);
      setUploadTrackStatus("Uploading audio to room");

      const formData = new FormData();
      formData.append("video", file);
      formData.append("title", file?.name || "Local Audio");

      const abortController = new AbortController();
      uploadAbortRef.current = abortController;

      const response = await api.post(`/rooms/${roomCode}/media/upload`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 120000,
        signal: abortController.signal,
        onUploadProgress: (evt) => {
          if (!evt?.total) {
            setUploadTrackProgress((prev) => Math.max(prev, 10));
            setUploadTrackStatus("Uploading audio to room");
            return;
          }
          const pct = Math.max(0, Math.min(95, Math.round((evt.loaded / evt.total) * 100)));
          setUploadTrackProgress(pct);
          setUploadTrackStatus(pct >= 95 ? "Processing in cloud..." : "Uploading audio to room");
        },
      });

      uploadAbortRef.current = null;

      const sharedMedia = response?.data?.data?.media;
      const sharedUrl = sharedMedia?.audioUrl || sharedMedia?.videoUrl;
      if (!sharedUrl) {
        throw new Error("Invalid media upload response");
      }

      const nextTrack = {
        title: file?.name?.replace(/\.[^/.]+$/, "") || "Local Audio",
        artist: "Uploaded",
        thumbnail: null,
        sourceType: "local",
        audioUrl: sharedUrl,
      };

      setCurrentTrack(nextTrack);
      pendingLocalControlRef.current = null;
      setShowSourcePicker(false);
      setTrackEnded(false);
      setIsPlaying(false);
      setQueue((prev) => [...prev, nextTrack]);

      roomSync.broadcastMediaChange({
        type: "upload",
        title: nextTrack.title,
        artist: nextTrack.artist,
        audioUrl: sharedUrl,
        videoUrl: sharedUrl,
        url: sharedUrl,
      });

      setUploadTrackProgress(100);
      setUploadTrackStatus("Upload complete. Ready to play");

      toast.success("Audio uploaded", {
        description: "Shared in paused state. Press play when everyone is ready.",
      });
    } catch (error) {
      uploadAbortRef.current = null;

      if (error?.name === "CanceledError" || error?.code === "ERR_CANCELED") {
        toast("Upload cancelled", { icon: "🚫", duration: 1800 });
      } else {
        usedLocalFallback = true;
        setUploadTrackStatus("Upload failed, using local-only playback");
        const localUrl = audioUrl || URL.createObjectURL(file);
        const nextTrack = {
          title: file?.name?.replace(/\.[^/.]+$/, "") || "Local Audio",
          artist: "Uploaded",
          thumbnail: null,
          sourceType: "local",
          audioUrl: localUrl,
        };

        setCurrentTrack(nextTrack);
        pendingLocalControlRef.current = null;
        setShowSourcePicker(false);
        setTrackEnded(false);
        setIsPlaying(false);
        setQueue((prev) => [...prev, nextTrack]);

        if (error?.code === "ECONNABORTED") {
          toast.error("Upload is taking longer than expected", {
            description: "Cloud processing timed out. Using local-only fallback for now.",
          });
        } else {
          toast("Upload failed, using local-only playback", {
            description: error?.response?.data?.message || error?.message || "Only you can hear this file.",
          });
        }
      }
    } finally {
      setIsUploadingTrack(false);
      if (!usedLocalFallback && audioUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(audioUrl);
      }

      setTimeout(() => {
        setUploadTrackStatus("");
      }, 2200);
    }
  }, [canControl, roomCode, roomSync]);

  const cancelUpload = useCallback(() => {
    if (uploadAbortRef.current) {
      uploadAbortRef.current.abort();
      uploadAbortRef.current = null;
    }
  }, []);

  const closeAllPanels = useCallback(() => {
    setShowChat(false);
    setShowHostControls(false);
    setShowMixer(false);
    setShowPlaylist(false);
    setShowMobileMenu(false);
  }, []);

  useEffect(() => {
    if (!canOpenHostControls && showHostControls) {
      setShowHostControls(false);
    }
  }, [canOpenHostControls, showHostControls]);

  const handleSeek = useCallback((pct) => {
    if (roomSync.controlPending) return;
    if (!canControl) return;

    const duration = getCurrentMediaDuration();
    const targetSec = duration > 0 ? (pct / 100) * duration : 0;

    if (currentTrack?.sourceType === "local") {
      if (localAudioRef.current && localDuration > 0) {
        localAudioRef.current.currentTime = targetSec;
        setLocalCurrentTime(localAudioRef.current.currentTime);
        if (isPlaying) {
          localAudioRef.current.play().catch(() => {});
        } else {
          localAudioRef.current.pause();
        }
      } else {
        pendingLocalControlRef.current = {
          type: isPlaying ? "play" : "pause",
          time: targetSec,
          at: Date.now(),
        };
      }
    } else {
      ytPlayer.seekTo(targetSec, true);
    }

    roomSync.broadcastSeek(targetSec, duration);
  }, [canControl, ytPlayer, roomSync, currentTrack?.sourceType, localDuration, getCurrentMediaDuration, isPlaying]);

  const displayCurrentTime = currentTrack?.sourceType === "local" ? localCurrentTime : ytPlayer.currentTime;
  const displayDuration = currentTrack?.sourceType === "local" ? localDuration : ytPlayer.duration;
  const progressPercent = displayDuration > 0 ? (displayCurrentTime / displayDuration) * 100 : 0;

  const waveformBars = Array.from({ length: 48 }, (_, i) => {
    const playingBase = 18 + ((i * 7) % 35);
    const idleBase = 12 + ((i * 3) % 10);
    return isPlaying ? playingBase : idleBase;
  });

  const albumGradient = currentTrack?.thumbnail ? undefined : "from-primary to-accent";

  const handleSendMessage = useCallback(() => {
    if (chatMessage.trim()) {
      sendMessage(chatMessage);
      setChatMessage("");
    }
  }, [chatMessage, sendMessage]);

  const handleUpdateParticipant = useCallback((nameOrUserId, updates) => {
    const target = (dbParticipants || []).find(
      (p) => p.userId === nameOrUserId || p.displayName === nameOrUserId || p.username === nameOrUserId
    );
    if (!target?.userId) return;

    if (updates.audioEnabled !== undefined) {
      socket.emit("room:update-participant-permissions", {
        roomCode,
        targetUserId: target.userId,
        restrictions: { micDisabledByHost: !updates.audioEnabled },
      });
    }

    if (updates.chatEnabled !== undefined) {
      socket.emit("room:update-participant-permissions", {
        roomCode,
        targetUserId: target.userId,
        restrictions: { chatDisabledByHost: !updates.chatEnabled },
      });
    }

    if (updates.mediaControlEnabled !== undefined) {
      socket.emit("room:update-participant-permissions", {
        roomCode,
        targetUserId: target.userId,
        restrictions: { mediaControlDisabledByHost: !updates.mediaControlEnabled },
      });
    }

    if (updates.role) {
      socket.emit("room:update-role", {
        roomCode,
        targetUserId: target.userId,
        newRole: updates.role,
      });
    }
  }, [dbParticipants, roomCode]);

  const handleRemoveParticipant = useCallback((nameOrUserId) => {
    const target = (dbParticipants || []).find(
      (p) => p.userId === nameOrUserId || p.displayName === nameOrUserId || p.username === nameOrUserId
    );
    if (!target?.userId) return;
    socket.emit("room:remove-participant", { roomCode, targetUserId: target.userId });
  }, [dbParticipants, roomCode]);

  const handleUpdateSettings = useCallback((updates) => {
    setRoomSettings((prev) => ({ ...prev, ...updates }));
    socket.emit("room:update-settings", { roomCode, settings: updates }, (response) => {
      if (!response?.success) {
        setRoomSettings((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(updates).map((k) => [k, !updates[k]])) }));
      }
    });
  }, [roomCode]);

  // Access control handling — skip if guestName exists (auto-rejoin in progress)
  if (!user && accessStatus === "granted" && !joinStatus && !guestName) {
    return (
      <GuestNameDialog
        roomName={room?.name || "Music Room"}
        onJoinAsGuest={async (name) => {
          setIsJoiningAsGuest(true);
          try {
            await joinAsGuest(name);
          } finally {
            setIsJoiningAsGuest(false);
          }
        }}
        onSignIn={() => navigate("/sign-in")}
        isLoading={isJoiningAsGuest}
      />
    );
  }

  if (joinStatus === "waiting_for_approval") {
    return (
      <WaitingAreaDialog
        roomName={room?.name || "Music Room"}
        guestName={guestName || user?.display_name || user?.username || "Guest"}
        onCancel={() => setIsJoiningAsGuest(false)}
        roomType="music"
      />
    );
  }

  if (accessStatus !== "granted") {
    return <RoomAccessGate status={accessStatus} roomType="music" />;
  }

  return (
    <div ref={containerRef} className="bg-[radial-gradient(circle_at_12%_15%,rgba(16,185,129,0.2),transparent_32%),radial-gradient(circle_at_88%_80%,rgba(34,197,94,0.16),transparent_36%),hsl(224,40%,6%)] flex flex-col overflow-hidden" style={{ height: '100dvh', paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {/* Join Request Notifications for Host */}
      {isHost && joinRequests.length > 0 && (
        <JoinRequestNotification
          joinRequests={joinRequests}
          onAccept={acceptJoinRequest}
          onReject={rejectJoinRequest}
          isHost={isHost}
        />
      )}

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
              className="absolute text-2xl"
              style={{ left: `${r.x}%` }}
            >
              {r.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Top Bar */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`glass-nav px-3 sm:px-4 flex items-center justify-between gap-2 z-30 relative border-b border-emerald-400/20 bg-emerald-950/20 ${
          isMobile && isLandscape ? "py-1" : "py-2 sm:py-3"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={handleRequestLeave} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            <ChevronLeft className="w-5 h-5" />
            <span className="text-xs font-medium hidden sm:inline">Leave</span>
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-sm font-semibold text-foreground truncate max-w-[8rem] sm:max-w-none">
              {room?.name || currentTrack?.title || "Music Room"}
            </h1>
            <div className={`flex items-center gap-1.5 ${isMobile && isLandscape ? "hidden" : ""}`}>
              <p className="text-[11px] text-muted-foreground truncate max-w-[7rem] sm:max-w-none">{uniqueParticipantCount} listening · {roomCode?.slice(0, 6)}</p>
              <span className={`inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded-full ${
                syncStatus === "synced" ? "bg-emerald-400/20 text-emerald-300" : "bg-amber-400/20 text-amber-300"
              }`}>
                {syncStatus === "synced" ? <Wifi className="w-2 h-2" /> : <WifiOff className="w-2 h-2" />}
                {syncStatus === "synced" ? "Synced" : "Syncing"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
          {uniqueParticipantCount > 0 && (
            <RoomInfoBar roomId={roomCode} roomType="music" roomName={room?.name || "Music Room"} host={participants.find(p => p.role === "host")?.name || participants[0]?.name || "Host"} participantCount={uniqueParticipantCount} isHost={isHost} />
          )}

          {/* Desktop toolbar */}
          <div className="hidden sm:flex items-center gap-0.5">
            <div className="flex -space-x-1.5 mr-1.5">
              {participants.slice(0, 3).map((p, idx) => (
                <div key={p.odlUserId || `${p.name}-${idx}`} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs border-2 border-background" title={p.name}>{p.emoji}</div>
              ))}
              {participants.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[9px] text-muted-foreground border-2 border-background">+{participants.length - 3}</div>
              )}
            </div>
            <Button size="icon" variant="ghost" onClick={() => { closeAllPanels(); setShowPlaylist(!showPlaylist); }} className={`h-8 w-8 ${showPlaylist ? "text-emerald-300" : "text-muted-foreground"}`} title="Queue"><ListMusic className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => { closeAllPanels(); setShowChat(!showChat); }} className={`h-8 w-8 ${showChat ? "text-emerald-300" : "text-muted-foreground"}`} title="Chat"><MessageSquare className="w-4 h-4" /></Button>
            {user && (
              <Button size="icon" variant="ghost" onClick={() => setShowInviteFriends(true)} className="h-8 w-8 text-muted-foreground hover:text-emerald-300" title="Invite"><UserPlus className="w-4 h-4" /></Button>
            )}
            <Button size="icon" variant="ghost" onClick={() => { closeAllPanels(); setShowMixer(!showMixer); }} className={`h-8 w-8 ${showMixer ? "text-emerald-300" : "text-muted-foreground"}`} title="Mixer"><Sliders className="w-4 h-4" /></Button>
            {canOpenHostControls && (
              <Button size="icon" variant="ghost" onClick={() => { closeAllPanels(); setShowHostControls(!showHostControls); }} className={`h-8 w-8 ${showHostControls ? "text-emerald-300" : "text-muted-foreground"}`} title="Settings"><Settings className="w-4 h-4" /></Button>
            )}
          </div>

          {/* Mobile toolbar: RoomInfo + Chat + ⋮ dropdown */}
          <div className="flex sm:hidden items-center gap-0">
            <Button size="icon" variant="ghost" onClick={() => { closeAllPanels(); setShowChat(!showChat); }} className={`h-8 w-8 ${showChat ? "text-emerald-300" : "text-muted-foreground"}`} title="Chat"><MessageSquare className="w-3.5 h-3.5" /></Button>
            <div className="relative">
              <Button size="icon" variant="ghost" onClick={() => setShowMobileMenu(!showMobileMenu)} className={`h-8 w-8 ${showMobileMenu ? "text-emerald-300" : "text-muted-foreground"}`} title="More"><MoreVertical className="w-4 h-4" /></Button>
              <AnimatePresence>
                {showMobileMenu && (
                  <>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowMobileMenu(false)} className="fixed inset-0 z-[98]" />
                    <motion.div initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }} transition={{ duration: 0.15 }} className="absolute right-0 top-full mt-1 z-[99] w-48 rounded-xl border border-emerald-400/20 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
                      <div className="py-1">
                        <button onClick={() => { setShowMobileMenu(false); closeAllPanels(); setShowPlaylist(!showPlaylist); }} className={`flex items-center gap-3 w-full px-3 py-2.5 text-sm transition-colors ${showPlaylist ? "text-emerald-300 bg-emerald-300/10" : "text-foreground/80 hover:bg-muted/40"}`}>
                          <ListMusic className="w-4 h-4" /><span>Queue</span>
                        </button>
                        <button onClick={() => { setShowMobileMenu(false); closeAllPanels(); setShowMixer(!showMixer); }} className={`flex items-center gap-3 w-full px-3 py-2.5 text-sm transition-colors ${showMixer ? "text-emerald-300 bg-emerald-300/10" : "text-foreground/80 hover:bg-muted/40"}`}>
                          <Sliders className="w-4 h-4" /><span>Volume Mixer</span>
                        </button>
                        {user && (
                          <button onClick={() => { setShowMobileMenu(false); setShowInviteFriends(true); }} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-foreground/80 hover:bg-muted/40 transition-colors">
                            <UserPlus className="w-4 h-4" /><span>Add Friends</span>
                          </button>
                        )}
                        {canOpenHostControls && (
                          <button onClick={() => { setShowMobileMenu(false); closeAllPanels(); setShowHostControls(!showHostControls); }} className={`flex items-center gap-3 w-full px-3 py-2.5 text-sm transition-colors ${showHostControls ? "text-emerald-300 bg-emerald-300/10" : "text-foreground/80 hover:bg-muted/40"}`}>
                            <Settings className="w-4 h-4" /><span>Settings</span>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.header>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden min-h-0">
          {showSourcePicker ? (
            canControl ? (
              <MusicSourcePicker
                onSelectTrack={handleSelectTrack}
                onSelectLocal={handleSelectLocalTrack}
                onSourceChange={() => setShowSourcePicker(true)}
                isUploading={isUploadingTrack}
                uploadProgress={uploadTrackProgress}
                uploadStatusText={uploadTrackStatus}
                onCancelUpload={cancelUpload}
              />
            ) : (
              <div className="text-center p-8">
                <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4">
                  <Music className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-foreground/80 text-sm font-medium mb-1">Waiting for host to pick a track</p>
                <p className="text-muted-foreground text-xs">The host controls what plays in this room</p>
              </div>
            )
          ) : currentTrack ? (
            <div className={`flex-1 flex items-center justify-center relative w-full ${isMobile && isLandscape ? 'flex-row p-2 gap-4' : 'flex-col p-4 md:p-12'}`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${albumGradient || "from-emerald-500 to-lime-400"} opacity-[0.08]`} />

              {/* Mobile "Tap to Play" overlay — shown when autoplay is blocked */}
              {mobileNeedsGesture && (
                <div
                  className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
                  onClick={() => {
                    setMobileNeedsGesture(false);
                    if (currentTrack.sourceType === "youtube" && ytPlayer) {
                      ytPlayer.mute();
                      ytPlayer.play();
                      setTimeout(() => { ytPlayer.unmute(); }, 800);
                      setIsPlaying(true);
                    } else {
                      const audio = localAudioRef.current;
                      if (audio) {
                        audio.play().then(() => {
                          setIsPlaying(true);
                        }).catch(() => {});
                      }
                    }
                  }}
                >
                  <div className="text-center text-white space-y-3 animate-pulse">
                    <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto">
                      <Play className="w-10 h-10 text-white ml-1" />
                    </div>
                    <p className="text-base font-semibold">Tap to Play</p>
                    <p className="text-xs text-white/60">Your browser requires a tap to start playback</p>
                  </div>
                </div>
              )}

              <AnimatePresence>
                {audioActive && participants.map((p, i) => (
                  <OverlayAudioBubble
                    key={`${p.userId || p.name}-${i}`}
                    participant={p}
                    index={i}
                    isLocal={i === 0}
                    localAudioEnabled={webrtc.audioEnabled}
                    isMutedByYou={deafenVoiceChat || mutedUserIds.has(p.userId)}
                    onToggleMute={() => handleToggleUserMute(p.userId)}
                  />
                ))}
              </AnimatePresence>

              <div className={`relative z-10 w-full mx-auto flex items-center ${isMobile && isLandscape ? 'flex-row gap-4 max-w-none' : 'flex-col max-w-md'}`}>
                <motion.div
                  key={currentTrack.videoId || currentTrack.title}
                  initial={{ opacity: 0, scale: 0.9, rotate: -5 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{ duration: 0.4 }}
                  className={`rounded-3xl overflow-hidden flex items-center justify-center shadow-2xl relative flex-shrink-0 ${isMobile && isLandscape ? 'w-24 h-24 mb-0' : 'w-40 h-40 md:w-72 md:h-72 mb-4 md:mb-8'}`}
                  style={{ boxShadow: "0 30px 60px -15px rgba(16,185,129,0.35)" }}
                >
                  {currentTrack.thumbnail ? (
                    <img src={currentTrack.thumbnail} alt={currentTrack.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${albumGradient || "from-emerald-500 to-lime-400"} flex items-center justify-center`}>
                      <Music className="w-20 h-20 text-foreground/30" />
                    </div>
                  )}
                </motion.div>

                <div className={`${isMobile && isLandscape ? 'flex-1 flex flex-col items-center justify-center min-w-0' : 'contents'}`}>
                <motion.div key={`info-${currentTrack.title}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`text-center w-full ${isMobile && isLandscape ? 'mb-0' : 'mb-1 md:mb-2'}`}>
                  <h2 className="font-display text-base md:text-2xl font-bold text-foreground mb-0.5 md:mb-1 line-clamp-2 leading-tight">{currentTrack.title}</h2>
                  <p className="text-muted-foreground text-xs md:text-sm">{currentTrack.artist || "Unknown Artist"}</p>
                </motion.div>

                <button onClick={() => setShowSourcePicker(true)} className={`flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full bg-muted/30 hover:bg-muted/50 border border-emerald-400/15 hover:border-emerald-400/40 mb-4`}>
                  {currentTrack?.sourceType === "local" ? <Upload className="w-3.5 h-3.5" /> : <Youtube className="w-3.5 h-3.5" />}
                  <span>Browse Music</span>
                  <span className="text-emerald-400/60">·</span>
                  <span className="text-emerald-300/80">Change</span>
                </button>

                <div className={`w-full flex items-end justify-center gap-[2px] ${isMobile && isLandscape ? 'hidden' : 'h-8 md:h-12 mb-2 md:mb-4'}`}>
                  {waveformBars.map((height, i) => (
                    <motion.div key={i} className="w-1 rounded-full bg-secondary/60" animate={{ height: isPlaying ? `${height}%` : "15%" }} transition={{ duration: 0.3, ease: "easeInOut" }} />
                  ))}
                </div>

                <div className={`w-full ${isMobile && isLandscape ? 'mb-1' : 'mb-3 md:mb-6'}`}>
                  <div className="w-full h-1.5 bg-muted rounded-full cursor-pointer group relative" onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = ((e.clientX - rect.left) / rect.width) * 100;
                    handleSeek(Math.max(0, Math.min(100, pct)));
                  }}>
                    <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-lime-400 rounded-full" style={{ width: `${progressPercent}%` }} />
                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `${progressPercent}%`, transform: "translateX(-50%) translateY(-50%)" }} />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-muted-foreground">{Math.floor(displayCurrentTime / 60)}:{String(Math.floor(displayCurrentTime % 60)).padStart(2, "0")}</span>
                    <span className="text-[10px] text-muted-foreground">{Math.floor(displayDuration / 60)}:{String(Math.floor(displayDuration % 60)).padStart(2, "0")}</span>
                  </div>
                </div>

                <div className={`flex items-center justify-center gap-3 md:gap-4 ${isMobile && isLandscape ? 'mb-1' : 'mb-3 md:mb-6'}`}>
                  <Button size="icon" variant="ghost" onClick={toggleShuffle} className={shuffle ? "text-emerald-300" : "text-muted-foreground"}><Shuffle className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-foreground" onClick={playPrevious}><SkipBack className="w-5 h-5" /></Button>
                  <button onClick={togglePlayPause} className={`rounded-full gradient-music flex items-center justify-center active:scale-95 md:hover:scale-105 transition-transform shadow-lg ${isMobile && isLandscape ? 'w-10 h-10' : 'w-12 h-12 md:w-14 md:h-14'}`}>
                    {isPlaying ? <Pause className="w-6 h-6 text-secondary-foreground" /> : <Play className="w-6 h-6 text-secondary-foreground ml-0.5" />}
                  </button>
                  <Button size="icon" variant="ghost" className="text-foreground" onClick={playNext}><SkipForward className="w-5 h-5" /></Button>
                  <Button size="icon" variant="ghost" onClick={cycleRepeat} className={repeat !== "off" ? "text-emerald-300" : "text-muted-foreground"}><Repeat className="w-4 h-4" /></Button>
                </div>

                <div className="flex items-center justify-between w-full max-w-sm gap-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)]">
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setIsLiked(!isLiked)} className={isLiked ? "text-destructive" : "text-muted-foreground"}><Heart className={`w-4 h-4 ${isLiked ? "fill-current" : ""}`} /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setIsBookmarked(!isBookmarked)} className={isBookmarked ? "text-emerald-300" : "text-muted-foreground"}><Bookmark className="w-4 h-4" /></Button>
                    <div className="relative">
                      <Button size="icon" variant="ghost" onClick={() => { closeAllPanels(); setShowPlaylist(!showPlaylist); }} className={showPlaylist ? "text-emerald-300" : "text-muted-foreground"} title="Queue">
                        <ListMusic className="w-4 h-4" />
                      </Button>
                      {queue.length > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-400 text-emerald-950 text-[8px] font-bold flex items-center justify-center">{queue.length}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 bg-muted/30 rounded-full px-1.5 py-0.5">
                    <Button size="icon" variant="ghost" onClick={handleToggleAudio} title={audioActive ? "Leave voice chat" : "Join voice chat"} className={`h-8 w-8 rounded-full ${audioActive ? "text-emerald-300 bg-emerald-500/15" : "text-muted-foreground"}`}>
                      {audioActive ? <Headphones className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                    </Button>
                    {audioActive && (
                      <Button size="icon" variant="ghost" onClick={() => {
                        if (!webrtc.audioEnabled && micBlockedByHost) {
                          toast.error("Your mic is disabled by host");
                          return;
                        }
                        webrtc.toggleAudio();
                      }} title={webrtc.audioEnabled ? "Mute your mic" : "Unmute your mic"} className={`h-8 w-8 rounded-full ${webrtc.audioEnabled ? "text-foreground" : "text-destructive bg-destructive/10"}`}>
                        {webrtc.audioEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                    {audioActive && (
                      <Button size="icon" variant="ghost" onClick={handleToggleDeafen} title={deafenVoiceChat ? "Undeafen" : "Deafen"} className={`h-8 w-8 rounded-full ${deafenVoiceChat ? "text-destructive bg-destructive/10" : "text-muted-foreground"}`}>
                        {deafenVoiceChat ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <div className="relative">
                      <Button size="icon" variant="ghost" onClick={() => setShowReactionPicker(!showReactionPicker)} className="text-muted-foreground hover:text-foreground"><Smile className="w-4 h-4" /></Button>
                      <AnimatePresence>
                        {showReactionPicker && (
                          <motion.div initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.9 }} className="absolute bottom-full mb-2 right-0 glass-panel px-2 py-1.5 flex items-center gap-1">
                            {reactionEmojis.map((emoji) => (
                              <button key={emoji} onClick={() => { handleAddReaction(emoji); setShowReactionPicker(false); }} className="text-xl hover:scale-125 transition-transform p-1">{emoji}</button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setIsMuted(!isMuted)} className={isMuted ? "text-destructive" : "text-muted-foreground"}>
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                </div>

                {webrtc.error && <p className="text-xs text-destructive text-center mt-2">{webrtc.error}</p>}

                <AnimatePresence>
                  {trackEnded && (
                    <TrackEndedOverlay
                      currentTrack={currentTrack}
                      onPlayNext={() => {
                        if (repeat === "one") {
                          ytPlayer.seekToStart();
                          ytPlayer.play();
                        } else {
                          playNext();
                        }
                        setTrackEnded(false);
                      }}
                      onPlayAgain={() => {
                        ytPlayer.seekToStart();
                        ytPlayer.play();
                        setTrackEnded(false);
                      }}
                      onSearchAnother={() => {
                        setCurrentTrack(null);
                        setTrackEnded(false);
                        setShowSourcePicker(true);
                      }}
                      onChangeSource={() => {
                        setCurrentTrack(null);
                        setTrackEnded(false);
                        setShowSourcePicker(true);
                      }}
                    />
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showUpNext && queue.length > 0 && (
                    <UpNextQueue
                      queue={queue}
                      onDismiss={() => setShowUpNext(false)}
                      onPlayTrack={(idx) => {
                        const track = queue[idx];
                        setCurrentTrack(track);
                        setQueue(queue.filter((_, i) => i !== idx));
                        setShowUpNext(false);
                        setTrackEnded(false);
                      }}
                    />
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : null}
        </div>

        {/* Side panels */}
        <AnimatePresence>
          {showPlaylist && (
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "tween", duration: 0.2 }}
              className={`h-full bg-gradient-to-b from-emerald-950/95 to-emerald-900/90 backdrop-blur-xl border-l border-emerald-400/20 overflow-hidden flex flex-col ${isMobile ? "absolute inset-0 z-20" : "w-[320px]"}`}
            >
              <div className="p-3 border-b border-glass-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Queue · {queue.length} tracks
                </h3>
                {isMobile && <button onClick={() => setShowPlaylist(false)} className="text-muted-foreground hover:text-foreground"><ChevronLeft className="w-5 h-5" /></button>}
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {queue.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-8">
                    <Music className="w-8 h-8 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">No tracks in queue</p>
                    <p className="text-[10px] text-muted-foreground/60 max-w-[200px]">Search YouTube or upload audio files to build your queue</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-emerald-400/30 hover:border-emerald-400/60 h-8 text-xs gap-1.5"
                      onClick={() => { setShowPlaylist(false); setShowSourcePicker(true); }}
                    >
                      <Music className="w-3.5 h-3.5" />
                      Add Music
                    </Button>
                  </div>
                ) : (
                  queue.map((track, idx) => {
                      const isCurrentlyPlaying = currentTrack && (
                        (track.videoId && track.videoId === currentTrack.videoId) ||
                        (track.audioUrl && track.audioUrl === currentTrack.audioUrl)
                      );
                      return (
                        <div
                          key={`${track.videoId || track.audioUrl || idx}-${idx}`}
                          className={`w-full p-3 flex items-center gap-3 text-left transition-colors rounded-lg cursor-pointer group ${
                            isCurrentlyPlaying ? "bg-emerald-400/15 border border-emerald-400/30" : "hover:bg-muted/30"
                          }`}
                          onClick={() => {
                            if (isCurrentlyPlaying) return;
                            const playTrack = { ...track };
                            setCurrentTrack(playTrack);
                            setTrackEnded(false);
                            setIsPlaying(false);
                            setShowSourcePicker(false);
                            if (canControl) {
                              if (playTrack.sourceType === "local" && playTrack.audioUrl) {
                                roomSync.broadcastMediaChange({
                                  type: "upload",
                                  title: playTrack.title,
                                  artist: playTrack.artist,
                                  audioUrl: playTrack.audioUrl,
                                  videoUrl: playTrack.audioUrl,
                                  url: playTrack.audioUrl,
                                });
                              } else {
                                roomSync.broadcastMediaChange({
                                  type: "youtube",
                                  videoId: playTrack.videoId,
                                  title: playTrack.title,
                                  artist: playTrack.artist,
                                  thumbnail: playTrack.thumbnail,
                                });
                              }
                            }
                          }}
                        >
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted/40 flex-shrink-0 relative">
                            {track.thumbnail ? (
                              <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-muted">
                                <Music className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                            {isCurrentlyPlaying && (
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <div className="flex gap-0.5 items-end h-4">
                                  {[1,2,3].map(i => (
                                    <motion.div key={i} className="w-1 bg-emerald-400 rounded-full" animate={{ height: isPlaying ? ["4px","16px","8px","14px","4px"] : "4px" }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium line-clamp-2 ${isCurrentlyPlaying ? "text-emerald-300" : "text-foreground"}`}>
                              {track.title}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {track.artist || track.channel} {track.sourceType === "local" ? "· Upload" : "· YouTube"}
                            </p>
                          </div>
                          {!isCurrentlyPlaying && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setQueue(prev => prev.filter((_, i) => i !== idx)); }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
                              title="Remove from queue"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })
                )}
              </div>
              {queue.length > 0 && (
                <div className="p-3 border-t border-emerald-400/15">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-emerald-400/25 hover:border-emerald-400/50 h-8 text-xs gap-1.5"
                    onClick={() => { setShowPlaylist(false); setShowSourcePicker(true); }}
                  >
                    <Music className="w-3.5 h-3.5" />
                    Add More Music
                  </Button>
                </div>
              )}
            </motion.div>
          )}

          {showChat && (
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "tween", duration: 0.2 }}
              className={`h-full bg-gradient-to-b from-emerald-950/95 to-emerald-900/90 backdrop-blur-xl border-l border-emerald-400/20 overflow-hidden flex flex-col ${isMobile ? "absolute inset-0 z-20" : "w-[300px]"}`}
            >
              <div className="p-3 border-b border-glass-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Live Chat</h3>
                {isMobile && <button onClick={() => setShowChat(false)} className="text-muted-foreground hover:text-foreground"><ChevronLeft className="w-5 h-5" /></button>}
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {messages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm"
                  >
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-primary">
                        {msg.username}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{msg.text}</p>
                  </motion.div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t border-glass-border flex items-center gap-2" style={{ paddingBottom: isMobile ? "calc(env(safe-area-inset-bottom, 0px) + 3.5rem)" : "0.75rem" }}>
                <Input
                  placeholder="Say something..."
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                  className="h-9 text-sm bg-muted/50 border-glass-border"
                />
                <Button
                  size="icon"
                  className="gradient-music text-secondary-foreground h-9 w-9"
                  onClick={handleSendMessage}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {showMixer && !showHostControls && (
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "tween", duration: 0.2 }}
              className={`h-full bg-gradient-to-b from-emerald-950/95 to-emerald-900/90 backdrop-blur-xl border-l border-emerald-400/20 overflow-hidden flex flex-col ${isMobile ? "absolute inset-0 z-20" : "w-[320px]"}`}
            >
              <div className="p-4 space-y-6 overflow-y-auto flex-1">
                {/* Music volume */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-secondary/15 flex items-center justify-center flex-shrink-0">
                      <Music className="w-4 h-4 text-secondary" />
                    </div>
                    <span className="text-sm font-medium text-foreground">Music</span>
                    <span className="text-xs font-mono text-muted-foreground ml-auto">
                      {musicVolume}%
                    </span>
                  </div>
                  <Slider
                    value={[musicVolume]}
                    onValueChange={(v) => setMusicVolume(v[0])}
                    max={100}
                    step={1}
                  />
                </div>

                {/* Voice chat volume */}
                <div className="space-y-2 border-t border-glass-border pt-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      audioActive
                        ? "bg-secondary/15"
                        : "bg-destructive/15"
                    }`}>
                      {audioActive ? (
                        <Headphones className="w-4 h-4 text-secondary" />
                      ) : (
                        <VolumeX className="w-4 h-4 text-destructive" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-foreground">Voice Chat</span>
                    <span className="text-xs font-mono text-muted-foreground ml-auto">
                      {voiceChatVolume}%
                    </span>
                  </div>
                  <Slider
                    value={[voiceChatVolume]}
                    onValueChange={(v) => setVoiceChatVolume(v[0])}
                    max={100}
                    step={1}
                    disabled={!audioActive || deafenVoiceChat}
                  />
                  <Button
                    size="sm"
                    variant={deafenVoiceChat ? "destructive" : "outline"}
                      onClick={handleToggleDeafen}
                    disabled={!audioActive}
                  >
                    {deafenVoiceChat ? "Undeafen" : "Deafen"}
                  </Button>
                  <Button
                    size="sm"
                    variant={audioActive ? "outline" : "secondary"}
                    onClick={handleToggleAudio}
                  >
                    {audioActive ? "Leave Voice" : "Join Voice"}
                  </Button>
                </div>

                {/* Individual user volumes */}
                <div className="border-t border-glass-border pt-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Participants
                  </p>
                  {participants.filter((p, idx) => idx !== 0).map((p) => (
                    <div
                      key={p.userId}
                      className="glass-panel p-3 flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        {p.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">
                          {p.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {p.speaking ? "Speaking..." : "Listening"}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleToggleUserMute(p.userId)}
                      >
                        {mutedUserIds.has(p.userId) || deafenVoiceChat ? <VolumeX className="w-4 h-4 text-destructive" /> : <Volume2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {showHostControls && canOpenHostControls && (
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "tween", duration: 0.2 }}
              className={`h-full ${isMobile ? "absolute inset-0 z-20" : "w-[320px]"}`}
            >
              <HostControlsPanel
                open={showHostControls}
                onClose={() => setShowHostControls(false)}
                participants={participants}
                onUpdateParticipant={handleUpdateParticipant}
                onRemoveParticipant={handleRemoveParticipant}
                roomSettings={roomSettings}
                onUpdateSettings={handleUpdateSettings}
                isHost={userRole === "host"}
                hideVideoControls={true}
                panelTheme="music"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {(meshStreams.remoteStreams ? Array.from(meshStreams.remoteStreams.entries()) : []).map(([peerId, stream]) => (
        <audio
          key={peerId}
          ref={(el) => {
            if (!el) return;
            remoteAudioRefs.current.set(peerId, el);
            if (el.srcObject !== stream) {
              el.srcObject = stream;
            }
            el.volume = Math.max(0, Math.min(1, voiceChatVolume / 100));
            el.muted = deafenVoiceChat || mutedUserIds.has(peerId);
            el.play?.().catch(() => {});
          }}
          autoPlay
          playsInline
          className="hidden"
        />
      ))}

      <AnimatePresence>
        {showLeaveConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isLeavingRoom && setShowLeaveConfirm(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="relative z-10 w-full max-w-md glass-panel p-5"
            >
              <h3 className="text-lg font-semibold text-foreground mb-1">{isHost ? "Leave or End Room" : "Leave Room"}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {isHost
                  ? "You can leave and transfer host to another participant, or end the room for everyone."
                  : "Are you sure you want to leave this room?"}
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowLeaveConfirm(false)} disabled={isLeavingRoom}>Cancel</Button>
                <Button variant="outline" onClick={handleConfirmLeave} disabled={isLeavingRoom}>{isLeavingRoom ? "Leaving..." : "Leave Room"}</Button>
                {isHost && (
                  <Button variant="destructive" onClick={handleConfirmEndRoom} disabled={isLeavingRoom}>End Room</Button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSourcePicker && currentTrack && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className="fixed bottom-0 left-0 right-0 z-[65]"
          >
            <div className="h-0.5 bg-muted/60 w-full">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-lime-400 transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
            </div>

            <div className="bg-emerald-950/85 backdrop-blur-xl border-t border-emerald-300/20 px-3 py-2 flex items-center gap-3">
              <button
                className="w-10 h-10 rounded-lg bg-emerald-900/40 border border-emerald-300/20 flex items-center justify-center overflow-hidden shrink-0"
                onClick={() => setShowSourcePicker(false)}
                title="Back to player"
              >
                {currentTrack?.thumbnail ? (
                  <img src={currentTrack.thumbnail} alt={currentTrack.title} className="w-full h-full object-cover" />
                ) : (
                  <Music className="w-5 h-5 text-emerald-300" />
                )}
              </button>

              <button className="flex-1 min-w-0 text-left" onClick={() => setShowSourcePicker(false)}>
                <p className="text-sm font-medium text-foreground truncate">{currentTrack.title}</p>
                <p className="text-[10px] text-muted-foreground truncate">{currentTrack.artist || "Unknown"} · {Math.floor(displayCurrentTime / 60)}:{String(Math.floor(displayCurrentTime % 60)).padStart(2, "0")} / {Math.floor(displayDuration / 60)}:{String(Math.floor(displayDuration % 60)).padStart(2, "0")}</p>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                <button onClick={playPrevious} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  onClick={togglePlayPause}
                  className="p-2 rounded-full bg-gradient-to-r from-emerald-400 to-lime-400 text-emerald-950 hover:brightness-110 transition"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                <button onClick={playNext} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                  <SkipForward className="w-4 h-4" />
                </button>
                <button onClick={() => setShowSourcePicker(false)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors ml-1">
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile bottom toolbar removed — all items now in header ⋮ dropdown */}

      <InviteFriendsModal
        open={showInviteFriends}
        onClose={() => setShowInviteFriends(false)}
        roomCode={roomCode}
        participantIds={(dbParticipants || []).map(p => p.userId).filter(Boolean)}
      />

      <div ref={ytPlayer.wrapperRef} className="pointer-events-none" style={{ position: "fixed", bottom: 0, left: 0, width: 1, height: 1, opacity: 0.01, zIndex: -1 }} />
    </div>
  );
};

export default MusicRoom;