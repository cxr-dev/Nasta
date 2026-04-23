import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/svelte";
import DepartureStrip from "./DepartureStrip.svelte";
import { locale } from "../stores/localeStore";
import type { Segment } from "../types/route";
import type { Departure } from "../types/departure";
import type { JourneyData } from "../services/journeyService";

const fetchJourneyStopsMock = vi.hoisted(() => vi.fn<() => Promise<JourneyData>>());
const estimateVehicleStopIndexMock = vi.hoisted(() => vi.fn(() => 0));

vi.mock("../services/journeyService", () => ({
  fetchJourneyStops: fetchJourneyStopsMock,
  estimateVehicleStopIndex: estimateVehicleStopIndexMock,
}));

const segment: Segment = {
  id: "seg-1",
  line: "76",
  lineName: "76",
  directionText: "Norra Hammarbyhamnen",
  fromStop: { id: "from", name: "Lindarängsvägen", siteId: "100" },
  toStop: { id: "to", name: "Norra Hammarbyhamnen", siteId: "300" },
  transportType: "bus",
};

const departure: Departure = {
  line: "76",
  lineName: "76",
  destination: "Norra Hammarbyhamnen",
  directionText: "Norra Hammarbyhamnen",
  minutes: 5,
  time: "10:00",
  expectedAt: Date.now() + 5 * 60_000,
  transportType: "bus",
};

beforeEach(() => {
  locale.set("sv");
  fetchJourneyStopsMock.mockReset();
  estimateVehicleStopIndexMock.mockReset();
  estimateVehicleStopIndexMock.mockReturnValue(0);
});

afterEach(() => {
  cleanup();
});

describe("DepartureStrip", () => {
  it("renders scheduled fallback with explicit timetable-estimate wording", async () => {
    fetchJourneyStopsMock.mockResolvedValue({
      availability: "scheduled",
      source: "pattern_schedule",
      confidence: "medium",
      destination: "Norra Hammarbyhamnen",
      pickupStopIndex: 1,
      stops: [
        { idx: 0, name: "Stop A", siteId: "090", scheduledAt: Date.now() - 60_000 },
        { idx: 1, name: "Lindarängsvägen", siteId: "100", scheduledAt: Date.now() + 120_000 },
        { idx: 2, name: "Stop C", siteId: "200", scheduledAt: Date.now() + 300_000 },
      ],
      reason: "pattern_schedule",
    });

    const { container, getAllByText, getByText } = render(DepartureStrip, {
      props: { departure, segment },
    });

    await waitFor(() => {
      expect(getAllByText(/Tidtabellsestimat/).length).toBeGreaterThanOrEqual(1);
    });

    expect(container.querySelector(".vehicle-bubble")).toBeTruthy();
    expect(getByText(/Beräknat läge vid/)).toBeTruthy();
  });

  it("renders unavailable fallback without a fake vehicle bubble", async () => {
    fetchJourneyStopsMock.mockResolvedValue({
      availability: "unavailable",
      source: "none",
      confidence: "low",
      destination: "Norra Hammarbyhamnen",
      pickupStopIndex: 0,
      stops: [{ idx: 0, name: "Lindarängsvägen", siteId: "100" }],
      reason: "no_ref",
    });

    const { container, getByText } = render(DepartureStrip, {
      props: { departure, segment },
    });

    await waitFor(() => {
      expect(getByText("Position ej tillgänglig")).toBeTruthy();
    });

    expect(getByText("Live position saknas")).toBeTruthy();
    expect(container.querySelector(".vehicle-bubble")).toBeNull();
  });

  it("keeps live badge semantics for live journey data", async () => {
    fetchJourneyStopsMock.mockResolvedValue({
      availability: "live",
      source: "live_journey",
      confidence: "high",
      destination: "Norra Hammarbyhamnen",
      pickupStopIndex: 1,
      stops: [
        { idx: 0, name: "Stop A", siteId: "090", scheduledAt: Date.now() - 60_000 },
        { idx: 1, name: "Lindarängsvägen", siteId: "100", scheduledAt: Date.now() + 120_000 },
      ],
      reason: "live",
    });

    const { getByText } = render(DepartureStrip, {
      props: { departure, segment },
    });

    await waitFor(() => {
      expect(getByText(/Live/)).toBeTruthy();
    });
  });
});
