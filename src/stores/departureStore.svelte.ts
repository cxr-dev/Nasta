import type { Departure } from "../types/departure";
import { getCachedScheduleSnapshot } from "../services/scheduleCache";
import { transitService } from "../providers/init";
import { toEntityId, toLegacyDeparture } from "../lib/departureConverter";

export type DepartureFreshness = "live" | "recent" | "stale" | "timetable" | "unavailable";

export interface DepartureStatus {
  freshness: DepartureFreshness;
  sourceUpdatedAt?: number;
  canRetry: boolean;
}

export interface SegmentCacheMeta {
  line: string;
  direction_code: number;
  destId?: string;
}

let _data = $state<Map<string, Departure[]>>(new Map());
let _stopDeviations = $state<Map<string, any[]>>(new Map());
let _isLoading = $state(false);
let _isUpdating = $state(false);
let _statuses = $state<Map<string, DepartureStatus>>(new Map());

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let stopNamesMap = new Map<string, string>();
let currentSiteIds: string[] = [];
let currentRequestId: string | null = null;
let currentAbortController: AbortController | null = null;
let activeFetchCount = 0;

export function makeDepartureStatusKey(siteId: string, line: string, direction_code: number): string {
  return `${siteId}|${line}|${direction_code}`;
}

type Subscriber = (data: Map<string, Departure[]>) => void;
let _dataSubscribers: Subscriber[] = [];
let _stopDeviationSubscribers: Array<(data: Map<string, any[]>) => void> = [];
let _loadingSubscribers: Array<(value: boolean) => void> = [];
let _updatingSubscribers: Array<(value: boolean) => void> = [];
let _statusSubscribers: Array<(value: Map<string, DepartureStatus>) => void> = [];

function notifyData() {
  for (const fn of _dataSubscribers) fn(_data);
}

function notifyMeta() {
  for (const fn of _stopDeviationSubscribers) fn(_stopDeviations);
  for (const fn of _loadingSubscribers) fn(_isLoading);
  for (const fn of _updatingSubscribers) fn(_isUpdating);
  for (const fn of _statusSubscribers) fn(_statuses);
}

function subscribe(fn: Subscriber): () => void {
  fn(_data);
  _dataSubscribers.push(fn);
  return () => {
    _dataSubscribers = _dataSubscribers.filter((s) => s !== fn);
  };
}

function makeSubscribable<T>(val: () => T) {
  return {
    subscribe: (fn: (v: T) => void): (() => void) => {
      fn(val());
      return () => {};
    },
  };
}

const STALE_AFTER_MS = 2 * 60 * 1000;
const RETRY_DELAY_MS = 500;

function waitForRetry(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Request aborted", "AbortError"));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, RETRY_DELAY_MS);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Request aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function getDeparturesWithRetry(
  segment: {
    siteId: string;
    stopName: string;
    line: string;
    direction_code: number;
  },
  signal?: AbortSignal,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await waitForRetry(signal);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error("offline");
      }
      return await transitService.getDepartures(
        toEntityId(segment.siteId),
        segment.stopName,
        segment.line,
        segment.direction_code,
        signal,
      );
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = error;
      if (attempt === 0 && typeof navigator !== "undefined" && !navigator.onLine) break;
    }
  }

  throw lastError ?? new Error("Failed to fetch departures");
}

