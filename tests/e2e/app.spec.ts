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
          body: JSON.stringify({
            departures: [{
              line: { designation: "76" },
              direction_code: 1,
              destination: "Norra Hammarbyhamnen",
              display: "5 min",
              expected: new Date(Date.now() + 5 * 60_000).toISOString(),
            }],
          }),
        });
      } else if (url.includes("/v1/sites")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            { id: 100, name: "Lindarängsvägen", lat: 59.33, lon: 18.06 },
            { id: 200, name: "Kungsträdgården", lat: 59.33, lon: 18.07 },
          ]),
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
      (msg) => !msg.includes("ERR_FAILED") && !msg.includes("ERR_ABORTED"),
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
    await page.goto("/Nasta/");
    await page.reload({ waitUntil: "domcontentloaded" });

    const routeHeader = page.locator("h1.page-title");
    await expect(routeHeader).toBeVisible();
  });

  test("should show the page indicator only after switching pages and hide it on scroll", async ({ page }) => {
    const pageTitle = page.locator("h1.page-title");
    await expect(pageTitle).toBeVisible({ timeout: 10000 });

    const indicator = page.locator(".page-dot-indicator");
    const dots = indicator.locator(".dot");
    const dotCount = await dots.count();
    expect(dotCount).toBeGreaterThan(1);

    await expect(indicator).not.toHaveClass(/visible/);

    await page.keyboard.press("ArrowRight");
    await expect(indicator).toHaveClass(/visible/);

    await page.locator(".card-list").evaluate((element) => {
      element.dispatchEvent(new Event("scroll"));
    });
    await expect(indicator).not.toHaveClass(/visible/);
  });

  test("should display countdown with visible departure times", async ({
    page,
  }) => {
    const card = page.getByTestId("segment-row").filter({ hasText: "Lindarängsvägen" });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByTestId("segment-line")).toHaveText("76");
    await expect(card).toContainText("Norra Hammarbyhamnen");
    await expect(card.getByTestId("countdown-minutes")).toContainText(/min|now|soon/i);
  });

  test("should open the fixed Nearby surface before the first saved page", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Nearby" })).toHaveCount(0);
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(".nearby-surface")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nearby" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Enable location|Use my location|Aktivera plats/i })).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("h1.page-title")).toContainText(/Arbete/i);
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(".nearby-surface")).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("h1.page-title")).toContainText(/Arbete/i);
  });

  test("loads Nearby after reload when browser location is already granted", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"], { origin: "http://localhost:4173" });
    await context.setGeolocation({ latitude: 59.33, longitude: 18.06 });
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("switch", { name: /Location services|Platsjänster/i }).click();
    await expect(page.getByRole("switch", { name: /Location services|Platsjänster/i })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: /Close settings|Stäng inställningar/i }).click();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("h1.page-title")).toContainText(/Arbete/i);
    await page.keyboard.press("ArrowLeft");

    const surface = page.locator(".nearby-surface");
    await expect(surface).toBeVisible();
    await expect(surface.getByRole("button", { name: /Enable location|Retry|Aktivera plats|Försök igen/i })).toHaveCount(0);
    await expect(surface.getByRole("button", { name: /Lindarängsvägen/i })).toBeVisible({ timeout: 15_000 });
  });

  test("loads Nearby after reload without the Permissions API when location is already granted", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"], { origin: "http://localhost:4173" });
    await context.setGeolocation({ latitude: 59.33, longitude: 18.06 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "permissions", { configurable: true, value: undefined });
    });
    await page.reload({ waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("switch", { name: /Location services|Platsjänster/i }).click();
    await page.getByRole("button", { name: /Close settings|Stäng inställningar/i }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.keyboard.press("ArrowLeft");

    const surface = page.locator(".nearby-surface");
    await expect(surface).toBeVisible();
    await expect(surface.getByRole("button", { name: /Enable location|Retry|Aktivera plats|Försök igen/i })).toHaveCount(0);
    await expect(surface.getByRole("button", { name: /Lindarängsvägen/i })).toBeVisible({ timeout: 15_000 });
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
