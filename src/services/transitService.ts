import { ProviderRegistry } from "../providers/registry.js";
import type { TransitService, EntityId, TransitProvider } from "../providers/types.js";
import type {
  TransitDeparture,
  TransitDisruption,
  TransitStopSearchResult,
  TransitStopSequence,
  TransitRealtimeUpdate,
  TransitVehiclePosition,
  TransitShape,
  TransitTrip,
  TransitScheduledTime,
  TransportMode,
  ProviderCapabilities,
} from "../providers/types.js";

/**
 * TransitService — orchestrates calls across all registered providers.
 * Delegates each operation to the owning provider or iterates
 * over feature-filtered providers for search/aggregation.
 */
export class TransitServiceImpl implements TransitService {
  constructor(private registry: ProviderRegistry) {}

  // ─── Search ──────────────────────────────────────────────────

  async searchStops(query: string, signal?: AbortSignal): Promise<TransitStopSearchResult[]> {
    const providers = this.registry.withFeature("search");
    const batches = await Promise.allSettled(
      providers.map((p) => p.searchStops!(query, signal)),
    );
    const results: TransitStopSearchResult[] = [];
    for (const batch of batches) {
      if (batch.status === "fulfilled") results.push(...batch.value);
    }
    return results;
  }

  // ─── Departures — resolve provider from stopId ───────────────

  private resolveOrThrow(stopId: EntityId, stopName: string): TransitProvider {
    const provider = this.registry.resolve(stopId);
    if (!provider) {
      throw new Error(
        `[TransitService] No provider found for stop ${stopId} (${stopName})`,
      );
    }
    return provider;
  }

  getDepartures(
    stopId: EntityId,
    _stopName: string,
    line?: string,
    directionCode?: number,
    signal?: AbortSignal,
  ): Promise<{ departures: TransitDeparture[]; stopDeviations: any[] }> {
    return this.resolveOrThrow(stopId, _stopName).getDepartures(
      stopId, line, directionCode, signal,
    );
  }

  getPredictedDepartures(
    stopId: EntityId,
    _stopName: string,
    line: string,
    directionCode: number,
    maxResults: number,
  ): Promise<TransitDeparture[]> {
    const provider = this.registry.resolve(stopId);
    if (!provider?.getPredictedDepartures) return Promise.resolve([]);
    return provider.getPredictedDepartures(stopId, line, directionCode, maxResults);
  }

  getNextScheduledDeparture(
    stopId: EntityId,
    _stopName: string,
    line: string,
    directionCode: number,
    signal?: AbortSignal,
  ): Promise<TransitDeparture | null> {
    const provider = this.registry.resolve(stopId);
    if (!provider?.getNextScheduledDeparture) return Promise.resolve(null);
    return provider.getNextScheduledDeparture(stopId, line, directionCode, signal);
  }

  getKnownRoutes(
    stopId: EntityId,
    _stopName: string,
  ): Promise<Array<{
    line: string;
    lineName: string;
    destination: string;
    directionCode: number;
    transportMode: TransportMode;
  }>> {
    const provider = this.registry.resolve(stopId);
    if (!provider?.getKnownRoutes) return Promise.resolve([]);
    return provider.getKnownRoutes(stopId);
  }

  // ─── Disruptions — group segments by provider ────────────────

  async getDisruptions(
    segments: Array<{ stopId: EntityId; stopName: string; line: string }>,
  ): Promise<Map<EntityId, TransitDisruption[]>> {
    // Group segments by their owning provider
    const byProvider = new Map<
      TransitProvider,
      { stopIds: EntityId[]; lineNames: string[] }
    >();

    for (const seg of segments) {
      const provider = this.registry.resolve(seg.stopId);
      if (!provider?.getDisruptions) continue;
      let group = byProvider.get(provider);
      if (!group) {
        group = { stopIds: [], lineNames: [] };
        byProvider.set(provider, group);
      }
      group.stopIds.push(seg.stopId);
      if (seg.line) group.lineNames.push(seg.line);
    }

    const result = new Map<EntityId, TransitDisruption[]>();

    const settled = await Promise.allSettled(
      Array.from(byProvider.entries()).map(async ([provider, { stopIds, lineNames }]) => {
        const disruptions = await provider.getDisruptions!(stopIds, lineNames);
        return { disruptions, stopIds };
      }),
    );

    for (const entry of settled) {
      if (entry.status !== "fulfilled") continue;
      const { disruptions, stopIds } = entry.value;
      for (const d of disruptions) {
        for (const s of d.affectedStops) {
          // Only attach disruption to stops in our requested set
          if (stopIds.includes(s)) {
            const list = result.get(s) ?? [];
            list.push(d);
            result.set(s, list);
          }
        }
      }
    }

    return result;
  }

  // ─── Stop Resolution — try search providers in order ─────────

  async resolveStopId(stopName: string, signal?: AbortSignal): Promise<EntityId | null> {
    const providers = this.registry.withFeature("search");
    for (const p of providers) {
      if (!p.resolveStopId) continue;
      const id = await p.resolveStopId(stopName, signal);
      if (id) return id;
    }
    return null;
  }

  // ─── Stop Sequences — first provider with feature wins ───────

  async getStopSequence(
    originStopId: EntityId,
    destinationName: string,
    line: string,
    directionCode: number,
    signal?: AbortSignal,
  ): Promise<TransitStopSequence | null> {
    const providers = this.registry.withFeature("stopSequences");
    for (const p of providers) {
      if (!p.getStopSequence) continue;
      const seq = await p.getStopSequence(
        originStopId, destinationName, line, directionCode, signal,
      );
      if (seq) return seq;
    }
    return null;
  }

  // ─── Future / Not Yet Implemented ────────────────────────────

  getVehiclePositions(
    _tripIds: EntityId[],
    _routeId?: EntityId,
    _signal?: AbortSignal,
  ): Promise<TransitVehiclePosition[]> {
    return Promise.reject(new Error(
      "[TransitService] getVehiclePositions not implemented (Future). " +
      "Requires GTFS-RT VehiclePosition provider — no timeline assigned.",
    ));
  }

  getRouteShape(
    _shapeId: EntityId,
    _signal?: AbortSignal,
  ): Promise<TransitShape | null> {
    return Promise.reject(new Error(
      "[TransitService] getRouteShape not implemented (Future). " +
      "Requires GTFS shapes provider — no timeline assigned.",
    ));
  }

  getTripDetails(
    _tripId: EntityId,
    _signal?: AbortSignal,
  ): Promise<{
    trip: TransitTrip;
    stopTimes: TransitScheduledTime[];
  } | null> {
    return Promise.reject(new Error(
      "[TransitService] getTripDetails not implemented (Future). " +
      "Requires GTFS stop_times — no timeline assigned.",
    ));
  }

  getRealtimeUpdates(
    _tripId: EntityId,
    _signal?: AbortSignal,
  ): Promise<TransitRealtimeUpdate[]> {
    return Promise.reject(new Error(
      "[TransitService] getRealtimeUpdates not implemented (Future). " +
      "Requires GTFS-RT TripUpdate — no timeline assigned.",
    ));
  }

  getProviders(): ProviderCapabilities[] {
    return this.registry.getAll().map((p) => p.capabilities);
  }
}

/**
 * Create TransitService instance backed by the given provider registry.
 * Phase 7 will swap stub for real delegating implementation.
 */
export function createTransitService(registry: ProviderRegistry): TransitService {
  return new TransitServiceImpl(registry);
}
