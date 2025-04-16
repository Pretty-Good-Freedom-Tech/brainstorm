/**
 * Basic test for Brainstorm
 * 
 * This is a simple test to verify that the package is working correctly.
 * In a real-world scenario, you would use a testing framework like Jest or Mocha.
 */

const { loadConfig } = require('../lib/config');

// Mock environment variables for testing
process.env.BRAINSTORM_RELAY_URL = 'wss://test-relay.com';
process.env.BRAINSTORM_RELAY_PUBKEY = 'test-pubkey';

// Test configuration loading
function testConfigLoading() {
  try {
    const config = loadConfig();
    console.log('Configuration loaded successfully:', Object.keys(config));
    return true;
  } catch (error) {
    console.error('Configuration loading failed:', error.message);
    return false;
  }
}

// Run tests
console.log('Running Brainstorm tests...');
const configTest = testConfigLoading();

console.log('\nTest Results:');
console.log('-------------');
console.log(`Configuration Loading: ${configTest ? 'PASS' : 'FAIL'}`);
console.log(`Overall: ${configTest ? 'PASS' : 'FAIL'}`);

// Exit with appropriate code
process.exit(configTest ? 0 : 1);
