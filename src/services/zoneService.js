// ============================================================================
// SMARTBAGAN - ZONE SERVICE
// File: backend/src/services/zoneService.js
// ============================================================================
// Service ini menghandle:
// 1. Fetch data dari NASA (Chlorophyll, SST)
// 2. Fetch data dari NOAA (Wave, Weather)
// 3. Fetch data dari OpenWeather (Wind)
// 4. Calculate moon phase
// 5. Calculate zone score
// ============================================================================

const axios = require('axios');
const NodeCache = require('node-cache');

// Cache selama 30 menit (1800 detik)
const cache = new NodeCache({ stdTTL: 1800 });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  zones: {
    A: { 
      name: 'Zona A',
      lat: parseFloat(process.env.ZONE_A_LAT || -6.9456), 
      lng: parseFloat(process.env.ZONE_A_LNG || 105.6234)
    },
    B: { 
      name: 'Zona B',
      lat: parseFloat(process.env.ZONE_B_LAT || -6.9123), 
      lng: parseFloat(process.env.ZONE_B_LNG || 105.6789)
    },
    C: { 
      name: 'Zona C',
      lat: parseFloat(process.env.ZONE_C_LAT || -6.8900), 
      lng: parseFloat(process.env.ZONE_C_LNG || 105.7000)
    }
  },
  apis: {
    nasa: process.env.NASA_BASE_URL || 'https://coastwatch.pfeg.noaa.gov/erddap',
    noaa: process.env.NOAA_BASE_URL || 'https://coastwatch.pfeg.noaa.gov/erddap',
    marine: process.env.MARINE_API_URL || 'https://marine-api.open-meteo.com/v1/marine',
    openWeather: process.env.OPENWEATHER_API_KEY
  }
};

// ============================================================================
// HELPER: FETCH WITH TIMEOUT & RETRY
// ============================================================================

async function fetchWithRetry(url, retries = 2, timeout = 10000) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await axios.get(url, { timeout });
      return response.data;
    } catch (error) {
      if (i === retries) throw error;
      console.log(`Retry ${i + 1}/${retries} for ${url}`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
    }
  }
}

// ============================================================================
// 1. FETCH CHLOROPHYLL DATA (NASA Ocean Color via ERDDAP)
// ============================================================================

async function getChlorophyllData(lat, lon, date) {
  try {
    console.log(`Fetching chlorophyll for (${lat}, ${lon}) on ${date}`);
    
    // ERDDAP URL for NASA VIIRS chlorophyll data
    const url = `${CONFIG.apis.nasa}/griddap/nesdisCWViirsSNPPChloDailyNRT.json?` +
      `chlor_a[(${date}T12:00:00Z)][(${lat})][(${lon})]`;
    
    const data = await fetchWithRetry(url);
    
    if (data.table && data.table.rows && data.table.rows.length > 0) {
      const chlorophyll = parseFloat(data.table.rows[0][3]);
      
      return {
        value: chlorophyll,
        unit: 'mg/m³',
        quality: chlorophyll > 0.5 ? 'high' : chlorophyll > 0.3 ? 'medium' : 'low',
        source: 'NASA VIIRS',
        timestamp: new Date().toISOString()
      };
    }
    
    throw new Error('No chlorophyll data available');
  } catch (error) {
    console.error('Chlorophyll fetch error:', error.message);
    // Return estimated value
    return {
      value: 0.35,
      unit: 'mg/m³',
      quality: 'medium',
      source: 'Estimated',
      error: error.message
    };
  }
}

// ============================================================================
// 2. FETCH SEA SURFACE TEMPERATURE (NOAA)
// ============================================================================

