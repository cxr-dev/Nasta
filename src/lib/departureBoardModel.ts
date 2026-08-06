import type { TransitService } from "../providers/types";
import type { Segment, SortMode, GroupingMode, TransportType } from "../types/page";
import type { Departure } from "../types/departure";
import type { SegmentHealth } from "../types/deviation";
import type { Locale } from "./i18n";
import type { SeverityThreshold } from "../stores/deviationStore.svelte";
import { toEntityId, toLegacyDeparture } from "./departureConverter";
import { mergeDeparturesWithPredictions } from "./departureDisplay";
import { deduplicateDeparturesByKey } from "./departureDeduplication";
import { getDisruptionDisplay } from "../components/segmentUtils";

export type DepartureLookup = Pick<
  TransitService,
  "getPredictedDepartures" | "getNextScheduledDeparture"
>;

export interface SleepingDeparture {
  isSleeping: boolean;
  nextTime: string | null;
}

export interface DepartureBoardSnapshot {
  departuresBySegment: Map<string, Departure[]>;
  sleepingBySegment: Map<string, SleepingDeparture>;
}

export interface DepartureBoardGroupItem {
  segment: Segment;
  originalIndex: number;
}

export interface DepartureBoardGroup {
  label: string | null;
  items: DepartureBoardGroupItem[];
}

export interface DepartureBoardGroupCollection {
  groups: DepartureBoardGroup[];
}

export interface DepartureBoardGroups {
  departures: DepartureBoardGroupCollection;
  journeys: DepartureBoardGroupCollection;
}

export interface ResolveDepartureBoardSnapshotInput {
  segments: Segment[];
  departureData: ReadonlyMap<string, Departure[]>;
  transit: DepartureLookup;
}

/** Resolve the complete departure/sleeping snapshot for the current segment set. */
export async function resolveDepartureBoardSnapshot({
  segments,
  departureData,
  transit,
}: ResolveDepartureBoardSnapshotInput): Promise<DepartureBoardSnapshot> {
  const results = await Promise.all(
    segments.map(async (segment) => {
      const stopId = toEntityId(segment.fromStop.siteId);
      let predicted: Departure[] = [];

      try {
        predicted = (await transit.getPredictedDepartures(
          stopId,
          segment.fromStop.name,
          segment.line,
          segment.direction?.code ?? 0,
          5,
        )).map(toLegacyDeparture);
      } catch {
        // Live departures remain the source of truth when prediction is unavailable.
      }

      const compositeKey = `${segment.fromStop.siteId}|${segment.line}|${segment.direction?.code ?? 0}`;
      const live = departureData.get(compositeKey) ?? [];
      const merged = live.length > 0
        ? deduplicateDeparturesByKey(
            segment.fromStop.siteId,
            mergeDeparturesWithPredictions(live, predicted, 5),
          )
        : deduplicateDeparturesByKey(segment.fromStop.siteId, predicted);

      if (merged.length > 0) {
        return {
          id: segment.id,
          departures: merged,
          sleeping: { isSleeping: false, nextTime: null },
        };
      }

      try {
        const nextTransit = await transit.getNextScheduledDeparture(
          stopId,
          segment.fromStop.name,
          segment.line,
          segment.direction?.code ?? 0,
        );
        return {
          id: segment.id,
          departures: [],
          sleeping: {
            isSleeping: Boolean(nextTransit),
            nextTime: nextTransit?.scheduledTime ?? null,
          },
        };
      } catch {
        return {
          id: segment.id,
          departures: [],
          sleeping: { isSleeping: false, nextTime: null },
        };
      }
    }),
  );

  const departuresBySegment = new Map<string, Departure[]>();
  const sleepingBySegment = new Map<string, SleepingDeparture>();
  for (const result of results) {
    departuresBySegment.set(result.id, result.departures);
    sleepingBySegment.set(result.id, result.sleeping);
  }

  return { departuresBySegment, sleepingBySegment };
}

export interface BuildDepartureBoardGroupsInput {
  segments: Segment[];
  departureData: ReadonlyMap<string, Departure[]>;
  sleepingBySegment: ReadonlyMap<string, SleepingDeparture>;
  sortMode: SortMode;
  groupingMode: GroupingMode;
  groupSleeping: boolean;
  userLocation: [number, number] | null;
  deviationHealthBySegment: ReadonlyMap<string, SegmentHealth>;
  stopDeviationsMap: ReadonlyMap<string, any[]>;
  disruptionSeverityThreshold: SeverityThreshold;
  locale: Locale;
  labels: {
    disrupted: string;
    sleeping: string;
    transport: Record<TransportType, string>;
  };
}

const TRANSPORT_ORDER: Record<TransportType, number> = {
  metro: 0,
  train: 1,
  bus: 2,
  tram: 3,
  boat: 4,
};

