import { test, expect } from "@playwright/test";

test.describe("feature discovery sheet", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (message) => {
      console.log([Browser ] );
    });
    page.on("pageerror", (error) => {
      console.log([PageError] );
    });

    await page.addInitScript(() => {
      const fixedNow = new Date("2026-05-28T18:30:00+02:00").valueOf();
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

      localStorage.setItem("nasta_onboarding_seen", "true");
      localStorage.setItem(
        "nasta_settings",
        JSON.stringify({
          darkMode: true,
          refreshInterval: 30000,
          funMode: false,
          hasSwipedRoutes: false,
          showNotifications: false,
          theme: "default",
          themeVariant: "A",
          language: "en",
          disruptionAlertsEnabled: true,
          disruptionSeverityThreshold: "warning",
          disruptionLanguage: "auto",
          enabledTransportTypes: ["bus", "train", "metro", "boat"],
          walkingEtaEnabled: true,
          afterworkVenuesEnabled: true,
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
            direction: "toWork",
            segments: [
              {
                id: "s1",
                line: "2",
                lineName: "2",
                direction: { code: 1, destination: "Sofia", stopPointId: "" },
                fromStop: {
                  id: "f1",
                  name: "Karl XII:s torg",
                  siteId: "123",
                  coord: [59.3293, 18.0686],
                },
                toStop: {
                  id: "t1",
                  name: "Sofia",
                  siteId: "456",
                  coord: [59.31, 18.07],
                },
                transportType: "bus",
              },
            ],
          },
        ]),
      );
    });

    await page.route("**/*.integration.sl.se/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ departures: [] }),
      });
    });

    await page.route("**/functions/v1/get-venues**", async (route) => {
      await route.fulfill({
        status: 200,
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
    });

    await page.route("**/overpass-api.de/**", async (route) => {
      await route.fulfill({
        status: 200,
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
          ],
        }),
      });
    });

    await page.route("**/eventapi.stockholm.se/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          events: [
            {
              id: "event-1",
              name: "Jazz Night",
              startTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
              location: "Central Stockholm",
              lat: 59.33,
              lon: 18.07,
            },
          ],
        }),
      });
    });

    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await page.addStyleTag({
      content: *, *::before, *::after { transition: none !important; animation: none !important; },
    });
  });

  test("opens, filters, and closes the feature sheet", async ({ page }) => {
    const segmentRow = page.getByTestId("segment-row").first();
    await expect(segmentRow).toBeVisible({ timeout: 10000 });

    await segmentRow.dispatchEvent("click");
    await page.waitForTimeout(250);

    const sheet = page.locator(".sheet-shell");
    await expect(sheet).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Beer" })).toBeVisible();
    await expect(page.getByText("Tap Room")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Wine + cocktails" }).click();
    await expect(page.getByText("Wine & Dine")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Events" }).click();
    await expect(page.getByText("Jazz Night")).toBeVisible({ timeout: 10000 });

    await page.locator(".close-btn").click();
    await expect(sheet).toBeHidden({ timeout: 10000 });
  });
});
