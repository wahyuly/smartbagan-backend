// ============================================================================
// SMARTBAGAN - MULTI-BAGAN OPTIMIZATION SYSTEM
// Solves: Which bagan to move? In what order? Is it worth it?
// ============================================================================

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Economic parameters
  fuelPricePerLiter: 10000,        // Rp per liter
  fuelConsumptionTow: 4,           // liter per km when towing bagan
  catchPricePerKg: 35000,          // Rp per kg ikan teri
  minProfitThreshold: 50000,       // Min Rp profit to justify moving
  
  // Operational parameters
  towSpeedKnots: 2.5,              // Speed when towing (slow!)
  setupTimeMinutes: 20,            // Time to hook/unhook bagan
  
  // Geographic constraints
  maxTowDistance: 5,               // Max km willing to tow
  safeZone: {
    center: { lat: -6.7500, lng: 105.5200 },
    radiusKm: 10                   // Stay within 10km from base area
  },
  
  // Island/reef locations (natural fish aggregation)
  islands: [
    { name: 'Pulau Badul', lat: -6.7450, lng: 105.5150 },
    { name: 'Pulau Tinjil', lat: -6.7300, lng: 105.5000 },
    { name: 'Karang Bokor', lat: -6.7600, lng: 105.5300 }
  ]
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

// Calculate tow time in minutes
function calculateTowTime(distanceKm) {
  const distanceNM = distanceKm * 0.539957; // km to nautical miles
  const hours = distanceNM / CONFIG.towSpeedKnots;
  return hours * 60; // convert to minutes
}

// Calculate fuel cost
function calculateFuelCost(distanceKm) {
  const liters = distanceKm * CONFIG.fuelConsumptionTow;
  return liters * CONFIG.fuelPricePerLiter;
}

// Estimate catch based on score
function estimateCatch(score) {
  // Simple linear model: score 0-100 → catch 0-100 kg
  // Can be improved with ML later
  const baseMin = score * 0.6;
  const baseMax = score * 0.9;
  return {
    min: Math.round(baseMin),
    max: Math.round(baseMax),
    avg: Math.round((baseMin + baseMax) / 2)
  };
}

// Check if location is near island (bonus for fish aggregation)
function nearIslandBonus(lat, lng) {
  let bonus = 0;
  for (const island of CONFIG.islands) {
    const dist = calculateDistance(lat, lng, island.lat, island.lng);
    if (dist < 0.5) bonus += 5;      // <500m: +5 score
    else if (dist < 1.0) bonus += 3; // <1km: +3 score
    else if (dist < 2.0) bonus += 1; // <2km: +1 score
  }
  return Math.min(bonus, 10); // Max +10 bonus
}

// ============================================================================
// DECISION: SHOULD MOVE THIS BAGAN?
// ============================================================================

function shouldMoveBagan(currentBagan, targetSpot) {
  const distance = calculateDistance(
    currentBagan.lat, currentBagan.lng,
    targetSpot.lat, targetSpot.lng
  );
  
  // Check constraints
  if (distance > CONFIG.maxTowDistance) {
    return {
      shouldMove: false,
      reason: `Too far (${distance.toFixed(1)} km > ${CONFIG.maxTowDistance} km max)`
    };
  }
  
  // Calculate costs
  const towTime = calculateTowTime(distance);
  const setupTime = CONFIG.setupTimeMinutes;
  const totalTime = towTime + setupTime;
  const fuelCost = calculateFuelCost(distance);
  
  // Calculate expected catch
  const currentCatch = estimateCatch(currentBagan.score);
  const targetCatch = estimateCatch(targetSpot.score);
  const extraCatchAvg = targetCatch.avg - currentCatch.avg;
  
  // Revenue calculation
  const extraRevenue = extraCatchAvg * CONFIG.catchPricePerKg;
  const netProfit = extraRevenue - fuelCost;
  const roi = fuelCost > 0 ? (netProfit / fuelCost) * 100 : 0;
  
  // Decision logic
  const shouldMove = netProfit >= CONFIG.minProfitThreshold;
  
  return {
    shouldMove,
    analysis: {
      currentScore: currentBagan.score,
      targetScore: targetSpot.score,
      scoreDelta: targetSpot.score - currentBagan.score,
      distance: parseFloat(distance.toFixed(2)),
      towTime: Math.round(towTime),
      setupTime: setupTime,
      totalTime: Math.round(totalTime),
      fuelCost: Math.round(fuelCost),
      currentExpectedCatch: currentCatch,
      targetExpectedCatch: targetCatch,
      extraCatch: extraCatchAvg,
      extraRevenue: Math.round(extraRevenue),
      netProfit: Math.round(netProfit),
      roi: Math.round(roi),
      worthIt: shouldMove
    }
  };
}

