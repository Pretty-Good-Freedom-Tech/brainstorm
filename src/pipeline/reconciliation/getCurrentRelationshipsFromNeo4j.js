#!/usr/bin/env node
/**
 * getCurrentRelationshipsFromNeo4j.js
 * 
 * Extracts current relationship data from Neo4j and creates a representation
 * of all relationships (FOLLOWS, MUTES, REPORTS) for each NostrUser.
 * 
 * Outputs:
 * - CSV file listing all NostrUsers with relationships in Neo4j
 * - JSON file with relationship maps for fast comparison
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
  .option('csvDir', {
    describe: 'Directory for CSV output files',
    type: 'string',
    default: path.join(__dirname, 'csv')
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
  outputDir: argv.csvDir,
  logFile: argv.logFile,
  batchSize: argv.batchSize
};

// Initialize the Neo4j driver
const driver = neo4j.driver(
  config.neo4j.uri,
  neo4j.auth.basic(config.neo4j.user, config.neo4j.password),
  { maxConnectionPoolSize: 50 }
);

/**
 * Log a message to both console and log file
 * @param {string} message - Message to log
 */
async function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}`;
  console.log(logMessage);
  
  // Append to log file
  try {
    fs.appendFileSync(config.logFile, logMessage + '\n');
  } catch (error) {
    console.error(`Error writing to log file: ${error.message}`);
  }
}

/**
 * Ensure output directory exists
 */
async function ensureOutputDirectory() {
  try {
    await mkdir(config.outputDir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Get total count of NostrUser nodes in Neo4j
 * @returns {Promise<number>} Total count of NostrUser nodes
 */
async function getTotalUserCount() {
  const session = driver.session();
  try {
    const result = await session.run('MATCH (u:NostrUser) RETURN count(u) AS userCount');
    return parseInt(result.records[0].get('userCount').toString());
  } finally {
    await session.close();
  }
}

/**
 * Get count of relationship types in Neo4j
 * @returns {Promise<Object>} Counts of different relationship types
 */
async function getRelationshipCounts() {
  const session = driver.session();
  try {
    const result = await session.run(`
      CALL {
        MATCH ()-[r:FOLLOWS]->() RETURN count(r) AS followsCount
      }
      CALL {
        MATCH ()-[r:MUTES]->() RETURN count(r) AS mutesCount
      }
      CALL {
        MATCH ()-[r:REPORTS]->() RETURN count(r) AS reportsCount
      }
      RETURN followsCount, mutesCount, reportsCount
    `);
    
    const record = result.records[0];
    return {
      follows: record.get('followsCount').toNumber(),
      mutes: record.get('mutesCount').toNumber(),
      reports: record.get('reportsCount').toNumber()
    };
  } finally {
    await session.close();
  }
}

/**
 * Process a batch of users and write their relationships to temporary files
 * @param {number} skip - Number of users to skip
 * @param {number} batchSize - Number of users to process in this batch
 * @returns {Promise<Object>} Batch statistics
 */
async function processUserBatch(skip, batchSize) {
  const session = driver.session();
  const batchStats = {
    usersWithRelationships: 0,
    followsCount: 0,
    mutesCount: 0,
    reportsCount: 0
  };
  
  const tempUserPubkeysFile = path.join(config.outputDir, `temp_userPubkeys_${skip}.json`);
  const tempFollowsFile = path.join(config.outputDir, `temp_follows_${skip}.json`);
  const tempMutesFile = path.join(config.outputDir, `temp_mutes_${skip}.json`);
  const tempReportsFile = path.join(config.outputDir, `temp_reports_${skip}.json`);
  
  try {
    // In-memory storage for this batch only
    const batchUserPubkeys = new Set();
    const batchFollows = {};
    const batchMutes = {};
    const batchReports = {};
    
    await log(`Processing users batch ${skip} to ${skip + batchSize}...`);
    
    // Query users in batches
    const userResult = await session.run(
      'MATCH (u:NostrUser) RETURN u.pubkey AS pubkey ORDER BY u.pubkey SKIP ' + skip + ' LIMIT ' + batchSize
    );
    
    // Process each user in the batch
    for (const record of userResult.records) {
      const pubkey = record.get('pubkey');
      
      // Get all relationships for this user
      const relationshipResult = await session.run(
        `MATCH (u:NostrUser {pubkey: $pubkey})-[r]->(target:NostrUser)
         RETURN type(r) AS relType, target.pubkey AS targetPubkey, r.timestamp AS timestamp`,
        { pubkey }
      );
      
      // Process relationships
      if (relationshipResult.records.length > 0) {
        batchUserPubkeys.add(pubkey);
        batchStats.usersWithRelationships++;
        
        // Process each relationship
        for (const relRecord of relationshipResult.records) {
          const relType = relRecord.get('relType');
          const targetPubkey = relRecord.get('targetPubkey');
          const timestamp = relRecord.get('timestamp');
          
          // Convert Neo4j integer to plain JavaScript number
          // If timestamp is null/undefined, use 0 as default
          const timestampValue = timestamp ? timestamp.toNumber() : 0;
          
          // Add to the appropriate relationship map
          switch (relType) {
            case 'FOLLOWS':
              if (!batchFollows[pubkey]) batchFollows[pubkey] = {};
              batchFollows[pubkey][targetPubkey] = timestampValue;
              batchStats.followsCount++;
              break;
            case 'MUTES':
              if (!batchMutes[pubkey]) batchMutes[pubkey] = {};
              batchMutes[pubkey][targetPubkey] = timestampValue;
              batchStats.mutesCount++;
              break;
            case 'REPORTS':
              if (!batchReports[pubkey]) batchReports[pubkey] = {};
              batchReports[pubkey][targetPubkey] = timestampValue;
              batchStats.reportsCount++;
              break;
          }
        }
      }
    }
    
    // Write batch data to temporary files
    await writeFile(tempUserPubkeysFile, JSON.stringify([...batchUserPubkeys]));
    await writeFile(tempFollowsFile, JSON.stringify(batchFollows));
    await writeFile(tempMutesFile, JSON.stringify(batchMutes));
    await writeFile(tempReportsFile, JSON.stringify(batchReports));
    
    return {
      batchStats,
      processedCount: userResult.records.length,
      tempFiles: {
        userPubkeys: tempUserPubkeysFile,
        follows: tempFollowsFile,
        mutes: tempMutesFile,
        reports: tempReportsFile
      }
    };
  } finally {
    await session.close();
  }
}

/**
 * Get all users with outgoing relationships in Neo4j in batches
 * @param {number} batchSize - Number of users to process in each batch
 * @param {number} totalUsers - Total number of users to process
 * @returns {Promise<Object>} Statistics and temporary file paths
 */
async function getUserRelationships(batchSize, totalUsers) {
  const tempFiles = [];
  const stats = {
    totalUsersWithRelationships: 0,
    totalFollows: 0,
    totalMutes: 0,
    totalReports: 0
  };
  
  let processed = 0;
  let skip = 0;
  
  try {
    while (processed < totalUsers) {
      // Process this batch and write to temp files
      const result = await processUserBatch(skip, batchSize);
      
      // Update aggregated stats
      stats.totalUsersWithRelationships += result.batchStats.usersWithRelationships;
      stats.totalFollows += result.batchStats.followsCount;
      stats.totalMutes += result.batchStats.mutesCount;
      stats.totalReports += result.batchStats.reportsCount;
      
      // Add temp files to our list
      tempFiles.push(result.tempFiles);
      
      processed += result.processedCount;
      skip += batchSize;
      
      // Break if we processed fewer records than the batch size
      if (result.processedCount < batchSize) break;
      
      // Force garbage collection if available
      global.gc && global.gc();
      
      // Log progress
      await log(`Processed ${processed}/${totalUsers} users (${Math.round((processed/totalUsers)*100)}%)`); 
    }
    
    return { stats, tempFiles };
  } catch (error) {
    await log(`Error processing users: ${error.message}`);
    throw error;
  }
}

/**
 * Merge temporary batch files into a single output file
 * @param {Array} tempFilesArray - Array of objects containing paths to temp files
 */
async function writeRelationshipData(tempFilesArray) {
  const neo4jRelationshipsFile = path.join(config.outputDir, 'currentRelationships_neo4j.json');
  
  // Initialize the final data structure
  const finalData = {
    userPubkeys: [],
    follows: {},
    mutes: {},
    reports: {}
  };
  
  // Process each set of temp files
  for (const tempFiles of tempFilesArray) {
    try {
      // Read and parse user pubkeys
      const userPubkeysData = JSON.parse(fs.readFileSync(tempFiles.userPubkeys, 'utf8'));
      finalData.userPubkeys.push(...userPubkeysData);
      
      // Read and parse follows relationships
      const followsData = JSON.parse(fs.readFileSync(tempFiles.follows, 'utf8'));
      Object.assign(finalData.follows, followsData);
      
      // Read and parse mutes relationships
      const mutesData = JSON.parse(fs.readFileSync(tempFiles.mutes, 'utf8'));
      Object.assign(finalData.mutes, mutesData);
      
      // Read and parse reports relationships
      const reportsData = JSON.parse(fs.readFileSync(tempFiles.reports, 'utf8'));
      Object.assign(finalData.reports, reportsData);
      
      // Remove temporary files to save disk space
      fs.unlinkSync(tempFiles.userPubkeys);
      fs.unlinkSync(tempFiles.follows);
      fs.unlinkSync(tempFiles.mutes);
      fs.unlinkSync(tempFiles.reports);
    } catch (error) {
      await log(`Error processing temporary files: ${error.message}`);
      // Continue with other batches even if one fails
    }
  }
  
  // Remove duplicates from userPubkeys
  finalData.userPubkeys = [...new Set(finalData.userPubkeys)];
  
  // Write the final merged data
  await writeFile(neo4jRelationshipsFile, JSON.stringify(finalData, null, 2));
  await log(`Wrote Neo4j relationship data to ${neo4jRelationshipsFile}`);
  
  return finalData;
}

/**
 * Main execution function
 */
async function main() {
  try {
    // Start time tracking
    const startTime = Date.now();
    
    await log('Starting extraction of current relationships from Neo4j');
    
    // Ensure output directory exists
    await ensureOutputDirectory();
    
    // Get total user count for progress tracking
    const totalUsers = await getTotalUserCount();
    await log(`Found ${totalUsers} NostrUser nodes in Neo4j`);
    
    // Get relationship counts
    const relCounts = await getRelationshipCounts();
    await log(`Found ${relCounts.follows} FOLLOWS, ${relCounts.mutes} MUTES, and ${relCounts.reports} REPORTS relationships`);
    
    // Process users in batches and get temporary files
    await log('Processing users in batches and writing temporary files...');
    const { stats, tempFiles } = await getUserRelationships(config.batchSize, totalUsers);
    
    await log(`Processed ${stats.totalUsersWithRelationships} users with relationships`);
    await log(`Found ${stats.totalFollows} FOLLOWS relationships`);
    await log(`Found ${stats.totalMutes} MUTES relationships`);
    await log(`Found ${stats.totalReports} REPORTS relationships`);
    
    // Merge temporary files into final output
    await log('Merging batch files into final output...');
    await writeRelationshipData(tempFiles);
    
    // Log completion time
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    await log(`Completed extraction of Neo4j relationships in ${duration.toFixed(2)} seconds`);
    
    process.exit(0);
  } catch (error) {
    await log(`ERROR: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    // Close the driver
    await driver.close();
  }
}

// Execute the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
