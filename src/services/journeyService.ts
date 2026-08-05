import type {
  Journey,
  JourneyLeg,
  JourneyRouteType,
  JourneySearchRequest,
  PlatformPosition,
} from '../types/journey';
import type { TransportType } from '../types/page';
import { getPlatformPosition } from './platformPosition';
import { getWalkingTime } from './geo';

const JOURNEY_PLANNER_URL = 'https://journeyplanner.integration.sl.se/v2';
const STOP_FINDER_URL = `${JOURNEY_PLANNER_URL}/stop-finder`;
const TRIP_URL = `${JOURNEY_PLANNER_URL}/trips`;
export const DEFAULT_JOURNEY_ROUTE_TYPE: JourneyRouteType = 'leasttime';

const GEO_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

// --- Cache ---

const geoCache = new Map<string, { coord: [number, number]; ts: number }>();

async function geocode(query: string): Promise<[number, number] | null> {
  const key = query.toLowerCase().trim();
  const cached = geoCache.get(key);
  if (cached && Date.now() - cached.ts < GEO_CACHE_TTL) return cached.coord;

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ' Stockholm')}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Nasta-PWA/1.0' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
    }>;
    if (data.length === 0) return null;
    const coord: [number, number] = [
      parseFloat(data[0].lat),
      parseFloat(data[0].lon),
    ];
    geoCache.set(key, { coord, ts: Date.now() });
    return coord;
  } catch {
    return null;
  }
}

// --- Stop Finder ---

interface StopFinderLocation {
  id: string;
  name: string;
  disassembledName: string;
  type: string;
  /** Some responses include coordinates */
  lat?: number;
  lon?: number;
}

async function resolveLocation(
  query: string,
  signal?: AbortSignal,
): Promise<StopFinderLocation | null> {
  const results = await searchStopLocation(query, signal);
  if (results.length === 0) return null;
  // Prefer stop type, fallback to any
  const stop = results.find((l) => l.type === 'stop');
  return stop ?? results[0];
}

/** Raw stop-finder search returning all matches (for autocomplete). */
async function searchStopLocation(query: string, signal?: AbortSignal): Promise<StopFinderLocation[]> {
  const url = `${STOP_FINDER_URL}?name_sf=${encodeURIComponent(query)}&any_obj_filter_sf=2&type_sf=any`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      locations?: StopFinderLocation[];
    };
    return Array.isArray(data.locations) ? data.locations : [];
  } catch {
    return [];
  }
}

/** Suggestion type returned by autocomplete. */
export interface LocationSuggestion {
  id: string;
  name: string;
  detail: string;
  type: 'stop' | 'address';
  coord?: [number, number];
}

/** Search SL stops for autocomplete suggestions (up to 6). */
export async function searchStopSuggestions(
  query: string,
  signal?: AbortSignal,
): Promise<LocationSuggestion[]> {
  const locations = await searchStopLocation(query, signal);
  return locations.slice(0, 6).map((loc) => ({
    id: loc.id,
    name: loc.disassembledName || loc.name,
    detail: loc.type === 'stop' ? 'Stop' : loc.type,
    type: 'stop',
    coord: loc.lat != null && loc.lon != null ? [loc.lat, loc.lon] : undefined,
  }));
}

