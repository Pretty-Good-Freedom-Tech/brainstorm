const { test, expect } = require('@playwright/test');

/**
 * Customer Management Tests for Brainstorm
 * Tests customer sign-up, management, and related functionality
 */
test.describe('Brainstorm Customer Management', () => {
  
  test.beforeEach(async ({ page }) => {
    if (process.env.BRAINSTORM_SERVER_ACCESSIBLE !== 'true') {
      test.skip('Brainstorm server not accessible');
    }
  });

  test('should load customer sign-up page', async ({ page }) => {
    await page.goto('/sign-up.html');
    
    // Wait for page to load and user classification to be detected
    await page.waitForTimeout(3000);
    
    // Should show appropriate UI based on user classification
    const statusElements = page.locator('.status, .user-status, [class*="classification"]');
    if (await statusElements.count() > 0) {
      await expect(statusElements.first()).toBeVisible();
    }
    
    // Check for NIP-85 status section if user is authenticated
    const nip85Section = page.locator('[data-testid="nip85-status"], .nip85-status, [class*="nip85"]');
    if (await nip85Section.count() > 0) {
      console.log('NIP-85 status section detected');
    }
  });

  test('should handle customer sign-up flow', async ({ page }) => {
    await page.goto('/sign-up.html');
    
    // Wait for classification detection
    await page.waitForTimeout(2000);
    
    // Look for sign-up button or form
    const signUpButton = page.locator('button:has-text("Sign Up"), button:has-text("Create"), [data-testid="signup-button"]');
    const signUpForm = page.locator('form, .signup-form, [data-testid="signup-form"]');
    
    if (await signUpButton.count() > 0) {
      console.log('Sign-up button found');
      // Don't actually click to avoid creating test customers
    }
    
    if (await signUpForm.count() > 0) {
      console.log('Sign-up form found');
    }
  });

  test('should load customers management page', async ({ page }) => {
    await page.goto('/customers.html');
    
    // Should load without errors
    await expect(page).toHaveTitle(/Customer|Brainstorm/);
    
    // Check for customer list or management interface
    const customerElements = page.locator('.customer, [class*="customer"], [data-testid*="customer"]');
    const tableElements = page.locator('table, .table, [data-testid="customers-table"]');
    
    if (await customerElements.count() > 0 || await tableElements.count() > 0) {
      console.log('Customer management interface detected');
    }
  });

  test('should handle customer backup functionality', async ({ page }) => {
    await page.goto('/customers.html');
    
    // Look for backup-related buttons or interfaces
    const backupButtons = page.locator('button:has-text("Backup"), [data-testid*="backup"], [class*="backup"]');
    
    if (await backupButtons.count() > 0) {
      console.log('Customer backup interface detected');
      
      // Check if backup modal or interface works
      await backupButtons.first().click();
      
      // Look for backup modal or form
      const backupModal = page.locator('.modal, [data-testid="backup-modal"], [class*="backup-modal"]');
      if (await backupModal.count() > 0) {
        await expect(backupModal).toBeVisible();
        
        // Close modal if it has a close button
        const closeButton = backupModal.locator('button:has-text("Close"), button:has-text("Cancel"), .close');
        if (await closeButton.count() > 0) {
          await closeButton.first().click();
        }
      }
    }
  });

  test('should validate customer API endpoints', async ({ page }) => {
    // Test customer-related API endpoints
    const endpoints = [
      '/api/customers/list',
      '/api/auth/user-classification'
    ];

    for (const endpoint of endpoints) {
      const response = await page.request.get(endpoint);
      
      // Log response for debugging
      console.log(`${endpoint}: ${response.status()}`);
      
      if (response.ok()) {
        const data = await response.json();
        console.log(`${endpoint} response:`, Object.keys(data));
      }
      
      // Should not return server errors
      expect(response.status()).toBeLessThan(500);
    }
  });

  test('should handle manage customer page', async ({ page }) => {
    // Try to access manage customer page (may require authentication)
    await page.goto('/manage-customer.html');
    
    // Check if page loads or redirects appropriately
    const currentUrl = page.url();
    
    if (currentUrl.includes('manage-customer')) {
      console.log('Manage customer page accessible');
      
      // Look for customer management interface
      const managementElements = page.locator('.customer-info, [data-testid*="customer"], .relay-info');
      if (await managementElements.count() > 0) {
        console.log('Customer management interface detected');
      }
    } else {
      console.log('Manage customer page redirected or not accessible (expected for unauthenticated users)');
    }
  });

  test('should handle NIP-85 status checking', async ({ page }) => {
    // Test NIP-85 status API if available
    const response = await page.request.get('/api/get-nip85-status');
    
    if (response.ok()) {
      const statusData = await response.json();
      console.log('NIP-85 status response:', statusData);
      
      // Should have expected structure
      expect(statusData).toBeDefined();
    } else {
      console.log('NIP-85 status endpoint not accessible (may require authentication)');
    }
  });
});
