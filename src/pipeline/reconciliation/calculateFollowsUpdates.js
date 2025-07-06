#!/usr/bin/env node
/**
 * calculateFollowsUpdates.js
 * 
 * A JavaScript version of calculateFollowsUpdates.sh
 * This script calculates the follows that need to be added to Neo4j from strfry.
 * It compares currentRelationshipsFromStrfry/follows with currentRelationshipsFromNeo4j/follows
 * and outputs a JSON file with follows to add.
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const readline = require('readline');
const { createWriteStream, createReadStream } = require('fs');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('strfryDir', {
    describe: 'Directory containing strfry follows files',
    type: 'string',
    default: '/usr/local/lib/node_modules/brainstorm/src/pipeline/reconciliation/currentRelationshipsFromStrfry/follows'
  })
  .option('neo4jDir', {
    describe: 'Directory containing Neo4j follows files',
    type: 'string',
    default: '/usr/local/lib/node_modules/brainstorm/src/pipeline/reconciliation/currentRelationshipsFromNeo4j/follows'
  })
  .option('outputDir', {
    describe: 'Directory for output files',
    type: 'string',
    default: '/usr/local/lib/node_modules/brainstorm/src/pipeline/reconciliation/json'
  })
  .option('logFile', {
    describe: 'Log file path',
    type: 'string',
    default: '/var/log/brainstorm/reconciliation.log'
  })
  .option('concurrency', {
    describe: 'Number of files to process concurrently',
    type: 'number',
    default: 10
  })
  .help()
  .argv;

// Configuration
const config = {
  strfryDir: path.resolve(argv.strfryDir),
  neo4jDir: path.resolve(argv.neo4jDir),
  outputDir: path.resolve(argv.outputDir),
  logFile: argv.logFile,
  concurrency: argv.concurrency
};

// Ensure log directory exists
const logDir = path.dirname(config.logFile);
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (error) {
    // If we can't create the log directory, fall back to local logs
    config.logFile = path.join(__dirname, 'logs', 'reconciliation.log');
    if (!fs.existsSync(path.dirname(config.logFile))) {
      fs.mkdirSync(path.dirname(config.logFile), { recursive: true });
    }
  }
}

/**
 * Log a message to the log file and console
 * @param {string} message - Message to log
 */
function log(message) {
  const timestamp = new Date().toUTCString();
  const logMessage = `${timestamp}: calculateFollowsUpdates - ${message}\n`;
  
  console.log(message);
  
  try {
    fs.appendFileSync(config.logFile, logMessage);
  } catch (error) {
    console.error(`Error writing to log file: ${error.message}`);
  }
}

/**
 * Ensure output directory exists
 */
function ensureOutputDirectory() {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
    log(`Created output directory: ${config.outputDir}`);
  }
}

/**
 * Process a single strfry follow file and find follows to add
 * @param {string} strfryFile - Path to the strfry follow file
 * @param {WriteStream} outputStream - Stream to write results to
 * @returns {Promise<number>} - Number of follows to add
 */
