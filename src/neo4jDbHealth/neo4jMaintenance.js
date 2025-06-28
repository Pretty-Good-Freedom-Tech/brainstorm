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
  // For EC2 server, prefer /var/log/brainstorm if it exists and is writable
  // Otherwise fall back to a local logs directory
  logDir: process.env.BRAINSTORM_LOG_DIR || (() => {
    // Check if /var/log/brainstorm exists and is writable
    try {
      if (fs.existsSync('/var/log/brainstorm')) {
        try {
          fs.accessSync('/var/log/brainstorm', fs.constants.W_OK);
          return '/var/log/brainstorm';
        } catch (e) {
          // Not writable, fall back to local logs
        }
      }
    } catch (e) {
      // Directory doesn't exist or other error, fall back to local logs
    }
    return path.join(process.cwd(), 'logs');
  })()
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
    // Check for orphaned nodes (nodes without any relationships)
    const orphanedNodesQuery = `
      MATCH (n:NostrUser)
      WHERE NOT (n)--() 
      RETURN count(n) as orphanedNodes
    `;
    
    // Check for relationship integrity
    const relationshipIntegrityQuery = `
      MATCH ()-[r:FOLLOWS|MUTES|REPORTS]->() 
      WHERE r.timestamp IS NULL 
      RETURN count(r) as relsMissingTimestamp
    `;
    
    // Check for duplicate relationships
    const duplicateRelsQuery = `
      MATCH (a)-[r:FOLLOWS]->(b)
      WITH a, b, count(r) as relCount
      WHERE relCount > 1
      RETURN count(*) as duplicateRelPairs
    `;
    
    const orphanedNodes = executeCypher(orphanedNodesQuery);
    const relsMissingTimestamp = executeCypher(relationshipIntegrityQuery);
    const duplicateRels = executeCypher(duplicateRelsQuery);
    
    let hasIssues = false;
    
    if (orphanedNodes && orphanedNodes.orphanedNodes > 0) {
      log(`WARNING: Found ${orphanedNodes.orphanedNodes} orphaned NostrUser nodes without relationships`);
      hasIssues = true;
    }
    
    if (relsMissingTimestamp && relsMissingTimestamp.relsMissingTimestamp > 0) {
      log(`WARNING: Found ${relsMissingTimestamp.relsMissingTimestamp} relationships missing timestamp property`);
      hasIssues = true;
    }
    
    if (duplicateRels && duplicateRels.duplicateRelPairs > 0) {
      log(`WARNING: Found ${duplicateRels.duplicateRelPairs} pairs of nodes with duplicate FOLLOWS relationships`);
      hasIssues = true;
    }
    
    if (!hasIssues) {
      log('Database consistency check passed - no obvious issues detected');
    } else {
      log('Database consistency check completed with warnings');
    }
    
    return !hasIssues;
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
