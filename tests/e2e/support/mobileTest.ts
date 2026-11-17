import { test as base, expect } from '@playwright/test';

// Page-specific API mocks take precedence. This fallback keeps optional services
// and map styles from making mobile flows depend on public network availability.
export const test = base.extend<{ mobileNetwork: void }>({
  mobileNetwork: [async ({ context, baseURL }, use, testInfo) => {
    if (testInfo.project.name.startsWith('mobile-')) {
      const origin = new URL(baseURL!).origin;
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        if (url.hostname.endsWith('basemaps.cartocdn.com')) {
          return route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f7f7f5' } }] } });
        }
        if (route.request().resourceType() === 'stylesheet') return route.fulfill({ contentType: 'text/css', body: '' });
        return route.fulfill({ json: url.pathname.includes('departures') ? { departures: [] } : [] });
      });
    }
    await use();
  }, { auto: true }],
});

export { expect };
