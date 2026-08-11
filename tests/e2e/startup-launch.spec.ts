import { expect, test } from '@playwright/test';

const routes = [
  {
    id: 'work',
    name: 'Work',
    segments: [{
      id: 'work-segment',
      line: '76',
      lineName: '76',
      direction: { code: 1, destination: 'Ropsten', stopPointId: '' },
      fromStop: { id: 'work-from', name: 'Slussen', siteId: '100' },
      toStop: { id: 'work-to', name: 'Ropsten', siteId: '200' },
      transportType: 'bus',
    }],
  },
  {
    id: 'home',
    name: 'Home',
    segments: [{
      id: 'home-segment',
      line: '13',
      lineName: '13',
      direction: { code: 1, destination: 'Nacka', stopPointId: '' },
      fromStop: { id: 'home-from', name: 'Centralen', siteId: '300' },
      toStop: { id: 'home-to', name: 'Nacka', siteId: '400' },
      transportType: 'metro',
    }],
  },
];

test.describe('cold-start launch state', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`resolves ${theme} before application JavaScript starts`, async ({ page }) => {
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem('nasta_settings', JSON.stringify({ theme: selectedTheme }));
      }, theme);
      await page.route('**/assets/*.js', route => route.abort());

      await page.goto('/Nasta/', { waitUntil: 'domcontentloaded' });

      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('#nasta-launch')).toBeVisible();
      await expect(page.locator('.launch-logo')).toHaveAttribute('src', './logosvg.svg');
    });
  }

  test('removes the launch state after app boot and honours a shared page', async ({ page }) => {
    await page.route('**/*.integration.sl.se/**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ departures: [] }),
    }));
    await page.addInitScript((seededRoutes) => {
      localStorage.setItem('nasta_settings', JSON.stringify({ theme: 'dark', language: 'en' }));
      localStorage.setItem('nasta_routes', JSON.stringify(seededRoutes));
    }, routes);

    await page.goto('/Nasta/#share?v=1&type=departure&s=300&n=Centralen&l=13&dir=Nacka&t=metro');

    await expect(page.locator('#nasta-launch')).toHaveCount(0);
    await expect(page.locator('h1.page-title')).toHaveText('Home');
  });

  test('removes the launch state without motion when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/Nasta/');

    await expect(page.locator('#nasta-launch')).toHaveCount(0);
  });
});
