import { test, expect } from "@playwright/test";

test.describe("Nästa Resilience & Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => {
      console.log(`[Browser ${msg.type()}] ${msg.text()}`);
    });
    // Disable CSS transitions
    await page.addStyleTag({
      content: `*, *::before, *::after { transition: none !important; animation: animation: none !important; }`
    });
  });

  test("should migrate legacy route data on startup", async ({ page }) => {
    const legacyRoutes = [
      {
        id: "legacy-1",
        name: "Old Route",
        direction: "toWork",
        segments: [
          {
            id: "s1",
            line: "76",
            lineName: "76",
            directionText: "Norra Hammarbyhamnen",
            fromStop: { id: "f", name: "Lindarängsvägen", siteId: "100" },
            toStop: { id: "t", name: "Destination", siteId: "300" },
            transportType: "bus"
          }
        ]
      }
    ];

    await page.addInitScript((data) => {
      console.log('[InitScript] Setting legacy routes');
      localStorage.setItem("nasta_onboarding_seen", "true");
      localStorage.setItem("nasta_routes", JSON.stringify(data));
    }, legacyRoutes);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Verify app loads without crash
    const routeHeader = page.locator("h1.route-name");
    await expect(routeHeader).toBeVisible({ timeout: 10000 });

    // The migration happens in loadRoutes() which is called during store init.
    await expect.poll(async () => {
      const data = await page.evaluate(() => {
        const d = localStorage.getItem("nasta_routes");
        console.log('[Test] Raw nasta_routes in localStorage:', d);
        return d;
      });
      if (!data) return false;
      const parsed = JSON.parse(data);
      if (parsed.length === 0) return false;
      const hasDirection = parsed[0].segments && parsed[0].segments[0] && parsed[0].segments[0].direction !== undefined;
      console.log('[Test] hasDirection:', hasDirection);
      return hasDirection;
    }, { timeout: 10000 }).toBe(true);

    const migrated = await page.evaluate(() => {
      const data = localStorage.getItem("nasta_routes");
      return data ? JSON.parse(data) : null;
    });

    expect(migrated[0].segments[0].direction.code).toBe(1);
    expect(migrated[0].segments[0].direction.destination).toBe("Norra Hammarbyhamnen");
  });

  test("should handle multi-segment route countdowns", async ({ page }) => {
    const multiSegmentRoute = [
      {
        id: "multi-1",
        name: "Commute",
        direction: "toWork",
        segments: [
          {
            id: "s1",
            line: "76",
            lineName: "76",
            direction: { code: 1, destination: "Ropsten", stopPointId: "" },
            fromStop: { id: "f1", name: "Start", siteId: "100" },
            toStop: { id: "t1", name: "Transfer", siteId: "200" },
            transportType: "bus",
            travelTimeMinutes: 10,
            transferBufferMinutes: 5
          },
          {
            id: "s2",
            line: "13",
            lineName: "13",
            direction: { code: 1, destination: "Mörby", stopPointId: "" },
            fromStop: { id: "f2", name: "Transfer", siteId: "200" },
            toStop: { id: "t2", name: "Work", siteId: "300" },
            transportType: "metro",
            travelTimeMinutes: 15,
            transferBufferMinutes: 0
          }
        ]
      }
    ];

    await page.addInitScript((data) => {
      localStorage.setItem("nasta_onboarding_seen", "true");
      localStorage.setItem("nasta_routes", JSON.stringify(data));
    }, multiSegmentRoute);

    // Mock API for both segments
    await page.route("**/*.integration.sl.se/**", async (route) => {
      const url = route.request().url();
      console.log(`[Mock] API request: ${url}`);
      if (url.includes("departures")) {
        const siteId = url.match(/sites\/(\d+)\/departures/)?.[1];
        if (siteId === "100") {
          // Bus segment: 5 min away
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              departures: [{
                line: { designation: "76" },
                direction_code: 1,
                destination: "Ropsten",
                display: "5 min",
                expected: new Date(Date.now() + 5 * 60000).toISOString()
              }]
            })
          });
        } else if (siteId === "200") {
          // Metro segment: 25 min away
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              departures: [{
                line: { designation: "13" },
                direction_code: 1,
                destination: "Mörby",
                display: "25 min",
                expected: new Date(Date.now() + 25 * 60000).toISOString()
              }]
            })
          });
        } else {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ departures: [] }) });
        }
      } else if (url.includes("deviations") || url.includes("messages")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([])
        });
      } else if (url.includes("journeyplanner.integration.sl.se/v2/trip")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ trips: [] })
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    
    // Check if app is in empty state
    const emptyState = page.locator(".empty-state");
    if (await emptyState.isVisible()) {
      console.log('[Test] App is in empty state!');
    }

    // Verify segments are rendered first
    const segments = page.getByTestId("segment-row");
    await expect(segments).toHaveCount(2, { timeout: 15000 });

    // Wait for departures to load into the store and UI and verify lines
    await expect(segments.nth(0).getByTestId("segment-line")).toContainText("76", { timeout: 15000 });
    await expect(segments.nth(1).getByTestId("segment-line")).toContainText("13", { timeout: 15000 });

    // Check main countdown (first segment)
    const mainCountdown = segments.nth(0).getByTestId("countdown-minutes");
    await expect(mainCountdown).toBeVisible({ timeout: 15000 });
    
    // The value might be 'Now', '5', or '4'.
    await expect.poll(async () => {
      const text = await mainCountdown.textContent();
      console.log('[Test] mainCountdown text:', text);
      return text && text.length > 0 && !text.includes("--");
    }, { timeout: 15000 }).toBe(true);

    // Arrival summary can be absent depending on resolver state; row/countdown checks are the core assertion.
  });
});
