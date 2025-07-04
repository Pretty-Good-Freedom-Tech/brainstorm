#!/usr/bin/env node

/**
 * getCurrentReportsFromStrfry.js
 * 
 * Extracts current REPORTS relationships from Strfry database
 * Part of the reconciliation pipeline for Neo4j database maintenance
 * 
 * This script queries the Strfry database for kind 1984 (report) events
 * and extracts the reports relationships, writing them to a JSON file
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
 * Get the total count of kind 1984 events in Strfry
 * @returns {number} Total count of kind 1984 events
 */
async function getKind1984EventCount() {
  try {
    // Use strfry-query to count kind 1984 events
    const command = `cd ${config.strfryDir} && ./strfry-query --count 'SELECT * FROM events WHERE kind = 1984'`;
    const output = execSync(command).toString().trim();
    const count = parseInt(output, 10);
    return count;
  } catch (error) {
    await log(`ERROR: Failed to get kind 1984 event count: ${error.message}`);
    throw error;
  }
}

/**
 * Process a batch of kind 1984 events and extract reports relationships
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
      reports: path.join(tempDir, `reports_${batchId}.json`)
    };
    
    // Use strfry-query to get kind 1984 events for this batch
    const command = `cd ${config.strfryDir} && ./strfry-query 'SELECT * FROM events WHERE kind = 1984 ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}'`;
    const output = execSync(command).toString().trim();
    
    // Parse the JSON output
    const events = JSON.parse(output);
    
    // Process the events
    const userPubkeys = new Set();
    const reports = {};
    
    for (const event of events) {
      const pubkey = event.pubkey;
      userPubkeys.add(pubkey);
      
      // Parse the tags to find p tags (reports)
      if (event.tags && Array.isArray(event.tags)) {
        // Initialize reports map for this user if it doesn't exist
        if (!reports[pubkey]) {
          reports[pubkey] = {};
        }
        
        // Extract p tags (reports)
        for (const tag of event.tags) {
          if (Array.isArray(tag) && tag[0] === 'p' && tag[1]) {
            const targetPubkey = tag[1];
            // Store the timestamp as the value
            reports[pubkey][targetPubkey] = event.created_at;
          }
        }
      }
    }
    
    // Write batch data to temporary files
    await writeFile(tempFiles.userPubkeys, JSON.stringify([...userPubkeys]));
    await writeFile(tempFiles.reports, JSON.stringify(reports));
    
    return {
      stats: {
        eventsProcessed: events.length,
        usersWithReports: Object.keys(reports).length,
        totalReports: Object.values(reports).reduce((sum, reportMap) => sum + Object.keys(reportMap).length, 0)
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
async function writeReportsData(tempFilesArray) {
  const strfryReportsFile = path.join(config.outputDir, 'currentReports_strfry.json');
  
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
  const outputStream = fs.createWriteStream(strfryReportsFile);
  
  // Start the JSON object
  outputStream.write('{\n');
  
  // Write user pubkeys array
  await log(`Writing ${userPubkeysSet.size} unique user pubkeys...`);
  outputStream.write('  "userPubkeys": ' + JSON.stringify([...userPubkeysSet]) + ',\n');
  
  // Write reports relationships
  await log('Writing REPORTS relationships...');
  outputStream.write('  "reports": {\n');
  
  let firstReportUser = true;
  for (const tempFiles of tempFilesArray) {
    try {
      const reportsData = JSON.parse(fs.readFileSync(tempFiles.reports, 'utf8'));
      const userKeys = Object.keys(reportsData);
      
      for (let i = 0; i < userKeys.length; i++) {
        const pubkey = userKeys[i];
        // Add comma separator if not the first item
        if (!firstReportUser) {
          outputStream.write(',\n');
        }
        firstReportUser = false;
        
        // Write each user's reports as a separate chunk
        outputStream.write(`    "${pubkey}": ${JSON.stringify(reportsData[pubkey])}`);
      }
      
      // Remove temporary file to save disk space
      fs.unlinkSync(tempFiles.reports);
    } catch (error) {
      await log(`Error processing reports: ${error.message}`);
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
  
  await log(`Wrote Strfry reports data to ${strfryReportsFile}`);
  
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
  
  return { filePath: strfryReportsFile };
}

/**
 * Main execution function
 */
async function main() {
  try {
    // Start time tracking
    const startTime = Date.now();
    
    await log('Starting extraction of current REPORTS relationships from Strfry');
    
    // Ensure output directory exists
    await ensureOutputDirectory();
    
    // Get total event count for progress tracking
    const totalEvents = await getKind1984EventCount();
    await log(`Found ${totalEvents} kind 1984 events in Strfry`);
    
    // Process events in batches
    const tempFiles = [];
    let totalEventsProcessed = 0;
    let totalUsersWithReports = 0;
    let totalReportsCount = 0;
    
    for (let offset = 0; offset < totalEvents; offset += config.batchSize) {
      const limit = Math.min(config.batchSize, totalEvents - offset);
      await log(`Processing events batch ${offset} to ${offset + limit}...`);
      
      const { stats, tempFiles: batchTempFiles } = await processEventBatch(offset, limit);
      
      tempFiles.push(batchTempFiles);
      totalEventsProcessed += stats.eventsProcessed;
      totalUsersWithReports += stats.usersWithReports;
      totalReportsCount += stats.totalReports;
      
      // Log progress
      const progress = Math.min(100, Math.round((offset + limit) / totalEvents * 100));
      await log(`Processed ${offset + limit}/${totalEvents} events (${progress}%)`);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
    
    await log(`Processed ${totalEventsProcessed} kind 1984 events`);
    await log(`Found ${totalUsersWithReports} users with REPORTS relationships`);
    await log(`Found ${totalReportsCount} total REPORTS relationships`);
    
    // Merge temporary files into final output
    await log('Merging batch files into final output...');
    await writeReportsData(tempFiles);
    
    // Log completion time
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    await log(`Completed extraction of Strfry reports in ${duration.toFixed(2)} seconds`);
    
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
