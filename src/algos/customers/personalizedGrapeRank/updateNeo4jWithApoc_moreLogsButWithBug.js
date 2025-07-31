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

// Pre-flight checks before APOC update
async function performPreflightChecks(neo4jConfig) {
  log('=== PERFORMING PRE-FLIGHT CHECKS ===');
  
  try {
    // Check Neo4j memory settings
    const memoryCheckCommand = `sudo cypher-shell -a "${neo4jConfig.uri}" -u "${neo4jConfig.username}" -p "${neo4jConfig.password}" "CALL dbms.listConfig() YIELD name, value WHERE name CONTAINS 'memory' RETURN name, value ORDER BY name"`;
    const memoryResult = execSync(memoryCheckCommand, { encoding: 'utf8' });
    log('Neo4j Memory Configuration:');
    log(memoryResult);
    
    // Check existing indexes
    const indexCheckCommand = `sudo cypher-shell -a "${neo4jConfig.uri}" -u "${neo4jConfig.username}" -p "${neo4jConfig.password}" "SHOW INDEXES"`;
    const indexResult = execSync(indexCheckCommand, { encoding: 'utf8' });
    log('Neo4j Indexes:');
    log(indexResult);
    
    // Check current transaction count
    const txCheckCommand = `sudo cypher-shell -a "${neo4jConfig.uri}" -u "${neo4jConfig.username}" -p "${neo4jConfig.password}" "CALL dbms.listTransactions() YIELD transactionId, currentQuery, status RETURN count(*) as activeTransactions"`;
    const txResult = execSync(txCheckCommand, { encoding: 'utf8' });
    log('Active Transactions:');
    log(txResult);
    
    // Check target node count
    const nodeCountCommand = `sudo cypher-shell -a "${neo4jConfig.uri}" -u "${neo4jConfig.username}" -p "${neo4jConfig.password}" "MATCH (u:NostrUserWotMetricsCard {customer_id: ${CUSTOMER_ID}}) RETURN count(u) as targetNodes"`;
    const nodeCountResult = execSync(nodeCountCommand, { encoding: 'utf8' });
    log('Target Nodes for Update:');
    log(nodeCountResult);
    
  } catch (error) {
    log(`Warning: Pre-flight check failed: ${error.message}`);
  }
  
  log('=== PRE-FLIGHT CHECKS COMPLETE ===');
}

// Monitor APOC progress in real-time
async function monitorApocProgress(neo4jConfig, intervalMs = 30000) {
  const monitorInterval = setInterval(async () => {
    try {
      // Check active transactions
      const txCommand = `sudo cypher-shell -a "${neo4jConfig.uri}" -u "${neo4jConfig.username}" -p "${neo4jConfig.password}" "CALL dbms.listTransactions() YIELD transactionId, currentQuery, status, startTime WHERE currentQuery CONTAINS 'apoc.periodic.iterate' RETURN transactionId, status, startTime, currentQuery"`;
      const txResult = execSync(txCommand, { encoding: 'utf8', timeout: 10000 });
      
      if (txResult.trim()) {
        log('=== APOC PROGRESS MONITOR ===');
        log('Active APOC Transactions:');
        log(txResult);
        
        // Check memory usage
        const memCommand = `sudo cypher-shell -a "${neo4jConfig.uri}" -u "${neo4jConfig.username}" -p "${neo4jConfig.password}" "CALL dbms.queryJvm('java.lang:type=Memory') YIELD attributes RETURN attributes.HeapMemoryUsage as heapUsage"`;
        const memResult = execSync(memCommand, { encoding: 'utf8', timeout: 5000 });
        log('JVM Memory Usage:');
        log(memResult);
      }
    } catch (error) {
      log(`Monitor check failed: ${error.message}`);
    }
  }, intervalMs);
  
  return monitorInterval;
}

