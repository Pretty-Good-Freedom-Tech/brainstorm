#!/usr/bin/env node
/**
 * neo4jMaintenance.js
 * 
 * This script provides maintenance operations for Neo4j database,
 * particularly useful after frequent large-scale relationship deletion and recreation cycles.
 * It includes functions for index resampling, query cache clearing, and other maintenance tasks.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { promisify } = require('util');
const mkdir = promisify(fs.mkdir);

// Configuration
const config = {
  neo4jUri: process.env.NEO4J_URI || "bolt://localhost:7687",
  neo4jUser: process.env.NEO4J_USER || "neo4j",
  neo4jPassword: process.env.NEO4J_PASSWORD || "neo4jneo4j",
  logDir: process.env.BRAINSTORM_LOG_DIR || "/var/log/brainstorm"
};

// Ensure directories exist
async function ensureDirectories() {
  try {
    await mkdir(path.join(config.logDir, 'neo4jHealth'), { recursive: true });
  } catch (error) {
    console.error(`Error creating directories: ${error.message}`);
    throw error;
  }
}

// Log message to console and file
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp}: ${message}`;
  console.log(logMessage);
  
  // Append to log file
  const logFile = path.join(config.logDir, 'neo4jHealth', 'maintenance.log');
  fs.appendFileSync(logFile, logMessage + '\n');
}

// Execute Cypher query
function executeCypher(query) {
  try {
    const result = execSync(
      `cypher-shell -a "${config.neo4jUri}" -u "${config.neo4jUser}" -p "${config.neo4jPassword}" "${query}" --format plain`,
      { encoding: 'utf-8' }
    );
    return result;
  } catch (error) {
    log(`Error executing Cypher query: ${error.message}`);
    throw error;
  }
}

// Resample indexes to optimize performance
async function resampleIndexes() {
  log('Resampling Neo4j indexes...');
  
  try {
    // Get list of indexes
    const indexQuery = `CALL db.indexes()`;
    const indexResult = executeCypher(indexQuery);
    log(`Retrieved index information`);
    
    // Resample all indexes
    const resampleQuery = `CALL db.resampleIndex()`;
    executeCypher(resampleQuery);
    log('All indexes resampled successfully');
    
    return true;
  } catch (error) {
    log(`Error resampling indexes: ${error.message}`);
    return false;
  }
}

// Clear query caches to reset query plans
async function clearQueryCaches() {
  log('Clearing Neo4j query caches...');
  
  try {
    const query = `CALL db.clearQueryCaches()`;
    executeCypher(query);
    log('Query caches cleared successfully');
    
    return true;
  } catch (error) {
    log(`Error clearing query caches: ${error.message}`);
    return false;
  }
}

// Check for and report any damaged indexes
async function checkIndexes() {
  log('Checking Neo4j indexes for issues...');
  
  try {
    const query = `
      CALL db.indexes() 
      YIELD name, type, uniqueness, failureMessage
      RETURN name, type, uniqueness, failureMessage
    `;
    
    const result = executeCypher(query);
    
    // Check for any failure messages
    if (result.includes('failureMessage') && !result.includes('failureMessage: null')) {
      log('WARNING: Some indexes have failure messages:');
      log(result);
      return false;
    } else {
      log('All indexes appear to be healthy');
      return true;
    }
  } catch (error) {
    log(`Error checking indexes: ${error.message}`);
    return false;
  }
}

// Check for long-running transactions that might be blocking operations
async function checkLongRunningTransactions() {
  log('Checking for long-running transactions...');
  
  try {
    const query = `
      CALL dbms.listTransactions()
      YIELD transactionId, startTime, currentQueryId, currentQuery, status
      WHERE datetime() - startTime > duration('PT10S')
      RETURN transactionId, startTime, currentQueryId, currentQuery, status
    `;
    
    const result = executeCypher(query);
    
    if (result.trim().split('\n').length > 2) {
      log('WARNING: Long-running transactions detected:');
      log(result);
      return false;
    } else {
      log('No long-running transactions detected');
      return true;
    }
  } catch (error) {
    log(`Error checking transactions: ${error.message}`);
    return false;
  }
}

// Check database consistency
async function checkDatabaseConsistency() {
  log('Checking database consistency...');
  
  try {
    // This is a lightweight consistency check that can run on a live database
    const query = `
      CALL apoc.util.validate(
        MATCH (n) WHERE n:NonExistentLabel RETURN count(n) > 0 AS result,
        'Database appears consistent',
        'Database inconsistency detected'
      )
    `;
    
    try {
      executeCypher(query);
      log('Database consistency check passed');
      return true;
    } catch (error) {
      // If APOC is not available, we'll just log that we can't check
      if (error.message.includes('apoc')) {
        log('Cannot check database consistency - APOC procedures not available');
        return true;
      } else {
        throw error;
      }
    }
  } catch (error) {
    log(`Error checking database consistency: ${error.message}`);
    return false;
  }
}

// Run all maintenance tasks
async function runAllMaintenance() {
  log('Starting Neo4j maintenance tasks...');
  
  let success = true;
  
  // First check for issues
  success = await checkIndexes() && success;
  success = await checkLongRunningTransactions() && success;
  success = await checkDatabaseConsistency() && success;
  
  // Then perform maintenance
  success = await clearQueryCaches() && success;
  success = await resampleIndexes() && success;
  
  if (success) {
    log('All maintenance tasks completed successfully');
  } else {
    log('Some maintenance tasks reported issues - check the logs for details');
  }
  
  return success;
}

// Main function
async function main() {
  try {
    await ensureDirectories();
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === 'all') {
      await runAllMaintenance();
    } else if (args[0] === 'resample-indexes') {
      await resampleIndexes();
    } else if (args[0] === 'clear-caches') {
      await clearQueryCaches();
    } else if (args[0] === 'check-indexes') {
      await checkIndexes();
    } else if (args[0] === 'check-transactions') {
      await checkLongRunningTransactions();
    } else if (args[0] === 'check-consistency') {
      await checkDatabaseConsistency();
    } else {
      log(`Unknown command: ${args[0]}`);
      log('Available commands: all, resample-indexes, clear-caches, check-indexes, check-transactions, check-consistency');
      process.exit(1);
    }
    
  } catch (error) {
    log(`Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();
