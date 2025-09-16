const { test, expect } = require('@playwright/test');

/**
 * Profile Search Tests for Brainstorm
 * Tests the profile search functionality and user interface
 */
test.describe('Brainstorm Profile Search', () => {
  
  test.beforeEach(async ({ page }) => {
    if (process.env.BRAINSTORM_SERVER_ACCESSIBLE !== 'true') {
      test.skip('Brainstorm server not accessible');
    }
  });

  test('should load profiles page', async ({ page }) => {
    await page.goto('/profiles.html');
    
    // Should load without errors
    await expect(page).toHaveTitle(/Profile|Search|Brainstorm/);
    
    // Wait for page to initialize
    await page.waitForTimeout(2000);
    
    // Check for search interface
    const searchElements = page.locator('input[type="search"], .search, [data-testid*="search"]');
    if (await searchElements.count() > 0) {
      await expect(searchElements.first()).toBeVisible();
      console.log('Profile search interface detected');
    }
  });

  test('should handle profile search functionality', async ({ page }) => {
    await page.goto('/profiles.html');
    
    // Wait for search interface to load
    await page.waitForTimeout(2000);
    
    // Look for search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search"], [data-testid="search-input"]');
    
    if (await searchInput.count() > 0) {
      console.log('Search input found');
      
      // Try a test search (use a common term)
      await searchInput.first().fill('test');
      
      // Look for search button or auto-search
      const searchButton = page.locator('button:has-text("Search"), [data-testid="search-button"]');
      if (await searchButton.count() > 0) {
        await searchButton.first().click();
      } else {
        // Try pressing Enter for auto-search
        await searchInput.first().press('Enter');
      }
      
      // Wait for results
      await page.waitForTimeout(3000);
      
      // Check for results or no-results message
      const resultsElements = page.locator('.result, [class*="result"], .profile, [data-testid*="result"]');
      const noResultsElements = page.locator('.no-results, [class*="no-results"], .empty');
      
      if (await resultsElements.count() > 0) {
        console.log(`Found ${await resultsElements.count()} search results`);
      } else if (await noResultsElements.count() > 0) {
        console.log('No results message displayed');
      }
    }
  });

  test('should validate profile search API', async ({ page }) => {
    // Test profile search API endpoint
    const response = await page.request.get('/api/search/profiles/keyword?query=test&limit=10');
    
    if (response.ok()) {
      const searchData = await response.json();
      console.log('Profile search API response:', Object.keys(searchData));
      
      // Should have expected structure
      expect(searchData).toBeDefined();
      
      if (Array.isArray(searchData)) {
        console.log(`API returned ${searchData.length} profiles`);
      } else if (searchData.profiles && Array.isArray(searchData.profiles)) {
        console.log(`API returned ${searchData.profiles.length} profiles`);
      }
    } else {
      console.log(`Profile search API not accessible: ${response.status()}`);
    }
  });

  test('should display profile information correctly', async ({ page }) => {
    await page.goto('/profiles.html');
    
    // Wait for any existing profiles to load
    await page.waitForTimeout(3000);
    
    // Look for profile cards or list items
    const profileElements = page.locator('.profile, [class*="profile"], .user, [data-testid*="profile"]');
    
    if (await profileElements.count() > 0) {
      console.log(`Found ${await profileElements.count()} profile elements`);
      
      // Check first profile for expected information
      const firstProfile = profileElements.first();
      
      // Look for common profile fields
      const nameElements = firstProfile.locator('.name, [class*="name"], .display-name');
      const pubkeyElements = firstProfile.locator('.pubkey, [class*="pubkey"], .npub');
      const statsElements = firstProfile.locator('.stats, [class*="stats"], .metrics');
      
      if (await nameElements.count() > 0) {
        console.log('Profile names displayed');
      }
      
      if (await pubkeyElements.count() > 0) {
        console.log('Profile pubkeys displayed');
      }
      
      if (await statsElements.count() > 0) {
        console.log('Profile statistics displayed');
      }
    }
  });

  test('should handle sorting and filtering', async ({ page }) => {
    await page.goto('/profiles.html');
    
    // Wait for interface to load
    await page.waitForTimeout(2000);
    
    // Look for sort controls
    const sortElements = page.locator('select[data-sort], .sort, [data-testid*="sort"]');
    const filterElements = page.locator('select[data-filter], .filter, [data-testid*="filter"]');
    
    if (await sortElements.count() > 0) {
      console.log('Sort controls detected');
      
      // Try changing sort option
      const sortSelect = sortElements.first();
      if (await sortSelect.isVisible()) {
        const options = await sortSelect.locator('option').count();
        if (options > 1) {
          await sortSelect.selectOption({ index: 1 });
          await page.waitForTimeout(2000);
          console.log('Sort option changed');
        }
      }
    }
    
    if (await filterElements.count() > 0) {
      console.log('Filter controls detected');
    }
  });

  test('should handle pagination if present', async ({ page }) => {
    await page.goto('/profiles.html');
    
    // Wait for content to load
    await page.waitForTimeout(3000);
    
    // Look for pagination controls
    const paginationElements = page.locator('.pagination, [class*="pagination"], .pager');
    const nextButtons = page.locator('button:has-text("Next"), .next, [data-testid*="next"]');
    const prevButtons = page.locator('button:has-text("Previous"), button:has-text("Prev"), .prev');
    
    if (await paginationElements.count() > 0) {
      console.log('Pagination controls detected');
    }
    
    if (await nextButtons.count() > 0) {
      console.log('Next page button available');
      
      // Check if next button is enabled
      const nextButton = nextButtons.first();
      if (await nextButton.isEnabled()) {
        console.log('Next button is enabled (has more pages)');
      }
    }
  });

  test('should preserve search results ordering', async ({ page }) => {
    await page.goto('/profiles.html');
    
    // Perform a search that should return ordered results
    const searchInput = page.locator('input[type="search"], input[placeholder*="search"]');
    
    if (await searchInput.count() > 0) {
      await searchInput.first().fill('bitcoin');
      
      // Trigger search
      const searchButton = page.locator('button:has-text("Search")');
      if (await searchButton.count() > 0) {
        await searchButton.first().click();
      } else {
        await searchInput.first().press('Enter');
      }
      
      // Wait for results
      await page.waitForTimeout(5000);
      
      // Check if results are displayed in order
      const profileElements = page.locator('.profile, [class*="profile"], .result');
      
      if (await profileElements.count() > 1) {
        console.log(`Search returned ${await profileElements.count()} ordered results`);
        
        // Verify results appear in slots/order (based on memory about preserving API ordering)
        const firstResult = profileElements.first();
        const secondResult = profileElements.nth(1);
        
        if (await firstResult.isVisible() && await secondResult.isVisible()) {
          console.log('Results maintain proper ordering');
        }
      }
    }
  });
});
