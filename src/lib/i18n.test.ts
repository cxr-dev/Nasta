import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getIntlLocale,
  formatStockholmTime,
  formatEventDateTime,
  formatEventRelativeShort,
  formatVenueOpenStatus,
  detectLocale,
  translations,
} from "../lib/i18n";
import type { Locale } from "../lib/i18n";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("i18n", () => {
  describe("getIntlLocale", () => {
    it('returns sv-SE for Swedish', () => {
      expect(getIntlLocale("sv")).toBe("sv-SE");
    });

    it('returns en-GB for English', () => {
      expect(getIntlLocale("en")).toBe("en-GB");
    });
  });

  describe("formatStockholmTime", () => {
    it("formats in Europe/Stockholm timezone", () => {
      // 2026-06-15 14:30 UTC = 16:30 Stockholm (UTC+2 in summer)
      const date = new Date("2026-06-15T14:30:00Z");
      const result = formatStockholmTime(date, "sv");
      expect(result).toBe("16:30");
    });

    it("respects locale formatting", () => {
      const date = new Date("2026-06-15T08:00:00Z");
      const sv = formatStockholmTime(date, "sv");
      const en = formatStockholmTime(date, "en");
      // Both should produce Stockholm-local time
      expect(sv).toBeTruthy();
      expect(en).toBeTruthy();
    });

    it("handles winter time (UTC+1)", () => {
      // 2026-01-15 12:00 UTC = 13:00 Stockholm (UTC+1 in winter)
      const date = new Date("2026-01-15T12:00:00Z");
      const result = formatStockholmTime(date, "sv");
      expect(result).toBe("13:00");
    });
  });

  describe("formatEventDateTime", () => {
    const sv = translations.sv;

    it("returns today label for same-day events", () => {
      // Create a date that is today in Stockholm
      const now = new Date();
      const iso = now.toISOString();
      const result = formatEventDateTime(iso, "sv", sv);
      expect(result).toContain(sv.today);
    });

    it("returns tomorrow label for next-day events", () => {
      // Tomorrow in Stockholm
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(14, 0, 0, 0);
      const result = formatEventDateTime(tomorrow.toISOString(), "sv", sv);
      expect(result).toContain(sv.tomorrow);
    });

    it("handles all-day events", () => {
      const allDay = "2026-07-15T00:00:00Z";
      const result = formatEventDateTime(allDay, "sv", sv);
      expect(result).toContain(sv.allDay);
    });

    it("returns emDash for undefined input", () => {
      const result = formatEventDateTime(undefined, "sv", sv);
      expect(result).toBe(sv.emDash);
    });

    it("returns raw string for unparseable dates", () => {
      const result = formatEventDateTime("not-a-date", "sv", sv);
      expect(result).toBe("not-a-date");
    });
  });

  describe("formatEventRelativeShort", () => {
    const sv = translations.sv;

    it("returns today for same-day events", () => {
      const now = new Date();
      const result = formatEventRelativeShort(now.toISOString(), "sv", sv);
      expect(result).toBe(sv.today);
    });

    it("returns tomorrow for next-day events", () => {
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(14, 0, 0, 0);
      const result = formatEventRelativeShort(tomorrow.toISOString(), "sv", sv);
      expect(result).toBe(sv.tomorrow);
    });

    it("returns emDash for undefined input", () => {
      expect(formatEventRelativeShort(undefined, "sv", sv)).toBe(sv.emDash);
    });

    it("returns emDash for unparseable dates", () => {
      expect(formatEventRelativeShort("bad-date", "sv", sv)).toBe(sv.emDash);
    });
  });

  describe("formatVenueOpenStatus", () => {
    const sv = translations.sv;

    it("returns openNow when venue is open with no next change", () => {
      const result = formatVenueOpenStatus(true, "", sv);
      expect(result).toBe(sv.openNow);
    });

    it("returns openNow + closesAt when venue is open with closing time", () => {
      const result = formatVenueOpenStatus(true, "23:00", sv);
      expect(result).toContain(sv.openNow);
      expect(result).toContain("23:00");
      expect(result).toContain(sv.closesAt.replace("{time}", "23:00"));
    });

    it("returns closed when venue is closed with no next change", () => {
      const result = formatVenueOpenStatus(false, "", sv);
      expect(result).toBe(sv.closed);
    });

    it("returns closed + opensAt when venue is closed with opening time", () => {
      const result = formatVenueOpenStatus(false, "08:00", sv);
      expect(result).toContain(sv.closed);
      expect(result).toContain("08:00");
      expect(result).toContain(sv.opensAt.replace("{time}", "08:00"));
    });

    it("works with English translations", () => {
      const en = translations.en;
      const result = formatVenueOpenStatus(true, "22:00", en);
      expect(result).toContain(en.openNow);
      expect(result).toContain(en.closesAt.replace("{time}", "22:00"));
    });
  });

  describe("detectLocale", () => {
    it("returns sv when navigator language starts with sv", () => {
      vi.stubGlobal("navigator", { language: "sv-SE" });
      expect(detectLocale()).toBe("sv");

      vi.stubGlobal("navigator", { language: "sv" });
      expect(detectLocale()).toBe("sv");
    });

    it("returns en for non-Swedish languages", () => {
      vi.stubGlobal("navigator", { language: "en-US" });
      expect(detectLocale()).toBe("en");

      vi.stubGlobal("navigator", { language: "fr" });
      expect(detectLocale()).toBe("en");
    });

    it("returns en when navigator is undefined", () => {
      vi.stubGlobal("navigator", undefined);
      expect(detectLocale()).toBe("en");
    });
  });
});
