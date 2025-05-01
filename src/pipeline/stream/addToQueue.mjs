#!/usr/bin/node
import fs from 'fs';
import child_process from 'child_process';
import 'websocket-polyfill'
import dotenv from 'dotenv'
import NDK from '@nostr-dev-kit/ndk'
import { useWebSocketImplementation } from 'nostr-tools/pool'
import WebSocket from 'ws'
useWebSocketImplementation(WebSocket)

// Load environment variables from .env file for development
dotenv.config();

// Function to get configuration value from file or environment
function getConfigValue(varName, defaultValue = null) {
  try {
    // First try to read from the config file directly
    if (fs.existsSync('/etc/brainstorm.conf')) {
      try {
        // Use bash explicitly with the -c option
        const result = child_process.execSync(`bash -c "source /etc/brainstorm.conf && echo \\$${varName}"`, {
          encoding: 'utf8'
        }).trim();
        
        if (result) {
          console.log(`Found ${varName} in config file: ${result}`);
          return result;
        }
      } catch (execError) {
        console.error(`Error executing config file:`, execError.message);
        // Continue to next method
      }
    }
    
    // Fall back to environment variable
    if (process.env[varName]) {
      console.log(`Found ${varName} in environment: ${process.env[varName]}`);
      return process.env[varName];
    }
    
    // Return default value if provided
    if (defaultValue !== null) {
      console.log(`Using default value for ${varName}: ${defaultValue}`);
      return defaultValue;
    }
    
    return null;
  } catch (error) {
    console.error(`Error getting configuration value ${varName}:`, error.message);
    return defaultValue;
  }
}

// Get relay URL from config with development fallback
const myRelay = getConfigValue('BRAINSTORM_RELAY_URL', 'wss://relay.damus.io');

const myRelay_slashStrfry = myRelay + '/strfry'

// Log warning if using default relay
if (myRelay === 'wss://relay.damus.io') {
  console.warn('WARNING: Using default relay (wss://relay.damus.io) because BRAINSTORM_RELAY_URL is not set');
  console.warn('This is fine for development but should be configured in production');
}

console.log(`Using relay: ${myRelay_slashStrfry}`);

const explicitRelayUrls = [ myRelay_slashStrfry ]

const pathToWotQueue = '/var/lib/brainstorm/pipeline/stream/queue/'
const pathToContentQueue = '/var/lib/brainstorm/pipeline/stream/content/queue/'

const ndk = new NDK({explicitRelayUrls})

// Subscribe to kind 3 (follows), kind 10000 (mutes), and kind 1984 (reports) events
const aKinds_wot = [3, 10000, 1984]
const aKinds_content = [1]
const aKinds_all = [...aKinds_wot, ...aKinds_content]
const filter = { kinds: aKinds_all, limit: 0 }

// Create file with pubkey_kind as the name; this way, if multiple events of the same kind happen in rapid succession,
// we only process that pubkey+kind combination one time
const addEventToWotQueue = (event) => {
    const dataToWrite = JSON.stringify(event) + '\n'
    const thisFilePath = `${pathToWotQueue}${event.pubkey}_${event.kind}`
    fs.writeFile(thisFilePath, dataToWrite, (err) => {
      if (err) {
        console.error('Error writing to file:', err);
      } else {
        console.log(`File written successfully: ${thisFilePath}`);
      }
    });
}

const addEventToContentQueue = (event) => {
    const dataToWrite = JSON.stringify(event) + '\n'
    const thisFilePath = `${pathToContentQueue}${event.pubkey}_${event.kind}_${event.created_at}`
    fs.writeFile(thisFilePath, dataToWrite, (err) => {
      if (err) {
        console.error('Error writing to file:', err);
      } else {
        console.log(`File written successfully: ${thisFilePath}`);
      }
    });
}

const runListener = async () => {
  try {
    await ndk.connect()
    const sub1 = ndk.subscribe(filter)
    sub1.on('event', async (event) => {
      console.log(`event received; id: ${event.id}; pubkey: ${event.pubkey}; kind: ${event.kind}`)
      // remove content field to decrease bloat and processing errors
      const event_stripped = {id: event.id, pubkey: event.pubkey, created_at: event.created_at, kind: event.kind, tags: event.tags}
      console.log(JSON.stringify(event_stripped,null,4))
      if (aKinds_wot.includes(event.kind)) {
        addEventToWotQueue(event_stripped)
      }
      if (aKinds_content.includes(event.kind)) {
        addEventToContentQueue(event_stripped)
      }
    })
  } catch (error) {
    console.error('Error running listener:', error.message);
  }
}

runListener()