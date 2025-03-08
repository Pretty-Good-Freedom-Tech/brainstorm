#!/usr/bin/env node

/*
This script creates a kind 10040 event according to NIP-85: Trusted Assertions. It must be signed by the owner of the relay. 
Effectively, it gives the hasenpfeffr relay permission to create and sign kind 30382 events using hasenpfeffr_relay_keys, 
which it will do in the background on a regular basis. Clients (Amethyst, etc) fetch a user's kind 10040 note which will 
point to kind 30382 notes authored by the hasenpfeffr relay.

We will need a front end to do this, which is not yet set up.
*/

import fs from 'fs';
import * as NostrTools from "nostr-tools";
import WebSocket from 'ws';
// global.WebSocket = WebSocket;
import { execSync } from 'child_process';

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

const userPublicKey = getEnvVar('HASENPFEFFR_OWNER_PUBKEY');
const hasenpfeffrRelayUrl = getEnvVar('HASENPFEFFR_RELAY_URL');
// console.log(`userPublicKey: ${userPublicKey}`)
// console.log(`hasenpfeffrRelayUrl: ${hasenpfeffrRelayUrl}`)

const hasenpfeffr_relay_keys = JSON.parse(fs.readFileSync('/home/ubuntu/hasenpfeffr/nostr/keys/hasenpfeffr_relay_keys', 'utf8'));

// console.log(hasenpfeffr_relay_keys);
// const hasenpfeffr_relay_nsec = hasenpfeffr_relay_keys.nsec
// const hasenpfeffr_relay_privKey = hasenpfeffr_relay_keys.nsecEncoded
const hasenpfeffr_relay_pubkey = hasenpfeffr_relay_keys.pubkey
// const hasenpfeffr_relay_npub = hasenpfeffr_relay_keys.npub

/*
console.log(hasenpfeffr_relay_nsec)
console.log(hasenpfeffr_relay_privKey)
console.log(hasenpfeffr_relay_pubkey)
console.log(hasenpfeffr_relay_npub)
*/

const relayUrls = [ hasenpfeffrRelayUrl ]

// Create a new Nostr event
const content = "";
let NostrEvent = {
  kind: 10040, // Kind 1 is a text note
  pubkey: userPublicKey,
  created_at: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
  "tags": [
    [
      "30382:rank",
      hasenpfeffr_relay_pubkey,
      hasenpfeffrRelayUrl
    ],
    [
      "30382:personalized_grapeRank",
      hasenpfeffr_relay_pubkey,
      hasenpfeffrRelayUrl
    ],
    [
      "30382:personalized_pageRank",
      hasenpfeffr_relay_pubkey,
      hasenpfeffrRelayUrl
    ],
    [
      "30382:dos",
      hasenpfeffr_relay_pubkey,
      hasenpfeffrRelayUrl
    ]
  ],
  content // Your message content, defined in Step 2
};

console.log("Unsigned event:", NostrEvent);

// Sign the event with the private key
// NostrEvent.id = NostrTools.getEventHash(NostrEvent);
// NostrEvent = await NostrTools.finalizeEvent(NostrEvent, hasenpfeffr_user_nsec);

// Log the signed event
// console.log("Signed event:", NostrEvent);