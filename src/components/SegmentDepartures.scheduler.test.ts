import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import type { Route } from "../types/route";
import type { Departure } from "../types/departure";
import SegmentDepartures from "./SegmentDepartures.svelte";

type Subscriber<T> = (value: T) => void;

function createMockReadable<T>(initial: T) {
  let value = initial;
  const subscribers = new Set<Subscriber<T>>();

  return {
    subscribe(fn: Subscriber<T>) {
      fn(value);
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    set(next: T) {
      value = next;
      for (const fn of subscribers) fn(value);
    },
  };
}

const departureStoreMockState = vi.hoisted(() => {
  const data = createMockReadable<Map<string, Departure[]>>(new Map());
  const isLoading = createMockReadable(false);
  const lastError = createMockReadable<string | null>(null);
  const lastSuccessfulFetch = createMockReadable(0);
  const refresh = vi.fn();

  return {
    data,
    isLoading,
    lastError,
    lastSuccessfulFetch,
    refresh,
  };
});

vi.mock("../stores/departureStore", () => {
  return {
    departureStore: {
      subscribe: departureStoreMockState.data.subscribe,
      isLoading: { subscribe: departureStoreMockState.isLoading.subscribe },
      lastError: { subscribe: departureStoreMockState.lastError.subscribe },
      lastSuccessfulFetch: {
        subscribe: departureStoreMockState.lastSuccessfulFetch.subscribe,
      },
      refresh: departureStoreMockState.refresh,
    },
  };
});

const route: Route = {
  id: "route-1",
  name: "To Work",
  direction: "toWork",
  segments: [
    {
      id: "seg-1",
      line: "76",
      lineName: "76",
      directionText: "Norra Hammarbyhamnen",
      fromStop: { id: "from", name: "Lindarängsvägen", siteId: "100" },
      toStop: { id: "to", name: "Norra Hammarbyhamnen", siteId: "300" },
      transportType: "bus",
    },
  ],
};

function createDeparture(minutesAhead: number, includeExpectedAt = true): Departure {
  const expectedAt = Date.now() + minutesAhead * 60_000;
  return {
    line: "76",
    lineName: "76",
    destination: "Norra Hammarbyhamnen",
    directionText: "Norra Hammarbyhamnen",
    minutes: minutesAhead,
    time: "12:00",
    transportType: "bus",
    ...(includeExpectedAt ? { expectedAt } : {}),
  };
}

function setDepartureData(departure: Departure) {
  departureStoreMockState.data.set(new Map([["100", [departure]]]));
}

function setDocumentHidden(value: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value });
}

describe("SegmentDepartures adaptive refresh scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T10:00:00Z"));
    departureStoreMockState.refresh.mockReset();
    setDocumentHidden(false);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    setDocumentHidden(false);
  });

  it("refreshes every 10s when first departure is <= 5 minutes away", () => {
    setDepartureData(createDeparture(4));
    render(SegmentDepartures, { props: { route } });
    departureStoreMockState.refresh.mockClear();

    vi.advanceTimersByTime(9_999);
    expect(departureStoreMockState.refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(departureStoreMockState.refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes every 20s when first departure is between 6 and 20 minutes away", () => {
    setDepartureData(createDeparture(15));
    render(SegmentDepartures, { props: { route } });
    departureStoreMockState.refresh.mockClear();

    vi.advanceTimersByTime(19_999);
    expect(departureStoreMockState.refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(departureStoreMockState.refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes every 30s when first departure is > 20 minutes away", () => {
    setDepartureData(createDeparture(25));
    render(SegmentDepartures, { props: { route } });
    departureStoreMockState.refresh.mockClear();

    vi.advanceTimersByTime(29_999);
    expect(departureStoreMockState.refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(departureStoreMockState.refresh).toHaveBeenCalledTimes(1);
  });

  it("uses 30s cadence when expectedAt is missing", () => {
    setDepartureData(createDeparture(12, false));
    render(SegmentDepartures, { props: { route } });
    departureStoreMockState.refresh.mockClear();

    vi.advanceTimersByTime(29_999);
    expect(departureStoreMockState.refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(departureStoreMockState.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not starve refreshes as clock ticks continue", () => {
    setDepartureData(createDeparture(4));
    render(SegmentDepartures, { props: { route } });
    departureStoreMockState.refresh.mockClear();

    vi.advanceTimersByTime(25_000);
    expect(departureStoreMockState.refresh).toHaveBeenCalledTimes(2);
  });

  it("pauses while hidden and resumes with immediate check when visible", () => {
    setDepartureData(createDeparture(4));
    render(SegmentDepartures, { props: { route } });
    departureStoreMockState.refresh.mockClear();

    setDocumentHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(30_000);
    expect(departureStoreMockState.refresh).not.toHaveBeenCalled();

    setDocumentHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(departureStoreMockState.refresh).toHaveBeenCalledTimes(1);
  });
});
