import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Settings } from "../services/storage";

const defaults: Settings = {
  darkMode: false,
  refreshInterval: 30000,
  hasSwipedRoutes: false,
  theme: "default",
  themeVariant: "A" as const,
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
  sortMode: "manual" as const,
  groupingMode: "none" as const,
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

vi.mock("../themes", () => ({
  getDarkVariant: vi.fn((_theme: string) => "A"),
}));

const settingsModule = await import("../stores/settingsStore.svelte");

beforeEach(() => {
  vi.clearAllMocks();
  currentSettings = { ...defaults };
  // Reset module-level $state by calling a setter with defaults
  settingsModule.setDarkMode(defaults.darkMode);
  settingsModule.setLanguage(defaults.language);
  settingsModule.setSortMode(defaults.sortMode);
  settingsModule.setGroupingMode(defaults.groupingMode);
  settingsModule.setRefreshInterval(defaults.refreshInterval);
  settingsModule.setAfterworkStartHour(defaults.afterworkStartHour);
  settingsModule.setTheme(defaults.theme, defaults.themeVariant);
  settingsModule.setDisruptionSeverityThreshold(defaults.disruptionSeverityThreshold);
  settingsModule.setActiveTransportType(defaults.activeTransportType);
  vi.clearAllMocks();
});

describe("settingsStore", () => {
  describe("defaults", () => {
    it("getSettings returns default settings", () => {
      const settings = settingsModule.getSettings();
      expect(settings.darkMode).toBe(false);
      expect(settings.refreshInterval).toBe(30000);
      expect(settings.sortMode).toBe("manual");
      expect(settings.groupingMode).toBe("none");
      expect(settings.afterworkStartHour).toBe(15);
      expect(settings.language).toBe("auto");
      expect(settings.theme).toBe("default");
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
      expect(settings.darkMode).toBe(false);
      expect(settings.language).toBe("auto");
    });
  });

  describe("dark mode / theme sync", () => {
    it("setDarkMode updates darkMode and themeVariant", () => {
      settingsModule.setDarkMode(true);
      expect(settingsModule.getSettings().darkMode).toBe(true);
      expect(saveSettingsMock).toHaveBeenCalled();
    });

    it("toggleDarkMode flips darkMode", () => {
      settingsModule.setDarkMode(false);
      settingsModule.toggleDarkMode();
      expect(settingsModule.getSettings().darkMode).toBe(true);
    });

    it("toggleDarkMode updates themeVariant as well", () => {
      settingsModule.setDarkMode(false);
      saveSettingsMock.mockClear();
      settingsModule.toggleDarkMode();
      expect(saveSettingsMock.mock.calls[0]?.[0]).toHaveProperty("darkMode", true);
      expect(saveSettingsMock.mock.calls[0]?.[0]).toHaveProperty("themeVariant");
    });

    it("setTheme updates theme and themeVariant", () => {
      settingsModule.setTheme("sunset", "B");
      expect(settingsModule.getSettings().theme).toBe("sunset");
      expect(settingsModule.getSettings().themeVariant).toBe("B");
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
