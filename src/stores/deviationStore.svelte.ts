import type { Segment, TransportType } from "../types/page";
import type { DeviationMessage, SegmentHealth } from "../types/deviation";
import {
  getDeviations,
  pickPreferredMessageText,
} from "../services/slDeviations";
import { isExternalTimetableSource } from "../lib/sourceClassification";
import { stopAreaStore } from "./stopAreaStore";

export type SeverityThreshold = "info" | "warning" | "critical";

interface DeviationStoreState {
  bySegmentId: Map<string, SegmentHealth>;
  lastUpdatedAt: number;
  isLoading: boolean;
  usedCache: boolean;
}

const MIN_REFRESH_MS = 60_000;
type RefreshOptions = { force?: boolean };

let _state = $state<DeviationStoreState>({
  bySegmentId: new Map(),
  lastUpdatedAt: 0,
  isLoading: false,
  usedCache: false,
});

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let lastRequestSignature = "";
let lastRequestStartedAt = 0;
let inFlightRequest:
  | {
      signature: string;
      promise: Promise<void>;
    }
  | null = null;

type Subscriber = (state: DeviationStoreState) => void;
let _subscribers: Subscriber[] = [];

function notify() {
  for (const fn of _subscribers) fn(_state);
}

export function subscribe(fn: Subscriber): () => void {
  fn(_state);
  _subscribers.push(fn);
  return () => {
    _subscribers = _subscribers.filter((s) => s !== fn);
  };
}

function transportModeForSegment(type: TransportType): string {
  switch (type) {
    case "metro":
      return "metro";
    case "train":
      return "train";
    case "tram":
      return "tram";
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

function wordMatch(name: string, target: string): boolean {
  const n = name.toLowerCase();
  const t = target.toLowerCase();
  return (
    n === t ||
    n.startsWith(t + ' ') ||
    n.endsWith(' ' + t) ||
    n.includes(' ' + t + ' ') ||
    n.includes(' ' + t + '-') ||
    n.includes('-' + t + ' ') ||
    n.includes('-' + t + '-')
  );
}

function matchesSegment(segment: Segment, message: DeviationMessage): boolean {
  const lineMatch = message.scope.lines.some(
    (line) =>
      line.designation === segment.line ||
      line.id === segment.line ||
      (line.name != null && wordMatch(line.name, segment.line)),
  );
  const mode = transportModeForSegment(segment.transportType);
  const modeMatch = message.scope.lines.some(
    (line) => !line.transportMode || line.transportMode === mode,
  );
  return lineMatch && modeMatch;
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

function buildRequestSignature(
  segments: Segment[],
  preferredLanguage: "sv" | "en",
  threshold: SeverityThreshold,
): string {
  const fingerprint = segments
    .map((segment) =>
      [
        segment.id,
        segment.line,
        segment.transportType,
        segment.fromStop.siteId,
        segment.toStop.siteId,
      ].join(":"),
    )
    .sort()
    .join("|");
  return `${preferredLanguage}|${threshold}|${fingerprint}`;
}

export async function refresh(
  segments: Segment[],
  preferredLanguage: "sv" | "en" = "sv",
  threshold: SeverityThreshold = "info",
  options: RefreshOptions = {},
) {
  if (!segments.length) {
    _state = {
      bySegmentId: new Map(),
      lastUpdatedAt: Date.now(),
      isLoading: false,
      usedCache: false,
    };
    notify();
    return;
  }
  const signature = buildRequestSignature(segments, preferredLanguage, threshold);
  const now = Date.now();

  if (!options.force) {
    if (inFlightRequest && inFlightRequest.signature === signature) {
      return inFlightRequest.promise;
    }
    if (
      lastRequestSignature === signature &&
      now - lastRequestStartedAt < MIN_REFRESH_MS
    ) {
      return;
    }
  }

  _state = { ..._state, isLoading: true };
  notify();

  const execute = async () => {
    const slSegments = segments.filter(
      (segment) =>
        !isExternalTimetableSource({
          siteId: segment.fromStop.siteId,
          stopName: segment.fromStop.name,
        }),
    );

    let messages: DeviationMessage[] = [];
    let fromCache = false;

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

    _state = {
      bySegmentId,
      lastUpdatedAt: Date.now(),
      isLoading: false,
      usedCache: fromCache,
    };
    notify();
  };

  const requestPromise = execute().finally(() => {
    if (inFlightRequest?.signature === signature) {
      inFlightRequest = null;
    }
  });

  inFlightRequest = {
    signature,
    promise: requestPromise,
  };
  lastRequestSignature = signature;
  lastRequestStartedAt = now;
  return requestPromise;
}

export function startAutoRefresh(
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

export function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

export const deviationStore = {
  subscribe,
  refresh,
  startAutoRefresh,
  stopAutoRefresh,
};
