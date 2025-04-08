/**
 * Enhanced Configuration Management for Hasenpfeffr
 * 
 * This module provides a robust configuration system that:
 * 1. Prioritizes security for sensitive values
 * 2. Works with both Node.js and bash scripts
 * 3. Supports different environments (production, development)
 * 4. Provides clear fallback mechanisms
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Try to load .env file for development environments
try {
  require('dotenv').config();
} catch (error) {
  // dotenv might not be installed in production, which is fine
  // as we'll use /etc/hasenpfeffr.conf instead
}

// Configuration file paths
const PROD_CONFIG_PATH = '/etc/hasenpfeffr.conf';
const DEV_CONFIG_PATH = path.join(process.cwd(), '.env');

// Determine the base directory for the application
// This handles both global npm installs and local development
function getBaseDir() {
  // Check if we're in a local development environment
  const localDevDir = process.cwd();
  const nodeModulesDir = path.dirname(path.dirname(__dirname));
  
  // If we're running from node_modules, use the parent directory of node_modules
  if (nodeModulesDir.includes('node_modules')) {
    return path.dirname(nodeModulesDir);
  }
  
  // Otherwise, we're likely in a local development environment
  return localDevDir;
}

// Base directories
const BASE_DIR = getBaseDir();
const PUBLIC_DIR = path.join(BASE_DIR, 'public');
const DATA_DIR = process.env.HASENPFEFFR_DATA_DIR || path.join(BASE_DIR, 'data');
const SCRIPTS_DIR = path.join(BASE_DIR, 'scripts');
const SETUP_DIR = path.join(BASE_DIR, 'setup');

/**
 * Load configuration values from the production config file
 * @returns {Object} Configuration object with values from /etc/hasenpfeffr.conf
 */
function loadFromConfigFile() {
  const config = {};
  
  try {
    if (fs.existsSync(PROD_CONFIG_PATH)) {
      // Get all variable names from the config file
      const configContent = fs.readFileSync(PROD_CONFIG_PATH, 'utf8');
      const exportLines = configContent.split('\n')
        .filter(line => line.trim().startsWith('export '))
        .map(line => line.trim().replace('export ', ''));
      
      // Extract variable names
      for (const line of exportLines) {
        const [varNameWithEquals, ...valueParts] = line.split('=');
        const varName = varNameWithEquals.trim();
        // Join value parts in case the value contains = characters
        let value = valueParts.join('=');
        
        // Remove quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        
        config[varName] = value;
      }
    }
    return config;
  } catch (error) {
    console.warn(`Error loading config from ${PROD_CONFIG_PATH}:`, error.message);
    return {};
  }
}

/**
 * Get a specific configuration value from the config file using source command
 * This is more reliable for bash-exported variables but requires shell execution
 * @param {string} varName - Name of the environment variable
 * @returns {string|null} - Value of the environment variable or null if not found
 */
function getConfigValue(varName) {
  try {
    if (fs.existsSync(PROD_CONFIG_PATH)) {
      const result = execSync(`bash -c "source ${PROD_CONFIG_PATH} && echo \\$${varName}"`).toString().trim();
      return result || null;
    }
    return null;
  } catch (error) {
    console.error(`Error getting configuration value ${varName}:`, error.message);
    return null;
  }
}

/**
 * Load complete configuration with appropriate fallbacks
 * Priority order:
 * 1. Environment variables (highest priority)
 * 2. Production config file (/etc/hasenpfeffr.conf)
 * 3. Development config file (.env)
 * 4. Default values (lowest priority)
 * @returns {Object} - Complete configuration object
 */
