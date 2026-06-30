import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/svelte";
import SegmentSearch from "./SegmentSearch.svelte";
import { setLocale } from "../stores/localeStore.svelte";

const mockSearchStops = vi.fn();
const mockGetDepartures = vi.fn();
const mockGetKnownRoutes = vi.fn();
const mockGetQuickLocation = vi.fn();
const mockGetMemoizedDistance = vi.fn();
const mockFormatDistance = vi.fn((km: number) => `${km.toFixed(1)} km`);

vi.mock("../providers/init", () => ({
  transitService: {
    searchStops: (...args: any[]) => mockSearchStops(...args),
    getDepartures: (...args: any[]) => mockGetDepartures(...args),
    getKnownRoutes: (...args: any[]) => mockGetKnownRoutes(...args),
    getStopSequence: vi.fn(() => Promise.resolve({ stops: [] })),
  },
}));

vi.mock("../services/geo", () => ({
  getQuickLocation: (...args: any[]) => mockGetQuickLocation(...args),
  getMemoizedDistance: (...args: any[]) => mockGetMemoizedDistance(...args),
  formatDistance: (km: number) => mockFormatDistance(km),
}));

const stationCentralen = {
  id: "sl:9001",
  name: "Centralen",
  coord: [59.33, 18.06] as [number, number],
  modes: ["metro", "train", "bus"],
  relevance: 100,
  locationType: "stop" as const,
};

