import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music, Youtube, Upload, Search, TrendingUp, Eye, ChevronLeft, Sparkles, Disc3, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/services/api";
import { toast } from "sonner";

const MusicSourcePicker = ({
  onSelectTrack = null,
  onSelectLocal = null,
  onSourceChange = null,
}) => {
  const [mode, setMode] = useState("picker");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const quickSearches = ["lofi beats", "afrobeats mix", "synthwave", "bollywood chill", "edm hits"];

  const setPickerMode = (nextMode) => {
    setMode(nextMode);
    onSourceChange?.(nextMode);
  };

  const handleYoutubeSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      const response = await api.post("/music/search", { query: searchQuery });
      const data = response.data;
      setSearchResults(data.results || []);
    } catch (error) {
      console.error("Search error:", error);
      const message = error?.response?.data?.message || error?.response?.data?.error || "Failed to search music. Try again.";
      toast.error(message);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleTrending = async () => {
    setIsSearching(true);
    setHasSearched(true);

    try {
      const response = await api.get("/music/trending");
      const data = response.data;
      setSearchResults(data.results || []);
    } catch (error) {
      console.error("Trending fetch error:", error);
      const message = error?.response?.data?.message || error?.response?.data?.error || "Failed to fetch trending music. Try again.";
      toast.error(message);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectTrack = (track) => {
    onSelectTrack?.({
      videoId: track.id || track.videoId,
      title: track.title,
      artist: track.artist,
      thumbnail: track.thumbnail,
      duration: track.duration,
      url: track.url,
    });
    setPickerMode("picker");
    setSearchQuery("");
    setSearchResults([]);
    setHasSearched(false);
  };

  const handlePickLocalFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      toast.error("Select a valid audio file.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    onSelectLocal?.(file, objectUrl);
    setPickerMode("picker");
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer?.files?.[0];
    handlePickLocalFile(file);
  };

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -top-16 -left-8 h-56 w-56 rounded-full bg-emerald-400/18 blur-3xl"
          animate={{ x: [0, 16, 0], y: [0, 12, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-20 right-0 h-72 w-72 rounded-full bg-lime-400/14 blur-3xl"
          animate={{ x: [0, -20, 0], y: [0, -12, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 h-72 w-[32rem] rounded-full bg-emerald-500/10 blur-[90px]"
          animate={{ opacity: [0.35, 0.65, 0.35] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {mode === "picker" ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative z-10 flex flex-col items-center justify-center h-full gap-6 p-6 md:p-8"
        >
          <motion.div
            className="w-16 h-16 rounded-full bg-emerald-400/10 border border-emerald-300/30 flex items-center justify-center shadow-lg"
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          >
            <Disc3 className="w-8 h-8 text-emerald-300" />
          </motion.div>
          <div className="text-center">
            <h2 className="font-display text-xl md:text-2xl font-bold text-foreground mb-2">Pick Your Music Vibe</h2>
            <p className="text-sm text-muted-foreground max-w-md text-center">Search YouTube, drop your own audio file, or start from trending tracks.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
            <motion.button
              whileHover={{ y: -2, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setPickerMode("youtube-search")}
              className="group text-left rounded-2xl border border-emerald-400/20 bg-emerald-950/35 backdrop-blur p-4 md:p-5 shadow-xl hover:border-emerald-300/45"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="h-10 w-10 rounded-xl bg-red-500/15 text-red-400 flex items-center justify-center"><Youtube className="w-5 h-5" /></div>
                <Sparkles className="w-4 h-4 text-muted-foreground group-hover:text-emerald-300 transition-colors" />
              </div>
              <p className="text-sm font-semibold text-foreground">YouTube Discovery</p>
              <p className="text-xs text-muted-foreground mt-1">Search songs, artists, trending playlists, and quick vibes.</p>
            </motion.button>

            <motion.button
              whileHover={{ y: -2, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => fileInputRef.current?.click()}
              className="group text-left rounded-2xl border border-emerald-400/20 bg-emerald-950/35 backdrop-blur p-4 md:p-5 shadow-xl hover:border-emerald-300/45"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="h-10 w-10 rounded-xl bg-emerald-400/15 text-emerald-300 flex items-center justify-center"><Upload className="w-5 h-5" /></div>
                <Wand2 className="w-4 h-4 text-muted-foreground group-hover:text-emerald-300 transition-colors" />
              </div>
              <p className="text-sm font-semibold text-foreground">Upload Local Audio</p>
              <p className="text-xs text-muted-foreground mt-1">MP3, WAV, M4A and more. Perfect for private demos and unreleased tracks.</p>
            </motion.button>
          </div>

          <motion.div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`w-full max-w-2xl rounded-2xl border border-dashed p-4 text-center transition-colors ${isDragOver ? "border-emerald-300 bg-emerald-400/10" : "border-emerald-300/25 bg-emerald-950/25"}`}
          >
            <p className="text-xs text-muted-foreground">Drag and drop audio files here to upload instantly</p>
          </motion.div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => handlePickLocalFile(e.target.files?.[0])}
          />

          <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl">
            {quickSearches.map((q) => (
              <button
                key={q}
                className="text-[11px] px-3 py-1 rounded-full bg-emerald-900/35 hover:bg-emerald-800/50 text-emerald-100/80 hover:text-emerald-100 transition-colors"
                onClick={() => {
                  setSearchQuery(q);
                  setPickerMode("youtube-search");
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </motion.div>
      ) : mode === "youtube-search" ? (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="relative z-10 flex flex-col h-full"
        >
          <div className="p-4 border-b border-glass-border flex items-center gap-3">
            <button
              onClick={() => {
                setPickerMode("picker");
                setSearchResults([]);
                setHasSearched(false);
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Search Music on YouTube</h3>
              <p className="text-[10px] text-muted-foreground">Try artist + mood, like "ODESZA chill"</p>
            </div>
          </div>

          <div className="p-4 border-b border-glass-border flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search songs, artists..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleYoutubeSearch()}
                className="pl-10 h-10 bg-muted/50 border-glass-border rounded-xl text-sm"
              />
            </div>
            <Button
              onClick={handleYoutubeSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="bg-gradient-to-r from-emerald-400 to-lime-400 text-emerald-950 h-10 px-4 rounded-xl"
              size="sm"
            >
              {isSearching ? "..." : "Search"}
            </Button>
          </div>

          {!hasSearched && (
            <div className="px-4 pt-3 flex flex-wrap gap-2">
              {quickSearches.map((q) => (
                <button
                  key={`chip-${q}`}
                  className="text-[11px] px-3 py-1 rounded-full bg-emerald-900/35 hover:bg-emerald-800/50 text-emerald-100/80 hover:text-emerald-100 transition-colors"
                  onClick={() => {
                    setSearchQuery(q);
                    setTimeout(() => handleYoutubeSearch(), 10);
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {!hasSearched && (
            <div className="px-4 pt-4">
              <Button
                onClick={handleTrending}
                disabled={isSearching}
                variant="outline"
                className="border-glass-border h-10 px-4 rounded-xl w-full text-sm"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                See Trending
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {isSearching ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-center">
                  <div className="w-8 h-8 rounded-full border-2 border-secondary border-t-transparent animate-spin mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Searching...</p>
                </div>
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.map((track, idx) => (
                <motion.button
                  key={track.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => handleSelectTrack(track)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/40 transition-colors group text-left"
                >
                  <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-muted relative">
                    <img
                      src={track.thumbnail}
                      alt={track.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center">
                        <div className="w-0 h-0 border-l-[5px] border-l-secondary border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent ml-0.5" />
                      </div>
                    </div>
                    {!!track.duration && (
                      <div className="absolute bottom-0.5 right-0.5 bg-background/80 px-1 py-0.5 rounded text-[8px] font-mono">
                        {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, "0")}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-secondary">
                      {track.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mb-1">
                      {track.artist}
                    </p>
                    {!!track.views && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Eye className="w-3 h-3" />
                        <span>{track.views}</span>
                      </div>
                    )}
                  </div>
                </motion.button>
              ))
            ) : hasSearched ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-sm text-muted-foreground">No tracks found</p>
              </div>
            ) : null}
          </div>

          {searchResults.length > 0 && !isSearching && (
            <div className="p-4 border-t border-glass-border">
              <Button
                variant="outline"
                className="border-glass-border w-full h-9 rounded-xl text-xs"
                onClick={handleTrending}
                disabled={isSearching}
              >
                Load More Like This
              </Button>
            </div>
          )}
        </motion.div>
      ) : null}
    </div>
  );
};

export default MusicSourcePicker;
