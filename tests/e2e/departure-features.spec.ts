import { test, expect, type Page } from "@playwright/test";

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

async function disableAnimations(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
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

test.describe("Station notice width", () => {
  test("matches the page header width when collapsed and expanded", async ({ page }) => {
    await page.route("**/*.integration.sl.se/**", mockSlApi);
    await page.route("**/deviations.integration.sl.se/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            deviation_case_id: "station-info-width",
            priority: { importance_level: 3, influence_level: 1, urgency_level: 1 },
            message_variants: [{ language: "sv", header: "T-Centralen: Hiss avstängd" }],
            scope: {
              stop_areas: [{ id: "100", name: "T-Centralen" }],
              lines: [{ id: "14", designation: "14", transport_mode: "METRO" }],
            },
          },
        ]),
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem("nasta_routes", JSON.stringify([
        {
          id: "station-info-width-route",
          name: "Station info width",
          segments: [{
            id: "station-info-width-segment",
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

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });

      const notice = page.locator(".notice-bar");
      const header = page.locator(".page-chrome");
      await expect(notice).toBeVisible({ timeout: 15000 });
      await expect(header).toBeVisible();

      const noticeBox = await notice.boundingBox();
      const headerBox = await header.boundingBox();
      expect(noticeBox).not.toBeNull();
      expect(headerBox).not.toBeNull();
      expect(Math.abs(noticeBox!.x - headerBox!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(noticeBox!.width - headerBox!.width)).toBeLessThanOrEqual(1);

      await notice.locator(".notice-row").click();
      const panel = page.locator(".notice-panel");
      await expect(panel).toBeVisible();
      const panelBox = await panel.boundingBox();
      expect(panelBox).not.toBeNull();
      expect(Math.abs(panelBox!.x - (noticeBox!.x + 1))).toBeLessThanOrEqual(1);
      expect(Math.abs(panelBox!.width - (noticeBox!.width - 2))).toBeLessThanOrEqual(1);
      expect(await page.locator("body").evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
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
    const countdownBox = await firstCard.locator(".station-time-rail .countdown").boundingBox();
    const cardBox = await firstCard.boundingBox();
    expect(identityBox).not.toBeNull();
    expect(timesBox).not.toBeNull();
    expect(metricBox).not.toBeNull();
    expect(countdownBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    expect(timesBox!.x).toBeGreaterThan(identityBox!.x + identityBox!.width);
    expect(timesBox!.x + timesBox!.width).toBeLessThan(metricBox!.x + metricBox!.width);
    expect(Math.abs((metricBox!.x + metricBox!.width) - (countdownBox!.x + countdownBox!.width))).toBeLessThan(1);
    expect(Math.abs((cardBox!.x + cardBox!.width - 15) - (metricBox!.x + metricBox!.width))).toBeLessThan(2);

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

      if (viewport.width >= 768) {
        const listBox = await page.locator(".card-list").boundingBox();
        const sectionBox = await page.locator(".content-section").boundingBox();
        const listContentWidth = await page.locator(".card-list").evaluate((element) => {
          const styles = getComputedStyle(element);
          return element.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
        });
        expect(listBox).not.toBeNull();
        expect(sectionBox).not.toBeNull();
        expect(sectionBox!.width).toBeGreaterThan(listContentWidth - 1);
      }
    }
  });

  test("splits tablet width when departures and journeys both exist", async ({ page }) => {
    await page.route("**/*.integration.sl.se/**", mockSlApi);

    const now = Date.now();
    const routes = [{
      id: "mixed-layout",
      name: "Mixed Layout",
      segments: [
        {
          id: "mixed-departure",
          line: "14",
          lineName: "14",
          direction: { code: 1, destination: "Mörby centrum", stopPointId: "" },
          fromStop: { id: "f1", name: "T-Centralen", siteId: "100" },
          toStop: { id: "t1", name: "Mörby centrum", siteId: "456" },
          transportType: "metro",
        },
        {
          id: "mixed-journey",
          line: "17",
          lineName: "17",
          direction: { code: 1, destination: "Skarpnäck", stopPointId: "" },
          fromStop: { id: "f2", name: "Odenplan", siteId: "200" },
          toStop: { id: "t2", name: "Skarpnäck", siteId: "789" },
          transportType: "metro",
          journeyMeta: {
            journeyId: "mixed-journey-1",
            originLabel: "Odenplan",
            destLabel: "Skarpnäck",
            totalDurationMin: 24,
            transfers: 1,
            updatedAt: now,
            status: "planned",
            query: { origin: "Odenplan", destination: "Skarpnäck", routeType: "leasttime" },
            legs: [{
              originName: "Odenplan",
              originSiteId: "200",
              destName: "Skarpnäck",
              destSiteId: "789",
              transportType: "metro" as const,
              line: "17",
              lineName: "17",
              directionCode: 1,
              directionName: "Skarpnäck",
              departureTime: now + 5 * 60000,
              arrivalTime: now + 29 * 60000,
              durationMin: 24,
              platformPosition: "middle" as const,
            }],
          },
        },
      ],
    }];

    await page.addInitScript((data) => {
      localStorage.setItem("nasta_routes", JSON.stringify(data));
    }, routes);

    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await disableAnimations(page);
    const sections = page.getByTestId("content-section");
    await expect(sections).toHaveCount(2, { timeout: 15000 });

    const departureSectionLocator = sections.filter({ has: page.getByRole("heading", { name: /departures|avgångar/i }) });
    const journeySectionLocator = sections.filter({ has: page.getByRole("heading", { name: /journeys|resor/i }) });
    const departureSection = await departureSectionLocator.boundingBox();
    const journeySection = await journeySectionLocator.boundingBox();
    const departureCard = await page.getByTestId("segment-row").boundingBox();
    const journeyCard = await page.locator(".journey-card").boundingBox();
    expect(departureSection).not.toBeNull();
    expect(journeySection).not.toBeNull();
    expect(Math.abs(departureSection!.width - journeySection!.width)).toBeLessThan(1);
    expect(departureSection!.x).toBeLessThan(journeySection!.x);
    expect(departureCard).not.toBeNull();
    expect(journeyCard).not.toBeNull();
    expect(departureCard!.x).toBeLessThan(journeyCard!.x);
    expect(Math.abs(departureCard!.width - journeyCard!.width)).toBeLessThan(1);

    const departureToggle = page
      .getByTestId("segment-row")
      .getByRole("button", { name: /14 T-Centralen.*Mörby/i });
    await departureToggle.click();
    await expect(departureToggle).toHaveAttribute("aria-expanded", "true");
    await expect
      .poll(async () => {
        const [departure, journey] = await Promise.all([departureSectionLocator.boundingBox(), journeySectionLocator.boundingBox()]);
        return departure && journey ? Math.abs(departure.height - journey.height) : Number.POSITIVE_INFINITY;
      })
      .toBeLessThan(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(sections).toHaveCount(2, { timeout: 10000 });
    const mobileDeparture = await departureSectionLocator.boundingBox();
    const mobileJourney = await journeySectionLocator.boundingBox();
    expect(mobileDeparture).not.toBeNull();
    expect(mobileJourney).not.toBeNull();
    expect(Math.abs(mobileDeparture!.x - mobileJourney!.x)).toBeLessThan(1);
    expect(mobileJourney!.y).toBeGreaterThan(mobileDeparture!.y + mobileDeparture!.height);

    for (const width of [360, 412]) {
      await page.setViewportSize({ width, height: 844 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(sections).toHaveCount(2, { timeout: 10000 });
      const card = await page.getByTestId("segment-row").boundingBox();
      expect(card).not.toBeNull();
      expect(card!.x).toBeGreaterThanOrEqual(0);
      expect(card!.x + card!.width).toBeLessThanOrEqual(width);
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

// ─────────────────────────────────────────────
// 4. ROUTE STOPS PREFETCH AND STABLE EXPANSION
// ─────────────────────────────────────────────
test.describe("Route stops preview", () => {
  const routes = [{
    id: "route-stops-test",
    name: "Route stops test",
    segments: [{
      id: "route-stops-segment",
      line: "14",
      lineName: "14",
      direction: { code: 1, destination: "Ropsten", stopPointId: "" },
      fromStop: { id: "f1", name: "T-Centralen", siteId: "100" },
      toStop: { id: "t1", name: "Ropsten", siteId: "999" },
      transportType: "metro",
    }],
  }];

  async function installRoutes(page: Page, options: { delayTrip?: boolean } = {}) {
    let releaseTrip: (() => void) | undefined;
    let tripStartedResolve: (() => void) | undefined;
    const tripStarted = new Promise<void>((resolve) => {
      tripStartedResolve = resolve;
    });
    let stopFinderCalls = 0;
    let tripCalls = 0;

    await page.route("**/*.integration.sl.se/**", async (route: any) => {
      const url = route.request().url();
      if (url.includes("/v2/stop-finder")) {
        stopFinderCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            locations: [{ id: "90910010009999", name: "Ropsten", disassembledName: "Ropsten", type: "stop" }],
          }),
        });
        return;
      }
      if (url.includes("/v2/trips")) {
        tripCalls += 1;
        tripStartedResolve?.();
        if (options.delayTrip) {
          await new Promise<void>((resolve) => {
            releaseTrip = resolve;
          });
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            journeys: [{
              legs: [{
                stopSequence: [
                  { name: "Slussen", parent: { disassembledName: "Slussen" } },
                  { name: "Gamla stan", parent: { disassembledName: "Gamla stan" } },
                  { name: "T-Centralen", parent: { disassembledName: "T-Centralen" } },
                  { name: "Östermalmstorg", parent: { disassembledName: "Östermalmstorg" } },
                  { name: "Stadion", parent: { disassembledName: "Stadion" } },
                  { name: "Tekniska högskolan", parent: { disassembledName: "Tekniska högskolan" } },
                  { name: "Ropsten", parent: { disassembledName: "Ropsten" } },
                ],
              }],
            }],
          }),
        });
        return;
      }
      await mockSlApi(route);
    });

    return { tripStarted, get releaseTrip() { return releaseTrip; }, get stopFinderCalls() { return stopFinderCalls; }, get tripCalls() { return tripCalls; } };
  }

  async function seedPage(page: Page, pageData = routes) {
    await page.addInitScript((data) => {
      localStorage.setItem("nasta_routes", JSON.stringify(data));
    }, pageData);
    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await disableAnimations(page);
    await expect(page.getByTestId("segment-row")).toBeVisible({ timeout: 15000 });
  }

  test("prefetches while collapsed and avoids duplicate requests on repeated expansion", async ({ page }) => {
    const requestInfo = await installRoutes(page);
    const stopFinderRequest = page.waitForRequest("**/v2/stop-finder**");
    const tripRequest = page.waitForRequest("**/v2/trips**");

    await seedPage(page);
    await stopFinderRequest;
    await tripRequest;

    const card = page.getByTestId("segment-row");
    await card.locator(".card-main").click();
    await expect(card.locator(".route-stops")).toBeVisible({ timeout: 5000 });
    await expect(card.locator(".route-stops-loading")).not.toBeVisible();
    await expect(card.locator(".stop-list li")).toHaveCount(4);
    const railAlignment = await card.locator(".stop-list").evaluate((list) => {
      const rect = list.getBoundingClientRect();
      const rail = getComputedStyle(list, "::before");
      const railCenter = rect.left + Number.parseFloat(rail.left) + Number.parseFloat(rail.width) / 2;
      return [...list.querySelectorAll<HTMLElement>(".stop-node")].map((node) => {
        const nodeRect = node.getBoundingClientRect();
        return Math.abs(nodeRect.left + nodeRect.width / 2 - railCenter);
      });
    });
    expect(railAlignment.every((difference) => difference < 0.01)).toBe(true);
    await card.locator(".card-main").click();
    await expect(card.locator(".expanded-panel")).not.toBeVisible({ timeout: 5000 });
    await card.locator(".card-main").click();
    await expect(card.locator(".route-stops")).toBeVisible();
    await expect(card.locator(".route-stops-loading")).not.toBeVisible();

    expect(requestInfo.stopFinderCalls).toBe(1);
    expect(requestInfo.tripCalls).toBe(1);
  });

  test("keeps all stops visible through a clock refresh and resets only after an explicit card collapse", async ({ page }) => {
    const requestInfo = await installRoutes(page);
    await page.clock.install();
    await seedPage(page);
    await requestInfo.tripStarted;

    const card = page.getByTestId("segment-row");
    await card.locator(".card-main").click();
    await expect(card.locator(".route-stops-loading")).not.toBeVisible();

    await card.getByRole("button", { name: /show all stops/i }).click();
    await expect(card.locator(".stop-list li")).toHaveCount(7);
    await expect(card.getByRole("button", { name: /show less/i })).toBeVisible();

    await page.clock.fastForward(5_200);
    await expect(card.locator(".expanded-panel")).toBeVisible();
    await expect(card.locator(".stop-list li")).toHaveCount(7);

    await card.locator(".card-main").click();
    await expect(card.locator(".expanded-panel")).not.toBeVisible();
    await card.locator(".card-main").click();
    await expect(card.locator(".stop-list li")).toHaveCount(4);
    expect(requestInfo.stopFinderCalls).toBe(1);
    expect(requestInfo.tripCalls).toBe(1);
  });

  test("resets the stop disclosure after switching pages", async ({ page }) => {
    const requestInfo = await installRoutes(page);
    await seedPage(page, [...routes, { id: "second-page", name: "Second", segments: [] }]);
    await requestInfo.tripStarted;

    const card = page.getByTestId("segment-row");
    await card.locator(".card-main").click();
    await expect(card.locator(".route-stops-loading")).not.toBeVisible();
    await card.getByRole("button", { name: /show all stops/i }).click();
    await expect(card.locator(".stop-list li")).toHaveCount(7);

    await page.getByRole("button", { name: "Manage pages" }).click();
    const editor = page.locator(".editor-sheet");
    await editor.getByRole("button", { name: "Second" }).click();
    await expect(page.getByRole("heading", { name: "Second" })).toBeVisible();
    await editor.getByRole("button", { name: "Route stops test" }).click();
    await expect(card).toBeVisible();
    await editor.getByRole("button", { name: "Close editor" }).click();

    await card.locator(".card-main").click();
    await expect(card.locator(".stop-list li")).toHaveCount(4);
  });

  test("keeps the expanded panel height stable while a prefetched response finishes", async ({ page }) => {
    const requestInfo = await installRoutes(page, { delayTrip: true });
    const stopFinderRequest = page.waitForRequest("**/v2/stop-finder**");

    await seedPage(page);
    await stopFinderRequest;
    await requestInfo.tripStarted;

    const card = page.getByTestId("segment-row");
    await card.locator(".card-main").click();
    await expect(card.locator(".route-stops-loading")).toBeVisible({ timeout: 5000 });
    const panel = card.locator(".expanded-panel");
    await expect.poll(async () => (await panel.boundingBox())?.height ?? 0).toBeGreaterThan(170);
    const before = await panel.boundingBox();
    expect(before).not.toBeNull();

    expect(requestInfo.releaseTrip).toBeDefined();
    requestInfo.releaseTrip!();
    await expect(card.locator(".route-stops-loading")).not.toBeVisible({ timeout: 5000 });
    const after = await panel.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(1);
    expect(requestInfo.stopFinderCalls).toBe(1);
    expect(requestInfo.tripCalls).toBe(1);
  });
});
