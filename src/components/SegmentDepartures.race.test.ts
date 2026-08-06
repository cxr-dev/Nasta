import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/svelte";
import type { Page, Segment } from "../types/page";

const mocks = vi.hoisted(() => {
  const predictionResolvers: Array<(value: unknown[]) => void> = [];
  const transitService = {
    getPredictedDepartures: vi.fn(() => new Promise<unknown[]>((resolve) => {
      predictionResolvers.push(resolve);
    })),
    getNextScheduledDeparture: vi.fn().mockResolvedValue(null),
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
    subscribeToLocation: (listener: (snapshot: unknown) => void) => {
      listener({ position: null, isLoading: false, access: 'unknown' });
      return () => {};
    },
  };

  return {
    predictionResolvers,
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
vi.mock("../services/weatherCache", () => ({ getWeatherForStation: vi.fn() }));

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

function prediction(minutes: number) {
  return {
    id: String(minutes),
    stopId: "sl:site-1",
    line: "4",
    lineName: "Blue line",
    destination: "Destination",
    directionCode: 1,
    transportMode: "bus",
    minutes,
    scheduledTime: "08:02",
    dataSource: "predicted",
  };
}

afterEach(() => {
  cleanup();
  mocks.predictionResolvers.length = 0;
  mocks.settings.locationServicesEnabled = false;
  mocks.settings.walkingEtaEnabled = false;
  mocks.geo.loadGrantedLocation.mockClear();
});

describe("SegmentDepartures request generation", () => {
  it("does not load location when Platsjänster is off even if Walking ETA remains enabled", () => {
    mocks.settings.walkingEtaEnabled = true;

    render(SegmentDepartures, { props: { page } });

    expect(mocks.geo.loadGrantedLocation).not.toHaveBeenCalled();
  });

  it("uses the non-prompting granted-only loader for active Walking ETA", () => {
    mocks.settings.locationServicesEnabled = true;
    mocks.settings.walkingEtaEnabled = true;

    render(SegmentDepartures, { props: { page } });

    expect(mocks.geo.loadGrantedLocation).toHaveBeenCalledTimes(1);
  });

  it("keeps the newest snapshot when an older lookup resolves later", async () => {
    const { container } = render(SegmentDepartures, { props: { page } });

    await waitFor(() => expect(mocks.predictionResolvers).toHaveLength(2));

    mocks.predictionResolvers[1](
      [prediction(2)],
    );
    await waitFor(() => expect(container.querySelector(".countdown")?.textContent?.trim()).toBe("2 min"));

    mocks.predictionResolvers[0](
      [prediction(10)],
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.querySelector(".countdown")?.textContent?.trim()).toBe("2 min");
  });
});
