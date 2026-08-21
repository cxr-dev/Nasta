import { expect, test, type Page } from "@playwright/test";

// Production-only regression: maplibre-gl v6.1.0 ships its web worker as a
// separate file. When bundled without Vite's ?worker&url pipeline the worker
// resolves to an un-hashed assets/maplibre-gl-worker.mjs that the build never
// emits -> 404 -> silent dead worker -> zero vector-tile requests -> blank map.
// This spec runs against `vite preview` (production build) and fails on the
// broken implementation: the worker chunk is never fetched and no .pbf tile
// request is ever initiated. Dev server serves the worker from node_modules,
// so this failure does NOT reproduce under `pnpm run dev`.

// Minimal valid empty MVT tile: a single empty layer message (protobuf
// 0x1a = field 3 wire 2, length 0). Parses cleanly, zero features, no errors.
const EMPTY_MVT = Buffer.from("1a00", "hex");

async function openApp(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });

  await page.route("**/*.integration.sl.se/**", async (route) => {
    const url = route.request().url();
    if (url.includes("departures")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          // A card is only expandable when it has departures; an empty list
          // would keep the card collapsed and MapPreview never mounts.
          departures: [
            {
              line: { designation: "14" },
              direction_code: 1,
              destination: "Mörby centrum",
              display: "3 min",
              expected: new Date(Date.now() + 180_000).toISOString(),
            },
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        url.includes("journeyplanner") || url.includes("trip")
          ? { trips: [] }
          : [],
      ),
    });
  });

  // Style carries a source-backed vector layer so the worker MUST fetch tiles.
  // A background-only layer would not consume the source and would let a dead
  // worker pass unnoticed.
  await page.route("**/basemaps.cartocdn.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: 8,
        sources: {
          mock: {
            type: "vector",
            tiles: ["/mock-tiles/{z}/{x}/{y}.pbf"],
            attribution: "© CARTO, © OpenStreetMap contributors",
          },
        },
        layers: [
          {
            id: "mock-circle",
            type: "circle",
            source: "mock",
            "source-layer": "mock-layer",
            paint: { "circle-color": "#ff0000" },
          },
        ],
      }),
    }),
  );

  await page.route("**/mock-tiles/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-protobuf",
      body: EMPTY_MVT,
    }),
  );

  await page.addInitScript(() => {
    localStorage.setItem(
      "nasta_settings",
      JSON.stringify({ theme: "light", language: "en" }),
    );
    localStorage.setItem(
      "nasta_routes",
      JSON.stringify([
        {
          id: "map-page",
          name: "Map test",
          segments: [
            {
              id: "map-segment",
              line: "14",
              lineName: "14",
              direction: {
                code: 1,
                destination: "Mörby centrum",
                stopPointId: "",
              },
              fromStop: {
                id: "from",
                name: "Kungsträdgården",
                siteId: "009340",
                coord: [59.330797, 18.07334],
              },
              toStop: { id: "to", name: "Mörby centrum", siteId: "456" },
              transportType: "metro",
            },
          ],
        },
      ]),
    );
  });

  await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".page-slot:not(.page-slot-preview) h1.page-title")).toBeVisible({ timeout: 15_000 });
}

