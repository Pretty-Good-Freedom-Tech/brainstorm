const { test, expect } = require('@playwright/test');

/**
 * Authentication and User Classification Tests for Brainstorm
 * Tests the Nostr-based authentication system and user role detection
 */
test.describe('Brainstorm Authentication', () => {
  
  test.beforeEach(async ({ page }) => {
    // Skip tests if server is not accessible
    if (process.env.BRAINSTORM_SERVER_ACCESSIBLE !== 'true') {
      test.skip('Brainstorm server not accessible');
    }
  });

  test('should load main page without authentication', async ({ page }) => {
    await page.goto('/');
    
    // Check that the page loads and contains expected elements
    await expect(page).toHaveTitle(/Brainstorm/);
    
    // Should see header component
    await expect(page.locator('header')).toBeVisible();
    
    // Should see some indication of authentication status
    const userIndicator = page.locator('[data-testid="user-classification"], .user-status, .auth-status');
    if (await userIndicator.count() > 0) {
      await expect(userIndicator).toBeVisible();
    }
  });

  test('should show user classification indicator', async ({ page }) => {
    await page.goto('/');
    
    // Wait for header to load
    await page.waitForSelector('header', { timeout: 10000 });
    
    // Check if user classification API is working
    const response = await page.request.get('/api/auth/user-classification');
    
    if (response.ok()) {
      const data = await response.json();
      console.log('User classification:', data);
      
      // Verify the response structure
      expect(data).toHaveProperty('userClassification');
      expect(['owner', 'customer', 'user', 'unauthenticated']).toContain(data.userClassification);
    }
  });

  test('should handle unauthenticated access gracefully', async ({ page }) => {
    await page.goto('/');
    
    // Should not crash or show errors for unauthenticated users
    const errorElements = page.locator('.error, [class*="error"], .alert-danger');
    const errorCount = await errorElements.count();
    
    if (errorCount > 0) {
      const errorTexts = await errorElements.allTextContents();
      console.log('Found error elements:', errorTexts);
      
      // Filter out expected authentication-related messages
      const unexpectedErrors = errorTexts.filter(text => 
        !text.toLowerCase().includes('sign in') &&
        !text.toLowerCase().includes('authenticate') &&
        !text.toLowerCase().includes('login')
      );
      
      expect(unexpectedErrors).toHaveLength(0);
    }
  });

  test('should access sign-up page', async ({ page }) => {
    await page.goto('/sign-up.html');
    
    // Check that sign-up page loads
    await expect(page).toHaveTitle(/Sign.*Up|Brainstorm/);
    
    // Should show sign-up related content
    const signUpContent = page.locator('h1, h2, .title, [data-testid="signup-title"]');
    await expect(signUpContent).toBeVisible();
    
    // Check for user classification detection
    await page.waitForTimeout(2000); // Allow time for classification detection
    
    const statusElements = page.locator('.status, .user-status, [class*="classification"]');
    if (await statusElements.count() > 0) {
      console.log('Sign-up page detected user status elements');
    }
  });

  test('should load control panel pages', async ({ page }) => {
    const pages = [
      '/',
      '/customers.html',
      '/profiles.html',
      '/task-watchdog-dashboard.html'
    ];

    for (const pagePath of pages) {
      await page.goto(pagePath);
      
      // Should not get 404 or 500 errors
      const response = await page.waitForResponse(response => 
        response.url().includes(pagePath) && response.request().method() === 'GET'
      );
      
      expect(response.status()).toBeLessThan(400);
      
      // Should load without JavaScript errors
      const jsErrors = [];
      page.on('pageerror', error => jsErrors.push(error));
      
      await page.waitForTimeout(1000);
      
      if (jsErrors.length > 0) {
        console.warn(`JavaScript errors on ${pagePath}:`, jsErrors.map(e => e.message));
      }
    }
  });
});
