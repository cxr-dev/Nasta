import { expect, test } from "@playwright/test";

async function seedOfflinePage(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("nasta_settings", JSON.stringify({ language: "en", theme: "light" }));
    localStorage.setItem("nasta_routes", JSON.stringify([{ id: "pwa-page", name: "Offline test", segments: [] }]));
  });
}

async function waitForServiceWorker(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

test.describe("PWA runtime", () => {
  test("restores an enabled, granted location after reload without the Permissions API", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"], { origin: "http://localhost:4173" });
    await context.setGeolocation({ latitude: 59.33, longitude: 18.06 });
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("nasta_settings", JSON.stringify({ language: "en", theme: "light", locationServicesEnabled: true }));
      localStorage.setItem("nasta_routes", JSON.stringify([{
        id: "location-page",
        name: "Location test",
        segments: [{
          id: "location-segment",
          line: "14",
          lineName: "14",
          direction: { code: 1, destination: "Mörby centrum", stopPointId: "" },
          fromStop: { id: "from", name: "T-Centralen", siteId: "100" },
          toStop: { id: "to", name: "Mörby centrum", siteId: "456" },
          transportType: "metro",
        }],
      }]));
      Object.defineProperty(navigator, "permissions", { configurable: true, value: undefined });
      let calls = 0;
      const getCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
        configurable: true,
        value: (...args: Parameters<Geolocation["getCurrentPosition"]>) => {
          calls += 1;
          (window as Window & { __nastaGeolocationCalls?: number }).__nastaGeolocationCalls = calls;
          return getCurrentPosition(...args);
        },
      });
    });
    await page.goto("/Nasta/", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: "Location test" })).toBeVisible();
    await waitForServiceWorker(page);

    await page.reload({ waitUntil: "load" });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.keyboard.press("ArrowLeft");

    const surface = page.locator(".nearby-surface");
    await expect(surface).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as Window & { __nastaGeolocationCalls?: number }).__nastaGeolocationCalls ?? 0)).toBeGreaterThan(0);
    await expect(surface.getByRole("button", { name: /Enable location|Retry|Aktivera plats|Försök igen/i })).toHaveCount(0);
  });

  test("keeps a previously loaded shell usable after an offline reload", async ({ page, context }) => {
    await seedOfflinePage(page);
    await page.goto("/Nasta/", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: "Offline test" })).toBeVisible();
    await waitForServiceWorker(page);

    await page.reload({ waitUntil: "load" });
    await expect(page.getByRole("heading", { name: "Offline test" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Offline test" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Add/ })).toBeVisible();
  });

  test("announces and dismisses an available update", async ({ page }) => {
    await seedOfflinePage(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/Nasta/", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: "Offline test" })).toBeVisible();

    await page.evaluate(() => window.dispatchEvent(new CustomEvent("pwa-update-available")));
    const banner = page.getByRole("status").filter({ hasText: "Update ready" });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Dismiss" }).click();
    await expect(banner).toBeHidden();
  });
});
