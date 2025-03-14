#!/usr/bin/env node

/**
 * initializeScorecards.js
 * 
 * This script creates a scorecards.json file in the temporary directory by:
 * 1. Reading ratees.csv from the temporary directory
 * 2. For each ratee_pubkey, adding a property with key equal to the ratee_pubkey and value [0,0,0,0]
 * 3. Setting the value for HASENPFEFFR_OWNER_PUBKEY to [1,1,1,9999]
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

// Get HASENPFEFFR_OWNER_PUBKEY from environment or config file
function getOwnerPubkey() {
  try {
    // Try to read from config file
    const configOutput = execSync('source /etc/hasenpfeffr.conf && echo $HASENPFEFFR_OWNER_PUBKEY', { 
      shell: '/bin/bash',
      encoding: 'utf8' 
    }).trim();
    
    if (configOutput && configOutput.length > 0) {
      return configOutput;
    }
    
    // Fall back to environment variable
    if (process.env.HASENPFEFFR_OWNER_PUBKEY) {
      return process.env.HASENPFEFFR_OWNER_PUBKEY;
    }
    
    console.error('HASENPFEFFR_OWNER_PUBKEY not found in config or environment');
    process.exit(1);
  } catch (error) {
    console.error(`Error getting HASENPFEFFR_OWNER_PUBKEY: ${error.message}`);
    process.exit(1);
  }
}

// Main function
async function main() {
  try {
    console.log('Initializing scorecards...');
    
    // Define paths
    const tempDir = '/var/lib/hasenpfeffr/algos/personalizedGrapeRank/tmp';
    const rateesFile = path.join(tempDir, 'ratees.csv');
    const scorecardsFile = path.join(tempDir, 'scorecards.json');
    
    // Get owner pubkey
    const ownerPubkey = getOwnerPubkey();
    console.log(`HASENPFEFFR_OWNER_PUBKEY: ${ownerPubkey}`);
    
    // Initialize scorecards object
    const scorecards = {};
    
    // Set default value for owner pubkey
    scorecards[ownerPubkey] = [1, 1, 1, 9999];
    
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
    
    console.log(`Successfully created scorecards.json with ${Object.keys(scorecards).length} entries`);
  } catch (error) {
    console.error(`Error initializing scorecards: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();
