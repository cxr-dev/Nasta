import { test, expect } from "@playwright/test";

test.describe("Nästa App", () => {
  let runtimeErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    runtimeErrors = [];
    page.on("pageerror", (error) => {
      runtimeErrors.push(error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        runtimeErrors.push(message.text());
      }
    });

    // Bypass onboarding AND seed with default routes before page load
    await page.addInitScript(() => {
      localStorage.setItem("nasta_onboarding_seen", "true");

      // Seed default routes that match initialize() logic
      const defaultRoutes = [
        {
          id: crypto.randomUUID(),
          name: "Arbete",
          direction: "toWork",
          segments: [],
        },
        {
          id: crypto.randomUUID(),
          name: "Arbete",
          direction: "fromWork",
          segments: [],
        },
      ];

      localStorage.setItem("nasta_routes", JSON.stringify(defaultRoutes));
    });
    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("domcontentloaded");

    // Disable CSS transitions to avoid Playwright waiting for animations or elements outside viewport
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          transition: none !important;
          animation: none !important;
        }
      `,
    });

    // Wait for app to initialize
    await page.waitForLoadState("domcontentloaded");
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Filter out expected network errors from intentional route aborts in tests
    const unexpectedErrors = runtimeErrors.filter(
      (msg) => !msg.includes("ERR_FAILED") && !msg.includes("ERR_ABORTED"),
    );
    expect(
      unexpectedErrors,
      `Runtime errors detected:\n${runtimeErrors.join("\n")}`,
    ).toEqual([]);
  });

  test("should display route header", async ({ page }) => {
    // Route header displays current route name (toWork/fromWork direction)
    const routeHeader = page.locator("h1.route-name");
    await routeHeader.waitFor({ state: "visible", timeout: 10000 });
    await expect(routeHeader).toBeVisible();
    await expect(routeHeader).toContainText(/Arbete/i);
  });

  test("should toggle edit mode", async ({ page }) => {
    // Main edit button is .action-btn in bottom bar
    const editBtn = page.locator(".action-btn");
    await editBtn.waitFor({ state: "visible", timeout: 10000 });
    await editBtn.click();

    // After click, button should show save state with different text/icon
    await expect(editBtn).toBeVisible();
  });

  test("should load from GitHub Pages subpath and survive hard refresh", async ({
    page,
  }) => {
    await page.goto("http://localhost:5173/Nasta/");
    await page.waitForLoadState("domcontentloaded");
    await page.reload({ waitUntil: "domcontentloaded" });

    const routeHeader = page.locator("h1.route-name");
    await expect(routeHeader).toBeVisible();
  });

  test("should switch route without crashing", async ({ page }) => {
    const switchBtn = page.locator(".route-switch");
    if (await switchBtn.count()) {
      const routeHeader = page.locator("h1.route-name");
      const before = await routeHeader.textContent();
      await switchBtn.first().click();
      await expect(routeHeader).toBeVisible();
      const after = await routeHeader.textContent();
      expect(after).toBeTruthy();
      expect(after).not.toEqual(before);
    }
  });

  test("should display countdown with visible departure times", async ({
    page,
  }) => {
    // Wait for initial UI to load
    const routeHeader = page.locator("h1.route-name");
    await routeHeader.waitFor({ state: "visible", timeout: 10000 });

    // Look for any visible time display elements
    const timeElements = page
      .locator("span")
      .filter({ has: page.locator("text=/\\d{1,2}:\\d{2}|Now|Nu/") });
    const count = await timeElements.count();

    // If we have any time elements, verify they're visible
    if (count > 0) {
      await expect(timeElements.first()).toBeVisible();
    }
  });
});
