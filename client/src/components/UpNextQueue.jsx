import { motion } from "framer-motion";
import { Music } from "lucide-react";
import { Button } from "@/components/ui/button";

const UpNextQueue = ({ queue, onDismiss, onPlayTrack }) => {
  const visibleTracks = queue.slice(0, 4); // Show up to 4 tracks

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 60 }}
      transition={{ type: "spring", stiffness: 200, damping: 30 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.1, bottom: 0.4 }}
      onDragEnd={(e, info) => {
        if (info.offset.y > 60 || info.velocity.y > 300) {
          onDismiss();
        }
      }}
      className="absolute left-1/2 -translate-x-1/2 bottom-2 md:bottom-4 w-[calc(100%-1rem)] md:w-[calc(100%-2rem)] max-w-md z-30"
    >
      <div className="rounded-2xl border border-border/40 bg-card/95 backdrop-blur-2xl shadow-2xl overflow-hidden">
        {/* Swipe handle (mobile) */}
        <div className="flex justify-center pt-2 md:hidden">
          <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="px-3 md:px-4 py-2 md:py-3 border-b border-border/20">
          <p className="text-[10px] uppercase tracking-widest text-secondary font-bold">
            Up Next
          </p>
        </div>

        {/* Track thumbnails (horizontal scroll) */}
        <div className="flex gap-1.5 md:gap-2 px-2 md:px-3 pb-2.5 md:pb-3 overflow-x-auto scrollbar-hide">
          {visibleTracks.map((track, idx) => (
            <motion.button
              key={idx}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onPlayTrack(idx)}
              className="flex-shrink-0 w-[5.5rem] md:w-28 rounded-xl overflow-hidden bg-muted/40 hover:bg-muted/70 transition-all relative group"
            >
              {/* Thumbnail */}
              {track.thumbnail ? (
                <img
                  src={track.thumbnail}
                  alt={track.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  <Music className="w-4 h-4 text-muted-foreground" />
                </div>
              )}

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center">
                  <div className="w-0 h-0 border-l-[5px] border-l-secondary border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent ml-0.5" />
                </div>
              </div>

              {/* "NEXT" badge for first track */}
              {idx === 0 && (
                <div className="absolute top-1 left-1 bg-secondary text-secondary-foreground text-[7px] md:text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                  NEXT
                </div>
              )}

              {/* Duration (if available) */}
              {track.duration && (
                <div className="absolute bottom-1 right-1 bg-background/80 px-1 py-0.5 rounded text-[8px] text-foreground font-mono">
                  {Math.floor(track.duration / 60)}:{String(Math.floor(track.duration % 60)).padStart(2, "0")}
                </div>
              )}
            </motion.button>
          ))}
        </div>

        {/* Queue summary */}
        <div className="px-3 md:px-4 py-2 border-t border-border/20 text-center">
          <p className="text-[10px] text-muted-foreground">
            {queue.length} track{queue.length !== 1 ? "s" : ""} in queue
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default UpNextQueue;
