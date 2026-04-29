import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Video, VideoOff, Monitor } from "lucide-react";

/**
 * Video Grid Component
 * Displays participant videos in a responsive grid
 * Integrates with WebRTC mesh streams
 */

const StreamVideo = ({ stream, mirrored = false, label }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover rounded-xl"
        style={mirrored ? { transform: "scaleX(-1)" } : undefined}
      />
      {label && (
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/50 rounded-full px-2 py-0.5">
          <Monitor className="w-3 h-3 text-secondary" />
          <span className="text-[9px] text-white font-medium">{label}</span>
        </div>
      )}
    </>
  );
};

const VideoGrid = ({
  participants = [],
  localStream,
  localVideoEnabled,
  localAudioEnabled,
  screenStream,
  remoteStreams = new Map(),
  compact = false,
}) => {
  const hasScreen = !!screenStream;
  const totalTiles = participants.length + (hasScreen ? 1 : 0);
  
  // Dynamic grid sizing
  const getGridCols = () => {
    if (totalTiles <= 1) return "grid-cols-1";
    if (totalTiles <= 2) return "grid-cols-2";
    if (totalTiles <= 4) return "grid-cols-2";
    return "grid-cols-3";
  };

  const getTileSize = () => {
    if (compact) {
      return hasScreen ? "h-32" : "h-20";
    }
    return hasScreen ? "h-44 md:h-56" : "h-28 md:h-36";
  };

  const gridCols = getGridCols();
  const tileSize = getTileSize();
  const screenTileSize = compact ? "h-32" : "h-44 md:h-56";

  return (
    <div className={`grid ${gridCols} gap-2 p-2 w-full`}>
      {/* Screen share tile — spans full width */}
      {hasScreen && screenStream && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`relative ${screenTileSize} rounded-xl overflow-hidden border border-secondary/50 bg-black col-span-full flex items-center justify-center`}
          style={{ boxShadow: "0 0 20px hsl(var(--secondary) / 0.2)" }}
        >
          <StreamVideo stream={screenStream} label="Screen Share" />
        </motion.div>
      )}

      {/* Participant tiles */}
      {participants.map((p, i) => {
        const isLocal = i === 0;
        const hasVideo = isLocal ? localVideoEnabled : p.videoEnabled;
        const hasAudio = isLocal ? localAudioEnabled : p.audioEnabled;
        
        // Get remote stream for non-local participants
        const remoteStream = !isLocal && p.odlUserId ? remoteStreams.get(p.odlUserId) : undefined;
        const hasRemoteVideo = !!remoteStream && remoteStream.getVideoTracks().some(t => t.enabled && !t.muted);

        return (
          <motion.div
            key={p.odlUserId || p.userId || `${p.name}-${i}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`relative ${tileSize} rounded-xl overflow-hidden border ${
              p.speaking ? "border-secondary shadow-[0_0_12px_hsl(var(--secondary)/0.4)]" : "border-glass-border"
            } bg-muted/30 flex items-center justify-center transition-all`}
          >
            {/* Video stream */}
            {isLocal && localStream && hasVideo ? (
              <StreamVideo stream={localStream} mirrored />
            ) : remoteStream && (hasRemoteVideo || hasVideo) ? (
              <StreamVideo stream={remoteStream} />
            ) : hasVideo && !remoteStream ? (
              <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-secondary/30 animate-pulse rounded-full" />
            ) : null}

            {/* Avatar fallback */}
            {!hasVideo && (
              <div className="flex flex-col items-center gap-1">
                <span className={compact ? "text-2xl" : "text-3xl"}>{p.emoji}</span>
              </div>
            )}

            {/* Bottom overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 flex items-center justify-between">
              <span className="text-[10px] font-medium text-white truncate">
                {p.name.replace(" (Host)", "")}
                {isLocal && " (You)"}
              </span>
              <div className="flex items-center gap-1">
                {hasAudio ? (
                  <Mic className={`w-3 h-3 text-white ${p.speaking ? "animate-pulse" : "opacity-60"}`} />
                ) : (
                  <MicOff className="w-3 h-3 text-destructive" />
                )}
                {hasVideo ? (
                  <Video className="w-3 h-3 text-white opacity-60" />
                ) : (
                  <VideoOff className="w-3 h-3 text-destructive" />
                )}
              </div>
            </div>

            {/* Speaking ring */}
            <AnimatePresence>
              {p.speaking && hasAudio && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 rounded-xl border-2 border-secondary pointer-events-none"
                  style={{ boxShadow: "inset 0 0 20px hsl(var(--secondary) / 0.15)" }}
                />
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
};

export default VideoGrid;