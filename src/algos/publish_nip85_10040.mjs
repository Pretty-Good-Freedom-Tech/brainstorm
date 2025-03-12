#!/usr/bin/env node

/*
12 March 2025:
If the standard approach (NDK) fails, this script falls back to direct WebSocket connections.
I suspect NDK is failing.
*/

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
import { exec } from 'child_process';
import { promisify } from 'util';
import dns from 'dns';

// Promisify exec for async/await usage
const execAsync = promisify(exec);

// Use WebSocket implementation for Node.js
useWebSocketImplementation(WebSocket);

// Function to run network diagnostics
async function runNetworkDiagnostics(relayUrls) {
  console.log('Running network diagnostics...');
  
  // Check DNS resolution
  console.log('Checking DNS resolution...');
  for (const relayUrl of relayUrls) {
    try {
      const url = new URL(relayUrl);
      const hostname = url.hostname;
      
      console.log(`Resolving hostname: ${hostname}`);
      const addresses = await new Promise((resolve, reject) => {
        dns.resolve(hostname, (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses);
        });
      });
      
      console.log(`DNS resolution for ${hostname}: ${addresses.join(', ')}`);
    } catch (error) {
      console.error(`DNS resolution failed for ${relayUrl}: ${error.message}`);
    }
  }
  
  // Check if curl can connect to the relays
  console.log('Checking relay connectivity with curl...');
  for (const relayUrl of relayUrls) {
    try {
      // Replace wss:// with https:// for curl
      const httpUrl = relayUrl.replace('wss://', 'https://');
      
      console.log(`Testing connection to ${httpUrl} with curl...`);
      const { stdout, stderr } = await execAsync(`curl -v --max-time 5 ${httpUrl}`);
      
      if (stderr) {
        console.log(`Curl verbose output for ${httpUrl}:\n${stderr}`);
      }
      
      console.log(`Curl was able to connect to ${httpUrl}`);
    } catch (error) {
      console.error(`Curl failed to connect to ${relayUrl}: ${error.message}`);
    }
  }
  
  // Check outbound connectivity
  try {
    console.log('Checking general outbound connectivity...');
    const { stdout: netstatOutput } = await execAsync('netstat -an | grep ESTABLISHED | wc -l');
    console.log(`Number of established connections: ${netstatOutput.trim()}`);
    
    // Check if we can reach a well-known site
    const { stdout: curlGoogle } = await execAsync('curl -s -o /dev/null -w "%{http_code}" https://www.google.com');
    console.log(`HTTP status code from Google: ${curlGoogle.trim()}`);
  } catch (error) {
    console.error(`Error checking outbound connectivity: ${error.message}`);
  }
  
  // Check for firewall rules
  try {
    console.log('Checking for firewall rules...');
    
    // Check iptables if available
    try {
      const { stdout: iptablesOutput } = await execAsync('iptables -L -n');
      console.log(`iptables rules:\n${iptablesOutput}`);
    } catch (error) {
      console.log('iptables not available or requires sudo');
    }
    
    // Check AWS security groups if on EC2
    try {
      const { stdout: awsMetadata } = await execAsync('curl -s http://169.254.169.254/latest/meta-data/');
      if (awsMetadata) {
        console.log('Running on AWS EC2. Check security groups in AWS console.');
      }
    } catch (error) {
      console.log('Not running on AWS EC2 or metadata service not available');
    }
  } catch (error) {
    console.error(`Error checking firewall rules: ${error.message}`);
  }
  
  console.log('Network diagnostics completed');
}

