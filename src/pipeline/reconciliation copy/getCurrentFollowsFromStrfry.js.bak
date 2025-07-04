#!/usr/bin/env node

/**
 * getCurrentFollowsFromStrfry.js
 * 
 * Extracts current FOLLOWS relationships from Strfry database
 * Part of the reconciliation pipeline for Neo4j database maintenance
 * 
 * This script queries the Strfry database for kind 3 (contacts) events
 * and extracts the follows relationships, writing them to a JSON file
 * in a memory-efficient manner using batch processing and streaming writes.
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execSync } = require('child_process');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Promisify fs functions
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('batch-size', {
    alias: 'b',
    type: 'number',
    description: 'Number of events to process in each batch',
    default: 10000
  })
  .option('output-dir', {
    alias: 'o',
    type: 'string',
    description: 'Directory to write output files',
    default: path.join(__dirname, 'output')
  })
  .option('strfry-dir', {
    alias: 's',
    type: 'string',
    description: 'Directory containing Strfry database',
    default: process.env.STRFRY_DIR || '/var/lib/strfry'
  })
  .option('log-file', {
    alias: 'l',
    type: 'string',
    description: 'Log file path',
    default: process.env.LOG_FILE || '/var/log/brainstorm/reconciliation.log'
  })
  .help()
  .argv;

// Configuration
const config = {
  batchSize: argv['batch-size'],
  outputDir: argv['output-dir'],
  strfryDir: argv['strfry-dir'],
  logFile: argv['log-file']
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
async function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}\n`;
  
  console.log(message);
  
  try {
    fs.appendFileSync(config.logFile, logMessage);
  } catch (error) {
    console.error(`Error writing to log file: ${error.message}`);
  }
}

/**
 * Ensure the output directory exists
 */
async function ensureOutputDirectory() {
  try {
    if (!fs.existsSync(config.outputDir)) {
      await mkdir(config.outputDir, { recursive: true });
      await log(`Created output directory: ${config.outputDir}`);
    }
  } catch (error) {
    await log(`ERROR: Failed to create output directory: ${error.message}`);
    throw error;
  }
}

/**
 * Get the total count of kind 3 events in Strfry
 * @returns {number} Total count of kind 3 events
 */
async function getKind3EventCount() {
  try {
    // Use strfry-query to count kind 3 events
    const command = `cd ${config.strfryDir} && ./strfry-query --count 'SELECT * FROM events WHERE kind = 3'`;
    const output = execSync(command).toString().trim();
    const count = parseInt(output, 10);
    return count;
  } catch (error) {
    await log(`ERROR: Failed to get kind 3 event count: ${error.message}`);
    throw error;
  }
}

/**
 * Process a batch of kind 3 events and extract follows relationships
 * @param {number} offset - Offset for the batch
 * @param {number} limit - Limit for the batch
 * @returns {Object} Batch data and temporary file paths
 */
async function processEventBatch(offset, limit) {
  try {
    // Create temporary files for this batch
    const batchId = `batch_${offset}_${offset + limit}`;
    const tempDir = path.join(config.outputDir, 'temp');
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFiles = {
      userPubkeys: path.join(tempDir, `users_${batchId}.json`),
      follows: path.join(tempDir, `follows_${batchId}.json`)
    };
    
    // Use strfry-query to get kind 3 events for this batch
    const command = `cd ${config.strfryDir} && ./strfry-query 'SELECT * FROM events WHERE kind = 3 ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}'`;
    const output = execSync(command).toString().trim();
    
    // Parse the JSON output
    const events = JSON.parse(output);
    
    // Process the events
    const userPubkeys = new Set();
    const follows = {};
    
    for (const event of events) {
      const pubkey = event.pubkey;
      userPubkeys.add(pubkey);
      
      // Parse the tags to find p tags (follows)
      if (event.tags && Array.isArray(event.tags)) {
        // Initialize follows map for this user if it doesn't exist
        if (!follows[pubkey]) {
          follows[pubkey] = {};
        }
        
        // Extract p tags (follows)
        for (const tag of event.tags) {
          if (Array.isArray(tag) && tag[0] === 'p' && tag[1]) {
            const targetPubkey = tag[1];
            // Store the timestamp as the value
            follows[pubkey][targetPubkey] = event.created_at;
          }
        }
      }
    }
    
    // Write batch data to temporary files
    await writeFile(tempFiles.userPubkeys, JSON.stringify([...userPubkeys]));
    await writeFile(tempFiles.follows, JSON.stringify(follows));
    
    return {
      stats: {
        eventsProcessed: events.length,
        usersWithFollows: Object.keys(follows).length,
        totalFollows: Object.values(follows).reduce((sum, followMap) => sum + Object.keys(followMap).length, 0)
      },
      tempFiles
    };
  } catch (error) {
    await log(`ERROR: Failed to process event batch ${offset}-${offset + limit}: ${error.message}`);
    throw error;
  }
}

