/**
 * NIP-85 Event Publisher
 * 
 * This module publishes NIP-85 data as kind 30382 events to Nostr relays.
 * It is optimized for large-scale publishing with connection pooling,
 * memory management, and detailed monitoring.
 */

const fs = require('fs');
const { createReadStream } = require('fs');
const { createInterface } = require('readline');
const WebSocket = require('ws');
const { finalizeEvent, getPublicKey, getEventHash } = require('nostr-tools');

/**
 * Publishing Monitor class for tracking publication progress
 */
class PublishingMonitor {
  constructor() {
    this.startTime = Date.now();
    this.totalEvents = 0;
    this.publishedEvents = 0;
    this.failedEvents = 0;
    this.retries = 0;
    this.lastLogTime = Date.now();
    this.logInterval = 5000; // Log every 5 seconds
    this.logFile = `/tmp/brainstorm_publish_${new Date().toISOString().replace(/:/g, '-')}.log`;
    
    // Initialize log file
    fs.writeFileSync(this.logFile, 'timestamp,published,failed,retries,memory_usage,events_per_second\n');
  }

  /**
   * Update monitor with new events
   * @param {number} published - Number of published events
   * @param {number} failed - Number of failed events
   * @param {number} retries - Number of retries
   */
  update(published = 0, failed = 0, retries = 0) {
    this.publishedEvents += published;
    this.failedEvents += failed;
    this.retries += retries;
    
    const now = Date.now();
    if (now - this.lastLogTime > this.logInterval) {
      this.logProgress();
      this.lastLogTime = now;
    }
  }

  /**
   * Set total number of events
   * @param {number} total - Total number of events
   */
  setTotalEvents(total) {
    this.totalEvents = total;
  }

  /**
   * Log progress to console and log file
   */
  logProgress() {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const eventsPerSecond = this.publishedEvents / elapsedSeconds;
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    const percentComplete = this.totalEvents ? (this.publishedEvents / this.totalEvents * 100).toFixed(2) : 0;
    
    console.log(`Progress: ${this.publishedEvents}/${this.totalEvents} (${percentComplete}%) | ` +
                `Rate: ${eventsPerSecond.toFixed(2)} events/sec | ` +
                `Memory: ${memoryUsage.toFixed(2)} MB | ` +
                `Failed: ${this.failedEvents} | ` +
                `Retries: ${this.retries}`);
    
    // Append to log file
    fs.appendFileSync(
      this.logFile,
      `${Date.now()},${this.publishedEvents},${this.failedEvents},${this.retries},${memoryUsage.toFixed(2)},${eventsPerSecond.toFixed(2)}\n`
    );
  }

  /**
   * Generate summary of publication
   * @returns {string} - Summary text
   */
  generateSummary() {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const eventsPerSecond = this.publishedEvents / elapsedSeconds;
    
    return `
Publication Summary:
-------------------
Total events: ${this.totalEvents}
Published events: ${this.publishedEvents}
Failed events: ${this.failedEvents}
Retries: ${this.retries}
Success rate: ${((this.publishedEvents / this.totalEvents) * 100).toFixed(2)}%
Time elapsed: ${elapsedSeconds.toFixed(2)} seconds
Average rate: ${eventsPerSecond.toFixed(2)} events/second
Log file: ${this.logFile}
`;
  }
}

/**
 * Connection Pool for managing WebSocket connections
 */
class ConnectionPool {
  constructor(relayUrl, maxConnections = 5) {
    this.relayUrl = relayUrl;
    this.maxConnections = maxConnections;
    this.connections = [];
    this.connectionIndex = 0;
  }

  /**
   * Initialize connection pool
   * @returns {Promise<void>}
   */
  async initialize() {
    console.log(`Initializing connection pool with ${this.maxConnections} connections to ${this.relayUrl}`);
    
    for (let i = 0; i < this.maxConnections; i++) {
      const connection = await this.createConnection();
      this.connections.push(connection);
    }
  }

  /**
   * Create a new WebSocket connection
   * @returns {Promise<Object>} - Connection object
   */
  createConnection() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.relayUrl);
      
      const connection = {
        ws,
        id: Date.now() + Math.random().toString(36).substring(2, 15),
        busy: false,
        connected: false,
        eventCallbacks: new Map()
      };
      
      ws.on('open', () => {
        connection.connected = true;
        resolve(connection);
      });
      
      ws.on('error', (error) => {
        console.error(`WebSocket error on connection ${connection.id}:`, error.message);
        if (!connection.connected) {
          reject(error);
        }
      });
      
      ws.on('close', () => {
        connection.connected = false;
        console.log(`Connection ${connection.id} closed`);
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message[0] === 'OK' && message[1]) {
            const eventId = message[1];
            const callback = connection.eventCallbacks.get(eventId);
            if (callback) {
              callback(message[2] === true);
              connection.eventCallbacks.delete(eventId);
            }
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error.message);
        }
      });
      
      return connection;
    });
  }

  /**
   * Get next available connection
   * @returns {Object} - Connection object
   */
  getNextConnection() {
    // Find first non-busy connection
    const availableConnection = this.connections.find(conn => !conn.busy && conn.connected);
    if (availableConnection) {
      availableConnection.busy = true;
      return availableConnection;
    }
    
    // If all connections are busy, use round-robin
    const connection = this.connections[this.connectionIndex];
    this.connectionIndex = (this.connectionIndex + 1) % this.connections.length;
    return connection;
  }

  /**
   * Release connection (mark as not busy)
   * @param {Object} connection - Connection object
   */
  releaseConnection(connection) {
    const conn = this.connections.find(c => c.id === connection.id);
    if (conn) {
      conn.busy = false;
    }
  }

  /**
   * Close all connections
   */
  closeAll() {
    this.connections.forEach(connection => {
      if (connection.connected) {
        connection.ws.close();
      }
    });
  }
}

