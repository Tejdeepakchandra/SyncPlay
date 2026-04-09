/**
 * Movie Service
 * YouTube Data API v3 integration aligned with the stable MusicRoom search flow.
 */

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

const getYouTubeApiKey = () => {
  const key =
    process.env.YOUTUBE_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.YOUTUBE_DATA_API_KEY ||
    '';

  if (!key) {
    throw new Error('Missing YouTube API key. Set YOUTUBE_API_KEY in server env.');
  }

  return key;
};

const parseIso8601DurationToSeconds = (iso) => {
  if (!iso || typeof iso !== 'string') return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
};

const formatViews = (views) => {
  const value = Number(views || 0);
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 1e9) return `${(value / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(value);
};

const mapYouTubeItems = (searchItems, detailsItems) => {
  const detailById = new Map();
  for (const item of detailsItems || []) {
    detailById.set(item.id, item);
  }

  return (searchItems || [])
    .map((item) => {
      const id = item?.id?.videoId || item?.id;
      if (!id) return null;

      const detail = detailById.get(id);
      if (!detail) return null;
      if (detail?.status?.embeddable === false) return null;

      const snippet = item.snippet || detail?.snippet || {};
      const duration = parseIso8601DurationToSeconds(detail?.contentDetails?.duration);

      return {
        id,
        title: snippet.title || 'Untitled',
        artist: snippet.channelTitle || 'Unknown Channel',
        channelTitle: snippet.channelTitle || 'Unknown Channel',
        thumbnail:
          snippet.thumbnails?.medium?.url ||
          snippet.thumbnails?.high?.url ||
          snippet.thumbnails?.default?.url ||
          `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        duration,
        views: formatViews(detail?.statistics?.viewCount),
        url: `https://www.youtube.com/watch?v=${id}`,
      };
    })
    .filter(Boolean);
};

const fetchYouTubeSearch = async ({ query, maxResults = 24, pageToken = '', videoCategoryId = null }) => {
  const key = getYouTubeApiKey();

  const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('order', 'relevance');
  searchUrl.searchParams.set('safeSearch', 'moderate');
  searchUrl.searchParams.set('videoEmbeddable', 'true');
  searchUrl.searchParams.set('videoSyndicated', 'true');
  if (videoCategoryId) {
    searchUrl.searchParams.set('videoCategoryId', String(videoCategoryId));
  }
  if (pageToken) {
    searchUrl.searchParams.set('pageToken', pageToken);
  }
  searchUrl.searchParams.set('maxResults', String(Math.max(1, Math.min(50, Number(maxResults) || 24))));
  searchUrl.searchParams.set('key', key);

  const searchResponse = await fetch(searchUrl.toString());
  if (!searchResponse.ok) {
    const text = await searchResponse.text();
    throw new Error(`YouTube search failed (${searchResponse.status}): ${text}`);
  }

  const searchData = await searchResponse.json();
  const videoIds = (searchData.items || []).map((i) => i?.id?.videoId).filter(Boolean);

  if (videoIds.length === 0) {
    return { results: [], nextPageToken: null };
  }

  const videosUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
  videosUrl.searchParams.set('part', 'contentDetails,statistics,snippet,status');
  videosUrl.searchParams.set('id', videoIds.join(','));
  videosUrl.searchParams.set('key', key);

  const videosResponse = await fetch(videosUrl.toString());
  if (!videosResponse.ok) {
    const text = await videosResponse.text();
    throw new Error(`YouTube video details failed (${videosResponse.status}): ${text}`);
  }

  const videosData = await videosResponse.json();
  return {
    results: mapYouTubeItems(searchData.items, videosData.items),
    nextPageToken: searchData.nextPageToken || null,
  };
};

const youtubeMovieSearch = async (query, options = {}) => {
  try {
    const normalized = String(query || '').trim();
    if (!normalized) {
      return { success: false, error: 'Search query is required', results: [] };
    }

    const lowered = normalized.toLowerCase();
    const isMusicIntent = /\bsong\b|\bmusic\b|\blyrics\b|\baudio\b|\bost\b/.test(lowered);

    const primary = await fetchYouTubeSearch({
      query: normalized,
      maxResults: options.maxResults || 24,
      pageToken: options.pageToken || '',
      videoCategoryId: isMusicIntent ? '10' : null,
    });

    // Fallback only on first page when primary is too sparse.
    if ((!primary.results || primary.results.length < 8) && !options.pageToken) {
      const fallback = await fetchYouTubeSearch({
        query: isMusicIntent ? `${normalized} official song` : `${normalized} trailer`,
        maxResults: options.maxResults || 24,
        pageToken: '',
        videoCategoryId: null,
      });

      const merged = [...(primary.results || []), ...(fallback.results || [])];
      const seen = new Set();
      const deduped = [];
      for (const item of merged) {
        if (!item?.id || seen.has(item.id)) continue;
        seen.add(item.id);
        deduped.push(item);
      }

      return {
        success: true,
        results: deduped.slice(0, options.maxResults || 24),
        nextPageToken: fallback.nextPageToken || primary.nextPageToken || null,
        query: normalized,
        timestamp: Date.now(),
      };
    }

    return {
      success: true,
      results: primary.results,
      nextPageToken: primary.nextPageToken,
      query: normalized,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Movie search error:', error);
    return {
      success: false,
      error: error.message,
      results: [],
    };
  }
};

const getTrendingMovies = async () => {
  try {
    const data = await fetchYouTubeSearch({
      query: 'official movie trailer',
      maxResults: 24,
      videoCategoryId: null,
    });

    return {
      success: true,
      results: data.results,
      nextPageToken: data.nextPageToken,
      category: 'Trending Movies',
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Trending movie fetch error:', error);
    return {
      success: false,
      error: error.message,
      results: [],
    };
  }
};

const getMoviesByCategory = async (category, options = {}) => {
  try {
    const normalized = String(category || '').trim().toLowerCase();
    const query = normalized ? `${normalized} trailer` : 'movie trailer';

    const data = await fetchYouTubeSearch({
      query,
      maxResults: options.maxResults || 24,
      pageToken: options.pageToken || '',
      videoCategoryId: null,
    });

    return {
      success: true,
      results: data.results,
      nextPageToken: data.nextPageToken,
      category: normalized || 'movies',
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Category movie fetch error:', error);
    return {
      success: false,
      error: error.message,
      results: [],
    };
  }
};

module.exports = {
  youtubeMovieSearch,
  getTrendingMovies,
  getMoviesByCategory,
};
