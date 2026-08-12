import { expect, type Locator, type Page, type Route } from "@playwright/test";

export interface TestSegment {
  id: string;
  line: string;
  lineName: string;
  direction: { code: number; destination: string; stopPointId: string };
  fromStop: { id: string; name: string; siteId: string };
  toStop: { id: string; name: string; siteId: string };
  transportType: "bus" | "metro" | "tram" | "train" | "ferry";
}

export interface TestPage {
  id: string;
  name: string;
  segments: TestSegment[];
}

export type DepartureMockMode = "available" | "unavailable";

export const defaultTestPage: TestPage = {
  id: "commuter-test-page",
  name: "Commuter test",
  segments: [{
    id: "commuter-test-segment",
    line: "14",
    lineName: "14",
    direction: { code: 1, destination: "Mörby centrum", stopPointId: "" },
    fromStop: { id: "from", name: "T-Centralen", siteId: "100" },
    toStop: { id: "to", name: "Mörby centrum", siteId: "456" },
    transportType: "metro",
  }],
};

export class CommuterApp {
  private departureMode: DepartureMockMode = "available";

  constructor(readonly page: Page) {}

  async mockDepartures(mode: DepartureMockMode = "available"): Promise<void> {
    this.departureMode = mode;
    await this.page.route("**/*.integration.sl.se/**", async (route: Route) => {
      const url = route.request().url();

      if (url.includes("departures")) {
        if (this.departureMode === "unavailable") {
          await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            departures: [{
              line: { designation: "14" },
              direction_code: 1,
              destination: "Mörby centrum",
              display: "5 min",
              expected: new Date(Date.now() + 5 * 60_000).toISOString(),
            }],
          }),
        });
        return;
      }

      if (url.includes("deviations") || url.includes("messages")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
        return;
      }

      if (url.includes("journeyplanner") || url.includes("trip")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ trips: [] }) });
        return;
      }

      await route.continue();
    });
  }

  setDepartureMode(mode: DepartureMockMode): void {
    this.departureMode = mode;
  }

  async open(testPage: TestPage = defaultTestPage): Promise<void> {
    await this.page.addInitScript((routes) => {
      localStorage.clear();
      localStorage.setItem("nasta_settings", JSON.stringify({ language: "en", theme: "light" }));
      localStorage.setItem("nasta_routes", JSON.stringify(routes));
    }, [testPage]);
    await this.page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await this.page.emulateMedia({ reducedMotion: "reduce" });
    await expect(this.page.getByRole("heading", { name: testPage.name })).toBeVisible({ timeout: 15_000 });
  }

  card(segment: TestSegment = defaultTestPage.segments[0]): Locator {
    return this.page.getByTestId("segment-row").filter({ hasText: segment.fromStop.name });
  }

  countdown(segment?: TestSegment): Locator {
    return this.card(segment).getByTestId("countdown-minutes");
  }
}
