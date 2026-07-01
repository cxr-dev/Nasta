import { test, expect } from "@playwright/test";

/**
 * E2E tests for the three features added to departure cards:
 * 1. Weather badge (precipitation icon in card meta)
 * 2. JourneyCard rendering (multi-leg journey segments)
 * 3. Station grouping pill layout (route number as pill + bigger destination)
 */

// Shared helpers
function mockSlApi(route: any) {
  const url = route.request().url();
  if (url.includes("departures")) {
    const now = new Date();
    const dep = (mins: number) =>
      new Date(now.getTime() + mins * 60000).toISOString();
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        departures: [
          {
            line: { designation: "14" },
            direction_code: 1,
            destination: "Mörby centrum",
            display: "3 min",
            expected: dep(3),
          },
        ],
      }),
    });
  } else if (url.includes("deviations") || url.includes("messages")) {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  } else if (url.includes("journeyplanner") || url.includes("trip")) {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ trips: [] }),
    });
  } else {
    route.continue();
  }
}

function disableAnimations(page: any) {
  return page.addStyleTag({
    content: `*, *::before, *::after { transition: none !important; animation: none !important; }`,
  });
}

// ─────────────────────────────────────────────
// 1. WEATHER BADGE
// ─────────────────────────────────────────────
test.describe("Weather badge in departure cards", () => {
  test("shows weather badge when precipitation is forecast", async ({ page }) => {
    // Mock Open-Meteo API to return rain (WMO code 61)
    await page.route("**/api.open-meteo.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          current: { weather_code: 61, temperature_2m: 8.5 },
          daily: {
            weather_code: [61],
            temperature_2m_max: [10],
            temperature_2m_min: [5],
          },
        }),
      });
    });

    await page.route("**/*.integration.sl.se/**", mockSlApi);

    const defaultRoutes = [
      {
        id: "w1",
        name: "Test",
        segments: [
          {
            id: "ws1",
            line: "14",
            lineName: "14",
            direction: { code: 1, destination: "Mörby centrum", stopPointId: "" },
            fromStop: { id: "f1", name: "T-Centralen", siteId: "100", coord: [59.33, 18.06] },
            toStop: { id: "t1", name: "Mörby centrum", siteId: "456" },
            transportType: "metro",
          },
        ],
      },
    ];

    await page.addInitScript((data) => {
      localStorage.setItem("nasta_routes", JSON.stringify(data));
    }, defaultRoutes);

    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await disableAnimations(page);

    // Wait for departure card to render
    const segmentRow = page.getByTestId("segment-row");
    await expect(segmentRow).toBeVisible({ timeout: 15000 });

    // Weather badge should appear (rain icon)
    const weatherBadge = page.locator("svg.weather-indicator");
    await expect(weatherBadge).toBeVisible({ timeout: 10000 });
    await expect(weatherBadge).toHaveAttribute("aria-label", "Rain");
  });

  test("no weather badge when no precipitation", async ({ page }) => {
    // Mock Open-Meteo API to return clear sky (WMO code 0)
    await page.route("**/api.open-meteo.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          current: { weather_code: 0, temperature_2m: 15 },
          daily: {
            weather_code: [0],
            temperature_2m_max: [18],
            temperature_2m_min: [10],
          },
        }),
      });
    });

    await page.route("**/*.integration.sl.se/**", mockSlApi);

    const defaultRoutes = [
      {
        id: "w2",
        name: "Test",
        segments: [
          {
            id: "ws2",
            line: "14",
            lineName: "14",
            direction: { code: 1, destination: "Mörby centrum", stopPointId: "" },
            fromStop: { id: "f1", name: "T-Centralen", siteId: "100", coord: [59.33, 18.06] },
            toStop: { id: "t1", name: "Mörby centrum", siteId: "456" },
            transportType: "metro",
          },
        ],
      },
    ];

    await page.addInitScript((data) => {
      localStorage.setItem("nasta_routes", JSON.stringify(data));
    }, defaultRoutes);

    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await disableAnimations(page);

    const segmentRow = page.getByTestId("segment-row");
    await expect(segmentRow).toBeVisible({ timeout: 15000 });

    // Weather badge should NOT appear
    const weatherBadge = page.locator("svg.weather-indicator");
    await expect(weatherBadge).not.toBeVisible({ timeout: 5000 });
  });

  test("no weather badge when current is clear but daily forecast shows rain", async ({ page }) => {
    // Regression: daily forecast shows rain, but current conditions are clear.
    // getWeatherForStation should use current (WMO 0), not daily (WMO 61).
    await page.route("**/api.open-meteo.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          current: { weather_code: 0, temperature_2m: 18 },
          daily: {
            weather_code: [61],
            temperature_2m_max: [22],
            temperature_2m_min: [14],
          },
        }),
      });
    });

    await page.route("**/*.integration.sl.se/**", mockSlApi);

    const defaultRoutes = [
      {
        id: "w3",
        name: "Test",
        segments: [
          {
            id: "ws3",
            line: "14",
            lineName: "14",
            direction: { code: 1, destination: "Mörby centrum", stopPointId: "" },
            fromStop: { id: "f1", name: "T-Centralen", siteId: "100", coord: [59.33, 18.06] },
            toStop: { id: "t1", name: "Mörby centrum", siteId: "456" },
            transportType: "metro",
          },
        ],
      },
    ];

    await page.addInitScript((data) => {
      localStorage.setItem("nasta_routes", JSON.stringify(data));
    }, defaultRoutes);

    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await disableAnimations(page);

    const segmentRow = page.getByTestId("segment-row");
    await expect(segmentRow).toBeVisible({ timeout: 15000 });

    // Weather badge should NOT appear (current conditions are clear)
    const weatherBadge = page.locator("svg.weather-indicator");
    await expect(weatherBadge).not.toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────
