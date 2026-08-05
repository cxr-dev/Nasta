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

test.describe("Departure skeleton loader", () => {
  test("spans the tablet list width and keeps three compact cards", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.route("**/*.integration.sl.se/**", async (route) => {
      if (route.request().url().includes("departures")) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      await mockSlApi(route);
    });

    await page.addInitScript(() => {
      localStorage.setItem("nasta_routes", JSON.stringify([
        {
          id: "skeleton-1",
          name: "Skeleton test",
          segments: [{
            id: "skeleton-segment-1",
            line: "14",
            lineName: "14",
            direction: { code: 1, destination: "Mörby centrum", stopPointId: "" },
            fromStop: { id: "from-1", name: "T-Centralen", siteId: "100" },
            toStop: { id: "to-1", name: "Mörby centrum", siteId: "456" },
            transportType: "metro",
          }],
        },
      ]));
    });

    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });

    const skeleton = page.locator(".loading-skeleton");
    await expect(skeleton).toBeVisible({ timeout: 5000 });
    await expect(skeleton.locator(".skeleton-card")).toHaveCount(3);

    const listBox = await page.locator(".card-list").boundingBox();
    const skeletonBox = await skeleton.boundingBox();
    expect(listBox).not.toBeNull();
    expect(skeletonBox).not.toBeNull();
    expect(skeletonBox!.width).toBeGreaterThan(listBox!.width * 0.9);
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

  test("refreshes saved journeys using the stored route preference", async ({ page }) => {
    const now = Date.now();
    const rawTrip = (departureMinutes: number, arrivalMinutes: number, durationMinutes: number, legs: number) => ({
      legs: Array.from({ length: legs }, (_, index) => ({
        origin: {
          name: index === 0 ? "T-Centralen" : "Östermalmstorg",
          disassembledName: index === 0 ? "T-Centralen" : "Östermalmstorg",
          departureTimePlanned: new Date(now + (departureMinutes + index * 8) * 60000).toISOString(),
        },
        destination: {
          name: index === legs - 1 ? "Mörby centrum" : "Östermalmstorg",
          disassembledName: index === legs - 1 ? "Mörby centrum" : "Östermalmstorg",
          arrivalTimePlanned: new Date(now + (arrivalMinutes - (legs - index - 1) * 8) * 60000).toISOString(),
        },
        transportation: {
          name: "Tunnelbana 14",
          disassembledName: "14",
          product: { name: "METRO" },
        },
        duration: durationMinutes * 60 / legs,
        direction: 1,
        directionName: "Mörby centrum",
      })),
    });

    await page.route("**/*.integration.sl.se/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/trips")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            // The zero-transfer option arrives later, proving the stored
            // leastinterchange preference is applied during refresh.
            journeys: [
              rawTrip(3, 20, 17, 2),
              rawTrip(5, 30, 25, 1),
            ],
          }),
        });
        return;
      }
      await mockSlApi(route);
    });

    const routes = [{
      id: "refresh-test",
      name: "Refresh Test",
      segments: [{
        id: "refresh-segment",
        line: "14",
        lineName: "14",
        direction: { code: 1, destination: "Mörby centrum", stopPointId: "" },
        fromStop: { id: "f1", name: "T-Centralen", siteId: "100" },
        toStop: { id: "t1", name: "Mörby centrum", siteId: "456" },
        transportType: "metro",
        journeyMeta: {
          journeyId: "old-journey",
          originLabel: "T-Centralen",
          destLabel: "Mörby centrum",
          totalDurationMin: 10,
          transfers: 1,
          updatedAt: now,
          status: "planned",
          query: {
            origin: "T-Centralen",
            destination: "Mörby centrum",
            originCoord: [59.33, 18.06],
            destinationCoord: [59.4, 18.05],
            routeType: "leastinterchange",
          },
          legs: [{
            originName: "T-Centralen",
            destName: "Mörby centrum",
            transportType: "metro" as const,
            line: "14",
            lineName: "14",
            directionCode: 1,
            directionName: "Mörby centrum",
            departureTime: now + 30 * 60000,
            arrivalTime: now + 40 * 60000,
            durationMin: 10,
            platformPosition: "middle" as const,
          }],
        },
      }],
    }];

    await page.addInitScript((data) => {
      localStorage.setItem("nasta_routes", JSON.stringify(data));
    }, routes);
    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await disableAnimations(page);

    const journeyCard = page.locator("article.journey-card");
    await expect(journeyCard).toBeVisible({ timeout: 15000 });
    await expect(journeyCard.locator(".transfers")).toContainText("Direct", { timeout: 15000 });
    await expect(journeyCard.locator(".duration")).toContainText("25 min");
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
test.describe("Station grouping C2 layout", () => {
  test("shows destination-first cards with a fixed countdown rail when grouping by station", async ({ page }) => {
    await page.route("**/*.integration.sl.se/**", async (route) => {
      if (route.request().url().includes("departures")) {
        const now = new Date();
        const dep = (mins: number) => new Date(now.getTime() + mins * 60000).toISOString();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            departures: [3, 13, 23].map((mins) => ({
              line: { designation: "14" },
              direction_code: 1,
              destination: "Mörby centrum",
              display: `${mins} min`,
              expected: dep(mins),
            })),
          }),
        });
        return;
      }
      await mockSlApi(route);
    });

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

    // Service identity remains visible in the lower-left service row.
    const stackedPill = page.locator(".stacked-pill");
    await expect(stackedPill).toHaveCount(2, { timeout: 10000 });
    await expect(stackedPill.first()).toContainText("14");
    await expect(stackedPill.nth(1)).toContainText("17");

    const stationCards = page.locator(".station-card-main");
    await expect(stationCards).toHaveCount(2, { timeout: 5000 });
    await expect(page.locator(".station-destination")).toHaveCount(2);
    await expect(page.locator(".station-destination").first()).toContainText("Mörby centrum");
    await expect(page.locator(".station-destination").nth(1)).toContainText("Skarpnäck");

    // Countdown and subsequent times occupy separate parts of the card.
    await expect(page.locator(".station-time-rail")).toHaveCount(2);
    await expect(page.locator(".station-clock-times").first()).toBeVisible();
    await expect(page.locator(".station-card-main .station-divider")).toHaveCount(0);

    const firstCard = stationCards.first();
    const identityBox = await firstCard.locator(".station-service-identity").boundingBox();
    const timesBox = await firstCard.locator(".station-clock-times").boundingBox();
    const metricBox = await firstCard.locator(".station-time-rail").boundingBox();
    expect(identityBox).not.toBeNull();
    expect(timesBox).not.toBeNull();
    expect(metricBox).not.toBeNull();
    expect(timesBox!.x).toBeGreaterThan(identityBox!.x + identityBox!.width);
    expect(timesBox!.x + timesBox!.width).toBeLessThan(metricBox!.x + metricBox!.width);

    // The station name belongs to the group header, not each card.
    await expect(stationCards.first()).not.toContainText("T-Centralen");

    // from-stop should NOT be visible (hidden in station mode)
    const fromStop = page.locator(".from-stop");
    await expect(fromStop).not.toBeVisible({ timeout: 5000 });

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 820, height: 1180 },
    ]) {
      await page.setViewportSize(viewport);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator(".station-card-main").first()).toBeVisible({ timeout: 10000 });
      await expect(page.locator(".station-card-main")).toHaveCount(2);
      await expect(page.locator(".station-time-rail").first()).toBeVisible();
      await expect(page.locator(".station-time-rail .countdown").first()).toHaveCSS("white-space", "nowrap");
    }
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

    // stacked-pill should NOT be visible (station-only class)
    const stackedPill = page.locator(".stacked-pill");
    await expect(stackedPill).not.toBeVisible({ timeout: 5000 });

    // Station-only structure should not be present.
    const stationCard = page.locator(".station-card-main");
    await expect(stationCard).toHaveCount(0);

    // to-dest should be visible
    const toDest = page.locator(".to-dest");
    await expect(toDest).toBeVisible({ timeout: 5000 });
    await expect(toDest).toContainText("Mörby centrum");
  });
});
