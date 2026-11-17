import { test, expect } from "./support/mobileTest";
import { CommuterApp, defaultTestPage } from './support/commuterApp';

test('keeps a live departure visible when the connection drops without a cached schedule', { tag: ['@mobile-core', '@mobile-smoke'] }, async ({ page, context }) => {
  const app = new CommuterApp(page);
  await app.mockDepartures(); // expected time only: no scheduled time to cache
  await app.open();
  await expect(app.countdown()).toBeVisible();
  await app.card().evaluate((el) => el.setAttribute('data-retained', 'yes'));
  await context.setOffline(true);
  await expect(app.card()).toContainText('Times may have changed');
  await expect(app.countdown()).toBeVisible();
  await expect(app.card()).toHaveAttribute('data-retained', 'yes');
  await expect(app.card().getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
});

test('a failed stop can be retried without replacing its card', { tag: ["@mobile-core", "@mobile-smoke"] }, async ({ page }) => {
  const app = new CommuterApp(page);
  await app.mockDepartures('unavailable');
  await app.open();
  const card = app.card();
  await expect(card).toContainText('Departures unavailable');
  await card.evaluate((element) => { element.setAttribute('data-retained', 'true'); });
  app.setDepartureMode('available');
  await card.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(app.countdown()).toBeVisible();
  await expect(card).toHaveAttribute('data-retained', 'true');
  await expect(card.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
});

test('an unavailable settings module leaves departures usable', { tag: "@mobile-core" }, async ({ page }) => {
  const app = new CommuterApp(page);
  await app.mockDepartures();
  await page.route('**/SettingsPanel-*.js', (route) => route.abort());
  await app.open();
  await expect(app.countdown()).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Settings', exact: true });
  await trigger.click();
  const error = page.getByRole('dialog', { name: 'Something went wrong' });
  await expect(error.getByRole('button', { name: 'Retry' })).toBeVisible();
  await error.getByRole('button', { name: 'Close add form' }).click();
  await expect(error).toHaveCount(0);
  await expect(app.countdown()).toBeVisible();
});

test('a slow stop does not block another stop or hide saved stop identity', { tag: ["@mobile-core", "@mobile-smoke"] }, async ({ page }) => {
  const app = new CommuterApp(page);
  await app.mockDepartures();
  const slow = { ...defaultTestPage.segments[0], id: 'slow', fromStop: { id: 'slow-from', name: 'Slow stop', siteId: '200' } };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/sites/200/departures?*', async (route) => {
    await gate;
    await route.fulfill({ json: { departures: [{ line: { designation: '14' }, direction_code: 1, destination: 'Mörby centrum', display: '8 min', expected: new Date(Date.now() + 480_000).toISOString() }] } });
  });
  try {
    await app.open({ ...defaultTestPage, segments: [...defaultTestPage.segments, slow] });
    await expect(app.card(slow)).toContainText('Loading');
    await expect(app.countdown()).toBeVisible();
    await expect(app.countdown(slow)).toHaveCount(0);
    release();
    await expect(app.countdown(slow)).toBeVisible();
    await expect(app.card(slow)).not.toContainText('Loading');
  } finally { release(); }
});
