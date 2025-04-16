#!/usr/bin/env node

/**
 * Brainstorm NIP-85 Event Publisher
 * 
 * This script publishes NIP-85 data as kind 30382 events to Nostr relays.
 * It is optimized for large-scale publishing with connection pooling,
 * memory management, and detailed monitoring.
 */

const { publishNip85Events } = require('../lib/publish');
const { loadConfig } = require('../lib/config');

// Load configuration
const config = loadConfig();

// Run the publisher with Node.js garbage collection enabled
publishNip85Events(config)
  .then(() => {
    console.log('NIP-85 event publication completed successfully!');
  })
  .catch(error => {
    console.error('Error publishing NIP-85 events:', error);
    process.exit(1);
  });