async function processStrfryFile(strfryFile, outputStream) {
  // Get the rater pubkey from the filename
  const filename = path.basename(strfryFile);
  
  // Skip summary files or non-json files
  if (filename === '_summary.json' || !filename.endsWith('.json')) {
    return 0;
  }
  
  const raterPubkey = filename.replace('.json', '');
  const neo4jFile = path.join(config.neo4jDir, filename);
  let followsAdded = 0;
  const timestamp = Math.floor(Date.now() / 1000);
  
  try {
    // Read the strfry file
    const strfryData = JSON.parse(fs.readFileSync(strfryFile, 'utf8'));
    if (!strfryData[raterPubkey]) {
      log(`Warning: Invalid strfry file format for ${raterPubkey}, skipping`);
      return 0;
    }
    
    // Check if this rater exists in Neo4j
    if (!fs.existsSync(neo4jFile)) {
      // This rater doesn't exist in Neo4j, add all follows
      const ratees = Object.keys(strfryData[raterPubkey]);
      
      for (const ratee of ratees) {
        const follow = {
          pk_rater: raterPubkey,
          pk_ratee: ratee,
          timestamp
        };
        
        outputStream.write(JSON.stringify(follow) + '\n');
        followsAdded++;
      }
      
      // log(`Added ${followsAdded} follows for new rater ${raterPubkey}`);
      return followsAdded;
    }
    
    // Rater exists in Neo4j, compare follows
    const neo4jData = JSON.parse(fs.readFileSync(neo4jFile, 'utf8'));
    if (!neo4jData[raterPubkey]) {
      log(`Warning: Invalid Neo4j file format for ${raterPubkey}, treating as empty`);
      // Treat as if the Neo4j file is empty, add all strfry follows
      const ratees = Object.keys(strfryData[raterPubkey]);
      
      for (const ratee of ratees) {
        const follow = {
          pk_rater: raterPubkey,
          pk_ratee: ratee,
          timestamp
        };
        
        // Make sure we're properly handling write operation with backpressure
        const canContinue = outputStream.write(JSON.stringify(follow) + '\n');
        if (!canContinue) {
          // If backpressure is detected, wait for the drain event
          await new Promise(resolve => outputStream.once('drain', resolve));
        }
        followsAdded++;
      }
      
      // log(`Added ${followsAdded} follows for rater ${raterPubkey} with invalid Neo4j data`);
      return followsAdded;
    }
    
    // Get ratees from both sources for comparison
    const strfryRatees = Object.keys(strfryData[raterPubkey]);
    const neo4jRatees = Object.keys(neo4jData[raterPubkey]);
    
    // Use Set for efficient lookups
    const neo4jRateeSet = new Set(neo4jRatees);
    
    // Find ratees in strfry that are not in Neo4j
    for (const ratee of strfryRatees) {
      if (!neo4jRateeSet.has(ratee)) {
        // This follow needs to be added
        const follow = {
          pk_rater: raterPubkey,
          pk_ratee: ratee,
          timestamp
        };
        
        // Make sure we're properly handling write operation with backpressure
        const canContinue = outputStream.write(JSON.stringify(follow) + '\n');
        if (!canContinue) {
          // If backpressure is detected, wait for the drain event
          await new Promise(resolve => outputStream.once('drain', resolve));
        }
        followsAdded++;
      }
    }
    
    if (followsAdded > 0) {
      // log(`Added ${followsAdded} new follows for existing rater ${raterPubkey}`);
    }
    
    return followsAdded;
  } catch (error) {
    log(`Error processing file ${strfryFile}: ${error.message}`);
    return 0;
  }
}

/**
 * Process files in batches to control memory usage
 * @param {Array<string>} files - Array of files to process
 * @param {WriteStream} outputStream - Stream to write results to
 * @param {number} concurrency - Number of files to process concurrently
 * @returns {Promise<number>} - Total number of follows to add
 */
async function processFilesInBatches(files, outputStream, concurrency) {
  let totalFollowsAdded = 0;
  let processedFiles = 0;
  const totalFiles = files.length;
  
  // Process files in batches
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(file => processStrfryFile(file, outputStream)));
    
    // Update counters
    const batchFollowsAdded = results.reduce((sum, count) => sum + count, 0);
    totalFollowsAdded += batchFollowsAdded;
    processedFiles += batch.length;
    
    // Report progress
    const progress = Math.round((processedFiles / totalFiles) * 100);
    // log(`Progress: ${progress}% (${processedFiles}/${totalFiles}) - Added ${batchFollowsAdded} follows in this batch`);
    
    // Force garbage collection if available
    if (global.gc) global.gc();
  }
  
  return totalFollowsAdded;
}

/**
 * Process a single Neo4j follow file and find follows to delete
 * @param {string} neo4jFile - Path to the Neo4j follow file
 * @param {WriteStream} outputStream - Stream to write results to
 * @returns {Promise<number>} - Number of follows to delete
 */
