const express = require('express');
const router = express.Router();
const zoneService = require('../services/zoneService');

// GET /api/zones/recommendations - Rekomendasi zona dengan data real-time
router.get('/recommendations', async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    console.log(`Fetching zone recommendations for date: ${targetDate}`);

    // Fetch recommendations dari service
    const recommendations = await zoneService.getZoneRecommendations(targetDate);

    res.json({
      success: true,
      data: recommendations,
      date: targetDate,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      fallback: 'Using sample data due to API error'
    });
  }
});

// GET /api/zones/:zoneId - Detail zona spesifik
router.get('/:zoneId', async (req, res) => {
  try {
    const { zoneId } = req.params;
    const zoneData = await zoneService.getZoneDetail(zoneId);

    if (!zoneData) {
      return res.status(404).json({
        success: false,
        error: 'Zone not found'
      });
    }

    res.json({
      success: true,
      data: zoneData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/zones - List semua zona
router.get('/', async (req, res) => {
  try {
    const zones = await zoneService.getAllZones();

    res.json({
      success: true,
      data: zones,
      count: zones.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
