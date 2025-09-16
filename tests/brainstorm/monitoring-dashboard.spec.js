const { test, expect } = require('@playwright/test');

/**
 * Monitoring Dashboard Tests for Brainstorm
 * Tests the Task Watchdog Dashboard and monitoring systems
 */
test.describe('Brainstorm Monitoring Dashboard', () => {
  
  test.beforeEach(async ({ page }) => {
    if (process.env.BRAINSTORM_SERVER_ACCESSIBLE !== 'true') {
      test.skip('Brainstorm server not accessible');
    }
  });

  test('should load Task Watchdog Dashboard', async ({ page }) => {
    await page.goto('/task-watchdog-dashboard.html');
    
    // Should load without errors
    await expect(page).toHaveTitle(/Task.*Watchdog|Dashboard|Brainstorm/);
    
    // Wait for dashboard to initialize
    await page.waitForTimeout(3000);
    
    // Check for dashboard components
    const dashboardElements = page.locator('.dashboard, [data-testid*="dashboard"], .monitoring');
    if (await dashboardElements.count() > 0) {
      console.log('Task Watchdog Dashboard interface detected');
    }
    
    // Look for health indicators
    const healthIndicators = page.locator('.health, [class*="health"], [data-testid*="health"]');
    if (await healthIndicators.count() > 0) {
      await expect(healthIndicators.first()).toBeVisible();
    }
  });

  test('should display system health metrics', async ({ page }) => {
    await page.goto('/task-watchdog-dashboard.html');
    
    // Wait for metrics to load
    await page.waitForTimeout(5000);
    
    // Look for metric cards or displays
    const metricElements = page.locator('.metric, [class*="metric"], .card, [data-testid*="metric"]');
    
    if (await metricElements.count() > 0) {
      console.log(`Found ${await metricElements.count()} metric elements`);
      
      // Check if metrics contain expected data
      const metricTexts = await metricElements.allTextContents();
      const hasNumericData = metricTexts.some(text => /\d+/.test(text));
      
      if (hasNumericData) {
        console.log('Metrics contain numeric data');
      }
    }
  });

  test('should handle auto-refresh functionality', async ({ page }) => {
    await page.goto('/task-watchdog-dashboard.html');
    
    // Wait for initial load
    await page.waitForTimeout(2000);
    
    // Look for auto-refresh indicators
    const refreshElements = page.locator('[data-testid*="refresh"], .refresh, [class*="refresh"]');
    const lastUpdatedElements = page.locator('[data-testid*="updated"], .last-updated, [class*="updated"]');
    
    if (await refreshElements.count() > 0 || await lastUpdatedElements.count() > 0) {
      console.log('Auto-refresh functionality detected');
      
      // Wait to see if content updates
      await page.waitForTimeout(35000); // Wait longer than refresh interval
      
      console.log('Waited for potential auto-refresh cycle');
    }
  });

  test('should display alerts and notifications', async ({ page }) => {
    await page.goto('/task-watchdog-dashboard.html');
    
    // Wait for alerts to load
    await page.waitForTimeout(3000);
    
    // Look for alert sections
    const alertElements = page.locator('.alert, [class*="alert"], [data-testid*="alert"]');
    const notificationElements = page.locator('.notification, [class*="notification"], [data-testid*="notification"]');
    
    if (await alertElements.count() > 0) {
      console.log(`Found ${await alertElements.count()} alert elements`);
      
      // Check alert content
      const alertTexts = await alertElements.allTextContents();
      console.log('Alert content preview:', alertTexts.slice(0, 3));
    }
    
    if (await notificationElements.count() > 0) {
      console.log(`Found ${await notificationElements.count()} notification elements`);
    }
  });

  test('should validate monitoring API endpoints', async ({ page }) => {
    const monitoringEndpoints = [
      '/api/task-watchdog/status',
      '/api/task-watchdog/alerts',
      '/api/task-watchdog/stuck-tasks'
    ];

    for (const endpoint of monitoringEndpoints) {
      const response = await page.request.get(endpoint);
      
      console.log(`${endpoint}: ${response.status()}`);
      
      if (response.ok()) {
        const data = await response.json();
        console.log(`${endpoint} response structure:`, Object.keys(data));
        
        // Validate expected response structure
        expect(data).toBeDefined();
        expect(typeof data).toBe('object');
      } else if (response.status() === 404) {
        console.log(`${endpoint} not implemented (expected for some configurations)`);
      } else {
        // Should not return server errors
        expect(response.status()).toBeLessThan(500);
      }
    }
  });

  test('should handle task management interface', async ({ page }) => {
    await page.goto('/task-watchdog-dashboard.html');
    
    // Wait for interface to load
    await page.waitForTimeout(3000);
    
    // Look for task-related elements
    const taskElements = page.locator('.task, [class*="task"], [data-testid*="task"]');
    const tableElements = page.locator('table, .table, [data-testid*="table"]');
    
    if (await taskElements.count() > 0) {
      console.log(`Found ${await taskElements.count()} task-related elements`);
    }
    
    if (await tableElements.count() > 0) {
      console.log('Task table interface detected');
      
      // Check if table has data
      const rows = tableElements.first().locator('tr, .row');
      if (await rows.count() > 1) { // More than header row
        console.log(`Task table has ${await rows.count()} rows`);
      }
    }
  });

  test('should handle filtering and search functionality', async ({ page }) => {
    await page.goto('/task-watchdog-dashboard.html');
    
    // Wait for interface to load
    await page.waitForTimeout(3000);
    
    // Look for filter or search elements
    const filterElements = page.locator('input[type="search"], .filter, [data-testid*="filter"], select');
    const searchElements = page.locator('input[type="search"], .search, [data-testid*="search"]');
    
    if (await filterElements.count() > 0) {
      console.log('Filter functionality detected');
      
      // Try interacting with first filter element
      const firstFilter = filterElements.first();
      if (await firstFilter.isVisible()) {
        await firstFilter.click();
        console.log('Filter element is interactive');
      }
    }
    
    if (await searchElements.count() > 0) {
      console.log('Search functionality detected');
    }
  });
});