async function getSST(lat, lon, date) {
  try {
    console.log(`Fetching SST for (${lat}, ${lon}) on ${date}`);
    
    // NOAA ERDDAP for SST data
    const url = `${CONFIG.apis.noaa}/griddap/jplMURSST41.json?` +
      `analysed_sst[(${date}T09:00:00Z)][(${lat})][(${lon})]`;
    
    const data = await fetchWithRetry(url);
    
    if (data.table && data.table.rows && data.table.rows.length > 0) {
      const sstKelvin = parseFloat(data.table.rows[0][3]);
      const sstCelsius = sstKelvin - 273.15;
      
      return {
        value: parseFloat(sstCelsius.toFixed(2)),
        unit: '°C',
        quality: (sstCelsius >= 27 && sstCelsius <= 30) ? 'optimal' : 'suboptimal',
        source: 'NOAA MUR SST',
        timestamp: new Date().toISOString()
      };
    }
    
    throw new Error('No SST data available');
  } catch (error) {
    console.error('SST fetch error:', error.message);
    return {
      value: 28.5,
      unit: '°C',
      quality: 'optimal',
      source: 'Estimated',
      error: error.message
    };
  }
}

// ============================================================================
// 3. FETCH MARINE WEATHER (Wave Height)
// ============================================================================

async function getMarineWeather(lat, lon) {
  try {
    console.log(`Fetching marine weather for (${lat}, ${lon})`);
    
    const url = `${CONFIG.apis.marine}?` +
      `latitude=${lat}&longitude=${lon}&` +
      `current=wave_height,wave_direction,wave_period&timezone=Asia/Jakarta`;
    
    const data = await fetchWithRetry(url);
    
    if (data.current) {
      const waveHeight = parseFloat(data.current.wave_height) || 0;
      
      return {
        waveHeight: {
          value: waveHeight,
          unit: 'm',
          quality: waveHeight < 1.5 ? 'calm' : waveHeight < 2.5 ? 'moderate' : 'rough'
        },
        waveDirection: data.current.wave_direction || 0,
        wavePeriod: data.current.wave_period || 0,
        source: 'Open-Meteo Marine',
        timestamp: new Date().toISOString()
      };
    }
    
    throw new Error('No marine weather data available');
  } catch (error) {
    console.error('Marine weather fetch error:', error.message);
    return {
      waveHeight: {
        value: 0.8,
        unit: 'm',
        quality: 'calm'
      },
      waveDirection: 90,
      wavePeriod: 5,
      source: 'Estimated',
      error: error.message
    };
  }
}

// ============================================================================
// 4. FETCH WIND DATA (OpenWeather)
// ============================================================================

async function getWindData(lat, lon) {
  try {
    if (!CONFIG.apis.openWeather) {
      throw new Error('OpenWeather API key not configured');
    }
    
    console.log(`Fetching wind data for (${lat}, ${lon})`);
    
    const url = `https://api.openweathermap.org/data/2.5/weather?` +
      `lat=${lat}&lon=${lon}&appid=${CONFIG.apis.openWeather}&units=metric`;
    
    const data = await fetchWithRetry(url);
    
    if (data.wind) {
      const windSpeed = parseFloat(data.wind.speed) || 0;
      
      return {
        speed: {
          value: windSpeed,
          unit: 'm/s',
          quality: windSpeed < 5 ? 'calm' : windSpeed < 10 ? 'moderate' : 'strong'
        },
        direction: data.wind.deg || 0,
        gust: data.wind.gust || null,
        source: 'OpenWeather',
        timestamp: new Date().toISOString()
      };
    }
    
    throw new Error('No wind data available');
  } catch (error) {
    console.error('Wind fetch error:', error.message);
    return {
      speed: {
        value: 4.5,
        unit: 'm/s',
        quality: 'calm'
      },
      direction: 90,
      gust: null,
      source: 'Estimated',
      error: error.message
    };
  }
}

// ============================================================================
// 5. CALCULATE MOON PHASE
// ============================================================================

