import { expect, test, type Page } from '@playwright/test';
import { CommuterApp } from './support/commuterApp';

async function removePermissionsApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined });
  });
}

async function mockNearbyStops(page: Page, sites = [{ id: 100, name: 'T-Centralen', lat: 59.33, lon: 18.06 }]): Promise<void> {
  await page.route('**/v1/sites', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(sites),
  }));
}

test('requests a prompt location on cold activation without showing Retry', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'prompt' }) } });
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      configurable: true,
      value: (success: PositionCallback) => setTimeout(() => {
        success({ coords: { latitude: 59.33, longitude: 18.06, accuracy: 20 } } as GeolocationPosition);
      }, 250),
    });
  });
  const app = new CommuterApp(page);
  await app.mockDepartures();
  await mockNearbyStops(page);
  await app.open();
  await page.evaluate(() => {
    localStorage.setItem('nasta_settings', JSON.stringify({ language: 'en', theme: 'light', locationServicesEnabled: true }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.keyboard.press('ArrowRight');

  const surface = page.locator('.nearby-surface');
  await expect(surface.locator('.map-skeleton.visible')).toBeVisible();
  await expect(surface.locator('.location-prompt')).toContainText(/Finding your location|Hämtar plats/i);
  await expect(surface.locator('.map-location-status')).toHaveCount(0);
  await expect(surface.getByRole('button', { name: /Retry|Försök igen/i })).toHaveCount(0);
  await expect(surface.locator('.station-card').filter({ hasText: 'T-Centralen' })).toBeVisible({ timeout: 15_000 });
});

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
  await expect(surface.locator('.map-location-status')).toHaveCount(0);
  await expect(surface.getByRole('button', { name: /Enable location|Retry|Aktivera plats|Försök igen/i })).toHaveCount(0);
  await expect(surface.locator('.station-card').filter({ hasText: 'T-Centralen' })).toBeVisible({ timeout: 15_000 });
});

