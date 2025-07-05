#!/usr/bin/env node

/**
 * getCurrentReportsFromStrfry.js
 * 
 * Extracts current REPORTS relationships from Strfry database
 * Part of the reconciliation pipeline for Neo4j database maintenance
 * 
 * This script queries the Strfry database for kind 1984 (report) events
 * and extracts the reports relationships, writing them to a JSON file
 * in a memory-efficient manner using streaming.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { Transform, Writable, pipeline } = require('stream');

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('batch-size', {
    alias: 'b',
    type: 'number',
    description: 'Number of pubkeys to process in each batch',
    default: 1000
  })
  .option('output-dir', {
    alias: 'o',
    type: 'string',
    description: 'Directory to write output files',
    default: path.join(__dirname, 'output')
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
function log(message) {
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
function ensureOutputDirectory() {
  try {
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
      log(`Created output directory: ${config.outputDir}`);
    }
  } catch (error) {
    log(`ERROR: Failed to create output directory: ${error.message}`);
    throw error;
  }
}

/**
 * Get all distinct pubkeys that have kind 1984 events
 */
async function getAllPubkeys() {
  try {
    log('Getting list of unique pubkeys with kind 1984 events...');
    
    // Use strfry scan to list authors with kind 1984 events
    const command = 'sudo strfry scan "{\\"kinds\\":[1984]}" --limit 0 | jq -r .pubkey | sort | uniq';
    const pubkeysRaw = execSync(command).toString().trim();
    
    // Split into array and filter out any empty lines
    const pubkeys = pubkeysRaw.split('\n').filter(Boolean);
    
    log(`Found ${pubkeys.length} unique pubkeys with kind 1984 events`);
    return pubkeys;
  } catch (error) {
    log(`ERROR: Failed to get pubkey list: ${error.message}`);
    throw error;
  }
}

/**
 * Process a batch of pubkeys and extract their reports relationships
 */
