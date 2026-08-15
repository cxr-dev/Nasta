import { expect, test } from "@playwright/test";
import { CommuterApp, type TestPage } from "./support/commuterApp";

const emptyPage: TestPage = {
  id: "mobile-critical-page",
  name: "Mobile test",
  segments: [],
};

async function prepareAddStopFlow(page: import("@playwright/test").Page): Promise<CommuterApp> {
  const app = new CommuterApp(page);
  await app.mockDepartures();
  await page.route("https://journeyplanner.integration.sl.se/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/stop-finder")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          locations: [{
            id: "90910010009001",
            name: "Stockholm, Lindarängsvägen",
            disassembledName: "Lindarängsvägen",
            type: "stop",
            matchQuality: 1000,
            coord: [59.3165, 18.1115],
            productClasses: [2, 4],
          }],
        }),
      });
      return;
    }
    await route.continue();
  });
  await page.route("https://nominatim.openstreetmap.org/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await app.open(emptyPage);
  await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" });
  return app;
}

test.describe("mobile critical commuter flow", () => {
  test("tracks page swipes and cancels or commits from the current position", async ({ page }) => {
    const app = new CommuterApp(page);
    await app.mockDepartures();
    const now = Date.now();
    const routes = [
      {
        id: "swipe-first-page",
        name: "First page",
        segments: [{
          id: "swipe-first-segment",
          line: "14",
          lineName: "14",
          direction: { code: 1, destination: "Mörby centrum", stopPointId: "" },
          fromStop: { id: "from-first", name: "T-Centralen", siteId: "100" },
          toStop: { id: "to-first", name: "Mörby centrum", siteId: "456" },
          transportType: "metro",
        }, {
          id: "swipe-first-journey",
          line: "11",
          lineName: "11",
          direction: { code: 1, destination: "Akalla", stopPointId: "" },
          fromStop: { id: "journey-from", name: "T-Centralen", siteId: "100" },
          toStop: { id: "journey-to", name: "Kista centrum", siteId: "400" },
          transportType: "metro",
          journeyMeta: {
            journeyId: "swipe-first-journey",
            originLabel: "T-Centralen",
            destLabel: "Kista centrum",
            totalDurationMin: 25,
            transfers: 0,
            updatedAt: now,
            legs: [{
              originName: "T-Centralen",
              originSiteId: "100",
              destName: "Kista centrum",
              destSiteId: "400",
              transportType: "metro",
              line: "11",
              lineName: "11",
              directionCode: 1,
              directionName: "Akalla",
              departureTime: now + 10 * 60_000,
              arrivalTime: now + 35 * 60_000,
              durationMin: 25,
              platformPosition: "middle",
            }],
          },
        }],
      },
      {
        id: "swipe-second-page",
        name: "Second page",
        segments: [{
          id: "swipe-second-segment",
          line: "14",
          lineName: "14",
          direction: { code: 1, destination: "Mörby centrum", stopPointId: "" },
          fromStop: { id: "from-second", name: "Slussen", siteId: "101" },
          toStop: { id: "to-second", name: "Mörby centrum", siteId: "456" },
          transportType: "metro",
        }],
      },
    ];
    await page.addInitScript((seededRoutes) => {
      localStorage.clear();
      localStorage.setItem("nasta_settings", JSON.stringify({ language: "en", theme: "light" }));
      localStorage.setItem("nasta_routes", JSON.stringify(seededRoutes));
    }, routes);
    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.clock.install();
    const emitTouch = async (type: string, x: number, y: number, target = "#main-content") => {
      await page.locator(target).evaluate((element, input) => {
        const event = new Event(input.type, { bubbles: true, cancelable: true });
        const touch = { identifier: 1, clientX: input.x, clientY: input.y, target: element };
        Object.defineProperty(event, "touches", { value: input.type === "touchend" || input.type === "touchcancel" ? [] : [touch] });
        Object.defineProperty(event, "changedTouches", { value: [touch] });
        element.dispatchEvent(event);
      }, { type, x, y });
    };

    const activeCard = ".page-slot:not(.page-slot-preview) .departure-card .card-main";
    await expect(page.getByRole("heading", { name: "First page" })).toBeVisible();
    await expect(page.locator(activeCard)).toHaveCSS("touch-action", "pan-y pinch-zoom");
    await emitTouch("touchstart", 300, 300, activeCard);
    await emitTouch("touchmove", 180, 304, activeCard);
    await emitTouch("touchend", 60, 304, activeCard);
    await page.clock.fastForward(1_000);
    await expect(page.getByRole("heading", { name: "Second page" })).toBeVisible();

    await emitTouch("touchstart", 100, 300, activeCard);
    await emitTouch("touchmove", 200, 304, activeCard);
    await expect(page.locator(".page-slot")).toHaveCount(2);
    expect(await page.locator(".page-slot").first().evaluate((node) => getComputedStyle(node).transform)).not.toBe("none");

    await page.clock.fastForward(200);
    await emitTouch("touchcancel", 150, 304, activeCard);
    await page.clock.fastForward(1_000);
    await expect(page.getByRole("heading", { name: "Second page" })).toBeVisible();

    await emitTouch("touchstart", 100, 300, activeCard);
    await emitTouch("touchmove", 280, 304, activeCard);
    const reverseOffsets = await page.locator(".page-slot").evaluateAll((nodes) =>
      nodes.map((node) => new DOMMatrix(getComputedStyle(node).transform).m41),
    );
    expect(reverseOffsets[0]).toBeLessThan(0);
    expect(reverseOffsets[1]).toBeGreaterThan(0);
    await page.clock.fastForward(100);
    await emitTouch("touchend", 280, 304, activeCard);
    await page.clock.fastForward(1_000);
    await expect(page.getByRole("heading", { name: "First page" })).toBeVisible();

    const journeyCard = ".page-slot:not(.page-slot-preview) .journey-card .card-main";
    await expect(page.locator(journeyCard)).toHaveCSS("touch-action", "pan-y pinch-zoom");
    await emitTouch("touchstart", 200, 300, journeyCard);
    await emitTouch("touchmove", 204, 410, journeyCard);
    await emitTouch("touchend", 204, 430, journeyCard);
    await page.clock.fastForward(1_000);
    await expect(page.getByRole("heading", { name: "First page" })).toBeVisible();

    await page.locator(activeCard).click();
    await expect(page.locator(activeCard)).toHaveAttribute("aria-expanded", "true");
    await page.locator(activeCard).click();

    await emitTouch("touchstart", 300, 300, journeyCard);
    await emitTouch("touchmove", 170, 304, journeyCard);
    await emitTouch("touchend", 60, 304, journeyCard);
    await page.clock.fastForward(1_000);
    await expect(page.getByRole("heading", { name: "Second page" })).toBeVisible();

    await page.keyboard.press("ArrowLeft");
    await page.clock.fastForward(1_000);
    await expect(page.getByRole("heading", { name: "First page" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await page.clock.fastForward(1_000);
    await expect(page.locator(".page-slot:not(.page-slot-preview) h1.page-title")).toContainText("Second page");
    await emitTouch("touchstart", 300, 300);
    await emitTouch("touchmove", 130, 304);
    await expect(page.locator(".nearby-viewport")).toHaveCount(1);
    await emitTouch("touchend", 70, 304);
    await page.clock.fastForward(1_000);
    await expect(page.locator(".nearby-surface")).toBeVisible();
  });

  test("swipes from the only saved page to Nearby when touch starts on its card", async ({ page }) => {
    const app = new CommuterApp(page);
    await app.mockDepartures();
    await page.route("**/v1/sites", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: 100, name: "T-Centralen", lat: 59.33, lon: 18.06 }]),
    }));
    await app.open();

    const activeCard = page.locator(".page-slot:not(.page-slot-preview) .card-main");
    await activeCard.evaluate((element) => {
      const emit = (type: string, x: number) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        const touch = { identifier: 1, clientX: x, clientY: 300, target: element };
        Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [touch] });
        Object.defineProperty(event, "changedTouches", { value: [touch] });
        element.dispatchEvent(event);
      };
      emit("touchstart", 300);
      emit("touchmove", 160);
      emit("touchend", 60);
    });

    await expect(page.getByRole("heading", { name: "Nearby", level: 1 })).toBeVisible();
  });

  test("adds a stop, shows a departure, and opens and closes its actions on modern WebKit", async ({ page }) => {
    const app = await prepareAddStopFlow(page);
    const addButton = page.getByRole("button", { name: /^Add/ });
    await addButton.click();

    const dialog = page.getByRole("dialog", { name: "+ Add", exact: true });
    await expect(dialog).toBeVisible();
    const searchInput = dialog.getByLabel("Search stops");
    await searchInput.fill("Lindarängsvägen");
    await dialog.getByRole("button", { name: /Lindarängsvägen/ }).click();

    await expect(dialog).toBeHidden();
    const savedCard = app.page.getByTestId("segment-row").filter({ hasText: "Lindarängsvägen" });
    await expect(savedCard).toBeVisible();
    await expect(savedCard.getByTestId("segment-line")).toHaveText("14");
    await expect(savedCard).toContainText("Mörby centrum");
    await expect(savedCard.getByTestId("countdown-minutes")).toContainText(/min|now|soon/i);

    const cardMain = savedCard.getByRole("button", { name: /14 Lindarängsvägen.*Mörby/i });
    await cardMain.click();
    await expect(cardMain).toHaveAttribute("aria-expanded", "true");
    await expect(savedCard.getByRole("group", { name: "Card actions" })).toBeVisible();
    await cardMain.click();
    await expect(cardMain).toHaveAttribute("aria-expanded", "false");
  });

  test("keeps the add controls usable at the narrow iOS width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const app = await prepareAddStopFlow(page);
    const addButton = page.getByRole("button", { name: /^Add/ });
    await addButton.click();

    const dialog = page.getByRole("dialog", { name: "+ Add", exact: true });
    const searchInput = dialog.getByLabel("Search stops");
    await expect(searchInput).toHaveCSS("font-size", "16px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(dialog.getByRole("button", { name: "Close add form" })).toBeVisible();
  });

  test("opens the fixed utility map after the last page and swipes back from a station card", async ({ page, context }) => {
    const app = new CommuterApp(page);
    await app.mockDepartures();
    await page.route("**/v1/sites", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: 100, name: "T-Centralen", lat: 59.33, lon: 18.06 }]),
    }));
    await app.open();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await context.grantPermissions(["geolocation"], { origin: "http://localhost:4173" });
    await context.setGeolocation({ latitude: 59.33, longitude: 18.06 });
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("switch", { name: /Location services|Platsjänster/i }).click();
    await page.getByRole("button", { name: /Close settings|Stäng inställningar/i }).click();

    await page.keyboard.press("ArrowRight");
    const surface = page.locator(".nearby-surface");
    await expect(surface).toBeVisible();
    const station = surface.locator(".station-card").filter({ hasText: "T-Centralen" });
    await expect(station).toBeVisible({ timeout: 15_000 });
    await expect(station).toHaveCSS("touch-action", "pan-y pinch-zoom");

    await station.evaluate((element) => {
      const emit = (type: string, x: number, y: number) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        const touch = { identifier: 2, clientX: x, clientY: y, target: element };
        Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [touch] });
        Object.defineProperty(event, "changedTouches", { value: [touch] });
        element.dispatchEvent(event);
      };
      emit("touchstart", 40, 300);
      emit("touchmove", 240, 304);
      emit("touchend", 330, 304);
    });

    await expect(page.locator("h1.page-title")).toContainText(/Commuter test/i);
    await expect(page.locator(".nearby-surface")).toHaveCount(0);
    await expect(page.locator(".nearby-viewport")).toHaveCount(0);
  });

  test("returns from a Nearby station board by its Back button and a right swipe", async ({ page, context }) => {
    const app = new CommuterApp(page);
    await app.mockDepartures();
    await page.route("**/*.integration.sl.se/**", async (route) => {
      if (!route.request().url().includes("departures")) return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ departures: Array.from({ length: 8 }, (_, index) => ({
          line: { designation: "14" },
          direction_code: 1,
          destination: index % 2 ? "Fruängen" : "Mörby centrum",
          display: `${index + 3} min`,
          expected: new Date(Date.now() + (index + 3) * 60_000).toISOString(),
        })) }),
      });
    });
    await page.route("**/v1/sites", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: 100, name: "T-Centralen", lat: 59.33, lon: 18.06 }]),
    }));
    await app.open();
    await context.grantPermissions(["geolocation"], { origin: "http://localhost:4173" });
    await context.setGeolocation({ latitude: 59.33, longitude: 18.06 });
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("switch", { name: /Location services|Platsjänster/i }).click();
    await page.getByRole("button", { name: /Close settings|Stäng inställningar/i }).click();
    await page.keyboard.press("ArrowRight");

    const surface = page.locator(".nearby-surface");
    const station = surface.locator(".station-card").filter({ hasText: "T-Centralen" });
    await expect(station).toBeVisible({ timeout: 15_000 });
    await station.click();
    await expect(surface.getByRole("heading", { name: "T-Centralen" })).toBeVisible();
    const mapShell = surface.locator(".detail-map-shell");
    const mapCanvas = mapShell.locator("canvas.maplibregl-canvas");
    await expect(mapCanvas).toBeVisible({ timeout: 15_000 });
    const [shellBox, canvasBox] = await Promise.all([mapShell.boundingBox(), mapCanvas.boundingBox()]);
    expect(shellBox).not.toBeNull();
    expect(canvasBox).not.toBeNull();
    expect(shellBox!.height).toBeGreaterThanOrEqual(208);
    expect(shellBox!.height).toBeLessThanOrEqual(212);
    expect(Math.abs(shellBox!.height - canvasBox!.height)).toBeLessThanOrEqual(2);
    const boardScroll = await surface.locator(".board-content").evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(boardScroll.scrollHeight).toBeGreaterThan(boardScroll.clientHeight);

    await surface.getByRole("button", { name: "Back" }).click();
    await expect(surface.getByRole("heading", { name: "Nearby", exact: true, level: 1 })).toBeVisible();
    await station.click();
    await expect(surface.getByRole("heading", { name: "T-Centralen" })).toBeVisible();

    await page.locator(".board-content").evaluate((element) => {
      const emit = (type: string, x: number, y: number) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        const touch = { identifier: 3, clientX: x, clientY: y, target: element };
        Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [touch] });
        Object.defineProperty(event, "changedTouches", { value: [touch] });
        element.dispatchEvent(event);
      };
      emit("touchstart", 40, 500);
      emit("touchmove", 220, 504);
      emit("touchend", 300, 504);
    });

    await expect(surface.getByRole("heading", { name: "Nearby", exact: true, level: 1 })).toBeVisible();
    await expect(surface).toBeVisible();

    await page.keyboard.press("ArrowRight");
    await expect(surface.getByRole("heading", { name: "T-Centralen" })).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(surface.getByRole("heading", { name: "Nearby", exact: true, level: 1 })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(surface.getByRole("heading", { name: "T-Centralen" })).toBeVisible();

    await page.goBack();
    await expect(surface.getByRole("heading", { name: "Nearby", exact: true, level: 1 })).toBeVisible();
    await page.goForward();
    await expect(surface.getByRole("heading", { name: "T-Centralen" })).toBeVisible();

    await surface.getByRole("button", { name: "Back" }).click();
    await expect(surface.getByRole("heading", { name: "Nearby", exact: true, level: 1 })).toBeVisible();
    await surface.getByRole("button", { name: /Back to pages|Tillbaka till sidorna/i }).click();
    await expect(page.getByRole("heading", { name: "Commuter test" })).toBeVisible();
  });

  test("loads Nearby after reload when WebKit location is already granted", async ({ page, context }) => {
    const app = new CommuterApp(page);
    await app.mockDepartures();
    await page.route("**/v1/sites", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: 100, name: "T-Centralen", lat: 59.33, lon: 18.06 },
      ]),
    }));
    await app.open();

    await context.grantPermissions(["geolocation"], { origin: "http://localhost:4173" });
    await context.setGeolocation({ latitude: 59.33, longitude: 18.06 });
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("switch", { name: /Location services|Platsjänster/i }).click();
    await expect(page.getByRole("switch", { name: /Location services|Platsjänster/i })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: /Close settings|Stäng inställningar/i }).click();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Settings/i })).toBeVisible();
    await page.keyboard.press("ArrowRight");

    const surface = page.locator(".nearby-surface");
    await expect(surface).toBeVisible();
    await expect(surface.getByRole("button", { name: /Enable location|Retry|Aktivera plats|Försök igen/i })).toHaveCount(0);
    await expect(surface.locator(".station-card").filter({ hasText: "T-Centralen" })).toBeVisible({ timeout: 15_000 });
  });
});
