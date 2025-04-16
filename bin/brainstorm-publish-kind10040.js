#!/usr/bin/env node

/**
 * Brainstorm Publish Kind 10040 Event
 * 
 * This script publishes a previously created kind 10040 event
 * to the configured relay after signing it with the authenticated user's key.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const { getConfigFromFile } = require('../src/utils/config');

// Get relay configuration
const relayUrl = getConfigFromFile('BRAINSTORM_RELAY_URL', '');

if (!relayUrl) {
  console.error('Error: Relay URL not found in configuration');
  process.exit(1);
}

// Check if the event file exists
const dataDir = '/var/lib/brainstorm/data';
const eventFile = path.join(dataDir, 'kind10040_event.json');

if (!fs.existsSync(eventFile)) {
  console.error(`Error: Event file not found at ${eventFile}`);
  console.error('Please create the event first using the "Create Kind 10040 Event" button');
  process.exit(1);
}

// Read the event from the file
let event;
try {
  const eventData = fs.readFileSync(eventFile, 'utf8');
  event = JSON.parse(eventData);
} catch (error) {
  console.error('Error reading event file:', error);
  process.exit(1);
}

// Check for authenticated session
const sessionDir = '/var/lib/brainstorm/sessions';
const sessionFile = path.join(sessionDir, 'auth_session.json');
let session;

// Create the session directory if it doesn't exist
if (!fs.existsSync(sessionDir)) {
  try {
    fs.mkdirSync(sessionDir, { recursive: true });
    console.log(`Created session directory at ${sessionDir}`);
  } catch (error) {
    console.error(`Error creating session directory: ${error.message}`);
  }
}

// First, try to find Express session files
let foundSession = false;

// Look in multiple possible session directories
const possibleSessionDirs = [
  '/var/lib/brainstorm/sessions',
  '/tmp/brainstorm-sessions',
  path.join(process.env.HOME || '/root', '.brainstorm/sessions'),
  '/var/lib/sessions',
  '/tmp/sessions'
];

for (const dir of possibleSessionDirs) {
  if (fs.existsSync(dir)) {
    try {
      console.log(`Checking for session files in ${dir}`);
      const sessionFiles = fs.readdirSync(dir);
      
      for (const file of sessionFiles) {
        // Express session files typically start with "sess:"
        if (file.startsWith('sess:')) {
          try {
            const sessionData = fs.readFileSync(path.join(dir, file), 'utf8');
            const sessionJson = JSON.parse(sessionData);
            
            console.log(`Found session file: ${file}`);
            
            // Check if this session is authenticated
            if (sessionJson.authenticated === true && sessionJson.pubkey) {
              console.log(`Found authenticated session for pubkey: ${sessionJson.pubkey}`);
              session = {
                pubkey: sessionJson.pubkey
              };
              foundSession = true;
              break;
            }
          } catch (err) {
            console.error(`Error reading session file ${file}:`, err.message);
            // Continue to next file
          }
        }
      }
      
      if (foundSession) break;
    } catch (err) {
      console.error(`Error reading session directory ${dir}:`, err.message);
      // Continue to next directory
    }
  }
}

// If no session found in Express files, try the direct session file
if (!foundSession && fs.existsSync(sessionFile)) {
  try {
    const sessionData = fs.readFileSync(sessionFile, 'utf8');
    session = JSON.parse(sessionData);
    foundSession = true;
    console.log(`Found session in direct file: ${sessionFile}`);
  } catch (error) {
    console.error('Error reading session file:', error);
  }
}

// If still no session, check if we can get the owner pubkey from config
if (!foundSession) {
  try {
    const ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY');
    if (ownerPubkey) {
      console.log(`Using owner pubkey from config: ${ownerPubkey}`);
      session = {
        pubkey: ownerPubkey
      };
      foundSession = true;
    }
  } catch (error) {
    console.error('Error getting owner pubkey from config:', error);
  }
}

// If still no session found, exit with error
if (!foundSession) {
  console.error('Error: No authenticated session found');
  console.error('Please sign in first to publish events');
  process.exit(1);
}

if (!session.pubkey) {
  console.error('Error: No authenticated user found in session');
  process.exit(1);
}

// Set the pubkey from the authenticated user
event.pubkey = session.pubkey;

// Serialize the event for signing
function serializeEvent(evt) {
  return JSON.stringify([
    0,
    evt.pubkey,
    evt.created_at,
    evt.kind,
    evt.tags,
    evt.content
  ]);
}

// Sign the event using the authenticated user's key
// This would normally be done client-side with NIP-07
// For this example, we'll use a placeholder
console.log('Event would be signed with key:', session.pubkey);
console.log('Serialized event for signing:', serializeEvent(event));

// In a real implementation, we would use WebSocket to publish to the relay
console.log(`Event would be published to relay: ${relayUrl}`);
console.log('Event details:');
console.log(JSON.stringify(event, null, 2));

// For demonstration purposes, we'll write the "published" event to a file
const publishedDir = path.join(dataDir, 'published');
if (!fs.existsSync(publishedDir)) {
  fs.mkdirSync(publishedDir, { recursive: true });
}

const publishedFile = path.join(publishedDir, `kind10040_${Date.now()}.json`);
fs.writeFileSync(publishedFile, JSON.stringify(event, null, 2));

console.log(`\nEvent has been "published" and saved to ${publishedFile}`);
console.log('In a production environment, this would be sent to the relay via WebSocket');
