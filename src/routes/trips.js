const express = require('express');
const router = express.Router();

// Sample trip storage (in-memory, akan diganti dengan database)
let trips = [];
let tripIdCounter = 1;

// GET /api/trips - Get all trips
router.get('/', (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      fisherman, 
      zone, 
      limit = 50 
    } = req.query;

    let filteredTrips = [...trips];

    // Filter by date range
    if (startDate) {
      filteredTrips = filteredTrips.filter(t => 
        new Date(t.tripDate) >= new Date(startDate)
      );
    }
    if (endDate) {
      filteredTrips = filteredTrips.filter(t => 
        new Date(t.tripDate) <= new Date(endDate)
      );
    }

    // Filter by fisherman
    if (fisherman) {
      filteredTrips = filteredTrips.filter(t => 
        t.fisherman.toLowerCase().includes(fisherman.toLowerCase())
      );
    }

    // Filter by zone
    if (zone) {
      filteredTrips = filteredTrips.filter(t => t.zone === zone);
    }

    // Limit results
    filteredTrips = filteredTrips.slice(0, parseInt(limit));

    res.json({
      success: true,
      data: filteredTrips,
      count: filteredTrips.length,
      total: trips.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/trips - Create new trip
router.post('/', (req, res) => {
  try {
    const {
      tripDate,
      fisherman,
      boat,
      zone,
      latitude,
      longitude,
      catchKg,
      quality,
      departureTime,
      returnTime,
      lampType,
      notes
    } = req.body;

    // Validation
    if (!tripDate || !fisherman || !boat || !catchKg) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tripDate, fisherman, boat, catchKg'
      });
    }

    // Create trip object
    const newTrip = {
      id: tripIdCounter++,
      tripDate,
      fisherman,
      boat,
      zone: zone || 'Custom',
      latitude: latitude || null,
      longitude: longitude || null,
      catchKg: parseFloat(catchKg),
      quality: quality || 'good',
      departureTime: departureTime || null,
      returnTime: returnTime || null,
      lampType: lampType || 'LED',
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    trips.push(newTrip);

    res.status(201).json({
      success: true,
      data: newTrip,
      message: 'Trip recorded successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/trips/:id - Get trip by ID
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const trip = trips.find(t => t.id === parseInt(id));

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    res.json({
      success: true,
      data: trip
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT /api/trips/:id - Update trip
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const tripIndex = trips.findIndex(t => t.id === parseInt(id));

    if (tripIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    // Update trip
    trips[tripIndex] = {
      ...trips[tripIndex],
      ...req.body,
      updatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: trips[tripIndex],
      message: 'Trip updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/trips/:id - Delete trip
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const tripIndex = trips.findIndex(t => t.id === parseInt(id));

    if (tripIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    trips.splice(tripIndex, 1);

    res.json({
      success: true,
      message: 'Trip deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;