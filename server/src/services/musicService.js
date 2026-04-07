/**
 * Music Service
 * Handles music search and source integration (YouTube, Uploads, etc.)
 */

// Simple YouTube search using youtube-search-api
// In production, consider using official YouTube Data API v3 for better results
const youtubeSearch = async (query) => {
  try {
    // This is a mock implementation - in production use:
    // const yts = require('yt-search');
    // const results = await yts(query);
    
    // For now, return mock data structure that matches real API responses
    // This allows frontend development to continue while API is being set up
    
    return {
      success: true,
      results: [
        {
          id: `video_${Math.random().toString(36).substr(2, 9)}`,
          title: `"${query}" - Track 1`,
          artist: "Various Artists",
          thumbnail: `https://img.youtube.com/vi/placeholder1/default.jpg`,
          duration: 245,
          views: "1.2M",
          url: "https://music.youtube.com/watch?v=mock1"
        },
        {
          id: `video_${Math.random().toString(36).substr(2, 9)}`,
          title: `"${query}" - Track 2`,
          artist: "Top Artists",
          thumbnail: `https://img.youtube.com/vi/placeholder2/default.jpg`,
          duration: 198,
          views: "856K",
          url: "https://music.youtube.com/watch?v=mock2"
        },
        {
          id: `video_${Math.random().toString(36).substr(2, 9)}`,
          title: `"${query}" - Track 3`,
          artist: "Music Collection",
          thumbnail: `https://img.youtube.com/vi/placeholder3/default.jpg`,
          duration: 287,
          views: "2.1M",
          url: "https://music.youtube.com/watch?v=mock3"
        },
      ],
      query,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('YouTube search error:', error);
    return {
      success: false,
      error: error.message,
      results: []
    };
  }
};

// Get trending music
const getTrendingMusic = async () => {
  try {
    return {
      success: true,
      results: [
        {
          id: "trending_1",
          title: "Blinding Lights",
          artist: "The Weeknd",
          thumbnail: "https://img.youtube.com/vi/4NRXx6U8ABQ/default.jpg",
          duration: 200,
          views: "3.2B",
          url: "https://music.youtube.com/watch?v=blinding"
        },
        {
          id: "trending_2",
          title: "Heat Waves",
          artist: "Glass Animals",
          thumbnail: "https://img.youtube.com/vi/mRD0-GxVB1w/default.jpg",
          duration: 239,
          views: "2.8B",
          url: "https://music.youtube.com/watch?v=heatwaves"
        },
        {
          id: "trending_3",
          title: "Levitating",
          artist: "Dua Lipa",
          thumbnail: "https://img.youtube.com/vi/TUVcZfQe-Kw/default.jpg",
          duration: 203,
          views: "2.5B",
          url: "https://music.youtube.com/watch?v=levitating"
        },
      ],
      category: "Trending",
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Trending music fetch error:', error);
    return {
      success: false,
      error: error.message,
      results: []
    };
  }
};

// Get music by genre/category
const getMusicByCategory = async (category) => {
  try {
    const categoryData = {
      "pop": [
        {
          id: "pop_1",
          title: "Anti-Hero",
          artist: "Taylor Swift",
          thumbnail: "https://img.youtube.com/vi/Z7Hlc4p2rX8/default.jpg",
          duration: 228,
          views: "1.9B",
          url: "https://music.youtube.com/watch?v=antihero"
        }
      ],
      "rock": [
        {
          id: "rock_1",
          title: "Bohemian Rhapsody",
          artist: "Queen",
          thumbnail: "https://img.youtube.com/vi/fJ9rUzIMt7o/default.jpg",
          duration: 354,
          views: "1.2B",
          url: "https://music.youtube.com/watch?v=bohemian"
        }
      ],
      "hiphop": [
        {
          id: "hiphop_1",
          title: "HUMBLE.",
          artist: "Kendrick Lamar",
          thumbnail: "https://img.youtube.com/vi/tvTRZJ-4EyI/default.jpg",
          duration: 177,
          views: "1.8B",
          url: "https://music.youtube.com/watch?v=humble"
        }
      ],
      "edm": [
        {
          id: "edm_1",
          title: "Animals",
          artist: "Martin Garrix",
          thumbnail: "https://img.youtube.com/vi/gCYcHz2k-KU/default.jpg",
          duration: 218,
          views: "2.2B",
          url: "https://music.youtube.com/watch?v=animals"
        }
      ]
    };

    return {
      success: true,
      results: categoryData[category.toLowerCase()] || [],
      category,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Category music fetch error:', error);
    return {
      success: false,
      error: error.message,
      results: []
    };
  }
};

module.exports = {
  youtubeSearch,
  getTrendingMusic,
  getMusicByCategory
};
