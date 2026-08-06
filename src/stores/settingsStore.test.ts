import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Settings } from "../services/storage";

const defaults: Settings = {
  refreshInterval: 30000,
  hasSwipedRoutes: false,
  theme: "system",
  language: "auto" as const,
  disruptionAlertsEnabled: true,
  disruptionSeverityThreshold: "warning" as const,
  disruptionLanguage: "auto" as const,
  enabledTransportTypes: ["bus", "train", "metro", "boat", "tram"],
  transportFilterMode: "multi" as const,
  activeTransportType: null,
  locationServicesEnabled: false,
  walkingEtaEnabled: false,
  afterworkVenuesEnabled: false,
  afterworkStartHour: 15,
  afterworkTypes: [] as Array<"beer" | "wine" | "cocktail">,
  eventsEnabled: false,
  groupDisruptedSegments: false,
  sortMode: "time" as const,
  groupingMode: "none" as const,
  groupSleeping: false,
};

let currentSettings = { ...defaults };
const loadSettingsMock = vi.fn(() => currentSettings);
const saveSettingsMock = vi.fn((s: Settings) => {
  currentSettings = s;
});

vi.mock("../services/storage", () => ({
  loadSettings: () => loadSettingsMock(),
  saveSettings: (s: Settings) => saveSettingsMock(s),
}));

const settingsModule = await import("../stores/settingsStore.svelte");

beforeEach(() => {
  vi.clearAllMocks();
  currentSettings = { ...defaults };
  // Reset module-level $state by calling a setter with defaults
  settingsModule.setLanguage(defaults.language);
  settingsModule.setSortMode(defaults.sortMode);
  settingsModule.setGroupingMode(defaults.groupingMode);
  settingsModule.setRefreshInterval(defaults.refreshInterval);
  settingsModule.setAfterworkStartHour(defaults.afterworkStartHour);
  settingsModule.setTheme(defaults.theme);
  settingsModule.setDisruptionSeverityThreshold(defaults.disruptionSeverityThreshold);
  settingsModule.setActiveTransportType(defaults.activeTransportType);
  vi.clearAllMocks();
});

describe("settingsStore", () => {
  describe("defaults", () => {
    it("getSettings returns default settings", () => {
      const settings = settingsModule.getSettings();
      expect(settings.refreshInterval).toBe(30000);
      expect(settings.sortMode).toBe("time");
      expect(settings.groupingMode).toBe("none");
      expect(settings.afterworkStartHour).toBe(15);
      expect(settings.language).toBe("auto");
      expect(settings.theme).toBe("system");
    });
  });

  describe("persistence", () => {
    it("calls saveSettings when setter is invoked", () => {
      settingsModule.setLanguage("sv");
      expect(saveSettingsMock).toHaveBeenCalledTimes(1);
      expect(saveSettingsMock.mock.calls[0]?.[0]).toMatchObject({ language: "sv" });
    });

    it("getSettings reflects the updated value after a setter", () => {
      settingsModule.setLanguage("sv");
      expect(settingsModule.getSettings().language).toBe("sv");
    });

    it("setter persists its field without touching others", () => {
      settingsModule.setSortMode("time");
      const settings = settingsModule.getSettings();
      expect(settings.sortMode).toBe("time");
      expect(settings.theme).toBe("system");
      expect(settings.language).toBe("auto");
    });

    it("reports an explicit persistence failure and clears it after recovery", () => {
      const states: boolean[] = [];
      const unsubscribe = settingsModule.subscribePersistence((failed) => states.push(failed));
      saveSettingsMock.mockImplementationOnce(() => {
        throw new Error("storage unavailable");
      });

      expect(settingsModule.setLanguage("sv")).toBe(false);
      expect(states.at(-1)).toBe(true);

      expect(settingsModule.retryPersistence()).toBe(true);
      expect(states.at(-1)).toBe(false);
      unsubscribe();
    });
  });

  describe("theme preference", () => {
    it("sets and toggles the explicit theme", () => {
      settingsModule.setTheme("dark");
      expect(settingsModule.getSettings().theme).toBe("dark");
      settingsModule.toggleTheme();
      expect(settingsModule.getSettings().theme).toBe("light");
    });

    it("supports System as a persisted preference", () => {
      settingsModule.setTheme("system");
      expect(settingsModule.getSettings().theme).toBe("system");
    });
  });

  describe("afterworkStartHour validation", () => {
    it("clamps values above 23 to 23", () => {
      settingsModule.setAfterworkStartHour(25);
      expect(settingsModule.getSettings().afterworkStartHour).toBe(23);
    });

    it("clamps values below 0 to 0", () => {
      settingsModule.setAfterworkStartHour(-5);
      expect(settingsModule.getSettings().afterworkStartHour).toBe(0);
    });

    it("passes through valid values unchanged", () => {
      settingsModule.setAfterworkStartHour(15);
      expect(settingsModule.getSettings().afterworkStartHour).toBe(15);
    });
  });

  describe("groupingMode mapping", () => {
    it("setGroupDisruptedSegments(true) sets groupingMode to 'disrupted'", () => {
      settingsModule.setGroupDisruptedSegments(true);
      expect(settingsModule.getSettings().groupingMode).toBe("disrupted");
    });

    it("setGroupDisruptedSegments(false) sets groupingMode to 'none'", () => {
      settingsModule.setGroupDisruptedSegments(true);
      settingsModule.setGroupDisruptedSegments(false);
      expect(settingsModule.getSettings().groupingMode).toBe("none");
    });
  });

  describe("representative setters", () => {
    it("setLocationServicesEnabled toggles boolean", () => {
      settingsModule.setLocationServicesEnabled(true);
      expect(settingsModule.getSettings().locationServicesEnabled).toBe(true);
      settingsModule.setLocationServicesEnabled(false);
      expect(settingsModule.getSettings().locationServicesEnabled).toBe(false);
    });

    it("setLanguage sets language field", () => {
      settingsModule.setLanguage("sv");
      expect(settingsModule.getSettings().language).toBe("sv");
      settingsModule.setLanguage("en");
      expect(settingsModule.getSettings().language).toBe("en");
    });

    it("setSortMode sets sortMode field", () => {
      settingsModule.setSortMode("station");
      expect(settingsModule.getSettings().sortMode).toBe("station");
      settingsModule.setSortMode("time");
      expect(settingsModule.getSettings().sortMode).toBe("time");
    });

    it("setRefreshInterval updates the interval", () => {
      settingsModule.setRefreshInterval(60000);
      expect(settingsModule.getSettings().refreshInterval).toBe(60000);
    });

    it("setDisruptionSeverityThreshold updates threshold", () => {
      settingsModule.setDisruptionSeverityThreshold("critical");
      expect(settingsModule.getSettings().disruptionSeverityThreshold).toBe("critical");
    });

    it("setActiveTransportType sets type", () => {
      settingsModule.setActiveTransportType("metro");
      expect(settingsModule.getSettings().activeTransportType).toBe("metro");
      settingsModule.setActiveTransportType(null);
      expect(settingsModule.getSettings().activeTransportType).toBeNull();
    });
  });

  describe("markSwiped", () => {
    it("sets hasSwipedRoutes to true", () => {
      settingsModule.markSwiped();
      expect(settingsModule.getSettings().hasSwipedRoutes).toBe(true);
    });
  });
});
