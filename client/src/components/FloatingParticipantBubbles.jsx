import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, Crown, ShieldCheck } from "lucide-react";
import DraggableVideoBubble from "./DraggableVideoBubble";

const DEBUG_MEDIA_LOGS = false;
const dbg = (...args) => {
  if (DEBUG_MEDIA_LOGS) {
    // eslint-disable-next-line no-console
  }
};

// Default initial positions in pixels (from container top-left)
const getDefaultBubblePosition = (index, containerWidth = 800, containerHeight = 600) => {
  const positions = [
    { x: containerWidth - 84, y: containerHeight - 154 },
    { x: 20, y: 80 },
    { x: containerWidth - 84, y: 80 },
    { x: 20, y: containerHeight - 154 },
    { x: 20, y: Math.round(containerHeight / 2) - 32 },
    { x: containerWidth - 84, y: Math.round(containerHeight / 2) - 32 },
  ];
  return positions[index % positions.length];
};

const hasLiveEnabledVideoTrack = (stream) => {
  if (!stream) return false;
  return stream.getVideoTracks().some((t) => t.enabled && t.readyState === "live");
};

const StreamCircle = ({ stream, mirrored = false, muted = false, fallbackEmoji = "🧑" }) => {
  const videoRef = useRef(null);
  const [isVideoRendering, setIsVideoRendering] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [, setTrackStateVersion] = useState(0);

  useEffect(() => {
    if (!stream) {
      dbg(`[StreamCircle] No stream provided`);
      setIsVideoRendering(false);
      setVideoFailed(false);
      return;
    }

    dbg(`[StreamCircle] Setting up stream`, {
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
    });

    const setupStream = async () => {
      if (!videoRef.current || !stream) {
        dbg(`[StreamCircle] Missing videoRef or stream`);
        setIsVideoRendering(false);
        setVideoFailed(false);
        return;
      }

      try {
        dbg(`[StreamCircle] Assigning srcObject to video element`);
        videoRef.current.srcObject = stream;
        // Explicitly ensure muted is set (for autoplay policy)
        videoRef.current.muted = muted;
        
        // Check if stream has at least one video track
        const videoTracks = stream.getVideoTracks();
        dbg(`[StreamCircle] Video tracks found: ${videoTracks.length}`, 
          videoTracks.map(t => ({ enabled: t.enabled, muted: t.muted, readyState: t.readyState }))
        );
        
        if (videoTracks.length > 0 && videoTracks.some((t) => t.enabled && t.readyState === "live")) {
          dbg(`[StreamCircle] Attempting to play video (readyState=${videoRef.current.readyState})`);
          
          // Try to play the video
          try {
            await videoRef.current.play();
            setIsVideoRendering(true);
            setVideoFailed(false);
            dbg(`[StreamCircle] Video playing successfully`);
          } catch (playErr) {
            dbg(`[StreamCircle] Autoplay blocked (will retry when ready):`, playErr?.name);
            // Autoplay failure is expected - will retry when events fire
            setIsVideoRendering(false);
            setVideoFailed(false);
            
            // Fallback: retry after 500ms if no events have fired
            setTimeout(() => {
              if (videoRef.current && videoRef.current.paused) {
                dbg(`[StreamCircle] Timeout fallback: retrying play after 500ms`);
                videoRef.current.play().catch(() => {});
              }
            }, 500);
          }
        } else {
          // Audio-only or not-yet-live video is normal; avoid noisy warnings.
          setIsVideoRendering(false);
          setVideoFailed(false);
        }
      } catch (err) {
        dbg(`[StreamCircle] Stream setup failed:`, err);
        setIsVideoRendering(false);
        setVideoFailed(false);
      }
    };
    
    setupStream();

    // Keep rendering state in sync with runtime track transitions (mute/unmute/ended).
    const bump = () => setTrackStateVersion((v) => v + 1);
    const onTrackStateChange = () => {
      const streamHasLiveVideo = hasLiveEnabledVideoTrack(stream);
      if (!streamHasLiveVideo) {
        setIsVideoRendering(false);
      }
      bump();
    };

    const tracks = stream.getVideoTracks();
    tracks.forEach((track) => {
      track.addEventListener("mute", onTrackStateChange);
      track.addEventListener("unmute", onTrackStateChange);
      track.addEventListener("ended", onTrackStateChange);
    });

    const onAddTrack = onTrackStateChange;
    const onRemoveTrack = onTrackStateChange;
    stream.addEventListener("addtrack", onAddTrack);
    stream.addEventListener("removetrack", onRemoveTrack);

    const onVisibilityChange = () => {
      if (!document.hidden && videoRef.current && hasLiveEnabledVideoTrack(stream)) {
        videoRef.current.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Re-setup if stream changes
    return () => {
      dbg(`[StreamCircle] Cleaning up stream`);
      tracks.forEach((track) => {
        track.removeEventListener("mute", onTrackStateChange);
        track.removeEventListener("unmute", onTrackStateChange);
        track.removeEventListener("ended", onTrackStateChange);
      });
      stream.removeEventListener("addtrack", onAddTrack);
      stream.removeEventListener("removetrack", onRemoveTrack);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream, muted]);

  // Add click to unmute video if needed
  const handleVideoClick = () => {
    if (videoRef.current) {
      dbg(`[StreamCircle] Video clicked - attempting play`);
      videoRef.current.play().then(() => {
        setIsVideoRendering(true);
        setVideoFailed(false);
      }).catch(e => {
        dbg(`[StreamCircle] Click-to-play failed:`, e?.name);
        // Still don't mark as failed - user can try clicking again
      });
    }
  };

  // Retry playing when metadata loads (for muted autoplay which browsers allow)
  const handleMetadataLoaded = () => {
    dbg(`[StreamCircle] Video loadedmetadata event fired - retrying play`);
    if (videoRef.current) {
      // Small delay to ensure video decoding has started
      setTimeout(() => {
        if (videoRef.current && videoRef.current.paused) {
          dbg(`[StreamCircle] Video still paused after metadata, retrying play...`);
          videoRef.current.play().then(() => {
            dbg(`[StreamCircle] Video autoplay with muted succeeded`);
            setIsVideoRendering(true);
            setVideoFailed(false);
          }).catch((err) => {
            dbg(`[StreamCircle] Muted autoplay still blocked:`, err?.name);
          });
        }
      }, 100);
    }
  };

  // Also retry on canplay event (more reliable than metadata)
  const handleCanPlay = () => {
    dbg(`[StreamCircle] Video canplay event fired - retrying play`);
    if (videoRef.current && videoRef.current.paused) {
      videoRef.current.play().then(() => {
        dbg(`[StreamCircle] Video autoplay via canplay succeeded`);
        setIsVideoRendering(true);
        setVideoFailed(false);
      }).catch((err) => {
        dbg(`[StreamCircle] Canplay autoplay blocked:`, err?.name);
      });
    }
  };

  return (
    <div className="absolute inset-0 w-full h-full rounded-full overflow-hidden">
      {!videoFailed && hasLiveEnabledVideoTrack(stream) ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          onClick={handleVideoClick}
          className="absolute inset-0 w-full h-full object-cover rounded-full cursor-pointer bg-black"
          style={mirrored ? { transform: "scaleX(-1)" } : undefined}
          onPlay={() => {
            dbg(`[StreamCircle] Video onPlay event fired`);
            setIsVideoRendering(true);
            setVideoFailed(false);
          }}
          onCanPlay={handleCanPlay}
          onLoadedMetadata={handleMetadataLoaded}
          onPlaying={() => {
            dbg(`[StreamCircle] Video onPlaying event fired - frames are rendering`);
            setIsVideoRendering(true);
            setVideoFailed(false);
          }}
          onError={() => {
            dbg(`[StreamCircle] Video error - showing emoji fallback`);
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

const HiddenAudio = ({ stream, volume = 100, disabled = false }) => {
  const audioRef = useRef(null);
  const lastStreamRef = useRef(null);
  const playAttemptIdRef = useRef(0);
  
  useEffect(() => {
    if (!audioRef.current || !stream) {
      dbg(`[HiddenAudio] No audio ref or stream`);
      return;
    }

    dbg(`[HiddenAudio] Setting up audio stream`, {
      audioTracks: stream.getAudioTracks().length,
      trackStates: stream.getAudioTracks().map(t => ({ enabled: t.enabled, readyState: t.readyState })),
    });

    // Avoid reloading the same stream object repeatedly; this interrupts playback.
    if (lastStreamRef.current !== stream) {
      audioRef.current.srcObject = stream;
      lastStreamRef.current = stream;
    }

    // Respect local mixer settings (mute/deafen/per-user mute)
    audioRef.current.muted = disabled;
    audioRef.current.volume = Math.max(0, Math.min(1, volume / 100));
    audioRef.current.autoplay = true;
    audioRef.current.playsInline = true;

    const myAttemptId = ++playAttemptIdRef.current;

    const tryPlay = () => {
      if (!audioRef.current || myAttemptId !== playAttemptIdRef.current) return;

      audioRef.current.play()
        .then(() => {
          if (myAttemptId !== playAttemptIdRef.current) return;
          dbg(`[HiddenAudio] Audio playing successfully`);
        })
        .catch((err) => {
          if (myAttemptId !== playAttemptIdRef.current) return;

          if (err?.name === "AbortError") {
            dbg(`[HiddenAudio] Audio play interrupted by stream reload, retrying...`);
            setTimeout(() => {
              if (myAttemptId === playAttemptIdRef.current) {
                tryPlay();
              }
            }, 150);
            return;
          }

          dbg(`[HiddenAudio] Audio play failed:`, err?.name, err?.message);

          // If autoplay is blocked, retry on first user interaction.
          if (err?.name === "NotAllowedError") {
            const unlock = () => {
              document.removeEventListener("click", unlock, true);
              document.removeEventListener("keydown", unlock, true);
              document.removeEventListener("touchstart", unlock, true);
              tryPlay();
            };
            document.addEventListener("click", unlock, true);
            document.addEventListener("keydown", unlock, true);
            document.addEventListener("touchstart", unlock, true);
          }
        });
    };

    const onCanPlay = () => tryPlay();
    const onLoadedMetadata = () => tryPlay();
    const onAddTrack = () => {
      dbg(`[HiddenAudio] Audio track added to remote stream, retrying play`);
      tryPlay();
    };
    audioRef.current.addEventListener("canplay", onCanPlay);
    audioRef.current.addEventListener("loadedmetadata", onLoadedMetadata);
    stream.addEventListener("addtrack", onAddTrack);
    tryPlay();

    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener("canplay", onCanPlay);
        audioRef.current.removeEventListener("loadedmetadata", onLoadedMetadata);
      }
      stream.removeEventListener("addtrack", onAddTrack);
    };
  }, [stream]);

  // Keep audio element in sync with mixer changes even when stream object is unchanged.
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.muted = disabled;
    audioRef.current.volume = Math.max(0, Math.min(1, volume / 100));
  }, [disabled, volume]);

  return (
    <audio 
      ref={audioRef}
      autoPlay 
      muted={disabled}
      playsInline
      style={{ display: "none" }} 
    />
  );
};

const FloatingParticipantBubbles = ({
  participants,
  localStream,
  localVideoEnabled,
  localAudioEnabled,
  remoteStreams,
  mutedUserIds = new Set(),
  hiddenVideoUserIds = new Set(),
  voiceChatVolume = 100,
  deafened = false,
  containerRef,
}) => {
  const [trackStateVersion, setTrackStateVersion] = useState(0);

  useEffect(() => {
    const streams = [];
    if (localStream) streams.push(localStream);
    if (remoteStreams && typeof remoteStreams.forEach === "function") {
      remoteStreams.forEach((s) => {
        if (s) streams.push(s);
      });
    }

    if (streams.length === 0) return;

    const bump = () => setTrackStateVersion((v) => v + 1);
    const unsubs = [];

    streams.forEach((stream) => {
      const onAddTrack = bump;
      const onRemoveTrack = bump;
      stream.addEventListener("addtrack", onAddTrack);
      stream.addEventListener("removetrack", onRemoveTrack);
      unsubs.push(() => {
        stream.removeEventListener("addtrack", onAddTrack);
        stream.removeEventListener("removetrack", onRemoveTrack);
      });

      stream.getVideoTracks().forEach((track) => {
        const onTrackChange = bump;
        track.addEventListener("mute", onTrackChange);
        track.addEventListener("unmute", onTrackChange);
        track.addEventListener("ended", onTrackChange);
        unsubs.push(() => {
          track.removeEventListener("mute", onTrackChange);
          track.removeEventListener("unmute", onTrackChange);
          track.removeEventListener("ended", onTrackChange);
        });
      });
    });

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [localStream, remoteStreams]);

  // Log stream availability
  useEffect(() => {
    dbg(`[FloatingParticipantBubbles] Current state:`, {
      participantCount: participants?.length || 0,
      hasLocalStream: !!localStream,
      localVideoEnabled,
      remoteStreamsCount: remoteStreams?.size || 0,
      remoteStreamIds: Array.from(remoteStreams?.keys() || []),
    });
  }, [participants, localStream, localVideoEnabled, remoteStreams, trackStateVersion]);

  const [bubblePositions, setBubblePositions] = useState({});

  const handlePositionChange = useCallback((bubbleId, newPosSize) => {
    setBubblePositions(prev => ({ ...prev, [bubbleId]: newPosSize }));
  }, []);

  return (
    <>
      {participants.map((p, i) => {
        const isLocal = p.isLocalUser === true;
        const locallyVideoHidden = !isLocal && p.odlUserId ? hiddenVideoUserIds.has(p.odlUserId) : false;
        const locallyMuted = !isLocal && p.odlUserId ? mutedUserIds.has(p.odlUserId) : false;
        const localHasLiveVideo = hasLiveEnabledVideoTrack(localStream);
        const hasVideo = isLocal ? (localVideoEnabled && localHasLiveVideo) : (p.videoEnabled && !locallyVideoHidden);
        const hasAudio = isLocal ? localAudioEnabled : p.audioEnabled;
        const isOnline = p.isOnline !== false;
        const displayName = p.name.replace(" (Host)", "");
        const bubbleId = p.odlUserId || `${p.name}-${i}`;

        // Get container dimensions for default position
        const container = containerRef?.current;
        const cw = container?.clientWidth || 800;
        const ch = container?.clientHeight || 600;
        const defaultPos = getDefaultBubblePosition(i, cw, ch);
        const savedPos = bubblePositions[bubbleId];
        const initialPos = savedPos ? { x: savedPos.x, y: savedPos.y } : defaultPos;
        const initialSize = savedPos?.size || (isLocal ? 72 : 56);

        // Get remote stream if this is a remote participant
        const remoteStream = !isLocal && p.odlUserId ? remoteStreams?.get(p.odlUserId) : undefined;
        const remoteVideoEnabled = remoteStream
          ? remoteStream.getVideoTracks().some((t) => t.enabled && t.readyState === "live")
          : false;
        
        // Show video only when we have an actually enabled/live video track.
        const shouldShowVideo = isLocal
          ? (localStream && hasVideo)
          : (remoteStream && remoteVideoEnabled && !locallyVideoHidden);

        return (
          <DraggableVideoBubble
            key={bubbleId}
            bubbleId={bubbleId}
            initialPosition={initialPos}
            initialSize={initialSize}
            minSize={40}
            maxSize={180}
            containerRef={containerRef}
            onPositionChange={handlePositionChange}
            style={{
              boxShadow: p.speaking
                ? "0 0 0 3px hsl(var(--secondary)), 0 0 20px hsl(var(--secondary) / 0.4)"
                : undefined,
            }}
          >
            {/* Video or emoji fallback */}
            {shouldShowVideo ? (
              isLocal ? (
                <StreamCircle stream={localStream} mirrored muted fallbackEmoji={p.emoji} />
              ) : (
                <StreamCircle stream={remoteStream} muted={true} fallbackEmoji={p.emoji} />
              )
            ) : (
              <div className="absolute inset-0 bg-muted/80 backdrop-blur-sm flex items-center justify-center rounded-full">
                <span className="text-lg md:text-2xl">{p.emoji}</span>
              </div>
            )}

            {/* Hidden audio element for remote stream */}
            {!isLocal && remoteStream && (
              <HiddenAudio
                stream={remoteStream}
                volume={voiceChatVolume}
                disabled={deafened || locallyMuted || voiceChatVolume === 0}
              />
            )}

            {/* Online indicator */}
            <div className={`absolute top-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-card ${
              isOnline ? "bg-green-500" : "bg-muted-foreground/50"
            }`} />

            {/* Role badges */}
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

            {/* Speaking animation */}
            {p.speaking && hasAudio && (
              <div
                className="absolute inset-0 rounded-full border-2 border-secondary pointer-events-none animate-pulse"
              />
            )}

            {/* Mic indicator */}
            <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-card/90 backdrop-blur flex items-center justify-center border border-glass-border">
              {hasAudio ? (
                <Mic className="w-2.5 h-2.5 text-secondary" />
              ) : (
                <MicOff className="w-2.5 h-2.5 text-destructive" />
              )}
            </div>

            {/* Name tooltip on hover */}
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground bg-card/80 backdrop-blur px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {displayName}
            </div>
          </DraggableVideoBubble>
        );
      })}
    </>
  );
};

export default FloatingParticipantBubbles;