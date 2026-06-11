import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadRoutes, saveRoutes, loadSettings, saveSettings } from "./storage";
import type { Settings } from "./storage";

describe("storage service", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("routes", () => {
    it("returns empty array when no routes stored", () => {
      expect(loadRoutes()).toEqual([]);
    });

    it("returns stored routes", () => {
      const routes = [
        {
          id: "1",
          name: "Arbete",
          direction: "toWork" as const,
          segments: [],
        },
      ];
      localStorage.setItem("nasta_routes", JSON.stringify(routes));
      expect(loadRoutes()).toEqual(routes);
    });

    it("returns empty array on parse error", () => {
      localStorage.setItem("nasta_routes", "invalid json");
      expect(loadRoutes()).toEqual([]);
    });

    it("saves routes to localStorage", () => {
      const routes = [
        {
          id: "1",
          name: "Hem",
          direction: "fromWork" as const,
          segments: [],
        },
      ];
      saveRoutes(routes);
      expect(localStorage.getItem("nasta_routes")).toBe(JSON.stringify(routes));
    });

    it("migrates legacy routes with directionText to direction object", () => {
      const legacyRoutes = [
        {
          id: "1",
          name: "Arbete",
          direction: "toWork" as const,
          segments: [
            {
              id: "s1",
              line: "76",
              lineName: "76",
              directionText: "Norra Hammarbyhamnen",
              fromStop: { id: "f", name: "From", siteId: "100" },
              toStop: { id: "t", name: "To", siteId: "300" },
              transportType: "bus" as const,
            },
          ],
        },
      ];

      localStorage.setItem("nasta_routes", JSON.stringify(legacyRoutes));

      const loaded = loadRoutes();
      expect(loaded[0].segments[0].direction).toEqual({
        code: 1,
        destination: "Norra Hammarbyhamnen",
        stopPointId: "",
      });
      // @ts-ignore
      expect(loaded[0].segments[0].directionText).toBeUndefined();

      // Verify it was saved back to localStorage migrated
      const stored = JSON.parse(localStorage.getItem("nasta_routes")!);
      expect(stored[0].segments[0].direction.destination).toBe(
        "Norra Hammarbyhamnen",
      );
    });
  });

  describe("settings", () => {
    it("returns default settings when none stored", () => {
      expect(loadSettings()).toEqual({
        darkMode: true,
        refreshInterval: 30000,
        funMode: false,
        hasSwipedRoutes: false,
        showNotifications: false,
        theme: "default",
        themeVariant: "A",
        language: "auto",
        disruptionAlertsEnabled: true,
        disruptionSeverityThreshold: "warning",
        disruptionLanguage: "auto",
        enabledTransportTypes: ["bus", "train", "metro", "boat"],
        transportFilterMode: "multi",
        activeTransportType: null,
        locationServicesEnabled: false,
        walkingEtaEnabled: false,
        afterworkVenuesEnabled: false,
        afterworkTypes: [],
        eventsEnabled: false,
      });
    });

    it("returns stored locationServicesEnabled when persisted", () => {
      localStorage.setItem(
        "nasta_settings",
        JSON.stringify({ locationServicesEnabled: true }),
      );
      const settings = loadSettings();
      expect(settings.locationServicesEnabled).toBe(true);
    });

    it("returns stored settings", () => {
      localStorage.setItem(
        "nasta_settings",
        JSON.stringify({ darkMode: false }),
      );
      const settings = loadSettings();
      expect(settings.darkMode).toBe(false);
      expect(settings.refreshInterval).toBe(30000);
    });

    it("saves settings to localStorage", () => {
      const settings: Settings = {
        darkMode: false,
        refreshInterval: 60000,
        funMode: false,
        hasSwipedRoutes: true,
        showNotifications: false,
        theme: "electric-pulse",
        themeVariant: "B" as const,
        language: "en" as const,
        disruptionAlertsEnabled: true,
        disruptionSeverityThreshold: "critical" as const,
        disruptionLanguage: "sv" as const,
        enabledTransportTypes: ["bus", "train", "metro", "boat"],
        transportFilterMode: "multi" as const,
        activeTransportType: null,
        locationServicesEnabled: false,
        walkingEtaEnabled: false,
        afterworkVenuesEnabled: false,
        afterworkTypes: [],
        eventsEnabled: false,
      };
      saveSettings(settings);
      expect(localStorage.getItem("nasta_settings")).toBe(
        JSON.stringify(settings),
      );
    });
  });
});