async function processPubkeyBatch(pubkeys, batchIndex, totalBatches) {
  try {
    log(`Processing batch ${batchIndex}/${totalBatches} (${pubkeys.length} pubkeys)...`);
    
    const tempDir = path.join(config.outputDir, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const batchOutputFile = path.join(tempDir, `reports_batch_${batchIndex}.json`);
    
    // Create a write stream for the batch output
    const batchOutputStream = fs.createWriteStream(batchOutputFile);
    batchOutputStream.write('{\n');
    
    let firstPubkey = true;
    
    // Process each pubkey in the batch
    for (let i = 0; i < pubkeys.length; i++) {
      const pubkey = pubkeys[i];
      
      try {
        // Get the latest kind 1984 event for this pubkey
        const eventJson = execSync(`sudo strfry scan "{\\"kinds\\":[1984],\\"authors\\":[\\"${pubkey}\\"]}" --limit 1`).toString().trim();
        
        if (eventJson) {
          let event;
          try {
            event = JSON.parse(eventJson);
          } catch (parseError) {
            log(`WARNING: Failed to parse event for pubkey ${pubkey}: ${parseError.message}`);
            continue;
          }
          
          // Extract reports from the tags (p tags)
          const reports = {};
          if (event.tags && Array.isArray(event.tags)) {
            for (const tag of event.tags) {
              if (Array.isArray(tag) && tag[0] === 'p' && tag[1]) {
                const reportedPubkey = tag[1];
                reports[reportedPubkey] = event.created_at;
              }
            }
          }
          
          // If there are reports, write to the batch output
          if (Object.keys(reports).length > 0) {
            if (!firstPubkey) {
              batchOutputStream.write(',\n');
            }
            firstPubkey = false;
            
            batchOutputStream.write(`  "${pubkey}": ${JSON.stringify(reports)}`);
          }
        }
      } catch (error) {
        log(`WARNING: Failed to process pubkey ${pubkey}: ${error.message}`);
      }
      
      // Log progress every 100 pubkeys
      if ((i + 1) % 100 === 0 || i === pubkeys.length - 1) {
        const progress = Math.round(((i + 1) / pubkeys.length) * 100);
        log(`Batch ${batchIndex} of ${totalBatches} reports from strfry progress: ${progress}% (${i + 1}/${pubkeys.length} pubkeys)`);
      }
    }
    
    // Close the batch output
    batchOutputStream.write('\n}');
    batchOutputStream.end();
    
    // Wait for the write to complete
    await new Promise((resolve, reject) => {
      batchOutputStream.on('finish', resolve);
      batchOutputStream.on('error', reject);
    });
    
    log(`Completed batch ${batchIndex} processing`);
    return batchOutputFile;
  } catch (error) {
    log(`ERROR: Failed to process pubkey batch ${batchIndex}: ${error.message}`);
    throw error;
  }
}

/**
 * Merge batch output files into a single output file
 */
async function mergeBatchFiles(batchFiles) {
  try {
    log(`Merging ${batchFiles.length} batch files...`);
    
    const outputFile = path.join(config.outputDir, 'currentReports_strfry.json');
    const outputStream = fs.createWriteStream(outputFile);
    
    // Start the output JSON
    outputStream.write('{\n');
    
    let isFirstBatch = true;
    
    // Process each batch file
    for (let i = 0; i < batchFiles.length; i++) {
      const batchFile = batchFiles[i];
      
      try {
        // Read the batch file content
        const batchContent = fs.readFileSync(batchFile, 'utf8');
        
        // Parse the content to extract just the pubkeys and reports
        const trimmedContent = batchContent.substring(1, batchContent.length - 1).trim();
        
        if (trimmedContent) {
          if (!isFirstBatch) {
            outputStream.write(',\n');
          }
          isFirstBatch = false;
          
          outputStream.write(trimmedContent);
        }
        
        // Remove the temporary batch file
        fs.unlinkSync(batchFile);
        
      } catch (error) {
        log(`WARNING: Error processing batch file ${batchFile}: ${error.message}`);
      }
      
      // Log progress
      if ((i + 1) % 10 === 0 || i === batchFiles.length - 1) {
        const progress = Math.round(((i + 1) / batchFiles.length) * 100);
        log(`Merge progress: ${progress}% (${i + 1}/${batchFiles.length} files)`);
      }
      
      // Trigger garbage collection if available
      if (global.gc) global.gc();
    }
    
    // Close the output JSON
    outputStream.write('\n}');
    outputStream.end();
    
    // Wait for the write to complete
    await new Promise((resolve, reject) => {
      outputStream.on('finish', resolve);
      outputStream.on('error', reject);
    });
    
    log(`Merged batch files into ${outputFile}`);
    return outputFile;
  } catch (error) {
    log(`ERROR: Failed to merge batch files: ${error.message}`);
    throw error;
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    // Start time tracking
    const startTime = Date.now();
    
    log('Starting extraction of current REPORTS relationships from Strfry');
    
    // Ensure output directory exists
    ensureOutputDirectory();
    
    // Get all pubkeys with kind 1984 events
    const allPubkeys = await getAllPubkeys();
    
    // Process pubkeys in batches
    const batchFiles = [];
    const batchCount = Math.ceil(allPubkeys.length / config.batchSize);
    
    for (let i = 0; i < allPubkeys.length; i += config.batchSize) {
      const batchIndex = Math.floor(i / config.batchSize) + 1;
      const batchPubkeys = allPubkeys.slice(i, i + config.batchSize);
      
      const batchFile = await processPubkeyBatch(batchPubkeys, batchIndex, batchCount);
      batchFiles.push(batchFile);
      
      // Trigger garbage collection if available
      if (global.gc) global.gc();
    }
    
    // Merge batch files
    const outputFile = await mergeBatchFiles(batchFiles);
    
    // Calculate stats from the output file
    const outputContent = fs.readFileSync(outputFile, 'utf8');
    const reportsData = JSON.parse(outputContent);
    
    const userCount = Object.keys(reportsData).length;
    let reportsCount = 0;
    
    for (const pubkey in reportsData) {
      reportsCount += Object.keys(reportsData[pubkey]).length;
    }
    
    log(`Extracted REPORTS relationships for ${userCount} users`);
    log(`Found a total of ${reportsCount} REPORTS relationships`);
    
    // Log completion time
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    log(`Completed extraction of Strfry reports in ${duration.toFixed(2)} seconds`);
    
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
