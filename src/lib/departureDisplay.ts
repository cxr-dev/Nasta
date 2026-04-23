import type { Departure } from '../types/departure';
import { locale } from '../stores/localeStore';
import { get } from 'svelte/store';

/** Get the locale-aware "now" text */
function getNowText(): string {
  const currentLocale = get(locale);
  return currentLocale === 'sv' ? 'Nu' : 'Now';
}

const DUPLICATE_WINDOW_MS = 90_000;

export function getLiveMinutes(dep: Departure, now: number): number {
  if (dep.expectedAt !== undefined) {
    return Math.max(0, Math.floor((dep.expectedAt - now) / 60000));
  }
  return dep.minutes;
}

export function formatDepartureTime(dep: Departure, now: number): string {
  // Priority 1: Live calculation from expectedAt timestamp (5-second clock uses this)
  if (dep.expectedAt) {
    const mins = getLiveMinutes(dep, now);

    if (mins <= 0) return getNowText();
    if (mins === 1) return '1 min';
    if (mins < 60) return `${mins} min`;

    // Over 60 min: show clock time from expectedAt
    const date = new Date(dep.expectedAt);
    return date.toLocaleTimeString('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Stockholm',
    });
  }

  // Priority 2: Static fallback - use display from API (for departures without live timestamp)
  if (dep.display) {
    return dep.display;
  }

  // Priority 3: Fallback to dep.minutes / time for static timetable
  if (dep.time) return dep.time;

  // Final fallback: calculate from dep.minutes
  const mins = dep.minutes ?? 0;
  if (mins <= 0) return getNowText();
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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
