/**
 * Configuration loader for Hasenpfeffr
 * 
 * Loads configuration from environment variables, .env file,
 * or /etc/hasenpfeffr.conf file.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

/**
 * Get environment variable from hasenpfeffr.conf using source command
 * @param {string} varName - Name of the environment variable
 * @returns {string|null} - Value of the environment variable or null if not found
 */
function getEnvVar(varName) {
  try {
    const confFile = '/etc/hasenpfeffr.conf';
    if (fs.existsSync(confFile)) {
      const result = execSync(`source ${confFile} && echo $${varName}`).toString().trim();
      return result || null;
    }
    return null;
  } catch (error) {
    console.error(`Error getting environment variable ${varName}:`, error.message);
    return null;
  }
}

/**
 * Load configuration from various sources
 * @returns {Object} - Configuration object
 */
function loadConfig() {
  // Default configuration
  const config = {
    relayUrl: process.env.HASENPFEFFR_RELAY_URL || getEnvVar('HASENPFEFFR_RELAY_URL'),
    relayPubkey: process.env.HASENPFEFFR_RELAY_PUBKEY || getEnvVar('HASENPFEFFR_RELAY_PUBKEY'),
    relayNsec: process.env.HASENPFEFFR_RELAY_NSEC || getEnvVar('HASENPFEFFR_RELAY_NSEC'),
    inputFile: process.env.HASENPFEFFR_INPUT_FILE || '/home/ubuntu/hasenpfeffr/algos/nip85.json',
    batchSize: parseInt(process.env.HASENPFEFFR_BATCH_SIZE || '100', 10),
    delayBetweenBatches: parseInt(process.env.HASENPFEFFR_DELAY_BETWEEN_BATCHES || '1000', 10),
    delayBetweenEvents: parseInt(process.env.HASENPFEFFR_DELAY_BETWEEN_EVENTS || '50', 10),
    maxRetries: parseInt(process.env.HASENPFEFFR_MAX_RETRIES || '3', 10),
    maxConcurrentConnections: parseInt(process.env.HASENPFEFFR_MAX_CONCURRENT_CONNECTIONS || '5', 10),
    keysFile: process.env.HASENPFEFFR_KEYS_FILE || '/home/ubuntu/hasenpfeffr/nostr/keys/hasenpfeffr_relay_keys',
    // Neo4j configuration
    neo4j: {
      uri: process.env.NEO4J_URI || getEnvVar('NEO4J_URI') || 'bolt://localhost:7687',
      user: process.env.NEO4J_USER || getEnvVar('NEO4J_USER') || 'neo4j',
      password: process.env.NEO4J_PASSWORD || getEnvVar('NEO4J_PASSWORD')
    }
  };

  // Validate required configuration
  if (!config.relayUrl) {
    throw new Error('Relay URL is required. Set HASENPFEFFR_RELAY_URL environment variable or add it to /etc/hasenpfeffr.conf');
  }

  return config;
}

module.exports = {
  loadConfig,
  getEnvVar
};
