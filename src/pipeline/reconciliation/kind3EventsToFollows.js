#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Path configuration
const inputPath = path.join(__dirname, 'allKind3EventsStripped.json');

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
      const pk_rater = oEvent.pubkey;
      const aTags = oEvent.tags;
      const created_at = oEvent.created_at;
      let oTemp = {};
      oTemp[pk_rater] = {};

      const outputPath = path.join(__dirname,'currentRelationshipsFromStrfry/follows/', pk_rater + '.json');
      
      for (let x = 0; x < aTags.length; x++) {
        const tag = aTags[x];
        if (tag[0] === 'p') {
          const pk_ratee = tag[1];
          oTemp[pk_rater][pk_ratee] = true;
        }
      }

      fs.appendFileSync(outputPath, JSON.stringify(oTemp, null, 2) + '\n');
    } catch (e) {
      console.error(`Error processing line: ${e.message}`);
    }
  });

  // Return a promise that resolves when processing is complete
  return new Promise((resolve) => {
    rl.on('close', () => {
      console.log(`Processed all ${eventCounter} events. Output written to file.`);
      resolve();
    });
  });
}

// Run the process and handle any errors
processFile()
  .then(() => {
    console.log('Processing completed successfully');
  })
  .catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });