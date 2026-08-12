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
