#!/usr/bin/env node

/**
 * Hasenpfeffr Publish Kind 30382 Events
 * 
 * This script publishes kind 30382 events for the top 5 users by personalizedPageRank
 * Each event is signed with the relay's private key (HASENPFEFFR_RELAY_NSEC)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const neo4j = require('neo4j-driver');
const nostrTools = require('nostr-tools');

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
  return nostrTools.finishEvent(event, relayPrivateKey);
}

// Main function
async function main() {
  try {
    console.log('Fetching top 5 users by personalizedPageRank...');
    const topUsers = await getTopUsers();
    
    if (topUsers.length === 0) {
      console.log('No users found with personalizedPageRank property');
      return;
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
    
    // Create and sign events for each user
    const events = [];
    for (const user of topUsers) {
      console.log(`Creating event for user: ${user.pubkey}`);
      console.log(`  personalizedPageRank: ${user.personalizedPageRank}`);
      console.log(`  hops: ${user.hops}`);
      
      const event = createEvent(user.pubkey, user.personalizedPageRank, user.hops);
      events.push(event);
      
      // Save the event to a file
      const eventFile = path.join(publishedDir, `kind30382_${user.pubkey.substring(0, 8)}_${Date.now()}.json`);
      fs.writeFileSync(eventFile, JSON.stringify(event, null, 2));
      console.log(`Event saved to ${eventFile}`);
    }
    
    console.log('\nEvents created and signed successfully');
    console.log(`Events would be published to relay: ${relayUrl}`);
    
    // In a real implementation, we would use WebSocket to publish to the relay
    // For now, we'll just save the events to files
    
    return {
      success: true,
      message: `Created and signed ${events.length} kind 30382 events for the top users`,
      events: events
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
