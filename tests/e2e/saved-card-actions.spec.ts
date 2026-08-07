import { test, expect, type Page } from '@playwright/test';

const now = Date.now();
const journeyMeta = {
  journeyId: 'journey-actions',
  originLabel: 'Östermalmstorg',
  destLabel: 'Kista centrum',
  legs: [{
    originName: 'Östermalmstorg',
    originSiteId: '100',
    destName: 'Kista centrum',
    destSiteId: '200',
    transportType: 'metro' as const,
    line: '11',
    lineName: '11',
    directionCode: 1,
    directionName: 'Akalla',
    departureTime: now + 10 * 60_000,
    arrivalTime: now + 35 * 60_000,
    durationMin: 25,
    platformPosition: 'middle' as const,
  }],
  totalDurationMin: 25,
  transfers: 0,
  query: { origin: 'Östermalmstorg', destination: 'Kista centrum' },
  status: 'planned' as const,
  updatedAt: now,
};

const routes = [{
  id: 'actions-page',
  name: 'Test',
  segments: [
    {
      id: 'departure-actions',
      line: '6',
      lineName: '6',
      direction: { code: 1, destination: 'Ropsten', stopPointId: '' },
      fromStop: { id: 'from-1', name: 'Jaktgatan', siteId: '100' },
      toStop: { id: 'to-1', name: 'Ropsten', siteId: '200' },
      transportType: 'bus',
    },
    {
      id: 'journey-actions',
      line: '11',
      lineName: '11',
      direction: { code: 1, destination: 'Kista centrum', stopPointId: '' },
      fromStop: { id: 'from-2', name: 'Östermalmstorg', siteId: '300' },
      toStop: { id: 'to-2', name: 'Kista centrum', siteId: '400' },
      transportType: 'metro',
      journeyMeta,
    },
  ],
}];

async function prepare(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.route('**/*.integration.sl.se/**', async (route: any) => {
    const url = route.request().url();
    if (url.includes('departures')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ departures: [{ line: { designation: '6' }, direction_code: 1, destination: 'Ropsten', display: '3 min' }] }),
      });
    } else if (url.includes('deviations') || url.includes('messages')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    } else if (url.includes('journeyplanner') || url.includes('trip')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trips: [] }) });
    } else {
      await route.continue();
    }
  });
  await page.addInitScript((value: typeof routes) => localStorage.setItem('nasta_routes', JSON.stringify(value)), routes);
  await page.goto('/Nasta/', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
  await expect(page.locator('.departure-card')).toBeVisible({ timeout: 15000 });
}

test.describe('saved card contextual actions', () => {
  test('uses a content-height mobile surface and clear departure identity', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 });
    await page.locator('.departure-card .card-main').click();
    await page.screenshot({ path: 'test-results/saved-card-mobile-expanded-departure.png', fullPage: true });
    await page.locator('.departure-card .more-actions-button').click();
    const sheet = page.locator('.sheet.saved-card-actions-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.action-context')).toContainText('Line 6');
    await expect(sheet.locator('.action-context')).toContainText('Jaktgatan → Ropsten');
    const box = await sheet.boundingBox();
    expect(box?.height ?? 999).toBeLessThan(500);
    await page.screenshot({ path: 'test-results/saved-card-mobile-actions-sheet.png', fullPage: true });
  });

  test('uses an anchored desktop popover with equivalent journey actions', async ({ page }) => {
    await prepare(page, { width: 1024, height: 768 });
    await page.locator('.departure-card .card-main').click();
    await page.screenshot({ path: 'test-results/saved-card-tablet-expanded-departure.png', fullPage: true });
    await page.locator('.departure-card .more-actions-button').click();
    await expect(page.locator('.sheet.saved-card-actions-sheet')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('.journey-card .card-main').click();
    await page.screenshot({ path: 'test-results/saved-card-tablet-expanded-journey.png', fullPage: true });
    await page.locator('.journey-card .more-actions-button').click();
    const sheet = page.locator('.sheet.saved-card-actions-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.action-context')).toContainText('Journey to Kista centrum');
    await expect(sheet.locator('.action-context')).toContainText('Östermalmstorg → Kista centrum');
    const box = await sheet.boundingBox();
    expect(box?.height ?? 999).toBeLessThan(420);
    await page.screenshot({ path: 'test-results/saved-card-tablet-actions-popover.png', fullPage: true });
    await page.keyboard.press('Tab');
    await page.screenshot({ path: 'test-results/saved-card-actions-keyboard-focus.png', fullPage: true });
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.locator('.journey-card .more-actions-button')).toBeFocused();
  });

  test('keeps long-press and More on the same command set', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 });
    const card = page.locator('.departure-card');
    await card.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 8, clientX: 120, clientY: 120, button: 0 });
    const sheet = page.locator('.sheet.saved-card-actions-sheet');
    await expect(sheet).toBeVisible({ timeout: 2000 });
    await card.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 8, clientX: 120, clientY: 120, button: 0 });
    const longPressActions = await sheet.locator('.action-button').allTextContents();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(card).toBeVisible();
    await card.locator('.card-main').click();
    await expect(card.locator('.more-actions-button')).toBeVisible();
    await card.locator('.more-actions-button').click();
    const moreActions = await sheet.locator('.action-button').allTextContents();
    expect(longPressActions).toEqual(moreActions);
  });

  test('keeps the action surface legible in both color schemes', async ({ page }) => {
    await prepare(page, { width: 1024, height: 768 });
    await page.locator('.journey-card .card-main').click();
    await page.locator('.journey-card .more-actions-button').click();
    await page.emulateMedia({ colorScheme: 'light' });
    await page.screenshot({ path: 'test-results/saved-card-actions-light.png', fullPage: true });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: 'test-results/saved-card-actions-dark.png', fullPage: true });
  });
});
