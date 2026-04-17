import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
import api from "@/services/api";

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
  const {
    room,
    participants: dbParticipants,
    isHost,
    accessStatus,
    joinStatus,
    guestName,
    joinAsGuest,
    joinRequests,
    acceptJoinRequest,
    rejectJoinRequest,
    currentUserId,
    leaveRoom,
    endRoom,
  } = useRoom(effectiveRoomId, "movie");
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
  const [fallbackYoutubeVideoId, setFallbackYoutubeVideoId] = useState(null);
  const [showYoutubeSearch, setShowYoutubeSearch] = useState(false);
  const [isJoiningAsGuest, setIsJoiningAsGuest] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadProgressPct, setUploadProgressPct] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState("Uploading media...");
  const [isUploadMediaReady, setIsUploadMediaReady] = useState(false);

  // Audio mixing state
  const [movieVolume, setMovieVolume] = useState(80);
  const [voiceChatVolume, setVoiceChatVolume] = useState(60);
  const [deafenVoiceChat, setDeafenVoiceChat] = useState(false);
  const [mutedUsers, setMutedUsers] = useState(new Set());
  const [videoDisbldUsers, setVideoDisabledUsers] = useState(new Set());
  const [selectedUserSettings, setSelectedUserSettings] = useState(null);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);

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
  const screenVideoRef = useRef(null);
  const fileInputRef = useRef(null);
  const suppressRemoteSyncRef = useRef(false);
  const pendingRemoteActionRef = useRef(null);
  const pendingRemoteActionSetAtRef = useRef(0);
  const rateResetTimerRef = useRef(null);
  const startupResyncTimerRef = useRef(null);
  const adGuardUntilRef = useRef(0);
  const youtubeErrorFallbackRef = useRef({ mediaKey: null, at: 0 });
  const lastYoutubeNativeStateRef = useRef("unstarted");
  const lastYoutubeNativeTimeRef = useRef(0);
  const lastYoutubeControlEmitRef = useRef({ event: null, at: 0, time: 0 });
  const nativeBridgeMutedUntilRef = useRef(0);
  const uploadReadyToastRef = useRef(false);
  const desiredPlayingRef = useRef(false);

  const getYoutubeMediaKey = useCallback(() => {
    const activeYoutubeVideoId = youtubeVideoId || fallbackYoutubeVideoId;
    if (mediaSource !== "youtube" || !activeYoutubeVideoId) return null;
    return `youtube:${activeYoutubeVideoId}`;
  }, [mediaSource, youtubeVideoId, fallbackYoutubeVideoId]);

  const getUploadMediaKey = useCallback(() => {
    if (mediaSource !== "upload" || !uploadedVideoUrl) return null;
    return `upload:${uploadedVideoUrl}`;
  }, [mediaSource, uploadedVideoUrl]);

  const activeYoutubeVideoId = useMemo(() => {
    if (mediaSource !== "youtube") return null;
    return youtubeVideoId || fallbackYoutubeVideoId || null;
  }, [mediaSource, youtubeVideoId, fallbackYoutubeVideoId]);

  const resolveYoutubeVideoId = useCallback((media) => {
    const rawMediaId = media?.videoId || media?.id || media?.metadata?.videoId || "";
    const direct = typeof rawMediaId === "string" ? rawMediaId.trim() : "";
    if (direct) return direct;

    const rawUrl = String(media?.videoUrl || media?.url || "").trim();
    if (!rawUrl) return "";

    const watchMatch = rawUrl.match(/[?&]v=([^&]+)/);
    const shortMatch = rawUrl.match(/youtu\.be\/([^?&/]+)/);
    const embedMatch = rawUrl.match(/\/embed\/([^?&/]+)/);
    return watchMatch?.[1] || shortMatch?.[1] || embedMatch?.[1] || "";
  }, []);

  // WebRTC hooks
  const webrtc = useWebRTC();

  // Determine participant IDs for mesh
  // Use currentUserId from room (socket userId from socket:identify event)
  // Fallback to socket.userId directly (set by server auth middleware)
  const myUserId = currentUserId || socket.userId || user?.id;
  const currentParticipant = useMemo(
    () => (dbParticipants || []).find((p) => p.userId === myUserId),
    [dbParticipants, myUserId]
  );
  const myRestrictions = useMemo(
    () => currentParticipant?.restrictions || {},
    [currentParticipant]
  );
  const micBlockedByHost = !!myRestrictions.micDisabledByHost;
  const videoBlockedByHost = !!myRestrictions.videoDisabledByHost;

  const otherParticipantIds = useMemo(() => 
    (dbParticipants || [])
      .filter((p) => p.userId !== myUserId)
      .map((p) => p.userId),
    [dbParticipants, myUserId]
  );

  // WebRTC signaling (for screen share)
  const rtcSignaling = useWebRTCSignaling({
    roomCode: effectiveRoomId,
    isHost,
    participantIds: otherParticipantIds,
    userId: myUserId,
  });
  const screenStream = webrtc.screenStream || rtcSignaling.remoteStream;

  useEffect(() => {
    if (mediaSource !== "screen") return;
    if (isHost) return;
    if (screenStream) return;

    // Late-join fallback: explicitly request host stream when room sync indicates active screen share.
    rtcSignaling.requestStream?.();
  }, [mediaSource, isHost, screenStream, rtcSignaling]);

  // WebRTC mesh (for camera/mic)
  const meshStreams = useWebRTCMesh({
    roomCode: effectiveRoomId,
    participantIds: otherParticipantIds,
    localStream: webrtc.stream,
    enabled: showVideoChat,
    userId: myUserId,
    isHost,
  });

  // User role
  const myRole = dbParticipants?.find((p) => p.userId === myUserId)?.role;
  const isCurrentUserHost = Boolean(myUserId && room?.hostId === myUserId);
  const userRole = isCurrentUserHost
    ? "host"
    : ((myRole === "co-host" || myRole === "cohost") ? "co-host" : "guest");
  const canOpenHostControls = userRole === "host" || userRole === "co-host";
  const canControl = useMemo(() => {
    if (isCurrentUserHost) return true;
    if (!currentParticipant) return accessStatus === "granted";
    if (currentParticipant.restrictions?.mediaControlDisabledByHost) return false;
    return true;
  }, [isCurrentUserHost, currentParticipant, accessStatus]);

  const shouldFallbackOnYoutubeError = useCallback((errorCode) => {
    if (!(isCurrentUserHost || userRole === "co-host")) return false;
    if (!canControl || mediaSource !== "youtube") return false;

    const unrecoverable = new Set([2, 5, 100, 101, 150]);
    if (errorCode !== null && !unrecoverable.has(Number(errorCode))) return false;

    const mediaKey = getYoutubeMediaKey();
    const previous = youtubeErrorFallbackRef.current;
    const now = Date.now();
    if (mediaKey && previous.mediaKey === mediaKey && now - previous.at < 10000) {
      return false;
    }

    youtubeErrorFallbackRef.current = { mediaKey, at: now };
    return true;
  }, [isCurrentUserHost, userRole, canControl, mediaSource, getYoutubeMediaKey]);

  // YouTube player
  const ytPlayer = useYouTubePlayer({
    videoId: activeYoutubeVideoId,
    controlsEnabled: canControl,
    onStateChange: (state, meta) => {
      const currentTime = Number.isFinite(meta?.playerTime) ? meta.playerTime : (ytPlayer.currentTime || 0);
      const currentDuration = Number.isFinite(meta?.playerDuration) ? meta.playerDuration : (ytPlayer.duration || 0);
      const previousState = lastYoutubeNativeStateRef.current;
      const previousTime = lastYoutubeNativeTimeRef.current;
      const now = Date.now();

      // Keep YouTube native controls and room controls perfectly aligned.
      const nativeBridgeMuted = Date.now() < nativeBridgeMutedUntilRef.current;
      if (canControl && mediaSource === "youtube" && !suppressRemoteSyncRef.current && !roomSync.controlPending && !nativeBridgeMuted) {
        const jumpDelta = Math.abs(currentTime - previousTime);
        if (state === "buffering" && jumpDelta > 0.9) {
          const seekDuplicate =
            lastYoutubeControlEmitRef.current.event === "seek" &&
            now - lastYoutubeControlEmitRef.current.at < 250 &&
            Math.abs((lastYoutubeControlEmitRef.current.time ?? 0) - currentTime) < 0.35;
          if (!seekDuplicate) {
            roomSync.broadcastSeek(currentTime, currentDuration || 0);
            lastYoutubeControlEmitRef.current = { event: "seek", at: now, time: currentTime };
          }
        }

        if (state === "playing" && previousState !== "playing") {
          const playDuplicate =
            lastYoutubeControlEmitRef.current.event === "play" &&
            now - lastYoutubeControlEmitRef.current.at < 250 &&
            Math.abs((lastYoutubeControlEmitRef.current.time ?? 0) - currentTime) < 0.35;
          if (!playDuplicate) {
            roomSync.broadcastPlay(currentTime, currentDuration || 0);
            lastYoutubeControlEmitRef.current = { event: "play", at: now, time: currentTime };
          }
        }

        if (state === "paused" && previousState === "playing") {
          const seekTransition =
            lastYoutubeControlEmitRef.current.event === "seek" &&
            now - lastYoutubeControlEmitRef.current.at < 900;
          const pauseDuplicate =
            lastYoutubeControlEmitRef.current.event === "pause" &&
            now - lastYoutubeControlEmitRef.current.at < 250 &&
            Math.abs((lastYoutubeControlEmitRef.current.time ?? 0) - currentTime) < 0.35;
          if (!pauseDuplicate && !seekTransition) {
            roomSync.broadcastPause(currentTime, currentDuration || 0);
            lastYoutubeControlEmitRef.current = { event: "pause", at: now, time: currentTime };
          }
        }
      }

      lastYoutubeNativeStateRef.current = state;
      if (Number.isFinite(currentTime)) {
        lastYoutubeNativeTimeRef.current = currentTime;
      }

      if (state === "playing") {
        setIsPlaying(true);
        desiredPlayingRef.current = true;
      } else if (state === "paused") {
        const nativeBridgeMutedNow = Date.now() < nativeBridgeMutedUntilRef.current;
        if (!(nativeBridgeMutedNow && previousState === "playing")) {
          setIsPlaying(false);
          desiredPlayingRef.current = false;
        }
      } else if (state === "ended") {
        setIsPlaying(false);
        desiredPlayingRef.current = false;
        if (canControl && mediaSource === "youtube" && !suppressRemoteSyncRef.current) {
          roomSync.broadcastPause(currentDuration || 0, currentDuration || 0);
        }
        toast("🎬 Video finished!", { description: "Pick another video to continue watching." });
      } else if (state === "error") {
        setIsPlaying(false);
        toast.error("Unable to play this YouTube video", {
          description: meta?.errorCode
            ? `Playback error (${meta.errorCode}). This video may be restricted.`
            : "This video may be restricted. Try another result.",
          duration: 3000,
        });
      }
    },
    onError: (errorCode) => {
      // Local iframe issues should not clear authoritative room media.
      if (!shouldFallbackOnYoutubeError(errorCode)) {
        setIsPlaying(false);
        return;
      }

      setIsPlaying(false);
      toast.error("Unable to play this YouTube video", {
        description: errorCode
          ? `Playback error (${errorCode}). This video may be restricted.`
          : "This video may be restricted. Try another result.",
        duration: 2600,
      });
    },
    onReady: () => {
      adGuardUntilRef.current = Date.now() + 8000;
      const pending = pendingRemoteActionRef.current;
      if (pending && Date.now() - pendingRemoteActionSetAtRef.current > 7000) {
        pendingRemoteActionRef.current = null;
        return;
      }
      const currentMediaKey = getYoutubeMediaKey();
      if (pending?.mediaKey && currentMediaKey && pending.mediaKey !== currentMediaKey) {
        pendingRemoteActionRef.current = null;
        return;
      }

      if (pending?.type === "play") {
        if (Number.isFinite(pending.time)) {
          ytPlayer.seekTo(pending.time, true);
        }
        nativeBridgeMutedUntilRef.current = Date.now() + 1200;
        ytPlayer.play();
        pendingRemoteActionRef.current = null;
      } else if (pending?.type === "pause") {
        if (Number.isFinite(pending.time)) {
          ytPlayer.seekTo(pending.time, true);
        }
        nativeBridgeMutedUntilRef.current = Date.now() + 1200;
        ytPlayer.pause();
        pendingRemoteActionRef.current = null;
      }

      if (!canControl && mediaSource === "youtube" && isPlaying) {
        ytPlayer.play();
      }
    },
    onVideoChange: (newVideoId) => {
      setYoutubeVideoId(newVideoId);
      setFallbackYoutubeVideoId(newVideoId);
      setMediaSource("youtube");
      setIsPlaying(false);
      setProgress(0);
      if (canControl) {
        roomSync.broadcastMediaChange({
          type: "youtube",
          videoId: newVideoId,
          title: "YouTube Video",
        });
        roomSync.broadcastPause(0, ytPlayer.duration || 0);
      }
      toast("▶️ Switched to suggested video", {
        description: "Video is loaded for everyone. Press play when all are ready.",
        duration: 2500,
      });
    },
  });

  // Room sync
  const roomSync = useRoomSync({
    roomCode: effectiveRoomId,
    mode: "advanced",
    isHost,
    isCoHost: userRole === "co-host",
    canControlOverride: canControl,
    timeUnit: "seconds",
    enableDriftCorrection: true,
    driftIntervalMs: 1000,
    getCurrentPosition: () => {
      if (mediaSource === "youtube" && (ytPlayer.playerState === "buffering" || ytPlayer.playerState === "unstarted")) {
        return Number.NaN;
      }
      if (mediaSource === "youtube") return ytPlayer.currentTime || 0;
      if (mediaSource === "upload" && uploadVideoRef.current) return uploadVideoRef.current.currentTime || 0;
      return 0;
    },
    onMediaChange: (media) => {
      const mediaType = media?.type || "none";
      const resolvedYoutubeId = resolveYoutubeVideoId(media);

      if (mediaType === "youtube" && resolvedYoutubeId) {
        adGuardUntilRef.current = Date.now() + 12000;
        setYoutubeVideoId(resolvedYoutubeId);
        setFallbackYoutubeVideoId(resolvedYoutubeId);
        setMediaSource("youtube");
        setIsPlaying(false);
        desiredPlayingRef.current = false;
        // Keep pending play/pause action so onReady can apply out-of-order control events.
      } else if (mediaType === "upload" && media?.videoUrl) {
        setUploadedVideoUrl(media.videoUrl);
        setFallbackYoutubeVideoId(null);
        setMediaSource("upload");
        setIsUploadMediaReady(false);
        uploadReadyToastRef.current = false;
        setIsPlaying(false);
        desiredPlayingRef.current = false;
      } else if (mediaType === "screen") {
        setFallbackYoutubeVideoId(null);
        setMediaSource("screen");
        setIsPlaying(true);
      } else if (mediaType === "none") {
        setMediaSource("none");
        setYoutubeVideoId(null);
        setFallbackYoutubeVideoId(null);
        setUploadedVideoUrl(null);
        setIsPlaying(false);
        desiredPlayingRef.current = false;
        pendingRemoteActionRef.current = null;
      }
    },
    onPlay: (timeSec = 0) => {
      setIsPlaying(true);
      desiredPlayingRef.current = true;
      suppressRemoteSyncRef.current = true;
      if (mediaSource === "youtube") {
        const hasPlayer = !!ytPlayer.player?.current;
        const canApplyImmediately = hasPlayer && ["playing", "paused", "cued"].includes(ytPlayer.playerState);
        nativeBridgeMutedUntilRef.current = Date.now() + 1200;
        if (canApplyImmediately) {
          if (Number.isFinite(timeSec)) {
            ytPlayer.seekTo(timeSec, true);
          }
          ytPlayer.play();
          pendingRemoteActionRef.current = null;
        } else {
          pendingRemoteActionRef.current = {
            type: "play",
            time: timeSec,
            mediaKey: getYoutubeMediaKey(),
          };
          pendingRemoteActionSetAtRef.current = Date.now();
        }
        setTimeout(() => { suppressRemoteSyncRef.current = false; }, 400);
      } else if (mediaSource === "upload") {
        const mediaKey = getUploadMediaKey();
        const video = uploadVideoRef.current;
        const canApplyImmediately = !!video && video.readyState >= 2;
        if (canApplyImmediately) {
          pendingRemoteActionRef.current = null;
          if (Number.isFinite(timeSec) && Number.isFinite(video.duration) && video.duration > 0) {
            video.currentTime = Math.max(0, Math.min(video.duration, timeSec));
          }
          video.play().catch(() => {});
        } else {
          pendingRemoteActionRef.current = {
            type: "play",
            time: Number.isFinite(timeSec) ? timeSec : 0,
            mediaKey,
          };
          pendingRemoteActionSetAtRef.current = Date.now();
        }
        suppressRemoteSyncRef.current = false;
      } else {
        // Play can arrive before media-change; keep pending and apply when media becomes ready.
        pendingRemoteActionRef.current = {
          type: "play",
          time: timeSec,
          mediaKey: getYoutubeMediaKey(),
        };
        pendingRemoteActionSetAtRef.current = Date.now();
        suppressRemoteSyncRef.current = false;
      }
    },
    onPause: (timeSec = 0) => {
      setIsPlaying(false);
      desiredPlayingRef.current = false;
      suppressRemoteSyncRef.current = true;
      if (mediaSource === "youtube") {
        const hasPlayer = !!ytPlayer.player?.current;
        const canApplyImmediately = hasPlayer && ["playing", "paused", "cued"].includes(ytPlayer.playerState);
        nativeBridgeMutedUntilRef.current = Date.now() + 1200;
        if (canApplyImmediately) {
          if (Number.isFinite(timeSec)) {
            ytPlayer.seekTo(timeSec, true);
          }
          ytPlayer.pause();
          pendingRemoteActionRef.current = null;
        } else {
          pendingRemoteActionRef.current = {
            type: "pause",
            time: timeSec,
            mediaKey: getYoutubeMediaKey(),
          };
          pendingRemoteActionSetAtRef.current = Date.now();
        }
        setTimeout(() => { suppressRemoteSyncRef.current = false; }, 400);
      } else if (mediaSource === "upload") {
        const mediaKey = getUploadMediaKey();
        const video = uploadVideoRef.current;
        if (video) {
          pendingRemoteActionRef.current = null;
          if (Number.isFinite(timeSec) && Number.isFinite(video.duration) && video.duration > 0) {
            video.currentTime = Math.max(0, Math.min(video.duration, timeSec));
          }
          video.pause();
          setTimeout(() => video.pause(), 0);
        } else {
          pendingRemoteActionRef.current = {
            type: "pause",
            time: Number.isFinite(timeSec) ? timeSec : 0,
            mediaKey,
          };
          pendingRemoteActionSetAtRef.current = Date.now();
        }
        suppressRemoteSyncRef.current = false;
      } else {
        pendingRemoteActionRef.current = {
          type: "pause",
          time: timeSec,
          mediaKey: getYoutubeMediaKey(),
        };
        pendingRemoteActionSetAtRef.current = Date.now();
        suppressRemoteSyncRef.current = false;
      }
    },
    onSeek: (timeSec) => {
      const duration = mediaSource === "youtube"
        ? (ytPlayer.duration || 0)
        : (mediaSource === "upload" ? (uploadVideoRef.current?.duration || 0) : 0);
      if (duration > 0 && Number.isFinite(timeSec)) {
        setProgress(Math.max(0, Math.min(100, (timeSec / duration) * 100)));
      }
      suppressRemoteSyncRef.current = true;
      if (mediaSource === "youtube") {
        const canApplyImmediately = ["playing", "paused", "cued"].includes(ytPlayer.playerState);
        nativeBridgeMutedUntilRef.current = Date.now() + 1200;
        if (canApplyImmediately) {
          ytPlayer.seekTo(timeSec, true);
          if (desiredPlayingRef.current) {
            ytPlayer.play();
          } else {
            ytPlayer.pause();
          }
          pendingRemoteActionRef.current = null;
          setTimeout(() => { suppressRemoteSyncRef.current = false; }, 400);
        } else {
          pendingRemoteActionRef.current = {
            type: desiredPlayingRef.current ? "play" : "pause",
            time: Number.isFinite(timeSec) ? timeSec : 0,
            mediaKey: getYoutubeMediaKey(),
          };
          pendingRemoteActionSetAtRef.current = Date.now();
          suppressRemoteSyncRef.current = false;
        }
      } else if (mediaSource === "upload") {
        const mediaKey = getUploadMediaKey();
        const video = uploadVideoRef.current;
        if (video && Number.isFinite(video.duration) && video.duration > 0) {
          pendingRemoteActionRef.current = null;
          video.currentTime = Math.max(0, Math.min(video.duration, timeSec));
        } else {
          pendingRemoteActionRef.current = {
            type: desiredPlayingRef.current ? "play" : "pause",
            time: Number.isFinite(timeSec) ? timeSec : 0,
            mediaKey,
          };
          pendingRemoteActionSetAtRef.current = Date.now();
        }
        suppressRemoteSyncRef.current = false;
      } else {
        suppressRemoteSyncRef.current = false;
      }
    },
    onRateAdjust: (rate, correction) => {
      if (!Number.isFinite(rate)) return;
      if (mediaSource === "youtube") {
        const targetPosition = Number(correction?.targetPosition);
        const current = Number(ytPlayer.currentTime || 0);
        const hasTarget = Number.isFinite(targetPosition);
        const drift = hasTarget ? (targetPosition - current) : 0;

        // YouTube supports only discrete playback rates; use micro-seek for smooth sub-second drift fixes.
        if (hasTarget && Math.abs(drift) >= 0.08) {
          suppressRemoteSyncRef.current = true;
          nativeBridgeMutedUntilRef.current = Date.now() + 700;
          ytPlayer.seekTo(targetPosition, true);
          if (desiredPlayingRef.current) {
            ytPlayer.play();
          } else {
            ytPlayer.pause();
          }
          setTimeout(() => {
            suppressRemoteSyncRef.current = false;
          }, 220);
        }
        return;
      } else if (mediaSource === "upload" && uploadVideoRef.current) {
        uploadVideoRef.current.playbackRate = rate;
      }

      if (rateResetTimerRef.current) {
        clearTimeout(rateResetTimerRef.current);
      }
      rateResetTimerRef.current = setTimeout(() => {
        if (mediaSource === "youtube") {
          ytPlayer.setPlaybackRate?.(1);
        } else if (mediaSource === "upload" && uploadVideoRef.current) {
          uploadVideoRef.current.playbackRate = 1;
        }
      }, 1200);
    },
    onSyncUpdate: ({ currentPlayback } = {}) => {
      const syncYoutubeId = resolveYoutubeVideoId(currentPlayback?.media);
      if (syncYoutubeId) {
        setFallbackYoutubeVideoId(syncYoutubeId);
        if (mediaSource === "youtube" && !youtubeVideoId) {
          setYoutubeVideoId(syncYoutubeId);
        }
      }
      setSyncStatus("synced");
    },
    onSyncConflict: ({ event, error }) => {
      setSyncStatus("syncing");
      toast("Sync conflict resolved", {
        description: error
          ? `Your ${event} action was rejected (${error}). Room state was reapplied.`
          : `Your ${event} action was stale and was rolled back to room authority.`,
        duration: 2200,
      });
    },
  });

  useEffect(() => {
    if (mediaSource !== "youtube") return;
    if (youtubeVideoId || !fallbackYoutubeVideoId) return;
    setYoutubeVideoId(fallbackYoutubeVideoId);
  }, [mediaSource, youtubeVideoId, fallbackYoutubeVideoId]);

  useEffect(() => {
    if (mediaSource !== "upload") return;
    if (!isUploadMediaReady) return;
    const video = uploadVideoRef.current;
    if (!video) return;

    const pending = pendingRemoteActionRef.current;
    const currentMediaKey = getUploadMediaKey();

    const pendingAgeMs = pending ? (Date.now() - pendingRemoteActionSetAtRef.current) : 0;
    if (pending && pendingAgeMs > 7000) {
      pendingRemoteActionRef.current = null;
    }

    if (pending && pendingAgeMs <= 7000) {
      if (pending.mediaKey && currentMediaKey && pending.mediaKey !== currentMediaKey) {
        pendingRemoteActionRef.current = null;
      } else {
        if (Number.isFinite(pending.time) && Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = Math.max(0, Math.min(video.duration, pending.time));
        }

        if (pending.type === "play") {
          video.play().catch(() => {});
          setIsPlaying(true);
          desiredPlayingRef.current = true;
        } else {
          video.pause();
          setIsPlaying(false);
          desiredPlayingRef.current = false;
        }
        pendingRemoteActionRef.current = null;
        return;
      }
    }

    if (!desiredPlayingRef.current) {
      video.pause();
      setIsPlaying(false);
    }
  }, [mediaSource, isUploadMediaReady, getUploadMediaKey]);

  useEffect(() => {
    return () => {
      if (rateResetTimerRef.current) {
        clearTimeout(rateResetTimerRef.current);
      }
      if (startupResyncTimerRef.current) {
        clearTimeout(startupResyncTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (mediaSource !== "youtube" || !isPlaying) return;
    if (startupResyncTimerRef.current) {
      clearTimeout(startupResyncTimerRef.current);
    }

    // Tighten first-second startup skew before periodic drift loop kicks in.
    startupResyncTimerRef.current = setTimeout(() => {
      roomSync.requestSync?.();
      startupResyncTimerRef.current = null;
    }, 550);

    return () => {
      if (startupResyncTimerRef.current) {
        clearTimeout(startupResyncTimerRef.current);
        startupResyncTimerRef.current = null;
      }
    };
  }, [mediaSource, isPlaying, roomSync]);

  useEffect(() => {
    if (roomSync.controlPending) {
      setSyncStatus("syncing");
      return;
    }

    setSyncStatus("synced");
  }, [roomSync.controlPending]);

  useEffect(() => {
    if (!canOpenHostControls && showHostControls) {
      setShowHostControls(false);
    }
  }, [canOpenHostControls, showHostControls]);

  useEffect(() => {
    const handleConnected = () => {
      setSyncStatus("synced");
      roomSync.requestSync?.();
    };
    const handleDisconnected = () => {
      setSyncStatus("syncing");
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

  const addMoment = useMomentsStore((s) => s.addMoment);
  const joinTimeRef = useRef(Date.now());

  // Initialize
  useEffect(() => {
    joinTimeRef.current = Date.now();
    return () => {
      webrtc.stopMedia();
      if (uploadedVideoUrl?.startsWith("blob:")) URL.revokeObjectURL(uploadedVideoUrl);
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
    const seenIds = new Set();
    const list = [];

    // Build from canonical DB participants first to avoid duplicate local+remote host entries.
    if (dbParticipants && Array.isArray(dbParticipants)) {
      for (const p of dbParticipants) {
        if (!p?.userId || seenIds.has(p.userId)) continue;
        seenIds.add(p.userId);

        const isPrimaryHostRow = isHost && p.role === "host" && !list.some((item) => item.isLocalUser);
        const isLocal = (!!myUserId && p.userId === myUserId) || isPrimaryHostRow;
        const remoteStream = !isLocal ? meshStreams.remoteStreams.get(p.userId) : null;

        const remoteHasVideo = remoteStream ? remoteStream.getVideoTracks().some((t) => t.enabled) : false;
        const remoteHasAudio = remoteStream ? remoteStream.getAudioTracks().some((t) => t.enabled) : true;
        const remoteAudioEnabled = typeof p.audioEnabled === "boolean" ? p.audioEnabled : remoteHasAudio;

        list.push({
          name: isLocal
            ? (profile?.display_name || p.displayName || p.username || "You") + (isHost ? " (Host)" : "")
            : (p.displayName || p.username || "User"),
          emoji: isLocal ? (profile?.avatar_emoji || p.avatar_emoji || "😎") : (p.avatar_emoji || "🧑"),
          speaking: false,
          role: p.role || (isLocal && isHost ? "host" : "guest"),
          audioEnabled: isLocal
            ? (webrtc.audioEnabled && !micBlockedByHost)
            : (remoteAudioEnabled && !p?.restrictions?.micDisabledByHost),
          videoEnabled: isLocal
            ? (webrtc.videoEnabled && !videoBlockedByHost)
            : (!!remoteStream && remoteHasVideo && !p?.restrictions?.videoDisabledByHost),
          chatEnabled: true,
          username: isLocal ? (profile?.username || user?.username || p.username || "You") : (p.username || ""),
          isOnline: true,
          userId: p.userId,
          odlUserId: p.userId,
          restrictions: isLocal ? myRestrictions : (p.restrictions || {}),
          isLocalUser: isLocal,
        });
      }
    }

    // Fallback: if local user isn't present in DB participants yet, add synthetic local entry once.
    const hasCanonicalParticipants = Array.isArray(dbParticipants) && dbParticipants.length > 0;
    if (myUserId && !hasCanonicalParticipants && !seenIds.has(myUserId) && (isHost || accessStatus === "granted")) {
      list.push({
        name: (profile?.display_name || "You") + (isHost ? " (Host)" : ""),
        emoji: profile?.avatar_emoji || "😎",
        speaking: false,
        role: isHost ? "host" : "guest",
        audioEnabled: webrtc.audioEnabled && !micBlockedByHost,
        videoEnabled: webrtc.videoEnabled && !videoBlockedByHost,
        chatEnabled: true,
        username: profile?.username || user?.username || "You",
        isOnline: true,
        userId: myUserId,
        odlUserId: myUserId,
        restrictions: myRestrictions,
        isLocalUser: true,
      });
    }

    setParticipants(list);
  }, [user, dbParticipants, profile, isHost, accessStatus, meshStreams.remoteStreams, myUserId, webrtc.audioEnabled, webrtc.videoEnabled, micBlockedByHost, videoBlockedByHost, myRestrictions]);

  useEffect(() => {
    if (!effectiveRoomId || !myUserId) return;

    const audioEnabled = showVideoChat && webrtc.audioEnabled && !micBlockedByHost;
    socket.emit("audio:state-change", {
      roomCode: effectiveRoomId,
      userId: myUserId,
      audioEnabled,
      isMuted: !audioEnabled,
      isSpeaking: false,
    });
  }, [effectiveRoomId, myUserId, showVideoChat, webrtc.audioEnabled, micBlockedByHost]);

  useEffect(() => {
    if (micBlockedByHost && webrtc.audioEnabled) {
      webrtc.toggleAudio();
    }
  }, [micBlockedByHost, webrtc]);

  useEffect(() => {
    if (videoBlockedByHost && webrtc.videoEnabled) {
      webrtc.toggleVideo();
    }
  }, [videoBlockedByHost, webrtc]);

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
    if (ytPlayer.duration > 0) {
      setProgress(ytPlayer.progressPercent);
    }
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
  const getCurrentMediaTime = useCallback(() => {
    if (mediaSource === "youtube") return ytPlayer.currentTime || 0;
    if (mediaSource === "upload" && uploadVideoRef.current) return uploadVideoRef.current.currentTime || 0;
    return 0;
  }, [mediaSource, ytPlayer.currentTime]);

  const getCurrentMediaDuration = useCallback(() => {
    if (mediaSource === "youtube") return ytPlayer.duration || 0;
    if (mediaSource === "upload" && uploadVideoRef.current) return uploadVideoRef.current.duration || 0;
    return 0;
  }, [mediaSource, ytPlayer.duration]);

  const handleTogglePlay = useCallback(() => {
    if (roomSync.controlPending) return;
    if (!canControl) return;
    if (mediaSource === "youtube") {
      if (isPlaying) {
        desiredPlayingRef.current = false;
        ytPlayer.pause();
        roomSync.broadcastPause(getCurrentMediaTime(), getCurrentMediaDuration());
      } else {
        desiredPlayingRef.current = true;
        ytPlayer.play();
        roomSync.broadcastPlay(getCurrentMediaTime(), getCurrentMediaDuration());
      }
      return;
    }
    if (mediaSource === "upload" && uploadVideoRef.current) {
      pendingRemoteActionRef.current = null;
      if (uploadVideoRef.current.paused) {
        desiredPlayingRef.current = true;
        uploadVideoRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          setIsPlaying(false);
          desiredPlayingRef.current = false;
        });
        roomSync.broadcastPlay(getCurrentMediaTime(), getCurrentMediaDuration());
      } else {
        desiredPlayingRef.current = false;
        uploadVideoRef.current.pause();
        // Some browsers can briefly re-enter playing state; enforce pause on next tick.
        setTimeout(() => {
          uploadVideoRef.current?.pause();
        }, 0);
        setIsPlaying(false);
        roomSync.broadcastPause(getCurrentMediaTime(), getCurrentMediaDuration());
      }
      return;
    }
    const next = !isPlaying;
    desiredPlayingRef.current = next;
    setIsPlaying(next);
    if (next) roomSync.broadcastPlay(0, 0);
    else roomSync.broadcastPause(0, 0);
  }, [isPlaying, mediaSource, ytPlayer, canControl, roomSync, getCurrentMediaTime, getCurrentMediaDuration]);

  const handleSeek = useCallback((pct) => {
    if (roomSync.controlPending) return;
    if (!canControl) return;
    setProgress(pct);
    const duration = getCurrentMediaDuration();
    const targetSec = duration > 0 ? (pct / 100) * duration : 0;
    const shouldResumeAfterSeek = desiredPlayingRef.current;
    roomSync.broadcastSeek(targetSec, duration);
    if (mediaSource === "youtube") {
      suppressRemoteSyncRef.current = true;
      nativeBridgeMutedUntilRef.current = Date.now() + 460;
      if (shouldResumeAfterSeek) {
        // Authoritative seek will apply via sync update for all clients at nearly the same moment.
      } else {
        ytPlayer.seekTo(targetSec, true);
        ytPlayer.pause();
      }
      setTimeout(() => {
        suppressRemoteSyncRef.current = false;
      }, 260);
    } else if (mediaSource === "upload" && uploadVideoRef.current) {
      if (shouldResumeAfterSeek) {
        // Keep local playback state; authoritative seek update will set the target time.
      } else {
        uploadVideoRef.current.currentTime = targetSec;
      }
    }
  }, [canControl, mediaSource, ytPlayer, roomSync, getCurrentMediaDuration]);

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
      setIsPlaying(false);
      roomSync.broadcastMediaChange({ type: "none" });
      toast.success("🖥️ Screen sharing stopped", { duration: 2000 });
    } else {
      const stream = await webrtc.startScreenShare();
      if (stream) {
        setMediaSource("screen");
        setIsPlaying(true);
        roomSync.broadcastMediaChange({ type: "screen", title: "Screen Share" });
        rtcSignaling.startBroadcastStream(stream);
        toast.success("🖥️ Screen sharing started!", {
          description: "Your screen is being shared with all participants.",
          duration: 3000,
        });
        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          setMediaSource("none");
          setIsPlaying(false);
          rtcSignaling.stopBroadcastStream();
          roomSync.broadcastMediaChange({ type: "none" });
        });
      }
    }
  }, [webrtc, roomSync, rtcSignaling]);

  // Bind screen share stream to video element using srcObject (required for MediaStream).
  useEffect(() => {
    const video = screenVideoRef.current;
    if (!video || mediaSource !== "screen") return;

    if (screenStream) {
      if (video.srcObject !== screenStream) {
        video.srcObject = screenStream;
      }
      video.play().catch(() => {});
    } else if (video.srcObject) {
      video.srcObject = null;
    }

    return () => {
      if (video && mediaSource !== "screen") {
        video.srcObject = null;
      }
    };
  }, [mediaSource, screenStream]);

  // Apply media mixer controls to incoming shared-screen audio while muting local preview.
  useEffect(() => {
    const video = screenVideoRef.current;
    if (!video || mediaSource !== "screen") return;
    const isLocalScreen = Boolean(webrtc.screenStream);
    video.muted = isLocalScreen ? true : isMuted;
    video.volume = isLocalScreen ? 0 : (isMuted ? 0 : movieVolume / 100);
  }, [mediaSource, webrtc.screenStream, isMuted, movieVolume]);

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

    if (!canControl) {
      toast.error("You don't have media control permission");
      return;
    }

    try {
      setIsUploadingMedia(true);
      setUploadProgressPct(0);
      setUploadStatusText("Uploading media...");
      setIsUploadMediaReady(false);
      uploadReadyToastRef.current = false;

      const formData = new FormData();
      formData.append("video", file);
      formData.append("title", file.name);

      const response = await api.post(`/rooms/${effectiveRoomId}/media/upload`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 120000,
        onUploadProgress: (evt) => {
          if (!evt?.total) {
            setUploadProgressPct((prev) => Math.max(prev, 10));
            setUploadStatusText("Uploading media...");
            return;
          }
          const pct = Math.max(0, Math.min(95, Math.round((evt.loaded / evt.total) * 100)));
          setUploadProgressPct(pct);
          setUploadStatusText(pct >= 95 ? "Processing in cloud..." : "Uploading media...");
        },
      });

      const uploadedMedia = response?.data?.data?.media;
      if (!uploadedMedia?.videoUrl) {
        throw new Error("Invalid media upload response");
      }

      if (uploadedVideoUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(uploadedVideoUrl);
      }

      setUploadProgressPct(100);
      setUploadStatusText("Upload complete. Syncing room...");
      setUploadedVideoUrl(uploadedMedia.videoUrl);
      setMediaSource("upload");
      setIsPlaying(false);
      roomSync.broadcastMediaChange(uploadedMedia);
      roomSync.broadcastPause(0, uploadedMedia.duration || 0);

      toast.success("🎬 Video uploaded", {
        description: "Shared and loaded in paused state. Press play when everyone is ready.",
        duration: 2200,
      });
    } catch (error) {
      if (error?.code === "ECONNABORTED") {
        toast.error("Upload is taking longer than expected", {
          description: "Cloud processing timed out. Try a smaller file or retry once.",
        });
      } else {
        toast.error("Upload failed", {
          description: error?.response?.data?.message || error?.message || "Please try again.",
        });
      }
    } finally {
      setIsUploadingMedia(false);
      setUploadStatusText("Uploading media...");
      if (e.target) {
        e.target.value = "";
      }
    }
  }, [canControl, effectiveRoomId, uploadedVideoUrl, roomSync]);

  const handleYoutubeUrl = useCallback(() => {
    setShowYoutubeSearch(true);
  }, []);

  const handleSelectYoutubeVideo = useCallback((video) => {
    const nestedId = typeof video?.id === "object" ? (video.id?.videoId || "") : "";
    const rawId = nestedId || video?.videoId || (typeof video?.id === "string" ? video.id : "") || "";
    const rawUrl = video?.url || "";
    let normalizedId = String(rawId).trim();

    if (!normalizedId && rawUrl) {
      const watchMatch = rawUrl.match(/[?&]v=([^&]+)/);
      const shortMatch = rawUrl.match(/youtu\.be\/([^?&/]+)/);
      const embedMatch = rawUrl.match(/\/embed\/([^?&/]+)/);
      normalizedId = watchMatch?.[1] || shortMatch?.[1] || embedMatch?.[1] || "";
    }

    if (!normalizedId) {
      toast.error("Invalid YouTube video selection");
      return;
    }

    setYoutubeVideoId(normalizedId);
    setFallbackYoutubeVideoId(normalizedId);
    setMediaSource("youtube");
    setShowYoutubeSearch(false);
    setIsPlaying(false);
    setProgress(0);
    toast(`🎬 Loaded: ${video.title}`, {
      description: "Video is synced in paused state. Press play when everyone is ready.",
      duration: 3200,
    });
    roomSync.broadcastMediaChange({
      type: "youtube",
      videoId: normalizedId,
      title: video.title,
    });
    roomSync.broadcastPause(0, ytPlayer.duration || 0);
  }, [roomSync, ytPlayer.duration]);

  const handleToggleVideoChat = useCallback(async () => {
    if (!showVideoChat) {
      if (!webrtc.stream) {
        await webrtc.startMedia(!videoBlockedByHost, !micBlockedByHost);
      }

      // If media stream already exists from a previous session, re-enable tracks on rejoin.
      if (webrtc.stream) {
        webrtc.stream.getAudioTracks().forEach((track) => {
          track.enabled = !micBlockedByHost;
        });
        webrtc.stream.getVideoTracks().forEach((track) => {
          track.enabled = !videoBlockedByHost;
        });
      }

      setShowVideoChat(true);
      toast.success("📹 Video chat enabled", {
        description: "Your camera and mic are now active.",
        duration: 2000,
      });
    } else {
      setShowVideoChat(false);
    }
  }, [showVideoChat, webrtc, micBlockedByHost, videoBlockedByHost]);

  const handleToggleMyAudio = useCallback(() => {
    if (!showVideoChat) {
      handleToggleVideoChat();
      return;
    }

    if (!webrtc.audioEnabled && micBlockedByHost) {
      toast.error("Microphone access disabled by host", {
        duration: 2000,
      });
      return;
    }

    webrtc.toggleAudio();
    toast(webrtc.audioEnabled ? "🔇 Mic muted" : "🎤 Mic unmuted", {
      duration: 1500,
    });
  }, [showVideoChat, handleToggleVideoChat, webrtc, micBlockedByHost]);

  const handleToggleMyVideo = useCallback(() => {
    if (!showVideoChat) {
      handleToggleVideoChat();
      return;
    }

    if (!webrtc.videoEnabled && videoBlockedByHost) {
      toast.error("Camera access disabled by host", {
        duration: 2000,
      });
      return;
    }

    webrtc.toggleVideo();
  }, [showVideoChat, handleToggleVideoChat, webrtc, videoBlockedByHost]);

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
    if (targetUserId === myUserId) {
      console.warn('⚠️ Cannot change own permissions via host controls');
      return;
    }

    // Do not optimistically update participant moderation state here.
    // Wait for server ack + broadcast event to keep UI fully aligned with DB truth.

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

    if (updates.mediaControlEnabled !== undefined) {
      socket.emit(
        "room:update-participant-permissions",
        {
          roomCode: roomCode,
          targetUserId: targetUserId,
          restrictions: { mediaControlDisabledByHost: !updates.mediaControlEnabled },
        },
        (response) => {
          if (response?.success) {
            toast(
              updates.mediaControlEnabled
                ? "🎛️ Media control enabled"
                : "🚫 Media control blocked",
              { duration: 2000 }
            );
          } else {
            toast.error("Failed to update media control", { duration: 2000 });
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
            toast(`⬇️ User demoted to Guest`, { duration: 2000 });
          } else {
            toast.error(`Failed to demote user`, { duration: 2000 });
          }
        }
      );
    }
  }, [dbParticipants, roomCode, myUserId]);

  const handleRemoveParticipant = useCallback((nameOrUserId) => {
    let targetUserId = null;

    if (dbParticipants) {
      const byUserId = dbParticipants.find((p) => p.userId === nameOrUserId);
      if (byUserId) {
        targetUserId = byUserId.userId;
      } else {
        const byDisplay = dbParticipants.find((p) => p.displayName === nameOrUserId || p.username === nameOrUserId);
        if (byDisplay) targetUserId = byDisplay.userId;
      }
    }

    if (!targetUserId) {
      toast.error("Participant not found", { duration: 2000 });
      return;
    }

    socket.emit("room:remove-participant", { roomCode, targetUserId }, (response) => {
      if (response?.success) {
        setParticipants((prev) => prev.filter((p) => p.odlUserId !== targetUserId));
        toast(`Participant removed from room`, { duration: 2500 });
      } else {
        toast.error(response?.error || "Failed to remove participant", { duration: 2500 });
      }
    });
  }, [dbParticipants, roomCode]);

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
    const onPlay = () => {
      // Upload-only guard: if room authority says paused, do not allow local resumed playback.
      if (!desiredPlayingRef.current) {
        video.pause();
        setIsPlaying(false);
        return;
      }
      setIsPlaying(true);
    };
    const onPause = () => {
      setIsPlaying(false);
    };
    const onEnded = () => {
      setIsPlaying(false);
      desiredPlayingRef.current = false;
      toast("🎬 Movie finished!");
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
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
  }, [isMuted, movieVolume, mediaSource, youtubeVideoId, isPlaying, ytPlayer]);

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
      const { targetUserId, restrictions, permissions, updatedBy } = event.detail;
      console.log('[PERMISSION-UPDATED]:', { targetUserId, restrictions, permissions, updatedBy });

      // Apply restrictions immediately for current user so mic/video can't remain active.
      if (targetUserId === myUserId && webrtc.stream) {
        if (restrictions?.micDisabledByHost) {
          webrtc.stream.getAudioTracks().forEach((track) => {
            track.enabled = false;
          });
        }
        if (restrictions?.videoDisabledByHost) {
          webrtc.stream.getVideoTracks().forEach((track) => {
            track.enabled = false;
          });
        }
        if (restrictions?.mediaControlDisabledByHost) {
          toast("🎛️ Media control disabled", {
            description: "Host has disabled your play/pause/seek controls.",
            duration: 2500,
          });
        } else if (permissions?.canControl) {
          toast("🎛️ Media control enabled", {
            description: "You can now play, pause, and seek.",
            duration: 2200,
          });
        }
      }

      // Optionally show a notification if permissions were updated for other users
      if (targetUserId !== myUserId) {
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

    const handleHostChanged = (event) => {
      const { newHostId, previousHostId, reason, restored } = event.detail;
      if (!newHostId) return;

      if (newHostId === myUserId) {
        toast.success("👑 You are now the host", {
          description: restored
            ? "Your host role has been restored."
            : "You were automatically promoted due to host unavailability.",
          duration: 3000,
        });
        return;
      }

      if (previousHostId === myUserId && restored) {
        toast("ℹ️ Host role restored", {
          description: "Room creator rejoined and regained host role.",
          duration: 2500,
        });
        return;
      }

      const messagesByReason = {
        'host-disconnected': 'Host disconnected. New host was promoted.',
        'host-left': 'Host left the room. New host was promoted.',
        'original-host-rejoined': 'Original host rejoined and regained host role.',
      };

      toast("👑 Host changed", {
        description: messagesByReason[reason] || 'Host role was updated by the system.',
        duration: 2500,
      });
    };

    window.addEventListener('permission:audio-denied', handleAudioPermissionDenied);
    window.addEventListener('permission:video-denied', handleVideoPermissionDenied);
    window.addEventListener('permission:chat-denied', handleChatPermissionDenied);
    window.addEventListener('permission:updated', handlePermissionUpdated);
    window.addEventListener('permission:role-updated', handleRoleUpdated);
    window.addEventListener('room:host-changed', handleHostChanged);

    return () => {
      window.removeEventListener('permission:audio-denied', handleAudioPermissionDenied);
      window.removeEventListener('permission:video-denied', handleVideoPermissionDenied);
      window.removeEventListener('permission:chat-denied', handleChatPermissionDenied);
      window.removeEventListener('permission:updated', handlePermissionUpdated);
      window.removeEventListener('permission:role-updated', handleRoleUpdated);
      window.removeEventListener('room:host-changed', handleHostChanged);
    };
  }, [user?.id, myUserId, webrtc.stream]);

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

  const handleRequestLeave = useCallback(() => {
    setShowLeaveConfirm(true);
  }, []);

  const handleConfirmLeave = useCallback(async () => {
    if (isLeavingRoom) return;
    setIsLeavingRoom(true);
    try {
      await leaveRoom();
      toast.success("Left room successfully", { duration: 1800 });
      navigate("/movies");
    } catch (error) {
      toast.error(error?.message || "Failed to leave room", { duration: 2500 });
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
      toast.success("Room ended", { duration: 1800 });
      navigate("/movies");
    } catch (error) {
      toast.error(error?.message || "Failed to end room", { duration: 2500 });
    } finally {
      setIsLeavingRoom(false);
      setShowLeaveConfirm(false);
    }
  }, [isLeavingRoom, endRoom, navigate]);

  const handleCopyLink = useCallback(() => {
    const roomLink = `${window.location.origin}/room/${roomCode}`;
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
        guestName={guestName || user?.display_name || user?.username || "Guest"}
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
                onClick={handleRequestLeave}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                title="Leave Room"
              >
                <ChevronLeft className="w-5 h-5" />
                <span className="text-xs font-medium">Leave</span>
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
                      ) : mediaSource === "youtube" ? (
                        <Youtube className="w-2.5 h-2.5" />
                      ) : (
                        <Upload className="w-2.5 h-2.5" />
                      )}
                      {mediaSource === "screen" ? "Screen Share" : mediaSource === "youtube" ? "YouTube" : "Local Video"}
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
              {canOpenHostControls && (
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
                  title={userRole === "host" ? "Host Controls" : "Co-Host Controls"}
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
                mutedUserIds={mutedUsers}
                hiddenVideoUserIds={videoDisbldUsers}
                voiceChatVolume={voiceChatVolume}
                deafened={deafenVoiceChat}
              />
            )}
          </AnimatePresence>

          {/* Main video display */}
          <div className="flex-1 bg-black flex items-center justify-center relative cursor-pointer group overflow-hidden">
            {mediaSource === "youtube" && activeYoutubeVideoId ? (
              <div className="w-full h-full relative">
                <div ref={ytPlayer.wrapperRef} className="w-full h-full" />
                {[
                  "unstarted",
                  "buffering",
                  "unknown",
                ].includes(ytPlayer.playerState) && Number(ytPlayer.currentTime || 0) <= 0.2 && (
                  <img
                    src={`https://i.ytimg.com/vi/${activeYoutubeVideoId}/hqdefault.jpg`}
                    alt="YouTube preview"
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                  />
                )}
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
            ) : mediaSource === "screen" && screenStream ? (
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            ) : mediaSource === "upload" && uploadedVideoUrl ? (
              <video
                ref={uploadVideoRef}
                src={uploadedVideoUrl}
                playsInline
                className="w-full h-full object-contain"
                onLoadedData={() => {
                  setIsUploadMediaReady(true);
                  const video = uploadVideoRef.current;
                  const pending = pendingRemoteActionRef.current;
                  const currentMediaKey = getUploadMediaKey();

                  if (video && pending && Date.now() - pendingRemoteActionSetAtRef.current <= 7000) {
                    if (!pending.mediaKey || !currentMediaKey || pending.mediaKey === currentMediaKey) {
                      if (Number.isFinite(pending.time) && Number.isFinite(video.duration) && video.duration > 0) {
                        video.currentTime = Math.max(0, Math.min(video.duration, pending.time));
                      }

                      if (pending.type === "play") {
                        desiredPlayingRef.current = true;
                        video.play().then(() => {
                          setIsPlaying(true);
                        }).catch(() => {
                          setIsPlaying(false);
                        });
                      } else {
                        desiredPlayingRef.current = false;
                        video.pause();
                        setIsPlaying(false);
                      }
                      pendingRemoteActionRef.current = null;
                    } else {
                      pendingRemoteActionRef.current = null;
                    }
                  }

                  if (!desiredPlayingRef.current && video) {
                    video.pause();
                  }
                  if (!uploadReadyToastRef.current) {
                    uploadReadyToastRef.current = true;
                    toast("Upload is ready", {
                      description: "Playback is paused for everyone. Press play to start together.",
                      duration: 2200,
                    });
                  }
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
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
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
                      disabled={isUploadingMedia}
                      className="flex flex-row sm:flex-col items-center gap-3 sm:gap-2 p-3 sm:p-4 rounded-2xl bg-foreground/5 border border-glass-border hover:border-secondary/40 hover:bg-secondary/5 transition-all w-full sm:w-28"
                    >
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                        <Upload className="w-5 h-5 sm:w-6 sm:h-6 text-secondary" />
                      </div>
                      <div className="text-left sm:text-center">
                        <span className="text-xs font-medium text-foreground block">Upload</span>
                        <span className="text-[10px] text-muted-foreground">
                          {isUploadingMedia ? `Uploading ${uploadProgressPct}%` : "Local file"}
                        </span>
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

            {mediaSource === "upload" && !isUploadMediaReady && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 backdrop-blur-[1px] pointer-events-none">
                <div className="rounded-xl bg-black/65 border border-white/15 px-4 py-2.5 text-center">
                  <p className="text-sm text-white font-medium">Preparing uploaded video...</p>
                  <p className="text-xs text-white/70">Playback will be available in a moment</p>
                </div>
              </div>
            )}

            {isUploadingMedia && (
              <div className="absolute top-3 right-3 z-20 rounded-lg border border-white/15 bg-black/60 backdrop-blur-sm px-3 py-2 min-w-[160px]">
                <div className="flex items-center justify-between text-[11px] text-white/85 mb-1">
                  <span>{uploadStatusText}</span>
                  <span>{uploadProgressPct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
                  <div className="h-full bg-secondary transition-[width] duration-200" style={{ width: `${uploadProgressPct}%` }} />
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
                      rtcSignaling.stopBroadcastStream();
                      setMediaSource("none");
                      setIsPlaying(false);
                      roomSync.broadcastMediaChange({ type: "none" });
                    } else if (mediaSource === "youtube") {
                      ytPlayer.destroyPlayer();
                      setYoutubeVideoId(null);
                      setMediaSource("none");
                      setShowYoutubeSearch(true);
                    } else if (mediaSource === "upload") {
                      if (uploadedVideoUrl?.startsWith("blob:")) {
                        URL.revokeObjectURL(uploadedVideoUrl);
                      }
                      setUploadedVideoUrl(null);
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
                  {mediaSource !== "none" && (
                    <>
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
                    </>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsMuted(!isMuted)}
                    className="h-8 w-8"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </Button>
                  {mediaSource !== "none" && (
                    <span className="text-xs text-muted-foreground ml-1">
                      {formatTime(progress)} / {totalDuration}
                    </span>
                  )}
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
                      disabled={isUploadingMedia}
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
                        onClick={handleToggleMyAudio}
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
                        onClick={handleToggleMyVideo}
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
        <AnimatePresence>
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
                      .filter(p => p.userId !== myUserId)
                      .map(p => {
                        const displayName = p.displayName || p.username || "User";
                        const userMuted = mutedUsers.has(p.userId) || deafenVoiceChat;
                        const videoDisabled = videoDisbldUsers.has(p.userId);
                        const restrictedByHost = p.restrictions || {};
                        
                        // Check actual remote stream state
                        const remoteStream = meshStreams.remoteStreams.get(p.userId);
                        const remoteAudioEnabled = remoteStream ? remoteStream.getAudioTracks().some(t => t.enabled) : true;
                        const remoteVideoEnabled = remoteStream ? remoteStream.getVideoTracks().some(t => t.enabled) : false;
                        
                        // Show status based on both host control AND remote state
                        const statusParts = [];
                        if (restrictedByHost.micDisabledByHost) statusParts.push("Mic blocked by host");
                        if (restrictedByHost.videoDisabledByHost) statusParts.push("Video blocked by host");
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
                          : micBlockedByHost
                          ? "Mic blocked by host"
                          : webrtc.audioEnabled
                          ? "Mic active"
                          : "Mic muted"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {!showVideoChat
                          ? "Enable video chat to use mic"
                          : micBlockedByHost
                          ? "Host must re-enable your microphone"
                          : webrtc.audioEnabled
                          ? "Others can hear you"
                          : "Others can't hear you"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={showVideoChat && webrtc.audioEnabled ? "secondary" : "outline"}
                      onClick={handleToggleMyAudio}
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
          {showHostControls && canOpenHostControls && !showMixer && !showChat && !lightsOff && (
            <HostControlsPanel
              key="host-controls"
              open={showHostControls}
              onClose={() => setShowHostControls(false)}
              participants={participants}
              onUpdateParticipant={handleUpdateParticipant}
              onRemoveParticipant={handleRemoveParticipant}
              roomSettings={roomSettings}
              onUpdateSettings={handleUpdateSettings}
              isHost={userRole === "host"}
              hideVideoControls={false}
              panelTheme="movie"
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

      {/* Leave/End room confirmation */}
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
                <Button
                  variant="ghost"
                  onClick={() => setShowLeaveConfirm(false)}
                  disabled={isLeavingRoom}
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={handleConfirmLeave}
                  disabled={isLeavingRoom}
                >
                  {isLeavingRoom ? "Leaving..." : "Leave Room"}
                </Button>
                {isHost && (
                  <Button
                    variant="destructive"
                    onClick={handleConfirmEndRoom}
                    disabled={isLeavingRoom}
                  >
                    End Room
                  </Button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MovieRoom;