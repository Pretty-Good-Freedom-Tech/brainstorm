#!/usr/bin/env node

/**
 * Hasenpfeffr Publish Kind 10040 Event
 * 
 * This script creates and publishes a kind 10040 event for NIP-85 trusted assertions
 * to the configured relays.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
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
const relayPubkey = getConfigFromFile('HASENPFEFFR_RELAY_PUBKEY', '');
const relayNsec = getConfigFromFile('HASENPFEFFR_RELAY_NSEC', '');
const logDir = getConfigFromFile('HASENPFEFFR_LOG_DIR', '/var/log/hasenpfeffr');

// Get friend relays from config
let friendRelays = [];
try {
  const friendRelaysStr = getConfigFromFile('HASENPFEFFR_DEFAULT_FRIEND_RELAYS', '[]');
  // Remove any surrounding quotes (single or double) before parsing
  const cleanStr = friendRelaysStr.replace(/^['"]|['"]$/g, '');
  friendRelays = JSON.parse(cleanStr);
  if (!Array.isArray(friendRelays)) {
    friendRelays = [];
  }
} catch (error) {
  console.error('Error parsing friend relays from config:', error);
  execSync(`echo "$(date): Error parsing friend relays from config: ${error.message}" >> ${logDir}/publishNip85.log`);
  friendRelays = [];
}

// Add main relay to friend relays if not already included
if (relayUrl && !friendRelays.includes(relayUrl)) {
  friendRelays.unshift(relayUrl);
}

// Fallback relays if none are configured
if (friendRelays.length === 0) {
  friendRelays = [
    'wss://relay.hasenpfeffr.com',
    'wss://profiles.nostr1.com',
    'wss://relay.nostr.band',
    'wss://relay.damus.io'
  ];
}

// Log configuration
console.log(`Using relay URL: ${relayUrl}`);
console.log(`Using relay pubkey: ${relayPubkey}`);
console.log(`Friend relays: ${friendRelays.join(', ')}`);
execSync(`echo "$(date): Using relay URL: ${relayUrl}" >> ${logDir}/publishNip85.log`);
execSync(`echo "$(date): Using relay pubkey: ${relayPubkey}" >> ${logDir}/publishNip85.log`);
execSync(`echo "$(date): Friend relays: ${friendRelays.join(', ')}" >> ${logDir}/publishNip85.log`);

// Convert keys to the format needed by nostr-tools
let relayPrivateKey = relayNsec;
let derivedPubkey = '';

try {
  if (relayPrivateKey) {
    // If we have the private key in nsec format, convert it to hex
    if (relayPrivateKey.startsWith('nsec')) {
      relayPrivateKey = nostrTools.nip19.decode(relayPrivateKey).data;
    }
    
    // Derive the public key from the private key
    derivedPubkey = nostrTools.getPublicKey(relayPrivateKey);
    console.log(`Derived pubkey from private key: ${derivedPubkey.substring(0, 8)}...`);
    
    // Verify that the derived pubkey matches the configured pubkey
    if (relayPubkey && derivedPubkey !== relayPubkey) {
      console.warn(`Warning: Derived pubkey ${derivedPubkey} does not match configured pubkey ${relayPubkey}`);
    }
  } else {
    console.error('No relay private key found in configuration');
    execSync(`echo "$(date): Error: No relay private key found in configuration" >> ${logDir}/publishNip85.log`);
    process.exit(1);
  }
} catch (error) {
  console.error('Error processing relay keys:', error);
  execSync(`echo "$(date): Error processing relay keys: ${error.message}" >> ${logDir}/publishNip85.log`);
  process.exit(1);
}

// Create the kind 10040 event
function createKind10040Event() {
  const event = {
    kind: 10040,
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    tags: [
      [
        "30382:rank",
        relayPubkey,
        relayUrl
      ],
      [
        "30382:personalizedGrapeRank_influence",
        relayPubkey,
        relayUrl
      ],
      [
        "30382:personalizedGrapeRank_average",
        relayPubkey,
        relayUrl
      ],
      [
        "30382:personalizedGrapeRank_confidence",
        relayPubkey,
        relayUrl
      ],
      [
        "30382:personalizedGrapeRank_input",
        relayPubkey,
        relayUrl
      ],
      [
        "30382:personalizedPageRank",
        relayPubkey,
        relayUrl
      ],
      [
        "30382:hops",
        relayPubkey,
        relayUrl
      ]
    ],
    pubkey: relayPubkey
  };
  
  return event;
}

// Sign an event with the relay's private key
function signEvent(event) {
  // Calculate the event ID using getEventHash
  event.id = nostrTools.getEventHash(event);
  
  // Sign the event with the private key
  const signature = nostrTools.signEvent(event, relayPrivateKey);
  event.sig = signature;
  
  return event;
}

// Function to publish an event to a relay via WebSocket
function publishEventToRelay(event, targetRelayUrl) {
  return new Promise((resolve, reject) => {
    console.log(`Publishing event ${event.id.substring(0, 8)}... to ${targetRelayUrl}`);
    execSync(`echo "$(date): Publishing event ${event.id.substring(0, 8)}... to ${targetRelayUrl}" >> ${logDir}/publishNip85.log`);
    
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
          execSync(`echo "$(date): Timeout publishing to ${targetRelayUrl}" >> ${logDir}/publishNip85.log`);
          resolve({
            success: false,
            message: `Timeout publishing to ${targetRelayUrl}`,
            relay: targetRelayUrl
          });
        }
      }, 10000); // 10 second timeout
      
      ws.on('open', () => {
        console.log(`Connected to ${targetRelayUrl}`);
        execSync(`echo "$(date): Connected to ${targetRelayUrl}" >> ${logDir}/publishNip85.log`);
        
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
              console.log(`Event ${event.id.substring(0, 8)}... published successfully to ${targetRelayUrl}`);
              execSync(`echo "$(date): Event ${event.id.substring(0, 8)}... published successfully to ${targetRelayUrl}" >> ${logDir}/publishNip85.log`);
              resolve({
                success: true,
                message: `Event ${event.id.substring(0, 8)}... published successfully`,
                relay: targetRelayUrl
              });
            }
          } else if (message[0] === 'NOTICE') {
            console.log(`Notice from relay ${targetRelayUrl}: ${message[1]}`);
            execSync(`echo "$(date): Notice from relay ${targetRelayUrl}: ${message[1]}" >> ${logDir}/publishNip85.log`);
          } else if (message[0] === 'OK' && message[2] === false) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              ws.close();
              console.log(`Error publishing event to ${targetRelayUrl}: ${message[1]}`);
              execSync(`echo "$(date): Error publishing event to ${targetRelayUrl}: ${message[1]}" >> ${logDir}/publishNip85.log`);
              resolve({
                success: false,
                message: `Error: ${message[1]}`,
                relay: targetRelayUrl
              });
            }
          }
        } catch (error) {
          console.error(`Error parsing message from ${targetRelayUrl}:`, error);
          execSync(`echo "$(date): Error parsing message from ${targetRelayUrl}: ${error.message}" >> ${logDir}/publishNip85.log`);
        }
      });
      
      ws.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.error(`WebSocket error with ${targetRelayUrl}:`, error.message);
          execSync(`echo "$(date): WebSocket error with ${targetRelayUrl}: ${error.message}" >> ${logDir}/publishNip85.log`);
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
          console.log(`Connection closed with ${targetRelayUrl} before receiving confirmation`);
          execSync(`echo "$(date): Connection closed with ${targetRelayUrl} before receiving confirmation" >> ${logDir}/publishNip85.log`);
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
        console.error(`Error connecting to ${targetRelayUrl}:`, error.message);
        execSync(`echo "$(date): Error connecting to ${targetRelayUrl}: ${error.message}" >> ${logDir}/publishNip85.log`);
        resolve({
          success: false,
          message: `Error connecting: ${error.message}`,
          relay: targetRelayUrl
        });
      }
    }
  });
}

// Main function to create and publish the kind 10040 event
async function main() {
  try {
    console.log('Creating kind 10040 event...');
    execSync(`echo "$(date): Creating kind 10040 event..." >> ${logDir}/publishNip85.log`);
    
    // Create the event
    const event = createKind10040Event();
    
    // Sign the event
    const signedEvent = signEvent(event);
    
    console.log('Kind 10040 event created and signed:');
    console.log(JSON.stringify(signedEvent, null, 2));
    execSync(`echo "$(date): Kind 10040 event created with ID: ${signedEvent.id}" >> ${logDir}/publishNip85.log`);
    
    // Save the event to a file
    const dataDir = '/var/lib/hasenpfeffr/data';
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const eventFile = path.join(dataDir, 'kind10040_event.json');
    fs.writeFileSync(eventFile, JSON.stringify(signedEvent, null, 2));
    console.log(`Event saved to ${eventFile}`);
    execSync(`echo "$(date): Event saved to ${eventFile}" >> ${logDir}/publishNip85.log`);
    
    // Publish the event to all friend relays
    console.log(`Publishing event to ${friendRelays.length} relays...`);
    execSync(`echo "$(date): Publishing event to ${friendRelays.length} relays..." >> ${logDir}/publishNip85.log`);
    
    const results = [];
    
    for (const relay of friendRelays) {
      try {
        const result = await publishEventToRelay(signedEvent, relay);
        results.push(result);
      } catch (error) {
        console.error(`Error publishing to ${relay}:`, error);
        execSync(`echo "$(date): Error publishing to ${relay}: ${error.message}" >> ${logDir}/publishNip85.log`);
        results.push({
          success: false,
          message: `Error: ${error.message}`,
          relay
        });
      }
    }
    
    // Summarize results
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    console.log('Publishing summary:');
    console.log(`- Total relays: ${results.length}`);
    console.log(`- Successfully published: ${successCount}`);
    console.log(`- Failed: ${failureCount}`);
    
    execSync(`echo "$(date): Publishing summary: Total relays: ${results.length}, Successfully published: ${successCount}, Failed: ${failureCount}" >> ${logDir}/publishNip85.log`);
    
    return {
      success: successCount > 0,
      message: `Published kind 10040 event to ${successCount} of ${results.length} relays`,
      results
    };
  } catch (error) {
    console.error('Error in main function:', error);
    execSync(`echo "$(date): Error in main function: ${error.message}" >> ${logDir}/publishNip85.log`);
    return {
      success: false,
      message: `Error: ${error.message}`
    };
  }
}

// Run the main function
main()
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (result.success) {
      execSync(`echo "$(date): Successfully published kind 10040 event" >> ${logDir}/publishNip85.log`);
      process.exit(0);
    } else {
      execSync(`echo "$(date): Failed to publish kind 10040 event: ${result.message}" >> ${logDir}/publishNip85.log`);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    execSync(`echo "$(date): Unhandled error: ${error.message}" >> ${logDir}/publishNip85.log`);
    process.exit(1);
  });
