/**
 * Timetable cache — learns scheduled departure patterns from live API responses
 * and can predict future departures even when the live API window is empty.
 *
 * Swedish transit timetables change ~2x/year (June + December). Cache TTL is 30 days.
 * Night service (00:00–03:59) is stored under the previous transit day with
 * transitMinutes >= 1440 (e.g. 00:30 → 1470), so weekly patterns stay contiguous.
 */

import type { TransportType } from '../types/route';
import { parseSlTimestamp } from './slApi';

const STORAGE_KEY = 'sl_timetable_v1';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface PredictedDeparture {
  line: string;
  lineName: string;
  destination: string;
  directionText: string;
  transportType: TransportType;
  minutes: number;
  time: string;
  expectedAt: number;
  predicted: true;
}

interface RouteSchedule {
  line: string;
  lineName: string;
  destination: string;
  directionText: string;
  transportType: TransportType;
  /** Sorted minutes since transit-midnight (04:00 Stockholm), per day-of-week (0=Sun). */
  days: Partial<Record<number, number[]>>;
  updatedAt: number;
}

type TimetableStore = Record<string, RouteSchedule>; // key = "siteId|line|directionText"

function loadStore(): TimetableStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TimetableStore) : {};
  } catch {
    return {};
  }
}

function saveStore(store: TimetableStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage quota — silently ignore
  }
}

function getStockholmComponents(ts: number): { dayOfWeek: number; hour: number; minute: number } {
  const d = new Date(ts);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Stockholm',
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(d);

  const weekdayMap: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
  };
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? 'Monday';
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0);

  return { dayOfWeek: weekdayMap[weekday] ?? 1, hour, minute };
}

/** Convert an absolute timestamp to transit-day / transit-minutes.
 *  Transit day runs 04:00–27:59 Stockholm time (night service stays on the same transit day). */
function toTransitTime(ts: number): { transitDay: number; transitMinutes: number } {
  const { dayOfWeek, hour, minute } = getStockholmComponents(ts);
  const minutes = hour * 60 + minute;

  if (hour < 4) {
    // Night service — belongs to the previous transit day
    return { transitDay: (dayOfWeek + 6) % 7, transitMinutes: 24 * 60 + minutes };
  }
  return { transitDay: dayOfWeek, transitMinutes: minutes };
}

/** Get the Unix timestamp for 00:00 Stockholm time on the calendar day containing ts.
 *  Stockholm is always UTC+1 or UTC+2 (whole-hour offsets), so minute/second/ms
 *  components are identical to UTC — we can safely subtract Stockholm time-of-day
 *  directly from the UTC millisecond timestamp to reach Stockholm midnight. */
function getStockholmMidnightMs(ts: number): number {
  const { hour, minute } = getStockholmComponents(ts);
  const d = new Date(ts);
  return (
    ts
    - hour * 3_600_000
    - minute * 60_000
    - d.getUTCSeconds() * 1_000
    - d.getUTCMilliseconds()
  );
}

