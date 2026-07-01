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
const cache = new Map<string, CachedEntry>();

/** Clear weather cache (for testing). */
export function clearWeatherCache(): void {
  cache.clear();
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

async function fetchOpenMeteo(lat: number, lon: number): Promise<CachedEntry> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,temperature_2m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Europe/Stockholm&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo API error: ${res.status}`);
  const json: OpenMeteoResponse = await res.json();

  const currentSymbol = json.current ? classifyWmo(json.current.weather_code) : null;
  const temp = json.current?.temperature_2m ?? null;

  const dailyCode = json.daily?.weather_code?.[0];
  const dailySymbol = dailyCode != null ? classifyWmo(dailyCode) : null;
  const tempMin = json.daily?.temperature_2m_min?.[0] ?? null;
  const tempMax = json.daily?.temperature_2m_max?.[0] ?? null;

  return { currentSymbol, dailySymbol, temp, tempMin, tempMax, timestamp: Date.now() };
}

async function getCached(lat: number, lon: number): Promise<CachedEntry> {
  const k = cacheKey(lat, lon);
  const cached = cache.get(k);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached;
  }
  const entry = await fetchOpenMeteo(lat, lon);
  cache.set(k, entry);
  return entry;
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