// ============================================================================
// FIND BEST SPOT FOR EACH BAGAN
// ============================================================================

async function findBestSpots(currentBagans, availableSpots) {
  const recommendations = [];
  
  for (const bagan of currentBagans) {
    let bestSpot = null;
    let bestAnalysis = null;
    let maxProfit = CONFIG.minProfitThreshold;
    
    // Evaluate each available spot
    for (const spot of availableSpots) {
      const decision = shouldMoveBagan(bagan, spot);
      
      if (decision.shouldMove && decision.analysis.netProfit > maxProfit) {
        maxProfit = decision.analysis.netProfit;
        bestSpot = spot;
        bestAnalysis = decision.analysis;
      }
    }
    
    recommendations.push({
      bagan: bagan,
      recommendation: bestSpot ? {
        action: 'move',
        targetSpot: bestSpot,
        analysis: bestAnalysis
      } : {
        action: 'stay',
        reason: bestAnalysis ? 'Not profitable enough' : 'No better spot found',
        currentAnalysis: {
          score: bagan.score,
          expectedCatch: estimateCatch(bagan.score)
        }
      }
    });
  }
  
  return recommendations;
}

// ============================================================================
// ROUTE OPTIMIZATION (TSP Solver)
// ============================================================================

function optimizeRoute(kapalPosition, bagansToMove) {
  if (bagansToMove.length === 0) return null;
  if (bagansToMove.length === 1) {
    return {
      route: [bagansToMove[0]],
      totalDistance: calculateDistance(
        kapalPosition.lat, kapalPosition.lng,
        bagansToMove[0].bagan.lat, bagansToMove[0].bagan.lng
      ),
      totalTime: 0
    };
  }
  
  // For small N (≤4), brute force all permutations
  const permutations = generatePermutations(bagansToMove);
  let bestRoute = null;
  let minDistance = Infinity;
  
  for (const perm of permutations) {
    let distance = 0;
    let currentPos = kapalPosition;
    
    // Calculate total distance for this route
    for (const item of perm) {
      // Distance to pickup bagan
      distance += calculateDistance(
        currentPos.lat, currentPos.lng,
        item.bagan.lat, item.bagan.lng
      );
      
      // Distance to tow to target
      distance += calculateDistance(
        item.bagan.lat, item.bagan.lng,
        item.recommendation.targetSpot.lat,
        item.recommendation.targetSpot.lng
      );
      
      // Update current position
      currentPos = item.recommendation.targetSpot;
    }
    
    if (distance < minDistance) {
      minDistance = distance;
      bestRoute = perm;
    }
  }
  
  // Calculate detailed route info
  const routeDetails = [];
  let currentPos = kapalPosition;
  let cumulativeTime = 0;
  let cumulativeDistance = 0;
  
  for (let i = 0; i < bestRoute.length; i++) {
    const item = bestRoute[i];
    
    // Distance to pickup
    const distToPickup = calculateDistance(
      currentPos.lat, currentPos.lng,
      item.bagan.lat, item.bagan.lng
    );
    
    // Distance to tow
    const distToTow = item.recommendation.analysis.distance;
    
    // Times
    const timeToPickup = calculateTowTime(distToPickup);
    const timeToTow = item.recommendation.analysis.towTime;
    const setupTime = CONFIG.setupTimeMinutes;
    
    const stepDistance = distToPickup + distToTow;
    const stepTime = timeToPickup + timeToTow + setupTime;
    
    cumulativeDistance += stepDistance;
    cumulativeTime += stepTime;
    
    routeDetails.push({
      step: i + 1,
      baganId: item.bagan.id,
      baganName: item.bagan.name,
      action: 'pickup',
      from: currentPos,
      pickupLocation: { lat: item.bagan.lat, lng: item.bagan.lng },
      targetLocation: item.recommendation.targetSpot,
      distanceToPickup: parseFloat(distToPickup.toFixed(2)),
      distanceToTow: parseFloat(distToTow.toFixed(2)),
      totalStepDistance: parseFloat(stepDistance.toFixed(2)),
      timeToPickup: Math.round(timeToPickup),
      timeToTow: Math.round(timeToTow),
      setupTime: setupTime,
      totalStepTime: Math.round(stepTime),
      cumulativeDistance: parseFloat(cumulativeDistance.toFixed(2)),
      cumulativeTime: Math.round(cumulativeTime),
      targetScore: item.recommendation.targetSpot.score,
      expectedProfit: item.recommendation.analysis.netProfit
    });
    
    currentPos = item.recommendation.targetSpot;
  }
  
  return {
    route: routeDetails,
    summary: {
      totalBagans: bestRoute.length,
      totalDistance: parseFloat(cumulativeDistance.toFixed(2)),
      totalTime: Math.round(cumulativeTime),
      totalFuelCost: Math.round(calculateFuelCost(cumulativeDistance)),
      totalExpectedProfit: bestRoute.reduce((sum, item) => 
        sum + item.recommendation.analysis.netProfit, 0
      )
    }
  };
}

