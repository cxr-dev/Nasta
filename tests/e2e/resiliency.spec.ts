import { test, expect } from "@playwright/test";

test.describe("SL API Resiliency", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("nasta_onboarding_seen", "true");

      const testRoute = {
        id: "test-route-id",
        name: "Test Route",
        direction: "toWork",
        segments: [
          {
            id: "test-seg-id",
            line: "76",
            lineName: "Linje 76",
            fromStop: {
              id: "from-9001",
              name: "Ljusterögatan",
              siteId: "9001",
            },
            toStop: { id: "to-9002", name: "Ropsten", siteId: "9002" },
            transportType: "bus",
            direction: { code: 1, destination: "Ropsten", stopPointId: "" },
          },
        ],
      };

      localStorage.setItem("nasta_routes", JSON.stringify([testRoute]));
    });
  });

  test("should show 'Planned' label when real-time API is empty and fallback is triggered", async ({
    page,
  }) => {
    // 1. Mock empty real-time departures
    await page.route(
      "https://transport.integration.sl.se/v1/sites/9001/departures*",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ departures: [] }),
        });
      },
    );

    // 2. Mock Journey Planner v2 trip response (planned data)
    await page.route(
      "https://journeyplanner.integration.sl.se/v2/trip*",
      async (route) => {
        const futureDate = new Date(Date.now() + 10 * 60000);
        const dateStr = futureDate.toISOString().split("T")[0];
        const timeStr = futureDate.toLocaleTimeString("sv-SE", {
          hour: "2-digit",
          minute: "2-digit",
        });

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            trips: [
              {
                legs: [
                  {
                    origin: {
                      id: "90910010009001",
                      name: "Ljusterögatan",
                      time: timeStr,
                      date: dateStr,
                    },
                    destination: { name: "Ropsten" },
                    line: { designation: "76", name: "Linje 76" },
                    direction: { code: 1 },
                    transport_mode: "BUS",
                  },
                ],
              },
            ],
          }),
        });
      },
    );

    await page.goto("/Nasta/", { waitUntil: "networkidle" });
    await page.addStyleTag({
      content: `*, *::before, *::after { transition: none !important; animation: none !important; }`,
    });

    // 3. Wait for the departure row to appear
    const departureRow = page.getByTestId("segment-row").first();
    await departureRow.waitFor({ state: "visible", timeout: 15000 });

    // 4. Verify that the "Planned" (or "Planerad") label is visible
    const plannedLabel = departureRow.getByTestId("planned-badge");
    await plannedLabel.waitFor({ state: "visible", timeout: 5000 });
    await expect(plannedLabel).toBeVisible();
    await expect(plannedLabel).toContainText(/PLANNED|PLANERAD/i);
  });
});
