/**
 * Timetable cache — learns scheduled departure patterns from live API responses
 * and can predict future departures even when the live API window is empty.
 *
 * Swedish transit timetables change ~2x/year (June + December). Cache TTL is 30 days.
 * Night service (00:00–03:59) is stored under the previous transit day with
 * transitMinutes >= 1440 (e.g. 00:30 → 1470), so weekly patterns stay contiguous.
 */

import type { TransportType } from "../types/page";
import { getTransportType } from "../lib/getTransportType";
import { parseSlTimestamp } from "./slApi";
import { persistentCache } from "./persistentCache";

const CACHE_KEY = "timetable:v1";
const LOCAL_STORAGE_KEY = "sl_timetable_v1";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface PredictedDeparture {
  line: string;
  lineName: string;
  destination: string;
  direction_code: number;
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
  direction_code: number;
  transportType: TransportType;
  /** Sorted minutes since transit-midnight (04:00 Stockholm), per day-of-week (0=Sun). */
  days: Partial<Record<number, number[]>>;
  updatedAt: number;
}

type TimetableStore = Record<string, RouteSchedule>; // key = "siteId|line|direction_code"

let storeLoaded = false;
let inMemoryStore: TimetableStore = {};

async function ensureStoreLoaded(): Promise<void> {
  if (storeLoaded) return;
  await persistentCache.migrateFromLocalStorage(LOCAL_STORAGE_KEY, CACHE_KEY, CACHE_TTL_MS);
  const data = await persistentCache.get(CACHE_KEY);
  inMemoryStore = (data as TimetableStore) || {};
  storeLoaded = true;
}

async function saveStore(): Promise<void> {
  await persistentCache.set(CACHE_KEY, inMemoryStore, CACHE_TTL_MS);
}

function getStockholmComponents(ts: number): {
  dayOfWeek: number;
  hour: number;
  minute: number;
} {
  const d = new Date(ts);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Stockholm",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(d);

  const weekdayMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Monday";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);

  return { dayOfWeek: weekdayMap[weekday] ?? 1, hour, minute };
}

/** Convert an absolute timestamp to transit-day / transit-minutes.
 *  Transit day runs 04:00–27:59 Stockholm time (night service stays on the same transit day).
 */
function toTransitTime(ts: number): {
  transitDay: number;
  transitMinutes: number;
} {
  const { dayOfWeek, hour, minute } = getStockholmComponents(ts);
  const minutes = hour * 60 + minute;

  if (hour < 4) {
    // Night service — belongs to the previous transit day
    return {
      transitDay: (dayOfWeek + 6) % 7,
      transitMinutes: 24 * 60 + minutes,
    };
  }
  return { transitDay: dayOfWeek, transitMinutes: minutes };
}

/** Get the Unix timestamp for 00:00 Stockholm time on the calendar day containing ts.
 *  Stockholm is always UTC+1 or UTC+2 (whole-hour offsets), so minute/second/ms
 *  components are identical to UTC — we can safely subtract Stockholm time-of-day
 *  directly from the UTC millisecond timestamp to reach Stockholm midnight.
 */
function getStockholmMidnightMs(ts: number): number {
  const { hour, minute } = getStockholmComponents(ts);
  const d = new Date(ts);
  return (
    ts -
    hour * 3_600_000 -
    minute * 60_000 -
    d.getUTCSeconds() * 1_000 -
    d.getUTCMilliseconds()
  );
}

function formatTransitMinutes(transitMinutes: number): string {
  const actual = transitMinutes % (24 * 60); // night service wraps to real clock time
  const h = Math.floor(actual / 60);
  const m = actual % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}


/**
 * Feed raw SL API departure objects into the timetable cache.
 * Call this every time a departures fetch succeeds.
 */