/**
 * Merge temporary batch files into a single output file
 * @param {Array} tempFilesArray - Array of objects containing paths to temp files
 */
async function writeFollowsData(tempFilesArray) {
  const strfryFollowsFile = path.join(config.outputDir, 'currentFollows_strfry.json');
  
  // Process and write data in chunks to avoid memory limits
  await log('Collecting and deduplicating user pubkeys...');
  
  // First pass: collect all unique pubkeys
  const userPubkeysSet = new Set();
  for (const tempFiles of tempFilesArray) {
    try {
      // Read and parse user pubkeys
      const userPubkeysData = JSON.parse(fs.readFileSync(tempFiles.userPubkeys, 'utf8'));
      for (const pubkey of userPubkeysData) {
        userPubkeysSet.add(pubkey);
      }
    } catch (error) {
      await log(`Error processing user pubkeys: ${error.message}`);
    }
  }
  
  // Create write stream for the output file
  const outputStream = fs.createWriteStream(strfryFollowsFile);
  
  // Start the JSON object
  outputStream.write('{\n');
  
  // Write user pubkeys array
  await log(`Writing ${userPubkeysSet.size} unique user pubkeys...`);
  outputStream.write('  "userPubkeys": ' + JSON.stringify([...userPubkeysSet]) + ',\n');
  
  // Write follows relationships
  await log('Writing FOLLOWS relationships...');
  outputStream.write('  "follows": {\n');
  
  let firstFollowUser = true;
  for (const tempFiles of tempFilesArray) {
    try {
      const followsData = JSON.parse(fs.readFileSync(tempFiles.follows, 'utf8'));
      const userKeys = Object.keys(followsData);
      
      for (let i = 0; i < userKeys.length; i++) {
        const pubkey = userKeys[i];
        // Add comma separator if not the first item
        if (!firstFollowUser) {
          outputStream.write(',\n');
        }
        firstFollowUser = false;
        
        // Write each user's follows as a separate chunk
        outputStream.write(`    "${pubkey}": ${JSON.stringify(followsData[pubkey])}`);
      }
      
      // Remove temporary file to save disk space
      fs.unlinkSync(tempFiles.follows);
    } catch (error) {
      await log(`Error processing follows: ${error.message}`);
    }
  }
  outputStream.write('\n  }\n');
  
  // Close the JSON object
  outputStream.write('}');
  
  // Close the stream
  outputStream.end();
  
  // Wait for the stream to finish
  await new Promise((resolve, reject) => {
    outputStream.on('finish', resolve);
    outputStream.on('error', reject);
  });
  
  await log(`Wrote Strfry follows data to ${strfryFollowsFile}`);
  
  // Clean up remaining temporary files
  for (const tempFiles of tempFilesArray) {
    try {
      if (fs.existsSync(tempFiles.userPubkeys)) {
        fs.unlinkSync(tempFiles.userPubkeys);
      }
    } catch (error) {
      await log(`Error removing temp file: ${error.message}`);
    }
  }
  
  return { filePath: strfryFollowsFile };
}

/**
 * Main execution function
 */
async function main() {
  try {
    // Start time tracking
    const startTime = Date.now();
    
    await log('Starting extraction of current FOLLOWS relationships from Strfry');
    
    // Ensure output directory exists
    await ensureOutputDirectory();
    
    // Get total event count for progress tracking
    const totalEvents = await getKind3EventCount();
    await log(`Found ${totalEvents} kind 3 events in Strfry`);
    
    // Process events in batches
    const tempFiles = [];
    let totalEventsProcessed = 0;
    let totalUsersWithFollows = 0;
    let totalFollowsCount = 0;
    
    for (let offset = 0; offset < totalEvents; offset += config.batchSize) {
      const limit = Math.min(config.batchSize, totalEvents - offset);
      await log(`Processing events batch ${offset} to ${offset + limit}...`);
      
      const { stats, tempFiles: batchTempFiles } = await processEventBatch(offset, limit);
      
      tempFiles.push(batchTempFiles);
      totalEventsProcessed += stats.eventsProcessed;
      totalUsersWithFollows += stats.usersWithFollows;
      totalFollowsCount += stats.totalFollows;
      
      // Log progress
      const progress = Math.min(100, Math.round((offset + limit) / totalEvents * 100));
      await log(`Processed ${offset + limit}/${totalEvents} events (${progress}%)`);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
    
    await log(`Processed ${totalEventsProcessed} kind 3 events`);
    await log(`Found ${totalUsersWithFollows} users with FOLLOWS relationships`);
    await log(`Found ${totalFollowsCount} total FOLLOWS relationships`);
    
    // Merge temporary files into final output
    await log('Merging batch files into final output...');
    await writeFollowsData(tempFiles);
    
    // Log completion time
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    await log(`Completed extraction of Strfry follows in ${duration.toFixed(2)} seconds`);
    
    process.exit(0);
  } catch (error) {
    await log(`ERROR: ${error.message}`);
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
  
  main();
}
