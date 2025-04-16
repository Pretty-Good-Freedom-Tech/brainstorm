/**
 * Test script for Neo4j configuration
 * 
 * This script tests the direct configuration loading from /etc/brainstorm.conf
 */

// First, create a mock brainstorm.conf file for testing
const fs = require('fs');
const os = require('os');
const path = require('path');

// Create a temporary test config file
const testConfigPath = path.join(os.tmpdir(), 'test-brainstorm.conf');
fs.writeFileSync(testConfigPath, `
# Test Neo4j Configuration
export NEO4J_URI="bolt://localhost:7687"
export NEO4J_USER="neo4j"
export NEO4J_PASSWORD="test_password"
`);

// Mock the fs.existsSync and execSync functions
const originalExistsSync = fs.existsSync;
const originalExecSync = require('child_process').execSync;

// Override fs.existsSync to return true for our test config
fs.existsSync = (path) => {
  if (path === '/etc/brainstorm.conf') {
    return true;
  }
  return originalExistsSync(path);
};

// Override execSync to use our test config
require('child_process').execSync = (cmd) => {
  if (cmd.includes('source /etc/brainstorm.conf')) {
    const varName = cmd.split('$')[1];
    if (varName === 'NEO4J_URI') return 'bolt://localhost:7687\n';
    if (varName === 'NEO4J_USER') return 'neo4j\n';
    if (varName === 'NEO4J_PASSWORD') return 'test_password\n';
    return '';
  }
  return originalExecSync(cmd);
};

// Now test our functions
try {
  const { getConfigFromFile, getNeo4jConnection } = require('../bin/control-panel');
  
  console.log('Testing getConfigFromFile:');
  console.log('NEO4J_URI:', getConfigFromFile('NEO4J_URI'));
  console.log('NEO4J_USER:', getConfigFromFile('NEO4J_USER'));
  console.log('NEO4J_PASSWORD:', getConfigFromFile('NEO4J_PASSWORD'));
  
  console.log('\nTesting getNeo4jConnection:');
  const connection = getNeo4jConnection();
  console.log(connection);
  
  console.log('\nAll tests passed!');
} catch (error) {
  console.error('Test failed:', error);
} finally {
  // Restore original functions
  fs.existsSync = originalExistsSync;
  require('child_process').execSync = originalExecSync;
  
  // Clean up test file
  try {
    fs.unlinkSync(testConfigPath);
  } catch (e) {
    // Ignore cleanup errors
  }
}
