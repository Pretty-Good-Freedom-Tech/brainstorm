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
import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";
import * as NostrTools from "nostr-tools";
import { useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';

// Use WebSocket implementation for Node.js
useWebSocketImplementation(WebSocket);

// Function to get configuration values directly from /etc/hasenpfeffr.conf
function getConfigFromFile(varName, defaultValue = null) {
  try {
    const confFile = '/etc/hasenpfeffr.conf';
    if (fs.existsSync(confFile)) {
      // Read the file content directly
      const fileContent = fs.readFileSync(confFile, 'utf8');
      console.log(`Reading config for ${varName} from ${confFile}`);
      
      // Look for the variable in the file content
      const regex = new RegExp(`${varName}=[\"\'](.*?)[\"\']
`, 'gm');
      const match = regex.exec(fileContent);
      
      if (match && match[1]) {
        console.log(`Found ${varName}=${match[1]}`);
        return match[1];
      }
      
      // If not found with regex, try the source command as fallback
      console.log(`Trying source command for ${varName}`);
      const result = execSync(`source ${confFile} && echo $${varName}`).toString().trim();
      console.log(`Source command result for ${varName}: '${result}'`);
      return result || defaultValue;
    }
    console.log(`Config file ${confFile} not found`);
    return defaultValue;
  } catch (error) {
    console.error(`Error getting configuration value ${varName}:`, error.message);
    return defaultValue;
  }
}

// Get relay configuration
// const myRelay = getConfigFromFile('HASENPFEFFR_RELAY_URL', 'wss://relay.hasenpfeffr.com');
const userPublicKey = getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY');
// const hasenpfeffrRelayUrl = myRelay;

// Define relay URLs to publish to
const explicitRelayUrls = ['wss://relay.hasenpfeffr.com','wss://relay.damus.io'];

// Initialize NDK without a signer since we're using pre-signed events
const ndk = new NDK({ 
  explicitRelayUrls,
  enableOutboxModel: false  // Disable outbox model to ensure direct publishing
});

async function main() {
  try {
    console.log('Starting NIP-85 Kind 10040 event publishing...');
    
    // Connect to relays with explicit timeout and retry
    console.log(`Attempting to connect to relays: ${explicitRelayUrls.join(', ')}`);
    
    try {
      await Promise.race([
        ndk.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000))
      ]);
      console.log('Successfully connected to relays');
    } catch (error) {
      console.error('Error connecting to relays:', error);
      // Try one more time with a longer timeout
      console.log('Retrying connection with longer timeout...');
      await Promise.race([
        ndk.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout after 20 seconds')), 20000))
      ]);
    }
    
    // Verify that we have connected relays
    const connectedRelays = Array.from(ndk.pool._relays.values())
      .filter(relay => relay.status === 3) // 3 = connected
      .map(relay => relay.url);
    
    if (connectedRelays.length === 0) {
      console.error('Error: No relays connected. Cannot publish event.');
      process.exit(1);
    }
    
    console.log(`Connected to relays: ${connectedRelays.join(', ')}`);
    
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
    let event;
    
    try {
      event = JSON.parse(eventData);
      console.log('Parsed event data:', JSON.stringify(event, null, 2));
    } catch (error) {
      console.error('Error parsing event data:', error);
      console.error('Event data:', eventData);
      process.exit(1);
    }
    
    // Check if the event is already signed
    if (!event.sig) {
      console.error('Error: Event is not signed. The event must be signed in the browser using NIP-07.');
      process.exit(1);
    }
    
    // Verify the event signature
    let verified;
    try {
      console.log('Verifying event signature...');
      verified = NostrTools.verifyEvent(event);
      console.log('Signature verification result:', verified);
    } catch (error) {
      console.error('Error during signature verification:', error);
      process.exit(1);
    }
    
    if (!verified) {
      console.error('Error: Event signature verification failed');
      process.exit(1);
    }
    
    console.log('Event signature verified successfully');
    
    // Create NDK event from the Nostr event
    let ndkEvent;
    try {
      ndkEvent = new NDKEvent(ndk, event);
      console.log('NDK event created successfully');
    } catch (error) {
      console.error('Error creating NDK event:', error);
      process.exit(1);
    }
    
    // Publish the event to relays
    console.log(`Publishing event to relays: ${connectedRelays.join(', ')}`);
    
    try {
      // Publish the event with explicit relay set
      const relaySet = ndk.pool.getRelaySet(connectedRelays);
      console.log(`Using relay set with ${relaySet.relays.size} relays`);
      
      // Publish with timeout
      const publishPromise = ndkEvent.publish(relaySet);
      const result = await Promise.race([
        publishPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Publish timeout after 15 seconds')), 15000))
      ]);
      
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
        relays: connectedRelays
      }, null, 2));
      
      console.log(`Publication record saved to: ${successFile}`);
      
      process.exit(0);
    } catch (error) {
      console.error('Error publishing event:', error);
      process.exit(1);
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});