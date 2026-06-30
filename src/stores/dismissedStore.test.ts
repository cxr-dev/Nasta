import { describe, it, expect, beforeEach, vi } from "vitest";
import { dismissedStore } from "./dismissedStore.svelte";

beforeEach(() => {
  localStorage.clear();
  // Clear all dismissed items by dismissing nothing — the store doesn't expose a "clear all"
  // but we can check what's in it and remove known keys. Simpler: reset localStorage
  // and rely on the store reading from empty localStorage on init.
  // Since _dismissed is module-level $state, we need to dismiss then re-import...
  // Actually: we'll dismiss known keys then test fresh.
});

describe("dismissedStore", () => {
  describe("dismiss + isDismissed", () => {
    it("marks a key as dismissed", () => {
      dismissedStore.dismiss("dev-123");
      expect(dismissedStore.isDismissed("dev-123")).toBe(true);
    });

    it("returns false for a non-dismissed key", () => {
      expect(dismissedStore.isDismissed("never-dismissed")).toBe(false);
    });

    it("is idempotent — dismissing twice does nothing extra", () => {
      dismissedStore.dismiss("idem-key");
      dismissedStore.dismiss("idem-key");
      expect(dismissedStore.isDismissed("idem-key")).toBe(true);
    });

    it("distinguishes between different keys", () => {
      dismissedStore.dismiss("key-A");
      expect(dismissedStore.isDismissed("key-A")).toBe(true);
      expect(dismissedStore.isDismissed("key-B")).toBe(false);
    });
  });

  describe("dismissMessage + isMessageDismissed", () => {
    it("marks a message text as dismissed", () => {
      dismissedStore.dismissMessage("Banarbete mellan Slussen och Gamla Stan");
      expect(dismissedStore.isMessageDismissed("Banarbete mellan Slussen och Gamla Stan")).toBe(true);
    });

    it("returns false for a different message", () => {
      dismissedStore.dismissMessage("Message A");
      expect(dismissedStore.isMessageDismissed("Message B")).toBe(false);
    });

    it("is idempotent for same message text", () => {
      dismissedStore.dismissMessage("Spårfel");
      dismissedStore.dismissMessage("Spårfel");
      expect(dismissedStore.isMessageDismissed("Spårfel")).toBe(true);
    });

    it("handles empty string", () => {
      dismissedStore.dismissMessage("");
      expect(dismissedStore.isMessageDismissed("")).toBe(true);
    });

    it("handles messages with special characters", () => {
      const msg = "🚧 Signalfel — 10–20 min försening";
      dismissedStore.dismissMessage(msg);
      expect(dismissedStore.isMessageDismissed(msg)).toBe(true);
    });
  });

  describe("subscribe", () => {
    it("calls subscriber immediately with current state", () => {
      const fn = vi.fn();
      const unsub = dismissedStore.subscribe(fn);
      expect(fn).toHaveBeenCalledTimes(1);
      unsub();
    });

    it("notifies subscribers when a key is dismissed", () => {
      const fn = vi.fn();
      const unsub = dismissedStore.subscribe(fn);
      fn.mockClear(); // clear the initial call

      dismissedStore.dismiss("notify-key");
      expect(fn).toHaveBeenCalledTimes(1);
      unsub();
    });

    it("unsubscribe stops future notifications", () => {
      const fn = vi.fn();
      const unsub = dismissedStore.subscribe(fn);
      fn.mockClear();
      unsub();

      dismissedStore.dismiss("after-unsub");
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("persistence", () => {
    it("persists dismissed keys to localStorage", () => {
      dismissedStore.dismiss("persist-key");
      const raw = localStorage.getItem("nasta-dismissed-deviations");
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed).toContain("persist-key");
    });

    it("persists dismissed messages to localStorage", () => {
      dismissedStore.dismissMessage("Persisted message");
      const raw = localStorage.getItem("nasta-dismissed-deviations");
      expect(raw).not.toBeNull();
      const parsed: string[] = JSON.parse(raw!);
      // messageKey produces "msg:${hash}" format
      const hasMessageKey = parsed.some((k) => k.startsWith("msg:"));
      expect(hasMessageKey).toBe(true);
    });
  });
});