async function processNeo4jFile(neo4jFile, outputStream) {
  // Get the rater pubkey from the filename
  const filename = path.basename(neo4jFile);
  
  // Skip summary files or non-json files
  if (filename === '_summary.json' || !filename.endsWith('.json')) {
    return 0;
  }
  
  const raterPubkey = filename.replace('.json', '');
  const strfryFile = path.join(config.strfryDir, filename);
  let followsDeleted = 0;
  const timestamp = Math.floor(Date.now() / 1000);
  
  try {
    // Read the Neo4j file
    const neo4jData = JSON.parse(fs.readFileSync(neo4jFile, 'utf8'));
    if (!neo4jData[raterPubkey]) {
      log(`Warning: Invalid Neo4j file format for ${raterPubkey}, skipping`);
      return 0;
    }
    
    // Check if this rater exists in strfry
    if (!fs.existsSync(strfryFile)) {
      // This rater doesn't exist in strfry, all follows should be deleted
      const ratees = Object.keys(neo4jData[raterPubkey]);
      
      for (const ratee of ratees) {
        const follow = {
          pk_rater: raterPubkey,
          pk_ratee: ratee,
          timestamp
        };
        
        // Make sure we're properly handling write operation with backpressure
        const canContinue = outputStream.write(JSON.stringify(follow) + '\n');
        if (!canContinue) {
          // If backpressure is detected, wait for the drain event
          await new Promise(resolve => outputStream.once('drain', resolve));
        }
        followsDeleted++;
      }
      
      // log(`Added ${followsDeleted} follows to delete for missing rater ${raterPubkey}`);
      return followsDeleted;
    }
    
    // Rater exists in strfry, compare follows
    const strfryData = JSON.parse(fs.readFileSync(strfryFile, 'utf8'));
    if (!strfryData[raterPubkey]) {
      log(`Warning: Invalid strfry file format for ${raterPubkey}, treating as empty`);
      // Treat as if the strfry file is empty, delete all Neo4j follows
      const ratees = Object.keys(neo4jData[raterPubkey]);
      
      for (const ratee of ratees) {
        const follow = {
          pk_rater: raterPubkey,
          pk_ratee: ratee,
          timestamp
        };
        
        // Make sure we're properly handling write operation with backpressure
        const canContinue = outputStream.write(JSON.stringify(follow) + '\n');
        if (!canContinue) {
          // If backpressure is detected, wait for the drain event
          await new Promise(resolve => outputStream.once('drain', resolve));
        }
        followsDeleted++;
      }
      
      // log(`Added ${followsDeleted} follows to delete for rater ${raterPubkey} with invalid strfry data`);
      return followsDeleted;
    }
    
    // Get ratees from both sources for comparison
    const neo4jRatees = Object.keys(neo4jData[raterPubkey]);
    const strfryRatees = Object.keys(strfryData[raterPubkey]);
    
    // Use Set for efficient lookups
    const strfryRateeSet = new Set(strfryRatees);
    
    // Find ratees in Neo4j that are not in strfry
    for (const ratee of neo4jRatees) {
      if (!strfryRateeSet.has(ratee)) {
        // This follow needs to be deleted
        const follow = {
          pk_rater: raterPubkey,
          pk_ratee: ratee,
          timestamp
        };
        
        // Make sure we're properly handling write operation with backpressure
        const canContinue = outputStream.write(JSON.stringify(follow) + '\n');
        if (!canContinue) {
          // If backpressure is detected, wait for the drain event
          await new Promise(resolve => outputStream.once('drain', resolve));
        }
        followsDeleted++;
      }
    }
    
    if (followsDeleted > 0) {
      // log(`Added ${followsDeleted} follows to delete for existing rater ${raterPubkey}`);
    }
    
    return followsDeleted;
  } catch (error) {
    log(`Error processing file ${neo4jFile}: ${error.message}`);
    return 0;
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    const startTime = Date.now();
    log('Starting calculation of follows updates for Neo4j');
    
    // Ensure output directory exists
    ensureOutputDirectory();
    
    //======================================================================
    // STEP 1: Calculate follows to ADD to Neo4j
    //======================================================================
    log('Step 1: Calculating follows to add to Neo4j');
    const stepOneStartTime = Date.now();
    
    // Create output file stream for follows to add
    const addOutputFile = path.join(config.outputDir, 'followsToAddToNeo4j.json');
    fs.writeFileSync(addOutputFile, ''); // Clear the file if it exists
    const addOutputStream = fs.createWriteStream(addOutputFile, {flags: 'w'});
    
    // Get all strfry follow files
    let strfryFiles = fs.readdirSync(config.strfryDir)
      .filter(file => file !== '_summary.json' && file.endsWith('.json'))
      .map(file => path.join(config.strfryDir, file));
    
    log(`Found ${strfryFiles.length} strfry rater files to process`);
    
    // Process files and find follows to add
    const totalFollowsAdded = await processFilesInBatches(strfryFiles, addOutputStream, config.concurrency);
    
    // Make sure all data is flushed to disk
    await new Promise((resolve, reject) => {
      addOutputStream.end(() => {
        log('Add output stream successfully closed');
        resolve();
      });
      addOutputStream.on('error', (err) => {
        log(`Error closing add output stream: ${err.message}`);
        reject(err);
      });
    });
    
    // Log completion of step 1
    const stepOneEndTime = Date.now();
    const stepOneDuration = (stepOneEndTime - stepOneStartTime) / 1000;
    log(`Completed calculation of follows to add in ${stepOneDuration.toFixed(2)} seconds`);
    log(`Total follows to add: ${totalFollowsAdded}`);
    log(`Output written to: ${addOutputFile}`);
    
    //======================================================================
    // STEP 2: Calculate follows to DELETE from Neo4j
    //======================================================================
    log('Step 2: Calculating follows to delete from Neo4j');
    const stepTwoStartTime = Date.now();
    
    // Create output file stream for follows to delete
    const deleteOutputFile = path.join(config.outputDir, 'followsToDeleteFromNeo4j.json');
    fs.writeFileSync(deleteOutputFile, ''); // Clear the file if it exists
    const deleteOutputStream = fs.createWriteStream(deleteOutputFile, {flags: 'w'});
    
    // Get all Neo4j follow files
    let neo4jFiles = fs.readdirSync(config.neo4jDir)
      .filter(file => file !== '_summary.json' && file.endsWith('.json'))
      .map(file => path.join(config.neo4jDir, file));
    
    log(`Found ${neo4jFiles.length} Neo4j rater files to process`);
    
    // Process files and find follows to delete
    let totalFollowsDeleted = 0;
    let processedFiles = 0;
    const totalFiles = neo4jFiles.length;
    
    // Process files in batches
    for (let i = 0; i < neo4jFiles.length; i += config.concurrency) {
      const batch = neo4jFiles.slice(i, i + config.concurrency);
      const results = await Promise.all(batch.map(file => processNeo4jFile(file, deleteOutputStream)));
      
      // Update counters
      const batchFollowsDeleted = results.reduce((sum, count) => sum + count, 0);
      totalFollowsDeleted += batchFollowsDeleted;
      processedFiles += batch.length;
      
      // Report progress
      const progress = Math.round((processedFiles / totalFiles) * 100);
      // log(`Delete progress: ${progress}% (${processedFiles}/${totalFiles}) - Added ${batchFollowsDeleted} follows in this batch`);
      
      // Force garbage collection if available
      if (global.gc) global.gc();
    }
    
    // Make sure all data is flushed to disk
    await new Promise((resolve, reject) => {
      deleteOutputStream.end(() => {
        log('Delete output stream successfully closed');
        resolve();
      });
      deleteOutputStream.on('error', (err) => {
        log(`Error closing delete output stream: ${err.message}`);
        reject(err);
      });
    });
    
    // Log completion of step 2
    const stepTwoEndTime = Date.now();
    const stepTwoDuration = (stepTwoEndTime - stepTwoStartTime) / 1000;
    log(`Completed calculation of follows to delete in ${stepTwoDuration.toFixed(2)} seconds`);
    log(`Total follows to delete: ${totalFollowsDeleted}`);
    log(`Output written to: ${deleteOutputFile}`);
    
    // Log overall completion
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    log(`Completed calculation of all follows updates in ${duration.toFixed(2)} seconds`);
    log(`Total follows to add: ${totalFollowsAdded}, Total follows to delete: ${totalFollowsDeleted}`);
    
    process.exit(0);
  } catch (error) {
    log(`ERROR: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  // If --expose-gc flag is provided, enable garbage collection
  if (process.argv.includes('--expose-gc')) {
    global.gc = global.gc || function() {};
  }
  
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
