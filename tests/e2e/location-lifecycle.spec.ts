import { expect, test, type Page } from '@playwright/test';
import { CommuterApp } from './support/commuterApp';

async function removePermissionsApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined });
  });
}

async function mockNearbyStops(page: Page): Promise<void> {
  await page.route('**/v1/sites', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ id: 100, name: 'T-Centralen', lat: 59.33, lon: 18.06 }]),
  }));
}

test('restores an enabled, granted location after reload without the Permissions API', async ({ page, context }) => {
  const app = new CommuterApp(page);
  await app.mockDepartures();
  await mockNearbyStops(page);
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:4173' });
  await context.setGeolocation({ latitude: 59.33, longitude: 18.06 });
  await removePermissionsApi(page);
  await app.open();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('switch', { name: /Location services|Platsjänster/i }).click();
  await page.getByRole('button', { name: /Close settings|Stäng inställningar/i }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.keyboard.press('ArrowRight');

  const surface = page.locator('.nearby-surface');
  await expect(surface).toBeVisible();
  await expect(surface.getByRole('status', { name: /Your location|Din plats/i })).toBeVisible();
  await expect(surface.getByRole('button', { name: /Enable location|Retry|Aktivera plats|Försök igen/i })).toHaveCount(0);
  await expect(surface.getByRole('button', { name: /T-Centralen/i })).toBeVisible({ timeout: 15_000 });
});

test('keeps a nearby stop board open after a resource-style error', async ({ page }) => {
  const app = new CommuterApp(page);
  await app.mockDepartures();
  await page.route('**/journeyplanner.integration.sl.se/v2/stop-finder**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ locations: [{
      id: '9091001000100',
      name: 'T-Centralen',
      disassembledName: 'T-Centralen',
      coord: [59.33, 18.06],
      type: 'stop',
      productClasses: [1],
    }] }),
  }));
  await app.open();

  await page.keyboard.press('ArrowRight');
  const nearby = page.locator('.nearby-surface');
  await nearby.getByRole('textbox', { name: /search stops/i }).fill('Central');
  await nearby.getByRole('button', { name: /T-Centralen/i }).click();
  await expect(nearby.getByRole('heading', { name: 'T-Centralen' })).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event('error')));

  await expect(nearby.getByRole('heading', { name: 'T-Centralen' })).toBeVisible();
  await expect(nearby.locator('.board-panel .departure-list').getByText('Mörby centrum')).toBeVisible();
});
