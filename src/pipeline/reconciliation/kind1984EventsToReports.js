#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Path configuration
const inputPath = path.join(__dirname, 'allKind1984EventsStripped.json');
const outputPath = path.join(__dirname, 'currentReportsFromStrfry.json');

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

// Global object to store all reports
let oReports = {};

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

      if (!oReports[pk_rater]) { oReports[pk_rater] = {}; }

      let oTemp = {};
      oTemp[pk_rater] = {};

      const outputPath3 = path.join(__dirname,'currentRelationshipsFromStrfry/reports/', pk_rater + '.json');
      
      for (let x = 0; x < aTags.length; x++) {
        const tag = aTags[x];
        if (tag[0] === 'p') {
          let pk_ratee = ''
          let report_type = 'other'
          if (tag.length > 1) { pk_ratee = tag[1]; }
          if (tag.length > 2) { report_type = tag[2]; }
          if (!report_type) { report_type = 'unspecified'; }
          if (!oReports[pk_rater][report_type]) { oReports[pk_rater][report_type] = {}; }
          const nextLine = {
            pk_rater,
            pk_ratee,
            report_type,
            timestamp: created_at
          };
          if (!oTemp[pk_rater][report_type]) { oTemp[pk_rater][report_type] = {}; }
          oTemp[pk_rater][report_type][pk_ratee] = true;
          oReports[pk_rater][report_type][pk_ratee] = true;
          // Append to the file synchronously to ensure it's written
          if (pk_ratee) {
            fs.appendFileSync(outputPath, JSON.stringify(nextLine) + '\n');
          }
        }
      }
      // fs.appendFileSync(outputPath3, JSON.stringify(oTemp, null, 2) + '\n');
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
    // cycle through each key in oReports and create a json file for each
    for (let x in oReports) {
      let oTemp = {};
      oTemp[x] = {};
      for (let y in oReports[x]) {
        oTemp[x][y] = {};
        for (let z in oReports[x][y]) {
          oTemp[x][y][z] = true;
        }
      }
      fs.writeFileSync(path.join(__dirname,'currentRelationshipsFromStrfry/reports/', x + '.json'), JSON.stringify(oTemp, null, 2));
    }
  })
  .then(() => {
    console.log('Processing completed successfully');
  })
  .catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });