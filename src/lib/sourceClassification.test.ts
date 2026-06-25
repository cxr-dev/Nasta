import { describe, it, expect } from "vitest";
import {
  isExternalTimetableStop,
  isExternalTimetableSiteId,
  isExternalTimetableSource,
} from "./sourceClassification";

describe("sourceClassification helpers", () => {
  describe("isExternalTimetableStop", () => {
    it("returns true for Lumabryggan", () => {
      expect(isExternalTimetableStop("Lumabryggan")).toBe(true);
      expect(isExternalTimetableStop("Luma Brygga")).toBe(true); // legacy name
    });

    it("returns true for Barnängsbryggan", () => {
      expect(isExternalTimetableStop("Barnängsbryggan")).toBe(true);
      expect(isExternalTimetableStop("Barnängen")).toBe(true); // legacy name
    });

    it("returns true for Henriksdalsbryggan", () => {
      expect(isExternalTimetableStop("Henriksdalsbryggan")).toBe(true);
      expect(isExternalTimetableStop("Henriksdal")).toBe(true); // legacy name
    });

    it("returns true for stop names with accents normalized", () => {
      expect(isExternalTimetableStop("Barnanken")).toBe(true); // Stripped accent
    });

    it("returns false for SL bus stops", () => {
      expect(isExternalTimetableStop("Slussen")).toBe(false);
      expect(isExternalTimetableStop("Odenplan")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isExternalTimetableStop("")).toBe(false);
    });
  });

  describe("isExternalTimetableSiteId", () => {
    it("returns true for sjostad- prefix", () => {
      expect(isExternalTimetableSiteId("sjostad-luma")).toBe(true);
      expect(isExternalTimetableSiteId("sjostad-barn")).toBe(true);
      expect(isExternalTimetableSiteId("sjostad-henrik")).toBe(true);
    });

    it("returns false for numeric SL site IDs", () => {
      expect(isExternalTimetableSiteId("9001")).toBe(false);
      expect(isExternalTimetableSiteId("9002")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isExternalTimetableSiteId("")).toBe(false);
    });
  });

  describe("isExternalTimetableSource", () => {
    it("returns true for Sjostadstrafiken stop names", () => {
      expect(isExternalTimetableSource({ stopName: "Luma Brygga" })).toBe(true);
    });

    it("returns true for sjostad- site IDs", () => {
      expect(isExternalTimetableSource({ siteId: "sjostad-luma" })).toBe(true);
    });

    it("returns true when either stop name or site ID matches", () => {
      expect(
        isExternalTimetableSource({
          stopName: "Luma Brygga",
          siteId: "9001",
        }),
      ).toBe(true);
      expect(
        isExternalTimetableSource({
          stopName: "Odenplan",
          siteId: "sjostad-barn",
        }),
      ).toBe(true);
    });

    it("returns false when neither stop name nor site ID matches", () => {
      expect(
        isExternalTimetableSource({
          stopName: "Odenplan",
          siteId: "9001",
        }),
      ).toBe(false);
    });

    it("returns false for empty object", () => {
      expect(isExternalTimetableSource({})).toBe(false);
    });
  });
});
