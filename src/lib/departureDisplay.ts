import type { Departure } from "../types/departure";
import { DEPARTURE_SLOT_WINDOW_MS } from "./departureDeduplication";
import { getLocale } from "../stores/localeStore.svelte";

/** Get the locale-aware "now" text */
function getNowText(): string {
  const currentLocale = getLocale();
  return currentLocale === "sv" ? "Nu" : "Now";
}

const MINUTES_TO_CLOCK_THRESHOLD = 60;
const NOW_THRESHOLD_MS = 45_000;
const IMMINENT_THRESHOLD_MS = 2 * 60_000;
const SOON_THRESHOLD_MS = 5 * 60_000;

export type DepartureUrgency = 'now' | 'imminent' | 'soon' | 'later';

export type EffectiveDisruption = 'normal' | 'affected' | 'critical';

function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  });
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return getNowText();
  if (minutes === 1) return "1 min";
  return `${minutes} min`;
}

export function getLiveMinutes(dep: Departure, now: number): number {
  if (dep.expectedAt !== undefined) {
    return Math.max(0, Math.floor((dep.expectedAt - now) / 60000));
  }
  return dep.minutes;
}

/**
 * Classify time proximity independently from service health.
 * The result is deliberately numeric so locale/display copy can never alter
 * the visual state of a departure.
 */
export function getDepartureUrgency(dep: Departure, now: number): DepartureUrgency {
  if (dep.expectedAt !== undefined) {
    const remainingMs = dep.expectedAt - now;
    if (remainingMs <= NOW_THRESHOLD_MS) return 'now';
    if (remainingMs <= IMMINENT_THRESHOLD_MS) return 'imminent';
    if (remainingMs <= SOON_THRESHOLD_MS) return 'soon';
    return 'later';
  }

  if (dep.minutes <= 0) return 'now';
  if (dep.minutes <= 2) return 'imminent';
  if (dep.minutes <= 5) return 'soon';
  return 'later';
}

/** A dismissed/hidden disruption must not continue to color a departure. */
export function getEffectiveDisruption(
  severity: EffectiveDisruption,
  visibleMessageCount: number,
): EffectiveDisruption {
  return visibleMessageCount > 0 ? severity : 'normal';
}

export function formatDepartureTime(dep: Departure, now: number): string {
  const mins = getLiveMinutes(dep, now);

  if (mins <= MINUTES_TO_CLOCK_THRESHOLD) {
    return formatMinutes(mins);
  }

  if (dep.expectedAt !== undefined) {
    return formatClockTime(dep.expectedAt);
  }

  if (dep.display) {
    return dep.display;
  }

  if (dep.time) return dep.time;

  return formatMinutes(mins);
}

function isDuplicatePrediction(live: Departure, predicted: Departure): boolean {
  if (live.expectedAt !== undefined && predicted.expectedAt !== undefined) {
    return (
      Math.abs(predicted.expectedAt - live.expectedAt) <= DEPARTURE_SLOT_WINDOW_MS
    );
  }

  return Boolean(live.time && predicted.time && live.time === predicted.time);
}

export function mergeDeparturesWithPredictions(
  live: Departure[],
  predicted: Departure[],
  maxCount = 5,
): Departure[] {
  if (!predicted.length) return live.slice(0, maxCount);

  const fresh = predicted.filter(
    (p) => !live.some((l) => isDuplicatePrediction(l, p)),
  );

  return [...live, ...fresh]
    .sort((a, b) => {
      const aHasExpected = a.expectedAt !== undefined;
      const bHasExpected = b.expectedAt !== undefined;

      if (aHasExpected && bHasExpected) {
        return a.expectedAt! - b.expectedAt!;
      }

      // When one has expectedAt and one doesn't, sort by time as fallback
      if (aHasExpected !== bHasExpected) {
        return a.time.localeCompare(b.time);
      }

      return a.time.localeCompare(b.time);
    })
    .slice(0, maxCount);
}
