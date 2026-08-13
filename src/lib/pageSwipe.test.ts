import { describe, expect, it } from "vitest";
import {
  pageSwipeIntent,
  pageSwipeDirection,
  pageSwipeOffset,
  recentVelocity,
  springStep,
  springSettled,
  shouldCompletePageSwipe,
} from "./pageSwipe";

describe("page swipe geometry", () => {
  it("only locks after horizontal intent is clear", () => {
    expect(pageSwipeDirection(8, 0)).toBeNull();
    expect(pageSwipeDirection(14, 14)).toBeNull();
    expect(pageSwipeDirection(-20, 8)).toBe("next");
    expect(pageSwipeDirection(20, 8)).toBe("previous");
  });

  it("permanently yields a pending gesture to vertical scrolling", () => {
    expect(pageSwipeIntent(8, 14)).toBe("vertical");
    expect(pageSwipeIntent(8, 2)).toBe("pending");
    expect(pageSwipeIntent(-14, 5)).toBe("horizontal");
  });

  it("applies resistance at a page boundary", () => {
    expect(pageSwipeOffset(-120, false, 390)).toBeCloseTo(-56.45, 2);
    expect(pageSwipeOffset(120, false, 390)).toBeCloseTo(56.45, 2);
    expect(pageSwipeOffset(-120, true, 390)).toBe(-120);
  });

  it("commits by distance or same-direction velocity", () => {
    expect(shouldCompletePageSwipe(-130, -0.1, 390)).toBe(true);
    expect(shouldCompletePageSwipe(-40, -0.5, 390)).toBe(true);
    expect(shouldCompletePageSwipe(-40, 0.5, 390)).toBe(false);
    expect(shouldCompletePageSwipe(-40, -0.1, 390)).toBe(false);
  });

  it("uses only the final 80ms of movement to classify a flick", () => {
    expect(recentVelocity([
      { x: 0, time: 0 },
      { x: -24, time: 240 },
      { x: -96, time: 300 },
    ])).toBeCloseTo(-1.2, 3);
  });

  it("integrates a critically damped settle without overshooting", () => {
    let position = 0;
    let velocity = -0.8;
    for (let elapsed = 0; elapsed < 1_000; elapsed += 16) {
      ({ position, velocity } = springStep(position, velocity, -390, 16));
    }

    expect(position).toBeCloseTo(-390, 1);
    expect(velocity).toBeCloseTo(0, 1);
    expect(springSettled(position, velocity, -390)).toBe(true);
  });
});
