#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get command line arguments
const CUSTOMER_PUBKEY = process.argv[2];
const CUSTOMER_ID = process.argv[3];
const CUSTOMER_NAME = process.argv[4];

if (!CUSTOMER_NAME || !CUSTOMER_PUBKEY) {
  console.error('Usage: node updateNeo4jWithApoc.js <customer_name> <customer_pubkey>');
  process.exit(1);
}

// Configuration
const TEMP_DIR = `/var/lib/brainstorm/algos/personalizedGrapeRank/tmp/${CUSTOMER_NAME}`;
const NEO4J_IMPORT_DIR = '/var/lib/neo4j/import';
const CONFIG_FILES = {
  brainstorm: '/etc/brainstorm.conf'
};

// Logging setup
const LOG_DIR = `/var/log/brainstorm/customers/${CUSTOMER_NAME}`;
execSync(`mkdir -p ${LOG_DIR}`);
execSync(`sudo chown brainstorm:brainstorm ${LOG_DIR}`);
const LOG_FILE = path.join(LOG_DIR, 'updateNeo4jWithApoc.log');
execSync(`touch ${LOG_FILE}`);
execSync(`sudo chown brainstorm:brainstorm ${LOG_FILE}`);

// Get Neo4j configuration from brainstorm.conf
function getNeo4jConfig_deprecated() {
  const configContent = fs.readFileSync(CONFIG_FILES.brainstorm, 'utf8');
  const lines = configContent.split('\n');
  
  const config = {};
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, value] = trimmed.split('=');
      if (key && value) {
        config[key.trim()] = value.trim().replace(/['"]/g, '');
      }
    }
  });
  
  return {
    uri: config.NEO4J_URI || 'bolt://localhost:7687',
    username: config.NEO4J_USER || 'neo4j',
    password: config.NEO4J_PASSWORD || 'password'
  };
}

