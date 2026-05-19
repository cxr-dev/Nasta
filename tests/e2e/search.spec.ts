import { test, expect } from "@playwright/test";

const MOCK_STOP_FINDER_RESPONSE = {
  locations: [
    {
      id: "90910010009001",
      name: "Lindarängsvägen",
      disassembledName: "Lindarängsvägen",
      type: "stop",
      matchQuality: 1000,
      coord: [59.3165, 18.1115],
      productClasses: [2, 4],
    },
    {
      id: "90910010009002",
      name: "Österhammarsgatan",
      disassembledName: "Österhammarsgatan",
      type: "stop",
      matchQuality: 800,
      coord: [59.3338, 18.0867],
      productClasses: [2, 4],
    },
  ],
};

const MOCK_DEPARTURES_RESPONSE = {
  departures: [
    {
      line: { designation: "76", name: "76", transport_mode: "bus" },
      direction_code: 1,
      destination: "Norra Hammarbyhamnen",
      display: "5 min",
      expected: new Date(Date.now() + 5 * 60000).toISOString(),
    },
  ],
};

test.describe("Segment search", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("nasta_onboarding_seen", "true");
      localStorage.setItem(
        "nasta_settings",
        JSON.stringify({ language: "sv" }),
      );
    });

    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await page.addStyleTag({
      content: `*, *::before, *::after { transition: none !important; animation: none !important; }`,
    });
  });

  test("should search for Lindarängsvägen and allow adding a segment", async ({
    page,
  }) => {
    await page.route(
      "https://journeyplanner.integration.sl.se/**",
      async (route) => {
        const url = route.request().url();
        if (url.includes("/stop-finder")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(MOCK_STOP_FINDER_RESPONSE),
          });
        } else {
          await route.continue();
        }
      },
    );

    await page.route(
      "https://transport.integration.sl.se/**",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_DEPARTURES_RESPONSE),
        });
      },
    );

    const createRouteButton = page.locator(".empty-cta");
    await expect(createRouteButton).toBeVisible({ timeout: 10000 });
    await createRouteButton.click();

    const searchInput = page.locator(".search-input");
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill("Lindarängsvägen");
    await page.waitForTimeout(500);

    const firstResult = page.locator(".results .item").first();
    await expect(firstResult).toBeVisible({ timeout: 10000 });
    await expect(firstResult).toContainText(
      /Lindarängsvägen|Österhammarsgatan/,
    );
    await firstResult.click();

    const departureItem = page.locator(".dep-item").first();
    await expect(departureItem).toBeVisible({ timeout: 10000 });
    await departureItem.click();

    const directionOption = page.locator(".direction-option").first();
    await expect(directionOption).toBeVisible({ timeout: 10000 });
  });

  test("should attempt the real SL stop-finder API when available", async ({
    page,
  }) => {
    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("domcontentloaded");

    const rawResult = await page.evaluate(async () => {
      const query = "Lindarängsvägen";
      const url = `https://journeyplanner.integration.sl.se/v2/stop-finder?name_sf=${encodeURIComponent(
        query,
      )}&any_obj_filter_sf=2&type_sf=any`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(url, {
          mode: "cors",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
          return {
            ok: false,
            status: response.status,
            statusText: response.statusText,
          };
        }
        const data = await response.json();
        return { ok: true, data };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    });

    if (!rawResult.ok) {
      test.skip(
        `Real SL API not available in this environment: ${rawResult.error ?? rawResult.status}`,
      );
    }

    expect(Array.isArray(rawResult.data.locations)).toBe(true);
    expect(
      rawResult.data.locations.some((loc: any) =>
        /Lindarängsvägen|Österhammarsgatan/i.test(loc.name),
      ),
    ).toBe(true);
  });
});
