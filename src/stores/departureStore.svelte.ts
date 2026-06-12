import { get } from "svelte/store";
import type { Departure } from "../types/departure";
import { getDepartures } from "../services/departureService";
import { getCachedSchedule } from "../services/scheduleCache";

interface DepartureWithSource extends Departure {
  source?: "cache" | "api" | "enriched";
  cachedAt?: number;
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
let _lastError = $state<string | null>(null);
let _lastSuccessfulFetch = $state(0);

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let stopNamesMap = new Map<string, string>();
let currentSiteIds: string[] = [];
let currentRequestId: string | null = null;
let currentAbortController: AbortController | null = null;
let activeFetchCount = 0;

type Subscriber = (data: Map<string, Departure[]>) => void;
let _dataSubscribers: Subscriber[] = [];

function notifyData() {
  for (const fn of _dataSubscribers) fn(_data);
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
  _lastError = null;

  const results = clearFirst
    ? new Map<string, Departure[]>()
    : new Map(_data);

  try {
    const cacheResults = new Map<string, Departure[] | null>();
    const siteIdsNeedingApi: typeof segmentData = [];

    for (const seg of segmentData) {
      const cached = await getCachedSchedule(
        seg.siteId,
        seg.line,
        seg.direction_code,
        24,
      );
      if (cached) {
        if (import.meta.env.DEV)
          console.log(
            `[departureStore] Cache hit: ${seg.siteId} (${seg.stopName}) - ${cached.length} departures`,
          );
        cacheResults.set(seg.siteId, cached);
        results.set(seg.siteId, cached);
      } else {
        if (import.meta.env.DEV)
          console.log(
            `[departureStore] Cache miss: ${seg.siteId} (${seg.stopName}), will fetch API`,
          );
        cacheResults.set(seg.siteId, null);
        siteIdsNeedingApi.push(seg);
      }
    }

    if (clearFirst) {
      _data = results;
      notifyData();
    }

    if (siteIdsNeedingApi.length > 0) {
      await Promise.all(
        siteIdsNeedingApi.map(async (seg) => {
          try {
            if (import.meta.env.DEV)
              console.log(
                `[departureStore] API fetch: ${seg.siteId} (${seg.stopName})`,
              );
            const apiDepartures = await getDepartures(
              seg.stopName,
              seg.siteId,
              seg.line,
              seg.direction_code,
              seg.destId,
              currentAbortController?.signal,
            );

            if (requestId && requestId !== currentRequestId) {
              if (import.meta.env.DEV) {
                console.log(
                  `[departureStore] Ignoring stale response for ${seg.siteId} (requestId: ${requestId}, current: ${currentRequestId})`,
                );
              }
              return;
            }

            results.set(seg.siteId, apiDepartures.departures);

            _data.set(seg.siteId, apiDepartures.departures);
            _stopDeviations.set(seg.siteId, apiDepartures.stopDeviations);

            if (apiDepartures.departures.length > 0) {
              _lastSuccessfulFetch = Date.now();
            }
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

            _lastError = "Failed to fetch departures";
            results.set(seg.siteId, []);
          }
        }),
      );
    }
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[departureStore] Overall fetch error:", error);
    _lastError = "Failed to fetch departures";
  } finally {
    activeFetchCount = Math.max(0, activeFetchCount - 1);
    if (activeFetchCount === 0) {
      _isLoading = false;
      _isUpdating = false;
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

export const departureStore = {
  subscribe,
  stopDeviations: {
    subscribe: (fn: (data: Map<string, any[]>) => void): (() => void) => {
      fn(_stopDeviations);
      return () => {};
    },
  },
  isLoading: {
    subscribe: (fn: (val: boolean) => void): (() => void) => {
      fn(_isLoading);
      return () => {};
    },
  },
  isUpdating: {
    subscribe: (fn: (val: boolean) => void): (() => void) => {
      fn(_isUpdating);
      return () => {};
    },
  },
  lastError: {
    subscribe: (fn: (val: string | null) => void): (() => void) => {
      fn(_lastError);
      return () => {};
    },
  },
  lastSuccessfulFetch: {
    subscribe: (fn: (val: number) => void): (() => void) => {
      fn(_lastSuccessfulFetch);
      return () => {};
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
    notifyData();
  },
  startAutoRefresh,
  stopAutoRefresh,
  refresh: fetchAll,
};
export type { Departure };