const fetchAllHybrid = async (
  segmentData: Array<{
    siteId: string;
    stopName: string;
    line: string;
    direction_code: number;
    destId?: string;
  }>,
  clearFirst = false,
  requestId: string | null = null,
) => {
  const previousRequestId = currentRequestId;

  if (requestId && requestId !== currentRequestId) {
    currentAbortController?.abort();
    currentAbortController = new AbortController();
    currentRequestId = requestId;
    _stopDeviations = new Map();
    _statuses = new Map();
    notifyMeta();
    if (import.meta.env.DEV)
      console.log(`[departureStore] Request ID set to ${requestId}`);
  }

  if (activeFetchCount > 0) {
    const sameRequest = !requestId || requestId === previousRequestId;
    if (sameRequest) {
      if (import.meta.env.DEV)
        console.log("[departureStore] Fetch skipped - already fetching");
      return;
    }
  }
  activeFetchCount += 1;

  if (clearFirst) {
    _isLoading = true;
  } else {
    _isUpdating = true;
  }
  notifyMeta();

  const results = clearFirst
    ? new Map<string, Departure[]>()
    : new Map(_data);

  try {
    const siteIdsNeedingApi: typeof segmentData = [];
    const cachedUpdatedAt = new Map<string, number>();

    for (const seg of segmentData) {
      const cached = await getCachedScheduleSnapshot(
        seg.siteId,
        seg.line,
        seg.direction_code,
        24,
      );
      if (cached) {
        if (import.meta.env.DEV)
          console.log(
            `[departureStore] Cache hit: ${seg.siteId} (${seg.stopName}) - ${cached.departures.length} departures`,
          );
        const key = makeDepartureStatusKey(seg.siteId, seg.line, seg.direction_code);
        results.set(key, cached.departures);
        cachedUpdatedAt.set(key, cached.updatedAt);
      } else {
        if (import.meta.env.DEV)
          console.log(
            `[departureStore] Cache miss: ${seg.siteId} (${seg.stopName}), will fetch API`,
          );
      }

      // Cached schedules are an immediate snapshot, not a reason to skip the
      // live request. Revalidate every configured segment when possible.
      siteIdsNeedingApi.push(seg);
    }

    // Publish the cache snapshot before network requests finish. This keeps
    // the list populated during refresh and gives the API response a stable
    // snapshot to replace, instead of rendering an empty intermediate state.
    _data = results;
    if (cachedUpdatedAt.size > 0) {
      _isLoading = false;
      _isUpdating = true;
    }
    notifyData();
    notifyMeta();

    if (siteIdsNeedingApi.length > 0) {
      await Promise.all(
        siteIdsNeedingApi.map(async (seg) => {
          try {
            if (import.meta.env.DEV)
              console.log(
                `[departureStore] API fetch: ${seg.siteId} (${seg.stopName})`,
              );
            const { departures: transitDeps, stopDeviations } = await getDeparturesWithRetry(
              seg,
              currentAbortController?.signal,
            );
            const apiDepartures = transitDeps.map(toLegacyDeparture);

            if (requestId && requestId !== currentRequestId) {
              if (import.meta.env.DEV) {
                console.log(
                  `[departureStore] Ignoring stale response for ${seg.siteId} (requestId: ${requestId}, current: ${currentRequestId})`,
                );
              }
              return;
            }

            const key = makeDepartureStatusKey(seg.siteId, seg.line, seg.direction_code);
            results.set(key, apiDepartures);

            _stopDeviations.set(seg.siteId, stopDeviations ?? []);
            _statuses.set(key, {
              freshness: transitDeps.length > 0 && transitDeps.every((departure) => departure.dataSource === "static")
                ? "timetable"
                : "live",
              sourceUpdatedAt: Date.now(),
              canRetry: false,
            });
          } catch (e) {
            if (import.meta.env.DEV)
              console.error(
                `[departureStore] API error for ${seg.siteId}:`,
                e,
              );

            if (requestId && requestId !== currentRequestId) {
              if (import.meta.env.DEV) {
                console.log(
                  `[departureStore] Ignoring stale error for ${seg.siteId} (requestId: ${requestId}, current: ${currentRequestId})`,
                );
              }
              return;
            }

            const key = makeDepartureStatusKey(seg.siteId, seg.line, seg.direction_code);
            const fallbackUpdatedAt = cachedUpdatedAt.get(key) ?? _statuses.get(key)?.sourceUpdatedAt;
            if (!results.has(key)) {
              results.set(key, []);
            }
            _statuses.set(key, {
              freshness: results.get(key)?.length
                ? fallbackUpdatedAt && Date.now() - fallbackUpdatedAt <= STALE_AFTER_MS
                  ? "recent"
                  : "stale"
                : "unavailable",
              sourceUpdatedAt: fallbackUpdatedAt,
              canRetry: typeof navigator === "undefined" || navigator.onLine,
            });
          }
        }),
      );

      _data = new Map(results);
      notifyData();
      notifyMeta();
    }
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[departureStore] Overall fetch error:", error);
    notifyMeta();
  } finally {
    activeFetchCount = Math.max(0, activeFetchCount - 1);
    if (activeFetchCount === 0) {
      _isLoading = false;
      _isUpdating = false;
      notifyMeta();
    }
  }
};

