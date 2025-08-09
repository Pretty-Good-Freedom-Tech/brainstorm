#!/usr/bin/env node

/**
 * initializeRatings.js
 * 
 * This script creates a ratings.json file in the temporary directory by:
 * 1. Reading follows.csv, mutes.csv, and reports.csv from the temporary directory
 * 2. Creating a nested structure [context][pk_ratee][pk_rater] = [rating, confidence]
 * 3. Using constants from /etc/graperank.conf for ratings and confidence values
 * 4. Handling precedence: reports > mutes > follows
 * 5. Special handling for BRAINSTORM_OWNER_PUBKEY ratings
 * 6. Excluding self-ratings (where pk_ratee equals pk_rater)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

// Configuration
const TEMP_DIR = '/var/lib/brainstorm/algos/personalizedGrapeRank/tmp';
const CONTEXT = 'verifiedUsers';
const CONFIG_FILES = {
  graperank: '/etc/graperank.conf',
  brainstorm: '/etc/brainstorm.conf'
};

// Get configuration values
function getConfig() {
  try {
    // Load GrapeRank config
    const graperankConfig = execSync(`source ${CONFIG_FILES.graperank} && echo $FOLLOW_RATING,$FOLLOW_CONFIDENCE,$MUTE_RATING,$MUTE_CONFIDENCE,$REPORT_RATING,$REPORT_CONFIDENCE,$FOLLOW_CONFIDENCE_OF_OBSERVER`, { 
      shell: '/bin/bash',
      encoding: 'utf8' 
    }).trim().split(',');
    
    // Load Brainstorm config
    const ownerPubkey = execSync(`source ${CONFIG_FILES.brainstorm} && echo $BRAINSTORM_OWNER_PUBKEY`, { 
      shell: '/bin/bash',
      encoding: 'utf8' 
    }).trim();
    
    return {
      FOLLOW_RATING: parseFloat(graperankConfig[0]),
      FOLLOW_CONFIDENCE: parseFloat(graperankConfig[1]),
      MUTE_RATING: parseFloat(graperankConfig[2]),
      MUTE_CONFIDENCE: parseFloat(graperankConfig[3]),
      REPORT_RATING: parseFloat(graperankConfig[4]),
      REPORT_CONFIDENCE: parseFloat(graperankConfig[5]),
      FOLLOW_CONFIDENCE_OF_OBSERVER: parseFloat(graperankConfig[6]),
      BRAINSTORM_OWNER_PUBKEY: ownerPubkey
    };
  } catch (error) {
    console.error(`Error loading configuration: ${error.message}`);
    process.exit(1);
  }
}

// Process a CSV file and update the ratings object
async function processCSVFile(filePath, ratings, config, ratingType) {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);
        resolve(ratings);
        return;
      }

      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      // Skip header line
      let isFirstLine = true;
      
      // Process each line
      rl.on('line', (line) => {
        if (isFirstLine) {
          isFirstLine = false;
          return;
        }
        
        // Skip empty lines
        if (!line.trim()) return;
        
        // Parse line (format: "pk_rater","pk_ratee")
        const parts = line.split(',');
        if (parts.length < 2) return;
        
        const pk_rater = parts[0].replace(/"/g, '').trim();
        const pk_ratee = parts[1].replace(/"/g, '').trim();
        
        // Skip if either pubkey is empty
        if (!pk_rater || !pk_ratee) return;
        
        // Skip self-ratings (where pk_ratee equals pk_rater)
        if (pk_ratee === pk_rater) {
          return;
        }
        
        // Initialize nested objects if they don't exist
        if (!ratings[CONTEXT]) {
          ratings[CONTEXT] = {};
        }
        if (!ratings[CONTEXT][pk_ratee]) {
          ratings[CONTEXT][pk_ratee] = {};
        }
        
        // Determine rating and confidence values based on rating type
        let rating, confidence;
        
        switch (ratingType) {
          case 'follow':
            rating = config.FOLLOW_RATING;
            // Special case for BRAINSTORM_OWNER_PUBKEY
            confidence = (pk_rater === config.BRAINSTORM_OWNER_PUBKEY) 
              ? config.FOLLOW_CONFIDENCE_OF_OBSERVER 
              : config.FOLLOW_CONFIDENCE;
            break;
          case 'mute':
            rating = config.MUTE_RATING;
            confidence = config.MUTE_CONFIDENCE;
            break;
          case 'report':
            rating = config.REPORT_RATING;
            confidence = config.REPORT_CONFIDENCE;
            break;
          default:
            rating = 0;
            confidence = 0;
        }
        
        // Set the rating
        ratings[CONTEXT][pk_ratee][pk_rater] = [rating, confidence];
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

// Write ratings to file using a memory-efficient streaming approach
// Refactored to avoid MaxListenersExceededWarning by using a single drain handler
async function writeRatingsToFile(ratingsFile, ratings) {
  return new Promise((resolve, reject) => {
    try {
      // Create a writable stream
      const stream = fs.createWriteStream(ratingsFile);
      
      // Queue for managing backpressure without multiple drain listeners
      let writeQueue = [];
      let isWriting = false;
      let isDraining = false;
      
      // Single drain handler to avoid listener accumulation
      const drainHandler = () => {
        isDraining = false;
        processWriteQueue();
      };
      
      stream.on('drain', drainHandler);
      
      // Process queued writes when stream is ready
      function processWriteQueue() {
        if (isWriting || isDraining || writeQueue.length === 0) {
          return;
        }
        
        isWriting = true;
        
        while (writeQueue.length > 0 && !isDraining) {
          const { data, callback } = writeQueue.shift();
          
          if (stream.write(data)) {
            // Stream buffer is not full, continue
            callback();
          } else {
            // Stream buffer is full, wait for drain
            isDraining = true;
            callback();
            break;
          }
        }
        
        isWriting = false;
      }
      
      // Helper function to write data with backpressure handling
      function writeToStream(data) {
        return new Promise((resolveWrite) => {
          writeQueue.push({ data, callback: resolveWrite });
          processWriteQueue();
        });
      }
      
      // Get all contexts (should only be 'verifiedUsers' in this case)
      const contexts = Object.keys(ratings);
      let contextIndex = 0;
      
      // Process contexts sequentially
      async function processContexts() {
        // Write the opening brace
        await writeToStream('{\n');
        
        for (contextIndex = 0; contextIndex < contexts.length; contextIndex++) {
          const context = contexts[contextIndex];
          
          // Write context key
          await writeToStream(`  "${context}": {\n`);
          
          // Get all ratees for this context
          const ratees = Object.keys(ratings[context]);
          
          // Process ratees in smaller batches to reduce memory usage
          const batchSize = 100; // Reduced batch size for better memory management
          
          for (let rateeIndex = 0; rateeIndex < ratees.length; rateeIndex += batchSize) {
            const endIndex = Math.min(rateeIndex + batchSize, ratees.length);
            
            // Process this batch of ratees
            for (let i = rateeIndex; i < endIndex; i++) {
              const ratee = ratees[i];
              
              // Build ratee output
              let rateeOutput = `    "${ratee}": {\n`;
              
              // Get all raters for this ratee
              const raters = Object.keys(ratings[context][ratee]);
              
              // Process each rater
              raters.forEach((rater, raterIndex) => {
                // Get rating and confidence
                const [rating, confidence] = ratings[context][ratee][rater];
                
                // Write rater key and value
                rateeOutput += `      "${rater}": [${rating}, ${confidence}]`;
                
                // Add comma if not the last rater
                if (raterIndex < raters.length - 1) {
                  rateeOutput += ',\n';
                } else {
                  rateeOutput += '\n';
                }
              });
              
              // Close ratee object
              if (i < ratees.length - 1) {
                rateeOutput += '    },\n';
              } else {
                rateeOutput += '    }\n';
              }
              
              // Write ratee data
              await writeToStream(rateeOutput);
            }
            
            // Yield control to prevent blocking
            await new Promise(resolve => process.nextTick(resolve));
          }
          
          // Close context
          if (contextIndex < contexts.length - 1) {
            await writeToStream('  },\n');
          } else {
            await writeToStream('  }\n');
          }
        }
        
        // Close the JSON
        await writeToStream('}\n');
        
        // End the stream
        stream.end();
      }
      
      // Start processing
      processContexts().catch(reject);
      
      // Handle stream events
      stream.on('finish', () => {
        stream.removeListener('drain', drainHandler);
        resolve();
      });
      
      stream.on('error', (err) => {
        stream.removeListener('drain', drainHandler);
        reject(err);
      });
      
    } catch (error) {
      reject(error);
    }
  });
}

// Count entries in the ratings object
function countEntries(ratings) {
  let entryCount = 0;
  for (const context in ratings) {
    for (const ratee in ratings[context]) {
      entryCount += Object.keys(ratings[context][ratee]).length;
    }
  }
  return entryCount;
}

// Main function
async function main() {
  try {
    console.log('Initializing ratings...');
    
    // Get configuration
    const config = getConfig();
    console.log(`BRAINSTORM_OWNER_PUBKEY: ${config.BRAINSTORM_OWNER_PUBKEY}`);
    
    // Define file paths
    const followsFile = path.join(TEMP_DIR, 'follows.csv');
    const mutesFile = path.join(TEMP_DIR, 'mutes.csv');
    const reportsFile = path.join(TEMP_DIR, 'reports.csv');
    const ratingsFile = path.join(TEMP_DIR, 'ratings.json');
    
    // Initialize ratings object
    let ratings = {};
    
    // Process files in order of precedence: follows, mutes, reports
    console.log('Processing follows.csv...');
    ratings = await processCSVFile(followsFile, ratings, config, 'follow');
    
    console.log('Processing mutes.csv...');
    ratings = await processCSVFile(mutesFile, ratings, config, 'mute');
    
    console.log('Processing reports.csv...');
    ratings = await processCSVFile(reportsFile, ratings, config, 'report');
    
    // Count entries before writing
    const entryCount = countEntries(ratings);
    console.log(`Writing ratings.json with ${entryCount} ratings...`);
    
    // Write ratings to file using streaming approach
    await writeRatingsToFile(ratingsFile, ratings);
    
    console.log(`Successfully created ratings.json with ${entryCount} ratings`);
  } catch (error) {
    console.error(`Error initializing ratings: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();
