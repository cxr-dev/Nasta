import type { Departure } from "../types/departure";

/** Time window in milliseconds to consider departures as the same slot */
const DEPARTURE_SLOT_WINDOW_MS = 90_000; // 90 seconds

/**
 * Normalize direction text for deduplication.
 * Converts to lowercase and removes accents to match variations like:
 * "Norra Hammarbyhamnen" == "norra hammarbyhamnen"
 */
function normalizeDirection(direction: string | undefined): string {
  if (!direction) return "";
  return direction
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Get the time slot for a departure.
 * Uses expectedAt (live) if available, otherwise uses time.
 * Time slots are rounded to DEPARTURE_SLOT_WINDOW_MS windows.
 */
function getTimeSlot(dep: Departure): number {
  if (dep.expectedAt !== undefined) {
    // Round to nearest slot window
    return Math.floor(dep.expectedAt / DEPARTURE_SLOT_WINDOW_MS);
  }

  // Fallback to parsing time string for static timetable
  if (dep.time) {
    const [hours, minutes] = dep.time.split(":").map(Number);
    const totalMinutes = hours * 60 + minutes;
    return Math.floor(totalMinutes / (DEPARTURE_SLOT_WINDOW_MS / 60000));
  }

  return 0;
}

/**
 * Create a stable deduplication key for a departure.
 * Key structure: `siteId:line:normalizedDirection:timeSlot`
 *
 * This key uniquely identifies a departure slot. Multiple departures
 * (live vs predicted) with the same key are considered duplicates.
 */
export function createDepartureDeduplicationKey(
  siteId: string,
  dep: Departure,
): string {
  const normalizedDir = normalizeDirection(dep.directionText);
  const timeSlot = getTimeSlot(dep);

  return `${siteId}:${dep.line}:${normalizedDir}:${timeSlot}`;
}

/**
 * Deduplicate departures by stable key.
 * Keeps the first (live) version when duplicates exist,
 * removes subsequent (predicted) versions in the same slot.
 *
 * Returns deduplicated array preserving order.
 */
export function deduplicateDeparturesByKey(
  siteId: string,
  departures: Departure[],
): Departure[] {
  const seenKeys = new Set<string>();
  const result: Departure[] = [];

  for (const dep of departures) {
    const key = createDepartureDeduplicationKey(siteId, dep);

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      result.push(dep);
    }
    // else: skip duplicate - we already have this slot
  }

  return result;
}

/**
 * Deduplicate departures across multiple sites.
 * Useful when rendering full route with multiple stops.
 */
export function deduplicateDeparturesBySiteAndKey(
  departuresByStop: Map<string, Departure[]>,
): Map<string, Departure[]> {
  const result = new Map<string, Departure[]>();

  for (const [siteId, departures] of departuresByStop.entries()) {
    result.set(siteId, deduplicateDeparturesByKey(siteId, departures));
  }

  return result;
}