// Function to test direct WebSocket connection to a relay
async function testRelayConnection(relayUrl) {
  return new Promise((resolve) => {
    console.log(`Testing direct WebSocket connection to ${relayUrl}...`);
    
    const ws = new WebSocket(relayUrl);
    let resolved = false;
    
    // Add more verbose logging
    ws.on('open', () => {
      console.log(`Direct WebSocket connection to ${relayUrl} successful!`);
      resolved = true;
      
      // Send a simple message to keep the connection alive
      try {
        ws.send(JSON.stringify(["REQ", "test-connection", { limit: 1, kinds: [0] }]));
        console.log(`Sent test message to ${relayUrl}`);
      } catch (e) {
        console.error(`Error sending test message to ${relayUrl}:`, e.message);
      }
      
      resolve(true);
      
      // Keep connection open a bit longer to ensure it's stable
      setTimeout(() => {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
            console.log(`Closed test connection to ${relayUrl}`);
          }
        } catch (e) {
          console.error(`Error closing connection to ${relayUrl}:`, e.message);
        }
      }, 1000);
    });
    
    ws.on('error', (error) => {
      console.error(`WebSocket error with ${relayUrl}:`, error.message);
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });
    
    ws.on('message', (data) => {
      console.log(`Received message from ${relayUrl}:`, data.toString());
    });
    
    ws.on('close', (code, reason) => {
      console.log(`WebSocket connection to ${relayUrl} closed with code ${code}${reason ? ': ' + reason : ''}`);
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });
    
    // Set a timeout in case the connection hangs
    setTimeout(() => {
      if (!resolved) {
        console.log(`Direct WebSocket connection to ${relayUrl} timed out`);
        resolved = true;
        resolve(false);
        try {
          ws.close();
        } catch (e) {
          // Ignore errors on close
        }
      }
    }, 5000);
  });
}

