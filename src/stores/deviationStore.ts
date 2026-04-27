import { writable } from "svelte/store";
import type { Segment, TransportType } from "../types/route";
import type { DeviationMessage, SegmentHealth } from "../types/deviation";
import {
  getDeviations,
  pickPreferredMessageText,
} from "../services/slDeviations";
import { isExternalTimetableSource } from "../lib/sourceClassification";

export type SeverityThreshold = "info" | "warning" | "critical";

interface DeviationStoreState {
  bySegmentId: Map<string, SegmentHealth>;
  lastUpdatedAt: number;
  isLoading: boolean;
  usedCache: boolean;
}

const MIN_REFRESH_MS = 60_000;

function transportModeForSegment(type: TransportType): string {
  switch (type) {
    case "metro":
      return "metro";
    case "train":
      return "train";
    case "boat":
      return "ferry";
    default:
      return "bus";
  }
}

function thresholdRank(threshold: SeverityThreshold): number {
  if (threshold === "critical") return 3;
  if (threshold === "warning") return 2;
  return 1;
}

function severityRank(severity: "info" | "warning" | "critical"): number {
  if (severity === "critical") return 3;
  if (severity === "warning") return 2;
  return 1;
}

function matchesSegment(segment: Segment, message: DeviationMessage): boolean {
  const stopAreaMatch = message.scope.stopAreas.some(
    (stop) =>
      stop.id === segment.fromStop.siteId || stop.id === segment.toStop.siteId,
  );
  const lineMatch = message.scope.lines.some(
    (line) =>
      line.designation === segment.line ||
      line.id === segment.line ||
      (line.name &&
        line.name.toLowerCase().includes(segment.line.toLowerCase())),
  );
  const mode = transportModeForSegment(segment.transportType);
  const modeMatch = message.scope.lines.some(
    (line) => !line.transportMode || line.transportMode === mode,
  );
  return (stopAreaMatch || lineMatch) && modeMatch;
}

function buildSegmentHealth(
  segment: Segment,
  messages: DeviationMessage[],
  preferredLanguage: "sv" | "en",
  threshold: SeverityThreshold,
): SegmentHealth {
  const relevant = messages
    .filter((msg) => matchesSegment(segment, msg))
    .filter((msg) => severityRank(msg.severity) >= thresholdRank(threshold))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  if (!relevant.length) {
    return {
      state: "ok",
      severity: null,
      reason: null,
      messages: [],
      updatedAt: Date.now(),
    };
  }

  const top = relevant[0];
  const topMessage = pickPreferredMessageText(top, preferredLanguage);
  return {
    state: top.severity === "critical" ? "critical" : "affected",
    severity: top.severity,
    reason: topMessage.header || topMessage.details || null,
    messages: relevant,
    updatedAt: Date.now(),
  };
}

function createDeviationStore() {
  const { subscribe, set, update } = writable<DeviationStoreState>({
    bySegmentId: new Map(),
    lastUpdatedAt: 0,
    isLoading: false,
    usedCache: false,
  });

  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  async function refresh(
    segments: Segment[],
    preferredLanguage: "sv" | "en" = "sv",
    threshold: SeverityThreshold = "info",
  ) {
    if (!segments.length) {
      set({
        bySegmentId: new Map(),
        lastUpdatedAt: Date.now(),
        isLoading: false,
        usedCache: false,
      });
      return;
    }
    update((state) => ({ ...state, isLoading: true }));

    // Filter out Sjostadstrafiken (external timetable) segments before fetching deviations
    // These don't have SL deviations and should always show as "ok"
    const slSegments = segments.filter(
      (segment) =>
        !isExternalTimetableSource({
          siteId: segment.fromStop.siteId,
          stopName: segment.fromStop.name,
        }),
    );

    let messages: DeviationMessage[] = [];
    let fromCache = false;

    // Only fetch deviations if there are SL segments
    if (slSegments.length > 0) {
      const siteIds = slSegments.flatMap((segment) => [
        segment.fromStop.siteId,
        segment.toStop.siteId,
      ]);
      const lines = slSegments.map((segment) => segment.line);
      const result = await getDeviations(siteIds, lines);
      messages = result.messages;
      fromCache = result.fromCache;
    }

    const bySegmentId = new Map<string, SegmentHealth>();
    segments.forEach((segment) => {
      // External timetable segments always show as "ok" with no deviations
      if (
        isExternalTimetableSource({
          siteId: segment.fromStop.siteId,
          stopName: segment.fromStop.name,
        })
      ) {
        bySegmentId.set(segment.id, {
          state: "ok",
          severity: null,
          reason: null,
          messages: [],
          updatedAt: Date.now(),
        });
      } else {
        bySegmentId.set(
          segment.id,
          buildSegmentHealth(segment, messages, preferredLanguage, threshold),
        );
      }
    });

    set({
      bySegmentId,
      lastUpdatedAt: Date.now(),
      isLoading: false,
      usedCache: fromCache,
    });
  }

  function startAutoRefresh(
    segments: Segment[],
    preferredLanguage: "sv" | "en" = "sv",
    threshold: SeverityThreshold = "info",
  ) {
    if (refreshTimer) clearInterval(refreshTimer);
    refresh(segments, preferredLanguage, threshold);
    refreshTimer = setInterval(
      () => refresh(segments, preferredLanguage, threshold),
      MIN_REFRESH_MS,
    );
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  return {
    subscribe,
    refresh,
    startAutoRefresh,
    stopAutoRefresh,
  };
}

export const deviationStore = createDeviationStore();
