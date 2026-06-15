import type { Segment, TransportType } from "../types/page";
import type { DeviationMessage, SegmentHealth, StationAlert } from "../types/deviation";
import {
  getDeviations,
  pickPreferredMessageText,
} from "../services/slDeviations";
import { isExternalTimetableSource } from "../lib/sourceClassification";
import { stopAreaStore } from "./stopAreaStore";

export type SeverityThreshold = "info" | "warning" | "critical";

interface DeviationStoreState {
  bySegmentId: Map<string, SegmentHealth>;
  stationAlerts: StationAlert[];
  lastUpdatedAt: number;
  isLoading: boolean;
  usedCache: boolean;
}

const MIN_REFRESH_MS = 60_000;
type RefreshOptions = { force?: boolean };

let _state = $state<DeviationStoreState>({
  bySegmentId: new Map(),
  stationAlerts: [],
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

function isStationFacilityAlert(message: DeviationMessage): boolean {
  const texts = message.messageVariants
    .map(v => `${v.header} ${v.details || ''}`)
    .join(' ')
    .toLowerCase();
  return /(rulltrapp|hiss|entré|perrong|biljet|spärr|framkomlighet|tillgänglig|utbyte|ombyggnation|renovering)/i.test(texts);
}

function isPassThroughStop(segment: Segment, message: DeviationMessage): boolean {
  if (!message.scope.stopAreas.length) return false;
  const segStopIds = [
    stopAreaStore.getStopAreaId(segment.fromStop.siteId),
    stopAreaStore.getStopAreaId(segment.toStop.siteId),
  ].filter(Boolean);
  if (!segStopIds.length) return false;
  return !message.scope.stopAreas.some(area => segStopIds.includes(area.id));
}

function buildSegmentHealth(
  segment: Segment,
  messages: DeviationMessage[],
  preferredLanguage: "sv" | "en",
  threshold: SeverityThreshold,
): { health: SegmentHealth; stationAlerts: DeviationMessage[] } {
  const allMatched = messages
    .filter((msg) => matchesSegment(segment, msg))
    .filter((msg) => severityRank(msg.severity) >= thresholdRank(threshold))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  const stationAlerts: DeviationMessage[] = [];
  const direct = allMatched.filter((msg) => {
    if (isStationFacilityAlert(msg) && isPassThroughStop(segment, msg)) {
      stationAlerts.push(msg);
      return false;
    }
    return true;
  });

  if (!direct.length) {
    return {
      health: {
        state: "ok",
        severity: null,
        reason: null,
        messages: [],
        updatedAt: Date.now(),
      },
      stationAlerts,
    };
  }

  const top = direct[0];
  const topMessage = pickPreferredMessageText(top, preferredLanguage);
  return {
    health: {
      state: top.severity === "critical" ? "critical" : "affected",
      severity: top.severity,
      reason: topMessage.header || topMessage.details || null,
      messages: direct,
      updatedAt: Date.now(),
    },
    stationAlerts,
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
      stationAlerts: [],
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
    const allStationAlerts = new Map<string, StationAlert>();
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
        const { health, stationAlerts: segAlerts } = buildSegmentHealth(segment, messages, preferredLanguage, threshold);
        bySegmentId.set(segment.id, health);
        for (const msg of segAlerts) {
          if (!allStationAlerts.has(msg.id)) {
            const text = pickPreferredMessageText(msg, preferredLanguage);
            allStationAlerts.set(msg.id, {
              id: msg.id,
              stations: msg.scope.stopAreas.map(a => a.name).filter((n): n is string => n != null),
              message: text.header || text.details || '',
              severity: msg.severity,
              segmentIds: [],
            });
          }
          allStationAlerts.get(msg.id)!.segmentIds.push(segment.id);
        }
      }
    });

    _state = {
      bySegmentId,
      stationAlerts: [...allStationAlerts.values()],
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