// Generate all permutations (for TSP)
function generatePermutations(arr) {
  if (arr.length <= 1) return [arr];
  
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
    const perms = generatePermutations(remaining);
    
    for (const perm of perms) {
      result.push([current, ...perm]);
    }
  }
  return result;
}

// ============================================================================
// MAIN OPTIMIZATION FUNCTION
// ============================================================================

async function optimizeBaganOperations(input) {
  const { kapalPosition, currentBagans, candidateSpots } = input;
  
  console.log('\n🎯 === SMARTBAGAN OPTIMIZATION START ===\n');
  
  // Step 1: Find best spot for each bagan
  console.log('Step 1: Analyzing spots for each bagan...');
  const recommendations = await findBestSpots(currentBagans, candidateSpots);
  
  // Step 2: Filter bagans that should move
  const bagansToMove = recommendations.filter(r => 
    r.recommendation.action === 'move'
  );
  
  console.log(`Found ${bagansToMove.length} bagan(s) worth moving\n`);
  
  // Step 3: Optimize route
  let optimizedRoute = null;
  if (bagansToMove.length > 0) {
    console.log('Step 2: Optimizing route...');
    optimizedRoute = optimizeRoute(kapalPosition, bagansToMove);
  }
  
  // Step 4: Compile final recommendation
  const result = {
    timestamp: new Date().toISOString(),
    summary: {
      totalBagans: currentBagans.length,
      bagansToMove: bagansToMove.length,
      bagansToStay: currentBagans.length - bagansToMove.length,
      worthMoving: bagansToMove.length > 0
    },
    recommendations: recommendations,
    optimizedRoute: optimizedRoute,
    estimatedTotals: optimizedRoute ? {
      totalDistance: optimizedRoute.summary.totalDistance,
      totalTime: optimizedRoute.summary.totalTime,
      totalFuelCost: optimizedRoute.summary.totalFuelCost,
      totalExpectedProfit: optimizedRoute.summary.totalExpectedProfit,
      netProfit: optimizedRoute.summary.totalExpectedProfit - optimizedRoute.summary.totalFuelCost,
      roi: ((optimizedRoute.summary.totalExpectedProfit - optimizedRoute.summary.totalFuelCost) / 
            optimizedRoute.summary.totalFuelCost * 100).toFixed(1)
    } : null
  };
  
  console.log('\n✅ === OPTIMIZATION COMPLETE ===\n');
  
  return result;
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports = {
  optimizeBaganOperations,
  shouldMoveBagan,
  findBestSpots,
  optimizeRoute,
  calculateDistance,
  estimateCatch,
  CONFIG
};

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

/*
const input = {
  kapalPosition: { lat: -6.7500, lng: 105.5200 },
  currentBagans: [
    { id: 'B1', name: 'Bagan 1', lat: -6.7500, lng: 105.5200, score: 75 },
    { id: 'B2', name: 'Bagan 2', lat: -6.7520, lng: 105.5210, score: 68 },
    { id: 'B3', name: 'Bagan 3', lat: -6.7540, lng: 105.5220, score: 82 },
    { id: 'B4', name: 'Bagan 4', lat: -6.7560, lng: 105.5230, score: 71 }
  ],
  candidateSpots: [
    { id: 'S1', name: 'Spot A', lat: -6.7480, lng: 105.5180, score: 89 },
    { id: 'S2', name: 'Spot B', lat: -6.7500, lng: 105.5195, score: 86 },
    { id: 'S3', name: 'Spot C', lat: -6.7530, lng: 105.5210, score: 84 },
    { id: 'S4', name: 'Spot D', lat: -6.7550, lng: 105.5225, score: 81 }
  ]
};

const result = await optimizeBaganOperations(input);
console.log(JSON.stringify(result, null, 2));
*/