/**
 * Publish NIP-85 events to Nostr relay
 * @param {Object} config - Configuration object
 * @returns {Promise<void>}
 */
async function publishNip85Events(config) {
  console.log('Starting NIP-85 event publication...');
  
  const {
    relayUrl,
    relayPubkey,
    relayNsec,
    inputFile,
    batchSize = 100,
    delayBetweenBatches = 1000,
    delayBetweenEvents = 50,
    maxRetries = 3,
    maxConcurrentConnections = 5
  } = config;
  
  // Initialize monitor
  const monitor = new PublishingMonitor();
  
  // Initialize connection pool
  const pool = new ConnectionPool(relayUrl, maxConcurrentConnections);
  await pool.initialize();
  
  // Read private key from file or environment
  let privateKey = relayNsec;
  if (!privateKey && config.keysFile && fs.existsSync(config.keysFile)) {
    privateKey = fs.readFileSync(config.keysFile, 'utf8').trim();
  }
  
  if (!privateKey) {
    throw new Error('Private key not found. Please set BRAINSTORM_RELAY_PRIVKEY or provide a keys file.');
  }
  
  // Function to publish a single event
  async function publishEvent(eventData, retryCount = 0) {
    const connection = pool.getNextConnection();
    
    try {
      // Create event
      const event = {
        kind: 30382,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['p', eventData.pubkey],
          ['rank', eventData.rank.toString()],
          ['score', eventData.score.toString()],
          ['hops', eventData.hops.toString()]
        ],
        content: ''
      };
      
      // Sign event
      const signedEvent = finalizeEvent(event, privateKey);
      
      // Publish event
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Publish timeout'));
        }, 10000);
        
        connection.eventCallbacks.set(signedEvent.id, (success) => {
          clearTimeout(timeout);
          pool.releaseConnection(connection);
          
          if (success) {
            resolve();
          } else {
            reject(new Error('Relay rejected event'));
          }
        });
        
        connection.ws.send(JSON.stringify(['EVENT', signedEvent]));
      });
    } catch (error) {
      pool.releaseConnection(connection);
      
      if (retryCount < maxRetries) {
        // Exponential backoff
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        monitor.update(0, 0, 1);
        return publishEvent(eventData, retryCount + 1);
      }
      
      throw error;
    }
  }
  
  // Process input file in batches using streaming
  const fileStream = createReadStream(inputFile, { encoding: 'utf8' });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  let dataStarted = false;
  let currentBatch = [];
  let totalEvents = 0;
  
  for await (const line of rl) {
    // Skip metadata lines
    if (line.includes('"metadata"') || line.includes('"data"')) {
      dataStarted = line.includes('"data"');
      continue;
    }
    
    if (!dataStarted || line.trim() === '[' || line.trim() === ']' || line.trim() === '{' || line.trim() === '}') {
      continue;
    }
    
    // Parse event data
    try {
      // Handle JSON format with trailing commas
      const cleanLine = line.replace(/,\s*$/, '');
      const eventData = JSON.parse(cleanLine.includes('{') ? cleanLine : `{${cleanLine}}`);
      
      if (eventData.pubkey) {
        currentBatch.push(eventData);
        totalEvents++;
      }
    } catch (error) {
      // Skip invalid lines
      continue;
    }
    
    // Process batch when it reaches the batch size
    if (currentBatch.length >= batchSize) {
      await processBatch(currentBatch);
      currentBatch = [];
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
  }
  
  // Process remaining events
  if (currentBatch.length > 0) {
    await processBatch(currentBatch);
  }
  
  // Set total events in monitor
  monitor.setTotalEvents(totalEvents);
  
  // Close connections
  pool.closeAll();
  
  // Log final summary
  monitor.logProgress();
  console.log(monitor.generateSummary());
  
  /**
   * Process a batch of events
   * @param {Array} batch - Batch of events to process
   * @returns {Promise<void>}
   */
  async function processBatch(batch) {
    const promises = [];
    
    for (const eventData of batch) {
      promises.push(
        publishEvent(eventData)
          .then(() => {
            monitor.update(1, 0, 0);
          })
          .catch(error => {
            console.error(`Failed to publish event for ${eventData.pubkey}:`, error.message);
            monitor.update(0, 1, 0);
          })
      );
      
      // Add delay between events to avoid overwhelming the relay
      await new Promise(resolve => setTimeout(resolve, delayBetweenEvents));
    }
    
    // Wait for all events in the batch to complete
    await Promise.allSettled(promises);
    
    // Add delay between batches
    await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
  }
}

module.exports = {
  publishNip85Events,
  PublishingMonitor,
  ConnectionPool
};
