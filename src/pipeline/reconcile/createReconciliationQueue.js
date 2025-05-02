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
const { spawn } = require('child_process');
const { execSync } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);

// Configuration
const config = {
  queueDir: '/var/lib/brainstorm/pipeline/reconcile/queue',
  tempDir: '/var/lib/brainstorm/pipeline/reconcile/temp',
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

// Get all pubkeys from Neo4j using streaming spawn
async function getAllPubkeys() {
  return new Promise((resolve, reject) => {
    const pubkeys = [];
    const query = 'MATCH (u:NostrUser) RETURN u.pubkey AS pubkey';
    const cypherArgs = [
      '-a', config.neo4jUri,
      '-u', config.neo4jUser,
      '-p', config.neo4jPassword,
      '--format', 'plain',
      query
    ];
    const cypher = spawn('cypher-shell', cypherArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    cypher.stdout.on('data', (data) => {
      buffer += data.toString();
      let lines = buffer.split('\n');
      buffer = lines.pop();
      for (let line of lines) {
        if (line.trim() && !line.startsWith('pubkey')) {
          pubkeys.push(line.trim().replace(/"/g, ''));
        }
      }
    });
    cypher.stdout.on('end', () => {
      if (buffer.trim() && !buffer.startsWith('pubkey')) {
        pubkeys.push(buffer.trim().replace(/"/g, ''));
      }
      console.log(`${new Date().toISOString()}: Found ${pubkeys.length} pubkeys in Neo4j`);
      resolve(pubkeys);
    });
    cypher.stderr.on('data', (data) => {
      console.error(`cypher-shell error: ${data}`);
    });
    cypher.on('error', (err) => {
      console.error(`Error fetching pubkeys: ${err.message}`);
      reject(err);
    });
    cypher.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`cypher-shell exited with code ${code}`));
      }
    });
  });
}

// Process pubkeys in batches
async function processPubkeys(pubkeys) {
  console.log(`${new Date().toISOString()}: Processing ${pubkeys.length} pubkeys in batches of ${config.batchSize}`);
  
  for (let i = 0; i < pubkeys.length; i += config.batchSize) {
    const batch = pubkeys.slice(i, i + config.batchSize);
    console.log(`${new Date().toISOString()}: Processing batch ${Math.floor(i/config.batchSize) + 1}/${Math.ceil(pubkeys.length/config.batchSize)}`);
    
    await processBatch(batch, Math.floor(i/config.batchSize));
  }
}

// Process a batch of pubkeys
async function processBatch(pubkeys, batchIndex) {
  try {
    // Process each event kind
    for (const eventType of eventKinds) {
      await processEventKind(eventType.kind, eventType.relationship, pubkeys, batchIndex);
    }
  } catch (error) {
    console.error(`${new Date().toISOString()}: Error processing batch: ${error.message}`);
    throw error;
  }
}

// Process a specific event kind for the batch of pubkeys
async function processEventKind(kind, relationship, pubkeysBatch, batchIndex) {
  // Optionally: Write batch pubkeys to file (if needed elsewhere)
  const pubkeysFile = `${config.tempDir}/pubkeys_${Date.now()}.txt`;
  await writeFile(pubkeysFile, pubkeysBatch.join('\n'));

  // Format Cypher list for IN clause
  const cypherList = pubkeysBatch.map(pk => `\"${pk}\"`).join(',');

  // Build Cypher query
  const cypherQuery = `
    MATCH (u:NostrUser)
    WHERE u.pubkey IN [${cypherList}]
    RETURN u.pubkey AS pubkey, u.kind${kind}EventId AS eventId
  `;

  // Output file for results
  const outputFile = `${config.tempDir}/neo4j_ids_kind${kind}_${Date.now()}.txt`;

  // Run the query
  const neo4jCmd = `sudo cypher-shell -a \"${config.neo4jUri}\" -u \"${config.neo4jUser}\" -p \"${config.neo4jPassword}\" \"${cypherQuery.replace(/\n/g, ' ')}\" --format plain > ${outputFile}`;
  try {
    execSync(neo4jCmd, { stdio: 'inherit', shell: '/bin/bash' });
  } catch (error) {
    console.error(`Error processing event kind ${kind}: ${error.message}`);
    throw error;
  }

  // Get the latest event IDs from strfry
  const strfryIdsFile = `${config.tempDir}/strfry_ids_kind${kind}_${Date.now()}.txt`;
  
  // Process each pubkey with strfry
  let strfryOutput = '';
  for (const pubkey of pubkeysBatch) {
    try {
      // Get the latest event for this pubkey and kind
      const eventJson = execSync(`sudo strfry scan "{ \\"kinds\\": [${kind}], \\"authors\\": [\\"${pubkey}\\"]}" | head -n 1`).toString().trim();
      
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
  const neo4jData = fs.readFileSync(outputFile, 'utf8').split('\n').slice(1, -1); // Skip header and footer
  
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
  for (const pubkey of pubkeysBatch) {
    const neo4jId = neo4jIds.get(pubkey) || '';
    const strfryId = strfryIds.get(pubkey) || '';
    
    if (strfryId && (!neo4jId || neo4jId !== strfryId)) {
      // Add to queue with event kind
      const queueFile = `${config.queueDir}/${pubkey}_${kind}`;
      fs.writeFileSync(queueFile, '');
      queueCount++;
    }
  }
  
  console.log(`${new Date().toISOString()}: Added ${queueCount} pubkeys to queue for kind ${kind} (${relationship}) reconciliation`);
  
  // Clean up
  fs.unlinkSync(outputFile);
  fs.unlinkSync(strfryIdsFile);
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