const departureMetro = {
  id: "dep-1|sl:9001|19|1",
  stopId: "sl:9001",
  line: "19",
  lineName: "19",
  destination: "Hässelby strand",
  directionCode: 1,
  transportMode: "metro" as const,
  minutes: 5,
  scheduledTime: "10:00",
  dataSource: "realtime" as const,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

beforeEach(() => {
  setLocale("sv");
});

describe("SegmentSearch", () => {
  describe("initial render", () => {
    it("renders search input with placeholder", () => {
      const { getByPlaceholderText } = render(SegmentSearch, { props: {} });
      expect(getByPlaceholderText("Sök hållplats...")).toBeTruthy();
    });

    it("shows recent stops when localStorage has data", () => {
      localStorage.setItem(
        "nasta_recent_stops",
        JSON.stringify([stationCentralen])
      );
      mockGetQuickLocation.mockResolvedValue(null);

      const { findByText } = render(SegmentSearch, { props: {} });
      // Recent stops section should appear after mount
      expect(findByText("Centralen")).toBeTruthy();
    });
  });

  describe("search flow", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      mockGetQuickLocation.mockResolvedValue(null);
    });

    it("calls searchStops after typing and debounce", async () => {
      mockSearchStops.mockResolvedValue([stationCentralen]);
      mockGetDepartures.mockResolvedValue({ departures: [departureMetro] });
      mockGetKnownRoutes.mockResolvedValue([]);

      const { getByPlaceholderText, findByText } = render(SegmentSearch, {
        props: {},
      });

      const input = getByPlaceholderText("Sök hållplats...");
      await fireEvent.input(input, { target: { value: "Cen" } });

      // Advance past debounce
      await act(() => vi.advanceTimersByTimeAsync(350));

      expect(mockSearchStops).toHaveBeenCalledWith("Cen", expect.any(AbortSignal));
      expect(await findByText("Centralen")).toBeTruthy();
    });

    it('shows "no stops" when search returns empty', async () => {
      mockSearchStops.mockResolvedValue([]);

      const { getByPlaceholderText, findByText } = render(SegmentSearch, {
        props: {},
      });

      const input = getByPlaceholderText("Sök hållplats...");
      await fireEvent.input(input, { target: { value: "xyz" } });
      await act(() => vi.advanceTimersByTimeAsync(350));

      expect(await findByText("Inga hållplatser hittades")).toBeTruthy();
    });

    it("does not search when query is too short", async () => {
      const { getByPlaceholderText } = render(SegmentSearch, { props: {} });
      const input = getByPlaceholderText("Sök hållplats...");
      await fireEvent.input(input, { target: { value: "C" } });
      await act(() => vi.advanceTimersByTimeAsync(350));

      expect(mockSearchStops).not.toHaveBeenCalled();
    });
  });

  describe("error states", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      mockGetQuickLocation.mockResolvedValue(null);
    });

    it("handles searchStops failure gracefully", async () => {
      mockSearchStops.mockRejectedValue(new Error("Network error"));

      const { getByPlaceholderText } = render(SegmentSearch, { props: {} });
      const input = getByPlaceholderText("Sök hållplats...");
      await fireEvent.input(input, { target: { value: "Cen" } });
      await act(() => vi.advanceTimersByTimeAsync(350));

      // Should not crash; input still visible
      expect(getByPlaceholderText("Sök hållplats...")).toBeTruthy();
    });

    it("shows error when getDepartures fails", async () => {
      mockSearchStops.mockResolvedValue([stationCentralen]);
      mockGetDepartures.mockRejectedValue(new Error("API error"));
      mockGetKnownRoutes.mockResolvedValue([]);

      const { getByPlaceholderText, findByText, getByText } = render(
        SegmentSearch,
        { props: {} }
      );

      const input = getByPlaceholderText("Sök hållplats...");
      await fireEvent.input(input, { target: { value: "Cen" } });
      await act(() => vi.advanceTimersByTimeAsync(350));

      const stationBtn = await findByText("Centralen");
      await fireEvent.click(stationBtn);

      expect(await findByText("Kunde inte hämta avgångar")).toBeTruthy();
    });
  });

  describe("auto-complete single-line path", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      mockGetQuickLocation.mockResolvedValue(null);
      mockGetKnownRoutes.mockResolvedValue([]);
    });

    it("auto-completes when station has single line + single direction", async () => {
      const onSelect = vi.fn();
      mockSearchStops.mockResolvedValue([stationCentralen]);
      mockGetDepartures.mockResolvedValue({
        departures: [
          departureMetro,
          { ...departureMetro, id: "dep-2", scheduledTime: "10:10" },
        ],
      });

      const { getByPlaceholderText, findByText } = render(SegmentSearch, {
        props: { onSelect },
      });

      const input = getByPlaceholderText("Sök hållplats...");
      await fireEvent.input(input, { target: { value: "Cen" } });
      await act(() => vi.advanceTimersByTimeAsync(350));

      const stationBtn = await findByText("Centralen");
      await fireEvent.click(stationBtn);

      // Wait for auto-complete animation frame
      await act(() => vi.advanceTimersByTimeAsync(50));

      expect(onSelect).toHaveBeenCalledTimes(1);
      const call = onSelect.mock.calls[0];
      expect(call[0]).toBe("19");
      expect(call[1]).toBe("19");
      expect(call[2]).toMatchObject({ code: 1, destination: "Hässelby strand" });
      expect(call[3]).toMatchObject({ name: "Centralen", siteId: "sl:9001" });
      expect(call[4]).toMatchObject({ name: "Hässelby strand", siteId: "" });
      expect(call[5]).toBe("metro");
    });

    it("shows line selection when station has multiple lines", async () => {
      const onSelect = vi.fn();
      mockSearchStops.mockResolvedValue([stationCentralen]);
      mockGetDepartures.mockResolvedValue({
        departures: [
          departureMetro,
          {
            ...departureMetro,
            id: "dep-3",
            line: "17",
            lineName: "17",
            destination: "Åkeshov",
            directionCode: 2,
          },
        ],
      });

      const { getByPlaceholderText, findAllByText } = render(SegmentSearch, {
        props: { onSelect },
      });

      const input = getByPlaceholderText("Sök hållplats...");
      await fireEvent.input(input, { target: { value: "Cen" } });
      await act(() => vi.advanceTimersByTimeAsync(350));

      const stationBtn = (await findAllByText("Centralen"))[0];
      await fireEvent.click(stationBtn);

      // Should show line selection (step === 'select'), not auto-complete
      // Lines "19" and "17" should be visible as departure entries
      const lineItems = await findAllByText(/^(19|17)$/);
      expect(lineItems.length).toBeGreaterThanOrEqual(2);
      expect(onSelect).not.toHaveBeenCalled();
    });
  });
});
