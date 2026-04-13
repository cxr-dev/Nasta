import type { Departure } from '../types/departure';

const DUPLICATE_WINDOW_MS = 90_000;

export function getLiveMinutes(dep: Departure, now: number): number {
  if (dep.expectedAt !== undefined) {
    return Math.max(0, Math.floor((dep.expectedAt - now) / 60000));
  }
  return dep.minutes;
}

function isDuplicatePrediction(live: Departure, predicted: Departure): boolean {
  if (live.expectedAt !== undefined && predicted.expectedAt !== undefined) {
    return Math.abs(predicted.expectedAt - live.expectedAt) <= DUPLICATE_WINDOW_MS;
  }

  return Boolean(live.time && predicted.time && live.time === predicted.time);
}

export function mergeDeparturesWithPredictions(
  live: Departure[],
  predicted: Departure[],
  maxCount = 5
): Departure[] {
  if (!predicted.length) return live.slice(0, maxCount);

  const fresh = predicted.filter(p => !live.some(l => isDuplicatePrediction(l, p)));

  return [...live, ...fresh]
    .sort((a, b) => {
      const aHasExpected = a.expectedAt !== undefined;
      const bHasExpected = b.expectedAt !== undefined;

      if (aHasExpected && bHasExpected) {
        return a.expectedAt! - b.expectedAt!;
      }
      if (aHasExpected !== bHasExpected) {
        return aHasExpected ? 1 : -1;
      }

      return a.time.localeCompare(b.time);
    })
    .slice(0, maxCount);
}
