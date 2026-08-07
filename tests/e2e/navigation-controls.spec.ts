import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1024, height: 768 },
] as const;

async function openApp(page: Page, theme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*.integration.sl.se/**', async (route) => {
    const url = route.request().url();
    if (url.includes('departures')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          departures: [{
            line: { designation: '14' },
            direction_code: 1,
            destination: 'Mörby centrum',
            display: '3 min',
            expected: new Date(Date.now() + 180_000).toISOString(),
          }],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(url.includes('journeyplanner') || url.includes('trip') ? { trips: [] } : []),
    });
  });
  await page.route('**/basemaps.cartocdn.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ version: 8, sources: {}, layers: [] }),
  }));
  await page.addInitScript(({ selectedTheme }) => {
    localStorage.setItem('nasta_settings', JSON.stringify({ theme: selectedTheme, language: 'en' }));
    localStorage.setItem('nasta_routes', JSON.stringify([{
      id: 'navigation-page',
      name: 'Navigation test',
      segments: [{
        id: 'navigation-segment',
        line: '14',
        lineName: '14',
        direction: { code: 1, destination: 'Mörby centrum', stopPointId: '' },
        fromStop: { id: 'from', name: 'T-Centralen', siteId: '100', coord: [59.33, 18.06] },
        toStop: { id: 'to', name: 'Mörby centrum', siteId: '456' },
        transportType: 'metro',
      }],
    }]));
  }, { selectedTheme: theme });
  await page.goto('/Nasta/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1.page-title')).toBeVisible({ timeout: 15_000 });
}

function expectFullViewport(
  box: { x: number; y: number; width: number; height: number } | null,
  viewport: { width: number; height: number },
) {
  expect(box).not.toBeNull();
  expect(box!.x).toBe(0);
  expect(box!.y).toBe(0);
  expect(box!.width).toBe(viewport.width);
  expect(box!.height).toBe(viewport.height);
}

function expectBackPlacement(box: { x: number; y: number; width: number; height: number } | null) {
  expect(box).not.toBeNull();
  expect(box!.x).toBe(12);
  expect(box!.y).toBe(12);
  expect(box!.width).toBe(44);
  expect(box!.height).toBe(44);
}

for (const viewport of viewports) {
  test(`maps use history-backed Back and contain focus at ${viewport.name} size`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openApp(page, 'light');

    const railwayTrigger = page.getByRole('button', { name: 'SL map' });
    const historyBeforeRailway = await page.evaluate(() => history.length);
    await railwayTrigger.click();
    const railwayDialog = page.getByRole('dialog', { name: 'Railway map' });
    await expect(railwayDialog).toBeVisible();
    await expect(railwayDialog).toHaveCSS('opacity', '1');
    expectFullViewport(await railwayDialog.boundingBox(), viewport);
    const railwayBack = page.getByRole('button', { name: 'Back' });
    await expect(railwayBack).toBeFocused();
    expectBackPlacement(await railwayBack.boundingBox());
    await expect(page.getByRole('button', { name: 'Close map' })).toHaveCount(0);
    expect(await page.evaluate(() => history.length)).toBe(historyBeforeRailway + 1);
    await page.keyboard.press('Tab');
    expect(await railwayDialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.screenshot({
      path: `test-results/navigation-controls-railway-${viewport.name}-light.png`,
    });

    await page.evaluate(() => history.back());
    await expect(railwayDialog).toHaveCount(0);
    await expect(railwayTrigger).toBeFocused();

    await railwayTrigger.click();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(railwayDialog).toHaveCount(0);

    await page.goto('/Nasta/?navigation-audit=stop-map', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1.page-title')).toBeVisible();
    const cardToggle = page.locator('.card-main').first();
    await cardToggle.click();
    const expandMap = page.getByRole('button', { name: 'Expand map fullscreen' });
    await expect(expandMap).toBeVisible();
    const historyBeforeStopMap = await page.evaluate(() => history.length);
    await expandMap.click();
    const stopDialog = page.getByRole('dialog', { name: 'Stop location' });
    await expect(stopDialog).toBeVisible();
    await expect(stopDialog).toHaveCSS('opacity', '1');
    expectFullViewport(await stopDialog.boundingBox(), viewport);
    const stopBack = stopDialog.getByRole('button', { name: 'Back' });
    await expect(stopBack).toBeFocused();
    expectBackPlacement(await stopBack.boundingBox());
    expect(await page.evaluate(() => history.length)).toBe(historyBeforeStopMap + 1);
    for (let index = 0; index < 4; index += 1) await page.keyboard.press('Tab');
    expect(await stopDialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.screenshot({
      path: `test-results/navigation-controls-stop-map-${viewport.name}-light.png`,
    });
    await stopDialog.getByRole('button', { name: 'Back' }).click();
    await expect(stopDialog).toHaveCount(0);
    await expect(expandMap).toBeFocused();
  });

  test(`sheets retain Close semantics and Escape closes once at ${viewport.name} size`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openApp(page, 'dark');

    const settingsTrigger = page.getByRole('button', { name: 'Settings' });
    const historyBefore = await page.evaluate(() => history.length);
    await settingsTrigger.click();
    const settings = page.locator('.settings-overlay');
    await expect(settings).toBeVisible();
    await expect(settings).toHaveCSS('opacity', '1');
    const settingsClose = settings.getByRole('button', { name: 'Close settings' });
    await expect(settingsClose).toBeVisible();
    await expect(settingsClose).toBeFocused();
    expect(await page.evaluate(() => history.length)).toBe(historyBefore);
    const sheetBox = await settings.locator('.settings-sheet').boundingBox();
    const closeBox = await settingsClose.boundingBox();
    expect(closeBox).not.toBeNull();
    expect(closeBox!.width).toBe(44);
    expect(closeBox!.height).toBe(44);
    expect(closeBox!.x + closeBox!.width).toBeLessThanOrEqual(sheetBox!.x + sheetBox!.width - 12);
    await page.screenshot({
      path: `test-results/navigation-controls-settings-${viewport.name}-dark.png`,
    });
    await settingsClose.click();
    await expect(settings).not.toHaveClass(/\bopen\b/);
    await expect(settingsTrigger).toBeFocused();

    const editorTrigger = page.getByRole('button', { name: 'Manage pages' });
    await editorTrigger.click();
    const editor = page.locator('.editor-overlay.open');
    await expect(editor.getByRole('button', { name: 'Close editor' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.editor-overlay.open')).toHaveCount(0);
    await page.waitForTimeout(50);
    await expect(page.locator('.editor-overlay.open')).toHaveCount(0);
    await expect(editorTrigger).toBeFocused();
  });
}
