import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Play, Eye, Clock, ThumbsUp, Loader2, Youtube, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// YouTube API service (mock for now, replace with real API)
const searchVideos = async (query, maxResults = 12, pageToken) => {
  // Mock implementation - replace with actual YouTube API
  await new Promise(r => setTimeout(r, 1000));
  
  return {
    videos: Array(maxResults).fill(0).map((_, i) => ({
      id: `video-${i}`,
      title: `Sample Video ${i + 1} - ${query}`,
      thumbnail: `https://picsum.photos/320/180?random=${i}`,
      channelTitle: "Sample Channel",
      viewCount: Math.floor(Math.random() * 1000000).toString(),
      likeCount: Math.floor(Math.random() * 100000).toString(),
      duration: `${Math.floor(Math.random() * 10)}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
    })),
    nextPageToken: pageToken ? null : "next-page-token"
  };
};

const getTrendingVideos = async (maxResults = 12, categoryId, pageToken) => {
  // Mock implementation
  await new Promise(r => setTimeout(r, 1000));
  
  return {
    videos: Array(maxResults).fill(0).map((_, i) => ({
      id: `trending-${i}`,
      title: `Trending Video ${i + 1}`,
      thumbnail: `https://picsum.photos/320/180?random=${i + 100}`,
      channelTitle: "Trending Channel",
      viewCount: Math.floor(Math.random() * 5000000).toString(),
      likeCount: Math.floor(Math.random() * 500000).toString(),
      duration: `${Math.floor(Math.random() * 15)}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
    })),
    nextPageToken: pageToken ? null : "next-page-token"
  };
};

const formatViewCount = (count) => {
  const num = parseInt(count);
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 200, damping: 20 },
  },
};

const YouTubeSearchTab = ({ onSelectVideo }) => {
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [mode, setMode] = useState("trending");

  const handleSearch = async (pageToken) => {
    if (!query.trim() && mode === "search") return;
    
    setLoading(true);
    setMode("search");
    
    try {
      const result = await searchVideos(query.trim(), 12, pageToken);
      setVideos(pageToken ? [...videos, ...result.videos] : result.videos);
      setNextPageToken(result.nextPageToken);
      setSearched(true);
    } catch (err) {
      toast.error("Search failed", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTrending = async (pageToken) => {
    setLoading(true);
    setMode("trending");
    
    try {
      const result = await getTrendingVideos(12, undefined, pageToken);
      setVideos(pageToken ? [...videos, ...result.videos] : result.videos);
      setNextPageToken(result.nextPageToken);
      setSearched(true);
    } catch (err) {
      toast.error("Failed to load trending", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (video) => {
    onSelectVideo?.({
      id: video.id,
      title: video.title,
      thumbnail: video.thumbnail,
      duration: video.duration,
    });
    toast.success(`🎬 Selected: ${video.title}`, { duration: 2000 });
  };

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search YouTube videos..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-10 h-11 bg-glass/60 border-glass-border rounded-xl text-sm"
          />
        </div>
        <Button
          onClick={() => handleSearch()}
          disabled={loading || !query.trim()}
          className="gradient-movie text-primary-foreground h-11 px-5 rounded-xl"
        >
          {loading && mode === "search" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          <span className="ml-2 hidden sm:inline">Search</span>
        </Button>
        <Button
          onClick={() => handleTrending()}
          disabled={loading}
          variant="outline"
          className="h-11 px-4 rounded-xl border-glass-border"
        >
          {loading && mode === "trending" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <TrendingUp className="w-4 h-4" />
          )}
          <span className="ml-2 hidden sm:inline">Trending</span>
        </Button>
      </div>

      {/* Results */}
      {!searched && !loading && (
        <div className="text-center py-16">
          <Youtube className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">
            Search for YouTube videos or browse trending content
          </p>
        </div>
      )}

      {loading && videos.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      )}

      <AnimatePresence mode="wait">
        {videos.length > 0 && (
          <motion.div
            key="results"
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            {videos.map((video) => (
              <motion.div
                key={video.id}
                variants={item}
                onClick={() => handleSelect(video)}
                className="glass-panel cursor-pointer group overflow-hidden rounded-2xl"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-muted overflow-hidden">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  {/* Duration badge */}
                  {video.duration && (
                    <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] font-medium text-foreground">
                      {video.duration}
                    </div>
                  )}
                  {/* Play overlay */}
                  <div className="absolute inset-0 bg-background/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full gradient-movie flex items-center justify-center shadow-lg shadow-primary/30">
                      <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="p-3">
                  <h4 className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors leading-snug mb-1.5">
                    {video.title}
                  </h4>
                  <p className="text-xs text-muted-foreground truncate mb-2">{video.channelTitle}</p>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    {video.viewCount && (
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {formatViewCount(video.viewCount)}
                      </span>
                    )}
                    {video.likeCount && (
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="w-3 h-3" />
                        {parseInt(video.likeCount).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Load more */}
      {nextPageToken && videos.length > 0 && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => mode === "search" ? handleSearch(nextPageToken) : handleTrending(nextPageToken)}
            disabled={loading}
            className="border-glass-border rounded-xl"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Load More
          </Button>
        </div>
      )}
    </div>
  );
};

export default YouTubeSearchTab;