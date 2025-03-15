#!/usr/bin/env node

/**
 * updateNeo4j.js
 * 
 * This script updates Neo4j with GrapeRank scores from scorecards.json.
 * It reads the scorecards.json file and updates the NostrUser nodes in Neo4j
 * with the following properties:
 * - influence
 * - average
 * - confidence
 * - input
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createReadStream } = require('fs');
const { execSync } = require('child_process');
const neo4j = require('neo4j-driver');

// Configuration
const TEMP_DIR = '/var/lib/hasenpfeffr/algos/personalizedGrapeRank/tmp';
const CONFIG_FILES = {
  hasenpfeffr: '/etc/hasenpfeffr.conf'
};
const BATCH_SIZE = 500; // Number of users to update in a single batch

// Get Neo4j configuration from hasenpfeffr.conf
function getNeo4jConfig() {
  try {
    // Load Neo4j connection details from hasenpfeffr.conf
    const neo4jUri = execSync(`source ${CONFIG_FILES.hasenpfeffr} && echo $NEO4J_URI`, { 
      shell: '/bin/bash',
      encoding: 'utf8' 
    }).trim();
    
    const neo4jUsername = execSync(`source ${CONFIG_FILES.hasenpfeffr} && echo $NEO4J_USER`, { 
      shell: '/bin/bash',
      encoding: 'utf8' 
    }).trim();
    
    const neo4jPassword = execSync(`source ${CONFIG_FILES.hasenpfeffr} && echo $NEO4J_PASSWORD`, { 
      shell: '/bin/bash',
      encoding: 'utf8' 
    }).trim();
    
    if (!neo4jUri || !neo4jUsername || !neo4jPassword) {
      throw new Error('Missing Neo4j connection details in hasenpfeffr.conf. Please ensure NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD are defined.');
    }
    
    return {
      uri: neo4jUri,
      username: neo4jUsername,
      password: neo4jPassword
    };
  } catch (error) {
    console.error(`Error loading Neo4j configuration: ${error.message}`);
    process.exit(1);
  }
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

// Update Neo4j with GrapeRank scores
async function updateNeo4j(scorecards, neo4jConfig) {
  const driver = neo4j.driver(
    neo4jConfig.uri,
    neo4j.auth.basic(neo4jConfig.username, neo4jConfig.password)
  );
  
  try {
    console.log('Connected to Neo4j');
    const session = driver.session();
    
    // Get all pubkeys
    const pubkeys = Object.keys(scorecards);
    console.log(`Updating ${pubkeys.length} users in Neo4j...`);
    
    // Process in batches to avoid overwhelming the database
    for (let i = 0; i < pubkeys.length; i += BATCH_SIZE) {
      const batch = pubkeys.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(pubkeys.length/BATCH_SIZE)} (${batch.length} users)...`);
      
      // Create parameters for batch update
      const params = {
        updates: batch.map(pubkey => {
          const [influence, average, confidence, input] = scorecards[pubkey];
          return {
            pubkey,
            influence,
            average,
            confidence,
            input
          };
        })
      };
      
      // Update Neo4j
      const result = await session.run(`
        UNWIND $updates AS update
        MATCH (u:NostrUser {pubkey: update.pubkey})
        SET u.influence = update.influence,
            u.average = update.average,
            u.confidence = update.confidence,
            u.input = update.input
        RETURN count(u) AS updatedCount
      `, params);
      
      const updatedCount = result.records[0].get('updatedCount').toNumber();
      console.log(`Updated ${updatedCount} users in this batch`);
    }
    
    await session.close();
    console.log('Neo4j update completed successfully');
  } catch (error) {
    console.error(`Error updating Neo4j: ${error.message}`);
    process.exit(1);
  } finally {
    await driver.close();
  }
}

// Main function
async function main() {
  try {
    console.log('Starting Neo4j update with GrapeRank scores...');
    
    // Get Neo4j configuration
    const neo4jConfig = getNeo4jConfig();
    console.log(`Using Neo4j URI: ${neo4jConfig.uri}`);
    console.log(`Using Neo4j username: ${neo4jConfig.username}`);
    
    // Define file paths
    const scorecardsFile = path.join(TEMP_DIR, 'scorecards.json');
    
    // Load scorecards
    console.log(`Loading scorecards from ${scorecardsFile}...`);
    const scorecards = await loadScorecards(scorecardsFile);
    console.log(`Loaded scorecards for ${Object.keys(scorecards).length} pubkeys`);
    
    // Update Neo4j
    await updateNeo4j(scorecards, neo4jConfig);
    
    console.log('Neo4j update completed');
  } catch (error) {
    console.error(`Error updating Neo4j: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main();
