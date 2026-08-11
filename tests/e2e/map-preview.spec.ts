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
  await expect(page.locator("h1.page-title")).toBeVisible({ timeout: 15_000 });
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
  const attribution = page.locator(".maplibregl-ctrl-attrib");
  await expect(attribution).toBeVisible();
  await expect(attribution).not.toHaveClass(/maplibregl-compact-show/);
  await page.screenshot({
    path: "test-results/map-preview-mobile.png",
    fullPage: true,
  });
  await attribution.locator(".maplibregl-ctrl-attrib-button").click();
  await expect(attribution).toHaveClass(/maplibregl-compact-show/);
  expect(pageErrors).toEqual([]);
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
  await page.screenshot({
    path: "test-results/map-preview-wide-single-column.png",
    fullPage: true,
  });
});
