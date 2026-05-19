import { test, expect } from "@playwright/test";

test.describe("Onboarding hint", () => {
  test("shows and dismisses in-app hint for first run", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("nasta_settings", JSON.stringify({ language: "sv" }));
    });

    await page.goto("/");

    // Verify empty state button is visible with pulsating highlight
    const emptyBtn = page.locator(".empty-cta");
    await expect(emptyBtn).toBeVisible();
    await expect(page.locator(".empty-cta.onboarding-highlight")).toBeVisible();

    // Click "Lägg till segment" button to create first route
    await emptyBtn.click();

    // Wait for RouteEditor to open with search visible
    await expect(page.locator(".search-container")).toBeVisible();

    // Verify tooltip appears
    const hint = page.locator(".onboarding-hint");
    await expect(hint).toBeVisible();

    // Verify pulsating button is visible
    await expect(page.locator(".add-btn.onboarding-highlight")).toBeVisible();

    // Dismiss the hint
    await hint.getByRole("button").click();

    // Verify hint is gone
    await expect(hint).toHaveCount(0);

    // Verify localStorage is set
    await expect
      .poll(async () => {
        return page.evaluate(() =>
          localStorage.getItem("nasta_onboarding_seen"),
        );
      })
      .toBe("true");
  });

  test("location prompt appears on first visit to SegmentSearch", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("nasta_settings", JSON.stringify({ language: "sv" }));
    });

    await page.goto("/");

    // Create first route to get to SegmentSearch
    await page.locator(".empty-cta").click();
    await expect(page.locator(".search-container")).toBeVisible();

    // Verify location prompt appears
    const locationPrompt = page.locator(".location-prompt");
    await expect(locationPrompt).toBeVisible();
    await expect(page.locator("#location-title")).toContainText("Hitta närliggande");

    // Verify both buttons are visible
    await expect(page.locator(".btn-primary")).toBeVisible();
    await expect(page.locator(".btn-secondary")).toBeVisible();
  });

  test("location prompt can be skipped", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("nasta_settings", JSON.stringify({ language: "sv" }));
    });

    await page.goto("/");
    await page.locator(".empty-cta").click();
    await expect(page.locator(".location-prompt")).toBeVisible();

    // Click skip button
    await page.locator(".btn-secondary").click();

    // Verify prompt is gone and localStorage is set to skipped
    await expect(page.locator(".location-prompt")).toHaveCount(0);
    await expect
      .poll(async () => {
        return page.evaluate(() => localStorage.getItem("nasta_location_prompted"));
      })
      .toBe("skipped");
  });

  test("location prompt does not reappear after skip", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("nasta_location_prompted", "skipped");
    });

    await page.goto("/");
    await page.locator(".empty-cta").click();

    // Verify prompt does NOT appear
    await expect(page.locator(".location-prompt")).toHaveCount(0);
  });
});