test('renders every nearby station as a visible named map marker', async ({ page, context }) => {
  const app = new CommuterApp(page);
  await app.mockDepartures();
  await mockNearbyStops(page, [
    { id: 101, name: 'North stop', lat: 59.331, lon: 18.059 },
    { id: 102, name: 'East stop', lat: 59.33, lon: 18.062 },
    { id: 103, name: 'South stop', lat: 59.329, lon: 18.06 },
  ]);
  await page.route('https://basemaps.cartocdn.com/gl/**/style.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#111' } }] }),
  }));
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:4173' });
  await context.setGeolocation({ latitude: 59.33, longitude: 18.06 });
  await app.open();
  await page.evaluate(() => {
    localStorage.setItem('nasta_settings', JSON.stringify({ language: 'en', theme: 'dark', locationServicesEnabled: true }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.keyboard.press('ArrowRight');

  const surface = page.locator('.nearby-surface');
  const markers = surface.locator('.nearby-stop-marker');
  const dots = surface.locator('.nearby-stop-marker-dot');
  await expect(surface.locator('.station-card')).toHaveCount(3, { timeout: 15_000 });
  await expect(markers).toHaveCount(3, { timeout: 15_000 });
  await expect(dots).toHaveCount(3);
  await expect(surface.locator('.nearby-stop-marker[aria-label="North stop"]')).toBeVisible();
  await expect(surface.locator('.nearby-stop-marker[aria-label="East stop"]')).toBeVisible();
  await expect(surface.locator('.nearby-stop-marker[aria-label="South stop"]')).toBeVisible();
  for (let index = 0; index < 3; index += 1) {
    const dot = dots.nth(index);
    await expect(dot).toBeVisible();
    await expect(dot).toHaveCSS('width', '25px');
    await expect(dot).toHaveCSS('height', '25px');
    expect(await dot.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  }
});

test('keeps two nearby departure previews contained at mobile width', async ({ page, context }) => {
  const app = new CommuterApp(page);
  await app.mockDepartures();
  await page.route('**/sites/*/departures**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ departures: [
      {
        line: { designation: '14' },
        direction_code: 1,
        destination: 'Mörby centrum',
        display: '5 min',
        expected: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
      {
        line: { designation: '1' },
        direction_code: 1,
        destination: 'Frihamnen',
        display: '12 min',
        expected: new Date(Date.now() + 12 * 60_000).toISOString(),
      },
    ] }),
  }));
  await mockNearbyStops(page);
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:4173' });
  await context.setGeolocation({ latitude: 59.33, longitude: 18.06 });
  await app.open();
  await page.evaluate(() => {
    localStorage.setItem('nasta_settings', JSON.stringify({ language: 'en', theme: 'dark', locationServicesEnabled: true }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.keyboard.press('ArrowRight');

  const card = page.locator('.station-card').filter({ hasText: 'T-Centralen' });
  const preview = card.locator('.station-preview');
  const rows = preview.locator('.departure-preview');
  await expect(rows).toHaveCount(2, { timeout: 15_000 });
  const bounds = await rows.evaluateAll((elements, previewElement) => ({
    preview: (previewElement as Element).getBoundingClientRect().toJSON(),
    rows: elements.map((element) => ({
      box: element.getBoundingClientRect().toJSON(),
      content: Array.from(element.children, (child) => child.getBoundingClientRect().toJSON()),
    })),
  }), await preview.elementHandle());

  expect(bounds.rows[0].box.bottom).toBeLessThanOrEqual(bounds.rows[1].box.top + 0.5);
  expect(bounds.rows[0].box.top).toBeGreaterThanOrEqual(bounds.preview.top - 0.5);
  expect(bounds.rows[1].box.bottom).toBeLessThanOrEqual(bounds.preview.bottom + 0.5);
  for (const row of bounds.rows) {
    expect(Math.min(...row.content.map((item) => item.top))).toBeGreaterThanOrEqual(row.box.top - 0.5);
    expect(Math.max(...row.content.map((item) => item.bottom))).toBeLessThanOrEqual(row.box.bottom + 0.5);
  }
});

test('keeps Nearby usable when the MapLibre module fails to load', async ({ page, context }) => {
  const app = new CommuterApp(page);
  await app.mockDepartures();
  await mockNearbyStops(page);
  await page.route('**/assets/*maplibre*', (route) => route.abort());
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:4173' });
  await context.setGeolocation({ latitude: 59.33, longitude: 18.06 });
  await app.open();
  await page.evaluate(() => {
    localStorage.setItem('nasta_settings', JSON.stringify({ language: 'en', theme: 'light', locationServicesEnabled: true }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.keyboard.press('ArrowRight');

  const surface = page.locator('.nearby-surface');
  await expect(surface.locator('.station-card').filter({ hasText: 'T-Centralen' })).toBeVisible({ timeout: 15_000 });
  await expect(surface.locator('.map-fallback')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
  await surface.locator('.station-card').filter({ hasText: 'T-Centralen' }).click();
  await expect(surface.getByRole('heading', { name: 'T-Centralen' })).toBeVisible();
});

test('moves focus safely from a nearby station into its departure board', async ({ page }) => {
  const ariaWarnings: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Blocked aria-hidden')) ariaWarnings.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

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
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.keyboard.press('ArrowRight');
  const nearby = page.locator('.nearby-surface');
  await nearby.getByRole('textbox', { name: /search stops/i }).fill('Central');
  const station = nearby.locator('.station-card').filter({ hasText: 'T-Centralen' });
  await station.click();

  await expect(nearby.getByRole('heading', { name: 'T-Centralen' })).toBeVisible();
  const back = nearby.getByRole('button', { name: /^Back$/i });
  await expect(back).toBeFocused();
  await back.click();
  await expect(nearby.getByRole('heading', { name: 'Nearby', level: 1 })).toBeVisible();
  await expect(station).toBeFocused();
  expect(ariaWarnings).toEqual([]);
  expect(pageErrors).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
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
  await nearby.locator('.station-card').filter({ hasText: 'T-Centralen' }).click();
  await expect(nearby.getByRole('heading', { name: 'T-Centralen' })).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event('error')));

  await expect(nearby.getByRole('heading', { name: 'T-Centralen' })).toBeVisible();
  await expect(nearby.locator('.board-panel .departure-list').getByText('Mörby centrum')).toBeVisible();
});
