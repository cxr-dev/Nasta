import { test, expect } from "@playwright/test";

test.describe("Onboarding hint", () => {
  test("shows and dismisses in-app hint for first run", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto("/");

    // Verify empty state button is visible
    const emptyBtn = page.locator(".empty-cta");
    await expect(emptyBtn).toBeVisible();

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
});
