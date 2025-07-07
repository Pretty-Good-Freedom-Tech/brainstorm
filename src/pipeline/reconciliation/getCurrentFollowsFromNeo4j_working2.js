#!/usr/bin/env node
/**
 * getCurrentFollowsFromNeo4j.js
 * 
 * Extracts current FOLLOWS relationship data from Neo4j and creates individual JSON files
 * for each rater, stored in currentRelationshipsFromNeo4j/follows/
 * 
 * Each file is named after the pubkey of the rater and contains a JSON object with
 * the rater's pubkey as key and an object of ratee pubkeys as values.
 */

const neo4j = require('neo4j-driver');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Create promisified versions of fs functions
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('neo4jUri', {
    describe: 'Neo4j connection URI',
    type: 'string',
    default: 'bolt://localhost:7687'
  })
  .option('neo4jUser', {
    describe: 'Neo4j username',
    type: 'string',
    default: 'neo4j'
  })
  .option('neo4jPassword', {
    describe: 'Neo4j password',
    type: 'string',
    default: ''
  })
  .option('outputDir', {
    describe: 'Directory for output files',
    type: 'string',
    default: path.join(__dirname, 'currentRelationshipsFromNeo4j/follows')
  })
  .option('logFile', {
    describe: 'Log file path',
    type: 'string',
    default: '/var/log/brainstorm/reconciliation.log'
  })
  .option('batchSize', {
    describe: 'Number of users to process in each batch',
    type: 'number',
    default: 1000
  })
  .help()
  .argv;

// Configuration
const config = {
  neo4j: {
    uri: argv.neo4jUri,
    user: argv.neo4jUser,
    password: argv.neo4jPassword
  },
  outputDir: argv.outputDir,
  logFile: argv.logFile,
  batchSize: argv.batchSize
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
  const timestamp = new Date().getTime();
  const logMessage = `${timestamp}: getCurrentFollowsFromNeo4j - ${message}\n`;
  
  console.log(message);
  
  try {
    fs.appendFileSync(config.logFile, logMessage);
  } catch (error) {
    console.error(`Error writing to log file: ${error.message}`);
  }
}

// Initialize the Neo4j driver
const driver = neo4j.driver(
  config.neo4j.uri,
  neo4j.auth.basic(config.neo4j.user, config.neo4j.password),
  { maxConnectionPoolSize: 50 }
);

/**
 * Ensure output directory exists
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
 * Get count of raters (users who have FOLLOWS relationships)
 */
