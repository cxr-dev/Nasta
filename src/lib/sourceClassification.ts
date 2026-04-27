/**
 * Shared classification helper for distinguishing SL sources from timetable-only (Sjostadstrafiken) sources.
 * Used across search, refresh, deviations, and route hydration.
 */

const SJOSTAD_STOP_KEYS = ["luma", "barn", "henrik"];
const SJOSTAD_SITE_PREFIX = "sjostad-";

/**
 * Check if a stop name represents a Sjostadstrafiken ferry stop.
 * Normalizes accents for matching.
 */
export function isExternalTimetableStop(stopName: string): boolean {
  if (!stopName) return false;
  const normalized = stopName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return SJOSTAD_STOP_KEYS.some((key) => normalized.includes(key));
}

/**
 * Check if a site ID represents a Sjostadstrafiken stop.
 * Synthetic site IDs use the 'sjostad-' prefix.
 */
export function isExternalTimetableSiteId(siteId: string | number): boolean {
  if (!siteId) return false;
  const normalized = String(siteId).toLowerCase();
  return normalized.startsWith(SJOSTAD_SITE_PREFIX);
}

/**
 * Check if a source (either stop name or site ID) is a Sjostadstrafiken timetable-only source.
 * Returns true if either the stop name OR site ID matches the criteria.
 */
export function isExternalTimetableSource(source: {
  stopName?: string;
  siteId?: string | number;
}): boolean {
  return (
    (source.stopName ? isExternalTimetableStop(source.stopName) : false) ||
    (source.siteId ? isExternalTimetableSiteId(source.siteId) : false)
  );
}
