import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToPlatformLifecycle } from "./platform";

describe("platform capabilities", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes lifecycle listeners when unsubscribed", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToPlatformLifecycle(callback);

    window.dispatchEvent(new Event("online"));
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
    window.dispatchEvent(new Event("online"));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("ignores the initial pageshow and reports persisted restores", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToPlatformLifecycle(callback);

    const initialShow = new Event("pageshow");
    Object.defineProperty(initialShow, "persisted", { value: false });
    window.dispatchEvent(initialShow);
    expect(callback).not.toHaveBeenCalled();

    const restoredShow = new Event("pageshow");
    Object.defineProperty(restoredShow, "persisted", { value: true });
    window.dispatchEvent(restoredShow);
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
