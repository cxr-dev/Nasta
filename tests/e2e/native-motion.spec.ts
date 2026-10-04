import { expect, test, type Page } from '@playwright/test';
import { emitTouch, readOffset } from './support/motion';
import type { TestPage } from './support/commuterApp';

const pages: TestPage[] = [
  {
    id: 'native-motion-a', name: 'Morning', segments: [{
      id: 'native-motion-a-segment', line: '14', lineName: '14',
      direction: { code: 1, destination: 'Mörby centrum', stopPointId: '' },
      fromStop: { id: 'native-motion-a-from', name: 'T-Centralen', siteId: '100' },
      toStop: { id: 'native-motion-a-to', name: 'Mörby centrum', siteId: '456' }, transportType: 'metro',
    }],
  },
  {
    id: 'native-motion-b', name: 'Afternoon', segments: [{
      id: 'native-motion-b-segment', line: '13', lineName: '13',
      direction: { code: 1, destination: 'Ropsten', stopPointId: '' },
      fromStop: { id: 'native-motion-b-from', name: 'Slussen', siteId: '101' },
      toStop: { id: 'native-motion-b-to', name: 'Ropsten', siteId: '457' }, transportType: 'metro',
    }],
  },
  {
    id: 'native-motion-c', name: 'Evening', segments: [{
      id: 'native-motion-c-segment', line: '76', lineName: '76',
      direction: { code: 1, destination: 'Norra Hammarbyhamnen', stopPointId: '' },
      fromStop: { id: 'native-motion-c-from', name: 'Kungsträdgården', siteId: '102' },
      toStop: { id: 'native-motion-c-to', name: 'Hammarby Sjöstad', siteId: '458' }, transportType: 'bus',
    }],
  },
];

async function mockTransit(page: Page): Promise<{ delayFutureDepartures(): void }> {
  let futureDepartureDelay = 0;
  await page.route('**/*.integration.sl.se/**', async (route) => {
    const url = route.request().url();
    if (url.includes('departures')) {
      if (futureDepartureDelay) await new Promise((resolve) => setTimeout(resolve, futureDepartureDelay));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ departures: [{
          line: { designation: '14' }, direction_code: 1, destination: 'Mörby centrum', display: '5 min',
          expected: new Date(Date.now() + 5 * 60_000).toISOString(),
        }] }),
      });
      return;
    }
    if (url.includes('/v1/sites') || url.includes('deviations') || url.includes('messages')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.continue();
  });
  await page.route('https://journeyplanner.integration.sl.se/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ locations: [], trips: [] }) }),
  );
  return { delayFutureDepartures: () => { futureDepartureDelay = 750; } };
}

async function openMotionApp(page: Page, seededPages = pages, useTestClock = true): Promise<{ delayFutureDepartures(): void }> {
  const transit = await mockTransit(page);
  await page.addInitScript((seededPages) => {
    localStorage.clear();
    localStorage.setItem('nasta_settings', JSON.stringify({ language: 'en', theme: 'light' }));
    localStorage.setItem('nasta_routes', JSON.stringify(seededPages));
  }, seededPages);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/Nasta/', { waitUntil: 'domcontentloaded' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.getByRole('heading', { name: seededPages[0].name })).toBeVisible();
  if (useTestClock) await page.clock.install();
  return transit;
}

test.describe('native motion regressions', () => {
  test('keeps deck position continuous when a touch interrupts settling', async ({ page }) => {
    await openMotionApp(page);
    await page.keyboard.press('ArrowRight');
    await page.clock.fastForward(48);

    const activeCard = '.page-slot:not(.page-slot-preview) .card-main';
    const slot = '.page-slot:not(.page-slot-preview)';
    expect(await readOffset(page, slot)).toBeLessThan(0);
    expect(await readOffset(page, slot)).toBeGreaterThan(-390);

    await emitTouch(page, activeCard, 'touchstart', 200, 300);
    const grabbed = await readOffset(page, slot);
    await page.clock.fastForward(16);
    expect(await readOffset(page, slot)).toBeCloseTo(grabbed, 0);
    await emitTouch(page, activeCard, 'touchmove', 220, 300);
    await page.clock.fastForward(16);
    const after = await readOffset(page, slot);
    expect(Math.abs(after - grabbed - 20)).toBeLessThanOrEqual(1);
  });

  test('reverses a pending keyboard destination without committing it', async ({ page }) => {
    await openMotionApp(page, pages, false);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(32);
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('heading', { name: 'Morning' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Afternoon' })).not.toBeVisible();
    await expect.poll(
      () => readOffset(page, '.page-slot:not(.page-slot-preview)'),
      { timeout: 3_000 },
    ).toBeCloseTo(0, 0);
  });

  test('keeps the last page populated while returning from Nearby', async ({ page }) => {
    const transit = await openMotionApp(page, pages, false);
    for (const title of ['Afternoon', 'Evening']) {
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
    await expect(page.locator('.loading-skeleton')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { name: 'Nearby', level: 1 })).toBeVisible();

    transit.delayFutureDepartures();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('heading', { name: 'Evening' })).toBeVisible();
    await expect(page.locator('.loading-skeleton')).toHaveCount(0, { timeout: 200 });
  });

  test('does not render a map canvas when Nearby has no usable location', async ({ page }) => {
    const mapRequests: string[] = [];
    page.on('request', (request) => {
      if (/maplibre|tiles|styles/.test(request.url())) mapRequests.push(request.url());
    });
    await openMotionApp(page, [pages[0]]);
    await page.keyboard.press('ArrowRight');
    await page.clock.fastForward(1_000);
    await expect(page.getByRole('heading', { name: 'Nearby', level: 1 })).toBeVisible();
    await expect(page.locator('.nearby-surface canvas')).toHaveCount(0);
    expect(mapRequests).toEqual([]);
  });
});
