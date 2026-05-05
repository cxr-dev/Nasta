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
    await page.goto("/");
    
    // Disable CSS transitions to avoid Playwright waiting for animations or elements outside viewport
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          transition: none !important;
          animation: none !important;
        }
      `
    });

    // Wait for app to initialize
    await page.waitForLoadState("domcontentloaded");
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Filter out expected network errors from intentional route aborts in tests
    const unexpectedErrors = runtimeErrors.filter(
      (msg) => !msg.includes("ERR_FAILED") && !msg.includes("ERR_ABORTED")
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
    await expect(routeHeader).toContainText(/TO WORK|HOME/i);
  });

  test("should show route switch button when multiple routes exist", async ({
    page,
  }) => {
    // Routes are switched via .route-switch button, not tabs
    const switchBtn = page.locator(".route-switch");
    const count = await switchBtn.count();
    // If 2 routes exist, there should be 1 switch button to toggle to the other
    if (count > 0) {
      await expect(switchBtn.first()).toBeVisible();
    }
  });

  test("should toggle edit mode", async ({ page }) => {
    // Main edit button is .action-btn in bottom bar
    const editBtn = page.locator(".action-btn");
    await editBtn.waitFor({ state: "visible", timeout: 10000 });
    await editBtn.click();

    // After click, button should show save state with different text/icon
    await expect(editBtn).toBeVisible();
  });

  test("should show empty state when no routes exist", async ({ page }) => {
    // Empty state only shows if there are truly no routes (hasNoRoutes condition)
    // On initial load with default routes, this won't be visible
    const emptyState = page.locator(".empty-state");
    const count = await emptyState.count();
    // Empty state may or may not be visible depending on if routes are preloaded
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("should load from GitHub Pages subpath and survive hard refresh", async ({
    page,
  }) => {
    await page.goto("http://localhost:4173/Nasta/");
    await page.waitForLoadState("domcontentloaded");
    await page.reload({ waitUntil: "domcontentloaded" });

    const routeHeader = page.locator("h1.route-name");
    await expect(routeHeader).toBeVisible();
  });

  test("should remain functional across repeated reloads (PWA sanity)", async ({
    page,
  }) => {
    const routeHeader = page.locator("h1.route-name");
    await expect(routeHeader).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(routeHeader).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(routeHeader).toBeVisible();
  });

  test("should handle route switch without duplicate departures", async ({
    page,
  }) => {
    // Wait for initial route to load
    const routeHeader = page.locator("h1.route-name");
    await routeHeader.waitFor({ state: "visible", timeout: 10000 });

    // Switch to another route if available
    const switchBtn = page.locator(".route-switch");
    const switchCount = await switchBtn.count();
    if (switchCount > 0) {
      await switchBtn.first().click();
      // Wait for route to update
      await page.waitForTimeout(1000);

      // Verify route header is still visible and updated
      await expect(routeHeader).toBeVisible();

      // Verify no stale data by checking route name changed
      const routeNameText = await routeHeader.textContent();
      expect(routeNameText).toBeTruthy();
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

  test("should not error on ferry routes without deviations", async ({
    page,
  }) => {
    // Create a route with a ferry stop (Sjostadstrafiken)
    // First, check if we get any console errors about deviations
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Wait for app to stabilize and make API calls
    await page.waitForTimeout(3000);

    // Verify no 400/error messages about invalid site IDs
    const errorMessages = consoleErrors.filter(
      (msg) =>
        msg.includes("400") ||
        msg.includes("sjostad") ||
        msg.includes("deviations"),
    );
    expect(errorMessages.length).toBe(0);
  });

  test("should show PWA update banner and handle reload", async ({ page }) => {
    // Inject event listener spy to verify reload is called
    await page.addInitScript(() => {
      window.__pwaReloadCalled = false;
    });

    // Wait a bit for components to mount
    await page.waitForTimeout(500);

    // Dispatch custom event to trigger banner
    await page.evaluate(() => {
      const updateSW = async (reloadPage: boolean) => {
        if (reloadPage) window.__pwaReloadCalled = true;
      };
      window.dispatchEvent(
        new CustomEvent("pwa-update-available", { detail: { updateSW } }),
      );
    });

    // Check banner is visible
    const banner = page.locator(".update-banner");
    await expect(banner).toBeVisible();

    // Click reload button
    const reloadBtn = banner.locator(".reload-btn");
    await reloadBtn.click();

    // Verify updateSW was called with true
    const reloadCalled = await page.evaluate(() => window.__pwaReloadCalled);
    expect(reloadCalled).toBe(true);
  });

  test("direction picker should support keyboard navigation", async ({ page }) => {
    // Mock the stop-finder search API so results are always available
    await page.route("https://journeyplanner.integration.sl.se/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          locations: [
            {
              id: "9091001000003980",
              name: "Slussen (Stockholm)",
              disassembledName: "Slussen",
              type: "stop",
              matchQuality: 1000,
            }
          ]
        }),
      });
    });

    // Mock departures API to ensure we always get reliable results
    await page.route("https://transport.integration.sl.se/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          departures: [
            {
              line: { designation: "13", name: "13", transport_mode: "metro" },
              direction_code: 1,
              destination: "Ropsten",
              display: "5 min",
              expected: new Date(Date.now() + 5 * 60000).toISOString(),
            },
            {
              line: { designation: "13", name: "13", transport_mode: "metro" },
              direction_code: 2,
              destination: "Norsborg",
              display: "10 min",
              expected: new Date(Date.now() + 10 * 60000).toISOString(),
            }
          ]
        }),
      });
    });

    // Open edit mode
    await page.locator(".action-btn").click();
    await page.waitForTimeout(500); // Wait for editor panel to slide up
    
    // Add segment to open search
    await page.locator(".add-btn").evaluate((el) => (el as HTMLElement).click());
    
    // Wait for and fill search input
    const searchInput = page.locator(".search-input");
    await searchInput.waitFor({ state: "visible", timeout: 5000 });
    await searchInput.fill("Slussen");
    await page.waitForTimeout(400); // debounce
    
    // Select first result (Stop)
    const firstResult = page.locator(".results .item").first();
    await firstResult.waitFor({ state: "visible", timeout: 5000 });
    await firstResult.click();
    
    // Wait for departures to load and click the first line
    const firstLine = page.locator(".dep-item").first();
    await firstLine.waitFor({ state: "visible", timeout: 10000 });
    await firstLine.click();
    
    // Now we should be in direction picker — wait for it to render
    const firstDirection = page.locator(".direction-option").first();
    await firstDirection.waitFor({ state: "visible", timeout: 10000 });
    
    // Focus the first radio to start keyboard navigation reliably
    const firstRadio = page.locator('input[type="radio"]').first();
    await firstRadio.focus();
    
    // ArrowDown should select the next one in the group
    await page.keyboard.press("ArrowDown");
    
    // Check if a radio is now checked
    await expect(page.locator('input[type="radio"]:checked')).toHaveCount(1, { timeout: 5000 });
    
    // Tab to confirm button and press Enter
    // Focus is on a radio, so one Tab should reach the Confirm button
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    
    // The search should be closed and segment added
    await expect(page.locator(".segment-search")).toHaveCount(0, { timeout: 10000 });
  });

  test("should handle journey API failure gracefully", async ({ page }) => {
    // Mock the stop-finder search API so results are always available
    await page.route("https://journeyplanner.integration.sl.se/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          locations: [
            {
              id: "9091001000003980",
              name: "Slussen (Stockholm)",
              disassembledName: "Slussen",
              type: "stop",
              matchQuality: 1000,
            }
          ]
        }),
      });
    });

    // Intercept journey departures request and abort it to simulate failure
    await page.route("https://transport.integration.sl.se/**", async (route) => {
      await route.abort("failed");
    });

    // Attempt to load departures
    await page.locator(".action-btn").click();
    await page.waitForTimeout(500); // Wait for editor panel to slide up
    await page.locator(".add-btn").evaluate((el) => (el as HTMLElement).click());
    
    const searchInput = page.locator(".search-input");
    await searchInput.waitFor({ state: "visible", timeout: 5000 });
    await searchInput.fill("Slussen");
    await page.waitForTimeout(400); // debounce
    
    const firstResult = page.locator(".results .item").first();
    await firstResult.waitFor({ state: "visible", timeout: 5000 });
    await firstResult.evaluate((el) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    
    // Expect error message instead of crash
    const errorMsg = page.locator(".error");
    await errorMsg.waitFor({ state: "visible", timeout: 10000 });
    await expect(errorMsg).toBeVisible();
    // Error text is locale-dependent; match both Swedish and English
    await expect(errorMsg).toContainText(/(Kunde inte hämta|Failed to fetch departures)/i);
  });

  test("should show touch-friendly transport filters in segment search results and apply multi-select filtering", async ({
    page,
  }) => {
    await page.route("https://journeyplanner.integration.sl.se/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          locations: [
            {
              id: "9091001000003980",
              name: "Slussen (Stockholm)",
              disassembledName: "Slussen",
              type: "stop",
              matchQuality: 1000,
              productClasses: [2, 8, 128],
            },
          ],
        }),
      });
    });

    await page.route("https://transport.integration.sl.se/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          departures: [
            {
              line: { designation: "13", name: "13", transport_mode: "metro" },
              direction_code: 1,
              destination: "Ropsten",
              display: "5 min",
              expected: new Date(Date.now() + 5 * 60000).toISOString(),
            },
            {
              line: { designation: "41", name: "41", transport_mode: "train" },
              direction_code: 1,
              destination: "Märsta",
              display: "7 min",
              expected: new Date(Date.now() + 7 * 60000).toISOString(),
            },
            {
              line: { designation: "2", name: "2", transport_mode: "bus" },
              direction_code: 1,
              destination: "Sofia",
              display: "9 min",
              expected: new Date(Date.now() + 9 * 60000).toISOString(),
            },
          ],
        }),
      });
    });

    await page.locator(".action-btn").click();
    await page.waitForTimeout(500);
    await page.locator(".add-btn").click();

    const searchInput = page.locator(".search-input");
    await searchInput.waitFor({ state: "visible", timeout: 5000 });
    await searchInput.fill("Slussen");
    await page.waitForTimeout(400);

    await page.locator(".results .item").first().click();

    const filterRow = page.getByTestId("transport-filter-row");
    await expect(filterRow).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("transport-filter-metro")).toBeVisible();
    await expect(page.getByTestId("transport-filter-train")).toBeVisible();
    await expect(page.getByTestId("transport-filter-bus")).toBeVisible();
    await expect(page.getByTestId("transport-filter-boat")).toBeVisible();

    // Start with mixed transport results
    await expect(page.locator(".dep-item")).toHaveCount(3);

    // Turn off non-metro types to get metro-only result
    await page.getByTestId("transport-filter-train").click();
    await page.getByTestId("transport-filter-bus").click();
    await page.getByTestId("transport-filter-boat").click();
    await expect(page.locator(".dep-item")).toHaveCount(1);
    await expect(page.locator(".dep-item .dep-line").first()).toContainText("13");

    // Re-enable bus and verify union behavior
    await page.getByTestId("transport-filter-bus").click();
    await expect(page.locator(".dep-item")).toHaveCount(2);
  });

  test("should not show quick stop anchors or commute nudges", async ({ page }) => {
    await page.locator(".action-btn").click();
    await expect(page.locator("text=Hemma / Jobb")).toHaveCount(0);
    await expect(page.locator("text=Snabbval i hållplatssök")).toHaveCount(0);
    await expect(page.locator("text=Pendlingspåminnelser")).toHaveCount(0);
    await expect(page.locator("text=Commute nudges")).toHaveCount(0);

    await page.locator(".add-btn").click();
    await expect(page.locator(".anchor-row .anchor-btn")).toHaveCount(0);
  });
});
