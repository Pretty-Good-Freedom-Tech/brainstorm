#!/usr/bin/env node
/**
 * createReconciliationQueue.js
 * 
 * This script creates a queue of pubkeys that need to be reconciled between
 * strfry and Neo4j. It compares the kind3EventId (and other event types) in Neo4j with the latest
 * events in strfry to identify pubkeys that need updating.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);

// Configuration
const config = {
  queueDir: '/var/lib/hasenpfeffr/pipeline/reconcile/queue',
  tempDir: '/var/lib/hasenpfeffr/pipeline/reconcile/temp',
  batchSize: 1000, // Number of pubkeys to process in each batch
  neo4jUri: process.env.NEO4J_URI || "bolt://localhost:7687",
  neo4jUser: process.env.NEO4J_USER || "neo4j",
  neo4jPassword: process.env.NEO4J_PASSWORD || "neo4jneo4j"
};

// Event kinds to process
const eventKinds = [
  { kind: 3, relationship: 'FOLLOWS' },
  { kind: 10000, relationship: 'MUTES' },
  { kind: 1984, relationship: 'REPORTS' }
];

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

// Get all pubkeys from Neo4j
async function getAllPubkeys() {
  try {
    console.log(`${new Date().toISOString()}: Fetching all pubkeys from Neo4j...`);
    
    const query = `
      MATCH (u:NostrUser)
      RETURN u.pubkey AS pubkey
    `;
    
    const result = execSync(`sudo cypher-shell -a "${config.neo4jUri}" -u "${config.neo4jUser}" -p "${config.neo4jPassword}" "${query}" --format plain`).toString();
    
    // Parse the result (skip header and footer)
    const lines = result.split('\n');
    const pubkeys = lines.slice(1, lines.length - 1).map(line => line.trim().replace(/"/g, ''));
    
    console.log(`${new Date().toISOString()}: Found ${pubkeys.length} pubkeys in Neo4j`);
    return pubkeys;
  } catch (error) {
    console.error(`${new Date().toISOString()}: Error fetching pubkeys: ${error.message}`);
    throw error;
  }
}

// Process pubkeys in batches
async function processPubkeys(pubkeys) {
  console.log(`${new Date().toISOString()}: Processing ${pubkeys.length} pubkeys in batches of ${config.batchSize}`);
  
  for (let i = 0; i < pubkeys.length; i += config.batchSize) {
    const batch = pubkeys.slice(i, i + config.batchSize);
    console.log(`${new Date().toISOString()}: Processing batch ${Math.floor(i/config.batchSize) + 1}/${Math.ceil(pubkeys.length/config.batchSize)}`);
    
    await processBatch(batch);
  }
}

// Process a batch of pubkeys
async function processBatch(pubkeys) {
  try {
    // Create a temporary file with the pubkeys
    const pubkeysFile = path.join(config.tempDir, `pubkeys_${Date.now()}.txt`);
    await writeFile(pubkeysFile, pubkeys.join('\n'));
    
    // Process each event kind
    for (const eventType of eventKinds) {
      await processEventKind(pubkeysFile, eventType.kind, eventType.relationship);
    }
    
    // Clean up
    fs.unlinkSync(pubkeysFile);
  } catch (error) {
    console.error(`${new Date().toISOString()}: Error processing batch: ${error.message}`);
    throw error;
  }
}

// Process a specific event kind for the batch of pubkeys
async function processEventKind(pubkeysFile, eventKind, relationshipType) {
  try {
    console.log(`${new Date().toISOString()}: Processing kind ${eventKind} events (${relationshipType}) for batch...`);
    
    // Get the latest event IDs from Neo4j
    const neo4jIdsFile = path.join(config.tempDir, `neo4j_ids_kind${eventKind}_${Date.now()}.txt`);
    const neo4jQuery = `
      MATCH (u:NostrUser)
      WHERE u.pubkey IN split(replace(replace(trim("$$(cat ${pubkeysFile})"), "\\r", ""), "\\n", ","), ",")
      RETURN u.pubkey AS pubkey, u.kind${eventKind}EventId AS eventId
    `;
    
    execSync(`sudo cypher-shell -a "${config.neo4jUri}" -u "${config.neo4jUser}" -p "${config.neo4jPassword}" "${neo4jQuery}" --format plain > ${neo4jIdsFile}`);
    
    // Get the latest event IDs from strfry
    const strfryIdsFile = path.join(config.tempDir, `strfry_ids_kind${eventKind}_${Date.now()}.txt`);
    
    // Process each pubkey with strfry
    const pubkeyList = fs.readFileSync(pubkeysFile, 'utf8').split('\n').filter(Boolean);
    
    let strfryOutput = '';
    for (const pubkey of pubkeyList) {
      try {
        // Get the latest event for this pubkey and kind
        const eventJson = execSync(`sudo strfry scan "{ \\"kinds\\": [${eventKind}], \\"authors\\": [\\"${pubkey}\\"]}" | head -n 1`).toString().trim();
        
        if (eventJson) {
          const event = JSON.parse(eventJson);
          strfryOutput += `${pubkey},"${event.id}"\n`;
        } else {
          strfryOutput += `${pubkey},\n`;
        }
      } catch (error) {
        console.error(`${new Date().toISOString()}: Error processing pubkey ${pubkey} with strfry: ${error.message}`);
        strfryOutput += `${pubkey},\n`;
      }
    }
    
    fs.writeFileSync(strfryIdsFile, strfryOutput);
    
    // Compare the IDs and add to queue if different
    const neo4jIds = new Map();
    const neo4jData = fs.readFileSync(neo4jIdsFile, 'utf8').split('\n').slice(1, -1); // Skip header and footer
    
    for (const line of neo4jData) {
      const [pubkey, eventId] = line.split(',').map(s => s.trim().replace(/"/g, ''));
      neo4jIds.set(pubkey, eventId || '');
    }
    
    const strfryIds = new Map();
    const strfryData = fs.readFileSync(strfryIdsFile, 'utf8').split('\n').filter(Boolean);
    
    for (const line of strfryData) {
      const [pubkey, eventId] = line.split(',').map(s => s.trim().replace(/"/g, ''));
      strfryIds.set(pubkey, eventId || '');
    }
    
    // Add to queue if IDs are different or missing in Neo4j
    let queueCount = 0;
    for (const pubkey of pubkeyList) {
      const neo4jId = neo4jIds.get(pubkey) || '';
      const strfryId = strfryIds.get(pubkey) || '';
      
      if (strfryId && (!neo4jId || neo4jId !== strfryId)) {
        // Add to queue with event kind
        const queueFile = path.join(config.queueDir, `${pubkey}_${eventKind}`);
        fs.writeFileSync(queueFile, '');
        queueCount++;
      }
    }
    
    console.log(`${new Date().toISOString()}: Added ${queueCount} pubkeys to queue for kind ${eventKind} (${relationshipType}) reconciliation`);
    
    // Clean up
    fs.unlinkSync(neo4jIdsFile);
    fs.unlinkSync(strfryIdsFile);
  } catch (error) {
    console.error(`${new Date().toISOString()}: Error processing event kind ${eventKind}: ${error.message}`);
    throw error;
  }
}

// Main function
async function main() {
  try {
    console.log(`${new Date().toISOString()}: Starting reconciliation queue creation...`);
    
    // Ensure directories exist
    await ensureDirectories();
    
    // Get all pubkeys from Neo4j
    const pubkeys = await getAllPubkeys();
    
    // Process pubkeys in batches
    await processPubkeys(pubkeys);
    
    console.log(`${new Date().toISOString()}: Reconciliation queue creation completed successfully`);
  } catch (error) {
    console.error(`${new Date().toISOString()}: Error creating reconciliation queue: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();