// 2. JOURNEY CARD
// ─────────────────────────────────────────────
test.describe("JourneyCard for multi-leg journeys", () => {
  test("renders JourneyCard when segment has journeyMeta", async ({ page }) => {
    await page.route("**/*.integration.sl.se/**", mockSlApi);

    const now = Date.now();
    const routes = [
      {
        id: "j1",
        name: "Journey Test",
        segments: [
          {
            id: "js1",
            line: "14",
            lineName: "14",
            direction: { code: 1, destination: "Mörby centrum", stopPointId: "" },
            fromStop: { id: "f1", name: "T-Centralen", siteId: "100" },
            toStop: { id: "t1", name: "Mörby centrum", siteId: "456" },
            transportType: "metro",
            journeyMeta: {
              journeyId: "journey-1",
              originLabel: "T-Centralen",
              destLabel: "Mörby centrum",
              totalDurationMin: 25,
              transfers: 1,
              updatedAt: now,
              legs: [
                {
                  originName: "T-Centralen",
                  originSiteId: "100",
                  destName: "Östermalmstorg",
                  destSiteId: "200",
                  transportType: "metro" as const,
                  line: "14",
                  lineName: "14",
                  directionCode: 1,
                  directionName: "Mörby centrum",
                  departureTime: now + 5 * 60000,
                  arrivalTime: now + 12 * 60000,
                  durationMin: 7,
                  platformPosition: "middle" as const,
                },
                {
                  originName: "Östermalmstorg",
                  originSiteId: "200",
                  destName: "Mörby centrum",
                  destSiteId: "456",
                  transportType: "metro" as const,
                  line: "14",
                  lineName: "14",
                  directionCode: 1,
                  directionName: "Mörby centrum",
                  departureTime: now + 15 * 60000,
                  arrivalTime: now + 30 * 60000,
                  durationMin: 15,
                  platformPosition: "front" as const,
                },
              ],
            },
          },
        ],
      },
    ];

    await page.addInitScript((data) => {
      localStorage.setItem("nasta_routes", JSON.stringify(data));
    }, routes);

    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await disableAnimations(page);

    // JourneyCard should render (article.journey-card)
    const journeyCard = page.locator("article.journey-card");
    await expect(journeyCard).toBeVisible({ timeout: 15000 });

    // Should show destination label
    await expect(journeyCard.locator(".dest-label")).toContainText("Mörby centrum");

    // Should show duration
    await expect(journeyCard.locator(".duration")).toContainText("25 min");

    // Should show transfers
    await expect(journeyCard.locator(".transfers")).toContainText("1 transfer");

    // Regular departure card should NOT be rendered for this segment
    const departureCard = page.getByTestId("segment-row");
    await expect(departureCard).not.toBeVisible({ timeout: 5000 });
  });

  test("renders DepartureRow when segment has no journeyMeta", async ({ page }) => {
    await page.route("**/*.integration.sl.se/**", mockSlApi);

    const routes = [
      {
        id: "j2",
        name: "Normal Test",
        segments: [
          {
            id: "js2",
            line: "14",
            lineName: "14",
            direction: { code: 1, destination: "Mörby centrum", stopPointId: "" },
            fromStop: { id: "f1", name: "T-Centralen", siteId: "100" },
            toStop: { id: "t1", name: "Mörby centrum", siteId: "456" },
            transportType: "metro",
            // No journeyMeta
          },
        ],
      },
    ];

    await page.addInitScript((data) => {
      localStorage.setItem("nasta_routes", JSON.stringify(data));
    }, routes);

    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await disableAnimations(page);

    // Regular departure card should render
    const departureCard = page.getByTestId("segment-row");
    await expect(departureCard).toBeVisible({ timeout: 15000 });

    // JourneyCard should NOT be rendered
    const journeyCard = page.locator("article.journey-card");
    await expect(journeyCard).not.toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────
// 3. STATION GROUPING PILL LAYOUT
// ─────────────────────────────────────────────
test.describe("Station grouping pill layout", () => {
  test("shows route-pill and dest-text when grouping by station", async ({ page }) => {
    await page.route("**/*.integration.sl.se/**", mockSlApi);

    // Seed routes with multiple segments from the same station
    const routes = [
      {
        id: "sg1",
        name: "Station Group Test",
        segments: [
          {
            id: "sgs1",
            line: "14",
            lineName: "14",
            direction: { code: 1, destination: "Mörby centrum", stopPointId: "" },
            fromStop: { id: "f1", name: "T-Centralen", siteId: "100" },
            toStop: { id: "t1", name: "Mörby centrum", siteId: "456" },
            transportType: "metro",
          },
          {
            id: "sgs2",
            line: "17",
            lineName: "17",
            direction: { code: 1, destination: "Skarpnäck", stopPointId: "" },
            fromStop: { id: "f1", name: "T-Centralen", siteId: "100" },
            toStop: { id: "t2", name: "Skarpnäck", siteId: "789" },
            transportType: "metro",
          },
        ],
      },
    ];

    // Set groupingMode to 'station' in settings
    await page.addInitScript((data) => {
      localStorage.setItem("nasta_routes", JSON.stringify(data.routes));
      const settings = { groupingMode: "station" };
      localStorage.setItem("nasta_settings", JSON.stringify(settings));
    }, { routes });

    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await disableAnimations(page);

    // Wait for departure cards to render
    const segmentRow = page.getByTestId("segment-row");
    await expect(segmentRow.first()).toBeVisible({ timeout: 15000 });

    // Section label for station group should be visible
    const sectionLabel = page.locator(".section-label");
    await expect(sectionLabel).toBeVisible({ timeout: 5000 });
    await expect(sectionLabel).toContainText("T-Centralen");

    // Route pill should be visible (station mode)
    const routePill = page.locator(".route-pill");
    await expect(routePill).toHaveCount(2, { timeout: 10000 });
    await expect(routePill.first()).toContainText("14");
    await expect(routePill.nth(1)).toContainText("17");

    // Destination text should be visible with bigger font
    const destText = page.locator(".dest-text");
    await expect(destText).toHaveCount(2, { timeout: 5000 });
    await expect(destText.first()).toContainText("Mörby centrum");
    await expect(destText.nth(1)).toContainText("Skarpnäck");

    // from-stop should NOT be visible (hidden in station mode)
    const fromStop = page.locator(".from-stop");
    await expect(fromStop).not.toBeVisible({ timeout: 5000 });
  });

  test("shows normal layout when grouping mode is not station", async ({ page }) => {
    await page.route("**/*.integration.sl.se/**", mockSlApi);

    const routes = [
      {
        id: "sg2",
        name: "Normal Group Test",
        segments: [
          {
            id: "sgs3",
            line: "14",
            lineName: "14",
            direction: { code: 1, destination: "Mörby centrum", stopPointId: "" },
            fromStop: { id: "f1", name: "T-Centralen", siteId: "100" },
            toStop: { id: "t1", name: "Mörby centrum", siteId: "456" },
            transportType: "metro",
          },
        ],
      },
    ];

    // Set groupingMode to 'none' (default)
    await page.addInitScript((data) => {
      localStorage.setItem("nasta_routes", JSON.stringify(data.routes));
      const settings = { groupingMode: "none" };
      localStorage.setItem("nasta_settings", JSON.stringify(settings));
    }, { routes });

    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await disableAnimations(page);

    const segmentRow = page.getByTestId("segment-row");
    await expect(segmentRow).toBeVisible({ timeout: 15000 });

    // Normal layout: from-stop should be visible
    const fromStop = page.locator(".from-stop");
    await expect(fromStop).toBeVisible({ timeout: 5000 });
    await expect(fromStop).toContainText("T-Centralen");

    // route-pill should NOT be visible
    const routePill = page.locator(".route-pill");
    await expect(routePill).not.toBeVisible({ timeout: 5000 });

    // dest-text should NOT be visible (normal to-dest instead)
    const destText = page.locator(".dest-text");
    await expect(destText).not.toBeVisible({ timeout: 5000 });

    // to-dest should be visible
    const toDest = page.locator(".to-dest");
    await expect(toDest).toBeVisible({ timeout: 5000 });
    await expect(toDest).toContainText("Mörby centrum");
  });
});
