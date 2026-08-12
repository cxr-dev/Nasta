import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import type { Page, Segment } from "../types/page";
import { getT, setLocale } from "../stores/localeStore.svelte";

const mocks = vi.hoisted(() => {
  const transitService = {
    getPredictedDepartures: vi.fn().mockResolvedValue([]),
    getNextScheduledDeparture: vi.fn().mockResolvedValue(null),
    getStopSequence: vi.fn().mockResolvedValue(null),
    prefetchStopSequence: vi.fn().mockResolvedValue(null),
  };
  const settings = {
    afterworkTypes: [],
    afterworkVenuesEnabled: false,
    disruptionSeverityThreshold: "warning",
    eventsEnabled: false,
    groupingMode: "none",
    groupSleeping: false,
    sortMode: "time",
    locationServicesEnabled: false,
    walkingEtaEnabled: false,
  };
  const geo = {
    loadGrantedLocation: vi.fn().mockResolvedValue(null),
    isDistanceReliable: vi.fn(() => true),
    subscribeToLocation: (listener: (snapshot: unknown) => void) => {
      listener({ position: null, accuracy: null, isLoading: false, access: 'unknown' });
      return () => {};
    },
  };

  return {
    transitService,
    settings,
    geo,
    departureStore: {
      subscribe(callback: (value: Map<string, never[]>) => void) {
        callback(new Map());
        return () => {};
      },
      stopDeviations: {
        subscribe(callback: (value: Map<string, never[]>) => void) {
          callback(new Map<string, never>());
          return () => {};
        },
      },
      status: {
        subscribe(callback: (value: Map<string, never>) => void) {
          callback(new Map<string, never>());
          return () => {};
        },
      },
      retrySegment: vi.fn(),
      isLoading: {
        subscribe(callback: (value: boolean) => void) {
          callback(false);
          return () => {};
        },
      },
      lastError: {
        subscribe(callback: (value: Error | null) => void) {
          callback(null);
          return () => {};
        },
      },
    },
  };
});

vi.mock("../providers/init", () => ({ transitService: mocks.transitService }));
vi.mock("../stores/departureStore.svelte", () => ({
  departureStore: mocks.departureStore,
  makeDepartureStatusKey: (siteId: string, line: string, direction: number) => `${siteId}|${line}|${direction}`,
}));
vi.mock("../stores/pageStore.svelte", () => ({
  getPages: () => [],
  getActivePageId: () => "page-1",
}));
vi.mock("../stores/settingsStore.svelte", () => ({
  getSettings: () => mocks.settings,
}));
vi.mock("../services/geo", () => mocks.geo);
vi.mock("../services/eventService", () => ({ fetchNearbyEvents: vi.fn() }));
vi.mock("../services/venueService", () => ({ fetchNearbyVenues: vi.fn() }));
vi.mock("../services/weatherCache", () => ({
  getWeatherForStations: vi.fn().mockResolvedValue(new Map()),
}));

import SegmentDepartures from "./SegmentDepartures.svelte";

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

const segment: Segment = {
  id: "segment-1",
  line: "4",
  lineName: "Blue line",
  direction: {
    code: 1,
    destination: "Destination",
    stopPointId: "point-1",
  },
  fromStop: { id: "from-1", name: "Station", siteId: "site-1" },
  toStop: { id: "to-1", name: "Destination", siteId: "site-2" },
  transportType: "bus",
};

const page: Page = { id: "page-1", name: "Home", segments: [segment] };

beforeEach(() => {
  setLocale("sv");
  vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SegmentDepartures SL ticket button", () => {
  it("opens the https://sl.se/privat/min-biljett web fallback on non-iOS devices via openSlTickets", async () => {
    const view = render(SegmentDepartures, { props: { page } });

    const ticketButton = view.getByRole("button", { name: getT().openTickets });
    expect(ticketButton.className).toContain("sl-ticket-btn");

    await fireEvent.click(ticketButton);

    // jsdom's user agent is non-iOS, so openSlTickets takes the https window.open path.
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(window.open).toHaveBeenCalledWith("https://sl.se/privat/min-biljett", "_blank", "noopener");
  });
});
