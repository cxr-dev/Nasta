import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
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

describe("SegmentDepartures refresh behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    departureStoreMockState.refresh.mockReset();
    departureStoreMockState.data.set(new Map());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("does not auto-refresh on timer ticks", () => {
    render(SegmentDepartures, { props: { route } });
    departureStoreMockState.refresh.mockClear();

    vi.advanceTimersByTime(60_000);
    expect(departureStoreMockState.refresh).not.toHaveBeenCalled();
  });

  it("refreshes when user clicks refresh button", async () => {
    const view = render(SegmentDepartures, { props: { route } });
    const refreshButton = view.getByRole("button", {
      name: /refresh|uppdatera/i,
    });
    await fireEvent.click(refreshButton);
    expect(departureStoreMockState.refresh).toHaveBeenCalledTimes(1);
  });

  it("renders without errors when no matching departures exist", () => {
    const view = render(SegmentDepartures, { props: { route } });
    // Component should render without errors
    expect(view.container).toBeTruthy();
  });
});