async function getRaterCount() {
  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (u:NostrUser)-[r:FOLLOWS]->()
      RETURN COUNT(DISTINCT u) AS count
    `);
    
    const count = result.records[0].get('count').toInt();
    await log(`Found ${count} users with FOLLOWS relationships`);
    return count;
  } catch (error) {
    await log(`ERROR: Failed to get rater count: ${error.message}`);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Get all raters (users who have FOLLOWS relationships)
 * @param {number} skip - Number of raters to skip
 * @param {number} limit - Maximum number of raters to return
 * @returns {Array} Array of rater pubkeys
 */
async function getRaters(skip, limit) {
  const session = driver.session();
  try {
    const cypherQuery = ` MATCH (u:NostrUser)-[r:FOLLOWS]->(target:NostrUser)
      RETURN DISTINCT u.pubkey AS pubkey
      ORDER BY u.pubkey
      SKIP ${skip}
      LIMIT ${limit}`;
    const result = await session.run(cypherQuery);
    
    return result.records.map(record => record.get('pubkey'));
  } catch (error) {
    await log(`ERROR: Failed to get raters: ${error.message}`);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Create a promise that rejects after specified timeout
 * @param {number} ms - Timeout in milliseconds
 * @returns {Promise} Promise that rejects after timeout
 */
function timeout(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`function: getFollowsForRater timed out after ${ms}ms`)), ms);
  });
}

/**
 * Get all FOLLOWS relationships for a specific rater with timeout
 * @param {string} raterPubkey - Pubkey of the rater
 * @param {number} timeoutMs - Timeout in milliseconds (default: 60000 - 60 seconds)
 * @returns {Object} Object containing the rater's FOLLOWS relationships
 */
async function getFollowsForRater(raterPubkey, timeoutMs = 60000) {
  const session = driver.session();
  try {
    // Create the query promise
    const queryPromise = session.run(`
      MATCH (u:NostrUser {pubkey: $pubkey})-[r:FOLLOWS]->(target:NostrUser)
      RETURN target.pubkey AS ratee
    `, { pubkey: raterPubkey });
    
    // Race between the query and a timeout
    const result = await Promise.race([
      queryPromise,
      timeout(timeoutMs)
    ]);
    
    const follows = {};
    result.records.forEach(record => {
      const ratee = record.get('ratee');
      // Use boolean true instead of timestamp
      follows[ratee] = true;
    });
    
    return { [raterPubkey]: follows };
  } catch (error) {
    if (error.message.includes('timed out')) {
      log(`TIMEOUT: Query for rater ${raterPubkey} exceeded ${timeoutMs}ms`);
    } else {
      log(`ERROR: Getting FOLLOWS for rater ${raterPubkey}: ${error.message}`);
    }
    throw error;
  } finally {
    await session.close();
  }
}

function writeFileWithTimeout(filePath, data, options = {}, timeoutMs = 10000) {
  return Promise.race([
    writeFile(filePath, data, options),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`writeFile to ${filePath} timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

/**
 * Process a batch of raters and create individual JSON files
 * @param {Array} raters - Array of rater pubkeys
 * @param {number} batchIndex - Index of the current batch
 * @param {number} totalBatches - Total number of batches
 */
async function processRaterBatch(raters, batchIndex, totalBatches) {
  // await log(`Processing batch ${batchIndex}/${totalBatches} (${raters.length} raters)...`);
  
  let processedCount = 0;
  let errorCount = 0;
  
  // create new log file called reconciliation_currentRaterBatch.log
  const currentRaterBatchLogFile = path.join('/var/log/brainstorm/', `reconciliation_currentRaterBatch.log`);
  // delete log file if it exists
  if (fs.existsSync(currentRaterBatchLogFile)) {
    fs.unlinkSync(currentRaterBatchLogFile);
  }
  // now create it
  fs.writeFileSync(currentRaterBatchLogFile, '');
  
  for (const raterPubkey of raters) {
    try {
      // log to log file
      fs.appendFileSync(currentRaterBatchLogFile, `\n\nProcessing rater ${raterPubkey}; processedCount: ${processedCount}; errorCount: ${errorCount}\n`);
      const followsData = await getFollowsForRater(raterPubkey);
      fs.appendFileSync(currentRaterBatchLogFile, `Processing rater ${raterPubkey}; followsData successful\n`);
      const filePath = path.join(config.outputDir, `${raterPubkey}.json`);    
      
      fs.appendFileSync(currentRaterBatchLogFile, `Processing rater ${raterPubkey}; filePath successful\n`);

      if (followsData) {
        fs.appendFileSync(currentRaterBatchLogFile, `Processing rater ${raterPubkey}; filePath: ${filePath}; stringified followsData: ${JSON.stringify(followsData)}\n`);
        // await writeFile(filePath, JSON.stringify(followsData, null, 2));
        await writeFileWithTimeout(filePath, JSON.stringify(followsData, null, 2));
        fs.appendFileSync(currentRaterBatchLogFile, `Processing rater ${raterPubkey}; writeFile successful\n`);
        processedCount++;
      } else {
        fs.appendFileSync(currentRaterBatchLogFile, `Processing rater ${raterPubkey}; writeFile failed\n`);
        await log(`WARNING: Empty data for rater ${raterPubkey}, skipping file write`);
      }
      
      // Log progress periodically
      if (processedCount % 10 === 0 || processedCount === raters.length) {
        const progress = Math.round((processedCount / raters.length) * 100);
        fs.appendFileSync(currentRaterBatchLogFile, `Processing rater ${raterPubkey}; progress ${progress}%\n`);
        // await log(`Batch ${batchIndex} of ${totalBatches} progress: ${progress}% (${processedCount}/${raters.length} Neo4j followers)`);
      }
      fs.appendFileSync(currentRaterBatchLogFile, `Processing rater ${raterPubkey}; completed\n`);
    } catch (error) {
      fs.appendFileSync(currentRaterBatchLogFile, `Processing rater ${raterPubkey}; error ${error.message}\n`);
      await log(`WARNING: Failed to process rater ${raterPubkey}: ${error.message}`);
      errorCount++;
    }
    
    // Force garbage collection if available; log when garbage collection is about to be performed
    if (global.gc) {
      await log(`Garbage collection about to be performed`);
      global.gc();
    }
  }
  
  await log(`Completed batch ${batchIndex} of ${totalBatches}. Processed: ${processedCount}, Errors: ${errorCount}`);
}

/**
 * Main execution function
 */
async function main() {
  try {
    const startTime = Date.now();
    await log('Starting extraction of FOLLOWS relationships from Neo4j');
    
    // Ensure output directory exists
    await ensureOutputDirectory();
    
    // Get total count of raters
    const raterCount = await getRaterCount();
    
    // Process raters in batches
    const batchCount = Math.ceil(raterCount / config.batchSize);
    
    for (let i = 0; i < raterCount; i += config.batchSize) {
      const batchIndex = Math.floor(i / config.batchSize) + 1;
      const batchRaters = await getRaters(i, config.batchSize);
      
      await processRaterBatch(batchRaters, batchIndex, batchCount);
      
      // Force garbage collection if available; log when garbage collection is about to be performed
      if (global.gc) {
        await log(`Garbage collection about to be performed`);
        global.gc();
      }
    }
    
    // Create a summary file with the count of extracted relationships
    const summaryFile = path.join(config.outputDir, '_summary.json');
    await writeFile(summaryFile, JSON.stringify({
      extractedAt: new Date().toISOString(),
      raterCount,
      type: 'FOLLOWS'
    }, null, 2));
    
    // Log completion
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    await log(`Completed extraction of FOLLOWS relationships in ${duration.toFixed(2)} seconds`);
    
    await driver.close();
    process.exit(0);
  } catch (error) {
    await log(`ERROR: ${error.message}`);
    console.error(error);
    
    // Close Neo4j driver before exiting
    try {
      await driver.close();
    } catch (closeError) {
      console.error('Error closing Neo4j driver:', closeError);
    }
    
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
