import { test, expect } from './support/mobileTest';
import { CommuterApp, defaultTestPage } from './support/commuterApp';
import { readFile } from 'node:fs/promises';

test.describe('mobile saved commute', { tag: '@mobile-core' }, () => {
  test('searches, saves and expands a journey', { tag: '@mobile-smoke' }, async ({ page }) => {
    const app = new CommuterApp(page);
    await app.mockDepartures();
    await page.route('**/journeyplanner.integration.sl.se/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('stop-finder')) {
        const name = url.searchParams.get('name_sf') || 'Odenplan';
        return route.fulfill({ json: { locations: [{ id: name, name, disassembledName: name, type: 'stop', lat: 59.33, lon: 18.06 }] } });
      }
      if (url.searchParams.get('max_changes') === '0') return route.fulfill({ json: { journeys: [] } });
      return route.fulfill({ json: { journeys: [{ legs: [{
        origin: { name: 'Odenplan', departureTimePlanned: new Date(Date.now() + 300_000).toISOString() },
        destination: { name: 'Slussen', arrivalTimePlanned: new Date(Date.now() + 900_000).toISOString() },
        transportation: { name: 'Metro 14', disassembledName: '14', product: { name: 'METRO' } },
        duration: 600, direction: 1, directionName: 'Slussen',
      }] }] } });
    });
    await app.open({ ...defaultTestPage, segments: [] });
    await page.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('tab', { name: 'Route', exact: true }).tap();
    await page.getByRole('textbox', { name: /^From$/i }).fill('Odenplan');
    await page.getByRole('button', { name: /Odenplan.*Stop/ }).tap();
    await page.getByRole('textbox', { name: /^To$/i }).fill('Slussen');
    await page.getByRole('button', { name: /Slussen.*Stop/ }).tap();
    await page.getByRole('button', { name: 'Find route', exact: true }).tap();
    const result = page.locator('.result-card');
    await expect(result).toHaveCount(1);
    await result.tap();
    await page.getByRole('button', { name: 'Add journey', exact: true }).tap();
    const journey = page.locator('.page-slot:not(.page-slot-preview) .journey-card');
    await expect(journey).toContainText('Slussen');
    await journey.locator('.card-main').tap();
    await expect(journey).toContainText('Odenplan');
    await expect(journey).toContainText('14');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('nasta_routes')!)[0].segments.length)).toBe(1);
    await page.reload();
    await expect(journey).toContainText('Slussen');
  });

  test('removes a departure and restores it with Undo', { tag: '@mobile-smoke' }, async ({ page }) => {
    const app = new CommuterApp(page);
    await app.mockDepartures();
    await app.open();
    await expect(app.countdown()).toBeVisible();
    await app.card().locator('.card-main').tap();
    await app.card().getByRole('button', { name: /More actions/ }).click();
    await page.getByRole('button', { name: 'Remove departure', exact: true }).click();
    await expect(app.card()).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(app.countdown()).toBeVisible();
    await page.reload();
    await expect(app.countdown()).toBeVisible();
  });

  test('edits a saved departure direction and retains it after reload', { tag: '@mobile-smoke' }, async ({ page }) => {
    const app = new CommuterApp(page);
    await app.mockDepartures();
    await page.route('**/sites/100/departures?*', (route) => route.fulfill({ json: { departures: [1, 2].map((direction) => ({
      line: { designation: '14' }, direction_code: direction,
      destination: direction === 1 ? 'Mörby centrum' : 'Slussen', display: '3 min',
      expected: new Date(Date.now() + 180_000).toISOString(),
    })) } }));
    await app.open();
    await expect(app.countdown()).toBeVisible();
    await app.card().locator('.card-main').tap();
    await app.card().getByRole('button', { name: /More actions/ }).click();
    await page.getByRole('button', { name: 'Edit departure', exact: true }).click();
    await page.getByRole('radiogroup', { name: 'Select direction' }).getByText('Slussen', { exact: true }).tap();
    await expect(page.getByRole('radio', { name: /Slussen/ })).toBeChecked();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(app.card()).toHaveCount(1);
    await expect(app.card()).toContainText('Slussen');
    await page.reload();
    await expect(app.card()).toContainText('Slussen');
    await expect(app.countdown()).toBeVisible();
  });

  test('copies a usable share link when native sharing is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async (text: string) => { (window as unknown as { copiedLink: string }).copiedLink = text; },
      } });
    });
    const app = new CommuterApp(page);
    await app.mockDepartures();
    await app.open();
    await expect(app.countdown()).toBeVisible();
    await app.card().locator('.card-main').tap();
    await app.card().getByRole('button', { name: 'Share departure', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { copiedLink?: string }).copiedLink)).toContain('/Nasta/#share?');
    const link = await page.evaluate(() => (window as unknown as { copiedLink: string }).copiedLink);
    expect(link).toContain('type=departure');
    expect(link).toContain('l=14');
    await expect(app.countdown()).toBeVisible();
  });

  test('exports, resets and imports a backup through the settings UI', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
    });
    const app = new CommuterApp(page);
    await app.mockDepartures();
    await app.open();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export backup' }).click();
    const download = await downloadPromise;
    const backup = await readFile((await download.path())!);
    expect(JSON.parse(backup.toString()).pages[0].segments).toHaveLength(1);
    await page.getByRole('button', { name: 'Delete local app data' }).click();
    await page.getByLabel('Type RESET to confirm').fill('RESET');
    await page.getByRole('button', { name: 'Delete all data', exact: true }).click();
    await expect(app.card()).toHaveCount(0);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Backup file', { exact: true }).setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
    await page.getByRole('button', { name: 'Replace current data', exact: true }).click();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByRole('button', { name: 'Close settings' }).click();
    await expect(app.countdown()).toBeVisible();
    await page.reload();
    await expect(app.card()).toHaveCount(1);
    await expect(app.countdown()).toBeVisible();
  });

  test('refreshes with a downward touch gesture without replacing the card', { tag: '@mobile-smoke' }, async ({ page }) => {
    const app = new CommuterApp(page);
    await app.mockDepartures();
    await app.open();
    await expect(app.countdown()).toBeVisible();
    await app.card().evaluate((el) => el.setAttribute('data-retained', 'yes'));
    const requested = page.waitForRequest('**/sites/100/departures?*');
    const { emitTouch } = await import('./support/motion');
    await emitTouch(page, '.card-list', 'touchstart', 195, 250);
    await emitTouch(page, '.card-list', 'touchmove', 195, 410);
    await emitTouch(page, '.card-list', 'touchend', 195, 410);
    await requested;
    await expect(app.countdown()).toBeVisible();
    await expect(app.card()).toHaveAttribute('data-retained', 'yes');
  });
});