// Function to create a direct relay connection pool
async function createDirectRelayPool(relayUrls) {
  console.log('Creating direct relay connection pool...');
  
  const relayPool = [];
  
  for (const relayUrl of relayUrls) {
    try {
      console.log(`Directly connecting to ${relayUrl}...`);
      
      const ws = new WebSocket(relayUrl);
      
      // Create a promise that resolves when the connection is open
      const connectionPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Connection timeout for ${relayUrl}`));
        }, 10000);
        
        ws.on('open', () => {
          clearTimeout(timeout);
          console.log(`Direct connection to ${relayUrl} established`);
          resolve();
        });
        
        ws.on('error', (error) => {
          clearTimeout(timeout);
          reject(new Error(`Connection error for ${relayUrl}: ${error.message}`));
        });
      });
      
      // Wait for the connection to open
      await connectionPromise;
      
      // Add message handler
      ws.on('message', (data) => {
        console.log(`Message from ${relayUrl}:`, data.toString().substring(0, 100) + '...');
      });
      
      // Add to pool
      relayPool.push({
        url: relayUrl,
        ws,
        publish: async (event) => {
          return new Promise((resolve, reject) => {
            const publishTimeout = setTimeout(() => {
              reject(new Error(`Publish timeout for ${relayUrl}`));
            }, 10000);
            
            const okListener = (data) => {
              const msg = JSON.parse(data.toString());
              if (msg[0] === 'OK' && msg[1] === event.id) {
                clearTimeout(publishTimeout);
                ws.removeListener('message', okListener);
                resolve(true);
              }
            };
            
            ws.on('message', okListener);
            
            try {
              ws.send(JSON.stringify(['EVENT', event]));
              console.log(`Event sent to ${relayUrl}`);
            } catch (error) {
              clearTimeout(publishTimeout);
              ws.removeListener('message', okListener);
              reject(new Error(`Error sending event to ${relayUrl}: ${error.message}`));
            }
          });
        },
        close: () => {
          try {
            ws.close();
            console.log(`Closed connection to ${relayUrl}`);
          } catch (e) {
            console.error(`Error closing connection to ${relayUrl}:`, e.message);
          }
        }
      });
      
    } catch (error) {
      console.error(`Failed to connect to ${relayUrl}:`, error.message);
    }
  }
  
  console.log(`Successfully created direct relay pool with ${relayPool.length} relays`);
  return relayPool;
}

// Function to publish an event directly to relays
async function publishDirectly(event, relayPool) {
  console.log(`Publishing event directly to ${relayPool.length} relays...`);
  
  const results = await Promise.allSettled(
    relayPool.map(relay => relay.publish(event))
  );
  
  const successful = results.filter(r => r.status === 'fulfilled').length;
  console.log(`Published to ${successful}/${relayPool.length} relays`);
  
  // Close all connections
  relayPool.forEach(relay => relay.close());
  
  if (successful === 0) {
    throw new Error('Failed to publish to any relay');
  }
  
  return successful;
}

// Function to wait for relay connections
async function waitForRelayConnections(ndk, timeout = 10000) {
  console.log(`Waiting up to ${timeout}ms for relay connections to establish...`);
  
  const startTime = Date.now();
  let connectedRelays = [];
  
  while (Date.now() - startTime < timeout) {
    // Check for connected relays
    connectedRelays = Array.from(ndk.pool._relays.values())
      .filter(relay => relay.status === 3) // 3 = connected
      .map(relay => relay.url);
    
    if (connectedRelays.length > 0) {
      console.log(`Connected to ${connectedRelays.length} relays: ${connectedRelays.join(', ')}`);
      return connectedRelays;
    }
    
    // Wait a bit before checking again
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Log status periodically
    if ((Date.now() - startTime) % 2000 < 500) {
      console.log('Still waiting for relay connections...');
      
      // Log the status of each relay
      const allRelays = Array.from(ndk.pool._relays.values());
      for (const relay of allRelays) {
        console.log(`Relay ${relay.url} status: ${relay.status} (${getRelayStatusName(relay.status)})`);
      }
    }
  }
  
  console.log('Timeout waiting for relay connections');
  return [];
}

// Define relay URLs to publish to
const explicitRelayUrls = ['wss://relay.primal.net', 'wss://relay.hasenpfeffr.com','wss://relay.damus.io'];

// Get the owner public key from configuration or environment
const ownerPubkey = getConfigFromFile('HASENPFEFFR_OWNER_PUBKEY') || process.env.HASENPFEFFR_OWNER_PUBKEY;

// Check if running in production or development
const isProduction = process.env.NODE_ENV === 'production';

// Initialize NDK without a signer since we're using pre-signed events
const ndk = new NDK({ 
  explicitRelayUrls,
  enableOutboxModel: false  // Disable outbox model to ensure direct publishing
});

async function main() {
  try {
    console.log('Starting NIP-85 Kind 10040 event publishing...');
    
    // Test direct WebSocket connections to relays first
    console.log('Testing direct WebSocket connections to relays...');
    const connectionResults = await Promise.all(
      explicitRelayUrls.map(url => testRelayConnection(url))
    );
    
    const connectedCount = connectionResults.filter(Boolean).length;
    console.log(`Direct WebSocket connection test results: ${connectedCount}/${explicitRelayUrls.length} relays accessible`);
    
    if (connectedCount === 0) {
      console.error('Error: Cannot connect to any relays directly. Running network diagnostics...');
      await runNetworkDiagnostics(explicitRelayUrls);
      
      if (isProduction) {
        process.exit(1);
      } else {
        console.warn('WARNING: Continuing despite connection failures (development mode)');
      }
    }
    
    // Try both connection methods
    let useDirectConnections = false;
    let directRelayPool = null;
    
    // Connect to relays via NDK
    console.log(`Attempting to connect to relays via NDK: ${explicitRelayUrls.join(', ')}`);
    
    try {
      // Start the connection process
      ndk.connect();
      
      // Wait for relay connections to establish
      const connectedRelays = await waitForRelayConnections(ndk, 15000);
      
      if (connectedRelays.length === 0) {
        console.log('NDK failed to connect to any relays. Trying direct WebSocket connections...');
        useDirectConnections = true;
        
        // Create direct relay connections
        directRelayPool = await createDirectRelayPool(explicitRelayUrls);
        
        if (directRelayPool.length === 0) {
          console.error('Error: No relays connected after trying both methods.');
          if (isProduction) {
            process.exit(1);
          } else {
            console.warn('WARNING: Continuing despite connection failures (development mode)');
          }
        }
      }
    } catch (error) {
      console.error('Error connecting to relays via NDK:', error.message);
      console.log('Trying direct WebSocket connections...');
      useDirectConnections = true;
      
      // Create direct relay connections
      directRelayPool = await createDirectRelayPool(explicitRelayUrls);
      
      if (directRelayPool.length === 0) {
        console.error('Error: No relays connected after trying both methods.');
        if (isProduction) {
          process.exit(1);
        } else {
          console.warn('WARNING: Continuing despite connection failures (development mode)');
        }
      }
    }
    
    // Give relays a moment to establish connections
    console.log('Waiting for relay connections to stabilize...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify that we have connected relays
    const allRelays = Array.from(ndk.pool._relays.values());
    console.log(`Total relays in pool: ${allRelays.length}`);
    
    // Log status of each relay
    for (const relay of allRelays) {
      console.log(`Relay ${relay.url} status: ${relay.status} (${getRelayStatusName(relay.status)})`);
    }
    
    // Consider relays in CONNECTING state (1) as potentially usable
    const potentiallyConnectedRelays = allRelays
      .filter(relay => relay.status === 3 || relay.status === 1) // 3 = connected, 1 = connecting
      .map(relay => relay.url);
    
    console.log(`Potentially connected relays: ${potentiallyConnectedRelays.join(', ')}`);
    
    if (potentiallyConnectedRelays.length === 0) {
      console.error('Error: No relays connected or connecting. Cannot publish event.');
      process.exit(1);
    }
    
    // Create a relay set from all relays in the pool
    const relaySet = ndk.pool;
    console.log(`Using relay pool with ${allRelays.length} relays`);
    
    // Check for authenticated session
    if (!ownerPubkey) {
      console.log('Warning: No owner public key found in configuration');
      console.log('Will attempt to use the pubkey from the signed event');
    } else {
      console.log(`Using owner public key: ${ownerPubkey}`);
    }
    
    // Define data directories
    const dataDir = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/var/lib/hasenpfeffr/data' : './data');
    const publishedDir = path.join(dataDir, 'published');
    
    // Create directories if they don't exist
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log(`Created data directory: ${dataDir}`);
      } catch (error) {
        console.error(`Error creating data directory: ${error.message}`);
        console.log('Will attempt to use current directory for output');
      }
    }
    
    if (!fs.existsSync(publishedDir)) {
      try {
        fs.mkdirSync(publishedDir, { recursive: true });
        console.log(`Created published directory: ${publishedDir}`);
      } catch (error) {
        console.error(`Error creating published directory: ${error.message}`);
        // Fall back to current directory
        publishedDir = './';
      }
    }
    
    // Check if a signed event file was provided via environment variable
    let eventFile;
    if (process.env.SIGNED_EVENT_FILE && fs.existsSync(process.env.SIGNED_EVENT_FILE)) {
      eventFile = process.env.SIGNED_EVENT_FILE;
      console.log(`Using signed event file from environment: ${eventFile}`);
    } else {
      // First check for the standard event file
      eventFile = path.join(dataDir, 'kind10040_event.json');
      
      // For local testing, check in the current directory as well
      if (!fs.existsSync(eventFile)) {
        const localEventFile = './kind10040_event.json';
        if (fs.existsSync(localEventFile)) {
          eventFile = localEventFile;
          console.log(`Using local event file: ${eventFile}`);
        } else {
          // If standard file doesn't exist, find the most recent kind 10040 event file
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
          
          // If still no event file, check the current directory
          if (!eventFile || !fs.existsSync(eventFile)) {
            console.error('Error: No kind 10040 event file found');
            console.error('Please create a kind10040_event.json file in the current directory or specify SIGNED_EVENT_FILE environment variable');
            process.exit(1);
          }
        }
      }
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
      if (isProduction) {
        process.exit(1);
      } else {
        console.warn('WARNING: Continuing despite signature verification error (development mode)');
        verified = true; // Force continue in development mode
      }
    }
    
    if (!verified) {
      console.error('Error: Event signature verification failed');
      
      // In production, we must have a valid signature
      if (isProduction) {
        process.exit(1);
      } else {
        console.warn('WARNING: Continuing despite invalid signature (development mode)');
      }
    } else {
      console.log('Event signature verified successfully');
    }
    
    // Verify the event is from the authorized owner (if owner pubkey is configured)
    if (ownerPubkey && event.pubkey !== ownerPubkey) {
      console.error(`Error: Event pubkey (${event.pubkey}) does not match owner pubkey (${ownerPubkey})`);
      
      // In production, we must have the correct pubkey
      if (isProduction) {
        process.exit(1);
      } else {
        console.warn('WARNING: Continuing despite pubkey mismatch (development mode)');
      }
    }
    
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
    console.log('Publishing event to relays...');
    
    try {
      if (useDirectConnections && directRelayPool && directRelayPool.length > 0) {
        // Use direct WebSocket connections
        console.log('Using direct WebSocket connections for publishing...');
        const publishedCount = await publishDirectly(event, directRelayPool);
        console.log(`Event published successfully to ${publishedCount} relays!`);
        
        // Update the event file with publication timestamp
        event.published_at = Math.floor(Date.now() / 1000);
        fs.writeFileSync(eventFile, JSON.stringify(event, null, 2));
        
        // Create a success marker file
        const successFile = path.join(publishedDir, `kind10040_${event.id.substring(0, 8)}_published.json`);
        fs.writeFileSync(successFile, JSON.stringify({
          event_id: event.id,
          published_at: event.published_at,
          relays: directRelayPool.map(r => r.url)
        }, null, 2));
        
        console.log(`Publication record saved to: ${successFile}`);
        
        process.exit(0);
      } else {
        // Try to force connection to at least one relay if none are connected
        const connectedRelays = Array.from(ndk.pool._relays.values())
          .filter(relay => relay.status === 3) // 3 = connected
          .map(relay => relay.url);
        
        if (connectedRelays.length === 0) {
          console.log('No relays in CONNECTED state. Attempting to force connections...');
          
          // Try each relay individually
          for (const relayUrl of explicitRelayUrls) {
            try {
              const relay = ndk.pool.getRelay(relayUrl);
              console.log(`Forcing connection to ${relayUrl}...`);
              await relay.connect();
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for connection
              
              if (relay.status === 3) {
                console.log(`Successfully connected to ${relayUrl}`);
                connectedRelays.push(relayUrl);
                break;
              } else {
                console.log(`Failed to connect to ${relayUrl}, status: ${relay.status} (${getRelayStatusName(relay.status)})`);
              }
            } catch (error) {
              console.error(`Error connecting to ${relayUrl}:`, error.message);
            }
          }
        }
        
        console.log(`Connected relays for publishing: ${connectedRelays.length > 0 ? connectedRelays.join(', ') : 'None'}`);
        
        // Publish with timeout
        console.log('Attempting to publish event...');
        
        // Create a custom relay set if we have connected relays
        let publishTarget;
        if (connectedRelays.length > 0) {
          publishTarget = ndk.pool.getRelaySet(connectedRelays);
          console.log(`Using custom relay set with ${publishTarget.relays.size} relays`);
        } else {
          publishTarget = undefined; // Use default
          console.log('Using default relay set');
        }
        
        const publishPromise = ndkEvent.publish(publishTarget);
        const result = await Promise.race([
          publishPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Publish timeout after 20 seconds')), 20000))
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
          relays: connectedRelays.length > 0 ? connectedRelays : explicitRelayUrls
        }, null, 2));
        
        console.log(`Publication record saved to: ${successFile}`);
        
        process.exit(0);
      }
    } catch (error) {
      console.error('Error publishing event:', error);
      process.exit(1);
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

// Helper function to get relay status name
function getRelayStatusName(status) {
  switch (status) {
    case 0: return 'DISCONNECTED';
    case 1: return 'CONNECTING';
    case 2: return 'AUTHENTICATING';
    case 3: return 'CONNECTED';
    case 4: return 'DISCONNECTING';
    case 5: return 'RECONNECTING';
    default: return 'UNKNOWN';
  }
}

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

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});