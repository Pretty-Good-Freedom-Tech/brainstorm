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
    // Session configuration
    SESSION_SECRET: process.env.SESSION_SECRET || 
                    fileConfig.SESSION_SECRET || 
                    'hasenpfeffr-default-session-secret-please-change-in-production',
    
    // Relay configuration
    relay: {
      url: process.env.HASENPFEFFR_RELAY_URL || 
          fileConfig.HASENPFEFFR_RELAY_URL || 
          'wss://relay.hasenpfeffr.com',
      
      backupRelays: (process.env.HASENPFEFFR_BACKUP_RELAYS || 
                    fileConfig.HASENPFEFFR_BACKUP_RELAYS || 
                    'wss://relay.damus.io,wss://relay.nostr.band,wss://nos.lol')
                    .split(',').map(url => url.trim()),
      
      domain: process.env.STRFRY_DOMAIN || 
              fileConfig.STRFRY_DOMAIN || 
              'localhost'
    },
    
    // Neo4j configuration
    neo4j: {
      uri: process.env.NEO4J_URI || 
           fileConfig.NEO4J_URI || 
           'bolt://localhost:7687',
      
      user: process.env.NEO4J_USER || 
            fileConfig.NEO4J_USER || 
            'neo4j',
      
      password: process.env.NEO4J_PASSWORD || 
                fileConfig.NEO4J_PASSWORD || 
                'neo4j'
    },
    
    // Server configuration
    server: {
      port: parseInt(process.env.PORT || fileConfig.PORT || 3000, 10),
      host: process.env.HOST || fileConfig.HOST || 'localhost',
      env: process.env.NODE_ENV || fileConfig.NODE_ENV || 'development'
    },
    
    // Path configuration
    paths: {
      base: process.cwd(),
      public: path.join(process.cwd(), 'public'),
      lib: path.join(process.cwd(), 'lib'),
      bin: path.join(process.cwd(), 'bin')
    },
    
    // Authentication configuration
    auth: {
      enabled: process.env.AUTH_ENABLED !== 'false' && 
               fileConfig.AUTH_ENABLED !== 'false',
      
      publicPages: (process.env.AUTH_PUBLIC_PAGES || 
                   fileConfig.AUTH_PUBLIC_PAGES || 
                   '/, /index.html, /sign-in.html')
                   .split(',').map(page => page.trim()),
      
      ownerPubkey: process.env.OWNER_PUBKEY || 
                   fileConfig.OWNER_PUBKEY || 
                   ''
    },
    
    // Logging configuration
    logging: {
      level: process.env.LOG_LEVEL || 
             fileConfig.LOG_LEVEL || 
             'info'
    }
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
    if (value === undefined || value === null || typeof value !== 'object') {
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
  PROD_CONFIG_PATH,
  DEV_CONFIG_PATH
};