const fetchAll = async (
  siteIds: string[],
  stopNames: Map<string, string>,
  segmentMetaBySiteId: Map<string, SegmentCacheMeta> = new Map(),
  clearFirst = false,
  requestId: string | null = null,
) => {
  const segmentData = siteIds.map((id) => ({
    siteId: id,
    stopName: stopNames.get(id) || "",
    line: segmentMetaBySiteId.get(id)?.line ?? "",
    direction_code: segmentMetaBySiteId.get(id)?.direction_code ?? 0,
    destId: segmentMetaBySiteId.get(id)?.destId,
  }));
  await fetchAllHybrid(segmentData, clearFirst, requestId);
};

function startAutoRefresh(
  siteIds: string[],
  stopNames: Map<string, string>,
  segmentMetaBySiteId: Map<string, SegmentCacheMeta> = new Map(),
  interval: number,
  clearFirst = false,
  requestId: string | null = null,
) {
  if (refreshTimer) clearInterval(refreshTimer);
  stopNamesMap = stopNames;
  currentSiteIds = siteIds;
  if (requestId) {
    currentRequestId = requestId;
  }
  fetchAll(siteIds, stopNames, segmentMetaBySiteId, clearFirst, requestId);
  refreshTimer = setInterval(
    () => fetchAll(siteIds, stopNames, segmentMetaBySiteId, false, requestId),
    interval,
  );
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function setConnectivity(isOnline: boolean) {
  let changed = false;
  const next = new Map(_statuses);
  for (const [key, status] of next) {
    const canRetry = isOnline && (status.freshness === "stale" || status.freshness === "unavailable");
    if (status.canRetry !== canRetry) {
      next.set(key, { ...status, canRetry });
      changed = true;
    }
  }
  if (changed) {
    _statuses = next;
    notifyMeta();
  }
}

function retrySegment(segment: {
  siteId: string;
  stopName: string;
  line: string;
  direction_code: number;
  destId?: string;
}) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  void fetchAllHybrid([segment], false, currentRequestId);
}

export const departureStore = {
  subscribe,
  stopDeviations: {
    subscribe: (fn: (data: Map<string, any[]>) => void): (() => void) => {
      fn(_stopDeviations);
      _stopDeviationSubscribers.push(fn);
      return () => { _stopDeviationSubscribers = _stopDeviationSubscribers.filter((subscriber) => subscriber !== fn); };
    },
  },
  isLoading: {
    subscribe: (fn: (val: boolean) => void): (() => void) => {
      fn(_isLoading);
      _loadingSubscribers.push(fn);
      return () => { _loadingSubscribers = _loadingSubscribers.filter((subscriber) => subscriber !== fn); };
    },
  },
  isUpdating: {
    subscribe: (fn: (val: boolean) => void): (() => void) => {
      fn(_isUpdating);
      _updatingSubscribers.push(fn);
      return () => { _updatingSubscribers = _updatingSubscribers.filter((subscriber) => subscriber !== fn); };
    },
  },
  status: {
    subscribe: (fn: (value: Map<string, DepartureStatus>) => void): (() => void) => {
      fn(_statuses);
      _statusSubscribers.push(fn);
      return () => {
        _statusSubscribers = _statusSubscribers.filter((subscriber) => subscriber !== fn);
      };
    },
  },
  getCurrentRequestId: () => currentRequestId,
  setRequestId: (id: string | null) => {
    currentRequestId = id;
  },
  setDataForRequest: (
    requestId: string | null,
    dataMap: Map<string, Departure[]>,
  ) => {
    if (requestId && requestId !== currentRequestId) {
      if (import.meta.env.DEV) {
        console.log(
          `[departureStore] Ignoring setDataForRequest for stale requestId ${requestId} (current: ${currentRequestId})`,
        );
      }
      return;
    }
    _data = dataMap;
    notifyData();
  },
  clear: () => {
    _data = new Map();
    _stopDeviations = new Map();
    _statuses = new Map();
    notifyData();
    notifyMeta();
  },
  startAutoRefresh,
  stopAutoRefresh,
  setConnectivity,
  retrySegment,
  refresh: fetchAll,
};
export type { Departure };
