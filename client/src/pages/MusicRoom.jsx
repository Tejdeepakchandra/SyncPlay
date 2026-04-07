import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat,
  MessageSquare, Music, ListMusic, Sliders, Settings,
  Heart, Bookmark, Smile, Headphones, VolumeX, Search,
  Eye, ChevronLeft, Send, Link2, Volume2
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// Hooks
import { useRoom } from "@/hooks/useRoom";
import { useRoomChat } from "@/hooks/useRoomChat";
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer";
import { useParticipantStates } from "@/hooks/useParticipantStates";

// Components
import RoomAccessGate from "@/components/RoomAccessGate";
import HostControlsPanel from "@/components/HostControlsPanel";
import RoomInfoBar from "@/components/RoomInfoBar";
import GuestNameDialog from "@/components/GuestNameDialog";
import WaitingAreaDialog from "@/components/WaitingAreaDialog";
import JoinRequestNotification from "@/components/JoinRequestNotification";
import AudioBubble from "@/components/AudioBubble";
import UpNextQueue from "@/components/UpNextQueue";
import TrackEndedOverlay from "@/components/TrackEndedOverlay";
import MusicSourcePicker from "@/components/MusicSourcePicker";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

const reactionEmojis = ["🔥", "🎵", "💜", "👏", "🎧", "🤩"];

