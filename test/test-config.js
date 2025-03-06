/**
 * Test script for the enhanced configuration system
 */

// Set up environment variables for testing
process.env.HASENPFEFFR_RELAY_URL = 'wss://env-test-relay.com';
process.env.HASENPFEFFR_RELAY_PUBKEY = 'env-test-pubkey';
process.env.HASENPFEFFR_RELAY_NSEC = 'env-test-nsec';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Create a temporary test config file that we'll use instead of /etc/hasenpfeffr.conf
const testConfigPath = path.join(os.tmpdir(), 'test-hasenpfeffr.conf');
fs.writeFileSync(testConfigPath, `#!/bin/bash
# Test Configuration
export HASENPFEFFR_RELAY_URL="wss://file-test-relay.com"
export HASENPFEFFR_RELAY_PUBKEY="file-test-pubkey"
export HASENPFEFFR_RELAY_NSEC="file-test-nsec"
export NEO4J_URI="bolt://localhost:7687"
export NEO4J_USER="neo4j"
export NEO4J_PASSWORD="test-password"
export HASENPFEFFR_BATCH_SIZE="200"
`);

// Mock the fs module
const originalExistsSync = fs.existsSync;
const originalReadFileSync = fs.readFileSync;

fs.existsSync = (path) => {
  if (path === '/etc/hasenpfeffr.conf') {
    return true;
  }
  return originalExistsSync(path);
};

fs.readFileSync = (path, options) => {
  if (path === '/etc/hasenpfeffr.conf') {
    return fs.readFileSync(testConfigPath, options);
  }
  return originalReadFileSync(path, options);
};

// Mock the execSync function
const originalExecSync = require('child_process').execSync;

require('child_process').execSync = (cmd) => {
  if (cmd.includes('source /etc/hasenpfeffr.conf')) {
    // Extract the variable name from the command
    const varName = cmd.split('$')[1];
    
    // Return mock values based on the variable name
    switch (varName) {
      case 'HASENPFEFFR_RELAY_URL':
        return 'wss://file-test-relay.com\n';
      case 'HASENPFEFFR_RELAY_PUBKEY':
        return 'file-test-pubkey\n';
      case 'HASENPFEFFR_RELAY_NSEC':
        return 'file-test-nsec\n';
      case 'NEO4J_URI':
        return 'bolt://localhost:7687\n';
      case 'NEO4J_USER':
        return 'neo4j\n';
      case 'NEO4J_PASSWORD':
        return 'test-password\n';
      case 'HASENPFEFFR_BATCH_SIZE':
        return '200\n';
      default:
        return '\n';
    }
  }
  
  // For other commands, use the original execSync
  return originalExecSync(cmd);
};

// Now we can load our config module
const config = require('../lib/config');

// Test the configuration system
try {
  console.log('Testing configuration system...\n');
  
  // Test getConfigValue
  console.log('1. Testing getConfigValue:');
  console.log('NEO4J_PASSWORD:', config.getConfigValue('NEO4J_PASSWORD'));
  console.log('HASENPFEFFR_RELAY_URL:', config.getConfigValue('HASENPFEFFR_RELAY_URL'));
  console.log('HASENPFEFFR_BATCH_SIZE:', config.getConfigValue('HASENPFEFFR_BATCH_SIZE'));
  console.log();
  
  // Test loadConfig
  console.log('2. Testing loadConfig:');
  const fullConfig = config.loadConfig();
  console.log('relay.url:', fullConfig.relay.url);
  console.log('relay.pubkey:', fullConfig.relay.pubkey);
  console.log('neo4j.password:', fullConfig.neo4j.password);
  console.log('processing.batchSize:', fullConfig.processing.batchSize);
  console.log();
  
  // Test get
  console.log('3. Testing get:');
  console.log('neo4j.password:', config.get('neo4j.password'));
  console.log('relay.url:', config.get('relay.url'));
  console.log('processing.batchSize:', config.get('processing.batchSize'));
  console.log('non.existent.key (with default):', config.get('non.existent.key', 'default-value'));
  console.log();
  
  // Test has
  console.log('4. Testing has:');
  console.log('Has neo4j.password:', config.has('neo4j.password'));
  console.log('Has non.existent.key:', config.has('non.existent.key'));
  console.log();
  
  // Test priority order (env vars should override file config)
  console.log('5. Testing priority order:');
  console.log('Environment variable HASENPFEFFR_RELAY_URL:', process.env.HASENPFEFFR_RELAY_URL);
  console.log('Config file HASENPFEFFR_RELAY_URL:', config.getConfigValue('HASENPFEFFR_RELAY_URL'));
  console.log('Final config value relay.url:', config.get('relay.url'));
  console.log();
  
  console.log('All tests completed successfully!');
} catch (error) {
  console.error('Test failed:', error);
} finally {
  // Restore original functions
  fs.existsSync = originalExistsSync;
  fs.readFileSync = originalReadFileSync;
  require('child_process').execSync = originalExecSync;
  
  // Clean up test file
  try {
    fs.unlinkSync(testConfigPath);
  } catch (e) {
    // Ignore cleanup errors
  }
}