/** Search addresses via Nominatim for autocomplete suggestions (up to 5). */
export async function searchAddressSuggestions(query: string, signal?: AbortSignal): Promise<LocationSuggestion[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', Stockholms län')}&format=json&limit=5`;
    const res = await fetch(url, {
      signal,
      headers: { 'User-Agent': 'Nasta-PWA/1.0' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      place_id: number;
      display_name: string;
      lat: string;
      lon: string;
    }>;
    const suggestions: LocationSuggestion[] = data.map((item) => {
      const parts = item.display_name.split(',').map(p => p.trim());
      // Nominatim display_name format: "73, Östhammarsgatan, Ladugårdsgärdet, Norra ..., Stockholm, Stockholm Municipality, Stockholm County, ..."
      // Part 0 = house number if numeric, otherwise street
      // Part 1 = street if part 0 was numeric, otherwise locality
      const p0 = parts[0] || '';
      const p1 = parts[1] || '';
      const isNumericFirst = /^\d+/.test(p0);
      const shortName = isNumericFirst ? `${p1} ${p0}` : p0;
      // Detail: find the best city/locality match
      let detail = '';
      for (let i = 2; i < parts.length; i++) {
        const p = parts[i];
        // Match "Stockholm" alone (not "Stockholm County", "Stockholm Municipality", etc.)
        if (/^Stockholm$/i.test(p)) { detail = p; break; }
        // Match "Sundbybergs kommun" → "Sundbyberg", "Solna kommun" → "Solna"
        const m = p.match(/^([\wÅÄÖåäö]+)\s*(kommun|stad|municipality)/i);
        if (m) { detail = m[1].replace(/s$/i, ''); break; }
      }
      if (!detail) detail = parts[2] || '';
      return {
        id: `addr:${item.place_id}`,
        name: detail ? `${shortName}, ${detail}` : shortName,
        detail: detail || parts.slice(2, 4).join(', '),
        type: 'address',
        coord: [parseFloat(item.lat), parseFloat(item.lon)],
      };
    });
    const seen = new Set<string>();
    return suggestions.filter((suggestion) => {
      const key = `${suggestion.name.toLowerCase().replace(/\s+/g, ' ').trim()}|${suggestion.coord?.map((value) => value.toFixed(4)).join(',') ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

/** Combined search: SL stops first, then Nominatim addresses. */
export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<LocationSuggestion[]> {
  const [stops, addresses] = await Promise.all([
    searchStopSuggestions(query, signal),
    searchAddressSuggestions(query, signal),
  ]);
  // Deduplicate: address names that overlap with stop names get lower priority
  const stopNames = new Set(stops.map((s) => s.name.toLowerCase()));
  const filteredAddresses = addresses.filter(
    (a) => !stopNames.has(a.name.toLowerCase()),
  );
  const hasHouseNumber = /\b\d+[A-Za-z]?\b/.test(query);
  return [...(hasHouseNumber ? filteredAddresses : stops), ...(hasHouseNumber ? stops : filteredAddresses)].slice(0, 8);
}

// --- Trip API ---

interface TripLegStop {
  id: string;
  name: string;
  disassembledName: string;
  type: string;
  departureTimePlanned?: string;
  arrivalTimePlanned?: string;
}

/**
 * The trip planner exposes both a human-facing stop name and an internal
 * disassembled value. The latter can be a numeric platform/sequence value,
 * so it must never be used as the primary label in the UI.
 */
export function normalizeJourneyStopNames(
  stops: Array<Pick<TripLegStop, 'name' | 'disassembledName'>>,
): string[] {
  const names: string[] = [];

  for (const stop of stops) {
    const candidates = [stop.name, stop.disassembledName];
    const name = candidates
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .find((value) => value.length > 0 && !/^\d+(?:[.,-]\d+)?$/.test(value));

    if (!name || names.at(-1) === name) continue;
    names.push(name);
  }

  return names;
}

function stopDisplayName(stop: TripLegStop | undefined, fallback: string): string {
  if (!stop) return fallback;
  return normalizeJourneyStopNames([stop])[0] ?? fallback;
}

interface TripLeg {
  origin?: TripLegStop;
  destination?: TripLegStop;
  transportation?: {
    disassembledName?: string;
    name?: string;
    product?: { name?: string; disassembledName?: string; class?: number };
  };
  /** Stop sequence contains intermediate stops */
  stopSequence?: TripLegStop[];
  /** Duration in seconds */
  duration?: number;
  /** Direction code */
  direction?: number;
  /** Direction display name */
  directionName?: string;
  type?: string;
}

interface TripJourney {
  legs?: TripLeg[];
}

interface TripData {
  journeys?: TripJourney[];
}

// --- Parsing ---

const TRANSPORT_MAP: Record<string, TransportType> = {
  METRO: 'metro',
  TUNNELBANA: 'metro',
  BUS: 'bus',
  BUSS: 'bus',
  TRAIN: 'train',
  PENDELTÅG: 'train',
  TRAM: 'tram',
  SPÅRVAGN: 'tram',
  SHIP: 'boat',
  FERRY: 'boat',
};

function parseTransportType(raw: string | undefined): TransportType {
  if (!raw) return 'bus';
  const upper = raw.toUpperCase();
  for (const [key, type] of Object.entries(TRANSPORT_MAP)) {
    if (upper.includes(key)) return type;
  }
  return 'bus';
}

function parseDirectionCode(
  leg: TripLeg,
  directionName: string | undefined,
): number {
  if (leg.direction !== undefined && leg.direction !== null) return leg.direction;
  // Fallback: encode direction name to a pseudo-code
  if (directionName) {
    let hash = 0;
    for (let i = 0; i < directionName.length; i++) {
      hash = (hash * 31 + directionName.charCodeAt(i)) & 0xffff;
    }
    return (hash % 4) + 1; // 1-4
  }
  return 1;
}

// --- Main ---

/**
 * Search for journeys between an origin and destination.
 * Uses coordinate-based trip query when address coords available,
 * falls back to SL stop-finder for stop name queries.
 * Returns up to 3 journey options with legs, duration, and platform position.
 */
export async function searchJourneys(
  req: JourneySearchRequest,
): Promise<Journey[]> {
  const { origin, dest, originCoord, destCoord, signal } = req;

  // Geocode for coordinates (platform position)
  let oCoord = originCoord;
  let dCoord = destCoord;
  if (!oCoord || !dCoord) {
    const [geoC1, geoC2] = await Promise.all([
      oCoord ? Promise.resolve(oCoord) : geocode(origin),
      dCoord ? Promise.resolve(dCoord) : geocode(dest),
    ]);
    oCoord = geoC1 ?? undefined;
    dCoord = geoC2 ?? undefined;
  }

  // Build trip URL: coordinate-based or stop ID-based
  let tripUrl: string;
  const params = new URLSearchParams();
  if (oCoord && dCoord) {
    // Coordinate-based: no stop-finder needed
    params.set('type_origin', 'coord');
    params.set('type_destination', 'coord');
    params.set('name_origin', `${oCoord[1]}:${oCoord[0]}:WGS84[dd.ddddd]`);
    params.set('name_destination', `${dCoord[1]}:${dCoord[0]}:WGS84[dd.ddddd]`);
  } else {
    // Fall back to resolving via stop-finder for stop name queries
    const [originLoc, destLoc] = await Promise.all([
      resolveLocation(origin, signal),
      resolveLocation(dest, signal),
    ]);
    if (!originLoc || !destLoc) return [];
    params.set('type_origin', 'any');
    params.set('type_destination', 'any');
    params.set('name_origin', originLoc.id);
    params.set('name_destination', destLoc.id);
  }

  params.set('calc_number_of_trips', '3');
  appendJourneyOptions(params, req);
  tripUrl = `${TRIP_URL}?${params.toString()}`;

  // Fetch trip options
  let tripData: TripData;
  try {
    const res = await fetch(tripUrl, { signal });
    if (!res.ok) return [];
    tripData = (await res.json()) as TripData;
  } catch {
    return [];
  }

  const journeys = Array.isArray(tripData.journeys)
    ? tripData.journeys
    : [];
  if (journeys.length === 0) return [];

  // Parse into Journey objects
  const results: Journey[] = [];

  for (let ji = 0; ji < journeys.length; ji++) {
    const raw = journeys[ji];
    const rawLegs = Array.isArray(raw.legs) ? raw.legs : [];

    // Filter out walk/transfer legs (product class 99=facility transfer, 100=footpath)
    const transportLegs = rawLegs.filter(
      (l) => l.transportation && l.transportation.product?.class !== 99 && l.transportation.product?.class !== 100,
    );

    if (transportLegs.length === 0) continue;

    const legs: JourneyLeg[] = [];
    let totalDuration = 0;
    let firstDeparture = Infinity;
    let lastArrival = 0;

    for (const rawLeg of transportLegs) {
      const transport = rawLeg.transportation!;
      // Display name: use disassembledName for line number, fall back to full name
      const displayName =
        transport.disassembledName ||
        transport.name ||
        transport.product?.disassembledName ||
        '';
      // Type detection: use product name (canonical type) first, then full transport name
      const typeSource =
        transport.product?.name ||
        transport.name ||
        displayName;

      // Extract line number from name (e.g., "40" from "Buss 40" or "Pendeltåg 40")
      let line = displayName;
      const numMatch = displayName.match(/(\d+)/);
      if (numMatch) line = numMatch[1];

      const transportType = parseTransportType(typeSource);
      const directionName =
        rawLeg.directionName || rawLeg.destination?.name || '';
      const directionCode = parseDirectionCode(rawLeg, directionName);

      const originName = stopDisplayName(rawLeg.origin, origin);
      const destName = stopDisplayName(rawLeg.destination, dest);

      const rawDuration = rawLeg.duration ?? 0;
      const durationMin = Math.max(1, Math.round(rawDuration / 60));

      // Parse departure/arrival times (API uses departureTimePlanned/arrivalTimePlanned on origin/destination)
      const depTime = rawLeg.origin?.departureTimePlanned
        ? parseSlTime(rawLeg.origin.departureTimePlanned)
        : 0;
      const arrTime = rawLeg.destination?.arrivalTimePlanned
        ? parseSlTime(rawLeg.destination.arrivalTimePlanned)
        : depTime + durationMin * 60_000;
      const sequenceStops = Array.isArray(rawLeg.stopSequence)
        ? normalizeJourneyStopNames(rawLeg.stopSequence)
        : [];
      const stops = sequenceStops.filter(
        (stop, index) =>
          !(index === 0 && stop === originName) &&
          !(index === sequenceStops.length - 1 && stop === destName),
      );

      // Platform position — use origin/destination coordinates
      let platformPos: PlatformPosition = 'middle';
      if (oCoord && dCoord) {
        platformPos = getPlatformPosition(
          oCoord[0],
          oCoord[1],
          dCoord[0],
          dCoord[1],
          directionCode,
        );
      }

      legs.push({
        originName,
        destName,
        transportType,
        line,
        lineName: displayName,
        directionCode,
        directionName,
        departureTime: depTime,
        arrivalTime: arrTime,
        durationMin,
        stops,
        platformPosition: platformPos,
      });

      totalDuration += durationMin;
      if (depTime && depTime < firstDeparture) firstDeparture = depTime;
      if (arrTime && arrTime > lastArrival) lastArrival = arrTime;
    }

    const transfers = legs.length - 1;

    results.push({
      id: `journey-${crypto.randomUUID()}`,
      originLabel: origin,
      destLabel: dest,
      legs,
      totalDurationMin: totalDuration || getWalkingTime(1),
      departureTime:
        firstDeparture !== Infinity ? firstDeparture : Date.now(),
      arrivalTime: lastArrival || Date.now() + totalDuration * 60_000,
      transfers,
      query: {
        origin,
        destination: dest,
        originCoord: oCoord,
        destinationCoord: dCoord,
        timeMode: req.timeMode,
        date: req.date,
        time: req.time,
        transportModes: req.transportModes,
        maxChanges: req.maxChanges,
        routeType: req.routeType,
      },
    });
  }

  return prioritizeJourneys(results, req.routeType ?? DEFAULT_JOURNEY_ROUTE_TYPE);
}

function compareJourneyFallback(a: Journey, b: Journey): number {
  return (a.arrivalTime - b.arrivalTime)
    || (a.totalDurationMin - b.totalDurationMin)
    || (a.departureTime - b.departureTime)
    || a.id.localeCompare(b.id);
}

/**
 * Apply the same deterministic priority to search results and saved-journey
 * refreshes. The planner is still responsible for route-specific data such
 * as walking distance; the client only applies fields available in Journey.
 */
export function prioritizeJourneys(
  journeys: Journey[],
  routeType: JourneyRouteType = DEFAULT_JOURNEY_ROUTE_TYPE,
): Journey[] {
  return journeys
    .map((journey, index) => ({ journey, index }))
    .sort((a, b) => {
    if (routeType === 'leastwalking') {
      // The planner owns walking-distance data that is not represented on
      // Journey, so retain its response order for this preference.
      return a.index - b.index;
    }
    const first = a.journey;
    const second = b.journey;
    if (routeType === 'leastinterchange' && first.transfers !== second.transfers) {
      return first.transfers - second.transfers;
    }
    return compareJourneyFallback(first, second);
  })
    .map(({ journey }) => journey);
}

/** Select the highest-priority journey that has not departed yet. */
export function selectNextJourney(
  journeys: Journey[],
  now = Date.now(),
  routeType: JourneyRouteType = DEFAULT_JOURNEY_ROUTE_TYPE,
): Journey | undefined {
  const upcoming = journeys.filter((journey) => journey.departureTime > now);
  return prioritizeJourneys(upcoming, routeType)[0];
}

export function appendJourneyOptions(
  params: URLSearchParams,
  req: JourneySearchRequest,
): void {
  if (req.timeMode && req.timeMode !== 'now' && req.date && req.time) {
    params.set('itd_date', req.date.replaceAll('-', ''));
    params.set('itd_time', req.time.replace(':', ''));
    params.set('itd_trip_date_time_dep_arr', req.timeMode === 'arrival' ? 'arr' : 'dep');
    if (req.timeMode === 'departure') params.set('calc_one_direction', 'true');
  }

  if (req.maxChanges !== undefined) {
    params.set('max_changes', String(req.maxChanges));
  }
  params.set('route_type', req.routeType ?? DEFAULT_JOURNEY_ROUTE_TYPE);

  const modeParams: Record<string, string> = {
    train: 'incl_mot_0',
    metro: 'incl_mot_2',
    tram: 'incl_mot_4',
    bus: 'incl_mot_5',
    boat: 'incl_mot_9',
  };
  if (req.transportModes?.length) {
    for (const [mode, param] of Object.entries(modeParams)) {
      params.set(param, req.transportModes.includes(mode as TransportType) ? 'true' : 'false');
    }
  }
}

/**
 * Parse SL local timestamp (timezone-naive Stockholm time) to UTC ms.
 */
function parseSlTime(raw: string): number {
  if (/Z|[+-]\d{2}:\d{2}$/.test(raw)) {
    return new Date(raw).getTime();
  }
  return new Date(raw + 'Z').getTime();
}
