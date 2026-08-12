const MIN_DISTANCE_RATIO = 0.24;
const MIN_VELOCITY = 0.65;

export function nearbyDragProgress(deltaX: number, width: number): number {
  if (deltaX >= 0 || width <= 0) return 0;
  return Math.min(1, Math.max(0, Math.abs(deltaX) / width));
}

export function shouldCompleteNearbySwipe(deltaX: number, velocityX: number, width: number): boolean {
  if (deltaX >= 0 || width <= 0) return false;
  return Math.abs(deltaX) >= width * MIN_DISTANCE_RATIO || velocityX <= -MIN_VELOCITY;
}
