import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Crown, ShieldCheck } from "lucide-react";

const bubblePositions = [
  { bottom: "90px", right: "20px" },
  { top: "80px", left: "20px" },
  { top: "80px", right: "20px" },
  { bottom: "90px", left: "20px" },
  { top: "50%", left: "20px" },
  { top: "50%", right: "20px" },
];

const StreamCircle = ({ stream, mirrored = false, muted = false, fallbackEmoji = "🧑" }) => {
  const videoRef = useRef(null);
  const [isVideoRendering, setIsVideoRendering] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    if (!stream) {
      console.log(`[StreamCircle] No stream provided`);
      setIsVideoRendering(false);
      setVideoFailed(false);
      return;
    }

    console.log(`[StreamCircle] Setting up stream`, {
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
    });

    const setupStream = async () => {
      if (!videoRef.current || !stream) {
        console.log(`[StreamCircle] Missing videoRef or stream`);
        setIsVideoRendering(false);
        setVideoFailed(false);
        return;
      }

      try {
        console.log(`[StreamCircle] Assigning srcObject to video element`);
        videoRef.current.srcObject = stream;
        // Explicitly ensure muted is set (for autoplay policy)
        videoRef.current.muted = muted;
        
        // Check if stream has at least one video track
        const videoTracks = stream.getVideoTracks();
        console.log(`[StreamCircle] Video tracks found: ${videoTracks.length}`, 
          videoTracks.map(t => ({ enabled: t.enabled, muted: t.muted, readyState: t.readyState }))
        );
        
        if (videoTracks.length > 0 && videoTracks.some(t => t.enabled)) {
          console.log(`[StreamCircle] Attempting to play video (readyState=${videoRef.current.readyState})`);
          
          // Try to play the video
          try {
            await videoRef.current.play();
            setIsVideoRendering(true);
            setVideoFailed(false);
            console.log(`[StreamCircle] ✅ Video playing successfully`);
          } catch (playErr) {
            console.warn(`[StreamCircle] Autoplay blocked (will retry when ready):`, playErr.name);
            // Autoplay failure is expected - will retry when metadata loads
            setIsVideoRendering(false);
            setVideoFailed(false);
          }
        } else {
          console.warn(`[StreamCircle] ⚠️ No enabled video tracks in stream`);
          setIsVideoRendering(false);
          setVideoFailed(false);
        }
      } catch (err) {
        console.error(`[StreamCircle] ❌ Stream setup failed:`, err);
        setIsVideoRendering(false);
        setVideoFailed(false);
      }
    };
    
    setupStream();

    // Re-setup if stream changes
    return () => {
      console.log(`[StreamCircle] Cleaning up stream`);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream]);

  // Add click to unmute video if needed
  const handleVideoClick = () => {
    if (videoRef.current) {
      console.log(`[StreamCircle] Video clicked - attempting play`);
      videoRef.current.play().then(() => {
        setIsVideoRendering(true);
        setVideoFailed(false);
      }).catch(e => {
        console.warn(`[StreamCircle] Click-to-play failed:`, e.name);
        // Still don't mark as failed - user can try clicking again
      });
    }
  };

  // Retry playing when metadata loads (for muted autoplay which browsers allow)
  const handleMetadataLoaded = () => {
    console.log(`[StreamCircle] Video loadedmetadata event fired - retrying play`);
    if (videoRef.current) {
      // Small delay to ensure video decoding has started
      setTimeout(() => {
        if (videoRef.current && videoRef.current.paused) {
          console.log(`[StreamCircle] Video still paused after metadata, retrying play...`);
          videoRef.current.play().then(() => {
            console.log(`[StreamCircle] ✅ Video autoplay with muted succeeded`);
            setIsVideoRendering(true);
            setVideoFailed(false);
          }).catch((err) => {
            console.warn(`[StreamCircle] Muted autoplay still blocked:`, err.name);
          });
        }
      }, 100);
    }
  };

  return (
    <div className="absolute inset-0 w-full h-full rounded-full overflow-hidden">
      {!videoFailed ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          onClick={handleVideoClick}
          className="absolute inset-0 w-full h-full object-cover rounded-full cursor-pointer bg-black"
          style={mirrored ? { transform: "scaleX(-1)" } : undefined}
          onPlay={() => {
            console.log(`[StreamCircle] Video onPlay event fired`);
            setIsVideoRendering(true);
            setVideoFailed(false);
          }}
          onPlaying={() => {
            console.log(`[StreamCircle] Video onPlaying event fired - frames are rendering`);
            setIsVideoRendering(true);
            setVideoFailed(false);
          }}
          onLoadedMetadata={handleMetadataLoaded}
          onError={() => {
            console.error(`[StreamCircle] ❌ Video error - showing emoji fallback`);
            setVideoFailed(true);
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-muted/80 backdrop-blur-sm flex items-center justify-center rounded-full">
          <span className="text-2xl md:text-3xl">{fallbackEmoji}</span>
        </div>
      )}
    </div>
  );
};