// Update Neo4j using APOC periodic iterate with enhanced monitoring
async function updateNeo4jWithApoc(neo4jConfig, apocFilePath, totalRecords) {
  log(`Starting Neo4j update using APOC periodic iterate for ${CUSTOMER_NAME} using apocFilePath: ${apocFilePath} and file: ${path.basename(apocFilePath)}...`);
  
  // Perform pre-flight checks
  await performPreflightChecks(neo4jConfig);
  
  // Optimized APOC parameters for large datasets
  const batchSize = 100; // Smaller batches to reduce memory pressure
  const parallel = false; // Keep sequential to avoid lock contention
  const retries = 5; // More retries for resilience
  
  // Construct the APOC Cypher command with enhanced error handling
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
  {
    batchSize: ${batchSize}, 
    parallel: ${parallel}, 
    retries: ${retries}, 
    errorHandler: 'IGNORE_AND_LOG',
    batchMode: 'BATCH_SINGLE',
    concurrency: 1
  }
) YIELD batches, total, timeTaken, committedOperations, failedOperations, failedBatches, retries, errorMessages
RETURN batches, total, timeTaken, committedOperations, failedOperations, failedBatches, retries, errorMessages;
  `.trim();

  log(`Optimized Cypher command: ${cypherCommand}`);
  
  // Write Cypher command to temporary file
  const cypherFile = path.join(TEMP_DIR, 'updateNeo4j.cypher');
  fs.writeFileSync(cypherFile, cypherCommand);
  
  log(`Executing APOC update for ${totalRecords} records...`);
  log(`Using optimized settings: batchSize=${batchSize}, parallel=${parallel}, retries=${retries}`);
  
  // Start progress monitoring
  const monitorInterval = await monitorApocProgress(neo4jConfig, 30000); // Check every 30 seconds
  
  const startTime = Date.now();
  
  try {
    // Execute the Cypher command using cypher-shell with extended timeout
    const command = `sudo cypher-shell -a "${neo4jConfig.uri}" -u "${neo4jConfig.username}" -p "${neo4jConfig.password}" -f "${cypherFile}"`;
    
    log(`Executing command: ${command}`);
    
    const result = execSync(command, { 
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 50, // 50MB buffer for large results
      timeout: 3600000 // 1 hour timeout
    });
    
    const endTime = Date.now();
    const durationMinutes = ((endTime - startTime) / 1000 / 60).toFixed(2);
    
    log(`APOC update completed successfully in ${durationMinutes} minutes`);
    log(`Full result: ${result.trim()}`);
    
    // Parse and log detailed statistics
    const lines = result.trim().split('\n');
    const dataLine = lines[lines.length - 1];
    
    if (dataLine && dataLine.includes('|')) {
      log(`=== UPDATE STATISTICS ===`);
      log(`Raw statistics: ${dataLine}`);
      
      // Try to parse the statistics
      try {
        const stats = dataLine.split('|').map(s => s.trim());
        if (stats.length >= 7) {
          log(`Batches processed: ${stats[1]}`);
          log(`Total operations: ${stats[2]}`);
          log(`Time taken: ${stats[3]}`);
          log(`Committed operations: ${stats[4]}`);
          log(`Failed operations: ${stats[5]}`);
          log(`Failed batches: ${stats[6]}`);
          if (stats.length > 7) {
            log(`Retries: ${stats[7]}`);
          }
          if (stats.length > 8) {
            log(`Error messages: ${stats[8]}`);
          }
        }
      } catch (parseError) {
        log(`Could not parse statistics: ${parseError.message}`);
      }
    }
    
    // Post-update verification
    await performPostUpdateVerification(neo4jConfig, totalRecords);
    
  } catch (error) {
    const endTime = Date.now();
    const durationMinutes = ((endTime - startTime) / 1000 / 60).toFixed(2);
    
    log(`=== APOC UPDATE FAILED after ${durationMinutes} minutes ===`);
    log(`Error: ${error.message}`);
    
    // Log additional debugging info on failure
    await logFailureDebugInfo(neo4jConfig, error);
    
    throw error;
  } finally {
    // Stop progress monitoring
    if (monitorInterval) {
      clearInterval(monitorInterval);
      log('Progress monitoring stopped');
    }
  }
}

// Post-update verification
async function performPostUpdateVerification(neo4jConfig, expectedRecords) {
  log('=== PERFORMING POST-UPDATE VERIFICATION ===');
  
  try {
    // Count updated records
    const countCommand = `sudo cypher-shell -a "${neo4jConfig.uri}" -u "${neo4jConfig.username}" -p "${neo4jConfig.password}" "MATCH (u:NostrUserWotMetricsCard {customer_id: ${CUSTOMER_ID}}) WHERE u.influence IS NOT NULL RETURN count(u) as updatedNodes"`;
    const countResult = execSync(countCommand, { encoding: 'utf8' });
    log('Updated nodes count:');
    log(countResult);
    
    // Sample some updated records
    const sampleCommand = `sudo cypher-shell -a "${neo4jConfig.uri}" -u "${neo4jConfig.username}" -p "${neo4jConfig.password}" "MATCH (u:NostrUserWotMetricsCard {customer_id: ${CUSTOMER_ID}}) WHERE u.influence IS NOT NULL RETURN u.observee_pubkey, u.influence, u.average LIMIT 5"`;
    const sampleResult = execSync(sampleCommand, { encoding: 'utf8' });
    log('Sample updated records:');
    log(sampleResult);
    
  } catch (error) {
    log(`Post-update verification failed: ${error.message}`);
  }
  
  log('=== POST-UPDATE VERIFICATION COMPLETE ===');
}

// Log debugging info on failure
async function logFailureDebugInfo(neo4jConfig, error) {
  log('=== FAILURE DEBUG INFORMATION ===');
  
  try {
    // Check for any remaining transactions
    const txCommand = `sudo cypher-shell -a "${neo4jConfig.uri}" -u "${neo4jConfig.username}" -p "${neo4jConfig.password}" "CALL dbms.listTransactions() YIELD transactionId, currentQuery, status RETURN *"`;
    const txResult = execSync(txCommand, { encoding: 'utf8', timeout: 10000 });
    log('Active transactions at failure:');
    log(txResult);
    
    // Check Neo4j logs for recent errors
    log('Checking Neo4j logs for recent errors...');
    try {
      const logCommand = 'sudo tail -50 /var/log/neo4j/neo4j.log | grep -i "error\|exception\|timeout\|memory"';
      const logResult = execSync(logCommand, { encoding: 'utf8', timeout: 5000 });
      if (logResult.trim()) {
        log('Recent Neo4j log errors:');
        log(logResult);
      } else {
        log('No recent errors found in Neo4j logs');
      }
    } catch (logError) {
      log(`Could not read Neo4j logs: ${logError.message}`);
    }
    
  } catch (debugError) {
    log(`Debug info collection failed: ${debugError.message}`);
  }
  
  log('=== END FAILURE DEBUG INFORMATION ===');
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
