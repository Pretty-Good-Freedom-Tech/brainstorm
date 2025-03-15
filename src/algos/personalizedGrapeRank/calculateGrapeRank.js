#!/usr/bin/env node

/**
 * calculateGrapeRank.js
 * 
 * This script implements the GrapeRank algorithm to calculate personalized scores.
 * 
 * Inputs:
 * - Parameters from /etc/graperank.conf
 * - ratings.json: Contains ratings in format [context][pk_ratee][pk_rater] = [rating, confidence]
 * - scorecards.json (if available) or scorecards_init.json: Contains initial scores
 * 
 * Outputs:
 * - scorecards.json: Updated scores in format {pk_ratee: [influence, average, confidence, input]}
 * - scorecards_metadata.json: Metadata about the calculation
 * 
 * Algorithm:
 * 1. For each pk_ratee in ratings.json:
 *    a. Calculate weighted average of ratings (GRAPERANK_AVERAGE)
 *    b. Calculate total input weight (GRAPERANK_INPUT)
 *    c. Calculate confidence from input using rigor (GRAPERANK_CONFIDENCE)
 *    d. Calculate influence as average * confidence (GRAPERANK_INFLUENCE)
 * 2. Iterate until convergence or max iterations
 * 
 * Special cases:
 * - HASENPFEFFR_OWNER_PUBKEY scorecard is fixed at [1,1,1,9999] and never recalculated
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');
const { createReadStream, createWriteStream } = require('fs');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');

// Configuration
const TEMP_DIR = '/var/lib/hasenpfeffr/algos/personalizedGrapeRank/tmp';
const MAX_ITERATIONS = 20;
const CONVERGENCE_THRESHOLD = 0.0001; // Threshold for determining convergence
const CONTEXT = 'verifiedUsers';
const CONFIG_FILES = {
  graperank: '/etc/graperank.conf',
  hasenpfeffr: '/etc/hasenpfeffr.conf'
};

// Get configuration values
function getConfig() {
  try {
    // Load GrapeRank config
    const graperankConfig = execSync(`source ${CONFIG_FILES.graperank} && echo $ATTENUATION_FACTOR,$RIGOR`, { 
      shell: '/bin/bash',
      encoding: 'utf8' 
    }).trim().split(',');
    
    // Load Hasenpfeffr config
    const ownerPubkey = execSync(`source ${CONFIG_FILES.hasenpfeffr} && echo $HASENPFEFFR_OWNER_PUBKEY`, { 
      shell: '/bin/bash',
      encoding: 'utf8' 
    }).trim();
    
    return {
      ATTENUATION_FACTOR: parseFloat(graperankConfig[0]),
      RIGOR: parseFloat(graperankConfig[1]),
      HASENPFEFFR_OWNER_PUBKEY: ownerPubkey
    };
  } catch (error) {
    console.error(`Error loading configuration: ${error.message}`);
    process.exit(1);
  }
}

// Convert input to confidence using rigor
function convertInputToConfidence(input, rigor) {
  const rigority = -Math.log(rigor);
  const fooB = -input * rigority;
  const fooA = Math.exp(fooB);
  const certainty = 1 - fooA;
  return certainty;
}

// Load ratings using a streaming approach
async function loadRatings(ratingsFile) {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(ratingsFile)) {
        reject(new Error(`Ratings file not found: ${ratingsFile}`));
        return;
      }

      const ratings = { [CONTEXT]: {} };
      let currentContext = null;
      let currentRatee = null;
      let isInContext = false;
      let isInRatee = false;
      let isInRater = false;
      let currentRater = null;
      let currentRating = null;
      
      const rl = readline.createInterface({
        input: createReadStream(ratingsFile),
        crlfDelay: Infinity
      });
      
      rl.on('line', (line) => {
        const trimmedLine = line.trim();
        
        // Context start
        if (trimmedLine.match(/^\s*"verifiedUsers"\s*:\s*{$/)) {
          currentContext = CONTEXT;
          isInContext = true;
          return;
        }
        
        // Context end
        if (isInContext && trimmedLine === '}') {
          if (isInRatee) {
            isInRatee = false;
          } else {
            isInContext = false;
            currentContext = null;
          }
          return;
        }
        
        // Ratee start
        if (isInContext && !isInRatee && trimmedLine.match(/^\s*"([^"]+)"\s*:\s*{$/)) {
          const match = trimmedLine.match(/^\s*"([^"]+)"\s*:\s*{$/);
          currentRatee = match[1];
          isInRatee = true;
          ratings[CONTEXT][currentRatee] = {};
          return;
        }
        
        // Ratee end
        if (isInRatee && trimmedLine.match(/^\s*}\s*,?$/)) {
          isInRatee = false;
          currentRatee = null;
          return;
        }
        
        // Rater line
        if (isInRatee && trimmedLine.match(/^\s*"([^"]+)"\s*:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]\s*,?$/)) {
          const match = trimmedLine.match(/^\s*"([^"]+)"\s*:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]\s*,?$/);
          currentRater = match[1];
          const rating = parseFloat(match[2]);
          const confidence = parseFloat(match[3]);
          
          ratings[CONTEXT][currentRatee][currentRater] = [rating, confidence];
          return;
        }
      });
      
      rl.on('close', () => {
        resolve(ratings);
      });
      
      rl.on('error', (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Load scorecards using a streaming approach
async function loadScorecards(scorecardsFile) {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(scorecardsFile)) {
        reject(new Error(`Scorecards file not found: ${scorecardsFile}`));
        return;
      }

      const scorecards = {};
      
      const rl = readline.createInterface({
        input: createReadStream(scorecardsFile),
        crlfDelay: Infinity
      });
      
      rl.on('line', (line) => {
        const trimmedLine = line.trim();
        
        // Skip opening and closing braces
        if (trimmedLine === '{' || trimmedLine === '}') {
          return;
        }
        
        // Parse scorecard line
        const match = trimmedLine.match(/^\s*"([^"]+)"\s*:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]\s*,?$/);
        if (match) {
          const pubkey = match[1];
          const influence = parseFloat(match[2]);
          const average = parseFloat(match[3]);
          const confidence = parseFloat(match[4]);
          const input = parseFloat(match[5]);
          
          scorecards[pubkey] = [influence, average, confidence, input];
        }
      });
      
      rl.on('close', () => {
        resolve(scorecards);
      });
      
      rl.on('error', (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Write scorecards to file using a streaming approach
async function writeScorecards(scorecardsFile, scorecards) {
  return new Promise((resolve, reject) => {
    try {
      const stream = createWriteStream(scorecardsFile);
      
      // Write opening brace
      stream.write('{\n');
      
      // Get all pubkeys
      const pubkeys = Object.keys(scorecards);
      
      // Write each scorecard
      pubkeys.forEach((pubkey, index) => {
        const [influence, average, confidence, input] = scorecards[pubkey];
        
        // Write scorecard line
        stream.write(`  "${pubkey}": [${influence}, ${average}, ${confidence}, ${input}]`);
        
        // Add comma if not the last pubkey
        if (index < pubkeys.length - 1) {
          stream.write(',\n');
        } else {
          stream.write('\n');
        }
      });
      
      // Write closing brace
      stream.write('}\n');
      
      // End the stream
      stream.end();
      
      // Handle stream events
      stream.on('finish', () => {
        resolve();
      });
      
      stream.on('error', (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Calculate GrapeRank parameters for a single ratee
function calculateGrapeRankForRatee(pk_ratee, ratings, scorecards, config) {
  // Special case: HASENPFEFFR_OWNER_PUBKEY always has fixed values
  if (pk_ratee === config.HASENPFEFFR_OWNER_PUBKEY) {
    return [1, 1, 1, 9999];
  }
  
  // Default values if no ratings exist
  let graperank_average = 0;
  let graperank_input = 0;
  let graperank_confidence = 0;
  let graperank_influence = 0;
  
  // Check if this ratee has any ratings
  if (ratings[CONTEXT] && ratings[CONTEXT][pk_ratee]) {
    let products_sum = 0;
    let weights_sum = 0;
    
    // Process each rater's rating
    const raters = Object.keys(ratings[CONTEXT][pk_ratee]);
    
    for (const pk_rater of raters) {
      // Get the rating and confidence for this rater
      const [rating, rating_confidence] = ratings[CONTEXT][pk_ratee][pk_rater];
      
      // Get the rater's influence from scorecards
      let rater_influence = 0;
      if (scorecards[pk_rater]) {
        rater_influence = scorecards[pk_rater][0]; // GRAPERANK_INFLUENCE is at index 0
      }
      
      // Calculate rating weight
      let rating_weight = rater_influence * rating_confidence;
      
      // Apply attenuation factor if rater is not the owner
      if (pk_rater !== config.HASENPFEFFR_OWNER_PUBKEY) {
        rating_weight *= config.ATTENUATION_FACTOR;
      }
      
      // Add to sums
      products_sum += rating * rating_weight;
      weights_sum += rating_weight;
    }
    
    // Calculate GRAPERANK_INPUT
    graperank_input = weights_sum;
    
    // Calculate GRAPERANK_AVERAGE
    if (graperank_input > 0) {
      graperank_average = products_sum / graperank_input;
    }
    
    // Calculate GRAPERANK_CONFIDENCE
    graperank_confidence = convertInputToConfidence(graperank_input, config.RIGOR);
    
    // Calculate GRAPERANK_INFLUENCE
    graperank_influence = graperank_average * graperank_confidence;
  }
  
  return [graperank_influence, graperank_average, graperank_confidence, graperank_input];
}

// Calculate maximum difference between two scorecard sets
function calculateMaxDifference(scorecards1, scorecards2) {
  let max_diff = 0;
  
  for (const pk_ratee in scorecards1) {
    if (scorecards2[pk_ratee]) {
      // Compare each parameter
      for (let i = 0; i < 4; i++) {
        const diff = Math.abs(scorecards1[pk_ratee][i] - scorecards2[pk_ratee][i]);
        max_diff = Math.max(max_diff, diff);
      }
    }
  }
  
  return max_diff;
}

// Generate metadata
function generateMetadata(config, iterations, converged, max_diff, start_time, scorecards) {
  const end_time = new Date();
  
  return {
    timestamp: end_time.toISOString(),
    calculation_time_ms: end_time - start_time,
    iterations: iterations,
    converged: converged,
    max_difference: max_diff,
    total_scorecards: Object.keys(scorecards).length,
    parameters: {
      attenuation_factor: config.ATTENUATION_FACTOR,
      rigor: config.RIGOR,
      max_iterations: MAX_ITERATIONS,
      convergence_threshold: CONVERGENCE_THRESHOLD
    }
  };
}

// Main function
async function main() {
  try {
    const start_time = new Date();
    console.log('Starting GrapeRank calculation...');
    
    // Get configuration
    const config = getConfig();
    console.log(`HASENPFEFFR_OWNER_PUBKEY: ${config.HASENPFEFFR_OWNER_PUBKEY}`);
    console.log(`ATTENUATION_FACTOR: ${config.ATTENUATION_FACTOR}`);
    console.log(`RIGOR: ${config.RIGOR}`);
    
    // Define file paths
    const ratingsFile = path.join(TEMP_DIR, 'ratings.json');
    const scorecardsInitFile = path.join(TEMP_DIR, 'scorecards_init.json');
    const scorecardsFile = path.join(TEMP_DIR, 'scorecards.json');
    const metadataFile = path.join(TEMP_DIR, 'scorecards_metadata.json');
    
    // Load ratings using streaming approach
    console.log(`Loading ratings from ${ratingsFile}...`);
    let ratings;
    try {
      ratings = await loadRatings(ratingsFile);
      console.log(`Loaded ratings for ${Object.keys(ratings[CONTEXT] || {}).length} ratees`);
    } catch (error) {
      console.error(`Error loading ratings: ${error.message}`);
      process.exit(1);
    }
    
    // Load initial scorecards (use scorecards.json if available, otherwise scorecards_init.json)
    let scorecards;
    try {
      if (fs.existsSync(scorecardsFile)) {
        console.log(`Loading existing scorecards from ${scorecardsFile}...`);
        scorecards = await loadScorecards(scorecardsFile);
      } else if (fs.existsSync(scorecardsInitFile)) {
        console.log(`Loading initial scorecards from ${scorecardsInitFile}...`);
        scorecards = await loadScorecards(scorecardsInitFile);
      } else {
        console.error(`Neither ${scorecardsFile} nor ${scorecardsInitFile} found`);
        process.exit(1);
      }
      console.log(`Loaded scorecards for ${Object.keys(scorecards).length} pubkeys`);
    } catch (error) {
      console.error(`Error loading scorecards: ${error.message}`);
      process.exit(1);
    }
    
    // Ensure HASENPFEFFR_OWNER_PUBKEY has fixed scorecard values
    scorecards[config.HASENPFEFFR_OWNER_PUBKEY] = [1, 1, 1, 9999];
    console.log(`Set fixed scorecard for HASENPFEFFR_OWNER_PUBKEY: [1, 1, 1, 9999]`);
    
    // Iterate until convergence or max iterations
    let iterations = 0;
    let converged = false;
    let max_diff = Infinity;
    
    while (iterations < MAX_ITERATIONS && !converged) {
      console.log(`Iteration ${iterations + 1}/${MAX_ITERATIONS}`);
      
      // Create a copy of current scorecards for comparison
      const previous_scorecards = JSON.parse(JSON.stringify(scorecards));
      
      // Get all ratees from ratings and scorecards
      const ratees = new Set();
      
      // Add ratees from ratings
      if (ratings[CONTEXT]) {
        Object.keys(ratings[CONTEXT]).forEach(pk_ratee => ratees.add(pk_ratee));
      }
      
      // Add ratees from scorecards (in case some aren't in ratings)
      Object.keys(scorecards).forEach(pk_ratee => ratees.add(pk_ratee));
      
      // Calculate GrapeRank for each ratee
      const rateeArray = Array.from(ratees);
      console.log(`Calculating GrapeRank for ${rateeArray.length} ratees...`);
      
      // Process ratees in chunks to avoid memory issues
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < rateeArray.length; i += CHUNK_SIZE) {
        const chunk = rateeArray.slice(i, i + CHUNK_SIZE);
        console.log(`Processing chunk ${Math.floor(i/CHUNK_SIZE) + 1}/${Math.ceil(rateeArray.length/CHUNK_SIZE)} (${chunk.length} ratees)...`);
        
        for (const pk_ratee of chunk) {
          // Skip recalculation for HASENPFEFFR_OWNER_PUBKEY as it has fixed values
          if (pk_ratee === config.HASENPFEFFR_OWNER_PUBKEY) {
            continue;
          }
          
          const graperank_params = calculateGrapeRankForRatee(pk_ratee, ratings, scorecards, config);
          scorecards[pk_ratee] = graperank_params;
        }
      }
      
      // Ensure HASENPFEFFR_OWNER_PUBKEY still has fixed scorecard values
      scorecards[config.HASENPFEFFR_OWNER_PUBKEY] = [1, 1, 1, 9999];
      
      // Check for convergence
      max_diff = calculateMaxDifference(scorecards, previous_scorecards);
      console.log(`Maximum difference: ${max_diff}`);
      
      if (max_diff < CONVERGENCE_THRESHOLD) {
        converged = true;
        console.log(`Converged after ${iterations + 1} iterations`);
      }
      
      iterations++;
    }
    
    // Generate metadata
    const metadata = generateMetadata(config, iterations, converged, max_diff, start_time, scorecards);
    
    // Write scorecards to file using streaming approach
    console.log(`Writing scorecards to ${scorecardsFile}...`);
    await writeScorecards(scorecardsFile, scorecards);
    
    // Write metadata to file
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
    console.log(`Wrote metadata to ${metadataFile}`);
    
    console.log(`GrapeRank calculation completed in ${metadata.calculation_time_ms}ms`);
  } catch (error) {
    console.error(`Error calculating GrapeRank: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main();
