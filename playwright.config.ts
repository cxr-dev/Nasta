import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  outputDir: "test-results",
  reporter: "html",
  use: {
    baseURL: "http://localhost:4173/Nasta/",
    trace: process.env.CI ? "on-first-retry" : "off",
    video: "off",
    screenshot: "only-on-failure",
    // Block service workers so Playwright's page.route() mocks work correctly.
    // The VitePWA service worker (active in preview builds) would otherwise intercept
    // fetch calls to transport.integration.sl.se before Playwright can mock them.
    serviceWorkers: "block",
    // Enforce consistent timezone and locale to make tests deterministic in local & CI
    timezoneId: "Europe/Stockholm",
    locale: "en-US",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /(?:pwa|mobile-(?:compat|critical))\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-safari",
      testMatch: /(?:mobile-(?:compat|critical)|location-lifecycle)\.spec\.ts/,
      use: { ...devices["iPhone 17"], browserName: "webkit" },
    },
    {
      name: "mobile-chromium",
      testMatch: /location-lifecycle\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "pwa-chromium",
      testMatch: /pwa\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        serviceWorkers: "allow",
      },
    },
  ],
  webServer: {
    command: "pnpm exec vite preview --host localhost --port 4173 --strictPort",
    url: "http://localhost:4173/Nasta/",
    reuseExistingServer: false,
  },
});
