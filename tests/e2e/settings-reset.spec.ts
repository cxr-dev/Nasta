import { expect, test } from '@playwright/test';

test('keeps empty-state header actions available after resetting local data', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('nasta_settings', JSON.stringify({ language: 'en', theme: 'light' }));
    localStorage.setItem('nasta_routes', JSON.stringify([{
      id: 'reset-page',
      name: 'Reset test',
      segments: [],
    }]));
  });

  await page.goto('/Nasta/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('.features-tab').evaluate((element) => element.scrollTop = element.scrollHeight);
  await page.getByRole('button', { name: 'Delete local app data' }).click();
  await page.getByLabel('Type RESET to confirm').fill('RESET');
  await page.getByRole('button', { name: 'Delete all data' }).click();

  await expect(page.locator('.empty-state')).toBeVisible();
  const header = page.locator('.empty-page-chrome');
  await expect(header.getByRole('button', { name: '+ Add' })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Settings' })).toBeVisible();

  await header.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('.settings-overlay.open')).toBeVisible();
  await page.getByRole('button', { name: 'Close settings' }).click();

  await header.getByRole('button', { name: '+ Add' }).click();
  await expect(page.locator('.settings-overlay.open')).toHaveCount(0);
});
