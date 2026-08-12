import { expect, test, type Page } from '@playwright/test';

const ROUTE_PATH = 'M -25 686 C 5 676 29 663 54 650 C 120 595 189 687 250 620 C 286 578 316 559 340 570 C 366 581 391 594 420 586';

async function blockApplicationJavaScript(page: Page) {
  await page.route('**/*', route => {
    if (route.request().resourceType() === 'script') return route.abort();
    return route.continue();
  });
}

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
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem('nasta_settings', JSON.stringify({ theme: selectedTheme }));
      }, theme);
      await blockApplicationJavaScript(page);

      await page.goto('/Nasta/', { waitUntil: 'domcontentloaded' });

      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('#nasta-launch')).toBeVisible();
      await expect(page.locator('.launch-logo')).toHaveAttribute(
        'src',
        /\/(?:Nasta\/)?logosvg\.svg$/,
      );
      await expect(page.locator('.launch-name')).toHaveCSS(
        'font-family',
        /Bricolage Grotesque Launch/,
      );
      await expect(page.locator('.launch-label')).toHaveCSS(
        'font-family',
        /DM Sans Launch/,
      );
      await expect.poll(() => page.evaluate(() =>
        document.fonts.check('800 72px "Bricolage Grotesque Launch"')
      )).toBe(true);
      await expect.poll(() => page.evaluate(() =>
        document.fonts.check('600 12px "DM Sans Launch"')
      )).toBe(true);
      await expect(page.locator('.launch-route')).toHaveAttribute('viewBox', '0 0 390 844');
      await expect(page.locator('.launch-route')).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
      await expect(page.locator('.launch-route-base')).toHaveAttribute('d', ROUTE_PATH);
      await expect(page.locator('.launch-route-active')).toHaveAttribute('d', ROUTE_PATH);
      await expect(page.locator('.launch-station-origin')).toHaveAttribute('cx', '54');
      await expect(page.locator('.launch-station-origin')).toHaveAttribute('cy', '650');
      await expect(page.locator('.launch-station-origin')).toHaveAttribute('r', '9');
      await expect(page.locator('.launch-station-destination')).toHaveAttribute('cx', '340');
      await expect(page.locator('.launch-station-destination')).toHaveAttribute('cy', '570');
      await expect(page.locator('.launch-station-destination')).toHaveAttribute('r', '9');
      await expect(page.locator('.launch-station-label')).toHaveText(['SLUSSEN', 'T-CENTRALEN']);
      await expect(page.locator('.launch-readout')).toContainText('NÄSTA STOPP');
      await expect(page.locator('.launch-readout')).toContainText('T-CENTRALEN');
      await expect(page.locator('.launch-skeletons')).toHaveCount(0);

      const metrics = await page.evaluate(() => {
        const launch = document.getElementById('nasta-launch')!;
        const brand = document.querySelector<HTMLElement>('.launch-brand')!;
        const logo = document.querySelector<HTMLElement>('.launch-logo')!;
        const name = document.querySelector<HTMLElement>('.launch-name')!;
        const traveller = document.querySelector<HTMLElement>('.launch-traveller')!;
        return {
          background: getComputedStyle(launch).backgroundColor,
          color: getComputedStyle(launch).color,
          brandTop: brand.getBoundingClientRect().top,
          logoWidth: logo.getBoundingClientRect().width,
          nameSize: getComputedStyle(name).fontSize,
          offsetPath: getComputedStyle(traveller).offsetPath,
        };
      });

      expect(metrics.background).toBe(theme === 'light' ? 'rgb(247, 247, 245)' : 'rgb(17, 19, 17)');
      expect(metrics.color).toBe(theme === 'light' ? 'rgb(23, 27, 24)' : 'rgb(245, 245, 239)');
      expect(Math.abs(metrics.brandTop - 164.58)).toBeLessThanOrEqual(1);
      expect(Math.abs(metrics.logoWidth - 222.3)).toBeLessThanOrEqual(1);
      expect(Math.abs(Number.parseFloat(metrics.nameSize) - 72)).toBeLessThanOrEqual(1);
      expect(metrics.offsetPath).toContain(ROUTE_PATH);
    });
  }

  test('renders a complete static journey when reduced motion is requested', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await blockApplicationJavaScript(page);

    await page.goto('/Nasta/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#nasta-launch')).toBeVisible();
    await expect(page.locator('.launch-route-active')).toHaveCSS('stroke-dasharray', '1000px, 0px');
    await expect(page.locator('.launch-traveller')).toHaveCSS('offset-distance', '55%');
    await expect(page.locator('.launch-station-destination')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await expect(page.locator('.launch-route-active')).toHaveCSS('animation-name', 'none');
  });

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

  test('removes the launch state within 200ms when transitionend is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      type Timing = { leaving?: number; removed?: number; pointerEvents?: string };
      const state = window as typeof window & { __launchTiming?: Timing };
      state.__launchTiming = {};

      const nativeAddEventListener = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (type === 'transitionend' && this instanceof HTMLElement && this.id === 'nasta-launch') {
          return;
        }
        return nativeAddEventListener.call(this, type, listener, options);
      };

      const observer = new MutationObserver(() => {
        const launch = document.getElementById('nasta-launch');
        const timing = state.__launchTiming!;
        if (launch?.classList.contains('is-leaving') && timing.leaving === undefined) {
          timing.leaving = performance.now();
          timing.pointerEvents = getComputedStyle(launch).pointerEvents;
        }
        if (!launch && timing.leaving !== undefined && timing.removed === undefined) {
          timing.removed = performance.now();
          observer.disconnect();
        }
      });
      observer.observe(document, {
        attributes: true,
        attributeFilter: ['class'],
        childList: true,
        subtree: true,
      });
    });

    await page.goto('/Nasta/');
    await expect(page.locator('#nasta-launch')).toHaveCount(0);

    const timing = await page.evaluate(() => (
      window as typeof window & {
        __launchTiming?: { leaving?: number; removed?: number; pointerEvents?: string };
      }
    ).__launchTiming);
    expect(timing?.pointerEvents).toBe('none');
    expect(timing?.leaving).toBeDefined();
    expect(timing?.removed).toBeDefined();
    expect(timing!.removed! - timing!.leaving!).toBeLessThanOrEqual(220);
  });
});