function loadConfig() {
  // Get values from config file
  const fileConfig = loadFromConfigFile();
  
  // Build the complete configuration object with fallbacks
  const config = {
    // Relay configuration
    relay: {
      url: process.env.HASENPFEFFR_RELAY_URL || 
           getConfigValue('HASENPFEFFR_RELAY_URL') || 
           fileConfig.HASENPFEFFR_RELAY_URL,
      
      pubkey: process.env.HASENPFEFFR_RELAY_PUBKEY || 
              getConfigValue('HASENPFEFFR_RELAY_PUBKEY') || 
              fileConfig.HASENPFEFFR_RELAY_PUBKEY,
      
      nsec: process.env.HASENPFEFFR_RELAY_NSEC || 
            getConfigValue('HASENPFEFFR_RELAY_NSEC') || 
            fileConfig.HASENPFEFFR_RELAY_NSEC
    },
    
    // Neo4j configuration
    neo4j: {
      uri: process.env.NEO4J_URI || 
           getConfigValue('NEO4J_URI') || 
           fileConfig.NEO4J_URI || 
           'bolt://localhost:7687',
      
      user: process.env.NEO4J_USER || 
            getConfigValue('NEO4J_USER') || 
            fileConfig.NEO4J_USER || 
            'neo4j',
      
      password: process.env.NEO4J_PASSWORD || 
                getConfigValue('NEO4J_PASSWORD') || 
                fileConfig.NEO4J_PASSWORD
    },
    
    // Processing configuration
    processing: {
      inputFile: process.env.HASENPFEFFR_INPUT_FILE || 
                 getConfigValue('HASENPFEFFR_INPUT_FILE') || 
                 fileConfig.HASENPFEFFR_INPUT_FILE || 
                 path.join(BASE_DIR, 'src/algos/nip85.json'),
      
      keysFile: process.env.HASENPFEFFR_KEYS_FILE || 
                getConfigValue('HASENPFEFFR_KEYS_FILE') || 
                fileConfig.HASENPFEFFR_KEYS_FILE || 
                path.join(BASE_DIR, 'src/nostr/keys/hasenpfeffr_relay_keys'),
      
      batchSize: parseInt(
        process.env.HASENPFEFFR_BATCH_SIZE || 
        getConfigValue('HASENPFEFFR_BATCH_SIZE') || 
        fileConfig.HASENPFEFFR_BATCH_SIZE || 
        '100', 10),
      
      delayBetweenBatches: parseInt(
        process.env.HASENPFEFFR_DELAY_BETWEEN_BATCHES || 
        getConfigValue('HASENPFEFFR_DELAY_BETWEEN_BATCHES') || 
        fileConfig.HASENPFEFFR_DELAY_BETWEEN_BATCHES || 
        '1000', 10),
      
      delayBetweenEvents: parseInt(
        process.env.HASENPFEFFR_DELAY_BETWEEN_EVENTS || 
        getConfigValue('HASENPFEFFR_DELAY_BETWEEN_EVENTS') || 
        fileConfig.HASENPFEFFR_DELAY_BETWEEN_EVENTS || 
        '50', 10),
      
      maxRetries: parseInt(
        process.env.HASENPFEFFR_MAX_RETRIES || 
        getConfigValue('HASENPFEFFR_MAX_RETRIES') || 
        fileConfig.HASENPFEFFR_MAX_RETRIES || 
        '3', 10),
      
      maxConcurrentConnections: parseInt(
        process.env.HASENPFEFFR_MAX_CONCURRENT_CONNECTIONS || 
        getConfigValue('HASENPFEFFR_MAX_CONCURRENT_CONNECTIONS') || 
        fileConfig.HASENPFEFFR_MAX_CONCURRENT_CONNECTIONS || 
        '5', 10)
    }
  };

  // Add paths to the configuration
  config.paths = {
    baseDir: BASE_DIR,
    publicDir: PUBLIC_DIR,
    dataDir: DATA_DIR,
    scriptsDir: SCRIPTS_DIR,
    setupDir: SETUP_DIR
  };

  // Add web configuration
  config.web = {
    port: parseInt(
      process.env.HASENPFEFFR_WEB_PORT || 
      getConfigValue('HASENPFEFFR_WEB_PORT') || 
      fileConfig.HASENPFEFFR_WEB_PORT || 
      '7778', 10),
    baseUrl: process.env.HASENPFEFFR_BASE_URL || 
             getConfigValue('HASENPFEFFR_BASE_URL') || 
             fileConfig.HASENPFEFFR_BASE_URL || 
             '/',
    ownerPubkey: process.env.HASENPFEFFR_OWNER_PUBKEY || 
                 getConfigValue('HASENPFEFFR_OWNER_PUBKEY') || 
                 fileConfig.HASENPFEFFR_OWNER_PUBKEY
  };

  // Validate required configuration
  if (!config.relay.url) {
    throw new Error('Relay URL is required. Set HASENPFEFFR_RELAY_URL environment variable or add it to /etc/hasenpfeffr.conf');
  }

  return config;
}

/**
 * Get a specific configuration value with fallbacks
 * @param {string} key - Dot notation path to the configuration value (e.g., 'neo4j.password')
 * @param {any} defaultValue - Default value if not found
 * @returns {any} - Configuration value or default
 */
function get(key, defaultValue = null) {
  const config = loadConfig();
  const parts = key.split('.');
  
  let value = config;
  for (const part of parts) {
    if (value === undefined || value === null || !Object.prototype.hasOwnProperty.call(value, part)) {
      return defaultValue;
    }
    value = value[part];
  }
  
  return value !== undefined ? value : defaultValue;
}

/**
 * Check if a configuration value exists
 * @param {string} key - Dot notation path to the configuration value
 * @returns {boolean} - True if the configuration value exists
 */
function has(key) {
  return get(key) !== null;
}

/**
 * Get all configuration values
 * @returns {Object} - Complete configuration object
 */
function getAll() {
  return loadConfig();
}

module.exports = {
  loadConfig,
  getConfigValue,
  get,
  has,
  getAll,
  BASE_DIR,
  PUBLIC_DIR,
  DATA_DIR,
  SCRIPTS_DIR,
  SETUP_DIR
};
