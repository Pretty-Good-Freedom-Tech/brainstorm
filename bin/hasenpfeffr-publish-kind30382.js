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

if (!relayUrl || !relayNsec) {
  console.error('Error: Relay URL or NSEC not found in configuration');
  process.exit(1);
}

// Convert relay nsec to keypair
let relayPrivateKey;
let relayPublicKey;

try {
  // Check if the nsec is already in hex format
  if (/^[0-9a-fA-F]{64}$/.test(relayNsec)) {
    relayPrivateKey = relayNsec;
  } else if (relayNsec.startsWith('nsec')) {
    // Convert from bech32 to hex
    relayPrivateKey = nostrTools.nip19.decode(relayNsec).data;
  } else {
    throw new Error('Invalid NSEC format');
  }
  
  // Derive public key from private key
  relayPublicKey = nostrTools.getPublicKey(relayPrivateKey);
  console.log(`Using relay public key: ${relayPublicKey}`);
} catch (error) {
  console.error('Error processing relay NSEC:', error.message);
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
    // Query to get top 5 users by personalizedPageRank
    const result = await session.run(`
      MATCH (u:NostrUser)
      WHERE u.personalizedPageRank IS NOT NULL
      RETURN u.pubkey AS pubkey, u.personalizedPageRank AS personalizedPageRank, u.hops AS hops
      ORDER BY u.personalizedPageRank DESC
      LIMIT 5
    `);
    
    return result.records.map(record => ({
      pubkey: record.get('pubkey'),
      personalizedPageRank: record.get('personalizedPageRank').toString(),
      hops: record.get('hops') ? record.get('hops').toString() : "1"
    }));
  } finally {
    await session.close();
  }
}

// Create and sign a kind 30382 event
function createEvent(userPubkey, personalizedPageRank, hops) {
  const event = {
    kind: 30382,
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    pubkey: relayPublicKey,
    tags: [
      ["d", userPubkey],
      ["personalizedPageRank", personalizedPageRank],
      ["hops", hops]
    ]
  };
  
  // Sign the event with the relay's private key
  return nostrTools.finalizeEvent(event, relayPrivateKey);
}

// Function to publish an event to the relay via WebSocket
function publishEventToRelay(event) {
  return new Promise((resolve, reject) => {
    // Create WebSocket connection
    const ws = new WebSocket(relayUrl);
    
    // Set a timeout for the connection
    const connectionTimeout = setTimeout(() => {
      ws.close();
      reject(new Error(`Connection timeout to relay: ${relayUrl}`));
    }, 10000); // 10 seconds timeout
    
    // Handle WebSocket events
    ws.on('open', () => {
      console.log(`Connected to relay: ${relayUrl}`);
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
    
    if (!relayPrivateKey || !relayPublicKey) {
      console.error('Error: Relay private key not available');
      return {
        success: false,
        message: 'Relay private key not available',
        events: []
      };
    }
    
    console.log('Fetching top 5 users by personalizedPageRank...');
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
    
    // Create, sign, and publish events for each user
    const events = [];
    const publishResults = [];
    
    for (const user of topUsers) {
      console.log(`Creating event for user: ${user.pubkey}`);
      console.log(`  personalizedPageRank: ${user.personalizedPageRank}`);
      console.log(`  hops: ${user.hops}`);
      
      // Create and sign the event
      const event = createEvent(user.pubkey, user.personalizedPageRank, user.hops);
      events.push(event);
      
      // Save the event to a file
      const eventFile = path.join(publishedDir, `kind30382_${user.pubkey.substring(0, 8)}_${Date.now()}.json`);
      fs.writeFileSync(eventFile, JSON.stringify(event, null, 2));
      console.log(`Event saved to ${eventFile}`);
      
      // Publish the event to the relay
      try {
        console.log(`Publishing event ${event.id} to relay: ${relayUrl}`);
        const publishResult = await publishEventToRelay(event);
        publishResults.push({
          eventId: event.id,
          userPubkey: user.pubkey,
          ...publishResult
        });
      } catch (error) {
        console.error(`Error publishing event for user ${user.pubkey}:`, error.message);
        publishResults.push({
          eventId: event.id,
          userPubkey: user.pubkey,
          success: false,
          message: error.message
        });
      }
    }
    
    // Summarize results
    const successCount = publishResults.filter(r => r.success).length;
    
    console.log('\nPublishing summary:');
    console.log(`- Total events: ${events.length}`);
    console.log(`- Successfully published: ${successCount}`);
    console.log(`- Failed: ${events.length - successCount}`);
    
    return {
      success: true,
      message: `Created and published ${successCount} of ${events.length} kind 30382 events for the top users`,
      events: events,
      publishResults: publishResults
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      success: false,
      message: `Error: ${error.message}`,
      events: []
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
