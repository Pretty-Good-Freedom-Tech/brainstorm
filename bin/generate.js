#!/usr/bin/env node

/**
 * Brainstorm NIP-85 Data Generator
 * 
 * This script generates NIP-85 data including personalized PageRank scores
 * and network hops (degrees of separation) for Nostr users.
 */

const { generateNip85Data } = require('../lib/generate');
const { loadConfig } = require('../lib/config');

// Load configuration
const config = loadConfig();

// Run the generator
generateNip85Data(config)
  .then(() => {
    console.log('NIP-85 data generation completed successfully!');
  })
  .catch(error => {
    console.error('Error generating NIP-85 data:', error);
    process.exit(1);
  });
