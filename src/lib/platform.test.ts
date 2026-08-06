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
});
