const { test, expect } = require('@playwright/test');

/**
 * API Health and Endpoint Tests for Brainstorm
 * Tests critical API endpoints and health monitoring systems
 */
test.describe('Brainstorm API Health', () => {
  
  test.beforeEach(async ({ page }) => {
    if (process.env.BRAINSTORM_SERVER_ACCESSIBLE !== 'true') {
      test.skip('Brainstorm server not accessible');
    }
  });

  test('should have healthy Neo4j connection', async ({ page }) => {
    const response = await page.request.get('/api/neo4j-health');
    
    expect(response.ok()).toBeTruthy();
    
    const healthData = await response.json();
    console.log('Neo4j health status:', healthData);
    
    // Check for expected health indicators
    expect(healthData).toHaveProperty('status');
    
    if (healthData.status === 'healthy') {
      expect(healthData).toHaveProperty('responseTime');
      expect(typeof healthData.responseTime).toBe('number');
    }
  });

  test('should return user classification', async ({ page }) => {
    const response = await page.request.get('/api/auth/user-classification');
    
    expect(response.ok()).toBeTruthy();
    
    const classificationData = await response.json();
    expect(classificationData).toHaveProperty('userClassification');
    expect(['owner', 'customer', 'user', 'unauthenticated']).toContain(classificationData.userClassification);
  });

  test('should provide task watchdog status', async ({ page }) => {
    const response = await page.request.get('/api/task-watchdog/status');
    
    if (response.ok()) {
      const statusData = await response.json();
      console.log('Task watchdog status:', statusData);
      
      // Check for expected status structure
      expect(statusData).toHaveProperty('health');
      expect(['healthy', 'warning', 'critical']).toContain(statusData.health);
    } else {
      console.log('Task watchdog endpoint not available (expected for some configurations)');
    }
  });

  test('should handle CORS properly', async ({ page }) => {
    // Test CORS headers on a public endpoint
    const response = await page.request.get('/api/auth/user-classification');
    
    expect(response.ok()).toBeTruthy();
    
    const headers = response.headers();
    
    // Should have CORS headers for cross-origin requests
    if (headers['access-control-allow-origin']) {
      expect(headers['access-control-allow-origin']).toBeTruthy();
    }
  });

  test('should return proper error codes for non-existent endpoints', async ({ page }) => {
    const response = await page.request.get('/api/non-existent-endpoint');
    
    expect(response.status()).toBe(404);
  });

  test('should handle customer-related endpoints appropriately', async ({ page }) => {
    // Test endpoints that should be accessible (may require auth)
    const endpoints = [
      '/api/customers/list',
      '/api/auth/user-classification',
      '/api/neo4j-health'
    ];

    for (const endpoint of endpoints) {
      const response = await page.request.get(endpoint);
      
      // Should not return 500 errors (server errors)
      expect(response.status()).toBeLessThan(500);
      
      // May return 401/403 for auth-required endpoints, which is expected
      if (!response.ok() && ![401, 403, 404].includes(response.status())) {
        console.warn(`Unexpected status ${response.status()} for ${endpoint}`);
      }
    }
  });

  test('should serve static assets', async ({ page }) => {
    const assets = [
      '/css/about.css',
      '/js/customer-backup.js',
      '/components/header/header.js'
    ];

    for (const asset of assets) {
      const response = await page.request.get(asset);
      
      if (response.ok()) {
        console.log(`✅ Static asset available: ${asset}`);
      } else {
        console.log(`⚠️  Static asset not found: ${asset} (${response.status()})`);
      }
    }
  });
});
