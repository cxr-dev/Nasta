export type PageSwipeDirection = "next" | "previous";
export type PageSwipeIntent = "pending" | "horizontal" | "vertical";
export interface PageSwipeSample {
  x: number;
  time: number;
}
export interface SpringState {
  position: number;
  velocity: number;
}

const INTENT_THRESHOLD = 10;
const HORIZONTAL_RATIO = 1.2;
const COMMIT_FRACTION = 0.33;
const COMMIT_VELOCITY = 0.45;
const VELOCITY_WINDOW_MS = 80;
const SPRING_OMEGA = 48 / 1_000;
const MAX_RELEASE_VELOCITY = 2.5;

export function pageSwipeIntent(deltaX: number, deltaY: number): PageSwipeIntent {
  const horizontal = Math.abs(deltaX);
  const vertical = Math.abs(deltaY);
  if (vertical >= INTENT_THRESHOLD && vertical > horizontal / HORIZONTAL_RATIO) return "vertical";
  if (horizontal >= INTENT_THRESHOLD && horizontal >= vertical * HORIZONTAL_RATIO) return "horizontal";
  return "pending";
}

export function pageSwipeDirection(deltaX: number, deltaY: number): PageSwipeDirection | null {
  if (pageSwipeIntent(deltaX, deltaY) !== "horizontal") return null;
  return deltaX < 0 ? "next" : "previous";
}

export function pageSwipeOffset(deltaX: number, hasTarget: boolean, width: number): number {
  if (!hasTarget) {
    const distance = Math.max(1, width);
    const resisted = distance * (1 - 1 / (Math.abs(deltaX) * 0.55 / distance + 1));
    return Math.sign(deltaX) * resisted;
  }
  return Math.max(-width, Math.min(width, deltaX));
}

export function shouldCompletePageSwipe(deltaX: number, velocityX: number, width: number): boolean {
  if (Math.abs(deltaX) >= width * COMMIT_FRACTION) return true;
  return deltaX !== 0 && deltaX * velocityX > 0 && Math.abs(velocityX) >= COMMIT_VELOCITY;
}

export function recentVelocity(samples: PageSwipeSample[]): number {
  const last = samples.at(-1);
  if (!last) return 0;
  const first = samples.find((sample) => sample.time >= last.time - VELOCITY_WINDOW_MS) ?? last;
  const elapsed = last.time - first.time;
  return elapsed > 0 ? (last.x - first.x) / elapsed : 0;
}

export function clampPageSwipeVelocity(velocity: number): number {
  return Math.max(-MAX_RELEASE_VELOCITY, Math.min(MAX_RELEASE_VELOCITY, velocity));
}

export function springStep(position: number, velocity: number, target: number, elapsedMs: number): SpringState {
  const elapsed = Math.max(0, elapsedMs);
  const offset = position - target;
  const coefficient = velocity + SPRING_OMEGA * offset;
  const decay = Math.exp(-SPRING_OMEGA * elapsed);
  return {
    position: target + (offset + coefficient * elapsed) * decay,
    velocity: (velocity - SPRING_OMEGA * coefficient * elapsed) * decay,
  };
}

export function boundedSpringStep(position: number, velocity: number, target: number, elapsedMs: number, width: number): SpringState {
  const next = springStep(position, clampPageSwipeVelocity(velocity), target, elapsedMs);
  const crossedTarget = target < 0 ? next.position <= target : target > 0 ? next.position >= target : false;
  if (crossedTarget) return { position: target, velocity: 0 };
  const limit = Math.max(1, width);
  return {
    position: Math.max(-limit, Math.min(limit, next.position)),
    velocity: next.velocity,
  };
}

export function springSettled(position: number, velocity: number, target: number): boolean {
  return Math.abs(position - target) <= 0.5 && Math.abs(velocity * 1_000) <= 10;
}
