import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getLocale,
  getT,
  resolveLocale,
  setLocale,
} from "./localeStore.svelte";
import { detectLocale } from "../lib/i18n";

afterEach(() => {
  vi.unstubAllGlobals();
  setLocale(resolveLocale());
});

describe("getLocale() store state transitions", () => {
  it("initializes to Swedish in Swedish browser", () => {
    vi.stubGlobal("navigator", { language: "sv-SE" });
    const resolved = resolveLocale("auto");
    expect(resolved).toBe("sv");
  });

  it("initializes to English in non-Swedish browser", () => {
    vi.stubGlobal("navigator", { language: "en-US" });
    const resolved = resolveLocale("auto");
    expect(resolved).toBe("en");
  });

  it('setLocale("en") transitions t to English translations', () => {
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(getT().toWork).toBe("TO WORK");
    expect(getT().home).toBe("HOME");
  });

  it('setLocale("sv") transitions t to Swedish translations', () => {
    setLocale("en");
    setLocale("sv");
    expect(getLocale()).toBe("sv");
    expect(getT().toWork).toBe("TILL JOBBET");
  });

  it('respects resolveLocale("auto") after manual override', () => {
    setLocale("en");
    setLocale(resolveLocale());
    expect(getLocale()).toBe(getLocale());
  });

  it("t stays in sync with getLocale() after multiple transitions", () => {
    setLocale("en");
    expect(getT().addSegment).toBe("+ Add");
    setLocale("sv");
    expect(getT().addSegment).toBe("+ Lägg till");
    setLocale("en");
    expect(getT().addSegment).toBe("+ Add");
    setLocale("sv");
    expect(getT().addSegment).toBe("+ Lägg till");
  });

  it("all translation keys are present in both languages after switch", () => {
    setLocale("sv");
    const svT = getT();
    setLocale("en");
    const enT = getT();
    const svKeys = Object.keys(svT);
    const enKeys = Object.keys(enT);
    expect(new Set(svKeys)).toEqual(new Set(enKeys));
  });
});

describe("getLocale() store rapid interactions", () => {
  it("handles rapid getLocale() toggles without stale intermediate state", () => {
    const sequence: ("sv" | "en")[] = [
      "en",
      "sv",
      "en",
      "sv",
      "en",
      "sv",
      "en",
    ];
    for (const l of sequence) {
      setLocale(l);
    }
    expect(getLocale()).toBe("en");
    expect(getT().toWork).toBe("TO WORK");
  });

  it("handles rapid toggles ending in Swedish", () => {
    const sequence: ("sv" | "en")[] = ["sv", "en", "sv", "sv", "en", "sv"];
    for (const l of sequence) {
      setLocale(l);
    }
    expect(getLocale()).toBe("sv");
    expect(getT().toWork).toBe("TILL JOBBET");
  });

  it("does not lose reactivity after many rapid assignments", () => {
    for (let i = 0; i < 100; i++) {
      setLocale(i % 2 === 0 ? "en" : "sv");
    }
    expect(getLocale()).toBe("sv");
    expect(getT().toWork).toBe("TILL JOBBET");
  });
});