function getMoonPhase(date) {
  try {
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    
    // Julian Day calculation
    let jd = 367 * year - Math.floor((7 * (year + Math.floor((month + 9) / 12))) / 4) + 
             Math.floor((275 * month) / 9) + day + 1721013.5;
    
    // Days since known new moon
    const daysSinceNew = jd - 2451549.5;
    const newMoons = daysSinceNew / 29.53;
    const phase = (newMoons - Math.floor(newMoons));
    const illumination = Math.round(phase * 100);
    
    let phaseName = '';
    if (illumination < 6.25) phaseName = 'New Moon';
    else if (illumination < 18.75) phaseName = 'Waxing Crescent';
    else if (illumination < 31.25) phaseName = 'First Quarter';
    else if (illumination < 43.75) phaseName = 'Waxing Gibbous';
    else if (illumination < 56.25) phaseName = 'Full Moon';
    else if (illumination < 68.75) phaseName = 'Waning Gibbous';
    else if (illumination < 81.25) phaseName = 'Last Quarter';
    else phaseName = 'Waning Crescent';
    
    return {
      illumination: illumination,
      phase: phaseName,
      quality: illumination < 30 ? 'excellent' : illumination < 60 ? 'good' : 'poor',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Moon phase calculation error:', error);
    return {
      illumination: 25,
      phase: 'Waxing Crescent',
      quality: 'excellent',
      error: error.message
    };
  }
}

// ============================================================================
// 6. CALCULATE ZONE SCORE (0-100)
// ============================================================================

function calculateZoneScore(data) {
  let score = 0;
  let maxScore = 0;
  const breakdown = {};
  
  // 1. Chlorophyll Score (30 points)
  maxScore += 30;
  if (data.chlorophyll) {
    const chl = data.chlorophyll.value;
    if (chl > 0.5) {
      score += 30;
      breakdown.chlorophyll = { score: 30, max: 30, rating: 'Excellent' };
    } else if (chl > 0.3) {
      score += 20;
      breakdown.chlorophyll = { score: 20, max: 30, rating: 'Good' };
    } else if (chl > 0.1) {
      score += 10;
      breakdown.chlorophyll = { score: 10, max: 30, rating: 'Fair' };
    } else {
      breakdown.chlorophyll = { score: 0, max: 30, rating: 'Poor' };
    }
  }
  
  // 2. SST Score (25 points)
  maxScore += 25;
  if (data.sst) {
    const temp = data.sst.value;
    if (temp >= 27 && temp <= 30) {
      score += 25;
      breakdown.sst = { score: 25, max: 25, rating: 'Optimal' };
    } else if (temp >= 25 && temp <= 32) {
      score += 15;
      breakdown.sst = { score: 15, max: 25, rating: 'Good' };
    } else if (temp >= 23 && temp <= 34) {
      score += 5;
      breakdown.sst = { score: 5, max: 25, rating: 'Fair' };
    } else {
      breakdown.sst = { score: 0, max: 25, rating: 'Poor' };
    }
  }
  
  // 3. Moon Phase Score (20 points)
  maxScore += 20;
  if (data.moon) {
    const illum = data.moon.illumination;
    if (illum < 30) {
      score += 20;
      breakdown.moon = { score: 20, max: 20, rating: 'Excellent' };
    } else if (illum < 50) {
      score += 15;
      breakdown.moon = { score: 15, max: 20, rating: 'Good' };
    } else if (illum < 70) {
      score += 10;
      breakdown.moon = { score: 10, max: 20, rating: 'Fair' };
    } else {
      score += 5;
      breakdown.moon = { score: 5, max: 20, rating: 'Poor' };
    }
  }
  
  // 4. Wave Condition Score (15 points)
  maxScore += 15;
  if (data.waveHeight) {
    const wave = data.waveHeight.value;
    if (wave < 1.0) {
      score += 15;
      breakdown.wave = { score: 15, max: 15, rating: 'Calm' };
    } else if (wave < 1.5) {
      score += 10;
      breakdown.wave = { score: 10, max: 15, rating: 'Moderate' };
    } else if (wave < 2.0) {
      score += 5;
      breakdown.wave = { score: 5, max: 15, rating: 'Choppy' };
    } else {
      breakdown.wave = { score: 0, max: 15, rating: 'Rough' };
    }
  }
  
  // 5. Wind Score (10 points)
  maxScore += 10;
  if (data.wind) {
    const wind = data.wind.speed.value;
    if (wind < 5) {
      score += 10;
      breakdown.wind = { score: 10, max: 10, rating: 'Calm' };
    } else if (wind < 7) {
      score += 7;
      breakdown.wind = { score: 7, max: 10, rating: 'Light' };
    } else if (wind < 10) {
      score += 4;
      breakdown.wind = { score: 4, max: 10, rating: 'Moderate' };
    } else {
      breakdown.wind = { score: 0, max: 10, rating: 'Strong' };
    }
  }
  
  const finalScore = Math.round((score / maxScore) * 100);
  
  return {
    score: finalScore,
    breakdown: breakdown,
    maxScore: maxScore,
    actualScore: score
  };
}

// ============================================================================
// 7. MAIN FUNCTION - GET ZONE RECOMMENDATIONS
// ============================================================================

async function getZoneRecommendations(date) {
  try {
    // Check cache first
    const cacheKey = `zones_${date}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log('Returning cached zone recommendations');
      return cached;
    }
    
    console.log(`\n====== Fetching Zone Recommendations for ${date} ======`);
    
    const recommendations = [];
    
    // Fetch data untuk setiap zona secara parallel
    const zonePromises = Object.entries(CONFIG.zones).map(async ([zoneId, zoneInfo]) => {
      try {
        console.log(`\nProcessing ${zoneInfo.name}...`);
        
        // Fetch semua data secara parallel
        const [chlorophyll, sst, marine, wind, moon] = await Promise.all([
          getChlorophyllData(zoneInfo.lat, zoneInfo.lng, date),
          getSST(zoneInfo.lat, zoneInfo.lng, date),
          getMarineWeather(zoneInfo.lat, zoneInfo.lng),
          getWindData(zoneInfo.lat, zoneInfo.lng),
          Promise.resolve(getMoonPhase(date)) // Sync function wrapped in Promise
        ]);
        
        // Calculate score
        const scoreResult = calculateZoneScore({
          chlorophyll,
          sst,
          waveHeight: marine.waveHeight,
          wind,
          moon
        });
        
        return {
          zoneId: zoneId,
          zoneName: zoneInfo.name,
          coordinates: {
            latitude: zoneInfo.lat,
            longitude: zoneInfo.lng
          },
          score: scoreResult.score,
          scoreBreakdown: scoreResult.breakdown,
          data: {
            chlorophyll,
            sst,
            marine,
            wind,
            moon
          },
          predictedCatch: {
            min: Math.round(scoreResult.score * 0.6),
            max: Math.round(scoreResult.score * 0.9),
            unit: 'kg'
          },
          recommendation: scoreResult.score >= 80 ? 'Highly Recommended' :
                         scoreResult.score >= 60 ? 'Recommended' :
                         scoreResult.score >= 40 ? 'Fair' : 'Not Recommended',
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error(`Error processing ${zoneInfo.name}:`, error.message);
        return null;
      }
    });
    
    // Wait for all zones
    const results = await Promise.all(zonePromises);
    
    // Filter out nulls and sort by score
    const validResults = results
      .filter(r => r !== null)
      .sort((a, b) => b.score - a.score);
    
    console.log(`\n====== Zone Recommendations Complete ======`);
    console.log(`Found ${validResults.length} zones with valid data`);
    
    // Cache for 30 minutes
    cache.set(cacheKey, validResults);
    
    return validResults;
    
  } catch (error) {
    console.error('Error getting zone recommendations:', error);
    throw error;
  }
}

// ============================================================================
// 8. GET ZONE DETAIL
// ============================================================================

async function getZoneDetail(zoneId) {
  const zone = CONFIG.zones[zoneId.toUpperCase()];
  if (!zone) {
    return null;
  }
  
  const date = new Date().toISOString().split('T')[0];
  const recommendations = await getZoneRecommendations(date);
  
  return recommendations.find(r => r.zoneId === zoneId.toUpperCase());
}

// ============================================================================
// 9. GET ALL ZONES
// ============================================================================

async function getAllZones() {
  return Object.entries(CONFIG.zones).map(([id, zone]) => ({
    id,
    name: zone.name,
    coordinates: {
      latitude: zone.lat,
      longitude: zone.lng
    }
  }));
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  getZoneRecommendations,
  getZoneDetail,
  getAllZones,
  // Export individual functions for testing
  getChlorophyllData,
  getSST,
  getMarineWeather,
  getWindData,
  getMoonPhase,
  calculateZoneScore
};