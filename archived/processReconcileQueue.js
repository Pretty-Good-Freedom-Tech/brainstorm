#!/usr/bin/env node
/**
 * processReconcileQueue.js
 * 
 * This script processes pubkeys in the reconciliation queue by:
 * 1. Fetching the most recent kind 3 event for each pubkey from strfry
 * 2. Updating the FOLLOWS relationships in Neo4j
 * 3. Updating the kind3EventId and kind3CreatedAt properties
 * 
 * It uses a hybrid approach - processing pubkeys in small batches for efficiency
 * while avoiding overwhelming the system.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

// Configuration
const config = {
  queueDir: '/home/ubuntu/hasenpfeffr/pipeline/reconcile/queue',
  tempDir: '/home/ubuntu/hasenpfeffr/pipeline/reconcile/temp',
  batchSize: 10, // Number of pubkeys to process in a batch
  neo4jUri: process.env.NEO4J_URI,
  neo4jUser: process.env.NEO4J_USER,
  neo4jPassword: process.env.NEO4J_PASSWORD,
  maxConcurrent: 3 // Maximum number of concurrent batches
};

// Ensure directories exist
if (!fs.existsSync(config.tempDir)) {
  fs.mkdirSync(config.tempDir, { recursive: true });
}

// Lock file to prevent multiple instances
const lockFile = path.join(config.tempDir, 'process.lock');

// Main function
async function main() {
  // Check if another instance is running
  if (fs.existsSync(lockFile)) {
    console.log(`${new Date().toISOString()}: Another instance is already running. Exiting.`);
    return;
  }

  // Create lock file
  fs.writeFileSync(lockFile, process.pid.toString());

  try {
    console.log(`${new Date().toISOString()}: Starting queue processing...`);
    
    // Get all pubkeys from the queue
    const files = await readdir(config.queueDir);
    
    if (files.length === 0) {
      console.log(`${new Date().toISOString()}: No pubkeys in queue. Exiting.`);
      return;
    }
    
    console.log(`${new Date().toISOString()}: Found ${files.length} pubkeys in queue`);
    
    // Process pubkeys in batches
    for (let i = 0; i < files.length; i += config.batchSize) {
      const batch = files.slice(i, i + config.batchSize);
      console.log(`${new Date().toISOString()}: Processing batch ${Math.floor(i/config.batchSize) + 1}/${Math.ceil(files.length/config.batchSize)}, size: ${batch.length}`);
      
      // Process batch in parallel with limited concurrency
      await processBatch(batch);
    }
    
    console.log(`${new Date().toISOString()}: All pubkeys processed successfully`);
  } catch (error) {
    console.error(`${new Date().toISOString()}: Error processing queue: ${error.message}`);
  } finally {
    // Remove lock file
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
    }
  }
}

/**
 * Process a batch of pubkeys
 */
async function processBatch(pubkeys) {
  // Create an array of promises for each pubkey
  const promises = pubkeys.map(pubkey => processPubkey(pubkey));
  
  // Process with limited concurrency
  const results = [];
  for (let i = 0; i < promises.length; i += config.maxConcurrent) {
    const batchPromises = promises.slice(i, i + config.maxConcurrent);
    const batchResults = await Promise.allSettled(batchPromises);
    results.push(...batchResults);
  }
  
  // Log results
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  console.log(`${new Date().toISOString()}: Batch complete - ${successful} successful, ${failed} failed`);
  
  // Log errors for failed pubkeys
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`${new Date().toISOString()}: Failed to process pubkey ${pubkeys[index]}: ${result.reason}`);
    }
  });
}

/**
 * Process a single pubkey
 */
