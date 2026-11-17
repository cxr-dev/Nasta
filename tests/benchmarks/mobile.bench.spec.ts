import { test, expect, type Page } from '@playwright/test';
import { liveDepartures, seedSavedCommute, seedCachedSchedule } from '../e2e/support/commuteFixture';

const injectedDelay = Number(process.env.BENCH_DELAY_MS || 0);
if (!Number.isFinite(injectedDelay) || injectedDelay < 0) throw new Error('BENCH_DELAY_MS must be a nonnegative number');

test.beforeEach(async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seedSavedCommute(page);
  const origin = new URL(baseURL!).origin;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      if (injectedDelay && /\/(SettingsPanel|AddExperience)-.*\.js$/.test(url.pathname)) {
        await new Promise((resolve) => setTimeout(resolve, injectedDelay));
      }
      return route.continue();
    }
    if (url.hostname === 'transport.integration.sl.se' && url.pathname.includes('/departures')) {
      // Deliberate, fixed response latency, not a test synchronization sleep.
      await new Promise((resolve) => setTimeout(resolve, 100 + injectedDelay));
      return route.fulfill({ json: liveDepartures() });
    }
    if (route.request().resourceType() === 'stylesheet') return route.fulfill({ contentType: 'text/css', body: '' });
    return route.fulfill({ json: [] });
  });
});

// Observe readiness in the browser, rather than including Playwright polling and
// transport overhead in the measurement. Two animation frames allow a paint.
async function armReadiness(page: Page, selector: string, startOnClick = false) {
  await page.addInitScript(({ selector, startOnClick }) => {
    let start = startOnClick ? NaN : 0;
    if (startOnClick) document.addEventListener('click', () => { start = performance.now(); }, { capture: true, once: true });
    const visible = (el: Element | null): el is HTMLElement => {
      if (!(el instanceof HTMLElement) || el.closest('[inert], [aria-hidden="true"]')) return false;
      const box = el.getBoundingClientRect();
      for (let ancestor: HTMLElement | null = el; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.visibility === 'hidden' || Number(style.opacity) < 0.99) return false;
      }
      return box.height > 0 && box.width > 0 && box.top >= 0 && box.bottom <= innerHeight
        && box.left >= 0 && box.right <= innerWidth;
    };
    function poll() {
      const target = document.querySelector(selector);
      if (Number.isFinite(start) && visible(target) && !document.querySelector('#nasta-launch')
        && (!startOnClick || !target.hasAttribute('disabled'))) {
        requestAnimationFrame(() => {
          if (visible(document.querySelector(selector))) {
            (window as unknown as { benchmarkMs: number }).benchmarkMs = performance.now() - start;
          } else requestAnimationFrame(poll);
        });
      } else requestAnimationFrame(poll);
    }
    requestAnimationFrame(poll);
  }, { selector, startOnClick });
}

async function sample(page: Page, testInfo: import('@playwright/test').TestInfo) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { benchmarkMs?: number }).benchmarkMs)).toBeGreaterThan(0);
  const ms = await page.evaluate(() => (window as unknown as { benchmarkMs: number }).benchmarkMs);
  await testInfo.attach('benchmark', { body: JSON.stringify({ ms, browser: page.context().browser()!.version() }), contentType: 'application/json' });
  return ms;
}

test('first useful departure', async ({ page }, testInfo) => {
  await armReadiness(page, '[data-testid="countdown-minutes"]');
  await page.goto('/Nasta/', { waitUntil: 'domcontentloaded' });
  const ms = await sample(page, testInfo);
  expect(ms).toBeGreaterThanOrEqual(100 + injectedDelay);
  await expect(page.getByTestId('countdown-minutes')).toContainText('4 min');
});

test('cached-data reopen', async ({ page }, testInfo) => {
  await page.goto('/Nasta/');
  await expect(page.getByTestId('countdown-minutes')).toBeVisible();
  await seedCachedSchedule(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/sites/*/departures?*', async (route) => { await gate; await route.abort(); });
  await armReadiness(page, '.departure-card:has([data-testid="countdown-minutes"]) .departure-status');
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sample(page, testInfo);
    await expect(page.getByTestId('countdown-minutes')).toBeVisible();
    await expect(page.locator('.departure-status')).toContainText('Times may have changed');
  } finally { release(); }
});

for (const panel of [
  { name: 'Settings', trigger: 'Settings', ready: '.settings-overlay.open button[aria-label="Close settings"]' },
  { name: 'Add', trigger: '+ Add', ready: '#quick-add-stop-search' },
]) {
  test(`first panel opening: ${panel.name}`, async ({ page }, testInfo) => {
    await armReadiness(page, panel.ready, true);
    await page.goto('/Nasta/');
    await expect(page.getByTestId('countdown-minutes')).toBeVisible();
    await expect(page.locator('#nasta-launch')).toHaveCount(0);
    await page.getByRole('button', { name: panel.trigger, exact: true }).click();
    const ms = await sample(page, testInfo);
    if (injectedDelay) expect(ms).toBeGreaterThanOrEqual(injectedDelay);
    await expect(page.locator(panel.ready)).toBeVisible();
    await page.locator(panel.ready).focus();
    await expect(page.locator(panel.ready)).toBeFocused();
  });
}
