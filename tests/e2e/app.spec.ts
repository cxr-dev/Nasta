import { test, expect } from '@playwright/test';

test.describe('Nästa App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display app title', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Nästa');
  });

  test('should show default routes', async ({ page }) => {
    await expect(page.locator('.route-tab')).toHaveCount(2);
    await expect(page.locator('.route-tab').first()).toHaveText('Jobb');
  });

  test('should toggle edit mode', async ({ page }) => {
    await page.click('.edit-btn');
    await expect(page.locator('.edit-btn')).toHaveText('Klar');
    await expect(page.locator('.route-editor')).toBeVisible();
  });

  test('should show empty state when no stops', async ({ page }) => {
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state')).toContainText('Inga stopp');
  });
});