const MusicRoom = () => {
  const navigate = useNavigate();
  const { roomCode } = useParams();
  const { user, clerkUser } = useAuth();

  // Room data from backend
  const {
    room,
    participants: dbParticipants,
    isHost,
    accessStatus,
    joinStatus,
    joinRequests,
    waitingUsers,
    joinAsGuest,
    acceptJoinRequest,
    rejectJoinRequest
  } = useRoom(roomCode);
  const { messages, sendMessage } = useRoomChat(roomCode);
  
  // Participant audio states
  const { participantStates, participantActivity, broadcastAudioState, broadcastActivityLevel } = useParticipantStates(roomCode);

  // Local state
  const [guestNameSubmitted, setGuestNameSubmitted] = useState(false);
  const [isJoiningAsGuest, setIsJoiningAsGuest] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showHostControls, setShowHostControls] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [participants, setParticipants] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showUpNext, setShowUpNext] = useState(false);
  const [trackProgress, setTrackProgress] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [musicVolume, setMusicVolume] = useState(80);
  const [voiceChatVolume, setVoiceChatVolume] = useState(60);
  const [audioActive, setAudioActive] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("off"); // off, one, all
  const [showMusicPicker, setShowMusicPicker] = useState(true);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showYoutubeSearch, setShowYoutubeSearch] = useState(false);
  const [trackEnded, setTrackEnded] = useState(false);
  const [showAudioBubbles, setShowAudioBubbles] = useState(false);

  // Audio refs
  const chatEndRef = useRef(null);
  const reactionIdRef = useRef(0);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  // YouTube player for music (hidden)
  const ytPlayer = useYouTubePlayer({
    videoId: currentTrack?.videoId,
    onStateChange: (state) => {
      setIsPlaying(state === "playing");
      if (state === "ended") {
        // Track ended - show overlay
        setTrackEnded(true);
      }
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

  // Determine user role
  const userRole = isHost ? "host" : (dbParticipants?.find(p => p.userId === user?.id)?.role || "guest");
  const canControl = userRole === "host" || userRole === "co-host";

  // Build participants list
  useEffect(() => {
    const list = [];
    if (clerkUser) {
      list.push({
        name: clerkUser.firstName || clerkUser.username || "You",
        emoji: "🎧",
        speaking: false,
        role: isHost ? "host" : "participant",
        audioEnabled: audioActive,
        username: clerkUser.username || "",
        isOnline: true,
        userId: user?.id,
      });
    }

    if (dbParticipants && dbParticipants.length > 0) {
      dbParticipants.forEach(p => {
        if (p.userId === user?.id) return;
        list.push({
          name: p.displayName || "User",
          emoji: "🎧",
          speaking: false,
          role: p.role || "guest",
          audioEnabled: true,
          username: p.username || "",
          isOnline: true,
          userId: p.userId,
        });
      });
    }
    setParticipants(list);
  }, [dbParticipants, clerkUser, user?.id, isHost, audioActive]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle mobile detection
  useEffect(() => {
    const isMobileView = window.innerWidth < 768;
    setIsMobile(isMobileView);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Playback controls
  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      ytPlayer.pause();
    } else {
      ytPlayer.play();
    }
  }, [isPlaying, ytPlayer]);

  const playNext = useCallback(() => {
    if (queue.length > 0) {
      const nextTrack = queue[0];
      setCurrentTrack(nextTrack);
      setQueue(queue.slice(1));
      setShowUpNext(false);
    }
  }, [queue]);

  const playPrevious = useCallback(() => {
    ytPlayer.seekToStart();
    setIsPlaying(true);
  }, [ytPlayer]);

  const handleSkip = useCallback((direction) => {
    const percentage = direction === "forward" ? trackProgress + 5 : Math.max(0, trackProgress - 5);
    ytPlayer.seekToPercent(percentage);
  }, [trackProgress, ytPlayer]);

  const toggleShuffle = useCallback(() => {
    setShuffle(!shuffle);
  }, [shuffle]);

  const cycleRepeat = useCallback(() => {
    const nextRepeat = repeat === "off" ? "all" : repeat === "all" ? "one" : "off";
    setRepeat(nextRepeat);
  }, [repeat]);

  const handleAddReaction = useCallback((emoji) => {
    const id = reactionIdRef.current++;
    const randomX = 20 + Math.random() * 60;
    setFloatingReactions(prev => [...prev, { id, emoji, x: randomX }]);
    setTimeout(() => {
      setFloatingReactions(prev => prev.filter(r => r.id !== id));
    }, 2000);
  }, []);

  const closeAllPanels = useCallback(() => {
    setShowChat(false);
    setShowHostControls(false);
    setShowMixer(false);
    setShowPlaylist(false);
  }, []);

  const handleSendMessage = useCallback(() => {
    if (chatMessage.trim()) {
      sendMessage(chatMessage);
      setChatMessage("");
    }
  }, [chatMessage, sendMessage]);

  // Access control handling
  if (accessStatus === "loading") {
    return <RoomAccessGate accessStatus="loading" />;
  }

  if (accessStatus !== "granted") {
    return <RoomAccessGate accessStatus={accessStatus} />;
  }

  // Guest wait flow
  if (!isJoiningAsGuest && !user && joinStatus !== "joined") {
    return (
      <GuestNameDialog
        roomCode={roomCode}
        onSubmit={(name) => {
          setGuestNameSubmitted(true);
          setIsJoiningAsGuest(true);
          joinAsGuest(name);
        }}
      />
    );
  }

  // Show waiting area for private rooms
  if (joinStatus === "waiting_for_approval") {
    return <WaitingAreaDialog roomCode={roomCode} roomName={room?.name} />;
  }

  return (
    <div
      ref={containerRef}
      className="h-screen bg-background flex flex-col transition-colors duration-700 overflow-hidden"
    >
      {/* Join Request Notifications for Host */}
      {isHost && joinRequests.length > 0 && (
        <JoinRequestNotification
          joinRequests={joinRequests}
          onAccept={acceptJoinRequest}
          onReject={rejectJoinRequest}
          isHost={isHost}
        />
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
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
        className="glass-nav px-4 py-3 flex items-center justify-between z-30 relative"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/music")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-display text-sm font-semibold text-foreground">
              {currentTrack?.title || "Music Room"}
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {participants.length} listening · Room {roomCode?.slice(0, 6)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 relative">
          {(room?.participantCount || participants.length) > 0 && (
            <RoomInfoBar
              roomId={roomCode}
              roomType="music"
              host={participants.find(p => p.role === "host")?.name || participants[0]?.name || "Host"}
              participantCount={room?.participantCount || participants.length}
              isHost={isHost}
            />
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              closeAllPanels();
              setShowPlaylist(!showPlaylist);
            }}
            className={showPlaylist ? "text-primary" : "text-muted-foreground"}
            title="Queue"
          >
            <ListMusic className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              closeAllPanels();
              setShowChat(!showChat);
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
              closeAllPanels();
              setShowMixer(!showMixer);
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
                closeAllPanels();
                setShowHostControls(!showHostControls);
              }}
              className={showHostControls ? "text-primary" : "text-muted-foreground"}
              title="Host Controls"
            >
              <Settings className="w-4 h-4" />
            </Button>
          )}
        </div>
      </motion.header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Music area */}
        <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
          {/* Background effects */}
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-b from-secondary/5 via-background to-background" />
            {currentTrack && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-secondary/8 blur-3xl" />
            )}
          </div>

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full w-full px-4">
            {!currentTrack ? (
              // No track - show source picker
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center gap-6 p-8 text-center"
              >
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Music className="w-8 h-8 text-muted-foreground/30" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-foreground mb-2">
                    Choose Music Source
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Select a music source to start your session
                  </p>
                </div>
                <div className="flex gap-3 flex-col">
                  <Button
                    className="gradient-music text-secondary-foreground h-10 px-6"
                    onClick={() => setShowYoutubeSearch(true)}
                  >
                    <Music className="w-5 h-5 mr-2" />
                    YouTube Music
                  </Button>
                  <Button variant="outline" className="border-glass-border h-10 px-6">
                    <SkipForward className="w-5 h-5 mr-2" />
                    Upload Audio
                  </Button>
                </div>
              </motion.div>
            ) : (
              // Track active - show player view
              <>
                {/* Album art with glow */}
                {currentTrack.thumbnail && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, rotate: -5 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    transition={{ duration: 0.4 }}
                    className="w-40 h-40 md:w-72 md:h-72 rounded-3xl overflow-hidden shadow-2xl mb-6 relative"
                    style={{
                      boxShadow: "0 30px 60px -15px hsl(var(--secondary) / 0.3)"
                    }}
                  >
                    <img
                      src={currentTrack.thumbnail}
                      alt={currentTrack.title}
                      className="w-full h-full object-cover"
                    />
                  </motion.div>
                )}

                {/* Track info */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center mb-4 md:mb-6 w-full"
                >
                  <h2 className="font-display text-base md:text-2xl font-bold text-foreground line-clamp-2 mb-1">
                    {currentTrack.title}
                  </h2>
                  <p className="text-muted-foreground text-xs md:text-sm">
                    {currentTrack.artist || currentTrack.channel}
                  </p>
                </motion.div>

                {/* Waveform visualizer */}
                <div className="w-full flex items-end justify-center gap-[2px] h-8 md:h-12 mb-2 md:mb-4">
                  {Array.from({ length: 48 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="w-1 rounded-full bg-secondary/60"
                      animate={{
                        height: isPlaying
                          ? [
                              `${20 + Math.sin(i * 0.5 + Date.now() / 100) * 25}%`,
                              `${40 + Math.cos(i * 0.3 + Date.now() / 100) * 30}%`,
                              `${15 + Math.sin(i * 0.7 + Date.now() / 100) * 20}%`,
                            ]
                          : "15%",
                      }}
                      transition={{
                        duration: isPlaying ? 0.5 : 0,
                        repeat: Infinity,
                      }}
                    />
                  ))}
                </div>

                {/* Progress bar */}
                <div className="w-full max-w-sm mb-2">
                  <div className="relative h-1.5 bg-muted rounded-full cursor-pointer group">
                    <div
                      className="absolute inset-y-0 left-0 gradient-music rounded-full transition-all"
                      style={{ width: `${(trackProgress / trackDuration) * 100}%` }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-secondary opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{
                        left: `${(trackProgress / trackDuration) * 100}%`,
                        transform: "translateX(-50%)",
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                    <span>
                      {Math.floor(trackProgress / 60)}:{String(Math.floor(trackProgress % 60)).padStart(2, "0")}
                    </span>
                    <span>
                      {Math.floor(trackDuration / 60)}:{String(Math.floor(trackDuration % 60)).padStart(2, "0")}
                    </span>
                  </div>
                </div>

                {/* Playback controls */}
                <div className="flex items-center justify-center gap-3 md:gap-4 mb-6">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={toggleShuffle}
                    className={shuffle ? "text-secondary" : "text-muted-foreground"}
                  >
                    <Shuffle className="w-5 h-5" />
                  </Button>

                  <Button
                    size="icon"
                    onClick={playPrevious}
                    variant="ghost"
                    className="text-foreground"
                  >
                    <SkipBack className="w-5 h-5" />
                  </Button>

                  <Button
                    onClick={togglePlayPause}
                    className="gradient-music text-secondary-foreground rounded-full h-12 w-12 md:h-14 md:w-14 shadow-lg"
                  >
                    {isPlaying ? (
                      <Pause className="w-6 h-6" />
                    ) : (
                      <Play className="w-6 h-6 ml-0.5" />
                    )}
                  </Button>

                  <Button
                    size="icon"
                    onClick={playNext}
                    variant="ghost"
                    className="text-foreground"
                  >
                    <SkipForward className="w-5 h-5" />
                  </Button>

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={cycleRepeat}
                    className={repeat !== "off" ? "text-secondary" : "text-muted-foreground"}
                  >
                    <Repeat className="w-5 h-5" />
                    {repeat === "one" && (
                      <span className="absolute text-[10px] font-bold bottom-0.5">1</span>
                    )}
                  </Button>
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-between w-full max-w-sm gap-3">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsLiked(!isLiked)}
                    className={isLiked ? "text-destructive" : "text-muted-foreground"}
                  >
                    <Heart className={`w-5 h-5 ${isLiked ? "fill-current" : ""}`} />
                  </Button>

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsBookmarked(!isBookmarked)}
                    className={isBookmarked ? "text-secondary" : "text-muted-foreground"}
                  >
                    <Bookmark className={`w-5 h-5 ${isBookmarked ? "fill-current" : ""}`} />
                  </Button>

                  {/* Reaction picker */}
                  <div className="relative">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setShowReactionPicker(!showReactionPicker)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Smile className="w-5 h-5" />
                    </Button>
                    <AnimatePresence>
                      {showReactionPicker && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 glass-panel px-2 py-1.5 flex items-center gap-1"
                        >
                          {reactionEmojis.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => {
                                handleAddReaction(emoji);
                                setShowReactionPicker(false);
                              }}
                              className="text-lg hover:scale-125 transition-transform p-1"
                            >
                              {emoji}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setAudioActive(!audioActive)}
                    className={audioActive ? "text-secondary" : "text-muted-foreground"}
                  >
                    {audioActive ? (
                      <Headphones className="w-5 h-5" />
                    ) : (
                      <VolumeX className="w-5 h-5" />
                    )}
                  </Button>
                </div>

                {/* Track ended overlay */}
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
                        setShowMusicPicker(true);
                      }}
                      onChangeSource={() => {
                        setCurrentTrack(null);
                        setTrackEnded(false);
                        setShowMusicPicker(true);
                      }}
                    />
                  )}
                </AnimatePresence>

                {/* Up Next queue */}
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
              </>
            )}

            {/* Audio bubbles (participant speakers around the player) */}
            {currentTrack && (
              <div className="absolute inset-0 pointer-events-none">
                {/* Top-left */}
                {participants[1] && (
                  <div className="absolute top-12 left-6 md:top-16 md:left-8 pointer-events-auto">
                    <AudioBubble 
                      participant={participants[1]} 
                      speaking={participantStates[participants[1]?.id]?.isSpeaking || false}
                    />
                  </div>
                )}
                {/* Top-right */}
                {participants[2] && (
                  <div className="absolute top-12 right-6 md:top-16 md:right-8 pointer-events-auto">
                    <AudioBubble 
                      participant={participants[2]} 
                      speaking={participantStates[participants[2]?.id]?.isSpeaking || false}
                    />
                  </div>
                )}
                {/* Bottom-left */}
                {participants[3] && (
                  <div className="absolute bottom-20 left-6 md:bottom-24 md:left-8 pointer-events-auto">
                    <AudioBubble 
                      participant={participants[3]} 
                      speaking={participantStates[participants[3]?.id]?.isSpeaking || false}
                    />
                  </div>
                )}
                {/* Bottom-right */}
                {participants[4] && (
                  <div className="absolute bottom-20 right-6 md:bottom-24 md:right-8 pointer-events-auto">
                    <AudioBubble 
                      participant={participants[4]} 
                      speaking={participantStates[participants[4]?.id]?.isSpeaking || false}
                    />
                  </div>
                )}
                {/* Mid-left */}
                {participants[5] && (
                  <div className="absolute left-6 md:left-8 top-1/2 -translate-y-1/2 pointer-events-auto">
                    <AudioBubble 
                      participant={participants[5]} 
                      speaking={participantStates[participants[5]?.id]?.isSpeaking || false}
                    />
                  </div>
                )}
                {/* Mid-right */}
                {participants[6] && (
                  <div className="absolute right-6 md:right-8 top-1/2 -translate-y-1/2 pointer-events-auto">
                    <AudioBubble 
                      participant={participants[6]} 
                      speaking={participantStates[participants[6]?.id]?.isSpeaking || false}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Side panels */}
        <AnimatePresence>
          {showPlaylist && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: isMobile ? "100%" : 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="bg-card/90 backdrop-blur-sm border-l border-glass-border overflow-hidden flex flex-col"
            >
              <div className="p-3 border-b border-glass-border">
                <h3 className="text-sm font-semibold text-foreground">
                  Queue · {queue.length} tracks
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {queue.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-8">
                    <Music className="w-8 h-8 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">No tracks in queue</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-glass-border h-7 text-xs"
                      onClick={() => setShowYoutubeSearch(true)}
                    >
                      Add Music
                    </Button>
                  </div>
                ) : (
                  queue.map((track, idx) => (
                    <div
                      key={idx}
                      className="w-full p-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
                    >
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted/40 flex-shrink-0">
                        {track.thumbnail ? (
                          <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <Music className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground line-clamp-2">
                          {track.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {track.artist || track.channel}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {showChat && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: isMobile ? "100%" : 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="bg-card/90 backdrop-blur-sm border-l border-glass-border overflow-hidden flex flex-col"
            >
              <div className="p-3 border-b border-glass-border">
                <h3 className="text-sm font-semibold text-foreground">Live Chat</h3>
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
              <div className="p-3 border-t border-glass-border flex items-center gap-2">
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

          {showMixer && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: isMobile ? "100%" : 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="bg-card/90 backdrop-blur-sm border-l border-glass-border overflow-hidden flex flex-col"
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
                    disabled={!audioActive}
                  />
                </div>

                {/* Individual user volumes */}
                <div className="border-t border-glass-border pt-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Participants
                  </p>
                  {participants.filter(p => p.userId !== user?.id).map((p) => (
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
                      >
                        <Volume2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {showHostControls && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: isMobile ? "100%" : 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
            >
              <HostControlsPanel
                participants={participants}
                onMuteParticipant={() => {}}
                onRemoveParticipant={() => {}}
                onPromoteParticipant={() => {}}
                hideVideoControls={true}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default MusicRoom;