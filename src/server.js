// ============================================================================
// SMARTBAGAN BACKEND - server.js
// ============================================================================
// File ini adalah main entry point untuk backend API
// Taruh di: backend/src/server.js

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables dari file .env
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================================
// MIDDLEWARE
// ============================================================================

// CORS - biar frontend bisa akses backend
app.use(cors({
  origin: '*', // Untuk development. Di production ganti dengan domain frontend kamu
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Parse JSON request body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware - biar kita tau ada request masuk
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// IMPORT ROUTES
// ============================================================================

const dashboardRoutes = require('./routes/dashboard');
const zoneRoutes = require('./routes/zones');
const tripRoutes = require('./routes/trips');

// ============================================================================
// ROUTES
// ============================================================================

// Health check endpoint - untuk test server running
app.get('/', (req, res) => {
  res.json({
    message: '🐟 SmartBagan API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/trips', tripRoutes);

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API is working!',
    env: {
      hasOpenWeatherKey: !!process.env.OPENWEATHER_API_KEY,
      port: PORT
    }
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 Handler - kalau route tidak ditemukan
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================================================
// START SERVER
// ============================================================================

const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║            🐟 SMARTBAGAN API SERVER                        ║
║                                                            ║
║  Status: RUNNING ✅                                        ║
║  Port: ${PORT}                                              ║
║  URL: http://localhost:${PORT}                             ║
║                                                            ║
║  Test: http://localhost:${PORT}/api/test                   ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

module.exports = app;
