import { useEffect, useRef } from "react";
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

const StreamCircle = ({ stream, mirrored = false, muted = false }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className="absolute inset-0 w-full h-full object-cover rounded-full"
      style={mirrored ? { transform: "scaleX(-1)" } : undefined}
    />
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
  return (
    <>
      {participants.map((p, i) => {
        const isLocal = i === 0;
        const hasVideo = isLocal ? localVideoEnabled : p.videoEnabled;
        const hasAudio = isLocal ? localAudioEnabled : p.audioEnabled;
        const pos = bubblePositions[i % bubblePositions.length];
        const size = isLocal ? "w-16 h-16 md:w-20 md:h-20" : "w-12 h-12 md:w-16 md:h-16";
        const isOnline = p.isOnline !== false;
        const displayName = p.name.replace(" (Host)", "");

        const remoteStream = !isLocal && p.odlUserId ? remoteStreams?.get(p.odlUserId) : undefined;
        const hasRemoteVideo = !!remoteStream && remoteStream.getVideoTracks().some(t => t.enabled && !t.muted);

        return (
          <motion.div
            key={p.name}
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
            {isLocal && localStream && hasVideo ? (
              <StreamCircle stream={localStream} mirrored muted />
            ) : remoteStream && (hasRemoteVideo || hasVideo) ? (
              <StreamCircle stream={remoteStream} muted={deafened} />
            ) : hasVideo && !remoteStream ? (
              <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-secondary/30 animate-pulse rounded-full" />
            ) : (
              <div className="absolute inset-0 bg-muted/80 backdrop-blur-sm flex items-center justify-center rounded-full">
                <span className={isLocal ? "text-2xl md:text-3xl" : "text-lg md:text-2xl"}>{p.emoji}</span>
              </div>
            )}

            {!isLocal && remoteStream && !hasRemoteVideo && !deafened && (
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