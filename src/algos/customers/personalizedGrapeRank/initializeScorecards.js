#!/usr/bin/env node

/**
 * initializeScorecards.js
 * 
 * This script creates a scorecards_init.json file in the temporary directory by:
 * 1. Reading ratees.csv from the temporary directory
 * 2. For each ratee_pubkey, adding a property with key equal to the ratee_pubkey and value [0,0,0,0]
 * 3. Setting the value for BRAINSTORM_OWNER_PUBKEY to [1,1,1,9999]
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

// Extract CUSTOMER_PUBKEY, CUSTOMER_ID, and CUSTOMER_NAME which are passed as arguments
const CUSTOMER_PUBKEY = process.argv[2];
const CUSTOMER_ID = process.argv[3];
const CUSTOMER_NAME = process.argv[4];

// Main function
async function main() {
  try {
    console.log('Initializing scorecards for CUSTOMER_PUBKEY: ' + CUSTOMER_PUBKEY + ' CUSTOMER_ID: ' + CUSTOMER_ID + ' CUSTOMER_NAME: ' + CUSTOMER_NAME);
    
    // Define paths
    const tempDir = '/var/lib/brainstorm/algos/personalizedGrapeRank/tmp';
    const rateesFile = path.join(tempDir, 'ratees.csv');
    const scorecardsFile = path.join(tempDir, CUSTOMER_NAME, 'scorecards_init.json');
    
    const observerPubkey = CUSTOMER_PUBKEY
    
    // Initialize scorecards object
    const scorecards = {};
    
    // Set default value for observer pubkey
    scorecards[observerPubkey] = [1, 1, 1, 9999];
    
    // Check if ratees.csv exists
    if (!fs.existsSync(rateesFile)) {
      console.error(`Ratees file not found: ${rateesFile}`);
      process.exit(1);
    }
    
    // Create readline interface
    const fileStream = fs.createReadStream(rateesFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    // Skip header line
    let isFirstLine = true;
    
    // Process each line
    for await (const line of rl) {
      // Skip header
      if (isFirstLine) {
        isFirstLine = false;
        continue;
      }
      
      // Skip empty lines
      if (!line.trim()) continue;
      
      // Extract ratee_pubkey (remove quotes if present)
      const ratee_pubkey = line.trim().replace(/"/g, '');
      
      // Skip if empty or already in scorecards
      if (!ratee_pubkey || scorecards[ratee_pubkey]) continue;
      
      // Add to scorecards with default value [0,0,0,0]
      scorecards[ratee_pubkey] = [0, 0, 0, 0];
    }
    
    // Write scorecards to file
    fs.writeFileSync(scorecardsFile, JSON.stringify(scorecards, null, 2));
    
    console.log(`Successfully created scorecards_init.json with ${Object.keys(scorecards).length} entries`);
  } catch (error) {
    console.error(`Error initializing scorecards: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();
