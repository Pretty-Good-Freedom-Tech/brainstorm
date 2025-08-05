#!/usr/bin/env node

/**
 * Brainstorm Create and Publish Kind 10040 Event
 * 
 * This script creates, signs, and publishes a kind 10040 event for NIP-85 trusted assertions
 * directly to the configured relay using secure relay keys.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const WebSocket = require('ws');
const nostrTools = require('nostr-tools');
const { getConfigFromFile } = require('../src/utils/config');
const { getCustomerRelayKeys } = require('../src/utils/customerRelayKeys');

// Get relay configuration
const relayUrl = getConfigFromFile('BRAINSTORM_RELAY_URL', '');

// get customer pubkey if one is provided as an argument
const customerPubkey = process.argv[2];

if (!relayUrl) {
  console.error('Error: Relay URL not found in configuration');
  process.exit(1);
}

// Main async function to handle the process
async function createAndPublishKind10040() {
  try {
    console.log('Starting Kind 10040 event creation and publishing...');
    
    // Get relay private key from secure storage
    console.log(`Fetching secure relay keys${customerPubkey ? ` for customer ${customerPubkey}` : ' for owner'}...`);
    const relayKeys = await getCustomerRelayKeys(customerPubkey);
    const relayNsec = relayKeys ? relayKeys.nsec : null;
    
    console.log(`Relay private key available: ${relayNsec ? 'Yes' : 'No'}`);
    
    if (!relayNsec) {
      const errorMsg = `Error: No relay private key found${customerPubkey ? ` for customer ${customerPubkey}` : ' for owner'}`;
      console.error(errorMsg);
      process.exit(1);
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
    } catch (error) {
      const errorMsg = `Error processing relay keys: ${error.message}`;
      console.error(errorMsg);
      process.exit(1);
    }

    // Create the kind 10040 event
    const eventTemplate = {
      kind: 10040,
      pubkey: relayPubkey,
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
          "30382:verifiedFollowersCount",
          relayPubkey,
          relayUrl
        ],
        [
          "30382:verifiedMutersCount",
          relayPubkey,
          relayUrl
        ],
        [
          "30382:verifiedReportersCount",
          relayPubkey,
          relayUrl
        ],
        [
          "30382:hops",
          relayPubkey,
          relayUrl
        ]
      ]
    };
    
    // Sign the event using finalizeEvent
    console.log('Signing Kind 10040 event...');
    const signedEvent = nostrTools.finalizeEvent(eventTemplate, relayPrivateKey);
    
    console.log(`Event created with ID: ${signedEvent.id}`);
    console.log('Event details:');
    console.log(JSON.stringify(signedEvent, null, 2));

    // Publish the event to the relay
    console.log(`Publishing event to relay: ${relayUrl}`);
    const publishResult = await publishEventToRelay(signedEvent, relayUrl);
    
    if (publishResult.success) {
      console.log('✅ Event published successfully!');
      console.log(`Event ID: ${signedEvent.id}`);
      
      // Save the published event to a file for record keeping
      const dataDir = '/var/lib/brainstorm/data';
      const publishedDir = path.join(dataDir, 'published');
      
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      if (!fs.existsSync(publishedDir)) {
        fs.mkdirSync(publishedDir, { recursive: true });
      }
      
      const timestamp = Date.now();
      const filename = `kind10040_${customerPubkey ? customerPubkey.substring(0, 8) : 'owner'}_${timestamp}.json`;
      const filePath = path.join(publishedDir, filename);
      
      fs.writeFileSync(filePath, JSON.stringify(signedEvent, null, 2));
      console.log(`Event saved to ${filePath}`);
    } else {
      console.error('❌ Failed to publish event:', publishResult.message);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Error creating and publishing Kind 10040 event:', error);
    process.exit(1);
  }
}

// Function to publish an event to the relay via WebSocket
function publishEventToRelay(event, targetRelayUrl) {
  return new Promise((resolve, reject) => {
    console.log(`Publishing event ${event.id.substring(0, 8)}... to ${targetRelayUrl}`);
    
    let resolved = false;
    let timeout;
    
    try {
      const ws = new WebSocket(targetRelayUrl);
      
      // Set up timeout
      timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          ws.close();
          resolve({
            success: false,
            message: 'Timeout: No response from relay within 10 seconds'
          });
        }
      }, 10000);
      
      ws.on('open', () => {
        console.log(`Connected to relay: ${targetRelayUrl}`);
        
        // Send the event
        const message = JSON.stringify(['EVENT', event]);
        ws.send(message);
        console.log('Event sent to relay');
      });
      
      ws.on('message', (data) => {
        if (resolved) return;
        
        try {
          const response = JSON.parse(data.toString());
          console.log('Relay response:', response);
          
          // Check if this is an OK response for our event
          if (response[0] === 'OK' && response[1] === event.id) {
            resolved = true;
            clearTimeout(timeout);
            ws.close();
            
            if (response[2] === true) {
              resolve({
                success: true,
                message: 'Event accepted by relay'
              });
            } else {
              resolve({
                success: false,
                message: response[3] || 'Event rejected by relay'
              });
            }
          }
        } catch (error) {
          console.error('Error parsing relay response:', error);
        }
      });
      
      ws.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            success: false,
            message: `WebSocket error: ${error.message}`
          });
        }
      });
      
      ws.on('close', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            success: false,
            message: 'Connection closed without confirmation'
          });
        }
      });
      
    } catch (error) {
      if (timeout) clearTimeout(timeout);
      resolve({
        success: false,
        message: `Connection error: ${error.message}`
      });
    }
  });
}

// Run the main function
createAndPublishKind10040().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
