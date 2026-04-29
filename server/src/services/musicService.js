/**
 * Music Service
 * YouTube Data API v3 integration for search and trending tracks.
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
        artist: snippet.channelTitle || 'Unknown Artist',
        channelTitle: snippet.channelTitle || 'Unknown Artist',
        thumbnail:
          snippet.thumbnails?.medium?.url ||
          snippet.thumbnails?.high?.url ||
          snippet.thumbnails?.default?.url ||
          `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        duration,
        views: formatViews(detail?.statistics?.viewCount),
        url: `https://music.youtube.com/watch?v=${id}`,
      };
    })
    .filter(Boolean);
};

const fetchYouTubeSearch = async (query, maxResults = 10) => {
  const key = getYouTubeApiKey();

  const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('videoCategoryId', '10');
  searchUrl.searchParams.set('maxResults', String(maxResults));
  searchUrl.searchParams.set('key', key);

  const searchResponse = await fetch(searchUrl.toString());
  if (!searchResponse.ok) {
    const text = await searchResponse.text();
    throw new Error(`YouTube search failed (${searchResponse.status}): ${text}`);
  }

  const searchData = await searchResponse.json();
  const videoIds = (searchData.items || []).map((i) => i?.id?.videoId).filter(Boolean);

  if (videoIds.length === 0) {
    return [];
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
  return mapYouTubeItems(searchData.items, videosData.items);
};

const youtubeSearch = async (query) => {
  try {
    const normalized = String(query || '').trim();
    if (!normalized) {
      return { success: false, error: 'Search query is required', results: [] };
    }

    const results = await fetchYouTubeSearch(normalized, 10);
    return {
      success: true,
      results,
      query: normalized,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('YouTube search error:', error);
    return {
      success: false,
      error: error.message,
      results: [],
    };
  }
};

const getTrendingMusic = async () => {
  try {
    const results = await fetchYouTubeSearch('trending music', 12);
    return {
      success: true,
      results,
      category: 'Trending',
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Trending music fetch error:', error);
    return {
      success: false,
      error: error.message,
      results: [],
    };
  }
};

const getMusicByCategory = async (category) => {
  try {
    const normalized = String(category || '').trim().toLowerCase();
    const query = normalized ? `${normalized} music` : 'music';
    const results = await fetchYouTubeSearch(query, 10);
    return {
      success: true,
      results,
      category: normalized || 'music',
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Category music fetch error:', error);
    return {
      success: false,
      error: error.message,
      results: [],
    };
  }
};

module.exports = {
  youtubeSearch,
  getTrendingMusic,
  getMusicByCategory
};
