import type { TransitProvider, EntityId, ProviderCapabilities } from "./types.js";

/**
 * Registry of all transit providers.
 * Resolves providers by EntityId prefix — O(1) hash lookup.
 * TransitService delegates to the owning provider.
 */
export class ProviderRegistry {
  private byPrefix = new Map<string, TransitProvider>();

  /** Register a provider. Keyed by provider.capabilities.providerId. */
  register(provider: TransitProvider): void {
    this.byPrefix.set(provider.capabilities.providerId, provider);
  }

  /** Find provider owning a given stop.
   *  Parses prefix from EntityId (e.g. "sl:1234" → "sl")
   *  and does O(1) hash lookup.
   *  Returns null if no registered provider matches the prefix.
   */
  resolve(stopId: EntityId): TransitProvider | null {
    const { providerId } = parseEntityId(stopId);
    return this.byPrefix.get(providerId) ?? null;
  }

  /** All registered providers. */
  getAll(): TransitProvider[] {
    return Array.from(this.byPrefix.values());
  }

  /** All providers that support a given feature. */
  withFeature(feature: keyof ProviderCapabilities["features"]): TransitProvider[] {
    return this.getAll().filter((p) => Boolean(p.capabilities.features[feature]));
  }
}

function parseEntityId(id: EntityId): { providerId: string; localId: string } {
  const colon = id.indexOf(":");
  if (colon === -1) return { providerId: "", localId: id };
  return {
    providerId: id.slice(0, colon),
    localId: id.slice(colon + 1),
  };
}