export async function learnFromApiResponse(
  siteId: string,
  rawDepartures: unknown[],
): Promise<void> {
  if (!rawDepartures.length) return;
  await ensureStoreLoaded();
  let dirty = false;

  for (const dep of rawDepartures as Record<string, any>[]) {
    const scheduledStr = dep.scheduled || dep.expected;
    if (!scheduledStr) continue;

    const line: string = dep.line?.designation || dep.line?.name || "";
    const direction_code: number = dep.direction_code ?? 0;
    if (!line || direction_code === undefined) continue;

    const scheduledTs = parseSlTimestamp(scheduledStr);
    if (isNaN(scheduledTs)) continue;

    const { transitDay, transitMinutes } = toTransitTime(scheduledTs);
    const storeKey = `${siteId}|${line}|${direction_code}`;

    const existing: RouteSchedule = inMemoryStore[storeKey] ?? {
      line,
      lineName: dep.line?.name || line,
      destination: dep.destination || "",
      direction_code,
      transportType: getTransportType(dep.line?.transport_mode),
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
    inMemoryStore[storeKey] = existing;
  }

  if (dirty) await saveStore();
}

/** Maximum minutes ahead to show predicted departures.
 * Beyond this, it's likely stale timetable data, not real-time.
 */
const MAX_PREDICTED_MINUTES = 6 * 60; // 6 hours

/**
 * Returns up to `count` predicted upcoming departures for a route,
 * derived entirely from the cached timetable. Returns [] if no cache exists.
 * Predicted departures beyond MAX_PREDICTED_MINUTES are filtered out.
 */
export async function getPredictedDepartures(
  siteId: string,
  line: string,
  direction_code: number,
  count: number,
): Promise<PredictedDeparture[]> {
  await ensureStoreLoaded();
  const storeKey = `${siteId}|${line}|${direction_code}`;
  const entry = inMemoryStore[storeKey];

  if (!entry || Date.now() - entry.updatedAt > CACHE_TTL_MS) return [];

  const now = Date.now();
  const { transitDay: todayTransitDay, transitMinutes: nowTransitMinutes } =
    toTransitTime(now);
  let todayCalendarMidnight = getStockholmMidnightMs(now);
  // When now is in night-service (00:00–03:59 Stockholm), the transit-day base
  // is the previous calendar day's midnight. Adjust to keep midnight aligned
  // with the transit day that "now" belongs to.
  if (nowTransitMinutes >= 24 * 60) {
    todayCalendarMidnight -= 86_400_000;
  }

  const results: PredictedDeparture[] = [];

  // Scan up to 14 days forward to fill `count` slots (handles sparse weekly schedules)
  for (
    let dayOffset = 0;
    dayOffset < 14 && results.length < count;
    dayOffset++
  ) {
    const transitDay = (todayTransitDay + dayOffset) % 7;
    const times = entry.days[transitDay];
    if (!times?.length) continue;

    for (const transitMinutes of times) {
      if (dayOffset === 0 && transitMinutes <= nowTransitMinutes) continue;

      // Compute absolute timestamp.
      // transitMinutes >= 1440 means night service: add to next calendar midnight.
      const calendarDayOffset =
        transitMinutes >= 24 * 60 ? dayOffset + 1 : dayOffset;
      const calendarMidnight =
        todayCalendarMidnight + calendarDayOffset * 86_400_000;
      const departureTs =
        calendarMidnight + (transitMinutes % (24 * 60)) * 60_000;

      if (departureTs <= now) continue;

      // Filter out departures too far in the future — likely stale timetable data
      const minutesAhead = Math.floor((departureTs - now) / 60_000);
      if (minutesAhead > MAX_PREDICTED_MINUTES) continue;

      results.push({
        line: entry.line,
        lineName: entry.lineName,
        destination: entry.destination,
        direction_code: entry.direction_code,
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
 * Returns the single next scheduled departure for a route from the cached timetable,
 * with NO time-horizon cap. Used for the "sleeping" state when no live/predicted
 * departures exist — finds tomorrow's (or later) first departure.
 * Returns null if no cache entry exists for this route.
 */
export async function getNextScheduledDeparture(
  siteId: string,
  line: string,
  direction_code: number,
): Promise<PredictedDeparture | null> {
  await ensureStoreLoaded();
  const storeKey = `${siteId}|${line}|${direction_code}`;
  const entry = inMemoryStore[storeKey];

  if (!entry || Date.now() - entry.updatedAt > CACHE_TTL_MS) return null;

  const now = Date.now();
  const { transitDay: todayTransitDay, transitMinutes: nowTransitMinutes } =
    toTransitTime(now);
  let todayCalendarMidnight = getStockholmMidnightMs(now);
  if (nowTransitMinutes >= 24 * 60) {
    todayCalendarMidnight -= 86_400_000;
  }

  // Scan up to 14 days forward — no minutes-ahead cap, just find the next slot
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const transitDay = (todayTransitDay + dayOffset) % 7;
    const times = entry.days[transitDay];
    if (!times?.length) continue;

    for (const transitMinutes of times) {
      if (dayOffset === 0 && transitMinutes <= nowTransitMinutes) continue;

      const calendarDayOffset = transitMinutes >= 24 * 60 ? dayOffset + 1 : dayOffset;
      const calendarMidnight = todayCalendarMidnight + calendarDayOffset * 86_400_000;
      const departureTs = calendarMidnight + (transitMinutes % (24 * 60)) * 60_000;

      if (departureTs <= now) continue;

      const minutesAhead = Math.floor((departureTs - now) / 60_000);
      return {
        line: entry.line,
        lineName: entry.lineName,
        destination: entry.destination,
        direction_code: entry.direction_code,
        transportType: entry.transportType,
        minutes: minutesAhead,
        time: formatTransitMinutes(transitMinutes),
        expectedAt: departureTs,
        predicted: true,
      };
    }
  }

  return null;
}

/**
 * All unique routes ever seen at a stop (for SegmentSearch line discovery).
 * Returns routes whose cache entry is still within TTL.
 */
export async function getKnownRoutes(siteId: string): Promise<Array<{
  line: string;
  lineName: string;
  destination: string;
  direction_code: number;
  transportType: TransportType;
}>> {
  await ensureStoreLoaded();
  const prefix = `${siteId}|`;
  const now = Date.now();
  return Object.entries(inMemoryStore)
    .filter(
      ([key, entry]) =>
        key.startsWith(prefix) && now - entry.updatedAt <= CACHE_TTL_MS,
    )
    .map(([, entry]) => ({
      line: entry.line,
      lineName: entry.lineName,
      destination: entry.destination,
      direction_code: entry.direction_code,
      transportType: entry.transportType,
    }));
}
