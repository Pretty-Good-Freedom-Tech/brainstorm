/**
 * Brainstorm - Nostr identity data publication system
 * 
 * This is the main entry point for the Brainstorm package.
 * It exports the core functionality for generating and publishing
 * NIP-85 Trusted Assertions.
 */

const { generateNip85Data } = require('./lib/generate');
const { publishNip85Events } = require('./lib/publish');
const { loadConfig } = require('./lib/config');

module.exports = {
  generateNip85Data,
  publishNip85Events,
  loadConfig
};
