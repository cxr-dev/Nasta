/**
 * Open-Meteo weather forecast cache.
 * Free API, no key required. CORS-friendly. 15 min in-memory cache.
 * Returns weather symbol for current conditions + daily summary.
 * Coordinates rounded to 2dp (~1km) for cross-segment deduplication.
 */

type WeatherSymbol = 'rain' | 'snow' | 'thunder' | null;

interface CachedEntry {
  currentSymbol: WeatherSymbol;
  dailySymbol: WeatherSymbol;
  temp: number | null;
  tempMin: number | null;
  tempMax: number | null;
  timestamp: number;
}

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;
const cache = new Map<string, CachedEntry>();
const inFlight = new Map<string, Promise<CachedEntry>>();
let rateLimitedUntil = 0;

/** Clear weather cache (for testing). */
export function clearWeatherCache(): void {
  cache.clear();
  inFlight.clear();
  rateLimitedUntil = 0;
}

function cacheKey(lat: number, lon: number): string {
  // 2dp = ~1km precision — multiple stops share same cache entry
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/** Map WMO weather code to our precipitation symbol. Returns null for non-precipitation. */
function classifyWmo(code: number): WeatherSymbol {
  // Drizzle: 51, 53, 55. Rain: 61, 63, 65. Freezing rain: 66, 67. Rain showers: 80, 81, 82
  if ([51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  // Snow: 71, 73, 75. Snow grains: 77. Snow showers: 85, 86
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  // Thunder: 95. Thunder with hail: 96, 99
  if ([95, 96, 99].includes(code)) return 'thunder';
  return null;
}

interface OpenMeteoResponse {
  current?: {
    weather_code: number;
    temperature_2m: number;
  };
  daily?: {
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
}

class WeatherHttpError extends Error {
  constructor(public readonly status: number, public readonly retryAfterMs?: number) {
    super(`Open-Meteo API error: ${status}`);
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function toResponseList(json: OpenMeteoResponse | OpenMeteoResponse[]): OpenMeteoResponse[] {
  return Array.isArray(json) ? json : [json];
}

function toCachedEntry(json: OpenMeteoResponse): CachedEntry {
  const currentSymbol = json.current ? classifyWmo(json.current.weather_code) : null;
  const temp = json.current?.temperature_2m ?? null;

  const dailyCode = json.daily?.weather_code?.[0];
  const dailySymbol = dailyCode != null ? classifyWmo(dailyCode) : null;
  const tempMin = json.daily?.temperature_2m_min?.[0] ?? null;
  const tempMax = json.daily?.temperature_2m_max?.[0] ?? null;

  return { currentSymbol, dailySymbol, temp, tempMin, tempMax, timestamp: Date.now() };
}

async function fetchOpenMeteo(locations: Array<{ lat: number; lon: number }>): Promise<CachedEntry[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${locations.map(({ lat }) => lat).join(',')}&longitude=${locations.map(({ lon }) => lon).join(',')}&current=weather_code,temperature_2m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Europe/Stockholm&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) throw new WeatherHttpError(res.status, parseRetryAfter(res.headers?.get('Retry-After') ?? null));
  const json = await res.json() as OpenMeteoResponse | OpenMeteoResponse[];
  return toResponseList(json).map(toCachedEntry);
}

async function getCached(lat: number, lon: number): Promise<CachedEntry> {
  const k = cacheKey(lat, lon);
  const cached = cache.get(k);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached;
  }
  if (Date.now() < rateLimitedUntil) throw new WeatherHttpError(429);

  const pending = inFlight.get(k);
  if (pending) return pending;

  const request = fetchOpenMeteo([{ lat, lon }]).then(([entry]) => {
    cache.set(k, entry);
    return entry;
  }).catch((error: unknown) => {
    if (error instanceof WeatherHttpError && error.status === 429) {
      rateLimitedUntil = Date.now() + (error.retryAfterMs ?? RATE_LIMIT_BACKOFF_MS);
    }
    throw error;
  }).finally(() => {
    inFlight.delete(k);
  });
  inFlight.set(k, request);
  return request;
}

export interface WeatherLocation {
  id: string;
  lat: number;
  lon: number;
}

/** Fetch current symbols for visible stations in one request where possible. */
export async function getWeatherForStations(
  locations: readonly WeatherLocation[],
): Promise<Map<string, WeatherSymbol>> {
  const result = new Map<string, WeatherSymbol>();
  const missing = new Map<string, WeatherLocation>();
  const now = Date.now();

  for (const location of locations) {
    const key = cacheKey(location.lat, location.lon);
    const cached = cache.get(key);
    if (cached && now - cached.timestamp < CACHE_TTL) {
      result.set(location.id, cached.currentSymbol);
    } else if (!missing.has(key)) {
      missing.set(key, location);
    }
  }

  if (missing.size === 0 || Date.now() < rateLimitedUntil) {
    for (const location of locations) {
      if (!result.has(location.id)) result.set(location.id, null);
    }
    return result;
  }

  const requestKey = [...missing.keys()].sort().join('|');
  let request = inFlight.get(requestKey);
  if (!request) {
    request = fetchOpenMeteo([...missing.values()]).then((entries) => {
      [...missing.entries()].forEach(([key], index) => {
        const entry = entries[index];
        if (entry) cache.set(key, entry);
      });
      return entries[0] ?? toCachedEntry({});
    }).catch((error: unknown) => {
      if (error instanceof WeatherHttpError && error.status === 429) {
        rateLimitedUntil = Date.now() + (error.retryAfterMs ?? RATE_LIMIT_BACKOFF_MS);
      }
      throw error;
    }).finally(() => {
      inFlight.delete(requestKey);
    });
    inFlight.set(requestKey, request);
  }

  try {
    await request;
    for (const location of locations) {
      const entry = cache.get(cacheKey(location.lat, location.lon));
      result.set(location.id, entry?.currentSymbol ?? null);
    }
  } catch {
    for (const location of locations) result.set(location.id, null);
  }
  return result;
}

/**
 * Get current weather symbol for a station (precipitation only).
 * Returns null if no precipitation or no data.
 */
export async function getWeatherForStation(
  lat: number,
  lon: number,
): Promise<WeatherSymbol> {
  try {
    const entry = await getCached(lat, lon);
    // Per-station: return current precipitation only
    return entry.currentSymbol;
  } catch {
    return null;
  }
}

export interface DailySummary {
  symbol: WeatherSymbol;
  tempMin: number | null;
  tempMax: number | null;
}

/**
 * Get today's weather summary for header display.
 * Returns worst precipitation symbol + temperature range.
 */
export async function getDailySummary(
  lat: number,
  lon: number,
): Promise<DailySummary> {
  try {
    const entry = await getCached(lat, lon);
    return {
      symbol: entry.dailySymbol,
      tempMin: entry.tempMin,
      tempMax: entry.tempMax,
    };
  } catch {
    return { symbol: null, tempMin: null, tempMax: null };
  }
}
