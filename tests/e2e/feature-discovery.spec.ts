import { test, expect, type Locator, type Page } from "@playwright/test";

let venueRequestCount = 0;
let eventRequestCount = 0;

async function openFeatureDiscovery(page: Page): Promise<Locator> {
  const segmentRow = page.getByTestId("segment-row").first();
  await expect(segmentRow).toBeVisible({ timeout: 15000 });
  await expect(segmentRow.getByTestId("countdown-minutes")).toBeVisible({ timeout: 15000 });
  await segmentRow.getByRole("button").click();

  const nearbyButton = page.getByRole("button", { name: /Discover nearby/i });
  await expect(nearbyButton).toBeVisible({ timeout: 10000 });
  await nearbyButton.click();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible({ timeout: 10000 });
  return sheet;
}

test.describe("feature discovery sheet", () => {
  test.beforeEach(async ({ page }) => {
    venueRequestCount = 0;
    eventRequestCount = 0;
    const fixedNowIso = "2026-05-28T18:30:00+02:00";
    const fixedNow = new Date(fixedNowIso).valueOf();

    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.addInitScript((nowIso) => {
      const fixedNow = new Date(nowIso).valueOf();
      const RealDate = Date;
      // @ts-ignore
      globalThis.Date = class extends RealDate {
        constructor(...args: any[]) {
          // @ts-ignore
          super(...(args.length ? args : [fixedNow]));
        }

        static now() {
          return fixedNow;
        }
      } as typeof Date;

      localStorage.setItem(
        "nasta_settings",
        JSON.stringify({
          refreshInterval: 30000,
          funMode: false,
          hasSwipedRoutes: false,
          showNotifications: false,
          theme: "system",
          language: "en",
          disruptionAlertsEnabled: true,
          disruptionSeverityThreshold: "warning",
          disruptionLanguage: "auto",
          enabledTransportTypes: ["bus", "train", "metro", "boat"],
          walkingEtaEnabled: true,
          afterworkVenuesEnabled: true,
          afterworkStartHour: 17,
          afterworkTypes: ["beer", "wine", "cocktail"],
          eventsEnabled: true,
        }),
      );

      localStorage.setItem(
        "nasta_routes",
        JSON.stringify([
          {
            id: "r1",
            name: "Route",
            segments: [
              {
                id: "s1",
                line: "76",
                lineName: "76",
                direction: {
                  code: 1,
                  destination: "Norra Hammarbyhamnen",
                  stopPointId: "",
                },
                fromStop: {
                  id: "f1",
                  name: "Lindarängsvägen",
                  siteId: "100",
                  coord: [59.3293, 18.0686],
                },
                toStop: {
                  id: "t1",
                  name: "Norra Hammarbyhamnen",
                  siteId: "456",
                  coord: [59.31, 18.07],
                },
                transportType: "bus",
              },
            ],
          },
        ]),
      );
    }, fixedNowIso);

    await page.route("**/*.integration.sl.se/**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
        contentType: "application/json",
        body: JSON.stringify({
          departures: [
            {
              line: { designation: "76", name: "76", transport_mode: "bus" },
              direction_code: 1,
              destination: "Norra Hammarbyhamnen",
              display: "5 min",
              expected: new Date(fixedNow + 5 * 60000).toISOString(),
            },
          ],
        }),
      });
    });

    await page.route("**/api.open-meteo.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          current: { weather_code: 0, temperature_2m: 15 },
          daily: { weather_code: [0], temperature_2m_max: [16], temperature_2m_min: [10] },
        }),
      });
    });

    await page.route("**/basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ version: 8, sources: {}, layers: [] }),
      });
    });

    // Intercept the real Supabase function host used by `fetchNearbyVenues`
    await page.route(
      "**/izrgqxgsuhogrukisfrd.supabase.co/functions/v1/get-venues**",
      async (route) => {
        venueRequestCount += 1;
        await route.fulfill({
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
          },
          contentType: "application/json",
          body: JSON.stringify({
            venues: [
              {
                id: "beer-1",
                name: "Tap Room",
                lat: 59.3294,
                lon: 18.069,
                openingHours: "16:00-01:00",
                priceLevel: 2,
              },
            ],
          }),
        });
      },
    );

    await page.route("**/overpass-api.de/**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
        contentType: "application/json",
        body: JSON.stringify({
          elements: [
            {
              id: 9001,
              lat: 59.3297,
              lon: 18.0701,
              tags: {
                name: "Wine & Dine",
                opening_hours: "17:00-00:00",
              },
            },
            {
              id: 9002,
              lat: 59.3294,
              lon: 18.069,
              tags: {
                name: "Tap Room",
                opening_hours: "16:00-01:00",
              },
            },
          ],
        }),
      });
    });

    await page.route("**/events-data.json**", async (route) => {
      eventRequestCount += 1;
      await route.fulfill({
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "event-1",
            name: "Jazz Night",
            startTime: new Date(fixedNow + 2 * 60 * 60 * 1000).toISOString(),
            location: {
              name: "Central Stockholm",
              lat: 59.33,
              lon: 18.07,
            },
            categories: [{ slug: "music", title: "Music" }],
          },
        ]),
      });
    });

    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await page.addStyleTag({
      content: `*, *::before, *::after { transition: none !important; animation: none !important; }`,
    });
  });

  test("opens the feature discovery sheet when nearby button is clicked", async ({
    page,
  }) => {
    const sheet = await openFeatureDiscovery(page);

    await expect(sheet.getByRole("tab", { name: /Afterwork|Efter jobbet/i })).toBeVisible();

    await expect(sheet.getByRole("heading", { name: "Tap Room" })).toBeVisible({
      timeout: 10000,
    });
  });

  test("switches discovery tabs and displays their content", async ({
    page,
  }) => {
    const sheet = await openFeatureDiscovery(page);
    const afterworkTab = sheet.getByRole("tab", { name: /Afterwork|Efter jobbet/i });
    await expect(afterworkTab).toHaveAttribute("aria-selected", "true");
    await expect(sheet.getByRole("heading", { name: "Tap Room" })).toBeVisible({ timeout: 10000 });

    const eventsTab = sheet.getByRole("tab", { name: /Events/i });
    await eventsTab.click();
    await expect(eventsTab).toHaveAttribute("aria-selected", "true");
    await expect(sheet.getByRole("heading", { name: "Jazz Night" })).toBeVisible({ timeout: 10000 });
  });

  test("prefetches discovery data while collapsed and reuses it on repeated opens", async ({ page }) => {
    await expect(page.getByTestId("segment-row").first()).toBeVisible({ timeout: 15000 });
    await expect.poll(() => venueRequestCount).toBeGreaterThan(0);
    await expect.poll(() => eventRequestCount).toBeGreaterThan(0);

    const venueRequestsBeforeOpen = venueRequestCount;
    const eventRequestsBeforeOpen = eventRequestCount;
    const sheet = await openFeatureDiscovery(page);
    await expect(sheet.getByRole("heading", { name: "Tap Room" })).toBeVisible({ timeout: 10000 });
    await expect(sheet.locator(".skeleton-list")).toHaveCount(0);
    expect(venueRequestCount).toBe(venueRequestsBeforeOpen);
    expect(eventRequestCount).toBe(eventRequestsBeforeOpen);
  });

  test("renders a fixed local editorial event visual without an external image request", async ({ page }) => {
    const externalImageRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).hostname === 'images.unsplash.com') externalImageRequests.push(request.url());
    });
    const sheet = await openFeatureDiscovery(page);
    await sheet.getByRole("tab", { name: /Events/i }).click();
    const card = sheet.locator("article").filter({ hasText: "Jazz Night" });
    await expect(card).toBeVisible({ timeout: 10000 });

    const visual = card.locator(".event-visual");
    await expect(visual).toBeVisible();
    await expect(visual.locator("img")).toHaveCount(1);
    await expect(visual.locator("img")).toHaveAttribute('alt', '');
    await expect(visual.locator("img")).toHaveAttribute('src', /\/venue-mood\/event-concert-.*\.webp$/);
    await expect(visual.getByText('Editorial image')).toBeVisible();
    expect(externalImageRequests).toEqual([]);
    const bounds = await visual.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBe(80);
    expect(bounds!.height).toBe(80);
  });

  test("restores the fixed category fallback if a local editorial image fails", async ({ page }) => {
    await page.route('**/venue-mood/event-*', (route) => route.abort());
    const sheet = await openFeatureDiscovery(page);
    await sheet.getByRole("tab", { name: /Events/i }).click();
    const card = sheet.locator("article").filter({ hasText: "Jazz Night" });
    await expect(card).toBeVisible({ timeout: 10000 });
    const visual = card.locator('.event-visual');
    await expect(visual.locator('.event-category-tile')).toBeVisible();
    const bounds = await visual.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBe(80);
    expect(bounds!.height).toBe(80);
  });
});