// Get Neo4j configuration from brainstorm.conf
function getNeo4jConfig() {
  try {
    // Load Neo4j connection details from brainstorm.conf
    const neo4jUri = execSync(`source ${CONFIG_FILES.brainstorm} && echo $NEO4J_URI`, { 
      shell: '/bin/bash',
      encoding: 'utf8' 
    }).trim();
    
    const neo4jUsername = execSync(`source ${CONFIG_FILES.brainstorm} && echo $NEO4J_USER`, { 
      shell: '/bin/bash',
      encoding: 'utf8' 
    }).trim();
    
    const neo4jPassword = execSync(`source ${CONFIG_FILES.brainstorm} && echo $NEO4J_PASSWORD`, { 
      shell: '/bin/bash',
      encoding: 'utf8' 
    }).trim();
    
    if (!neo4jUri || !neo4jUsername || !neo4jPassword) {
      throw new Error('Missing Neo4j connection details in brainstorm.conf. Please ensure NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD are defined.');
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

// Load scorecards from JSON file
async function loadScorecards(filePath) {
  log(`Loading scorecards from ${filePath}...`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Scorecards file not found: ${filePath}`);
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const scorecards = JSON.parse(content);
  
  log(`Loaded scorecards for ${Object.keys(scorecards).length} pubkeys`);
  return scorecards;
}

// Convert scorecards to APOC-compatible JSON format
function createApocUpdateFile(scorecards, outputPath) {
  log(`Creating APOC update file at ${outputPath}...`);
  
  const updates = [];
  
  for (const [pubkey, scores] of Object.entries(scorecards)) {
    const [influence, average, confidence, input] = scores;
    updates.push({
      pubkey,
      influence,
      average,
      confidence,
      input
    });
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(updates, null, 2));
  log(`Created APOC update file with ${updates.length} records`);
  
  return updates.length;
}

// Update Neo4j using APOC periodic iterate
async function updateNeo4jWithApoc(neo4jConfig, apocFilePath, totalRecords) {
  log(`Starting Neo4j update using APOC periodic iterate for ${CUSTOMER_NAME} using apocFilePath: ${apocFilePath} and file: ${path.basename(apocFilePath)}...`);
  
  // Construct the APOC Cypher command
  const cypherCommand = `
CALL apoc.periodic.iterate(
  "CALL apoc.load.json('file:///${path.basename(apocFilePath)}') YIELD value AS update RETURN update",
  "
  MATCH (u:NostrUserWotMetricsCard {customer_id: ${CUSTOMER_ID}})
  WHERE u.observee_pubkey = update.pubkey
  SET u.influence = update.influence,
      u.average = update.average,
      u.confidence = update.confidence,
      u.input = update.input
  ",
  {batchSize: 250, parallel: false, retries: 3, errorHandler: 'IGNORE_AND_LOG'}
) YIELD batches, total, timeTaken, committedOperations, failedOperations, failedBatches, retries, errorMessages
RETURN batches, total, timeTaken, committedOperations, failedOperations, failedBatches, retries, errorMessages;
  `.trim();

  log(`Cypher command: ${cypherCommand}`);
  
  // Write Cypher command to temporary file
  const cypherFile = path.join(TEMP_DIR, 'updateNeo4j.cypher');
  fs.writeFileSync(cypherFile, cypherCommand);
  
  log(`Executing APOC update for ${totalRecords} records...`);
  log(`Using batch size: 1000, parallel: false, retries: 3`);
  
  try {
    // Execute the Cypher command using cypher-shell
    const command = `sudo cypher-shell -a "${neo4jConfig.uri}" -u "${neo4jConfig.username}" -p "${neo4jConfig.password}" -f "${cypherFile}"`;
    
    const result = execSync(command, { 
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    
    log('APOC update completed successfully');
    log(`Result: ${result.trim()}`);
    
    // Parse the result to extract statistics
    const lines = result.trim().split('\n');
    const dataLine = lines[lines.length - 1]; // Last line contains the data
    
    if (dataLine && dataLine.includes('|')) {
      log(`Update statistics: ${dataLine}`);
    }
    
  } catch (error) {
    log(`Error executing APOC update: ${error.message}`);
    throw error;
  }
}

// Function that logs to LOG_FILE and console
function log(message) {
  const date = new Date();
  console.log(`${date.toISOString()}: ${message}`);
  fs.appendFileSync(LOG_FILE, `${date.toISOString()}: ${message}\n`);
}

// Main function
async function main() {
  try {
    log('Starting Neo4j update with GrapeRank scores using APOC...');
    
    // Get Neo4j configuration
    const neo4jConfig = getNeo4jConfig();
    log(`Using Neo4j URI: ${neo4jConfig.uri}`);
    log(`Using Neo4j username: ${neo4jConfig.username}`);
    
    // Define file paths
    const scorecardsFile = path.join(TEMP_DIR, 'scorecards.json');
    const apocUpdateFile = path.join(NEO4J_IMPORT_DIR, `graperank_updates_${CUSTOMER_NAME}.json`);
    
    // Load scorecards
    const scorecards = await loadScorecards(scorecardsFile);
    
    // Create APOC-compatible update file
    const totalRecords = createApocUpdateFile(scorecards, apocUpdateFile);
    
    // Set proper permissions for Neo4j import directory
    execSync(`sudo chown neo4j:neo4j "${apocUpdateFile}"`);
    execSync(`sudo chmod 644 "${apocUpdateFile}"`);
    
    // Update Neo4j using APOC
    await updateNeo4jWithApoc(neo4jConfig, apocUpdateFile, totalRecords);
    
    // Clean up the APOC file
    if (fs.existsSync(apocUpdateFile)) {
      fs.unlinkSync(apocUpdateFile);
      log('Cleaned up APOC update file');
    }
    
    log('Neo4j update completed successfully');
  } catch (error) {
    log(`Error updating Neo4j: ${error.message}`);
    log(error.stack);
    process.exit(1);
  }
}

// Run the main function
main().catch(err => {
  log(`Unhandled error: ${err.message}`);
  process.exit(1);
});
