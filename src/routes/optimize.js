// ============================================================================
// SMARTBAGAN - OPTIMIZATION API ROUTES
// File: backend/src/routes/optimize.js (NEW FILE)
// ============================================================================

const express = require('express');
const router = express.Router();
const optimizer = require('../services/optimizerService');
const zoneService = require('../services/zoneService');

// ============================================================================
// POST /api/optimize/analyze - Main optimization endpoint
// ============================================================================

router.post('/analyze', async (req, res) => {
  try {
    const { 
      kapalPosition,
      currentBagans,
      scanRadius = 5,  // km
      date 
    } = req.body;
    
    // Validation
    if (!kapalPosition || !currentBagans || currentBagans.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: kapalPosition, currentBagans'
      });
    }
    
    console.log(`\n🎯 Optimization request for ${currentBagans.length} bagans`);
    
    // Step 1: Scan area for candidate spots
    console.log(`Scanning ${scanRadius}km radius for potential spots...`);
    
    const candidateSpots = await scanAreaForSpots(
      kapalPosition,
      currentBagans,
      scanRadius,
      date || new Date().toISOString().split('T')[0]
    );
    
    console.log(`Found ${candidateSpots.length} candidate spots`);
    
    // Step 2: Run optimization
    const result = await optimizer.optimizeBaganOperations({
      kapalPosition,
      currentBagans,
      candidateSpots
    });
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('Optimization error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Helper: Scan area for potential spots
// ============================================================================

async function scanAreaForSpots(center, currentBagans, radiusKm, date) {
  const spots = [];
  const gridSize = 0.5; // km between grid points
  const stepsPerSide = Math.ceil(radiusKm / gridSize);
  
  // Calculate approximate degrees per km
  const kmPerDegreeLat = 111; // roughly constant
  const kmPerDegreeLng = 111 * Math.cos(center.lat * Math.PI / 180);
  
  const degPerStepLat = gridSize / kmPerDegreeLat;
  const degPerStepLng = gridSize / kmPerDegreeLng;
  
  // Grid search around center
  let spotId = 1;
  for (let latStep = -stepsPerSide; latStep <= stepsPerSide; latStep++) {
    for (let lngStep = -stepsPerSide; lngStep <= stepsPerSide; lngStep++) {
      const lat = center.lat + (latStep * degPerStepLat);
      const lng = center.lng + (lngStep * degPerStepLng);
      
      // Check if within radius
      const dist = optimizer.calculateDistance(center.lat, center.lng, lat, lng);
      if (dist > radiusKm) continue;
      
      // Skip if too close to existing bagan positions
      const tooClose = currentBagans.some(bagan => {
        const distToBagan = optimizer.calculateDistance(bagan.lat, bagan.lng, lat, lng);
        return distToBagan < 0.3; // Skip if <300m from existing bagan
      });
      if (tooClose) continue;
      
      // Get score for this location
      // In production, this would call zoneService to get real score
      // For now, simulate with nearby zone scores
      const score = await estimateScoreForLocation(lat, lng, date);
      
      if (score >= 70) { // Only include decent spots
        spots.push({
          id: `SPOT_${spotId++}`,
          name: `Candidate ${spotId}`,
          lat: parseFloat(lat.toFixed(4)),
          lng: parseFloat(lng.toFixed(4)),
          score: score,
          estimatedCatch: optimizer.estimateCatch(score)
        });
      }
    }
  }
  
  // Sort by score descending
  spots.sort((a, b) => b.score - a.score);
  
  // Return top 20 candidates
  return spots.slice(0, 20);
}

// ============================================================================
// Helper: Estimate score for a location
// ============================================================================

async function estimateScoreForLocation(lat, lng, date) {
  try {
    // Try to get real data from zone service
    // This creates a temporary zone to get score
    const tempZone = {
      lat: lat,
      lng: lng,
      name: 'Temp'
    };
    
    // Get oceanographic data
    const [chlorophyll, sst, marine, wind, moon] = await Promise.all([
      zoneService.getChlorophyllData(lat, lng, date),
      zoneService.getSST(lat, lng, date),
      zoneService.getMarineWeather(lat, lng),
      zoneService.getWindData(lat, lng),
      Promise.resolve(zoneService.getMoonPhase(date))
    ]);
    
    // Calculate score
    const scoreResult = zoneService.calculateZoneScore({
      chlorophyll,
      sst,
      waveHeight: marine.waveHeight,
      wind,
      moon
    });
    
    return scoreResult.score;
    
  } catch (error) {
    // Fallback: estimate based on nearby known zones
    // Use simple interpolation or return average
    console.warn(`Could not get real score for (${lat}, ${lng}), using estimate`);
    return 75; // Default middle score
  }
}

// ============================================================================
// POST /api/optimize/quick-check - Quick check if should move
// ============================================================================

router.post('/quick-check', async (req, res) => {
  try {
    const { bagan, targetSpot } = req.body;
    
    if (!bagan || !targetSpot) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: bagan, targetSpot'
      });
    }
    
    const decision = optimizer.shouldMoveBagan(bagan, targetSpot);
    
    res.json({
      success: true,
      data: decision
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET /api/optimize/config - Get current optimization config
// ============================================================================

router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: optimizer.CONFIG
  });
});

// ============================================================================
// PUT /api/optimize/config - Update optimization config
// ============================================================================

router.put('/config', (req, res) => {
  try {
    const updates = req.body;
    
    // Update config (in production, save to database)
    Object.assign(optimizer.CONFIG, updates);
    
    res.json({
      success: true,
      data: optimizer.CONFIG,
      message: 'Configuration updated'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;