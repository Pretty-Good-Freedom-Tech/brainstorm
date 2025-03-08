#!/usr/bin/env node

/**
 * Optimized processor for Nostr kind 3 events
 * Processes events in parallel and outputs CSV files for efficient Neo4j import
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');

// Main thread execution
if (isMainThread) {
  const inputFile = process.argv[2];
  const outputDir = process.argv[3] || path.dirname(inputFile);
  
  if (!inputFile) {
    console.error('Usage: node optimized-processor.js <input-file> [output-directory]');
    process.exit(1);
  }
  
  console.log(`Processing file: ${inputFile}`);
  console.log(`Output directory: ${outputDir}`);
  
  // Create output files
  const nodesFile = path.join(outputDir, 'nodes.csv');
  const relsFile = path.join(outputDir, 'relationships.csv');
  const eventsFile = path.join(outputDir, 'events.csv');
  
  // Initialize CSV files with headers
  fs.writeFileSync(nodesFile, 'pubkey:ID\n');
  fs.writeFileSync(relsFile, ':START_ID,:END_ID,:TYPE\n');
  fs.writeFileSync(eventsFile, 'pubkey:ID,eventId,createdAt:long\n');
  
  // Count lines for progress reporting
  async function countLines(filePath) {
    return new Promise((resolve) => {
      let count = 0;
      const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity
      });
      
      rl.on('line', () => { count++; });
      rl.on('close', () => { resolve(count); });
    });
  }
  
  // Process the file in chunks using worker threads
  async function processFile() {
    const totalLines = await countLines(inputFile);
    console.log(`Total events to process: ${totalLines}`);
    
    // Determine optimal chunk size and number of workers
    const cpuCount = os.cpus().length;
    const workerCount = Math.max(1, cpuCount - 1); // Leave one CPU for the main thread
    const chunkSize = Math.ceil(totalLines / workerCount);
    
    console.log(`Using ${workerCount} worker threads with chunk size of ${chunkSize}`);
    
    // Create a set to track unique nodes
    const uniqueNodes = new Set();
    const nodeWriteStream = fs.createWriteStream(nodesFile, { flags: 'a' });
    const relWriteStream = fs.createWriteStream(relsFile, { flags: 'a' });
    const eventWriteStream = fs.createWriteStream(eventsFile, { flags: 'a' });
    
    // Read file and distribute chunks to workers
    let currentChunk = [];
    let processedLines = 0;
    let activeWorkers = 0;
    
    // Create a promise that resolves when all workers are done
    const workerPromise = new Promise((resolve) => {
      const checkCompletion = () => {
        if (activeWorkers === 0 && processedLines >= totalLines) {
          resolve();
        }
      };
      
      const rl = readline.createInterface({
        input: fs.createReadStream(inputFile),
        crlfDelay: Infinity
      });
      
      rl.on('line', (line) => {
        currentChunk.push(line);
        processedLines++;
        
        // When chunk is full or we've reached the end, process it
        if (currentChunk.length >= chunkSize || processedLines === totalLines) {
          const chunk = [...currentChunk];
          currentChunk = [];
          
          activeWorkers++;
          const worker = new Worker(__filename, {
            workerData: { chunk, chunkId: Math.floor(processedLines / chunkSize) }
          });
          
          worker.on('message', (data) => {
            // Add unique nodes to the set
            data.nodes.forEach(node => uniqueNodes.add(node));
            
            // Write relationships directly to file
            data.relationships.forEach(rel => {
              relWriteStream.write(`${rel.source},${rel.target},FOLLOWS\n`);
            });
            
            // Write events directly to file
            data.events.forEach(event => {
              eventWriteStream.write(`${event.pubkey},${event.id},${event.created_at}\n`);
            });
            
            // Log progress
            console.log(`Processed chunk ${data.chunkId}/${Math.ceil(totalLines / chunkSize)} (${data.relationships.length} relationships)`);
          });
          
          worker.on('error', (err) => {
            console.error(`Worker error: ${err}`);
            activeWorkers--;
            checkCompletion();
          });
          
          worker.on('exit', () => {
            activeWorkers--;
            checkCompletion();
          });
        }
      });
      
      rl.on('close', () => {
        console.log('Finished reading input file');
        checkCompletion();
      });
    });
    
    // Wait for all workers to complete
    await workerPromise;
    
    // Write unique nodes to file
    console.log(`Writing ${uniqueNodes.size} unique nodes to file...`);
    uniqueNodes.forEach(node => {
      nodeWriteStream.write(`${node}\n`);
    });
    
    // Close file streams
    nodeWriteStream.end();
    relWriteStream.end();
    eventWriteStream.end();
    
    return new Promise((resolve) => {
      nodeWriteStream.on('finish', () => {
        console.log('All data written to files');
        resolve();
      });
    });
  }
  
  // Run the process
  processFile()
    .then(() => {
      console.log('Processing completed successfully');
    })
    .catch((err) => {
      console.error('Error during processing:', err);
      process.exit(1);
    });
}
// Worker thread execution
else {
  const { chunk, chunkId } = workerData;
  
  // Process chunk of data
  const nodes = new Set();
  const relationships = [];
  const events = [];
  
  chunk.forEach(line => {
    try {
      const event = JSON.parse(line);
      const follower = event.pubkey;
      
      // Add follower to nodes set
      nodes.add(follower);
      
      // Add event data
      events.push({
        pubkey: follower,
        id: event.id,
        created_at: event.created_at
      });
      
      // Process tags to find followees
      if (event.tags && Array.isArray(event.tags)) {
        event.tags.forEach(tag => {
          if (tag[0] === 'p') {
            const followee = tag[1];
            nodes.add(followee);
            relationships.push({
              source: follower,
              target: followee
            });
          }
        });
      }
    } catch (err) {
      // Skip invalid lines
    }
  });
  
  // Send results back to main thread
  parentPort.postMessage({
    chunkId,
    nodes: Array.from(nodes),
    relationships,
    events
  });
}
