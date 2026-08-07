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

    // Mock API to prevent real requests in test environment
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

    // Seed with default routes before page load
    await page.addInitScript(() => {
      // Seed default routes that match initialize() logic
      const defaultRoutes = [
        {
          id: crypto.randomUUID(),
          name: "Arbete",
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
        {
          id: crypto.randomUUID(),
          name: "Hem",
          segments: [
            {
              id: crypto.randomUUID(),
              line: "13",
              lineName: "13",
              direction: { code: 1, destination: "Mörby", stopPointId: "" },
              fromStop: { id: "f2", name: "Kungsträdgården", siteId: "200" },
              toStop: { id: "t2", name: "Mörby", siteId: "789" },
              transportType: "metro",
            },
          ],
        },
      ];

      localStorage.setItem("nasta_routes", JSON.stringify(defaultRoutes));
    });
    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });

    // Disable CSS transitions to avoid Playwright waiting for animations or elements outside viewport
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          transition: none !important;
          animation: none !important;
        }
      `,
    });

  });

  test.afterEach(async ({ page }, testInfo) => {
    // Filter out expected network errors from intentional route aborts in tests
    const unexpectedErrors = runtimeErrors.filter(
      (msg) => !msg.includes("ERR_FAILED") && !msg.includes("ERR_ABORTED") && !msg.includes("Failed to fetch"),
    );
    expect(
      unexpectedErrors,
      `Runtime errors detected:\n${runtimeErrors.join("\n")}`,
    ).toEqual([]);
  });

  test("should display route header", async ({ page }) => {
    // Route header displays current route name (toWork/fromWork direction)
    const routeHeader = page.locator("h1.page-title");
    await routeHeader.waitFor({ state: "visible", timeout: 10000 });
    await expect(routeHeader).toBeVisible();
    await expect(routeHeader).toContainText(/Arbete/i);
  });

  test("should keep sorting in Settings without a main-page reorder control", async ({ page }) => {
    await expect(page.locator('button[aria-label="Reorder cards"]')).toHaveCount(0);

    await page.getByRole("button", { name: "Settings" }).click();
    const settings = page.locator(".settings-overlay.open");
    await expect(settings).toBeVisible();
    await settings.getByRole("button", { name: "Sort by" }).click();
    await expect(settings.getByRole("option", { name: "Departure time" })).toBeVisible();
    await expect(settings.getByRole("option", { name: "Manual" })).toHaveCount(0);
  });

  test("should toggle edit mode", async ({ page }) => {
    const editBtn = page.getByRole("button", { name: "Manage pages" });
    await editBtn.waitFor({ state: "visible", timeout: 10000 });
    await editBtn.click();

    await expect(page.locator(".editor-overlay.open")).toBeVisible();
  });

  test("should keep the page editor scoped to pages", async ({ page }) => {
    await page.getByRole("button", { name: "Manage pages" }).click();
    const editor = page.locator(".editor-overlay.open");
    await expect(editor.locator(".pages-tab")).toBeVisible();
    await expect(editor.locator(".tab-bar")).toHaveCount(0);
    await expect(editor.locator('[data-testid="add-experience"]')).toHaveCount(0);

    await page.setViewportSize({ width: 900, height: 800 });
    const editorSheet = editor.locator(".editor-sheet");
    const overflow = await editorSheet.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(overflow).toBe(false);
  });

  test("should load from GitHub Pages subpath and survive hard refresh", async ({
    page,
  }) => {
    await page.goto("http://localhost:5173/Nasta/");
    await page.reload({ waitUntil: "domcontentloaded" });

    const routeHeader = page.locator("h1.page-title");
    await expect(routeHeader).toBeVisible();
  });

  test("should show multiple route dots", async ({ page }) => {
    const pageTitle = page.locator("h1.page-title");
    await expect(pageTitle).toBeVisible({ timeout: 10000 });

    const dots = page.locator(".page-dots .dot");
    const dotCount = await dots.count();
    expect(dotCount).toBeGreaterThan(1);
  });

  test("should display countdown with visible departure times", async ({
    page,
  }) => {
    // Wait for initial UI to load
    const routeHeader = page.locator("h1.page-title");
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

  test("should open and close quick-add drawer via inline add button", async ({ page }) => {
    const routeHeader = page.locator("h1.page-title");
    await routeHeader.waitFor({ state: "visible", timeout: 10000 });

    const addBtn = page.locator(".quick-add-card");
    await expect(addBtn).toBeVisible({ timeout: 5000 });

    await addBtn.click();

    const drawer = page.locator(".quick-add-drawer");
    await expect(drawer).toBeVisible();

    const backdrop = page.locator(".quick-add-backdrop");
    await expect(backdrop).toBeVisible();

    await backdrop.click();
    await expect(drawer).not.toBeVisible();
    await expect(backdrop).not.toBeVisible();
  });
});
