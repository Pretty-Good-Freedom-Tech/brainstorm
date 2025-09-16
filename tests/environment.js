/**
 * Environment configuration for Brainstorm Playwright tests
 * Handles different testing environments (local dev, AWS EC2, etc.)
 */

const config = {
  // Default to AWS EC2 production environment since user runs Brainstorm there
  BRAINSTORM_BASE_URL: process.env.BRAINSTORM_BASE_URL || 'http://your-aws-ec2-ip:7778',
  
  // Test data and configuration
  TEST_TIMEOUT: 60000,
  API_TIMEOUT: 30000,
  
  // Test user data (for non-destructive testing)
  TEST_SEARCH_TERMS: ['bitcoin', 'nostr', 'test'],
  
  // Expected response times (adjust based on AWS EC2 performance)
  EXPECTED_PAGE_LOAD_TIME: 10000,
  EXPECTED_API_RESPONSE_TIME: 5000,
  
  // Feature flags for conditional testing
  FEATURES: {
    TASK_WATCHDOG: true,
    CUSTOMER_MANAGEMENT: true,
    PROFILE_SEARCH: true,
    NIP85_STATUS: true,
    MONITORING_DASHBOARD: true
  }
};

module.exports = config;