const HiddenAudio = ({ stream }) => {
  const audioRef = useRef(null);
  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch(() => {});
    }
  }, [stream]);
  return <audio ref={audioRef} autoPlay style={{ display: "none" }} />;
};

const FloatingParticipantBubbles = ({
  participants,
  localStream,
  localVideoEnabled,
  localAudioEnabled,
  remoteStreams,
  deafened = false,
}) => {
  // Log stream availability
  useEffect(() => {
    console.log(`[FloatingParticipantBubbles] Current state:`, {
      participantCount: participants?.length || 0,
      hasLocalStream: !!localStream,
      localVideoEnabled,
      remoteStreamsCount: remoteStreams?.size || 0,
      remoteStreamIds: Array.from(remoteStreams?.keys() || []),
    });
  }, [participants, localStream, localVideoEnabled, remoteStreams]);

  return (
    <>
      {participants.map((p, i) => {
        const isLocal = p.isLocalUser === true;
        const hasVideo = isLocal ? localVideoEnabled : p.videoEnabled;
        const hasAudio = isLocal ? localAudioEnabled : p.audioEnabled;
        const pos = bubblePositions[i % bubblePositions.length];
        const size = isLocal ? "w-16 h-16 md:w-20 md:h-20" : "w-12 h-12 md:w-16 md:h-16";
        const isOnline = p.isOnline !== false;
        const displayName = p.name.replace(" (Host)", "");

        // Get remote stream if this is a remote participant
        const remoteStream = !isLocal && p.odlUserId ? remoteStreams?.get(p.odlUserId) : undefined;
        const remoteHasVideoTracks = remoteStream ? remoteStream.getVideoTracks().length > 0 : false;
        const remoteVideoEnabled = remoteStream ? remoteStream.getVideoTracks().some(t => t.enabled) : false;
        
        // Show video if: local user with enabled video, OR remote stream exists with video tracks
        const shouldShowVideo = isLocal ? (localStream && hasVideo) : (remoteStream && remoteHasVideoTracks);

        if (!isLocal && p.odlUserId) {
          console.log(`[FloatingParticipantBubbles] ${displayName} (${p.odlUserId}):`, {
            hasRemoteStream: !!remoteStream,
            videoTracks: remoteHasVideoTracks ? remoteStream.getVideoTracks().length : 0,
            shouldShowVideo,
            reason: !remoteStream ? "No remoteStream" : !remoteHasVideoTracks ? "No video tracks" : "Ready to show",
          });
        }

        return (
          <motion.div
            key={`${p.odlUserId}-${i}`}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ delay: i * 0.08, type: "spring", stiffness: 300, damping: 20 }}
            className={`absolute z-20 ${size} rounded-full overflow-hidden cursor-pointer group`}
            style={{
              ...pos,
              boxShadow: p.speaking
                ? "0 0 0 3px hsl(var(--secondary)), 0 0 20px hsl(var(--secondary) / 0.4)"
                : "0 0 0 2px hsl(var(--background) / 0.6), 0 4px 12px rgba(0,0,0,0.5)",
            }}
            title={`${displayName}${p.role === "host" ? " — Host" : p.role === "co-host" ? " — Co-Host" : ""}${p.speaking ? " (speaking)" : ""}`}
          >
            {shouldShowVideo ? (
              isLocal ? (
                <StreamCircle stream={localStream} mirrored muted fallbackEmoji={p.emoji} />
              ) : (
                <StreamCircle stream={remoteStream} muted={true} fallbackEmoji={p.emoji} />
              )
            ) : (
              <div className="absolute inset-0 bg-muted/80 backdrop-blur-sm flex items-center justify-center rounded-full">
                <span className={isLocal ? "text-2xl md:text-3xl" : "text-lg md:text-2xl"}>{p.emoji}</span>
              </div>
            )}

            {!isLocal && remoteStream && !remoteVideoEnabled && !deafened && (
              <HiddenAudio stream={remoteStream} />
            )}

            <div className={`absolute top-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-card ${
              isOnline ? "bg-green-500" : "bg-muted-foreground/50"
            }`} />

            {p.role === "host" && (
              <div className="absolute -top-0.5 -left-0.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center border border-card">
                <Crown className="w-2.5 h-2.5 text-primary-foreground" />
              </div>
            )}
            {p.role === "co-host" && (
              <div className="absolute -top-0.5 -left-0.5 w-5 h-5 rounded-full bg-accent flex items-center justify-center border border-card">
                <ShieldCheck className="w-2.5 h-2.5 text-accent-foreground" />
              </div>
            )}

            <AnimatePresence>
              {p.speaking && hasAudio && (
                <motion.div
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute inset-0 rounded-full border-2 border-secondary pointer-events-none"
                />
              )}
            </AnimatePresence>

            <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-card/90 backdrop-blur flex items-center justify-center border border-glass-border">
              {hasAudio ? (
                <Mic className="w-2.5 h-2.5 text-secondary" />
              ) : (
                <MicOff className="w-2.5 h-2.5 text-destructive" />
              )}
            </div>
          </motion.div>
        );
      })}
    </>
  );
};

export default FloatingParticipantBubbles;