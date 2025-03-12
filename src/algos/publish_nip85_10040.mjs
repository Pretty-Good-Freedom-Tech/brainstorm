#!/usr/bin/env node

/*
This script creates a kind 10040 event according to NIP-85: Trusted Assertions. It must be signed by the owner of the relay. 
Effectively, it gives the hasenpfeffr relay permission to create and sign kind 30382 events using hasenpfeffr_relay_keys, 
which it will do in the background on a regular basis. Clients (Amethyst, etc) fetch a user's kind 10040 note which will 
point to kind 30382 notes authored by the hasenpfeffr relay.

We will need a front end to do this, which is not yet set up.
*/

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import NDK from '@nostr-dev-kit/ndk';
import * as NostrTools from "nostr-tools";
import { useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';
// global.WebSocket = WebSocket;
useWebSocketImplementation(WebSocket);

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
const myRelay = getConfigFromFile('HASENPFEFFR_RELAY_URL', 'wss://relay.hasenpfeffr.com');
const userPublicKey = getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY');
const hasenpfeffrRelayUrl = myRelay;

// Define relay URLs to publish to
const explicitRelayUrls = [myRelay];

// Initialize NDK
const ndk = new NDK({ explicitRelayUrls });

async function main() {
  try {
    console.log('Starting NIP-85 Kind 10040 event publishing...');
    
    // Connect to relays
    await ndk.connect();
    console.log(`Connected to relays: ${explicitRelayUrls.join(', ')}`);
    
    // Check for authenticated session
    if (!userPublicKey) {
      console.error('Error: No owner public key found in configuration');
      process.exit(1);
    }
    
    console.log(`Using owner public key: ${userPublicKey}`);
    
    // Define data directories
    const dataDir = '/var/lib/hasenpfeffr/data';
    const publishedDir = path.join(dataDir, 'published');
    
    // Create directories if they don't exist
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    if (!fs.existsSync(publishedDir)) {
      fs.mkdirSync(publishedDir, { recursive: true });
    }
    
    // Check if a signed event file was provided via environment variable
    let eventFile;
    if (process.env.SIGNED_EVENT_FILE && fs.existsSync(process.env.SIGNED_EVENT_FILE)) {
      eventFile = process.env.SIGNED_EVENT_FILE;
      console.log(`Using signed event file from environment: ${eventFile}`);
    } else {
      // First check for the standard event file
      eventFile = path.join(dataDir, 'kind10040_event.json');
      
      // If standard file doesn't exist, find the most recent kind 10040 event file
      if (!fs.existsSync(eventFile)) {
        let latestTime = 0;
        
        if (fs.existsSync(publishedDir)) {
          const files = fs.readdirSync(publishedDir);
          for (const file of files) {
            if (file.startsWith('kind10040_') && file.endsWith('.json')) {
              const filePath = path.join(publishedDir, file);
              const stats = fs.statSync(filePath);
              if (stats.mtimeMs > latestTime) {
                latestTime = stats.mtimeMs;
                eventFile = filePath;
              }
            }
          }
        }
      }
    }
    
    if (!fs.existsSync(eventFile)) {
      console.error('Error: No kind 10040 event file found');
      process.exit(1);
    }
    
    console.log(`Found event file: ${eventFile}`);
    
    // Read the event file
    const eventData = fs.readFileSync(eventFile, 'utf8');
    let event = JSON.parse(eventData);
    
    // Set pubkey to the owner's pubkey if not already set
    if (!event.pubkey) {
      event.pubkey = userPublicKey;
    }
    
    console.log('Event to publish:', event);
    
    // Check if the event is already signed
    if (!event.sig) {
      console.error('Error: Event is not signed. The event must be signed in the browser using NIP-07.');
      
      // Save the unsigned event for the browser to sign
      const unsignedEventFile = path.join(dataDir, 'kind10040_unsigned_event.json');
      fs.writeFileSync(unsignedEventFile, JSON.stringify(event, null, 2));
      console.log(`Unsigned event saved to: ${unsignedEventFile}`);
      
      return {
        success: false,
        message: 'Event is not signed. Please sign the event in the browser using NIP-07.',
        unsignedEventFile
      };
    }
    
    // Verify the event signature
    const verified = NostrTools.verifySignature(event);
    if (!verified) {
      console.error('Error: Event signature verification failed');
      process.exit(1);
    }
    
    console.log('Event signature verified successfully');
    
    // Create NDK event from the Nostr event
    const ndkEvent = new NDK.NDKEvent(ndk, event);
    
    // Publish the event to relays
    console.log(`Publishing event to relays: ${explicitRelayUrls.join(', ')}`);
    const publishPromise = ndkEvent.publish();
    
    // Wait for the event to be published with a timeout
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Publish timeout after 10 seconds')), 10000)
    );
    
    const result = await Promise.race([publishPromise, timeout]);
    
    console.log('Event published successfully!');
    console.log('Publish result:', result);
    
    // Update the event file with publication timestamp
    event.published_at = Math.floor(Date.now() / 1000);
    fs.writeFileSync(eventFile, JSON.stringify(event, null, 2));
    
    // Create a success marker file
    const successFile = path.join(publishedDir, `kind10040_${event.id.substring(0, 8)}_published.json`);
    fs.writeFileSync(successFile, JSON.stringify({
      event_id: event.id,
      published_at: event.published_at,
      relays: explicitRelayUrls
    }, null, 2));
    
    console.log(`Publication record saved to: ${successFile}`);
    
    return {
      success: true,
      message: `Kind 10040 event published successfully to ${explicitRelayUrls.length} relays`,
      event_id: event.id
    };
  } catch (error) {
    console.error('Error publishing event:', error);
    return {
      success: false,
      message: `Error publishing event: ${error.message}`
    };
  } finally {
    // Close NDK connection
    try {
      await ndk.pool.close();
      console.log('NDK connection closed');
    } catch (error) {
      console.error('Error closing NDK connection:', error);
    }
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