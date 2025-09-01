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
// changing user home relay url to nip85.brainstorm.world
// may place this relay in brainstorm.conf
const relayUrl = getConfigFromFile('BRAINSTORM_RELAY_URL', '');
const nip85HomeRelay = "wss://nip85.brainstorm.world"
let relayPubkey = getConfigFromFile('BRAINSTORM_RELAY_PUBKEY', '');

// get customer pubkey if one is provided as an argument
const customerPubkey = process.argv[2];

// if customerPubkey is provided, then use CUSTOMER_<customerPubkey>_RELAY_PUBKEY instead of relayPubkey
if (customerPubkey) {
  relayPubkey = getConfigFromFile(`CUSTOMER_${customerPubkey}_RELAY_PUBKEY`, '');
}

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
      nip85HomeRelay
    ],
    [
      "30382:personalizedGrapeRank_influence",
      relayPubkey,
      nip85HomeRelay
    ],
    [
      "30382:personalizedGrapeRank_average",
      relayPubkey,
      nip85HomeRelay
    ],
    [
      "30382:personalizedGrapeRank_confidence",
      relayPubkey,
      nip85HomeRelay
    ],
    [
      "30382:personalizedGrapeRank_input",
      relayPubkey,
      nip85HomeRelay
    ],
    [
      "30382:personalizedPageRank",
      relayPubkey,
      nip85HomeRelay
    ],
    [
      "30382:verifiedFollowersCount",
      relayPubkey,
      nip85HomeRelay
    ],
    [
      "30382:verifiedMutersCount",
      relayPubkey,
      nip85HomeRelay
    ],
    [
      "30382:verifiedReportersCount",
      relayPubkey,
      nip85HomeRelay
    ],
    [
      "30382:hops",
      relayPubkey,
      nip85HomeRelay
    ]
  ]
};

// Save the event to a temporary file
const dataDir = '/var/lib/brainstorm/data';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let event_file_name = '';
if (customerPubkey) {
  event_file_name = customerPubkey + '_kind10040_event.json';
} else {
  event_file_name = 'owner_kind10040_event.json';
}

const eventFile = path.join(dataDir, event_file_name);
fs.writeFileSync(eventFile, JSON.stringify(event, null, 2));

console.log(`Kind 10040 event created and saved to ${eventFile}`);
console.log('Event details:');
console.log(JSON.stringify(event, null, 2));
console.log('\nThis event is ready for signing and publishing.');
