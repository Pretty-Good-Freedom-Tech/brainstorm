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

// Get environment variables from hasenpfeffr.conf using source command
function getConfigFromFile(key, defaultValue = null) {
  try {
    // Check if the configuration file exists
    const configFilePath = '/etc/hasenpfeffr/config';
    if (!fs.existsSync(configFilePath)) {
      console.error(`Configuration file not found: ${configFilePath}`);
      return defaultValue;
    }
    
    // Read the configuration file
    const configData = fs.readFileSync(configFilePath, 'utf8');
    const configLines = configData.split('\n');
    
    // Find the specified key in the configuration
    for (const line of configLines) {
      if (line.startsWith(`${key}=`)) {
        return line.split('=')[1].trim();
      }
    }
    
    console.error(`Key not found in configuration: ${key}`);
    return defaultValue;
  } catch (error) {
    console.error(`Error reading configuration for ${key}:`, error);
    return defaultValue;
  }
}

// Get relay configuration
const myRelay = getConfigFromFile('HASENPFEFFR_RELAY_URL', 'wss://relay.hasenpfeffr.com');
const userPublicKey = getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY');
const hasenpfeffrRelayUrl = myRelay;

// Define relay URLs to publish to
const explicitRelayUrls = ['wss://relay.hasenpfeffr.com','wss://relay.damus.io'];

// Initialize NDK without a signer since we're using pre-signed events
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
    console.log(`Publishing event to relays: ${explicitRelayUrls.join(', ')}`);
    
    try {
      // Publish the event
      await ndkEvent.publish();
      console.log('Event published successfully!');
      
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