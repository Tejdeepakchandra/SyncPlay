import { motion } from "framer-motion";
import { SkipForward, Repeat, Search, Music } from "lucide-react";
import { Button } from "@/components/ui/button";

const TrackEndedOverlay = ({
  currentTrack,
  onPlayNext,
  onPlayAgain,
  onSearchAnother,
  onChangeSource,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="mt-6 w-full glass-panel p-5 rounded-2xl text-center space-y-4"
    >
      <div>
        <h3 className="font-display text-lg font-bold text-foreground mb-1">
          Track Ended
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {currentTrack?.title || "Unknown Track"}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 justify-center flex-wrap">
        {/* Play Next */}
        <Button
          onClick={onPlayNext}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-9 px-4 text-sm"
        >
          <SkipForward className="w-4 h-4 mr-2" />
          Play Next
        </Button>

        {/* Listen Again */}
        <Button
          onClick={onPlayAgain}
          variant="outline"
          className="border-glass-border rounded-xl h-9 px-4 text-sm"
        >
          <Repeat className="w-4 h-4 mr-2" />
          Listen Again
        </Button>

        {/* Search Another Song */}
        <Button
          onClick={onSearchAnother}
          variant="outline"
          className="border-glass-border rounded-xl h-9 px-4 text-sm"
        >
          <Search className="w-4 h-4 mr-2" />
          Search Another
        </Button>

        {/* Change Source */}
        <Button
          onClick={onChangeSource}
          variant="outline"
          className="border-glass-border rounded-xl h-9 px-4 text-sm"
        >
          <Music className="w-4 h-4 mr-2" />
          Change Source
        </Button>
      </div>
    </motion.div>
  );
};

export default TrackEndedOverlay;
