#!/usr/bin/env node
/**
 * processReconciliationQueue.js
 * 
 * This script processes the reconciliation queue, updating relationships in Neo4j
 * based on the latest events in strfry. It handles:
 * - FOLLOWS relationships (kind 3 events)
 * - MUTES relationships (kind 10000 events)
 * - REPORTS relationships (kind 1984 events)
 * 
 * All relationships include a timestamp property based on the created_at value from the events.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

// Configuration
const config = {
  queueDir: '/var/lib/brainstorm/pipeline/reconcile/queue',
  tempDir: '/var/lib/brainstorm/pipeline/reconcile/temp',
  maxConcurrent: 5, // Maximum number of pubkeys to process concurrently
  neo4jUri: process.env.NEO4J_URI || "bolt://localhost:7687",
  neo4jUser: process.env.NEO4J_USER || "neo4j",
  neo4jPassword: process.env.NEO4J_PASSWORD || "neo4jneo4j"
};

// Relationship types by event kind
const relationshipTypes = {
  3: 'FOLLOWS',
  10000: 'MUTES',
  1984: 'REPORTS'
};

// Ensure directories exist
async function ensureDirectories() {
  try {
    await mkdir(config.queueDir, { recursive: true });
    await mkdir(config.tempDir, { recursive: true });
  } catch (error) {
    console.error(`Error creating directories: ${error.message}`);
    throw error;
  }
}

// Get queue files
async function getQueueFiles() {
  try {
    const files = await readdir(config.queueDir);
    return files.filter(file => !file.startsWith('.'));
  } catch (error) {
    console.error(`Error reading queue directory: ${error.message}`);
    throw error;
  }
}

// Process a batch of queue files
async function processBatch(queueFiles, batchSize) {
  console.log(`${new Date().toISOString()}: Processing batch of ${batchSize} queue files`);
  
  const batch = queueFiles.slice(0, batchSize);
  const promises = batch.map(file => processQueueFile(file));
  
  await Promise.all(promises);
  
  console.log(`${new Date().toISOString()}: Batch processing completed`);
}

// Process a single queue file
async function processQueueFile(queueFile) {
  try {
    // Extract pubkey and kind from filename (format: pubkey_kind)
    const [pubkey, kindStr] = queueFile.split('_');
    const kind = parseInt(kindStr, 10);
    
    if (!pubkey || !kind || !relationshipTypes[kind]) {
      console.error(`${new Date().toISOString()}: Invalid queue file format: ${queueFile}`);
      await unlink(path.join(config.queueDir, queueFile));
      return;
    }
    
    console.log(`${new Date().toISOString()}: Processing ${relationshipTypes[kind]} relationships for pubkey ${pubkey}`);
    
    // Get the latest event from strfry
    const eventJson = execSync(`sudo strfry scan "{ \\"kinds\\": [${kind}], \\"authors\\": [\\"${pubkey}\\"]}" | head -n 1`).toString().trim();
    
    if (!eventJson) {
      console.log(`${new Date().toISOString()}: No ${kind} event found for pubkey ${pubkey}`);
      await unlink(path.join(config.queueDir, queueFile));
      return;
    }
    
    const event = JSON.parse(eventJson);
    const eventId = event.id;
    const createdAt = event.created_at;
    
    // Extract target pubkeys from tags
    const targetPubkeys = [];
    for (const tag of event.tags) {
      if (tag[0] === 'p') {
        targetPubkeys.push(tag[1]);
      }
    }
    
    if (targetPubkeys.length === 0) {
      console.log(`${new Date().toISOString()}: No target pubkeys found in event ${eventId}`);
      
      // Update the event ID in Neo4j even if there are no targets
      const updateQuery = `
        MATCH (u:NostrUser {pubkey: "${pubkey}"})
        SET u.kind${kind}EventId = "${eventId}", u.kind${kind}CreatedAt = ${createdAt}
      `;
      
      execSync(`sudo cypher-shell -a "${config.neo4jUri}" -u "${config.neo4jUser}" -p "${config.neo4jPassword}" "${updateQuery}"`);
      
      await unlink(path.join(config.queueDir, queueFile));
      return;
    }
    
    // Create relationships data
    const relationships = targetPubkeys.map(targetPubkey => ({
      pk_author: pubkey,
      pk_target: targetPubkey,
      timestamp: createdAt
    }));
    
    // Write relationships to temporary file
    const tempFile = path.join(config.tempDir, `${pubkey}_${kind}_${Date.now()}.json`);
    await writeFile(tempFile, JSON.stringify(relationships, null, 2));
    
    // Get current relationships from Neo4j
    const getCurrentQuery = `
      MATCH (u:NostrUser {pubkey: "${pubkey}"})-[r:${relationshipTypes[kind]}]->(target:NostrUser)
      RETURN target.pubkey AS targetPubkey
    `;
    
    const currentOutput = execSync(`sudo cypher-shell -a "${config.neo4jUri}" -u "${config.neo4jUser}" -p "${config.neo4jPassword}" "${getCurrentQuery}" --format plain`).toString();
    
    // Parse current relationships (skip header and footer)
    const currentLines = currentOutput.split('\n');
    const currentTargets = new Set(
      currentLines.slice(1, currentLines.length - 1)
        .map(line => line.trim().replace(/"/g, ''))
        .filter(Boolean)
    );
    
    // Determine relationships to add and remove
    const newTargets = new Set(targetPubkeys);
    
    const toAdd = targetPubkeys.filter(pubkey => !currentTargets.has(pubkey));
    const toRemove = Array.from(currentTargets).filter(pubkey => !newTargets.has(pubkey));
    
    console.log(`${new Date().toISOString()}: ${toAdd.length} relationships to add, ${toRemove.length} to remove`);
    
    // Add new relationships
    if (toAdd.length > 0) {
      const addQuery = `
        UNWIND $relationships AS rel
        MATCH (author:NostrUser {pubkey: rel.pk_author})
        MATCH (target:NostrUser {pubkey: rel.pk_target})
        MERGE (author)-[r:${relationshipTypes[kind]}]->(target)
        SET r.timestamp = rel.timestamp
      `;
      
      const addRelationships = toAdd.map(targetPubkey => ({
        pk_author: pubkey,
        pk_target: targetPubkey,
        timestamp: createdAt
      }));
      
      const addParams = JSON.stringify({ relationships: addRelationships });
      
      execSync(`sudo cypher-shell -a "${config.neo4jUri}" -u "${config.neo4jUser}" -p "${config.neo4jPassword}" "${addQuery}" --param relationships='${addParams}'`);
    }
    
    // Remove old relationships
    if (toRemove.length > 0) {
      const removeQuery = `
        MATCH (author:NostrUser {pubkey: "${pubkey}"})-[r:${relationshipTypes[kind]}]->(target:NostrUser)
        WHERE target.pubkey IN [${toRemove.map(pk => `"${pk}"`).join(',')}]
        DELETE r
      `;
      
      execSync(`sudo cypher-shell -a "${config.neo4jUri}" -u "${config.neo4jUser}" -p "${config.neo4jPassword}" "${removeQuery}"`);
    }
    
    // Update the event ID in Neo4j
    const updateQuery = `
      MATCH (u:NostrUser {pubkey: "${pubkey}"})
      SET u.kind${kind}EventId = "${eventId}", u.kind${kind}CreatedAt = ${createdAt}
    `;
    
    execSync(`sudo cypher-shell -a "${config.neo4jUri}" -u "${config.neo4jUser}" -p "${config.neo4jPassword}" "${updateQuery}"`);
    
    // Clean up
    await unlink(path.join(config.queueDir, queueFile));
    await unlink(tempFile);
    
    console.log(`${new Date().toISOString()}: Successfully processed ${relationshipTypes[kind]} relationships for pubkey ${pubkey}`);
  } catch (error) {
    console.error(`${new Date().toISOString()}: Error processing queue file ${queueFile}: ${error.message}`);
    // Don't remove the queue file on error so it can be retried
  }
}

// Main function
async function main() {
  try {
    console.log(`${new Date().toISOString()}: Starting reconciliation queue processing...`);
    
    // Ensure directories exist
    await ensureDirectories();
    
    // Get queue files
    const queueFiles = await getQueueFiles();
    
    if (queueFiles.length === 0) {
      console.log(`${new Date().toISOString()}: No files in queue. Exiting.`);
      return;
    }
    
    console.log(`${new Date().toISOString()}: Found ${queueFiles.length} files in queue`);
    
    // Process in batches
    for (let i = 0; i < queueFiles.length; i += config.maxConcurrent) {
      const batchSize = Math.min(config.maxConcurrent, queueFiles.length - i);
      await processBatch(queueFiles.slice(i, i + batchSize), batchSize);
    }
    
    console.log(`${new Date().toISOString()}: Reconciliation queue processing completed successfully`);
  } catch (error) {
    console.error(`${new Date().toISOString()}: Error processing reconciliation queue: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();