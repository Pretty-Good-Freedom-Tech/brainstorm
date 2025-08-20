#!/usr/bin/env node
/**
 * logNeo4jMetrics.js
 * 
 * This script collects and logs key Neo4j database metrics to monitor database health,
 * especially during frequent large-scale relationship deletion and recreation cycles.
 * It tracks memory usage, page cache statistics, transaction logs, and other relevant metrics.
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
  })(),
  metricsLogFile: "neo4j_metrics.log",
  metricsJsonFile: "neo4j_metrics.json"
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
  const logFile = path.join(config.logDir, 'neo4jHealth', config.metricsLogFile);
  fs.appendFileSync(logFile, logMessage + '\n');
}

// Execute Cypher query and return results
function executeCypher(query) {
  try {
    const result = execSync(
      `cypher-shell -a "${config.neo4jUri}" -u "${config.neo4jUser}" -p "${config.neo4jPassword}" "${query}" --format plain`,
      { encoding: 'utf-8' }
    );
    
    // Parse the result (skip header and footer)
    const lines = result.split('\n');
    if (lines.length <= 2) {
      return null;
    }
    
    // Extract column names from header
    const headers = lines[0].split('|').map(header => header.trim());
    
    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length - 1; i++) {
      if (lines[i].trim() === '') continue;
      
      const values = lines[i].split('|').map(value => value.trim());
      const row = {};
      
      headers.forEach((header, index) => {
        // Try to parse numbers if possible
        const value = values[index];
        if (!isNaN(value) && value !== '') {
          row[header] = parseFloat(value);
        } else {
          row[header] = value;
        }
      });
      
      data.push(row);
    }
    
    return data.length === 1 ? data[0] : data;
  } catch (error) {
    log(`Error executing Cypher query: ${error.message}`);
    return null;
  }
}

// Collect JVM memory metrics
function collectJvmMemoryMetrics() {
  log('Collecting JVM memory metrics...');
  
  const query = `
    CALL dbms.queryJmx('java.lang:type=Memory') YIELD attributes
    RETURN 
      attributes.HeapMemoryUsage.value.properties.used AS heapUsed,
      attributes.HeapMemoryUsage.value.properties.committed AS heapCommitted,
      attributes.HeapMemoryUsage.value.properties.max AS heapMax,
      attributes.NonHeapMemoryUsage.value.properties.used AS nonHeapUsed,
      attributes.NonHeapMemoryUsage.value.properties.committed AS nonHeapCommitted
  `;
  
  return executeCypher(query);
}

// Collect garbage collection metrics
function collectGcMetrics() {
  log('Collecting garbage collection metrics...');
  
  const query = `
    CALL dbms.queryJmx('java.lang:type=GarbageCollector,name=*') YIELD name, attributes
    RETURN 
      name,
      attributes.CollectionCount.value AS collectionCount,
      attributes.CollectionTime.value AS collectionTimeMs
  `;
  
  return executeCypher(query);
}

// Collect page cache metrics
function collectPageCacheMetrics() {
  log('Collecting page cache metrics...');
  
  const query = `
    CALL dbms.queryJmx('org.neo4j:instance=kernel#0,name=Page cache') YIELD attributes
    RETURN 
      attributes.Hits.value AS hits,
      attributes.Misses.value AS misses,
      attributes.Flushes.value AS flushes,
      attributes.Evictions.value AS evictions,
      attributes.HitRatio.value AS hitRatio,
      attributes.UsageRatio.value AS usageRatio
  `;
  
  return executeCypher(query);
}

// Collect transaction metrics
function collectTransactionMetrics() {
  log('Collecting transaction metrics...');
  
  const query = `
    CALL dbms.queryJmx('org.neo4j:instance=kernel#0,name=Transactions') YIELD attributes
    RETURN 
      attributes.NumberOfRolledBackTransactions.value AS rolledBackTxCount,
      attributes.NumberOfOpenTransactions.value AS openTxCount,
      attributes.PeakNumberOfConcurrentTransactions.value AS peakConcurrentTxCount,
      attributes.LastCommittedTxId.value AS lastCommittedTxId
  `;
  
  return executeCypher(query);
}

// Collect database size metrics
function collectDatabaseSizeMetrics() {
  log('Collecting database size metrics...');
  
  try {
    // Use node and relationship counts as a proxy for database size
    const countQuery = `
      MATCH (n)
      RETURN
        count(n) AS nodeCount,
        size((MATCH ()-[r]->() RETURN count(r) AS relCount)) AS relationshipCount
    `;
    
    const counts = executeCypher(countQuery);
    
    if (counts) {
      // Calculate a very rough estimate of database size
      // Assuming ~500 bytes per node and ~100 bytes per relationship on average
      // This is just a rough approximation for tracking relative changes
      const estimatedBytes = (counts.nodeCount * 500) + (counts.relationshipCount * 100);
      
      return {
        estimatedSizeBytes: estimatedBytes,
        nodeCount: counts.nodeCount,
        relationshipCount: counts.relationshipCount,
        sizeEstimationMessage: 'Size is estimated based on node and relationship counts'
      };
    } else {
      return {
        estimatedSizeBytes: null,
        sizeEstimationMessage: 'Database size metrics unavailable'
      };
    }
  } catch (error) {
    log(`Error estimating database size: ${error.message}`);
    return {
      estimatedSizeBytes: null,
      sizeEstimationMessage: 'Database size metrics unavailable'
    };
  }
}

// Collect relationship count metrics
function collectRelationshipMetrics() {
  log('Collecting relationship metrics...');
  
  const query = `
    MATCH ()-[r]->()
    RETURN 
      count(r) AS totalRelationships,
      count(CASE WHEN type(r) = 'FOLLOWS' THEN 1 END) AS followsCount,
      count(CASE WHEN type(r) = 'MUTES' THEN 1 END) AS mutesCount,
      count(CASE WHEN type(r) = 'REPORTS' THEN 1 END) AS reportsCount
  `;
  
  return executeCypher(query);
}

// Collect node count metrics
function collectNodeMetrics() {
  log('Collecting node metrics...');
  
  const query = `
    MATCH (n:NostrUser)
    RETURN count(n) AS nostrUserCount
  `;
  
  return executeCypher(query);
}

// Collect index metrics
function collectIndexMetrics() {
  log('Collecting index metrics...');
  
  const query = `
    CALL db.indexes() YIELD name, type, uniqueness, size, indexProvider, failureMessage
    RETURN name, type, uniqueness, size, indexProvider, failureMessage
  `;
  
  return executeCypher(query);
}

// Save metrics to JSON file for historical tracking
function saveMetricsHistory(metrics) {
  const metricsFile = path.join(config.logDir, 'neo4jHealth', config.metricsJsonFile);
  let history = [];
  
  // Load existing history if available
  if (fs.existsSync(metricsFile)) {
    try {
      const data = fs.readFileSync(metricsFile, 'utf8');
      history = JSON.parse(data);
    } catch (error) {
      log(`Error reading metrics history: ${error.message}`);
    }
  }
  
  // Add new metrics with timestamp
  metrics.timestamp = new Date().toISOString();
  history.push(metrics);
  
  // Keep only the last 100 entries to prevent the file from growing too large
  if (history.length > 100) {
    history = history.slice(history.length - 100);
  }
  
  // Save updated history
  try {
    fs.writeFileSync(metricsFile, JSON.stringify(history, null, 2));
  } catch (error) {
    log(`Error saving metrics history: ${error.message}`);
  }
}

// Format bytes to human-readable format
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Main function
async function main() {
  try {
    await ensureDirectories();
    log('Starting Neo4j metrics collection');
    
    // Collect all metrics
    const jvmMemory = collectJvmMemoryMetrics();
    const gcMetrics = collectGcMetrics();
    const pageCacheMetrics = collectPageCacheMetrics();
    const transactionMetrics = collectTransactionMetrics();
    const databaseSizeMetrics = collectDatabaseSizeMetrics();
    const relationshipMetrics = collectRelationshipMetrics();
    const nodeMetrics = collectNodeMetrics();
    const indexMetrics = collectIndexMetrics();
    
    // Combine all metrics
    const allMetrics = {
      jvmMemory,
      gcMetrics,
      pageCacheMetrics,
      transactionMetrics,
      databaseSizeMetrics,
      relationshipMetrics,
      nodeMetrics,
      indexMetrics
    };
    
    // Save metrics history
    saveMetricsHistory(allMetrics);
    
    // Log summary of key metrics
    log('=== Neo4j Health Summary ===');
    
    if (jvmMemory) {
      const heapUsedPercent = ((jvmMemory.heapUsed / jvmMemory.heapMax) * 100).toFixed(2);
      log(`Heap Memory: ${formatBytes(jvmMemory.heapUsed)} used of ${formatBytes(jvmMemory.heapMax)} (${heapUsedPercent}%)`);
    }
    
    if (pageCacheMetrics) {
      log(`Page Cache Hit Ratio: ${(pageCacheMetrics.hitRatio * 100).toFixed(2)}%`);
      log(`Page Cache Usage Ratio: ${(pageCacheMetrics.usageRatio * 100).toFixed(2)}%`);
    }
    
    if (databaseSizeMetrics) {
      if (databaseSizeMetrics.estimatedSizeBytes) {
        log(`Estimated Database Size: ${formatBytes(databaseSizeMetrics.estimatedSizeBytes)} (estimated)`);
      }
      if (databaseSizeMetrics.nodeCount) {
        log(`Node Count: ${databaseSizeMetrics.nodeCount.toLocaleString()}`);
      }
      if (databaseSizeMetrics.relationshipCount) {
        log(`Relationship Count: ${databaseSizeMetrics.relationshipCount.toLocaleString()}`);
      }
      if (databaseSizeMetrics.sizeEstimationMessage && !databaseSizeMetrics.estimatedSizeBytes) {
        log(`Database Size: ${databaseSizeMetrics.sizeEstimationMessage}`);
      }
    }
    
    if (relationshipMetrics) {
      log(`Total Relationships: ${relationshipMetrics.totalRelationships.toLocaleString()}`);
      log(`FOLLOWS Relationships: ${relationshipMetrics.followsCount.toLocaleString()}`);
      log(`MUTES Relationships: ${relationshipMetrics.mutesCount.toLocaleString()}`);
      log(`REPORTS Relationships: ${relationshipMetrics.reportsCount.toLocaleString()}`);
    }
    
    if (nodeMetrics) {
      log(`NostrUser Nodes: ${nodeMetrics.nostrUserCount.toLocaleString()}`);
    }
    
    log('Metrics collection completed');
    
  } catch (error) {
    log(`Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();
