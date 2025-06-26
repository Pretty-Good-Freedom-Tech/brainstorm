#!/usr/bin/env node
/**
 * deleteAllRels.js
 * 
 * This script deletes all relationships from Neo4j in batches
 * to avoid memory errors. It tracks progress and can be resumed if interrupted.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  batchSize: 400000, // Number of relationships to delete in each batch
  progressFile: '/var/lib/brainstorm/manage/deleteRels/progress.json',
  neo4jUri: process.env.NEO4J_URI || "bolt://localhost:7687",
  neo4jUser: process.env.NEO4J_USER || "neo4j",
  neo4jPassword: process.env.NEO4J_PASSWORD || "neo4jneo4j",
  logDir: process.env.BRAINSTORM_LOG_DIR || "/var/log/brainstorm"
};

// Ensure directories exist
function ensureDirectories() {
  const dir = path.dirname(config.progressFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Ensure log directory exists
  if (!fs.existsSync(config.logDir)) {
    fs.mkdirSync(config.logDir, { recursive: true });
  }
}

// Log message to console and file
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp}: ${message}`;
  console.log(logMessage);
  
  // Append to log file
  const logFile = path.join(config.logDir, 'deleteAllRels.log');
  fs.appendFileSync(logFile, logMessage + '\n');
}

// Load progress from file or initialize
function loadProgress() {
  if (fs.existsSync(config.progressFile)) {
    try {
      const data = fs.readFileSync(config.progressFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      log(`Error reading progress file: ${error.message}`);
      return { deleted: 0, totalCount: null, startTime: new Date().toISOString() };
    }
  } else {
    return { deleted: 0, totalCount: null, startTime: new Date().toISOString() };
  }
}

// Save progress to file
function saveProgress(progress) {
  try {
    fs.writeFileSync(config.progressFile, JSON.stringify(progress, null, 2));
  } catch (error) {
    log(`Error saving progress: ${error.message}`);
  }
}

// Get total count of ALL relationships
function getTotalCount() {
  try {
    log('Counting total relationships...');
    const query = 'MATCH ()-[r]->() RETURN count(r) as count';
    const result = execSync(`sudo cypher-shell -a "${config.neo4jUri}" -u "${config.neo4jUser}" -p "${config.neo4jPassword}" "${query}" --format plain`).toString();
    
    // Parse the result (skip header and footer)
    const lines = result.split('\n');
    const countLine = lines[1]; // Second line contains the count
    const count = parseInt(countLine.trim(), 10);
    
    log(`Found ${count} relationships to delete`);
    return count;
  } catch (error) {
    log(`Error counting relationships: ${error.message}`);
    return null;
  }
}

// Delete a batch of relationships
function deleteBatch(batchSize) {
  try {
    const query = `MATCH ()-[r]->() WITH r LIMIT ${batchSize} DELETE r RETURN count(r) as deleted`;
    const result = execSync(`sudo cypher-shell -a "${config.neo4jUri}" -u "${config.neo4jUser}" -p "${config.neo4jPassword}" "${query}" --format plain`).toString();
    
    // Parse the result (skip header and footer)
    const lines = result.split('\n');
    const countLine = lines[1]; // Second line contains the count
    const deleted = parseInt(countLine.trim(), 10);
    
    return deleted;
  } catch (error) {
    log(`Error deleting batch: ${error.message}`);
    return 0;
  }
}

// Calculate and log time estimates
function logTimeEstimates(progress) {
  const startTime = new Date(progress.startTime);
  const currentTime = new Date();
  const elapsedMs = currentTime - startTime;
  const elapsedMinutes = elapsedMs / (1000 * 60);
  
  if (progress.totalCount && progress.deleted > 0) {
    const percentComplete = (progress.deleted / progress.totalCount) * 100;
    const msPerRel = elapsedMs / progress.deleted;
    const remainingRels = progress.totalCount - progress.deleted;
    const remainingMs = remainingRels * msPerRel;
    const remainingMinutes = remainingMs / (1000 * 60);
    
    log(`Progress: ${progress.deleted.toLocaleString()} / ${progress.totalCount.toLocaleString()} (${percentComplete.toFixed(2)}%)`);
    log(`Time elapsed: ${elapsedMinutes.toFixed(2)} minutes`);
    log(`Estimated time remaining: ${remainingMinutes.toFixed(2)} minutes`);
    log(`Deletion rate: ${(progress.deleted / elapsedMinutes).toFixed(2)} relationships per minute`);
  } else {
    log(`Progress: ${progress.deleted.toLocaleString()} relationships deleted`);
    log(`Time elapsed: ${elapsedMinutes.toFixed(2)} minutes`);
  }
}

// Main function
async function main() {
  try {
    ensureDirectories();
    log('Starting ALL RELS relationship deletion process');
    
    // Load progress
    let progress = loadProgress();
    
    // Get total count if not already known
    if (progress.totalCount === null) {
      progress.totalCount = getTotalCount();
      saveProgress(progress);
    }
    
    // Main deletion loop
    let batchCount = 0;
    let continueDeleting = true;
    
    while (continueDeleting) {
      batchCount++;
      log(`Processing batch #${batchCount}...`);
      
      const deleted = deleteBatch(config.batchSize);
      if (deleted > 0) {
        progress.deleted += deleted;
        saveProgress(progress);
        log(`Deleted ${deleted.toLocaleString()} relationships in this batch`);
        logTimeEstimates(progress);
      } else {
        continueDeleting = false;
        log('No more relationships to delete or an error occurred');
      }
      
      // Check if we've deleted all relationships
      if (progress.totalCount !== null && progress.deleted >= progress.totalCount) {
        continueDeleting = false;
        log('All relationships have been deleted');
      }
    }
    
    // Final verification
    const remainingCount = getTotalCount();
    if (remainingCount === 0) {
      log('SUCCESS: All relationships have been deleted');
      // Clean up progress file
      if (fs.existsSync(config.progressFile)) {
        fs.unlinkSync(config.progressFile);
      }
    } else if (remainingCount > 0) {
      log(`WARNING: ${remainingCount} relationships still remain`);
    }
    
  } catch (error) {
    log(`Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();
