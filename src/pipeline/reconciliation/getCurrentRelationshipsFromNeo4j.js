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
 * Get all users with outgoing relationships in Neo4j in batches
 * @param {number} batchSize - Number of users to process in each batch
 * @param {number} totalUsers - Total number of users to process
 * @returns {Promise<Object>} Maps of users and their relationships
 */
async function getUserRelationships(batchSize, totalUsers) {
  const relationshipMaps = {
    userPubkeys: new Set(),
    follows: new Map(),   // pubkey -> Set of pubkeys they follow
    mutes: new Map(),     // pubkey -> Set of pubkeys they mute
    reports: new Map()    // pubkey -> Set of pubkeys they report
  };
  
  const session = driver.session();
  
  try {
    let processed = 0;
    let skip = 0;
    
    while (processed < totalUsers) {
      await log(`Processing users batch ${skip} to ${skip + batchSize} of ${totalUsers}...`);
      
      // Query users in batches
      const userResult = await session.run(
        'MATCH (u:NostrUser) RETURN u.pubkey AS pubkey ORDER BY u.pubkey SKIP $skip LIMIT $limit',
        { skip, limit: batchSize }
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
          relationshipMaps.userPubkeys.add(pubkey);
          
          // Process each relationship
          for (const relRecord of relationshipResult.records) {
            const relType = relRecord.get('relType');
            const targetPubkey = relRecord.get('targetPubkey');
            const timestamp = relRecord.get('timestamp');
            
            // Add to the appropriate relationship map
            switch (relType) {
              case 'FOLLOWS':
                if (!relationshipMaps.follows.has(pubkey)) {
                  relationshipMaps.follows.set(pubkey, new Map());
                }
                relationshipMaps.follows.get(pubkey).set(targetPubkey, timestamp);
                break;
              case 'MUTES':
                if (!relationshipMaps.mutes.has(pubkey)) {
                  relationshipMaps.mutes.set(pubkey, new Map());
                }
                relationshipMaps.mutes.get(pubkey).set(targetPubkey, timestamp);
                break;
              case 'REPORTS':
                if (!relationshipMaps.reports.has(pubkey)) {
                  relationshipMaps.reports.set(pubkey, new Map());
                }
                relationshipMaps.reports.get(pubkey).set(targetPubkey, timestamp);
                break;
            }
          }
        }
      }
      
      processed += userResult.records.length;
      skip += batchSize;
      
      // Break if we processed fewer records than the batch size
      if (userResult.records.length < batchSize) break;
      
      // Release memory
      global.gc && global.gc();
    }
    
    return relationshipMaps;
  } finally {
    await session.close();
  }
}

/**
 * Write relationship data to CSV files
 * @param {Object} relationshipMaps - Maps of users and their relationships
 */
async function writeRelationshipData(relationshipMaps) {
  const neo4jRelationshipsFile = path.join(config.outputDir, 'currentRelationships_neo4j.json');
  
  // Convert Sets to arrays for serialization
  const serializable = {
    userPubkeys: [...relationshipMaps.userPubkeys],
    follows: {},
    mutes: {},
    reports: {}
  };
  
  // Convert Maps to objects for serialization
  for (const [pubkey, followsMap] of relationshipMaps.follows.entries()) {
    serializable.follows[pubkey] = Object.fromEntries(followsMap);
  }
  
  for (const [pubkey, mutesMap] of relationshipMaps.mutes.entries()) {
    serializable.mutes[pubkey] = Object.fromEntries(mutesMap);
  }
  
  for (const [pubkey, reportsMap] of relationshipMaps.reports.entries()) {
    serializable.reports[pubkey] = Object.fromEntries(reportsMap);
  }
  
  // Write the data to a JSON file
  await writeFile(neo4jRelationshipsFile, JSON.stringify(serializable, null, 2));
  await log(`Wrote Neo4j relationship data to ${neo4jRelationshipsFile}`);
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
    
    // Extract all relationships
    const relationshipMaps = await getUserRelationships(config.batchSize, totalUsers);
    
    await log(`Processed ${relationshipMaps.userPubkeys.size} users with relationships`);
    await log(`Found ${relationshipMaps.follows.size} users with FOLLOWS relationships`);
    await log(`Found ${relationshipMaps.mutes.size} users with MUTES relationships`);
    await log(`Found ${relationshipMaps.reports.size} users with REPORTS relationships`);
    
    // Write relationship data to files
    await writeRelationshipData(relationshipMaps);
    
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
