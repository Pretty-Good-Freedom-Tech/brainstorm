#!/usr/bin/env node

/**
 * This script publishes the nip85.json data to the Nostr network as kind 30382 events
 * following the Trusted Assertions protocol (NIP-85).
 * It reads the nip85.json file and publishes each user as a separate event.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const WebSocket = require('ws');
const { finalizeEvent, getEventHash } = require('nostr-tools');
const readline = require('readline');
const os = require('os');

// Get environment variables from hasenpfeffr.conf using source command
function getEnvVar(varName) {
  try {
    const value = execSync(`bash -c 'source /etc/hasenpfeffr.conf && echo $${varName}'`).toString().trim();
    return value;
  } catch (error) {
    console.error(`Error getting environment variable ${varName}:`, error.message);
    return null;
  }
}

// Get the Nostr keys from various possible locations
function getNostrKeys() {
  try {
    // Try environment variables first
    const privateKey = getEnvVar('HASENPFEFFR_RELAY_NSEC');
    const publicKey = getEnvVar('HASENPFEFFR_RELAY_PUBKEY');
    
    if (privateKey && publicKey) {
      console.log(`Got keys from environment: PUBKEY=${publicKey.substring(0, 8)}...`);
      return { privateKey, publicKey };
    }
    
    // Check the key file at the known location
    const keyFilePath = '/home/ubuntu/hasenpfeffr/nostr/keys/hasenpfeffr_relay_keys';
    
    if (fs.existsSync(keyFilePath)) {
      console.log(`Reading keys from file: ${keyFilePath}`);
      try {
        const keysData = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
        
        // The file has fields "nsec" and "pubkey" instead of HASENPFEFFR_RELAY_NSEC and HASENPFEFFR_RELAY_PUBKEY
        if (keysData.nsec && keysData.pubkey) {
          console.log(`Successfully read keys from ${keyFilePath}`);
          return {
            privateKey: keysData.nsec,
            publicKey: keysData.pubkey
          };
        } else {
          console.error(`Key file exists but doesn't contain expected fields (nsec, pubkey)`);
          console.log('Available fields:', Object.keys(keysData).join(', '));
        }
      } catch (e) {
        console.error(`Error parsing JSON from ${keyFilePath}:`, e.message);
        // Show the file content for debugging
        try {
          const content = fs.readFileSync(keyFilePath, 'utf8');
          console.log('File content:', content);
        } catch (readError) {
          console.error('Error reading file content:', readError.message);
        }
      }
    } else {
      console.error(`Key file not found at ${keyFilePath}`);
    }
    
    // If we get here, we couldn't find the keys
    console.error('Could not find Nostr keys in any of the expected locations');
    return null;
  } catch (error) {
    console.error('Error reading Nostr keys:', error);
    return null;
  }
}

// Constants for monitoring
const LOG_FILE = path.join(os.tmpdir(), `nostr_publish_${Date.now()}.log`);
const STATS_INTERVAL = 60000; // Log stats every minute

// Monitoring class for tracking performance and progress
class PublishingMonitor {
  constructor(totalEvents) {
    this.startTime = Date.now();
    this.totalEvents = totalEvents;
    this.successCount = 0;
    this.failureCount = 0;
    this.lastReportTime = this.startTime;
    this.lastReportCount = 0;
    
    // Initialize log file
    fs.writeFileSync(LOG_FILE, `Timestamp,Elapsed,TotalProcessed,SuccessCount,FailureCount,EventsPerSecond,MemoryUsageMB\n`);
    
    // Start periodic stats reporting
    this.statsInterval = setInterval(() => this.logStats(), STATS_INTERVAL);
    
    console.log(`Monitoring initialized. Log file: ${LOG_FILE}`);
  }
  
  recordSuccess() {
    this.successCount++;
    this.checkProgress();
  }
  
  recordFailure() {
    this.failureCount++;
    this.checkProgress();
  }
  
  checkProgress() {
    const totalProcessed = this.successCount + this.failureCount;
    
    // Log progress every 100 events or when explicitly called
    if (totalProcessed % 100 === 0) {
      this.logProgress();
    }
  }
  
  logProgress() {
    const totalProcessed = this.successCount + this.failureCount;
    const percentComplete = ((totalProcessed / this.totalEvents) * 100).toFixed(2);
    const elapsedSeconds = ((Date.now() - this.startTime) / 1000).toFixed(1);
    
    console.log(`Progress: ${percentComplete}% (${totalProcessed}/${this.totalEvents}) - ${this.successCount} successful, ${this.failureCount} failed - Elapsed: ${elapsedSeconds}s`);
  }
  
  logStats() {
    const now = Date.now();
    const totalProcessed = this.successCount + this.failureCount;
    const elapsedMs = now - this.startTime;
    const elapsedSinceLastReport = now - this.lastReportTime;
    const processedSinceLastReport = totalProcessed - this.lastReportCount;
    
    // Calculate events per second since last report
    const eventsPerSecond = processedSinceLastReport / (elapsedSinceLastReport / 1000);
    
    // Get memory usage
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
    
    // Log to file
    const logEntry = [
      new Date().toISOString(),
      (elapsedMs / 1000).toFixed(1),
      totalProcessed,
      this.successCount,
      this.failureCount,
      eventsPerSecond.toFixed(2),
      memoryUsageMB
    ].join(',');
    
    fs.appendFileSync(LOG_FILE, `${logEntry}\n`);
    
    // Calculate estimated completion time
    if (eventsPerSecond > 0) {
      const remainingEvents = this.totalEvents - totalProcessed;
      const estimatedSecondsRemaining = remainingEvents / eventsPerSecond;
      const estimatedCompletion = new Date(now + (estimatedSecondsRemaining * 1000));
      
      console.log(`
Stats Report:
------------
Processed: ${totalProcessed}/${this.totalEvents} (${((totalProcessed / this.totalEvents) * 100).toFixed(2)}%)
Success: ${this.successCount}, Failed: ${this.failureCount}
Rate: ${eventsPerSecond.toFixed(2)} events/second
Memory: ${memoryUsageMB} MB
Elapsed: ${(elapsedMs / 1000 / 60).toFixed(2)} minutes
Est. completion: ${estimatedCompletion.toLocaleTimeString()}
------------
`);
    }
    
    // Update last report values
    this.lastReportTime = now;
    this.lastReportCount = totalProcessed;
  }
  
  stop() {
    clearInterval(this.statsInterval);
    this.logStats(); // Final stats report
    
    const elapsedSeconds = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`
Publication Summary:
-------------------
Total events: ${this.totalEvents}
Successfully published: ${this.successCount}
Failed to publish: ${this.failureCount}
Total time: ${elapsedSeconds} seconds
Average rate: ${(this.successCount / (elapsedSeconds)).toFixed(2)} events/second
Log file: ${LOG_FILE}
-------------------
`);
  }
}

// Global counters for tracking progress
let monitor;

// Configuration
const BATCH_SIZE = 100; // Increase batch size for better throughput
const DELAY_BETWEEN_BATCHES = 1000; // ms delay between batches to avoid overwhelming the relay
const DELAY_BETWEEN_EVENTS = 50; // ms delay between individual events within a batch
const CONNECTION_TIMEOUT = 10000; // ms to wait for connection
const PROCESSING_WINDOW = 2000; // ms to wait for processing after sending an event
const MAX_RETRIES = 3; // Maximum number of retries for failed publications
const MAX_CONCURRENT_CONNECTIONS = 5; // Maximum number of concurrent WebSocket connections

// Connection pool management
class ConnectionPool {
  constructor(relayUrl, maxConnections) {
    this.relayUrl = relayUrl;
    this.maxConnections = maxConnections;
    this.activeConnections = 0;
    this.queue = [];
    this.connections = new Map();
  }

  async getConnection() {
    return new Promise((resolve) => {
      if (this.activeConnections < this.maxConnections) {
        this.activeConnections++;
        const ws = new WebSocket(this.relayUrl);
        const connectionId = Date.now() + Math.random().toString(36).substring(2, 15);
        
        ws.on('open', () => {
          this.connections.set(connectionId, ws);
          resolve({ ws, connectionId });
        });
        
        ws.on('error', () => {
          // If connection fails, reduce active count and try again
          this.activeConnections--;
          resolve(this.getConnection());
        });
      } else {
        // Queue the request
        this.queue.push(resolve);
      }
    });
  }

  releaseConnection(connectionId) {
    const ws = this.connections.get(connectionId);
    if (ws) {
      ws.close();
      this.connections.delete(connectionId);
      this.activeConnections--;
      
      // Process next in queue if any
      if (this.queue.length > 0) {
        const nextResolve = this.queue.shift();
        nextResolve(this.getConnection());
      }
    }
  }

  closeAll() {
    for (const ws of this.connections.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
    this.connections.clear();
    this.activeConnections = 0;
  }
}

// Function to publish an event with retries
async function publishEventWithRetry(relayUrl, event, pool, maxRetries = MAX_RETRIES) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt} for event ${event.id} to relay ${relayUrl}`);
        // Exponential backoff
        const backoffTime = Math.pow(2, attempt) * 500;
        console.log(`Waiting ${backoffTime}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
      
      console.log(`Publishing event ${event.id} to relay ${relayUrl} (attempt ${attempt + 1}/${maxRetries})`);
      await publishEventToRelay(relayUrl, event, pool);
      console.log(`Successfully published event ${event.id} to relay ${relayUrl}`);
      return; // Success, exit the retry loop
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt + 1}/${maxRetries} failed for event ${event.id} to relay ${relayUrl}: ${error.message}`);
      
      // Log more details about the error for debugging
      if (error.code) {
        console.error(`Error code: ${error.code}`);
      }
      if (error.stack) {
        console.error(`Error stack: ${error.stack}`);
      }
    }
  }
  
  // If we get here, all retries failed
  console.error(`All ${maxRetries} attempts failed for event ${event.id} to relay ${relayUrl}.`);
  console.error(`Last error: ${lastError ? lastError.message : 'Unknown error'}`);
  
  // Record the failure in the monitor
  monitor.recordFailure();
}

// Modified function to use connection pool
async function publishEventToRelay(relayUrl, event, pool) {
  return new Promise(async (resolve, reject) => {
    const { ws, connectionId } = await pool.getConnection();
    let timeoutId;
    
    // Set processing timeout
    timeoutId = setTimeout(() => {
      console.log(`Processing timeout for event ${event.id}, considering it sent successfully`);
      pool.releaseConnection(connectionId);
      // Consider timeout as success since we were able to send the event
      // Many relays don't respond with OK messages
      monitor.recordSuccess();
      resolve();
    }, PROCESSING_WINDOW);
    
    const messageHandler = (data) => {
      const message = data.toString();
      
      try {
        const parsed = JSON.parse(message);
        console.log(`Received response from relay ${relayUrl} for event ${event.id}:`, JSON.stringify(parsed));
        
        if (parsed[0] === 'OK' && parsed[1] === event.id) {
          clearTimeout(timeoutId);
          // Consider any OK response as success, regardless of the third parameter
          monitor.recordSuccess();
          
          // Remove listeners to avoid memory leaks
          ws.removeListener('message', messageHandler);
          ws.removeListener('error', errorHandler);
          
          pool.releaseConnection(connectionId);
          resolve();
        } else if (parsed[0] === 'EVENT') {
          // Ignore EVENT messages from the relay
        } else if (parsed[0] === 'NOTICE') {
          console.log(`Relay notice from ${relayUrl}: ${parsed[1]}`);
        } else {
          // Log other responses but don't resolve yet
          console.log(`Received non-OK response from relay ${relayUrl}:`, JSON.stringify(parsed));
        }
      } catch (e) {
        console.error(`Error parsing message from ${relayUrl}: ${e.message}`);
      }
    };
    
    const errorHandler = (error) => {
      console.error(`WebSocket error for ${relayUrl}:`, error);
      clearTimeout(timeoutId);
      
      // Remove listeners to avoid memory leaks
      ws.removeListener('message', messageHandler);
      ws.removeListener('error', errorHandler);
      
      pool.releaseConnection(connectionId);
      reject(error);
    };
    
    ws.on('message', messageHandler);
    ws.on('error', errorHandler);
    
    // Send the event
    const message = JSON.stringify(["EVENT", event]);
    ws.send(message);
    console.log(`Event ${event.id} sent to relay ${relayUrl}`);
  });
}

// Main function
async function publishNip85() {
  console.log('Starting Nip85 data publishing...');
  
  // Get Nostr keys
  const keys = getNostrKeys();
  if (!keys) {
    console.error('Failed to get Nostr keys');
    process.exit(1);
  }
  
  console.log(`Using pubkey: ${keys.publicKey}`);
  
  // Get relay URL from configuration
  let relayUrl = getEnvVar('HASENPFEFFR_RELAY_URL');
  
  // Fallback relay URLs if the main one is not configured
  const fallbackRelays = [
    'wss://relay.hasenpfeffr.com',
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://relay.primal.net',
    'wss://nos.lol'
  ];
  
  if (!relayUrl) {
    console.log('No relay URL configured in HASENPFEFFR_RELAY_URL, using fallback relay');
    relayUrl = fallbackRelays[0];
  }
  
  console.log(`Publishing to primary relay: ${relayUrl}`);
  
  // Additional relays to publish to for redundancy
  const additionalRelays = fallbackRelays.filter(url => url !== relayUrl);
  console.log(`Will also publish to ${additionalRelays.length} additional relays for redundancy`);
  
  // Initialize connection pools for all relays
  const primaryPool = new ConnectionPool(relayUrl, MAX_CONCURRENT_CONNECTIONS);
  console.log(`Created connection pool for primary relay: ${relayUrl}`);
  
  // Create connection pools for additional relays
  const additionalPools = {};
  for (const additionalRelay of additionalRelays) {
    additionalPools[additionalRelay] = new ConnectionPool(additionalRelay, 2); // Use fewer connections for secondary relays
    console.log(`Created connection pool for additional relay: ${additionalRelay}`);
  }
  
  // Input file path
  const inputFile = '/usr/local/lib/node_modules/hasenpfeffr/src/algos/nip85.json';
  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    process.exit(1);
  }
  
  // Count total lines for progress reporting
  console.log(`Counting total lines in ${inputFile}...`);
  const totalToProcess = await countLines(inputFile);
  console.log(`Total records to process: ${totalToProcess}`);
  
  // Initialize the monitor
  monitor = new PublishingMonitor(totalToProcess);
  
  // Process the file in streaming mode to avoid loading everything into memory
  console.log(`Processing ${inputFile} in streaming mode...`);
  
  const fileStream = fs.createReadStream(inputFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  let lineCount = 0;
  let batchCount = 0;
  let currentBatch = [];
  
  // Process each line
  for await (const line of rl) {
    if (line.trim()) {
      currentBatch.push(line);
      lineCount++;
      
      // When we reach batch size, process the batch
      if (currentBatch.length >= BATCH_SIZE) {
        batchCount++;
        console.log(`Processing batch ${batchCount} (records ${lineCount - BATCH_SIZE + 1}-${lineCount})...`);
        await processBatch(currentBatch, primaryPool, relayUrl, keys, additionalPools);
        
        // Clear the batch and wait before next batch
        currentBatch = [];
        console.log(`Waiting before next batch...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        
        // Periodically force garbage collection if available
        if (global.gc && lineCount % (BATCH_SIZE * 10) === 0) {
          console.log('Forcing garbage collection...');
          global.gc();
        }
      }
    }
  }
  
  // Process any remaining records
  if (currentBatch.length > 0) {
    batchCount++;
    console.log(`Processing final batch ${batchCount} (records ${lineCount - currentBatch.length + 1}-${lineCount})...`);
    await processBatch(currentBatch, primaryPool, relayUrl, keys, additionalPools);
  }
  
  // Close all connection pools
  await primaryPool.closeAll();
  for (const additionalRelay of Object.keys(additionalPools)) {
    await additionalPools[additionalRelay].closeAll();
  }
  
  monitor.stop();
}

// Helper function to count lines in a file
async function countLines(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  let lineCount = 0;
  for await (const line of rl) {
    if (line.trim()) {
      lineCount++;
    }
  }
  
  return lineCount;
}

// Helper function to process a batch of records
async function processBatch(batch, primaryPool, relayUrl, keys, additionalPools) {
  const promises = [];
  
  for (let i = 0; i < batch.length; i++) {
    try {
      const line = batch[i];
      const userData = JSON.parse(line);
      
      // Create the kind 30382 event following NIP-85
      const event = {
        kind: 30382, // NIP-85 kind for Trusted Assertions
        pubkey: keys.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: userData.tags,
        content: "" // Empty content as per the example
      };
      
      // Sign the event
      event.id = getEventHash(event);
      const signedEvent = finalizeEvent(event, keys.privateKey);
      
      // Add to promises array with a slight delay between each to avoid overwhelming the relay
      promises.push(
        (async (evt, idx) => {
          await new Promise(resolve => setTimeout(resolve, idx * DELAY_BETWEEN_EVENTS));
          try {
            // Publish to primary relay
            await publishEventWithRetry(relayUrl, evt, primaryPool);
            
            // Publish to additional relays for redundancy
            for (const additionalRelay of Object.keys(additionalPools)) {
              await publishEventWithRetry(additionalRelay, evt, additionalPools[additionalRelay]);
            }
          } catch (error) {
            console.error(`Failed to publish event after retries: ${error.message}`);
            monitor.recordFailure(); // Use monitor instead of global counter
          }
        })(signedEvent, i)
      );
    } catch (error) {
      console.error(`Error processing batch item: ${error.message}`);
      monitor.recordFailure(); // Use monitor instead of global counter
    }
  }
  
  // Wait for all promises to complete
  await Promise.all(promises);
}

// Run the main function
publishNip85().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});