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
    baseURL: "http://localhost:5173/Nasta/",
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
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm exec vite preview --host 127.0.0.1 --port 5173",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
});
