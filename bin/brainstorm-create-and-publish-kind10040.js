#!/usr/bin/env node

/**
 * Brainstorm Publish Kind 10040 Event
 * 
 * This script publishes an already-signed kind 10040 event for NIP-85 trusted assertions
 * to the configured relay. The event must be signed by the user using NIP-07 browser extension.
 * 
 * Usage: 
 *   - With signed event file: node brainstorm-create-and-publish-kind10040.js /path/to/signed-event.json
 *   - With customer pubkey: node brainstorm-create-and-publish-kind10040.js <customer_pubkey>
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const WebSocket = require('ws');
const nostrTools = require('nostr-tools');
const { getConfigFromFile } = require('../src/utils/config');

// Get relay configuration
const brainstormRelayUrl = getConfigFromFile('BRAINSTORM_RELAY_URL', '');
const ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY', '');
const nip85RelayUrls = getConfigFromFile('BRAINSTORM_NIP85_RELAYS', "wss://nip85.brainstorm.world,wss://nip85.grapevine.network,wss://nip85.nostr1.com")
const popularGeneralPurposeRelayUrls = getConfigFromFile('BRAINSTORM_POPULAR_GENERAL_PURPOSE_RELAYS', "wss://relay.nostr.band,wss://relay.damus.io,wss://relay.primal.net")

const aBrainstormRelayUrl = [brainstormRelayUrl];
const aNip85RelayUrls = nip85RelayUrls.split(',').map(url => url.trim());
const aPopularGeneralPurposeRelayUrls = popularGeneralPurposeRelayUrls.split(',').map(url => url.trim());

// publish kind 10040 everywhere: this Brainstorm instance, NIP-85 relays, and popular general purpose relays
const aRelayUrls = [...aBrainstormRelayUrl, ...aNip85RelayUrls, ...aPopularGeneralPurposeRelayUrls];

if (!aRelayUrls.length) {
  console.error('Error: Relay URLs not found in configuration');
  process.exit(1);
}

// Get command line arguments
const arg = process.argv[2];
let eventFile = null;
let customerPubkey = null;

// Determine if argument is a file path or customer pubkey
if (arg) {
  if (fs.existsSync(arg) && arg.endsWith('.json')) {
    eventFile = arg;
    console.log(`Using provided signed event file: ${eventFile}`);
  } else {
    customerPubkey = arg;
    console.log(`Processing for customer: ${customerPubkey.substring(0, 8)}...`);
  }
}

// Main async function to handle the process
async function publishKind10040() {
  try {
    console.log('Starting Kind 10040 event publishing...');
    
    // Find the event file if not provided
    if (!eventFile) {
      eventFile = await findEventFile(customerPubkey);
    }
    
    if (!eventFile || !fs.existsSync(eventFile)) {
      console.error('Error: No signed Kind 10040 event file found');
      console.error('The event must be signed by the user using NIP-07 browser extension first.');
      process.exit(1);
    }
    
    console.log(`Reading signed event from: ${eventFile}`);
    
    // Read and parse the signed event
    const eventData = fs.readFileSync(eventFile, 'utf8');
    let event;
    
    try {
      event = JSON.parse(eventData);
    } catch (error) {
      console.error('Error parsing event JSON:', error);
      process.exit(1);
    }
    
    // Verify the event is signed
    if (!event.sig || !event.id) {
      console.error('Error: Event is not signed. The event must be signed by the user using NIP-07.');
      process.exit(1);
    }
    
    // Verify the event signature
    console.log('Verifying event signature...');
    const verified = nostrTools.verifyEvent(event);
    
    if (!verified) {
      console.error('Error: Event signature verification failed');
      process.exit(1);
    }
    
    console.log('✅ Event signature verified successfully');
    console.log(`Event ID: ${event.id}`);
    console.log(`Signed by: ${event.pubkey.substring(0, 8)}...`);
    
    // Verify the event is from the expected user (if customer pubkey provided)
    if (customerPubkey && event.pubkey !== customerPubkey) {
      console.error(`Error: Event pubkey (${event.pubkey.substring(0, 8)}...) does not match expected customer pubkey (${customerPubkey.substring(0, 8)}...)`);
      process.exit(1);
    }

    // Validate the event structure
    if (event.kind !== 10040) {
      console.error(`Error: Expected kind 10040, got kind ${event.kind}`);
      process.exit(1);
    }
    
    console.log('Event validation passed. Publishing to relay...');
    console.log('Event details:');
    console.log(JSON.stringify(event, null, 2));

    // Publish to each relay sequentially
    // Initialize counters
    let successCount = 0;
    let failureCount = 0;
    for (const relayUrl of aRelayUrls) {
      try {
        console.log(`Publishing event to relay: ${relayUrl}`);
        const result = await publishEventToRelay(event, relayUrl);
        if (result.success) {
          console.log(`✅ Event ${event.id} published successfully to ${relayUrl}.`);
          successCount++;
        } else {
          console.error(`❌ Failed to publish event ${event.id} to ${relayUrl}: ${result.message}`);
          failureCount++;
        }
      } catch (error) {
        console.error(`Error publishing event ${event.id} to ${relayUrl}:`, error);
        failureCount++;
      }
    }
    console.log(`Published event ${event.id} to ${successCount} relays, failed to publish to ${failureCount} relays.`);
  } catch (error) {
    console.error('Error publishing Kind 10040 event:', error);
    process.exit(1);
  }
}

/**
 * Find the event file for a customer
 */
async function findEventFile(customerPubkey) {
  const dataDir = '/var/lib/brainstorm/data';
  const tempDir = path.join(dataDir, 'temp');
  
  // Look for customer-specific signed event file
  if (customerPubkey) {
    const customerFile = path.join(tempDir, `kind10040_${customerPubkey}_signed.json`);
    if (fs.existsSync(customerFile)) {
      return customerFile;
    }
  }
  
  // Look for general signed event file
  const generalFile = path.join(tempDir, 'kind10040_signed.json');
  if (fs.existsSync(generalFile)) {
    return generalFile;
  }
  
  // Look for any recent kind10040 signed files
  if (fs.existsSync(tempDir)) {
    const files = fs.readdirSync(tempDir);
    const signedFiles = files.filter(f => f.startsWith('kind10040_') && f.includes('signed') && f.endsWith('.json'));
    
    if (signedFiles.length > 0) {
      // Return the most recent one
      signedFiles.sort((a, b) => {
        const statA = fs.statSync(path.join(tempDir, a));
        const statB = fs.statSync(path.join(tempDir, b));
        return statB.mtimeMs - statA.mtimeMs;
      });
      
      return path.join(tempDir, signedFiles[0]);
    }
  }
  
  return null;
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
publishKind10040().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
