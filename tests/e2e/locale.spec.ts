import { test, expect } from "@playwright/test";

test.describe("locale switching", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("nasta_routes", JSON.stringify([
        {
          id: crypto.randomUUID(),
          name: "Route",
          segments: [
            {
              id: crypto.randomUUID(),
              line: "76",
              lineName: "76",
              direction: { code: 1, destination: "Norra Hammarbyhamnen", stopPointId: "" },
              fromStop: { id: "f1", name: "Lindarängsvägen", siteId: "100" },
              toStop: { id: "t1", name: "Norra Hammarbyhamnen", siteId: "456" },
              transportType: "bus",
            },
          ],
        },
      ]));
    });

    // Mock API to prevent real requests (CORS errors, etc.)
    await page.route("**/*.integration.sl.se/**", async (route) => {
      const url = route.request().url();
      if (url.includes("departures")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ departures: [] }),
        });
      } else if (url.includes("deviations") || url.includes("messages")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else if (url.includes("journeyplanner") || url.includes("trip")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ trips: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("domcontentloaded");
    await page.addStyleTag({
      content: `*, *::before, *::after { transition: none !important; animation: none !important; }`,
    });
  });

  function langGroup(page: import("@playwright/test").Page) {
    return page.getByRole("group", { name: /language|språk/i });
  }

  test("should start in English and switch between languages", async ({ page }) => {
    const settingsBtn = page.getByRole("button", { name: "Settings" });

    await expect(settingsBtn).toHaveAttribute("aria-label", "Settings", { timeout: 10000 });

    await settingsBtn.click();
    await page.getByRole("tab", { name: /features|funktioner/i }).click();

    await expect(langGroup(page).getByRole("button").nth(0)).toContainText("English");
    await expect(langGroup(page).getByRole("button").nth(1)).toContainText("Swedish");

    await langGroup(page).getByRole("button").nth(1).click();
    await page.locator(".editor-overlay.open .back-btn").click();
    await page.waitForTimeout(100);

    await expect(page.getByRole("button", { name: "Inställningar" })).toBeVisible({ timeout: 10000 });
  });

  test("should persist language preference after reload", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("tab", { name: /features|funktioner/i }).click();
    await langGroup(page).getByRole("button").nth(1).click();
    await page.locator(".editor-overlay.open .back-btn").click();

    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByRole("button", { name: "Inställningar" })).toBeVisible({ timeout: 10000 });
  });

  test("no console errors during locale switching", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("tab", { name: /features|funktioner/i }).click();

    await langGroup(page).getByRole("button").nth(1).click();
    await page.waitForTimeout(50);
    await langGroup(page).getByRole("button").nth(0).click();
    await page.waitForTimeout(50);
    await langGroup(page).getByRole("button").nth(1).click();
    await page.waitForTimeout(50);
    await langGroup(page).getByRole("button").nth(0).click();
    await page.locator(".editor-overlay.open .back-btn").click();

    expect(errors.filter((m) => !m.includes("ERR_FAILED") && !m.includes("ERR_ABORTED"))).toEqual([]);
  });
});
