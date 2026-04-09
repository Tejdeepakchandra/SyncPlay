/**
 * Movie Routes
 * Endpoints for movie trailer search and trending discovery.
 */

const express = require('express');
const router = express.Router();
const { youtubeMovieSearch, getTrendingMovies, getMoviesByCategory } = require('../services/movieService');

/**
 * POST /api/movies/search
 * Search for movies/trailers by query
 * Body: { query: string }
 */
router.post('/search', async (req, res) => {
  try {
    const { query, pageToken, maxResults } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const results = await youtubeMovieSearch(query, { pageToken, maxResults });
    res.json(results);
  } catch (error) {
    console.error('Movie search error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search movies',
      message: error.message
    });
  }
});

/**
 * GET /api/movies/trending
 * Get trending movie trailers
 */
router.get('/trending', async (req, res) => {
  try {
    const trending = await getTrendingMovies();
    res.json(trending);
  } catch (error) {
    console.error('Trending movie fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trending movies',
      message: error.message
    });
  }
});

/**
 * GET /api/movies/category/:category
 * Get movie trailers by category
 */
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { pageToken, maxResults } = req.query;
    const results = await getMoviesByCategory(category, { pageToken, maxResults });
    res.json(results);
  } catch (error) {
    console.error('Category movie fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch category movies',
      message: error.message
    });
  }
});

module.exports = router;
