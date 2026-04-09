import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search, Eye, Loader2, Youtube, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/services/api";
import { toast } from "sonner";

const formatViewCount = (count) => {
  const num = parseInt(count);
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

const formatDuration = (secondsLike) => {
  const total = Number(secondsLike || 0);
  if (!Number.isFinite(total) || total <= 0) return "0:00";

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.floor(total % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const normalizeVideoResult = (video) => {
  const id = String(video?.id || video?.videoId || "").trim();
  if (!id) return null;

  return {
    id,
    title: video?.title || "Untitled video",
    thumbnail:
      video?.thumbnail ||
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    channelTitle: video?.artist || video?.channelTitle || "Unknown",
    viewCount: video?.views || video?.viewCount || "0",
    likeCount: video?.likeCount || null,
    duration: formatDuration(video?.duration),
  };
};

const YouTubeSearchTab = ({ onSelectVideo }) => {
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [mode, setMode] = useState("trending");
  const [hasSearched, setHasSearched] = useState(false);

  const quickQueries = [
    "official trailer",
    "teaser",
    "new release trailer",
    "imax trailer",
    "movie clip",
  ];

  const handleSearch = async (pageToken) => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return;
    }
    
    setLoading(true);
    setMode("search");
    setHasSearched(true);
    
    try {
      const response = await api.post("/movies/search", {
        query: normalizedQuery,
        pageToken: pageToken || undefined,
        maxResults: 24,
      });
      const payload = response.data || {};
      if (!payload.success) {
        throw new Error(payload.message || payload.error || "Search failed");
      }

      const mapped = (payload.results || [])
        .map(normalizeVideoResult)
        .filter(Boolean);

      setVideos(pageToken ? [...videos, ...mapped] : mapped);
      setNextPageToken(payload.nextPageToken || null);
      setSearched(true);
      setHasSearched(true);
    } catch (err) {
      const message = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Search failed";
      toast.error("Search failed", { description: message });
      setVideos([]);
      setSearched(true);
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const handleTrending = async (pageToken) => {
    setLoading(true);
    setMode("trending");
    setHasSearched(true);
    
    try {
      const endpoint = pageToken
        ? `/movies/category/trending?pageToken=${encodeURIComponent(pageToken)}&maxResults=24`
        : "/movies/trending";
      const response = await api.get(endpoint);
      const payload = response.data || {};
      if (!payload.success) {
        throw new Error(payload.message || payload.error || "Failed to load trending");
      }

      const mapped = (payload.results || [])
        .map(normalizeVideoResult)
        .filter(Boolean);

      setVideos(pageToken ? [...videos, ...mapped] : mapped);
      setNextPageToken(payload.nextPageToken || null);
      setSearched(true);
      setHasSearched(true);
    } catch (err) {
      const message = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to load trending";
      toast.error("Failed to load trending", { description: message });
      setVideos([]);
      setSearched(true);
      setHasSearched(true);
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

  useEffect(() => {
    handleTrending();
    // Load initial results when MovieRoom opens YouTube search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search movie trailers, teasers, clips..."
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

      <div className="flex flex-wrap items-center gap-2">
        {quickQueries.map((q) => (
          <button
            key={q}
            onClick={() => {
              setQuery(q);
              setTimeout(() => handleSearch(), 10);
            }}
            className="text-[11px] px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary/90 hover:bg-primary/20 transition-colors"
          >
            {q}
          </button>
        ))}
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

      <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
        {videos.length > 0 && videos.map((video, idx) => (
          <motion.button
            key={`${video.id}-${video.title}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(idx * 0.02, 0.2) }}
            onClick={() => handleSelect(video)}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/40 border border-glass-border/60 hover:border-primary/30 transition-colors group text-left"
          >
            <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted relative">
              <img
                src={video.thumbnail}
                alt={video.title}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
                }}
              />
              {!!video.duration && (
                <div className="absolute bottom-0.5 right-0.5 bg-background/80 px-1 py-0.5 rounded text-[8px] font-mono">
                  {video.duration}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                {video.title}
              </p>
              <p className="text-xs text-muted-foreground truncate mb-1">
                {video.channelTitle}
              </p>
              {!!video.viewCount && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Eye className="w-3 h-3" />
                  <span>{formatViewCount(video.viewCount)}</span>
                </div>
              )}
            </div>
          </motion.button>
        ))}
      </div>

      {hasSearched && !loading && videos.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">No videos found for this query.</p>
          <Button
            variant="outline"
            className="mt-3 border-glass-border"
            onClick={() => handleTrending()}
          >
            Show Trending
          </Button>
        </div>
      )}

      {/* Load more */}
      {nextPageToken && videos.length > 0 && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => mode === "search" ? handleSearch(nextPageToken) : handleTrending(nextPageToken)}
            disabled={loading}
            className="border-glass-border rounded-xl px-5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Load More Results
          </Button>
        </div>
      )}
    </div>
  );
};

export default YouTubeSearchTab;