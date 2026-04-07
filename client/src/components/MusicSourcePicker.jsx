import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music, Youtube, Upload, Search, TrendingUp, Eye, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MusicSourcePicker = ({
  onSelectTrack = null,
  onSourceChange = null,
}) => {
  const [mode, setMode] = useState("picker"); // picker, youtube-search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleYoutubeSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      const response = await fetch('/api/music/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('clerk-db-jwt') || ''}`
        },
        body: JSON.stringify({ query: searchQuery })
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error('Search error:', error);
      alert('Failed to search music. Please try again.');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleTrending = async () => {
    setIsSearching(true);
    setHasSearched(true);

    try {
      const response = await fetch('/api/music/trending', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('clerk-db-jwt') || ''}`
        }
      });

      if (!response.ok) {
        throw new Error('Trending fetch failed');
      }

      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error('Trending fetch error:', error);
      alert('Failed to fetch trending music. Please try again.');
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
    setMode("picker");
    setSearchQuery("");
    setSearchResults([]);
    setHasSearched(false);
  };

  return (
    <div className="w-full h-full flex flex-col relative">
      {mode === "picker" ? (
        // Source picker
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="flex flex-col items-center justify-center h-full gap-6 p-8"
        >
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Music className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-foreground mb-2">
              Choose Music Source
            </h2>
            <p className="text-sm text-muted-foreground max-w-sm text-center">
              Select where to find music for your listen session
            </p>
          </div>
          <div className="flex gap-3 flex-col w-full max-w-xs">
            <Button
              className="gradient-music text-secondary-foreground h-12 px-6 rounded-xl text-base"
              onClick={() => setMode("youtube-search")}
            >
              <Youtube className="w-5 h-5 mr-2" />
              YouTube Music
            </Button>
            <Button
              variant="outline"
              className="border-glass-border h-12 px-6 rounded-xl text-base"
            >
              <Upload className="w-5 h-5 mr-2" />
              Upload Audio
            </Button>
          </div>
        </motion.div>
      ) : mode === "youtube-search" ? (
        // YouTube search mode
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="flex flex-col h-full"
        >
          {/* Header */}
          <div className="p-4 border-b border-glass-border flex items-center gap-3">
            <button
              onClick={() => {
                setMode("picker");
                setSearchResults([]);
                setHasSearched(false);
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h3 className="text-sm font-semibold text-foreground">
              Search Music on YouTube
            </h3>
          </div>

          {/* Search bar */}
          <div className="p-4 border-b border-glass-border flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search songs, artists..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleYoutubeSearch()}
                className="pl-10 h-10 bg-muted/50 border-glass-border rounded-xl text-sm"
              />
            </div>
            <Button
              onClick={handleYoutubeSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="gradient-music text-secondary-foreground h-10 px-4 rounded-xl"
              size="sm"
            >
              {isSearching ? "..." : "Search"}
            </Button>
          </div>

          {/* Trending button */}
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

          {/* Results list */}
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
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted/40 transition-colors group text-left"
                >
                  {/* Thumbnail */}
                  <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-muted relative">
                    <img
                      src={track.thumbnail}
                      alt={track.title}
                      className="w-full h-full object-cover"
                    />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center">
                        <div className="w-0 h-0 border-l-[5px] border-l-secondary border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent ml-0.5" />
                      </div>
                    </div>
                    {/* Duration badge */}
                    <div className="absolute bottom-0.5 right-0.5 bg-background/80 px-1 py-0.5 rounded text-[8px] font-mono">
                      {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, "0")}
                    </div>
                  </div>

                  {/* Track info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-secondary">
                      {track.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mb-1">
                      {track.artist}
                    </p>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Eye className="w-3 h-3" />
                      <span>{track.views}</span>
                    </div>
                  </div>
                </motion.button>
              ))
            ) : hasSearched ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-sm text-muted-foreground">No tracks found</p>
              </div>
            ) : null}
          </div>

          {/* Load more button */}
          {searchResults.length > 0 && !isSearching && (
            <div className="p-4 border-t border-glass-border">
              <Button
                variant="outline"
                className="border-glass-border w-full h-9 rounded-xl text-xs"
                disabled={isSearching}
              >
                Load More Results
              </Button>
            </div>
          )}
        </motion.div>
      ) : null}
    </div>
  );
};

export default MusicSourcePicker;
