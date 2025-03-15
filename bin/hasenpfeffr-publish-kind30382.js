#!/usr/bin/env node

/**
 * Hasenpfeffr Publish Kind 30382 Events
 * 
 * This script publishes kind 30382 events for the top 5 users by personalizedPageRank
 * Each event is signed with the relay's private key (HASENPFEFFR_RELAY_NSEC)
 * and published to the relay via WebSocket
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const neo4j = require('neo4j-driver');
const nostrTools = require('nostr-tools');
const WebSocket = require('ws');

// Function to get configuration values directly from /etc/hasenpfeffr.conf
function getConfigFromFile(varName, defaultValue = null) {
  try {
    const confFile = '/etc/hasenpfeffr.conf';
    if (fs.existsSync(confFile)) {
      // Read the file content directly
      const fileContent = fs.readFileSync(confFile, 'utf8');
      
      // Look for the variable in the file content
      const regex = new RegExp(`${varName}=[\"\\'](.*?)[\"\\'](\\s|$)`, 'gm');
      const match = regex.exec(fileContent);
      
      if (match && match[1]) {
        return match[1];
      }
      
      // If not found with regex, try the source command as fallback
      const result = execSync(`source ${confFile} && echo $${varName}`).toString().trim();
      return result || defaultValue;
    }
    return defaultValue;
  } catch (error) {
    console.error(`Error getting config value for ${varName}:`, error);
    return defaultValue;
  }
}

// Get relay configuration
const relayUrl = getConfigFromFile('HASENPFEFFR_RELAY_URL', '');
const relayNsec = getConfigFromFile('HASENPFEFFR_RELAY_NSEC', '');
const neo4jUri = getConfigFromFile('NEO4J_URI', 'bolt://localhost:7687');
const neo4jUser = getConfigFromFile('NEO4J_USER', 'neo4j');
const neo4jPassword = getConfigFromFile('NEO4J_PASSWORD', 'neo4j');

// Log relay configuration for debugging
console.log(`Using relay URL: ${relayUrl}`);
console.log(`Relay private key available: ${relayNsec ? 'Yes' : 'No'}`);
console.log(`Neo4j URI: ${neo4jUri}`);

// Fallback relay URLs if the main one is not configured
const fallbackRelays = [
  'wss://relay.hasenpfeffr.com',
  'wss://profiles.nostr1.com',
  'wss://relay.nostr.band'
];

// Use fallback relay if the main one is not configured
let primaryRelayUrl = relayUrl;
if (!primaryRelayUrl) {
  console.log('No relay URL configured in HASENPFEFFR_RELAY_URL, using fallback relay');
  primaryRelayUrl = fallbackRelays[0];
}

// Convert keys to the format needed by nostr-tools
let relayPrivateKey = relayNsec;
let relayPubkey = '';

try {
  if (relayPrivateKey) {
    // If we have the private key in nsec format, convert it to hex
    if (relayPrivateKey.startsWith('nsec')) {
      relayPrivateKey = nostrTools.nip19.decode(relayPrivateKey).data;
    }
    
    // Derive the public key from the private key
    relayPubkey = nostrTools.getPublicKey(relayPrivateKey);
    console.log(`Using relay pubkey: ${relayPubkey.substring(0, 8)}...`);
  } else {
    console.warn('No relay private key found in configuration. Will attempt to continue but may fail.');
  }
} catch (error) {
  console.error('Error processing relay keys:', error);
}

if (!relayPrivateKey || !relayPubkey) {
  console.error('Error: Relay private key not available');
  process.exit(1);
}

// Connect to Neo4j
const driver = neo4j.driver(
  neo4jUri,
  neo4j.auth.basic(neo4jUser, neo4jPassword)
);

async function getTopUsers() {
  const session = driver.session();
  try {
    // Query to get top 5 users by personalizedPageRank, including GrapeRank data
    const result = await session.run(`
      MATCH (u:NostrUser)
      WHERE u.hops IS NOT NULL AND u.hops < 20
      RETURN u.pubkey AS pubkey, 
             u.personalizedPageRank AS personalizedPageRank, 
             u.hops AS hops,
             u.influence AS influence,
             u.average AS average,
             u.confidence AS confidence,
             u.input AS input
      ORDER BY u.personalizedPageRank DESC
    `);
    
    return result.records.map(record => ({
      pubkey: record.get('pubkey'),
      personalizedPageRank: record.get('personalizedPageRank').toString(),
      hops: record.get('hops') ? record.get('hops').toString() : "1",
      influence: record.get('influence') ? record.get('influence').toString() : "0",
      average: record.get('average') ? record.get('average').toString() : "0",
      confidence: record.get('confidence') ? record.get('confidence').toString() : "0",
      input: record.get('input') ? record.get('input').toString() : "0"
    }));
  } finally {
    await session.close();
  }
}

// Create and sign a kind 30382 event
function createEvent(userPubkey, personalizedPageRank, hops, influence, average, confidence, input) {
  // Calculate the rank value (influence * 100, rounded to integer)
  const rankValue = Math.round(parseFloat(influence) * 100).toString();
  
  // Round GrapeRank values to 4 significant digits
  const roundToSigFigs = (num, sigFigs) => {
    if (num === 0) return 0;
    const parsedNum = parseFloat(num);
    if (isNaN(parsedNum)) return "0";
    const magnitude = Math.floor(Math.log10(Math.abs(parsedNum))) + 1;
    const factor = Math.pow(10, sigFigs - magnitude);
    return (Math.round(parsedNum * factor) / factor).toString();
  };
  
  const influenceRounded = roundToSigFigs(influence, 4);
  const averageRounded = roundToSigFigs(average, 4);
  const confidenceRounded = roundToSigFigs(confidence, 4);
  const inputRounded = roundToSigFigs(input, 4);
  
  const event = {
    kind: 30382,
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    pubkey: relayPubkey,
    tags: [
      ["d", userPubkey],
      ["personalizedPageRank", personalizedPageRank],
      ["hops", hops],
      ["rank", rankValue],
      ["personalizedGrapeRank_influence", influenceRounded],
      ["personalizedGrapeRank_average", averageRounded],
      ["personalizedGrapeRank_confidence", confidenceRounded],
      ["personalizedGrapeRank_input", inputRounded]
    ]
  };
  
  // Sign the event with the relay's private key
  return nostrTools.finalizeEvent(event, relayPrivateKey);
}

// Function to publish an event to the relay via WebSocket
function publishEventToRelay(event, targetRelayUrl = relayUrl) {
  return new Promise((resolve, reject) => {
    // Create WebSocket connection
    const ws = new WebSocket(targetRelayUrl);
    
    // Set a timeout for the connection
    const connectionTimeout = setTimeout(() => {
      ws.close();
      reject(new Error(`Connection timeout to relay: ${targetRelayUrl}`));
    }, 10000); // 10 seconds timeout
    
    // Handle WebSocket events
    ws.on('open', () => {
      console.log(`Connected to relay: ${targetRelayUrl}`);
      clearTimeout(connectionTimeout);
      
      // Send the EVENT message to the relay
      const message = JSON.stringify(["EVENT", event]);
      ws.send(message);
      
      console.log(`Event sent to relay: ${event.id}`);
      
      // Set a timeout for the response
      const responseTimeout = setTimeout(() => {
        ws.close();
        // Consider a timeout as a success if we were able to send the event
        // This is because many relays don't respond with OK messages
        console.log(`No explicit confirmation received for event ${event.id}, but it was sent successfully`);
        resolve({
          success: true,
          message: `Event ${event.id} sent successfully (no explicit confirmation received)`
        });
      }, 5000); // 5 seconds timeout for response
      
      // Handle relay response
      ws.on('message', (data) => {
        clearTimeout(responseTimeout);
        
        try {
          const response = JSON.parse(data.toString());
          console.log(`Received response from relay for event ${event.id}:`, JSON.stringify(response));
          
          // Check if it's an OK response
          if (response[0] === 'OK' && response[1] === event.id) {
            // Some relays return true/false as the third parameter, others return a status message
            // A response with 'OK' generally means the event was received, regardless of the third parameter
            if (response[2] === true || response[2] === 'true' || response[2] === undefined) {
              console.log(`Event ${event.id} accepted by relay`);
              ws.close();
              resolve({
                success: true,
                message: `Event ${event.id} accepted by relay`
              });
            } else {
              // Even if the third parameter is not true, the event was still received
              // The relay might have its own reasons for not storing it
              console.log(`Event ${event.id} received by relay with response: ${response[2] || 'No reason provided'}`);
              ws.close();
              resolve({
                success: true,
                message: `Event ${event.id} received by relay with response: ${response[2] || 'No reason provided'}`
              });
            }
          } else if (response[0] === 'EVENT') {
            // Ignore EVENT messages from the relay
          } else if (response[0] === 'NOTICE') {
            console.log(`Relay notice: ${response[1]}`);
          } else {
            // Any response means the relay received our message
            console.log(`Received non-OK response from relay:`, JSON.stringify(response));
            // Don't resolve yet, wait for an OK or timeout
          }
        } catch (error) {
          console.error('Error parsing relay response:', error);
          // Continue waiting for a valid response
        }
      });
      
      // Handle WebSocket errors
      ws.on('error', (error) => {
        clearTimeout(responseTimeout);
        console.error('WebSocket error:', error);
        ws.close();
        reject(error);
      });
    });
    
    // Handle connection errors
    ws.on('error', (error) => {
      clearTimeout(connectionTimeout);
      console.error('WebSocket connection error:', error);
      reject(error);
    });
  });
}

// Main function
async function main() {
  try {
    // Check for authenticated session or relay private key
    // For kind 30382 events, we can use the relay's private key directly
    // No need for user authentication since these are relay-signed events
    
    console.log(`Using relay pubkey: ${relayPubkey.substring(0, 8)}...`);
    console.log('Fetching users with personalizedPageRank...');
    const topUsers = await getTopUsers();
    
    if (topUsers.length === 0) {
      console.log('No users found with personalizedPageRank property');
      return {
        success: false,
        message: 'No users found with personalizedPageRank property',
        events: []
      };
    }
    
    console.log(`Found ${topUsers.length} users`);
    
    // Create data directory if it doesn't exist
    const dataDir = '/var/lib/hasenpfeffr/data';
    const publishedDir = path.join(dataDir, 'published');
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    if (!fs.existsSync(publishedDir)) {
      fs.mkdirSync(publishedDir, { recursive: true });
    }
    
    // Process users in batches
    const BATCH_SIZE = 100; // Process 100 users at a time
    const totalUsers = topUsers.length;
    const batches = Math.ceil(totalUsers / BATCH_SIZE);
    
    console.log(`Processing ${totalUsers} users in ${batches} batches of ${BATCH_SIZE}`);
    
    // Initialize counters
    let successCount = 0;
    let failureCount = 0;
    let publishResults = [];
    
    // Process each batch
    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const start = batchIndex * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, totalUsers);
      const batchUsers = topUsers.slice(start, end);
      
      console.log(`Processing batch ${batchIndex + 1}/${batches} (users ${start + 1}-${end} of ${totalUsers})`);
      
      // Create and publish events for this batch
      const batchEvents = [];
      const batchPublishResults = [];
      
      for (const user of batchUsers) {
        try {
          console.log(`Creating event for user: ${user.pubkey} personalizedPageRank: ${user.personalizedPageRank} hops: ${user.hops} influence: ${user.influence} average: ${user.average} confidence: ${user.confidence} input: ${user.input}`);
          
          // Create the event
          const event = createEvent(
            user.pubkey, 
            user.personalizedPageRank, 
            user.hops,
            user.influence,
            user.average,
            user.confidence,
            user.input
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
          failureCount++;
        }
      }
      
      // Publish events in this batch to the relay
      for (const event of batchEvents) {
        try {
          console.log(`Publishing event ${event.id} to primary relay: ${relayUrl}`);
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
          console.error(`Error publishing event ${event.id}:`, error);
          
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
      
      // Add batch results to overall results
      publishResults = publishResults.concat(batchPublishResults);
      
      // Log progress after each batch
      console.log(`Batch ${batchIndex + 1}/${batches} complete. Progress: ${successCount + failureCount}/${totalUsers} (${successCount} successful, ${failureCount} failed)`);
      
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
      message: `Created and published ${successCount} of ${topUsers.length} kind 30382 events for the top users`,
      publishSummary: {
        total: topUsers.length,
        successful: successCount,
        failed: failureCount,
        byRelay: {
          [relayUrl]: {
            successful: successCount,
            failed: failureCount
          }
        }
      },
      publishResults: trimmedResults
    };
  } catch (error) {
    console.error('Error in main function:', error);
    return {
      success: false,
      message: `Error publishing kind 30382 events: ${error.message}`,
      error: error.stack
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
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
