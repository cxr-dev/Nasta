import { test, expect } from '@playwright/test';

const routes = [
  {
    id: 'theme-page',
    name: 'Arbete',
    segments: [{
      id: 'theme-segment',
      line: '76',
      lineName: '76',
      direction: { code: 1, destination: 'Norra Hammarbyhamnen', stopPointId: '' },
      fromStop: { id: 'from', name: 'Lindarängsvägen', siteId: '100' },
      toStop: { id: 'to', name: 'Norra Hammarbyhamnen', siteId: '456' },
      transportType: 'bus',
    }],
  },
];

test.describe('theme preferences', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/*.integration.sl.se/**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ departures: [] }) });
    });
    await page.addInitScript((seededRoutes) => {
      if (!localStorage.getItem('nasta_routes')) localStorage.setItem('nasta_routes', JSON.stringify(seededRoutes));
      if (!localStorage.getItem('nasta_settings')) localStorage.setItem('nasta_settings', JSON.stringify({ theme: 'system', language: 'en' }));
    }, routes);
    await page.goto('/Nasta/', { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  });

  test('applies explicit Light and Dark preferences', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('nasta_settings', JSON.stringify({ theme: 'light', language: 'en' })));
    await page.reload();
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('light');

    await page.evaluate(() => localStorage.setItem('nasta_settings', JSON.stringify({ theme: 'dark', language: 'en' })));
    await page.reload();
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('dark');
  });

  test('follows the operating system in System mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('dark');

    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('light');
  });
});
