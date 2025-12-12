const express = require('express');
const router = express.Router();
const NodeCache = require('node-cache');

// Cache selama 30 menit
const cache = new NodeCache({ stdTTL: 1800 });

// GET /api/dashboard/today - Statistik hari ini
router.get('/today', async (req, res) => {
  try {
    // Check cache
    const cached = cache.get('today_stats');
    if (cached) {
      return res.json({ data: cached, cached: true });
    }

    // Di production, ini akan fetch dari database
    // Untuk sekarang, kita return sample data
    const todayStats = {
      totalCatch: 245,
      activeTrips: 3,
      completedTrips: 2,
      avgCatch: 82,
      timestamp: new Date().toISOString()
    };

    // Save to cache
    cache.set('today_stats', todayStats);

    res.json({ data: todayStats, cached: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard/weekly - Performa 7 hari
router.get('/weekly', async (req, res) => {
  try {
    const cached = cache.get('weekly_stats');
    if (cached) {
      return res.json({ data: cached, cached: true });
    }

    // Sample data - di production fetch dari database
    const weeklyData = [
      { date: '6 Des', trips: 5, total: 342, avg: 68, zone: 'Zona A' },
      { date: '7 Des', trips: 3, total: 189, avg: 63, zone: 'Zona B' },
      { date: '8 Des', trips: 4, total: 298, avg: 75, zone: 'Zona A' },
      { date: '9 Des', trips: 5, total: 385, avg: 77, zone: 'Zona C' },
      { date: '10 Des', trips: 6, total: 428, avg: 71, zone: 'Zona A' },
      { date: '11 Des', trips: 4, total: 312, avg: 78, zone: 'Zona B' },
      { date: '12 Des', trips: 5, total: 245, avg: 49, zone: 'Zona A' }
    ];

    cache.set('weekly_stats', weeklyData);
    res.json({ data: weeklyData, cached: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard/top-fishermen - Top nelayan
router.get('/top-fishermen', async (req, res) => {
  try {
    const cached = cache.get('top_fishermen');
    if (cached) {
      return res.json({ data: cached, cached: true });
    }

    const topFishermen = [
      { name: 'Pak Andi', trips: 15, catch: 1245, avg: 83, rank: 1 },
      { name: 'Pak Budi', trips: 12, catch: 986, avg: 82, rank: 2 },
      { name: 'Pak Carli', trips: 10, catch: 754, avg: 75, rank: 3 }
    ];

    cache.set('top_fishermen', topFishermen);
    res.json({ data: topFishermen, cached: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard/zone-distribution
router.get('/zone-distribution', async (req, res) => {
  try {
    const cached = cache.get('zone_dist');
    if (cached) {
      return res.json({ data: cached, cached: true });
    }

    const distribution = [
      { name: 'Zona A', value: 45, color: '#10b981' },
      { name: 'Zona B', value: 32, color: '#3b82f6' },
      { name: 'Zona C', value: 28, color: '#f59e0b' },
      { name: 'Custom', value: 51, color: '#8b5cf6' }
    ];

    cache.set('zone_dist', distribution);
    res.json({ data: distribution, cached: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard/zones - Zona produktif
router.get('/zones', async (req, res) => {
  try {
    const cached = cache.get('productive_zones');
    if (cached) {
      return res.json({ data: cached, cached: true });
    }

    const zones = [
      { 
        name: 'Zona A', 
        lat: -6.9456, 
        lng: 105.6234, 
        trips: 45, 
        totalCatch: 3456, 
        avg: 77, 
        successRate: 82 
      },
      { 
        name: 'Zona B', 
        lat: -6.9123, 
        lng: 105.6789, 
        trips: 32, 
        totalCatch: 2234, 
        avg: 70, 
        successRate: 75 
      }
    ];

    cache.set('productive_zones', zones);
    res.json({ data: zones, cached: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
