#!/usr/bin/env node

/**
 * Brainstorm Publish Kind 30382 Events
 * 
 * This script publishes kind 30382 events for users in the Web of Trust
 * Each event is signed with the customer's relay private key (CUSTOMER_<customer_pubkey>_RELAY_PRIVKEY)
 * and published to the relay via WebSocket
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const neo4j = require('neo4j-driver');
const nostrTools = require('nostr-tools');
const WebSocket = require('ws');
const { getConfigFromFile } = require('../../../utils/config.js');
const { getCustomerRelayKeys } = require('../../../utils/customerRelayKeys.js');

// Extract CUSTOMER_PUBKEY, CUSTOMER_ID, and CUSTOMER_NAME which are passed as arguments
const CUSTOMER_PUBKEY = process.argv[2];
const CUSTOMER_ID = process.argv[3];
const CUSTOMER_NAME = process.argv[4];

// Get log directory
const LOG_DIR = '/var/log/brainstorm/customers/' + CUSTOMER_NAME;
execSync(`touch ${LOG_DIR}`);
execSync(`sudo chown brainstorm:brainstorm ${LOG_DIR}`);

// Log file
const LOG_FILE = `${LOG_DIR}/publishNip85.log`;
execSync(`touch ${LOG_FILE}`);
execSync(`sudo chown brainstorm:brainstorm ${LOG_FILE}`);

// Get relay configuration (will be moved into main function)
const relayUrl = getConfigFromFile('BRAINSTORM_RELAY_URL', '');
const neo4jUri = getConfigFromFile('NEO4J_URI', 'bolt://localhost:7687');
const neo4jUser = getConfigFromFile('NEO4J_USER', 'neo4j');
const neo4jPassword = getConfigFromFile('NEO4J_PASSWORD', 'neo4j');
const kind30382_limit = getConfigFromFile('BRAINSTORM_30382_LIMIT', '1000');
const nip85RelayUrls = getConfigFromFile('BRAINSTORM_NIP85_RELAYS', "wss://nip85.brainstorm.world,wss://nip85.grapevine.network,wss://nip85.nostr1.com")

// Use fallback relay if the main one is not configured
let primaryRelayUrl = relayUrl;

// Parse the relay URLs array if it's a string
let relayUrls;
try {
  // nip85RelayUrls is expected to be a string of comma-separated URLs
  relayUrls = nip85RelayUrls.split(',').map(url => url.trim());
  // also publish to primary relay
  relayUrls.push(primaryRelayUrl);
} catch (error) {
  console.error('Error parsing nip85RelayUrls:', error);
  relayUrls = [primaryRelayUrl]; // Fallback to primary relay
}

// Log initial setup
console.log(`Continuing publishNip85; begin publish_kind30382 for customer ${CUSTOMER_PUBKEY} ${CUSTOMER_ID} ${CUSTOMER_NAME}`);
console.log(`Using relay URL: ${relayUrl}`);
console.log(`Neo4j URI: ${neo4jUri}`);
console.log(`Kind 30382 limit: ${kind30382_limit}`);
console.log(`NIP-85 relay URLs: ${nip85RelayUrls}`);

execSync(`echo "$(date): Continuing publishNip85; begin publish_kind30382 for customer ${CUSTOMER_PUBKEY} ${CUSTOMER_ID} ${CUSTOMER_NAME}" >> ${LOG_FILE}`);
execSync(`echo "$(date): Using relay URL: ${relayUrl}" >> ${LOG_FILE}`);
execSync(`echo "$(date): Neo4j URI: ${neo4jUri}" >> ${LOG_FILE}`);
execSync(`echo "$(date): Kind 30382 limit: ${kind30382_limit}" >> ${LOG_FILE}`);
execSync(`echo "$(date): NIP-85 relay URLs: ${nip85RelayUrls}" >> ${LOG_FILE}`);

// Relay key processing will be done inside main() function where we have access to secure storage

// Connect to Neo4j
const driver = neo4j.driver(
  neo4jUri,
  neo4j.auth.basic(neo4jUser, neo4jPassword)
);

// Function to get users with WoT scores from Neo4j
async function getUsers() {
  const session = driver.session();
  
  try {
    console.log('Querying Neo4j for users with WoT scores...');
    execSync(`echo "$(date): Querying Neo4j for users with WoT scores..." >> ${LOG_FILE}`);
    
    // Build the query
    let query = `
      MATCH (u:NostrUserWotMetricsCard)
      WHERE u.personalizedPageRank IS NOT NULL 
      AND u.influence IS NOT NULL
      AND (u.influence > 0.01 OR u.muterInput > 0.1 OR u.reporterInput > 0.1)
      AND u.hops IS NOT NULL 
      AND u.hops < 100
      AND u.observer_pubkey IS NOT NULL
      AND u.observer_pubkey = '${CUSTOMER_PUBKEY}'
      AND u.observee_pubkey IS NOT NULL
      RETURN u.observee_pubkey AS pubkey, 
             u.personalizedPageRank AS personalizedPageRank, 
             u.hops AS hops,
             u.influence AS influence,
             u.average AS average,
             u.confidence AS confidence,
             u.input AS input,
             u.verifiedFollowerCount AS verifiedFollowerCount,
             u.verifiedMuterCount AS verifiedMuterCount,
             u.verifiedReporterCount AS verifiedReporterCount
      ORDER BY u.influence DESC
      LIMIT ${kind30382_limit}
    `;    
    const result = await session.run(query);
    
    // Process the records
    const users = result.records.map(record => processUserRecord(record));
    
    console.log(`Found ${users.length} users with WoT scores`);
    execSync(`echo "$(date): Found ${users.length} users with WoT scores" >> ${LOG_FILE}`);
    
    return users;
  } catch (error) {
    console.error('Error querying Neo4j:', error);
    execSync(`echo "$(date): Error querying Neo4j: ${error.message}" >> ${LOG_FILE}`);
    throw error;
  } finally {
    await session.close();
  }
}

// Helper function to process a Neo4j record into a user object
function processUserRecord(record) {
  const user = {
    pubkey: record.get('pubkey'),
    personalizedPageRank: record.get('personalizedPageRank'),
    hops: record.get('hops'),
    influence: record.get('influence'),
    average: record.get('average'),
    confidence: record.get('confidence'),
    input: record.get('input'),
    verifiedFollowerCount: record.get('verifiedFollowerCount'),
    verifiedMuterCount: record.get('verifiedMuterCount'),
    verifiedReporterCount: record.get('verifiedReporterCount')
  };
  
  // Ensure all values are defined
  if (user.personalizedPageRank === null || user.personalizedPageRank === undefined) {
    user.personalizedPageRank = 0;
  }
  
  if (user.hops === null || user.hops === undefined) {
    user.hops = 999;
  }
  
  if (user.influence === null || user.influence === undefined) {
    user.influence = 0;
  }
  
  if (user.average === null || user.average === undefined) {
    user.average = 0;
  }
  
  if (user.confidence === null || user.confidence === undefined) {
    user.confidence = 0;
  }
  
  if (user.input === null || user.input === undefined) {
    user.input = 0;
  }

  if (user.verifiedFollowerCount === null || user.verifiedFollowerCount === undefined) {
    user.verifiedFollowerCount = 0;
  }

  if (user.verifiedMuterCount === null || user.verifiedMuterCount === undefined) {
    user.verifiedMuterCount = 0;
  }

  if (user.verifiedReporterCount === null || user.verifiedReporterCount === undefined) {
    user.verifiedReporterCount = 0;
  }
  
  return user;
}

// Create and sign a kind 30382 event
function createEvent(relayPubkey, relayPrivateKey, userPubkey, personalizedPageRank, hops, influence, average, confidence, input, verifiedFollowerCount, verifiedMuterCount, verifiedReporterCount) {
  // Create the event object
  const rankValue = Math.round(parseFloat(influence) * 100).toString();
  const event = {
    kind: 30382,
    pubkey: relayPubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', userPubkey],
      ['rank', rankValue],
      ['hops', hops.toString()],
      ['personalizedGrapeRank_influence', influence ? influence.toString() : '0'],
      ['personalizedGrapeRank_average', average ? average.toString() : '0'],
      ['personalizedGrapeRank_confidence', confidence ? confidence.toString() : '0'],
      ['personalizedGrapeRank_input', input ? input.toString() : '0'],
      ["personalizedPageRank", personalizedPageRank ? personalizedPageRank.toString() : '0'],
      ["verifiedFollowerCount", verifiedFollowerCount ? verifiedFollowerCount.toString() : '0'],
      ["verifiedMuterCount", verifiedMuterCount ? verifiedMuterCount.toString() : '0'],
      ["verifiedReporterCount", verifiedReporterCount ? verifiedReporterCount.toString() : '0']
    ],
    content: ''
  };
  
  // Use finalizeEvent to calculate ID and sign in one step
  return nostrTools.finalizeEvent(event, relayPrivateKey);
}

// Function to publish an event to the relay via WebSocket
function publishEventToRelay(event, targetRelayUrl = relayUrl) {
  return new Promise((resolve, reject) => {
    // console.log(`Publishing event ${event.id.substring(0, 8)}... to ${targetRelayUrl}`);
    execSync(`echo "$(date): Publishing event ${event.id.substring(0, 8)}... to ${targetRelayUrl}" >> ${LOG_FILE}`);

    let resolved = false;
    let timeout;
    
    try {
      const ws = new WebSocket(targetRelayUrl);
      
      // Set a timeout for the connection and publishing
      timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          ws.close();
          console.log(`Timeout publishing to ${targetRelayUrl}`);
          resolve({
            success: false,
            message: `Timeout publishing to ${targetRelayUrl}`,
            relay: targetRelayUrl
          });
        }
      }, 10000); // 10 second timeout
      
      ws.on('open', () => {
        console.log(`Connected to ${targetRelayUrl}`);
        
        // Send the event to the relay
        const message = JSON.stringify(['EVENT', event]);
        ws.send(message);
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message[0] === 'OK' && message[1] === event.id) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              ws.close();
              execSync(`echo "$(date): Event ${event.id.substring(0, 8)}... published successfully to ${targetRelayUrl}" >> ${LOG_FILE}`);
              resolve({
                success: true,
                message: `Event ${event.id.substring(0, 8)}... published successfully`,
                relay: targetRelayUrl
              });
            }
          } else if (message[0] === 'NOTICE') {
            console.log(`Notice from relay ${targetRelayUrl}: ${message[1]}`);
          } else if (message[0] === 'OK' && message[2] === false) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              ws.close();
              execSync(`echo "$(date): Error publishing event to ${targetRelayUrl}: ${message[1]}" >> ${LOG_FILE}`);
              resolve({
                success: false,
                message: `Error: ${message[1]}`,
                relay: targetRelayUrl
              });
            }
          }
        } catch (error) {
          console.error(`Error parsing message from ${targetRelayUrl}:`, error);
        }
      });
      
      ws.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.error(`WebSocket error with ${targetRelayUrl}:`, error.message);
          resolve({
            success: false,
            message: `WebSocket error: ${error.message}`,
            relay: targetRelayUrl
          });
        }
      });
      
      ws.on('close', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          execSync(`echo "$(date): Connection closed with ${targetRelayUrl} before receiving confirmation" >> ${LOG_FILE}`);
          resolve({
            success: false,
            message: 'Connection closed before receiving confirmation',
            relay: targetRelayUrl
          });
        }
      });
    } catch (error) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        execSync(`echo "$(date): Error connecting to ${targetRelayUrl}: ${error.message}" >> ${LOG_FILE}`);
        resolve({
          success: false,
          message: `Error connecting: ${error.message}`,
          relay: targetRelayUrl
        });
      }
    }
  });
}

// Main function
async function main() {
  try {
    // Fetch users with personalizedPageRank
    const users = await getUsers();
    
    if (users.length === 0) {
      console.log('No users found with WoT scores');
      execSync(`echo "$(date): No users found with WoT scores" >> ${LOG_FILE}`);
      return {
        success: false,
        message: 'No users found with WoT scores',
        events: []
      };
    }
    
    console.log(`Found ${users.length} users`);
    execSync(`echo "$(date): Found ${users.length} users" >> ${LOG_FILE}`);
    
    // Get relay private key from secure storage
    console.log(`Fetching secure relay keys for customer ${CUSTOMER_PUBKEY}...`);
    const relayKeys = await getCustomerRelayKeys(CUSTOMER_PUBKEY);
    const relayNsec = relayKeys ? relayKeys.nsec : null;
    
    console.log(`Relay private key available: ${relayNsec ? 'Yes' : 'No'}`);
    execSync(`echo "$(date): Relay private key available: ${relayNsec ? 'Yes' : 'No'}" >> ${LOG_FILE}`);
    
    if (!relayNsec) {
      const errorMsg = `Error: No relay private key found for customer ${CUSTOMER_PUBKEY}`;
      console.error(errorMsg);
      execSync(`echo "$(date): ${errorMsg}" >> ${LOG_FILE}`);
      return {
        success: false,
        message: errorMsg,
        events: []
      };
    }
    
    // Convert keys to the format needed by nostr-tools
    let relayPrivateKey = relayNsec;
    let relayPubkey = '';
    
    try {
      // If we have the private key in nsec format, convert it to hex
      if (relayPrivateKey.startsWith('nsec')) {
        relayPrivateKey = nostrTools.nip19.decode(relayPrivateKey).data;
      }
      
      // Derive the public key from the private key
      relayPubkey = nostrTools.getPublicKey(relayPrivateKey);
      console.log(`Using relay pubkey: ${relayPubkey.substring(0, 8)}...`);
      execSync(`echo "$(date): Using relay pubkey: ${relayPubkey.substring(0, 8)}..." >> ${LOG_FILE}`);
    } catch (error) {
      const errorMsg = `Error processing relay keys: ${error.message}`;
      console.error(errorMsg);
      execSync(`echo "$(date): ${errorMsg}" >> ${LOG_FILE}`);
      return {
        success: false,
        message: errorMsg,
        events: []
      };
    }
    
    // Create data directory if it doesn't exist
    const dataDir = '/var/lib/brainstorm/data';
    const publishedDir = path.join(dataDir, 'published');
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    if (!fs.existsSync(publishedDir)) {
      fs.mkdirSync(publishedDir, { recursive: true });
    }
    
    // Process users in batches
    const BATCH_SIZE = 100; // Process 100 users at a time
    const totalUsers = users.length;
    const batches = Math.ceil(totalUsers / BATCH_SIZE);
    
    console.log(`Processing ${totalUsers} users in ${batches} batches of ${BATCH_SIZE}`);
    execSync(`echo "$(date): Processing ${totalUsers} users in ${batches} batches of ${BATCH_SIZE}" >> ${LOG_FILE}`);
    
    // Initialize counters
    let successCount = 0;
    let failureCount = 0;
    let publishResults = [];
    
    // Process each batch
    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const start = batchIndex * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, totalUsers);
      const batchUsers = users.slice(start, end);
      
      console.log(`Processing batch ${batchIndex + 1}/${batches} (users ${start + 1}-${end} of ${totalUsers})`);
      execSync(`echo "$(date): Processing batch ${batchIndex + 1}/${batches} (users ${start + 1}-${end} of ${totalUsers})" >> ${LOG_FILE}`);
      
      // Create and publish events for this batch
      const batchEvents = [];
      const batchPublishResults = [];
      
      for (const user of batchUsers) {
        try {
          console.log(`Creating event for user: ${user.pubkey} personalizedPageRank: ${user.personalizedPageRank} hops: ${user.hops} influence: ${user.influence} average: ${user.average} confidence: ${user.confidence} input: ${user.input} verifiedFollowerCount: ${user.verifiedFollowerCount} verifiedMuterCount: ${user.verifiedMuterCount} verifiedReporterCount: ${user.verifiedReporterCount}`);
          
          // Create the event
          const event = createEvent(
            relayPubkey,
            relayPrivateKey,
            user.pubkey, 
            user.personalizedPageRank, 
            user.hops,
            user.influence,
            user.average,
            user.confidence,
            user.input,
            user.verifiedFollowerCount,
            user.verifiedMuterCount,
            user.verifiedReporterCount
          );
          
          // Save the event to a file
          const timestamp = Date.now();
          const filename = `kind30382_${user.pubkey.substring(0, 8)}_${timestamp}.json`;
          const filePath = path.join(publishedDir, filename);
          
          fs.writeFileSync(filePath, JSON.stringify(event, null, 2));
          console.log(`Event saved to ${filePath}`);
          
          batchEvents.push(event);
        } catch (error) {
          console.error(`Error creating event for user ${user.pubkey}:`, error);
          execSync(`echo "$(date): Error creating event for user ${user.pubkey}: ${error.message}" >> ${LOG_FILE}`);
          failureCount++;
        }
      }
      
      // Publish events in this batch to all NIP-85 relays
      for (const event of batchEvents) {
        // Publish to each relay sequentially
        for (const relayUrl of relayUrls) {
          try {
            console.log(`Publishing event ${event.id} to relay: ${relayUrl}`);
            const result = await publishEventToRelay(event, relayUrl);
            
            batchPublishResults.push({
              eventId: event.id,
              userPubkey: event.tags.find(tag => tag[0] === 'd')?.[1] || 'unknown',
              relayUrl: relayUrl,
              success: result.success,
              message: result.message
            });
            
            if (result.success) {
              successCount++;
            } else {
              failureCount++;
            }
          } catch (error) {
            console.error(`Error publishing event ${event.id} to ${relayUrl}:`, error);
            execSync(`echo "$(date): Error publishing event ${event.id} to ${relayUrl}: ${error.message}" >> ${LOG_FILE}`);
            
            batchPublishResults.push({
              eventId: event.id,
              userPubkey: event.tags.find(tag => tag[0] === 'd')?.[1] || 'unknown',
              relayUrl: relayUrl,
              success: false,
              message: error.message
            });
            
            failureCount++;
          }
        }
      }
      
      // Add batch results to overall results
      publishResults = publishResults.concat(batchPublishResults);
      
      // Log progress after each batch
      console.log(`Batch ${batchIndex + 1}/${batches} complete. Progress: ${successCount + failureCount}/${totalUsers} (${successCount} successful, ${failureCount} failed)`);
      execSync(`echo "$(date): Batch ${batchIndex + 1}/${batches} complete. Progress: ${successCount + failureCount}/${totalUsers} (${successCount} successful, ${failureCount} failed)" >> ${LOG_FILE}`);
      
      // Output a summary after each batch to provide progress updates
      const batchSummary = {
        batchNumber: batchIndex + 1,
        totalBatches: batches,
        batchSize: batchUsers.length,
        batchSuccessCount: batchPublishResults.filter(r => r.success).length,
        batchFailureCount: batchPublishResults.filter(r => !r.success).length,
        overallProgress: {
          processed: successCount + failureCount,
          total: totalUsers,
          successCount,
          failureCount
        }
      };
      
      console.log('Batch summary:', JSON.stringify(batchSummary));
      
      // Optional: Add a small delay between batches to avoid overwhelming the relay
      if (batchIndex < batches - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('Publishing summary:');
    console.log(`- Total events: ${successCount + failureCount}`);
    console.log(`- Successfully published: ${successCount}`);
    console.log(`- Failed: ${failureCount}`);
    
    execSync(`echo "$(date): Publishing summary: Total events: ${successCount + failureCount}, Successfully published: ${successCount}, Failed: ${failureCount}" >> ${LOG_FILE}`);
    
    // Return a summary of the results
    // Only include the first 10 and last 10 publish results to keep the output manageable
    let trimmedResults = publishResults;
    if (publishResults.length > 20) {
      const first10 = publishResults.slice(0, 10);
      const last10 = publishResults.slice(-10);
      trimmedResults = [
        ...first10,
        { note: `... ${publishResults.length - 20} more results omitted ...` },
        ...last10
      ];
    }

    return {
      success: true,
      message: `Created and published ${successCount} of ${users.length} kind 30382 events for users`,
      publishSummary: {
        total: users.length,
        successful: successCount,
        failed: failureCount,
        byRelay: {
          [primaryRelayUrl]: {
            successful: successCount,
            failed: failureCount
          }
        }
      },
      results: trimmedResults
    };
  } catch (error) {
    console.error('Error in main function:', error);
    execSync(`echo "$(date): Error in main function: ${error.message}" >> ${LOG_FILE}`);
    return {
      success: false,
      message: `Error: ${error.message}`
    };
  } finally {
    // Close the Neo4j driver
    await driver.close();
  }
}

// Run the main function
main()
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (result.success) {
      execSync(`echo "$(date): Successfully completed publish_kind30382.js" >> ${LOG_FILE}`);
      process.exit(0);
    } else {
      execSync(`echo "$(date): Failed to complete publish_kind30382.js: ${result.message}" >> ${LOG_FILE}`);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    execSync(`echo "$(date): Unhandled error in publish_kind30382.js: ${error.message}" >> ${LOG_FILE}`);
    process.exit(1);
  });
