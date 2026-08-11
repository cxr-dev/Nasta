import { test, expect } from "@playwright/test";

const MOCK_STOP_FINDER_RESPONSE = {
  locations: [
    {
      id: "90910010009001",
      name: "Stockholm, Lindarängsvägen",
      disassembledName: "Lindarängsvägen",
      type: "stop",
      matchQuality: 1000,
      coord: [59.3165, 18.1115],
      productClasses: [2, 4],
      parent: {
        id: "placeID:33001080:1",
        name: "Stockholm",
        type: "locality",
      },
    },
    {
      id: "90910010009002",
      name: "Stockholm, Österhammarsgatan",
      disassembledName: "Österhammarsgatan",
      type: "stop",
      matchQuality: 800,
      coord: [59.3338, 18.0867],
      productClasses: [2, 4],
      parent: {
        id: "placeID:33001080:1",
        name: "Stockholm",
        type: "locality",
      },
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
      localStorage.setItem(
        "nasta_settings",
        JSON.stringify({ language: "sv" }),
      );
      // Seed a default page so the quick-add drawer has a target page to add segments to.
      // Without this, handleQuickAdd returns early because getActivePage() is null.
      const defaultRoutes = [
        {
          id: crypto.randomUUID(),
          name: "Min rutt",
          segments: [],
        },
      ];
      localStorage.setItem("nasta_routes", JSON.stringify(defaultRoutes));
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

    const createRouteButton = page.getByRole("button", { name: /add|lägg till/i });
    await expect(createRouteButton).toBeVisible({ timeout: 10000 });
    await createRouteButton.click();

    const searchInput = page.getByLabel(/search stops|sök hållplats/i);
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill("Lindarängsvägen");

    const firstResult = page.getByRole("button", { name: /Lindarängsvägen|Österhammarsgatan/ }).first();
    await expect(firstResult).toBeVisible({ timeout: 10000 });
    await expect(firstResult).toContainText(
      /Lindarängsvägen|Österhammarsgatan/,
    );
    await firstResult.click();

    // Single line + single direction in mock → auto-completes, drawer closes, segment added.
    // The route page title shows the page name ("Min rutt"), not the stop.
    // Verify the departure card appears with the stop name.
    await expect(page.locator("text=Lindarängsvägen")).toBeVisible({ timeout: 10000 });
  });

  test("uses the Lucide swap control, refined filters, and earliest-arrival priority", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const now = Date.now();
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
          return;
        }

        if (url.includes("/trips")) {
          const trip = (departureMinutes: number, arrivalMinutes: number, durationMinutes: number) => ({
            legs: [{
              origin: {
                name: "Odenplan",
                disassembledName: "Odenplan",
                departureTimePlanned: new Date(now + departureMinutes * 60000).toISOString(),
              },
              destination: {
                name: "Slussen",
                disassembledName: "Slussen",
                arrivalTimePlanned: new Date(now + arrivalMinutes * 60000).toISOString(),
              },
              transportation: {
                name: "Buss 40",
                disassembledName: "40",
                product: { name: "BUS" },
              },
              duration: durationMinutes * 60,
              direction: 1,
              directionName: "Slussen",
            }],
          });

          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              journeys: [
                trip(5, 35, 30),
                trip(8, 20, 12),
              ],
            }),
          });
          return;
        }

        await route.continue();
      },
    );
    await page.route("https://nominatim.openstreetmap.org/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await page.locator(".empty-cta").click();
    const addDialog = page.getByRole("dialog", { name: /Lägg till/ });
    const addHeading = addDialog.getByRole("heading", { name: "+ Lägg till" });
    const stopTab = page.getByRole("tab", { name: "Hållplats" });
    const routeTab = page.getByRole("tab", { name: "Resa" });
    await expect(addDialog).toBeVisible();
    await expect(addHeading).toBeVisible();
    const closeButton = addDialog.getByRole("button", { name: "Stäng formuläret" });
    await expect(closeButton).toBeVisible();
    const closeBox = await closeButton.boundingBox();
    expect(closeBox && closeBox.width >= 44 && closeBox.height >= 44).toBeTruthy();
    await expect(stopTab).toContainText("Avgångar från en hållplats");
    await expect(routeTab).toContainText("En resa från A till B");
    await expect(stopTab).toHaveAttribute("aria-selected", "true");
    await expect(routeTab).toHaveAttribute("aria-selected", "false");
    expect(await stopTab.locator("svg").innerHTML()).toContain("M20 10c0 4.993-5.539 10.193-7.399 11.799");
    expect(await stopTab.locator("svg").innerHTML()).toContain('cx="12" cy="10" r="3"');
    expect(await routeTab.locator("svg").innerHTML()).toContain('cx="6" cy="19" r="3"');
    expect(await routeTab.locator("svg").innerHTML()).toContain("M9 19h8.5a3.5 3.5 0 0 0 0-7");
    expect(await routeTab.locator("svg").innerHTML()).toContain('cx="18" cy="5" r="3"');
    await expect(routeTab.locator("svg")).toHaveCount(1);
    await routeTab.click();
    await expect(page.locator("#quick-add-route-panel")).toBeVisible();
    await stopTab.click();
    await expect(page.locator("#quick-add-stop-panel")).toBeVisible();
    await routeTab.click();
    await expect(page.locator("#quick-add-route-panel")).toBeVisible();

    const routePanel = addDialog.locator("#quick-add-route-panel");
    const swapButton = routePanel.getByRole("button", { name: "Byt riktning" });
    const fromInput = routePanel.locator("#quick-add-journey-origin");
    const toInput = routePanel.locator("#quick-add-journey-dest");
    expect(await fromInput.evaluate((element) => getComputedStyle(element).fontSize)).toBe("16px");
    expect(await toInput.evaluate((element) => getComputedStyle(element).fontSize)).toBe("16px");
    await expect(routePanel.locator(".location-fields")).toBeVisible();
    await expect(routePanel.locator(".swap-connector")).toBeVisible();
    await expect(routePanel.locator(".connector-line")).toHaveCount(0);
    const fromBox = await fromInput.boundingBox();
    const toBox = await toInput.boundingBox();
    const swapBox = await swapButton.boundingBox();
    expect(fromBox && toBox && swapBox).toBeTruthy();
    expect(swapBox!.x).toBeGreaterThan(fromBox!.x + fromBox!.width);
    expect(Math.abs((swapBox!.y + swapBox!.height / 2) - ((fromBox!.y + toBox!.y + toBox!.height) / 2))).toBeLessThan(12);
    await expect(swapButton.locator("svg")).toHaveAttribute("width", "24");
    await expect(swapButton.locator('path[d="m3 16 4 4 4-4"]')).toHaveCount(1);

    const advancedToggle = routePanel.getByRole("button", { name: /Avancerat/ });
    await advancedToggle.click();
    const advancedPanel = routePanel.locator("#quick-add-journey-advanced-options");
    await expect(advancedPanel).toBeVisible();
    await expect(advancedPanel.locator('input[type="checkbox"]')).toHaveCount(5);
    await expect(advancedPanel.locator('input[type="radio"]')).toHaveCount(7);

    await fromInput.fill("Odenplan");
    await toInput.fill("Slussen");
    await routePanel.getByRole("button", { name: "Hitta resa" }).click();

    const resultCards = routePanel.locator(".result-card");
    await expect(resultCards).toHaveCount(2);
    await expect(resultCards.first().locator(".result-duration")).toHaveText("12m");

    await page.setViewportSize({ width: 900, height: 800 });
    await expect(advancedPanel).toBeVisible();
    const hasHorizontalOverflow = await routePanel.locator(".journey-search").evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);

    await addDialog.focus();
    await page.keyboard.press("Escape");
    await expect(addDialog).toBeHidden();
    await page.locator(".empty-cta").click();
    await expect(addDialog).toBeVisible();
    await closeButton.click();
    await expect(addDialog).toBeHidden();
    await page.locator(".empty-cta").click();
    await expect(addDialog).toBeVisible();
    await page.locator(".quick-add-backdrop").click();
    await expect(addDialog).toBeHidden();
  });

});
