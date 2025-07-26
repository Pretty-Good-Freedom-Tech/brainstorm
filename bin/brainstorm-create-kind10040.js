#!/usr/bin/env node

/**
 * Brainstorm Create Kind 10040 Event
 * 
 * This script creates a kind 10040 event for NIP-85 trusted assertions
 * and saves it to a temporary file for later publishing.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { getConfigFromFile } = require('../src/utils/config');

// Get relay configuration
const relayUrl = getConfigFromFile('BRAINSTORM_RELAY_URL', '');
const relayPubkey = getConfigFromFile('BRAINSTORM_RELAY_PUBKEY', '');

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

// Save the event to a temporary file
const dataDir = '/var/lib/brainstorm/data';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const eventFile = path.join(dataDir, 'kind10040_event.json');
fs.writeFileSync(eventFile, JSON.stringify(event, null, 2));

console.log(`Kind 10040 event created and saved to ${eventFile}`);
console.log('Event details:');
console.log(JSON.stringify(event, null, 2));
console.log('\nThis event is ready for signing and publishing.');
