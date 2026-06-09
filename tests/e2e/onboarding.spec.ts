import { test, expect } from "@playwright/test";

const TEST_TIMEOUT = 15000;

async function initFreshState(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem(
      "nasta_settings",
      JSON.stringify({ language: "sv" }),
    );
    localStorage.removeItem("nasta_onboarding_seen");
    localStorage.removeItem("nasta_location_prompted");
  });
}

async function openFirstRouteEditor(page: import("@playwright/test").Page) {
  const emptyBtn = page.locator(".empty-cta");
  await expect(emptyBtn).toBeVisible({ timeout: TEST_TIMEOUT });
  await expect(emptyBtn).toBeEnabled({ timeout: TEST_TIMEOUT });
  await emptyBtn.click();
  await page
    .locator(".editor-overlay.open")
    .waitFor({ state: "visible", timeout: TEST_TIMEOUT });
  await expect(page.locator(".search-container")).toBeVisible({
    timeout: TEST_TIMEOUT,
  });
}

test.describe("Onboarding hint", () => {
  test.setTimeout(60000);
  test("shows and dismisses in-app hint for first run", async ({ page }) => {
    await initFreshState(page);

    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("domcontentloaded");
    const emptyBtn = page.locator(".empty-cta");
    await expect(emptyBtn).toBeVisible({ timeout: TEST_TIMEOUT });
    await expect(page.locator(".empty-cta.onboarding-highlight")).toBeVisible({
      timeout: TEST_TIMEOUT,
    });

    await openFirstRouteEditor(page);

    const hint = page.locator(".onboarding-hint");
    await expect(hint).toBeVisible({ timeout: TEST_TIMEOUT });
    await expect(page.locator(".hint-badge")).toBeVisible({
      timeout: TEST_TIMEOUT,
    });

    const dismissHintButton = hint.locator("button");
    await expect(dismissHintButton).toBeVisible({ timeout: TEST_TIMEOUT });
    await expect(dismissHintButton).toBeEnabled({ timeout: TEST_TIMEOUT });
    await dismissHintButton.click();

    await expect(hint).toHaveCount(0, { timeout: TEST_TIMEOUT });

    await expect
      .poll(async () => {
        return page.evaluate(() =>
          localStorage.getItem("nasta_onboarding_seen"),
        );
      })
      .toBe("true");
  });

  test("segment search does not prompt for location until walking ETA is enabled", async ({
    page,
  }) => {
    await initFreshState(page);

    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("domcontentloaded");
    await openFirstRouteEditor(page);

    await expect(page.locator(".location-prompt")).toHaveCount(0, {
      timeout: TEST_TIMEOUT,
    });
  });
});
