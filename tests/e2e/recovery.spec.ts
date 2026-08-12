import { expect, test } from "@playwright/test";
import { CommuterApp } from "./support/commuterApp";

test("shows an unavailable state and recovers when departures return", async ({ page }) => {
  const app = new CommuterApp(page);
  await app.mockDepartures("unavailable");
  await app.open();

  await expect(page.getByText("Departures unavailable", { exact: true })).toBeVisible({ timeout: 10_000 });

  app.setDepartureMode("available");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(app.countdown()).toContainText(/min|now|soon/i, { timeout: 10_000 });
});
