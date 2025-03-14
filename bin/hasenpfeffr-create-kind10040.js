#!/usr/bin/env node

/**
 * Hasenpfeffr Create Kind 10040 Event
 * 
 * This script creates a kind 10040 event for NIP-85 trusted assertions
 * and saves it to a temporary file for later publishing.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
      const { execSync } = require('child_process');
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

if (!relayUrl || !relayPubkey) {
  console.error('Error: Relay URL or pubkey not found in configuration');
  process.exit(1);
}

// Create the kind 10040 event
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
      "30382:personalizedGrapeRank",
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
  ]
};

// Save the event to a temporary file
const dataDir = '/var/lib/hasenpfeffr/data';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const eventFile = path.join(dataDir, 'kind10040_event.json');
fs.writeFileSync(eventFile, JSON.stringify(event, null, 2));

console.log(`Kind 10040 event created and saved to ${eventFile}`);
console.log('Event details:');
console.log(JSON.stringify(event, null, 2));
console.log('\nThis event is ready for signing and publishing.');
