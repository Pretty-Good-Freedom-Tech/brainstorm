/**
 * Global teardown for Brainstorm Playwright tests
 * Cleanup operations after all tests complete
 */
async function globalTeardown(config) {
  console.log('🧹 Starting Brainstorm test suite global teardown...');
  
  try {
    // Clean up any temporary test data or resources
    // For now, just log completion
    console.log('✅ Global teardown completed successfully');
    
  } catch (error) {
    console.error('❌ Global teardown failed:', error.message);
    // Don't throw here to avoid masking test failures
  }
}

module.exports = globalTeardown;