async function processPubkey(pubkey) {
  console.log(`${new Date().toISOString()}: Processing pubkey: ${pubkey}`);
  
  // Temporary files for this pubkey
  const tempEventFile = path.join(config.tempDir, `${pubkey}_event.json`);
  const tempFollowsFile = path.join(config.tempDir, `${pubkey}_follows.json`);
  
  try {
    // Step 1: Get the most recent kind 3 event from strfry
    await exec(`sudo strfry scan "{ \\"kinds\\": [3], \\"authors\\": [\\"${pubkey}\\"]}" > ${tempEventFile}`);
    
    // Read the event file
    const eventData = await readFile(tempEventFile, 'utf8');
    if (!eventData.trim()) {
      throw new Error(`No kind 3 event found for pubkey ${pubkey}`);
    }
    
    // Parse the first line (most recent event)
    const event = JSON.parse(eventData.split('\n')[0]);
    const eventId = event.id;
    const createdAt = event.created_at;
    const tags = event.tags;
    
    // Step 2: Extract p tags (followees)
    const followees = [];
    for (const tag of tags) {
      if (tag[0] === 'p') {
        followees.push(tag[1]);
      }
    }
    
    console.log(`${new Date().toISOString()}: Pubkey ${pubkey} follows ${followees.length} users`);
    
    // Step 3: Generate follows JSON
    const follows = followees.map(followee => ({
      pk_follower: pubkey,
      pk_followee: followee
    }));
    
    // Write follows to temp file
    await writeFile(tempFollowsFile, follows.map(f => JSON.stringify(f)).join('\n'));
    
    // Step 4: Update Neo4j - Delete existing FOLLOWS relationships
    const deleteQuery = `
      MATCH (u1:NostrUser {pubkey:'${pubkey}'})-[r:FOLLOWS]->(u2:NostrUser)
      DELETE r
    `;
    
    await exec(`sudo cypher-shell -a "${config.neo4jUri}" -u "${config.neo4jUser}" -p "${config.neo4jPassword}" "${deleteQuery}"`);
    
    // Step 5: Move follows file to Neo4j import directory
    await exec(`sudo mv ${tempFollowsFile} /var/lib/neo4j/import/${pubkey}_follows.json`);
    
    // Step 6: Create new FOLLOWS relationships using optimized approach
    const importQuery = `
      // Create all nodes first
      CALL apoc.periodic.iterate(
        "CALL apoc.load.json('file:///${pubkey}_follows.json') YIELD value AS line RETURN DISTINCT line.pk_follower AS pubkey",
        "MERGE (u:NostrUser {pubkey: pubkey})",
        {batchSize:100, parallel:false, retries:2}
      );
      
      CALL apoc.periodic.iterate(
        "CALL apoc.load.json('file:///${pubkey}_follows.json') YIELD value AS line RETURN DISTINCT line.pk_followee AS pubkey",
        "MERGE (u:NostrUser {pubkey: pubkey})",
        {batchSize:100, parallel:false, retries:2}
      );
      
      // Then create relationships
      CALL apoc.periodic.iterate(
        "CALL apoc.load.json('file:///${pubkey}_follows.json') YIELD value AS line",
        "
        MATCH (u1:NostrUser {pubkey:line.pk_follower})
        MATCH (u2:NostrUser {pubkey:line.pk_followee})
        MERGE (u1)-[:FOLLOWS]->(u2)
        ",
        {batchSize:100, parallel:false, retries:2}
      );
    `;
    
    // Write the query to a temporary file
    const tempQueryFile = path.join(config.tempDir, `${pubkey}_query.cypher`);
    await writeFile(tempQueryFile, importQuery);
    
    // Execute the query
    await exec(`sudo cypher-shell -a "${config.neo4jUri}" -u "${config.neo4jUser}" -p "${config.neo4jPassword}" -f ${tempQueryFile}`);
    
    // Step 7: Update the kind3EventId and kind3CreatedAt properties
    const updateQuery = `
      MATCH (u:NostrUser {pubkey:'${pubkey}'})
      SET u.kind3EventId='${eventId}', u.kind3CreatedAt=${createdAt}
    `;
    
    await exec(`sudo cypher-shell -a "${config.neo4jUri}" -u "${config.neo4jUser}" -p "${config.neo4jPassword}" "${updateQuery}"`);
    
    // Step 8: Clean up
    await exec(`sudo rm -f /var/lib/neo4j/import/${pubkey}_follows.json ${tempQueryFile}`);
    
    // Step 9: Remove the pubkey from the queue
    await unlink(path.join(config.queueDir, pubkey));
    
    console.log(`${new Date().toISOString()}: Successfully processed pubkey: ${pubkey}`);
    return pubkey;
  } catch (error) {
    console.error(`${new Date().toISOString()}: Error processing pubkey ${pubkey}: ${error.message}`);
    throw error;
  } finally {
    // Clean up temporary files
    try {
      if (fs.existsSync(tempEventFile)) fs.unlinkSync(tempEventFile);
      if (fs.existsSync(tempFollowsFile)) fs.unlinkSync(tempFollowsFile);
    } catch (e) {
      console.error(`${new Date().toISOString()}: Error cleaning up temporary files: ${e.message}`);
    }
  }
}

// Run the main function
main()
  .then(() => {
    console.log(`${new Date().toISOString()}: Script completed successfully`);
    process.exit(0);
  })
  .catch(error => {
    console.error(`${new Date().toISOString()}: Script failed: ${error.message}`);
    process.exit(1);
  });
