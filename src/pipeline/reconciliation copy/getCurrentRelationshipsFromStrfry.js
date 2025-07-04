#!/usr/bin/env node

/**
 * getCurrentRelationshipsFromStrfry.js
 * 
 * Orchestrates the extraction of all relationship types from Strfry database
 * Part of the reconciliation pipeline for Neo4j database maintenance
 * 
 * This script calls the individual extraction scripts for follows, mutes, and reports
 * and combines their outputs into a single comprehensive relationships file.
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { spawn } = require('child_process');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Promisify fs functions
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
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
  .option('expose-gc', {
    type: 'boolean',
    description: 'Enable garbage collection',
    default: false
  })
  .help()
  .argv;

// Configuration
const config = {
  batchSize: argv['batch-size'],
  outputDir: argv['output-dir'],
  strfryDir: argv['strfry-dir'],
  logFile: argv['log-file'],
  exposeGc: argv['expose-gc']
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
 * Run a child process and return a promise that resolves when the process exits
 * @param {string} scriptPath - Path to the script to run
 * @param {Array} args - Arguments to pass to the script
 * @returns {Promise} Promise that resolves when the process exits
 */
async function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const scriptName = path.basename(scriptPath);
    const nodeArgs = config.exposeGc ? ['--expose-gc'] : [];
    const childProcess = spawn('node', [...nodeArgs, scriptPath, ...args], {
      stdio: 'inherit',
      env: { ...process.env, STRFRY_DIR: config.strfryDir, LOG_FILE: config.logFile }
    });
    
    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${scriptName} exited with code ${code}`));
      }
    });
    
    childProcess.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Verify that all individual relationship files were created successfully
 * @returns {Promise<Object>} Promise that resolves with paths to the output files
 */
async function verifyOutputFiles() {
  const followsFile = path.join(config.outputDir, 'currentFollows_strfry.json');
  const mutesFile = path.join(config.outputDir, 'currentMutes_strfry.json');
  const reportsFile = path.join(config.outputDir, 'currentReports_strfry.json');
  
  try {
    // Check if all files exist
    const filesExist = [
      fs.existsSync(followsFile),
      fs.existsSync(mutesFile),
      fs.existsSync(reportsFile)
    ];
    
    if (!filesExist.every(Boolean)) {
      const missingFiles = [
        filesExist[0] ? null : 'follows',
        filesExist[1] ? null : 'mutes',
        filesExist[2] ? null : 'reports'
      ].filter(Boolean);
      
      throw new Error(`Missing relationship files: ${missingFiles.join(', ')}`);
    }
    
    await log('Verified all relationship files were created successfully');
    
    return {
      followsFile,
      mutesFile,
      reportsFile
    };
  } catch (error) {
    await log(`ERROR: Failed to verify output files: ${error.message}`);
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
    
    await log('Starting extraction of all relationships from Strfry');
    
    // Ensure output directory exists
    await ensureOutputDirectory();
    
    // Common arguments for all scripts
    const scriptArgs = [
      '--batch-size', config.batchSize.toString(),
      '--output-dir', config.outputDir,
      '--strfry-dir', config.strfryDir,
      '--log-file', config.logFile
    ];
    
    // Run the individual extraction scripts
    await log('Extracting FOLLOWS relationships...');
    await runScript(
      path.join(__dirname, 'getCurrentFollowsFromStrfry.js'),
      scriptArgs
    );
    
    await log('Extracting MUTES relationships...');
    await runScript(
      path.join(__dirname, 'getCurrentMutesFromStrfry.js'),
      scriptArgs
    );
    
    await log('Extracting REPORTS relationships...');
    await runScript(
      path.join(__dirname, 'getCurrentReportsFromStrfry.js'),
      scriptArgs
    );
    
    // Verify that all output files were created successfully
    await log('Verifying output files...');
    const outputFiles = await verifyOutputFiles();
    
    // Log completion time
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    await log(`Completed extraction of all Strfry relationships in ${duration.toFixed(2)} seconds`);
    await log(`Output files:`);
    await log(`  - Follows: ${outputFiles.followsFile}`);
    await log(`  - Mutes: ${outputFiles.mutesFile}`);
    await log(`  - Reports: ${outputFiles.reportsFile}`);
    
    process.exit(0);
  } catch (error) {
    await log(`ERROR: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main();
}
