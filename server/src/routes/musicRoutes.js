/**
 * Music Routes
 * Endpoints for music search, trending, and library management
 */

const express = require('express');
const router = express.Router();
const { youtubeSearch, getTrendingMusic, getMusicByCategory } = require('../services/musicService');

/**
 * POST /api/music/search
 * Search for music by query
 * Body: { query: string }
 */
router.post('/search', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const results = await youtubeSearch(query);
    res.json(results);
  } catch (error) {
    console.error('Music search error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search music',
      message: error.message
    });
  }
});

/**
 * GET /api/music/trending
 * Get trending music
 */
router.get('/trending', async (req, res) => {
  try {
    const trending = await getTrendingMusic();
    res.json(trending);
  } catch (error) {
    console.error('Trending music fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trending music',
      message: error.message
    });
  }
});

/**
 * GET /api/music/category/:category
 * Get music by category
 */
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const results = await getMusicByCategory(category);
    res.json(results);
  } catch (error) {
    console.error('Category music fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch category music',
      message: error.message
    });
  }
});

module.exports = router;