function formatTransitMinutes(transitMinutes: number): string {
  const actual = transitMinutes % (24 * 60); // night service wraps to real clock time
  const h = Math.floor(actual / 60);
  const m = actual % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function inferTransportType(mode?: string): TransportType {
  switch (mode?.toLowerCase()) {
    case 'bus': return 'bus';
    case 'train': case 'rail': return 'train';
    case 'metro': return 'metro';
    case 'boat': case 'ferry': return 'boat';
    default: return 'bus';
  }
}

/**
 * Feed raw SL API departure objects into the timetable cache.
 * Call this every time a departures fetch succeeds.
 */
export function learnFromApiResponse(siteId: string, rawDepartures: unknown[]): void {
  if (!rawDepartures.length) return;
  const store = loadStore();
  let dirty = false;

  for (const dep of rawDepartures as Record<string, any>[]) {
    const scheduledStr = dep.scheduled || dep.expected;
    if (!scheduledStr) continue;

    const line: string = dep.line?.designation || dep.line?.name || '';
    const directionText: string = dep.direction || '';
    if (!line || !directionText) continue;

    const scheduledTs = parseSlTimestamp(scheduledStr);
    if (isNaN(scheduledTs)) continue;

    const { transitDay, transitMinutes } = toTransitTime(scheduledTs);
    const storeKey = `${siteId}|${line}|${directionText}`;

    const existing: RouteSchedule = store[storeKey] ?? {
      line,
      lineName: dep.line?.name || line,
      destination: dep.destination || '',
      directionText,
      transportType: inferTransportType(dep.line?.transportMode),
      days: {},
      updatedAt: 0,
    };

    const dayTimes = existing.days[transitDay] ?? [];
    if (!dayTimes.includes(transitMinutes)) {
      dayTimes.push(transitMinutes);
      dayTimes.sort((a, b) => a - b);
      existing.days[transitDay] = dayTimes;
      dirty = true;
    }
    existing.updatedAt = Date.now();
    store[storeKey] = existing;
  }

  if (dirty) saveStore(store);
}

/** Maximum minutes ahead to show predicted departures.
 * Beyond this, it's likely stale timetable data, not real-time. */
const MAX_PREDICTED_MINUTES = 6 * 60; // 6 hours

/**
 * Returns up to `count` predicted upcoming departures for a route,
 * derived entirely from the cached timetable. Returns [] if no cache exists.
 * Predicted departures beyond MAX_PREDICTED_MINUTES are filtered out.
 */
export function getPredictedDepartures(
  siteId: string,
  line: string,
  directionText: string,
  count: number,
): PredictedDeparture[] {
  const store = loadStore();
  const storeKey = `${siteId}|${line}|${directionText}`;
  const entry = store[storeKey];

  if (!entry || Date.now() - entry.updatedAt > CACHE_TTL_MS) return [];

  const now = Date.now();
  const { transitDay: todayTransitDay, transitMinutes: nowTransitMinutes } = toTransitTime(now);
  const todayCalendarMidnight = getStockholmMidnightMs(now);

  const results: PredictedDeparture[] = [];

  // Scan up to 14 days forward to fill `count` slots (handles sparse weekly schedules)
  for (let dayOffset = 0; dayOffset < 14 && results.length < count; dayOffset++) {
    const transitDay = (todayTransitDay + dayOffset) % 7;
    const times = entry.days[transitDay];
    if (!times?.length) continue;

    for (const transitMinutes of times) {
      if (dayOffset === 0 && transitMinutes <= nowTransitMinutes) continue;

      // Compute absolute timestamp.
      // transitMinutes >= 1440 means night service: add to next calendar midnight.
      const calendarDayOffset = transitMinutes >= 24 * 60 ? dayOffset + 1 : dayOffset;
      const calendarMidnight = todayCalendarMidnight + calendarDayOffset * 86_400_000;
      const departureTs = calendarMidnight + (transitMinutes % (24 * 60)) * 60_000;

      if (departureTs <= now) continue;

      // Filter out departures too far in the future — likely stale timetable data
      const minutesAhead = Math.floor((departureTs - now) / 60_000);
      if (minutesAhead > MAX_PREDICTED_MINUTES) continue;

      results.push({
        line: entry.line,
        lineName: entry.lineName,
        destination: entry.destination,
        directionText: entry.directionText,
        transportType: entry.transportType,
        minutes: minutesAhead,
        time: formatTransitMinutes(transitMinutes),
        expectedAt: departureTs,
        predicted: true,
      });

      if (results.length >= count) break;
    }
  }

  return results;
}

/**
 * All unique routes ever seen at a stop (for SegmentSearch line discovery).
 * Returns routes whose cache entry is still within TTL.
 */
export function getKnownRoutes(siteId: string): Array<{
  line: string;
  lineName: string;
  destination: string;
  directionText: string;
  transportType: TransportType;
}> {
  const store = loadStore();
  const prefix = `${siteId}|`;
  const now = Date.now();
  return Object.entries(store)
    .filter(([key, entry]) => key.startsWith(prefix) && now - entry.updatedAt <= CACHE_TTL_MS)
    .map(([, entry]) => ({
      line: entry.line,
      lineName: entry.lineName,
      destination: entry.destination,
      directionText: entry.directionText,
      transportType: entry.transportType,
    }));
}
