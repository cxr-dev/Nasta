import { expect, test } from "@playwright/test";

const locations = {
  locations: [
    {
      id: "90910010009001",
      name: "Stockholm, Odenplan",
      disassembledName: "Odenplan",
      type: "stop",
      matchQuality: 1000,
      coord: [59.342, 18.049],
      productClasses: [2, 4],
      parent: { id: "placeID:33001080:1", name: "Stockholm", type: "locality" },
    },
    {
      id: "90910010009002",
      name: "Stockholm, Slussen",
      disassembledName: "Slussen",
      type: "stop",
      matchQuality: 1000,
      coord: [59.319, 18.071],
      productClasses: [2, 4],
      parent: { id: "placeID:33001080:1", name: "Stockholm", type: "locality" },
    },
  ],
};

test.describe("mobile Safari compatibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("nasta_settings", JSON.stringify({ language: "sv" }));
      localStorage.setItem(
        "nasta_routes",
        JSON.stringify([{ id: crypto.randomUUID(), name: "Min rutt", segments: [] }]),
      );
    });

    await page.route("https://journeyplanner.integration.sl.se/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/stop-finder")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(locations) });
        return;
      }
      if (url.includes("/trips")) {
        const now = Date.now();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            journeys: [{
              legs: [{
                origin: { name: "Odenplan", disassembledName: "Odenplan", departureTimePlanned: new Date(now + 5 * 60000).toISOString() },
                destination: { name: "Slussen", disassembledName: "Slussen", arrivalTimePlanned: new Date(now + 35 * 60000).toISOString() },
                transportation: { name: "Buss 40", disassembledName: "40", product: { name: "BUS" } },
                duration: 30 * 60,
                direction: 1,
                directionName: "Slussen",
              }],
            }],
          }),
        });
        return;
      }
      await route.continue();
    });
    await page.route("https://nominatim.openstreetmap.org/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
  });

  test("keeps journey controls readable and the drawer usable on mobile", async ({ page }) => {
    const addButton = page.getByRole("button", { name: /lägg till/i });
    await expect(addButton).toBeVisible();
    await addButton.click();

    const drawer = page.getByRole("dialog", { name: /lägg till/i });
    await expect(drawer).toBeVisible();
    await drawer.focus();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    expect(await page.evaluate(() => document.activeElement?.closest(".quick-add-drawer") === null)).toBe(true);

    await addButton.click();
    await expect(drawer).toBeVisible();
    await drawer.getByRole("tab", { name: "Resa" }).click();

    const routePanel = drawer.getByRole("tabpanel", { name: "Resa" });
    const fromInput = routePanel.getByLabel("Från");
    const toInput = routePanel.getByLabel("Till");
    await expect(fromInput).toHaveCSS("font-size", "16px");
    await expect(toInput).toHaveCSS("font-size", "16px");

    await routePanel.getByRole("radio", { name: "Avgångstid" }).click();
    await expect(routePanel.getByLabel("Datum")).toHaveCSS("font-size", "16px");
    await expect(routePanel.getByLabel("Tid")).toHaveCSS("font-size", "16px");

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await fromInput.fill("Odenplan");
    await toInput.fill("Slussen");
    await routePanel.getByRole("button", { name: "Hitta resa" }).click();
    await expect(routePanel.locator(".result-card")).toHaveCount(1);
    await expect(routePanel.locator(".result-card")).toContainText("Slussen");
  });
});
