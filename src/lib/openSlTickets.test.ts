import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isIOS, openSlTickets } from "./openSlTickets";

describe("isIOS", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true for iPhone user agents", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 });
    expect(isIOS()).toBe(true);
  });

  it("returns true for iPad user agents", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", platform: "iPad", maxTouchPoints: 5 });
    expect(isIOS()).toBe(true);
  });

  it("returns true for iPadOS in desktop mode (MacIntel + touch)", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 5 });
    expect(isIOS()).toBe(true);
  });

  it("returns false for Android user agents", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)", platform: "Linux armv8l", maxTouchPoints: 5 });
    expect(isIOS()).toBe(false);
  });

  it("returns false for desktop Chrome", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 });
    expect(isIOS()).toBe(false);
  });

  it("returns false for a Mac without touch (desktop Safari)", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 0 });
    expect(isIOS()).toBe(false);
  });
});

describe("openSlTickets", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens the https web fallback on non-iOS devices", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    openSlTickets();
    expect(openSpy).toHaveBeenCalledWith("https://sl.se/privat/min-biljett", "_blank", "noopener");
  });

  it("attempts the sl:// scheme on iOS", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 });
    const navigate = vi.fn();
    openSlTickets(navigate);
    expect(navigate).toHaveBeenCalledWith("sl://");
  });

  it("falls back to https when the app does not launch within the timeout", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 });
    const navigate = vi.fn();
    openSlTickets(navigate);
    expect(navigate).toHaveBeenNthCalledWith(1, "sl://");
    // Simulate the timeout firing with no visibility change (app not installed).
    vi.advanceTimersByTime(1500);
    expect(navigate).toHaveBeenNthCalledWith(2, "https://sl.se/privat/min-biljett");
  });

  it("does not fall back when the page is backgrounded (app launched)", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 });
    const navigate = vi.fn();
    openSlTickets(navigate);
    expect(navigate).toHaveBeenNthCalledWith(1, "sl://");
    // App launches → page hidden → fallback cancelled (listener is on window).
    window.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(1500);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("falls back to https immediately when navigating to the scheme throws", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 });
    // Throw only on the first (scheme) call; allow the fallback call through.
    const navigate = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error("blocked");
      });
    openSlTickets(navigate);
    expect(navigate).toHaveBeenCalledWith("https://sl.se/privat/min-biljett");
  });
});
