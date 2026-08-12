import { describe, expect, it } from 'vitest';
import { nearbyDragProgress, shouldCompleteNearbySwipe } from './nearbyNavigation';

describe('nearby utility navigation', () => {
  it('maps a left entry drag to progress across the app width', () => {
    expect(nearbyDragProgress(-160, 400)).toBeCloseTo(0.4);
    expect(nearbyDragProgress(20, 400)).toBe(0);
    expect(nearbyDragProgress(-800, 400)).toBe(1);
  });

  it('completes a swipe after distance or velocity crosses the threshold', () => {
    expect(shouldCompleteNearbySwipe(-180, 0, 400)).toBe(true);
    expect(shouldCompleteNearbySwipe(-80, 0, 400)).toBe(false);
    expect(shouldCompleteNearbySwipe(-40, -0.8, 400)).toBe(true);
    expect(shouldCompleteNearbySwipe(120, 0, 400)).toBe(false);
  });
});