function haversineDistance(a: [number, number], b: [number, number]): number {
  const radius = 6371000;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180;
  const lat2 = b[0] * Math.PI / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function compareNextDeparture(
  a: Segment,
  b: Segment,
  departureData: ReadonlyMap<string, Departure[]>,
): number {
  const key = (segment: Segment) =>
    `${segment.fromStop.siteId}|${segment.line}|${segment.direction?.code ?? 0}`;
  const timeA = departureData.get(key(a))?.[0]?.expectedAt ?? Infinity;
  const timeB = departureData.get(key(b))?.[0]?.expectedAt ?? Infinity;
  return timeA - timeB;
}

function compareSegments(
  a: DepartureBoardGroupItem,
  b: DepartureBoardGroupItem,
  input: BuildDepartureBoardGroupsInput,
): number {
  const { departureData, sortMode, userLocation } = input;
  let result = 0;

  switch (sortMode) {
    case "time":
      result = compareNextDeparture(a.segment, b.segment, departureData);
      break;
    case "station":
      result = a.segment.fromStop.name.localeCompare(b.segment.fromStop.name, "sv");
      break;
    case "transport": {
      result = TRANSPORT_ORDER[a.segment.transportType] - TRANSPORT_ORDER[b.segment.transportType];
      if (result === 0) result = compareNextDeparture(a.segment, b.segment, departureData);
      break;
    }
    case "line": {
      const numA = parseInt(a.segment.line, 10);
      const numB = parseInt(b.segment.line, 10);
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) result = numA - numB;
      else if (!Number.isNaN(numA)) result = -1;
      else if (!Number.isNaN(numB)) result = 1;
      else result = a.segment.line.localeCompare(b.segment.line);
      break;
    }
    case "distance":
      if (userLocation) {
        const distanceA = a.segment.fromStop.coord
          ? haversineDistance(userLocation, a.segment.fromStop.coord)
          : Infinity;
        const distanceB = b.segment.fromStop.coord
          ? haversineDistance(userLocation, b.segment.fromStop.coord)
          : Infinity;
        result = distanceA - distanceB;
      }
      break;
  }

  return result || a.originalIndex - b.originalIndex;
}

function sortSegments(
  segments: Segment[],
  input: BuildDepartureBoardGroupsInput,
): DepartureBoardGroupItem[] {
  return segments
    .map((segment, originalIndex) => ({ segment, originalIndex }))
    .sort((a, b) => compareSegments(a, b, input));
}

function groupSegments(
  items: DepartureBoardGroupItem[],
  input: BuildDepartureBoardGroupsInput,
): DepartureBoardGroupCollection {
  const { groupingMode, labels } = input;

  if (groupingMode === "none") return { groups: [{ label: null, items }] };

  if (groupingMode === "disrupted") {
    const all: DepartureBoardGroupItem[] = [];
    const disrupted: DepartureBoardGroupItem[] = [];
    for (const item of items) {
      const segment = item.segment;
      const health = input.deviationHealthBySegment.get(segment.id);
      const siteDeviations = input.stopDeviationsMap.get(segment.fromStop.siteId) ?? [];
      const display = getDisruptionDisplay(
        siteDeviations,
        health,
        input.disruptionSeverityThreshold,
        input.locale,
        segment.line,
        undefined,
        segment.fromStop.siteId,
      );
      (display.messages.length > 0 ? disrupted : all).push(item);
    }
    const groups: DepartureBoardGroup[] = [];
    if (all.length > 0) groups.push({ label: null, items: all });
    if (disrupted.length > 0) groups.push({ label: labels.disrupted, items: disrupted });
    return { groups };
  }

  if (groupingMode === "station") {
    const grouped = new Map<string, DepartureBoardGroupItem[]>();
    for (const item of items) {
      const key = item.segment.fromStop.name;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    }
    return {
      groups: [...grouped.entries()]
        .sort(([a], [b]) => a.localeCompare(b, "sv"))
        .map(([label, groupedItems]) => ({ label, items: groupedItems })),
    };
  }

  const grouped = new Map<TransportType, DepartureBoardGroupItem[]>();
  for (const item of items) {
    const key = item.segment.transportType;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }
  return {
    groups: [...grouped.entries()]
      .sort(([a], [b]) => TRANSPORT_ORDER[a] - TRANSPORT_ORDER[b])
      .map(([transportType, groupedItems]) => ({
        label: labels.transport[transportType],
        items: groupedItems,
      })),
  };
}

function splitSleeping(
  collection: DepartureBoardGroupCollection,
  input: BuildDepartureBoardGroupsInput,
): DepartureBoardGroupCollection {
  if (!input.groupSleeping) return collection;

  const activeGroups: DepartureBoardGroup[] = [];
  const sleepingItems: DepartureBoardGroupItem[] = [];
  for (const group of collection.groups) {
    const activeItems = group.items.filter((item) => {
      if (input.sleepingBySegment.get(item.segment.id)?.isSleeping) {
        sleepingItems.push(item);
        return false;
      }
      return true;
    });
    if (activeItems.length > 0) activeGroups.push({ label: group.label, items: activeItems });
  }

  if (sleepingItems.length > 0) {
    activeGroups.push({ label: input.labels.sleeping, items: sleepingItems });
  }
  return { groups: activeGroups };
}

/** Build sorted, grouped departure and journey sections for rendering. */
export function buildDepartureBoardGroups(
  input: BuildDepartureBoardGroupsInput,
): DepartureBoardGroups {
  const sorted = sortSegments(input.segments, input);
  const departureItems = sorted.filter((item) => !item.segment.journeyMeta);
  const journeyItems = sorted.filter((item) => Boolean(item.segment.journeyMeta));

  return {
    departures: splitSleeping(groupSegments(departureItems, input), input),
    journeys: groupSegments(journeyItems, input),
  };
}
