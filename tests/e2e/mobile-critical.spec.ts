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

  test("opens the fixed utility map before the first page and swipes back", async ({ page }) => {
    const app = new CommuterApp(page);
    await app.mockDepartures();
    await page.route("**/v1/sites", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: 100, name: "T-Centralen", lat: 59.33, lon: 18.06 }]),
    }));
    await app.open();

    await page.keyboard.press("ArrowLeft");
    const surface = page.locator(".nearby-surface");
    await expect(surface).toBeVisible();

    await surface.evaluate((element) => {
      const emit = (type: string, x: number, y: number) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        const touch = { clientX: x, clientY: y };
        Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [touch] });
        Object.defineProperty(event, "changedTouches", { value: [touch] });
        element.dispatchEvent(event);
      };
      emit("touchstart", 40, 300);
      emit("touchmove", 160, 304);
      emit("touchend", 330, 304);
    });

    await expect(page.locator("h1.page-title")).toContainText(/Commuter test/i);
    await expect(page.locator(".nearby-surface")).toHaveCount(0);
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
    await page.keyboard.press("ArrowLeft");

    const surface = page.locator(".nearby-surface");
    await expect(surface).toBeVisible();
    await expect(surface.getByRole("button", { name: /Enable location|Retry|Aktivera plats|Försök igen/i })).toHaveCount(0);
    await expect(surface.getByRole("button", { name: /T-Centralen/i })).toBeVisible({ timeout: 15_000 });
  });
});
