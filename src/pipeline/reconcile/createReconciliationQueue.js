#!/usr/bin/env node

/**
 * createReconciliation.js
 * 
 * This script compares kind 3 events from strfry with Neo4j data and
 * generates a queue of pubkeys that need their FOLLOWS relationships updated.
 * 
 * It's a Node.js alternative to the shell script version for better performance
 * with large datasets.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Configuration
const config = {
  scriptDir: '/usr/local/lib/node_modules/hasenpfeffr/src/pipeline/reconcile',
  queueDir: '/usr/local/lib/node_modules/hasenpfeffr/src/pipeline/reconcile/queue',
  tempDir: '/usr/local/lib/node_modules/hasenpfeffr/src/pipeline/reconcile/temp',
  neo4jUri: process.env.NEO4J_URI || "bolt://localhost:7687",
  neo4jUser: process.env.NEO4J_USER || "neo4j",
  neo4jPassword: process.env.NEO4J_PASSWORD || "neo4jneo4j"
};

// Ensure directories exist
ensureDirectoryExists(config.queueDir);
ensureDirectoryExists(config.tempDir);

// Temporary file paths
const tempFiles = {
  strfryEvents: path.join(config.tempDir, 'strfry_kind3_events.json'),
  neo4jUsers: path.join(config.tempDir, 'neo4j_users.json'),
  pubkeysToQueue: path.join(config.tempDir, 'pubkeys_to_queue.txt')
};

// Clean up previous temp files
cleanupTempFiles();

async function main() {
  console.log(`${new Date().toISOString()}: Starting reconciliation process...`);
  
  // Step 1: Get all kind 3 events from strfry
  console.log(`${new Date().toISOString()}: Fetching kind 3 events from strfry...`);
  try {
    execSync(`sudo strfry scan '{"kinds": [3]}' > "${tempFiles.strfryEvents}"`, { stdio: 'inherit' });
    
    // Count events
    const eventCount = parseInt(execSync(`wc -l < "${tempFiles.strfryEvents}"`).toString().trim());
    console.log(`${new Date().toISOString()}: Retrieved ${eventCount} kind 3 events from strfry`);
    
    // Step 2: Get all NostrUser nodes with their kind3EventId from Neo4j
    console.log(`${new Date().toISOString()}: Fetching NostrUser data from Neo4j...`);
    const cypherQuery = `MATCH (u:NostrUser) 
                         RETURN u.pubkey AS pubkey, u.kind3EventId AS eventId`;
    
    execSync(`sudo cypher-shell -a "${config.neo4jUri}" -u "${config.neo4jUser}" -p "${config.neo4jPassword}" "${cypherQuery}" --format plain > "${tempFiles.neo4jUsers}.raw"`, { stdio: 'inherit' });
    
    // Process Neo4j output to clean it up
    execSync(`tail -n +2 "${tempFiles.neo4jUsers}.raw" | head -n -1 > "${tempFiles.neo4jUsers}"`);
    execSync(`rm "${tempFiles.neo4jUsers}.raw"`);
    
    // Step 3: Create a map of Neo4j users and their event IDs
    console.log(`${new Date().toISOString()}: Creating lookup map of Neo4j users...`);
    const neo4jMap = await createNeo4jMap(tempFiles.neo4jUsers);
    
    // Step 4: Compare and identify pubkeys to queue
    console.log(`${new Date().toISOString()}: Comparing data and identifying pubkeys to queue...`);
    await compareAndQueuePubkeys(tempFiles.strfryEvents, neo4jMap, eventCount);
    
    // Clean up
    cleanupTempFiles();
    
    console.log(`${new Date().toISOString()}: Reconciliation process completed successfully`);
  } catch (error) {
    console.error(`${new Date().toISOString()}: Error during reconciliation: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Create a map of Neo4j users and their event IDs
 */
async function createNeo4jMap(filePath) {
  const neo4jMap = new Map();
  
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  for await (const line of rl) {
    const [pubkey, eventId] = line.split(',').map(item => item.trim().replace(/"/g, ''));
    neo4jMap.set(pubkey, eventId);
  }
  
  console.log(`${new Date().toISOString()}: Found ${neo4jMap.size} NostrUser nodes in Neo4j`);
  return neo4jMap;
}

/**
 * Compare strfry events with Neo4j data and queue pubkeys that need updates
 */
async function compareAndQueuePubkeys(eventsFilePath, neo4jMap, totalEvents) {
  // Create/clear the pubkeys to queue file
  fs.writeFileSync(tempFiles.pubkeysToQueue, '');
  
  const fileStream = fs.createReadStream(eventsFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  let eventCounter = 0;
  let queuedCounter = 0;
  
  for await (const line of rl) {
    eventCounter++;
    
    // Log progress every 1000 events
    if (eventCounter % 1000 === 0) {
      console.log(`${new Date().toISOString()}: Processed ${eventCounter}/${totalEvents} events...`);
    }
    
    try {
      const event = JSON.parse(line);
      const pubkey = event.pubkey;
      const eventId = event.id;
      
      // Get event ID from Neo4j
      const neo4jEventId = neo4jMap.get(pubkey);
      
      // Add to queue if conditions are met
      if (!neo4jEventId || neo4jEventId === 'null' || neo4jEventId !== eventId) {
        fs.appendFileSync(tempFiles.pubkeysToQueue, `${pubkey}:${eventId}\n`);
        queuedCounter++;
      }
    } catch (error) {
      console.error(`${new Date().toISOString()}: Error processing event: ${error.message}`);
    }
  }
  
  // Create queue files for each pubkey
  console.log(`${new Date().toISOString()}: Creating queue files for identified pubkeys...`);
  const pubkeysToQueue = fs.readFileSync(tempFiles.pubkeysToQueue, 'utf8').split('\n').filter(Boolean);
  
  for (const entry of pubkeysToQueue) {
    const [pubkey, eventId] = entry.split(':');
    fs.writeFileSync(path.join(config.queueDir, pubkey), eventId);
  }
  
  console.log(`${new Date().toISOString()}: Queued ${queuedCounter} pubkeys for FOLLOWS update`);
}

/**
 * Ensure a directory exists
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Clean up temporary files
 */
function cleanupTempFiles() {
  if (fs.existsSync(config.tempDir)) {
    const files = fs.readdirSync(config.tempDir);
    for (const file of files) {
      fs.unlinkSync(path.join(config.tempDir, file));
    }
  }
}

// Run the main function
main();