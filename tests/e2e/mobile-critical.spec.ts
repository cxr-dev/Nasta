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
});