test("MapPreview worker is bundled, fetched 200, and loads vector tiles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  // Negative guard: the broken build requests an un-hashed worker.mjs the
  // bundle never emits. Track it so the failure mode is explicit.
  let unhashedWorkerRequested: string | null = null;

  page.on("request", (request) => {
    if (request.url().includes("/assets/maplibre-gl-worker.mjs")) {
      unhashedWorkerRequested = request.url();
    }
  });

  const workerPromise = page.waitForEvent("worker", {
    predicate: (worker) =>
      /\/maplibre-gl-worker-[A-Za-z0-9_-]+\.js(?:\?.*)?$/.test(worker.url()),
    timeout: 20_000,
  });
  const tileRequest = page.waitForRequest(
    (request) => request.url().includes("/mock-tiles/"),
    { timeout: 20_000 },
  );

  await openApp(page);

  // Expand the departure card to mount MapPreview.
  await page.locator(".card-main").first().click();

  const worker = await workerPromise;
  expect(worker.url()).toMatch(
    /\/maplibre-gl-worker-[A-Za-z0-9_-]+\.js(?:\?.*)?$/,
  );
  expect(unhashedWorkerRequested).toBeNull();

  const workerAssetResponse = await page.context().request.get(worker.url());
  expect(workerAssetResponse.status()).toBe(200);

  // A live worker initiates at least one vector-tile request.
  await tileRequest;

  await expect(page.locator("canvas.maplibregl-canvas")).toBeAttached();
  const stopMarker = page.locator(".nearby-stop-marker");
  await expect(stopMarker).toHaveCSS("position", "absolute");
  await expect(stopMarker).not.toHaveCSS("transform", "none");
  const attribution = page.locator(".maplibregl-ctrl-attrib");
  await expect(attribution).toBeVisible();
  await expect(attribution).not.toHaveClass(/maplibregl-compact-show/);
  const attributionButton = attribution.locator(".maplibregl-ctrl-attrib-button");
  const map = page.locator(".nearby-map");
  const [buttonBox, mapBox] = await Promise.all([attributionButton.boundingBox(), map.boundingBox()]);
  expect(buttonBox?.width).toBeCloseTo(24, 0);
  expect(buttonBox?.height).toBeCloseTo(24, 0);
  expect(mapBox!.x + mapBox!.width - (buttonBox!.x + buttonBox!.width)).toBeCloseTo(6, 0);
  expect(mapBox!.y + mapBox!.height - (buttonBox!.y + buttonBox!.height)).toBeCloseTo(6, 0);
  await expect(attributionButton).toHaveAttribute("aria-label", /attribution/i);
  await expect.poll(() => attribution.evaluate((element) => {
    const before = getComputedStyle(element, "::before");
    const button = element.querySelector(".maplibregl-ctrl-attrib-button");
    return {
      beforeHeight: before.height,
      beforeWidth: before.width,
      buttonBackgroundSize: button ? getComputedStyle(button).backgroundSize : "",
    };
  })).toEqual({ beforeHeight: "20px", beforeWidth: "20px", buttonBackgroundSize: "18px 18px" });
  await attributionButton.click();
  await expect(attribution).toHaveClass(/maplibregl-compact-show/);
  await expect(attribution.locator(".maplibregl-ctrl-attrib-inner")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("keeps the embedded map scrollable and reserves gestures for fullscreen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 420 });
  await openApp(page);
  await page.locator(".card-main").first().click();

  const canvas = page.locator("canvas.maplibregl-canvas");
  const expandButton = page.getByRole("button", { name: "Expand map fullscreen" });
  const scrollContainer = page.locator(".scroll-container");

  await expect(canvas).toHaveCSS("touch-action", "auto");
  const expandBox = await expandButton.boundingBox();
  expect(expandBox?.width).toBeGreaterThanOrEqual(44);
  expect(expandBox?.height).toBeGreaterThanOrEqual(44);

  await scrollContainer.evaluate((element) => { element.scrollTop = 0; });
  await canvas.hover({ position: { x: 20, y: 110 } });
  await page.mouse.wheel(0, 300);
  await expect.poll(() => scrollContainer.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await expandButton.scrollIntoViewIfNeeded();
  await expandButton.click();
  await expect(page.getByRole("dialog", { name: "Stop location" })).toBeVisible();
  await expect(canvas).toHaveCSS("touch-action", "none");
});

test("keeps the departure expand control inside its preview when a standalone safe area is present", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.locator(".card-main").first().click();

  const map = page.locator(".map-container");
  const expand = page.getByRole("button", { name: "Expand map fullscreen" });
  await map.evaluate((element) => element.style.setProperty("--map-control-safe-top", "47px"));

  const embeddedMap = await map.boundingBox();
  const embeddedExpand = await expand.boundingBox();
  expect(embeddedExpand!.y - embeddedMap!.y).toBeCloseTo(8, 0);

  await expand.click();
  const back = page.getByRole("button", { name: "Back" });
  await expect(back).toBeVisible();
  expect((await back.boundingBox())!.y).toBeCloseTo(59, 0);
});

test("uses the same compact attribution control on Nearby", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: "http://localhost:4173" });
  await context.setGeolocation({ latitude: 59.33, longitude: 18.06 });
  await openApp(page);
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Enable location" }).click();

  const map = page.locator(".nearby-surface .nearby-map");
  const attribution = map.locator(".maplibregl-ctrl-attrib");
  const button = attribution.locator(".maplibregl-ctrl-attrib-button");
  await expect(button).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => attribution.evaluate((element) => getComputedStyle(element).margin)).toBe("6px");

  const [buttonBox, mapBox] = await Promise.all([button.boundingBox(), map.boundingBox()]);
  expect(buttonBox?.width).toBeCloseTo(24, 0);
  expect(buttonBox?.height).toBeCloseTo(24, 0);
  expect(mapBox!.x + mapBox!.width - (buttonBox!.x + buttonBox!.width)).toBeCloseTo(6, 0);
  expect(mapBox!.y + mapBox!.height - (buttonBox!.y + buttonBox!.height)).toBeCloseTo(6, 0);
  await expect.poll(() => attribution.evaluate((element) => getComputedStyle(element, "::before").width)).toBe("20px");

  await button.click();
  await expect(attribution.locator(".maplibregl-ctrl-attrib-inner")).toBeVisible();
});

test("keeps route stops and map in one vertical reading flow at desktop width", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 844 });
  await openApp(page);
  await page.locator(".card-main").first().click();

  const expandedActions = page.locator(".departure-card .expanded-actions");
  const routeStops = expandedActions.locator("> .route-stops");
  const mapSection = expandedActions.locator("> .map-preview");
  await expect(expandedActions).toHaveCSS("display", "flex");
  await expect(expandedActions).toHaveCSS("flex-direction", "column");
  await expect(routeStops).toBeVisible();
  await expect(mapSection).toBeVisible();
  await expect(routeStops.locator(".stop-list li").first()).toBeVisible();
});
