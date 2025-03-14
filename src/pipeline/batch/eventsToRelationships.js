#!/usr/bin/env node

/**
 * eventsToRelationships.js
 * 
 * This script processes Nostr events and extracts relationships to be added to Neo4j.
 * It handles multiple event kinds:
 * - Kind 3: FOLLOWS relationships
 * - Kind 10000: MUTES relationships
 * - Kind 1984: REPORTS relationships
 * 
 * All relationships include a timestamp property equal to the created_at value from the event.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Command line arguments
const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: node eventsToRelationships.js <eventKind> <inputFile> <outputFile>');
  console.error('  eventKind: 3 (follows), 10000 (mutes), or 1984 (reports)');
  console.error('  inputFile: Path to the input JSON file containing events');
  console.error('  outputFile: Path to the output JSON file for relationships');
  process.exit(1);
}

const eventKind = parseInt(args[0], 10);
const inputPath = args[1];
const outputPath = args[2];

// Validate event kind
if (![3, 10000, 1984].includes(eventKind)) {
  console.error('Error: eventKind must be 3, 10000, or 1984');
  process.exit(1);
}

// Determine relationship type based on event kind
let relationshipType;
switch (eventKind) {
  case 3:
    relationshipType = 'FOLLOWS';
    break;
  case 10000:
    relationshipType = 'MUTES';
    break;
  case 1984:
    relationshipType = 'REPORTS';
    break;
}

// Clear the output file first
fs.writeFileSync(outputPath, '');

// Count total lines for progress reporting
async function countLines() {
  return new Promise((resolve) => {
    let lineCount = 0;
    const lineReader = readline.createInterface({
      input: fs.createReadStream(inputPath),
      crlfDelay: Infinity
    });
    
    lineReader.on('line', () => {
      lineCount++;
    });
    
    lineReader.on('close', () => {
      resolve(lineCount);
    });
  });
}

async function processFile() {
  const totalLines = await countLines();
  console.log(`Total events to process: ${totalLines}`);
  
  let eventCounter = 0;
  
  // Create readline interface for reading the input file line by line
  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath),
    crlfDelay: Infinity
  });
  
  // Process each line
  rl.on('line', (line) => {
    eventCounter++;
    
    // Log progress every 1000 events
    if (eventCounter % 1000 === 0) {
      const date = new Date();
      console.log(`[${date.toISOString()}] Processing event ${eventCounter} out of ${totalLines}`);
    }
    
    try {
      const oEvent = JSON.parse(line);
      const pk_author = oEvent.pubkey;
      const aTags = oEvent.tags;
      const created_at = oEvent.created_at;
      
      for (let x = 0; x < aTags.length; x++) {
        const tag = aTags[x];
        if (tag[0] === 'p') {
          const pk_target = tag[1];
          const nextLine = {
            pk_author,
            pk_target,
            timestamp: created_at,
            relationship_type: relationshipType
          };
          // Append to the file synchronously to ensure it's written
          fs.appendFileSync(outputPath, JSON.stringify(nextLine) + '\n');
        }
      }
    } catch (e) {
      console.error(`Error processing line: ${e.message}`);
    }
  });

  // Return a promise that resolves when processing is complete
  return new Promise((resolve) => {
    rl.on('close', () => {
      console.log(`Processed all ${eventCounter} events. Output written to ${outputPath}`);
      resolve();
    });
  });
}

// Run the process and handle any errors
processFile()
  .then(() => {
    console.log(`Processing completed successfully for ${relationshipType} relationships`);
  })
  .catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
