import { test, expect } from "@playwright/test";

test.describe("Onboarding hint", () => {
  test("shows and dismisses in-app hint for first run", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto("/");
    const hint = page.locator(".onboarding-hint");
    await expect(page.locator(".action-btn")).toBeVisible();
    await expect(hint).toBeVisible();

    await hint.getByRole("button").click({ force: true });
    await expect(hint).toHaveCount(0);

    await expect
      .poll(async () => {
        return page.evaluate(() => localStorage.getItem("nasta_onboarding_seen"));
      })
      .toBe("true");
  });
});
